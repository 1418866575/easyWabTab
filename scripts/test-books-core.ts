/**
 * 个人图书馆纯函数测试（booksCore）
 *
 * 与项目其它 test-*.ts 同构：无测试框架，自写 mini-runner + node:assert/strict。
 * 运行：npm run test:books
 */
import assert from 'node:assert/strict'
import {
  BOOK_DEFAULT_CATEGORY,
  BOOK_LARGE_ORDER,
  BOOKS_RECENT_LIMIT,
  BOOKS_UPLOAD_MAX_BYTES,
  type BookItem,
  type BookSort,
  categoryCounts,
  categoryList,
  checkUploadFile,
  filterBooks,
  formatClicks,
  formatProgress,
  formatRelative,
  formatSize,
  formatTotalSize,
  matchKeyword,
  normalizeBook,
  normalizeBookmark,
  normalizeBooks,
  paginate,
  pickScrollTarget,
  ratioToScrollTop,
  safePage,
  scrollRatio,
  scrollTargetIndex,
  slugifyBookId,
  sortBooks
} from '../src/composables/booksCore.ts'
import {
  mergeBooksPrefsEnvelope,
  normalizeUserBookmark,
  type BooksPrefsSyncData,
  type UserBookmark
} from '../src/composables/booksSyncCore.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// 断言计数器：Proxy 包装 node:assert/strict，每次断言调用 +1
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

/** 构造书籍（只覆盖关心的字段） */
function mkBook(partial: Partial<BookItem> & { id: string }): BookItem {
  return {
    title: partial.id,
    description: '',
    cover: '',
    category: BOOK_DEFAULT_CATEGORY,
    tags: [],
    order: partial.order ?? BOOK_LARGE_ORDER,
    entry: partial.entry ?? `/books/${partial.id}/index.html`,
    size: partial.size ?? 1000,
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    hasMeta: partial.hasMeta ?? false,
    source: partial.source ?? 'static',
    ...partial
  }
}

// ============ normalizeBook / normalizeBooks ============

test('normalizeBook：字段缺失时逐项回落，标题兜底为 id', () => {
  const b = normalizeBook({ id: 'abc' })
  a.equal(b.id, 'abc')
  a.equal(b.title, 'abc')
  a.equal(b.description, '')
  a.equal(b.category, BOOK_DEFAULT_CATEGORY)
  a.deepEqual(b.tags, [])
  a.equal(b.order, BOOK_LARGE_ORDER)
  a.equal(b.size, 0)
  a.equal(b.hasMeta, false)
  a.equal(b.source, 'static')
})

test('normalizeBook：脏数据不抛错也不丢字段', () => {
  const b = normalizeBook({ id: 'x', title: 123, tags: 'not-array', order: NaN, size: Infinity })
  a.equal(b.title, 'x', '非字符串标题回落到 id')
  a.deepEqual(b.tags, [], '非数组标签回落空数组')
  a.ok(Number.isFinite(b.order), 'order 必须有限（不能是 NaN/Infinity，JSON 会变 null）')
  a.equal(b.size, 0, 'Infinity 回落 0')
})

test('normalizeBook：完全非对象输入返回安全骨架而非抛错', () => {
  for (const bad of [null, undefined, 42, 'str', []]) {
    const b = normalizeBook(bad)
    a.equal(typeof b.id, 'string')
    a.equal(typeof b.title, 'string')
  }
})

test('normalizeBook：source 只认 static / upload', () => {
  a.equal(normalizeBook({ id: 'a', source: 'weird' }).source, 'static')
  a.equal(normalizeBook({ id: 'a', source: 'upload' }).source, 'upload')
})

test('normalizeBooks：过滤非对象项，不静默丢有效条目', () => {
  const list = normalizeBooks([{ id: 'a' }, null, { id: 'b' }, undefined, 'x'])
  a.equal(list.length, 2)
  a.deepEqual(list.map((b) => b.id), ['a', 'b'])
})

test('normalizeBooks：非数组输入返回空数组', () => {
  a.deepEqual(normalizeBooks(null), [])
  a.deepEqual(normalizeBooks({}), [])
})

// ============ matchKeyword ============

test('matchKeyword：空关键词与纯空格都算命中', () => {
  const b = mkBook({ id: 'a', title: '道德经' })
  a.ok(matchKeyword(b, ''))
  a.ok(matchKeyword(b, '   '))
})

