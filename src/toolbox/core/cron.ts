/**
 * Cron 表达式解析纯函数（零依赖）
 * 支持 5 段（分 时 日 月 周）与 6 段（秒 分 时 日 月 周）
 * 语法：星号、星号+n（步长）、a、a-b、a-b/n（区间步长）、a,b,c（枚举）
 */

export interface CronField {
  name: string
  raw: string
  values: number[]
  text: string
  min: number
  max: number
  error?: string
  /** 扩展语法标记：L（最后一天）/ L-n / nW / LW / nL（当月最后一个星期 n）/ n#m（第 m 个星期 n） */
  special?: string
}

export interface CronResult {
  ok: boolean
  fields: CronField[]
  description: string
  next: string[]
  error?: string
}

const FIELDS_5: { name: string; min: number; max: number }[] = [
  { name: '分钟', min: 0, max: 59 },
  { name: '小时', min: 0, max: 23 },
  { name: '日', min: 1, max: 31 },
  { name: '月', min: 1, max: 12 },
  { name: '星期', min: 0, max: 7 }
]

const FIELDS_6: { name: string; min: number; max: number }[] = [
  { name: '秒', min: 0, max: 59 },
  ...FIELDS_5
]

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

/**
 * 解析单段
 * 基础语法：星号、星号+n（步长）、a、a-b、a-b/n（区间步长）、a,b,c（枚举）
 * 扩展语法（Quartz 风格）：?（同星号）、日字段 L / L-n / nW / LW、星期字段 nL / n#m
 */
