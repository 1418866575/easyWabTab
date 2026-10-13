/**
 * 个人图书馆本机偏好（收藏 / 最近打开 / 打开次数 / 阅读位置书签 / 用户自建书签）
 *
 * - 单例：模块级 ref 持有状态（沿用 blogFrontPrefs / useToolboxPrefs 的写法，不新建 Pinia store）
 * - 存储：**IndexedDB `nav` store 的独立键**（`BOOKS_PREFS_NAV_KEY`），不是 localStorage
 * - **云同步范围（2026-10-14 起）**：`favorites`（收藏）、`userBookmarks`（用户自建书签）、`recent`（最近阅读）三项
 *   通过 `books.json` 信封跨设备同步；`clicks`（打开次数）/ `bookmarks`（阅读位置）/ 上传书为设备级，不进云。
 * - 容错：写入抛错（隐私模式 / 配额超限）降级为内存态，不影响页面使用
 * - 落盘：防抖 300ms —— 高频写点击次数不应每次都落盘
 *
 * ## 为什么阅读位置书签、打开次数不进云同步
 *
 * 阅读位置书签存的是 ratio（滚动比例 0..1）而不是像素位置，本想让「换设备也能大致对上」。
 * 但**换设备后文档高度、视口高度、主题字号全都不同**，同一个 42% 指向的章节并不相同；
 * 改存像素，跨设备 100% 又指错位置。两种存法都不是好体验，故阅读位置**只存本机**。
 *
 * 打开次数同理属于"这台设备的使用轨迹"，同步过去反而干扰另一台设备的排序，故不进云。
 *
 * 而**收藏（我想看什么）**与**用户自建书签（书名 + 自定义内容）**与**最近阅读列表**是用户主动沉淀 /
 * 跨设备一致才有意义的信息，因此这三项单独走 `books.json` 信封合并同步（见 export/import/merge 三件套）。
 * 其中「最近阅读」按用户要求（2026-10-13）纳入同步：book id 跨设备一致（同源静态书 / 同名上传书），
 * 看到同一份最近阅读列表才有意义；合并时同一 bookId 取较新（较大）打开时间戳。
 */

import { ref } from 'vue'
import { idbGetKey, idbPutKey, BOOKS_PREFS_NAV_KEY } from './useIdb.ts'
import { BOOKS_RECENT_LIMIT, normalizeBookmark, type BookBookmark } from './booksCore.ts'
// 类型与合并逻辑归属纯文件 booksSyncCore（零依赖、可单测，与 blogSyncCore 同构）
import {
  BOOKS_USER_BOOKMARKS_LIMIT,
  mergeBooksPrefsEnvelope,
  normalizeUserBookmark,
  type BooksPrefsSyncData,
  type UserBookmark
} from './booksSyncCore.ts'

// 供外部（BookBookmarkDialog 等）按原路径导入类型
export type { BooksPrefsSyncData, UserBookmark }

export interface BooksPrefs {
  favorites: string[]
  /** id → 最近打开时间戳（毫秒） */
  recent: Record<string, number>
  /** id → 打开次数 */
  clicks: Record<string, number>
  /** id → 阅读位置书签 */
  bookmarks: Record<string, BookBookmark>
  /** 用户自建书签列表（书名 + 自定义内容），与阅读位置书签完全独立 */
  userBookmarks: UserBookmark[]
}

/** 模块级单例状态（首屏即空，由 initBooksPrefs 从 IndexedDB 载入权威数据） */
const favorites = ref<string[]>([])
const recent = ref<Record<string, number>>({})
const clicks = ref<Record<string, number>>({})
const bookmarks = ref<Record<string, BookBookmark>>({})
const userBookmarks = ref<UserBookmark[]>([])

let saveTimer: ReturnType<typeof setTimeout> | null = null
let didInit = false

