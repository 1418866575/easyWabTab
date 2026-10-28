/**
 * 博客模块纯函数（core）
 *
 * 与项目其它 core 同构：**不含任何 Vue / IndexedDB / 副作用**，可被 scripts/test-blog-core.ts
 * 直接 import 断言。store 一律薄委托本文件的纯函数。
 *
 * 本期范围：文章 + 分类 + 标签 + 设置 + 状态流转 + 发布校验。
 * 评论实体按需求文档标注「延后」未实现，故 `commentCount` 恒为 0。
 */
import { ARTICLE_STATUSES, BLOG_SORTS } from '../types'
import type { ArticleStatus, BlogArticle, BlogCategory, BlogCoverKind, BlogData, BlogImage, BlogImageCategory, BlogImageSort, BlogImageUsage, BlogSettings, BlogSort, BlogTag, BlogWechatConfig } from '../types'
import { isAllowedDataImage, parseImageRefs } from './blogImages'

/** 博客数据结构版本：normalizeBlogData 据此判定是否需要迁移 */
export const BLOG_DATA_VERSION = 1

export const DEFAULT_PIN_LIMIT = 3
export const DEFAULT_EXCERPT_LENGTH = 120
export const DEFAULT_PAGE_SIZE = 10

/** 与路由、静态资源冲突的保留 slug（命中则拒绝保存） */
export const RESERVED_SLUGS = [
  'admin', 'search', 'archive', 'tag', 'category', 'category-list',
  'new', 'edit', 'api', 'static', 'assets', 'index', 'rss', 'sitemap'
] as const

export const ARTICLE_STATUS_LABELS: Record<ArticleStatus, string> = {
  draft: '草稿',
  reviewing: '待审核',
  published: '已发布',
  offline: '已下架',
  rejected: '未通过'
}

// ==================== 基础工具 ====================

export function nowIso(): string {
  return new Date().toISOString()
}

/** 生成带前缀的 id；附带随机后缀避免同一毫秒批量创建时撞号 */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function emptyBlogSettings(): BlogSettings {
  return {
    blogName: '我的博客',
    blogDescription: '',
    pageSize: DEFAULT_PAGE_SIZE,
    defaultSort: 'updated-desc',
    pinLimit: DEFAULT_PIN_LIMIT,
    autoSaveSeconds: 3,
    excerptLength: DEFAULT_EXCERPT_LENGTH,
    sessionTimeoutMin: 120,
    footer: ''
  }
}

export function emptyBlogData(): BlogData {
  return {
    version: BLOG_DATA_VERSION,
    updatedAt: nowIso(),
    settings: emptyBlogSettings(),
    categories: [],
    tags: [],
    articles: [],
    images: [],
    imageCategories: []
  }
}

// ==================== Slug ====================

/**
 * 标题 → slug：保留字母数字、下划线、连字符与中文字符，其余符号转 "-" 并折叠首尾连字符。
 * 保留中文是有意为之——中文博客用中文 slug 更可读，浏览器访问时会自动做 percent-encoding；
 * 纯数字符号（如 emoji、标点）的标题会得到空串，调用方需回落时间戳（见 makeUniqueSlug）。
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\w一-龥-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug.trim().toLowerCase())
}

/** 在已占用集合中生成唯一 slug：冲突时追加 -2 / -3 … */
export function makeUniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, s => s.trim().toLowerCase()))
  const candidate = slugify(base) || `post-${Date.now()}`
  if (!used.has(candidate)) return candidate
  let n = 2
  while (used.has(`${candidate}-${n}`)) n += 1
  return `${candidate}-${n}`
}

/**
 * 默认文章地址（slug）：年月日时分秒（YYYYMMDDHHmmss）+ 4 位随机小写字母。
 * 用于新建文章时自动填充，避免默认沿用中文标题 slug；随机后缀足够长，几乎不会与已有 slug 冲突。
 */
export function defaultSlug(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  let rand = ''
  for (let i = 0; i < 4; i++) rand += letters[Math.floor(Math.random() * letters.length)]
  return `${stamp}${rand}`
}

// ==================== 派生内容 ====================

/** Markdown → 纯文本（去代码块 / 标题符 / 链接与强调语法 / 列表符），用于摘要与字数估算 */
export function plainTextOfMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 阅读时长（分钟）：中文按 ~400 字/分钟估算，最少 1 分钟 */
export function estimateReadingMinutes(md: string): number {
  const text = plainTextOfMarkdown(md)
  if (!text) return 1
  return Math.max(1, Math.ceil(text.length / 400))
}

