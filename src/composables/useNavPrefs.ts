/**
 * 导航站偏好统一读写层（nav prefs）
 * 所有导航数据键（见 useIdb.ts NAV_STORE_KEYS）统一存于 IndexedDB 的 `nav` object store，
 * 取代原先分散的 localStorage 键。本模块是唯一的读写入口：各导航 store / 组件通过 getPref/setPref 访问，
 * 启动时 ensureLoaded() 一次性从 localStorage 迁移（如尚未迁移）并载入内存。
 *
 * 与 useIdb.ts 的关系：useIdb 负责 `nav` store 的底层读写与云同步信封（packPrefsFromIdb 等）；
 * 本模块负责内存缓存、防抖落盘、一次性迁移与 store 重载，是各导航模块的上层门面。
 *
 * ## 数据保护（2026-10-07 事故后加固）
 * 事故：移动端导航数据在存储层被清空 → 空态被当成正常数据写回 → 推送上云 → 其它设备连锁清空。
 * 本层作为最近的写入口，承担两条硬规则：
 *   1. **区分「没有数据」与「读不到数据」**：ensureLoaded 里 IDB 读取抛错时进入 `failed` 状态并置**只读**，
 *      本会话不再回写任何导航键（宁可丢本次会话的改动，也不能把残缺状态覆盖真实数据）。
 *   2. **IDB 为空但影子副本（localStorage，见 navShadow.ts）非空 → 判定存储丢失，用影子回填**
 *      并尽力把数据写回 IDB，让应用在用户无感的情况下自愈。
 * 每次正式落盘都会顺带刷新影子，保证两种介质的最新版本同步。
 */
import { idbGet, idbPut, idbClear, NAV_STORE_KEYS, WORKBENCH_PREFS_KEYS } from './useIdb'
import { useAppSettingsStore } from '@/stores/settings'
import type { NavPrefsRecord } from './useIdb'
import { readShadow, writeShadow, clearShadow, shadowStamp } from './navShadow'
import { clearBaseline } from './navDataGuard'

let prefs: NavPrefsRecord = {}
let loadPromise: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 加载结果：
 * - 'ok'：从 IDB 正常读入（哪怕内容是空的——新装机器本来就该是空）
 * - 'shadow'：IDB 读失败或空，已用 localStorage 影子副本回填（可正常读写）
 * - 'failed'：读也没读到、影子也没有 → **只读模式**，拒绝一切回写
 */
export type NavLoadState = 'pending' | 'ok' | 'shadow' | 'failed'
let loadState: NavLoadState = 'pending'

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

/** 当前是否处于只读模式（IDB 读失败且无影子可用）→ 所有写入会被拒绝 */
export function isNavReadonly(): boolean {
  return loadState === 'failed'
}

/** 当前加载状态，供上层展示/排障 */
export function navLoadState(): NavLoadState {
  return loadState
}

/**
 * 启动加载：先迁移，再从 IDB 载入内存（幂等单例，全应用共享同一 loadPromise）。
 *
 * 三种结果语义：
 * - 读到数据 → 'ok'
 * - 读到了「空」或读取抛错，但 localStorage 影子有数据 → 用影子回填并标记 'shadow'（允许继续读写）
 * - 读失败且无影子 → 'failed'（只读）
 */
export function ensureLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      let fromIdb: NavPrefsRecord | undefined
      let idbError: unknown = null
      try {
        await migrateNavFromLocalStorageIfNeeded()
        fromIdb = await idbGet<NavPrefsRecord>('nav')
      } catch (e) {
        idbError = e
      }
      const idbEmpty = !fromIdb || Object.keys(fromIdb).length === 0
      // IDB 读失败，或读出来是空的（两种都可能意味着存储被回收）→ 尝试影子恢复
      if (idbError || idbEmpty) {
        const shadow = readShadow()
        if (Object.keys(shadow).length > 0) {
          prefs = { ...shadow }
          loadState = 'shadow'
          // 尽力回填 IDB：成功了就回到健康状态，失败也无妨（内存里已可用，刷新影子也不会丢）
          try {
            await idbPut('nav', prefs)
          } catch (e) {
            console.error('[nav-prefs] 影子回填 IDB 失败，本次会话仅在内存中运行', e)
          }
          console.warn(
            '[nav-prefs] IndexedDB 导航数据不可用，已用 localStorage 影子副本恢复',
            Object.keys(shadow).length,
            '个键；IDB 原因：',
            idbError ?? '记录为空',
            '影子时间：',
            new Date(shadowStamp()).toISOString()
          )
          return
        }
      }
      if (idbError) {
        // 读都读不到，又没有影子 → 只读，绝不能把「看起来是空」写回去
        loadState = 'failed'
        prefs = {}
        console.error(
          '[nav-prefs] 导航数据加载失败：IDB 不可用且无影子副本 → 进入只读模式，本会话不再回写导航数据。' +
          '请勿直接清除站点，请改用「设置 → 云同步 → 拉取」或从备份恢复。',
          idbError
        )
        return
      }
      loadState = 'ok'
      prefs = fromIdb ?? {}
    })()
  }
  return loadPromise
}

