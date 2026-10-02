<script setup lang="ts">
/**
 * 二维码生成器（qrcode 仅在打开本工具时懒加载）
 * 支持尺寸、纠错等级、颜色定制与中心 Logo，导出 PNG / SVG。
 */
import { ref } from 'vue'
import JSZip from 'jszip'
import { downloadBlob } from '../../core/download'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, loadImage } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

const text = ref('https://example.com')
const size = ref(320)
const margin = ref(2)
const dark = ref('#1f2937')
const light = ref('#ffffff')
const level = ref<'L' | 'M' | 'Q' | 'H'>('M')
const logoOn = ref(false)
const logoUrl = ref('')
const pngUrl = ref('')
const svgText = ref('')
const errorMsg = ref('')

useDirtyFlag(() => !!text.value.trim())
const { copy, save } = useToolActions()

const LEVELS: { id: 'L' | 'M' | 'Q' | 'H'; name: string }[] = [
  { id: 'L', name: 'L 7%' },
  { id: 'M', name: 'M 15%' },
  { id: 'Q', name: 'Q 25%' },
  { id: 'H', name: 'H 30%' }
]

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

/** 在生成的二维码中心叠加 Logo（画布合成） */
async function composeLogo() {
  if (!pngUrl.value || !logoUrl.value) return
  try {
    const base = await loadImageFromUrl(pngUrl.value)
    const logo = await loadImageFromUrl(logoUrl.value)
    const canvas = document.createElement('canvas')
    canvas.width = base.naturalWidth
    canvas.height = base.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(base, 0, 0)
    const lw = canvas.width * 0.2
    const lh = (logo.naturalHeight / logo.naturalWidth) * lw
    const x = (canvas.width - lw) / 2
    const y = (canvas.height - lh) / 2
    const pad = lw * 0.08
    ctx.fillStyle = light.value
    ctx.fillRect(x - pad, y - pad, lw + pad * 2, lh + pad * 2)
    ctx.drawImage(logo, x, y, lw, lh)
    pngUrl.value = canvas.toDataURL('image/png')
  } catch {
    /* Logo 合成失败时保留原始二维码 */
  }
}

async function render() {
  errorMsg.value = ''
  const src = text.value.trim()
  if (!src) {
    pngUrl.value = ''
    svgText.value = ''
    return
  }
  try {
    const QRCode = await import('qrcode')
    const opts = {
      width: Math.max(64, Math.min(1024, Number(size.value) || 320)),
      margin: Math.max(0, Math.min(10, Number(margin.value) ?? 2)),
      color: { dark: dark.value, light: light.value },
      errorCorrectionLevel: level.value
    }
    pngUrl.value = await QRCode.toDataURL(src, opts)
    svgText.value = await QRCode.toString(src, { ...opts, type: 'svg' })
    if (logoOn.value && logoUrl.value) await composeLogo()
  } catch (e) {
    errorMsg.value = (e as Error).message || '生成失败'
  }
}

