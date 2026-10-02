<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { downloadBlob } from '../../core/download'

const canvas = ref<HTMLCanvasElement | null>(null)
const color = ref('#1e293b')
const width = ref(3)
let ctx: CanvasRenderingContext2D | null = null
let drawing = false
let last = { x: 0, y: 0 }

function setup() {
  const c = canvas.value!
  ctx = c.getContext('2d')
  ctx!.lineCap = 'round'
  ctx!.lineJoin = 'round'
}
function pos(e: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
function start(e: PointerEvent) {
  drawing = true
  last = pos(e)
}
function move(e: PointerEvent) {
  if (!drawing || !ctx) return
  const p = pos(e)
  ctx.strokeStyle = color.value
  ctx.lineWidth = width.value
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  last = p
}
function end() { drawing = false }
function clear() { if (ctx) ctx.clearRect(0, 0, canvas.value!.width, canvas.value!.height) }
function save() {
  const c = canvas.value!
  c.toBlob(b => { if (b) downloadBlob('signature.png', b) }, 'image/png')
}
onMounted(setup)
</script>

<template>
  <div class="tu-t5">
    <div class="tu-canvas-box tu-checker">
      <canvas ref="canvas" width="600" height="260" class="sig-canvas"
        @pointerdown="start" @pointermove="move" @pointerup="end" @pointerleave="end" />
    </div>
    <div class="tu-row">
      <label class="tu-label">颜色</label><input v-model="color" type="color" class="c-input" />
      <label class="tu-label">线宽</label><input v-model.number="width" type="range" min="1" max="12" class="tu-range" style="width:120px" />
      <button class="tu-btn ghost" @click="clear">清除</button>
      <button class="tu-btn" @click="save">保存 PNG</button>
    </div>
    <p class="tu-hint">用鼠标或触摸在框内手写；导出的 PNG 背景透明，可嵌入文档。全程本地。</p>
  </div>
</template>

<style scoped>
.sig-canvas { touch-action: none; cursor: crosshair; display: block; width: 100%; max-width: 600px; height: auto; }
.c-input { width: 40px; height: 30px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-input); padding: 0; }
</style>
