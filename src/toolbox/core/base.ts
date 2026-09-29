/**
 * 进制转换纯函数（零依赖，BigInt 保证大数精度）
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

export interface BaseResult {
  ok: boolean
  text: string
  error?: string
}

export function isValidBase(base: number): boolean {
  return Number.isInteger(base) && base >= 2 && base <= 36
}

/** 按进制解析为 BigInt（支持负号与下划线分隔） */
export function parseBase(value: string, base: number): bigint {
  const s = (value || '').trim().replace(/[_\s]/g, '')
  if (!s) throw new Error('输入为空')
  let neg = false
  let body = s
  if (body.startsWith('-')) {
    neg = true
    body = body.slice(1)
  } else if (body.startsWith('+')) {
    body = body.slice(1)
  }
  const digits = body.toLowerCase().split('')
  const upper = base <= 10 ? base : 10 + (base - 10)
  let acc = 0n
  const b = BigInt(base)
  for (const ch of digits) {
    const idx = ALPHABET.indexOf(ch)
    if (idx < 0 || idx >= upper) throw new Error(`字符 "${ch}" 不属于 ${base} 进制`)
    acc = acc * b + BigInt(idx)
  }
  return neg ? -acc : acc
}

/** 进制转换 */
export function convertBase(value: string, from: number, to: number): BaseResult {
  try {
    if (!isValidBase(from) || !isValidBase(to)) return { ok: false, text: '', error: '进制需在 2–36 之间' }
    const n = parseBase(value, from)
    const text = n.toString(to)
    return { ok: true, text }
  } catch (e) {
    return { ok: false, text: '', error: (e as Error).message }
  }
}

/** 一次性给出 2/8/10/16 进制一览 */
export function multiBase(value: string, from: number): Record<string, string> {
  try {
    const n = parseBase(value, from)
    return { bin: n.toString(2), oct: n.toString(8), dec: n.toString(10), hex: n.toString(16) }
  } catch {
    return { bin: '', oct: '', dec: '', hex: '' }
  }
}

/** 每 n 位分组（便于阅读二进制/十六进制） */
export function groupDigits(text: string, size: number): string {
  if (size <= 0) return text
  const neg = text.startsWith('-')
  const body = neg ? text.slice(1) : text
  const out = body.replace(new RegExp(`(.{${size}})`, 'g'), '$1 ').trim()
  return (neg ? '-' : '') + out
}
