/**
 * SVG 编辑器纯逻辑：清洗 + 尺寸提取 + 转 PNG
 *
 * 安全约定（渲染前必须过 sanitizeSvg）：
 * - 移除 <script> / <foreignObject> 与所有 on* 事件属性
 * - 移除 javascript: / data:text/html 等危险 URL
 * - 移除外部实体引用（href 指向 http(s) 或 // ）
 */

const TAG_BLOCK = /<\s*(script|foreignObject|iframe|embed|object)\b[\s\S]*?<\s*\/\s*\1\s*>/gi
const TAG_SELF_BLOCK = /<\s*(script|foreignObject|iframe|embed|object)\b[^>]*\/?>/gi
const ON_ATTR = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const DANGER_URL = /(javascript|vbscript|data:text\/html)\s*:/gi
const EXTERNAL_REF = /(href|xlink:href|src)\s*=\s*("|')\s*(https?:)?\/\//gi

export interface SanitizeResult {
  ok: boolean
  svg?: string
  error?: string
}

export function sanitizeSvg(code: string): SanitizeResult {
  const src = (code ?? '').trim()
  if (!src) return { ok: false, error: '内容为空' }
  if (!/<svg[\s>]/i.test(src)) return { ok: false, error: '未找到 <svg> 根元素' }

  let out = src
    .replace(TAG_BLOCK, '')
    .replace(TAG_SELF_BLOCK, '')
    .replace(ON_ATTR, '')
    .replace(DANGER_URL, 'blocked:')
    .replace(EXTERNAL_REF, '$1=$2#')

  // 补齐命名空间，否则序列化后浏览器无法渲染
  if (!/xmlns=/.test(out)) {
    out = out.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  return { ok: true, svg: out }
}

export interface SvgSize {
  width: number
  height: number
}

/** 从 <svg> 标签读取 width/height/viewBox，读不到时回落 300×300 */
export function svgSize(code: string): SvgSize {
  const tag = /<svg\b[^>]*>/i.exec(code)
  const fallback: SvgSize = { width: 300, height: 300 }
  if (!tag) return fallback
  const num = (name: string): number | null => {
    const m = new RegExp(`\\b${name}\\s*=\\s*["']?([\\d.]+)`, 'i').exec(tag[0])
    return m ? Number(m[1]) : null
  }
  const w = num('width')
  const h = num('height')
  if (w && h) return { width: w, height: h }
  const vb = /\bviewBox\s*=\s*["']\s*([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)/i.exec(tag[0])
  if (vb) return { width: Number(vb[3]) || fallback.width, height: Number(vb[4]) || fallback.height }
  return { width: w ?? fallback.width, height: h ?? fallback.height }
}

/** 把 SVG 画到 canvas 导出 PNG（字体需系统本地存在，否则可能回落） */
export function svgToPngDataUrl(svg: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = Math.max(1, Math.min(4096, Math.round(width)))
    const h = Math.max(1, Math.min(4096, Math.round(height)))
    const withSize = svg.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => {
      const cleaned = attrs
        .replace(/\bwidth\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '')
        .replace(/\bheight\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '')
      return `<svg${cleaned} width="${w}" height="${h}">`
    })
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(withSize)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('无法创建画布上下文'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('SVG 渲染失败，请检查代码是否合法'))
    img.src = url
  })
}

export const DEFAULT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <circle cx="100" cy="100" r="80" fill="#4f46e5" />
  <text x="100" y="108" font-size="20" fill="#fff" text-anchor="middle">SVG</text>
</svg>`
