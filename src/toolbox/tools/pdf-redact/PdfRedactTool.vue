<script setup lang="ts">
/**
 * PDF 标记密文（纯前端，pdfjs 定位 + pdf-lib 绘制黑块）
 * - 关键词模式：pdfjs 提取文本位置，匹配关键词的文本块绘制黑色矩形覆盖。
 * - 边距模式：按上/下/左/右边距（mm）绘制黑带，去除页眉/页脚/装订区。
 * 预览：pdfjs 渲染首页 + 红色框显示将要涂黑的区域（实际为黑色，预览仅示意）。
 * 注意：涂黑不可逆，输出为新文件，原文件不变。
 */
import { ref, computed } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument, rgb } from 'pdf-lib'
import { pdfBlob, downloadBlob, humanSize } from '../../core/download'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
const MM2PT = 2.834645669

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const errorMsg = ref('')
const infoMsg = ref('')
const pageCount = ref(0)
const baseName = ref('doc')
const originalSize = ref(0)

const keywords = ref('')
const topMm = ref(0)
const bottomMm = ref(0)
const leftMm = ref(0)
const rightMm = ref(0)
const firstOnly = ref(false)

const previewUrl = ref('')
const previewWpt = ref(0)
const previewHpt = ref(0)
let lastFile: File | null = null
let pdfDoc: any = null

