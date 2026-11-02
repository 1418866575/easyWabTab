/**
 * TOTP / HOTP 纯逻辑
 *
 * 实现口径（与 Google Authenticator 一致）：
 * - 密钥为 Base32（RFC 4648），容忍空格与小写
 * - 默认 SHA1 / 6 位 / 30 秒
 * - HOTP 计数为大端 8 字节
 */

export interface OtpAccount {
  id: string
  issuer: string
  account: string
  /** Base32 密钥（存储时由组件加密，这里只处理明文） */
  secret: string
  digits: number
  period: number
  algorithm: 'SHA1' | 'SHA256' | 'SHA512'
}

export interface ParsedUri {
  secret: string
  issuer?: string
  account?: string
  digits: number
  period: number
  algorithm: 'SHA1' | 'SHA256' | 'SHA512'
}

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function normalizeBase32(input: string): string {
  return (input ?? '').toUpperCase().replace(/\s+/g, '').replace(/=+$/, '')
}

export function isValidBase32(input: string): boolean {
  const s = normalizeBase32(input)
  if (!s || s.length % 8 === 1) return false
  return [...s].every((c) => B32_ALPHABET.includes(c))
}

/** Base32 → 字节（非严格：缺位按 0 补齐，够 HMAC 使用） */
export function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const s = normalizeBase32(input)
  const bits = [...s].map((c) => B32_ALPHABET.indexOf(c).toString(2).padStart(5, '0')).join('')
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return new Uint8Array(bytes)
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = ''
  for (const b of bytes) bits += b.toString(2).padStart(8, '0')
  let out = ''
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0')
    out += B32_ALPHABET[parseInt(chunk, 2)]
  }
  return out
}

/** 解析 otpauth:// URI，失败返回 null */
export function parseOtpauthUri(uri: string): ParsedUri | null {
  try {
    const u = new URL((uri ?? '').trim())
    if (u.protocol !== 'otpauth:') return null
    if (u.host !== 'totp' && u.host !== 'hotp') return null
    const secret = normalizeBase32(u.searchParams.get('secret') ?? '')
    if (!isValidBase32(secret)) return null
    const label = decodeURIComponent(u.pathname.replace(/^\//, ''))
    const [issuerPart, accountPart] = label.includes(':') ? label.split(':') : ['', label]
    return {
      secret,
      issuer: u.searchParams.get('issuer') ?? issuerPart ?? '',
      account: accountPart ?? '',
      digits: clampInt(u.searchParams.get('digits'), 6, 6, 8),
      period: clampInt(u.searchParams.get('period'), 30, 5, 300),
      algorithm: pickAlg(u.searchParams.get('algorithm'))
    }
  } catch {
    return null
  }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function pickAlg(raw: string | null): 'SHA1' | 'SHA256' | 'SHA512' {
  const s = (raw ?? '').toUpperCase()
  if (s === 'SHA256') return 'SHA256'
  if (s === 'SHA512') return 'SHA512'
  return 'SHA1'
}

/** HOTP 计数：大端 8 字节 */
function counterBytes(counter: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint32(0, Math.floor(counter / 0x100000000))
  view.setUint32(4, counter >>> 0)
  return new Uint8Array(buf)
}

/**
 * 计算动态口令。HMAC 走 WebCrypto（异步），故这里返回 Promise。
 * 非安全上下文（http 非 localhost）下 crypto.subtle 不可用，会 reject。
 */
export async function hotp(secretBase32: string, counter: number, digits = 6, algorithm: 'SHA1' | 'SHA256' | 'SHA512' = 'SHA1'): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    base32Decode(secretBase32),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes(counter)))
  const offset = sig[sig.length - 1] & 0x0f
  const bin =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff)
  const code = bin % 10 ** digits
  return String(code).padStart(digits, '0')
}

export function counterFor(period: number, now = Date.now()): number {
  return Math.floor(now / 1000 / period)
}

export async function totp(
  secretBase32: string,
  digits = 6,
  period = 30,
  algorithm: 'SHA1' | 'SHA256' | 'SHA512' = 'SHA1',
  now = Date.now()
): Promise<string> {
  return hotp(secretBase32, counterFor(period, now), digits, algorithm)
}

/** 当前周期剩余秒数（1 ~ period） */
export function remainingSeconds(period: number, now = Date.now()): number {
  const p = Math.max(1, Math.trunc(period))
  return p - (Math.floor(now / 1000) % p)
}

export function isWebCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'
}

/** 展示用分组：123456 → "123 456" */
export function groupCode(code: string): string {
  const half = Math.ceil(code.length / 2)
  return `${code.slice(0, half)} ${code.slice(half)}`
}
