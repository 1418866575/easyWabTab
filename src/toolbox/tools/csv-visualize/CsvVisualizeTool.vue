<script setup lang="ts">
import { ref, computed } from 'vue'
import { copyText } from '../../core/download'

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQ = false
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQ = false; i++; continue
      }
      field += c; i++; continue
    }
    if (c === '"') { inQ = true; i++; continue }
    if (c === ',') { row.push(field); field = ''; i++; continue }
    if (c === '\r') { i++; continue }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += c; i++
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''))
}

const input = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const errorMsg = ref('')

const headers = computed<string[]>(() => {
  const rows = parseCSV(input.value)
  if (!rows.length) return []
  return rows[0]
})
const dataRows = computed<string[][]>(() => {
  const rows = parseCSV(input.value)
  return rows.slice(1)
})

const numericCols = computed<number[]>(() =>
  headers.value.map((_, ci) => ci).filter((ci) => {
    const vals = dataRows.value.map((r) => (r[ci] ?? '').trim()).filter(Boolean)
    if (!vals.length) return false
    return vals.every((x) => Number.isFinite(Number(x)))
  })
)
const colIdx = ref(-1)
function syncCol() { if (!numericCols.value.includes(colIdx.value)) colIdx.value = numericCols.value[0] ?? -1 }

const stats = computed(() =>
  headers.value.map((h, ci) => {
    const isNum = numericCols.value.includes(ci)
    const vals = dataRows.value.map((r) => (r[ci] ?? '').trim())
    if (isNum) {
      const nums = vals.filter((x) => x !== '' && Number.isFinite(Number(x))).map(Number)
      const sum = nums.reduce((a, b) => a + b, 0)
      return { h, isNum, count: nums.length, sum, avg: nums.length ? sum / nums.length : 0, min: nums.length ? Math.min(...nums) : 0, max: nums.length ? Math.max(...nums) : 0, distinct: new Set(vals).size }
    }
    return { h, isNum, count: vals.filter(Boolean).length, distinct: new Set(vals).size }
  })
)

const chartData = computed(() => {
  if (colIdx.value < 0) return { max: 1, rows: [] }
  const vals = dataRows.value
    .map((r, i) => ({ i, label: (r[0] ?? '') || '#' + (i + 1), v: Number(r[colIdx.value]) }))
    .filter((x) => Number.isFinite(x.v))
    .slice(0, 30)
  const max = Math.max(1, ...vals.map((x) => Math.abs(x.v)))
  return { max, rows: vals }
})

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  errorMsg.value = ''
  if (!f) return
  if (!f.name.toLowerCase().endsWith('.csv') && f.type !== 'text/csv') { errorMsg.value = '请选择 CSV 文件'; return }
  const reader = new FileReader()
  reader.onload = () => { input.value = String(reader.result || ''); syncCol() }
  reader.readAsText(f)
  ;(e.target as HTMLInputElement).value = ''
}
function pasteSample() {
  input.value = '城市,销量,退货\n北京,120,5\n上海,98,3\n广州,75,2\n深圳,60,1\n杭州,45,0'
  syncCol()
}
function copyTable() {
  const t = [headers.value.join('\t'), ...dataRows.value.map((r) => r.join('\t'))].join('\n')
  copyText(t)
}
</script>

<template>
  <div class="tu-t3">
    <div>
      <div class="tu-field">
        <label class="tu-label">粘贴 CSV 文本，或上传 .csv 文件</label>
        <textarea v-model="input" class="tu-textarea" rows="6" placeholder="第一行为表头，逗号分隔；支持双引号包裹含逗号/换行的字段" @input="syncCol" />
      </div>
      <div class="tu-row">
        <input ref="fileInput" type="file" accept=".csv,text/csv" hidden @change="onFile" />
        <button class="tu-btn" @click="fileInput?.click()">上传 CSV</button>
        <button class="tu-btn ghost" @click="pasteSample">填入示例</button>
        <button class="tu-btn ghost" :disabled="!dataRows.length" @click="copyTable">复制表格(TSV)</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p v-else class="tu-hint">全部在本地解析，不上传任何内容。数值列可一键生成柱状图。</p>
    </div>

    <div v-if="headers.length">
      <div class="tu-row" style="margin-top:4px">
        <span class="tu-tree-type">共 {{ dataRows.length }} 行 · {{ headers.length }} 列</span>
        <span v-if="numericCols.length" class="tu-tree-type">数值列 {{ numericCols.length }} 个</span>
      </div>

      <div class="tu-grid" style="margin:10px 0">
        <div v-for="(s, ci) in stats" :key="ci" class="tu-card">
          <div class="tu-card-title">{{ s.h || '(空表头)' }}</div>
          <div v-if="s.isNum" class="tu-card-value" style="font-size:13px">
            合计 {{ s.sum }} · 均值 {{ Number(s.avg.toFixed(2)) }}<br />
            最大 {{ s.max }} · 最小 {{ s.min }}
          </div>
          <div v-else class="tu-card-value" style="font-size:13px">不重复 {{ s.distinct }} · 非空 {{ s.count }}</div>
        </div>
      </div>

      <div v-if="numericCols.length" class="tu-field">
        <label class="tu-label">柱状图（取前 30 行）</label>
        <div class="tu-row">
          <span class="tu-label" style="margin:0">数值列</span>
          <select v-model.number="colIdx" class="tu-select">
            <option v-for="ci in numericCols" :key="ci" :value="ci">{{ headers[ci] }}</option>
          </select>
        </div>
        <div v-if="chartData.rows.length" class="tu-chart">
          <div v-for="(r, k) in chartData.rows" :key="k" class="tu-chart-row">
            <span class="tu-chart-label" :title="r.label">{{ r.label }}</span>
            <div class="tu-chart-bar" :style="{ width: (Math.abs(r.v) / chartData.max * 100) + '%' }"></div>
            <span class="tu-chart-val">{{ r.v }}</span>
          </div>
        </div>
        <div v-else class="tu-preview">该列无可绘制数值</div>
      </div>

      <div class="tu-field" style="margin-top:10px">
        <label class="tu-label">数据预览</label>
        <div class="tu-table-wrap" style="max-height:280px">
          <table class="tu-table">
            <thead><tr><th>#</th><th v-for="(h, ci) in headers" :key="ci">{{ h }}</th></tr></thead>
            <tbody>
              <tr v-for="(r, ri) in dataRows.slice(0, 100)" :key="ri">
                <td>{{ ri + 1 }}</td>
                <td v-for="(c, ci) in r" :key="ci" class="break">{{ c }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div v-else class="tu-preview">解析后在此显示表格、统计与图表</div>
  </div>
</template>

<style scoped>
.break { word-break: break-all; }
.tu-chart { margin-top:8px; border:1px solid var(--color-border); border-radius:var(--radius-md); padding:10px; background:var(--color-bg-input); max-height:300px; overflow:auto; }
.tu-chart-row { display:flex; align-items:center; gap:8px; margin:4px 0; font-size:12px; }
.tu-chart-label { width:90px; flex:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--color-text-secondary); }
.tu-chart-bar { height:14px; min-width:2px; background:var(--color-primary); border-radius:3px; transition:width .2s; }
.tu-chart-val { flex:none; color:var(--color-text); font-family:var(--font-family-mono); }
</style>
