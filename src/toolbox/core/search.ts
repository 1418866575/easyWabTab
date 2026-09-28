/**
 * 搜索与筛选纯函数（零 Vue / Pinia 依赖，可被 node --experimental-strip-types 直测）
 *
 * 规则：
 * - 匹配范围 = 名称 + 描述 + 标签
 * - 大小写不敏感
 * - 空格分词，各词需全部命中（AND）
 */

import type { ToolboxToolMeta } from '../types'

/** 归一化：小写 + 去首尾空格 */
export const norm = (s: string): string => (s || '').toLowerCase().trim()

/** 关键字分词（空格分隔，去空） */
export function tokens(q: string): string[] {
  return norm(q).split(/\s+/).filter(Boolean)
}

/** 参与匹配的文本域：名称 + 描述 + 标签 */
export function haystack(t: ToolboxToolMeta): string {
  return norm([t.name, t.description, (t.tags || []).join(' ')].join(' '))
}

/** 单个工具是否命中关键字 */
export function matchTool(t: ToolboxToolMeta, q: string): boolean {
  const ts = tokens(q)
  if (!ts.length) return true
  const h = haystack(t)
  return ts.every(x => h.includes(x))
}

/** 按分类统计工具数量（供分类筛选显示角标） */
export function countByCategory(list: ToolboxToolMeta[], category: string): number {
  return list.filter(t => t.category === category).length
}

/** 分类 + 关键字叠加筛选，并按 order 排序 */
export function filterTools(
  list: ToolboxToolMeta[],
  opts: { q?: string; category?: string } = {}
): ToolboxToolMeta[] {
  const q = opts.q || ''
  const cat = opts.category || ''
  return list
    .filter(t => !cat || t.category === cat)
    .filter(t => matchTool(t, q))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
}
