<script setup lang="ts">
/**
 * 图片转 PDF（纯前端，pdf-lib）
 * 多选本地图片，按序每图生成一页：
 * - A4 适配：等比缩放居中放入 A4（可选边距），适合打印归档；
 * - 原始尺寸：1px = 1pt，保留图片原生分辨率。
 * 非 PNG/JPG 格式经 canvas 绘制为 PNG 后嵌入。
 */
import { ref } from 'vue'
import { PDFDocument, PageSizes } from 'pdf-lib'
import { downloadBlob } from '../../core/download'

interface ImgItem {
  id: number
  name: string
  url: string
  img: HTMLImageElement
  w: number
  h: number
}

const fileInput = ref<HTMLInputElement | null>(null)
const items = ref<ImgItem[]>([])
const busy = ref(false)
const errorMsg = ref('')
const mode = ref<'a4' | 'original'>('a4')
const marginMm = ref(0)
let seq = 0

const MM2PT = 2.834645669

function onFiles(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  errorMsg.value = ''
  files.forEach(f => {
    const im = new Image()
    const url = URL.createObjectURL(f)
    im.onload = () =>
      items.value.push({ id: ++seq, name: f.name, url, img: im, w: im.naturalWidth, h: im.naturalHeight })
    im.onerror = () => (errorMsg.value = `${f.name} 解析失败`)
    im.src = url
  })
  ;(e.target as HTMLInputElement).value = ''
}

function move(i: number, d: number) {
  const j = i + d
  if (j < 0 || j >= items.value.length) return
  const arr = items.value
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}
function remove(id: number) {
  const i = items.value.findIndex(x => x.id === id)
  if (i < 0) return
  URL.revokeObjectURL(items.value[i].url)
  items.value.splice(i, 1)
}

async function pngBytesFromImg(img: HTMLImageElement): Promise<Uint8Array> {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0,0)
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'))
  if (!blob) throw new Error('图片转换失败')
  return new Uint8Array(await blob.arrayBuffer())
}

async function build() {
  if (!items.value.length) {
    errorMsg.value = '请先选择图片'
    return
  }
  busy.value = true
  errorMsg.value = ''
  try {
    const pdf = await PDFDocument.create()
    const mPt = marginMm.value * MM2PT
    for (const it of items.value) {
      const lower = it.name.toLowerCase()
      let embed
      if (lower.endsWith('.png')) {
        embed = await pdf.embedPng(await (await fetch(it.url)).arrayBuffer())
      } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        embed = await pdf.embedJpg(await (await fetch(it.url)).arrayBuffer())
      } else {
        embed = await pdf.embedPng(await pngBytesFromImg(it.img))
      }
      let pageW: number
      let pageH: number
      let w: number
      let h: number
      let x: number
      let y: number
      if (mode.value === 'a4') {
        pageW = PageSizes.A4[0]
        pageH = PageSizes.A4[1]
        const availW = pageW - 2 * mPt
        const availH = pageH - 2 * mPt
        const scale = Math.min(availW / it.w, availH / it.h)
        w = it.w * scale
        h = it.h * scale
        x = (pageW - w) / 2
        y = (pageH - h) / 2
      } else {
        pageW = it.w
        pageH = it.h
        w = it.w
        h = it.h
        x = 0
        y = 0
      }
      const page = pdf.addPage([pageW, pageH])
      page.drawImage(embed, { x, y, width: w, height: h })
    }
    const blob = new Blob([await pdf.save()], { type: 'application/pdf' })
    downloadBlob(`images-${items.value.length}.pdf`, blob)
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
        <label class="tu-label">选择图片（可多选，按选择顺序入页）</label>
        <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFiles" />
        <button class="tu-btn" @click="fileInput?.click()">选择图片</button>
      </div>
      <div class="tu-field">
        <label class="tu-label">页面尺寸</label>
        <div class="tu-seg">
          <button :class="{ 'is-on': mode === 'a4' }" @click="mode = 'a4'">适配 A4（居中）</button>
          <button :class="{ 'is-on': mode === 'original' }" @click="mode = 'original'">原始像素</button>
        </div>
      </div>
      <div v-if="mode === 'a4'" class="tu-row">
        <span class="tu-label">边距</span>
        <input v-model.number="marginMm" type="number" min="0" max="50" class="tu-input tu-inline" style="max-width: 90px" />
        <span class="tu-label">mm</span>
      </div>
      <div class="tu-row">
        <button class="tu-btn" :disabled="busy || !items.length" @click="build">{{ busy ? '生成中…' : '生成 PDF' }}</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">
        支持 JPG/PNG；其他格式（WebP/BMP/GIF 等）自动转 PNG 嵌入。适配 A4 时等比缩放居中，不改变宽高比；原始像素模式 1px=1pt。
      </p>
    </div>
    <div>
      <div v-if="items.length" class="tu-grid">
        <div v-for="(it, i) in items" :key="it.id" class="tu-card">
          <div class="tu-preview"><img :src="it.url" :alt="it.name" /></div>
          <div class="tu-card-title break">{{ i + 1 }}. {{ it.name }}</div>
          <div class="tu-row">
            <button class="tu-btn ghost" :disabled="i === 0" @click="move(i, -1)">↑</button>
            <button class="tu-btn ghost" :disabled="i === items.length - 1" @click="move(i, 1)">↓</button>
            <button class="tu-btn ghost" @click="remove(it.id)">移除</button>
          </div>
        </div>
      </div>
      <div v-else class="tu-preview">图片列表（先选图）</div>
    </div>
  </div>
</template>

<style scoped>
.break { word-break: break-all; }
.tu-preview img { max-height: 140px; }
</style>