/** 记录数上限护栏：防止误操作产生几十万条 recent 把 IDB 写爆 */
const MAX_RECENT = 200
const MAX_CLICKS = 500
const MAX_USER_BOOKMARKS = BOOKS_USER_BOOKMARKS_LIMIT

function str(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const v of value) {
    if (typeof v === 'string' && v && !out.includes(v)) out.push(v)
  }
  return out
}

/** id → number 映射归一：剔除非有限值与空键 */
function numMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k === 'string' && k && typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v
  }
  return out
}

/** 书签映射归一：逐条 normalizeBookmark，null 直接丢弃（脏书签等同无书签） */
function markMap(value: unknown): Record<string, BookBookmark> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, BookBookmark> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k !== 'string' || !k) continue
    const b = normalizeBookmark(v)
    if (b) out[k] = b
  }
  return out
}

/** 用户自建书签列表归一：逐条 normalizeUserBookmark，脏数据（无书名）丢弃，重复 id 去重 */
function userMarks(value: unknown): UserBookmark[] {
  if (!Array.isArray(value)) return []
  const out: UserBookmark[] = []
  const seen = new Set<string>()
  for (const v of value) {
    const b = normalizeUserBookmark(v)
    if (b && !seen.has(b.id)) {
      seen.add(b.id)
      out.push(b)
    }
  }
  return out
}

function current(): BooksPrefs {
  return {
    favorites: favorites.value,
    recent: recent.value,
    clicks: clicks.value,
    bookmarks: bookmarks.value,
    userBookmarks: userBookmarks.value
  }
}

/** BooksPrefs 纯归一：复用 str/numMap/markMap/userMarks，供本地读取与云同步合并复用（不改任何 ref） */
function normalizeBooksPrefs(p: Partial<BooksPrefs> | undefined | null): BooksPrefs {
  return {
    favorites: str(p?.favorites),
    recent: numMap(p?.recent),
    clicks: numMap(p?.clicks),
    bookmarks: markMap(p?.bookmarks),
    userBookmarks: userMarks(p?.userBookmarks)
  }
}

function persistNow(): void {
  idbPutKey('nav', BOOKS_PREFS_NAV_KEY, JSON.stringify(current())).catch((e) => {
    console.warn('[booksPrefs] IndexedDB 写入失败，已降级为内存态:', e)
  })
}

function persist(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    persistNow()
  }, 300)
}

/** 立即落盘（页面隐藏 / 卸载时调用，避免防抖窗口内丢改动） */
export function flushBooksPrefs(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  persistNow()
}

function apply(p: Partial<BooksPrefs> | undefined): void {
  favorites.value = str(p?.favorites)
  recent.value = numMap(p?.recent)
  clicks.value = numMap(p?.clicks)
  bookmarks.value = markMap(p?.bookmarks)
  userBookmarks.value = userMarks(p?.userBookmarks)
}

/** 从 IndexedDB 载入（书架页 onMounted 调一次） */
export async function initBooksPrefs(): Promise<void> {
  if (didInit) return
  didInit = true
  try {
    const raw = await idbGetKey<string>('nav', BOOKS_PREFS_NAV_KEY)
    if (typeof raw === 'string') apply(JSON.parse(raw) as Partial<BooksPrefs>)
  } catch (e) {
    console.warn('[booksPrefs] IndexedDB 读取失败，沿用内存态:', e)
  }
}

// ========== 云同步信封（books.json）：仅 favorites + userBookmarks ==========
//
// 与博客前台偏好（blog-prefs.json）同构——偏好类数据走「并集 + 时间最新」合并，
// 单设备改动不会清空另一设备的数据；首次同步（本地为空）合并结果仍是远端完整内容。

/** 读本地整包 prefs（用于合并时保留 recent/clicks/bookmarks 等不进云字段） */
async function readLocalBooksPrefs(): Promise<BooksPrefs> {
  let raw: string | undefined
  try {
    raw = await idbGetKey<string>('nav', BOOKS_PREFS_NAV_KEY)
  } catch {
    // 读取失败 → 以空为底
  }
  return raw ? normalizeBooksPrefs(JSON.parse(raw)) : { favorites: [], recent: {}, clicks: {}, bookmarks: {}, userBookmarks: [] }
}

