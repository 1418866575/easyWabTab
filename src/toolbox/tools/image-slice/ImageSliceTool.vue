<script setup lang="ts">
/**
 * 图片切图工具（按透明像素自动检测分割雪碧图）
 */
import { computed, ref, watch } from 'vue'
import { detectSpriteRects, type PixelData, type Rect } from '../../core/imageFx'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, loadImage } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

interface Piece {
  id: number
  rect: Rect
  url: string
  blob: Blob | null
  size: number
}

const fileName = ref('')
const src = ref<PixelData | null>(null)
const imgEl = ref<HTMLImageElement | null>(null)
const minGap = ref(2)
const minSize = ref(4)
const rects = ref<Rect[]>([])
const pieces = ref<Piece[]>([])
const errorMsg = ref('')

useDirtyFlag(() => !!src.value)
const { saveBlob } = useToolActions()

const totalSize = computed(() => pieces.value.reduce((s, p) => s + p.size, 0))

async function onFiles(files: File[]) {
  errorMsg.value = ''
  try {
    const img = await loadImage(files[0])
    fileName.value = files[0].name
    imgEl.value = img
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height)
    src.value = { data: d.data, width: canvas.width, height: canvas.height }
    detect()
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

function detect() {
  if (!src.value) return
  rects.value = detectSpriteRects(src.value, { minGap: minGap.value, minSize: minSize.value })
  pieces.value = []
}

function split() {
  if (!imgEl.value || !rects.value.length) {
    errorMsg.value = '未检测到可切分的图块'
    return
  }
  errorMsg.value = ''
  pieces.value = []
  rects.value.forEach((r, i) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, r.w)
    canvas.height = Math.max(1, r.h)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(imgEl.value as HTMLImageElement, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height)
    pieces.value.push({ id: i + 1, rect: r, url: canvas.toDataURL('image/png'), blob: null, size: 0 })
    canvas.toBlob(b => {
      const p = pieces.value.find(x => x.id === i + 1)
      if (p && b) {
        p.blob = b
        p.size = b.size
      }
    }, 'image/png')
  })
}

function download(p: Piece) {
  if (!p.blob) return
  const base = (fileName.value || 'sprite').replace(/\.[^.]+$/, '')
  saveBlob(`${base}-${p.id}.png`, p.blob)
}

function downloadAll() {
  pieces.value.forEach((p, i) => setTimeout(() => download(p), i * 180))
}

const coordText = computed(() =>
  rects.value.map((r, i) => `#${i + 1}\tx=${r.x}\ty=${r.y}\tw=${r.w}\th=${r.h}`).join('\n')
)

watch([minGap, minSize], detect)
</script>

<template>
  <div class="tu-t5">
    <TuField label="选择雪碧图（背景需为透明）">
      <TuDrop accept="image/*" hint="点击选择图片，或把图片拖到此处" @files="onFiles" />
    </TuField>

    <div class="tu-row">
      <span class="tu-label">灵敏度（最小间隙）</span>
      <input v-model.number="minGap" type="range" min="1" max="20" class="tu-range tu-inline" style="max-width: 160px" />
      <span class="tu-hint">{{ minGap }} px</span>
      <span class="tu-label">最小图块</span>
      <input v-model.number="minSize" type="number" min="1" class="tu-input tu-inline" style="max-width: 90px" />
    </div>

    <div class="tu-row">
      <button type="button" class="tu-btn" :disabled="!rects.length" @click="split">切分并生成</button>
      <button type="button" class="tu-btn ghost" :disabled="!pieces.length" @click="downloadAll">全部下载</button>
    </div>

    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>

    <TuOutput title="切图结果" :text="coordText" filename="slices.txt" empty="选择图片后自动检测图块">
      <div class="tu-stat">
        <span>检测到 {{ rects.length }} 块</span>
        <span v-if="pieces.length">已生成 {{ pieces.length }} 张</span>
        <span v-if="totalSize">合计 {{ (totalSize / 1024).toFixed(1) }} KB</span>
      </div>
      <div class="tu-grid">
        <div v-for="p in pieces" :key="p.id" class="tu-card">
          <div class="tu-preview tu-checker"><img :src="p.url" :alt="`图块 ${p.id}`" /></div>
          <div class="tu-card-title">#{{ p.id }} · {{ p.rect.w }}×{{ p.rect.h }}</div>
          <div class="tu-hint">x={{ p.rect.x }} y={{ p.rect.y }}</div>
          <div class="tu-row">
            <button type="button" class="tu-btn ghost" @click="download(p)">下载</button>
          </div>
        </div>
      </div>
      <p v-if="!pieces.length && rects.length" class="tu-out-empty">点击「切分并生成」输出各图块</p>
    </TuOutput>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>导入透明背景的雪碧图，系统会按透明行/列自动切分出各图块。</li>
          <li>「最小间隙」越大越不容易被细节误切；「最小图块」过滤掉过小的噪点区域。</li>
          <li>可逐张或批量下载，坐标信息也能一并复制。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-preview img { max-height: 120px; }
</style>
