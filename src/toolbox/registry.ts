/**
 * 工具注册表：自动扫描 tools/ 下的每个工具目录
 *
 * 约定：
 * - 每个工具 = tools/<id>/ 一个目录，目录内 index.ts 默认导出 ToolboxToolEntry
 * - 新增工具 = 新建一个目录（index.ts + 工具组件），本文件与页面均无需改动
 * - 工具组件为懒加载（() => import('./XxxTool.vue')），不进首屏包
 */

import type { ToolboxToolEntry, ToolboxToolMeta } from './types'
import { normalizeToolMeta } from './core/category'

const modules = import.meta.glob<{ default: ToolboxToolEntry }>('./tools/*/index.ts', { eager: true })

/**
 * 全部工具条目（按 order 排序）
 * 统一过一遍分类归一化：kind: 'module' 的工具自动归入「站内模块」分类。
 */
export const TOOLBOX_ENTRIES: ToolboxToolEntry[] = Object.values(modules)
  .map(m => m.default)
  .filter((e): e is ToolboxToolEntry => !!e && !!e.meta)
  .map(e => ({ ...e, meta: normalizeToolMeta(e.meta) }))
  .sort((a, b) => (a.meta?.order ?? 999) - (b.meta?.order ?? 999))

/** 全部工具元数据（列表渲染只用它） */
export const TOOLBOX_TOOLS: ToolboxToolMeta[] = TOOLBOX_ENTRIES.map(e => e.meta)

/** 按 id 取工具条目（含实现组件） */
export function getToolEntry(id: string): ToolboxToolEntry | undefined {
  return TOOLBOX_ENTRIES.find(e => e.meta.id === id)
}

/** 按 id 取工具元数据 */
export function getToolMeta(id: string): ToolboxToolMeta | undefined {
  const e = getToolEntry(id)
  return e ? e.meta : undefined
}