test('matchKeyword：标题/简介/分类/标签任一命中即可', () => {
  const b = mkBook({
    id: 'a',
    title: '道德经',
    description: '道可道非常道',
    category: '国学经典',
    tags: ['老子']
  })
  a.ok(matchKeyword(b, '道德'))
  a.ok(matchKeyword(b, '非常道'))
  a.ok(matchKeyword(b, '国学'))
  a.ok(matchKeyword(b, '老子'))
  a.ok(!matchKeyword(b, '孙子'))
})

test('matchKeyword：大小写与前后空格不敏感', () => {
  const b = mkBook({ id: 'a', title: 'OpenCode 指南' })
  a.ok(matchKeyword(b, 'opencode'))
  a.ok(matchKeyword(b, '  OPENCODE  '))
})

test('matchKeyword：多词为 AND 语义，全命中才算', () => {
  const b = mkBook({ id: 'a', title: 'OpenCode 指南', tags: ['AI'] })
  a.ok(matchKeyword(b, 'opencode 指南'))
  a.ok(matchKeyword(b, 'opencode ai'))
  a.ok(!matchKeyword(b, 'opencode 不存在的词'), '只要有一词不命中就该排除')
})

// ============ categoryCounts / categoryList ============

test('categoryCounts：按全集统计，不受筛选影响', () => {
  const books = [mkBook({ id: 'a', category: '国学' }), mkBook({ id: 'b', category: '国学' }), mkBook({ id: 'c', category: '技术' })]
  a.deepEqual(categoryCounts(books), { 国学: 2, 技术: 1 })
})

test('categoryList：按书目数降序，同数按名称排', () => {
  const books = [
    mkBook({ id: 'a', category: '技术' }),
    mkBook({ id: 'b', category: '国学' }),
    mkBook({ id: 'c', category: '国学' })
  ]
  a.deepEqual(categoryList(books), [
    { name: '国学', count: 2 },
    { name: '技术', count: 1 }
  ])
})

test('categoryList：空数组返回空列表', () => {
  a.deepEqual(categoryList([]), [])
})

// ============ sortBooks ============

test('sortBooks：按打开次数降序', () => {
  const books = [mkBook({ id: 'a' }), mkBook({ id: 'b' }), mkBook({ id: 'c' })]
  const sorted = sortBooks(books, 'clicks-desc', { clicks: { a: 1, b: 99, c: 5 } })
  a.deepEqual(sorted.map((b) => b.id), ['b', 'c', 'a'])
})

test('sortBooks：次数相同时回落 order，再回落标题（排序稳定可预期）', () => {
  const books = [
    mkBook({ id: 'z', order: 30 }),
    mkBook({ id: 'a', order: 10 }),
    mkBook({ id: 'm', order: 10 })
  ]
  const sorted = sortBooks(books, 'clicks-desc', { clicks: {} })
  a.deepEqual(sorted.map((b) => b.id), ['a', 'm', 'z'])
})

test('sortBooks：最近打开降序，未打开过的排后面', () => {
  const books = [mkBook({ id: 'never' }), mkBook({ id: 'old' }), mkBook({ id: 'new' })]
  const sorted = sortBooks(books, 'recent-desc', { recent: { old: 100, new: 999 } })
  a.deepEqual(sorted.map((b) => b.id), ['new', 'old', 'never'])
})

test('sortBooks：按更新时间降序', () => {
  const books = [
    mkBook({ id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }),
    mkBook({ id: 'new', updatedAt: '2026-06-01T00:00:00.000Z' })
  ]
  a.deepEqual(sortBooks(books, 'updated-desc').map((b) => b.id), ['new', 'old'])
})

test('sortBooks：坏时间戳按 0 处理，不让整表排序崩掉', () => {
  const books = [mkBook({ id: 'bad', updatedAt: 'not-a-date' }), mkBook({ id: 'good', updatedAt: '2026-06-01T00:00:00.000Z' })]
  const sorted = sortBooks(books, 'updated-desc')
  a.deepEqual(sorted.map((b) => b.id), ['good', 'bad'])
})

test('sortBooks：按体积降序', () => {
  const books = [mkBook({ id: 's', size: 10 }), mkBook({ id: 'l', size: 99999 })]
  a.deepEqual(sortBooks(books, 'size-desc').map((b) => b.id), ['l', 's'])
})

