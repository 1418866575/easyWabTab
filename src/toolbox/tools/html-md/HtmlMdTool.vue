<script setup lang="ts">
import { ref } from 'vue'
import TurndownService from 'turndown'
import MarkdownIt from 'markdown-it'
import { copyText, downloadText } from '../../core/download'

const mode = ref<'toMd' | 'toHtml'>('toMd')
const input = ref(mode.value === 'toMd'
  ? '<h1>标题</h1>\n<p>一段 <strong>加粗</strong> 文本与 <a href="https://example.com">链接</a>。</p>'
  : '# 标题\n\n一段 **加粗** 文本与 [链接](https://example.com)。')
const output = ref('')

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
const md = new MarkdownIt()

function run() {
  try {
    output.value = mode.value === 'toMd' ? td.turndown(input.value) : md.render(input.value)
  } catch (e) {
    output.value = '转换失败：' + (e as Error).message
  }
}
function switchMode(m: 'toMd' | 'toHtml') {
  mode.value = m
  input.value = m === 'toMd'
    ? '<h1>标题</h1>\n<p>一段 <strong>加粗</strong> 文本与 <a href="https://example.com">链接</a>。</p>'
    : '# 标题\n\n一段 **加粗** 文本与 [链接](https://example.com)。'
  output.value = ''
}
async function copy() { if (output.value) await copyText(output.value) }
function dl() { if (output.value) downloadText('output.' + (mode.value === 'toMd' ? 'md' : 'html'), output.value, mode.value === 'toMd' ? 'text/markdown' : 'text/html') }
</script>

<template>
  <div class="tu-t2">
    <div class="tu-t1">
      <div class="tu-toolbar">
        <div class="tu-seg">
          <button :class="{ 'is-on': mode === 'toMd' }" @click="switchMode('toMd')">HTML → MD</button>
          <button :class="{ 'is-on': mode === 'toHtml' }" @click="switchMode('toHtml')">MD → HTML</button>
        </div>
        <span class="tu-spacer" />
        <button class="tu-btn" @click="run">转换</button>
      </div>
      <div class="tu-field"><label class="tu-label">输入</label><textarea v-model="input" class="tu-textarea" /></div>
    </div>
    <div class="tu-t1">
      <div class="tu-field"><label class="tu-label">输出</label><textarea v-model="output" class="tu-textarea" readonly /></div>
      <div class="tu-row">
        <button class="tu-btn ghost" @click="copy">复制</button>
        <button class="tu-btn ghost" @click="dl">下载</button>
      </div>
    </div>
  </div>
</template>
