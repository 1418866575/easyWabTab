/**
 * 日历构建纯函数（零依赖）+ 中国法定节假日表（可维护）
 * 节假日数据仅覆盖 2025–2026，实际以国务院公布为准，可在本文件内增补。
 */

export type DayKind = 'workday' | 'weekend' | 'holiday' | 'makeup'

export interface DayCell {
  date: string
  day: number
  inMonth: boolean
  kind: DayKind
  label: string
  isToday: boolean
}

/** 节假日：date -> 名称；调休上班日：date -> '班' */
export const HOLIDAYS_2025: Record<string, string> = {
  '2025-01-01': '元旦',
  '2025-01-28': '除夕',
  '2025-01-29': '春节',
  '2025-01-30': '春节',
  '2025-01-31': '春节',
  '2025-02-01': '春节',
  '2025-02-02': '春节',
  '2025-02-03': '春节',
  '2025-02-04': '春节',
  '2025-04-04': '清明',
  '2025-04-05': '清明',
  '2025-04-06': '清明',
  '2025-05-01': '劳动节',
  '2025-05-02': '劳动节',
  '2025-05-03': '劳动节',
  '2025-05-04': '劳动节',
  '2025-05-05': '劳动节',
  '2025-05-31': '端午',
  '2025-06-01': '端午',
  '2025-06-02': '端午',
  '2025-10-01': '国庆',
  '2025-10-02': '国庆',
  '2025-10-03': '国庆',
  '2025-10-04': '国庆',
  '2025-10-05': '国庆',
  '2025-10-06': '国庆',
  '2025-10-07': '国庆',
  '2025-10-08': '国庆'
}

export const HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': '元旦',
  '2026-01-02': '元旦',
  '2026-01-03': '元旦',
  '2026-02-15': '春节',
  '2026-02-16': '春节',
  '2026-02-17': '春节',
  '2026-02-18': '春节',
  '2026-02-19': '春节',
  '2026-02-20': '春节',
  '2026-02-21': '春节',
  '2026-02-22': '春节',
  '2026-04-04': '清明',
  '2026-04-05': '清明',
  '2026-04-06': '清明',
  '2026-05-01': '劳动节',
  '2026-05-02': '劳动节',
  '2026-05-03': '劳动节',
  '2026-05-04': '劳动节',
  '2026-05-05': '劳动节',
  '2026-06-19': '端午',
  '2026-06-20': '端午',
  '2026-06-21': '端午',
  '2026-09-25': '中秋',
  '2026-09-26': '中秋',
  '2026-09-27': '中秋',
  '2026-10-01': '国庆',
  '2026-10-02': '国庆',
  '2026-10-03': '国庆',
  '2026-10-04': '国庆',
  '2026-10-05': '国庆',
  '2026-10-06': '国庆',
  '2026-10-07': '国庆',
  '2026-10-08': '国庆'
}

/** 调休上班日（周末但需上班） */
export const MAKEUP_WORKDAYS: Record<string, string> = {
  '2025-01-26': '班',
  '2025-02-08': '班',
  '2025-04-27': '班',
  '2025-09-28': '班',
  '2025-10-11': '班',
  '2026-02-14': '班',
  '2026-02-28': '班',
  '2026-09-28': '班',
  '2026-10-10': '班'
}

export function holidayMap(year: number): Record<string, string> {
  if (year === 2025) return HOLIDAYS_2025
  if (year === 2026) return HOLIDAYS_2026
  return {}
}

const pad = (n: number) => String(n).padStart(2, '0')
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** 构建月视图（6 行 × 7 列，含前后补齐） */
export function buildMonth(year: number, month: number, weekStart: 1 | 0 = 1): DayCell[] {
  const first = new Date(year, month - 1, 1)
  const startOffset = (first.getDay() - weekStart + 7) % 7
  const today = new Date()
  const todayKey = key(today.getFullYear(), today.getMonth() + 1, today.getDate())
  const holidays = holidayMap(year)
  const cells: DayCell[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  const prevDays = new Date(year, month - 1, 0).getDate()

  for (let i = 0; i < 42; i++) {
    const offset = i - startOffset
    let y = year
    let m = month
    let d = offset + 1
    let inMonth = true
    if (offset < 0) {
      m = month - 1
      if (m < 1) {
        m = 12
        y = year - 1
      }
      d = prevDays + offset + 1
      inMonth = false
    } else if (offset >= daysInMonth) {
      m = month + 1
      if (m > 12) {
        m = 1
        y = year + 1
      }
      d = offset - daysInMonth + 1
      inMonth = false
    }
    const dateKey = key(y, m, d)
    const weekday = new Date(y, m - 1, d).getDay()
    const isWeekend = weekday === 0 || weekday === 6
    let kind: DayKind = isWeekend ? 'weekend' : 'workday'
    let label = ''
    if (inMonth) {
      if (MAKEUP_WORKDAYS[dateKey]) {
        kind = 'makeup'
        label = MAKEUP_WORKDAYS[dateKey]
      } else if (holidays[dateKey]) {
        kind = 'holiday'
        label = holidays[dateKey]
      }
    }
    cells.push({ date: dateKey, day: d, inMonth, kind, label, isToday: inMonth && dateKey === todayKey })
  }
  return cells
}

/** 月份统计 */
export function monthStats(year: number, month: number): { workdays: number; weekends: number; holidays: number; makeup: number } {
  const days = new Date(year, month, 0).getDate()
  const holidays = holidayMap(year)
  let workdays = 0
  let weekends = 0
  let hol = 0
  let makeup = 0
  for (let d = 1; d <= days; d++) {
    const k = key(year, month, d)
    const wd = new Date(year, month - 1, d).getDay()
    const isWeekend = wd === 0 || wd === 6
    if (MAKEUP_WORKDAYS[k]) {
      makeup++
      workdays++
      continue
    }
    if (holidays[k]) {
      hol++
      continue
    }
    if (isWeekend) weekends++
    else workdays++
  }
  return { workdays, weekends, holidays: hol, makeup }
}