test('sortBooks：标题 A→Z / Z→A', () => {
  const books = [mkBook({ id: 'b', title: '乙' }), mkBook({ id: 'a', title: '甲' })]
  a.deepEqual(sortBooks(books, 'title-asc').map((b) => b.id), ['a', 'b'])
  a.deepEqual(sortBooks(books, 'title-desc').map((b) => b.id), ['b', 'a'])
})

test('sortBooks：不修改入参数组（纯函数）', () => {
  const books = [mkBook({ id: 'b' }), mkBook({ id: 'a' })]
  const before = books.map((b) => b.id)
  sortBooks(books, 'title-asc')
  a.deepEqual(books.map((b) => b.id), before, '入参顺序不能被排序就地改掉')
})

test('sortBooks：缺省 sort 走最近打开，不抛错', () => {
  const books = [mkBook({ id: 'a' })]
  a.equal(sortBooks(books, undefined as unknown as BookSort).length, 1)
})

// ============ filterBooks ============

test('filterBooks：无条件时全量通过', () => {
  const books = [mkBook({ id: 'a' }), mkBook({ id: 'b' })]
  a.equal(filterBooks(books, { keyword: '', category: '', favoritesOnly: false, bookmarkedOnly: false }).length, 2)
})

test('filterBooks：分类筛选', () => {
  const books = [mkBook({ id: 'a', category: '国学' }), mkBook({ id: 'b', category: '技术' })]
  const r = filterBooks(books, { keyword: '', category: '国学', favoritesOnly: false, bookmarkedOnly: false })
  a.deepEqual(r.map((b) => b.id), ['a'])
})

test('filterBooks：仅看收藏 / 仅看有书签', () => {
  const books = [mkBook({ id: 'a' }), mkBook({ id: 'b' }), mkBook({ id: 'c' })]
  const ctx = { favorites: ['a', 'c'], bookmarked: ['b'] }
  a.deepEqual(
    filterBooks(books, { keyword: '', category: '', favoritesOnly: true, bookmarkedOnly: false }, ctx).map((b) => b.id),
    ['a', 'c']
  )
  a.deepEqual(
    filterBooks(books, { keyword: '', category: '', favoritesOnly: false, bookmarkedOnly: true }, ctx).map((b) => b.id),
    ['b']
  )
})

test('filterBooks：条件之间为 AND', () => {
  const books = [mkBook({ id: 'a', category: '国学', title: '甲' }), mkBook({ id: 'b', category: '国学', title: '乙' })]
  const r = filterBooks(
    books,
    { keyword: '甲', category: '国学', favoritesOnly: false, bookmarkedOnly: false },
    { favorites: ['a', 'b'], bookmarked: [] }
  )
  a.deepEqual(r.map((b) => b.id), ['a'])
})

test('filterBooks：ctx 缺省为空集合而非抛错', () => {
  const books = [mkBook({ id: 'a' })]
  a.equal(filterBooks(books, { keyword: '', category: '', favoritesOnly: true, bookmarkedOnly: false }).length, 0)
})

// ============ paginate / safePage ============

test('paginate：正常切片', () => {
  const items = [1, 2, 3, 4, 5]
  a.deepEqual(paginate(items, 1, 2), [1, 2])
  a.deepEqual(paginate(items, 3, 2), [5])
})

test('paginate：page 越界回落到最后一页', () => {
  const items = [1, 2, 3, 4, 5]
  a.deepEqual(paginate(items, 99, 2), [5])
})

test('paginate：pageSize ≤ 0 时原样返回，不返回空', () => {
  const items = [1, 2, 3]
  a.deepEqual(paginate(items, 1, 0), items)
})

test('paginate：空数组不炸', () => {
  a.deepEqual(paginate([], 1, 10), [])
})

test('safePage：越界收敛到合法区间', () => {
  a.equal(safePage(0, 10, 3), 1)
  a.equal(safePage(-5, 10, 3), 1)
  a.equal(safePage(99, 10, 3), 4)
  a.equal(safePage(2, 10, 3), 2)
  a.equal(safePage(99, 0, 10), 1, '空列表也应给出合法页码 1')
})

// ============ formatSize / formatTotalSize ============

