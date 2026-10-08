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
 * - **本模块只提供判据，不碰任何存储介质**（v20 起）。
 * - 基线与高水位的持久化已迁至 `navMeta.ts`（IndexedDB `navmeta` store）。
 *   迁移原因：基线原先存在 localStorage，而 localStorage 会被移动端系统**单独回收**，
 *   回收后基线归零 → shouldGuardDrop 恒 false → 全部守卫失效，正是本模块要防的事故本身。
 *   守卫依据必须与被守卫的数据同介质（`nav` 也在 IDB），故统一迁走。
 *   调用方请自行从 `navMeta` 取基线后传入（见 checkUserSitesAgainstBaseline）。
 * - 因此本文件全部导出均为**纯函数或会话内标志**，
 *   node 脚本（scripts/test-nav-guard.ts）可直接断言，无需挂载任何存储。
 */

/** 触发防护的最小基线：站点数低于此值说明数据本来就少，不值得为了防降级而阻断写入 */
export const GUARD_MIN_BASELINE = 5
/** 判定「骤降」的比例：当前数 < 基线 × 该比例 → 疑似降级 */
export const GUARD_DROP_RATIO = 0.5
/** 无法判定数量（内容不是合法 JSON 数组）时的哨兵值：宁可不拦，也不误拦 */
export const UNKNOWN_COUNT = -1

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

// ========== 组合判据（基线由调用方从 navMeta 取得后显式传入）==========

/**
 * 用给定基线判定 user-sites 是否疑似降级（供推送/写盘直接调用）。
 *
 * 基线参数化而非内部读取，是为了让本模块保持**零存储依赖**：
 * 存储归属 navMeta（IDB），判据归属这里，两者不再耦合。
 */
export function checkUserSitesAgainstBaseline(
  raw: string | null | undefined,
  baseline: number
): SiteCountVerdict {
  return evaluateUserSitesCount(parseUserSitesCount(raw), baseline)
}

/**
 * 「空态 vs 历史最大规模」兜底判定 —— 基线之外的第二道判据。
 *
 * 覆盖场景：nav 记录被残缺 prefs 整包覆盖后，基线可能已随之前几次写入同步变小，
 * 单看基线未必触发骤降；但「当前 0 条、历史曾达 highWater」几乎只可能是数据丢失。
 *
 * @param current 当前用户自有站点数（UNKNOWN_COUNT 表示无法判定）
 * @param highWater 历史最大站点数（来自 navMeta.readHighWater）
 */
export function isSuspectedWipe(current: number, highWater: number): boolean {
  if (current === UNKNOWN_COUNT) return false
  if (highWater < GUARD_MIN_BASELINE) return false
  return current === 0 || current < highWater * GUARD_DROP_RATIO
}
