import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { markDirty } from '@/composables/useCloudSync'

export interface SearchEngine {
  id: string
  name: string
  url: string
  isDefault: boolean
  sort: number
  isBuiltIn?: boolean
  /** 是否被禁用（仅自定义引擎持久化在自身对象上；内置引擎记录在 user-disabled-engine-ids） */
  disabled?: boolean
}

const STORAGE_KEY = 'user-search-engines'
const BUILT_IN_OVERRIDES_KEY = 'built-in-engine-overrides'
const BUILT_IN_OVERRIDES_STORAGE_KEY = 'built-in-engine-default'
const DELETED_ENGINE_IDS_KEY = 'user-deleted-engine-ids'
const DISABLED_ENGINE_IDS_KEY = 'user-disabled-engine-ids'

// 加载用户已删除的默认引擎 ID 集合
function loadDeletedEngineIds(): Set<string> {
  const raw = localStorage.getItem(DELETED_ENGINE_IDS_KEY)
  return raw ? new Set(JSON.parse(raw)) : new Set()
}

function saveDeletedEngineIds(ids: Set<string>) {
  localStorage.setItem(DELETED_ENGINE_IDS_KEY, JSON.stringify([...ids]))
}

// 加载用户已禁用的引擎 ID（内置引擎用；自定义引擎的 disabled 标记在自身对象上）
function loadDisabledEngineIds(): string[] {
  const raw = localStorage.getItem(DISABLED_ENGINE_IDS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function saveDisabledEngineIds(ids: string[]) {
  localStorage.setItem(DISABLED_ENGINE_IDS_KEY, JSON.stringify(ids))
}

// 默认内置搜索引擎 (不可删除)
const BUILT_IN_ENGINES: SearchEngine[] = [
  { id: 'local', name: '本地搜索', url: '', isDefault: false, sort: 0, isBuiltIn: true },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=', isDefault: true, sort: 1, isBuiltIn: true },
  { id: 'bing', name: '必应', url: 'https://www.bing.com/search?q=', isDefault: false, sort: 2, isBuiltIn: true },
]

// 默认自定义搜索引擎
const DEFAULT_ENGINES: SearchEngine[] = [
  { id: 'quark', name: '夸克', url: 'https://quark.cn/s?query=', isDefault: false, sort: 6 },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=', isDefault: false, sort: 9 },
]

export const useSearchEnginesStore = defineStore('searchEngines', () => {
  // 从 localStorage 加载自定义引擎
  const customEngines = ref<SearchEngine[]>(
    JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || []
  )

  // 已删除的默认引擎 ID（防止迁移重新添加）
  const deletedEngineIds = loadDeletedEngineIds()

  // 迁移：对于已有用户，检测哪些 DEFAULT_ENGINES 不在 customEngines 中
  // 这些是之前版本中被删除但未记录的引擎（仅首次执行一次）
  if (deletedEngineIds.size === 0 && customEngines.value.length > 0) {
    const existingIds = new Set(customEngines.value.map(e => e.id))
    const trulyDeleted = DEFAULT_ENGINES.filter(e => !existingIds.has(e.id))
    if (trulyDeleted.length > 0) {
      for (const engine of trulyDeleted) {
        deletedEngineIds.add(engine.id)
      }
      saveDeletedEngineIds(deletedEngineIds)
    }
  }

  // 活跃的默认引擎（排除已删除的）
  const activeDefaultEngines = DEFAULT_ENGINES.filter(e => !deletedEngineIds.has(e.id))

  // 首次加载：将活跃默认引擎迁移到 customEngines（使其可删除/修改）
  if (customEngines.value.length === 0) {
    customEngines.value = [...activeDefaultEngines]
  } else {
    // 已有用户：合并缺失的活跃默认引擎
    const existingIds = new Set(customEngines.value.map(e => e.id))
    const missing = activeDefaultEngines.filter(e => !existingIds.has(e.id))
    if (missing.length > 0) {
      customEngines.value.push(...missing)
    }
  }
  saveEngines()

  // 从 localStorage 加载内置引擎 URL 覆盖
  const builtInOverrides = ref<Record<string, string>>(
    JSON.parse(localStorage.getItem(BUILT_IN_OVERRIDES_KEY) || '{}')
  )

  // 内置引擎默认设置
  const builtInDefault = ref<string>(
    localStorage.getItem(BUILT_IN_OVERRIDES_STORAGE_KEY) || 'baidu'
  )

  // 已禁用的引擎 ID（内置引擎专用；需要响应式，故用数组而非 Set）
  const disabledEngineIds = ref<string[]>(loadDisabledEngineIds())

  /** 是否为内置引擎 ID */
  function isBuiltInId(id: string): boolean {
    return BUILT_IN_ENGINES.some(e => e.id === id)
  }

  /** 引擎是否被禁用 */
  function isEngineDisabled(id: string): boolean {
    if (isBuiltInId(id)) return disabledEngineIds.value.includes(id)
    return customEngines.value.find(e => e.id === id)?.disabled === true
  }

  /**
   * 当前默认引擎 ID（全局唯一）。
   * 自定义引擎的默认标记优先，其次才是内置引擎的默认配置 —— 二者互斥，
   * 因此设置自定义引擎为默认时，内置引擎的「默认」标识会自动消失。
   */
  const defaultEngineId = computed(() => {
    const customDefault = customEngines.value.find(e => e.isDefault)
    if (customDefault) return customDefault.id
    return builtInDefault.value
  })

  // 获取带覆盖的完整内置引擎列表
  const builtInEngines = computed(() => {
    return BUILT_IN_ENGINES.map(engine => {
      const disabled = disabledEngineIds.value.includes(engine.id)
      // local 引擎不需要 URL 覆盖功能
      if (engine.id === 'local') {
        return { ...engine, isDefault: engine.id === defaultEngineId.value, disabled }
      }
      return {
        ...engine,
        url: builtInOverrides.value[engine.id] || engine.url,
        isDefault: engine.id === defaultEngineId.value,
        disabled
      }
    })
  })

  // 合并视图：内置 + 自定义，按 sort 排序
  const allEngines = computed(() => {
    const builtIn = builtInEngines.value
    return [...builtIn, ...customEngines.value].sort((a, b) => a.sort - b.sort)
  })

  // 可用引擎（排除已禁用）；若全部被禁用则回退为全部引擎，避免搜索框无引擎可选
  const availableEngines = computed(() => {
    const enabled = allEngines.value.filter(e => !isEngineDisabled(e.id))
    return enabled.length > 0 ? enabled : allEngines.value
  })

  /**
   * 引擎下拉顺序：默认引擎永远排在第一位，其余保持 sort 顺序。
   * 默认引擎被禁用/不存在时保持原顺序不变。
   */
  const sortedAvailableEngines = computed(() => {
    const list = availableEngines.value
    const index = list.findIndex(e => e.id === defaultEngineId.value)
    if (index <= 0) return list
    return [list[index], ...list.slice(0, index), ...list.slice(index + 1)]
  })

  // 默认搜索引擎
  const defaultEngine = computed(() => {
    const list = availableEngines.value
    const explicit = list.find(e => e.id === defaultEngineId.value)
    if (explicit) return explicit
    return list.find(e => e.id !== 'local') || list[0]
  })

  // 持久化自定义引擎
  function saveEngines() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customEngines.value))
    markDirty()
  }

  // 持久化内置引擎覆盖
  function saveBuiltInOverrides() {
    localStorage.setItem(BUILT_IN_OVERRIDES_KEY, JSON.stringify(builtInOverrides.value))
    markDirty()
  }

  // 添加引擎
  function addEngine(name: string, url: string) {
    const maxSort = customEngines.value.reduce((max, e) => Math.max(max, e.sort), 13)
    const id = `engine_${Date.now()}`
    customEngines.value.push({
      id,
      name,
      url,
      isDefault: false,
      sort: maxSort + 1
    })
    saveEngines()
    return id
  }

  // 更新自定义引擎
  function updateEngine(id: string, updates: { name?: string; url?: string }) {
    const index = customEngines.value.findIndex(e => e.id === id)
    if (index !== -1) {
      customEngines.value[index] = { ...customEngines.value[index], ...updates }
      saveEngines()
    }
  }

  // 更新内置引擎 URL（local 引擎不可修改）
  function updateBuiltInEngineUrl(id: string, url: string) {
    // local 引擎不可修改
    if (id === 'local') return
    if (BUILT_IN_ENGINES.some(e => e.id === id)) {
      builtInOverrides.value[id] = url
      saveBuiltInOverrides()
    }
  }

  // 删除引擎（内置引擎不可删除）
  // 删除的是当前默认引擎时，自动把默认状态转移到下一个可用引擎
  function deleteEngine(id: string): { ok: boolean; wasDefault: boolean; transferredTo: string | null } {
    const engine = allEngines.value.find(e => e.id === id)
    if (!engine || engine?.isBuiltIn) {
      console.warn('Cannot delete built-in engine')
      return { ok: false, wasDefault: false, transferredTo: null }
    }
    const wasDefault = defaultEngineId.value === id
    customEngines.value = customEngines.value.filter(e => e.id !== id)
    saveEngines()

    // 追踪已删除的默认引擎，防止刷新后重新添加
    const isDefault = DEFAULT_ENGINES.some(e => e.id === id)
    if (isDefault && !deletedEngineIds.has(id)) {
      deletedEngineIds.add(id)
      saveDeletedEngineIds(deletedEngineIds)
    }

    // 默认引擎被删除：转移默认状态
    let transferredTo: string | null = null
    if (wasDefault) {
      const fallbackId = pickFallbackDefaultId()
      if (fallbackId && setDefault(fallbackId)) {
        transferredTo = allEngines.value.find(e => e.id === fallbackId)?.name ?? null
      }
    }
    return { ok: true, wasDefault, transferredTo }
  }

  /** 兜底默认引擎：优先内置「百度」，其次排序靠前的非本地可用引擎 */
  function pickFallbackDefaultId(): string | null {
    const candidates = allEngines.value.filter(e => !isEngineDisabled(e.id))
    if (candidates.length === 0) return null
    if (candidates.some(e => e.id === 'baidu')) return 'baidu'
    return candidates.find(e => e.id !== 'local')?.id ?? candidates[0].id
  }

  /**
   * 预览转移目标：删除/禁用 id 对应引擎后，默认引擎会变成哪个（用于确认弹框文案）。
   * 该引擎不是当前默认引擎时返回 null。
   */
  function getFallbackDefaultName(id: string): string | null {
    if (defaultEngineId.value !== id) return null
    const candidates = allEngines.value.filter(e => e.id !== id && !isEngineDisabled(e.id))
    if (candidates.length === 0) return null
    const target =
      candidates.find(e => e.id === 'baidu') ??
      candidates.find(e => e.id !== 'local') ??
      candidates[0]
    return target.name
  }

  /**
   * 设置默认引擎（全局唯一：设置新的会自动取消旧的默认状态）。
   * 持久化失败时回滚到设置前的状态。
   * @returns 是否设置成功
   */
  function setDefault(id: string): boolean {
    // 引擎不存在：保持原有状态不变
    if (!allEngines.value.some(e => e.id === id)) return false

    const prevBuiltInDefault = builtInDefault.value
    const prevCustomFlags = customEngines.value.map(e => e.isDefault)

    try {
      if (isBuiltInId(id)) {
        // 设为内置引擎：清除所有自定义引擎的默认标记
        customEngines.value.forEach(e => {
          e.isDefault = false
        })
        builtInDefault.value = id
        localStorage.setItem(BUILT_IN_OVERRIDES_STORAGE_KEY, id)
        saveEngines()
      } else {
        // 设为自定义引擎：取消内置引擎的默认状态
        customEngines.value.forEach(e => {
          e.isDefault = e.id === id
        })
        builtInDefault.value = ''
        localStorage.setItem(BUILT_IN_OVERRIDES_STORAGE_KEY, '')
        saveEngines()
      }
      markDirty()
      return true
    } catch (err) {
      console.error('Failed to set default engine', err)
      // 回滚：恢复设置前的默认状态
      builtInDefault.value = prevBuiltInDefault
      localStorage.setItem(BUILT_IN_OVERRIDES_STORAGE_KEY, prevBuiltInDefault)
      customEngines.value.forEach((e, index) => {
        e.isDefault = prevCustomFlags[index] ?? false
      })
      return false
    }
  }

  /**
   * 启用 / 禁用引擎。禁用当前默认引擎时自动转移默认状态。
   * @returns ok 是否成功；transferredTo 转移后的默认引擎名称（未发生转移为 null）
   */
  function setEngineEnabled(id: string, enabled: boolean): { ok: boolean; transferredTo: string | null } {
    if (!allEngines.value.some(e => e.id === id)) return { ok: false, transferredTo: null }
    // 状态一致：无需变更
    if (isEngineDisabled(id) === !enabled) return { ok: true, transferredTo: null }

    try {
      if (isBuiltInId(id)) {
        const rest = disabledEngineIds.value.filter(x => x !== id)
        disabledEngineIds.value = enabled ? rest : [...rest, id]
        saveDisabledEngineIds(disabledEngineIds.value)
        markDirty()
      } else {
        const target = customEngines.value.find(e => e.id === id)
        if (!target) return { ok: false, transferredTo: null }
        target.disabled = !enabled
        saveEngines()
      }
    } catch (err) {
      console.error('Failed to toggle engine enabled state', err)
      return { ok: false, transferredTo: null }
    }

    // 禁用的是当前默认引擎：转移默认状态
    let transferredTo: string | null = null
    if (!enabled && defaultEngineId.value === id) {
      const fallbackId = pickFallbackDefaultId()
      if (fallbackId && fallbackId !== id && setDefault(fallbackId)) {
        transferredTo = allEngines.value.find(e => e.id === fallbackId)?.name ?? null
      }
    }
    return { ok: true, transferredTo }
  }

  // 移动排序
  function moveEngine(id: string, direction: 'up' | 'down') {
    const sorted = [...customEngines.value].sort((a, b) => a.sort - b.sort)
    const index = sorted.findIndex(e => e.id === id)
    
    if (direction === 'up' && index > 0) {
      const prev = sorted[index - 1]
      const prevEngine = customEngines.value.find(e => e.id === prev.id)
      const currEngine = customEngines.value.find(e => e.id === id)
      if (prevEngine && currEngine) {
        const temp = prevEngine.sort
        prevEngine.sort = currEngine.sort
        currEngine.sort = temp
      }
    } else if (direction === 'down' && index < sorted.length - 1) {
      const next = sorted[index + 1]
      const nextEngine = customEngines.value.find(e => e.id === next.id)
      const currEngine = customEngines.value.find(e => e.id === id)
      if (nextEngine && currEngine) {
        const temp = nextEngine.sort
        nextEngine.sort = currEngine.sort
        currEngine.sort = temp
      }
    }
    saveEngines()
  }

  // 能否移动
  function canMove(id: string, direction: 'up' | 'down'): boolean {
    const sorted = [...customEngines.value].sort((a, b) => a.sort - b.sort)
    const index = sorted.findIndex(e => e.id === id)
    if (direction === 'up') return index > 0
    if (direction === 'down') return index < sorted.length - 1
    return false
  }

  // 重置为默认
  function resetToDefault() {
    customEngines.value = [...DEFAULT_ENGINES]
    deletedEngineIds.clear()
    saveDeletedEngineIds(deletedEngineIds)
    // 同时恢复默认引擎配置与启用状态
    builtInDefault.value = 'baidu'
    localStorage.setItem(BUILT_IN_OVERRIDES_STORAGE_KEY, 'baidu')
    disabledEngineIds.value = []
    saveDisabledEngineIds(disabledEngineIds.value)
    saveEngines()
  }

  // 导入引擎
  function importEngines(engines: SearchEngine[]) {
    customEngines.value = [...engines]
    // 移除被导入引擎的删除标记（用户显式导入说明希望保留它们）
    let changed = false
    for (const engine of engines) {
      if (deletedEngineIds.has(engine.id)) {
        deletedEngineIds.delete(engine.id)
        changed = true
      }
    }
    if (changed) saveDeletedEngineIds(deletedEngineIds)
    saveEngines()
  }

  // 导出引擎 (仅自定义引擎, 内置引擎不导出)
  function exportEngines(): SearchEngine[] {
    return customEngines.value.length > 0 ? [...customEngines.value] : [...DEFAULT_ENGINES]
  }

  return {
    customEngines,
    builtInOverrides,
    allEngines,
    availableEngines,
    sortedAvailableEngines,
    builtInEngines,
    defaultEngine,
    defaultEngineId,
    deletedEngineIds,
    addEngine,
    updateEngine,
    updateBuiltInEngineUrl,
    deleteEngine,
    setDefault,
    isEngineDisabled,
    setEngineEnabled,
    getFallbackDefaultName,
    moveEngine,
    canMove,
    resetToDefault,
    importEngines,
    exportEngines
  }
})
