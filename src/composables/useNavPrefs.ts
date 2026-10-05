/**
 * 导航站偏好统一读写层（nav prefs）
 * 所有导航数据键（见 useIdb.ts NAV_STORE_KEYS）统一存于 IndexedDB 的 `nav` object store，
 * 取代原先分散的 localStorage 键。本模块是唯一的读写入口：各导航 store / 组件通过 getPref/setPref 访问，
 * 启动时 ensureLoaded() 一次性从 localStorage 迁移（如尚未迁移）并载入内存。
 *
 * 与 useIdb.ts 的关系：useIdb 负责 `nav` store 的底层读写与云同步信封（packPrefsFromIdb 等）；
 * 本模块负责内存缓存、防抖落盘、一次性迁移与 store 重载，是各导航模块的上层门面。
 */
import { idbGet, idbPut, idbClear, NAV_STORE_KEYS, WORKBENCH_PREFS_KEYS } from './useIdb'
import { useAppSettingsStore } from '@/stores/settings'
import type { NavPrefsRecord } from './useIdb'

let prefs: NavPrefsRecord = {}
let loadPromise: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

const SAVE_DEBOUNCE_MS = 400

// 一次性迁移：IDB 的 nav store 为空且 localStorage 仍有旧键时，整体搬入并删除旧键（与 icons v11 同范式）
async function migrateNavFromLocalStorageIfNeeded(): Promise<void> {
  const existing = await idbGet<NavPrefsRecord>('nav')
  if (existing && Object.keys(existing).length) return
  const record: NavPrefsRecord = {}
  for (const k of NAV_STORE_KEYS) {
    const v = localStorage.getItem(k)
    if (v !== null) record[k] = v
  }
  if (Object.keys(record).length === 0) return
  await idbPut('nav', record)
  for (const k of NAV_STORE_KEYS) {
    try { localStorage.removeItem(k) } catch { /* 忽略 */ }
  }
}

/** 启动加载：先迁移，再从 IDB 载入内存（幂等单例，全应用共享同一 loadPromise） */
export function ensureLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        await migrateNavFromLocalStorageIfNeeded()
        const data = await idbGet<NavPrefsRecord>('nav')
        prefs = data ?? {}
      } catch (e) {
        // IDB 不可用（隐私模式等）时回退空值，不阻断启动；导航数据暂以空态运行
        console.error('[nav-prefs] 加载失败，回退空值', e)
        prefs = {}
      }
    })()
  }
  return loadPromise
}

/** 同步读取某个导航键（确保 ensureLoaded 已完成；store 实例化前 main.ts 已 await） */
export function getPref(key: string): string | null {
  return key in prefs ? prefs[key] : null
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    idbPut('nav', prefs).catch((e) => console.error('[nav-prefs] 持久化失败', e))
  }, SAVE_DEBOUNCE_MS)
}

/** 更新内存并防抖落盘 */
export function setPref(key: string, value: string): void {
  prefs = { ...prefs, [key]: value }
  scheduleSave()
}

/** 立即更新内存并同步落盘（无防抖）：用于页面隐藏/卸载前 flush 与需立即持久的关键写入 */
export function setPrefNow(key: string, value: string): void {
  prefs = { ...prefs, [key]: value }
  idbPut('nav', prefs).catch((e) => console.error('[nav-prefs] 立即落盘失败', e))
}

/** 立即落盘（页面隐藏/卸载、恢复备份后刷新前调用），取消防抖定时器 */
export function flushNow(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  return idbPut('nav', prefs).catch((e) => {
    console.error('[nav-prefs] 立即落盘失败', e)
  })
}

/** 清空全部导航数据（工厂重置用）：清 nav store + 仍残留的 localStorage prefs 键 */
export async function clearAll(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  prefs = {}
  await idbClear('nav')
  // 清仍留在 localStorage 的 prefs 键（含 6 个非导航 prefs + 迁移前残留的导航键），维持出厂重置等同旧行为
  for (const k of WORKBENCH_PREFS_KEYS) {
    try { localStorage.removeItem(k) } catch { /* 忽略 */ }
  }
}

/** 云同步拉取后：用 IDB 最新值刷新内存，并重载各消费 store（与旧 reloadNavStores 等价） */
export async function refreshAfterImport(): Promise<void> {
  const data = await idbGet<NavPrefsRecord>('nav')
  prefs = data ?? {}
  // settings store 改为静态导入：它已被 20+ 处组件静态引入（如 AppSettingsDialog / AppWatermark /
  // WorkbenchManagePanel），动态 import 无法把它移出主 chunk，只会触发
  // INEFFECTIVE_DYNAMIC_IMPORT 警告并让 chunk 划分变得混乱。
  const [{ useSitesStore }, { useThemeStore }] = await Promise.all([
    import('@/stores/sites'),
    import('@/stores/theme')
  ])
  await Promise.all([
    useSitesStore().loadSites(),
    useThemeStore().initTheme(),
    useThemeStore().initBackground(),
    useAppSettingsStore().initSiteMeta()
  ])
}

/** 门面：返回共享方法（闭包模块级状态） */
export function useNavPrefs() {
  return { ensureLoaded, getPref, setPref, setPrefNow, flushNow, clearAll, refreshAfterImport }
}