/** 导出本地要上云的三项（收藏 + 用户自建书签 + 最近阅读） */
export function exportBooksSyncData(): BooksPrefsSyncData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: str(favorites.value),
    userBookmarks: userMarks(userBookmarks.value),
    recent: { ...recent.value }
  }
}

/**
 * 把远端 books.json 信封合并写回本地：
 * - favorites 取并集（本地顺序优先 + 远端独有）
 * - userBookmarks 按 id 取较新 ts（同 id 内容随较新一侧），整体截断到上限
 * - recent 取并集，同一 bookId 取较新（较大）时间戳
 * clicks/bookmarks（阅读位置）等不进云字段原样保留，不被远端覆盖。
 */
export async function importBooksSyncData(remote: BooksPrefsSyncData): Promise<void> {
  if (!remote) return
  const local = await readLocalBooksPrefs()
  const merged = mergeBooksPrefsEnvelope(
    { version: 1, exportedAt: '', favorites: local.favorites, userBookmarks: local.userBookmarks, recent: local.recent },
    remote
  )
  const next: BooksPrefs = {
    ...local,
    favorites: merged.favorites,
    userBookmarks: merged.userBookmarks,
    recent: merged.recent
  }
  try {
    await idbPutKey('nav', BOOKS_PREFS_NAV_KEY, JSON.stringify(next))
  } catch (e) {
    console.warn('[booksPrefs] 云同步回写 IndexedDB 失败，已降级为内存态:', e)
  }
  // 同步更新单例，让书架页（同步按钮所在页）无需刷新即反映新数据
  favorites.value = merged.favorites
  userBookmarks.value = merged.userBookmarks
  recent.value = merged.recent
}

/** 云同步拉取后，从 IndexedDB 重载三项到单例（与 importBooksSyncData 的写入一致，做双保险） */
export async function reloadBooksPrefs(): Promise<void> {
  try {
    const raw = await idbGetKey<string>('nav', BOOKS_PREFS_NAV_KEY)
    if (typeof raw !== 'string') return
    const parsed = JSON.parse(raw) as Partial<BooksPrefs>
    favorites.value = str(parsed.favorites)
    userBookmarks.value = userMarks(parsed.userBookmarks)
    recent.value = numMap(parsed.recent)
  } catch {
    // 解析失败 → 静默跳过，下次进入书架时由 initBooksPrefs 自然从 IDB 读取
  }
}

