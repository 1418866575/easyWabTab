/**
 * 日期计算纯逻辑
 *
 * - 日期统一 `YYYY-MM-DD` 字符串，内部用 UTC 构造 Date，避免本地时区导致跨天漂移
 * - 所有函数对非法输入返回 null（调用方据此显示错误），不做静默兜底
 * - 月末溢出钳制：1/31 + 1 个月 → 2/28（闰年 2/29）
 */

// 显式 .ts 后缀：node --experimental-strip-types 直跑测试脚本时才能解析
import { holidayMap, isCoveredYear, MAKEUP_WORKDAYS } from '../../core/calendar.ts'

export const MIN_DATE = '1900-01-01'
export const MAX_DATE = '2100-12-31'

const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isDateStr(s: string): boolean {
  const m = RE_DATE.exec(s)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1) return false
  return d <= daysInMonth(y, mo)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** 解析为 UTC 时间戳；非法返回 null */
export function parseDate(s: string): number | null {
  if (!isDateStr(s)) return null
  const m = RE_DATE.exec(s)!
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${mo}-${dd}`
}

function inRange(s: string): boolean {
  return s >= MIN_DATE && s <= MAX_DATE
}

export function addDays(date: string, n: number): string | null {
  const ts = parseDate(date)
  if (ts === null) return null
  const out = formatDate(ts + Math.trunc(n) * 86400000)
  return inRange(out) ? out : null
}

export function addMonths(date: string, n: number): string | null {
  const ts = parseDate(date)
  if (ts === null) return null
  const d = new Date(ts)
  const y = d.getUTCFullYear()
  const mo = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  const total = y * 12 + (mo - 1) + Math.trunc(n)
  const ny = Math.floor(total / 12)
  const nmo = (total % 12) + 1
  const out = `${ny}-${String(nmo).padStart(2, '0')}-${String(Math.min(day, daysInMonth(ny, nmo))).padStart(2, '0')}`
  return inRange(out) ? out : null
}

export function addYears(date: string, n: number): string | null {
  return addMonths(date, Math.trunc(n) * 12)
}

/** 相隔天数（b - a，可为负）；inclusive=true 时含首尾两天 */
export function diffDays(a: string, b: string, inclusive = false): number | null {
  const ta = parseDate(a)
  const tb = parseDate(b)
  if (ta === null || tb === null) return null
  const raw = Math.round((tb - ta) / 86400000)
  return inclusive ? raw + (raw >= 0 ? 1 : -1) : raw
}

/** 0=周日 … 6=周六 */
export function weekdayOf(date: string): number | null {
  const ts = parseDate(date)
  return ts === null ? null : new Date(ts).getUTCDay()
}

export const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/**
 * 两个日期之间的工作日天数（含首尾）
 * 节假日表来源于 `core/calendar`（仅覆盖 2025/2026），未覆盖年份只排除周末。
 */
export function workdaysBetween(a: string, b: string): { workdays: number; total: number; uncovered: boolean } | null {
  const ta = parseDate(a)
  const tb = parseDate(b)
  if (ta === null || tb === null) return null
  const start = Math.min(ta, tb)
  const end = Math.max(ta, tb)
  let workdays = 0
  let total = 0
  let uncovered = false
  for (let t = start; t <= end; t += 86400000) {
    const s = formatDate(t)
    total++
    const y = Number(s.slice(0, 4))
    if (!isCoveredYear(y)) {
      uncovered = true
      const wd = new Date(t).getUTCDay()
      if (wd !== 0 && wd !== 6) workdays++
      continue
    }
    // 调休上班日优先：周末也要上班，直接计为工作日
    if (MAKEUP_WORKDAYS[s]) {
      workdays++
      continue
    }
    // 法定节假日（含调休连休）不计
    if (holidayMap(y)[s]) continue
    const wd = new Date(t).getUTCDay()
    if (wd === 0 || wd === 6) continue
    workdays++
  }
  return { workdays, total, uncovered }
}