export function parseField(
  raw: string,
  min: number,
  max: number
): { values: number[]; error?: string; special?: string } {
  const text = (raw || '').trim()
  if (/[LW#?]/.test(text)) return parseSpecialField(text, min, max)
  return parseNumericField(text, min, max)
}

/** 扩展语法解析：返回 special 标记，values 给出展示用的取值集合 */
function parseSpecialField(
  raw: string,
  min: number,
  max: number
): { values: number[]; error?: string; special?: string } {
  const up = raw.toUpperCase()
  const all: number[] = []
  for (let v = min; v <= max; v++) all.push(v)

  if (up === '?') return { values: all }
  if (up === 'L') return { values: all, special: 'L' }
  if (up === 'LW') return { values: all, special: 'LW' }
  // L-n：倒数第 n 天
  const lm = /^L-(\d{1,2})$/.exec(up)
  if (lm) {
    const n = Number(lm[1])
    if (n >= 1 && n <= 30) return { values: all, special: `L-${n}` }
    return { values: [], error: `L-n 的 n 需在 1-30：${raw}` }
  }
  // nW：最接近 n 号的工作日
  const wm = /^(\d{1,2})W$/.exec(up)
  if (wm) {
    const n = Number(wm[1])
    if (n >= min && n <= max) return { values: [n], special: `${n}W` }
    return { values: [], error: `${n}W 超出取值范围（${min}-${max}）` }
  }
  // nL：当月最后一个星期 n（仅星期字段有意义）
  const nl = /^(\d)L$/.exec(up)
  if (nl) {
    const n = Number(nl[1])
    if (n >= min && n <= max) return { values: [n], special: `${n}L` }
    return { values: [], error: `${n}L 超出取值范围（${min}-${max}）` }
  }
  // n#m：第 m 个星期 n
  const hm = /^(\d)#(\d)$/.exec(up)
  if (hm) {
    const n = Number(hm[1])
    const m = Number(hm[2])
    if (n >= min && n <= max && m >= 1 && m <= 5) return { values: [n], special: `${n}#${m}` }
    return { values: [], error: `n#m 取值非法：${raw}（n 为 ${min}-${max}，m 为 1-5）` }
  }
  return { values: [], error: `无法识别的扩展语法：${raw}` }
}

/** 基础数值语法解析（原实现，行为保持不变） */
function parseNumericField(
  raw: string,
  min: number,
  max: number
): { values: number[]; error?: string } {
  const values = new Set<number>()
  const parts = raw.split(',')
  for (const part of parts) {
    const p = part.trim()
    if (!p) return { values: [], error: '存在空字段' }
    const [range, stepRaw] = p.split('/')
    const step = stepRaw === undefined ? 1 : Number(stepRaw)
    if (!Number.isInteger(step) || step < 1) return { values: [], error: `步长非法：${p}` }
    let start: number
    let end: number
    if (range === '*') {
      start = min
      end = max
    } else if (range.includes('-')) {
      const [a, b] = range.split('-')
      start = Number(a)
      end = Number(b)
      if (!Number.isInteger(start) || !Number.isInteger(end)) return { values: [], error: `范围非法：${p}` }
    } else {
      start = Number(range)
      end = stepRaw === undefined ? start : max
      if (!Number.isInteger(start)) return { values: [], error: `数值非法：${p}` }
    }
    if (start < min || end > max || start > end) return { values: [], error: `超出取值范围（${min}-${max}）：${p}` }
    for (let v = start; v <= end; v += step) values.add(v)
  }
  const out = [...values].sort((a, b) => a - b)
  if (!out.length) return { values: [], error: `无有效取值：${raw}` }
  return { values: out }
}

function describeField(f: CronField): string {
  const all = f.values.length === f.max - f.min + 1 || (f.name === '星期' && f.values.length === 8)
  if (all) return '每' + (f.name === '星期' ? '天' : f.name.replace('分钟', '分钟').replace('小时', '小时'))
  if (f.name === '月') return f.values.map(v => MONTH_NAMES[v - 1]).join('、')
  if (f.name === '星期') return f.values.map(v => WEEK_NAMES[v]).join('、')
  if (f.values.length > 1 && isStep(f.values)) return `每 ${f.values[1] - f.values[0]} ${f.name}`
  return f.values.join('、')
}

function isStep(vals: number[]): boolean {
  if (vals.length < 2) return false
  const d = vals[1] - vals[0]
  return vals.every((v, i) => i === 0 || v - vals[i - 1] === d)
}

/** 解析完整表达式 */
export function parseCron(expr: string, six = false, base = new Date(), count = 5): CronResult {
  const raw = (expr || '').trim()
  if (!raw) return { ok: false, fields: [], description: '', next: [], error: '请输入 Cron 表达式' }
  const seg = raw.split(/\s+/)
  const defs = six ? FIELDS_6 : FIELDS_5
  if (seg.length !== defs.length) {
    return { ok: false, fields: [], description: '', next: [], error: `需要 ${defs.length} 段，当前 ${seg.length} 段` }
  }
  const fields: CronField[] = []
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i]
    const { values, error, special } = parseField(seg[i], d.min, d.max)
    const f: CronField = { name: d.name, raw: seg[i], values, text: '', min: d.min, max: d.max, error, special }
    f.text = error ? '—' : special ? describeSpecial(special, d.name) : values.length ? describeField(f) : '—'
    fields.push(f)
  }
  const bad = fields.find(f => f.error)
  if (bad) return { ok: false, fields, description: '', next: [], error: `${bad.name}字段：${bad.error}` }

  const idx = (name: string) => defs.findIndex(d => d.name === name)
  const iSec = idx('秒')
  const iMin = idx('分钟')
  const iHour = idx('小时')
  const iDay = idx('日')
  const iMonth = idx('月')
  const iWeek = idx('星期')

  // 星期 7 = 0（周日）
  const weekVals = new Set(fields[iWeek].values.map(v => v % 7))
  const dayVals = new Set(fields[iDay].values)
  const monthVals = new Set(fields[iMonth].values)
  const hourVals = new Set(fields[iHour].values)
  const minVals = new Set(fields[iMin].values)
  const secVals = iSec >= 0 ? new Set(fields[iSec].values) : new Set([0])

  const daySpecial = fields[iDay].special
  const weekSpecial = fields[iWeek].special
  const dayStar = fields[iDay].raw === '*' || fields[iDay].raw === '?'
  const weekStar = fields[iWeek].raw === '*' || fields[iWeek].raw === '?'

  const stepMs = iSec >= 0 ? 1000 : 60000
  const next: string[] = []
  const cursor = new Date(base.getTime())
  cursor.setMilliseconds(0)
  if (iSec < 0) cursor.setSeconds(0)
  const MAX = 366 * 24 * 60 * (iSec >= 0 ? 60 : 1)
  let iter = 0
  while (next.length < count && iter++ < MAX) {
    cursor.setTime(cursor.getTime() + stepMs)
    if (!monthVals.has(cursor.getMonth() + 1)) continue
    // 日与星期：均为星号时天然满足；其一为星号时以另一方为准；两者都指定时按“或”处理
    const dayOk = daySpecial ? matchSpecialDay(daySpecial, cursor) : dayVals.has(cursor.getDate())
    const weekOk = weekSpecial ? matchSpecialWeek(weekSpecial, cursor) : weekVals.has(cursor.getDay())
    if (dayStar && weekStar) {
      /* 每天都满足 */
    } else if (dayStar) {
      if (!weekOk) continue
    } else if (weekStar) {
      if (!dayOk) continue
    } else if (!dayOk && !weekOk) {
      continue
    }
    if (!hourVals.has(cursor.getHours())) continue
    if (!minVals.has(cursor.getMinutes())) continue
    if (!secVals.has(cursor.getSeconds())) continue
    next.push(formatDate(cursor))
  }
  return { ok: true, fields, description: buildDescription(fields), next }
}

