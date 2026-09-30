/**
 * 颜色转换纯函数（站内实现，供取色/配色等工具复用）
 */

export interface Rgb { r: number; g: number; b: number }
export interface Hsl { h: number; s: number; l: number }

/** HEX → RGB（支持 #rgb 省略写法以外的 6 位写法） */
export function hexToRgb(hex: string): Rgb {
  const s = (hex || '').replace('#', '')
  return {
    r: parseInt(s.slice(0, 2), 16) || 0,
    g: parseInt(s.slice(2, 4), 16) || 0,
    b: parseInt(s.slice(4, 6), 16) || 0
  }
}

/** RGB → HSL（h: 0-360，s/l: 0-100） */
export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rr = r / 255, gg = g / 255, bb = b / 255
  const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb)
  const d = mx - mn
  const l = (mx + mn) / 2
  let h = 0
  let s = 0
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    if (mx === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0)
    else if (mx === gg) h = (bb - rr) / d + 2
    else h = (rr - gg) / d + 4
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

/** HEX → HSL */
export function hexToHsl(hex: string): Hsl {
  const c = hexToRgb(hex)
  return rgbToHsl(c.r, c.g, c.b)
}

/** HSL → HEX */
export function hslToHex(h: number, s: number, l: number): string {
  const ss = s / 100
  const ll = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = ss * Math.min(ll, 1 - ll)
  const f = (n: number) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to = (x: number) => Math.round(255 * f(x)).toString(16).padStart(2, '0')
  return '#' + to(0) + to(8) + to(4)
}

/* ==================== 扩展：HSV / CMYK / 解析 / WCAG / 配色 ==================== */

export interface Hsv { h: number; s: number; v: number }
export interface Cmyk { c: number; m: number; y: number; k: number }

export interface ColorBundle {
  hex: string
  rgb: Rgb
  hsl: Hsl
  hsv: Hsv
  cmyk: Cmyk
}

/** RGB → HEX */
export function rgbToHex(r: number, g: number, b: number): string {
  const to = (x: number) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')
  return '#' + to(r) + to(g) + to(b)
}

/** RGB → HSV（h 0-360，s/v 0-100） */
export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rr = r / 255, gg = g / 255, bb = b / 255
  const mx = Math.max(rr, gg, bb)
  const mn = Math.min(rr, gg, bb)
  const d = mx - mn
  let h = 0
  if (d) {
    if (mx === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60
    else if (mx === gg) h = ((bb - rr) / d + 2) * 60
    else h = ((rr - gg) / d + 4) * 60
  }
  const s = mx === 0 ? 0 : d / mx
  return { h, s: s * 100, v: mx * 100 }
}

/** HSV → RGB */
export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const hh = ((h % 360) + 360) % 360 / 60
  const ss = s / 100
  const vv = v / 100
  const i = Math.floor(hh)
  const f = hh - i
  const p = vv * (1 - ss)
  const q = vv * (1 - ss * f)
  const t = vv * (1 - ss * (1 - f))
  const map: [number, number, number][] = [
    [vv, t, p],
    [q, vv, p],
    [p, vv, t],
    [p, q, vv],
    [t, p, vv],
    [vv, p, q]
  ]
  const [r, g, b] = map[i % 6]
  return { r: r * 255, g: g * 255, b: b * 255 }
}

/** RGB → CMYK（0-100） */
export function rgbToCmyk(r: number, g: number, b: number): Cmyk {
  const rr = r / 255, gg = g / 255, bb = b / 255
  const k = 1 - Math.max(rr, gg, bb)
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 }
  return {
    c: ((1 - rr - k) / (1 - k)) * 100,
    m: ((1 - gg - k) / (1 - k)) * 100,
    y: ((1 - bb - k) / (1 - k)) * 100,
    k: k * 100
  }
}

/** CMYK → RGB */
export function cmykToRgb(c: number, m: number, y: number, k: number): Rgb {
  const cc = c / 100, mm = m / 100, yy = y / 100, kk = k / 100
  return {
    r: 255 * (1 - cc) * (1 - kk),
    g: 255 * (1 - mm) * (1 - kk),
    b: 255 * (1 - yy) * (1 - kk)
  }
}

const round = (n: number, p = 0) => {
  const f = Math.pow(10, p)
  return Math.round(n * f) / f
}

