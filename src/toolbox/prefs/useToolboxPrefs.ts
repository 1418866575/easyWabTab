/**
 * 工具箱偏好（收藏 / 最近使用）的响应式持久化封装
 *
 * - 单例：模块级 ref 持有状态（沿用项目 useToast / useHelpModal 的单例写法，不新建 Pinia store）
 * - 存储：localStorage，key = easy-web-tab:toolbox
 * - 容错：脏数据 / 隐私模式（写入抛错）一律降级为内存态，不影响页面使用
 */

import { ref } from 'vue'
import type { ToolboxPrefs, ToolboxRecentItem } from '../types'
import { recordRecent } from '../core/recent'

const LS_KEY = 'easy-web-tab:toolbox'

const DEFAULT_PREFS: ToolboxPrefs = { favorites: [], recent: [] }

function loadPrefs(): ToolboxPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const p = JSON.parse(raw) as Partial<ToolboxPrefs>
    return {
      favorites: Array.isArray(p.favorites) ? p.favorites.filter(x => typeof x === 'string') : [],
      recent: Array.isArray(p.recent)
        ? p.recent.filter((r): r is ToolboxRecentItem => !!r && typeof r.id === 'string' && typeof r.ts === 'number')
        : []
    }
  } catch {
    return { ...DEFAULT_PREFS } // 脏数据 / 不可读 → 回落默认值
  }
}

function savePrefs(p: ToolboxPrefs): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p))
  } catch {
    // 隐私模式等场景写入失败：保持内存态，不抛错
  }
}

// 模块级单例状态
const favorites = ref<string[]>(loadPrefs().favorites)
const recent = ref<ToolboxRecentItem[]>(loadPrefs().recent)

function persist(): void {
  savePrefs({ favorites: favorites.value, recent: recent.value })
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

  return { favorites, recent, isFavorite, toggleFavorite, pushRecent, clearRecent }
}
