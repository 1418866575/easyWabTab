/**
 * 个人图书馆纯逻辑（零 Vue 依赖，可 `node --experimental-strip-types` 直测）
 *
 * 覆盖：manifest 归一化、搜索过滤、分类统计、多字段排序、书签 ratio 计算与恢复换算。
 *
 * 设计约定（与工具箱 / 博客的 core 层同构）：
 * - 所有函数纯函数：入参 → 出参，不碰 DOM / store / localStorage
 * - 脏数据一律**降级为安全默认值**而非抛错（门户页不该因一条坏记录整页崩）
 * - 只增不删：normalize 永远返回与输入等长或更长的数组，不静默丢弃条目
 */

// ==================== 类型 ====================

/** 书籍来源：静态资源（public/bookdata，脚本扫描得来）/ 本机上传（IndexedDB） */
export type BookSource = 'static' | 'upload'

export interface BookItem {
  id: string
  title: string
  description: string
  cover: string
  category: string
  tags: string[]
  /** 排序权重（meta.json 的 order；未设时为大值，排最后） */
  order: number
  /** 静态书为 `/bookdata/<id>/index.html`；上传书由前端运行时生成 blob URL，故允许非站内路径 */
  entry: string
  /** 字节数，0 表示未知 */
  size: number
  updatedAt: string
  /** 是否配有 meta.json（无则书名简介靠自动抓取） */
  hasMeta: boolean
  source: BookSource
}

export type BookSort = 'recent-desc' | 'clicks-desc' | 'title-asc' | 'title-desc' | 'updated-desc' | 'size-desc'

export const BOOK_SORTS: ReadonlyArray<{ value: BookSort; label: string }> = [
  { value: 'recent-desc', label: '最近打开' },
  { value: 'clicks-desc', label: '打开次数' },
  { value: 'title-asc', label: '标题 A→Z' },
  { value: 'title-desc', label: '标题 Z→A' },
  { value: 'updated-desc', label: '最近更新' },
  { value: 'size-desc', label: '体积大→小' }
]

/** 未设 order 时的排序权重（与 gen-books-manifest.cjs 的 LARGE_ORDER 保持一致） */
export const BOOK_LARGE_ORDER = 1e9

/** 分类兜底名：与扫描脚本的 DEFAULT_CATEGORY 一致 */
export const BOOK_DEFAULT_CATEGORY = '未分类'

/** 最近打开保留条数 */
export const BOOKS_RECENT_LIMIT = 12

// ==================== 归一化 ====================

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function tags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const t of value) {
    if (typeof t !== 'string') continue
    const s = t.trim()
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

function source(value: unknown): BookSource {
  return value === 'upload' ? 'upload' : 'static'
}

/**
 * 归一化 manifest 原始条目。
 *
 * 兜底铁律：脏数据只降级不丢条目 —— 即使 entry 缺失也保留该书（卡片仍可见，
 * 只是点击会提示不可用），因为「宁可显示一条打不开的书，也不要书凭空消失」。
 */
export function normalizeBook(raw: unknown): BookItem {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const id = str(o.id, 'unknown')
  return {
    id,
    title: str(o.title, id),
    description: str(o.description),
    cover: str(o.cover),
    category: str(o.category, BOOK_DEFAULT_CATEGORY),
    tags: tags(o.tags),
    order: num(o.order, BOOK_LARGE_ORDER),
    entry: str(o.entry),
    size: num(o.size),
    updatedAt: str(o.updatedAt),
    hasMeta: o.hasMeta === true,
    source: source(o.source)
  }
}

/** 归一化整个清单（manifest 数组 + 本机上传项数组） */
export function normalizeBooks(raws: unknown): BookItem[] {
  if (!Array.isArray(raws)) return []
  return raws.filter((r) => r && typeof r === 'object').map(normalizeBook)
}

// ==================== 搜索 ====================

/**
 * 关键词匹配：标题 / 简介 / 分类 / 标签，任一命中即算。
 * 空格分词后要求**全部词命中**（AND），比单关键词更符合预期。
 */
export function matchKeyword(book: BookItem, keyword: string): boolean {
  const q = keyword.trim().toLowerCase()
  if (!q) return true
  const words = q.split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = [book.title, book.description, book.category, ...book.tags]
    .join(' ')
    .toLowerCase()
  return words.every((w) => haystack.includes(w))
}

// ==================== 分类统计 ====================

/** 各分类下的书目数（基于全集，不随当前筛选变化，与工具箱 / 博客前台一致） */
export function categoryCounts(books: BookItem[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const b of books) out[b.category] = (out[b.category] ?? 0) + 1
  return out
}

/** 分类列表：按书目数降序、同数按名称排序；空分类天然不出现（因统计源自全集） */
export function categoryList(books: BookItem[]): Array<{ name: string; count: number }> {
  return Object.entries(categoryCounts(books))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.name.localeCompare(b.name, 'zh-Hans-CN')))
}

