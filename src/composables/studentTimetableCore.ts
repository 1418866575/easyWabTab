// 学生工作台课程表纯逻辑模块。
// 归一化（幂等）+ cell key 编解码 + 时间校验 + 按时间排序。
// 零 vue/pinia 运行时依赖，纯函数。

import type {
  StudentTimetableCell,
  StudentTimetableData,
  StudentTimetableSchedule,
  StudentTimetableTiming
} from '@/types'

/** 课程表数据版本 */
export const TIMETABLE_VERSION = 1

/** 默认每日节数（上午 4 节 + 下午 3 节，支持排到第 7 节） */
export const DEFAULT_PERIODS_PER_DAY = 7
/** 默认学周数 */
export const DEFAULT_WEEKS = 20

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** 空课程表数据 */
export function emptyTimetableData(): StudentTimetableData {
  return {
    version: TIMETABLE_VERSION,
    weeks: DEFAULT_WEEKS,
    periodsPerDay: DEFAULT_PERIODS_PER_DAY,
    classroom: '',
    schedule: {}
  }
}

/** 校验 HH:MM 时间字符串 */
export function isValidTime(v: unknown): v is string {
  return typeof v === 'string' && TIME_RE.test(v)
}

/** 校验结束时间 > 开始时间 */
export function isValidTimeRange(start: string, end: string): boolean {
  if (!isValidTime(start) || !isValidTime(end)) return false
  return end > start
}

/** 归一化单节课 */
export function normalizeCell(raw: unknown): StudentTimetableCell | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const subject = typeof c.subject === 'string' ? c.subject.trim() : ''
  if (!subject) return null
  const startHHMM = isValidTime(c.startHHMM) ? c.startHHMM : ''
  const endHHMM = isValidTime(c.endHHMM) ? c.endHHMM : ''
  if (!startHHMM || !endHHMM) return null
  if (!isValidTimeRange(startHHMM, endHHMM)) return null
  const cell: StudentTimetableCell = { subject, startHHMM, endHHMM }
  if (typeof c.teacher === 'string' && c.teacher.trim()) {
    cell.teacher = Array.from(c.teacher.trim()).slice(0, 20).join('')
  }
  if (typeof c.room === 'string' && c.room.trim()) {
    cell.room = Array.from(c.room.trim()).slice(0, 20).join('')
  }
  // 周次范围（Excel 导入写入，展示层暂不使用）：非法/越界则缺省不写
  const range = normalizeCellWeekRange(c.startWeek, c.endWeek)
  if (range) {
    cell.startWeek = range.startWeek
    cell.endWeek = range.endWeek
  }
  return cell
}

/** 单元格周次范围归一化：缺省 1-52；非法或 start>end 返回 null */
export function normalizeCellWeekRange(
  start: unknown,
  end: unknown
): { startWeek: number; endWeek: number } | null {
  // 两个都没提供 → 不写字段（保持存量数据结构完全不变）
  const missing = (v: unknown) => v === undefined || v === null || v === ''
  if (missing(start) && missing(end)) return null
  const parse = (v: unknown, fallback: number): number | null => {
    if (v === undefined || v === null || v === '') return fallback
    const n = typeof v === 'number' ? v : Number(String(v).trim())
    if (!Number.isFinite(n)) return null
    const i = Math.floor(n)
    if (i < 1 || i > 52) return null
    return i
  }
  const s = parse(start, 1)
  const e = parse(end, 52)
  if (s === null || e === null || s > e) return null
  return { startWeek: s, endWeek: e }
}

/** 归一化课程表数据（幂等） */
export function normalizeTimetableData(raw: unknown): StudentTimetableData {
  const base = emptyTimetableData()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const out: StudentTimetableData = {
    version: typeof o.version === 'number' && o.version > 0 ? o.version : base.version,
    weeks: typeof o.weeks === 'number' && o.weeks >= 1 && o.weeks <= 52 ? Math.floor(o.weeks) : base.weeks,
    periodsPerDay:
      typeof o.periodsPerDay === 'number' && o.periodsPerDay >= 1 && o.periodsPerDay <= 12
        ? Math.floor(o.periodsPerDay)
        : base.periodsPerDay,
    classroom: typeof o.classroom === 'string' ? o.classroom.slice(0, 30) : '',
    schedule: {}
  }
  if (o.schedule && typeof o.schedule === 'object' && !Array.isArray(o.schedule)) {
    const src = o.schedule as Record<string, unknown>
    for (const key of Object.keys(src)) {
      const cell = normalizeCell(src[key])
      if (cell) out.schedule[key] = cell
    }
  }
  return out
}

/** cell key 编码：`${dayOfWeek}_${period}`（day 1-7，period 1-12） */
export function cellKey(dayOfWeek: number, period: number): string {
  return `${dayOfWeek}_${period}`
}

