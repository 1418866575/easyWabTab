/**
 * Hash / HMAC 纯函数（基于项目已有的 crypto-js）
 * 支持 MD5、SHA-1、SHA-224/256/384/512，HMAC 变体，HEX 大小写切换。
 */

import CryptoJS from 'crypto-js'

export type HashAlg = 'md5' | 'sha1' | 'sha224' | 'sha256' | 'sha384' | 'sha512'

export const HASH_ALGS: { id: HashAlg; name: string }[] = [
  { id: 'md5', name: 'MD5' },
  { id: 'sha1', name: 'SHA-1' },
  { id: 'sha224', name: 'SHA-224' },
  { id: 'sha256', name: 'SHA-256' },
  { id: 'sha384', name: 'SHA-384' },
  { id: 'sha512', name: 'SHA-512' }
]

/**
 * CryptoJS 的 Message 对象（如 MD5/SHA1 的返回值）。
 * `toString(encoder?)` 接受编码器参数并按其输出（Hex/Base64/Utf8...），
 * 省略参数时默认 Hex —— 类型里必须保留这个可选参数，否则 hashText 里的
 * `.toString(CryptoJS.enc.Hex)` 会报 TS2554（Expected 0 arguments, but got 1）。
 */
interface CryptoMessage {
  toString(encoder?: unknown): string
}

function algFn(alg: HashAlg) {
  const map: Record<HashAlg, (m: string) => CryptoMessage> = {
    md5: (m: string) => CryptoJS.MD5(m),
    sha1: (m: string) => CryptoJS.SHA1(m),
    sha224: (m: string) => CryptoJS.SHA224(m),
    sha256: (m: string) => CryptoJS.SHA256(m),
    sha384: (m: string) => CryptoJS.SHA384(m),
    sha512: (m: string) => CryptoJS.SHA512(m)
  }
  return map[alg]
}

function hmacFn(alg: HashAlg) {
  const map: Record<HashAlg, (m: string, k: string) => CryptoMessage> = {
    md5: (m: string, k: string) => CryptoJS.HmacMD5(m, k),
    sha1: (m: string, k: string) => CryptoJS.HmacSHA1(m, k),
    sha224: (m: string, k: string) => CryptoJS.HmacSHA224(m, k),
    sha256: (m: string, k: string) => CryptoJS.HmacSHA256(m, k),
    sha384: (m: string, k: string) => CryptoJS.HmacSHA384(m, k),
    sha512: (m: string, k: string) => CryptoJS.HmacSHA512(m, k)
  }
  return map[alg]
}

/** 计算摘要（HEX） */
export function hashText(text: string, alg: HashAlg, upper = false): string {
  const out = algFn(alg)(text ?? '').toString(CryptoJS.enc.Hex)
  return upper ? out.toUpperCase() : out
}

/** 计算 HMAC（HEX） */
export function hmacText(text: string, key: string, alg: HashAlg, upper = false): string {
  const out = hmacFn(alg)(text ?? '', key ?? '').toString(CryptoJS.enc.Hex)
  return upper ? out.toUpperCase() : out
}

/** 批量计算 */
export function hashMany(
  text: string,
  algs: HashAlg[],
  opts: { upper?: boolean; hmac?: boolean; key?: string } = {}
): { alg: HashAlg; name: string; value: string }[] {
  return HASH_ALGS.filter(a => algs.includes(a.id)).map(a => ({
    alg: a.id,
    name: a.name,
    value: opts.hmac ? hmacText(text, opts.key || '', a.id, opts.upper) : hashText(text, a.id, opts.upper)
  }))
}
