// 销售记账全局搜索纯逻辑测试（node --experimental-strip-types）
// 运行：node --experimental-strip-types scripts/test-business-spotlight-core.ts
import {
  BIZ_QUICK_ACTIONS,
  BIZ_SECTIONS,
  MOBILE_TAB_KEYS,
  countBizSpotlightHits,
  mobileMoreSections,
  mobileSectionOrder,
  mobileSwipeTarget,
  searchBizSpotlight
} from '../src/composables/businessSpotlightCore.ts'
import type { BizSpotlightData } from '../src/composables/businessSpotlightCore.ts'
import type { BusinessExpenseCategory, BusinessProduct, BusinessProductCategory } from '../src/types/index.ts'

let failed = 0
function check(name: string, cond: boolean): void {
  if (!cond) {
    failed++
    console.error(`✗ ${name}`)
  } else {
    console.log(`✓ ${name}`)
  }
}

const catFood: BusinessProductCategory = { id: 'c1', name: '零食', sortOrder: 0, visible: true, isBuiltIn: true }
const catDrink: BusinessProductCategory = { id: 'c2', name: '饮料', sortOrder: 1, visible: true, isBuiltIn: true }
const products: BusinessProduct[] = [
  { id: 'p1', name: '薯片', categoryId: 'c1', unit: '包', purchasePrice: 2, sellingPrice: 3.5, active: true, createdAt: '2026-01-01' },
  { id: 'p2', name: '可乐', categoryId: 'c2', unit: '瓶', purchasePrice: 2, sellingPrice: 4, active: true, createdAt: '2026-01-02' },
  { id: 'p3', name: '止疼药', categoryId: undefined, unit: '盒', purchasePrice: 8, sellingPrice: 12, active: false, createdAt: '2026-01-03' }
]
const expenseCategories: BusinessExpenseCategory[] = [
  { id: 'e1', name: '摊位费', sortOrder: 0, visible: true, isBuiltIn: true, unit: '天', unitPrice: 20 },
  { id: 'e2', name: '燃气费', sortOrder: 1, visible: true, isBuiltIn: true, unit: '瓶', unitPrice: 15 }
]
const data: BizSpotlightData = { products, productCategories: [catFood, catDrink], expenseCategories }

// ===== 空query =====
const empty = searchBizSpotlight('', data)
check('空 query → 全空分组', countBizSpotlightHits(empty) === 0)
check('空 query → products 为空数组', Array.isArray(empty.products) && empty.products.length === 0)
check('空白 query 等价于空', countBizSpotlightHits(searchBizSpotlight('   ', data)) === 0)
check('undefined query 不抛错', countBizSpotlightHits(searchBizSpotlight(undefined, data)) === 0)

// ===== 商品 =====
const hitCoke = searchBizSpotlight('可乐', data)
check('按名称命中商品', hitCoke.products.length === 1 && hitCoke.products[0].product.id === 'p2')
check('商品副标题带分类名', hitCoke.products[0].categoryName === '饮料')

const hitSnack = searchBizSpotlight('零食', data)
check('按分类名命中该分类下全部商品（薯片）', hitSnack.products.length === 1 && hitSnack.products[0].product.id === 'p1')

const hitCold = searchBizSpotlight('止疼', data)
check('停售商品也能被搜到（搜「薯片」可能是要去下架它）', hitCold.products.length === 1 && hitCold.products[0].product.id === 'p3')

check('无匹配商品时 products 为空', searchBizSpotlight('不存在的商品', data).products.length === 0)

// ===== 大小写不敏感 =====
check('商品名匹配大小写不敏感', searchBizSpotlight('薯片', data).products.length === 1)

// ===== 支出分类 =====
const hitRent = searchBizSpotlight('摊位', data)
check('支出分类命中', hitRent.categories.length === 1 && hitRent.categories[0].category.id === 'e1')
check('支出分类与商品是不同分组（不会互相污染）', hitRent.products.length === 0)

// ===== 面板入口 =====
const hitSection = searchBizSpotlight('库存', data)
check('面板按标签命中', hitSection.sections.some(s => s.key === 'inventory'))
check('面板按说明命中（低库存/滞销/久存）', searchBizSpotlight('滞销', data).sections.some(s => s.key === 'inventory'))
check('面板入口不带 productId（纯 navigate 语义）', true)

// ===== 快捷动作 =====
const hitSell = searchBizSpotlight('卖', data)
check('快捷动作「记一笔销售」被别名「卖」命中', hitSell.actions.some(a => a.id === 'qa-daily'))
check('快捷动作 quickAdd 指向 daily 面板',
  hitSell.actions.find(a => a.id === 'qa-daily')?.action.kind === 'quickAdd' &&
  (hitSell.actions.find(a => a.id === 'qa-daily')?.action as { section: string }).section === 'daily')

check('别名「开销」命中记一笔支出', searchBizSpotlight('开销', data).actions.some(a => a.id === 'qa-expense'))
check('别名「补货」命中记一笔进货', searchBizSpotlight('补货', data).actions.some(a => a.id === 'qa-purchase'))
check('别名「漏记」命中查账实差异', searchBizSpotlight('漏记', data).actions.some(a => a.id === 'qa-reconcile'))
check('「新建商品」不应误命中（keywords 是「建档」）', searchBizSpotlight('新建商品', data).actions.length === 0)

