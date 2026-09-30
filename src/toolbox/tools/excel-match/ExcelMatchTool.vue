<script setup lang="ts">
/**
 * Excel 数据匹配（VLOOKUP 式，纯前端实现）
 * 左表按关键字段匹配右表，选择要带出的列，实时预览并导出 xlsx。
 */
import { computed, ref } from 'vue'
import { csvToJson } from '../../core/csv'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, readFileAsText } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

const leftText = ref('id,name\n1,张三\n2,李四\n3,王五\n')
const rightText = ref('id,score,level\n1,95,A\n2,88,B\n4,77,C\n')
const leftKey = ref('id')
const rightKey = ref('id')
const bring = ref<string[]>([])
const errorMsg = ref('')

useDirtyFlag(() => !!leftText.value.trim() || !!rightText.value.trim())
const { copy, save } = useToolActions()

function parseTable(text: string): { ok: boolean; rows: Record<string, string>[]; error?: string } {
  try {
    const s = (text || '').trim()
    if (!s) return { ok: false, rows: [], error: '内容为空' }
    if (s.startsWith('[') || s.startsWith('{')) {
      const v = JSON.parse(s)
      return { ok: true, rows: (Array.isArray(v) ? v : [v]).map(r => flatten(r)) }
    }
    return { ok: true, rows: csvToJson(s, ',') }
  } catch (e) {
    return { ok: false, rows: [], error: (e as Error).message }
  }
}

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  Object.entries(obj || {}).forEach(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v as Record<string, unknown>, key))
    else out[key] = v === null || v === undefined ? '' : String(v)
  })
  return out
}

const leftRows = computed(() => parseTable(leftText.value))
const rightRows = computed(() => parseTable(rightText.value))

const leftCols = computed(() => (leftRows.value.rows.length ? Object.keys(leftRows.value.rows[0]) : []))
const rightCols = computed(() => (rightRows.value.rows.length ? Object.keys(rightRows.value.rows[0]) : []))

/** 右表可选「带出列」= 右表列 - （与左表同名且作为主键的列） */
const bringOptions = computed(() => rightCols.value.filter(c => c !== rightKey.value))

const merged = computed<Record<string, string>[]>(() => {
  if (!leftRows.value.ok || !rightRows.value.ok) return []
  const map = new Map<string, Record<string, string>>()
  rightRows.value.rows.forEach(r => {
    const k = String(r[rightKey.value] ?? '').trim()
    if (k && !map.has(k)) map.set(k, r)
  })
  return leftRows.value.rows.map(row => {
    const k = String(row[leftKey.value] ?? '').trim()
    const hit = map.get(k)
    const out: Record<string, string> = { ...row }
    bring.value.forEach(c => {
      out[c] = hit ? String(hit[c] ?? '') : ''
    })
    out['__matched'] = hit ? '是' : '否'
    return out
  })
})

const mergedCols = computed(() => {
  if (!merged.value.length) return []
  return Array.from(new Set([...Object.keys(merged.value[0])]))
})

const stats = computed(() => {
  const total = merged.value.length
  const hit = merged.value.filter(r => r.__matched === '是').length
  return { total, hit, miss: total - hit }
})

const previewText = computed(() => {
  if (!merged.value.length) return ''
  return [mergedCols.value.join('\t'), ...merged.value.map(r => mergedCols.value.map(c => r[c] ?? '').join('\t'))].join('\n')
})

function toggleBring(col: string) {
  const i = bring.value.indexOf(col)
  if (i >= 0) bring.value.splice(i, 1)
  else bring.value.push(col)
}

async function importLeft(files: File[]) {
  leftText.value = await readFileAsText(files[0])
}

async function importRight(files: File[]) {
  rightText.value = await readFileAsText(files[0])
}

async function exportXlsx() {
  errorMsg.value = ''
  if (!merged.value.length) {
    errorMsg.value = '暂无匹配结果可导出'
    return
  }
  try {
    const XLSX = await import('xlsx')
    const aoa = [mergedCols.value, ...merged.value.map(r => mergedCols.value.map(c => r[c] ?? ''))]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'matched')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const { downloadBlob } = await import('../../core/download')
    downloadBlob('matched.xlsx', new Blob([out], { type: 'application/octet-stream' }))
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}
</script>

