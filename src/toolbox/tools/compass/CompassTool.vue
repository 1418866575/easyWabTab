<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'

const heading = ref<number | null>(null)
const errorMsg = ref('')
let handler: ((e: DeviceOrientationEvent) => void) | null = null

async function enable() {
  errorMsg.value = ''
  const D = window.DeviceOrientationEvent as any
  if (!D) { errorMsg.value = '当前设备 / 浏览器不支持方向传感器'; return }
  try {
    if (typeof D.requestPermission === 'function') {
      const res = await D.requestPermission()
      if (res !== 'granted') { errorMsg.value = '未授权使用方向传感器'; return }
    }
    handler = (e: DeviceOrientationEvent) => {
      const anyE = e as any
      const h = anyE.webkitCompassHeading != null ? anyE.webkitCompassHeading : e.alpha
      if (h != null) heading.value = Math.round(h as number)
    }
    window.addEventListener('deviceorientation', handler)
  } catch (e) { errorMsg.value = '开启失败：' + (e as Error).message }
}
function disable() {
  if (handler) { window.removeEventListener('deviceorientation', handler); handler = null }
  heading.value = null
}
onBeforeUnmount(disable)
</script>

<template>
  <div class="tu-t1" style="align-items:center">
    <div style="position:relative;width:200px;height:200px;border-radius:50%;border:2px solid var(--color-border);display:grid;place-items:center;background:var(--color-bg-input)">
      <div style="position:absolute;top:8px;color:var(--color-text-secondary);font-size:12px">N</div>
      <div :style="{ transform: heading == null ? '' : 'rotate(' + (-heading) + 'deg)', transition: 'transform .2s' }" style="font-size:54px;color:var(--color-primary)">↑</div>
    </div>
    <div class="tu-card" style="text-align:center"><div class="tu-card-title">朝向</div><div class="tu-card-value">{{ heading == null ? '—' : heading + '°' }}</div></div>
    <div class="tu-row">
      <button class="tu-btn" @click="enable">开启指南针</button>
      <button class="tu-btn ghost" @click="disable">停止</button>
    </div>
    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
    <p class="tu-hint">多数桌面浏览器无方向传感器；请在支持的移动设备（HTTPS）上体验，iOS 需点击授权。</p>
  </div>
</template>
