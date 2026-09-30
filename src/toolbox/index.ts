/**
 * 工具箱模块对外出口
 *
 * 目录约定（用户要求）：
 * - 所有工具箱代码集中在 src/toolbox/ 一个目录下
 * - 每个工具单独一个子目录：src/toolbox/tools/<id>/{index.ts, XxxTool.vue}
 * - 新增工具 = 新建一个目录，注册表（registry.ts）自动扫描，页面零改动
 *
 * 注意：这里不导出 ToolboxView，避免把页面打进首屏包（由 router 懒加载引用）。
 */

export * from './types'
export * from './registry'
export * from './config/categories'
export * from './core/search'
export * from './core/rank'
export * from './core/highlight'
export * from './core/recent'
export * from './core/color'
export * from './core/csv'
export * from './core/diff'
export { useToolboxPrefs } from './prefs/useToolboxPrefs'
