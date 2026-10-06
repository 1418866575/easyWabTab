<script setup lang="ts">
/**
 * 证件照换底（纯前端，canvas 本地处理，零上传）
 * 流程：选图 → 自动四边取样推断原背景色 → 抠图 → 合成新底色 →（可选）按规格裁切 → 下载
 */
import { ref, computed, watch } from 'vue'
import { toImageData, type PixelData } from '../../core/imageFx'
import {
  sampleBackgroundColor,
  cutoutBackground,
  compositeOn,
  cropToSize,
  ID_PHOTO_BG,
  ID_PHOTO_SIZES
} from '../../core/idphoto'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, loadImage } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

const fileName = ref('')
const src = ref<PixelData | null>(null)
/** 自动取样得到的原背景色 */
const detectedBg = ref<{ r: number; g: number; b: number } | null>(null)
/** 目标底色 key */
const bgKey = ref<string>('red')
/** 手动指定原背景色（关闭自动取样） */
const manualBg = ref(false)
const manualHex = ref('#ffffff')
/** 容差与羽化 */
const threshold = ref(70)
const feather = ref(2)
/** 规格尺寸 */
const sizeKey = ref<string>('original')
/** 输出格式 */
const fmt = ref<'png' | 'jpeg'>('png')

const previewUrl = ref('')
/** 原图 dataURL（对比查看用） */
const originalUrl = ref('')
const outBlob = ref<Blob | null>(null)
const outSize = ref(0)
const errorMsg = ref('')
/** 对比视图：显示原图 */
const showOriginal = ref(false)

useDirtyFlag(() => !!src.value)
const { saveBlob } = useToolActions()

const targetColor = computed(() => ID_PHOTO_BG[bgKey.value] || ID_PHOTO_BG.white)

function hexToRgb(hex: string) {
  const s = (hex || '').replace('#', '')
  return {
    r: parseInt(s.slice(0, 2), 16) || 0,
    g: parseInt(s.slice(2, 4), 16) || 0,
    b: parseInt(s.slice(4, 6), 16) || 0
  }
}

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
    originalUrl.value = canvas.toDataURL('image/png')
    // 自动推断原背景色（四边中位色，比单点更稳）
    detectedBg.value = sampleBackgroundColor(src.value)
    manualHex.value = toHex(detectedBg.value)
    render()
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