/* ==================== 扩展语法的匹配与描述 ==================== */

function lastDayOfMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/** 日字段扩展语法匹配 */
function matchSpecialDay(special: string, d: Date): boolean {
  const last = lastDayOfMonth(d)
  const day = d.getDate()
  if (special === 'L') return day === last
  if (special === 'LW') return day === nearestWeekday(d.getFullYear(), d.getMonth(), last)
  const lm = /^L-(\d+)$/.exec(special)
  if (lm) return day === last - Number(lm[1])
  const wm = /^(\d+)W$/.exec(special)
  if (wm) return day === nearestWeekday(d.getFullYear(), d.getMonth(), Number(wm[1]))
  return false
}

/** 取当月最接近 n 号的工作日（周六提前、周日顺延，且不出当月） */
function nearestWeekday(year: number, month: number, n: number): number {
  const last = new Date(year, month + 1, 0).getDate()
  const target = Math.min(Math.max(n, 1), last)
  const wd = new Date(year, month, target).getDay()
  if (wd === 0) return Math.min(target + 1, last)
  if (wd === 6) return Math.max(target - 1, 1)
  return target
}

/** 星期字段扩展语法匹配：nL（当月最后一个星期 n） / n#m（第 m 个星期 n） */
function matchSpecialWeek(special: string, d: Date): boolean {
  const nl = /^(\d)L$/.exec(special)
  if (nl) {
    const want = Number(nl[1]) % 7
    const last = lastDayOfMonth(d)
    const lastWd = new Date(d.getFullYear(), d.getMonth(), last).getDay()
    return d.getDay() === want && d.getDate() + 7 > last
  }
  const hm = /^(\d)#(\d)$/.exec(special)
  if (hm) {
    const want = Number(hm[1]) % 7
    const nth = Number(hm[2])
    return d.getDay() === want && Math.ceil(d.getDate() / 7) === nth
  }
  return false
}

