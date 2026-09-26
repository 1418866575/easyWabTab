// businessCore.ts 纯函数测试（node --experimental-strip-types 直跑，npm run test:business）
// T1-T24：归一化/种子分类/内置支出补回/分类 CRUD/库存/日收入/统计/排行/趋势坐标
// T25-T32：账本容器（默认名/同年唯一/旧扁平迁移/年份去重/空态/按年份并集合并）
// T33-T36：账本删除/清空守卫；T37-T41：进货关联支出、数量/单价联动、月度统计
// T42-T45：会员价归一化、进货批次 FIFO 剩余状态、未售完批次单价与自动均价
import assert from 'node:assert/strict'
import {
  addExpenseCategory,
  addProductCategory,
  avgUnsoldUnitPrice,
  calcBroughtOutTotals,
  calcBusinessStats,
  calcBusinessTrend,
  calcCategoryRanking,
  calcDailyCost,
  calcDailyLossAmount,
  calcDailyRevenue,
  calcInventory,
  calcMonthlyStats,
  calcProductRanking,
  calcPurchaseTotals,
  calcPurchaseTotal,
  calcPurchaseStockStatus,
  calcSoldTotals,
  businessTrendBars,
  compactAmount,
  clearLedgerRecords,
  createLedger,
  currentYear,
  deleteExpenseCategory,
  deleteLedger,
  deleteProductCategory,
  deriveQuantity,
  deriveUnitPrice,
  emptyBusinessData,
  expenseLinkOwners,
  filterPurchasesByCategory,
  findLedgerByYear,
  hasLedgerForYear,
  isCategoryNameTaken,
  isLedgerEmpty,
  isValidDateKey,
  ledgerDefaultName,
  ledgerDeleteGuard,
  ledgerRecordCounts,
  lowStockProducts,
  mergeBusinessStore,
  moveCategory,
  normalizeBusinessData,
  normalizeBusinessStore,
  normalizeExpenseCategories,
  normalizeExpenseIds,
  normalizeProductCategories,
  pickDefaultLedger,
  renameCategory,
  selectableExpenses,
  soldCount,
  sortedLedgers,
  sumExpenseAmounts,
  toggleCategoryVisible,
  unsoldPurchaseUnitPrices,
  visibleExpenseCategories,
  visibleProductCategories
} from '../src/composables/businessCore.ts'
import type { BusinessData, BusinessDailyRecord, BusinessExpense, BusinessProduct, BusinessPurchase } from '../src/types/index.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// T1 — emptyBusinessData：内置种子分类齐、空数组、默认设置
test('T1 emptyBusinessData seeds', () => {
  const d = emptyBusinessData()
  assert.equal(d.productCategories.length, 5)
  assert.equal(d.expenseCategories.length, 5)
  assert.deepEqual(d.expenseCategories.map(c => c.name), ['摊位费', '燃气费', '调料包装', '交通费', '其他'])
  assert.equal(d.products.length, 0)
  assert.equal(d.settings.lowStockThreshold, 20)
  assert.equal(d.settings.stallName, '')
})

// T2 — normalizeBusinessData：非对象/数组 → empty；字段非法剔除
test('T2 normalizeBusinessData degenerate', () => {
  assert.deepEqual(normalizeBusinessData(null).products, [])
  assert.equal(normalizeBusinessData([1, 2]).products.length, 0)
  const d = normalizeBusinessData({ products: [{ id: 'x', name: ' 苹果 ', sellingPrice: 'bad' }] })
  assert.equal(d.products[0].name, '苹果')
  assert.equal(d.products[0].sellingPrice, 0)
})

// T3 — normalizeExpenseCategories：内置缺失自动补回（不可删契约）；非法项剔除
test('T3 normalizeExpenseCategories builtin restore', () => {
  const out = normalizeExpenseCategories([{ id: 'expense-stall', name: '摊位', sortOrder: 1, visible: true, isBuiltIn: true }])
  assert.equal(out.length, 5)
  assert.ok(out.some(c => c.id === 'expense-gas'))
  const empty = normalizeExpenseCategories([])
  assert.equal(empty.length, 5, '空数组也应补回内置')
})

// T4 — normalizeProductCategories：空数组尊重存量（用户删光）；非数组 → 种子
test('T4 normalizeProductCategories', () => {
  assert.equal(normalizeProductCategories([]).length, 0)
  assert.equal(normalizeProductCategories(undefined).length, 5)
  const out = normalizeProductCategories([{ id: 'a', name: '  x ', visible: false }])
  assert.equal(out[0].name, 'x')
  assert.equal(out[0].visible, false)
})

// T5 — addProductCategory/addExpenseCategory：empty/duplicate/ok + 前缀
test('T5 add category', () => {
  const list = emptyBusinessData().productCategories
  assert.equal(addProductCategory(list, '  ').ok, false)
  assert.equal(addProductCategory(list, '小吃').reason, 'duplicate')
  const ok = addProductCategory(list, '玩具')
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.list.length, 6)
    assert.ok(ok.list[5].id.startsWith('bpc_'))
  }
  const elist = emptyBusinessData().expenseCategories
  const eok = addExpenseCategory(elist, '电费')
  if (eok.ok) assert.ok(eok.list[5].id.startsWith('bec_'))
})

// T6 — renameCategory：empty/duplicate/not-found/ok；支出内置可改名
test('T6 renameCategory', () => {
  const list = emptyBusinessData().productCategories
  assert.equal(renameCategory(list, 'nope', 'x').reason, 'not-found')
  assert.equal(renameCategory(list, 'product-snack', '  ').reason, 'empty')
  assert.equal(renameCategory(list, 'product-snack', '饮品').reason, 'duplicate')
  const ok = renameCategory(list, 'product-snack', '热食')
  if (ok.ok) assert.equal(ok.list[0].name, '热食')
  const elist = emptyBusinessData().expenseCategories
  const eok = renameCategory(elist, 'expense-stall', '场地费')
  if (eok.ok) assert.equal(eok.list[0].name, '场地费')
})

// T7 — toggleCategoryVisible + visible 过滤
test('T7 toggle visible', () => {
  const list = emptyBusinessData().expenseCategories
  const r = toggleCategoryVisible(list, 'expense-gas')
  if (r.ok) {
    assert.equal(r.list.find(c => c.id === 'expense-gas')!.visible, false)
    assert.equal(visibleExpenseCategories(r.list).length, 4)
  }
  assert.equal(visibleProductCategories(emptyBusinessData().productCategories).length, 5)
})

// T8 — moveCategory：boundary/not-found/中段对调 sortOrder
test('T8 moveCategory', () => {
  const list = emptyBusinessData().expenseCategories
  assert.equal(moveCategory(list, 'nope', 'up').reason, 'not-found')
  assert.equal(moveCategory(list, 'expense-stall', 'up').reason, 'boundary')
  const ok = moveCategory(list, 'expense-gas', 'up')
  if (ok.ok) {
    assert.deepEqual(ok.list.map(c => c.id)[0], 'expense-gas')
    assert.deepEqual(ok.list.map(c => c.id)[1], 'expense-stall')
  }
})

