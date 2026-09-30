/**
 * ID 生成与解析纯函数（零依赖，随机源为 crypto.getRandomValues）
 * 支持 UUID v4 / v7、NanoID、ULID、ObjectId、短 ID，以及 UUID 解析。
 */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const NANO_DEFAULT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const SHORT_DEFAULT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function randBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(out)
  else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256)
  return out
}

/** 无偏随机整数 [0, max) —— 拒绝采样避免取模偏差 */
export function randomBelow(max: number): number {
  if (max <= 0) return 0
  const limit = Math.floor(0xffffffff / max) * max
  const buf = new Uint32Array(1)
  let v = 0
  do {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf)
    else buf[0] = Math.floor(Math.random() * 0xffffffff)
    v = buf[0]
  } while (v >= limit)
  return v % max
}

const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('')

/** UUID v4 */
export function uuidV4(): string {
  const b = randBytes(16)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = hex(b)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** UUID v7（毫秒时间戳 + 随机） */
export function uuidV7(now = Date.now()): string {
  const b = randBytes(16)
  const ts = BigInt(now)
  for (let i = 0; i < 6; i++) b[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn)
  b[6] = (b[6] & 0x0f) | 0x70
  b[8] = (b[8] & 0x3f) | 0x80
  const h = hex(b)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** NanoID */
export function nanoid(size = 21, alphabet = NANO_DEFAULT): string {
  const n = Math.max(1, Math.min(size || 21, 64))
  let out = ''
  for (let i = 0; i < n; i++) out += alphabet[randomBelow(alphabet.length)]
  return out
}

/** 短 ID（默认字母数字） */
export function shortId(len = 12, alphabet = SHORT_DEFAULT): string {
  return nanoid(len, alphabet)
}

/** ULID：10 位时间戳 + 16 位随机（Crockford Base32） */
export function ulid(now = Date.now()): string {
  let out = ''
  let t = now
  for (let i = 0; i < 10; i++) {
    out = CROCKFORD[t % 32] + out
    t = Math.floor(t / 32)
  }
  const b = randBytes(10)
  let bits = 0
  let value = 0
  for (let i = 0; i < 16; i++) {
    if (bits < 5) {
      value = (value << 8) | b[Math.floor((i * 5) / 8)]
      bits += 8
    }
    out += CROCKFORD[(value >>> (bits - 5)) & 31]
    bits -= 5
  }
  return out
}

/** MongoDB ObjectId */
export function objectId(): string {
  const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0')
  const rnd = hex(randBytes(5))
  const counter = hex(randBytes(3))
  return ts + rnd + counter
}

export type IdType = 'uuid-v4' | 'uuid-v7' | 'nanoid' | 'ulid' | 'objectid' | 'short'

let objectIdCounter = 0

/** 按类型生成单个 ID */
export function genId(type: IdType, opts: { nanoidSize?: number; shortSize?: number } = {}): string {
  switch (type) {
    case 'uuid-v4':
      return uuidV4()
    case 'uuid-v7':
      return uuidV7()
    case 'nanoid':
      return nanoid(opts.nanoidSize ?? 21)
    case 'ulid':
      return ulid()
    case 'objectid':
      objectIdCounter = (objectIdCounter + 1) % 0xffffff
      return objectId()
    case 'short':
    default:
      return shortId(opts.shortSize ?? 12)
  }
}

/** 批量生成 */
export function genIds(type: IdType, count = 5, opts: { nanoidSize?: number; shortSize?: number; uppercase?: boolean } = {}): string[] {
  const n = Math.max(1, Math.min(count || 1, 100))
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const v = genId(type, opts)
    out.push(opts.uppercase ? v.toUpperCase() : v)
  }
  return out
}

export interface UuidInfo {
  ok: boolean
  version?: number
  variant?: string
  time?: string
  error?: string
}

/** 解析 UUID（v1/v7 可提取时间） */
export function parseUuid(input: string): UuidInfo {
  const s = (input || '').trim()
  const clean = s.replace(/[{}]/g, '')
  if (!/^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/.test(clean)) {
    return { ok: false, error: '不是合法的 UUID 格式' }
  }
  const h = clean.replace(/-/g, '').toLowerCase()
  const version = parseInt(h[12], 16)
  const variantChar = h[16]
  const variant = /^[89ab]$/.test(variantChar) ? 'RFC 4122' : '其他'
  let time: string | undefined
  if (version === 7 || version === 1) {
    if (version === 7) {
      const ms = parseInt(h.slice(0, 12), 16)
      if (Number.isFinite(ms)) time = new Date(ms).toLocaleString('zh-CN', { hour12: false })
    } else {
      const timeLow = parseInt(h.slice(0, 8), 16)
      const timeMid = parseInt(h.slice(8, 12), 16)
      const timeHigh = parseInt(h.slice(13, 16), 16)
      const ts100ns = (BigInt(timeHigh) << 48n) + (BigInt(timeMid) << 32n) + BigInt(timeLow)
      const ms = Number((ts100ns - 122192928000000000n) / 10000n)
      if (Number.isFinite(ms)) time = new Date(ms).toLocaleString('zh-CN', { hour12: false })
    }
  }
  return { ok: true, version, variant, time }
}