/** 摘要：优先手填；为空时按 plain text 截断，省略号仅在真正截断时出现 */
export function autoExcerpt(md: string, length = DEFAULT_EXCERPT_LENGTH): string {
  const text = plainTextOfMarkdown(md)
  if (!text) return ''
  return text.length <= length ? text : `${text.slice(0, length)}…`
}

// ==================== 归一化（永不抛错，逐项兜底） ====================

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function normalizeCoverKind(v: unknown): BlogCoverKind {
  return v === 'image' || v === 'gradient' || v === 'solid' ? v : 'none'
}

function normalizeStatus(v: unknown): ArticleStatus {
  return (ARTICLE_STATUSES as readonly string[]).includes(v as string) ? (v as ArticleStatus) : 'draft'
}

function normalizeSort(v: unknown): BlogSort {
  return (BLOG_SORTS as readonly string[]).includes(v as string) ? (v as BlogSort) : 'updated-desc'
}

export function normalizeSettings(raw: unknown): BlogSettings {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const base = emptyBlogSettings()
  return {
    blogName: str(src.blogName, base.blogName),
    blogDescription: str(src.blogDescription, base.blogDescription),
    pageSize: clampNumber(src.pageSize, 1, 100, base.pageSize),
    defaultSort: normalizeSort(src.defaultSort),
    pinLimit: clampNumber(src.pinLimit, 1, 20, base.pinLimit),
    autoSaveSeconds: clampNumber(src.autoSaveSeconds, 1, 30, base.autoSaveSeconds),
    excerptLength: clampNumber(src.excerptLength, 20, 500, base.excerptLength),
    sessionTimeoutMin: clampNumber(src.sessionTimeoutMin, 5, 1440, base.sessionTimeoutMin),
    footer: str(src.footer, base.footer)
  }
}

export function normalizeArticle(raw: unknown, when = nowIso()): BlogArticle {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const title = str(src.title)
  const markdown = str(src.contentMarkdown)
  const excerpt = str(src.excerpt) || autoExcerpt(markdown)
  const createdAt = str(src.createdAt, when)
  const tagIds = Array.isArray(src.tagIds) ? Array.from(new Set(src.tagIds.filter((t): t is string => typeof t === 'string'))) : []
  return {
    id: str(src.id) || newId('ba'),
    slug: str(src.slug).trim() ? slugify(str(src.slug)) : defaultSlug(),
    title,
    subtitle: typeof src.subtitle === 'string' ? src.subtitle : undefined,
    excerpt,
    coverImageId: typeof src.coverImageId === 'string' ? src.coverImageId : undefined,
    coverKind: normalizeCoverKind(src.coverKind),
    coverToken: typeof src.coverToken === 'string' ? src.coverToken : undefined,
    contentMarkdown: markdown,
    status: normalizeStatus(src.status),
    authorId: typeof src.authorId === 'string' ? src.authorId : undefined,
    categoryId: typeof src.categoryId === 'string' ? src.categoryId : undefined,
    tagIds,
    pinned: src.pinned === true,
    viewCount: clampNumber(src.viewCount, 0, Number.MAX_SAFE_INTEGER, 0),
    commentCount: 0,
    readingMinutes: estimateReadingMinutes(markdown),
    createdAt,
    updatedAt: str(src.updatedAt, createdAt),
    publishedAt: typeof src.publishedAt === 'string' ? src.publishedAt : undefined,
    offlineAt: typeof src.offlineAt === 'string' ? src.offlineAt : undefined,
    deletedAt: typeof src.deletedAt === 'string' ? src.deletedAt : undefined,
    // 彻底删除墓碑：必须透传，否则归一化这步把它抹掉，墓碑随信封同步就失效了
    purgedAt: typeof src.purgedAt === 'string' ? src.purgedAt : undefined,
    seoTitle: typeof src.seoTitle === 'string' ? src.seoTitle : undefined,
    seoDescription: typeof src.seoDescription === 'string' ? src.seoDescription : undefined,
    auditRemark: typeof src.auditRemark === 'string' ? src.auditRemark : undefined,
    authorName: typeof src.authorName === 'string' ? src.authorName : undefined,
    sharedAt: typeof src.sharedAt === 'string' ? src.sharedAt : undefined,
    revision: clampNumber(src.revision, 1, Number.MAX_SAFE_INTEGER, 1)
  }
}

