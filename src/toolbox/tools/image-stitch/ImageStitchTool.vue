<script setup lang="ts">
/**
 * 图片长图拼接（本地，零上传）
 * 选择多张本地图片，按统一宽度(竖向)或高度(横向)缩放后拼接为一张 PNG。
 * 全程不联网、不上传。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { downloadBlob, humanSize } from '../../core/download'

interface StitchItem {
  id: number
  file: File
  url: string
  img: HTMLImageElement
  w: number
  h: number
}

const fileInput = ref<HTMLInputElement | null>(null)
const items = ref<StitchItem[]>([])
const direction = ref<'vertical' | 'horizontal'>('vertical')
const gap = ref(0)
const bg = ref('#ffffff')
const busy = ref(false)
const error = ref('')
const previewUrl = ref('')
let seq = 0

function pickFiles() {
  fileInput.value?.click()
}

function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const list = Array.from(input.files || [])
  input.value = ''
  addFiles(list)
}

function onDrop(e: DragEvent) {
  const list = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'))
  if (list.length) addFiles(list)
}

function addFiles(list: File[]) {
  error.value = ''
  for (const file of list) {
    if (!file.type.startsWith('image/')) {
      error.value = `已跳过非图片文件：${file.name}`
      continue
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const it = items.value.find(i => i.url === url)
      if (it) {
        it.w = img.naturalWidth
        it.h = img.naturalHeight
      }
    }
    img.onerror = () => {
      error.value = `图片加载失败：${file.name}`
      URL.revokeObjectURL(url)
    }
    img.src = url
    items.value.push({ id: seq++, file, url, img, w: 0, h: 0 })
  }
}

function removeItem(id: number) {
  const idx = items.value.findIndex(i => i.id === id)
  if (idx >= 0) {
    URL.revokeObjectURL(items.value[idx].url)
    items.value.splice(idx, 1)
  }
}

function moveItem(id: number, delta: number) {
  const idx = items.value.findIndex(i => i.id === id)
  const to = idx + delta
  if (idx < 0 || to < 0 || to >= items.value.length) return
  const arr = items.value
  ;[arr[idx], arr[to]] = [arr[to], arr[idx]]
}

const ready = computed(() => items.value.length >= 2 && items.value.every(i => i.w > 0 && i.h > 0))

async function stitch() {
  error.value = ''
  if (items.value.length < 2) {
    error.value = '请至少选择 2 张图片'
    return
  }
  const imgs = items.value
  if (imgs.some(i => !i.w || !i.h)) {
    error.value = '部分图片尚未加载完成，请稍候'
    return
  }
  busy.value = true
  try {
    const g = Math.max(0, Number(gap.value) || 0)
    let canvasW: number
    let canvasH: number
    let drawX = 0
    let drawY = 0
    if (direction.value === 'vertical') {
      const targetW = Math.max(...imgs.map(i => i.w))
      canvasW = targetW
      canvasH = imgs.reduce((sum, i) => sum + Math.round((i.h * targetW) / i.w), 0) + g * (imgs.length - 1)
      drawX = 0
      drawY = 0
    } else {
      const targetH = Math.max(...imgs.map(i => i.h))
      canvasH = targetH
      canvasW = imgs.reduce((sum, i) => sum + Math.round((i.w * targetH) / i.h), 0) + g * (imgs.length - 1)
      drawX = 0
      drawY = 0
    }

    const cap = 16384
    if (canvasW > cap || canvasH > cap) {
      error.value = `拼接结果尺寸过大（${canvasW}×${canvasH}），部分浏览器可能无法渲染，建议减少图片或缩小单图。`
    }

    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法获取画布上下文')
    ctx.fillStyle = bg.value
    ctx.fillRect(0, 0, canvasW, canvasH)

    for (const i of imgs) {
      let dw: number
      let dh: number
      if (direction.value === 'vertical') {
        dw = canvasW
        dh = Math.round((i.h * canvasW) / i.w)
        ctx.drawImage(i.img, 0, drawY, dw, dh)
        drawY += dh + g
      } else {
        dh = canvasH
        dw = Math.round((i.w * canvasH) / i.h)
        ctx.drawImage(i.img, drawX, 0, dw, dh)
        drawX += dw + g
      }
    }

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('生成图片失败')

    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(blob)
    const name = `stitch-${direction.value}-${Date.now()}.png`
    downloadBlob(name, blob)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function clearAll() {
  for (const i of items.value) URL.revokeObjectURL(i.url)
  items.value = []
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  error.value = ''
}

const totalSize = computed(() => items.value.reduce((s, i) => s + i.file.size, 0))

onBeforeUnmount(() => {
  for (const i of items.value) URL.revokeObjectURL(i.url)
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <div class="tu-t1 image-stitch">
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      class="is-hidden-input"
      @change="onFiles"
    />

    <div class="is-toolbar">
      <button type="button" class="tu-btn" @click="pickFiles">选择图片</button>
      <div class="tu-seg">
        <button type="button" :class="{ 'is-on': direction === 'vertical' }" @click="direction = 'vertical'">竖向长图</button>
        <button type="button" :class="{ 'is-on': direction === 'horizontal' }" @click="direction = 'horizontal'">横向长图</button>
      </div>
      <span class="tu-label">间距</span>
      <input v-model.number="gap" type="number" min="0" max="200" class="tu-input tu-inline" style="max-width: 80px" />
      <span class="tu-label">背景</span>
      <input v-model="bg" type="color" class="is-color" />
      <button type="button" class="tu-btn ghost" :disabled="!items.length" @click="clearAll">清空</button>
    </div>

    <p v-if="error" class="tu-alert">{{ error }}</p>

    <div
      class="is-drop"
      @click="pickFiles"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <span v-if="!items.length">点击选择，或拖入多张图片（至少 2 张）</span>
      <span v-else>已选 {{ items.length }} 张 · 共 {{ humanSize(totalSize) }}（点击继续添加）</span>
    </div>

    <div v-if="items.length" class="is-list">
      <div v-for="(it, idx) in items" :key="it.id" class="is-item">
        <span class="is-index">{{ idx + 1 }}</span>
        <img :src="it.url" class="is-thumb" alt="" />
        <span class="is-meta">{{ it.w }}×{{ it.h }}</span>
        <div class="is-item-actions">
          <button type="button" class="tu-link" :disabled="idx === 0" @click="moveItem(it.id, -1)">↑</button>
          <button type="button" class="tu-link" :disabled="idx === items.length - 1" @click="moveItem(it.id, 1)">↓</button>
          <button type="button" class="tu-link" @click="removeItem(it.id)">删除</button>
        </div>
      </div>
    </div>

    <button type="button" class="tu-btn is-generate" :disabled="!ready || busy" @click="stitch">
      {{ busy ? '生成中…' : '拼接并下载 PNG' }}
    </button>
    <p class="tu-hint">拼接后将自动下载 PNG；竖向模式统一按最大宽度缩放，横向模式统一按最大高度缩放。</p>

    <div v-if="previewUrl" class="tu-preview">
      <img :src="previewUrl" alt="拼接预览" />
    </div>
  </div>
</template>

<style scoped>
.image-stitch { max-width: 720px; }
.is-hidden-input { display: none; }
.is-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.is-color { width: 36px; height: 32px; padding: 0; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: none; cursor: pointer; }
.is-drop {
  padding: 14px;
  text-align: center;
  font-size: 12.5px;
  color: var(--color-text-secondary);
  background: var(--color-bg-input);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.is-drop:hover { border-color: var(--color-primary); color: var(--color-primary); }
.is-list { display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow: auto; }
.is-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.is-index {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  font-size: 12px;
  color: #fff;
  background: var(--color-primary);
  border-radius: var(--radius-full);
}
.is-thumb { width: 48px; height: 48px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--color-border); flex: 0 0 auto; }
.is-meta { font-size: 11.5px; color: var(--color-text-muted); font-family: var(--font-family-mono); }
.is-item-actions { margin-left: auto; display: flex; gap: 4px; }
.is-generate { align-self: flex-start; }
</style>
