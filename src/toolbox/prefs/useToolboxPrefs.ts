/**
 * 工具箱偏好（收藏 / 最近使用 / 点击次数 / 搜索历史）的响应式持久化封装
 *
 * -单例：模块级 ref 持有状态（沿用项目 useToast / useHelpModal 的单例写法，不新建 Pinia store）
 * - 存储：**IndexedDB**（`nav` object store，key = `toolbox-prefs`）→ 纳入云同步信封 toolbox.json 跨设备。
 *   原为 localStorage（key `easy-web-tab:toolbox`），首次加载时做**一次性迁移**，老用户数据不丢。
 * - 容错：脏数据 / 隐私模式（写入抛错）一律降级为内存态，不影响页面使用
 * - 落盘：**防抖**（300ms）—— 点击次数等高频操作不宜每次都写 IndexedDB
 */

import { ref } from 'vue'
import type { ToolboxPrefs, ToolboxRecentItem } from '../types'
import { idbGet, idbGetKey, idbPutKey, TOOLBOX_NAV_KEY } from '@/composables/useIdb'
import { recordRecent } from '../core/recent'
import { normalizeClicks, recordClick, clickCount as countOf, type ClickMap } from '../core/rank'
import { normalizeSearchHistory, pushSearchHistory, SEARCH_HISTORY_LIMIT } from '../core/searchHistory'

/** IndexedDB 中的键名（nav object store 内的一个 key） */
const IDB_KEY = TOOLBOX_NAV_KEY
/** 旧 localStorage 键（仅迁移时读取，迁移成功后保留以便回退，不主动删） */
const LS_KEY = 'easy-web-tab:toolbox'

function normalizePrefs(p: Partial<ToolboxPrefs> | undefined | null): {
  favorites: string[]
  recent: ToolboxRecentItem[]
  clicks: ClickMap
  searchHistory: string[]
} {
  return {
    favorites: Array.isArray(p?.favorites) ? p.favorites.filter(x => typeof x === 'string') : [],
    recent: Array.isArray(p?.recent)
      ? p.recent.filter((r): r is ToolboxRecentItem => !!r && typeof r.id === 'string' && typeof r.ts === 'number')
      : [],
    clicks: normalizeClicks(p?.clicks),
    // searchHistory 在类型里是可选字段（旧数据可缺省），这里补齐为确定数组
    searchHistory: normalizeSearchHistory(p?.searchHistory) ?? []
  }
}

/** 读旧 localStorage（迁移用；不可读返回 null） */
function loadLegacyPrefs(): ToolboxPrefs | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return normalizePrefs(JSON.parse(raw) as Partial<ToolboxPrefs>)
  } catch {
    return null // 脏数据 / 不可读 → 视为无旧数据
  }
}

// 模块级单例状态。首屏同步读取 localStorage（保证首渲染即有值，不等异步），
// 随后由 initFromIdb() 用 IndexedDB 内容覆盖（IndexedDB 才是权威数据源）。
const legacy = loadLegacyPrefs()
const favorites = ref<string[]>(legacy?.favorites ?? [])
const recent = ref<ToolboxRecentItem[]>(legacy?.recent ?? [])
const clicks = ref<ClickMap>(legacy?.clicks ?? {})
const searchHistory = ref<string[]>(legacy?.searchHistory ?? [])

/** 防抖落盘句柄 */
let saveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 只写工具箱自己那一条记录。
 *
 * v21 前这里是 `idbPut('nav', { ...current, [IDB_KEY]: payload })` —— 整包覆盖 nav，
 * 而 `current` 是**启动时**的 nav 快照。于是：
 *   用户打开工具箱 → 去导航站新增站点 → 回工具箱点一下（触发落盘）
 *   → 启动时的旧快照被整体写回，期间新增的站点全部消失。
 * 这正是「只有导航站数据会莫名回退」的一条真实路径 ——
 * 工作台各模块用独立 store，工具箱的写入根本碰不到它们，所以从不丢。
 *
 * v21 起 nav 按 key 多记录存储，各写各的，这类跨模块覆盖不再可能发生。
 */
function persistNow(): void {
  const payload: ToolboxPrefs = {
    favorites: favorites.value,
    recent: recent.value,
    clicks: clicks.value,
    searchHistory: searchHistory.value
  }
  idbPutKey('nav', IDB_KEY, JSON.stringify(payload)).catch((e) => {
    // 隐私模式 / 配额超限等：保持内存态，不抛错
    console.warn('[toolboxPrefs] IndexedDB 写入失败，已降级为内存态:', e)
  })
}

/**
 * 读取已持久化的偏好。
 * 兼容两种形态：v21 起的独立记录，与 v20 及更早「整包记录里的一个字段」。
 */
