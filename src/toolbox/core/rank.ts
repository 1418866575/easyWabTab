/**
 * 工具点击次数（使用热度）纯函数（零 Vue 依赖，可被 node --experimental-strip-types 直测）
 *
 * 约定：
 * - 存储结构为「工具 id → 次数」的普通对象，便于直接落 localStorage
 * - 计数上限 CLICK_MAX，避免长期累加出现天文数字
 * - 所有函数不修改入参，返回新值
 */

import type { ToolboxToolMeta } from '../types.ts'

/** 单个工具的点击次数上限 */
export const CLICK_MAX = 99999

/** 点击次数表：工具 id → 次数 */
export type ClickMap = Record<string, number>

/**
 * 归一化点击次数表：过滤非法项（非正整数 / 越界 / 非字符串键），一律收敛到 [1, CLICK_MAX]。
 * 用于读 localStorage 后的脏数据清洗。
 */
export function normalizeClicks(raw: unknown): ClickMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: ClickMap = {}
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== 'string' || !id) continue
    const v = Math.floor(Number(n))
    if (!Number.isFinite(v) || v < 1) continue
    out[id] = Math.min(v, CLICK_MAX)
  }
  return out
}

/** 取某个工具的点击次数（缺省 / 非法值一律为 0） */
export function clickCount(clicks: ClickMap | undefined, id: string): number {
  if (!clicks || typeof id !== 'string') return 0
  const n = Math.floor(Number(clicks[id]))
  return Number.isFinite(n) && n > 0 ? Math.min(n, CLICK_MAX) : 0
}

/** 记录一次点击，返回新的次数表（到达上限后不再增长） */
export function recordClick(clicks: ClickMap | undefined, id: string): ClickMap {
  if (typeof id !== 'string' || !id) return { ...(clicks || {}) }
  const prev = clickCount(clicks, id)
  return { ...(clicks || {}), [id]: Math.min(prev + 1, CLICK_MAX) }
}

/** 清空某个工具的点击次数 */
export function removeClick(clicks: ClickMap | undefined, id: string): ClickMap {
  if (!clicks) return {}
  const next: ClickMap = { ...clicks }
  delete next[id]
  return next
}

/**
 * 按点击次数降序排序（次数相同的保持原有相对顺序 —— 即 registry 的 order 顺序）。
 * clicks 为空时等价于原顺序。
 */
export function sortByClicks(list: ToolboxToolMeta[], clicks?: ClickMap): ToolboxToolMeta[] {
  if (!clicks || !Object.keys(clicks).length) return list.slice()
  return list.slice().sort((a, b) => clickCount(clicks, b.id) - clickCount(clicks, a.id))
}