export function normalizeCategory(raw: unknown, index = 0, when = nowIso()): BlogCategory {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const name = str(src.name)
  return {
    id: str(src.id) || newId('bc'),
    name,
    slug: slugify(str(src.slug) || name) || `category-${index + 1}`,
    parentId: typeof src.parentId === 'string' ? src.parentId : undefined,
    description: typeof src.description === 'string' ? src.description : undefined,
    icon: typeof src.icon === 'string' && src.icon ? src.icon : undefined,
    order: clampNumber(src.order, 0, Number.MAX_SAFE_INTEGER, index),
    createdAt: str(src.createdAt, when),
    updatedAt: str(src.updatedAt, str(src.createdAt, when))
  }
}

export function normalizeTag(raw: unknown, index = 0, when = nowIso()): BlogTag {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const name = str(src.name)
  return {
    id: str(src.id) || newId('bt'),
    name,
    slug: slugify(str(src.slug) || name) || `tag-${index + 1}`,
    colorToken: typeof src.colorToken === 'string' ? src.colorToken : undefined,
    createdAt: str(src.createdAt, when)
  }
}

/** 图片库条目兜底：dataUrl 非白名单位图（空串 / svg / 非 base64）→ 返回 null 由调用方丢弃 */
export function normalizeImage(raw: unknown, when = nowIso()): BlogImage | null {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const dataUrl = str(src.dataUrl)
  if (!isAllowedDataImage(dataUrl)) return null
  const size = typeof src.size === 'number' && Number.isFinite(src.size) ? src.size : undefined
  const categoryId = str(src.categoryId).trim()
  const img: BlogImage = {
    id: str(src.id) || newId('bi'),
    name: str(src.name),
    dataUrl,
    size,
    createdAt: str(src.createdAt, when)
  }
  if (categoryId) img.categoryId = categoryId
  return img
}

/**
 * 全量兜底：非法状态回落 draft、重复 id 去重、缺失时间戳补齐，
 * 任何畸形输入都不抛错（与 normalizeNoteData / normalizeGenealogyData 同原则）。
 */
export function normalizeBlogData(raw: unknown): BlogData {
  const when = nowIso()
  if (typeof raw !== 'object' || raw === null) return emptyBlogData()
  const src = raw as Record<string, unknown>
  const empty = emptyBlogData()

  const seenArticle = new Set<string>()
  const articles: BlogArticle[] = []
  for (const item of Array.isArray(src.articles) ? src.articles : []) {
    const a = normalizeArticle(item, when)
    if (seenArticle.has(a.id)) continue
    seenArticle.add(a.id)
    articles.push(a)
  }

  const seenCat = new Set<string>()
  const categories: BlogCategory[] = []
  for (const [i, item] of (Array.isArray(src.categories) ? src.categories : []).entries()) {
    const c = normalizeCategory(item, i, when)
    if (seenCat.has(c.id)) continue
    seenCat.add(c.id)
    categories.push(c)
  }

  const seenTag = new Set<string>()
  const tags: BlogTag[] = []
  for (const [i, item] of (Array.isArray(src.tags) ? src.tags : []).entries()) {
    const t = normalizeTag(item, i, when)
    if (seenTag.has(t.id)) continue
    seenTag.add(t.id)
    tags.push(t)
  }

  const seenImage = new Set<string>()
  const images: BlogImage[] = []
  for (const item of Array.isArray(src.images) ? src.images : []) {
    const img = normalizeImage(item, when)
    if (!img || seenImage.has(img.id)) continue
    seenImage.add(img.id)
    images.push(img)
  }

  const seenImageCat = new Set<string>()
  const imageCategories: BlogImageCategory[] = []
  for (const [i, item] of (Array.isArray(src.imageCategories) ? src.imageCategories : []).entries()) {
    const c = normalizeImageCategory(item, i, when)
    if (seenImageCat.has(c.id)) continue
    seenImageCat.add(c.id)
    imageCategories.push(c)
  }

  const wechat: BlogWechatConfig | undefined =
    src.wechat && typeof src.wechat === 'object'
      ? {
          appId: str((src.wechat as Record<string, unknown>).appId, ''),
          appSecret: str((src.wechat as Record<string, unknown>).appSecret, '')
        }
      : undefined

  return {
    version: BLOG_DATA_VERSION,
    updatedAt: str(src.updatedAt, when),
    settings: normalizeSettings(src.settings ?? empty.settings),
    categories,
    tags,
    articles,
    images,
    imageCategories,
    wechat
  }
}

// ==================== 图片库维护 ====================

