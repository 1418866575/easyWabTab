<script setup lang="ts">
/**
 * 九宫格切图：按行列切分原图，单格下载或打包 ZIP
 */
import { computed, ref, watch } from 'vue'
import JSZip from 'jszip'
import { MAX_CELL, sliceName, sliceRects, type Rect } from './nineGridCore'
import { loadImage } from '../../composables/useToolActions'
import { downloadBlob } from '../../core/download'
import { useToast } from '@/composables/useToast'
import TuDrop from '../../components/tool/TuDrop.vue'

const toast = useToast()

const img = ref<HTMLImageElement | null>(null)
const fileName = ref('')
const rows = ref(3)
const cols = ref(3)
const working = ref(false)
const thumbs = ref<string[]>([])

const rects = computed<Rect[]>(() =>
  img.value ? sliceRects(img.value.naturalWidth, img.value.naturalHeight, rows.value, cols.value) : []
)
const tooBig = computed(() => rects.value.some((r) => r.width > MAX_CELL || r.height > MAX_CELL))
const isJpeg = computed(() => /jpe?g/i.test(fileName.value))
const ext = computed(() => (isJpeg.value ? 'jpg' : 'png'))
const mime = computed(() => (isJpeg.value ? 'image/jpeg' : 'image/png'))

async function onFiles(files: File[]) {
  const f = files[0]
  if (!f) return
  try {
    img.value = await loadImage(f)
    fileName.value = f.name
  } catch {
    toast.error('图片加载失败')
  }
}

function crop(rect: Rect): Promise<Blob | null> {
  return new Promise((resolve) => {
    const source = img.value
    if (!source) {
      resolve(null)
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = rect.width
    canvas.height = rect.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      resolve(null)
      return
    }
    ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
    canvas.toBlob((b) => resolve(b), mime.value, 0.92)
  })
}

/** 缩略图：等比缩到最长边 120px，只用于预览 */
function buildThumbs() {
  const source = img.value
  if (!source) {
    thumbs.value = []
    return
  }
  thumbs.value = rects.value.map((r) => {
    const scale = Math.min(1, 120 / Math.max(r.width, r.height))
    const w = Math.max(1, Math.round(r.width * scale))
    const h = Math.max(1, Math.round(r.height * scale))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (ctx) ctx.drawImage(source, r.x, r.y, r.width, r.height, 0, 0, w, h)
    return c.toDataURL('image/png')
  })
}

watch([rects, img], buildThumbs, { immediate: true })

async function downloadOne(i: number) {
  const blob = await crop(rects.value[i])
  if (blob) downloadBlob(sliceName(i, rects.value.length, ext.value), blob)
  else toast.error('切图失败')
}

async function downloadAll() {
  working.value = true
  try {
    const zip = new JSZip()
    for (let i = 0; i < rects.value.length; i++) {
      const blob = await crop(rects.value[i])
      if (blob) zip.file(sliceName(i, rects.value.length, ext.value), blob)
    }
    downloadBlob(`slices-${rows.value}x${cols.value}.zip`, await zip.generateAsync({ type: 'blob' }))
  } catch {
    toast.error('打包失败')
  }
  working.value = false
}
</script>

<template>
  <div class="tu-t1">
    <TuDrop accept="image/*" hint="选择一张图片开始切图" button-text="选择图片" @files="onFiles" />

    <template v-if="img">
      <div class="tu-row">
        <label class="tu-label ng-inline">行数 {{ rows }}</label>
        <input v-model.number="rows" type="range" class="tu-range ng-range" min="1" max="6" />
        <label class="tu-label ng-inline">列数 {{ cols }}</label>
        <input v-model.number="cols" type="range" class="tu-range ng-range" min="1" max="6" />
        <span class="ng-spacer"></span>
        <button type="button" class="tu-btn" :disabled="working" @click="downloadAll">
          {{ working ? '打包中…' : `打包下载 ${rows * cols} 张` }}
        </button>
      </div>

      <p class="tu-hint">
        {{ fileName }} · 原图 {{ img.naturalWidth }} × {{ img.naturalHeight }} · 单格约
        {{ rects[0]?.width }} × {{ rects[0]?.height }}
      </p>
      <p v-if="tooBig" class="tu-alert">单格尺寸超过 {{ MAX_CELL }}px，浏览器可能裁剪失败，请减少行列数。</p>

      <div class="tu-grid">
        <div v-for="(r, i) in rects" :key="i" class="tu-card ng-cell">
          <div class="ng-thumb-box">
            <img v-if="thumbs[i]" :src="thumbs[i]" alt="" class="ng-thumb" />
          </div>
          <div class="ng-meta">{{ r.width }} × {{ r.height }}</div>
          <button type="button" class="tu-btn ghost ng-btn" @click="downloadOne(i)">下载 #{{ i + 1 }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ng-inline { margin-bottom: 0; }
.ng-range { width: 130px; }
.ng-spacer { flex: 1; }
.ng-cell { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ng-thumb-box {
  display: grid;
  place-items: center;
  width: 100%;
  height: 120px;
  background: var(--color-bg-input);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.ng-thumb { max-width: 100%; max-height: 120px; display: block; }
.ng-meta { font-size: 11.5px; color: var(--color-text-muted); font-family: var(--font-family-mono); }
.ng-btn {height: 36px;
  padding: 0 12px;
  font-size: 12px;}
</style>
