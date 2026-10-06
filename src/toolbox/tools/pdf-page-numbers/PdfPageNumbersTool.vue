<script setup lang="ts">
/**
 * PDF 添加页码（纯前端，pdf-lib）
 * 为每页绘制页码：位置（6 选一）、格式（n / 第n页 / n/N）、起始值、字号、距边距。
 * 每次从原始字节重新加载，避免多次叠加；字体用内置 Helvetica。
 */
import { ref } from 'vue'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { pdfBlob, downloadBlob } from '../../core/download'

type Position = 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left'
type Format = 'n' | 'page' | 'ratio'

const POSITIONS: { id: Position; name: string }[] = [
  { id: 'bottom-center', name: '下居中' },
  { id: 'bottom-right', name: '下右' },
  { id: 'bottom-left', name: '下左' },
  { id: 'top-center', name: '上居中' },
  { id: 'top-right', name: '上右' },
  { id: 'top-left', name: '上左' }
]
const FORMATS: { id: Format; name: string }[] = [
  { id: 'n', name: '纯数字 n' },
  { id: 'page', name: '第 n 页' },
  { id: 'ratio', name: 'n / N（含总页数）' }
]

const MM2PT = 2.834645669

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const errorMsg = ref('')
const pageCount = ref(0)
const bytes = ref<Uint8Array | null>(null)
const baseName = ref('doc')

const position = ref<Position>('bottom-center')
const format = ref<Format>('n')
const start = ref(1)
const fontSize = ref(10)
const marginMm = ref(12)

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  errorMsg.value = ''
  pageCount.value = 0
  if (!f.name.toLowerCase().endsWith('.pdf')) {
    errorMsg.value = '请选择 PDF 文件'
    return
  }
  bytes.value = new Uint8Array(await f.arrayBuffer())
  baseName.value = f.name.replace(/\.pdf$/i, '')
  try {
    const doc = await PDFDocument.load(bytes.value)
    pageCount.value = doc.getPageCount()
  } catch (err) {
    errorMsg.value = '解析失败：' + (err as Error).message
  }
  ;(e.target as HTMLInputElement).value = ''
}

function label(n: number, total: number): string {
  if (format.value === 'n') return String(n)
  if (format.value === 'page') return `第 ${n} 页`
  return `${n} / ${total}`
}

async function generate() {
  if (!bytes.value) return
  busy.value = true
  errorMsg.value = ''
  try {
    const doc = await PDFDocument.load(bytes.value)
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const pages = doc.getPages()
    const total = pages.length
    const size = Number(fontSize.value) || 10
    const mPt = (Number(marginMm.value) || 0) * MM2PT
    const startN = Number(start.value) || 1
    for (let i = 0; i < total; i++) {
      const page = pages[i]
      const { width, height } = page.getSize()
      const n = startN + i
      const text = label(n, total)
      const tw = font.widthOfTextAtSize(text, size)
      let x = 0
      let y = 0
      switch (position.value) {
        case 'bottom-center': x = (width - tw) / 2; y = mPt; break
        case 'bottom-right': x = width - mPt - tw; y = mPt; break
        case 'bottom-left': x = mPt; y = mPt; break
        case 'top-center': x = (width - tw) / 2; y = height - mPt - size; break
        case 'top-right': x = width - mPt - tw; y = height - mPt - size; break
        case 'top-left': x = mPt; y = height - mPt - size; break
      }
      page.drawText(text, { x, y, size, font })
    }
    const blob = pdfBlob(await doc.save())
    downloadBlob(`${baseName.value}-numbered.pdf`, blob)
  } catch (err) {
    errorMsg.value = '生成失败：' + (err as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-field">
        <label class="tu-label">选择 PDF</label>
        <input ref="fileInput" type="file" accept="application/pdf" hidden @change="onFile" />
        <button class="tu-btn" :disabled="busy" @click="fileInput?.click()">选择 PDF</button>
      </div>
      <div class="tu-field">
        <label class="tu-label">页码位置</label>
        <div class="tu-seg" style="flex-wrap: wrap">
          <button
            v-for="p in POSITIONS"
            :key="p.id"
            :class="{ 'is-on': position === p.id }"
            @click="position = p.id"
          >{{ p.name }}</button>
        </div>
      </div>
      <div class="tu-field">
        <label class="tu-label">页码格式</label>
        <div class="tu-seg">
          <button
            v-for="f in FORMATS"
            :key="f.id"
            :class="{ 'is-on': format === f.id }"
            @click="format = f.id"
          >{{ f.name }}</button>
        </div>
      </div>
      <div class="tu-row">
        <span class="tu-label">起始数字</span>
        <input v-model.number="start" type="number" min="0" class="tu-input tu-inline" style="max-width: 90px" />
        <span class="tu-label">字号</span>
        <input v-model.number="fontSize" type="number" min="4" max="48" class="tu-input tu-inline" style="max-width: 90px" />
        <span class="tu-label">边距(mm)</span>
        <input v-model.number="marginMm" type="number" min="0" max="50" class="tu-input tu-inline" style="max-width: 90px" />
      </div>
      <div class="tu-row">
        <button class="tu-btn" :disabled="busy || !pageCount" @click="generate">{{ busy ? '生成中…' : '添加页码并下载' }}</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">使用内置 Helvetica 字体绘制，覆盖在页面之上；如需奇偶页差异或页脚文字替换，后续可扩展。</p>
    </div>
    <div>
      <div v-if="pageCount" class="tu-card">
        <div class="tu-card-title">预览</div>
        <div class="tu-card-value">{{ pageCount }} 页</div>
        <div class="tu-hint">位置：{{ POSITIONS.find(p => p.id === position)?.name }} · 格式：{{ FORMATS.find(f => f.id === format)?.name }}</div>
      </div>
      <div v-else class="tu-preview">选择 PDF 后显示页数预览</div>
    </div>
  </div>
</template>