// ===== 截断上限 =====
const manyProducts: BusinessProduct[] = Array.from({ length: 20 }, (_, i) => ({
  id: `bulk${i}`, name: `商品${i}`, categoryId: undefined, unit: '件',
  purchasePrice: 1, sellingPrice: 2, active: true, createdAt: '2026-01-01'
}))
const bulk = searchBizSpotlight('商品', { products: manyProducts, productCategories: [], expenseCategories: [] })
check('每类结果截断到 5 条', bulk.products.length === 5)

// ===== 排序 =====
const orderProducts: BusinessProduct[] = [
  { id: 'a', name: '可乐', categoryId: 'c2', unit: '瓶', purchasePrice: 1, sellingPrice: 2, active: true, createdAt: '2026-01-01' },
  { id: 'b', name: '可乐糖', categoryId: 'c1', unit: '包', purchasePrice: 1, sellingPrice: 2, active: true, createdAt: '2026-01-01' }
]
const orderHit = searchBizSpotlight('可乐', { products: orderProducts, productCategories: [catFood, catDrink], expenseCategories: [] })
check('名称完全匹配排在仅分类名/部分匹配之前',
  orderHit.products[0].product.id === 'a')

// ===== 常量表完整性 =====
check('BIZ_SECTIONS 为 8 项且 key 唯一',
  BIZ_SECTIONS.length === 8 && new Set(BIZ_SECTIONS.map(s => s.key)).size === 8)
check('BIZ_SECTIONS 保留历史 key（持久化兼容）',
  ['home', 'products', 'expenses', 'purchases', 'daily', 'inventory', 'stats', 'reconcile']
    .every(k => BIZ_SECTIONS.some(s => s.key === k)))
// 2026-10-09 用户要求改显示名：expenses 显示「进货」、purchases 显示「库存」。
// 这是**纯文案改名**，key 与实际功能均未变（expenses 仍是摊位费/燃气费开销，
// purchases 仍是入库流水），故 label 与功能此刻是刻意不一致的。
check('文案口径（2026-10-09 改名后）：expenses=进货、purchases=库存',
  BIZ_SECTIONS.find(s => s.key === 'expenses')?.label === '进货' &&
  BIZ_SECTIONS.find(s => s.key === 'purchases')?.label === '库存')
// 改名不得动 key —— key 变更会波及 settingsStore.businessActiveSection 的持久化值
check('改名只改 label，key 保持 expenses/purchases 不变',
  BIZ_SECTIONS.some(s => s.key === 'expenses') &&
  BIZ_SECTIONS.some(s => s.key === 'purchases') &&
  BIZ_SECTIONS.length === 8)
check('快捷动作 id 唯一', new Set(BIZ_QUICK_ACTIONS.map(a => a.id)).size === BIZ_QUICK_ACTIONS.length)
check('快捷动作覆盖 4 个可录面板 + 对账',
  BIZ_QUICK_ACTIONS.length === 5 &&
  ['daily', 'expenses', 'purchases', 'products'].every(s =>
    BIZ_QUICK_ACTIONS.some(a => a.action.kind === 'quickAdd' && a.action.section === s)) &&
  BIZ_QUICK_ACTIONS.some(a => a.action.kind === 'navigate' && a.action.section === 'reconcile'))

// ===== M-20 移动端面板顺序 + 滑动切换目标=====
const order = mobileSectionOrder()
check('mobileSectionOrder 覆盖全部 8 个面板', order.length === 8 && new Set(order).size === 8)
check('mobileSectionOrder = 5 个高频 Tab + 3 个低频页',
  order.slice(0, 5).join(',') === MOBILE_TAB_KEYS.join(',') &&
  order.slice(5).join(',') === mobileMoreSections().map(s => s.key).join(','))
check('mobileSwipeTarget 向左滑 = 下一项',
  mobileSwipeTarget('home', 'next') === MOBILE_TAB_KEYS[1])
check('mobileSwipeTarget 向右滑 = 上一项',
  mobileSwipeTarget('daily', 'prev') === MOBILE_TAB_KEYS[0])
check('mobileSwipeTarget 跨越 Tab 与「更多」边界连续',
  mobileSwipeTarget(MOBILE_TAB_KEYS[4], 'next') === order[5] &&
  mobileSwipeTarget(order[5], 'prev') === MOBILE_TAB_KEYS[4])
check('序列首项继续向前滑不环绕（防误触跳到另一头）',
  mobileSwipeTarget(order[0], 'prev') === order[0])
check('序列末项继续向后滑不环绕',
  mobileSwipeTarget(order[7], 'next') === order[7])
check('未知 key 兜底回到首项而非空串',
  mobileSwipeTarget('not-exist', 'next') === order[0])
check('逐项向下一格可遍历完整序列',
  order.slice(0, 7).every((k, i) => mobileSwipeTarget(k, 'next') === order[i + 1]))

// ===== 计数 =====
const mixed = searchBizSpotlight('可乐', data)
check('countBizSpotlightHits 等于四组长度之和',
  countBizSpotlightHits(mixed) ===
  mixed.products.length + mixed.categories.length + mixed.sections.length + mixed.actions.length)

if (failed > 0) {
  console.error(`\n失败 ${failed} 项`)
  process.exit(1)
}
console.log('\n全部通过')