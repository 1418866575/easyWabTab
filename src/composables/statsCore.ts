/**
 * 访问统计纯逻辑（本机使用习惯）
 *
 * 定位：只回答「我自己怎么用这个站」，数据全部留在本机 IndexedDB，不上传、不进云同步。
 * 与页脚的 Vercount 是两回事 —— 那个统计的是公网所有访客的累计 PV/UV（第三方计数器，
 * 只有三个累计数，没有时间维度）；这里统计的是本机每次页面访问，按天分桶，所以能画趋势。
 *
 * 为什么按「天」一个 key 存（stats:day:YYYY-MM-DD）而不是一份大 JSON：
 *   - 每天写只碰当天那条，写入量恒定，不会随天数增长越写越慢
 *   - 删旧数据 = 删 key，不用重写整份聚合
 *
 * 本文件零 Vue / 零 DOM 依赖，可被 scripts/test-stats-core.ts 直接跑。
 */

/** 本地日期键（YYYY-MM-DD）。不能用 toISOString —— 那是 UTC，会在凌晨 8 点前算成前一天 */
export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 相对 base 偏移 offsetDays 天的日期键（offsetDays 为负 = 往前） */
export function dateKeyOffset(offsetDays: number, base: Date = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  d.setDate(d.getDate() + offsetDays)
  return dayKey(d)
}

/** 某一天的访问记录 */
export interface VisitDay {
  /** 当天页面访问总数 */
  pv: number
  /** 路由名（如 home / books）→ 当天次数 */
  pages: Record<string, number>
  /** 24 个小时各自的访问次数（下标 = 小时） */
  hours: number[]
}

/** 保留天数：超过就删 key（一天一条，90 条体积可忽略） */
export const STATS_KEEP_DAYS = 90

/** 趋势/分布默认窗口 */
export const STATS_TREND_DAYS = 30

export function emptyDay(): VisitDay {
  return { pv: 0, pages: {}, hours: new Array(24).fill(0) }
}

/**
 * 把库里读出的任意值收敛成 VisitDay。
 * 旧数据缺字段、被手改坏、类型不对都不该让面板崩 —— 一律降级成 0。
 */
export function normalizeDay(raw: unknown): VisitDay {
  const out = emptyDay()
  if (!raw || typeof raw !== 'object') return out
  const o = raw as Record<string, unknown>
  if (typeof o.pv === 'number' && Number.isFinite(o.pv) && o.pv > 0) out.pv = Math.floor(o.pv)
  if (o.pages && typeof o.pages === 'object') {
    for (const [k, v] of Object.entries(o.pages as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out.pages[k] = Math.floor(v)
    }
  }
  if (Array.isArray(o.hours)) {
    for (let i = 0; i < 24; i++) {
      const v = o.hours[i]
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out.hours[i] = Math.floor(v)
    }
  }
  return out
}

/**
 * 记一次访问，返回**新对象**（不原地改）。
 * 原地改会让持有旧引用的调用方看到意外变化，也让「写盘失败回滚」变得没可能。
 */
export function addVisit(day: VisitDay, pageKey: string, hour: number): VisitDay {
  const key = pageKey || 'unknown'
  const h = Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 0
  const hours = day.hours.slice()
  hours[h] = (hours[h] ?? 0) + 1
  return {
    pv: day.pv + 1,
    pages: { ...day.pages, [key]: (day.pages[key] ?? 0) + 1 },
    hours
  }
}

/** 近 days 天的日期键，从旧到新（补零画图时顺序要稳定） */
export function recentDayKeys(days: number, today: Date = new Date()): string[] {
  const n = Math.max(1, Math.floor(days))
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(dateKeyOffset(-i, today))
  return out
}

export interface TrendPoint {
  /** YYYY-MM-DD */
  key: string
  /** 图上显示的短标签：M/D */
  label: string
  pv: number
}

/** `YYYY-MM-DD` → `M/D`（趋势柱的悬浮提示/区间文案用；非法输入原样返回） */
export function shortDateLabel(key: string): string {
  const [, m, d] = String(key).split('-')
  if (!m || !d) return String(key)
  return `${Number(m)}/${Number(d)}`
}

/** 趋势序列：缺的那天补 0（不能跳过，否则柱子会挤在一起看不出断档） */
export function buildTrend(
  dayMap: Record<string, VisitDay>,
  days: number = STATS_TREND_DAYS,
  today: Date = new Date()
): TrendPoint[] {
  return recentDayKeys(days, today).map((key) => {
    return { key, label: shortDateLabel(key), pv: dayMap[key]?.pv ?? 0 }
  })
}

/** 区间内访问总数 */
export function sumPv(dayMap: Record<string, VisitDay>, keys: string[]): number {
  let s = 0
  for (const k of keys) s += dayMap[k]?.pv ?? 0
  return s
}

/** 区间内各路由的次数合并（模块分布用） */
export function mergePages(dayMap: Record<string, VisitDay>, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of keys) {
    const pages = dayMap[k]?.pages
    if (!pages) continue
    for (const [p, n] of Object.entries(pages)) out[p] = (out[p] ?? 0) + n
  }
  return out
}

