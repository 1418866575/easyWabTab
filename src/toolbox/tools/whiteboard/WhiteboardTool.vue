<script setup lang="ts">
/**
 * 在线画板：画笔 / 直线 / 矩形 / 椭圆 / 箭头 / 文字 / 橡皮，撤销重做与导出 PNG
 */
import { computed, onMounted, ref } from 'vue'
import { drawShape, hitShape, popSnapshot, pushSnapshot, TEXT_FONT, type Point, type Shape, type ShapeType } from './whiteboardCore'
import { downloadBlob } from '../../core/download'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const WIDTH = 900
const HEIGHT = 520

const TOOLS: { id: ShapeType; name: string; icon: string }[] = [
  { id: 'pen', name: '画笔', icon: '✏️' },
  { id: 'line', name: '直线', icon: '／' },
  { id: 'arrow', name: '箭头', icon: '➤' },
  { id: 'rect', name: '矩形', icon: '▭' },
  { id: 'ellipse', name: '椭圆', icon: '◯' },
  { id: 'text', name: '文字', icon: '🅰' },
  { id: 'eraser', name: '橡皮', icon: '🧽' }
]

const PALETTE = ['#1f2937', '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']

const canvasRef = ref<HTMLCanvasElement | null>(null)
const ctx = ref<CanvasRenderingContext2D | null>(null)

const tool = ref<ShapeType>('pen')
const color = ref(PALETTE[0])
const lineWidth = ref(3)
const fill = ref(false)

const shapes = ref<Shape[]>([])
const history = ref<Shape[][]>([])
const redoStack = ref<Shape[][]>([])

const drawing = ref(false)
const draft = ref<Shape | null>(null)

/** 文字工具的输入框位置（画布坐标） */
const textAt = ref<Point | null>(null)
const textValue = ref('')