<template>
  <div class="tu-t6">
    <div class="tu-t2">
      <TuField label="左表（主表，CSV 或 JSON）">
        <textarea v-model="leftText" class="tu-textarea" rows="8" spellcheck="false" placeholder="id,name&#10;1,张三" />
        <TuDrop accept=".csv,.json,text/csv,application/json" hint="导入左表文件" @files="importLeft" />
        <p class="tu-hint">共 {{ leftRows.rows.length }} 行<template v-if="!leftRows.ok">（解析失败：{{ leftRows.error }}）</template></p>
      </TuField>

      <TuField label="右表（查找表，CSV 或 JSON）">
        <textarea v-model="rightText" class="tu-textarea" rows="8" spellcheck="false" placeholder="id,score&#10;1,95" />
        <TuDrop accept=".csv,.json,text/csv,application/json" hint="导入右表文件" @files="importRight" />
        <p class="tu-hint">共 {{ rightRows.rows.length }} 行<template v-if="!rightRows.ok">（解析失败：{{ rightRows.error }}）</template></p>
      </TuField>
    </div>

    <div class="tu-row">
      <span class="tu-label">左表关键字段</span>
      <select v-model="leftKey" class="tu-select tu-inline" style="max-width: 160px">
        <option v-for="c in leftCols" :key="c" :value="c">{{ c }}</option>
      </select>
      <span class="tu-label">右表关键字段</span>
      <select v-model="rightKey" class="tu-select tu-inline" style="max-width: 160px">
        <option v-for="c in rightCols" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>

    <TuField label="从右表带出的列">
      <div class="tu-toolbar">
        <button
          v-for="c in bringOptions"
          :key="c"
          type="button"
          class="tu-check"
          :class="{ 'is-on': bring.includes(c) }"
          @click="toggleBring(c)"
        >{{ c }}</button>
        <span v-if="!bringOptions.length" class="tu-hint">右表暂无可选列</span>
      </div>
    </TuField>

    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>

    <TuOutput
      title="匹配结果预览"
      :text="previewText"
      filename="matched.tsv"
      mime="text/tab-separated-values"
      empty="选择带出列后显示匹配结果"
    >
      <template #actions>
        <button type="button" class="tu-btn" :disabled="!merged.length" @click="exportXlsx">导出 xlsx</button>
        <button type="button" class="tu-btn ghost" :disabled="!previewText" @click="copy(previewText)">复制结果</button>
        <button
          type="button"
          class="tu-btn ghost"
          :disabled="!previewText"
          @click="save('matched.csv', mergedCols.join(',') + '\n' + merged.map(r => mergedCols.map(c => r[c] ?? '').join(',')).join('\n'), 'text/csv;charset=utf-8')"
        >下载 CSV</button>
      </template>
      <div class="tu-stat">
        <span>主表 {{ stats.total }} 行</span>
        <span>命中 {{ stats.hit }} 行</span>
        <span>未命中 {{ stats.miss }} 行</span>
      </div>
      <div v-if="merged.length" class="tu-table-wrap">
        <table class="tu-table">
          <thead>
            <tr>
              <th v-for="c in mergedCols" :key="c">{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in merged" :key="i" :class="{ 'is-miss': r.__matched === '否' }">
              <td v-for="c in mergedCols" :key="c">{{ r[c] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="tu-out-empty">请先在上方勾选要从右表带出的列</p>
    </TuOutput>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>左右两表均可粘贴 CSV 或 JSON，也支持导入文件。</li>
          <li>分别选择关键字段（类似 VLOOKUP 的查找列），再勾选需要从右表带出的列。</li>
          <li>未命中行会标记「否」并高亮，便于核对；结果可导出 xlsx 或 CSV。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-table tr.is-miss td { background: var(--color-warning-soft, rgba(245, 158, 11, 0.12)); }
</style>
