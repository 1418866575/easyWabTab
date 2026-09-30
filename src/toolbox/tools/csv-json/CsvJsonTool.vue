<script setup lang="ts">
/**
 * CSV ↔ JSON 互转（纯前端实现）
 * 支持自定义分隔符、首行表头开关、表格预览与文件导入导出。
 */
import { computed, ref } from 'vue'
import { csvToJson, jsonToCsv } from '../../core/csv'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, readFileAsText } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

const input = ref('name,age,city\n张三,28,上海\n李四,32,北京\n王五,26,深圳\n')
const output = ref('')
const delimiter = ref(',')
const hasHeader = ref(true)
const errorMsg = ref('')
const preview = ref<Record<string, string>[]>([])

useDirtyFlag(() => !!input.value.trim())
const { copy, save } = useToolActions()

const DELIMS: { text: string; value: string }[] = [
  { text: '逗号 ,', value: ',' },
  { text: '分号 ;', value: ';' },
  { text: '制表符 \\t', value: '\t' },
  { text: '竖线 |', value: '|' }
]

const columns = computed(() => (preview.value.length ? Object.keys(preview.value[0]) : []))

function toJson() {
  errorMsg.value = ''
  try {
    const rows = csvToJson(input.value, delimiter.value || ',')
    if (!rows.length) {
      errorMsg.value = '请输入 CSV 内容（首行为表头）'
      output.value = ''
      preview.value = []
      return
    }
    preview.value = rows.slice(0, 50)
    output.value = JSON.stringify(rows, null, 2)
  } catch (e) {
    errorMsg.value = (e as Error).message
    output.value = ''
    preview.value = []
  }
}

function toCsv() {
  errorMsg.value = ''
  try {
    const text = jsonToCsv(input.value, delimiter.value || ',')
    output.value = text
    try {
      preview.value = csvToJson(text, delimiter.value || ',').slice(0, 50)
    } catch {
      preview.value = []
    }
  } catch (e) {
    errorMsg.value = (e as Error).message
    output.value = ''
    preview.value = []
  }
}

async function onFiles(files: File[]) {
  const text = await readFileAsText(files[0])
  input.value = text
}

function useResult() {
  if (output.value) input.value = output.value
}
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-toolbar">
        <button type="button" class="tu-btn" @click="toJson">CSV → JSON</button>
        <button type="button" class="tu-btn ghost" @click="toCsv">JSON → CSV</button>
        <span class="tu-spacer" />
        <button type="button" class="tu-btn ghost" :disabled="!output" @click="useResult">结果写回左侧</button>
      </div>

      <div class="tu-row">
        <span class="tu-label">分隔符</span>
        <select v-model="delimiter" class="tu-select tu-inline" style="max-width: 140px">
          <option v-for="d in DELIMS" :key="d.text" :value="d.value">{{ d.text }}</option>
        </select>
        <button type="button" class="tu-check" :class="{ 'is-on': hasHeader }" @click="hasHeader = !hasHeader">
          首行为表头
        </button>
      </div>

      <TuField label="CSV / JSON 文本">
        <textarea
          v-model="input"
          class="tu-textarea"
          rows="14"
          spellcheck="false"
          placeholder="CSV 示例：&#10;name,age&#10;张三,18"
          data-testid="tb-modal-input"
        />
      </TuField>

      <TuField label="从文件导入">
        <TuDrop accept=".csv,.txt,.json,text/csv,application/json" hint="选择 CSV 或 JSON 文件" @files="onFiles" />
      </TuField>
    </div>

    <div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>

      <TuOutput
        title="转换结果"
        :text="output"
        :filename="hasHeader ? 'result.json' : 'result.csv'"
        :mime="hasHeader ? 'application/json' : 'text/csv;charset=utf-8'"
        empty="点击上方按钮开始转换"
      >
        <pre class="tu-code">{{ output }}</pre>
      </TuOutput>

      <TuOutput
        v-if="preview.length"
        title="表格预览（最多 50 行）"
        :text="output"
        filename="preview.json"
        mime="application/json"
        empty="—"
      >
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th v-for="c in columns" :key="c">{{ c }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in preview" :key="i">
                <td v-for="c in columns" :key="c">{{ row[c] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TuOutput>

      <div class="tu-row">
        <button type="button" class="tu-btn ghost" :disabled="!output" @click="copy(output)">复制结果</button>
        <button
          type="button"
          class="tu-btn ghost"
          :disabled="!output"
          @click="save('result.csv', output, 'text/csv;charset=utf-8')"
        >下载 CSV</button>
        <button
          type="button"
          class="tu-btn ghost"
          :disabled="!output"
          @click="save('result.json', output, 'application/json')"
        >下载 JSON</button>
      </div>
    </div>

    <details class="tu-folding tu-span">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>CSV → JSON：首行作为表头生成对象数组；关闭「首行为表头」时生成二维数组。</li>
          <li>JSON → CSV：支持对象数组与二维数组两种结构。</li>
          <li>可自定义分隔符；含分隔符或换行的字段会自动加引号转义。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-span { grid-column: 1 / -1; }
.tu-code {
  margin: 0;
  max-height: 280px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
