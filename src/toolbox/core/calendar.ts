/**
 * 日历构建纯函数（零依赖）+ 中国法定节假日表（人工维护，不联网）
 *
 * 数据来源：国务院办公厅《关于2026年部分节假日安排的通知》（国办发明电〔2025〕7号，2025-11-04 发布）
 * 与《关于2025年部分节假日安排的通知》（国办发明电〔2024〕8号）。
 * 每年国务院办公厅约在上一年 11 月发布次年安排 —— **跨年后需手工增补新一年的两张表**，
 * 否则holidayMap 返回空对象，日历退化为「纯周末表」（不报错，静默错到用户看不出来）。
 *
 * 2026 安排要点（共 33 天，较2025 年增 5 天）：
 * - 春节 9 天（史上最长）：2/15–2/23，调休 2/14、2/28上班
 * - 国庆 7 天：10/1–10/7，调休 9/20、10/10 上班
 * - 元旦 1/1–1/3（1/4 周日上班）、劳动节 5/1–5/5（5/9 周六上班）
 * - 中秋 9/25–9/27 不调休
 *
 * 维护约定（每次增补都要跑scripts/test-toolbox-core.ts 的日历断言）：
 * 1. 放假区间以官方通知的起止日为准，**不要按「自然 7 天」推算**；
 * 2. 调休上班日必须落在周六或周日 —— 落在工作日是数据录入错误的信号（2026 表曾误写 9/28 周一）；
 * 3. 同一天不得同时出现在放假表与调休表。
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

/** 2026：国办发明电〔2025〕7号。国庆 7 天（10/1–10/7）、春节 9 天（2/15–2/23） */
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
  '2026-02-23': '春节',
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
  '2026-10-07': '国庆'
}

/**
 * 调休上班日（周末但需上班）。
 * 2026：1/4（周日）、2/14（周六）、2/28（周六）、5/9（周六）、9/20（周日）、10/10（周六）
 * —— 中秋 9/25–9/27 为自然连休，不占用周末，故无调休。
 */
export const MAKEUP_WORKDAYS: Record<string, string> = {
  '2025-01-26': '班',
  '2025-02-08': '班',
  '2025-04-27': '班',
  '2025-09-28': '班',
  '2025-10-11': '班',
  '2026-01-04': '班',
  '2026-02-14': '班',
  '2026-02-28': '班',
  '2026-05-09': '班',
  '2026-09-20': '班',
  '2026-10-10': '班'
}

/**
 * 已收录数据的年份（升序）。
 * 供 UI 显式提示「该年份无内置安排」，避免未覆盖年份静默退化成「全是周末」。
 */
export const COVERED_YEARS: readonly number[] = [2025, 2026]

/** 是否为已收录内置安排的年份 */
export function isCoveredYear(year: number): boolean {
  return COVERED_YEARS.includes(year)
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
