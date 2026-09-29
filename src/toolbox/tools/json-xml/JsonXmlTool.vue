<script setup lang="ts">
/**
 * JSON → XML / Excel（纯前端实现，Excel 导出使用 xlsx，仅在点击导出时懒加载）
 */
import { computed, ref } from 'vue'
import { collectHeaders, flattenRows, jsonToSheetData, jsonToXml } from '../../core/xml'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'
import { readFileAsText } from '../../composables/useToolActions'

const input = ref('[\n  { "id": 1, "name": "张三", "dept": { "code": "A1" } },\n  { "id": 2, "name": "李四", "dept": { "code": "B2" } }\n]')
const rootName = ref('root')
const itemName = ref('item')
const pretty = ref(true)
const errorMsg = ref('')

useDirtyFlag(() => !!input.value.trim())
const { copy, save } = useToolActions()

const xml = computed(() => jsonToXml(input.value, { rootName: rootName.value || 'root', arrayItemName: itemName.value || 'item', pretty: pretty.value }))

const sheet = computed(() => jsonToSheetData(input.value))
const headers = computed(() => {
  try {
    const arr = JSON.parse(input.value)
    return collectHeaders(Array.isArray(arr) ? flattenRows(arr) : [flattenRows(arr)])
  } catch {
    return []
  }
})
const rows = computed(() => {
  if (!sheet.value.ok) return []
  return sheet.value.rows.slice(1, 21)
})

async function onFiles(files: File[]) {
  input.value = await readFileAsText(files[0])
}

async function exportExcel() {
  errorMsg.value = ''
  if (!sheet.value.ok) {
    errorMsg.value = sheet.value.error || 'JSON 解析失败'
    return
  }
  try {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet(sheet.value.rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const { downloadBlob } = await import('../../core/download')
    downloadBlob('data.xlsx', new Blob([out], { type: 'application/octet-stream' }))
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}
</script>

<template>
  <div class="tu-t1">
    <TuField label="JSON 内容">
      <textarea
        v-model="input"
        class="tu-textarea"
        rows="8"
        spellcheck="false"
        placeholder='[{"id":1,"name":"张三"}]'
        data-testid="tb-modal-input"
      />
      <TuDrop accept=".json,application/json" hint="或选择 JSON 文件导入" @files="onFiles" />
    </TuField>

    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>

    <div class="tu-row">
      <span class="tu-label">根元素名</span>
      <input v-model="rootName" class="tu-input tu-inline" style="max-width: 120px" />
      <span class="tu-label">数组元素名</span>
      <input v-model="itemName" class="tu-input tu-inline" style="max-width: 120px" />
      <button type="button" class="tu-check" :class="{ 'is-on': pretty }" @click="pretty = !pretty">缩进美化</button>
    </div>

    <TuOutput
      title="XML 结果"
      :text="xml.text"
      filename="data.xml"
      mime="application/xml"
      empty="输入合法 JSON 后显示 XML"
    >
      <pre class="tu-code">{{ xml.ok ? xml.text : xml.error }}</pre>
    </TuOutput>

    <TuOutput
      title="Excel 预览（前 20 行）"
      :text="sheet.ok ? sheet.rows.map(r => r.join('\t')).join('\n') : ''"
      filename="data.csv"
      mime="text/csv;charset=utf-8"
      empty="输入合法 JSON 后显示表格预览"
    >
      <div v-if="sheet.ok" class="tu-table-wrap">
        <table class="tu-table">
          <thead>
            <tr>
              <th v-for="h in headers" :key="h">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="i">
              <td v-for="(c, j) in r" :key="j">{{ c }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="tu-alert">{{ sheet.error }}</p>
    </TuOutput>

    <div class="tu-row">
      <button type="button" class="tu-btn" :disabled="!sheet.ok" @click="exportExcel">导出 Excel（xlsx）</button>
      <button type="button" class="tu-btn ghost" :disabled="!xml.ok" @click="copy(xml.text)">复制 XML</button>
      <button
        type="button"
        class="tu-btn ghost"
        :disabled="!xml.ok"
        @click="save('data.xml', xml.text, 'application/xml')"
      >下载 XML</button>
    </div>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>数组元素默认用配置的「数组元素名」包裹，可自定义根元素与缩进。</li>
          <li>嵌套对象在导出 Excel 时会自动展平为 <code>dept.code</code> 形式的列名。</li>
          <li>非法标签名会被自动清洗为合法 XML 标签。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-code {
  margin: 0;
  max-height: 240px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
