/**
 * 博客前台本机偏好（收藏 / 最近阅读）的响应式持久化封装
 *
 * - 单例：模块级 ref 持有状态（沿用 useToolboxPrefs 的单例写法，不新建 Pinia store）
 * - 存储：IndexedDB（`nav` object store，key = `BLOG_PREFS_NAV_KEY`）→ 纳入云同步信封
 *   `blog-prefs.json` 跨设备。与文章/后台数据（blog store / blog.json）完全解耦 —— 收藏与
 *   最近阅读是「阅读者本机浏览轨迹」，不应随博客后台改动被整体覆盖。
 * - 容错：写入抛错（隐私模式 / 配额超限）一律降级为内存态，不影响页面使用。
 * - 落盘：防抖 300ms —— 高频点击收藏/阅读不应每次都写 IndexedDB。
 */

import { ref } from 'vue'
import type { BlogFrontPrefs, BlogFrontSyncData, BlogRecentItem } from '../types'
import { BLOG_RECENT_LIMIT } from '../types'
import { idbGetKey, idbPutKey, BLOG_PREFS_NAV_KEY } from './useIdb'
import { normalizeBlogFrontPrefs } from './blogSyncCore'

/** 模块级单例状态（首屏即空，由 initBlogFrontPrefs() 从 IndexedDB 载入权威数据） */
const favorites = ref<string[]>([])
const recent = ref<BlogRecentItem[]>([])

/** 防抖落盘句柄 */
let saveTimer: ReturnType<typeof setTimeout> | null = null
/** 是否已从 IndexedDB 载入过（仅首次挂载时读取，避免后续挂载用旧 IDB 快照覆盖内存中的新改动） */
let didInit = false

/**
 * 只写博客前台偏好自己那一条记录（nav store 内独立 key，不碰其它模块的数据）。
 */
function persistNow(): void {
  const payload: BlogFrontPrefs = {
    favorites: favorites.value,
    recent: recent.value
  }
  idbPutKey('nav', BLOG_PREFS_NAV_KEY, JSON.stringify(payload)).catch((e) => {
    // 隐私模式 / 配额超限等：保持内存态，不抛错
    console.warn('[blogFrontPrefs] IndexedDB 写入失败，已降级为内存态:', e)
  })
}

/** 防抖持久化（300ms）：高频操作（点收藏 / 阅读）合并写入 */
function persist(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    persistNow()
  }, 300)
}

/** 立即落盘（供页面隐藏/卸载时调用，避免防抖窗口内丢改动） */
export function flushBlogFrontPrefs(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  persistNow()
}

/**
 * 初始化：从 IndexedDB 载入权威数据。博客前台页面在 onMounted 时调用一次。
 */
export async function initBlogFrontPrefs(): Promise<void> {
  if (didInit) return
  didInit = true
  try {
    const raw = await idbGetKey<string>('nav', BLOG_PREFS_NAV_KEY)
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw) as Partial<BlogFrontSyncData>
      const n = normalizeBlogFrontPrefs(parsed.prefs)
      favorites.value = n.favorites
      recent.value = n.recent
    }
  } catch (e) {
    console.warn('[blogFrontPrefs] IndexedDB 读取失败，沿用内存态:', e)
  }
}

/** 用合并后的数据整体覆盖本地（供云同步拉取后调用） */
export function applyBlogFrontPrefs(next: Partial<BlogFrontPrefs>): void {
  const n = normalizeBlogFrontPrefs(next)
  favorites.value = n.favorites
  recent.value = n.recent
  persistNow()
}

/** 导出当前数据（供云同步 exportLocal 用） */
export function getBlogFrontPrefsSnapshot(): BlogFrontPrefs {
  return {
    favorites: favorites.value,
    recent: recent.value
  }
}

export function useBlogFrontPrefs() {
  /** 是否已收藏 */
  const isFavorite = (id: string): boolean => favorites.value.includes(id)

  /** 切换收藏，返回切换后的状态（true = 已收藏） */
  const toggleFavorite = (id: string): boolean => {
    const i = favorites.value.indexOf(id)
    if (i >= 0) favorites.value.splice(i, 1)
    else favorites.value.push(id)
    persist()
    return favorites.value.includes(id)
  }

  /** 记录一次阅读（去重 + 倒序 + 截断到 BLOG_RECENT_LIMIT） */
  const pushRecent = (id: string): void => {
    const now = Date.now()
    const list = recent.value.filter((r) => r.id !== id)
    list.unshift({ id, ts: now })
    recent.value = list.slice(0, BLOG_RECENT_LIMIT)
    persist()
  }

  /** 清空最近阅读 */
  const clearRecent = (): void => {
    recent.value = []
    persist()
  }

  return {
    favorites,
    recent,
    isFavorite,
    toggleFavorite,
    pushRecent,
    clearRecent,
    // 云同步相关（页面 onMounted 时调 initBlogFrontPrefs；云端拉取后调 applyBlogFrontPrefs）
    initBlogFrontPrefs,
    flushBlogFrontPrefs,
    getBlogFrontPrefsSnapshot,
    applyBlogFrontPrefs
  }
}
