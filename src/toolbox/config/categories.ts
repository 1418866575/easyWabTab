import type { ToolboxCategory } from '../types'
import { MODULE_CATEGORY_ID } from '../core/category.ts'

/**
 * 工具分类（静态配置，新增分类追加一条即可）
 *
 * 说明：
 * - 分类顺序由 order 决定；「其他」永远垫底（order 999）。
 * - 「站内模块」为专属分类：kind === 'module' 的工具由 core/category.ts 自动归入，
 *   工具元数据里不必写 category（写了也会被归一化覆盖）。
 * - 列表渲染时会自动隐藏 count 为 0 的分类（见 ToolboxCategoryTabs）。
 */
export const TOOLBOX_CATEGORIES: ToolboxCategory[] = [
  { id: 'dev', name: '开发工具', icon: '🛠', order: 1 },
  { id: 'data', name: '数据工具', icon: '📊', order: 2 },
  { id: 'media', name: '媒体工具', icon: '🎬', order: 3 },
  { id: 'effi', name: '效率工具', icon: '⚡', order: 4 },
  { id: MODULE_CATEGORY_ID, name: '站内模块', icon: '🧭', order: 5 },
  { id: 'other', name: '其他', icon: '📁', order: 999 }
]

/** 分类 id → 名称（未知分类回落「其他」） */
export function categoryName(id: string): string {
  return (TOOLBOX_CATEGORIES.find(c => c.id === id) || {}).name || '其他'
}

/** 分类 id → 图标 */
export function categoryIcon(id: string): string {
  return (TOOLBOX_CATEGORIES.find(c => c.id === id) || {}).icon || '📁'
}
