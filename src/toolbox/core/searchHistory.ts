/**
 * 搜索建议 / 搜索历史纯函数（零 Vue 依赖，可被 node --experimental-strip-types 直测）
 *
 * - suggestTools：输入关键字时给出候选建议（名称/标签优先命中，去重、限长、按 order 稳定排序）
 * - pushSearchHistory：FIFO，最多保留 N 条（超出丢弃最早一条），相同关键字去重后置顶
 * - 两者均为纯函数，不触碰 localStorage / DOM
 */

import type { ToolboxToolMeta } from '../types'
import { norm, tokens } from './search.ts'

/** 搜索历史最大保留条数 */
export const SEARCH_HISTORY_LIMIT = 5

/** 生成搜索建议：返回最多 limit 个工具 meta */
export function suggestTools(
  list: ToolboxToolMeta[],
  q: string,
  limit = 8
): ToolboxToolMeta[] {
  const ts = tokens(q)
  if (!ts.length) return []
  // 任一 token 命中即可进入候选（比严格 AND 更适合“建议”场景）
  const scored: { tool: ToolboxToolMeta; score: number }[] = []
  for (const t of list) {
    const name = norm(t.name)
    const tags = norm((t.tags || []).join(' '))
    const desc = norm(t.description)
    let score = 0
    for (const tk of ts) {
      if (name.includes(tk)) score += 3
      else if (tags.includes(tk)) score += 2
      else if (desc.includes(tk)) score += 1
    }
    if (score > 0) scored.push({ tool: t, score })
  }
  // 分数降序；同分按 order 升序（稳定、可预期）
  scored.sort((a, b) => b.score - a.score || (a.tool.order ?? 999) - (b.tool.order ?? 999))
  return scored.slice(0, limit).map(s => s.tool)
}

/**
 * 写入一条搜索历史（FIFO）
 * - 空关键字忽略
 * - 与已有记录重复时先移除旧位置再放到最前（最近使用优先）
 * - 超过 limit 时移除最早的一条（即数组末尾）
 */
export function pushSearchHistory(history: string[], keyword: string, limit = SEARCH_HISTORY_LIMIT): string[] {
  const kw = norm(keyword)
  if (!kw) return history
  const next = history.filter(x => norm(x) !== kw)
  next.unshift(kw)
  return next.length > limit ? next.slice(0, limit) : next
}

/** 校验并归一化持久化的历史数据：仅保留非空字符串、去重、限长 */
export function normalizeSearchHistory(raw: unknown, limit = SEARCH_HISTORY_LIMIT): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const x of raw) {
    if (typeof x !== 'string') continue
    const k = norm(x)
    if (!k) continue
    if (out.some(y => norm(y) === k)) continue
    out.push(k)
    if (out.length >= limit) break
  }
  return out
}
