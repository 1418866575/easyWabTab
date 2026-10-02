<script setup lang="ts">
/**
 * 图片尺寸调整（纯前端，canvas 本地处理）
 * 上传图片后调整宽高，支持等比锁定，导出 PNG/JPG/WebP。
 */
import { ref, computed, watch } from 'vue'
import { downloadBlob } from '../../core/download'

type Fmt = 'image/png' | 'image/jpeg' | 'image/webp'
const EXT: Record<Fmt, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

const fileInput = ref<HTMLInputElement | null>(null)
const img = ref<HTMLImageElement | null>(null)
const origW = ref(0)
const origH = ref(0)
const w = ref(0)
const h = ref(0)
const lock = ref(true)
const fmt = ref<Fmt>('image/png')
const quality = ref(0.92)
const busy = ref(false)
const errorMsg = ref('')
const outUrl = ref('')
const outBlob = ref<Blob | null>(null)
const outSize = ref(0)

const ratio = computed(() => (origW.value && origH.value ? origH.value / origW.value : 1))

function loadFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  errorMsg.value = ''
  const im = new Image()
  im.onload = () => {
    img.value = im
    origW.value = im.naturalWidth
    origH.value = im.naturalHeight
    w.value = im.naturalWidth
    h.value = im.naturalHeight
    outUrl.value = ''
    outBlob.value = null
  }
  im.onerror = () => (errorMsg.value = '图片解析失败')
  im.src = URL.createObjectURL(f)
}

watch(w, (v) => { if (lock.value && origW.value) h.value = Math.round(v * ratio.value) })
watch(h, (v) => { if (lock.value && origH.value) w.value = Math.round(v / ratio.value) })

function pick(e: Event) { const t = e.target as HTMLInputElement; if (t.checked) { w.value = origW.value; h.value = origH.value } }

async function process() {
  if (!img.value) { errorMsg.value = '请先选择图片'; return }
  const tw = Math.max(1, Math.round(w.value))
  const th = Math.max(1, Math.round(h.value))
  busy.value = true
  errorMsg.value = ''
  try {
    const canvas = document.createElement('canvas')
    canvas.width = tw
    canvas.height = th
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 不可用')
    if (fmt.value !== 'image/png') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th) }
    ctx.drawImage(img.value, 0, 0, tw, th)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, fmt.value, quality.value))
    if (!blob) throw new Error('编码失败，浏览器可能不支持该格式')
    if (outUrl.value) URL.revokeObjectURL(outUrl.value)
    outBlob.value = blob
    outSize.value = blob.size
    outUrl.value = URL.createObjectURL(blob)
  } catch (err) {
    errorMsg.value = (err as Error).message
  } finally {
    busy.value = false
  }
}

function download() {
  if (!outBlob.value) return
  const name = (img.value?.src.split('/').pop() || 'image').replace(/\.[^.]+$/, '')
  downloadBlob(`${name}-${w.value}x${h.value}.${EXT[fmt.value]}`, outBlob.value)
}
</script>

<template>
  <div class="tu-t4">
    <div>
      <div class="tu-field">
        <label class="tu-label">选择图片</label>
        <input ref="fileInput" type="file" accept="image/*" hidden @change="loadFile" />
        <button class="tu-btn" @click="fileInput?.click()">选择图片</button>
      </div>
      <template v-if="img">
        <div class="tu-field">
          <label class="tu-label">宽度 (px)</label>
          <input v-model.number="w" type="number" min="1" class="tu-input" />
        </div>
        <div class="tu-field">
          <label class="tu-label">高度 (px)</label>
          <input v-model.number="h" type="number" min="1" class="tu-input" />
        </div>
        <div class="tu-field">
          <label class="tu-check" :class="{ 'is-on': lock }">
            <input type="checkbox" v-model="lock" @change="pick" /> 锁定宽高比
          </label>
        </div>
        <div class="tu-field">
          <label class="tu-label">输出格式</label>
          <select v-model="fmt" class="tu-select">
            <option value="image/png">PNG（支持透明）</option>
            <option value="image/jpeg">JPG</option>
            <option value="image/webp">WebP</option>
          </select>
        </div>
        <div v-if="fmt !== 'image/png'" class="tu-field">
          <label class="tu-label">质量 {{ Math.round(quality * 100) }}%</label>
          <input v-model.number="quality" type="range" min="0.1" max="1" step="0.02" class="tu-range" />
        </div>
        <div class="tu-row">
          <button class="tu-btn" :disabled="busy" @click="process">{{ busy ? '处理中…' : '调整并预览' }}</button>
        </div>
        <p class="tu-hint">原始 {{ origW }}×{{ origH }}，等比缩放不会变形。</p>
      </template>
    </div>
    <div>
      <div v-if="errorMsg" class="tu-alert">{{ errorMsg }}</div>
      <div v-if="outUrl" class="tu-preview tu-checker">
        <img :src="outUrl" alt="预览" />
      </div>
      <div v-else class="tu-preview">预览区（先选图并调整）</div>
      <div v-if="outBlob" class="tu-row" style="margin-top:12px">
        <span class="tu-hint">导出大小 {{ Math.round(outSize / 1024) }} KB</span>
        <button class="tu-btn" @click="download">下载</button>
      </div>
      <p class="tu-hint">全程在本机处理，图片不会上传。</p>
    </div>
  </div>
</template>