// ==================== 排序 ====================

/**
 * 多字段排序。
 *
 * - `recent` 为「最近打开」时间戳（毫秒），未打开过的为 0
 * - 次数/时间相同时**一律回落到 order，再回落标题**，保证排序稳定、可预期，
 *   不会因为点击次数相同而在每次渲染间跳来跳去。
 */
export function sortBooks(
  books: BookItem[],
  sort: BookSort,
  opts: { clicks?: Record<string, number>; recent?: Record<string, number> } = {}
): BookItem[] {
  const clicks = opts.clicks ?? {}
  const recent = opts.recent ?? {}
  const arr = [...books]

  const byOrderThenTitle = (a: BookItem, b: BookItem): number => {
    if (a.order !== b.order) return a.order - b.order
    return a.title.localeCompare(b.title, 'zh-Hans-CN')
  }

  switch (sort) {
    case 'clicks-desc': {
      arr.sort((a, b) => {
        const d = (clicks[b.id] ?? 0) - (clicks[a.id] ?? 0)
        return d !== 0 ? d : byOrderThenTitle(a, b)
      })
      break
    }
    case 'title-asc':
      arr.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
      break
    case 'title-desc':
      arr.sort((a, b) => b.title.localeCompare(a.title, 'zh-Hans-CN'))
      break
    case 'updated-desc': {
      arr.sort((a, b) => {
        const ta = Date.parse(a.updatedAt) || 0
        const tb = Date.parse(b.updatedAt) || 0
        return tb !== ta ? tb - ta : byOrderThenTitle(a, b)
      })
      break
    }
    case 'size-desc': {
      arr.sort((a, b) => (b.size !== a.size ? b.size - a.size : byOrderThenTitle(a, b)))
      break
    }
    case 'recent-desc':
    default: {
      arr.sort((a, b) => {
        const ra = recent[a.id] ?? 0
        const rb = recent[b.id] ?? 0
        return rb !== ra ? rb - ra : byOrderThenTitle(a, b)
      })
      break
    }
  }
  return arr
}

// ==================== 过滤 ====================

export interface BookFilter {
  keyword: string
  /** 空串 = 不限分类 */
  category: string
  /** 仅看收藏 */
  favoritesOnly: boolean
  /** 仅看有书签的 */
  bookmarkedOnly: boolean
}

/** 完整过滤管线：先收藏/书签这类集合过滤，再关键词，最后分类 */
export function filterBooks(
  books: BookItem[],
  filter: BookFilter,
  ctx: { favorites: string[]; bookmarked: string[] } = { favorites: [], bookmarked: [] }
): BookItem[] {
  const favs = new Set(ctx.favorites)
  const marks = new Set(ctx.bookmarked)
  return books.filter((b) => {
    if (filter.favoritesOnly && !favs.has(b.id)) return false
    if (filter.bookmarkedOnly && !marks.has(b.id)) return false
    if (filter.category && b.category !== filter.category) return false
    return matchKeyword(b, filter.keyword)
  })
}

// ==================== 分页 ====================

/** 分页切片；page 越界时回落到最后一页（筛选后总数变少的情况） */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  if (pageSize <= 0) return items
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return items.slice(start, start + pageSize)
}

/** 安全页码：越界回落到 1..totalPages */
export function safePage(page: number, total: number, pageSize: number): number {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return Math.min(Math.max(1, page), totalPages)
}