/** RGB → 全部格式 */
export function bundleFromRgb(rgb: Rgb): ColorBundle {
  const r = Math.round(rgb.r)
  const g = Math.round(rgb.g)
  const b = Math.round(rgb.b)
  return {
    hex: rgbToHex(r, g, b),
    rgb: { r, g, b },
    hsl: { h: round(rgbToHsl(r, g, b).h), s: round(rgbToHsl(r, g, b).s), l: round(rgbToHsl(r, g, b).l) },
    hsv: { h: round(rgbToHsv(r, g, b).h), s: round(rgbToHsv(r, g, b).s), v: round(rgbToHsv(r, g, b).v) },
    cmyk: {
      c: round(rgbToCmyk(r, g, b).c),
      m: round(rgbToCmyk(r, g, b).m),
      y: round(rgbToCmyk(r, g, b).y),
      k: round(rgbToCmyk(r, g, b).k)
    }
  }
}

/** HEX → 全部格式 */
export function bundleFromHex(hex: string): ColorBundle {
  return bundleFromRgb(hexToRgb(hex))
}

/** 校验 HEX */
export function isValidHex(hex: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((hex || '').trim())
}

/** 3 位 HEX 补全为 6 位 */
export function expandHex(hex: string): string {
  let s = (hex || '').trim().replace('#', '')
  if (s.length === 3) s = s.split('').map(c => c + c).join('')
  return '#' + s.toLowerCase()
}

/** 解析任意输入（HEX / rgb() / hsl() / cmyk()）→ 全部格式 */
export function parseColor(input: string): { ok: boolean; bundle?: ColorBundle; error?: string } {
  const s = (input || '').trim()
  if (!s) return { ok: false, error: '请输入颜色值' }
  if (isValidHex(s)) return { ok: true, bundle: bundleFromHex(expandHex(s)) }
  const rgbM = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s)
  if (rgbM) return { ok: true, bundle: bundleFromRgb({ r: +rgbM[1], g: +rgbM[2], b: +rgbM[3] }) }
  const hslM = /^hsla?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%/i.exec(s)
  if (hslM) {
    const hex = hslToHex(+hslM[1], +hslM[2], +hslM[3])
    return { ok: true, bundle: bundleFromHex(hex) }
  }
  const cmykM = /^cmyk\(\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%/i.exec(s)
  if (cmykM) {
    const rgb = cmykToRgb(+cmykM[1], +cmykM[2], +cmykM[3], +cmykM[4])
    return { ok: true, bundle: bundleFromRgb(rgb) }
  }
  return { ok: false, error: '无法识别的颜色格式（支持 #hex / rgb() / hsl() / cmyk()）' }
}

/** 相对亮度（WCAG） */
export function relativeLuminance(rgb: Rgb): number {
  const chan = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b)
}

/** 对比度（1–21） */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

/** WCAG 等级判定 */
export function wcagLevel(ratio: number, large = false): { aa: boolean; aaa: boolean; text: string } {
  const aa = ratio >= (large ? 3 : 4.5)
  const aaa = ratio >= (large ? 4.5 : 7)
  const text = aaa ? 'AAA' : aa ? 'AA' : ratio >= 3 ? '仅大字号 AA' : '不达标'
  return { aa, aaa, text }
}

/** 协调色方案（基于 HSL） */
export function harmonyColors(hex: string): { name: string; hex: string }[] {
  const { h, s, l } = hexToHsl(expandHex(hex))
  const mk = (dh: number, dl = 0) => hslToHex((h + dh + 360) % 360, s, Math.max(0, Math.min(100, l + dl)))
  return [
    { name: '互补色', hex: mk(180) },
    { name: '类似色 A', hex: mk(-30) },
    { name: '类似色 B', hex: mk(30) },
    { name: '三角配色 A', hex: mk(120) },
    { name: '三角配色 B', hex: mk(240) },
    { name: '分裂互补 A', hex: mk(150) },
    { name: '分裂互补 B', hex: mk(210) }
  ]
}

/** 明暗阶梯（10 级） */
export function colorScale(hex: string): string[] {
  const { h, s } = hexToHsl(expandHex(hex))
  const out: string[] = []
  for (let i = 1; i <= 10; i++) out.push(hslToHex(h, s, i * 10 - 5))
  return out
}
