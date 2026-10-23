/**
 * 云同步墓碑（Tombstone）+ Lamport 逻辑时钟纯函数核心
 * 零 vue / 零 pinia / 零 localStorage 运行时依赖，便于 `node --experimental-strip-types` 单测。
 *
 * 对应 docs/云同步-删除失效-问题分析与方案.md：
 *   问题：合并是「并集」语义，本地删除（物理移除）后，"缺席"被解释为"远端新增" → 数据复活。
 *   方案：删除 = 写墓碑（保留记录 + 时间戳前进），墓碑参与比较压过云端的活记录；
 *        并发控制用 Lamport 逻辑时钟（ver）+ clientId 稳定 tie-break（用户决策）。
 *
 * 设计要点：
 *   - 字段全部可选，老数据（无 ver / clientId / deletedAt）自动降级为「未删除 + ver=0」，
 *     比较回落到现有 updatedAt，因此可渐进接入，无需一次性改全部模块。
 *   - 墓碑必须保留在数组里参与合并与推送（这是删除状态能被同步的载体），
 *     展示层再用 activeOnly() 过滤 —— 二者不可颠倒。
 */
import type { SyncStamp } from '../types'

/** 墓碑保留期（天）：用户决策 = 7 天，到期由 GC 物理清除 */
export const TOMBSTONE_TTL_DAYS = 7
/** 一天的毫秒数 */
const DAY_MS = 24 * 60 * 60 * 1000

/** 打标入参（now / clientId 均可注入，便于单测与批量打标） */
export interface StampOpts {
  /** ISO 时间戳；缺省取当前时间 */
  now?: string
  /** 产生该版本的客户端 id */
  clientId?: string
}

// ============================================================
// 判定 / 过滤
// ============================================================

/** 是否为墓碑（已删除） */
export function isDeleted(item: SyncStamp | undefined | null): boolean {
  return !!item && !!item.deletedAt
}

/** 展示/统计用：剔除墓碑，只留活记录。合并结果不可先过滤再入 UI —— 顺序是"先合并存墓碑，后过滤展示" */
export function activeOnly<T extends SyncStamp>(items: T[] | undefined | null): T[] {
  return (items ?? []).filter((i) => !isDeleted(i))
}

// ============================================================
// Lamport 逻辑时钟比较
// ============================================================

/**
 * 版本比较：ver → 时间戳 → clientId 三级。
 *
 * 1. `ver`（Lamport 逻辑时钟）优先：任何变更（含删除）都要 +1，保证"删除"必然晚于"对端编辑"。
 * 2. ver 相同 → 比时间戳（tsKey 存在用它，否则用 updatedAt）。这是老数据的兼容路径
 *    （习惯/时间线条目原本以 createdAt 为时间戳，必须保留其既有语义）。
 * 3. 仍相同 → 比 clientId。稳定的 tie-break，避免两端在完全同值时来回抖动。
 *
 * @returns >0 a 更新；<0 b 更新；0 视为同一版本
 */
export function compareStamp(a: SyncStamp, b: SyncStamp, tsKey?: string): number {
  const va = a.ver ?? 0
  const vb = b.ver ?? 0
  if (va !== vb) return va > vb ? 1 : -1

  const key = tsKey ?? 'updatedAt'
  const ua = String((a as unknown as Record<string, unknown>)[key] ?? '')
  const ub = String((b as unknown as Record<string, unknown>)[key] ?? '')
  if (ua !== ub) return ua > ub ? 1 : -1

  const ca = a.clientId ?? ''
  const cb = b.clientId ?? ''
  if (ca !== cb) return ca > cb ? 1 : -1
  return 0
}

/**
 * 归一化函数内保留墓碑与版本戳。
 *
 * 各模块的 normalizeXxx 普遍"重建对象、只拷已知字段"，一旦漏掉 deletedAt/ver/clientId，
 * 删除状态就会在归一化这步被抹掉 —— 记录退化成"活着的"，合并时又被当远端新增补回来，
 * 墓碑机制直接失效。凡是重建对象的归一化，**末尾一律调用本函数**。
 *
 * @param target 归一化后的新对象（会被就地补字段并返回）
 * @param src    归一化前的原始对象（任意形态，逐字段安全判定）
 */
export function keepStamp<T extends SyncStamp>(target: T, src: unknown): T {
  const s = (src ?? {}) as Partial<SyncStamp>
  if (typeof s.deletedAt === 'string' && s.deletedAt) target.deletedAt = s.deletedAt
  if (typeof s.ver === 'number') target.ver = s.ver
  if (typeof s.clientId === 'string' && s.clientId) target.clientId = s.clientId
  return target
}

// ============================================================
// 墓碑感知合并
// ============================================================