test('formatSize：按量级选单位', () => {
  a.equal(formatSize(0), '未知')
  a.equal(formatSize(-1), '未知')
  a.equal(formatSize(512), '512 B')
  a.equal(formatSize(1024), '1 KB')
  a.equal(formatSize(1024 * 1024), '1.0 MB')
  a.equal(formatSize(1024 * 1024 * 1024), '1.00 GB')
})

test('formatTotalSize：合计体积', () => {
  const books = [mkBook({ id: 'a', size: 1024 }), mkBook({ id: 'b', size: 1024 })]
  a.equal(formatTotalSize(books), '2 KB')
  a.equal(formatTotalSize([]), '未知')
})

test('formatTotalSize：坏体积按 0 累加而非污染总和', () => {
  const books = [mkBook({ id: 'a', size: NaN }), mkBook({ id: 'b', size: 1024 })]
  a.equal(formatTotalSize(books), '1 KB')
})

// ============ formatRelative / formatClicks ============

test('formatRelative：各时间段与从未打开', () => {
  const now = Date.parse('2026-06-15T12:00:00.000Z')
  a.equal(formatRelative(0, now), '从未打开')
  a.equal(formatRelative(now - 30_000, now), '刚刚')
  a.equal(formatRelative(now - 5 * 60_000, now), '5 分钟前')
  a.equal(formatRelative(now - 3 * 3_600_000, now), '3 小时前')
  a.equal(formatRelative(now - 2 * 86_400_000, now), '2 天前')
  a.ok(formatRelative(now - 60 * 86_400_000, now).startsWith('2026-'), '超 30 天给日期')
})

test('formatClicks：0 次不展示噪音', () => {
  a.equal(formatClicks(0), '')
  a.equal(formatClicks(1), '打开 1 次')
  a.equal(formatClicks(12), '打开 12 次')
})

// ============ 书签：scrollRatio / ratioToScrollTop ============

test('scrollRatio：用可滚动高度作分母', () => {
  // scrollHeight 5000、可视 1000 → 可滚动 4000；滚 2000 → 50%
  a.equal(scrollRatio(2000, 5000, 1000), 0.5)
  a.equal(scrollRatio(0, 5000, 1000), 0)
  a.equal(scrollRatio(4000, 5000, 1000), 1)
})

test('scrollRatio：文档不够高（滚不动）判为 0', () => {
  a.equal(scrollRatio(100, 500, 500), 0)
  a.equal(scrollRatio(0, 500, 600), 0)
})

test('scrollRatio：越界比例收敛到 0..1', () => {
  a.equal(scrollRatio(-500, 5000, 1000), 0, '负值收敛到 0')
  a.equal(scrollRatio(99999, 5000, 1000), 1, '超界收敛到 1')
  a.equal(scrollRatio(NaN, 5000, 1000), 0)
})

test('ratioToScrollTop：按当前文档高度反算（跨设备能对上）', () => {
  a.equal(ratioToScrollTop(0.5, 5000, 1000), 2000)
  a.equal(ratioToScrollTop(1, 5000, 1000), 4000)
})

test('ratioToScrollTop：比例非法时回落 0，不抛错', () => {
  a.equal(ratioToScrollTop(NaN, 5000, 1000), 0)
  a.equal(ratioToScrollTop(5, 5000, 1000), 4000, '超界比例先收敛再算')
  a.equal(ratioToScrollTop(0.5, 500, 500), 0, '滚不动时目标为 0')
})

test('scrollRatio 与 ratioToScrollTop 互为逆运算', () => {
  const sh = 12345
  const ch = 800
  const top = ratioToScrollTop(0.37, sh, ch)
  a.ok(Math.abs(scrollRatio(top, sh, ch) - 0.37) < 1e-9)
})

test('scrollRatio：换设备后按比例恢复仍指向同一相对位置', () => {
  // 桌面 5000/1000、恢复 30% → 1200px；换手机 3000/700 → 同样 30% → 690px
  a.equal(ratioToScrollTop(0.3, 5000, 1000), 1200)
  a.equal(ratioToScrollTop(0.3, 3000, 700), 690)
})

// ============ formatProgress / normalizeBookmark ============

