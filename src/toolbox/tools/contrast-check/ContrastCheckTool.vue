<script setup lang="ts">
import { computed, ref } from 'vue'

const fg = ref('#0f172a')
const bg = ref('#ffffff')

function hexToRgb(hex: string): [number, number, number] | null {
  let h = (hex || '').trim().replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function relLum(hex: string): number | null {
  const c = hexToRgb(hex)
  if (!c) return null
  const f = c.map(v => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]
}
const ratio = computed(() => {
  const l1 = relLum(fg.value)
  const l2 = relLum(bg.value)
  if (l1 == null || l2 == null) return null
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
})
const valid = computed(() => ratio.value != null)
const passAA = (large: boolean) => ratio.value != null && ratio.value >= (large ? 3 : 4.5)
const passAAA = (large: boolean) => ratio.value != null && ratio.value >= (large ? 4.5 : 7)
</script>

<template>
  <div class="tu-t4">
    <div class="tu-t1">
      <div class="tu-field">
        <label class="tu-label">前景色</label>
        <input v-model="fg" class="tu-input" type="color" />
      </div>
      <div class="tu-field">
        <label class="tu-label">背景色</label>
        <input v-model="bg" class="tu-input" type="color" />
      </div>
    </div>
    <div class="tu-t1">
      <div class="preview" :style="{ background: bg, color: fg }">Aa 文本预览 123</div>
      <div v-if="valid" class="tu-card">
        <div class="tu-card-title">对比度</div>
        <div class="tu-card-value">{{ ratio }}:1</div>
      </div>
      <div v-if="valid" class="tu-grid">
        <div class="tu-card"><div class="tu-card-title">AA 普通文本</div><div :class="passAA(false) ? 'ok' : 'bad'">{{ passAA(false) ? '✓ 通过' : '✗ 不通过' }}</div></div>
        <div class="tu-card"><div class="tu-card-title">AA 大字(≥18px)</div><div :class="passAA(true) ? 'ok' : 'bad'">{{ passAA(true) ? '✓ 通过' : '✗ 不通过' }}</div></div>
        <div class="tu-card"><div class="tu-card-title">AAA 普通文本</div><div :class="passAAA(false) ? 'ok' : 'bad'">{{ passAAA(false) ? '✓ 通过' : '✗ 不通过' }}</div></div>
        <div class="tu-card"><div class="tu-card-title">AAA 大字</div><div :class="passAAA(true) ? 'ok' : 'bad'">{{ passAAA(true) ? '✓ 通过' : '✗ 不通过' }}</div></div>
      </div>
      <p v-else class="tu-error">请选择有效的十六进制颜色。</p>
      <p class="tu-hint">依据 WCAG 2.1 相对亮度算法；普通文本要求 ≥4.5:1，大字(≥18px 或 14px 粗体)要求 ≥3:1。</p>
    </div>
  </div>
</template>

<style scoped>
.preview {
  padding: 24px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  text-align: center;
  font-size: 18px;
  font-weight: 600;
}
.ok { color: var(--color-success); font-weight: 600; }
.bad { color: var(--color-error); font-weight: 600; }
input[type="color"] { width: 100%; height: 40px; padding: 2px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-input); }
</style>
