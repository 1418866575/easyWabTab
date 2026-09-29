/**
 * 密码生成与强度评估纯函数（零依赖，随机源 crypto.getRandomValues）
 */

import { randomBelow } from './ids.ts'

export interface PasswordOptions {
  length?: number
  lower?: boolean
  upper?: boolean
  digit?: boolean
  symbol?: boolean
  excludeSimilar?: boolean
  requireEach?: boolean
}

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
  symbol: '!@#$%^&*()-_=+[]{};:,.?/'
}

const SIMILAR = /[0O1lI|`'"~]/g

function buildPool(o: Required<PasswordOptions>): string {
  let pool = ''
  if (o.lower) pool += SETS.lower
  if (o.upper) pool += SETS.upper
  if (o.digit) pool += SETS.digit
  if (o.symbol) pool += SETS.symbol
  if (o.excludeSimilar) pool = pool.replace(SIMILAR, '')
  return pool
}

/** 生成单个密码 */
export function generatePassword(opts: PasswordOptions = {}): string {
  const o: Required<PasswordOptions> = {
    length: opts.length ?? 16,
    lower: opts.lower !== false,
    upper: opts.upper !== false,
    digit: opts.digit !== false,
    symbol: opts.symbol !== false,
    excludeSimilar: opts.excludeSimilar !== false,
    requireEach: opts.requireEach !== false
  }
  const pool = buildPool(o)
  if (!pool) return ''
  const groups: string[] = []
  if (o.lower) groups.push(SETS.lower)
  if (o.upper) groups.push(SETS.upper)
  if (o.digit) groups.push(SETS.digit)
  if (o.symbol) groups.push(SETS.symbol)
  if (o.excludeSimilar) for (let i = 0; i < groups.length; i++) groups[i] = groups[i].replace(SIMILAR, '')

  const chars: string[] = []
  if (o.requireEach) {
    for (const g of groups) {
      if (!g.length) continue
      chars.push(g[randomBelow(g.length)])
    }
  }
  const len = Math.max(4, Math.min(o.length || 16, 128))
  while (chars.length < len) chars.push(pool[randomBelow(pool.length)])
  // Fisher-Yates 打乱，避免“必含字符”总在前几位
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.slice(0, len).join('')
}

/** 批量生成 */
export function generatePasswords(count: number, opts: PasswordOptions = {}): string[] {
  const n = Math.max(1, Math.min(count || 1, 50))
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(generatePassword(opts))
  return out
}

/** 熵值估算（bits = length * log2(poolSize)） */
export function estimateEntropy(password: string, opts: PasswordOptions = {}): { bits: number; level: string; poolSize: number } {
  const o: Required<PasswordOptions> = {
    length: opts.length ?? password.length,
    lower: opts.lower !== false,
    upper: opts.upper !== false,
    digit: opts.digit !== false,
    symbol: opts.symbol !== false,
    excludeSimilar: opts.excludeSimilar !== false,
    requireEach: opts.requireEach !== false
  }
  const poolSize = buildPool(o).length || 1
  const bits = Math.round(password.length * Math.log2(poolSize))
  let level = '弱'
  if (bits >= 100) level = '极强'
  else if (bits >= 80) level = '强'
  else if (bits >= 60) level = '较强'
  else if (bits >= 40) level = '中等'
  return { bits, level, poolSize }
}

/** 已生成密码的实际字符集分析（用于强度校验展示） */
export function analyzePassword(pwd: string): { length: number; hasLower: boolean; hasUpper: boolean; hasDigit: boolean; hasSymbol: boolean } {
  return {
    length: pwd.length,
    hasLower: /[a-z]/.test(pwd),
    hasUpper: /[A-Z]/.test(pwd),
    hasDigit: /\d/.test(pwd),
    hasSymbol: /[^A-Za-z0-9]/.test(pwd)
  }
}
