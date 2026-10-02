<script setup lang="ts">
/**
 * 图片配色提取（纯前端，canvas 取主色）
 * 把图片缩放到小图后逐像素分桶统计，取出现频次最高的若干颜色。
 */
import { ref } from 'vue'
import { copyText } from '../../core/download'

interface Swatch { hex: string; count: number; pct: number }

const fileInput = ref<HTMLInputElement | null>(null)
const img = ref<HTMLImageElement | null>(null)
const count = ref(6)
const errorMsg = ref('')
const swatches = ref<Swatch[]>([])
const previewUrl = ref('')

function loadFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  errorMsg.value = ''
  swatches.value = []
  const im = new Image()
  im.onload = () => {
    img.value = im
    extract()
  }
  im.onerror = () => (errorMsg.value = '图片解析失败')
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(f)
  im.src = previewUrl.value
}

function extract() {
  if (!img.value) return
  const S = 96
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')
  if (!ctx) { errorMsg.value = 'canvas 不可用'; return }
  ctx.drawImage(img.value, 0, 0, S, S)
  const data = ctx.getImageData(0, 0, S, S).data
  const buckets = new Map<string, number>()
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 125) continue
    // 量化到每通道 5 档（约 51 步长），减少相似色
    const r = Math.round(data[i] / 51) * 51
    const g = Math.round(data[i + 1] / 51) * 51
    const b = Math.round(data[i + 2] / 51) * 51
    const key = `${r},${g},${b}`
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }
  const total = [...buckets.values()].reduce((s, v) => s + v, 0) || 1
  const arr = [...buckets.entries()]
    .map(([k, c]) => {
      const [r, g, b] = k.split(',').map(Number)
      return { hex: '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase(), count: c, pct: Math.round((c / total) * 100) }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, count.value)
  swatches.value = arr
}

async function copyCss() {
  const css = swatches.value.map(s => s.hex).join(', ')
  await copyText(css)
}
async function copyJson() {
  await copyText(JSON.stringify(swatches.value.map(s => s.hex), null, 2))
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
      <div class="tu-field">
        <label class="tu-label">提取数量 {{ count }}</label>
        <input v-model.number="count" type="range" min="2" max="12" step="1" class="tu-range" @change="extract" />
      </div>
      <p class="tu-hint">自动取出现频次最高的主色，颜色按出现比例排序。</p>
    </div>
    <div>
      <div v-if="errorMsg" class="tu-alert">{{ errorMsg }}</div>
      <div v-if="previewUrl" class="tu-preview">
        <img :src="previewUrl" alt="预览" />
      </div>
      <div v-if="swatches.length" class="tu-swatches" style="margin-top:12px">
        <div v-for="s in swatches" :key="s.hex" class="tu-swatch" :style="{ background: s.hex }">
          <span>{{ s.hex }}<br />{{ s.pct }}%</span>
        </div>
      </div>
      <div v-if="swatches.length" class="tu-row" style="margin-top:12px">
        <button class="tu-btn ghost" @click="copyCss">复制 HEX 列表</button>
        <button class="tu-btn ghost" @click="copyJson">复制 JSON</button>
      </div>
      <div v-if="!swatches.length" class="tu-preview">配色结果区（先选图）</div>
    </div>
  </div>
</template>