/** cell key 解码 → { day, period }；非法返回 null */
export function parseCellKey(key: string): { day: number; period: number } | null {
  const m = /^(\d+)_(\d+)$/.exec(key)
  if (!m) return null
  const day = Number(m[1])
  const period = Number(m[2])
  if (day < 1 || day > 7 || period < 1 || period > 12) return null
  return { day, period }
}

/** 周几标签（1=周一 ... 7=周日） */
export function weekdayLabel(day: number): string {
  const labels = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
  return labels[day] ?? ''
}

// ============ 学科配色（稳定映射，跨周同色）============
/**
 * 学科 → 主题色。用于课程表格子左色条、软底与文字，提升扫视辨识度。
 * 颜色仅作辅助区分，学科名始终以文字呈现（不靠颜色单通道传达，满足 WCAG 1.4.1）。
 * 自定义学科（不在表内）回退中性色。
 */
export const SUBJECT_COLORS: Record<string, string> = {
  语文: '#ef4444',
  数学: '#3b82f6',
  英语: '#f59e0b',
  物理: '#10b981',
  化学: '#8b5cf6',
  生物: '#14b8a6',
  历史: '#f97316',
  地理: '#06b6d4',
  政治: '#ec4899',
  体育: '#84cc16',
  音乐: '#a855f7',
  美术: '#eab308'
}
/** 自定义/未知学科回退色 */
export const SUBJECT_COLOR_FALLBACK = '#64748b'

/** 取学科主色（含回退） */
export function subjectColor(subject: string): string {
  return SUBJECT_COLORS[subject] ?? SUBJECT_COLOR_FALLBACK
}

/**
 * 生成格子着色用的 CSS 变量集合（--c / --c-soft / --c-strong）。
 * soft = 软底（亮色 12% / 暗色 18% alpha）；strong = 文字色（暗色提亮，保证对比度）。
 * @param isDark 当前是否暗色主题
 */