/** 已删除（回收站）或彻底删除的文章不再占用图片引用。
 *  否则会出现死锁：文章已删 → 图片仍显示“被引用” → 删图被拦，
 *  而用户又无法进入已删的文章去“移除图片”。 */
function isArticleGone(a: BlogArticle): boolean {
  return !!a.deletedAt || !!a.purgedAt
}

/** 汇总所有**未删除**文章正文引用的图片 id（回收站/彻底删除的不算，释放引用） */
export function collectReferencedImageIds(articles: BlogArticle[]): Set<string> {
  const ids = new Set<string>()
  for (const a of articles) {
    if (isArticleGone(a)) continue
    for (const id of parseImageRefs(a.contentMarkdown)) ids.add(id)
  }
  return ids
}

/** 清理图片库中已无任何文章引用的图片（删除正文图片后调用） */
export function pruneUnusedImages(images: BlogImage[], articles: BlogArticle[]): BlogImage[] {
  const used = collectReferencedImageIds(articles)
  return images.filter(img => used.has(img.id))
}

/**
 * 图片 id → 被引用详情（图库卡片文案、删除限制与提示的依据）。
 *
 * 引用口径：**正文** `img:<id>` 短引用 **或** 文章**封面** `coverImageId` 任一命中即计入
 * （早期版本只扫正文，会把仅作封面的图片误判为「未使用」，此处一并修正）。
 * 同一篇文章多次引用只计 1（去重）；**已删除（回收站/彻底删除）的文章不计入**，
 * 删除文章即释放图片引用，避免“文章已删、图片却删不掉”的死锁。
 */
export function collectImageUsage(
  images: BlogImage[],
  articles: BlogArticle[]
): Map<string, BlogImageUsage> {
  const usage = new Map<string, BlogImageUsage>()
  for (const img of images) usage.set(img.id, { count: 0, articleIds: [], coverCount: 0 })
  for (const a of articles) {
    if (isArticleGone(a)) continue
    const hit = new Set(parseImageRefs(a.contentMarkdown))
    if (a.coverImageId) hit.add(a.coverImageId)
    for (const id of hit) {
      const cur = usage.get(id)
      if (!cur) continue
      cur.count += 1
      cur.articleIds.push(a.id)
      if (a.coverImageId === id) cur.coverCount += 1
    }
  }
  return usage
}

/** 图库分类兜底：缺失 id 补生成、名称截断 30 字、缺失 order 用下标兜底 */
export function normalizeImageCategory(raw: unknown, index: number, when = nowIso()): BlogImageCategory {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const order = typeof src.order === 'number' && Number.isFinite(src.order) ? src.order : index
  return {
    id: str(src.id) || newId('bic'),
    name: str(src.name).slice(0, 30) || '未命名分类',
    order,
    createdAt: str(src.createdAt, when),
    updatedAt: str(src.updatedAt, when)
  }
}

/** 图库分类排序：order 升序，同 order 用创建时间兜底保证顺序稳定 */
export function sortImageCategories(list: BlogImageCategory[]): BlogImageCategory[] {
  return [...list].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
}

/** 新分类应取的 order：当前最大值 + 1（空列表时为 0） */
export function nextImageCategoryOrder(list: BlogImageCategory[]): number {
  if (list.length === 0) return 0
  return Math.max(...list.map(c => c.order)) + 1
}

/**
 * 图库按分类筛选。
 * key 为 'all' 时返回全部；'uncategorized' 时只返回未分类（无 categoryId）；
 * 其余按分类 id 精确匹配。**注意**：分类被删除后其图片会置空 categoryId，
 * 因此这里对已不存在的分类 id 会自然返回空列表（不会误判成未分类）。
 */
export function filterImagesByCategory(images: BlogImage[], key: string): BlogImage[] {
  if (key === 'all') return images
  if (key === 'uncategorized') return images.filter(i => !i.categoryId)
  return images.filter(i => i.categoryId === key)
}

/** 图库关键词筛选：按名称（大小写不敏感）模糊匹配 */
export function filterImages(images: BlogImage[], keyword: string): BlogImage[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return images
  return images.filter(img => img.name.toLowerCase().includes(kw))
}

/** 图库排序：最新优先 / 最早优先 / 名称升序 */
export function sortImages(images: BlogImage[], sort: BlogImageSort = 'created-desc'): BlogImage[] {
  const list = [...images]
  switch (sort) {
    case 'created-asc':
      return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    case 'name-asc':
      return list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    case 'created-desc':
    default:
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}

/** 字节数 → 易读文本（图库卡片展示用） */
export function formatBytes(bytes?: number): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i += 1
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}