function describeSpecial(special: string, fieldName: string): string {
  if (special === 'L') return '每月最后一天'
  if (special === 'LW') return '每月最后一个工作日'
  const lm = /^L-(\d+)$/.exec(special)
  if (lm) return `每月倒数第 ${Number(lm[1]) + 1} 天`
  const wm = /^(\d+)W$/.exec(special)
  if (wm) return `每月最接近 ${wm[1]} 日的工作日`
  const nl = /^(\d)L$/.exec(special)
  if (nl) return `每月最后一个${WEEK_NAMES[Number(nl[1])]}`
  const hm = /^(\d)#(\d)$/.exec(special)
  if (hm) return `每月第 ${hm[2]} 个${WEEK_NAMES[Number(hm[1])]}`
  return fieldName === '星期' ? '每天' : '每天'
}

function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function buildDescription(fields: CronField[]): string {
  const get = (name: string) => fields.find(f => f.name === name)
  const sec = get('秒')
  const min = get('分钟')!
  const hour = get('小时')!
  const day = get('日')!
  const month = get('月')!
  const week = get('星期')!
  const every = (f: CronField) => f.raw === '*'
  const parts: string[] = []
  if (every(min) && every(hour) && every(day) && every(month) && every(week)) {
    return sec && !every(sec) ? `每${sec.text}` : '每分钟执行一次'
  }
  parts.push(`在 ${hour.text} 的 ${min.text}`)
  if (!every(day)) parts.push(`每月 ${day.text} 日`)
  if (!every(month)) parts.push(`${month.text}`)
  if (!every(week)) parts.push(`${week.text}`)
  if (sec && !every(sec)) parts.push(`第 ${sec.text}`)
  return parts.join('，') + ' 执行'
}

/* ==================== 可视化构建器支持 ==================== */

export type CronFieldKey = 'minute' | 'hour' | 'day' | 'month' | 'weekday'

export interface CronFieldOption {
  value: string
  label: string
}

export interface CronFieldDef {
  key: CronFieldKey
  name: string
  min: number
  max: number
  /** 语法提示（占位符用） */
  placeholder: string
  options: CronFieldOption[]
}

/** 构建器字段定义：顺序与 5 段 Cron 一致（分 时 日 月 周） */
export const CRON_BUILDER_FIELDS: CronFieldDef[] = [
  {
    key: 'minute',
    name: '分钟',
    min: 0,
    max: 59,
    placeholder: '如 */5、1-30、1,15,30',
    options: [
      { value: '*', label: '每分钟 (*)' },
      { value: '0', label: '0 分' },
      { value: '15', label: '15 分' },
      { value: '30', label: '30 分' },
      { value: '45', label: '45 分' },
      { value: '0,30', label: '0,30（每半小时）' },
      { value: '*/5', label: '*/5（每 5 分钟）' },
      { value: '*/10', label: '*/10（每 10 分钟）' },
      { value: '*/15', label: '*/15（每 15 分钟）' }
    ]
  },
  {
    key: 'hour',
    name: '小时',
    min: 0,
    max: 23,
    placeholder: '如 */2、9-17、1,12,18',
    options: [
      { value: '*', label: '每小时 (*)' },
      { value: '0', label: '0 点（午夜）' },
      { value: '6', label: '6 点（清晨）' },
      { value: '9', label: '9 点（上午）' },
      { value: '12', label: '12 点（中午）' },
      { value: '18', label: '18 点（傍晚）' },
      { value: '9-17', label: '9-17（工作时间）' },
      { value: '*/2', label: '*/2（每 2 小时）' },
      { value: '*/6', label: '*/6（每 6 小时）' }
    ]
  },
  {
    key: 'day',
    name: '日期',
    min: 1,
    max: 31,
    placeholder: '如 */2、1-15、L、15W',
    options: [
      { value: '*', label: '每天 (*)' },
      { value: '1', label: '1 日' },
      { value: '15', label: '15 日' },
      { value: '1,15', label: '1 日和 15 日' },
      { value: '1,10,20', label: '1 日、10 日、20 日' },
      { value: 'L', label: '最后一日 (L)' },
      { value: 'LW', label: '最后一个工作日 (LW)' },
      { value: '*/2', label: '*/2（每隔 2 天）' }
    ]
  },
  {
    key: 'month',
    name: '月份',
    min: 1,
    max: 12,
    placeholder: '如 */3、1-6、1,6,12',
    options: [
      { value: '*', label: '每月 (*)' },
      { value: '1', label: '1 月' },
      { value: '3,6,9,12', label: '每季度 (3,6,9,12)' },
      { value: '6-8', label: '6-8 月（夏季）' },
      { value: '1,12', label: '1 月和 12 月' },
      { value: '*/3', label: '*/3（每 3 个月）' }
    ]
  },
  {
    key: 'weekday',
    name: '星期',
    min: 0,
    max: 6,
    placeholder: '如 1-5、0,6、1#1、5L',
    options: [
      { value: '*', label: '每天 (*)' },
      { value: '0', label: '周日' },
      { value: '1', label: '周一' },
      { value: '2', label: '周二' },
      { value: '3', label: '周三' },
      { value: '4', label: '周四' },
      { value: '5', label: '周五' },
      { value: '6', label: '周六' },
      { value: '1-5', label: '工作日 (1-5)' },
      { value: '0,6', label: '周末 (0,6)' },
      { value: '1#1', label: '每月第一个周一 (1#1)' },
      { value: '5L', label: '每月最后一个周五 (5L)' }
    ]
  }
]

