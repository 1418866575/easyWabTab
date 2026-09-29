<script setup lang="ts">
/**
 * Favicon 生成器（本地生成全套尺寸 PNG / ICO / manifest / HTML 片段）
 */
import { ref } from 'vue'
import { buildHtmlLinks, buildIco, buildManifest, FAVICON_SIZES, type IcoImage } from '../../core/ico'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, loadImage } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

const appName = ref('我的应用')
const sizes = ref<number[]>([16, 32, 48, 180, 192, 512])
const bg = ref('#ffffff')
const pad = ref(8)
const round = ref(true)
const fileName = ref('')
const sourceImg = ref<HTMLImageElement | null>(null)
const previewUrl = ref('')
const icoUrl = ref('')
const icoBlob = ref<Blob | null>(null)
const pngs = ref<{ size: number; url: string }[]>([])
const errorMsg = ref('')
const manifest = ref('')
const htmlLinks = ref('')

useDirtyFlag(() => !!fileName.value)
const { copy, saveBlob, save } = useToolActions()

const ALL_SIZES = FAVICON_SIZES

function toggleSize(s: number) {
  const i = sizes.value.indexOf(s)
  if (i >= 0) sizes.value.splice(i, 1)
  else sizes.value.push(s)
  sizes.value.sort((a, b) => a - b)
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('PNG 编码失败')
  return new Uint8Array(await blob.arrayBuffer())
}

async function onFiles(files: File[]) {
  errorMsg.value = ''
  try {
    const img = await loadImage(files[0])
    fileName.value = files[0].name
    sourceImg.value = img
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(files[0])
    await generateAll()
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

async function renderTo(img: HTMLImageElement, size: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  if (bg.value !== 'transparent') {
    ctx.fillStyle = bg.value
    ctx.fillRect(0, 0, size, size)
  }
  const inner = Math.max(1, size - pad.value * 2)
  const scale = Math.min(inner / img.naturalWidth, inner / img.naturalHeight)
  const w = img.naturalWidth * scale
  const h = img.naturalHeight * scale
  const x = (size - w) / 2
  const y = (size - h) / 2
  if (round.value) {
    const r = Math.min(size / 2, size * 0.22)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
    ctx.clip()
  }
  ctx.drawImage(img, x, y, w, h)
  return canvas
}

async function generateAll() {
  const img = sourceImg.value
  if (!img) {
    errorMsg.value = '请先选择源图'
    return
  }
  pngs.value = []
  const list: IcoImage[] = []
  for (const s of sizes.value) {
    const canvas = await renderTo(img, s)
    pngs.value.push({ size: s, url: canvas.toDataURL('image/png') })
    if (s <= 256) list.push({ size: s, png: await canvasToPng(canvas) })
  }
  if (!list.length) list.push({ size: 64, png: await canvasToPng(await renderTo(img, 64)) })
  const bytes = buildIco(list)
  icoBlob.value = new Blob([bytes as BlobPart], { type: 'image/x-icon' })
  if (icoUrl.value) URL.revokeObjectURL(icoUrl.value)
  icoUrl.value = URL.createObjectURL(icoBlob.value)

  manifest.value = buildManifest(
    appName.value || 'App',
    sizes.value.map(s => ({ src: `/icons/icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png' }))
  )
  htmlLinks.value = buildHtmlLinks('/icons/', sizes.value)
}

function downloadIco() {
  if (icoBlob.value) saveBlob('favicon.ico', icoBlob.value)
}

async function downloadAllPng() {
  for (const p of pngs.value) {
    const blob = await fetch(p.url).then(r => r.blob())
    saveBlob(`icon-${p.size}.png`, blob)
    await new Promise(r => setTimeout(r, 150))
  }
}

async function downloadAll() {
  await downloadAllPng()
  downloadIco()
}
</script>

<template>
  <div class="tu-t1">
    <TuField label="源图（建议正方形，≥512px）">
      <TuDrop accept="image/*" hint="点击选择图片，或把图片拖到此处" @files="onFiles" />
      <div v-if="previewUrl" class="tu-row">
        <img :src="previewUrl" alt="源图" style="max-height: 96px" />
      </div>
    </TuField>

    <div class="tu-row">
      <span class="tu-label">应用名称</span>
      <input v-model="appName" class="tu-input tu-inline" style="max-width: 200px" />
      <span class="tu-label">背景</span>
      <input v-model="bg" type="color" class="tu-input tu-inline" style="max-width: 70px" />
      <span class="tu-label">内边距</span>
      <input v-model.number="pad" type="number" min="0" class="tu-input tu-inline" style="max-width: 90px" />
      <button type="button" class="tu-check" :class="{ 'is-on': round }" @click="round = !round">圆角裁切</button>
      <button type="button" class="tu-btn ghost" :disabled="!sourceImg" @click="generateAll">重新生成</button>
    </div>

    <TuField label="输出尺寸">
      <div class="tu-toolbar">
        <button
          v-for="s in ALL_SIZES"
          :key="s"
          type="button"
          class="tu-check"
          :class="{ 'is-on': sizes.includes(s) }"
          @click="toggleSize(s)"
        >{{ s }}</button>
      </div>
      <p class="tu-hint">修改尺寸或参数后点击「重新生成」；ICO 容器包含其中 ≤256 的尺寸。</p>
    </TuField>

    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>

    <TuOutput
      title="生成的图标"
      :text="pngs.map(p => `icon-${p.size}.png`).join('\n')"
      filename="icons.txt"
      empty="选择源图后自动生成"
    >
      <template #actions>
        <button type="button" class="tu-btn" :disabled="!pngs.length" @click="downloadAll">下载全部</button>
        <button type="button" class="tu-btn ghost" :disabled="!icoBlob" @click="downloadIco">下载 favicon.ico</button>
        <button type="button" class="tu-btn ghost" :disabled="!pngs.length" @click="downloadAllPng">下载 PNG 套装</button>
      </template>
      <div class="tu-grid">
        <div v-for="p in pngs" :key="p.size" class="tu-card">
          <div class="tu-preview tu-checker"><img :src="p.url" :alt="`${p.size}px`" /></div>
          <div class="tu-card-title">{{ p.size }} × {{ p.size }}</div>
        </div>
      </div>
    </TuOutput>

    <TuOutput
      v-if="manifest"
      title="manifest.json（PWA）"
      :text="manifest"
      filename="manifest.json"
      mime="application/json"
      empty="—"
    >
      <template #actions>
        <button type="button" class="tu-btn ghost" @click="copy(manifest)">复制</button>
        <button type="button" class="tu-btn ghost" @click="save('manifest.json', manifest, 'application/json')">下载</button>
      </template>
      <pre class="tu-code">{{ manifest }}</pre>
    </TuOutput>

    <TuOutput v-if="htmlLinks" title="HTML 引用片段" :text="htmlLinks" filename="favicon-links.html" empty="—">
      <template #actions>
        <button type="button" class="tu-btn ghost" @click="copy(htmlLinks)">复制</button>
      </template>
      <pre class="tu-code">{{ htmlLinks }}</pre>
    </TuOutput>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>选择正方形源图后自动生成所选尺寸的 PNG 套装与 favicon.ico。</li>
          <li>可配置背景色、内边距与圆角；ICO 内嵌 ≤256 的 PNG 尺寸。</li>
          <li>同时给出 PWA manifest 与 HTML 引用片段，可直接复制使用。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-code {
  margin: 0;
  max-height: 200px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
.tu-preview img { max-height: 72px; }
</style>