const canUndo = computed(() => history.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

let seq = 0
function nextId(): string {
  seq += 1
  return `s${seq}`
}

function redraw() {
  const c = ctx.value
  const el = canvasRef.value
  if (!c || !el) return
  c.clearRect(0, 0, el.width, el.height)
  c.fillStyle = '#ffffff'
  c.fillRect(0, 0, el.width, el.height)
  for (const s of shapes.value) drawShape(c, s)
  if (draft.value) drawShape(c, draft.value)
}

onMounted(() => {
  const el = canvasRef.value
  if (!el) return
  const dpr = window.devicePixelRatio || 1
  el.width = WIDTH * dpr
  el.height = HEIGHT * dpr
  el.style.width = `${WIDTH}px`
  el.style.height = `${HEIGHT}px`
  const c = el.getContext('2d')
  if (!c) return
  c.scale(dpr, dpr)
  ctx.value = c
  redraw()
})

function pos(e: PointerEvent): Point {
  const el = canvasRef.value
  if (!el) return { x: 0, y: 0 }
  const r = el.getBoundingClientRect()
  return { x: (e.clientX - r.left) * (WIDTH / r.width), y: (e.clientY - r.top) * (HEIGHT / r.height) }
}

function snapshotBeforeEdit() {
  history.value = pushSnapshot(history.value, shapes.value)
  redoStack.value = []
}

function onDown(e: PointerEvent) {
  const p = pos(e)
  if (tool.value === 'text') {
    textAt.value = p
    textValue.value = ''
    return
  }
  if (tool.value === 'eraser') {
    const idx = [...shapes.value].reverse().findIndex((s) => hitShape(s, p))
    if (idx >= 0) {
      snapshotBeforeEdit()
      const real = shapes.value.length - 1 - idx
      shapes.value = shapes.value.filter((_, i) => i !== real)
      redraw()
    }
    return
  }
  drawing.value = true
  draft.value = { id: nextId(), type: tool.value, color: color.value, width: lineWidth.value, fill: fill.value, points: [p] }
}

function onMove(e: PointerEvent) {
  if (!drawing.value || !draft.value) return
  const p = pos(e)
  if (draft.value.type === 'pen') draft.value.points.push(p)
  else draft.value.points[1] = p
  redraw()
}

function onUp() {
  if (!drawing.value || !draft.value) return
  drawing.value = false
  snapshotBeforeEdit()
  shapes.value = shapes.value.concat([draft.value])
  draft.value = null
  redraw()
}

function commitText() {
  const at = textAt.value
  const v = textValue.value.trim()
  if (at && v) {
    snapshotBeforeEdit()
    shapes.value = shapes.value.concat([
      { id: nextId(), type: 'text', color: color.value, width: lineWidth.value, fill: false, points: [at], text: v }
    ])
  }
  textAt.value = null
  textValue.value = ''
  redraw()
}

function cancelText() {
  textAt.value = null
  textValue.value = ''
}

function undo() {
  const r = popSnapshot(history.value)
  if (!r) return
  redoStack.value = pushSnapshot(redoStack.value, shapes.value)
  history.value = r.stack
  shapes.value = r.snap
  redraw()
}

function redo() {
  const r = popSnapshot(redoStack.value)
  if (!r) return
  history.value = pushSnapshot(history.value, shapes.value)
  redoStack.value = r.stack
  shapes.value = r.snap
  redraw()
}

function clearAll() {
  if (!shapes.value.length) return
  if (!window.confirm('确定清空整块画板？此操作不可撤销。')) return
  snapshotBeforeEdit()
  shapes.value = []
  redraw()
}

function exportPng() {
  const el = canvasRef.value
  if (!el) return
  el.toBlob((b) => {
    if (b) downloadBlob(`whiteboard-${Date.now()}.png`, b)
    else toast.error('导出失败')
  }, 'image/png')
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-toolbar">
      <div class="tu-seg">
        <button
          v-for="t in TOOLS"
          :key="t.id"
          type="button"
          :class="{ 'is-on': tool === t.id }"
          :title="t.name"
          @click="tool = t.id"
        >{{ t.icon }}</button>
      </div>

      <div class="wb-swatches">
        <button
          v-for="c in PALETTE"
          :key="c"
          type="button"
          class="wb-color"
          :class="{ 'is-on': color === c }"
          :style="{ background: c }"
          :title="c"
          @click="color = c"
        ></button>
      </div>

      <label class="tu-label wb-inline">粗细 {{ lineWidth }}</label>
      <input v-model.number="lineWidth" type="range" class="tu-range wb-range" min="1" max="24" />

      <label v-if="tool === 'rect' || tool === 'ellipse'" class="tu-check" :class="{ 'is-on': fill }">
        <input v-model="fill" type="checkbox" /> 填充
      </label>

      <span class="tu-spacer"></span>
      <button type="button" class="tu-btn ghost" :disabled="!canUndo" @click="undo">撤销</button>
      <button type="button" class="tu-btn ghost" :disabled="!canRedo" @click="redo">重做</button>
      <button type="button" class="tu-btn ghost" @click="clearAll">清空</button>
      <button type="button" class="tu-btn" @click="exportPng">导出 PNG</button>
    </div>

    <div class="wb-stage">
      <div class="tu-canvas-box">
        <canvas
          ref="canvasRef"
          class="wb-canvas"
          data-testid="tb-whiteboard-canvas"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointerleave="onUp"
        ></canvas>
      </div>

      <div v-if="textAt" class="wb-text-box" :style="{ left: `${textAt.x}px`, top: `${textAt.y}px` }">
        <input
          v-model="textValue"
          type="text"
          class="tu-input wb-text-input"
          :style="{ color, fontFamily: TEXT_FONT }"
          placeholder="输入文字后回车"
          autofocus
          @keyup.enter="commitText"
          @keyup.esc="cancelText"
        />
        <button type="button" class="tu-btn ghost wb-text-btn" @click="commitText">确定</button>
        <button type="button" class="tu-btn ghost wb-text-btn" @click="cancelText">取消</button>
      </div>
    </div>

    <p class="tu-hint">
      共 {{ shapes.length }} 个图元。文字工具：点击画布定位后输入内容并回车；橡皮：点击图元即删除。全部在本地绘制，不会上传。
    </p>
  </div>
</template>

<style scoped>
.wb-inline { margin-bottom: 0; }
.wb-range { width: 110px; }
.wb-swatches { display: flex; gap: 4px; }
.wb-color {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}
.wb-color.is-on { border-color: var(--color-primary); }
.wb-stage { position: relative; align-self: flex-start; }
.wb-canvas { display: block; touch-action: none; cursor: crosshair; }
.wb-text-box { position: absolute; display: flex; gap: 6px; align-items: center; }
.wb-text-input { width: 200px; }
.wb-text-btn {height: 36px;
  padding: 0 12px;
  font-size: var(--fs-caption);}
</style>
