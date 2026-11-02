/**
 * 印章生成器纯逻辑：圆章 / 方章 / 椭圆章 SVG 构建
 *
 * 字体依赖系统字体栈（宋 / 楷 / 黑），缺失时由浏览器回落；
 * 做旧用蒙版随机点阵（0~100 强度），导出透明 PNG。
 */

export type SealShape = 'round' | 'square' | 'ellipse'
export type SealFont = 'song' | 'kai' | 'hei'

export interface SealOpts {
  shape: SealShape
  /** 主文字（1~4 字，印章正文） */
  text: string
  /** 副文字（可选，如「合同专用」） */
  subText: string
  color: string
  font: SealFont
  /** 做旧强度 0~100 */
  grunge: number
}

export const FONT_STACKS: Record<SealFont, string> = {
  song: "'SimSun','Songti SC','STSong','NSimSun',serif",
  kai: "'KaiTi','Kaiti SC','STKaiti',serif",
  hei: "'SimHei','Heiti SC','STHeiti',sans-serif"
}

export const SHAPES: { id: SealShape; name: string }[] = [
  { id: 'round', name: '圆章' },
  { id: 'square', name: '方章' },
  { id: 'ellipse', name: '椭圆章' }
]

export const SEAL_COLORS = ['#d0342c', '#c2185b', '#1e5bb8', '#1c7a4a', '#333333']

export const MAX_TEXT = 4
export const MAX_SUB = 12

/** 清洗输入：去空白、截断字数 */
export function normalizeText(t: string, max: number): string {
  return (t ?? '').replace(/\s+/g, '').slice(0, max)
}

function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 做旧蒙版：随机点阵把笔画"擦"出斑驳感（同一 seed 可复现） */
function grungeMask(strength: number): string {
  const s = Math.max(0, Math.min(100, Math.trunc(strength)))
  if (!s) return ''
  const seed = s * 7919 + 13
  const rand = () => {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }
  let dots = ''
  const count = Math.round((s / 100) * 260)
  for (let i = 0; i < count; i++) {
    const r = 1 + rand() * 3.2
    dots += `<circle cx="${(rand() * 200).toFixed(1)}" cy="${(rand() * 200).toFixed(1)}" r="${r.toFixed(1)}" fill="#000"/>`
  }
  return `<mask id="gm"><rect width="200" height="200" fill="#fff"/>${dots}</mask>`
}

/** 圆章：主文字沿顶部圆弧排布（≤2 字居中），副文字居中靠下 */
function buildRound(o: SealOpts): string {
  const chars = Array.from(o.text)
  let main = ''
  if (chars.length <= 2) {
    const fs = chars.length === 1 ? 78 : 62
    const y = chars.length === 1 ? 128 : 118
    main = `<text x="100" y="${y}" text-anchor="middle" font-family="${FONT_STACKS[o.font]}" font-size="${fs}" font-weight="700" fill="${o.color}">${esc(o.text)}</text>`
  } else {
    const r = 68
    const fs = chars.length === 4 ? 40 : 46
    const start = -Math.PI / 2 - ((chars.length - 1) * 0.52) / 2
    main = chars
      .map((ch, i) => {
        const a = start + i * 0.52
        const x = 100 + r * Math.cos(a)
        const y = 100 + r * Math.sin(a)
        return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_STACKS[o.font]}" font-size="${fs}" font-weight="700" fill="${o.color}" transform="rotate(${((a + Math.PI / 2) * 180) / Math.PI} ${x.toFixed(1)} ${y.toFixed(1)})">${esc(ch)}</text>`
      })
      .join('')
  }
  const sub = o.subText
    ? `<text x="100" y="152" text-anchor="middle" font-family="${FONT_STACKS[o.font]}" font-size="17" fill="${o.color}">${esc(o.subText)}</text>`
    : ''
  return `<circle cx="100" cy="100" r="94" fill="none" stroke="${o.color}" stroke-width="7"/>
<circle cx="100" cy="100" r="84" fill="none" stroke="${o.color}" stroke-width="2"/>${main}${sub}`
}