export function subjectStyleVars(subject: string, isDark: boolean): Record<string, string> {
  const c = subjectColor(subject)
  const n = parseInt(c.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const softAlpha = isDark ? 0.18 : 0.12
  const soft = `rgba(${r}, ${g}, ${b}, ${softAlpha})`
  let sr = r
  let sg = g
  let sb = b
  if (isDark) {
    sr = Math.min(255, r + 60)
    sg = Math.min(255, g + 60)
    sb = Math.min(255, b + 60)
  }
  return { '--c': c, '--c-soft': soft, '--c-strong': `rgb(${sr}, ${sg}, ${sb})` }
}

/** 设置/更新某节课 */
export function setCell(
  schedule: StudentTimetableSchedule,
  day: number,
  period: number,
  cell: StudentTimetableCell
): StudentTimetableSchedule {
  return { ...schedule, [cellKey(day, period)]: cell }
}

/** 清除某节课 */
export function clearCell(
  schedule: StudentTimetableSchedule,
  day: number,
  period: number
): StudentTimetableSchedule {
  const next = { ...schedule }
  delete next[cellKey(day, period)]
  return next
}

/** 获取某节课 */
export function getCell(
  schedule: StudentTimetableSchedule,
  day: number,
  period: number
): StudentTimetableCell | undefined {
  return schedule[cellKey(day, period)]
}

/** 按开始时间排序同日 cell 列表 */
export function sortCellsByStartTime(cells: StudentTimetableCell[]): StudentTimetableCell[] {
  return [...cells].sort((a, b) => a.startHHMM.localeCompare(b.startHHMM))
}

// ==================== 节次时间推算（集中定义区） ====================
// 全部时间算法常量与函数集中在本区块，改这里即全局生效。
// 规则（上午、下午各自独立起算，互不连排）：
//   上午第 N 节（N ≤ morningPeriods）开始 = 上午第一节开始 + (N-1) × (单节时长 + 课间休息)
//   下午第 N 节（N > morningPeriods）开始 = 下午第一节开始 + (N - morningPeriods - 1) × (单节时长 + 课间休息)
//   第 N 节结束 = 第 N 节开始 + 单节时长
// 例：上午首节 08:00、下午首节 14:00、单节 45、休息 10、上午 4 节 →
//     第1节 08:00-08:45，第2节 08:55-09:40，第3节 09:50-10:35，第4节 10:45-11:30
//     第5节 14:00-14:45，第6节 14:55-15:40，第7节 15:50-16:35

/** 默认上午第一节开始时间 */
export const DEFAULT_FIRST_START = '08:00'
/** 默认下午第一节开始时间 */
export const DEFAULT_AFTERNOON_START = '14:00'
/** 默认单节课时长（分钟） */
export const DEFAULT_LESSON_MINUTES = 45
/** 默认课间休息时长（分钟） */
export const DEFAULT_BREAK_MINUTES = 10
/** 默认上午节数（第 1~N 节为上午，其余为下午） */
export const DEFAULT_MORNING_PERIODS = 4

/** 配置取值上下限（归一化钳位用） */
export const TIMING_LIMITS = {
  lessonMinutes: { min: 1, max: 120 },
  breakMinutes: { min: 0, max: 60 },
  morningPeriods: { min: 1, max: 12 }
} as const

/** 默认节次时间配置 */
export function emptyTiming(): StudentTimetableTiming {
  return {
    firstStart: DEFAULT_FIRST_START,
    afternoonStart: DEFAULT_AFTERNOON_START,
    lessonMinutes: DEFAULT_LESSON_MINUTES,
    breakMinutes: DEFAULT_BREAK_MINUTES,
    morningPeriods: DEFAULT_MORNING_PERIODS
  }
}

/** 'HH:MM' → 当日分钟数；非法返回 -1 */
export function timeToMinutes(hhmm: unknown): number {
  if (!isValidTime(hhmm)) return -1
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** 分钟数 → 'HH:MM'（跨天取模，保证落在 00:00-23:59） */
export function minutesToTime(total: number): string {
  const t = ((Math.floor(total) % 1440) + 1440) % 1440
  const h = Math.floor(t / 60)
  const m = t % 60
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

function clampInt(v: unknown, lim: { min: number; max: number }, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback
  return Math.min(lim.max, Math.max(lim.min, n))
}

/** 归一化节次时间配置（幂等，非法/缺失回落默认并钳位） */
export function normalizeTiming(raw: unknown): StudentTimetableTiming {
  const base = emptyTiming()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  return {
    firstStart: isValidTime(o.firstStart) ? o.firstStart : base.firstStart,
    afternoonStart: isValidTime(o.afternoonStart) ? o.afternoonStart : base.afternoonStart,
    lessonMinutes: clampInt(o.lessonMinutes, TIMING_LIMITS.lessonMinutes, base.lessonMinutes),
    breakMinutes: clampInt(o.breakMinutes, TIMING_LIMITS.breakMinutes, base.breakMinutes),
    morningPeriods: clampInt(o.morningPeriods, TIMING_LIMITS.morningPeriods, base.morningPeriods)
  }
}

/**
 * 推算第 N 节课起止时间（1-based）——节次时间算法的唯一入口。
 * 展示、保存、导出一律走此函数，保证与配置始终一致。
 */
export function computePeriodTime(
  period: number,
  timing?: Partial<StudentTimetableTiming>
): { startHHMM: string; endHHMM: string } {
  const t = normalizeTiming({ ...emptyTiming(), ...(timing ?? {}) })
  const p = Math.max(1, Math.floor(period) || 1)
  const step = t.lessonMinutes + t.breakMinutes
  // 下午单独起算：第 (morningPeriods+1) 节 = 下午第一节，从 afternoonStart 开始
  const start =
    p <= t.morningPeriods
      ? timeToMinutes(t.firstStart) + (p - 1) * step
      : timeToMinutes(t.afternoonStart) + (p - t.morningPeriods - 1) * step
  return {
    startHHMM: minutesToTime(start),
    endHHMM: minutesToTime(start + t.lessonMinutes)
  }
}

/** 批量推算第 1~count 节的时间 */
export function computePeriodTimes(
  count: number,
  timing?: Partial<StudentTimetableTiming>
): Array<{ period: number; startHHMM: string; endHHMM: string }> {
  const n = Math.max(0, Math.floor(count) || 0)
  const out: Array<{ period: number; startHHMM: string; endHHMM: string }> = []
  for (let p = 1; p <= n; p++) out.push({ period: p, ...computePeriodTime(p, timing) })
  return out
}

/** 节次归属：第 1~morningPeriods 节为上午，其余为下午 */
export function periodSection(
  period: number,
  timing?: Partial<StudentTimetableTiming>
): 'morning' | 'afternoon' {
  const t = normalizeTiming({ ...emptyTiming(), ...(timing ?? {}) })
  return period <= t.morningPeriods ? 'morning' : 'afternoon'
}

/** 按当前配置把 schedule 内所有 cell 的起止时间重算刷新（改配置后保持数据自洽） */
export function applyTimingToSchedule(
  schedule: StudentTimetableSchedule,
  timing?: Partial<StudentTimetableTiming>
): StudentTimetableSchedule {
  const out: StudentTimetableSchedule = {}
  for (const key of Object.keys(schedule ?? {})) {
    const cell = schedule[key]
    if (!cell) continue
    const parsed = parseCellKey(key)
    out[key] = parsed ? { ...cell, ...computePeriodTime(parsed.period, timing) } : cell
  }
  return out
}
