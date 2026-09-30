<script setup lang="ts">
/**
 * 图片压缩与格式转换（纯前端实现，canvas 本地处理，批量）
 */
import { computed, ref } from 'vue'
import { fitSize } from '../../core/imageFx'
import { humanSize } from '../../core/download'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, loadImage } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

type OutFmt = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/bmp'

interface Item {
  id: number
  name: string
  src: string
  url: string
  img: HTMLImageElement
  origSize: number
  outSize: number
  outUrl: string
  outBlob: Blob | null
  w: number
  h: number
}

const quality = ref(0.8)
const maxWidth = ref(1920)
const maxHeight = ref(1080)
const fmt = ref<OutFmt>('image/jpeg')
const keepPng = ref(true)
const items = ref<Item[]>([])
const busy = ref(false)
const errorMsg = ref('')

useDirtyFlag(() => items.value.length > 0)
const { saveBlob } = useToolActions()

const EXT: Record<OutFmt, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/bmp': 'bmp'
}

const totalIn = computed(() => items.value.reduce((s, i) => s + i.origSize, 0))
const totalOut = computed(() => items.value.reduce((s, i) => s + i.outSize, 0))
const savedPercent = computed(() => {
  if (!totalIn.value || !totalOut.value) return 0
  return Math.round(((totalIn.value - totalOut.value) / totalIn.value) * 100)
})

let seq = 0

async function onFiles(files: File[]) {
  errorMsg.value = ''
  for (const file of files) {
    try {
      const img = await loadImage(file)
      items.value.push({
        id: ++seq,
        name: file.name,
        src: file.name,
        url: URL.createObjectURL(file),
        img,
        origSize: file.size,
        outSize: 0,
        outUrl: '',
        outBlob: null,
        w: img.naturalWidth,
        h: img.naturalHeight
      })
    } catch {
      errorMsg.value = `${file.name} 不是可解析的图片`
    }
  }
}

function remove(id: number) {
  const i = items.value.findIndex(x => x.id === id)
  if (i < 0) return
  const it = items.value[i]
  URL.revokeObjectURL(it.url)
  if (it.outUrl) URL.revokeObjectURL(it.outUrl)
  items.value.splice(i, 1)
}

function clearAll() {
  items.value.forEach(i => {
    URL.revokeObjectURL(i.url)
    if (i.outUrl) URL.revokeObjectURL(i.outUrl)
  })
  items.value = []
}

async function process() {
  if (!items.value.length) {
    errorMsg.value = '请先选择图片'
    return
  }
  busy.value = true
  errorMsg.value = ''
  for (const it of items.value) {
    const size = fitSize(it.w, it.h, maxWidth.value || undefined, maxHeight.value || undefined)
    const canvas = document.createElement('canvas')
    canvas.width = size.w
    canvas.height = size.h
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    if (fmt.value === 'image/jpeg' || fmt.value === 'image/bmp') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(it.img, 0, 0, size.w, size.h)
    const type: string = keepPng.value && it.name.toLowerCase().endsWith('.png') && fmt.value === 'image/jpeg'
      ? 'image/png'
      : fmt.value
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, type, quality.value))
    if (!blob) {
      errorMsg.value = `${it.name} 编码失败（浏览器可能不支持该格式）`
      continue
    }
    if (it.outUrl) URL.revokeObjectURL(it.outUrl)
    it.outBlob = blob
    it.outSize = blob.size
    it.outUrl = URL.createObjectURL(blob)
  }
  busy.value = false
}

function download(item: Item) {
  if (!item.outBlob) return
  const base = item.name.replace(/\.[^.]+$/, '')
  saveBlob(`${base}.${EXT[fmt.value]}`, item.outBlob)
}

function downloadAll() {
  items.value.filter(i => i.outBlob).forEach((i, idx) => {
    setTimeout(() => download(i), idx * 200)
  })
}
</script>

<template>
  <div class="tu-t5">
    <TuField label="选择图片（可多选，支持拖放）">
      <TuDrop :multiple="true" accept="image/*" hint="点击选择图片，或把图片拖到此处" @files="onFiles" />
    </TuField>

    <div class="tu-toolbar">
      <span class="tu-label">输出格式</span>
      <select v-model="fmt" class="tu-select tu-inline" style="max-width: 130px">
        <option value="image/jpeg">JPG</option>
        <option value="image/png">PNG</option>
        <option value="image/webp">WebP</option>
        <option value="image/bmp">BMP</option>
      </select>
      <span class="tu-label">质量</span>
      <input v-model.number="quality" type="range" min="0.1" max="1" step="0.05" class="tu-range tu-inline" style="max-width: 160px" />
      <span class="tu-hint">{{ Math.round(quality * 100) }}%</span>
    </div>

    <div class="tu-row">
      <span class="tu-label">最大宽度</span>
      <input v-model.number="maxWidth" type="number" min="0" class="tu-input tu-inline" style="max-width: 110px" />
      <span class="tu-label">最大高度</span>
      <input v-model.number="maxHeight" type="number" min="0" class="tu-input tu-inline" style="max-width: 110px" />
      <button type="button" class="tu-check" :class="{ 'is-on': keepPng }" @click="keepPng = !keepPng">
        PNG 转 JPG 时保持透明友好
      </button>
    </div>

    <div class="tu-row">
      <button type="button" class="tu-btn" :disabled="busy || !items.length" @click="process">
        {{ busy ? '处理中…' : '开始处理' }}
      </button>
      <button type="button" class="tu-btn ghost" :disabled="!items.some(i => i.outBlob)" @click="downloadAll">
        全部下载
      </button>
      <button type="button" class="tu-btn ghost" :disabled="!items.length" @click="clearAll">清空列表</button>
    </div>

    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>

    <TuOutput
      title="处理结果"
      :text="items.filter(i => i.outSize).map(i => `${i.name}\t${humanSize(i.origSize)} → ${humanSize(i.outSize)}`).join('\n')"
      filename="compress-report.txt"
      empty="选择图片并点击「开始处理」"
    >
      <div class="tu-stat">
        <span>共 {{ items.length }} 张</span>
        <span>原始合计 {{ humanSize(totalIn) }}</span>
        <span>压缩后 {{ humanSize(totalOut) }}</span>
        <span v-if="savedPercent > 0">节省 {{ savedPercent }}%</span>
      </div>
      <div class="tu-grid">
        <div v-for="i in items" :key="i.id" class="tu-card">
          <div class="tu-preview">
            <img :src="i.outUrl || i.url" :alt="i.name" />
          </div>
          <div class="tu-card-title break">{{ i.name }}</div>
          <div class="tu-hint">
            {{ i.w }}×{{ i.h }} · {{ humanSize(i.origSize) }}
            <template v-if="i.outSize"> → {{ humanSize(i.outSize) }}</template>
          </div>
          <div class="tu-row">
            <button type="button" class="tu-btn ghost" :disabled="!i.outBlob" @click="download(i)">下载</button>
            <button type="button" class="tu-btn ghost" @click="remove(i.id)">移除</button>
          </div>
        </div>
      </div>
    </TuOutput>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>选择或拖入图片后设置目标格式、质量与最大边长，点击「开始处理」。</li>
          <li>尺寸按等比缩放，不会拉伸变形；JPG/BMP 会把透明区域填充为白色。</li>
          <li>全部处理在浏览器本地完成，图片不会上传。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.break { word-break: break-all; }
.tu-preview img { max-height: 160px; }
</style>