test('formatProgress：百分比取整', () => {
  a.equal(formatProgress(0.426), '已读 43%', '42.6 四舍五入为 43')
  a.equal(formatProgress(0.42), '已读 42%')
  a.equal(formatProgress(0), '已读 0%')
  a.equal(formatProgress(1), '已读 100%')
  a.equal(formatProgress(NaN), '已读 0%')
})

test('normalizeBookmark：合法书签归一化', () => {
  const b = normalizeBookmark({ ratio: 0.4, label: ' 天道 ', ts: 123 })
  a.equal(b?.ratio, 0.4)
  a.equal(b?.label, '天道')
  a.equal(b?.ts, 123)
})

test('normalizeBookmark：空 / 脏数据返回 null（视为无书签）', () => {
  a.equal(normalizeBookmark(null), null)
  a.equal(normalizeBookmark(undefined), null)
  a.equal(normalizeBookmark('x'), null)
  a.equal(normalizeBookmark({}), null, '全空字段等同无书签')
})

test('normalizeBookmark：越界 ratio 收敛、超长 label 截断', () => {
  a.equal(normalizeBookmark({ ratio: 5 })?.ratio, 1, '超界收敛到 1')
  a.equal(
    normalizeBookmark({ ratio: -3 }),
    null,
    '负 ratio 收敛到 0 后既无标题也无时间 → 等同无书签，返回 null'
  )
  a.equal(normalizeBookmark({ ratio: NaN, label: 'x' })?.ratio, 0, 'NaN 收敛到 0，但有标题故保留书签')
  a.equal(normalizeBookmark({ ratio: 0.1, label: 'x'.repeat(200) })?.label.length, 60)
})

// ============ pickScrollTarget（内部滚动容器判定）============

test('pickScrollTarget：文档本身可滚时优先用 window', () => {
  const r = pickScrollTarget(
    { scrollHeight: 5000, clientHeight: 800 },
    [{ scrollHeight: 5000, clientHeight: 800, width: 300, height: 800 }]
  )
  a.equal(r, 'window')
})

test('pickScrollTarget：文档不可滚时改用内部容器（道德经的真实形态）', () => {
  // 道德经实测：documentElement 849/849 不可滚，正文在 nav.toc-sidebar 4518/809
  const r = pickScrollTarget(
    { scrollHeight: 849, clientHeight: 849 },
    [{ scrollHeight: 4518, clientHeight: 809, width: 320, height: 809 }]
  )
  a.equal(r, 'inner')
})

test('pickScrollTarget：多个容器时取面积最大者（正文而非工具条）', () => {
  const r = pickScrollTarget(
    { scrollHeight: 800, clientHeight: 800 },
    [
      { scrollHeight: 2000, clientHeight: 700, width: 60, height: 700 },   // 窄工具条
      { scrollHeight: 5000, clientHeight: 800, width: 900, height: 800 },   // 正文
      { scrollHeight: 1500, clientHeight: 400, width: 300, height: 400 }
    ]
  )
  a.equal(r, 'inner')
})

test('pickScrollTarget：书太短滚不动时返回 null（不该记无意义书签）', () => {
  a.equal(pickScrollTarget({ scrollHeight: 800, clientHeight: 800 }, []), null)
  a.equal(
    pickScrollTarget({ scrollHeight: 805, clientHeight: 800 }, [
      { scrollHeight: 800, clientHeight: 800, width: 500, height: 800 }
    ]),
    null
  )
})

test('pickScrollTarget：容差内不算可滚（避免 1~8px 抖动误判）', () => {
  a.equal(pickScrollTarget({ scrollHeight: 805, clientHeight: 800 }, []), null)
  a.equal(pickScrollTarget({ scrollHeight: 810, clientHeight: 800 }, []), 'window')
})

test('scrollTargetIndex：返回内部容器下标，window 场景为 -1', () => {
  a.equal(
    scrollTargetIndex({ scrollHeight: 5000, clientHeight: 800 }, [
      { scrollHeight: 5000, clientHeight: 800, width: 100, height: 800 }
    ]),
    -1
  )
  a.equal(
    scrollTargetIndex({ scrollHeight: 800, clientHeight: 800 }, [
      { scrollHeight: 2000, clientHeight: 700, width: 60, height: 700 },
      { scrollHeight: 5000, clientHeight: 800, width: 900, height: 800 }
    ]),
    1,
    '第二个才是面积最大的正文容器'
  )
  a.equal(scrollTargetIndex({ scrollHeight: 800, clientHeight: 800 }, []), -1)
})