// ==================== 格式化 ====================

/** 字节 → 人类可读（KB/MB/GB，与前端展示一致） */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '未知'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

/** 合计体积的可读文本 */
export function formatTotalSize(books: BookItem[]): string {
  const total = books.reduce((sum, b) => sum + (Number.isFinite(b.size) ? b.size : 0), 0)
  return formatSize(total)
}

/** 相对时间（最近打开用）：刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期 */
export function formatRelative(ts: number, now: number = Date.now()): string {
  if (!Number.isFinite(ts) || ts <= 0) return '从未打开'
  const diff = now - ts
  if (diff < 0) return '刚刚'
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 打开次数的可读文本：0 次不展示，避免"0 次"这种噪音 */
export function formatClicks(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  return `打开 ${n} 次`
}

// ==================== 阅读位置书签 ====================

export interface BookBookmark {
  /** 阅读进度比例 0..1 */
  ratio: number
  /** 当时可见的首个标题（章节名），拿不到则空串 */
  label: string
  ts: number
}

/**
 * 由滚动位置算阅读进度比例。
 *
 * 用**可滚动高度**而非 scrollHeight 作分母：书没滚到底时 scrollHeight 远大于可视区，
 * 直接除会算出虚高的进度。文档太短滚不动时（分母 ≤0）判为 0。
 */
export function scrollRatio(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const scrollable = scrollHeight - clientHeight
  if (!Number.isFinite(scrollable) || scrollable <= 0) return 0
  const r = scrollTop / scrollable
  if (!Number.isFinite(r)) return 0
  return Math.min(1, Math.max(0, r))
}

/**
 * 由比例反推 scrollTop。
 *
 * 恢复阅读位置时**不能**直接存 scrollTop 像素：换设备 / 改窗口大小 / 换主题字号后
 * 文档高度会变，像素值就指错地方了。存比例、按当前文档重算才对。
 */
export function ratioToScrollTop(ratio: number, scrollHeight: number, clientHeight: number): number {
  const r = typeof ratio === 'number' && Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0
  const scrollable = scrollHeight - clientHeight
  if (!Number.isFinite(scrollable) || scrollable <= 0) return 0
  return r * scrollable
}

/** 书签进度的展示文本，如「已读 42%」 */
export function formatProgress(ratio: number): string {
  const r = typeof ratio === 'number' && Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0
  return `已读 ${Math.round(r * 100)}%`
}

/** 书签归一化：脏数据降级为 null（视为无书签），不产出半截书签 */
export function normalizeBookmark(raw: unknown): BookBookmark | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const ratio = typeof o.ratio === 'number' && Number.isFinite(o.ratio) ? Math.min(1, Math.max(0, o.ratio)) : 0
  const label = typeof o.label === 'string' ? o.label.trim().slice(0, 60) : ''
  const ts = typeof o.ts === 'number' && Number.isFinite(o.ts) ? o.ts : 0
  // ratio 为 0 且无标题无时间 → 等同无书签，直接不给
  if (ratio <= 0 && !label && ts <= 0) return null
  return { ratio, label, ts }
}

// ==================== 内部滚动容器（关键）====================

/**
 * 在文档里找出**真正承载正文滚动**的元素。
 *
 * 为什么必须有这一步：不少「书」不是让 document 滚动，而是用了一个内部滚动容器
 * —— 例如 `public/bookdata/daodejing`（道德经）是侧边目录布局，正文装在
 * `nav.toc-sidebar`（overflow-y:auto，高 4518px / 视口 809px）里，
 * 此时 `document.documentElement.scrollHeight === clientHeight`，**window.scrollTo 完全无效**。
 *
 * 只认 window 滚动的话，这类书（很可能是你书库里的大多数）书签永远是空。
 *
 * 判定优先级：
 * 1. 文档本身可滚（scrollHeight > clientHeight + 容差）→ 用 window
 * 2. 否则找面积最大、且内容确实超出视口范围的内部滚动容器
 * 3. 都没有 → 返回 null（书太短，滚不动，不需要书签）
 *
 * 「面积最大」而非「第一个」：书里常有多个 overflow:auto 的侧栏/工具条，
 * 那个最大最可能是正文。
 *
 * 纯函数：接收高度数据数组，不碰 DOM —— 故可直接单测。
 */
