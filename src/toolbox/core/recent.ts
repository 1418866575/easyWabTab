/**
 * 最近使用相关纯函数（零 Vue 依赖）
 */

import type { ToolboxRecentItem } from '../types'

/** 最近使用保留条数 */
export const RECENT_LIMIT = 8

/**
 * 记录一次使用：同 id 去重（取最新时间）→ 时间倒序 → 截断到上限。
 * 不修改入参，返回新数组。
 */
export function recordRecent(list: ToolboxRecentItem[], id: string, ts: number = Date.now()): ToolboxRecentItem[] {
  return [{ id, ts }]
    .concat((list || []).filter(r => r && r.id !== id))
    .slice(0, RECENT_LIMIT)
}

/** 相对时间文案：刚刚 / N 分钟前 / N 小时前 / N 天前 */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const mins = Math.max(0, Math.round((now - ts) / 60000))
  if (mins < 1) return '刚刚'
  if (mins < 60) return mins + ' 分钟前'
  if (mins < 1440) return Math.round(mins / 60) + ' 小时前'
  return Math.round(mins / 1440) + ' 天前'
}