test('内部容器场景下 scrollRatio 仍按可滚动高度算（道德经 4518/809 → 中点约 50%）', () => {
  const mid = (4518 - 809) / 2
  const r = scrollRatio(mid, 4518, 809)
  a.ok(Math.abs(r - 0.5) < 0.01, `实际 ${r}`)
})

// ============ 上传：slugifyBookId / checkUploadFile ============

test('slugifyBookId：去扩展名、转小写、空格下划线转连字符', () => {
  a.equal(slugifyBookId('道德经.html'), '道德经')
  a.equal(slugifyBookId('My Book.HTML'), 'my-book')
  a.equal(slugifyBookId('a_b  c.htm'), 'a-b-c')
})

test('slugifyBookId：剔除非法字符、收敛连续与首尾连字符', () => {
  a.equal(slugifyBookId('hello!!!world'), 'helloworld')
  a.equal(slugifyBookId('---abc---'), 'abc')
  a.equal(slugifyBookId('a//\\b'), 'ab')
})

test('slugifyBookId：超长名截断到 60 字符', () => {
  a.ok(slugifyBookId('书'.repeat(200)).length <= 60)
})

test('slugifyBookId：全非法字符返回空串', () => {
  a.equal(slugifyBookId('!!!.html'), '')
})

test('checkUploadFile：正常 HTML 通过并给出 id 与书名', () => {
  const r = checkUploadFile({ name: '道德经.html', size: 5000 })
  a.ok(r.ok)
  a.equal(r.id, '道德经')
  a.equal(r.title, '道德经')
})

test('checkUploadFile：非 HTML 后缀被拒', () => {
  const r = checkUploadFile({ name: 'photo.png', size: 100 })
  a.equal(r.ok, false)
  a.equal(r.reason, 'not-html')
})

test('checkUploadFile：空文件被拒', () => {
  const r = checkUploadFile({ name: 'a.html', size: 0 })
  a.equal(r.reason, 'empty')
})

test('checkUploadFile：超上限被拒并给出可读体积', () => {
  const r = checkUploadFile({ name: 'big.html', size: BOOKS_UPLOAD_MAX_BYTES + 1 })
  a.equal(r.reason, 'too-large')
  a.ok((r.message ?? '').includes('MB'))
})

test('checkUploadFile：重名被拒', () => {
  const r = checkUploadFile({ name: '道德经.html', size: 100 }, ['道德经'])
  a.equal(r.reason, 'dup')
})

test('checkUploadFile：文件名全非法被拒', () => {
  const r = checkUploadFile({ name: '!!!.html', size: 100 })
  a.equal(r.reason, 'empty')
})

test('BOOKS_RECENT_LIMIT 为正整数', () => {
  a.ok(Number.isInteger(BOOKS_RECENT_LIMIT) && BOOKS_RECENT_LIMIT > 0)
})

// ============ 云同步合并：mergeBooksPrefsEnvelope（books.json 信封）============

function mkSync(partial: Partial<BooksPrefsSyncData> = {}): BooksPrefsSyncData {
  return { version: 1, exportedAt: '', favorites: [], userBookmarks: [], ...partial }
}
function mkMark(partial: Partial<UserBookmark> & { id: string }): UserBookmark {
  return { title: partial.id, content: '', ts: 0, ...partial }
}

test('mergeBooksPrefsEnvelope：双方皆空 → 空结果', () => {
  const m = mergeBooksPrefsEnvelope(mkSync(), mkSync())
  a.deepEqual(m.favorites, [])
  a.deepEqual(m.userBookmarks, [])
})

test('mergeBooksPrefsEnvelope：收藏取并集，本地顺序优先 + 远端独有', () => {
  const m = mergeBooksPrefsEnvelope(
    mkSync({ favorites: ['a', 'b'] }),
    mkSync({ favorites: ['b', 'c'] })
  )
  a.deepEqual(m.favorites, ['a', 'b', 'c'])
})

test('mergeBooksPrefsEnvelope：脏收藏（非字符串/空串）被剔除', () => {
  const m = mergeBooksPrefsEnvelope(
    mkSync({ favorites: ['a', '', 123 as unknown as string, null as unknown as string] }),
    mkSync({ favorites: ['b'] })
  )
  a.deepEqual(m.favorites, ['a', 'b'])
})

