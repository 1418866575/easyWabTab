<script setup lang="ts">
/**
 * 图片截图工具（矩形框选，多次截图，比例锁定）
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, loadImage } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Shot {
  id: number
  rect: Rect
  url: string
  blob: Blob | null
  size: number
}

const fileName = ref('')
const img = ref<HTMLImageElement | null>(null)
const imgUrl = ref('')
const scale = ref(1)
const rects = ref<Rect[]>([])
const draft = ref<Rect | null>(null)
const drawing = ref(false)
const start = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const ratioLock = ref('')
const shots = ref<Shot[]>([])
const errorMsg = ref('')

useDirtyFlag(() => rects.value.length > 0)
const { saveBlob } = useToolActions()

const RATIOS = [
  { text: '自由', value: '' },
  { text: '1:1', value: '1:1' },
  { text: '4:3', value: '4:3' },
  { text: '3:2', value: '3:2' },
  { text: '16:9', value: '16:9' }
]

const totalSize = computed(() => shots.value.reduce((s, x) => s + x.size, 0))

async function onFiles(files: File[]) {
  errorMsg.value = ''
  try {
    const el = await loadImage(files[0])
    fileName.value = files[0].name
    img.value = el
    imgUrl.value = URL.createObjectURL(files[0])
    rects.value = []
    shots.value = []
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

function onLoad(e: Event) {
  const el = e.target as HTMLImageElement
  const box = el.parentElement
  if (!box) return
  const w = el.naturalWidth
  const maxW = box.clientWidth || w
  scale.value = w > maxW ? maxW / w : 1
}

function pointFrom(e: MouseEvent | TouchEvent): { x: number; y: number } {
  const el = (e.currentTarget as HTMLElement) || null
  const box = el?.getBoundingClientRect()
  const src = 'touches' in e ? e.touches[0] : e
  return {
    x: (src.clientX - (box?.left || 0)) / scale.value,
    y: (src.clientY - (box?.top || 0)) / scale.value
  }
}

function begin(e: MouseEvent | TouchEvent) {
  if (!img.value) return
  drawing.value = true
  const p = pointFrom(e)
  start.value = p
  draft.value = { x: p.x, y: p.y, w: 0, h: 0 }
}

function move(e: MouseEvent | TouchEvent) {
  if (!drawing.value || !draft.value) return
  const p = pointFrom(e)
  let w = p.x - start.value.x
  let h = p.y - start.value.y
  if (ratioLock.value) {
    const [rw, rh] = ratioLock.value.split(':').map(Number)
    const r = rw / rh
    if (Math.abs(w) / r > Math.abs(h)) h = (Math.abs(w) / r) * Math.sign(h || 1)
    else w = Math.abs(h) * r * Math.sign(w || 1)
  }
  draft.value = {
    x: Math.min(start.value.x, start.value.x + w),
    y: Math.min(start.value.y, start.value.y + h),
    w: Math.abs(w),
    h: Math.abs(h)
  }
}

function end() {
  if (!drawing.value || !draft.value) return
  drawing.value = false
  if (draft.value.w > 4 && draft.value.h > 4) rects.value.push({ ...draft.value })
  draft.value = null
}

function clearRects() {
  rects.value = []
  shots.value = []
}

async function capture() {
  if (!img.value || !rects.value.length) {
    errorMsg.value = '请先框选至少一个区域'
    return
  }
  errorMsg.value = ''
  shots.value = []
  let idx = 0
  for (const r of rects.value) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(r.w))
    canvas.height = Math.max(1, Math.round(r.h))
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    ctx.drawImage(img.value, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
    idx++
    shots.value.push({
      id: idx,
      rect: r,
      url: canvas.toDataURL('image/png'),
      blob,
      size: blob ? blob.size : 0
    })
  }
}

function download(shot: Shot) {
  if (!shot.blob) return
  const base = (fileName.value || 'image').replace(/\.[^.]+$/, '')
  saveBlob(`${base}-crop-${shot.id}.png`, shot.blob)
}

function downloadAll() {
  shots.value.forEach((s, i) => setTimeout(() => download(s), i * 200))
}

const coordText = computed(() =>
  rects.value.map((r, i) => `#${i + 1}: x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.w)} h=${Math.round(r.h)}`).join('\n')
)

onBeforeUnmount(() => {
  if (imgUrl.value) URL.revokeObjectURL(imgUrl.value)
})
</script>

<template>
  <div class="tu-t5">
    <TuField label="选择图片">
      <TuDrop accept="image/*" hint="点击选择图片，或把图片拖到此处" @files="onFiles" />
    </TuField>

    <div class="tu-toolbar">
      <span class="tu-label">比例锁定</span>
      <button
        v-for="r in RATIOS"
        :key="r.text"
        type="button"
        class="tu-check"
        :class="{ 'is-on': ratioLock === r.value }"
        @click="ratioLock = r.value"
      >{{ r.text }}</button>
      <span class="tu-spacer" />
      <button type="button" class="tu-btn" :disabled="!rects.length" @click="capture">执行截图</button>
      <button type="button" class="tu-btn ghost" :disabled="!rects.length" @click="clearRects">清除选区</button>
    </div>

    <div class="tu-canvas-box crop-box" @mousedown="begin" @mousemove="move" @mouseup="end" @mouseleave="end">
      <!-- img 可能为 null（未加载完成），用三元兜底避免 style.width 变成 null -->
      <img v-if="imgUrl" :src="imgUrl" alt="原图" :style="{ width: img ? img.naturalWidth * scale + 'px' : 'auto' }" @load="onLoad" />
      <p v-else class="tu-out-empty">选择图片后，在图上按住拖动即可框选</p>
      <div
        v-for="(r, i) in rects"
        :key="'r' + i"
        class="crop-rect"
        :style="{ left: r.x * scale + 'px', top: r.y * scale + 'px', width: r.w * scale + 'px', height: r.h * scale + 'px' }"
      >
        <span class="crop-tag">{{ i + 1 }}</span>
      </div>
      <div
        v-if="draft"
        class="crop-rect is-draft"
        :style="{ left: draft.x * scale + 'px', top: draft.y * scale + 'px', width: draft.w * scale + 'px', height: draft.h * scale + 'px' }"
      />
    </div>

    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>

    <TuOutput
      title="截图结果"
      :text="coordText"
      filename="crop-coords.txt"
      empty="框选区域并点击「执行截图」"
    >
      <template #actions>
        <button type="button" class="tu-btn ghost" :disabled="!shots.length" @click="downloadAll">全部下载</button>
      </template>
      <div class="tu-stat">
        <span>选区 {{ rects.length }} 个</span>
        <span>已生成 {{ shots.length }} 张</span>
        <span v-if="totalSize">合计 {{ (totalSize / 1024).toFixed(1) }} KB</span>
      </div>
      <div class="tu-grid">
        <div v-for="s in shots" :key="s.id" class="tu-card">
          <div class="tu-preview"><img :src="s.url" :alt="`截图 ${s.id}`" /></div>
          <div class="tu-card-title">
            #{{ s.id }} · {{ Math.round(s.rect.w) }}×{{ Math.round(s.rect.h) }}
          </div>
          <div class="tu-hint">x={{ Math.round(s.rect.x) }} y={{ Math.round(s.rect.y) }}</div>
          <div class="tu-row">
            <button type="button" class="tu-btn ghost" @click="download(s)">下载</button>
          </div>
        </div>
      </div>
    </TuOutput>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>在图片上按住鼠标拖动即可框选，可连续框选多个区域。</li>
          <li>可锁定常见比例；选区编号与原始坐标会一并导出，便于程序化处理。</li>
          <li>截图按原图像素导出，不受预览缩放影响。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.crop-box { position: relative; user-select: none; touch-action: none; min-height: 160px; }
.crop-box img { display: block; }
.crop-rect {
  position: absolute;
  border: 2px solid var(--color-primary);
  background: rgba(59, 130, 246, 0.15);
  pointer-events: none;
}
.crop-rect.is-draft { border-style: dashed; }
.crop-tag {
  position: absolute;
  top: -18px;
  left: 0;
  font-size: 11px;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--color-primary);
  color: #fff;
}
</style>
