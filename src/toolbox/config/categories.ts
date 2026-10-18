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
  { id: 'encode', name: '编码解码', icon: '🔐', order: 2 },
  { id: 'data', name: '数据转换', icon: '🔄', order: 3 },
  { id: 'text', name: '文本处理', icon: '📝', order: 4 },
  { id: 'image', name: '图片处理', icon: '🖼️', order: 5 },
  { id: 'color', name: '颜色设计', icon: '🎨', order: 6 },
  { id: 'time', name: '时间计算', icon: '🕒', order: 7 },
  { id: 'calc', name: '计算换算', icon: '🧮', order: 8 },
  { id: 'gen', name: '生成与随机', icon: '🎲', order: 9 },
  { id: 'effi', name: '效率工具', icon: '⚡', order: 10 },
  { id: 'pdf', name: 'PDF 工具', icon: '📄', order: 11 },
  { id: 'cert', name: '证书与安全', icon: '🔏', order: 12 },
  { id: 'doc', name: '文档处理', icon: '📑', order: 13 },
  { id: 'device', name: '设备与测量', icon: '📐', order: 14 },
  { id: 'media', name: '媒体播放', icon: '🎬', order: 15 },
  { id: 'loan', name: '贷款计算', icon: '🏦', order: 16 },
  { id: 'science', name: '科学', icon: '🔬', order: 17 },
  { id: MODULE_CATEGORY_ID, name: '站内模块', icon: '🧭', order: 90 },
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
