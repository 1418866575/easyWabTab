<script setup lang="ts">
/**
 * CSV ↔ JSON 互转（纯前端实现）
 */
import { ref } from 'vue'
import { useToast } from '@/composables/useToast'
import { csvToJson, jsonToCsv } from '../../core/csv'

const input = ref('')
const output = ref('')
const delimiter = ref(',')
const { success, error } = useToast()

const errText = (e: unknown) => '出错：' + (e instanceof Error ? e.message : String(e))

function toJson() {
  try {
    const rows = csvToJson(input.value, delimiter.value || ',')
    if (!rows.length) { output.value = '请输入 CSV 内容（首行为表头）'; return }
    output.value = JSON.stringify(rows, null, 2)
  } catch (e) {
    output.value = errText(e)
  }
}

function toCsv() {
  try {
    output.value = jsonToCsv(input.value, delimiter.value || ',')
  } catch (e) {
    output.value = errText(e)
  }
}

async function copy() {
  if (!output.value) { error('暂无可复制内容'); return }
  try {
    await navigator.clipboard.writeText(output.value)
    success('已复制到剪贴板')
  } catch {
    error('复制失败，请手动选择结果复制')
  }
}
</script>

<template>
  <div>
    <div class="tu-field">
      <label class="tu-label" for="cj-input">CSV / JSON 文本</label>
      <textarea
        id="cj-input"
        v-model="input"
        class="tu-textarea"
        placeholder="CSV 示例：&#10;name,age&#10;张三,18&#10;李四,20"
      />
    </div>

    <div class="tu-row">
      <span class="tu-label">分隔符</span>
      <input v-model="delimiter" class="tu-input tu-inline" style="max-width:120px" placeholder="," />
      <button type="button" class="tu-btn" @click="toJson">CSV → JSON</button>
      <button type="button" class="tu-btn ghost" @click="toCsv">JSON → CSV</button>
      <button type="button" class="tu-btn ghost" @click="copy">复制结果</button>
    </div>

    <div class="tu-field">
      <span class="tu-label">结果</span>
      <div class="tu-out" data-testid="tool-csv-json-output">{{ output || '（暂无输出）' }}</div>
    </div>
  </div>
</template>
