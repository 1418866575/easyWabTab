/**
 * 分类归一化纯函数（零 Vue / Pinia 依赖，可被 node --experimental-strip-types 直测）
 *
 * 规则：
 * - 「站内模块」是专属分类：kind === 'module' 的工具自动归入该分类，
 *   工具元数据里无需手写 category，避免新增模块工具时漏配或错配。
 * - kind === 'internal'（站内自建）保持其业务分类（dev / data / media ...）。
 */

import type { ToolboxToolMeta } from '../types.ts'

/** 站内模块专属分类 id */
export const MODULE_CATEGORY_ID = 'site-module'

/** 归一化单条工具元数据：站内模块强制归入「站内模块」分类 */
export function normalizeToolMeta(meta: ToolboxToolMeta): ToolboxToolMeta {
  if (!meta) return meta
  if (meta.kind === 'module' && meta.category !== MODULE_CATEGORY_ID) {
    return { ...meta, category: MODULE_CATEGORY_ID }
  }
  return meta
}

/** 批量归一化（registry 扫描后统一调用） */
export function normalizeToolMetas(list: ToolboxToolMeta[]): ToolboxToolMeta[] {
  return (list || []).map(normalizeToolMeta)
}

/** 是否为站内模块专属分类 */
export function isModuleCategory(category: string): boolean {
  return category === MODULE_CATEGORY_ID
}
