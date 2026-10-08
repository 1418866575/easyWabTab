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
import {
  idbGet,
  idbPut,
  idbClear,
  idbGetAllEntries,
  idbPutKey,
  idbDeleteKey,
  NAV_STORE_KEYS,
  WORKBENCH_PREFS_KEYS,
  IDB_KEY,
  TOOLBOX_NAV_KEY
} from './useIdb'
import { useAppSettingsStore } from '@/stores/settings'
import type { NavPrefsRecord } from './useIdb'
import { readShadow, writeShadow, clearShadow, shadowStamp } from './navShadow'
import {
  isNavExplicitMutationActive,
  isNavWipeOverrideActive,
  parseUserSitesCount,
  shouldGuardDrop,
  isSuspectedWipe,
  UNKNOWN_COUNT
} from './navDataGuard'
import {
  loadNavMeta,
  readBaseline,
  readHighWater,
  noteHighWater,
  resetNavMeta,
  persistNavMeta
} from './navMeta'

/** v19 及更早把守卫基线存在 localStorage 的这个键上；v20 起迁入 IDB，仅用于一次性迁移后删除 */
const LEGACY_BASELINE_KEY = 'ewt.navGuard.userSitesBaseline'

let prefs: NavPrefsRecord = {}
let loadPromise: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
/**
 * 待落盘的键集合（v21）。
 * 旧实现每次落盘都整包 `{...prefs}` 覆盖写回，一个键变动要重序列化全部 15 个键
 * （含 MB 级数据）。改为只记录真正变动的键，落盘时逐键写入。
 */
let dirtyKeys = new Set<string>()

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
  const existing = await idbGetAllEntries<string>('nav')
  if (Object.keys(existing).length) return
  const record: NavPrefsRecord = {}
  for (const k of NAV_STORE_KEYS) {
    const v = localStorage.getItem(k)
    if (v !== null) record[k] = v
  }
  if (Object.keys(record).length === 0) return
  await writeKeys(record)
  for (const k of NAV_STORE_KEYS) {
    try { localStorage.removeItem(k) } catch { /* 忽略 */ }
  }
}

/**
 * v21 迁移：nav 从「一条 `items` 记录装 15 个键」拆成「每个键一条记录」。
 *
 * 动机：整包覆盖写意味着改一个键也要把全量重新序列化一遍，
 * 且内存里一份残缺的 prefs 会把整条记录冲掉 —— 这正是事故链的一环。
 * 拆分后每次只写变动的那一个键，互不影响。
 *
 * 幂等且**失败安全**：只有全部键都写成功后才删除旧记录；
 * 中途任何一步失败都会保留旧记录，下次启动重新迁移，绝不丢数据。
 */
async function migrateNavToPerKeyRecords(): Promise<void> {
  // 旧格式特征：存在键为 IDB_KEY('items') 的记录，且值是一个对象
  const legacy = await idbGet<unknown>('nav')
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return
  const bag = legacy as Record<string, unknown>
  if (Object.keys(bag).length === 0) return

  for (const [k, v] of Object.entries(bag)) {
    if (typeof v !== 'string') continue
    // 工具箱偏好曾借用记录内的 'items' 字段（见 useIdb.TOOLBOX_NAV_KEY）。
    // 拆分时归位到专属键，否则它会变成一条名叫 'items' 的记录，
    // 与「store 的键也叫 items」这套旧约定继续混淆下去。
    const targetKey = k === IDB_KEY ? TOOLBOX_NAV_KEY : k
    try {
      await idbPutKey('nav', targetKey, v)
    } catch (e) {
      console.error('[nav-prefs] 拆分 nav 记录失败，保留旧整包记录下次重试', k, e)
      return
    }
  }
  await idbDeleteKey('nav', IDB_KEY)
  console.warn('[nav-prefs] nav 已拆分为按 key 的多记录（v21）')
}

/** 逐键写入（内部共用；不做守卫判定，守卫统一在上层入口做） */
async function writeKeys(record: NavPrefsRecord): Promise<void> {
  for (const [k, v] of Object.entries(record)) {
    await idbPutKey('nav', k, v)
  }
}

/**
 * 一次性迁移：把仍留在 localStorage 的旧基线（v19 及更早）转成 IDB 里的高水位并删除旧键。
 *
 * 必须在 `loadNavMeta()` 之后调用 —— 只有预载完成，noteHighWater 才允许落盘。
 *
 * 旧基线存 localStorage 正是「守卫整体失效」的根因（它比 nav 数据更容易被回收），
 * 迁完立刻删除，杜绝它继续充当判据。旧值反映的是这台机器真实达到过的规模，
 * 转成只增不减的高水位正好用来兜底识别空态。
 */