/** 构建器常用模板 */
export const CRON_TEMPLATES: { text: string; parts: Record<CronFieldKey, string> }[] = [
  { text: '每分钟', parts: { minute: '*', hour: '*', day: '*', month: '*', weekday: '*' } },
  { text: '每 5 分钟', parts: { minute: '*/5', hour: '*', day: '*', month: '*', weekday: '*' } },
  { text: '每小时整点', parts: { minute: '0', hour: '*', day: '*', month: '*', weekday: '*' } },
  { text: '每天 02:00', parts: { minute: '0', hour: '2', day: '*', month: '*', weekday: '*' } },
  { text: '工作日 09:00', parts: { minute: '0', hour: '9', day: '*', month: '*', weekday: '1-5' } },
  { text: '每周一 08:30', parts: { minute: '30', hour: '8', day: '*', month: '*', weekday: '1' } },
  { text: '每月 1 号 00:00', parts: { minute: '0', hour: '0', day: '1', month: '*', weekday: '*' } },
  { text: '每月最后一天 23:00', parts: { minute: '0', hour: '23', day: 'L', month: '*', weekday: '*' } },
  { text: '每季度首日 09:00', parts: { minute: '0', hour: '9', day: '1', month: '3,6,9,12', weekday: '*' } }
]

/**
 * 由字段值拼装 Cron 表达式（空值兜底为星号），并做合法性校验
 * @param parts 五个字段的值（5 段模式）
 */
export function buildCron(parts: Partial<Record<CronFieldKey, string>>): {
  ok: boolean
  expr: string
  error?: string
  field?: string
} {
  const values = CRON_BUILDER_FIELDS.map(f => {
    const v = (parts[f.key] ?? '').trim()
    return v || '*'
  })
  const expr = values.join(' ')
  const res = parseCron(expr, false, new Date(), 1)
  if (!res.ok) {
    const badName = res.fields.find(f => f.error)?.name || ''
    return { ok: false, expr, error: res.error, field: badName }
  }
  return { ok: true, expr }
}

/**
 * 人类可读的中文描述（比 parseCron 的结构化描述更口语化）
 * 例：0 9 * * 1-5 → 「在 09:00，工作日 执行」
 */
