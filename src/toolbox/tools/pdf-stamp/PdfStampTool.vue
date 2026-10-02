<script setup lang="ts">
import { ref } from 'vue'
import { PDFDocument } from 'pdf-lib'
import { downloadBlob } from '../../core/download'

const fileInput = ref<HTMLInputElement | null>(null)
const stampInput = ref<HTMLInputElement | null>(null)
const pageCount = ref(0)
const position = ref<'center' | 'tl' | 'tr' | 'bl' | 'br'>('center')
const scale = ref(30)
const applyAll = ref(true)
const pageNum = ref(1)
const busy = ref(false)
const errorMsg = ref('')
let orig: Uint8Array | null = null
let stampBytes: Uint8Array | null = null

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  errorMsg.value = ''
  if (!f || !f.name.toLowerCase().endsWith('.pdf')) { errorMsg.value = '请选择 PDF 文件'; return }
  busy.value = true
  try {
    const buf = await f.arrayBuffer()
    orig = new Uint8Array(buf)
    const doc = await PDFDocument.load(orig)
    pageCount.value = doc.getPageCount()
    if (pageNum.value > pageCount.value) pageNum.value = 1
  } catch (err) {
    errorMsg.value = '读取失败：' + (err as Error).message
  } finally {
    busy.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}
async function onStamp(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  const buf = await f.arrayBuffer()
  stampBytes = new Uint8Array(buf)
  ;(e.target as HTMLInputElement).value = ''
}

async function apply() {
  if (!orig || !stampBytes) { errorMsg.value = '请先选择 PDF 与印章图片'; return }
  busy.value = true
  try {
    const doc = await PDFDocument.load(orig)
    const img = await doc.embedPng(stampBytes)
    const pages = doc.getPages()
    const targets = applyAll.value ? pages : (pages[pageNum.value - 1] ? [pages[pageNum.value - 1]] : [])
    const ratio = img.height / img.width
    for (const page of targets) {
      const { width, height } = page.getSize()
      const w = width * scale.value / 100
      const h = w * ratio
      const pad = width * 0.04
      let x = 0
      let y = 0
      if (position.value === 'center') { x = (width - w) / 2; y = (height - h) / 2 }
      else if (position.value === 'tl') { x = pad; y = height - h - pad }
      else if (position.value === 'tr') { x = width - w - pad; y = height - h - pad }
      else if (position.value === 'bl') { x = pad; y = pad }
      else if (position.value === 'br') { x = width - w - pad; y = pad }
      page.drawImage(img, { x, y, width: w, height: h })
    }
    const b = await doc.save()
    downloadBlob('stamped-' + Date.now() + '.pdf', new Blob([b as unknown as BlobPart], { type: 'application/pdf' }))
  } catch (err) {
    errorMsg.value = '盖章失败：' + (err as Error).message
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
        <button class="tu-btn" :disabled="busy" @click="fileInput?.click()">{{ busy ? '读取中…' : '选择 PDF' }}</button>
      </div>
      <div class="tu-field">
        <label class="tu-label">印章图片（PNG，建议透明背景）</label>
        <input ref="stampInput" type="file" accept="image/png" hidden @change="onStamp" />
        <button class="tu-btn ghost" @click="stampInput?.click()">选择印章</button>
      </div>
      <div class="tu-field">
        <label class="tu-label">位置</label>
        <div class="tu-seg">
          <button v-for="p in (['tl','tr','center','bl','br'] as const)" :key="p" :class="{ 'is-on': position === p }" @click="position = p">{{ { tl:'左上',tr:'右上',center:'居中',bl:'左下',br:'右下' }[p] }}</button>
        </div>
      </div>
      <div class="tu-field"><label class="tu-label">缩放（占页面宽度 {{ scale }}%）</label><input class="tu-range" type="range" min="5" max="100" v-model.number="scale" /></div>
      <div class="tu-field"><label class="tu-check" :class="{ 'is-on': applyAll }"><input type="checkbox" v-model="applyAll" /> 应用于所有页面</label></div>
      <div v-if="!applyAll && pageCount" class="tu-field"><label class="tu-label">指定页码（1–{{ pageCount }}）</label><input class="tu-input tu-inline" type="number" min="1" :max="pageCount" v-model.number="pageNum" /></div>
      <div class="tu-row"><button class="tu-btn" :disabled="busy || !orig || !stampBytes" @click="apply">{{ busy ? '处理中…' : '加盖并下载' }}</button></div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">印章图片不会被上传，仅在本地点阵叠加。</p>
    </div>
    <div>
      <div v-if="pageCount" class="tu-preview">PDF 共 {{ pageCount }} 页{{ applyAll ? '，将处理全部页面' : '，将处理第 ' + pageNum + ' 页' }}</div>
      <div v-else class="tu-preview">选择 PDF 与印章后在此预览说明</div>
    </div>
  </div>
</template>
