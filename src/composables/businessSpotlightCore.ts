// 销售记账全局搜索 + 快捷动作纯逻辑（Alt+K 浮层的数据源，组件禁止内联过滤/排序）
// 零 vue/pinia/DOM 依赖（node --experimental-strip-types 可测）：searchBizSpotlight 只做过滤+打分+截断。
// 搜索域刻意收窄为「摆摊记账时真正会找的东西」：商品、支出分类、8 个面板入口、5 个快捷动作。
// 不搜索销售/进货/支出流水明细：这类数据量大且用户通常按日期浏览，Alt+K 只解决「跳到某个东西」。
import type { BusinessExpenseCategory, BusinessProduct, BusinessProductCategory } from '../types'

/** 每类结果上限（与个人工作台 spotlightCore.MAX_RESULTS 一致）。 */
export const MAX_RESULTS = 5

/** 销售台菜单项（视图层 SECTIONS 的唯一数据源；移动端 Tab / 桌面左树 / 搜索浮层共用）。 */
export interface BizSection {
  key: string
  icon: string
  label: string
  /** 面板职责一句话说明（搜索浮层副标题，帮助用户判断该不该点进去）。 */
  hint: string
}

/**
 * 8 个面板入口（固定顺序）。
 *
 * ⚠️ 2026-10-09 用户要求改显示名：expenses 显示「进货」、purchases 显示「库存」。
 * 注意 **label 已与实际功能不一致**：
 *   - expenses（摊位费/燃气费等开销）→ 显示「进货」
 *   - purchases（商品入库流水与进价）→ 显示「库存」
 * 这是刻意的纯文案改名，key 与功能均未变。下方 hint 仍描述真实功能，
 * 以免菜单上唯一的功能线索也一起丢失。日后若要名实相符，应改回 label 或重新映射 key。
 *
 * key 自诞生起未变，改 key 会波及 settingsStore.businessActiveSection 持久化值。
 */
export const BIZ_SECTIONS: readonly BizSection[] = [
  { key: 'home', icon: 'home', label: '首页', hint: '账本概览与待办' },
  { key: 'products', icon: 'products', label: '商品', hint: '商品档案与售价' },
  { key: 'expenses', icon: 'expenses', label: '进货', hint: '摊位费/燃气费等开销' },
  { key: 'purchases', icon: 'purchases', label: '库存', hint: '入库流水与进价' },
  { key: 'daily', icon: 'daily', label: '销售', hint: '每日销售流水' },
  { key: 'inventory', icon: 'inventory', label: '库存预警', hint: '低库存/滞销/久存' },
  { key: 'stats', icon: 'stats', label: '统计', hint: '趋势与毛利报表' },
  { key: 'reconcile', icon: 'ledger', label: '对账', hint: '账实差异核对' }
] as const

/** 搜索结果动作类型：navigate=切面板（可带商品过滤）；quickAdd=切面板并立即打开该面板的新增弹框。 */
export type BizSpotlightAction =
  | { kind: 'navigate'; section: string; productId?: string }
  | { kind: 'quickAdd'; section: string }

/**
 * 移动端底部 Tab 分区（M-06）：8 项全塞进底栏需横向滚动，用户难判断「当前在哪一屏」。
 * 收敛为 5 个高频入口（按日频次排序，拇指热区）+「更多」收纳 3 个低频分析页。
 * 桌面端左树仍用完整 BIZ_SECTIONS（桌面有空间，折叠态 56px 也够）。
 */
export const MOBILE_TAB_KEYS: readonly string[] = ['home', 'daily', 'purchases', 'expenses', 'products']

/** 「更多」弹层收纳的 panel（key 不在 MOBILE_TAB_KEYS 即属此类） */
export function mobileMoreSections(): BizSection[] {
  const tabs = new Set(MOBILE_TAB_KEYS)
  return BIZ_SECTIONS.filter(s => !tabs.has(s.key))
}

/**
 * 移动端面板的**线性顺序**（M-20，2026-10-07）。
 *
 * 底栏 Tab + 「更多」里的 panel 合成一条完整序列，供底部菜单左右滑动切换
 * （手势）与「当前项前后邻居」计算复用：手势滑动本质就是在这条线上移动一格。
 * 顺序 = 5 个高频 Tab（拇指区顺序）+ 3 个低频分析页（更多弹层内的顺序）。
 */
export function mobileSectionOrder(): string[] {
  return [...MOBILE_TAB_KEYS, ...mobileMoreSections().map(s => s.key)]
}

/**
 * 手势滑动后应切换到的面板 key（纯函数，便于单测）。
 *
 * @param current 当前面板 key
 * @param dir     滑动方向：'prev' 向左滑（看上一页）/ 'next' 向右滑（看下一页）
 * @returns 目标面板 key；已在序列首/尾且继续同向滑动时返回 current（不环绕，避免误触突然跳到另一头）
 */
export function mobileSwipeTarget(current: string, dir: 'prev' | 'next'): string {
  const order = mobileSectionOrder()
  const i = order.indexOf(current)
  // current 不在序列里（理论上不会发生，兜底回落到首项，避免返回空串）
  if (i < 0) return order[0] ?? current
  const next = dir === 'prev' ? i - 1 : i + 1
  if (next < 0 || next >= order.length) return current
  return order[next]
}

/** 快捷动作定义（search域之一：让「记一笔销售」这类高频操作从 3 步压到 1 步）。 */
export interface BizQuickAction {
  id: string
  label: string
  /** 匹配用的别名（用户搜「卖货」也能命中「记一笔销售」）。 */
  keywords: string[]
  icon: string
  action: BizSpotlightAction
}

