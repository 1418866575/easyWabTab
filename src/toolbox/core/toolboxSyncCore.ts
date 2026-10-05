/**
 * 工具箱云同步 —— 纯函数核心（零 vue / 零 pinia 依赖，可被 node --experimental-strip-types 直测）
 *
 * 同步内容（4 项，按用户需求全部同步）：
 *   1. 收藏工具 favorites   —— 合并取**并集**（两边收藏都保留，删除只是"不再新增"）
 *   2. 最近使用 recent     —— 按 ts **时间最新优先**合并（同 id 取较大 ts）
 *   3. 点击次数 clicks     —— 同 id **累加**？不：取**较大值**（各设备各自统计，取多的为准，避免重复累加虚高）
 *   4. 搜索历史 searchHistory —— 取**并集**（顺序按本地优先，再补远端新增，保持 FIFO 上限）
 *
 * 设计原则：合并是「幂等且不丢数据」的——同一份数据合并两次结果相同，且不会因另一端有改动而清空本地。
 */

/** 同步信封（与其它信封同构：version + exportedAt + 业务字段） */
export interface ToolboxSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  /** 收藏的工具 id */
  favorites?: string[]
  /** 最近使用记录 */
  recent?: { id: string; ts: number }[]
  /** 各工具点击次数 { [toolId]: count } */
  clicks?: Record<string, number>
  /** 搜索历史（最新的在前） */
  searchHistory?: string[]
}

/** 与 useIdb / useCloudSync 中限定的搜索历史上限保持一致 */
export const SEARCH_HISTORY_LIMIT = 5
/** 最近使用保留条数（与 core/recent 保持一致） */
export const RECENT_LIMIT = 12

/** 规范化收藏：只保留非空字符串去重 */
export function normalizeFavorites(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (typeof x === 'string' && x && !out.includes(x)) out.push(x)
  }
  return out
}

/** 规范化最近使用：过滤非法项，按 ts 倒序（最新在前），同 id 只保留最新一条 */
export function normalizeRecent(v: unknown): { id: string; ts: number }[] {
  if (!Array.isArray(v)) return []
  const byId = new Map<string, number>()
  for (const r of v) {
    if (!r || typeof r !== 'object') continue
    const id = (r as { id?: unknown }).id
    const ts = (r as { ts?: unknown }).ts
    if (typeof id !== 'string' || !id) continue
    const n = typeof ts === 'number' && Number.isFinite(ts) ? ts : 0
    const prev = byId.get(id)
    if (prev === undefined || n > prev) byId.set(id, n)
  }
  return [...byId.entries()]
    .map(([id, ts]) => ({ id, ts }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, RECENT_LIMIT)
}

/** 规范化点击次数：只保留正整数，键为非空字符串 */
export function normalizeClicksMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (!k) continue
    const num = typeof n === 'number' ? n : Number(n)
    if (!Number.isFinite(num) || num <= 0) continue
    out[k] = Math.floor(num)
  }
  return out
}

/** 规范化搜索历史：去空、去重，保持原顺序（最新的在前），截断到上限 */
export function normalizeSearchList(v: unknown, limit = SEARCH_HISTORY_LIMIT): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') continue
    const s = x.trim()
    if (!s || out.includes(s)) continue
    out.push(s)
    if (out.length >= limit) break
  }
  return out
}

/** 规范化整个信封的 4 个业务字段（脏数据安全：非法输入一律回落到空） */
export function normalizeToolboxData(d: unknown): Required<Omit<ToolboxSyncData, 'version' | 'exportedAt' | 'clientId' | 'pushedAt'>> {
  const src = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>
  return {
    favorites: normalizeFavorites(src.favorites),
    recent: normalizeRecent(src.recent),
    clicks: normalizeClicksMap(src.clicks),
    searchHistory: normalizeSearchList(src.searchHistory)
  }
}

/**
 * 合并本地与云端数据（**并集 + 时间最新**）。
 * @param local 本机数据
 * @param remote 云端数据
 * @param preferLocalOrder 收藏合并时是否本地顺序在前（默认 true：本机刚收藏的排前面）
 */
export function mergeToolboxData(
  local: unknown,
  remote: unknown,
  preferLocalOrder = true
): ReturnType<typeof normalizeToolboxData> {
  const l = normalizeToolboxData(local)
  const r = normalizeToolboxData(remote)

  // ① 收藏：并集（本地在前，云端新增追加在后）
  const favorites: string[] = [...l.favorites]
  for (const id of r.favorites) {
    if (!favorites.includes(id)) favorites.push(id)
  }
  if (!preferLocalOrder) {
    // 云端在前：先把云端排好，再补本地独有的
    const ordered: string[] = [...r.favorites]
    for (const id of l.favorites) {
      if (!ordered.includes(id)) ordered.push(id)
    }
    favorites.length = 0
    favorites.push(...ordered)
  }

  // ② 最近使用：normalizeRecent 内部已按「同 id 取最大 ts + 倒序」处理，等价于时间最新优先
  const recent = normalizeRecent([...l.recent, ...r.recent])

  // ③ 点击次数：同 id 取较大值（各设备独立统计，取多的为准；不做累加以免虚高）
  const clicks: Record<string, number> = { ...l.clicks }
  for (const [k, n] of Object.entries(r.clicks)) {
    if (clicks[k] === undefined || n > clicks[k]) clicks[k] = n
  }

  // ④ 搜索历史：并集，本地在前（保持本机最近输入的排序），截断到上限
  const searchHistory = normalizeSearchList([...l.searchHistory, ...r.searchHistory])

  return { favorites, recent, clicks, searchHistory }
}

/** 计算两份数据的差异大小（用于同步前的"是否需要上传"判断；0 = 无差异） */
export function toolboxDiffSize(local: unknown, remote: unknown): number {
  const l = normalizeToolboxData(local)
  const r = normalizeToolboxData(remote)
  let n = 0
  // 收藏：对称差集计 1
  for (const id of l.favorites) if (!r.favorites.includes(id)) n++
  for (const id of r.favorites) if (!l.favorites.includes(id)) n++
  // 最近使用：按 id+ts 逐条比较
  const rMap = new Map(r.recent.map(x => [x.id, x.ts]))
  for (const it of l.recent) if (rMap.get(it.id) !== it.ts) n++
  // 点击次数：值不同计 1
  for (const [k, v] of Object.entries(l.clicks)) if (r.clicks[k] !== v) n++
  for (const [k, v] of Object.entries(r.clicks)) if (l.clicks[k] !== v) n++
  // 搜索历史：整体比较
  if (l.searchHistory.join('\u0001') !== r.searchHistory.join('\u0001')) n++
  return n
}

/** 签名：用于快速判断信封是否变化（变化才会参与冲突合并） */
export function toolboxSignature(d: unknown): string {
  const n = normalizeToolboxData(d)
  return JSON.stringify([n.favorites, n.recent, n.clicks, n.searchHistory])
}
