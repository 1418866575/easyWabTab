/**
 * URL 编解码与参数解析纯函数（零依赖）
 */

export interface UrlParam {
  key: string
  value: string
}

export interface ParsedUrl {
  ok: boolean
  base: string
  params: UrlParam[]
  utm: Record<string, string>
  error?: string
}

/** 编码（component 用 encodeURIComponent，full 用 encodeURI） */
export function encodeUrl(text: string, scope: 'component' | 'full' = 'component'): string {
  return scope === 'full' ? encodeURI(text ?? '') : encodeURIComponent(text ?? '')
}

/** 解码 */
export function decodeUrl(text: string): TextResultLike {
  try {
    return { ok: true, text: decodeURIComponent((text ?? '').replace(/\+/g, ' ')) }
  } catch {
    try {
      return { ok: true, text: decodeURI(text ?? '') }
    } catch {
      return { ok: false, text: '', error: 'URL 解码失败：内容不是合法的百分号编码' }
    }
  }
}

interface TextResultLike {
  ok: boolean
  text: string
  error?: string
}

/** 解析 URL 为 base + 参数列表 + UTM 摘要 */
export function parseUrl(input: string): ParsedUrl {
  const raw = (input ?? '').trim()
  if (!raw) return { ok: false, base: '', params: [], utm: {}, error: '请输入 URL' }
  const hashIdx = raw.indexOf('#')
  const withoutHash = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw
  const qIdx = withoutHash.indexOf('?')
  if (qIdx < 0) return { ok: true, base: raw, params: [], utm: {} }
  const base = withoutHash.slice(0, qIdx)
  const query = withoutHash.slice(qIdx + 1)
  const params: UrlParam[] = []
  query.split('&').forEach(pair => {
    if (!pair) return
    const i = pair.indexOf('=')
    const key = i < 0 ? pair : pair.slice(0, i)
    const value = i < 0 ? '' : pair.slice(i + 1)
    params.push({ key: decodeSafe(key), value: decodeSafe(value) })
  })
  const utm: Record<string, string> = {}
  params.forEach(p => {
    if (p.key.toLowerCase().startsWith('utm_')) utm[p.key.toLowerCase()] = p.value
  })
  return { ok: true, base, params, utm }
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '))
  } catch {
    return s
  }
}

/** 由 base + 参数列表重组 URL */
export function buildUrl(base: string, params: UrlParam[]): string {
  const valid = params.filter(p => p.key)
  if (!valid.length) return base
  const query = valid.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
  return `${base}${base.includes('?') ? '&' : '?'}${query}`
}

/** 参数列表 → 可编辑文本（每行 key=value），便于批量编辑 */
export function paramsToText(params: UrlParam[]): string {
  return params.map(p => `${p.key}=${p.value}`).join('\n')
}

/** 每行 key=value 的文本 → 参数列表 */
export function textToParams(text: string): UrlParam[] {
  return (text || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const i = l.indexOf('=')
      return i < 0 ? { key: l, value: '' } : { key: l.slice(0, i).trim(), value: l.slice(i + 1) }
    })
}
