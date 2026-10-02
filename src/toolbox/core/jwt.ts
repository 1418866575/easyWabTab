/**
 * JWT 解析与验证纯函数（零新增依赖，验签用 crypto-js）
 */

import CryptoJS from 'crypto-js'

export interface JwtSection {
  raw: string
  json: string
  error?: string
}

export interface JwtTimeState {
  hasExp: boolean
  expired: boolean
  hasNbf: boolean
  notYet: boolean
  issuedAt?: number
  expiresAt?: number
  notBefore?: number
}

export interface JwtResult {
  ok: boolean
  parts: number
  header: JwtSection
  payload: JwtSection
  signature: string
  alg: string
  time: JwtTimeState
  error?: string
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Base64URL → UTF-8 字符串 */
export function base64UrlDecode(input: string): string {
  let s = (input || '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  while (s.length % 4) s += '='
  if (!/^[A-Za-z0-9+/=]+$/.test(s)) throw new Error('包含非法字符')
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** UTF-8 字符串 → Base64URL */
export function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 生成（签名）JWT，仅支持 HS256/384/512 */
export interface SignJwtInput {
  payload: Record<string, unknown>
  secret: string
  alg?: 'HS256' | 'HS384' | 'HS512'
  header?: Record<string, unknown>
}
export function signJwt(input: SignJwtInput): { token?: string; error?: string } {
  const { payload, secret, alg = 'HS256', header } = input
  if (!secret) return { error: '请填写签名密钥 secret' }
  const h = { alg, typ: 'JWT', ...(header || {}) }
  const data = `${base64UrlEncode(JSON.stringify(h))}.${base64UrlEncode(JSON.stringify(payload))}`
  let mac: CryptoJS.lib.WordArray
  if (alg === 'HS256') mac = CryptoJS.HmacSHA256(data, secret)
  else if (alg === 'HS384') mac = CryptoJS.HmacSHA384(data, secret)
  else if (alg === 'HS512') mac = CryptoJS.HmacSHA512(data, secret)
  else return { error: `暂不支持 ${alg}` }
  const sig = mac.toString(CryptoJS.enc.Base64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return { token: `${data}.${sig}` }
}

function pretty(raw: string): JwtSection {
  try {
    const json = base64UrlDecode(raw)
    const obj = JSON.parse(json)
    return { raw, json: JSON.stringify(obj, null, 2) }
  } catch (e) {
    return { raw, json: '', error: (e as Error).message }
  }
}

/** 解析 JWT */
export function decodeJwt(token: string, leeway = 0): JwtResult {
  const empty: JwtResult = {
    ok: false,
    parts: 0,
    header: { raw: '', json: '' },
    payload: { raw: '', json: '' },
    signature: '',
    alg: '',
    time: { hasExp: false, expired: false, hasNbf: false, notYet: false }
  }
  const t = (token || '').trim()
  if (!t) return { ...empty, error: '请输入 JWT' }
  const seg = t.split('.')
  if (seg.length !== 3) return { ...empty, parts: seg.length, error: `JWT 应为 3 段，当前 ${seg.length} 段` }
  const header = pretty(seg[0])
  const payload = pretty(seg[1])
  let alg = ''
  try {
    alg = JSON.parse(base64UrlDecode(seg[0])).alg || ''
  } catch {
    alg = ''
  }
  const time: JwtTimeState = { hasExp: false, expired: false, hasNbf: false, notYet: false }
  try {
    const p = JSON.parse(base64UrlDecode(seg[1]))
    const now = Math.floor(Date.now() / 1000)
    if (typeof p.iat === 'number') time.issuedAt = p.iat
    if (typeof p.exp === 'number') {
      time.hasExp = true
      time.expiresAt = p.exp
      time.expired = now > p.exp + leeway
    }
    if (typeof p.nbf === 'number') {
      time.hasNbf = true
      time.notBefore = p.nbf
      time.notYet = now < p.nbf - leeway
    }
  } catch {
    /* payload 非 JSON 时忽略时间判断 */
  }
  return { ok: !header.error && !payload.error, parts: 3, header, payload, signature: seg[2], alg, time }
}

export interface VerifyResult {
  ok: boolean
  reason: string
  supported: boolean
}

/** 校验 HS* 签名；RS/ES 等非对称算法给出不支持说明 */
export function verifyJwt(token: string, secret: string, alg: string): VerifyResult {
  const t = (token || '').trim()
  const seg = t.split('.')
  if (seg.length !== 3) return { ok: false, reason: 'Token 格式不正确', supported: true }
  if (!secret) return { ok: false, reason: '请填写密钥 secret', supported: true }
  const a = (alg || '').toUpperCase()
  if (!a.startsWith('HS')) {
    return { ok: false, reason: `${a || '未知'} 为非对称算法，需公钥/证书，本工具仅支持 HS256/384/512`, supported: false }
  }
  const data = `${seg[0]}.${seg[1]}`
  let expect = ''
  if (a === 'HS256') expect = CryptoJS.HmacSHA256(data, secret).toString(CryptoJS.enc.Base64)
  else if (a === 'HS384') expect = CryptoJS.HmacSHA384(data, secret).toString(CryptoJS.enc.Base64)
  else if (a === 'HS512') expect = CryptoJS.HmacSHA512(data, secret).toString(CryptoJS.enc.Base64)
  else return { ok: false, reason: `暂不支持 ${a}`, supported: false }
  const norm = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return { ok: norm(expect) === norm(seg[2]), reason: norm(expect) === norm(seg[2]) ? '签名一致' : '签名不一致', supported: true }
}

/** 秒级时间戳 → 本地时间字符串 */
export function tsToLocal(sec?: number): string {
  if (typeof sec !== 'number') return '—'
  return new Date(sec * 1000).toLocaleString('zh-CN', { hour12: false })
}

/** 保留 Base64URL 字符集供展示校验 */
export const BASE64URL_CHARS = B64
