/**
 * 导航数据降级防护（nav data guard）
 *
 * ## 背景（本次修复要根治的事故）
 * 移动端曾出现「导航站数据被清空 → 空态被当成正常数据写回 IndexedDB → 自动推送上云 →
 * 其它设备拉取时把这份空态直接应用（远端缺失的键还会被删除）→ 电脑端真实数据消失」。
 * 事故链条有三处关键缺陷：
 *   1. 读取失败/存储被回收与「本来就没数据」无法区分，一律 fail-open 成空态；
 *   2. store 把降级后的空态当成用户数据写回，形成持久化污染；
 *   3. 推送与同步没有本地退化检查，空态一路推上云并连锁到其它设备。
 *
 * ## 本模块提供的判据
 * 统一用「用户自有站点数 vs 会话基线」判断是否疑似降级：
 *   - 基线（localStorage 里一个小整数）**只由显式用户改动**（增/删/改/导入/拉取成功）推进；
 *     单纯的读取与自动写盘（点击计数、页面隐藏 flush）**不推进**基线。
 *   - 于是「用户真的删掉一批站点」不会触发防护，而「数据莫名变成空态后被自动回写/推送」会触发。
 *
 * ## 设计边界
 * - 纯函数部分（parseUserSitesCount / shouldGuardDrop / evaluateUserSitesCount 等）零依赖；
 * - 基线读写依赖 localStorage：仅存 1 个小整数，**丢失即退化为「不防护」**，不会反过来丢数据；
 * - 因此本文件被 node 脚本（scripts/test-nav-guard.ts）直接断言时，
 *   只要先给 globalThis 挂一个内存版 localStorage，存储相关导出也能正常跑。
 */

/** 触发防护的最小基线：站点数低于此值说明数据本来就少，不值得为了防降级而阻断写入 */
export const GUARD_MIN_BASELINE = 5
/** 判定「骤降」的比例：当前数 < 基线 × 该比例 → 疑似降级 */
export const GUARD_DROP_RATIO = 0.5
/** 无法判定数量（内容不是合法 JSON 数组）时的哨兵值：宁可不拦，也不误拦 */
export const UNKNOWN_COUNT = -1

/** 基线存放键（localStorage，仅一个小整数，与 nav 数据不同介质，避免同时被清） */
export const BASELINE_STORAGE_KEY = 'ewt.navGuard.userSitesBaseline'

export interface SiteCountVerdict {
  /** true = 疑似降级，调用方应暂停写回/推送 */
  tripped: boolean
  /** 当前站点数（UNKNOWN_COUNT 表示无法确定） */
  current: number
  /** 已知基线 */
  baseline: number
  /** tripped 时的中文说明，未触发为空串 */
  reason: string
}

/**
 * 解析 `user-sites` 原始 JSON 串里的站点条数。
 * - null/undefined/空串 → 0（没有用户站点）
 * - 合法数组 → 数组长度
 * - 其它（损坏的非数组 JSON）→ UNKNOWN_COUNT：数量未知，不做降级判定
 */
export function parseUserSitesCount(raw: string | null | undefined): number {
  if (raw == null) return 0
  if (raw === '') return 0
  try {
    const list: unknown = JSON.parse(raw)
    if (Array.isArray(list)) return list.length
  } catch {
    // 内容损坏：数量未知
  }
  return UNKNOWN_COUNT
}

/** 纯粹的骤降判据：基线太小、或数量未知时不判定 */
export function shouldGuardDrop(current: number, baseline: number): boolean {
  if (baseline < GUARD_MIN_BASELINE) return false
  if (current === UNKNOWN_COUNT) return false
  return current < baseline * GUARD_DROP_RATIO
}

/** 组合出可展示的判定结果（含中文原因） */
export function evaluateUserSitesCount(current: number, baseline: number): SiteCountVerdict {
  const tripped = shouldGuardDrop(current, baseline)
  return {
    tripped,
    current,
    baseline,
    reason: tripped
      ? `站点数 ${current} 较已知基线 ${baseline} 下降超过 ${Math.round((1 - GUARD_DROP_RATIO) * 100)}%`
      : ''
  }
}

