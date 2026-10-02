<script setup lang="ts">
import { ref, onMounted } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const angle = ref(0)
let ctx: CanvasRenderingContext2D | null = null
const state = { center: { x: 180, y: 180 }, a: { x: 320, y: 60 }, b: { x: 60, y: 60 } }
let drag: 'center' | 'a' | 'b' | null = null

function dist(px: number, py: number, p: { x: number; y: number }) { return Math.hypot(px - p.x, py - p.y) }
function pick(px: number, py: number): 'center' | 'a' | 'b' | null {
  if (dist(px, py, state.center) < 16) return 'center'
  if (dist(px, py, state.a) < 16) return 'a'
  if (dist(px, py, state.b) < 16) return 'b'
  return null
}
function css(v: string) { return getComputedStyle(document.documentElement).getPropertyValue(v) || '#888' }

function draw() {
  if (!ctx) return
  const c = ctx
  c.clearRect(0, 0, 360, 360)
  c.strokeStyle = css('--color-border')
  c.lineWidth = 1
  c.beginPath(); c.moveTo(state.center.x, state.center.y); c.lineTo(state.a.x, state.a.y); c.stroke()
  c.beginPath(); c.moveTo(state.center.x, state.center.y); c.lineTo(state.b.x, state.b.y); c.stroke()
  const a1 = Math.atan2(state.a.y - state.center.y, state.a.x - state.center.x)
  const a2 = Math.atan2(state.b.y - state.center.y, state.b.x - state.center.x)
  let diff = (a2 - a1) * 180 / Math.PI
  if (diff < 0) diff += 360
  angle.value = Math.round(diff)
  c.strokeStyle = css('--color-primary')
  c.lineWidth = 2
  c.beginPath(); c.arc(state.center.x, state.center.y, 44, a1, a2, diff > 180); c.stroke()
  for (const p of [state.center, state.a, state.b]) {
    c.fillStyle = css('--color-primary')
    c.beginPath(); c.arc(p.x, p.y, 7, 0, Math.PI * 2); c.fill()
  }
  c.fillStyle = css('--color-text')
  c.font = '16px sans-serif'
  c.fillText(angle.value + '°', state.center.x + 54, state.center.y - 8)
}
function pos(e: MouseEvent) {
  const r = canvasRef.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
function down(e: MouseEvent) { const p = pos(e); drag = pick(p.x, p.y) }
function move(e: MouseEvent) { if (!drag) return; const p = pos(e); state[drag].x = p.x; state[drag].y = p.y; draw() }
function up() { drag = null }

onMounted(() => { const cv = canvasRef.value!; ctx = cv.getContext('2d'); draw() })
</script>

<template>
  <div class="tu-t5">
    <div class="tu-canvas-box" style="display:flex;justify-content:center">
      <canvas ref="canvasRef" width="360" height="360" style="touch-action:none;cursor:pointer"
        @mousedown="down" @mousemove="move" @mouseup="up" @mouseleave="up" />
    </div>
    <div class="tu-card" style="text-align:center;max-width:200px;margin:0 auto"><div class="tu-card-title">夹角</div><div class="tu-card-value">{{ angle }}°</div></div>
    <p class="tu-hint">拖动三个圆点（中心点 + 两端点）改变夹角；画布按屏幕像素绘制。</p>
  </div>
</template>
