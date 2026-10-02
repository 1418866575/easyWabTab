<script setup lang="ts">
import { ref } from 'vue'
import { copyText, downloadText } from '../../core/download'

type Kind = 'html' | 'url' | 'json' | 'sql'
const kind = ref<Kind>('html')
const mode = ref<'escape' | 'unescape'>('escape')
const input = ref('')
const output = ref('')

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function unescapeHtml(s: string): string {
  const d = document.createElement('textarea')
  d.innerHTML = s
  return d.value
}
function run() {
  const s = input.value
  if (kind.value === 'html') output.value = mode.value === 'escape' ? escapeHtml(s) : unescapeHtml(s)
  else if (kind.value === 'url') output.value = mode.value === 'escape' ? encodeURIComponent(s) : safeDecodeURI(s)
  else if (kind.value === 'json') output.value = mode.value === 'escape' ? JSON.stringify(s).slice(1, -1) : safeJson(s)
  else output.value = mode.value === 'escape' ? s.replace(/'/g, "''") : s.replace(/''/g, "'")
}
function safeDecodeURI(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}
function safeJson(s: string): string {
  try { return JSON.parse('"' + s + '"') } catch { return s }
}
async function copy() { if (output.value) await copyText(output.value) }
function dl() { if (output.value) downloadText('escaped.txt', output.value) }
</script>

<template>
  <div class="tu-t3">
    <div class="tu-toolbar">
      <div class="tu-seg">
        <button v-for="k in (['html','url','json','sql'] as Kind[])" :key="k" :class="{ 'is-on': kind === k }" @click="kind = k">{{ { html: 'HTML', url: 'URL', json: 'JSON', sql: 'SQL' }[k] }}</button>
      </div>
      <div class="tu-seg">
        <button :class="{ 'is-on': mode === 'escape' }" @click="mode = 'escape'">转义</button>
        <button :class="{ 'is-on': mode === 'unescape' }" @click="mode = 'unescape'">反转义</button>
      </div>
      <span class="tu-spacer" />
      <button class="tu-btn" @click="run">转换</button>
    </div>
    <div class="tu-field">
      <label class="tu-label">输入</label>
      <textarea v-model="input" class="tu-textarea" placeholder="粘贴待转换文本" />
    </div>
    <div class="tu-field">
      <label class="tu-label">输出</label>
      <textarea v-model="output" class="tu-textarea" readonly />
    </div>
    <div class="tu-row">
      <button class="tu-btn ghost" @click="copy">复制</button>
      <button class="tu-btn ghost" @click="dl">下载</button>
    </div>
  </div>
</template>