/** 同步读取某个导航键（确保 ensureLoaded 已完成；store 实例化前 main.ts 已 await） */
export function getPref(key: string): string | null {
  return key in prefs ? prefs[key] : null
}

/** 只读模式下拒绝写入：返回 false 并记录原因（不要在正常路径里静默丢数据） */
function allowWrite(op: string): boolean {
  if (loadState === 'failed') {
    console.error(
      `[nav-prefs] 只读模式：已拒绝 ${op} —— 导航数据加载失败，此时写入会把「空」当成真实数据存下来。` +
      '请恢复数据（云同步拉取 / 导入备份）后重试。'
    )
    return false
  }
  return true
}

/**
 * 真正落盘：写 IDB 成功后刷新 localStorage 影子。
 * 注意顺序必须是「先主存后影子」：影子写失败不能影响 IDB 的成功语义，反之亦然。
 */
function writeThrough(snapshot: NavPrefsRecord): Promise<void> {
  return idbPut('nav', snapshot).then(
    () => {
      try {
        writeShadow(snapshot)
      } catch {
        // 影子纯冗余，失败无需告警打扰用户
      }
    },
    (e) => {
      console.error('[nav-prefs] 持久化失败', e)
    }
  )
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void writeThrough({ ...prefs })
  }, SAVE_DEBOUNCE_MS)
}

/** 更新内存并防抖落盘 */
export function setPref(key: string, value: string): void {
  if (!allowWrite(`setPref(${key})`)) return
  prefs = { ...prefs, [key]: value }
  scheduleSave()
}

/** 立即更新内存并同步落盘（无防抖）：用于页面隐藏/卸载前 flush 与需立即持久的关键写入 */
export function setPrefNow(key: string, value: string): void {
  if (!allowWrite(`setPrefNow(${key})`)) return
  prefs = { ...prefs, [key]: value }
  void writeThrough({ ...prefs })
}

/** 立即落盘（页面隐藏/卸载、恢复备份后刷新前调用），取消防抖定时器 */
export function flushNow(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!allowWrite('flushNow')) return Promise.resolve()
  return writeThrough({ ...prefs })
}

/**
 * 清空全部导航数据（工厂重置用）：清 nav store + 影子 + 仍残留的 localStorage prefs 键。
 * 这是**显式用户操作**，因此即便处于只读模式也允许执行；同时清掉影子，
 * 否则下次启动影子会把刚清掉的数据再喂回来。
 */
export async function clearAll(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (loadState === 'failed') {
    console.warn('[nav-prefs] 处于只读模式仍执行清空：存储不可用，影子与内存均已清空')
  }
  prefs = {}
  clearShadow()
  // 「清空」本身会让站点数归零：必须同时清掉降级防护的基线，
  // 否则接下来任何一次写盘都会被判定成「数据骤降」而拦下，用户会看到不该有的告警。
  clearBaseline()
  loadState = 'ok'
  await idbClear('nav')
  // 清仍留在 localStorage 的 prefs 键（含 6 个非导航 prefs + 迁移前残留的导航键），维持出厂重置等同旧行为
  for (const k of WORKBENCH_PREFS_KEYS) {
    try { localStorage.removeItem(k) } catch { /* 忽略 */ }
  }
}

/** 云同步拉取后：用 IDB 最新值刷新内存，并重载各消费 store（与旧 reloadNavStores 等价） */
export async function refreshAfterImport(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  try {
    const data = await idbGet<NavPrefsRecord>('nav')
    prefs = data ?? {}
    loadState = 'ok' // 能读到 → 解除只读（这是数据恢复的主要通道）
  } catch (e) {
    console.error('[nav-prefs] 重载失败', e)
    return
  }
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
  return { ensureLoaded, getPref, setPref, setPrefNow, flushNow, clearAll, refreshAfterImport, isNavReadonly, navLoadState }
}