// ==================== 查询与排序 ====================

/** 后台列表：默认排除回收站（deletedAt 非空）条目 */
export function listActiveArticles(articles: BlogArticle[]): BlogArticle[] {
  return articles.filter(a => !a.deletedAt)
}

export function listRecycledArticles(articles: BlogArticle[]): BlogArticle[] {
  // 已彻底删除（purgedAt 非空）的墓碑不进回收站展示：它留在数组里只是为了随信封上云，
  // 到期由 gcPurgedArticles 物理清除
  return articles.filter(a => !!a.deletedAt && !a.purgedAt)
}

/**
 * 前台列表：仅「已发布」且未进入回收站（deletedAt 为空）的文章。
 * 与 listActiveArticles 不同——后者含草稿 / 待审 / 下架等一切未删除条目，
 * 前台必须严格只展示 published（且不能让下架/审核中的文章漏出来）。
 */
export function listPublishedArticles(articles: BlogArticle[]): BlogArticle[] {
  return articles.filter(a => a.status === 'published' && !a.deletedAt)
}

export interface ArticleQuery {
  keyword?: string
  status?: ArticleStatus | 'all' | 'active'
  categoryId?: string
  tagId?: string
}

export function filterArticles(articles: BlogArticle[], q: ArticleQuery): BlogArticle[] {
  const keyword = (q.keyword ?? '').trim().toLowerCase()
  return articles.filter(a => {
    if (q.status && q.status !== 'all') {
      if (q.status === 'active') {
        if (a.status === 'published') return false
      } else if (a.status !== q.status) {
        return false
      }
    }
    if (q.categoryId && a.categoryId !== q.categoryId) return false
    if (q.tagId && !a.tagIds.includes(q.tagId)) return false
    if (keyword) {
      const hay = [a.title, a.subtitle ?? '', a.excerpt, a.slug, a.contentMarkdown].join('\n').toLowerCase()
      if (!hay.includes(keyword)) return false
    }
    return true
  })
}

/**
 * 排序：**置顶恒在最前**（与所选排序无关，符合需求「置顶文章固定排在结果最前」），
 * 其余条项按 sort 规则排。此前只有默认排序（updated-desc）把置顶提到最前，
 * 切到「最早更新 / 标题」等排序后置顶会被挤到中间，属实现遗漏。
 */