export function humanizeCron(expr: string, six = false): string {
  const res = parseCron(expr, six)
  if (!res.ok) return res.error || '无效的 Cron 表达式'
  const get = (name: string) => res.fields.find(f => f.name === name)
  const sec = get('秒')
  const min = get('分钟')!
  const hour = get('小时')!
  const day = get('日')!
  const month = get('月')!
  const week = get('星期')!
  const star = (f: CronField) => f.raw === '*' || f.raw === '?'

  const segs: string[] = []
  segs.push(timeText(min.raw, hour.raw))
  const dateText = dayText(day)
  if (dateText) segs.push(dateText)
  const monthText = monthTextOf(month)
  if (monthText) segs.push(monthText)
  const weekText = weekTextOf(week)
  if (weekText) segs.push(weekText)
  if (sec && !star(sec)) segs.push(`第 ${sec.text} 秒`)
  const body = segs.filter(Boolean).join('，')
  if (!body) return '每分钟执行'
  return `${body} 执行`
}

/** 时间部分：在 HH:MM / 每 N 分钟 / 每小时的第 N 分钟 */
function timeText(minute: string, hour: string): string {
  const minStar = minute === '*' || minute === '?'
  const hourStar = hour === '*' || hour === '?'
  if (minStar && hourStar) return '每分钟'
  if (hourStar) {
    if (minute.startsWith('*/')) return `每 ${minute.slice(2)} 分钟`
    return `每小时的第 ${minute} 分钟`
  }
  if (hour.startsWith('*/')) {
    const step = hour.slice(2)
    if (minStar) return `每 ${step} 小时的每分钟`
    return `每 ${step} 小时的第 ${minute} 分钟`
  }
  if (!minute.startsWith('*/')) {
    const h = Number(hour)
    const m = Number(minute)
    if (Number.isInteger(h) && Number.isInteger(m)) {
      return `在 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  }
  return `在 ${hour} 时 ${minute} 分`
}

/** 日期部分 */
function dayText(day: CronField): string {
  if (day.raw === '*' || day.raw === '?') return ''
  if (day.special) return describeSpecial(day.special, '日')
  const raw = day.raw
  if (raw.includes(',')) return `每月 ${raw.split(',').map(v => `${v} 日`).join('、')}`
  if (raw.includes('-')) {
    const [a, b] = raw.split('-')
    return `每月 ${a} 日至 ${b} 日`
  }
  if (raw.startsWith('*/')) return `每隔 ${raw.slice(2)} 天`
  return `每月 ${raw} 日`
}

/** 月份部分 */
function monthTextOf(month: CronField): string {
  if (month.raw === '*' || month.raw === '?') return ''
  const names = (v: number) => MONTH_NAMES[v - 1] || `${v} 月`
  if (month.raw.includes(',')) {
    return month.values.map(names).join('、')
  }
  if (month.raw.includes('-')) {
    return `${names(month.values[0])}至 ${names(month.values[month.values.length - 1])}`
  }
  if (month.raw.startsWith('*/')) return `每 ${month.raw.slice(2)} 个月`
  return `在 ${names(month.values[0])}`
}

/** 星期部分 */
function weekTextOf(week: CronField): string {
  if (week.raw === '*' || week.raw === '?') return ''
  if (week.special) return describeSpecial(week.special, '星期')
  const names = (v: number) => WEEK_NAMES[v % 7]
  if (week.raw === '1-5') return '工作日'
  if (week.raw === '0,6') return '周末'
  if (week.raw.includes(',')) return week.values.map(names).join('和')
  if (week.raw.includes('-')) {
    return `${names(week.values[0])}至 ${names(week.values[week.values.length - 1])}`
  }
  return `在${names(week.values[0])}`
}

/** 格式化日期时间（可选附带星期中文） */
export function formatDateTime(d: Date, withWeekday = false): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  return withWeekday ? `${base} (${WEEK_NAMES[d.getDay()]})` : base
}

/**
 * 未来执行时间（带星期），返回字符串数组
 * 与 parseCron().next 的区别：这里附带星期中文，便于构建器展示
 */
export function nextExecutions(expr: string, count = 10, base = new Date(), six = false): string[] {
  const res = parseCron(expr, six, base, Math.max(1, Math.min(count, 50)))
  if (!res.ok) return []
  return res.next.map(s => `${s} (${WEEK_NAMES[new Date(s.replace(' ', 'T')).getDay()]})`)
}
