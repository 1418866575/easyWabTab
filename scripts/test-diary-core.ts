import assert from 'node:assert/strict'
import {
  computeStreak,
  dateKeyOf,
  DEFAULT_JOURNAL_ID,
  DEFAULT_JOURNAL_NAME,
  defaultJournal,
  diaryDateLabel,
  emptyDiaryData,
  extractFirstImage,
  findDiaryByDate,
  isValidDateKey,
  normalizeDiaryData,
  sortDiaryEntries
} from '../src/composables/diaryCore.ts'
import type { WorkbenchDiary, WorkbenchJournal } from '../src/types'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// 断言计数器：Proxy 包装 node:assert/strict，每次断言调用 +1（输出 assertion 总数）
let assertCount = 0
const a: typeof assert = new Proxy(assert, {
  get(t, prop) {
    const v = Reflect.get(t, prop)
    if (typeof v === 'function') {
      return (...args: unknown[]) => {
        assertCount++
        return (v as (...x: unknown[]) => unknown).apply(t, args)
      }
    }
    return v
  }
}) as typeof assert

/** 构造规范日记条目（仅覆盖给定字段）。 */
function mkEntry(partial: Partial<WorkbenchDiary> & { date: string }): WorkbenchDiary {
  return {
    id: partial.id ?? `dy_${partial.date}`,
    date: partial.date,
    content: partial.content ?? '',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z'
  }
}

// T1 — emptyDiaryData：空 journals + 空 entries + 每次全新结构（不共享引用）
test('T1 emptyDiaryData structure', () => {
  a.deepEqual(emptyDiaryData(), { journals: [], entries: [] })
  a.ok(Array.isArray(emptyDiaryData().journals))
  a.ok(Array.isArray(emptyDiaryData().entries))
  a.equal(emptyDiaryData().journals.length, 0)
  a.equal(emptyDiaryData().entries.length, 0)
  a.notEqual(emptyDiaryData(), emptyDiaryData()) // 不共享引用
})

// T2 — normalizeDiaryData 幂等：跑两遍结果一致
test('T2 normalizeDiaryData idempotent', () => {
  const raw: any = {
    entries: [
      { id: 'dy_1', date: '2026-08-13', content: '今天写了什么', createdAt: '2026-08-13T10:00:00.000Z', updatedAt: '2026-08-13T10:00:00.000Z' },
      { id: 'dy_2', date: '2026-08-12', content: '昨天', createdAt: '2026-08-12T10:00:00.000Z', updatedAt: '2026-08-12T10:00:00.000Z' }
    ]
  }
  const once = normalizeDiaryData(raw)
  const twice = normalizeDiaryData(once)
  a.deepEqual(twice, once)
})

// T3 — normalizeDiaryData 非对象入参（null/数字/字符串/undefined/数组）→ emptyDiaryData
test('T3 normalizeDiaryData invalid input', () => {
  a.deepEqual(normalizeDiaryData(null), { journals: [], entries: [] })
  a.deepEqual(normalizeDiaryData(42), { journals: [], entries: [] })
  a.deepEqual(normalizeDiaryData('str'), { journals: [], entries: [] })
  a.deepEqual(normalizeDiaryData(undefined), { journals: [], entries: [] })
  a.deepEqual(normalizeDiaryData([{ date: '2026-08-13' }]), { journals: [], entries: [] }) // 数组不是 DiaryData 对象格式
  a.deepEqual(normalizeDiaryData({ foo: 1 }), { journals: [], entries: [] }) // 无 entries 字段 → 空
})

// T4 — normalizeDiaryData 非法 date 条目剔除（'2026-13-99'、'2026-02-30' 语义见 T9）；非对象条目剔除
test('T4 normalizeDiaryData drops invalid-date + non-object entries', () => {
  const data = normalizeDiaryData({
    entries: [
      mkEntry({ date: '2026-08-13' }),
      { date: '2026-13-99', content: '非法月份' }, // 非法 date → 剔除
      { id: 'dy_bad', date: 'x', content: '非法格式' }, // 非法 date → 剔除
      'not-an-object', // 非对象 → 剔除
      null // 非对象 → 剔除
    ]
  })
  a.equal(data.entries.length, 1)
  a.equal(data.entries[0].date, '2026-08-13')
})

