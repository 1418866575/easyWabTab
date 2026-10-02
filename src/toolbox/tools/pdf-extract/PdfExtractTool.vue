<script setup lang="ts">
/**
 * PDF 提取文字 / 转图（pdfjs-dist，本地）
 * 文字：逐页 getTextContent 拼接；图片：逐页渲染为 PNG。
 */
import { ref } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { downloadBlob, copyText } from '../../core/download'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

type Mode = 'text' | 'image'
const fileInput = ref<HTMLInputElement | null>(null)
const mode = ref<Mode>('text')
const busy = ref(false)
const errorMsg = ref('')
const pageCount = ref(0)
const text = ref('')
const pages = ref<{ n: number; url: string }[]>([])
const baseName = ref('doc')

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  errorMsg.value = ''
  text.value = ''
  pages.value = []
  baseName.value = f.name.replace(/\.pdf$/i, '')
  busy.value = true
  try {
    const buf = new Uint8Array(await f.arrayBuffer())
    const doc = await pdfjsLib.getDocument({ data: buf }).promise
    pageCount.value = doc.numPages
    if (mode.value === 'text') {
      const parts: string[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        const p = await doc.getPage(i)
        const tc = await p.getTextContent()
        parts.push(`—— 第 ${i} 页 ——\n` + tc.items.map((it: any) => it.str).join(' '))
      }
      text.value = parts.join('\n\n')
    } else {
      for (let i = 1; i <= doc.numPages; i++) {
        const p = await doc.getPage(i)
        const vp = await p.getViewport({ scale: 1.5 })
        const canvas = document.createElement('canvas')
        canvas.width = vp.width
        canvas.height = vp.height
        const ctx = canvas.getContext('2d')!
        await p.render({ canvasContext: ctx, viewport: vp }).promise
        pages.value.push({ n: i, url: canvas.toDataURL('image/png') })
      }
    }
  } catch (err) {
    errorMsg.value = '解析失败：' + (err as Error).message
  } finally {
    busy.value = false
  }
}

function downloadImg(url: string, n: number) {
  downloadBlob(`${baseName.value}-p${n}.png`, dataUrlToBlob(url))
}
function dataUrlToBlob(url: string): Blob {
  const [head, b64] = url.split(',')
  const mime = head.match(/:(.*?);/)?.[1] || 'image/png'
  const bin = atob(b64)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return new Blob([u], { type: mime })
}
async function copyTextAll() { if (text.value) await copyText(text.value) }
function downloadTextAll() { if (text.value) downloadBlob(`${baseName.value}-text.txt`, new Blob([text.value], { type: 'text/plain;charset=utf-8' })) }
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-field">
        <label class="tu-label">选择 PDF</label>
        <input ref="fileInput" type="file" accept="application/pdf" hidden @change="onFile" />
        <button class="tu-btn" @click="fileInput?.click()">选择 PDF</button>
      </div>
      <div class="tu-field">
        <label class="tu-label">提取方式</label>
        <div class="tu-seg">
          <button :class="{ 'is-on': mode === 'text' }" @click="mode = 'text'; pageCount = 0; text = ''; pages = []">提取文字</button>
          <button :class="{ 'is-on': mode === 'image' }" @click="mode = 'image'; pageCount = 0; text = ''; pages = []">页面转图片</button>
        </div>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">文字提取基于 pdfjs 文本层；扫描件（无文本层）可能提取不到内容。转图按 1.5 倍渲染。</p>
    </div>
    <div>
      <div v-if="mode === 'text'">
        <div v-if="text" class="tu-row">
          <button class="tu-btn ghost" @click="copyTextAll">复制</button>
          <button class="tu-btn ghost" @click="downloadTextAll">下载 TXT</button>
        </div>
        <textarea v-if="text" class="tu-textarea" :value="text" readonly rows="16" />
        <div v-else-if="!busy" class="tu-preview">文字结果（先选 PDF）</div>
      </div>
      <div v-else>
        <div v-if="pages.length" class="tu-grid">
          <div v-for="p in pages" :key="p.n" class="tu-card">
            <div class="tu-preview"><img :src="p.url" :alt="`第${p.n}页`" /></div>
            <div class="tu-card-title">第 {{ p.n }} 页</div>
            <div class="tu-row"><button class="tu-btn ghost" @click="downloadImg(p.url, p.n)">下载 PNG</button></div>
          </div>
        </div>
        <div v-else-if="!busy" class="tu-preview">图片结果（先选 PDF）</div>
      </div>
      <p v-if="busy" class="tu-hint">处理中（{{ pageCount ? pageCount + ' 页' : '解析中' }}）…</p>
    </div>
  </div>
</template>

<style scoped>
.tu-preview img { max-height: 200px; }
</style>
