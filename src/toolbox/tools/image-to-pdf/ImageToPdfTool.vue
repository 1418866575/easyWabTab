<script setup lang="ts">
/**
 * 图片转 PDF（纯前端，pdf-lib）
 * 多选图片，按序每图生成一页（页面尺寸贴合图片），输出单个 PDF。
 */
import { ref } from 'vue'
import { PDFDocument } from 'pdf-lib'
import { downloadBlob } from '../../core/download'

interface ImgItem { id: number; name: string; url: string; img: HTMLImageElement; w: number; h: number }
const fileInput = ref<HTMLInputElement | null>(null)
const items = ref<ImgItem[]>([])
const busy = ref(false)
const errorMsg = ref('')
let seq = 0

function onFiles(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  errorMsg.value = ''
  files.forEach(f => {
    const im = new Image()
    const url = URL.createObjectURL(f)
    im.onload = () => items.value.push({ id: ++seq, name: f.name, url, img: im, w: im.naturalWidth, h: im.naturalHeight })
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

async function build() {
  if (!items.value.length) { errorMsg.value = '请先选择图片'; return }
  busy.value = true
  errorMsg.value = ''
  try {
    const pdf = await PDFDocument.create()
    for (const it of items.value) {
      const bytes = await fetch(it.url).then(r => r.arrayBuffer())
      let embed
      const lower = it.name.toLowerCase()
      if (lower.endsWith('.png')) embed = await pdf.embedPng(bytes)
      else embed = await pdf.embedJpg(bytes)
      const page = pdf.addPage([it.w, it.h])
      page.drawImage(embed, { x: 0, y: 0, width: it.w, height: it.h })
    }
    const blob = new Blob([(await pdf.save()) as unknown as BlobPart], { type: 'application/pdf' })
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
      <div class="tu-row">
        <button class="tu-btn" :disabled="busy || !items.length" @click="build">{{ busy ? '生成中…' : '生成 PDF' }}</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">支持 JPG/PNG；每图一页，页面尺寸贴合图片原始像素；全程本地处理。</p>
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
