/**
 * 九宫格切图纯逻辑：网格切分矩形计算
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface SliceGrid {
  rows: number
  cols: number
  width: number
  height: number
}

/**
 * 按行列切分，边缘余数分摊到后面的格子（避免出现 1px 的空白尾格）
 * 例：1000 宽 / 3 列 → 334, 333, 333
 */
export function sliceRects(width: number, height: number, rows: number, cols: number): Rect[] {
  const w = Math.max(1, Math.floor(width))
  const h = Math.max(1, Math.floor(height))
  const c = Math.max(1, Math.min(6, Math.floor(cols)))
  const r = Math.max(1, Math.min(6, Math.floor(rows)))
  const colWidths = splitEvenly(w, c)
  const rowHeights = splitEvenly(h, r)
  const out: Rect[] = []
  let y = 0
  for (let ri = 0; ri < r; ri++) {
    let x = 0
    for (let ci = 0; ci < c; ci++) {
      out.push({ x, y, width: colWidths[ci], height: rowHeights[ri] })
      x += colWidths[ci]
    }
    y += rowHeights[ri]
  }
  return out
}

function splitEvenly(total: number, n: number): number[] {
  const base = Math.floor(total / n)
  const rest = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0))
}

/** 切片命名：行优先，从 1 开始，位数按总数补齐（3×3 → 01…09） */
export function sliceName(index: number, total: number, ext = 'png'): string {
  const digits = String(total).length
  return `slice-${String(index + 1).padStart(Math.max(2, digits), '0')}.${ext}`
}

/** 单格边长上限（超过则 UI 提示可能卡顿） */
export const MAX_CELL = 4096
