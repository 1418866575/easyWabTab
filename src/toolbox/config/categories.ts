import type { ToolboxCategory } from '../types'

/** 工具分类（静态配置，新增分类追加一条即可） */
export const TOOLBOX_CATEGORIES: ToolboxCategory[] = [
  { id: 'dev', name: '开发工具', icon: '🛠', order: 1 },
  { id: 'data', name: '数据工具', icon: '📊', order: 2 },
  { id: 'media', name: '媒体工具', icon: '🎬', order: 3 },
  { id: 'effi', name: '效率工具', icon: '⚡', order: 4 },
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