// T5 — id 缺失/非字符串 → 回退 `dy_<date>`
test('T5 normalizeDiaryData id fallback dy_date', () => {
  const data = normalizeDiaryData({ entries: [{ date: '2026-08-13', content: '无 id' }] })
  a.equal(data.entries[0].id, 'dy_2026-08-13')
  // 非字符串 id → 回退
  const data2 = normalizeDiaryData({ entries: [{ date: '2026-08-12', id: 42 as unknown as string, content: 'x' }] })
  a.equal(data2.entries[0].id, 'dy_2026-08-12')
  // 合法字符串 id 原样保留
  const data3 = normalizeDiaryData({ entries: [{ date: '2026-08-11', id: 'dy_custom', content: 'x' }] })
  a.equal(data3.entries[0].id, 'dy_custom')
})

// T6 — content 非字符串 → ''；字符串原样保留；createdAt/updatedAt 非法 → 当前 ISO 兜底
test('T6 normalizeDiaryData content coercion + timestamps fallback', () => {
  const data = normalizeDiaryData({
    entries: [
      { date: '2026-08-13', content: 123 as unknown as string }, // 非字符串 → ''
      { date: '2026-08-12', content: '  正文  ' }, // 字符串原样保留（不 trim）
      { date: '2026-08-11', content: 'x', createdAt: 42 as unknown as string, updatedAt: {} as unknown as string } // 时间戳非法 → 兜底
    ]
  })
  a.equal(data.entries[0].content, '')
  a.equal(data.entries[1].content, '  正文  ')
  a.match(data.entries[2].createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  a.match(data.entries[2].updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
})

// T7 — dateKeyOf：本地日期无 UTC 偏移（new Date(2026,0,5) 本地 1 月 5 日 → '2026-01-05'）
test('T7 dateKeyOf local no UTC offset', () => {
  a.equal(dateKeyOf(new Date(2026, 0, 5)), '2026-01-05') // 防 UTC 偏移回归：UTC 可能是 1/4 或 1/6
  a.equal(dateKeyOf(new Date(2026, 7, 13)), '2026-08-13')
  a.equal(dateKeyOf(new Date(2026, 11, 31)), '2026-12-31')
  a.equal(dateKeyOf(new Date(2026, 0, 1)), '2026-01-01') // 补零
})

// T8 — diaryDateLabel：'YYYY-MM-DD' → 'YYYY-MM-DD 周X'（2026-08-13 是周四）
test('T8 diaryDateLabel weekday', () => {
  a.equal(diaryDateLabel('2026-08-13'), '2026-08-13 周四')
  a.equal(diaryDateLabel('2026-08-14'), '2026-08-14 周五')
  a.equal(diaryDateLabel('2026-08-16'), '2026-08-16 周日') // 周日起始索引
  a.equal(diaryDateLabel('2026-01-01'), '2026-01-01 周四') // 跨年
})

// T9 — isValidDateKey 合法：正则 ^\d{4}-\d{2}-\d{2}$ + 月 1-12 / 日 1-31 范围（镜像便签 datetime 校验语义）
test('T9 isValidDateKey valid', () => {
  a.equal(isValidDateKey('2026-08-13'), true)
  a.equal(isValidDateKey('2026-01-05'), true)
  a.equal(isValidDateKey('2026-12-31'), true)
  a.equal(isValidDateKey('2026-02-30'), true) // 范围检查语义：仅日 1-31，不校验当月天数（镜像便签先例）
})

// T10 — isValidDateKey 非法：正则拒绝 / 月越界 / 日越界
test('T10 isValidDateKey invalid', () => {
  a.equal(isValidDateKey('2026-13-99'), false) // 月越界
  a.equal(isValidDateKey('2026-01-32'), false) // 日越界
  a.equal(isValidDateKey('2026-00-01'), false) // 月 0
  a.equal(isValidDateKey('2026-01-00'), false) // 日 0
  a.equal(isValidDateKey('2026-1-5'), false) // 未补零，正则拒绝
  a.equal(isValidDateKey('abc'), false)
  a.equal(isValidDateKey(''), false)
  a.equal(isValidDateKey('2026/08/13'), false)
})

// T11 — sortDiaryEntries：date 降序（新的在前）
test('T11 sortDiaryEntries date desc', () => {
  const entries = [
    mkEntry({ date: '2026-08-10' }),
    mkEntry({ date: '2026-08-13' }),
    mkEntry({ date: '2026-08-01' }),
    mkEntry({ date: '2026-07-31' })
  ]
  const sorted = sortDiaryEntries(entries)
  a.deepEqual(sorted.map(e => e.date), ['2026-08-13', '2026-08-10', '2026-08-01', '2026-07-31'])
  a.deepEqual(entries.map(e => e.date), ['2026-08-10', '2026-08-13', '2026-08-01', '2026-07-31']) // 入参未被修改
  a.notEqual(sorted, entries) // 返回新数组
})

// T12 — sortDiaryEntries：同 date 按 createdAt 降序（平局分支）+ 稳定空数组
test('T12 sortDiaryEntries createdAt tiebreak + no mutation', () => {
  const entries = [
    mkEntry({ date: '2026-08-13', id: 'a', createdAt: '2026-08-13T08:00:00.000Z' }),
    mkEntry({ date: '2026-08-13', id: 'b', createdAt: '2026-08-13T09:00:00.000Z' }),
    mkEntry({ date: '2026-08-12', id: 'c', createdAt: '2026-08-12T10:00:00.000Z' })
  ]
  const sorted = sortDiaryEntries(entries)
  a.deepEqual(sorted.map(e => e.id), ['b', 'a', 'c']) // 同日 createdAt 新在前
  a.deepEqual(entries.map(e => e.id), ['a', 'b', 'c']) // 入参未被修改
  a.deepEqual(sortDiaryEntries([]), [])
})

// T13 — findDiaryByDate 命中：返回该日期条目
test('T13 findDiaryByDate hit', () => {
  const entries = [
    mkEntry({ date: '2026-08-13', id: 'dy_today', content: '正文' }),
    mkEntry({ date: '2026-08-12', id: 'dy_yesterday' })
  ]
  const hit = findDiaryByDate(entries, '2026-08-13')
  a.ok(hit !== undefined)
  a.equal(hit.id, 'dy_today')
  a.equal(hit.content, '正文')
})

// T14 — findDiaryByDate 未命中：undefined
test('T14 findDiaryByDate miss', () => {
  const entries = [mkEntry({ date: '2026-08-13' })]
  a.equal(findDiaryByDate(entries, '2026-08-12'), undefined)
  a.equal(findDiaryByDate(entries, '2027-01-01'), undefined)
  a.equal(findDiaryByDate([], '2026-08-13'), undefined)
})

// T15 — normalizeDiaryData：无 entries 字段 / entries 非数组 → 空 entries；合法 entries 原样归一（roundtrip）
test('T15 normalizeDiaryData empty entries + roundtrip', () => {
  const empty = normalizeDiaryData({ entries: undefined })
  a.deepEqual(empty, { journals: [], entries: [] })
  a.deepEqual(normalizeDiaryData({ entries: 'nope' }), { journals: [], entries: [] })
  // 存库 → 加载 roundtrip：归一化结果再归一化不变（T2 回归守护，含缺失时间戳兜底后的幂等）
  const data = normalizeDiaryData({ entries: [{ id: 'dy_1', date: '2026-08-13', content: 'x' }] })
  a.deepEqual(normalizeDiaryData(data), data)
})

// T16 — normalizeDiaryData：journals 数组原样归一；条目缺 journalId → 归入默认日志本
test('T16 normalizeDiaryData journals + journalId default', () => {
  const data = normalizeDiaryData({
    journals: [{ id: 'jb_a', name: '学习', createdAt: '2026-01-01T00:00:00.000Z', order: 0 }],
    entries: [{ id: 'dy_1', date: '2026-08-13', content: 'x' }]
  })
  a.equal(data.journals.length, 1)
  a.equal(data.journals[0].id, 'jb_a')
  a.equal(data.entries[0].journalId, DEFAULT_JOURNAL_ID) // 缺 journalId → 默认本
  // journals 非数组/缺失 → []
  a.deepEqual(normalizeDiaryData({ entries: [] }).journals, [])
})

// T17 — normalizeDiaryData：条目 kind 缺省 → 'diary'；kind==='idea' 保留；非法 kind → 回退 'diary'
test('T17 normalizeDiaryData kind coercion', () => {
  const data = normalizeDiaryData({
    entries: [
      { id: 'dy_1', date: '2026-08-13', content: 'x' }, // 缺 kind → diary
      { id: 'dy_2', date: '2026-08-12', content: 'y', kind: 'idea' }, // 保留
      { id: 'dy_3', date: '2026-08-11', content: 'z', kind: 'bogus' as unknown as 'idea' } // 非法 → diary
    ]
  })
  a.equal(data.entries[0].kind, 'diary')
  a.equal(data.entries[1].kind, 'idea')
  a.equal(data.entries[2].kind, 'diary')
})

// T18 — defaultJournal：结构 + 默认 id/name 契约
test('T18 defaultJournal contract', () => {
  const j = defaultJournal()
  a.equal(j.id, DEFAULT_JOURNAL_ID)
  a.equal(j.name, DEFAULT_JOURNAL_NAME)
  a.ok(isValidDateKey(j.createdAt.slice(0, 10)))
  const j2 = defaultJournal()
  a.notEqual(j, j2) // 不共享引用
})

// T21 — normalizeDiaryEntry：deleted / coverImage 安全默认（缺字段 → false / ''；非法 coverImage → 兜底 ''）
test('T21 normalizeDiaryEntry deleted + coverImage defaults', () => {
  const data = normalizeDiaryData({
    entries: [
      { id: 'dy_1', date: '2026-08-13', content: 'x' }, // 缺 deleted/coverImage → false / ''
      { id: 'dy_2', date: '2026-08-12', content: 'y', deleted: true, coverImage: 'data:image/png;base64,AAA' },
      { id: 'dy_3', date: '2026-08-11', content: 'z', deleted: false, coverImage: 123 as unknown as string } // 非法 coverImage → ''
    ]
  })
  a.equal(data.entries[0].deleted, false)
  a.equal(data.entries[0].coverImage, '')
  a.equal(data.entries[1].deleted, true)
  a.equal(data.entries[1].coverImage, 'data:image/png;base64,AAA')
  a.equal(data.entries[2].deleted, false)
  a.equal(data.entries[2].coverImage, '') // 非字符串 → 兜底 ''
})

// T22 — extractFirstImage：取正文首张 data:image；非 data: 链接 / 纯文本 / 空 → ''
test('T22 extractFirstImage first inline image', () => {
  a.equal(extractFirstImage('![a](data:image/png;base64,AAA) 文本'), 'data:image/png;base64,AAA')
  a.equal(extractFirstImage('没有图片的纯文本'), '')
  a.equal(extractFirstImage('![x](https://e.com/a.png)'), '') // 非 data: 不取
  a.equal(extractFirstImage(''), '')
})

// T19 — computeStreak：空 → {streak:0,total:0}；total = 条目数；连续天数从今天往回数
test('T19 computeStreak basics', () => {
  // 空
  a.deepEqual(computeStreak([]), { streak: 0, total: 0 })
  // 今天 / 昨天 / 前天 连续 3 天
  const today = dateKeyOf(new Date())
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yy = new Date()
  yy.setDate(yy.getDate() - 2)
  const entries: WorkbenchDiary[] = [
    { id: 'a', journalId: 'jb_default', date: today, content: '', createdAt: '', updatedAt: '' },
    { id: 'b', journalId: 'jb_default', date: dateKeyOf(y), content: '', createdAt: '', updatedAt: '' },
    { id: 'c', journalId: 'jb_default', date: dateKeyOf(yy), content: '', createdAt: '', updatedAt: '' }
  ]
  a.deepEqual(computeStreak(entries), { streak: 3, total: 3 })
  // 今天缺、但有昨天+前天 → streak 2（从昨天起算仍连续中）
  const noToday = entries.filter(e => e.date !== today)
  a.deepEqual(computeStreak(noToday), { streak: 2, total: 2 })
  // total 含非连续日（断档）：今天 + 5 天前 → streak 1, total 2
  const gap = new Date()
  gap.setDate(gap.getDate() - 5)
  const g: WorkbenchDiary[] = [
    { id: 'a', journalId: 'jb_default', date: today, content: '', createdAt: '', updatedAt: '' },
    { id: 'b', journalId: 'jb_default', date: dateKeyOf(gap), content: '', createdAt: '', updatedAt: '' }
  ]
  a.deepEqual(computeStreak(g), { streak: 1, total: 2 })
})

// T20 — computeStreak：非法 date 条目被忽略（不污染连续天数，但仍计入 total 篇数）
test('T20 computeStreak ignores invalid dates', () => {
  const today = dateKeyOf(new Date())
  const entries: WorkbenchDiary[] = [
    { id: 'a', journalId: 'jb_default', date: today, content: '', createdAt: '', updatedAt: '' },
    { id: 'b', journalId: 'jb_default', date: 'not-a-date', content: '', createdAt: '', updatedAt: '' },
    { id: 'c', journalId: 'jb_default', date: '', content: '', createdAt: '', updatedAt: '' }
  ]
  // streak 只数今天（1）；total 含非法日期条目共 3 篇
  a.deepEqual(computeStreak(entries), { streak: 1, total: 3 })
})

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    passed++
    console.log(`  ✓ ${t.name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${t.name}`)
    console.error(e)
  }
}
if (failed > 0) {
  console.error(`\n${passed}/${tests.length} passed, ${assertCount} assertions, exit 1`)
  process.exit(1)
}
console.log(`\n${passed}/${tests.length} passed, ${assertCount} assertions, exit 0`)
