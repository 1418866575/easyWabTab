<script setup lang="ts">
/**
 * 图表配色生成（基于 HSL 色环均匀分布，纯前端实现）
 */
import { ref } from 'vue'
import { useToast } from '@/composables/useToast'
import { hexToHsl, hslToHex } from '../../core/color'

const base = ref('#3b82f6')
const count = ref(6)
const colors = ref<string[]>([])
const { success, error } = useToast()

function generate() {
  const n = Math.max(2, Math.min(12, Number(count.value) || 6))
  const hsl = hexToHsl(base.value || '#3b82f6')
  const list: string[] = []
  for (let i = 0; i < n; i++) {
    const h = (hsl.h + Math.round(360 / n) * i) % 360
    const s = Math.max(35, Math.min(90, hsl.s + (i % 2 ? 8 : -8)))
    const l = Math.max(35, Math.min(78, hsl.l + ((i % 3) - 1) * 10))
    list.push(hslToHex(h, s, l).toUpperCase())
  }
  colors.value = list
}

async function copy() {
  if (!colors.value.length) { error('请先生成配色'); return }
  try {
    await navigator.clipboard.writeText(colors.value.join('  '))
    success('已复制色值')
  } catch {
    error('复制失败，请手动选择色值复制')
  }
}

generate()
</script>

<template>
  <div>
    <div class="tu-row">
      <span class="tu-label">基色</span>
      <input v-model="base" type="color" class="tu-input tu-inline" style="max-width:90px" />
      <span class="tu-label">数量</span>
      <input v-model.number="count" type="number" min="2" max="12" class="tu-input tu-inline" style="max-width:110px" />
      <button type="button" class="tu-btn" @click="generate">生成配色</button>
      <button type="button" class="tu-btn ghost" @click="copy">复制色值</button>
    </div>

    <div class="tu-field">
      <span class="tu-label">配色方案</span>
      <div class="tu-swatches" data-testid="tool-chart-color-output">
        <div
          v-for="c in colors"
          :key="c"
          class="tu-swatch"
          :style="{ background: c }"
          :title="c"
        >{{ c }}</div>
      </div>
    </div>
  </div>
</template>