export function pickScrollTarget(
  doc: { scrollHeight: number; clientHeight: number },
  candidates: Array<{ scrollHeight: number; clientHeight: number; width: number; height: number }>,
  tolerance = 8
): 'window' | 'inner' | null {
  if (doc.scrollHeight - doc.clientHeight > tolerance) return 'window'

  let best: { area: number; index: number } | null = null
  candidates.forEach((c, i) => {
    if (c.scrollHeight - c.clientHeight <= tolerance) return
    const area = Math.max(0, c.width) * Math.max(0, c.height)
    if (!best || area > best.area) best = { area, index: i }
  })

  return best ? 'inner' : null
}

/** 内部容器在候选列表里的下标（-1 = 用 window） */
export function scrollTargetIndex(
  doc: { scrollHeight: number; clientHeight: number },
  candidates: Array<{ scrollHeight: number; clientHeight: number; width: number; height: number }>,
  tolerance = 8
): number {
  return pickScrollTarget(doc, candidates, tolerance) === 'inner' ? indexOfLargest(candidates, tolerance) : -1
}

function indexOfLargest(
  candidates: Array<{ scrollHeight: number; clientHeight: number; width: number; height: number }>,
  tolerance: number
): number {
  let best = -1
  let bestArea = -1
  candidates.forEach((c, i) => {
    if (c.scrollHeight - c.clientHeight <= tolerance) return
    const area = Math.max(0, c.width) * Math.max(0, c.height)
    if (area > bestArea) {
      bestArea = area
      best = i
    }
  })
  return best
}

// ==================== 上传（Q3）====================

/** 上传体积上限：8MB。单文件自包含 HTML 常见 0.1~1MB，8MB 足够宽松又能挡住误传大视频 */
export const BOOKS_UPLOAD_MAX_BYTES = 8 * 1024 * 1024

/** 上传结果分类，便于界面给出针对性提示 */
export type UploadRejectReason = 'not-html' | 'too-large' | 'empty' | 'dup'

export interface UploadCheck {
  ok: boolean
  reason?: UploadRejectReason
  message?: string
  /** 清洗后的 id：合法书名 → 可用作目录/主键 */
  id?: string
  /** 从文件名解析出的书名（去扩展名） */
  title?: string
}

/**
 * 把书名 / 文件名洗成合法 id：小写、空格与下划线转连字符、剥扩展名、去非法字符。
 * 中文保留（URL 里合法且便于识别），但压缩空白。
 */
export function slugifyBookId(input: string): string {
  const base = input.replace(/\.html?$/i, '').trim()
  return base
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** 校验待上传的文件 */
export function checkUploadFile(
  file: { name: string; type?: string; size: number },
  existingIds: string[] = []
): UploadCheck {
  if (!/\.html?$/i.test(file.name)) {
    return { ok: false, reason: 'not-html', message: '只支持 .html 文件' }
  }
  if (file.size <= 0) {
    return { ok: false, reason: 'empty', message: '文件是空的' }
  }
  if (file.size > BOOKS_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      reason: 'too-large',
      message: `文件超过 ${formatSize(BOOKS_UPLOAD_MAX_BYTES)} 上限（当前 ${formatSize(file.size)}）`
    }
  }
  const id = slugifyBookId(file.name)
  if (!id) {
    return { ok: false, reason: 'empty', message: '文件名里没有可用字符，请改个名字' }
  }
  if (existingIds.includes(id)) {
    return { ok: false, reason: 'dup', id, message: `已存在同名书「${id}」，换个文件名或先删掉原来那本` }
  }
  return { ok: true, id, title: file.name.replace(/\.html?$/i, '') }
}

// ==================== 下载（Q4）====================

/**
 * 二级页面：入口页（index.html）之外、同在本书目录里的其它 .html 页面。
 *
 * 判定口径刻意收窄 —— 只认「本书目录下的相对 html 链接」：
 * 外链、锚点、协议相对、跳出本书目录的 ../ 一律不算。宁可少下一页，
 * 也不要把整站或别人的书一起拖下来。
 */

