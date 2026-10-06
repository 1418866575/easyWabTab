<script setup lang="ts">
/**
 * PDF 转 Markdown（纯前端，pdfjs-dist 提取文本 + markdown-it 预览）
 * 按文本块的字号/位置推断标题层级与段落，输出 Markdown（降质版，适合文字型 PDF）。
 * 扫描件/图片型 PDF 无文本层时给出提示，需配合 OCR 工具。
 */
import { ref, computed } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import MarkdownIt from 'markdown-it'
import { downloadText, copyText, humanSize } from '../../core/download'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
// 关闭原始 HTML 透传，避免 PDF 文本中的尖括号被当作标签（本地文件亦安全起见）
const md = new MarkdownIt({ html: false, linkify: true, breaks: false })

interface Line { text: string; size: number; bold: boolean }

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const errorMsg = ref('')
const infoMsg = ref('')
const pageCount = ref(0)
const baseName = ref('doc')
const originalSize = ref(0)
const lineCount = ref(0)

const smartHeading = ref(true)
const pageSeparator = ref(true)

const markdown = ref('')

function groupLines(items: any[]): Line[] {
  const arr = items
    .map((it: any) => {
      const size = it.height || Math.abs(it.transform[3]) || 10
      const bold = /bold/i.test(it.fontName || '')
      return { str: it.str as string, x: it.transform[4] as number, y: it.transform[5] as number, size, bold }
    })
    .filter((it) => it.str != null)
  arr.sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { items: typeof arr }[] = []
  for (const it of arr) {
    const last = lines[lines.length - 1]
    if (last) {
      const ly = last.items[0].y
      if (Math.abs(ly - it.y) <= Math.max(2, last.items[0].size * 0.4)) {
        last.items.push(it)
        continue
      }
    }
    lines.push({ items: [it] })
  }
  return lines.map((l) => {
    let text = l.items.map((i) => i.str).join('')
    text = text.replace(/\s+/g, ' ').trim()
    const size = l.items.reduce((s, i) => s + i.size, 0) / l.items.length
    const bold = l.items.length > 0 && l.items.every((i) => i.bold)
    return { text, size, bold }
  })
}

function bodySize(lines: Line[]): number {
  const freq = new Map<number, number>()
  for (const l of lines) {
    const k = Math.round(l.size)
    freq.set(k, (freq.get(k) || 0) + 1)
  }
  let best = 10
  let bestC = 0
  for (const [k, c] of freq) {
    if (c > bestC) {
      bestC = c
      best = k
    }
  }
  return best
}