export function sortArticles(articles: BlogArticle[], sort: BlogSort = 'updated-desc'): BlogArticle[] {
  const list = [...articles]
  const byText = (a: BlogArticle, b: BlogArticle) => a.title.localeCompare(b.title, 'zh-Hans-CN')
  /** 先比较置顶：状态不同时直接定序；相同时返回 0 交给后续规则 */
  const pinFirst = (a: BlogArticle, b: BlogArticle): number =>
    a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1
  const byPin = (cmp: (a: BlogArticle, b: BlogArticle) => number) =>
    (a: BlogArticle, b: BlogArticle): number => pinFirst(a, b) || cmp(a, b)
  switch (sort) {
    case 'updated-asc':
      return list.sort(byPin((a, b) => a.updatedAt.localeCompare(b.updatedAt)))
    case 'created-desc':
      return list.sort(byPin((a, b) => b.createdAt.localeCompare(a.createdAt)))
    case 'published-desc':
      return list.sort(byPin((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')))
    case 'views-desc':
      return list.sort(byPin((a, b) => b.viewCount - a.viewCount))
    case 'title-asc':
      return list.sort(byPin(byText))
    case 'updated-desc':
    default:
      return list.sort(byPin((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  }
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const size = Math.max(1, pageSize)
  const start = (Math.max(1, page) - 1) * size
  return items.slice(start, start + size)
}

// ==================== 状态机 ====================

export type ArticleAction =
  | 'submit'      // 提交发布（是否需审核由上层规则决定）
  | 'publish'     // 直接上线
  | 'approve'     // 管理员通过
  | 'reject'      // 管理员驳回
  | 'withdraw'    // 撤回审核
  | 'offline'     // 下架（已发布 → 前台不可见）

// 删除与恢复不在此表中：删除是软删除（写 deletedAt）、恢复是清 deletedAt，
// 二者都不改变 status 本身，故不参与状态机（避免出现 delete → draft 这类伪转移）。
const TRANSITIONS: Record<ArticleStatus, Partial<Record<ArticleAction, ArticleStatus>>> = {
  draft: { submit: 'reviewing', publish: 'published' },
  reviewing: { approve: 'published', reject: 'rejected', withdraw: 'draft' },
  rejected: { submit: 'reviewing', publish: 'published' },
  published: { offline: 'offline', submit: 'reviewing' },
  offline: { publish: 'published' }
}

export function nextStatus(status: ArticleStatus, action: ArticleAction): ArticleStatus | null {
  return TRANSITIONS[status]?.[action] ?? null
}

export function canTransitionArticle(status: ArticleStatus, action: ArticleAction): boolean {
  return nextStatus(status, action) !== null
}

// ==================== 发布前校验 ====================

export interface PublishCheckContext {
  /** 除自身以外已被占用的 slug */
  takenSlugs: Iterable<string>
  /** 是否存在的分类 id */
  knownCategoryIds: Iterable<string>
  /** 是否存在且未被删除的 tagId：这里仅用于过滤非法 tagId */
  knownTagIds: Iterable<string>
}

export function collectPublishErrors(article: BlogArticle, ctx: PublishCheckContext): string[] {
  const errors: string[] = []
  const title = article.title.trim()
  if (!title) errors.push('标题不可为空')
  if (title.length > 100) errors.push('标题不能超过 100 个字符')
  if (!article.contentMarkdown.trim()) errors.push('正文不可为空')
  const slug = article.slug.trim()
  if (!slug) errors.push('slug 不可为空')
  if (isReservedSlug(slug)) errors.push(`slug「${slug}」为系统保留字，请更换`)
  if (Array.from(ctx.takenSlugs).includes(slug)) errors.push(`slug「${slug}」已被占用，请更换`)
  if (article.categoryId && !Array.from(ctx.knownCategoryIds).includes(article.categoryId)) {
    errors.push('所选分类已不存在，请重新选择')
  }
  return errors
}

/** 命中保留字或长度超限的 settings 字段错误（用于设置页保存前校验） */
export function collectSettingsErrors(settings: BlogSettings): string[] {
  const errors: string[] = []
  if (!settings.blogName.trim()) errors.push('博客名称不可为空')
  if (settings.blogName.length > 50) errors.push('博客名称不能超过 50 个字符')
  if (settings.blogDescription.length > 200) errors.push('博客简介不能超过 200 个字符')
  if (settings.footer.length > 200) errors.push('页脚信息不能超过 200 个字符')
  if (!Number.isFinite(settings.pageSize) || settings.pageSize < 1 || settings.pageSize > 100) {
    errors.push('每页文章数需在 1 ~ 100 之间')
  }
  if (!Number.isFinite(settings.pinLimit) || settings.pinLimit < 0 || settings.pinLimit > 20) {
    errors.push('置顶上限需在 0 ~ 20 之间')
  }
  if (!Number.isFinite(settings.excerptLength) || settings.excerptLength < 20 || settings.excerptLength > 500) {
    errors.push('自动摘要长度需在 20 ~ 500 之间')
  }
  if (!Number.isFinite(settings.autoSaveSeconds) || settings.autoSaveSeconds < 1 || settings.autoSaveSeconds > 60) {
    errors.push('自动保存间隔需在 1 ~ 60 秒之间')
  }
  if (!Number.isFinite(settings.sessionTimeoutMin) || settings.sessionTimeoutMin < 5 || settings.sessionTimeoutMin > 1440) {
    errors.push('本地会话超时需在 5 ~ 1440 分钟之间')
  }
  return errors
}

// ==================== 展示格式化（纯函数，便于单测） ====================

/** ISO 字符串 → 本地 YY-M-D / YYYY-M-D HH:mm 形式；非法输入回落 '-' */
export function formatDateTime(iso?: string, withTime = true): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  if (!withTime) return date
  return `${date} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 相对时间：一小时以内按分钟、当天按小时、本年按月日、跨年按完整日期。
 * 未来时间同样走此函数，得到「x 分钟后 / x 小时后」。
 */
export function relativeTime(iso?: string, now = Date.now()): string {
  if (!iso) return '-'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '-'
  const future = t > now
  const diff = Math.abs(t - now)
  const min = Math.floor(diff / 60000)
  const suffix = future ? '后' : '前'
  if (min < 1) return future ? '即将' : '刚刚'
  if (min < 60) return `${min} 分钟${suffix}`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时${suffix}`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天${suffix}`
  return formatDateTime(iso, false)
}
