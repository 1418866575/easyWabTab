<script setup lang="ts">
import { ref } from 'vue'

const dpr = window.devicePixelRatio || 1
const width = ref(300)
const dragging = ref(false)
function onDrag(e: MouseEvent) {
  if (!dragging.value) return
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  let x = e.clientX - r.left
  x = Math.max(10, Math.min(r.width - 10, x))
  width.value = Math.round(x)
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-card"><div class="tu-card-title">设备像素比 DPR</div><div class="tu-card-value">{{ dpr }}</div></div>
    <div class="tu-field">
      <label class="tu-label">拖动右端手柄测量长度（CSS 像素）</label>
      <div class="ruler" @mousemove="onDrag" @mouseup="dragging = false" @mouseleave="dragging = false">
        <div class="ruler-bar" :style="{ width: width + 'px' }">
          <span class="ruler-handle" @mousedown="dragging = true" />
        </div>
      </div>
    </div>
    <div class="tu-card" style="text-align:center;max-width:240px"><div class="tu-card-title">测量长度</div><div class="tu-card-value">{{ width }} px ≈ {{ (width * 25.4 / 96).toFixed(1) }} mm</div></div>
    <p class="tu-hint">CSS 像素按 96 DPI 换算毫米，仅供参考；实际物理尺寸取决于屏幕。</p>
  </div>
</template>

<style scoped>
.ruler { padding: 22px 0; }
.ruler-bar {
  position: relative; height: 34px;
  border-left: 2px solid var(--color-primary);
  border-right: 2px solid var(--color-primary);
  background: repeating-linear-gradient(90deg, var(--color-border) 0 1px, transparent 1px 10px);
}
.ruler-handle {
  position: absolute; right: -7px; top: -2px; width: 14px; height: 38px;
  background: var(--color-primary); border-radius: 4px; cursor: ew-resize;
}
</style>
