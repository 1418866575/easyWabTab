/**
 * statsCore 单测：node --experimental-strip-types scripts/test-stats-core.ts
 *
 * 重点覆盖两类曾经踩过的坑：
 *   - 日期键必须走本地时间（toISOString 会偏一天）
 *   - 趋势序列必须补零（缺的天不能跳过，否则柱子全挤在一起）
 */
import assert from 'node:assert/strict'
import {
  addVisit,
  barScale,
  buildTrend,
  busiestHours,
  dateKeyOffset,
  dayKey,
  emptyDay,
  hourLabel,
  mergePages,
  normalizeDay,
  pageLabel,
  PAGE_LABELS,
  rangeLabel,
  recentDayKeys,
  shortDateLabel,
  STATS_KEEP_DAYS,
  sumPv,
  topEntries,
  trimKeys,
  type VisitDay
} from '../src/composables/statsCore.ts'

let passed = 0
function ok(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    console.error(`  ✗ ${name}`)
    throw e
  }
}

console.log('statsCore')

ok('dayKey 用本地时间（凌晨 3 点不会被算成前一天）', () => {
  assert.equal(dayKey(new Date(2026, 0, 1, 3, 0, 0)), '2026-01-01')
  assert.equal(dayKey(new Date(2026, 11, 31, 23, 59, 0)), '2026-12-31')
  // 补零
  assert.equal(dayKey(new Date(2026, 8, 5, 12, 0, 0)), '2026-09-05')
})

ok('dateKeyOffset 跨月跨年正确', () => {
  const base = new Date(2026, 0, 2, 10, 0, 0)
  assert.equal(dateKeyOffset(-1, base), '2026-01-01')
  assert.equal(dateKeyOffset(-2, base), '2025-12-31')
  assert.equal(dateKeyOffset(0, base), '2026-01-02')
  assert.equal(dateKeyOffset(30, base), '2026-02-01')
})

ok('addVisit 不改原对象，pv/pages/hours 三处同步 +1', () => {
  const d = emptyDay()
  const a = addVisit(d, 'home', 9)
  assert.equal(d.pv, 0, '原对象必须保持不变')
  assert.deepEqual(d.hours[9], 0)
  assert.equal(a.pv, 1)
  assert.equal(a.pages.home, 1)
  assert.equal(a.hours[9], 1)
  const b = addVisit(a, 'home', 9)
  assert.equal(b.pv, 2)
  assert.equal(b.pages.home, 2)
  assert.equal(b.hours[9], 2)
})

ok('addVisit 对非法小时兜底到 0，空 pageKey 兜底为 unknown', () => {
  const a = addVisit(emptyDay(), '', 99)
  assert.equal(a.pages.unknown, 1)
  assert.equal(a.hours[0], 1)
  const b = addVisit(emptyDay(), 'books', -3)
  assert.equal(b.hours[0], 1)
})

ok('normalizeDay 对垃圾数据降级为空天，不抛错', () => {
  assert.deepEqual(normalizeDay(null), emptyDay())
  assert.deepEqual(normalizeDay('x'), emptyDay())
  assert.deepEqual(normalizeDay({ pv: 'a', pages: [], hours: 'y' }), emptyDay())
  const mixed = normalizeDay({ pv: 3.7, pages: { home: 2, bad: -1 }, hours: [1, 'x', 2.9] })
  assert.equal(mixed.pv, 3)
  assert.equal(mixed.pages.home, 2)
  assert.equal('bad' in mixed.pages, false, '负数/非法计数不该进聚合')
  assert.equal(mixed.hours[0], 1)
  assert.equal(mixed.hours[2], 2)
})