/** 方章：1~4 字按 2×2 或竖排居中 */
function buildSquare(o: SealOpts): string {
  const chars = Array.from(o.text)
  const fs = chars.length <= 2 ? 72 : 56
  let main = ''
  if (chars.length <= 1) {
    main = `<text x="100" y="100" text-anchor="middle" dominant-baseline="central" font-family="${FONT_STACKS[o.font]}" font-size="${fs}" font-weight="700" fill="${o.color}">${esc(o.text)}</text>`
  } else if (chars.length === 2) {
    main = `<text x="100" y="86" text-anchor="middle" dominant-baseline="central" font-family="${FONT_STACKS[o.font]}" font-size="${fs}" font-weight="700" fill="${o.color}">${esc(chars[0])}</text>
<text x="100" y="152" text-anchor="middle" dominant-baseline="central" font-family="${FONT_STACKS[o.font]}" font-size="${fs}" font-weight="700" fill="${o.color}">${esc(chars[1])}</text>`
  } else {
    const grid = chars.length === 3 ? [[chars[0], ''], [chars[1], chars[2]]] : [[chars[0], chars[1]], [chars[2], chars[3]]]
    main = grid
      .map((row, ri) =>
        row
          .map((ch, ci) =>
            ch
              ? `<text x="${68 + ci * 64}" y="${68 + ri * 64}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_STACKS[o.font]}" font-size="${fs}" font-weight="700" fill="${o.color}">${esc(ch)}</text>`
              : ''
          )
          .join('')
      )
      .join('')
  }
  const sub = o.subText
    ? `<text x="100" y="188" text-anchor="middle" font-family="${FONT_STACKS[o.font]}" font-size="14" fill="${o.color}">${esc(o.subText)}</text>`
    : ''
  return `<rect x="8" y="8" width="184" height="184" rx="14" fill="none" stroke="${o.color}" stroke-width="7"/>${main}${sub}`
}

/** 椭圆章：横向椭圆边框 + 竖排主文字 */
function buildEllipse(o: SealOpts): string {
  const chars = Array.from(o.text)
  const fs = 44
  const startY = chars.length > 1 ? 100 - ((chars.length - 1) * fs) / 2 : 100
  const main = chars
    .map((ch, i) =>
      `<text x="100" y="${(startY + i * fs).toFixed(0)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_STACKS[o.font]}" font-size="${fs}" font-weight="700" fill="${o.color}">${esc(ch)}</text>`
    )
    .join('')
  const sub = o.subText
    ? `<text x="100" y="168" text-anchor="middle" font-family="${FONT_STACKS[o.font]}" font-size="15" fill="${o.color}">${esc(o.subText)}</text>`
    : ''
  return `<ellipse cx="100" cy="100" rx="92" ry="66" fill="none" stroke="${o.color}" stroke-width="7"/>${main}${sub}`
}

export function buildSealSvg(opts: SealOpts): string {
  const text = normalizeText(opts.text, MAX_TEXT)
  const sub = normalizeText(opts.subText, MAX_SUB)
  const body = opts.shape === 'square' ? buildSquare({ ...opts, text, subText: sub })
    : opts.shape === 'ellipse' ? buildEllipse({ ...opts, text, subText: sub })
    : buildRound({ ...opts, text, subText: sub })
  const mask = grungeMask(opts.grunge)
  const maskAttr = opts.grunge ? ' mask="url(#gm)"' : ''
  const maskDef = mask ? `<defs>${mask}</defs>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${maskDef}<g${maskAttr}>${body}</g></svg>`
}

export function svgToDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

/** 印章 SVG → 指定尺寸透明 PNG dataURL */
export async function sealPngDataUrl(svg: string, size = 600): Promise<string> {
  const sized = svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
    const cleaned = attrs
      .replace(/\bwidth\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '')
      .replace(/\bheight\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '')
    return `<svg${cleaned} width="${size}" height="${size}">`
  })
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('印章渲染失败'))
    img.src = svgToDataUrl(sized)
  })
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  ctx.drawImage(img, 0, 0, size, size)
  return canvas.toDataURL('image/png')
}
