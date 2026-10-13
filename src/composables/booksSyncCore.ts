/**
 * 图书馆云同步信封（books.json）的合并策略（纯函数，零 vue / 零 IndexedDB 依赖，可单测）
 *
 * 与博客前台偏好（blogSyncCore）同构：偏好类数据走「并集 + 时间最新」，单设备改动
 * 不会清空另一设备数据。同步三项：收藏（favorites）+ 用户自建书签（userBookmarks）+ 最近阅读（recent）。
 *
 * 阅读位置书签（ratio）/ 打开次数 / 上传书为设备级数据，不在此信封内（见 useBooksPrefs）。
 * 其中「最近阅读」已按用户要求纳入同步：book id 在设备间一致（同源静态书 / 同名上传书），
 * 跨设备看到同一份最近阅读列表才有意义。
 */
export const BOOKS_USER_BOOKMARKS_LIMIT = 500

/** 用户自建书签（右上角「书签」按钮添加，书名 + 自定义内容） */
export interface UserBookmark {
  id: string
  title: string
  content: string
  ts: number
}

/**
 * 图书馆云同步信封（books.json）的数据结构。
 * 含跨设备有意义的三项：收藏（favorites）、用户自建书签（userBookmarks）、最近阅读（recent）。
 */
export interface BooksPrefsSyncData {
  version: number
  exportedAt: string
  favorites: string[]
  userBookmarks: UserBookmark[]
  /** 最近阅读：bookId → 最近打开时间戳（ms），跨设备同步「最近阅读」列表 */
  recent: Record<string, number>
}

/** 用户自建书签归一：书名必填（trim），缺书名视为脏数据返回 null；id/ts 缺失自动补 */
export function normalizeUserBookmark(v: unknown): UserBookmark | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const title = typeof o.title === 'string' ? o.title.trim() : ''
  if (!title) return null
  const id = typeof o.id === 'string' && o.id ? o.id : `bm_${Date.now().toString(36)}`
  const content = typeof o.content === 'string' ? o.content : ''
  const ts = typeof o.ts === 'number' && Number.isFinite(o.ts) ? o.ts : Date.now()
  return { id, title, content, ts }
}

function str(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const v of value) {
    if (typeof v === 'string' && v && !out.includes(v)) out.push(v)
  }
  return out
}

/**
 * 最近阅读合并：双端 key 取并集，同一 bookId 取较大（较新）时间戳。
 * 逐条校验：某端某条非有限数字时间戳忽略（不污染整条记录），仅健康项参与合并。
 */
function mergeRecent(lr: unknown, rr: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  const add = (rec: unknown) => {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return
    for (const [k, v] of Object.entries(rec)) {
      if (typeof v === 'number' && Number.isFinite(v) && (out[k] === undefined || v > out[k])) {
        out[k] = v
      }
    }
  }
  add(lr)
  add(rr)
  return out
}

/**
 * books.json 信封的云端 ↔ 本地合并：
 * - favorites：并集，本地顺序优先，再补远端独有，去重
 * - userBookmarks：按 id 合并，同 id 取 ts 较大者（较新内容胜），整体截断到上限
 */
export function mergeBooksPrefsEnvelope(
  local: BooksPrefsSyncData,
  remote: BooksPrefsSyncData
): BooksPrefsSyncData {
  const lFav = str(local?.favorites)
  const rFav = str(remote?.favorites)
  const favSeen = new Set<string>()
  const favorites: string[] = []
  for (const id of [...lFav, ...rFav]) {
    if (!favSeen.has(id)) {
      favSeen.add(id)
      favorites.push(id)
    }
  }

  const lMarks = Array.isArray(local?.userBookmarks)
    ? local.userBookmarks.map(normalizeUserBookmark).filter((x): x is UserBookmark => !!x)
    : []
  const rMarks = Array.isArray(remote?.userBookmarks)
    ? remote.userBookmarks.map(normalizeUserBookmark).filter((x): x is UserBookmark => !!x)
    : []
  // Map 保序：先 local 顺序，碰撞同 id 取较新 ts 覆盖在 local 原位；远端独有追加于后
  const markMap = new Map<string, UserBookmark>()
  for (const b of lMarks) markMap.set(b.id, b)
  for (const b of rMarks) {
    const prev = markMap.get(b.id)
    if (!prev || b.ts >= prev.ts) markMap.set(b.id, b)
  }
  const userBookmarks = Array.from(markMap.values()).slice(0, BOOKS_USER_BOOKMARKS_LIMIT)

  const recent = mergeRecent(local?.recent, remote?.recent)

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites,
    userBookmarks,
    recent
  }
}
