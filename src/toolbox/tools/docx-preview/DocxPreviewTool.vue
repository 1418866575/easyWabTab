<script setup lang="ts">
import { ref } from 'vue'
import mammoth from 'mammoth'

const fileInput = ref<HTMLInputElement | null>(null)
const html = ref('')
const errorMsg = ref('')
const busy = ref(false)

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  html.value = ''
  errorMsg.value = ''
  if (!f) return
  busy.value = true
  try {
    const buf = await f.arrayBuffer()
    const res = await mammoth.convertToHtml({ arrayBuffer: buf })
    html.value = res.value
    const warns = res.messages.filter(m => m.type === 'warning')
    if (warns.length) errorMsg.value = '部分样式可能未完美转换（' + warns.length + ' 条提示）'
  } catch (err) {
    errorMsg.value = '转换失败：' + (err as Error).message
  } finally {
    busy.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

function printPdf() {
  if (!html.value) return
  const w = window.open('', '_blank')
  if (!w) { errorMsg.value = '弹窗被拦截，请允许本页面弹出窗口'; return }
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>文档预览</title><style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;line-height:1.7}h1,h2,h3{break-after:avoid}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style></head><body>' + html.value + '</body></html>')
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}
</script>

<template>
  <div class="tu-t5">
    <div class="tu-row">
      <input ref="fileInput" type="file" accept=".docx" hidden @change="onFile" />
      <button class="tu-btn" :disabled="busy" @click="fileInput?.click()">{{ busy ? '转换中…' : '选择 DOCX' }}</button>
      <button class="tu-btn ghost" :disabled="!html" @click="printPdf">打印 / 另存 PDF</button>
    </div>
    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
    <p class="tu-hint">转换在本地完成；复杂排版（文本框、页眉页脚）可能略有差异，打印时选「另存为 PDF」即可导出。</p>
    <div v-if="html" class="doc-body" v-html="html" />
    <div v-else class="tu-preview">DOCX 预览将显示在此处</div>
  </div>
</template>

<style scoped>
.doc-body { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 16px 20px; background: var(--color-bg-card); overflow: auto; max-height: 60vh; line-height: 1.7; word-break: break-word }
.doc-body :deep(h1) { font-size: 1.6em }
.doc-body :deep(h2) { font-size: 1.35em }
.doc-body :deep(img) { max-width: 100% }
.doc-body :deep(table) { border-collapse: collapse }
.doc-body :deep(td), .doc-body :deep(th) { border: 1px solid var(--color-border); padding: 4px 8px }
</style>