export function useBooksPrefs() {
  const isFavorite = (id: string): boolean => favorites.value.includes(id)

  const toggleFavorite = (id: string): boolean => {
    const i = favorites.value.indexOf(id)
    if (i >= 0) favorites.value.splice(i, 1)
    else favorites.value.push(id)
    persist()
    return favorites.value.includes(id)
  }

  /**
   * 记录一次打开：打点 + 进最近阅读。
   * 一条记录同时承担「排序依据」与「最近列表」，避免两处数据算出不同结果。
   */
  const markOpened = (id: string): void => {
    if (!id) return
    const now = Date.now()
    const nextRecent = { ...recent.value, [id]: now }
    // 超上限时丢弃最久未打开的（按时间戳升序删）
    const keys = Object.keys(nextRecent)
    if (keys.length > MAX_RECENT) {
      keys
        .sort((a, b) => (nextRecent[a] ?? 0) - (nextRecent[b] ?? 0))
        .slice(0, keys.length - MAX_RECENT)
        .forEach((k) => delete nextRecent[k])
    }
    recent.value = nextRecent
    clicks.value = { ...clicks.value, [id]: (clicks.value[id] ?? 0) + 1 }
    const ck = Object.keys(clicks.value)
    if (ck.length > MAX_CLICKS) {
      ck
        .sort((a, b) => (clicks.value[a] ?? 0) - (clicks.value[b] ?? 0))
        .slice(0, ck.length - MAX_CLICKS)
        .forEach((k) => delete clicks.value[k])
    }
    persist()
  }

  /** 最近打开的 id（按时间倒序，已去重） */
  const recentIds = (): string[] =>
    Object.entries(recent.value)
      .sort((a, b) => b[1] - a[1])
      .slice(0, BOOKS_RECENT_LIMIT)
      .map(([id]) => id)

  const getBookmark = (id: string): BookBookmark | null => bookmarks.value[id] ?? null

  /** 写书签；label 省略时沿用旧书签的标题（自动保存不该抹掉用户手动起的名字） */
  const setBookmark = (id: string, ratio: number, label?: string): void => {
    const b = normalizeBookmark({ ratio, label: label ?? bookmarks.value[id]?.label ?? '', ts: Date.now() })
    if (!b) return
    bookmarks.value = { ...bookmarks.value, [id]: b }
    persist()
  }

  /** 只改标题（用户手动重命名书签，不动阅读位置） */
  const renameBookmark = (id: string, label: string): void => {
    const old = bookmarks.value[id]
    if (!old) return
    setBookmark(id, old.ratio, label)
  }

  const clearBookmark = (id: string): void => {
    if (!(id in bookmarks.value)) return
    const next = { ...bookmarks.value }
    delete next[id]
    bookmarks.value = next
    persist()
  }

  /** 有书签的 id 列表（供 filterBooks 的「仅看有书签」用） */
  const bookmarkedIds = (): string[] => Object.keys(bookmarks.value)

  /** 删除一本书的**全部**痕迹（静态书被从仓库移除时用，避免收藏项变孤儿） */
  const forgetBook = (id: string): void => {
    let changed = false
    if (favorites.value.includes(id)) {
      favorites.value = favorites.value.filter((x) => x !== id)
      changed = true
    }
    if (id in recent.value) {
      const r = { ...recent.value }
      delete r[id]
      recent.value = r
      changed = true
    }
    if (id in clicks.value) {
      const c = { ...clicks.value }
      delete c[id]
      clicks.value = c
      changed = true
    }
    if (id in bookmarks.value) {
      const b = { ...bookmarks.value }
      delete b[id]
      bookmarks.value = b
      changed = true
    }
    if (changed) persist()
  }

  /** 新增一条用户自建书签；书名必填，内容可空。返回结果供弹框反馈 */
  const addUserBookmark = (
    title: string,
    content: string
  ): { ok: boolean; message: string } => {
    const t = (title ?? '').trim()
    if (!t) return { ok: false, message: '书名不能为空' }
    const bm: UserBookmark = {
      id: `bm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      title: t.slice(0, 80),
      content: (content ?? '').slice(0, 2000),
      ts: Date.now()
    }
    const next = [bm, ...userBookmarks.value]
    userBookmarks.value =
      next.length > MAX_USER_BOOKMARKS ? next.slice(0, MAX_USER_BOOKMARKS) : next
    persist()
    return { ok: true, message: `已添加书签「${t}」` }
  }

  /** 删除一条用户自建书签（按 id） */
  const deleteUserBookmark = (id: string): void => {
    if (!userBookmarks.value.some((b) => b.id === id)) return
    userBookmarks.value = userBookmarks.value.filter((b) => b.id !== id)
    persist()
  }

  return {
    favorites,
    recent,
    clicks,
    bookmarks,
    userBookmarks,
    isFavorite,
    toggleFavorite,
    markOpened,
    recentIds,
    getBookmark,
    setBookmark,
    renameBookmark,
    clearBookmark,
    bookmarkedIds,
    forgetBook,
    addUserBookmark,
    deleteUserBookmark,
    initBooksPrefs,
    flushBooksPrefs,
    getSnapshot: current,
    applyBooksPrefs: apply
  }
}