// T9 — deleteProductCategory：in-use/ok；deleteExpenseCategory：builtin/in-use/ok
test('T9 delete category', () => {
  const list = emptyBusinessData().productCategories
  assert.equal(deleteProductCategory(list, 'product-snack', true).reason, 'in-use')
  const ok = deleteProductCategory(list, 'product-snack', false)
  if (ok.ok) assert.equal(ok.list.length, 4)
  const elist = emptyBusinessData().expenseCategories
  assert.equal(deleteExpenseCategory(elist, 'expense-stall', false).reason, 'builtin')
  const custom = addExpenseCategory(elist, '电费')
  if (custom.ok) {
    assert.equal(deleteExpenseCategory(custom.list, custom.list[5].id, true).reason, 'in-use')
    const ok2 = deleteExpenseCategory(custom.list, custom.list[5].id, false)
    if (ok2.ok) assert.equal(ok2.list.length, 5)
  }
})

// T10 — isCategoryNameTaken / isValidDateKey
test('T10 helpers', () => {
  const list = emptyBusinessData().productCategories
  assert.equal(isCategoryNameTaken(' 小吃 ', 'x', list), true)
  assert.equal(isCategoryNameTaken('小吃', 'product-snack', list), false, '自身不判重')
  assert.equal(isValidDateKey('2026-08-15'), true)
  assert.equal(isValidDateKey('2026-13-01'), false)
  assert.equal(isValidDateKey('2026-8-1'), false)
})

