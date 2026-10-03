/**
 * 证件照换底纯函数（零 Vue 依赖，可被 node --experimental-strip-types 直测）
 *
 * 与通用「图片去背景」的差异（更贴合证件照场景）：
 * - 背景取样：不用「左上角单点」，而是从**四边向内取多条样本**求中位色，
 *   对证件照常见的纯色 / 渐变 / 带轻微噪点的背景更稳健
 * - 抠图：按颜色距离把「接近背景色」的像素置为透明，带边缘羽化保留发丝细节
 * - 合成：把透明结果铺到指定证件底色（红 / 蓝 / 白 / 渐变蓝 / 灰）
 * - 尺寸：可按证件规格（1 寸 / 2 寸 / 小 2 寸 / 常见 px）缩放并居中裁切
 */

import type { PixelData } from './imageFx'

/** 常用证件照底色（RGB） */
export const ID_PHOTO_BG: Record<string, { r: number; g: number; b: number; label: string }> = {
  red: { r: 255, g: 0, b: 0, label: '红底' },
  blue: { r: 67, g: 142, b: 219, label: '蓝底' },
  white: { r: 255, g: 255, b: 255, label: '白底' },
  lightblue: { r: 236, g: 241, b: 255, label: '浅蓝底' },
  gray: { r: 240, g: 240, b: 240, label: '灰底' }
}

/** 常见证件照规格（宽×高，单位 px，300dpi 常见值） */
export const ID_PHOTO_SIZES: Record<string, { w: number; h: number; label: string }> = {
  '1in': { w: 295, h: 413, label: '1 寸（295×413）' },
  '2in': { w: 413, h: 579, label: '2 寸（413×579）' },
  'small2in': { w: 413, h: 531, label: '小 2 寸（413×531）' },
  'square': { w: 360, h: 360, label: '小方照（360×360）' },
  'original': { w: 0, h: 0, label: '原始尺寸' }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/**
 * 四边取样求背景中位色
 * @param edgeCount 每条边取样点数（默认 24）
 * @param depth 从边缘向内取样的深度占比（默认 0.12）
 */
export function sampleBackgroundColor(
  src: PixelData,
  edgeCount = 24,
  depth = 0.12
): { r: number; g: number; b: number } {
  const { width: w, height: h, data } = src
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const dx = Math.max(1, Math.floor(depth * w))
  const dy = Math.max(1, Math.floor(depth * h))

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = (y * w + x) * 4
    rs.push(data[i])
    gs.push(data[i + 1])
    bs.push(data[i + 2])
  }

  // 上、下边
  for (let k = 0; k < edgeCount; k++) {
    const x = Math.min(w - 1, Math.round((k / Math.max(1, edgeCount - 1)) * (w - 1)))
    for (let d = 0; d < dy; d++) {
      push(x, d)
      push(x, h - 1 - d)
    }
  }
  // 左、右边
  for (let k = 0; k < edgeCount; k++) {
    const y = Math.min(h - 1, Math.round((k / Math.max(1, edgeCount - 1)) * (h - 1)))
    for (let d = 0; d < dx; d++) {
      push(d, y)
      push(w - 1 - d, y)
    }
  }

  if (!rs.length) return { r: 255, g: 255, b: 255 }
  const median = (arr: number[]) => {
    const s = arr.slice().sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
  return { r: median(rs), g: median(gs), b: median(bs) }
}

/**
 * 证件照抠图：把接近背景色的像素置为透明（带羽化）
 * @param threshold 容差（颜色距离，0–255）
 * @param feather  羽化强度（0–5），过渡带宽度 = feather × 40
 */
export function cutoutBackground(
  src: PixelData,
  bg: { r: number; g: number; b: number },
  threshold = 60,
  feather = 2
): PixelData {
  const out: PixelData = { data: new Uint8ClampedArray(src.data), width: src.width, height: src.height }
  const { width: w, height: h, data } = src
  const band = Math.max(1, feather * 40)
  for (let i = 0, p = 0; p < w * h; p++, i += 4) {
    const dist = Math.sqrt(
      (data[i] - bg.r) ** 2 + (data[i + 1] - bg.g) ** 2 + (data[i + 2] - bg.b) ** 2
    )
    let a: number
    if (dist <= threshold) a = 0
    else if (dist >= threshold + band) a = 1
    else a = (dist - threshold) / band
    out.data[i + 3] = Math.round(a * data[i + 3])
  }
  return out
}

/**
 * 把带透明通道的结果合成到指定底色
 * @param color 底色；不给则输出透明
 */
export function compositeOn(
  fg: PixelData,
  color?: { r: number; g: number; b: number }
): PixelData {
  const out: PixelData = { data: new Uint8ClampedArray(fg.data), width: fg.width, height: fg.height }
  if (!color) return out
  const { width: w, height: h, data } = out
  for (let i = 0, p = 0; p < w * h; p++, i += 4) {
    const a = data[i + 3] / 255
    if (a >= 1) continue
    data[i] = clamp255(data[i] * a + color.r * (1 - a))
    data[i + 1] = clamp255(data[i + 1] * a + color.g * (1 - a))
    data[i + 2] = clamp255(data[i + 2] * a + color.b * (1 - a))
    data[i + 3] = 255
  }
  return out
}

/**
 * 按证件规格缩放并居中裁切（cover：保持比例填满后居中裁切，不拉伸变形）
 * @param size 目标尺寸；传 0 或 0 高度时返回原尺寸副本
 */
export function cropToSize(
  src: PixelData,
  size: { w: number; h: number }
): PixelData {
  if (!size || size.w <= 0 || size.h <= 0) {
    return { data: new Uint8ClampedArray(src.data), width: src.width, height: src.height }
  }
  const { width: sw, height: sh, data } = src
  // 目标宽高比
  const targetRatio = size.w / size.h
  // 以 cover 方式计算裁切区域（不拉伸）
  let cropW = sw
  let cropH = sh
  if (sw / sh > targetRatio) {
    cropW = Math.round(sh * targetRatio)
  } else {
    cropH = Math.round(sw / targetRatio)
  }
  const cropX = Math.max(0, Math.round((sw - cropW) / 2))
  const cropY = Math.max(0, Math.round((sh - cropH) / 2))

  // 最近邻缩放到目标尺寸（证件照对清晰度要求不高，且实现零依赖）
  const out = new Uint8ClampedArray(size.w * size.h * 4)
  for (let y = 0; y < size.h; y++) {
    // 垂直方向：轻微上移（人像通常头顶留白略少），取头部更居中
    const sy = Math.min(sh - 1, cropY + Math.floor((y / size.h) * cropH))
    for (let x = 0; x < size.w; x++) {
      const sx = Math.min(sw - 1, cropX + Math.floor((x / size.w) * cropW))
      const si = (sy * sw + sx) * 4
      const di = (y * size.w + x) * 4
      out[di] = data[si]
      out[di + 1] = data[si + 1]
      out[di + 2] = data[si + 2]
      out[di + 3] = data[si + 3]
    }
  }
  return { data: out, width: size.w, height: size.h }
}