async function onLogo(files: File[]) {
  try {
    const img = await loadImage(files[0])
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(img, 0, 0)
      logoUrl.value = canvas.toDataURL('image/png')
    }
    if (logoOn.value) await render()
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

async function downloadPng() {
  if (!pngUrl.value) return
  const { downloadDataUrl } = await import('../../core/download')
  downloadDataUrl('qrcode.png', pngUrl.value)
  const { markSaved } = await import('../../prefs/useToolDirty')
  markSaved()
}

const batch = ref(false)
const batchText = ref('https://example.com\nhttps://easy-web-tab.com')

/** 批量：每行一个内容，分别生成 PNG 并打包为 ZIP */
async function batchZip() {
  errorMsg.value = ''
  const lines = batchText.value.split('\n').map(s => s.trim()).filter(Boolean)
  if (!lines.length) { errorMsg.value = '请输入至少一行内容'; return }
  try {
    const QRCode = await import('qrcode')
    const opts = {
      width: Math.max(64, Math.min(1024, Number(size.value) || 320)),
      margin: Math.max(0, Math.min(10, Number(margin.value) ?? 2)),
      color: { dark: dark.value, light: light.value },
      errorCorrectionLevel: level.value
    }
    const zip = new JSZip()
    for (let i = 0; i < lines.length; i++) {
      const dataUrl = await QRCode.toDataURL(lines[i], opts)
      zip.file(`qrcode-${i + 1}.png`, dataUrl.split(',')[1], { base64: true })
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob('qrcodes.zip', blob)
  } catch (e) {
    errorMsg.value = (e as Error).message || '生成失败'
  }
}

render()
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="内容（文本 / 链接 / 任意字符串）">
        <textarea
          v-model="text"
          class="tu-textarea"
          rows="4"
          spellcheck="false"
          placeholder="https://example.com"
          data-testid="tb-modal-input"
        />
      </TuField>

      <TuField label="尺寸（px）" :extra="String(size)">
        <input v-model.number="size" type="range" min="128" max="1024" step="32" class="tu-range" />
      </TuField>

      <TuField label="边距（模块数）" :extra="String(margin)">
        <input v-model.number="margin" type="range" min="0" max="10" class="tu-range" />
      </TuField>

      <TuField label="纠错等级">
        <div class="tu-toolbar">
          <button
            v-for="l in LEVELS"
            :key="l.id"
            type="button"
            class="tu-check"
            :class="{ 'is-on': level === l.id }"
            @click="level = l.id"
          >{{ l.name }}</button>
        </div>
      </TuField>

      <TuField label="颜色">
        <div class="tu-row">
          <span class="tu-label">前景</span>
          <input v-model="dark" type="color" class="tu-input tu-inline" style="max-width: 70px" />
          <span class="tu-label">背景</span>
          <input v-model="light" type="color" class="tu-input tu-inline" style="max-width: 70px" />
        </div>
      </TuField>

      <TuField label="中心 Logo（可选）">
        <div class="tu-row">
          <button type="button" class="tu-check" :class="{ 'is-on': logoOn }" @click="logoOn = !logoOn">启用 Logo</button>
        </div>
        <TuDrop v-if="logoOn" accept="image/*" hint="选择 Logo 图片" @files="onLogo" />
      </TuField>

      <TuField label="批量模式（每行一个内容，打包 ZIP）">
        <div class="tu-row">
          <button type="button" class="tu-check" :class="{ 'is-on': batch }" @click="batch = !batch">启用批量</button>
        </div>
        <textarea v-if="batch" v-model="batchText" class="tu-textarea" rows="4" spellcheck="false" placeholder="每行一个链接 / 文本" />
        <button v-if="batch" type="button" class="tu-btn" :disabled="!batchText.trim()" @click="batchZip">生成并打包 ZIP</button>
      </TuField>

      <div class="tu-row">
        <button type="button" class="tu-btn" @click="render">生成二维码</button>
      </div>
    </div>

    <div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>

      <TuOutput title="预览" :text="svgText" filename="qrcode.svg" mime="image/svg+xml" empty="输入内容后点击生成">
        <template #actions>
          <button type="button" class="tu-btn" :disabled="!pngUrl" @click="downloadPng">下载 PNG</button>
          <button
            type="button"
            class="tu-btn ghost"
            :disabled="!svgText"
            @click="save('qrcode.svg', svgText, 'image/svg+xml')"
          >下载 SVG</button>
          <button type="button" class="tu-btn ghost" :disabled="!text" @click="copy(text)">复制内容</button>
        </template>
        <div class="tu-preview tu-checker">
          <img v-if="pngUrl" :src="pngUrl" alt="二维码" />
          <p v-else class="tu-out-empty">暂无预览</p>
        </div>
      </TuOutput>

      <details class="tu-folding">
        <summary>使用说明</summary>
        <div class="tu-folding-body">
          <ol>
            <li>输入内容后点击生成，可调节尺寸、边距、颜色与纠错等级。</li>
            <li>启用 Logo 时建议选择 H 级纠错，避免遮挡导致无法识别。</li>
            <li>可导出 PNG 或 SVG，全部在本地生成，不上传任何内容。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.tu-preview img { max-height: 320px; }
</style>