/**
 * 远端/备份要覆盖本地时，是否应判为「疑似清空」而拒绝。
 *
 * 只拦**最极端**的一种情形：对方完全没有站点（缺值或空数组），而本地却有成规模的数据。
 * 「对方站点更少但非空」一律放行——那可能是用户在别的设备真的整理掉了，拦下来反而让用户困惑。
 */
export function isSuspectedRemoteWipe(localRaw: string | null | undefined, remoteRaw: string | null | undefined): boolean {
  const remoteCount = parseUserSitesCount(remoteRaw)
  if (remoteCount === UNKNOWN_COUNT) return false
  const localCount = parseUserSitesCount(localRaw)
  return localCount >= GUARD_MIN_BASELINE && remoteCount === 0
}

// ========== 显式放行开关 ==========

/**
 * 「用户明确选择以云端/备份为准」时临时放行的截止时间。
 *
 * 上面两条保护（保留本地、拒绝远端空列表）挡的是**自动**同步链路；
 * 但用户在冲突解决里点了「全部云端覆盖」、或主动从备份恢复时，那就是他的真实意图，
 * 此时必须放行，否则用户会觉得「点了没反应」。一次性窗口避免放行残留到后续自动同步。
 */
let navWipeOverrideUntil = 0

/** 武装放行（默认 60 秒，够跑完一批 applyRemote/restore） */
export function armNavWipeOverride(ttlMs = 60_000): void {
  navWipeOverrideUntil = Date.now() + Math.max(0, ttlMs)
}

/** 当前是否处于放行窗口内 */
export function isNavWipeOverrideActive(): boolean {
  return Date.now() < navWipeOverrideUntil
}

/**
 * 本会话是否发生过**显式用户改动**（增/删/改站点）。
 *
 * 写盘守卫（sites.ts）与推送守卫（useCloudSync）都读这一个标志，两处判定必须一致——
 * 否则会出现「本地写进去了、推送却被永久拦下」的死锁。
 *
 * 语义：用户在手动整理数据时，「眼前所见」就是他认可的数据，此时不该再用历史基线去拦他。
 * 事故形态里**没有**用户操作（纯粹是自动写盘/后台同步），所以放行开关不会削弱关键防护。
 */
let navExplicitMutation = false

export function armNavExplicitMutation(): void {
  navExplicitMutation = true
}

export function isNavExplicitMutationActive(): boolean {
  return navExplicitMutation
}

/** 仅供测试：复位会话题状态 */
export function resetNavSessionFlags(): void {
  navExplicitMutation = false
  navWipeOverrideUntil = 0
}

// ========== 基线持久化（localStorage，失败一律降级为「无基线 = 不防护」）==========

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    // 某些隐私模式下访问 localStorage 属性本身就抛错
    return null
  }
}

/** 读取已知基线（无记录 / 记录损坏 → 0） */
export function readBaseline(): number {
  const s = safeStorage()
  if (!s) return 0
  try {
    const n = Number.parseInt(s.getItem(BASELINE_STORAGE_KEY) ?? '', 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

/** 写入基线（非数字/负数归 0） */
export function writeBaseline(count: number): void {
  const s = safeStorage()
  if (!s) return
  try {
    const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
    s.setItem(BASELINE_STORAGE_KEY, String(n))
  } catch {
    // 配额/隐私模式：放弃基线，退化为不防护（不影响数据本身）
  }
}

/** 清除基线（恢复出厂、清空数据等显式场景用，避免残留基线让后续合法写入被拦） */
export function clearBaseline(): void {
  const s = safeStorage()
  if (!s) return
  try {
    s.removeItem(BASELINE_STORAGE_KEY)
  } catch {
    // 同上
  }
}

/** 首次确立基线：只在还没有基线时写入，返回确立后的基线值 */
export function ensureBaseline(count: number): number {
  if (readBaseline() === 0 && count > 0) writeBaseline(count)
  return readBaseline()
}

/** 用 localStorage 基线判定当前 user-sites 是否疑似降级（供推送/写盘直接调用） */
export function checkUserSitesAgainstBaseline(raw: string | null | undefined): SiteCountVerdict {
  return evaluateUserSitesCount(parseUserSitesCount(raw), readBaseline())
}
