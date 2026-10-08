/**
 * 导航数据「守卫依据」的持久化（nav meta）
 *
 * ## 为什么单独一个模块，且必须存 IndexedDB
 *
 * v18 已把导航主数据从 localStorage 迁到 IDB `nav` store，但导航站仍频繁「回到初始状态」。
 * 根因是**守卫的判断依据（基线 baseline）仍存在 localStorage** ——
 * 而 localStorage 恰恰是 v18 要躲开、且历史上会被移动端系统**单独回收**的介质
 * （这正是当初迁移动机的原文：「根治移动端 localStorage 被系统回收导致导航数据丢失」）。
 *
 * 它被回收后的连锁反应：
 *   基线归零 → `shouldGuardDrop` 因 `baseline < GUARD_MIN_BASELINE` 恒返回 false
 *   → 写盘守卫（sites.ts）与推送守卫（useCloudSync）同时失效
 *   → 「空态」畅通无阻地写回 IDB 并推上云 → 用户看到「只剩内置站点」= 初始状态。
 *
 * ## 设计原则：守卫依据必须与被守卫的数据同介质、同生共死
 *
 *   - 主数据在 IDB `nav` → 基线/高水位也必须存 IDB（本模块，store `navmeta`）；
 *   - IDB 整体没了 → 数据也没了，守卫失效不构成**额外**损失；
 *   - 真正致命的是「IDB 数据还在、守卫依据却被回收」这种不对称，本模块彻底消除它。
 *
 * ## 两个值
 *
 *   - `baseline`：用户自有站点数基线。语义与推进时机同 navDataGuard ——
 *     **只由显式用户改动推进**（增/删/改/导入/拉取成功），单纯读取与自动写盘不推进。
 *   - `highWater`：历史最大用户站点数，**只增不减**。作为基线的兜底：
 *     即便基线因故丢失，「当前 0 条 vs 历史 200 条」仍能一眼识别为异常。
 *     它专门覆盖「nav 记录被残缺 prefs 整包覆盖」这一场景（此时基线可能已同步变小）。
 *
 * ## 读写语义：内存缓存 + 同步读取
 *
 * 现有调用点（`sites.userSitesWriteBlockReason`、`useCloudSync.guardNavUserSites`）都是同步链路，
 * 改成 async 会牵动整条判定链。故启动时 `loadNavMeta()` 一次性灌入内存，
 * 之后同步读、异步防抖落盘，调用点零改动。
 *
 * **未预载时拒绝落盘**（见 `schedulePersist`）：这是本模块最关键的一条自我保护 ——
 * 内存里还是初始值 0，此时落盘会用 0 覆盖掉 IDB 中的真实基线，反而制造事故。
 */
export interface NavMetaRecord {
  /** 用户自有站点数基线（只由显式用户改动推进） */
  baseline: number
  /** 历史最大用户站点数（只增不减） */
  highWater: number
}

/**
 * 持久化后端：由应用启动方装配（见 main.ts），本模块自身**零存储依赖**。
 *
 * 刻意不做成 `import { idbGet, idbPut } from './useIdb'`：
 *   1. 守卫不应依赖主数据层 —— 主数据层（useIdb）一旦故障，守卫必须还能独立工作；
 *   2. useIdb 依赖树很重（types/useCrypto/各 Core），node 侧无法直接加载，
 *      会挡住纯逻辑单测（scripts/test-nav-meta.ts）。
 * 未装配时本模块退化为「仅本次会话有效」，不抛错、不写任何存储。
 */
type MetaReader = () => Promise<NavMetaRecord | null | undefined>
type MetaWriter = (record: NavMetaRecord) => Promise<void>

let reader: MetaReader | null = null
let writer: MetaWriter | null = null

/** 装配持久化后端（幂等；重复调用以最后一次为准） */
export function configureNavMetaStorage(read: MetaReader, write: MetaWriter): void {
  reader = read
  writer = write
}

/** 仅供测试：复位到未装配状态 */
export function resetNavMetaStorage(): void {
  reader = null
  writer = null
}

let baseline = 0
let highWater = 0
/** 是否已完成 IDB 预载。为 false 时禁止落盘，避免用初始值 0 冲掉真实数据 */
let loaded = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

const SAVE_DEBOUNCE_MS = 500

/** 数量归一：非数字/负数归 0，小数取下整 */
function normalizeCount(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

/** 当前内存快照（供排障与测试断言） */
export function navMetaSnapshot(): NavMetaRecord {
  return { baseline, highWater }
}

/** 是否已预载（未预载时所有写操作只改内存、不落盘） */
export function isNavMetaLoaded(): boolean {
  return loaded
}

/**
 * 启动时一次性从 IDB 灌入内存。幂等。
 * 读取失败一律退化为「无基线 = 不防护」—— 宁可少拦，也不能用假数据拦住用户。
 */
export async function loadNavMeta(): Promise<void> {
  if (loaded) return
  try {
    const rec = reader ? await reader() : null
    baseline = normalizeCount(rec?.baseline)
    highWater = normalizeCount(rec?.highWater)
  } catch (e) {
    console.error('[nav-meta] 守卫依据读取失败，本次会话退化为不防护', e)
    baseline = 0
    highWater = 0
  }
  loaded = true
}

/** 供云同步拉取/备份恢复后重新对齐（此时 IDB 已被外部改写） */
export async function reloadNavMeta(): Promise<void> {
  loaded = false
  await loadNavMeta()
}

export function readBaseline(): number {
  return baseline
}

export function writeBaseline(count: number): void {
  baseline = normalizeCount(count)
  schedulePersist()
}

export function clearBaseline(): void {
  baseline = 0
  schedulePersist()
}

/** 首次确立基线：只在还没有基线时写入，返回确立后的基线值（移植自 navDataGuard.ensureBaseline） */
export function ensureBaseline(count: number): number {
  if (baseline === 0 && count > 0) writeBaseline(count)
  return baseline
}

export function readHighWater(): number {
  return highWater
}

/**
 * 记录当前站点数，只在突破历史最大值时更新。
 * 这是「只增不减」的唯一入口 —— 站点真的被用户删掉不会拉低高水位，
 * 因此高水位代表的是「这台机器上曾经出现过的最大规模」，用它识别空态最可靠。
 */
export function noteHighWater(count: number): void {
  const n = normalizeCount(count)
  if (n <= highWater) return
  highWater = n
  schedulePersist()
}

/** 恢复出厂 / 清空导航数据：基线和高水位一并归零，否则清空后的写盘会被守卫拦下 */
export function resetNavMeta(): void {
  baseline = 0
  highWater = 0
  schedulePersist()
}

function schedulePersist(): void {
  // 未预载就落盘 = 用内存初始值 0 覆盖 IDB 真实值，正是本模块要防的事故形态
  if (!loaded) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void persistNavMeta()
  }, SAVE_DEBOUNCE_MS)
}

/** 立即落盘（页面隐藏/卸载、恢复出厂前调用） */
export async function persistNavMeta(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  // 未预载就落盘 = 用内存初始值 0 覆盖真实值；未装配后端则无处可写，两者都直接跳过
  if (!loaded || !writer) return
  try {
    await writer({ baseline, highWater } satisfies NavMetaRecord)
  } catch (e) {
    console.error('[nav-meta] 守卫依据持久化失败，降级保护可能失效', e)
  }
}