async function loadStored(): Promise<Partial<ToolboxPrefs> | undefined> {
  try {
    const raw = await idbGetKey<string>('nav', IDB_KEY)
    if (typeof raw === 'string') {
      return JSON.parse(raw) as Partial<ToolboxPrefs>
    }
  } catch {
    // 脏数据或读取失败 → 继续尝试旧形态
  }
  try {
    const rec = await idbGet<Record<string, string>>('nav')
    if (rec && typeof rec[IDB_KEY] === 'string') {
      return JSON.parse(rec[IDB_KEY]) as Partial<ToolboxPrefs>
    }
  } catch {
    // 同上
  }
  return undefined
}

/** 防抖持久化（300ms）：高频操作（点击计数）合并写入 */
function persist(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    persistNow()
  }, 300)
}

/** 立即落盘（供页面隐藏/卸载时调用，避免防抖窗口内丢改动） */
export function flushToolboxPrefs(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  persistNow()
}

/**
 * 初始化：从 IndexedDB 载入权威数据；首次（尚无该键）时把localStorage 旧数据迁移进来。
 * 由工具箱页面在 onMounted 时调用一次。
 */
export async function initToolboxPrefs(): Promise<void> {
  try {
    // nav store 的值均为 JSON 字符串，需 parse 后再归一化
    let stored: Partial<ToolboxPrefs> | undefined
    try {
      stored = await loadStored()
    } catch {
      stored = undefined // 脏数据 → 视为无数据，下方走迁移分支
    }
    if (stored) {
      // 已有 IndexedDB 数据 → 以它为准（跨设备同步的权威值）
      const n = normalizePrefs(stored)
      favorites.value = n.favorites
      recent.value = n.recent
      clicks.value = n.clicks
      searchHistory.value = n.searchHistory
    } else if (legacy) {
      // 首次迁移：localStorage 有旧数据 → 写入 IndexedDB 并立即生效
      persistNow()
    }
  } catch (e) {
    console.warn('[toolboxPrefs] IndexedDB 读取失败，沿用内存/旧数据:', e)
  }
}

/** 用合并后的数据整体覆盖本地（供云同步拉取后调用） */
export function applyToolboxPrefs(next: Partial<ToolboxPrefs>): void {
  const n = normalizePrefs(next)
  favorites.value = n.favorites
  recent.value = n.recent
  clicks.value = n.clicks
  searchHistory.value = n.searchHistory
  persistNow()
}

/** 导出当前四项（供云同步 exportLocal 用） */
export function getToolboxPrefsSnapshot(): ToolboxPrefs {
  return {
    favorites: favorites.value,
    recent: recent.value,
    clicks: clicks.value,
    searchHistory: searchHistory.value
  }
}

export function useToolboxPrefs() {
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

  /** 记录一次使用（去重 + 倒序 + 截断） */
  const pushRecent = (id: string): void => {
    recent.value = recordRecent(recent.value, id)
    persist()
  }

  /** 清空最近使用 */
  const clearRecent = (): void => {
    recent.value = []
    persist()
  }

  /** 取某工具的点击次数（未点击过为 0） */
  const clickCount = (id: string): number => countOf(clicks.value, id)

  /** 记录一次点击，返回点击后的次数 */
  const hitClick = (id: string): number => {
    clicks.value = recordClick(clicks.value, id)
    persist()
    return countOf(clicks.value, id)
  }

  /** 清空全部点击次数（列表回到默认 order 排序） */
  const clearClicks = (): void => {
    clicks.value = {}
    persist()
  }

  /** 记录一次搜索（非空关键字），FIFO 最多保留 5 条 */
  const pushSearch = (keyword: string): void => {
    const next = pushSearchHistory(searchHistory.value, keyword, SEARCH_HISTORY_LIMIT)
    // 无变化（空关键字）不触发写入
    if (next === searchHistory.value) return
    searchHistory.value = next
    persist()
  }

  /** 清空搜索历史 */
  const clearSearchHistory = (): void => {
    if (!searchHistory.value.length) return
    searchHistory.value = []
    persist()
  }

  return {
    favorites,
    recent,
    clicks,
    searchHistory,
    isFavorite,
    toggleFavorite,
    pushRecent,
    clearRecent,
    clickCount,
    hitClick,
    clearClicks,
    pushSearch,
    clearSearchHistory,
    // 云同步相关（页面 onMounted 时调initToolboxPrefs；云端拉取后调 applyToolboxPrefs）
    initToolboxPrefs,
    flushToolboxPrefs,
    getToolboxPrefsSnapshot
  }
}
