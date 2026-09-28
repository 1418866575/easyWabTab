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
