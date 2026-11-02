<script setup lang="ts">
/**
 * 印章生成器：圆 / 方 / 椭圆章，字体与做旧可调，导出透明 PNG，并可盖到图片上
 */
import { computed, ref } from 'vue'
import { buildSealSvg, MAX_SUB, MAX_TEXT, SEAL_COLORS, sealPngDataUrl, SHAPES, type SealFont, type SealOpts, type SealShape } from './sealCore'
import { downloadDataUrl } from '../../core/download'
import { loadImage } from '../../composables/useToolActions'
import { useToast } from '@/composables/useToast'
import TuDrop from '../../components/tool/TuDrop.vue'

const toast = useToast()

const shape = ref<SealShape>('round')
const text = ref('如意')
const subText = ref('')
const color = ref(SEAL_COLORS[0])
const font = ref<SealFont>('kai')
const grunge = ref(20)

const baseImg = ref<HTMLImageElement | null>(null)
const posX = ref(50)
const posY = ref(50)
const scale = ref(30)
const exporting = ref(false)

const opts = computed<SealOpts>(() => ({
  shape: shape.value,
  text: text.value,
  subText: subText.value,
  color: color.value,
  font: font.value,
  grunge: grunge.value
}))

const svg = computed(() => buildSealSvg(opts.value))
const preview = computed(() => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.value))
const fontLabel = computed(() => ({ song: '宋体', kai: '楷体', hei: '黑体' })[font.value])

async function onFiles(files: File[]) {
  const f = files[0]
  if (!f) return
  try {
    baseImg.value = await loadImage(f)
  } catch {
    toast.error('图片加载失败')
  }
}

function clearBase() {
  baseImg.value = null
}

async function exportSeal() {
  exporting.value = true
  try {
    const url = await sealPngDataUrl(svg.value, 600)
    downloadDataUrl(`seal-${shape.value}-${Date.now()}.png`, url)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '导出失败')
  }
  exporting.value = false
}

async function exportStamped() {
  if (!baseImg.value) return
  exporting.value = true
  try {
    const sealUrl = await sealPngDataUrl(svg.value, 600)
    const seal = new Image()
    await new Promise<void>((resolve, reject) => {
      seal.onload = () => resolve()
      seal.onerror = () => reject(new Error('印章渲染失败'))
      seal.src = sealUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = baseImg.value.naturalWidth
    canvas.height = baseImg.value.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.drawImage(baseImg.value, 0, 0)
    const w = (canvas.width * scale.value) / 100
    const x = (canvas.width * posX.value) / 100 - w / 2
    const y = (canvas.height * posY.value) / 100 - w / 2
    ctx.drawImage(seal, x, y, w, w)
    downloadDataUrl(`stamped-${Date.now()}.png`, canvas.toDataURL('image/png'))
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '导出失败')
  }
  exporting.value = false
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-row">
      <div class="tu-seg">
        <button v-for="s in SHAPES" :key="s.id" type="button" :class="{ 'is-on': shape === s.id }" @click="shape = s.id">{{ s.name }}</button>
      </div>
      <select v-model="font" class="tu-select">
        <option value="song">宋体</option>
        <option value="kai">楷体</option>
        <option value="hei">黑体</option>
      </select>
      <button v-for="c in SEAL_COLORS" :key="c" type="button" class="sm-color" :class="{ 'is-on': color === c }" :style="{ background: c }" @click="color = c"></button>
    </div>

    <div class="tu-row">
      <label class="tu-label sm-inline">主文字（≤{{ MAX_TEXT }} 字）</label>
      <input v-model="text" type="text" class="tu-input sm-narrow" :maxlength="MAX_TEXT" />
      <label class="tu-label sm-inline">副文字</label>
      <input v-model="subText" type="text" class="tu-input sm-narrow2" :maxlength="MAX_SUB" placeholder="可空" />
    </div>

    <div class="tu-row">
      <label class="tu-label sm-inline">做旧 {{ grunge }}</label>
      <input v-model.number="grunge" type="range" class="tu-range sm-range" min="0" max="100" />
      <span class="tu-spacer"></span>
      <button type="button" class="tu-btn" :disabled="exporting" @click="exportSeal">导出透明 PNG</button>
    </div>

    <div class="tu-preview tu-checker">
      <img :src="preview" alt="印章预览" class="sm-img" data-testid="tb-seal-preview" />
    </div>
    <p class="tu-hint">
      字体使用系统 {{ fontLabel }} 字体栈，本机未安装时由浏览器回落，导出效果可能略有差异。
    </p>

    <details class="tu-folding">
      <summary>盖到图片上（可选）</summary>
      <div class="tu-folding-body">
        <TuDrop v-if="!baseImg" accept="image/*" hint="选择底图后调整印章位置与大小" button-text="选择底图" @files="onFiles" />
        <template v-else>
          <div class="tu-row sm-nomargin">
            <label class="tu-label sm-inline">横向 {{ posX }}%</label>
            <input v-model.number="posX" type="range" class="tu-range sm-range" min="0" max="100" />
            <label class="tu-label sm-inline">纵向 {{ posY }}%</label>
            <input v-model.number="posY" type="range" class="tu-range sm-range" min="0" max="100" />
            <label class="tu-label sm-inline">大小 {{ scale }}%</label>
            <input v-model.number="scale" type="range" class="tu-range sm-range" min="8" max="80" />
          </div>
          <div class="tu-row sm-nomargin">
            <button type="button" class="tu-btn" :disabled="exporting" @click="exportStamped">导出盖章图</button>
            <button type="button" class="tu-btn ghost" @click="clearBase">移除底图</button>
          </div>
        </template>
      </div>
    </details>
  </div>
</template>

<style scoped>
.sm-inline { margin-bottom: 0; }
.sm-narrow { width: 110px; }
.sm-narrow2 { width: 160px; }
.sm-range { width: 130px; }
.sm-nomargin { margin-bottom: 8px; }
.sm-img { width: 220px; height: 220px; }
.sm-color {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}
.sm-color.is-on { border-color: var(--color-primary); }
</style>