/**
 * 按 id 合并（并集 + 版本取新），墓碑同样参与比较。
 *
 * 与旧 mergeById 的差别：**同 id 时用 compareStamp 取新**，而不是只在远端更新时覆盖。
 * 于是：
 *   - 本端墓碑(ver 5) vs 云端活记录(ver 3) → 墓碑胜 → 保持删除（旧逻辑会复活）
 *   - 他端墓碑(ver 6) vs 本端活记录(ver 4) → 墓碑胜 → 本端也删除
 *   - 他端新增（本地缺席） → 补入（该语义必须保留）
 *
 * @param tsKey 时间戳字段名（缺省 updatedAt）；老数据无 ver 时用它比较
 */
export function mergeTombstonedById<T extends SyncStamp>(
  local: T[] | undefined | null,
  remote: T[] | undefined | null,
  tsKey?: string
): T[] {
  const map = new Map<string, T>()
  for (const item of [...(local ?? []), ...(remote ?? [])]) {
    const prev = map.get(item.id)
    if (!prev || compareStamp(item, prev, tsKey) > 0) map.set(item.id, item)
  }
  return Array.from(map.values())
}

// ============================================================
// 打标
// ============================================================

/** 普通更新：推进 ver 与 updatedAt（删除以外的变更也要让版本前进） */
export function bumpStamp<T extends SyncStamp>(item: T, opts: StampOpts = {}): T {
  const now = opts.now ?? new Date().toISOString()
  return {
    ...item,
    updatedAt: now,
    ver: (item.ver ?? 0) + 1,
    clientId: opts.clientId ?? item.clientId
  }
}

/**
 * 软删除：写墓碑而**不是**移除记录。
 * 记录仍留在数组里，随整包信封上云，云端才知道这条已删 —— 这是"同步删除状态"的载体。
 */
export function markDeleted<T extends SyncStamp>(item: T, opts: StampOpts = {}): T {
  const now = opts.now ?? new Date().toISOString()
  return {
    ...item,
    deletedAt: now,
    updatedAt: now,
    ver: (item.ver ?? 0) + 1,
    clientId: opts.clientId ?? item.clientId
  }
}

/** 恢复：清墓碑（退回删除前的状态），同样要推进版本，否则对端可能仍认为它是墓碑 */
export function clearDeleted<T extends SyncStamp>(item: T, opts: StampOpts = {}): T {
  const now = opts.now ?? new Date().toISOString()
  const next: T = {
    ...item,
    updatedAt: now,
    ver: (item.ver ?? 0) + 1,
    clientId: opts.clientId ?? item.clientId
  }
  delete (next as { deletedAt?: string | null }).deletedAt
  return next
}

/** 对数组内指定 id 软删除（返回新数组，不改动原数组） */
export function softDeleteById<T extends SyncStamp>(
  items: T[],
  id: string,
  opts: StampOpts = {}
): T[] {
  return items.map((i) => (i.id === id ? markDeleted(i, opts) : i))
}

/** 恢复数组内指定 id */
export function restoreById<T extends SyncStamp>(
  items: T[],
  id: string,
  opts: StampOpts = {}
): T[] {
  return items.map((i) => (i.id === id && isDeleted(i) ? clearDeleted(i, opts) : i))
}

// ============================================================
// 墓碑回收（GC）
// ============================================================

/** 墓碑是否已过保留期（非法 deletedAt 视为未过期，保守不清除） */
export function isTombstoneExpired(
  item: SyncStamp,
  now: Date = new Date(),
  ttlDays: number = TOMBSTONE_TTL_DAYS
): boolean {
  if (!item.deletedAt) return false
  const t = Date.parse(item.deletedAt)
  if (!Number.isFinite(t)) return false
  return now.getTime() - t >= ttlDays * DAY_MS
}

/**
 * 墓碑 GC：物理清除过期的墓碑（用户决策：彻底删除 = 物理清除）。
 * 调用时机须在**墓碑已成功推送上云之后**，否则对端会把它当新增补回来 —— 又变回复活。
 */
export function gcTombstones<T extends SyncStamp>(
  items: T[],
  now: Date = new Date(),
  ttlDays: number = TOMBSTONE_TTL_DAYS
): { kept: T[]; purged: number } {
  const kept: T[] = []
  let purged = 0
  for (const i of items) {
    if (isTombstoneExpired(i, now, ttlDays)) purged += 1
    else kept.push(i)
  }
  return { kept, purged }
}

/** 回收站列表：墓碑按删除时间倒序（供各模块「最近删除」复用） */
export function trashedItems<T extends SyncStamp>(items: T[]): T[] {
  return (items ?? [])
    .filter((i) => isDeleted(i))
    .sort((a, b) => String(b.deletedAt ?? '').localeCompare(String(a.deletedAt ?? '')))
}
