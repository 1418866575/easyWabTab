<script setup lang="ts">
/**
 * 随机头像生成：像素 / 字母 / 卡通三种风格，种子可复现，导出 SVG 与 PNG
 */
import { computed, ref } from 'vue'
import { buildAvatar, SIZES, STYLES, svgDataUrl, type AvatarStyle } from './avatarCore'
import { downloadDataUrl } from '../../core/download'
import { useToast } from '@/composables/useToast'
import { useToolActions } from '../../composables/useToolActions'

const toast = useToast()
const { save } = useToolActions()

const style = ref<AvatarStyle['id']>('pixel')
const seed = ref('easy-web-tab')
const letter = ref('E')
const pngSize = ref(256)
const exporting = ref(false)

const svg = computed(() => buildAvatar(style.value, seed.value, letter.value))
const preview = computed(() => svgDataUrl(svg.value))

function reroll() {
  seed.value = Math.random().toString(36).slice(2, 10)
}

function exportSvg() {
  save(`avatar-${style.value}-${seed.value}.svg`, svg.value, 'image/svg+xml;charset=utf-8')
}

async function exportPng() {
  exporting.value = true
  try {
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.value)
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('渲染失败'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = pngSize.value
    canvas.height = pngSize.value
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.drawImage(img, 0, 0, pngSize.value, pngSize.value)
    downloadDataUrl(`avatar-${style.value}-${seed.value}-${pngSize.value}.png`, canvas.toDataURL('image/png'))
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '导出失败')
  }
  exporting.value = false
}
</script>

<template>
  <div class="tu-t4">
    <div class="av-left">
      <div class="tu-row">
        <div class="tu-seg">
          <button v-for="s in STYLES" :key="s.id" type="button" :class="{ 'is-on': style === s.id }" @click="style = s.id">{{ s.name }}</button>
        </div>
      </div>

      <label class="tu-label">种子（相同种子 + 相同风格 = 相同头像）</label>
      <div class="tu-row">
        <input v-model="seed" type="text" class="tu-input av-seed" data-testid="tb-avatar-seed" />
        <button type="button" class="tu-btn ghost" @click="reroll">随机</button>
      </div>

      <template v-if="style === 'letter'">
        <label class="tu-label">首字母 / 汉字</label>
        <input v-model="letter" type="text" class="tu-input av-letter" maxlength="1" />
      </template>

      <div class="tu-row">
        <select v-model.number="pngSize" class="tu-select">
          <option v-for="s in SIZES" :key="s" :value="s">{{ s }} × {{ s }}</option>
        </select>
        <button type="button" class="tu-btn" :disabled="exporting" @click="exportPng">导出 PNG</button>
        <button type="button" class="tu-btn ghost" @click="exportSvg">导出 SVG</button>
      </div>

      <p class="tu-hint">配色从 6 套预设中按种子挑选；PNG 由本地 canvas 从 SVG 绘制导出，无网络请求。</p>
    </div>

    <div class="av-right">
      <div class="tu-preview tu-checker">
        <img :src="preview" alt="头像预览" class="av-img" data-testid="tb-avatar-preview" />
      </div>
      <p class="tu-hint av-meta">风格 {{ STYLES.find((s) => s.id === style)?.name }} · 种子 {{ seed || '（空）' }}</p>
    </div>
  </div>
</template>

<style scoped>
.av-left, .av-right { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.av-seed { width: auto; flex: 1; min-width: 140px; }
.av-letter { width: 80px; }
.av-img { width: 220px; height: 220px; border-radius: var(--radius-md); }
.av-meta { text-align: center; }
</style>
