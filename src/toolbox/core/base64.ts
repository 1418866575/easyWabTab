/**
 * Base64 编解码纯函数（UTF-8 安全，零依赖）
 * 浏览器与 Node 均支持 btoa/atob，配合 TextEncoder/TextDecoder 处理多字节字符。
 */

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export interface TextResult {
  ok: boolean
  text: string
  error?: string
}

/** 文本 → Base64 */
export function encodeBase64(text: string, urlSafe = false): TextResult {
  try {
    const bytes = new TextEncoder().encode(text ?? '')
    let out = toBase64(bytes)
    if (urlSafe) out = toUrlSafe(out)
    return { ok: true, text: out }
  } catch (e) {
    return { ok: false, text: '', error: (e as Error).message }
  }
}

/** Base64 → 文本 */
export function decodeBase64(input: string): TextResult {
  try {
    const cleaned = (input ?? '').trim().replace(/\s+/g, '')
    if (!cleaned) return { ok: false, text: '', error: '请输入待解码内容' }
    const bytes = fromBase64(fromUrlSafe(cleaned))
    return { ok: true, text: new TextDecoder().decode(bytes) }
  } catch {
    return { ok: false, text: '', error: '不是合法的 Base64 内容（可能已损坏或含非法字符）' }
  }
}

export function toUrlSafe(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromUrlSafe(b64: string): string {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return s
}

/** 每 n 字符换行（MIME 风格常用 76） */
export function wrapText(text: string, width: number): string {
  if (width <= 0) return text
  return text.replace(new RegExp(`(.{${width}})`, 'g'), '$1\n').replace(/\n$/, '')
}

/** 自动判断方向：含 base64 特征字符且可解码成功 → 判为解码 */
export function detectMode(text: string): 'encode' | 'decode' {
  const s = (text || '').trim()
  if (!s) return 'encode'
  if (/^[A-Za-z0-9+/=\-_\s]+$/.test(s) && s.length % 4 === 0) return 'decode'
  return 'encode'
}

/** 字节数组 → data URL（图片预览用） */
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${toBase64(bytes)}`
}
