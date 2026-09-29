<script setup lang="ts">
/**
 * 图片滤镜（亮度/对比度/饱和度/色相 + 预设，实时预览）
 */
import { nextTick, ref, watch } from 'vue'
import { adjustPixels, applyPreset, type AdjustOptions, type PixelData, type PresetId } from '../../core/imageFx'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, loadImage } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

const opts = ref<Required<AdjustOptions>>({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  grayscale: false,
  blur: 0,
  sharpen: false
})

const preset = ref<PresetId>('none')
const fileName = ref('')
const src = ref<PixelData | null>(null)
const previewUrl = ref('')
const outBlob = ref<Blob | null>(null)
const outSize = ref(0)
const busy = ref(false)
const errorMsg = ref('')

useDirtyFlag(() => !!src.value)
const { saveBlob } = useToolActions()

const PRESETS: { id: PresetId; name: string }[] = [
  { id: 'none', name: '原图' },
  { id: 'vintage', name: '复古' },
  { id: 'bw', name: '黑白' },
  { id: 'cool', name: '冷调' },
  { id: 'warm', name: '暖调' },
  { id: 'sharpen', name: '锐化' },
  { id: 'invert', name: '反相' }
]

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
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    src.value = { data: data.data, width: canvas.width, height: canvas.height }
    await render()
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

async function render() {
  const s = src.value
  if (!s) return
  busy.value = true
  await nextTick()
  let out = adjustPixels(s, opts.value)
  if (preset.value !== 'none') out = applyPreset(out, preset.value)
  const canvas = document.createElement('canvas')
  canvas.width = out.width
  canvas.height = out.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    busy.value = false
    return
  }
  ctx.putImageData(new ImageData(out.data, out.width, out.height), 0, 0)
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = canvas.toDataURL('image/png')
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
  outBlob.value = blob
  outSize.value = blob ? blob.size : 0
  busy.value = false
}

function reset() {
  opts.value = { brightness: 0, contrast: 0, saturation: 0, hue: 0, grayscale: false, blur: 0, sharpen: false }
  preset.value = 'none'
  render()
}

function download() {
  if (!outBlob.value) return
  const base = (fileName.value || 'image').replace(/\.[^.]+$/, '')
  saveBlob(`${base}-filtered.png`, outBlob.value)
}

watch(opts, render, { deep: true })
watch(preset, render)
</script>

<template>
  <div class="tu-t5">
    <TuField label="选择图片">
      <TuDrop accept="image/*" hint="点击选择图片，或把图片拖到此处" @files="onFiles" />
    </TuField>

    <div class="tu-toolbar">
      <span class="tu-label">预设</span>
      <button
        v-for="p in PRESETS"
        :key="p.id"
        type="button"
        class="tu-check"
        :class="{ 'is-on': preset === p.id }"
        @click="preset = p.id"
      >{{ p.name }}</button>
      <span class="tu-spacer" />
      <button type="button" class="tu-btn ghost" :disabled="!src" @click="reset">重置参数</button>
    </div>

    <div class="tu-t4">
      <div>
        <TuField label="亮度" :extra="String(opts.brightness)">
          <input v-model.number="opts.brightness" type="range" min="-100" max="100" class="tu-range" />
        </TuField>
        <TuField label="对比度" :extra="String(opts.contrast)">
          <input v-model.number="opts.contrast" type="range" min="-100" max="100" class="tu-range" />
        </TuField>
        <TuField label="饱和度" :extra="String(opts.saturation)">
          <input v-model.number="opts.saturation" type="range" min="-100" max="100" class="tu-range" />
        </TuField>
        <TuField label="色相" :extra="`${opts.hue}°`">
          <input v-model.number="opts.hue" type="range" min="-180" max="180" class="tu-range" />
        </TuField>
        <TuField label="模糊" :extra="String(opts.blur)">
          <input v-model.number="opts.blur" type="range" min="0" max="10" class="tu-range" />
        </TuField>
        <div class="tu-row">
          <button type="button" class="tu-check" :class="{ 'is-on': opts.grayscale }" @click="opts.grayscale = !opts.grayscale">
            灰度
          </button>
          <button type="button" class="tu-check" :class="{ 'is-on': opts.sharpen }" @click="opts.sharpen = !opts.sharpen">
            锐化
          </button>
        </div>
      </div>

      <TuOutput
        title="预览"
        filename="filtered.png"
        :text="previewUrl ? '见预览图' : ''"
        empty="选择图片后显示预览"
      >
        <template #actions>
          <button type="button" class="tu-btn" :disabled="!outBlob" @click="download">下载 PNG</button>
        </template>
        <div class="tu-canvas-box">
          <img v-if="previewUrl" :src="previewUrl" alt="滤镜预览" />
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
          <li>先选择图片，再拖动滑块或点击预设，预览会实时刷新。</li>
          <li>预设可与滑块叠加使用，例如「复古 + 提高对比度」。</li>
          <li>处理全部在本地 canvas 完成，导出为 PNG。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-canvas-box img { max-width: 100%; display: block; }
</style>
