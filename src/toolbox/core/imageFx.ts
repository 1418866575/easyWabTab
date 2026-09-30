/**
 * 图片像素处理纯函数（零依赖）
 * 输入输出均为 { data, width, height } 结构（与浏览器 ImageData 兼容），可在 node 直测。
 */

export interface PixelData {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface AdjustOptions {
  brightness?: number
  contrast?: number
  saturation?: number
  hue?: number
  grayscale?: boolean
  blur?: number
  sharpen?: boolean
}

export type PresetId = 'none' | 'vintage' | 'bw' | 'cool' | 'warm' | 'sharpen' | 'invert'

function clone(p: PixelData): PixelData {
  return { data: new Uint8ClampedArray(p.data), width: p.width, height: p.height }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h * 360, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360
  if (s === 0) {
    const v = l * 255
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255]
}

/** 亮度 / 对比度 / 饱和度 / 色相 / 灰度 综合调整 */
export function adjustPixels(src: PixelData, opts: AdjustOptions = {}): PixelData {
  const out = clone(src)
  const d = out.data
  const brightness = opts.brightness ?? 0
  const contrast = opts.contrast ?? 0
  const saturation = opts.saturation ?? 0
  const hue = opts.hue ?? 0
  const gray = !!opts.grayscale
  const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast))
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i]
    let g = d[i + 1]
    let b = d[i + 2]
    if (brightness) {
      r += brightness
      g += brightness
      b += brightness
    }
    if (contrast) {
      r = cFactor * (r - 128) + 128
      g = cFactor * (g - 128) + 128
      b = cFactor * (b - 128) + 128
    }
    if (gray) {
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
      r = g = b = y
    }
    if (saturation || hue) {
      const [h, s, l] = rgbToHsl(clamp255(r), clamp255(g), clamp255(b))
      const ns = Math.max(0, Math.min(1, s + saturation / 100))
      const [nr, ng, nb] = hslToRgb(h + hue, ns, l)
      r = nr
      g = ng
      b = nb
    }
    d[i] = clamp255(r)
    d[i + 1] = clamp255(g)
    d[i + 2] = clamp255(b)
  }
  if (opts.sharpen) return convolve(out, [0, -1, 0, -1, 5, -1, 0, -1, 0])
  if (opts.blur && opts.blur > 0) return boxBlur(out, Math.round(opts.blur))
  return out
}

/** 预设滤镜 */
export function applyPreset(src: PixelData, preset: PresetId): PixelData {
  switch (preset) {
    case 'vintage':
      return adjustPixels(src, { saturation: -25, contrast: 12, brightness: 6 })
    case 'bw':
      return adjustPixels(src, { grayscale: true, contrast: 18 })
    case 'cool':
      return adjustPixels(src, { hue: 18, saturation: 10 })
    case 'warm':
      return adjustPixels(src, { hue: -18, saturation: 10 })
    case 'sharpen':
      return adjustPixels(src, { sharpen: true })
    case 'invert': {
      const out = clone(src)
      for (let i = 0; i < out.data.length; i += 4) {
        out.data[i] = 255 - out.data[i]
        out.data[i + 1] = 255 - out.data[i + 1]
        out.data[i + 2] = 255 - out.data[i + 2]
      }
      return out
    }
    default:
      return clone(src)
  }
}

function boxBlur(src: PixelData, radius: number): PixelData {
  const r = Math.max(1, Math.min(radius, 10))
  const tmp = clone(src)
  const out = clone(src)
  const { width: w, height: h } = src
  // 横向
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r0 = 0
      let g0 = 0
      let b0 = 0
      let n = 0
      for (let k = -r; k <= r; k++) {
        const xx = x + k
        if (xx < 0 || xx >= w) continue
        const i = (y * w + xx) * 4
        r0 += src.data[i]
        g0 += src.data[i + 1]
        b0 += src.data[i + 2]
        n++
      }
      const i = (y * w + x) * 4
      tmp.data[i] = r0 / n
      tmp.data[i + 1] = g0 / n
      tmp.data[i + 2] = b0 / n
      tmp.data[i + 3] = src.data[i + 3]
    }
  }
  // 纵向
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r0 = 0
      let g0 = 0
      let b0 = 0
      let n = 0
      for (let k = -r; k <= r; k++) {
        const yy = y + k
        if (yy < 0 || yy >= h) continue
        const i = (yy * w + x) * 4
        r0 += tmp.data[i]
        g0 += tmp.data[i + 1]
        b0 += tmp.data[i + 2]
        n++
      }
      const i = (y * w + x) * 4
      out.data[i] = r0 / n
      out.data[i + 1] = g0 / n
      out.data[i + 2] = b0 / n
      out.data[i + 3] = tmp.data[i + 3]
    }
  }
  return out
}

