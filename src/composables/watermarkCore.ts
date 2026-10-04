/**
 * 工作台水印纯函数模块（零 vue/pinia 依赖，可被 node --experimental-strip-types 直测）
 *
 * 渲染思路：平铺用**单个 div 的 background-image 内联 SVG data URI** 实现，
 * 好处是「一个 DOM 节点」即可铺满视口，窗口缩放自动跟随，无需 JS 监听 resize，
 * 且不进入文档流（不影响任何布局）。
 */
import type { WatermarkMode, WatermarkType } from '../types/index.ts'

export interface WatermarkParams {
  type: WatermarkType
  text: string
  image: string
  mode: WatermarkMode
  opacity: number
  fontSize: number
  rotate: number
  gapX: number
  gapY: number
}

/** XML/SVG 文本转义（防注入：水印内容由管理员自定义，需挡住 < > & 与引号） */
export function escapeXml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * 平铺单元的 SVG（data URI 载荷，不含 `url(...)` 包装）
 * - 文字型：文本居中于单元，fill=currentColor 跟随主题色（深浅色自动适配）
 * - 图片型：<image> 铺满单元，保持比例
 * 单元格尺寸取「文字长度/图片固有尺寸」与「用户设定间距」的较大值，保证不重叠裁切。
 */
function tileSvgMarkup(p: WatermarkParams): string {
  // 所有数值先钳制再进 SVG，杜绝 width="NaN" 之类非法属性导致整个水印不渲染
  const fontSize = clampFontSize(p.fontSize)
  const cellW = clampGap(p.gapX, 40, 160)
  const cellH = clampGap(p.gapY, 28, 120)
  // 文字宽度估算：中文按 1em、其余按 0.55em，叠加左右留白
  const textWidth = estimateTextWidth(p.text, fontSize) + 40
  const w = Math.max(cellW, Math.ceil(textWidth))
  const h = Math.max(cellH, Math.ceil(fontSize * 2.6))
  const rot = clampRotate(p.rotate)
  const opacity = clampOpacity(p.opacity)

  if (p.type === 'image' && p.image) {
    // 图片水印：留白由 gap 控制，居中放置且不放大超过单元
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<g transform="rotate(${rot} ${w / 2} ${h / 2})" opacity="${opacity}">` +
      `<image href="${escapeXml(p.image)}" x="8" y="8" width="${w - 16}" height="${h - 16}" ` +
      `preserveAspectRatio="xMidYMid meet"/></g></svg>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<g transform="rotate(${rot} ${w / 2} ${h / 2})" opacity="${opacity}">` +
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="${fontSize}" ` +
    `fill="currentColor" xml:space="preserve">${escapeXml(p.text)}</text></g></svg>`
}

/** 文本像素宽度估算：CJK 与全角按 1em，其余按 0.55em（非字符串/NaN 字号按 0 处理） */
export function estimateTextWidth(text: string, fontSize: number): number {
  const size = Number.isFinite(fontSize) ? fontSize : 0
  let em = 0
  for (const ch of typeof text === 'string' ? text : '') {
    em += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55
  }
  return em * size
}

/**
 * 通用数值钳制：非有限数（NaN / Infinity / null / 字符串）→ 回落 fallback，
 * 合法数字再钳到 [min, max] 并保留 2 位小数。
 * 所有进入 SVG 的数字都必须过这里——否则 NaN 会生成 width="NaN" 的非法 SVG，整个水印失效。
 */
function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100))
}

function clampRotate(v: number): number {
  return num(v, -90, 0, -22)
}
function clampOpacity(v: number): number {
  return num(v, 0.05, 0.5, 0.12)
}
function clampFontSize(v: number): number {
  return num(v, 6, 200, 14)
}
function clampGap(v: number, min: number, fallback: number): number {
  return Math.ceil(num(v, min, 2000, fallback))
}

/** 生成 SVG data URI（用于 background-image） */
export function buildWatermarkDataUri(p: WatermarkParams): string {
  const svg = tileSvgMarkup(p)
  // 需 URI 编码：# % 等字符会截断 URI；用 encodeURIComponent 最稳妥
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
}

/**
 * 是否应当渲染水印：需「开关开启 + 内容非空」。
 * 文字型要求 text.trim() 非空；图片型要求 image 以 data URL 开头。
 * 内容为空时返回 false → 组件用 v-if 不渲染节点 → 页面彻底无水印元素、无残留。
 */
export function shouldRenderWatermark(p: WatermarkParams, enabled: boolean): boolean {
  if (!enabled) return false
  if (p.type === 'image') return /^data:image\//i.test(p.image)
  return p.text.trim().length > 0
}

/** 居中模式的水印内容（文字型；图片型仍走平铺背景，居中时 single 不适用） */
export function centeredWatermarkText(p: WatermarkParams): string {
  return p.text.trim()
}