interface Box { left: number; top: number; width: number; height: number }

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  errorMsg.value = ''
  infoMsg.value = ''
  previewUrl.value = ''
  lastFile = f
  baseName.value = f.name.replace(/\.pdf$/i, '')
  originalSize.value = f.size
  busy.value = true
  try {
    const buf = new Uint8Array(await f.arrayBuffer())
    pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise
    pageCount.value = pdfDoc.numPages
    const p = await pdfDoc.getPage(1)
    const vp = await p.getViewport({ scale: 1 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext('2d')!
    await p.render({ canvasContext: ctx, viewport: vp }).promise
    previewUrl.value = canvas.toDataURL('image/png')
    previewWpt.value = vp.width
    previewHpt.value = vp.height
    previewBoxes.value = await previewBoxesOnPage(p)
  } catch (err) {
    errorMsg.value = '解析失败：' + (err as Error).message
  } finally {
    busy.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

const previewBoxes = ref<Box[]>([])

async function keywordBoxesOnPage(page: any): Promise<Box[]> {
  const kws = keywords.value
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!kws.length) return []
  const tc = await page.getTextContent()
  const boxes: Box[] = []
  for (const it of tc.items as any[]) {
    const s = (it.str || '') as string
    if (kws.some((k) => s.toLowerCase().includes(k.toLowerCase()))) {
      const x = it.transform[4]
      const y = it.transform[5]
      const w = it.width || 0
      const h = it.height || Math.abs(it.transform[3]) || 10
      boxes.push({ left: x, top: y + h, width: w, height: h })
    }
  }
  return boxes
}

function marginBoxes(box: any): Box[] {
  const x0 = box.x
  const y0 = box.y
  const w = box.width
  const h = box.height
  const mt = topMm.value * MM2PT
  const mb = bottomMm.value * MM2PT
  const ml = leftMm.value * MM2PT
  const mr = rightMm.value * MM2PT
  const res: Box[] = []
  if (mt > 0) res.push({ left: x0, top: y0 + h - mt, width: w, height: mt })
  if (mb > 0) res.push({ left: x0, top: y0, width: w, height: mb })
  if (ml > 0) res.push({ left: x0, top: y0, width: ml, height: h })
  if (mr > 0) res.push({ left: x0 + w - mr, top: y0, width: mr, height: h })
  return res
}

async function previewBoxesOnPage(page: any): Promise<Box[]> {
  const boxes = await keywordBoxesOnPage(page)
  boxes.push(...marginBoxes(await page.getMediaBox()))
  return boxes
}

const overlayItems = computed(() =>
  previewBoxes.value.map((b) => ({
    left: b.left + 'px',
    top: previewHpt.value - b.top + 'px',
    width: b.width + 'px',
    height: b.height + 'px'
  }))
)

async function applyRedact() {
  if (!lastFile) {
    errorMsg.value = '请先选择 PDF 文件'
    return
  }
  if (!keywords.value.trim() && !topMm.value && !bottomMm.value && !leftMm.value && !rightMm.value) {
    errorMsg.value = '请至少填写关键词或边距'
    return
  }
  busy.value = true
  errorMsg.value = ''
  infoMsg.value = ''
  try {
    const bytes = new Uint8Array(await lastFile.arrayBuffer())
    const doc = await PDFDocument.load(bytes)
    const pages = doc.getPages()
    const total = pages.length
    const idxList = firstOnly.value ? [0] : pages.map((_, i) => i)
    let count = 0
    for (const idx of idxList) {
      if (idx >= total) break
      const page = pages[idx]
      const pdfjsPage = await pdfDoc.getPage(idx + 1)
      const boxes = await keywordBoxesOnPage(pdfjsPage)
      boxes.push(...marginBoxes(page.getMediaBox()))
      for (const b of boxes) {
        page.drawRectangle({
          x: b.left,
          y: b.top - b.height,
          width: b.width,
          height: b.height,
          color: rgb(0, 0, 0)
        })
        count++
      }
    }
    const blob = pdfBlob(await doc.save())
    downloadBlob(`${baseName.value}-redacted.pdf`, blob)
    infoMsg.value = `已涂黑 ${count} 处（作用于 ${idxList.length} 页），原 ${humanSize(originalSize.value)} → 涂黑后 ${humanSize(blob.size)}。`
  } catch (err) {
    errorMsg.value = '涂黑失败：' + (err as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tu-t2">
    <div class="tu-t1">
      <div class="tu-field">
        <label class="tu-label">选择 PDF</label>
        <input ref="fileInput" type="file" accept="application/pdf" hidden @change="onFile" />
        <button class="tu-btn" :disabled="busy" @click="fileInput?.click()">选择 PDF</button>
        <span v-if="pageCount" class="tu-hint" style="margin-left: 8px">共 {{ pageCount }} 页</span>
      </div>
      <div class="tu-field">
        <label class="tu-label">关键词涂黑（逗号/换行分隔，匹配到的文本块将被覆盖）</label>
        <textarea v-model="keywords" class="tu-textarea" style="min-height: 80px" placeholder="如：姓名,身份证,电话" />
      </div>
      <div class="tu-field">
        <label class="tu-label">边距涂黑（mm，去除页眉/页脚/留白）</label>
        <div class="tu-grid" style="grid-template-columns: repeat(2, 1fr)">
          <span class="tu-label">上 <input v-model.number="topMm" type="number" min="0" max="500" class="tu-input tu-inline" style="max-width: 80px" /></span>
          <span class="tu-label">下 <input v-model.number="bottomMm" type="number" min="0" max="500" class="tu-input tu-inline" style="max-width: 80px" /></span>
          <span class="tu-label">左 <input v-model.number="leftMm" type="number" min="0" max="500" class="tu-input tu-inline" style="max-width: 80px" /></span>
          <span class="tu-label">右 <input v-model.number="rightMm" type="number" min="0" max="500" class="tu-input tu-inline" style="max-width: 80px" /></span>
        </div>
      </div>
      <div class="tu-row">
        <label class="tu-check" :class="{ 'is-on': firstOnly }">
          <input type="checkbox" v-model="firstOnly" /> 仅作用于第一页
        </label>
      </div>
      <button type="button" class="tu-btn" :disabled="busy || !lastFile" @click="applyRedact">
        {{ busy ? '处理中…' : '应用涂黑并下载' }}
      </button>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p v-if="infoMsg" class="tu-alert ok">{{ infoMsg }}</p>
      <p class="tu-hint">涂黑为不可逆操作，仅生成新文件、不改原文件。预览框（红框）为将要涂黑区域示意，实际输出为黑色覆盖。</p>
    </div>
    <div class="tu-t1">
      <div v-if="previewUrl" class="redact-preview">
        <img :src="previewUrl" class="redact-img" alt="首页预览" />
        <div v-for="(b, i) in overlayItems" :key="i" class="redact-box" :style="b" />
      </div>
      <div v-else class="tu-preview">选择 PDF 后显示首页预览与涂黑规划框</div>
    </div>
  </div>
</template>

<style scoped>
.redact-preview { position: relative; display: inline-block; max-width: 100%; overflow: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-input); }
.redact-img { display: block; }
.redact-box { position: absolute; border: 2px solid #e5484d; background: rgba(229, 72, 77, 0.18); pointer-events: none; }
</style>