/** 单次下载最多打包的二级页面数：挡住目录页里成百上千条链接把内存撑爆 */
export const BOOK_SUBPAGE_LIMIT = 200

/** 单本书下载的总字节上限：60MB，超过则截断并按已取到的部分打包 */
export const BOOK_DOWNLOAD_MAX_BYTES = 60 * 1024 * 1024

/** 抓二级页面时的并发上限：太高容易被浏览器连接池或网关限流 */
export const BOOK_DOWNLOAD_CONCURRENCY = 6

export interface SubPageOptions {
  /** 书籍目录前缀（含尾斜杠），如 `/bookdata/gushi/`；站点绝对 href 只有落在它下面才算本书的子页 */
  dirPrefix?: string
  /** 入口页文件名（默认 index.html）—— 它本身不算二级页 */
  entryName?: string
  /** 最多返回条数 */
  limit?: number
}

/** 入口地址所在目录（含尾斜杠）；地址里没有斜杠时返回 '' */
export function bookDirOf(entry: string): string {
  const i = entry.lastIndexOf('/')
  return i >= 0 ? entry.slice(0, i + 1) : ''
}

/** 入口地址的文件名部分（入口页本身，如 index.html） */
export function bookEntryName(entry: string): string {
  const i = entry.lastIndexOf('/')
  return (i >= 0 ? entry.slice(i + 1) : entry) || 'index.html'
}

/**
 * 单条 href → 二级页面相对路径；不是则返回 null。
 *
 * 返回的是**相对本书目录**的路径（如 `chapter-01.html`、`part/02.html`），
 * 拼上 `bookDirOf(entry)` 就是可抓取的完整地址。
 */
export function normalizeSubPageRef(href: string, opts: SubPageOptions = {}): string | null {
  let raw = (typeof href === 'string' ? href : '').trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  // 锚点与各类伪协议：不是页面
  if (
    lower.startsWith('#') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:')
  ) {
    return null
  }
  // 外链 / 协议相对地址：明确不是本书的页面
  if (raw.includes('://') || raw.startsWith('//')) return null
  // 先削掉锚点与查询串再判定扩展名
  const hashIdx = raw.indexOf('#')
  if (hashIdx >= 0) raw = raw.slice(0, hashIdx)
  const qIdx = raw.indexOf('?')
  if (qIdx >= 0) raw = raw.slice(0, qIdx)
  if (!raw) return null
  // 站点绝对路径：只有落在本书目录下才算本书的二级页
  if (raw.startsWith('/')) {
    const prefix = opts.dirPrefix ?? ''
    if (!prefix || !raw.toLowerCase().startsWith(prefix.toLowerCase())) return null
    raw = raw.slice(prefix.length)
  }
  // 跳出本书目录的相对路径一律丢弃
  if (raw.split('/').includes('..')) return null
  if (!/\.html?$/i.test(raw)) return null
  const file = raw.replace(/^\.\//, '')
  if (!file || file.startsWith('/')) return null
  const fl = file.toLowerCase()
  const entryName = (opts.entryName ?? 'index.html').toLowerCase()
  // 入口页自身已在下载之列；index.html / index.htm 恒视为入口，不重复打包
  if (fl === entryName || fl === 'index.html' || fl === 'index.htm') return null
  return file
}

/**
 * 从入口页 HTML 里抽出二级页面相对路径：按**出现顺序**去重。
 *
 * 用正则而非 DOMParser —— 本函数要能跑在 node 里做单测（`npm run test:books`），
 * 而入口页动辄几十万字符，建 DOM 树既慢又不是这里需要的信息量。
 */
export function extractBookSubPages(html: string, opts: SubPageOptions = {}): string[] {
  if (typeof html !== 'string' || !html) return []
  const limit = Math.max(1, Math.floor(opts.limit ?? BOOK_SUBPAGE_LIMIT))
  const out: string[] = []
  const seen = new Set<string>()
  // 三种写法都要认全：href="x" / href='x' / href=x
  const re = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    if (!raw) continue
    const file = normalizeSubPageRef(raw, opts)
    if (!file) continue
    const key = file.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(file)
    if (out.length >= limit) break
  }
  return out
}