function toHex(c: { r: number; g: number; b: number }): string {
  return '#' + [c.r, c.g, c.b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')
}

/** 抠图时的目标背景色：自动取样 或 手动指定 */
const sourceBg = computed(() => {
  if (manualBg.value) return hexToRgb(manualHex.value)
  return detectedBg.value || { r: 255, g: 255, b: 255 }
})

function render() {
  const s = src.value
  if (!s) return
  try {
    // 抠图 → 合成底色 → 按规格裁切
    const cut = cutoutBackground(s, sourceBg.value, threshold.value, feather.value)
    const comp = compositeOn(cut, targetColor.value)
    const spec = ID_PHOTO_SIZES[sizeKey.value] || ID_PHOTO_SIZES.original
    const sized = cropToSize(comp, spec)

    const canvas = document.createElement('canvas')
    canvas.width = sized.width
    canvas.height = sized.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(toImageData(sized), 0, 0)
    const mime = fmt.value === 'png' ? 'image/png' : 'image/jpeg'
    previewUrl.value = canvas.toDataURL(mime, 0.92)
    canvas.toBlob(
      b => {
        outBlob.value = b
        outSize.value = b ? b.size : 0
      },
      mime,
      0.92
    )
  } catch (e) {
    errorMsg.value = '处理失败：' + (e as Error).message
  }
}

function download() {
  if (!outBlob.value) return
  const base = (fileName.value || 'photo').replace(/\.[^.]+$/, '')
  const ext = fmt.value === 'png' ? 'png' : 'jpg'
  saveBlob(`${base}-${targetColor.value.label}-${sizedLabel()}.${ext}`, outBlob.value)
}

function sizedLabel(): string {
  const spec = ID_PHOTO_SIZES[sizeKey.value] || ID_PHOTO_SIZES.original
  return spec.w > 0 ? `${spec.w}x${spec.h}` : '原尺寸'
}

watch([bgKey, threshold, feather, sizeKey, fmt, manualHex, manualBg], render)
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="选择证件照">
        <TuDrop accept="image/*" hint="点击选择照片，或把图片拖到此处" @files="onFiles" />
      </TuField>

      <TuField label="证件照底色">
        <div class="tu-row">
          <button
            v-for="(c, key) in ID_PHOTO_BG"
            :key="key"
            type="button"
            class="idp-swatch"
            :class="{ 'is-on': bgKey === key }"
            :title="c.label"
            @click="bgKey = key"
          >
            <span class="idp-swatch-dot" :style="{ background: toHex({ r: c.r, g: c.g, b: c.b }) }"></span>
            {{ c.label }}
          </button>
        </div>
      </TuField>

      <TuField label="规格尺寸" :extra="sizedLabel()">
        <div class="tu-row">
          <button
            v-for="(s, key) in ID_PHOTO_SIZES"
            :key="key"
            type="button"
            class="tu-check"
            :class="{ 'is-on': sizeKey === key }"
            @click="sizeKey = key"
          >{{ s.label }}</button>
        </div>
      </TuField>

      <TuField label="原背景色识别" :extra="manualBg ? '手动指定' : '自动四边取样'">
        <div class="tu-row">
          <input
            v-model="manualHex"
            type="color"
            class="tu-input tu-inline"
            style="max-width: 70px"
            :disabled="!manualBg"
          />
          <button
            type="button"
            class="tu-check"
            :class="{ 'is-on': manualBg }"
            @click="manualBg = !manualBg"
          >{{ manualBg ? '已手动指定' : '自动识别' }}</button>
          <button v-if="detectedBg" type="button" class="tu-check" @click="manualBg = false">重置为自动</button>
        </div>
        <p v-if="detectedBg && !manualBg" class="tu-hint">
          识别到原背景色 {{ toHex(detectedBg) }}；识别不准时切到「手动指定」吸取原背景。
        </p>
      </TuField>

      <TuField label="抠图容差" :extra="String(threshold)">
        <input v-model.number="threshold" type="range" min="10" max="180" class="tu-range" />
      </TuField>

      <TuField label="边缘羽化" :extra="String(feather)">
        <input v-model.number="feather" type="range" min="0" max="5" step="0.5" class="tu-range" />
      </TuField>

      <TuField label="输出格式">
        <div class="tu-row">
          <button type="button" class="tu-check" :class="{ 'is-on': fmt === 'png' }" @click="fmt = 'png'">PNG（透明可选）</button>
          <button type="button" class="tu-check" :class="{ 'is-on': fmt === 'jpeg' }" @click="fmt = 'jpeg'">JPG（体积小）</button>
        </div>
      </TuField>
    </div>

    <TuOutput
      title="预览"
      :text="previewUrl ? '见预览图' : ''"
      filename="id-photo.png"
      empty="选择照片后显示换底效果"
    >
      <template #actions>
        <button type="button" class="tu-btn ghost" :disabled="!previewUrl" @click="showOriginal = !showOriginal">
          {{ showOriginal ? '看换底效果' : '看原图' }}
        </button>
        <button type="button" class="tu-btn" :disabled="!outBlob" @click="download">下载到本地</button>
      </template>
      <div class="tu-canvas-box">
        <img v-if="previewUrl && !showOriginal" :src="previewUrl" alt="换底预览" />
        <img v-else-if="previewUrl && showOriginal && originalUrl" :src="originalUrl" alt="原图预览" />
        <p v-else class="tu-out-empty">暂无预览</p>
      </div>
      <p v-if="outSize" class="tu-hint">
        输出 {{ outSize >= 1024 * 1024 ? (outSize / 1024 / 1024).toFixed(2) + ' MB' : (outSize / 1024).toFixed(1) + ' KB' }}
        · {{ fmt.toUpperCase() }} · {{ sizedLabel() }}
      </p>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
    </TuOutput>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>上传证件照后自动从四边取样推断原背景色，把接近原背景的像素抠除。</li>
          <li>选择红/蓝/白等底色即可实时预览效果；抠图不干净时可提高「抠图容差」或改用手动指定原背景色。</li>
          <li>「边缘羽化」让发丝等细节过渡更自然；下载即保存到本地，可直接用于报名/证件办理。</li>
          <li>全部处理在本机浏览器完成，照片不会上传到任何服务器。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-canvas-box img { max-width: 100%; display: block; }
.idp-swatch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--motion-duration) var(--motion-ease);
}
.idp-swatch.is-on {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.idp-swatch-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
}
</style>
