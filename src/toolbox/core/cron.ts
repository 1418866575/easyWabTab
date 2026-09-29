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

/** 解析单段 */
export function parseField(raw: string, min: number, max: number): { values: number[]; error?: string } {
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
    const { values, error } = parseField(seg[i], d.min, d.max)
    const f: CronField = { name: d.name, raw: seg[i], values, text: '', min: d.min, max: d.max, error }
    f.text = values.length ? describeField(f) : '—'
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
    if (!dayVals.has(cursor.getDate()) && !weekVals.has(cursor.getDay())) continue
    // 标准 cron：日与星期均非 * 时为“或”关系（此处按或处理）
    if (!hourVals.has(cursor.getHours())) continue
    if (!minVals.has(cursor.getMinutes())) continue
    if (!secVals.has(cursor.getSeconds())) continue
    next.push(formatDate(cursor))
  }
  return { ok: true, fields, description: buildDescription(fields), next }
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