test('mergeBooksPrefsEnvelope：用户书签同 id 取较新 ts（远端更新则覆盖内容）', () => {
  const m = mergeBooksPrefsEnvelope(
    mkSync({ userBookmarks: [mkMark({ id: 'x', title: '本地', content: 'L', ts: 100 })] }),
    mkSync({ userBookmarks: [mkMark({ id: 'x', title: '远端', content: 'R', ts: 200 })] })
  )
  a.equal(m.userBookmarks.length, 1)
  a.equal(m.userBookmarks[0].title, '远端', '较新一侧的内容应胜出')
  a.equal(m.userBookmarks[0].content, 'R')
})

test('mergeBooksPrefsEnvelope：用户书签本地更新则盖过远端旧值', () => {
  const m = mergeBooksPrefsEnvelope(
    mkSync({ userBookmarks: [mkMark({ id: 'x', title: '本地新', ts: 300 })] }),
    mkSync({ userBookmarks: [mkMark({ id: 'x', title: '远端旧', ts: 200 })] })
  )
  a.equal(m.userBookmarks[0].title, '本地新')
})

test('mergeBooksPrefsEnvelope：远端独有书签追加（保序）', () => {
  const m = mergeBooksPrefsEnvelope(
    mkSync({ userBookmarks: [mkMark({ id: 'a', ts: 1 })] }),
    mkSync({ userBookmarks: [mkMark({ id: 'b', ts: 2 }), mkMark({ id: 'a', ts: 1 })] })
  )
  a.deepEqual(m.userBookmarks.map((b) => b.id), ['a', 'b'])
})

test('mergeBooksPrefsEnvelope：脏书签（无书名）被丢弃，仅健康项参与合并', () => {
  const m = mergeBooksPrefsEnvelope(
    mkSync({ userBookmarks: [mkMark({ id: 'a', title: '', ts: 1 })] }),
    mkSync({ userBookmarks: [mkMark({ id: 'b', ts: 2 })] })
  )
  a.deepEqual(m.userBookmarks.map((b) => b.id), ['b'])
})

test('mergeBooksPrefsEnvelope：收藏与用户书签互不干扰，整体写入信封', () => {
  const m = mergeBooksPrefsEnvelope(
    mkSync({ favorites: ['a'], userBookmarks: [mkMark({ id: 'x', ts: 1 })] }),
    mkSync({ favorites: ['b'], userBookmarks: [mkMark({ id: 'y', ts: 2 })] })
  )
  a.deepEqual(m.favorites, ['a', 'b'])
  a.deepEqual(m.userBookmarks.map((b) => b.id), ['x', 'y'])
  a.equal(m.version, 1)
  a.ok(typeof m.exportedAt === 'string' && m.exportedAt.length > 0)
})

test('mergeBooksPrefsEnvelope：不修改入参（纯函数）', () => {
  const l = mkSync({ favorites: ['a'], userBookmarks: [mkMark({ id: 'x', ts: 1 })] })
  const r = mkSync({ favorites: ['b'], userBookmarks: [mkMark({ id: 'x', ts: 9 })] })
  mergeBooksPrefsEnvelope(l, r)
  a.deepEqual(l.favorites, ['a'])
  a.deepEqual(r.favorites, ['b'])
  a.equal(l.userBookmarks[0].ts, 1)
  a.equal(r.userBookmarks[0].ts, 9)
})

// ============ normalizeUserBookmark ============

test('normalizeUserBookmark：正常归一化', () => {
  const b = normalizeUserBookmark({ id: 'i1', title: ' 书 ', content: 'c', ts: 5 })
  a.equal(b?.id, 'i1')
  a.equal(b?.title, '书')
  a.equal(b?.content, 'c')
  a.equal(b?.ts, 5)
})

test('normalizeUserBookmark：空书名返回 null（视为脏数据）', () => {
  a.equal(normalizeUserBookmark({ title: '' }), null)
  a.equal(normalizeUserBookmark({ title: '   ' }), null)
})

test('normalizeUserBookmark：缺 id / ts 自动补', () => {
  const b = normalizeUserBookmark({ title: 'x' })
  a.ok(!!b && typeof b.id === 'string' && b.id.length > 0)
  a.ok(!!b && Number.isFinite(b.ts))
})

// ============ runner ============

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