<script setup lang="ts">
/**
 * 图片去背景（按颜色阈值 + 边缘羽化，可替换背景色）
 */
import { nextTick, ref, watch } from 'vue'
import { removeBackground, toImageData, type PixelData } from '../../core/imageFx'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, loadImage } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

const fileName = ref('')
const src = ref<PixelData | null>(null)
const target = ref({ r: 255, g: 255, b: 255 })
const threshold = ref(60)
const feather = ref(1)
const replaceBg = ref<'transparent' | 'color'>('transparent')
const bgColor = ref('#3b82f6')
const previewUrl = ref('')
const outBlob = ref<Blob | null>(null)
const outSize = ref(0)
const errorMsg = ref('')
const pickMode = ref(false)

useDirtyFlag(() => !!src.value)
const { saveBlob } = useToolActions()

const targetHex = ref('#ffffff')

async function onFiles(files: File[]) {
  errorMsg.value = ''
  try {
    const img = await loadImage(files[0])
    fileName.value = files[0].name
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height)
    src.value = { data: d.data, width: canvas.width, height: canvas.height }
    // 默认取左上角像素作为目标色
    target.value = { r: d.data[0], g: d.data[1], b: d.data[2] }
    targetHex.value = '#' + [d.data[0], d.data[1], d.data[2]].map(v => v.toString(16).padStart(2, '0')).join('')
    await render()
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

function hexToRgb(hex: string) {
  const s = hex.replace('#', '')
  return {
    r: parseInt(s.slice(0, 2), 16) || 0,
    g: parseInt(s.slice(2, 4), 16) || 0,
    b: parseInt(s.slice(4, 6), 16) || 0
  }
}

watch(targetHex, v => (target.value = hexToRgb(v)))

function onCanvasClick(e: MouseEvent) {
  if (!pickMode.value || !src.value) return
  const el = e.currentTarget as HTMLElement
  const box = el.getBoundingClientRect()
  const imgEl = el.querySelector('img') as HTMLImageElement | null
  if (!imgEl) return
  const x = Math.round(((e.clientX - box.left) / imgEl.clientWidth) * src.value.width)
  const y = Math.round(((e.clientY - box.top) / imgEl.clientHeight) * src.value.height)
  const i = (y * src.value.width + x) * 4
  const d = src.value.data
  target.value = { r: d[i], g: d[i + 1], b: d[i + 2] }
  targetHex.value = '#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')
  pickMode.value = false
  render()
}

async function render() {
  const s = src.value
  if (!s) return
  await nextTick()
  const out = removeBackground(s, target.value, threshold.value, feather.value)
  const canvas = document.createElement('canvas')
  canvas.width = out.width
  canvas.height = out.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  if (replaceBg.value === 'color') {
    ctx.fillStyle = bgColor.value
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.putImageData(toImageData(out), 0, 0)
  if (previewUrl.value.startsWith('blob:')) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = canvas.toDataURL('image/png')
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
  outBlob.value = blob
  outSize.value = blob ? blob.size : 0
}

function download() {
  if (!outBlob.value) return
  const base = (fileName.value || 'image').replace(/\.[^.]+$/, '')
  saveBlob(`${base}-cutout.png`, outBlob.value)
}

watch([threshold, feather, replaceBg, bgColor], render)
</script>

<template>
  <div class="tu-t5">
    <TuField label="选择图片">
      <TuDrop accept="image/*" hint="点击选择图片，或把图片拖到此处" @files="onFiles" />
    </TuField>

    <div class="tu-t4">
      <div>
        <TuField label="目标颜色（将被去除）">
          <div class="tu-row">
            <input v-model="targetHex" type="color" class="tu-input tu-inline" style="max-width: 70px" />
            <input v-model="targetHex" class="tu-input tu-inline" style="max-width: 120px" spellcheck="false" />
            <button type="button" class="tu-check" :class="{ 'is-on': pickMode }" @click="pickMode = !pickMode">
              {{ pickMode ? '点击图片取色…' : '从图片取色' }}
            </button>
          </div>
        </TuField>

        <TuField label="容差（颜色距离阈值）" :extra="String(threshold)">
          <input v-model.number="threshold" type="range" min="0" max="180" class="tu-range" />
        </TuField>

        <TuField label="边缘羽化" :extra="String(feather)">
          <input v-model.number="feather" type="range" min="0" max="5" step="0.5" class="tu-range" />
        </TuField>

        <TuField label="背景处理">
          <div class="tu-row">
            <button
              type="button"
              class="tu-check"
              :class="{ 'is-on': replaceBg === 'transparent' }"
              @click="replaceBg = 'transparent'"
            >透明</button>
            <button
              type="button"
              class="tu-check"
              :class="{ 'is-on': replaceBg === 'color' }"
              @click="replaceBg = 'color'"
            >替换为纯色</button>
            <input
              v-if="replaceBg === 'color'"
              v-model="bgColor"
              type="color"
              class="tu-input tu-inline"
              style="max-width: 70px"
            />
          </div>
        </TuField>
      </div>

      <TuOutput
        title="预览（棋盘格表示透明区域）"
        :text="previewUrl ? '见预览图' : ''"
        filename="cutout.png"
        empty="选择图片后显示预览"
      >
        <template #actions>
          <button type="button" class="tu-btn" :disabled="!outBlob" @click="download">下载 PNG</button>
        </template>
        <div class="tu-canvas-box tu-checker" @click="onCanvasClick">
          <img v-if="previewUrl" :src="previewUrl" alt="去背景预览" />
          <p v-else class="tu-out-empty">暂无预览</p>
        </div>
        <p v-if="outSize" class="tu-hint">输出大小：{{ (outSize / 1024).toFixed(1) }} KB</p>
        <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      </TuOutput>
    </div>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>默认取图片左上角像素为目标色，也可手动输入或从图片上点击取色。</li>
          <li>调大容差可去除更多相近颜色；羽化让边缘过渡更自然。</li>
          <li>背景可选透明或替换为纯色，导出 PNG 保留透明通道。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-canvas-box img { max-width: 100%; display: block; }
</style>
