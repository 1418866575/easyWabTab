<script setup lang="ts">
import { ref } from 'vue'
import { downloadBlob } from '../../core/download'

type Tool = 'pen' | 'rect' | 'arrow' | 'text'
interface Shape { tool: Tool; color: string; width: number; pts: { x: number; y: number }[]; text?: string }
const canvas = ref<HTMLCanvasElement | null>(null)
const tool = ref<Tool>('pen')
const color = ref('#ef4444')
const width = ref(3)
const fileInput = ref<HTMLInputElement | null>(null)
const hasImg = ref(false)
let ctx: CanvasRenderingContext2D | null = null
let base: HTMLImageElement | null = null
let scale = 1
const undoStack: Shape[][] = []
let shapes: Shape[] = []
let drawing = false
let cur: Shape | null = null

function draw() {
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.value!.width, canvas.value!.height)
  if (base) ctx.drawImage(base, 0,0, canvas.value!.width, canvas.value!.height)
  else { ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.value!.width,canvas.value!.height) }
  for (const s of shapes) renderShape(s)
  if (cur) renderShape(cur)
}
function renderShape(s: Shape) {
  if (!ctx) return
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  if (s.tool === 'pen') {
    ctx.beginPath(); s.pts.forEach((p,i)=> i? ctx.lineTo(p.x,p.y): ctx.moveTo(p.x,p.y)); ctx.stroke()
  } else if (s.tool === 'rect') {
    const a=s.pts[0], b=s.pts[1]; ctx.strokeRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y))
  } else if (s.tool === 'arrow') {
    const a=s.pts[0], b=s.pts[1]; arrow(a,b)
  } else if (s.tool === 'text' && s.text) {
    ctx.font = `${14*s.width}px sans-serif`; ctx.fillText(s.text, s.pts[0].x, s.pts[0].y)
  }
}
function arrow(a: {x:number;y:number}, b:{x:number;y:number}) {
  if (!ctx) return
  ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke()
  const ang = Math.atan2(b.y-a.y, b.x-a.x)
  const h = 12
  ctx.beginPath(); ctx.moveTo(b.x,b.y)
  ctx.lineTo(b.x-h*Math.cos(ang-Math.PI/6), b.y-h*Math.sin(ang-Math.PI/6))
  ctx.lineTo(b.x-h*Math.cos(ang+Math.PI/6), b.y-h*Math.sin(ang+Math.PI/6))
  ctx.closePath(); ctx.fill()
}
function pos(e: PointerEvent) { const r=canvas.value!.getBoundingClientRect(); return { x:(e.clientX-r.left)/scale, y:(e.clientY-r.top)/scale } }
function down(e: PointerEvent) {
  if (!hasImg.value && !base) return
  drawing = true
  const p = pos(e)
  if (tool.value === 'text') {
    const t = window.prompt('输入文字'); if (t) { shapes.push({tool:'text',color:color.value,width:width.value,pts:[p],text:t}); pushUndo(); draw() }
    drawing = false; return
  }
  cur = { tool: tool.value, color: color.value, width: width.value, pts: [p, p] }
}
function move(e: PointerEvent) {
  if (!drawing || !cur) return
  const p = pos(e)
  if (cur.tool === 'pen') cur.pts.push(p); else cur.pts[1] = p
  draw()
}
function up() {
  if (drawing && cur) { shapes.push(cur); pushUndo() }
  drawing = false; cur = null; draw()
}
function pushUndo() { undoStack.push(JSON.parse(JSON.stringify(shapes))) }
function undo() { shapes = undoStack.pop() || []; draw() }
function clearAll() { shapes = []; undoStack.length = 0; draw() }
function loadFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return
  const img = new Image(); img.onload = () => {
    base = img; scale = 1
    canvas.value!.width = img.naturalWidth; canvas.value!.height = img.naturalHeight
    hasImg.value = true; shapes = []; undoStack.length = 0; draw()
  }
  img.src = URL.createObjectURL(f)
}
function save() { canvas.value?.toBlob(b => { if (b) downloadBlob('annotated.png', b) }, 'image/png') }
</script>

<template>
  <div class="tu-t5">
    <div class="tu-toolbar">
      <div class="tu-seg">
        <button v-for="t in (['pen','rect','arrow','text'] as Tool[])" :key="t" :class="{ 'is-on': tool === t }" @click="tool = t">{{ { pen:'画笔', rect:'矩形', arrow:'箭头', text:'文字' }[t] }}</button>
      </div>
      <input ref="fileInput" type="file" accept="image/*" hidden @change="loadFile" />
      <button class="tu-btn ghost" @click="fileInput?.click()">选择图片</button>
      <button class="tu-btn ghost" @click="undo">撤销</button>
      <button class="tu-btn ghost" @click="clearAll">清空</button>
      <span class="tu-spacer" />
      <label class="tu-label">颜色</label><input v-model="color" type="color" class="c-input" />
      <label class="tu-label">粗细</label><input v-model.number="width" type="range" min="1" max="10" class="tu-range" style="width:90px" />
      <button class="tu-btn" @click="save" :disabled="!hasImg">保存 PNG</button>
    </div>
    <div class="tu-canvas-box tu-checker">
      <canvas ref="canvas" width="800" height="500" class="anno-canvas"
        @pointerdown="down" @pointermove="move" @pointerup="up" @pointerleave="up" />
    </div>
    <p class="tu-hint">先「选择图片」，再使用画笔/矩形/箭头/文字标注；支持撤销与清空。导出 PNG 仅在本机。</p>
  </div>
</template>

<style scoped>
.anno-canvas { touch-action: none; cursor: crosshair; display: block; max-width: 100%; height: auto; }
.c-input { width: 36px; height: 28px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-input); padding: 0; }
</style>