export interface RankEntry {
  key: string
  count: number
}

/** 计数表 → 降序 Top N（同数按 key 字典序，保证每次渲染顺序稳定） */
export function topEntries(map: Record<string, number>, n: number): RankEntry[] {
  return Object.entries(map)
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key))
    .slice(0, Math.max(0, Math.floor(n)))
}

/** 最活跃的 n 个小时（降序；全 0 时返回空数组，由调用方决定怎么展示空态） */
export function busiestHours(hours: number[], n: number): number[] {
  const list: number[] = []
  for (let i = 0; i < 24; i++) if ((hours[i] ?? 0) > 0) list.push(i)
  return list
    .sort((a, b) => ((hours[b] ?? 0) - (hours[a] ?? 0)) || a - b)
    .slice(0, Math.max(0, Math.floor(n)))
}

/** 数值序列 → 0..1 的高度比例（用于柱状/条形；全 0 时全给 0，不留基线假高度） */
export function barScale(values: number[]): number[] {
  const max = values.reduce((m, v) => (v > m ? v : m), 0)
  if (max <= 0) return values.map(() => 0)
  return values.map((v) => (v <= 0 ? 0 : Math.max(0.06, v / max)))
}

/**
 * 找出该删掉的日期键：只保留最近 keepDays 天。
 * 非法 key（不是 YYYY-MM-DD）一并返回删除 —— 它们永远进不了趋势，留着只是垃圾。
 */
export function trimKeys(
  allKeys: string[],
  keepDays: number = STATS_KEEP_DAYS,
  today: Date = new Date()
): string[] {
  const keep = new Set(recentDayKeys(keepDays, today))
  return allKeys.filter((k) => !keep.has(k))
}

/** 路由 name → 中文标签（与 router/index.ts 的 name 对齐；新增路由记得补这里） */
export const PAGE_LABELS: Record<string, string> = {
  home: '导航首页',
  workbench: '个人工作台',
  business: '销售记账',
  student: '学生工作台',
  teacher: '教师工作台',
  toolbox: '工具箱',
  smart: '智能工作台',
  blog: '博客',
  'blog-admin': '博客后台',
  'blog-post': '博客文章',
  books: '个人图书馆',
  'book-reader': '站内阅读'
}

/** 取页面中文名；未登记的 key 原样返回（新路由也不会显示成空白） */
export function pageLabel(key: string): string {
  return PAGE_LABELS[key] ?? key
}

/** 小时 → 显示用时段标签，如 9 → "9:00" */
export function hourLabel(h: number): string {
  return `${h}:00`
}

/** 把统计区间说成人话：「近 30 天」 */
export function rangeLabel(days: number): string {
  return `近 ${days} 天`
}