function migrateBaselineFromLocalStorage(): void {
  try {
    const raw = localStorage.getItem(LEGACY_BASELINE_KEY)
    if (raw === null) return
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && n > 0) noteHighWater(n)
    localStorage.removeItem(LEGACY_BASELINE_KEY)
  } catch {
    // 隐私模式下访问 localStorage 本身会抛错：跳过迁移即可，不影响主流程
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
      // 守卫依据（基线/高水位）必须先于任何 nav 读写就位：
      // 空态判定全程依赖它，晚一步就可能出现「守卫还没醒、空态已经写回」的窗口
      await loadNavMeta()
      migrateBaselineFromLocalStorage()

      let fromIdb: NavPrefsRecord | undefined
      let idbError: unknown = null
      try {
        await migrateNavFromLocalStorageIfNeeded()
        await migrateNavToPerKeyRecords()
        // v21 起 nav 是多记录：整体装载用游标遍历，不再读单条 'items'
        const entries = await idbGetAllEntries<string>('nav')
        fromIdb = Object.keys(entries).length ? entries : undefined
      } catch (e) {
        idbError = e
      }
      const idbEmpty = !fromIdb || Object.keys(fromIdb).length === 0
      // IDB 读失败，或读出来是空的（两种都可能意味着存储被回收）→ 尝试影子恢复
      if (idbError || idbEmpty) {
        const shadow = readShadow()
        if (Object.keys(shadow).length > 0) {
          // 必须是 merge 而非替换：影子只覆盖 10 个键（见 navShadow.NAV_SHADOW_KEYS），
          // 整包替换会把 site-click-counts / user-background / site-favicon / icon-cache
          // 这 4 个未影子的键一并冲掉，等于用备份把主数据砍掉一角
          prefs = { ...(fromIdb ?? {}), ...shadow }
          loadState = 'shadow'
          // 尽力回填 IDB：成功了就回到健康状态，失败也无妨（内存里已可用，刷新影子也不会丢）
          try {
            await writeKeys(prefs)
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
 * 落盘前的空态拦截：返回空串 = 可写；非空 = 拒绝写入的原因。
 *
 * 与 `sites.ts` 的 `userSitesWriteBlockReason` 是**两道不同的门**，缺一不可：
 *   - 那道守在 sites store，只拦 user-sites 一个键；
 *   - 这道守在最终落盘口，拦的是**整包 nav 记录** ——
 *     theme / categories / icon-cache 等任何一次 setPref 都会经过这里，
 *     内存 prefs 若是空态，一次无关紧要的写入照样会把空态固化。
 *
 * 判据（基线、高水位）全部取自 IDB `navmeta`，与 nav 主数据同介质、同生共死，
 * 不会再出现旧版「localStorage 被回收 → 守卫静默失效」的情况。
 */
function emptyWriteBlockReason(snapshot: NavPrefsRecord): string {
  const raw = snapshot['user-sites']
  // 从未写过 user-sites（新装机器 / 恢复出厂后的首次保存）→ 放行，不能拦住新用户
  if (raw === undefined || raw === null) return ''
  const current = parseUserSitesCount(raw)
  // 数量未知（内容损坏）→ 宁可放行也不误拦
  if (current === UNKNOWN_COUNT) return ''
  // 以下两个开关都是「用户明确选择了以眼前这份为准」的信号，必须放行：
  //   - explicitMutation：用户在 UI 上增/删/改/导入过站点；
  //   - wipeOverride：用户在冲突解决里选了「以云端/备份为准」（含从备份恢复）。
  // 不放行会出现「恢复备份/覆盖云端后数据存不进去」的假死，比误拦更糟。
  if (isNavExplicitMutationActive()) return ''
  if (isNavWipeOverrideActive()) return ''
  const baseline = readBaseline()
  if (shouldGuardDrop(current, baseline)) {
    return `站点数 ${current} 较基线 ${baseline} 骤降`
  }
  const high = readHighWater()
  if (isSuspectedWipe(current, high)) {
    return `站点数 ${current} 远低于历史最高 ${high}`
  }
  return ''
}

/** 守卫日志节流间隔：数据真丢时每次写盘都会触发，不节流会刷爆控制台 */
const GUARD_LOG_THROTTLE_MS = 30_000
let lastGuardLogAt = 0
let guardHintShown = false

function warnGuardThrottled(reason: string): void {
  const now = Date.now()
  if (now - lastGuardLogAt < GUARD_LOG_THROTTLE_MS) return
  lastGuardLogAt = now
  console.error('[nav-prefs] 已跳过本次 nav 落盘，避免以空态覆盖真实数据：', reason)
  if (!guardHintShown) {
    guardHintShown = true
    console.error(
      '[nav-prefs] 导航数据疑似丢失，已暂停写入本地与云端。' +
      '请到「设置 → 云同步」点击「拉取」恢复，或导入备份文件。'
    )
  }
}

/**
 * 真正落盘：只写**变动过的键**，成功后刷新 localStorage 影子。
 *
 * v21 前这里是 `idbPut('nav', {...prefs})` 整包覆盖 —— 改一个键也要把全量重序列化一遍。
 * 现在按 dirtyKeys 逐键写入，落盘体积与「改了什么」成正比，不再与总数据量成正比。
 *
 * 注意顺序必须是「先主存后影子」：影子写失败不能影响 IDB 的成功语义，反之亦然。
 */
async function writeThrough(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  // 空态绝不落盘：这条是「数据没了又被自动写回」链路上的最后一道闸门。
  // 判定用**整包** prefs（守卫语义是「整体规模是否合理」，不是单个键）
  const blockReason = emptyWriteBlockReason(prefs)
  if (blockReason) {
    warnGuardThrottled(blockReason)
    return
  }
  for (const k of keys) {
    try {
      await idbPutKey('nav', k, prefs[k])
    } catch (e) {
      console.error('[nav-prefs] 持久化失败', k, e)
    }
  }
  try {
    writeShadow(prefs)
  } catch {
    // 影子纯冗余，失败无需告警打扰用户
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    const keys = [...dirtyKeys]
    dirtyKeys = new Set()
    void writeThrough(keys)
  }, SAVE_DEBOUNCE_MS)
}

/** 更新内存并防抖落盘 */
export function setPref(key: string, value: string): void {
  if (!allowWrite(`setPref(${key})`)) return
  prefs = { ...prefs, [key]: value }
  dirtyKeys.add(key)
  scheduleSave()
}

/** 立即更新内存并落盘（无防抖）：用于页面隐藏/卸载前 flush 与需立即持久的关键写入 */
export function setPrefNow(key: string, value: string): void {
  if (!allowWrite(`setPrefNow(${key})`)) return
  prefs = { ...prefs, [key]: value }
  dirtyKeys.delete(key) // 即将立即写入，无需再进防抖队列
  void writeThrough([key])
}

/** 立即落盘（页面隐藏/卸载、恢复备份后刷新前调用），取消防抖定时器 */
export async function flushNow(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const keys = [...dirtyKeys]
  dirtyKeys = new Set()
  if (!allowWrite('flushNow')) return
  await writeThrough(keys)
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
  // 「清空」本身会让站点数归零：必须同时清掉守卫依据（基线 + 高水位），
  // 否则接下来任何一次写盘都会被判定成「数据骤降/远低于历史最高」而拦下，
  // 用户会看到不该有的告警，且数据再也存不进去。
  resetNavMeta()
  await persistNavMeta()
  // 清掉 v19 及更早残留在 localStorage 的旧基线，避免它日后又被当成判据
  try {
    localStorage.removeItem(LEGACY_BASELINE_KEY)
  } catch {
    // 忽略
  }
  dirtyKeys = new Set()
  loadState = 'ok'
  await idbClear('nav')
  // 图标缓存（v21 起独立 store）一并清空：恢复出厂不该留下旧站点的图标
  try {
    await idbClear('iconcache')
  } catch {
    // 图标缓存可重建，清不掉不影响重置语义
  }
  // 清仍留在 localStorage 的 prefs 键（含 6 个非导航 prefs + 迁移前残留的导航键），维持出厂重置等同旧行为
  for (const k of WORKBENCH_PREFS_KEYS) {
    try { localStorage.removeItem(k) } catch { /* 忽略 */ }
  }
}

/**
 * 删除单个导航键（含 IDB 记录与影子）。
 * v21 引入：icon-cache 迁到独立 store 后，用它把 nav 里的旧副本清理掉。
 */
export async function deletePref(key: string): Promise<void> {
  dirtyKeys.delete(key)
  const next: NavPrefsRecord = { ...prefs }
  delete next[key]
  prefs = next
  try {
    await idbDeleteKey('nav', key)
  } catch (e) {
    console.error('[nav-prefs] 删除导航键失败', key, e)
  }
}

/** 云同步拉取后：用 IDB 最新值刷新内存，并重载各消费 store（与旧 reloadNavStores 等价） */
export async function refreshAfterImport(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  dirtyKeys = new Set()
  try {
    // 云同步可能刚写入过 nav，这里按 v21 多记录格式整体重读
    const data = await idbGetAllEntries<string>('nav')
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
  return {
    ensureLoaded,
    getPref,
    setPref,
    setPrefNow,
    deletePref,
    flushNow,
    clearAll,
    refreshAfterImport,
    isNavReadonly,
    navLoadState
  }
}
