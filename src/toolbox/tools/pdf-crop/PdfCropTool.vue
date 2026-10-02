<script setup lang="ts">
/**
 * PDF 裁剪（纯前端，pdf-lib + pdfjs-dist）
 * 按上/下/左/右 边距（mm）裁剪所有页面（或仅第一页）：用 setCropBox 设置裁切框。
 * 预览：pdfjs 渲染首页 + CSS 叠加框实时显示保留区域；实际裁剪用 pdf-lib，保证坐标精确。
 */
import { ref, computed } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument } from 'pdf-lib'
import { downloadBlob, humanSize } from '../../core/download'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
const MM2PT = 2.834645669

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const errorMsg = ref('')
const infoMsg = ref('')
const pageCount = ref(0)
const baseName = ref('doc')
const originalSize = ref(0)

const topMm = ref(0)
const bottomMm = ref(0)
const leftMm = ref(0)
const rightMm = ref(0)
const firstOnly = ref(false)

const previewUrl = ref('')
const previewWpt = ref(0)
const previewHpt = ref(0)

let lastFile: File | null = null

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
    const doc = await pdfjsLib.getDocument({ data: buf }).promise
    pageCount.value = doc.numPages
    const p = await doc.getPage(1)
    const vp = await p.getViewport({ scale: 1 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext('2d')!
    await p.render({ canvasContext: ctx, viewport: vp }).promise
    previewUrl.value = canvas.toDataURL('image/png')
    previewWpt.value = vp.width
    previewHpt.value = vp.height
  } catch (err) {
    errorMsg.value = '解析失败：' + (err as Error).message
  } finally {
    busy.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

const overlayStyle = computed(() => {
  const left = Math.max(0, leftMm.value * MM2PT)
  const top = Math.max(0, topMm.value * MM2PT)
  const width = Math.max(0, (previewWpt.value - leftMm.value - rightMm.value) * MM2PT)
  const height = Math.max(0, (previewHpt.value - topMm.value - bottomMm.value) * MM2PT)
  return { left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px' }
})

async function applyCrop() {
  if (!lastFile) {
    errorMsg.value = '请先选择 PDF 文件'
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
    const ml = leftMm.value * MM2PT
    const mr = rightMm.value * MM2PT
    const mt = topMm.value * MM2PT
    const mb = bottomMm.value * MM2PT
    const idxList = firstOnly.value ? [0] : pages.map((_, i) => i)
    let cropped = 0
    for (const idx of idxList) {
      if (idx >= total) break
      const page = pages[idx]
      const box = page.getMediaBox()
      const x0 = box.x
      const y0 = box.y
      const x1 = box.x + box.width
      const y1 = box.y + box.height
      const left = Math.min(x1 - mr, x0 + ml)
      const bottom = Math.min(y1 - mb, y0 + mt)
      const right = Math.max(left, x1 - mr)
      const top = Math.max(bottom, y1 - mt)
      if (right - left <= 0 || top - bottom <= 0) {
        errorMsg.value = '边距过大，已超出页面范围，请减小边距。'
        return
      }
      page.setCropBox(left, bottom, right - left, top - bottom)
      cropped++
    }
    const blob = new Blob([await doc.save()], { type: 'application/pdf' })
    downloadBlob(`${baseName.value}-cropped.pdf`, blob)
    infoMsg.value = `裁剪完成：已处理 ${cropped} 页，原 ${humanSize(originalSize.value)} → 裁剪后 ${humanSize(blob.size)}。`
  } catch (err) {
    errorMsg.value = '裁剪失败：' + (err as Error).message
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
        <label class="tu-label">裁剪边距（mm，从各边向内裁切）</label>
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
      <button type="button" class="tu-btn" :disabled="busy || !lastFile" @click="applyCrop">
        {{ busy ? '裁剪中…' : '应用裁剪并下载' }}
      </button>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p v-if="infoMsg" class="tu-alert ok">{{ infoMsg }}</p>
      <p class="tu-hint">
        通过 setCropBox 设置裁切框（不改变页面内容坐标，仅在查看时隐藏外侧区域）。如需把内容重排到新页面尺寸，属进阶需求，当前未做。
      </p>
    </div>
    <div>
      <div v-if="previewUrl" class="crop-preview">
        <img :src="previewUrl" class="crop-img" alt="首页预览" />
        <div class="crop-keep" :style="overlayStyle"></div>
      </div>
      <div v-else-if="pageCount" class="tu-preview">首页预览（渲染中）…</div>
      <div v-else class="tu-preview">选择 PDF 后显示首页预览与裁切框</div>
      <p v-if="pageCount" class="tu-hint">共 {{ pageCount }} 页 · 预览框为将保留的区域（深色为裁掉部分）</p>
    </div>
  </div>
</template>

<style scoped>
.crop-preview { position: relative; display: inline-block; max-width: 100%; overflow: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-input); }
.crop-img { display: block; }
.crop-keep {
  position: absolute;
  border: 1px solid var(--color-primary);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
</style>
