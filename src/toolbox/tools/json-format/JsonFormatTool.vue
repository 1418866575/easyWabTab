<script setup lang="ts">
/**
 * JSON 格式化 / 压缩 / 校验（纯前端实现，不上传数据）
 */
import { ref } from 'vue'
import { useToast } from '@/composables/useToast'

const input = ref('')
const output = ref('')
const { success, error } = useToast()

const errText = (e: unknown) => '出错：' + (e instanceof Error ? e.message : String(e))

function parse(): unknown {
  return JSON.parse(input.value)
}

function format() {
  try { output.value = JSON.stringify(parse(), null, 2) } catch (e) { output.value = errText(e) }
}
function minify() {
  try { output.value = JSON.stringify(parse()) } catch (e) { output.value = errText(e) }
}
function validate() {
  try { parse(); output.value = '✅ 合法 JSON' } catch (e) { output.value = '❌ ' + errText(e) }
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
      <label class="tu-label" for="jf-input">输入 JSON</label>
      <textarea
        id="jf-input"
        v-model="input"
        class="tu-textarea"
        placeholder='在此粘贴 JSON，例如 {"a":1,"b":[2,3]}'
      />
    </div>

    <div class="tu-row">
      <button type="button" class="tu-btn" @click="format">格式化</button>
      <button type="button" class="tu-btn ghost" @click="minify">压缩</button>
      <button type="button" class="tu-btn ghost" @click="validate">校验</button>
      <button type="button" class="tu-btn ghost" @click="copy">复制结果</button>
    </div>

    <div class="tu-field">
      <span class="tu-label">结果</span>
      <div class="tu-out" data-testid="tool-json-output">{{ output || '（暂无输出）' }}</div>
    </div>
    <p class="tu-hint">数据全部在本地浏览器处理，不会上传到任何服务器。</p>
  </div>
</template>
