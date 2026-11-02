/**
 * IMEI 校验与生成纯逻辑
 *
 * 口径：
 * - IMEI（15 位）= TAC 8 位 + SNR 6 位 + CD 校验位 1 位（Luhn，对前 14 位计算）
 * - IMEISV（16 位）= TAC 8 位 + SNR 6 位 + SV 2 位，无校验位
 */

export interface ImeiParts {
  tac: string
  snr: string
  /** IMEI 为校验位；IMEISV 为软件版本号 */
  cd: string
  isSv: boolean
}

export function luhnCheckDigit(body: string): string {
  const digits = body.replace(/\D/g, '')
  if (digits.length !== 14) return ''
  let sum = 0
  for (let i = 0; i < 14; i++) {
    // 从右往左，偶数位（0 起）翻倍
    let d = Number(digits[13 - i])
    if (i % 2 === 0) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return String((10 - (sum % 10)) % 10)
}

export function isValidImei(imei: string): boolean {
  const s = (imei ?? '').replace(/[\s-]/g, '')
  if (!/^\d{15}$/.test(s)) return false
  return luhnCheckDigit(s.slice(0, 14)) === s[14]
}

export function isValidImeisv(v: string): boolean {
  return /^\d{16}$/.test((v ?? '').replace(/[\s-]/g, ''))
}

/** 14 位补全为合法 15 位 IMEI */
export function completeImei(imei14: string): string | null {
  const s = (imei14 ?? '').replace(/\D/g, '')
  if (s.length !== 14) return null
  return s + luhnCheckDigit(s)
}

export function parseImei(input: string): ImeiParts | null {
  const s = (input ?? '').replace(/[\s-]/g, '')
  if (isValidImei(s)) return { tac: s.slice(0, 8), snr: s.slice(8, 14), cd: s.slice(14), isSv: false }
  if (isValidImeisv(s)) return { tac: s.slice(0, 8), snr: s.slice(8, 14), cd: s.slice(14), isSv: true }
  return null
}

export function randomDigits(n: number): string {
  let out = ''
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10)
  return out
}

/** 按前缀批量生成测试用 IMEI（前缀即 TAC，8 位；不足补随机） */
export function generateImeis(tacPrefix: string, count: number): string[] {
  const n = Math.max(1, Math.min(100, Math.trunc(count) || 1))
  const base = (tacPrefix ?? '').replace(/\D/g, '').slice(0, 8)
  if (base.length < 2) return []
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const tac = (base + randomDigits(8 - base.length)).slice(0, 8)
    const body = tac + randomDigits(6)
    out.push(body + luhnCheckDigit(body))
  }
  return out
}

export const MAX_GEN = 100
