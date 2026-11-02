/**
 * 在线画板纯逻辑：图元定义、绘制与历史栈
 *
 * 绘制需要 CanvasRenderingContext2D，故 drawShape 只能在浏览器里跑；
 * 历史栈（pushHistory / boundingBox）是纯函数，可单测。
 */

export type ShapeType = 'pen' | 'line' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'eraser'

export interface Point {
  x: number
  y: number
}

export interface Shape {
  id: string
  type: ShapeType
  color: string
  width: number
  /** 矩形 / 椭圆是否填充 */
  fill: boolean
  points: Point[]
  text?: string
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function boundingBox(s: Shape): Rect {
  if (!s.points.length) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of s.points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  // 文字图元把「点」当左上角，给出一个最小可见包围盒
  if (s.type === 'text') {
    return { x: minX, y: minY, width: Math.max(20, (s.text?.length ?? 1) * 12), height: 20 }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** 点是否落在图元包围盒内（橡皮擦命中判定用；外扩 pad 便于点中细线） */
export function hitTest(s: Shape, p: Point, pad = 6): boolean {
  const b = boundingBox(s)
  return (
    p.x >= b.x - pad &&
    p.x <= b.x + b.width + pad &&
    p.y >= b.y - pad &&
    p.y <= b.y + b.height + pad
  )
}

/** 命中判断：矩形 / 椭圆可选「只认边框」，避免实心图元整块被擦掉 */
export function hitShape(s: Shape, p: Point): boolean {
  if (!hitTest(s, p, Math.max(6, s.width))) return false
  if ((s.type === 'rect' || s.type === 'ellipse') && s.fill && !isNearBorder(s, p)) return false
  return true
}

function isNearBorder(s: Shape, p: Point): boolean {
  const b = boundingBox(s)
  const t = Math.max(8, s.width)
  const inner = p.x > b.x + t && p.x < b.x + b.width - t && p.y > b.y + t && p.y < b.y + b.height - t
  return !inner
}

export function drawShape(ctx: CanvasRenderingContext2D, s: Shape): void {
  ctx.save()
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.lineWidth = s.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (s.type) {
    case 'pen': {
      if (s.points.length < 2) {
        // 单点视作一个圆点，保证轻点也能留下痕迹
        const p = s.points[0]
        if (p) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, s.width / 2, 0, Math.PI * 2)
          ctx.fill()
        }
        break
      }
      ctx.beginPath()
      ctx.moveTo(s.points[0].x, s.points[0].y)
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y)
      ctx.stroke()
      break
    }
    case 'line': {
      const [a, b] = s.points
      if (!a || !b) break
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      break
    }
    case 'arrow': {
      const [a, b] = s.points
      if (!a || !b) break
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      drawArrowHead(ctx, a, b, s.width)
      break
    }
    case 'rect': {
      const b = boxOf(s.points)
      ctx.beginPath()
      ctx.rect(b.x, b.y, b.width, b.height)
      if (s.fill) ctx.fill()
      else ctx.stroke()
      break
    }
    case 'ellipse': {
      const b = boxOf(s.points)
      ctx.beginPath()
      ctx.ellipse(b.x + b.width / 2, b.y + b.height / 2, Math.abs(b.width / 2), Math.abs(b.height / 2), 0, 0, Math.PI * 2)
      if (s.fill) ctx.fill()
      else ctx.stroke()
      break
    }
    case 'text': {
      const p = s.points[0]
      if (!p || !s.text) break
      ctx.font = `${Math.max(12, s.width * 4)}px ${TEXT_FONT}`
      ctx.textBaseline = 'top'
      ctx.fillText(s.text, p.x, p.y)
      break
    }
    case 'eraser':
      break
  }
  ctx.restore()
}

export const TEXT_FONT = 'system-ui, -apple-system, "Microsoft YaHei", sans-serif'

function boxOf(points: Point[]): Rect {
  const b = boundingBox({ id: '', type: 'rect', color: '', width: 1, fill: false, points })
  return b
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, width: number): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const len = Math.max(10, width * 3)
  const spread = Math.PI / 7
  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - len * Math.cos(angle - spread), to.y - len * Math.sin(angle - spread))
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - len * Math.cos(angle + spread), to.y - len * Math.sin(angle + spread))
  ctx.stroke()
}

export function cloneShapes(list: Shape[]): Shape[] {
  return list.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
}

/** 压入一帧快照；超出上限时丢最旧的（返回新数组，不改原数组） */
export function pushSnapshot(stack: Shape[][], snap: Shape[], limit = 30): Shape[][] {
  const next = stack.concat([cloneShapes(snap)])
  return next.length > limit ? next.slice(next.length - limit) : next
}

/** 弹出栈顶快照；栈空返回 null */
export function popSnapshot(stack: Shape[][]): { snap: Shape[]; stack: Shape[][] } | null {
  if (!stack.length) return null
  return { snap: stack[stack.length - 1], stack: stack.slice(0, -1) }
}