function escapeLine(s: string): string {
  return s.replace(/^([#*+\->=])/, '\\$1')
}

function serializeLine(l: Line, body: number, smart: boolean): string {
  const t = l.text
  if (!t) return ''
  // 已是列表项（无序/有序）则原样保留，不做标题推断
  if (/^\s*([-*+]|\d+[.)])\s+/.test(t)) return t
  if (smart) {
    const r = l.size / body
    if (r >= 1.7) return '# ' + t
    if (r >= 1.35) return '## ' + t
    if (r >= 1.15) return '### ' + t
    if (l.bold) return '**' + escapeLine(t) + '**'
  }
  return escapeLine(t)
}

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  errorMsg.value = ''
  infoMsg.value = ''
  markdown.value = ''
  baseName.value = f.name.replace(/\.pdf$/i, '')
  originalSize.value = f.size
  busy.value = true
  try {
    const buf = new Uint8Array(await f.arrayBuffer())
    const doc = await pdfjsLib.getDocument({ data: buf }).promise
    pageCount.value = doc.numPages
    const pageLines: Line[][] = []
    let total = 0
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      const lines = groupLines(tc.items)
      total += lines.length
      pageLines.push(lines)
    }
    lineCount.value = total
    if (total === 0) {
      infoMsg.value = '未提取到文本层（可能是扫描件/图片型 PDF），需要 OCR 工具才能转写。'
      return
    }
    const body = bodySize(pageLines.flat())
    const parts: string[] = []
    pageLines.forEach((lines, i) => {
      if (pageSeparator.value && i > 0) parts.push('\n\n---\n\n')
      parts.push(lines.map((l) => serializeLine(l, body, smartHeading.value)).join('\n'))
    })
    markdown.value = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
    infoMsg.value = `转换完成：共 ${pageCount.value} 页、${total} 行文本 → Markdown（正文基准字号约 ${body}pt）。`
  } catch (err) {
    errorMsg.value = '转换失败：' + (err as Error).message
  } finally {
    busy.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

const renderedHtml = computed(() => (markdown.value ? md.render(markdown.value) : ''))

async function copy() {
  if (markdown.value) {
    const ok = await copyText(markdown.value)
    infoMsg.value = ok ? '已复制 Markdown 到剪贴板。' : '复制失败，请手动选择文本复制。'
  }
}
function dl() {
  if (markdown.value) downloadText(`${baseName.value}.md`, markdown.value, 'text/markdown;charset=utf-8')
}
</script>

<template>
  <div class="tu-t2">
    <div class="tu-t1">
      <div class="tu-field">
        <label class="tu-label">选择 PDF</label>
        <input ref="fileInput" type="file" accept="application/pdf" hidden @change="onFile" />
        <button class="tu-btn" :disabled="busy" @click="fileInput?.click()">选择 PDF</button>
        <span v-if="originalSize" class="tu-hint" style="margin-left: 8px">原文件 {{ humanSize(originalSize) }}</span>
      </div>
      <div class="tu-row">
        <label class="tu-check" :class="{ 'is-on': smartHeading }">
          <input type="checkbox" v-model="smartHeading" /> 智能标题识别（按字号推断 # / ## / ###）
        </label>
      </div>
      <div class="tu-row">
        <label class="tu-check" :class="{ 'is-on': pageSeparator }">
          <input type="checkbox" v-model="pageSeparator" /> 页面之间插入分隔线（---）
        </label>
      </div>
      <div class="tu-field" style="margin-top: 8px">
        <label class="tu-label">Markdown 源码</label>
        <textarea v-model="markdown" class="tu-textarea" readonly :placeholder="busy ? '提取中…' : '选择 PDF 后在此显示提取的 Markdown'" style="min-height: 360px" />
      </div>
      <div class="tu-row">
        <button class="tu-btn ghost" :disabled="!markdown" @click="copy">复制</button>
        <button class="tu-btn ghost" :disabled="!markdown" @click="dl">下载 .md</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p v-if="infoMsg" class="tu-alert ok">{{ infoMsg }}</p>
    </div>
    <div class="tu-t1">
      <label class="tu-label">预览</label>
      <div class="md-preview" v-html="renderedHtml"></div>
      <p v-if="!markdown && !busy" class="tu-hint">右侧为 Markdown 渲染预览。复杂版式（多栏、表格、公式）可能丢失，属已知降质限制。</p>
    </div>
  </div>
</template>

<style scoped>
.md-preview {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-input);
  padding: 12px 16px;
  min-height: 360px;
  max-height: 60vh;
  overflow: auto;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text);
}
.md-preview :deep(h1) { font-size: 1.5em; margin: 0.6em 0 0.4em; }
.md-preview :deep(h2) { font-size: 1.3em; margin: 0.6em 0 0.4em; }
.md-preview :deep(h3) { font-size: 1.12em; margin: 0.5em 0 0.3em; }
.md-preview :deep(p) { margin: 0.4em 0; }
.md-preview :deep(ul), .md-preview :deep(ol) { padding-left: 1.4em; margin: 0.4em 0; }
.md-preview :deep(a) { color: var(--color-primary); }
.md-preview :deep(pre) { background: var(--color-bg-soft); padding: 8px 10px; border-radius: 6px; overflow: auto; }
.md-preview :deep(code) { background: var(--color-bg-soft); padding: 1px 4px; border-radius: 4px; }
.md-preview :deep(strong) { color: var(--color-text-strong); }
.md-preview :deep(hr) { border: none; border-top: 1px dashed var(--color-border); margin: 1em 0; }
</style>