function convolve(src: PixelData, kernel: number[]): PixelData {
  const out = clone(src)
  const { width: w, height: h } = src
  const side = Math.sqrt(kernel.length)
  const half = Math.floor(side / 2)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const xx = x + kx
          const yy = y + ky
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          const weight = kernel[(ky + half) * side + (kx + half)]
          const i = (yy * w + xx) * 4
          r += src.data[i] * weight
          g += src.data[i + 1] * weight
          b += src.data[i + 2] * weight
        }
      }
      const i = (y * w + x) * 4
      out.data[i] = clamp255(r)
      out.data[i + 1] = clamp255(g)
      out.data[i + 2] = clamp255(b)
    }
  }
  return out
}

/** 去背景：与目标色距离小于阈值则透明，边缘羽化 */
export function removeBackground(
  src: PixelData,
  target: { r: number; g: number; b: number },
  threshold = 60,
  feather = 1
): PixelData {
  const out = clone(src)
  const { width: w, height: h, data } = src
  const alpha = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const dist = Math.sqrt(
        (data[i] - target.r) ** 2 + (data[i + 1] - target.g) ** 2 + (data[i + 2] - target.b) ** 2
      )
      alpha[y * w + x] = dist <= threshold ? 0 : dist >= threshold + feather * 40 ? 1 : (dist - threshold) / (feather * 40)
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      out.data[i + 3] = Math.round(alpha[y * w + x] * data[i + 3])
    }
  }
  return out
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 按透明像素检测切图区域（雪碧图切分） */
export function detectSpriteRects(src: PixelData, opts: { minGap?: number; minSize?: number } = {}): Rect[] {
  const minGap = opts.minGap ?? 2
  const minSize = opts.minSize ?? 4
  const { width: w, height: h, data } = src
  const opaque = (x: number, y: number) => data[(y * w + x) * 4 + 3] > 8
  const colHas = new Array(w).fill(false)
  const rowHas = new Array(h).fill(false)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (opaque(x, y)) {
        colHas[x] = true
        rowHas[y] = true
      }
    }
  }
  const rects: Rect[] = []
  // 按列分组（连续非透明列 + 允许的间隙）
  let start = -1
  let gap = 0
  for (let x = 0; x <= w; x++) {
    if (x < w && colHas[x]) {
      if (start < 0) start = x
      gap = 0
    } else if (start >= 0) {
      gap++
      if (gap >= minGap || x === w) {
        const x2 = x - gap
        if (x2 - start >= minSize) {
          // 纵向分组
          let ys = -1
          let yg = 0
          for (let y = 0; y <= h; y++) {
            const has = y < h && rowHas[y] && hasContentInBand(start, x2, y)
            if (has) {
              if (ys < 0) ys = y
              yg = 0
            } else if (ys >= 0) {
              yg++
              if (yg >= minGap || y === h) {
                const y2 = y - yg
                if (y2 - ys >= minSize) rects.push({ x: start, y: ys, w: x2 - start, h: y2 - ys })
                ys = -1
                yg = 0
              }
            }
          }
        }
        start = -1
        gap = 0
      }
    }
  }

  function hasContentInBand(x1: number, x2: number, y: number): boolean {
    for (let x = x1; x < x2; x++) if (opaque(x, y)) return true
    return false
  }

  return rects
}

/** 等比缩放到目标最大边 */
export function fitSize(w: number, h: number, maxW?: number, maxH?: number): { w: number; h: number } {
  if (!maxW && !maxH) return { w, h }
  const rw = maxW ? maxW / w : Infinity
  const rh = maxH ? maxH / h : Infinity
  const r = Math.min(rw, rh, 1)
  return { w: Math.max(1, Math.round(w * r)), h: Math.max(1, Math.round(h * r)) }
}