/**
 * 5 个快捷动作：新增销售/支出/进货记录、新增商品、看对账。
 * quickAdd 走「先切面板 → 等面板挂载 → 调 startAdd」的两段式（见 BusinessView quickAddTarget）。
 */
export const BIZ_QUICK_ACTIONS: readonly BizQuickAction[] = [
  { id: 'qa-daily', label: '记一笔销售', keywords: ['卖', '卖货', '销售', '营业', '收款', '今日销售'], icon: 'daily', action: { kind: 'quickAdd', section: 'daily' } },
  { id: 'qa-expense', label: '记一笔支出', keywords: ['开销', '花费', '成本', '摊位费', '燃气', '支出'], icon: 'expenses', action: { kind: 'quickAdd', section: 'expenses' } },
  { id: 'qa-purchase', label: '记一笔进货', keywords: ['进货', '入库', '补货', '买货', '进价'], icon: 'purchases', action: { kind: 'quickAdd', section: 'purchases' } },
  { id: 'qa-product', label: '新增商品', keywords: ['商品', '新品', '建档', '上新'], icon: 'products', action: { kind: 'quickAdd', section: 'products' } },
  { id: 'qa-reconcile', label: '查账实差异', keywords: ['对账', '核对', '差异', '漏记', '平账'], icon: 'ledger', action: { kind: 'navigate', section: 'reconcile' } }
] as const

/** 商品搜索命中（productId 用于跳转时带过滤/高亮）。 */
export interface BizSpotlightProductHit {
  product: BusinessProduct
  categoryName: string
}

/** 支出分类命中（跳支出面板；分类 id 仅用于副标题展示，不做过滤——支出面板无分类过滤态）。 */
export interface BizSpotlightCategoryHit {
  category: BusinessExpenseCategory
}

/** 分组结果：每类 ≤ MAX_RESULTS 条。 */
export interface BizSpotlightGroups {
  products: BizSpotlightProductHit[]
  categories: BizSpotlightCategoryHit[]
  sections: BizSection[]
  actions: BizQuickAction[]
}

/** 搜索入参：仅商品与支出分类两类（面板与快捷动作是常量，直接参与过滤）。 */
export interface BizSpotlightData {
  products: BusinessProduct[]
  productCategories: BusinessProductCategory[]
  expenseCategories: BusinessExpenseCategory[]
}

/** 归一化 query：undefined/null/纯空白 → 空串；统一小写。 */
function normalizeQuery(query: string | undefined): string {
  return (query ?? '').trim().toLowerCase()
}

/** 大小写不敏感子串匹配；undefined 视为空串。 */
function has(text: string | undefined, q: string): boolean {
  return (text ?? '').toLowerCase().includes(q)
}

function emptyGroups(): BizSpotlightGroups {
  return { products: [], categories: [], sections: [], actions: [] }
}

/** 商品：名称 OR 分类名命中（停售商品也可搜到——搜「薯片」可能要的是去库存里下架它）。 */
function matchProducts(q: string, data: BizSpotlightData): BizSpotlightProductHit[] {
  const catName = new Map(data.productCategories.map(c => [c.id, c.name]))
  return data.products
    .filter(p => has(p.name, q) || has(catName.get(p.categoryId ?? ''), q))
    .map(p => ({ product: p, categoryName: catName.get(p.categoryId ?? '') || '未分类' }))
}

/** 支出分类：名称命中。 */
function matchCategories(q: string, data: BizSpotlightData): BizSpotlightCategoryHit[] {
  return data.expenseCategories.filter(c => has(c.name, q)).map(category => ({ category }))
}

/** 面板入口：标签或说明命中。 */
function matchSections(q: string): BizSection[] {
  return BIZ_SECTIONS.filter(s => has(s.label, q) || has(s.hint, q))
}

/** 快捷动作：标签 OR 别名命中。 */
function matchActions(q: string): BizQuickAction[] {
  return BIZ_QUICK_ACTIONS.filter(a => has(a.label, q) || a.keywords.some(k => has(k, q)))
}

/** 打分：标签命中 = 2，副字段（分类名/说明/别名）命中 = 1；同分按名称升序保证稳定可预期。 */
function scoreProducts(q: string, hits: BizSpotlightProductHit[]): BizSpotlightProductHit[] {
  return [...hits]
    .sort((a, b) => {
      const sa = has(a.product.name, q) ? 2 : 1
      const sb = has(b.product.name, q) ? 2 : 1
      return sb - sa || a.product.name.localeCompare(b.product.name, 'zh-CN')
    })
}

/**
 * 销售记账全局搜索：跨 4 类（商品/支出分类/面板入口/快捷动作）过滤、打分、每类截断 MAX_RESULTS。
 * 空/纯空白 query → 全空分组（不抛错）；大小写不敏感。
 */
export function searchBizSpotlight(query: string | undefined, data: BizSpotlightData): BizSpotlightGroups {
  const q = normalizeQuery(query)
  if (q === '') return emptyGroups()
  return {
    products: scoreProducts(q, matchProducts(q, data)).slice(0, MAX_RESULTS),
    categories: matchCategories(q, data).slice(0, MAX_RESULTS),
    sections: matchSections(q).slice(0, MAX_RESULTS),
    actions: matchActions(q).slice(0, MAX_RESULTS)
  }
}

/** 结果总数（供浮层判断空态）。 */
export function countBizSpotlightHits(groups: BizSpotlightGroups): number {
  return groups.products.length + groups.categories.length + groups.sections.length + groups.actions.length
}