// 构造一个满数据 BusinessData（复用各场景）
function buildData(): BusinessData {
  const base = emptyBusinessData()
  const products: BusinessProduct[] = [
    { id: 'p1', name: '烤肠', categoryId: 'product-snack', unit: '根', purchasePrice: 2, sellingPrice: 5, active: true, createdAt: '2026-08-01T00:00:00.000Z' },
    { id: 'p2', name: '柠檬水', categoryId: 'product-drink', unit: '杯', purchasePrice: 1, sellingPrice: 4, active: true, createdAt: '2026-08-01T00:00:00.000Z' }
  ]
  const purchases: BusinessPurchase[] = [
    { id: 'b1', productId: 'p1', quantity: 100, unitPrice: 2, total: 200, date: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z' },
    { id: 'b2', productId: 'p2', quantity: 50, unitPrice: 1, total: 50, date: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z' }
  ]
  const daily: BusinessDailyRecord[] = [
    {
      id: 'd1', date: '2026-08-02', totalRevenue: 100,
      items: [
        { productId: 'p1', broughtOut: 30, remaining: 5, loss: 1 },
        { productId: 'p2', broughtOut: 20, remaining: 0, loss: 0 }
      ],
      createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z'
    }
  ]
  return {
    ...base,
    products,
    purchases,
    dailyRecords: daily,
    expenses: [
      { id: 'e1', date: '2026-08-02', categoryId: 'expense-stall', amount: 30, createdAt: '2026-08-02T00:00:00.000Z' }
    ]
  }
}

// T11 — soldCount：负值钳 0、公式
test('T11 soldCount', () => {
  assert.equal(soldCount({ productId: 'x', broughtOut: 30, remaining: 5, loss: 1 }), 24)
  assert.equal(soldCount({ productId: 'x', broughtOut: 10, remaining: 12, loss: 0 }), 0)
})

// T12 — calcDailyRevenue：sold×售价、缺失商品计 0
test('T12 calcDailyRevenue', () => {
  const d = buildData()
  const items = d.dailyRecords[0].items
  // p1: 24×5=120；p2: 20×4=80 → 200（历史 totalRevenue 为示例值，此断言按公式重算）
  assert.equal(calcDailyRevenue(items, d.products), 200)
  assert.equal(calcDailyRevenue(items.concat([{ productId: 'ghost', broughtOut: 9, remaining: 0, loss: 0 }]), d.products), 200)
})

// T13 — calcInventory：进货 − 带出 + 剩余
test('T13 calcInventory', () => {
  const d = buildData()
  const stock = calcInventory(d.products, d.purchases, d.dailyRecords)
  assert.equal(stock.p1, 75) // 100 - 30 + 5
  assert.equal(stock.p2, 30) // 50 - 20 + 0
})

// T14 — calcBusinessStats：营业额/成本/利润/毛利率（成本 = 纯 COGS：Σ售出数量 × 进货价，不计支出）
test('T14 calcBusinessStats', () => {
  const d = buildData()
  // 营业额 100（示例落库值）；成本 = 售出 24×2 + 20×1 = 68（不再含进货 250 / 支出 30）
  const s = calcBusinessStats(d)
  assert.equal(s.revenue, 100)
  assert.equal(s.cost, 68)
  assert.equal(s.profit, 32)
  assert.equal(s.margin, 0.32)
  assert.equal(s.expenseTotal, 30) // Σ支出 e1=30
  const d2: BusinessData = { ...d, dailyRecords: [{ ...d.dailyRecords[0], totalRevenue: 400 }] }
  const s2 = calcBusinessStats(d2)
  assert.equal(s2.cost, 68)
  assert.equal(s2.profit, 332)
  assert.ok(Math.abs(s2.margin - 0.83) < 1e-9)
})

// T19 — calcBusinessStats 边界：缺失商品计 0、空数据成本 0 / 营业额 0 → 毛利率 0
test('T19 calcBusinessStats edge', () => {
  const d = buildData()
  // 幽灵商品（无对应产品记录）→ COGS 计 0
  const ghost = { ...d, dailyRecords: [{ ...d.dailyRecords[0], items: [...d.dailyRecords[0].items, { productId: 'ghost', broughtOut: 9, remaining: 0, loss: 0 }] }] }
  const s1 = calcBusinessStats(ghost)
  assert.equal(s1.cost, 68) // ghost 售出 9 个不计成本
  assert.equal(s1.profit, 32)
  const empty = calcBusinessStats(emptyBusinessData())
  assert.equal(empty.revenue, 0)
  assert.equal(empty.cost, 0)
  assert.equal(empty.profit, 0)
  assert.equal(empty.margin, 0) // 营业额 0 → 毛利率 0
  assert.equal(empty.expenseTotal, 0)
})

// T15 — lowStockProducts：阈值过滤 + 升序
test('T15 lowStockProducts', () => {
  const d = buildData()
  const low = lowStockProducts(d)
  // p2 库存 30 不小于阈值 20；p1 75 → 空
  assert.equal(low.length, 0)
  const d2: BusinessData = { ...d, settings: { ...d.settings, lowStockThreshold: 100 } }
  const low2 = lowStockProducts(d2)
  assert.equal(low2.length, 2)
  assert.equal(low2[0].product.id, 'p2') // 30 < 75 升序
  // 停售商品不参与预警：首个商品 active=false 副本（阈值仍 100）→ 仅剩 p2
  const dOff: BusinessData = { ...d2, products: [{ ...d.products[0], active: false }, d.products[1]] }
  const lowOff = lowStockProducts(dOff)
  assert.equal(lowOff.length, 1)
  assert.equal(lowOff[0].product.id, 'p2')
})

// T16 — calcProductRanking / calcCategoryRanking
test('T16 rankings', () => {
  const d = buildData()
  const prod = calcProductRanking(d)
  assert.equal(prod.length, 2)
  assert.equal(prod[0].productId, 'p1') // 120 > 80
  assert.equal(prod[0].sold, 24)
  const cat = calcCategoryRanking(d)
  assert.equal(cat[0].categoryId, 'product-snack')
  assert.equal(cat[0].revenue, 120)
  assert.equal(cat[1].name, '饮品')
})

// T17 — calcBusinessTrend：窗口/缺失补零/收摊记录口径（进货/支出不入趋势）
test('T17 calcBusinessTrend', () => {
  const d = buildData()
  const t = calcBusinessTrend(d, '2026-08-05', 7)
  assert.equal(t.length, 7)
  assert.equal(t[0].date, '2026-07-30')
  const day = t.find(x => x.date === '2026-08-02')!
  assert.equal(day.revenue, 100)
  assert.equal(day.cost, 68) // 当日收摊 COGS：售出 24×2 + 20×1 = 68（进货/支出不入趋势）
  assert.equal(day.profit, 32)
  const purchaseDay = t.find(x => x.date === '2026-08-01')! // 进货日无收摊记录 → 全 0
  assert.equal(purchaseDay.revenue, 0)
  assert.equal(purchaseDay.cost, 0)
  assert.equal(purchaseDay.profit, 0)
  const zero = t.find(x => x.date === '2026-07-30')!
  assert.equal(zero.revenue, 0)
  assert.equal(calcBusinessTrend(d, 'bad-date').length, 0)
})

// T18 — businessTrendBars：每日一柱堆叠分段/模式过滤/亏损悬挂/全零态/compactAmount
test('T18 businessTrendBars', () => {
  // 手搭序列隔离几何（不经 calcBusinessTrend）：零日 / 盈利日 / 亏损日
  const pt = (date: string, revenue: number, cost: number, profit: number) => ({ date, revenue, cost, profit })
  const series = [
    pt('2026-08-01', 0, 0, 0),
    pt('2026-08-02', 100, 68, 32), // 盈利：成本段(0→68)+利润段(68→100)，段高和=revenue
    pt('2026-08-03', 50, 68, -18) // 亏损：成本色收入段(0→50)+红色亏损悬挂零下(0→-18)
  ]
  // 几何基准（width300/height320/pad24）：dayW=(300-48)/3=84、barW=min(48,84*0.72)=48、x(i)=24+84i+18；
  // all 尺度：max=niceCeil(100)=100、min=-niceCeil(18)=-20 → yOf(v)=24+(100-v)/120*272、zeroY≈250.67
  const s1 = businessTrendBars(series, 300, 320, 'all')
  assert.ok(s1)
  assert.equal(s1!.gridlines.length, 5)
  assert.equal(s1!.maxY, 100)
  assert.equal(s1!.minY, -20)
  assert.equal(Math.round(s1!.zeroY * 100) / 100, 250.67)
  // 每日恰一柱位；零日无段无标签（labelValue 归 0）
  assert.equal(s1!.days.length, 3)
  assert.equal(s1!.days[0].segs.length, 0)
  assert.equal(s1!.days[0].labelValue, 0)
  // 盈利日：两段堆叠（成本琥珀底 + 利润绿顶），顶部单标签=营业额
  const d2 = s1!.days[1]
  assert.equal(d2.segs.length, 2)
  const costSeg = d2.segs.find(s => s.key === 'cost')!
  const profitSeg = d2.segs.find(s => s.key === 'profit')!
  assert.equal(costSeg.x, 126)
  assert.equal(costSeg.w, 48)
  assert.equal(Math.round(costSeg.y * 100) / 100, 96.53)
  assert.equal(Math.round(costSeg.h * 100) / 100, 154.13)
  assert.equal(profitSeg.y, 24)
  assert.equal(Math.round(profitSeg.h * 100) / 100, 72.53)
  assert.equal(d2.labelValue, 100)
  assert.equal(d2.labelY, 20)
  // 堆叠恒等：段高和=营业额高度（容差吸收双重舍入）
  assert.ok(Math.abs(costSeg.h + profitSeg.h - (s1!.zeroY - 24)) < 0.02)
  // 亏损日：收入全高成本色 + 亏损红段悬挂零下；标签在悬挂底下方
  const d3 = s1!.days[2]
  assert.equal(d3.segs.length, 2)
  const lossCost = d3.segs.find(s => s.key === 'cost')!
  const lossSeg = d3.segs.find(s => s.key === 'loss')!
  assert.equal(lossCost.x, 210)
  assert.equal(Math.round(lossCost.y * 100) / 100, 137.33)
  assert.equal(Math.round(lossCost.h * 100) / 100, 113.33)
  assert.equal(lossSeg.y, Math.round(s1!.zeroY * 100) / 100)
  assert.equal(Math.round(lossSeg.h * 100) / 100, 40.8)
  assert.equal(d3.labelValue, -18)
  assert.equal(Math.round(d3.labelY * 100) / 100, 302.47)
  // 营业额模式：非零日各一段 key revenue（模式自尺度 span=100 → 满值占满正区间）
  const s2 = businessTrendBars(series, 300, 320, 'revenue')
  const revSegs = s2!.days.flatMap(x => x.segs)
  assert.equal(revSegs.length, 2)
  assert.equal(revSegs.every(s => s.key === 'revenue'), true)
  assert.deepEqual(revSegs.map(s => s.value), [100, 50])
  assert.equal(Math.round(revSegs[0].h * 100) / 100, 272)
  // 利润模式：正值绿段 / 亏损红段（loss）
  const s3 = businessTrendBars(series, 300, 320, 'profit')
  const pSegs = s3!.days.flatMap(x => x.segs)
  assert.equal(pSegs.length, 2)
  assert.deepEqual(pSegs.map(s => s.key).sort(), ['loss', 'profit'])
  // 全零态：无段、allZero true
  const zeros = [pt('2026-08-01', 0, 0, 0), pt('2026-08-02', 0, 0, 0)]
  const s4 = businessTrendBars(zeros, 300, 320, 'all')
  assert.ok(s4)
  assert.equal(s4!.allZero, true)
  assert.equal(s4!.days.every(x => x.segs.length === 0), true)
  // 空序列/非法尺寸 → null
  assert.equal(businessTrendBars([], 900, 260, 'all'), null)
  assert.equal(businessTrendBars(series, 0, 320, 'all'), null)
  // compactAmount：万/k 缩写与负号
  assert.equal(compactAmount(200), '200')
  assert.equal(compactAmount(-12345), '-1.2万')
  assert.equal(compactAmount(1500), '1.5k')
})

// T20 — filterPurchasesByCategory：all 返回全部 / 按分类过滤 / 已删商品排除 / 未分类排除 / 空分类
test('T20 filterPurchasesByCategory', () => {
  const d = buildData()
  // 自定义错开日期的进货（避免 buildData 同日期 tie 顺序不确定）
  const mk = (id: string, productId: string, date: string): BusinessPurchase =>
    ({ id, productId, quantity: 10, unitPrice: 1, total: 10, date, createdAt: date + 'T00:00:00.000Z' })
  const purchases = [mk('b1', 'p1', '2026-08-01'), mk('b2', 'p2', '2026-08-02')]
  // 'all' → 全部 2 笔，日期降序（b2 08-02 在前）
  const all = filterPurchasesByCategory(purchases, d.products, 'all')
  assert.equal(all.length, 2)
  assert.equal(all[0].id, 'b2')
  // product-snack → 仅 b1（p1 烤肠/小吃）
  const snack = filterPurchasesByCategory(purchases, d.products, 'product-snack')
  assert.equal(snack.length, 1)
  assert.equal(snack[0].id, 'b1')
  // product-drink → 仅 b2（p2 柠檬水/饮品）
  const drink = filterPurchasesByCategory(purchases, d.products, 'product-drink')
  assert.equal(drink.length, 1)
  assert.equal(drink[0].id, 'b2')
  // 不存在的分类 → 空
  const none = filterPurchasesByCategory(purchases, d.products, 'product-fruit')
  assert.equal(none.length, 0)
  // 已删除商品的进货 → 仅 'all' 可见，分类过滤排除
  const withGhost = [...purchases, mk('b3', 'ghost', '2026-08-03')]
  const allGhost = filterPurchasesByCategory(withGhost, d.products, 'all')
  assert.equal(allGhost.length, 3, 'all 含已删除商品进货')
  const snackGhost = filterPurchasesByCategory(withGhost, d.products, 'product-snack')
  assert.equal(snackGhost.length, 1, '分类过滤排除已删除商品进货')
  // 无 categoryId 的商品进货 → 仅 'all' 可见
  const noCatProduct: BusinessProduct = { ...d.products[0], id: 'p3', name: '无分类', categoryId: undefined }
  const withNoCat = [...purchases, mk('b4', 'p3', '2026-08-04')]
  const allNoCat = filterPurchasesByCategory(withNoCat, [...d.products, noCatProduct], 'all')
  assert.equal(allNoCat.length, 3, 'all 含无分类商品进货')
  const snackNoCat = filterPurchasesByCategory(withNoCat, [...d.products, noCatProduct], 'product-snack')
  assert.equal(snackNoCat.length, 1, '分类过滤排除无分类商品进货')
  // 空数组 → []
  assert.equal(filterPurchasesByCategory([], [], 'all').length, 0)
})

// T21 — calcDailyCost：成本=Σ售出×进货价（纯 COGS）；缺失商品计 0；空数组
test('T21 calcDailyCost', () => {
  const d = buildData()
  const items = d.dailyRecords[0].items
  // p1: 售出24×进价2=48；p2: 售出20×进价1=20 → 68（与 calcBusinessStats 同口径）
  assert.equal(calcDailyCost(items, d.products), 68)
  // 缺失商品计 0（ghost 商品无进货价）
  assert.equal(
    calcDailyCost(items.concat([{ productId: 'ghost', broughtOut: 9, remaining: 0, loss: 0 }]), d.products),
    68
  )
  // 空数组 → 0
  assert.equal(calcDailyCost([], d.products), 0)
})

// T22 — calcDailyLossAmount：损耗金额=Σ损耗×售价；缺失商品计 0；全损耗
test('T22 calcDailyLossAmount', () => {
  const d = buildData()
  const items = d.dailyRecords[0].items
  // p1: 损耗1×售价5=5；p2: 损耗0×售价4=0 → 5
  assert.equal(calcDailyLossAmount(items, d.products), 5)
  // 缺失商品计 0
  assert.equal(
    calcDailyLossAmount([{ productId: 'ghost', broughtOut: 5, remaining: 0, loss: 3 }], d.products),
    0
  )
  // 全损耗：10×5=50
  assert.equal(
    calcDailyLossAmount([{ productId: 'p1', broughtOut: 10, remaining: 0, loss: 10 }], d.products),
    50
  )
})

// T23 — calcPurchaseTotals：按商品 Σ进货数量（多笔累加/无进货无键/空数组）
test('T23 calcPurchaseTotals', () => {
  const d = buildData()
  const totals = calcPurchaseTotals(d.purchases)
  // b1: p1×100；b2: p2×50
  assert.deepEqual(totals, { p1: 100, p2: 50 })
  // 无进货记录的商品不出现在结果键中
  assert.ok(!('p3' in totals))
  // 多笔累加：追加 p1 数量 25 → 合计 125
  const more = [...d.purchases, { id: 'b3', productId: 'p1', quantity: 25, unitPrice: 2, total: 50, date: '2026-08-03', createdAt: '2026-08-03T00:00:00.000Z' }]
  assert.equal(calcPurchaseTotals(more).p1, 125)
  // 空数组 → {}
  assert.deepEqual(calcPurchaseTotals([]), {})
})

// T24 — calcBroughtOutTotals：按商品 Σ带出数量（跨全部收摊记录累加/无记录无键/空数组）
test('T24 calcBroughtOutTotals', () => {
  const d = buildData()
  const totals = calcBroughtOutTotals(d.dailyRecords)
  // d1: p1 带出 30；p2 带出 20
  assert.deepEqual(totals, { p1: 30, p2: 20 })
  // 跨记录累加：第二条记录 p1 带出 5 → 35
  const second: BusinessDailyRecord = {
    id: 'd2', date: '2026-08-03', totalRevenue: 25,
    items: [{ productId: 'p1', broughtOut: 5, remaining: 0, loss: 0 }],
    createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z'
  }
  const both = calcBroughtOutTotals([...d.dailyRecords, second])
  assert.equal(both.p1, 35)
  // 无收摊记录的商品无键
  assert.ok(!('ghost' in both))
  // 空数组 → {}
  assert.deepEqual(calcBroughtOutTotals([]), {})
})

// ===== 账本容器（T25-T32） =====

// T25 — 账本基础纯函数：默认名 / 年份查找 / 倒序 / 默认选中（当前年优先，其次最大年份）
test('T25 ledger basics', () => {
  assert.equal(currentYear(new Date('2026-03-05T00:00:00Z')), 2026)
  assert.equal(ledgerDefaultName(2026), '2026年账本')
  const list = [
    { id: 'a', year: 2024, name: '2024年账本', createdAt: 'c', updatedAt: 'c', data: emptyBusinessData() },
    { id: 'b', year: 2026, name: '2026年账本', createdAt: 'c', updatedAt: 'c', data: emptyBusinessData() },
    { id: 'c', year: 2025, name: '2025年账本', createdAt: 'c', updatedAt: 'c', data: emptyBusinessData() }
  ]
  assert.deepEqual(sortedLedgers(list).map(l => l.year), [2026, 2025, 2024])
  assert.equal(hasLedgerForYear(list, 2025), true)
  assert.equal(hasLedgerForYear(list, 2027), false)
  assert.equal(findLedgerByYear(list, 2024)?.id, 'a')
  // 当前年存在 → 选当前年；不存在 → 年份最大者
  assert.equal(pickDefaultLedger(list, 2026)?.id, 'b')
  assert.equal(pickDefaultLedger(list, 2027)?.id, 'b')
  assert.equal(pickDefaultLedger([], 2027), undefined)
})

// T26 — createLedger：同年唯一（duplicate）/ 年份非法（invalid-year）/ 名称空白（empty-name）/ 名称留空自动默认
test('T26 createLedger uniqueness', () => {
  const empty = emptyBusinessData()
  const r1 = createLedger([], 2026)
  assert.equal(r1.ok, true)
  assert.equal(r1.ok && r1.ledgers.length, 1)
  assert.equal(r1.ok && r1.ledger.name, '2026年账本')
  assert.ok(r1.ok && r1.ledger.id.startsWith('bl_'))
  assert.deepEqual(r1.ok ? r1.ledger.data : null, empty)

  const list = r1.ok ? r1.ledgers : []
  const dup = createLedger(list, 2026)
  assert.deepEqual(dup, { ok: false, reason: 'duplicate' })
  assert.deepEqual(createLedger(list, 0), { ok: false, reason: 'invalid-year' })
  assert.deepEqual(createLedger(list, Number.NaN), { ok: false, reason: 'invalid-year' })
  assert.deepEqual(createLedger(list, 2027, '   '), { ok: false, reason: 'empty-name' })
  const named = createLedger(list, 2027, ' 夜市账本 ')
  assert.equal(named.ok && named.ledger.name, '夜市账本')
  assert.deepEqual(named.ok ? named.ledgers.map(l => l.year) : [], [2027, 2026])
  // 不改入参
  assert.equal(list.length, 1)
})

// T27 — normalizeBusinessStore：旧扁平 BusinessData（无 ledgers）整体迁入当年账本，历史数据不丢
test('T27 normalizeBusinessStore legacy migration', () => {
  const legacy = buildData()
  const store = normalizeBusinessStore(legacy)
  assert.equal(store.schemaVer, 2)
  assert.equal(store.ledgers.length, 1)
  assert.equal(store.ledgers[0].year, currentYear())
  assert.equal(store.ledgers[0].name, ledgerDefaultName(currentYear()))
  assert.equal(store.currentLedgerId, store.ledgers[0].id)
  assert.equal(store.ledgers[0].data.products.length, legacy.products.length)
  assert.equal(store.ledgers[0].data.dailyRecords.length, legacy.dailyRecords.length)
  // 空态兜底
  assert.deepEqual(normalizeBusinessStore(undefined), { schemaVer: 2, ledgers: [], currentLedgerId: '' })
  assert.deepEqual(normalizeBusinessStore(null), { schemaVer: 2, ledgers: [], currentLedgerId: '' })
  assert.deepEqual(normalizeBusinessStore([1, 2]), { schemaVer: 2, ledgers: [], currentLedgerId: '' })
})

// T28 — normalizeBusinessStore：年份去重（同年份保留首个）、年份非法丢弃、currentLedgerId 失效回落默认
test('T28 normalizeBusinessStore dedupe & fallback', () => {
  const store = normalizeBusinessStore({
    schemaVer: 2,
    currentLedgerId: 'ghost',
    ledgers: [
      { id: 'l1', year: 2026, name: 'A', createdAt: 'c1', updatedAt: 'c1', data: { products: [{ id: 'p1', name: '苹果' }] } },
      { id: 'l2', year: 2026, name: 'B', createdAt: 'c2', updatedAt: 'c2', data: { products: [{ id: 'p2', name: '香蕉' }] } },
      { id: 'l3', year: 1, name: '脏数据', createdAt: 'c3', updatedAt: 'c3', data: {} },
      { id: 'l4', year: 2025, name: 'C', createdAt: 'c4', updatedAt: 'c4', data: {} }
    ]
  })
  assert.deepEqual(store.ledgers.map(l => l.year), [2026, 2025])
  assert.equal(store.ledgers[0].id, 'l1')
  assert.equal(store.ledgers[0].name, 'A')
  // currentLedgerId 无效 → 回落当前年/最大年份账本
  assert.equal(store.currentLedgerId, 'l1')
  const keep = normalizeBusinessStore({ schemaVer: 2, currentLedgerId: 'l4', ledgers: [{ id: 'l4', year: 2025, name: 'C' }] })
  assert.equal(keep.currentLedgerId, 'l4')
})

// T29 — isLedgerEmpty：空账本 vs 有任一业务数据
test('T29 isLedgerEmpty', () => {
  assert.equal(isLedgerEmpty(emptyBusinessData()), true)
  const d = buildData()
  assert.equal(isLedgerEmpty(d), false)
  assert.equal(isLedgerEmpty({ ...emptyBusinessData(), expenses: d.expenses }), false)
})

// T30 — mergeBusinessStore：同年不同 id（两台设备各自创建）合并为一个账本，业务数据并集
test('T30 mergeBusinessStore same year different id', () => {
  const local = normalizeBusinessStore({
    schemaVer: 2, currentLedgerId: 'L2026',
    ledgers: [{ id: 'L2026', year: 2026, name: '本机账本', createdAt: '2026-01-01', updatedAt: '2026-05-01', data: { products: [{ id: 'p1', name: '苹果', sellingPrice: 5, purchasePrice: 3, unit: '斤', active: true }] } }]
  })
  const remote = normalizeBusinessStore({
    schemaVer: 2, currentLedgerId: 'R2026',
    ledgers: [{ id: 'R2026', year: 2026, name: '云端账本', createdAt: '2026-02-01', updatedAt: '2026-04-01', data: { products: [{ id: 'p2', name: '香蕉', sellingPrice: 4, purchasePrice: 2, unit: '斤', active: true }] } }]
  })
  const merged = mergeBusinessStore(local, remote)
  assert.equal(merged.ledgers.length, 1, '同年账本必须合并为一个')
  const l = merged.ledgers[0]
  assert.equal(l.year, 2026)
  assert.equal(l.id, 'L2026', '外壳取本地（本地优先）')
  assert.equal(l.name, '本机账本')
  assert.equal(l.createdAt, '2026-01-01')
  assert.equal(l.updatedAt, '2026-05-01')
  assert.deepEqual(l.data.products.map(p => p.id).sort(), ['p1', 'p2'])
  assert.equal(merged.currentLedgerId, 'L2026')
})

// T31 — mergeBusinessStore：不同年份取并集并按年份倒序；本地无选中时回落默认账本
test('T31 mergeBusinessStore union & order', () => {
  const local = normalizeBusinessStore({
    schemaVer: 2, currentLedgerId: '',
    ledgers: [
      { id: 'L24', year: 2024, name: '2024', createdAt: 'c', updatedAt: 'c', data: {} },
      { id: 'L26', year: 2026, name: '2026', createdAt: 'c', updatedAt: 'c', data: {} }
    ]
  })
  const remote = normalizeBusinessStore({
    schemaVer: 2, currentLedgerId: 'R25',
    ledgers: [{ id: 'R25', year: 2025, name: '2025', createdAt: 'c', updatedAt: 'c', data: {} }]
  })
  const merged = mergeBusinessStore(local, remote)
  assert.deepEqual(merged.ledgers.map(l => l.year), [2026, 2025, 2024])
  assert.deepEqual(merged.ledgers.map(l => l.id), ['L26', 'R25', 'L24'])
  assert.equal(merged.currentLedgerId, 'L26', '本地未选中 → 远端 R25 存在但优先回落默认（当前年/最大年份）')
  // 空对空
  assert.deepEqual(mergeBusinessStore(undefined, undefined), { schemaVer: 2, ledgers: [], currentLedgerId: '' })
})

// T32 — mergeBusinessStore：云端旧信封（扁平 BusinessData）→ 迁入当年账本后与本地同年账本合并，不丢数据
test('T32 mergeBusinessStore legacy envelope', () => {
  const legacy = buildData()
  const local = normalizeBusinessStore({
    schemaVer: 2, currentLedgerId: 'L',
    ledgers: [{ id: 'L', year: currentYear(), name: '本机', createdAt: 'c', updatedAt: 'c', data: { products: [{ id: 'mine', name: '自有商品', sellingPrice: 1, purchasePrice: 1, unit: '件', active: true }] } }]
  })
  const merged = mergeBusinessStore(local, legacy)
  assert.equal(merged.ledgers.length, 1)
  const ids = merged.ledgers[0].data.products.map(p => p.id)
  assert.ok(ids.includes('mine'), '本地商品保留')
  assert.ok(ids.includes('p1'), '云端旧信封商品迁入')
  assert.equal(merged.ledgers[0].id, 'L')
  assert.equal(merged.currentLedgerId, 'L')
})

// T33 — ledgerRecordCounts：商品/进货/收摊/支出条数统计（删除前的关联数据提示口径）
test('T33 ledgerRecordCounts', () => {
  const d = buildData()
  const c = ledgerRecordCounts(d)
  assert.equal(c.products, d.products.length)
  assert.equal(c.purchases, d.purchases.length)
  assert.equal(c.dailyRecords, d.dailyRecords.length)
  assert.equal(c.expenses, d.expenses.length)
  assert.deepEqual(ledgerRecordCounts(undefined), { products: 0, purchases: 0, dailyRecords: 0, expenses: 0 })
  assert.deepEqual(ledgerRecordCounts(emptyBusinessData()), { products: 0, purchases: 0, dailyRecords: 0, expenses: 0 })
})

// T34 — ledgerDeleteGuard：不存在 / 最后一个 / 当前正在使用 均禁止删除
test('T34 ledgerDeleteGuard', () => {
  const list = [
    { id: 'a', year: 2026, name: 'A', createdAt: 'c', updatedAt: 'c', data: emptyBusinessData() },
    { id: 'b', year: 2025, name: 'B', createdAt: 'c', updatedAt: 'c', data: emptyBusinessData() }
  ]
  assert.equal(ledgerDeleteGuard(list, 'ghost', 'a'), 'not-found')
  // 当前正在使用的账本不可删
  assert.equal(ledgerDeleteGuard(list, 'a', 'a'), 'is-current')
  // 非当前账本可删
  assert.equal(ledgerDeleteGuard(list, 'b', 'a'), 'ok')
  // 仅剩一个账本时（无论是否当前）都不可删
  assert.equal(ledgerDeleteGuard([list[0]], 'a', 'a'), 'last-one')
  assert.equal(ledgerDeleteGuard([list[0]], 'a', ''), 'last-one')
  // 未选中任何账本时不因 is-current 拦截
  assert.equal(ledgerDeleteGuard(list, 'a', ''), 'ok')
})

// T35 — clearLedgerRecords：清空进货/收摊/支出流水，保留商品、分类与账本设置
test('T35 clearLedgerRecords', () => {
  const d = buildData()
  const list = [{ id: 'a', year: 2026, name: 'A', createdAt: 'c', updatedAt: 'c', data: d }]
  const r = clearLedgerRecords(list, 'a', '2026-09-26T00:00:00.000Z')
  assert.equal(r.ok, true)
  const ledger = r.ok ? r.ledger : null
  assert.ok(ledger)
  assert.equal(ledger?.data.purchases.length, 0)
  assert.equal(ledger?.data.dailyRecords.length, 0)
  assert.equal(ledger?.data.expenses.length, 0)
  assert.equal(ledger?.data.products.length, d.products.length, '商品是主数据，应保留')
  assert.equal(ledger?.data.productCategories.length, d.productCategories.length)
  assert.equal(ledger?.data.settings.stallName, d.settings.stallName)
  assert.equal(ledger?.updatedAt, '2026-09-26T00:00:00.000Z')
  // 不改入参
  assert.equal(list[0].data.purchases.length, d.purchases.length)
  // 账本不存在
  assert.deepEqual(clearLedgerRecords(list, 'ghost'), { ok: false, reason: 'not-found' })
})

// T36 — deleteLedger：连账本一并删除并按年份倒序；守卫拦截时返回原因
test('T36 deleteLedger', () => {
  const list = [
    { id: 'a', year: 2026, name: 'A', createdAt: 'c', updatedAt: 'c', data: emptyBusinessData() },
    { id: 'b', year: 2025, name: 'B', createdAt: 'c', updatedAt: 'c', data: emptyBusinessData() },
    { id: 'c', year: 2024, name: 'C', createdAt: 'c', updatedAt: 'c', data: emptyBusinessData() }
  ]
  const r = deleteLedger(list, 'c', 'a')
  assert.equal(r.ok, true)
  assert.deepEqual(r.ok ? r.ledgers.map(l => l.year) : [], [2026, 2025])
  assert.equal(r.ok ? r.ledger.id : '', 'c')
  // 不改入参
  assert.equal(list.length, 3)
  // 守卫拦截
  assert.deepEqual(deleteLedger(list, 'a', 'a'), { ok: false, reason: 'is-current' })
  assert.deepEqual(deleteLedger(list, 'ghost', 'a'), { ok: false, reason: 'not-found' })
  assert.deepEqual(deleteLedger([list[0]], 'a', 'a'), { ok: false, reason: 'last-one' })
})

// T37 — 进货 ↔ 支出关联：金额汇总与 id 归一化
test('T37 expense link sum & normalize', () => {
  const expenses: BusinessExpense[] = [
    { id: 'e1', date: '2026-08-01', categoryId: 'expense-stall', amount: 30, createdAt: 'c' },
    { id: 'e2', date: '2026-08-02', categoryId: 'expense-gas', amount: 12.5, createdAt: 'c' },
    { id: 'e3', date: '2026-08-03', categoryId: 'expense-other', amount: 7.25, createdAt: 'c' }
  ]
  assert.equal(sumExpenseAmounts(expenses, ['e1', 'e3']), 37.25)
  assert.equal(sumExpenseAmounts(expenses, []), 0)
  assert.equal(sumExpenseAmounts(expenses, ['ghost']), 0)
  assert.equal(sumExpenseAmounts([], ['e1']), 0)
  // 去重后只算一次
  assert.equal(sumExpenseAmounts(expenses, ['e1', 'e1']), 30)
  // id 归一化：去空、去重、过滤非字符串
  assert.deepEqual(normalizeExpenseIds(['e1', 'e1', '', null, 'e2']), ['e1', 'e2'])
  assert.deepEqual(normalizeExpenseIds(undefined), [])
  assert.deepEqual(normalizeExpenseIds('e1'), [])
})

// T38 — selectableExpenses：已被其它进货关联的支出带 linkedPurchaseId；编辑自身时不算冲突
test('T38 selectableExpenses occupancy', () => {
  const d = buildData()
  const expenses: BusinessExpense[] = [
    { id: 'e1', date: '2026-08-02', categoryId: 'expense-stall', amount: 30, createdAt: 'c' },
    { id: 'e2', date: '2026-08-05', categoryId: 'expense-gas', amount: 12, createdAt: 'c' }
  ]
  const purchases: BusinessPurchase[] = [
    { id: 'b1', productId: 'p1', quantity: 10, unitPrice: 2, total: 20, date: '2026-08-01', expenseIds: ['e1'], createdAt: 'c' },
    { id: 'b2', productId: 'p2', quantity: 5, unitPrice: 1, total: 5, date: '2026-08-01', createdAt: 'c' }
  ]
  // 新建态：e1 已被 b1 占用 → 不可选
  const opts = selectableExpenses(expenses, purchases, null)
  assert.equal(opts.length, 2)
  assert.deepEqual(opts.map(o => o.expense.date), ['2026-08-05', '2026-08-02'], '按日期倒序')
  assert.equal(opts.find(o => o.expense.id === 'e1')?.linkedPurchaseId, 'b1')
  assert.equal(opts.find(o => o.expense.id === 'e2')?.linkedPurchaseId, undefined)
  // 编辑 b1 自身：e1 的占用者是 b1 → 不算冲突（仍可选，且保持已勾选）
  const editOpts = selectableExpenses(expenses, purchases, 'b1')
  assert.equal(editOpts.find(o => o.expense.id === 'e1')?.linkedPurchaseId, undefined)
  // 编辑 b2：e1 仍被 b1 占用
  const editB2 = selectableExpenses(expenses, purchases, 'b2')
  assert.equal(editB2.find(o => o.expense.id === 'e1')?.linkedPurchaseId, 'b1')
  // 归属表
  assert.equal(expenseLinkOwners(purchases).get('e1'), 'b1')
  assert.equal(expenseLinkOwners(d.purchases).size, 0)
})

// T39 — 数量/单价双向联动：合计为 0 或除零 → null（不产生 NaN/Infinity）
test('T39 derive unit price & quantity', () => {
  assert.equal(deriveUnitPrice(100, 4), 25)
  assert.equal(deriveUnitPrice(10, 3), 3.33, '两位小数四舍五入')
  assert.equal(deriveUnitPrice(0, 4), null, '合计为 0 → 不算')
  assert.equal(deriveUnitPrice(100, 0), null, '数量为 0（除零）→ 不算')
  assert.equal(deriveUnitPrice(-100, 4), null, '负数合计 → 不算')
  assert.equal(deriveQuantity(100, 25), 4)
  assert.equal(deriveQuantity(100, 3), 33, '取整')
  assert.equal(deriveQuantity(0.4, 3), 1, '至少 1')
  assert.equal(deriveQuantity(0, 25), null, '合计为 0 → 不算')
  assert.equal(deriveQuantity(100, 0), null, '单价为 0（除零）→ 不算')
  assert.equal(deriveQuantity(-100, 25), null, '负数合计 → 不算')
})

// T40 — calcPurchaseTotal：未关联支出时的常规合计（数量取整、单价钳 0、两位小数）
test('T40 calcPurchaseTotal', () => {
  assert.equal(calcPurchaseTotal(3, 2.5), 7.5)
  assert.equal(calcPurchaseTotal(3.7, 2), 6, '数量向下取整')
  assert.equal(calcPurchaseTotal(-5, 2), 0, '负数量钳 0')
  assert.equal(calcPurchaseTotal(3, -2), 0, '负单价钳 0')
  // 两位小数（7 × 1.005 = 7.035，二进制浮点四舍五入后为 7.03）
  assert.equal(calcPurchaseTotal(7, 1.005), 7.03)
  assert.equal(calcPurchaseTotal(9, 1.05), 9.45)
})

// T41 — calcMonthlyStats：12 个月全量返回、严格按年份不跨年、无数据月份为 0
test('T41 calcMonthlyStats', () => {
  const base = emptyBusinessData()
  const data: BusinessData = {
    ...base,
    products: [{ id: 'p1', name: '烤肠', unit: '根', purchasePrice: 2, sellingPrice: 5, active: true, createdAt: 'c' }],
    dailyRecords: [
      { id: 'd1', date: '2026-03-05', totalRevenue: 100, items: [{ productId: 'p1', broughtOut: 20, remaining: 0, loss: 0 }], transactionCount: 4, createdAt: 'c', updatedAt: 'c' },
      { id: 'd2', date: '2026-03-20', totalRevenue: 50, items: [{ productId: 'p1', broughtOut: 10, remaining: 0, loss: 0 }], transactionCount: 2, createdAt: 'c', updatedAt: 'c' },
      { id: 'd3', date: '2025-12-31', totalRevenue: 999, items: [], createdAt: 'c', updatedAt: 'c' },
      { id: 'd4', date: '2027-01-01', totalRevenue: 888, items: [], createdAt: 'c', updatedAt: 'c' }
    ],
    expenses: [
      { id: 'e1', date: '2026-03-05', categoryId: 'expense-stall', amount: 30, createdAt: 'c' },
      { id: 'e2', date: '2025-12-31', categoryId: 'expense-stall', amount: 77, createdAt: 'c' }
    ]
  }
  const stats = calcMonthlyStats(data, 2026)
  assert.equal(stats.length, 12, '恒返回 12 个月')
  assert.deepEqual(stats.map(s => s.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  assert.equal(stats[0].label, '1月')
  // 3 月：营业额 150、笔数 6、天数 2、支出 30
  const march = stats[2]
  assert.equal(march.revenue, 150)
  assert.equal(march.transactionCount, 6)
  assert.equal(march.days, 2)
  assert.equal(march.expense, 30)
  // 成本 = 售出 30 × 进价 2 = 60 → 利润 90
  assert.equal(march.cost, 60)
  assert.equal(march.profit, 90)
  // 无数据月份全 0
  const jan = stats[0]
  assert.deepEqual(
    { revenue: jan.revenue, cost: jan.cost, profit: jan.profit, expense: jan.expense, transactionCount: jan.transactionCount, days: jan.days },
    { revenue: 0, cost: 0, profit: 0, expense: 0, transactionCount: 0, days: 0 }
  )
  // 不跨年：2025-12-31 / 2027-01-01 的记录与支出均不计入
  assert.equal(stats.reduce((s, m) => s + m.revenue, 0), 150)
  assert.equal(stats.reduce((s, m) => s + m.expense, 0), 30)
  // 空数据 → 12 个月全 0
  const empty = calcMonthlyStats(emptyBusinessData(), 2026)
  assert.equal(empty.length, 12)
  assert.equal(empty.every(m => m.revenue === 0 && m.expense === 0 && m.days === 0), true)
})

// T42 — 会员价归一化：合法值保留两位小数；负数/NaN/非数字按「未设置」剔除
test('T42 会员价 normalize', () => {
  const d = normalizeBusinessData({
    products: [
      { id: 'p1', name: '烤肠', unit: '根', purchasePrice: 2, sellingPrice: 5, memberPrice: 4.5, active: true },
      { id: 'p2', name: '可乐', unit: '瓶', purchasePrice: 1.5, sellingPrice: 3, memberPrice: -1, active: true },
      { id: 'p3', name: '面包', unit: '个', purchasePrice: 3, sellingPrice: 6, memberPrice: 'x', active: true }
    ]
  })
  assert.equal(d.products[0].memberPrice, 4.5)
  assert.equal(d.products[1].memberPrice, undefined, '负数会员价按未设置')
  assert.equal(d.products[2].memberPrice, undefined, '非数字会员价按未设置')
  const rounded = normalizeBusinessData({
    products: [{ id: 'p4', name: '糖', unit: '包', purchasePrice: 1, sellingPrice: 2, memberPrice: 1.555, active: true }]
  })
  assert.equal(rounded.products[0].memberPrice, 1.56, '会员价保留两位小数')
})

// T43 — calcSoldTotals / calcPurchaseStockStatus：先进先出，最旧批次优先被售出
test('T43 进货批次 FIFO 剩余状态', () => {
  const purchases: BusinessPurchase[] = [
    { id: 'b1', productId: 'p1', quantity: 10, unitPrice: 2, total: 20, date: '2026-01-01', createdAt: 'a' },
    { id: 'b2', productId: 'p1', quantity: 10, unitPrice: 3, total: 30, date: '2026-02-01', createdAt: 'b' },
    { id: 'b3', productId: 'p2', quantity: 5, unitPrice: 1, total: 5, date: '2026-01-05', createdAt: 'c' }
  ]
  const dailyRecords: BusinessDailyRecord[] = [
    // p1 售出 12：带出 12 − 剩余 0 − 损耗 0
    { id: 'd1', date: '2026-03-01', items: [{ productId: 'p1', broughtOut: 12, remaining: 0, loss: 0 }], totalRevenue: 60, createdAt: 'x', updatedAt: 'x' }
  ]
  const sold = calcSoldTotals(dailyRecords)
  assert.equal(sold['p1'], 12)
  assert.equal(sold['p2'], undefined)
  const st = calcPurchaseStockStatus(purchases, dailyRecords)
  // 最旧批次 b1（10）被完全消耗 → 已售完
  assert.equal(st.b1.soldOut, true)
  assert.equal(st.b1.sold, 10)
  assert.equal(st.b1.remaining, 0)
  assert.equal(st.b1.isOldest, true)
  // 次旧批次 b2 只卖出 2 → 未售完，剩 8
  assert.equal(st.b2.soldOut, false)
  assert.equal(st.b2.sold, 2)
  assert.equal(st.b2.remaining, 8)
  assert.equal(st.b2.isOldest, false)
  // 其它商品无售出 → 未售完且全量剩余
  assert.equal(st.b3.soldOut, false)
  assert.equal(st.b3.remaining, 5)
  assert.equal(st.b3.isOldest, true)
  // 售出超过进货总量：全部批次售完，剩余不为负
  const over: BusinessDailyRecord[] = [
    { id: 'd2', date: '2026-04-01', items: [{ productId: 'p1', broughtOut: 99, remaining: 0, loss: 0 }], totalRevenue: 0, createdAt: 'x', updatedAt: 'x' }
  ]
  const st2 = calcPurchaseStockStatus(purchases, over)
  assert.equal(st2.b1.remaining, 0)
  assert.equal(st2.b2.remaining, 0)
  assert.equal(st2.b2.soldOut, true)
})

// T44 — unsoldPurchaseUnitPrices：只取未售完批次的单价（FIFO 顺序）
test('T44 未售完批次单价列表', () => {
  const purchases: BusinessPurchase[] = [
    { id: 'b1', productId: 'p1', quantity: 10, unitPrice: 2, total: 20, date: '2026-01-01', createdAt: 'a' },
    { id: 'b2', productId: 'p1', quantity: 10, unitPrice: 4, total: 40, date: '2026-02-01', createdAt: 'b' }
  ]
  const none: BusinessDailyRecord[] = []
  assert.deepEqual(unsoldPurchaseUnitPrices(purchases, none, 'p1'), [2, 4])
  const some: BusinessDailyRecord[] = [
    { id: 'd1', date: '2026-03-01', items: [{ productId: 'p1', broughtOut: 10, remaining: 0, loss: 0 }], totalRevenue: 50, createdAt: 'x', updatedAt: 'x' }
  ]
  assert.deepEqual(unsoldPurchaseUnitPrices(purchases, some, 'p1'), [4], '最旧批次售完后只剩 b2')
  assert.deepEqual(unsoldPurchaseUnitPrices(purchases, some, 'p9'), [])
})

// T45 — avgUnsoldUnitPrice：未售完批次单价简单平均（两位小数）；全售完/无进货 → null
test('T45 进货价自动均价', () => {
  const purchases: BusinessPurchase[] = [
    { id: 'b1', productId: 'p1', quantity: 10, unitPrice: 2, total: 20, date: '2026-01-01', createdAt: 'a' },
    { id: 'b2', productId: 'p1', quantity: 10, unitPrice: 3, total: 30, date: '2026-02-01', createdAt: 'b' },
    { id: 'b3', productId: 'p1', quantity: 10, unitPrice: 4.1, total: 41, date: '2026-03-01', createdAt: 'c' }
  ]
  // 无收摊：三批都未售完 → (2 + 3 + 4.1) / 3 = 3.033… → 3.03
  assert.equal(avgUnsoldUnitPrice(purchases, [], 'p1'), 3.03)
  // 售出 10 → 最旧批次 b1 售完 → (3 + 4.1) / 2 = 3.55
  const sold10: BusinessDailyRecord[] = [
    { id: 'd1', date: '2026-04-01', items: [{ productId: 'p1', broughtOut: 10, remaining: 0, loss: 0 }], totalRevenue: 50, createdAt: 'x', updatedAt: 'x' }
  ]
  assert.equal(avgUnsoldUnitPrice(purchases, sold10, 'p1'), 3.55)
  // 售出 30（全部售完）→ null，沿用商品自身进货价
  const soldAll: BusinessDailyRecord[] = [
    { id: 'd2', date: '2026-05-01', items: [{ productId: 'p1', broughtOut: 30, remaining: 0, loss: 0 }], totalRevenue: 150, createdAt: 'x', updatedAt: 'x' }
  ]
  assert.equal(avgUnsoldUnitPrice(purchases, soldAll, 'p1'), null)
  assert.equal(avgUnsoldUnitPrice(purchases, [], 'nope'), null)
  // 损耗不计入售出：带出 10 / 损耗 10 → 售出 0，全部未售完
  const lossOnly: BusinessDailyRecord[] = [
    { id: 'd3', date: '2026-06-01', items: [{ productId: 'p1', broughtOut: 10, remaining: 0, loss: 10 }], totalRevenue: 0, createdAt: 'x', updatedAt: 'x' }
  ]
  assert.equal(avgUnsoldUnitPrice(purchases, lossOnly, 'p1'), 3.03)
})

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    passed++
    console.log('  ✓ ' + t.name)
  } catch (e) {
    failed++
    console.error('  ✗ ' + t.name)
    console.error(e)
  }
}
console.log('\n' + passed + '/' + tests.length + ' passed')
if (failed > 0) process.exit(1)
