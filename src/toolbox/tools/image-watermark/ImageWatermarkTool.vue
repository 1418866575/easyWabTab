<script setup lang="ts">
import { ref } from 'vue'
import { downloadDataUrl } from '../../core/download'

const imgInput = ref<HTMLInputElement | null>(null)
const wmInput = ref<HTMLInputElement | null>(null)
const text = ref('easy-web-tab')
const fontSize = ref(28)
const opacity = ref(40)
const rotate = ref(-30)
const tiled = ref(true)
const color = ref('#ffffff')
const previewUrl = ref('')
let base: HTMLImageElement | null = null
let wmImg: HTMLImageElement | null = null

function loadImg(f: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(f)
  })
}
async function onImg(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  base = await loadImg(f)
  render()
  ;(e.target as HTMLInputElement).value = ''
}
async function onWm(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  wmImg = await loadImg(f)
  render()
  ;(e.target as HTMLInputElement).value = ''
}

function render() {
  if (!base) return
  const canvas = document.createElement('canvas')
  canvas.width = base.width
  canvas.height = base.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(base, 0, 0)
  ctx.save()
  ctx.globalAlpha = opacity.value / 100

  if (wmImg) {
    const w = base.width * 0.2
    const h = w * (wmImg.height / wmImg.width)
    if (tiled.value) {
      ctx.translate(base.width / 2, base.height / 2)
      ctx.rotate(rotate.value * Math.PI / 180)
      const step = Math.max(w, h) * 2.4
      for (let y = -base.height; y < base.height; y += step) {
        for (let x = -base.width; x < base.width; x += step) ctx.drawImage(wmImg, x, y, w, h)
      }
    } else {
      ctx.drawImage(wmImg, (base.width - w) / 2, (base.height - h) / 2, w, h)
    }
  } else {
    ctx.fillStyle = color.value
    ctx.font = fontSize.value + 'px sans-serif'
    if (tiled.value) {
      ctx.translate(base.width / 2, base.height / 2)
      ctx.rotate(rotate.value * Math.PI / 180)
      const tw = ctx.measureText(text.value).width
      const step = Math.max(tw, fontSize.value) * 2.2
      for (let y = -base.height; y < base.height; y += step) {
        for (let x = -base.width; x < base.width; x += step) ctx.fillText(text.value, x, y)
      }
    } else {
      ctx.textAlign = 'center'
      ctx.fillText(text.value, base.width / 2, base.height / 2)
    }
  }
  ctx.restore()
  previewUrl.value = canvas.toDataURL('image/png')
}
function save() { if (previewUrl.value) downloadDataUrl('watermark-' + Date.now() + '.png', previewUrl.value) }
</script>

<template>
  <div class="tu-t5">
    <div class="tu-row">
      <input ref="imgInput" type="file" accept="image/*" hidden @change="onImg" />
      <button class="tu-btn" @click="imgInput?.click()">选择图片</button>
      <input ref="wmInput" type="file" accept="image/*" hidden @change="onWm" />
      <button class="tu-btn ghost" @click="wmInput?.click()">用水印图</button>
      <button class="tu-btn ghost" :disabled="!previewUrl" @click="save">保存</button>
    </div>
    <div class="tu-t2" style="grid-template-columns:1fr 1fr">
      <div>
        <div class="tu-field"><label class="tu-label">水印文字</label><input v-model="text" class="tu-input" :disabled="!!wmImg" /></div>
        <div class="tu-field"><label class="tu-label">字号 {{ fontSize }}</label><input class="tu-range" type="range" min="10" max="120" v-model.number="fontSize" :disabled="!!wmImg" /></div>
        <div class="tu-field"><label class="tu-label">透明度 {{ opacity }}%</label><input class="tu-range" type="range" min="5" max="100" v-model.number="opacity" /></div>
        <div class="tu-field"><label class="tu-label">旋转 {{ rotate }}°</label><input class="tu-range" type="range" min="-90" max="90" v-model.number="rotate" /></div>
        <div v-if="!wmImg" class="tu-field"><label class="tu-label">颜色</label><input class="tu-input tu-inline" type="color" v-model="color" /></div>
        <label class="tu-check" :class="{ 'is-on': tiled }"><input type="checkbox" v-model="tiled" /> 平铺（否则居中单次）</label>
      </div>
      <div>
        <div v-if="previewUrl" class="tu-preview"><img :src="previewUrl" alt="watermark" /></div>
        <div v-else class="tu-preview">预览将显示在此处</div>
      </div>
    </div>
    <p class="tu-hint">所有处理在本地完成；旋转与平铺对文字与图片水印均生效。</p>
  </div>
</template>