ok('buildTrend 补零且顺序从旧到新', () => {
  const today = new Date(2026, 9, 30)
  const days: Record<string, VisitDay> = {
    [dateKeyOffset(-2, today)]: { pv: 5, pages: { home: 5 }, hours: new Array(24).fill(0) },
    [dayKey(today)]: { pv: 2, pages: { books: 2 }, hours: new Array(24).fill(0) }
  }
  const trend = buildTrend(days, 4, today)
  assert.equal(trend.length, 4)
  assert.deepEqual(trend.map((t) => t.key), [
    '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'
  ])
  assert.deepEqual(trend.map((t) => t.pv), [0, 5, 0, 2], '缺的天必须补 0')
  assert.deepEqual(trend.map((t) => t.label), ['10/27', '10/28', '10/29', '10/30'])
})

ok('sumPv / mergePages 只累加区间内的天', () => {
  const today = new Date(2026, 9, 30)
  const yesterday = dateKeyOffset(-1, today)
  const days: Record<string, VisitDay> = {
    [yesterday]: { pv: 3, pages: { home: 2, books: 1 }, hours: new Array(24).fill(0) },
    [dayKey(today)]: { pv: 4, pages: { home: 4 }, hours: new Array(24).fill(0) }
  }
  const all = recentDayKeys(2, today)
  assert.equal(sumPv(days, all), 7)
  assert.deepEqual(mergePages(days, all), { home: 6, books: 1 })
  assert.equal(sumPv(days, [dateKeyOffset(-30, today)]), 0, '区间外不计数')
})

ok('topEntries 降序 + 同数按 key 稳定排序 + 过滤非法值', () => {
  const top = topEntries({ a: 2, b: 5, c: 2, d: 0, e: -1, f: Number.NaN }, 10)
  assert.deepEqual(top, [
    { key: 'b', count: 5 },
    { key: 'a', count: 2 },
    { key: 'c', count: 2 }
  ])
  assert.equal(topEntries({ a: 1, b: 2 }, 1).length, 1)
})

ok('busiestHours 只返回有点击的小时，全 0 时为空', () => {
  const hours = new Array(24).fill(0)
  hours[9] = 3
  hours[21] = 7
  hours[14] = 1
  assert.deepEqual(busiestHours(hours, 2), [21, 9])
  assert.deepEqual(busiestHours(new Array(24).fill(0), 3), [])
})

ok('barScale 全 0 时不给假高度，有值时留最小可见高度', () => {
  assert.deepEqual(barScale([0, 0, 0]), [0, 0, 0])
  const scaled = barScale([0, 100, 1])
  assert.equal(scaled[0], 0)
  assert.equal(scaled[1], 1)
  assert.ok(scaled[2] >= 0.06 && scaled[2] < 0.1)
})

ok('trimKeys 只留最近 keepDays 天，非法键一律删', () => {
  const today = new Date(2026, 9, 30)
  const keys = [
    dateKeyOffset(0, today),
    dateKeyOffset(-1, today),
    dateKeyOffset(-(STATS_KEEP_DAYS - 1), today),
    dateKeyOffset(-STATS_KEEP_DAYS, today),
    'garbage'
  ]
  const drop = trimKeys(keys, STATS_KEEP_DAYS, today)
  assert.deepEqual(drop, [dateKeyOffset(-STATS_KEEP_DAYS, today), 'garbage'])
})

ok('pageLabel 有映射用中文，没映射原样返回', () => {
  assert.equal(pageLabel('books'), '个人图书馆')
  assert.equal(pageLabel('blog-post'), '博客文章')
  assert.equal(pageLabel('brand-new-route'), 'brand-new-route')
  assert.equal(Object.keys(PAGE_LABELS).length >= 12, true)
})

ok('hourLabel / rangeLabel 文案', () => {
  assert.equal(hourLabel(0), '0:00')
  assert.equal(hourLabel(21), '21:00')
  assert.equal(rangeLabel(30), '近 30 天')
})

ok('shortDateLabel 去掉前导零，非法输入原样返回', () => {
  assert.equal(shortDateLabel('2026-10-09'), '10/9')
  assert.equal(shortDateLabel('2026-01-31'), '1/31')
  assert.equal(shortDateLabel('garbage'), 'garbage')
})

console.log(`\n全部 ${passed} 项通过`)
