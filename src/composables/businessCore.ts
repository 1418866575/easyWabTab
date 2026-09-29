// 摆摊进销存纯逻辑引擎（销售记账业务核心）
// 零 vue/pinia/DOM 依赖（node --experimental-strip-types 可测）：数据归一化/种子分类/双分类 CRUD
// 结果计算/库存/日收入/统计/排行/趋势坐标。组件与 store 禁止内联重算本模块公式。
import { DEFAULT_BUSINESS_EXPENSE_CATEGORIES, DEFAULT_BUSINESS_PRODUCT_CATEGORIES } from '../types/index.ts'
import type {
  BusinessDailyRecord,
  BusinessData,
  BusinessExpense,
  BusinessExpenseDaily,
  BusinessExpenseCategory,
  BusinessLedger,
  BusinessProduct,
  BusinessProductCategory,
  BusinessPurchase,
  BusinessSettings,
  BusinessStoreData,
  DailyRecordItem
} from '../types'
import { formatYuan } from './ledgerCore.ts'

// ===== 常量 =====

/** 支出内置分类 id（不可删；normalize 时缺失自动补回） */
export const BUSINESS_EXPENSE_BUILTIN_IDS = DEFAULT_BUSINESS_EXPENSE_CATEGORIES.map(c => c.id)

/** 商品分类 id 前缀 / 支出自定义分类 id 前缀 / 其余实体 id 前缀 */
export const ID_PREFIX = { product: 'bp_', productCat: 'bpc_', expense: 'be_', expenseCat: 'bec_', purchase: 'bpr_', daily: 'bd_', expenseDaily: 'bed_' } as const

/** 低库存预警阈值默认值 */
export const DEFAULT_LOW_STOCK_THRESHOLD = 20
/** 滞销预警默认天数（在售商品超过该天数无售出） */
export const DEFAULT_SLOW_MOVING_DAYS = 30
/** 久存批次预警默认天数（进货入库后仍未售完的天数） */
export const DEFAULT_AGING_BATCH_DAYS = 60

/** 存储结构版本：1 = 旧扁平 BusinessData；2 = 账本容器 BusinessStoreData */
export const BUSINESS_STORE_SCHEMA_VER = 2

/** 账本 id 前缀 */
export const LEDGER_ID_PREFIX = 'bl_'

/** 账本年份合法区间（防止手输异常年份） */
export const LEDGER_YEAR_MIN = 1970
export const LEDGER_YEAR_MAX = 9999

// ===== 工具 =====

/** 本地日期键 YYYY-MM-DD（防 UTC 偏移，仿 todoCore.localToday） */
export function localDateKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 日期键校验（正则 + 月 1-12/日 1-31） */
export function isValidDateKey(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const [, m, d] = date.split('-').map(Number)
  return m >= 1 && m <= 12 && d >= 1 && d <= 31
}

/** 金额格式化（复用记账 ledgerCore.formatYuan，含千分位两位小数） */
export const formatYuanOf = formatYuan

/** 分类名称唯一判定（trim 后大小写不敏感，与除自身外其他项比对） */
export function isCategoryNameTaken(name: string, id: string, list: { id: string; name: string }[]): boolean {
  const target = name.trim().toLowerCase()
  return list.some(c => c.id !== id && c.name.trim().toLowerCase() === target)
}

/** 生成本地唯一 id（前缀 + 时间戳 + 随机段；测试仅断言前缀） */
export function newId(prefix: string): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ===== 空数据 / 归一化 =====

/** 空数据（含内置种子分类；首次进入 / 备份缺失兜底） */
export function emptyBusinessData(): BusinessData {
  return {
    productCategories: DEFAULT_BUSINESS_PRODUCT_CATEGORIES.map(c => ({ ...c })),
    expenseCategories: DEFAULT_BUSINESS_EXPENSE_CATEGORIES.map(c => ({ ...c })),
    products: [],
    purchases: [],
    dailyRecords: [],
    expenseDailies: [],
    settings: {
      stallName: '',
      lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
      monthlyRevenueTarget: 0,
      slowMovingDays: DEFAULT_SLOW_MOVING_DAYS,
      agingBatchDays: DEFAULT_AGING_BATCH_DAYS
    }
  }
}

/** 归一化商品分类列表：非数组 → 默认种子；数组（含空数组）→ 逐项归一尊重存量（空 = 用户删光分类） */
export function normalizeProductCategories(raw: unknown): BusinessProductCategory[] {
  if (!Array.isArray(raw)) return DEFAULT_BUSINESS_PRODUCT_CATEGORIES.map(c => ({ ...c }))
  const out: BusinessProductCategory[] = []
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    if (typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !c.name.trim()) continue
    out.push({
      id: c.id,
      name: c.name.trim().slice(0, 20),
      sortOrder: typeof c.sortOrder === 'number' && Number.isFinite(c.sortOrder) ? c.sortOrder : out.length + 1,
      visible: c.visible !== false
    })
  }
  out.sort((a, b) => a.sortOrder - b.sortOrder)
  return out
}

/** 归一化支出分类列表：非数组 → 默认内置；内置 5 缺失自动补回（不可删契约）；自定义保留 */
export function normalizeExpenseCategories(raw: unknown): BusinessExpenseCategory[] {
  if (!Array.isArray(raw)) return DEFAULT_BUSINESS_EXPENSE_CATEGORIES.map(c => ({ ...c }))
  const out: BusinessExpenseCategory[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    if (typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !c.name.trim()) continue
    seen.add(c.id)
    out.push({
      id: c.id,
      name: c.name.trim().slice(0, 20),
      sortOrder: typeof c.sortOrder === 'number' && Number.isFinite(c.sortOrder) ? c.sortOrder : out.length + 1,
      visible: c.visible !== false,
      isBuiltIn: c.isBuiltIn === true || BUSINESS_EXPENSE_BUILTIN_IDS.includes(c.id),
      // 产品默认单位/单价（可选）：与 normExpense 同口径归一，非法/非正数 → undefined
      unit: typeof c.unit === 'string' && c.unit.trim() ? c.unit.trim().slice(0, EXPENSE_UNIT_MAX) : undefined,
      unitPrice: typeof c.unitPrice === 'number' && Number.isFinite(c.unitPrice) && c.unitPrice > 0 ? c.unitPrice : undefined,
      // 商品数量（可选）：正数才保留，否则 undefined（用于 单价 ÷ 商品数量 = 商品单价）
      productQuantity: typeof c.productQuantity === 'number' && Number.isFinite(c.productQuantity) && c.productQuantity > 0 ? c.productQuantity : undefined
    })
  }
  // 内置缺失补回（按默认序插到已有项之后，sortOrder 递增）
  let maxOrder = out.reduce((m, c) => Math.max(m, c.sortOrder), 0)
  for (const builtin of DEFAULT_BUSINESS_EXPENSE_CATEGORIES) {
    if (!seen.has(builtin.id)) {
      out.push({ ...builtin, sortOrder: ++maxOrder })
    }
  }
  out.sort((a, b) => a.sortOrder - b.sortOrder)
  return out
}

function numOf(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function normProduct(raw: unknown): BusinessProduct | null {
  if (raw === null || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || !p.name.trim()) return null
  return {
    id: p.id,
    name: p.name.trim().slice(0, 40),
    categoryId: typeof p.categoryId === 'string' && p.categoryId ? p.categoryId : undefined,
    unit: typeof p.unit === 'string' ? p.unit.trim().slice(0, BIZ_UNIT_MAX) || '件' : '件',
    purchasePrice: Math.max(0, numOf(p.purchasePrice)),
    sellingPrice: Math.max(0, numOf(p.sellingPrice)),
    // 会员价：可选字段，仅记录展示；非法值（负数/NaN/非数字）一律按「未设置」处理
    ...(typeof p.memberPrice === 'number' && Number.isFinite(p.memberPrice) && p.memberPrice >= 0
      ? { memberPrice: Math.round(p.memberPrice * 100) / 100 }
      : {}),
    active: p.active !== false,
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date(0).toISOString()
  }
}

function normPurchase(raw: unknown): BusinessPurchase | null {
  if (raw === null || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.id !== 'string' || !p.id || typeof p.productId !== 'string' || !p.productId) return null
  if (typeof p.date !== 'string' || !isValidDateKey(p.date)) return null
  const quantity = Math.max(0, numOf(p.quantity))
  const unitPrice = Math.max(0, numOf(p.unitPrice))
  const total = typeof p.total === 'number' && Number.isFinite(p.total) ? p.total : quantity * unitPrice
  return {
    id: p.id,
    productId: p.productId,
    quantity,
    unitPrice,
    total,
    // 进货优化：关联支出 id 列表（旧数据无该字段 → undefined，向后兼容）
    ...(Array.isArray(p.expenseIds)
      ? {
          expenseIds: Array.from(
            new Set((p.expenseIds as unknown[]).filter((x): x is string => typeof x === 'string' && !!x))
          )
        }
      : {}),
    date: p.date,
    note: typeof p.note === 'string' && p.note.trim() ? p.note.trim().slice(0, 100) : undefined,
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date(0).toISOString()
  }
}

// ===== 进货优化：关联支出 + 数量/进价双向联动 =====

/** 支出 id → 占用它的进货记录 id（用于「同一笔支出不可重复关联」校验；首次占用者为准） */
export function expenseLinkOwners(purchases: BusinessPurchase[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const p of purchases ?? []) {
    for (const eid of p.expenseIds ?? []) {
      if (!map.has(eid)) map.set(eid, p.id)
    }
  }
  return map
}

/** 指定支出金额合计（进货合计 = 已关联支出金额之和；未知 id 忽略，非有限值按 0） */
export function sumExpenseAmounts(expenses: BusinessExpense[], ids: string[]): number {
  const set = new Set(ids ?? [])
  if (set.size === 0) return 0
  const sum = (expenses ?? [])
    .filter(e => set.has(e.id))
    .reduce((s, e) => s + (typeof e.amount === 'number' && Number.isFinite(e.amount) ? e.amount : 0), 0)
  return Math.round(sum * 100) / 100
}

/** 扁平化：取出所有日容器下的支出明细（items），不携带日期（仅供金额/数量统计） */
export function flatExpenseItems(dailies: BusinessExpenseDaily[] | undefined): BusinessExpense[] {
  const out: BusinessExpense[] = []
  for (const d of dailies ?? []) for (const it of d.items) out.push(it)
  return out
}

/** 扁平化（带日期与日容器 id）：用于关联候选、对账标签等需要日期上下文的场景 */
export interface ExpenseItemWithDay {
  item: BusinessExpense
  date: string
  dailyId: string
}
export function expenseItemsWithDay(dailies: BusinessExpenseDaily[] | undefined): ExpenseItemWithDay[] {
  const out: ExpenseItemWithDay[] = []
  for (const d of dailies ?? []) for (const it of d.items) out.push({ item: it, date: d.date, dailyId: d.id })
  return out
}

/** 新增支出明细的输入（不含 id；amount 由调用方算好：数量 × 单价） */
export interface ExpenseItemInput {
  categoryId: string
  amount: number
  title?: string
  note?: string
  quantity?: number
  unitPrice?: number
  unit?: string
  orderPhone?: string
  orderAddress?: string
  salesman?: string
  paymentMethod?: string
}

/**
 * 向某一天的支出日记账追加一条产品明细；若该日尚无记录则新建日容器。
 * 「添加同一天自动合并」：同日多次新增都归入同一天记录（一天一笔支出）。不改入参，返回新数组。
 */
export function addExpenseItem(
  dailies: BusinessExpenseDaily[],
  date: string,
  input: ExpenseItemInput
): BusinessExpenseDaily[] {
  const item: BusinessExpense = { id: newId(ID_PREFIX.expense), ...input }
  const now = new Date().toISOString()
  const idx = (dailies ?? []).findIndex(d => d.date === date)
  if (idx === -1) {
    return [...(dailies ?? []), { id: newId(ID_PREFIX.expenseDaily), date, items: [item], createdAt: now, updatedAt: now }]
  }
  const next = [...dailies]
  next[idx] = { ...next[idx], items: [...next[idx].items, item], updatedAt: now }
  return next
}

/** 更新某条支出明细（按 item id）；找不到则返回原数组。不改入参。 */
export function updateExpenseItem(
  dailies: BusinessExpenseDaily[],
  itemId: string,
  patch: Partial<ExpenseItemInput>
): BusinessExpenseDaily[] {
  let changed = false
  const next = (dailies ?? []).map(d => {
    const i = d.items.findIndex(it => it.id === itemId)
    if (i === -1) return d
    changed = true
    const items = [...d.items]
    items[i] = { ...items[i], ...patch }
    return { ...d, items, updatedAt: new Date().toISOString() }
  })
  return changed ? next : (dailies ?? [])
}

/** 删除某条支出明细（按 item id）；当日无其他明细则整日删除；找不到则返回原数组。不改入参。 */
export function deleteExpenseItem(dailies: BusinessExpenseDaily[], itemId: string): BusinessExpenseDaily[] {
  let changed = false
  const next = (dailies ?? [])
    .map(d => {
      if (!d.items.some(it => it.id === itemId)) return d
      changed = true
      const items = d.items.filter(it => it.id !== itemId)
      if (items.length === 0) return null
      return { ...d, items, updatedAt: new Date().toISOString() }
    })
    .filter((d): d is BusinessExpenseDaily => d !== null)
  return changed ? next : (dailies ?? [])
}

/** 弹框草稿行：新增行无 id，编辑行带原 item id（保存时保留 id 以不破坏库存关联 expenseIds 指向） */
export interface ExpenseItemDraft extends ExpenseItemInput {
  /** 编辑态保留原明细 id；新增行缺省 → 保存时生成新 id */
  id?: string
}

/**
 * 支出日记账 upsert（与销售 upsertDailyRecord 对应）：以「日期」为容器键，明细整体替换/合并。
 *  - 新增（originalDailyId 为 null）：把明细并入该日期的日容器（同日自动合并，不存在则新建）。
 *  - 编辑（originalDailyId 非空）：
 *      · 日期未变 → 整体替换该日明细（保留传入的 id，新行生成 id，被删行自然消失）；
 *      · 日期变更 → 移除原日容器，将明细并入目标日期（目标日已存在则追加，id 唯一不冲突）；
 *  - 明细为空 → 删除原日容器（若有），保证不产生空日记账。
 * 不改入参，返回新数组；调用方（store）负责年守卫与持久化。标题归一化（产品名兜底）由调用方在传入前完成。
 */
export function upsertExpenseDaily(
  dailies: BusinessExpenseDaily[] | undefined,
  originalDailyId: string | null,
  date: string,
  items: ExpenseItemDraft[]
): BusinessExpenseDaily[] {
  const base = dailies ?? []
  const now = new Date().toISOString()
  const resolved: BusinessExpense[] = (items ?? [])
    .filter(it => it.categoryId)
    .map(it => {
      const e: BusinessExpense = {
        id: typeof it.id === 'string' && it.id ? it.id : newId(ID_PREFIX.expense),
        categoryId: it.categoryId,
        amount: Math.max(0, Number(it.amount) || 0)
      }
      if (typeof it.title === 'string' && it.title.trim()) e.title = it.title.trim().slice(0, EXPENSE_TITLE_MAX)
      if (typeof it.note === 'string' && it.note.trim()) e.note = it.note.trim().slice(0, 100)
      if (Number.isFinite(it.quantity as number) && Number(it.quantity) > 0) e.quantity = Number(it.quantity)
      if (Number.isFinite(it.unitPrice as number) && Number(it.unitPrice) > 0) e.unitPrice = Number(it.unitPrice)
      if (typeof it.unit === 'string' && it.unit.trim()) e.unit = it.unit.trim().slice(0, EXPENSE_UNIT_MAX)
      if (typeof it.orderPhone === 'string' && it.orderPhone.trim()) e.orderPhone = it.orderPhone.trim().slice(0, EXPENSE_ORDER_PHONE_MAX)
      if (typeof it.orderAddress === 'string' && it.orderAddress.trim()) e.orderAddress = it.orderAddress.trim().slice(0, EXPENSE_ORDER_ADDRESS_MAX)
      if (typeof it.salesman === 'string' && it.salesman.trim()) e.salesman = it.salesman.trim().slice(0, EXPENSE_SALESMAN_MAX)
      if (typeof it.paymentMethod === 'string' && it.paymentMethod.trim()) e.paymentMethod = it.paymentMethod.trim().slice(0, EXPENSE_PAYMENT_METHOD_MAX)
      return e
    })

  // 无明细 → 删除原日容器（若有），不残留空日记账
  if (resolved.length === 0) {
    return originalDailyId ? base.filter(d => d.id !== originalDailyId) : base
  }

  const original = originalDailyId ? base.find(d => d.id === originalDailyId) : undefined
  const sameDay = !!original && original.date === date

  let next = base
  // 日期变更：先移除原日容器，明细整体迁到新日期
  if (original && !sameDay) {
    next = next.filter(d => d.id !== original.id)
  }

  if (sameDay && original) {
    next = next.map(d => (d.id === original.id ? { ...d, items: resolved, updatedAt: now } : d))
  } else {
    const idx = next.findIndex(d => d.date === date)
    if (idx !== -1) {
      // 目标日已存在（含日期变更后的合并）：追加明细（id 唯一，不冲突）
      next = next.map(d => (d.date === date ? { ...d, items: [...d.items, ...resolved], updatedAt: now } : d))
    } else {
      next = [...next, { id: newId(ID_PREFIX.expenseDaily), date, items: resolved, createdAt: now, updatedAt: now }]
    }
  }
  return next
}

/** 金额比较容差（分）：剩余金额 ≤ 该值视为已全额关联 */
const AMOUNT_EPS = 0.005

/**
 * 单笔记货记录对某笔支出的占用金额。
 * 当前数据模型是「整笔关联」（expenseIds 里出现即占用该笔支出全额）；
 * 若后续支持按金额部分关联，只需改这里读取记录里保存的占用额即可，候选筛选逻辑无需改动。
 */
function occupiedAmountOf(_purchase: BusinessPurchase, expense: BusinessExpense): number {
  return typeof expense.amount === 'number' && Number.isFinite(expense.amount) ? Math.max(0, expense.amount) : 0
}

/** 可关联支出项（已被其它进货记录全额关联的支出不出现在候选里） */
export interface ExpenseLinkOption {
  /** 具体某一笔支出明细（某一天的某产品） */
  expense: BusinessExpense
  /** 其所属日容器的日期（YYYY-MM-DD） */
  date: string
  /** 仍可关联的余额 = 支出金额 − 已被「其它」进货记录占用的金额（整笔关联模型下可关联时等于全额） */
  remaining: number
  /** 当前记录自身是否已勾选（自身勾选的必须保留并显示为选中，便于取消） */
  selfLinked: boolean
  /** 展示标签：`YYYY-MM-DD 产品名 [数量单位]`（同一天多产品时用于区分） */
  label: string
}

/**
 * 支出候选列表（按所属日期倒序）。每条候选是「某一天的某产品」明细。
 * 过滤规则：
 *  1. 已被「任意其它」进货记录全额关联的明细**直接排除**，不再出现在候选中；
 *  2. 若未来支持按金额部分关联：已全额关联的隐藏，仍有余额的保留（remaining 即余额）；
 *  3. 当前记录自身已勾选的明细（selectedIds，编辑态即本记录 expenseIds）始终保留并显示为选中；
 *  4. 过滤在纯函数内一次完成 —— 分页 / 搜索 / 刷新都基于同一份结果，口径始终一致。
 */
export function selectableExpenses(
  expenseDailies: BusinessExpenseDaily[],
  purchases: BusinessPurchase[],
  editingId?: string | null,
  selectedIds?: string[]
): ExpenseLinkOption[] {
  const all = expenseItemsWithDay(expenseDailies)
  const selected = new Set((selectedIds ?? []).filter(x => typeof x === 'string' && !!x))
  /** 支出明细 id → 已被其它进货记录占用的金额（正在编辑的那笔记货不算占用） */
  const occupied = new Map<string, number>()
  for (const p of purchases ?? []) {
    if (editingId && p.id === editingId) continue
    for (const eid of p.expenseIds ?? []) {
      const found = all.find(x => x.item.id === eid)
      if (!found) continue
      occupied.set(eid, (occupied.get(eid) ?? 0) + occupiedAmountOf(p, found.item))
    }
  }
  return all
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return a.item.id < b.item.id ? 1 : a.item.id > b.item.id ? -1 : 0
    })
    .map(x => {
      const e = x.item
      const amount = typeof e.amount === 'number' && Number.isFinite(e.amount) ? Math.max(0, e.amount) : 0
      const remaining = Math.round((amount - (occupied.get(e.id) ?? 0)) * 100) / 100
      return { expense: e, date: x.date, remaining: Math.max(0, remaining), selfLinked: selected.has(e.id), label: expenseLabel(e, x.date) }
    })
    .filter(o => o.selfLinked || o.remaining > AMOUNT_EPS)
}

/** 合计 ÷ 数量 = 进价；合计为 0 或数量 ≤ 0（除零）→ null（调用方保持原值，不写 NaN/Infinity） */
export function deriveUnitPrice(total: number, quantity: number): number | null {
  if (!(total > 0) || !(quantity > 0)) return null
  return Math.round((total / quantity) * 100) / 100
}

/** 合计 ÷ 进价 = 数量（取整，至少 1）；合计为 0 或进价 ≤ 0（除零）→ null */
export function deriveQuantity(total: number, unitPrice: number): number | null {
  if (!(total > 0) || !(unitPrice > 0)) return null
  return Math.max(1, Math.round(total / unitPrice))
}

/** 归一化关联支出 id：去空、去重、保持顺序（非法输入 → 空数组） */
export function normalizeExpenseIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return Array.from(new Set(ids.filter((x): x is string => typeof x === 'string' && !!x)))
}

/** 未关联支出时的常规合计：数量 × 进价（两位小数） */
export function calcPurchaseTotal(quantity: number, unitPrice: number): number {
  const q = Math.max(0, Math.floor(quantity))
  const p = Math.max(0, unitPrice)
  return Math.round(q * p * 100) / 100
}

function normDailyItem(raw: unknown): DailyRecordItem | null {
  if (raw === null || typeof raw !== 'object') return null
  const it = raw as Record<string, unknown>
  if (typeof it.productId !== 'string' || !it.productId) return null
  return {
    productId: it.productId,
    broughtOut: Math.max(0, numOf(it.broughtOut)),
    remaining: Math.max(0, numOf(it.remaining)),
    loss: Math.max(0, numOf(it.loss))
  }
}

function normDailyRecord(raw: unknown): BusinessDailyRecord | null {
  if (raw === null || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  if (typeof d.id !== 'string' || !d.id) return null
  if (typeof d.date !== 'string' || !isValidDateKey(d.date)) return null
  const items = Array.isArray(d.items) ? (d.items.map(normDailyItem).filter(Boolean) as DailyRecordItem[]) : []
  return {
    id: d.id,
    date: d.date,
    items,
    totalRevenue: Math.max(0, numOf(d.totalRevenue)),
    transactionCount: typeof d.transactionCount === 'number' && Number.isFinite(d.transactionCount) ? Math.max(0, Math.floor(d.transactionCount)) : undefined,
    note: typeof d.note === 'string' && d.note.trim() ? d.note.trim().slice(0, 200) : undefined,
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : new Date(0).toISOString(),
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date(0).toISOString()
  }
}

/** 历史支出无标题时的兜底标题 */
export const DEFAULT_EXPENSE_TITLE = '未命名支出'
/** 支出标题最大长度（汉字/字符同计） */
export const EXPENSE_TITLE_MAX = 20

/** 单位预设（下拉可选项；支持自定义输入）——商品单位与支出单位共用同一份预设，保证两处口径一致 */
export const BIZ_UNITS = ['件', '包', '根', '箱', '袋', '个', '斤', '盒', '瓶', '条', '只', '套', '台', '米', '卷']
/** 支出单位预设（= 通用 BIZ_UNITS，保留原名兼容既有引用） */
export const EXPENSE_UNITS = BIZ_UNITS
/** 支出新增可选字段最大长度（单位上限 BIZ_UNIT_MAX 与商品共用） */
export const BIZ_UNIT_MAX = 10
export const EXPENSE_UNIT_MAX = BIZ_UNIT_MAX
export const EXPENSE_ORDER_PHONE_MAX = 30
export const EXPENSE_ORDER_ADDRESS_MAX = 100
export const EXPENSE_SALESMAN_MAX = 30
/** 支付方式预设（下拉可选项；支持自定义输入）；可选，旧数据缺省为空 */
export const EXPENSE_PAYMENT_METHODS = ['现金', '微信', '支付宝', '银行卡', '其他'] as const
/** 支付方式最大长度（自定义输入截断上限） */
export const EXPENSE_PAYMENT_METHOD_MAX = 20

/**
 * 支出标题归一化：去空白 + 截断；为空时用 fallback（迁移时传分类名）再退回默认标题。
 * 保证「标题必填」的同时，历史数据在归一化后一定拿到可读标题。
 */
export function normalizeExpenseTitle(raw: unknown, fallback?: string): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (trimmed) return trimmed.slice(0, EXPENSE_TITLE_MAX)
  const fb = typeof fallback === 'string' ? fallback.trim() : ''
  if (fb) return fb.slice(0, EXPENSE_TITLE_MAX)
  return DEFAULT_EXPENSE_TITLE
}

/** 支出展示标签：`YYYY-MM-DD 产品名`（明细无 date，由调用方传入所属日容器的 date；数量单位由调用处用 expenseQtyUnit 另行展示） */
export function expenseLabel(e: BusinessExpense, date?: string): string {
  const title = typeof e?.title === 'string' && e.title.trim() ? e.title.trim() : DEFAULT_EXPENSE_TITLE
  return `${date ?? ''} ${title}`
}

/**
 * 支出数量+单位展示文本：如「3件」「1.5斤」。
 * 数量必须为正数才展示；缺失 / 0 / 非有限值返回空串（旧数据无 quantity 时不影响既有标签）。
 * 用于进货「关联支出」候选列表与已关联徽章提示，直观呈现该笔支出买了多少。
 */
export function expenseQtyUnit(e: BusinessExpense): string {
  const q = typeof e?.quantity === 'number' && Number.isFinite(e.quantity) ? e.quantity : NaN
  if (!(q > 0)) return ''
  const unit = typeof e?.unit === 'string' && e.unit.trim() ? e.unit.trim() : ''
  const qStr = Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100)
  return `${qStr}${unit}`
}

/**
 * 支出产品的「商品单价」= 单价 ÷ 商品数量（派生，只读）。
 * 单价（unitPrice）与商品数量（productQuantity）均须为正数才有效，否则返回 undefined。
 * 用于「支出产品管理」里单价之后的商品单价展示（如 单价 60 ÷ 商品数量 12 = 商品单价 5）。
 */
export function productUnitPriceOf(c: BusinessExpenseCategory): number | undefined {
  const up = typeof c?.unitPrice === 'number' && Number.isFinite(c.unitPrice) ? c.unitPrice : NaN
  const qty = typeof c?.productQuantity === 'number' && Number.isFinite(c.productQuantity) ? c.productQuantity : NaN
  if (!(up > 0) || !(qty > 0)) return undefined
  return Math.round((up / qty) * 100) / 100
}

/** 单笔支出录入校验（标题必填且不超长 / 金额 > 0 / 分类必选） */
/** 支出金额：数量 × 单价（两位小数；非法值按 0 处理） */
export function calcExpenseAmount(quantity: number | string, unitPrice: number | string): number {
  const q = Number(quantity)
  const p = Number(unitPrice)
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0
  return Math.round(Math.max(0, q) * Math.max(0, p) * 100) / 100
}

export function validateExpenseRow(
  row: {
    title?: string
    categoryId?: string
    amount?: number | string
    quantity?: number | string
    unitPrice?: number | string
    unit?: string
    orderPhone?: string
    orderAddress?: string
    salesman?: string
  },
  /** 标题是否必填：支出弹框里标题已改为可选（留空取产品名兜底），故传 false */
  opts?: { titleRequired?: boolean }
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const amount = Number(row.amount)
  const titleRequired = opts?.titleRequired !== false
  if (!title) {
    if (titleRequired) issues.push({ level: 'error', message: '请填写支出标题' })
  } else if (title.length > EXPENSE_TITLE_MAX) {
    issues.push({ level: 'error', message: `标题不能超过 ${EXPENSE_TITLE_MAX} 个字` })
  }
  if (!row.categoryId) issues.push({ level: 'error', message: '请选择产品' })
  // 数量 / 单价（金额 = 数量 × 单价 自动算出时）：给了就一并校验，避免填了 0 却看不出原因
  if (row.quantity !== undefined) {
    const q = Number(row.quantity)
    if (!Number.isFinite(q) || q <= 0) issues.push({ level: 'error', message: '数量必须 > 0' })
  }
  if (row.unitPrice !== undefined) {
    const p = Number(row.unitPrice)
    if (!Number.isFinite(p) || p <= 0) issues.push({ level: 'error', message: '单价必须 > 0' })
  }
  if (!Number.isFinite(amount) || amount <= 0) issues.push({ level: 'error', message: '支出金额必须 > 0（金额 = 数量 × 单价）' })
  return issues
}

/** 多行支出录入校验汇总 */
export function validateExpenseRows(
  rows: { title?: string; categoryId?: string; amount?: number | string }[]
): { errors: string[]; warns: string[] } {
  const errors: string[] = []
  ;(rows ?? []).forEach((row, i) => {
    for (const issue of validateExpenseRow(row)) {
      if (issue.level === 'error') errors.push(`第 ${i + 1} 行：${issue.message}`)
    }
  })
  return { errors, warns: [] }
}

/** 归一化单条支出明细（用于日容器 BusinessExpenseDaily.items；无 date，date 挂在日容器上） */
function normExpense(raw: unknown, categories?: BusinessExpenseCategory[]): BusinessExpense | null {
  if (raw === null || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (typeof e.id !== 'string' || !e.id) return null
  if (typeof e.categoryId !== 'string' || !e.categoryId) return null
  const categoryName = categories?.find(c => c.id === e.categoryId)?.name
  return {
    id: e.id,
    categoryId: e.categoryId,
    amount: Math.max(0, numOf(e.amount)),
    // 历史数据无 title → 用分类名兜底，再退回「未命名支出」（保证兼容且可读）
    title: normalizeExpenseTitle(e.title, categoryName),
    note: typeof e.note === 'string' && e.note.trim() ? e.note.trim().slice(0, 100) : undefined,
    // 数量/单价：金额 = 数量 × 单价；旧数据缺省 undefined（展示时按数量 1 / 单价=金额 回显）
    quantity: Number.isFinite(numOf(e.quantity)) && numOf(e.quantity) > 0 ? numOf(e.quantity) : undefined,
    unitPrice: Number.isFinite(numOf(e.unitPrice)) && numOf(e.unitPrice) > 0 ? numOf(e.unitPrice) : undefined,
    unit: typeof e.unit === 'string' && e.unit.trim() ? e.unit.trim().slice(0, EXPENSE_UNIT_MAX) : undefined,
    orderPhone: typeof e.orderPhone === 'string' && e.orderPhone.trim() ? e.orderPhone.trim().slice(0, EXPENSE_ORDER_PHONE_MAX) : undefined,
    orderAddress: typeof e.orderAddress === 'string' && e.orderAddress.trim() ? e.orderAddress.trim().slice(0, EXPENSE_ORDER_ADDRESS_MAX) : undefined,
    salesman: typeof e.salesman === 'string' && e.salesman.trim() ? e.salesman.trim().slice(0, EXPENSE_SALESMAN_MAX) : undefined,
    // 支付方式：可选；仅当非空字符串才写入，保持旧数据/旧断言的对象形状不变
    ...(typeof e.paymentMethod === 'string' && e.paymentMethod.trim()
      ? { paymentMethod: e.paymentMethod.trim().slice(0, EXPENSE_PAYMENT_METHOD_MAX) }
      : {})
  }
}

/**
 * 支出日记账归一化：兼容两种持久化格式。
 *  - 新格式（data.expenseDailies）：直接逐日归一，items 走 normExpense。
 *  - 旧格式（data.expenses 扁平、每条带 date）：按 date 分组迁移为「一天一笔」日容器，
 *    同日多条按原 createdAt 排序作为明细顺序；迁移后 date 从明细移除、仅保留在日容器上。
 */
export function normalizeExpenseDailies(data: Record<string, unknown>, categories: BusinessExpenseCategory[]): BusinessExpenseDaily[] {
  if (Array.isArray(data.expenseDailies)) {
    return data.expenseDailies
      .map((d): BusinessExpenseDaily | null => {
        if (!d || typeof d !== 'object') return null
        const dd = d as Record<string, unknown>
        if (typeof dd.date !== 'string' || !isValidDateKey(dd.date)) return null
        const id = typeof dd.id === 'string' && dd.id ? dd.id : newId(ID_PREFIX.expenseDaily)
        const items = Array.isArray(dd.items)
          ? dd.items.map(it => normExpense(it, categories)).filter(Boolean) as BusinessExpense[]
          : []
        return {
          id,
          date: dd.date,
          items,
          note: typeof dd.note === 'string' && dd.note.trim() ? dd.note.trim().slice(0, 100) : undefined,
          createdAt: typeof dd.createdAt === 'string' ? dd.createdAt : new Date(0).toISOString(),
          updatedAt: typeof dd.updatedAt === 'string' ? dd.updatedAt : new Date(0).toISOString()
        }
      })
      .filter(Boolean) as BusinessExpenseDaily[]
  }
  // 旧格式：扁平 expenses 按 date 分组
  const flat = Array.isArray(data.expenses) ? (data.expenses as unknown[]) : []
  const byDate = new Map<string, unknown[]>()
  for (const raw of flat) {
    if (raw === null || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const date = typeof r.date === 'string' && isValidDateKey(r.date) ? r.date : null
    if (!date) continue
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date)!.push(raw)
  }
  const dailies: BusinessExpenseDaily[] = []
  for (const [date, raws] of byDate) {
    const sorted = [...raws].sort((a, b) => {
      const ca = (a as Record<string, unknown>).createdAt ?? ''
      const cb = (b as Record<string, unknown>).createdAt ?? ''
      return ca < cb ? -1 : ca > cb ? 1 : 0
    })
    const items = sorted.map(r => normExpense(r, categories)).filter(Boolean) as BusinessExpense[]
    dailies.push({
      id: newId(ID_PREFIX.expenseDaily),
      date,
      items,
      createdAt: typeof (sorted[0] as Record<string, unknown>)?.createdAt === 'string' ? ((sorted[0] as Record<string, unknown>).createdAt as string) : new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    })
  }
  dailies.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) // 日期倒序，与列表一致
  return dailies
}

function normalizeSettings(raw: unknown): BusinessSettings {
  const out: BusinessSettings = {
    stallName: '',
    lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    monthlyRevenueTarget: 0,
    slowMovingDays: DEFAULT_SLOW_MOVING_DAYS,
    agingBatchDays: DEFAULT_AGING_BATCH_DAYS
  }
  if (raw === null || typeof raw !== 'object') return out
  const s = raw as Record<string, unknown>
  if (typeof s.stallName === 'string') out.stallName = s.stallName.trim().slice(0, 30)
  if (typeof s.lowStockThreshold === 'number' && Number.isFinite(s.lowStockThreshold)) {
    out.lowStockThreshold = Math.max(0, Math.floor(s.lowStockThreshold))
  }
  if (typeof s.slowMovingDays === 'number' && Number.isFinite(s.slowMovingDays)) {
    out.slowMovingDays = Math.max(1, Math.floor(s.slowMovingDays))
  }
  if (typeof s.agingBatchDays === 'number' && Number.isFinite(s.agingBatchDays)) {
    out.agingBatchDays = Math.max(1, Math.floor(s.agingBatchDays))
  }
  if (typeof s.monthlyRevenueTarget === 'number' && Number.isFinite(s.monthlyRevenueTarget)) {
    out.monthlyRevenueTarget = Math.max(0, Math.floor(s.monthlyRevenueTarget))
  }
  return out
}

/** 归一化（幂等）：非对象 → empty；各字段独立归一、分类种子/内置契约保持 */
export function normalizeBusinessData(raw: unknown): BusinessData {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return emptyBusinessData()
  const data = raw as Record<string, unknown>
  return {
    productCategories: normalizeProductCategories(data.productCategories),
    expenseCategories: normalizeExpenseCategories(data.expenseCategories),
    products: Array.isArray(data.products) ? (data.products.map(normProduct).filter(Boolean) as BusinessProduct[]) : [],
    purchases: Array.isArray(data.purchases) ? (data.purchases.map(normPurchase).filter(Boolean) as BusinessPurchase[]) : [],
    dailyRecords: Array.isArray(data.dailyRecords) ? (data.dailyRecords.map(normDailyRecord).filter(Boolean) as BusinessDailyRecord[]) : [],
    expenseDailies: normalizeExpenseDailies(data, normalizeExpenseCategories(data.expenseCategories)),
    settings: normalizeSettings(data.settings)
  }
}

// ===== 分类 CRUD 结果计算（不改入参，返回 { ok, reason, list? }） =====

export type CategoryOpResult<T> =
  | { ok: true; reason: 'ok'; list: T[] }
  | { ok: false; reason: 'empty' | 'duplicate' | 'not-found' | 'in-use' | 'builtin' | 'boundary' }

interface CategoryLike {
  id: string
  name: string
  sortOrder: number
  visible: boolean
}

/** 新增商品分类（id 由 core 生成 bpc_ 前缀） */
export function addProductCategory(list: BusinessProductCategory[], name: string): CategoryOpResult<BusinessProductCategory> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (isCategoryNameTaken(trimmed, '', list)) return { ok: false, reason: 'duplicate' }
  const next: BusinessProductCategory = {
    id: newId(ID_PREFIX.productCat),
    name: trimmed.slice(0, 20),
    sortOrder: list.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1,
    visible: true
  }
  return { ok: true, reason: 'ok', list: [...list, next] }
}

/** 新增支出产品（自定义 bec_ 前缀）；opts.unit/unitPrice 为产品默认单位与单价，新增支出选该产品时自动回填 */
export function addExpenseCategory(
  list: BusinessExpenseCategory[],
  name: string,
  opts?: { unit?: string; unitPrice?: number; productQuantity?: number }
): CategoryOpResult<BusinessExpenseCategory> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (isCategoryNameTaken(trimmed, '', list)) return { ok: false, reason: 'duplicate' }
  const next: BusinessExpenseCategory = {
    id: newId(ID_PREFIX.expenseCat),
    name: trimmed.slice(0, 20),
    sortOrder: list.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1,
    visible: true,
    isBuiltIn: false,
    unit: opts?.unit ? opts.unit.trim().slice(0, EXPENSE_UNIT_MAX) || undefined : undefined,
    unitPrice: typeof opts?.unitPrice === 'number' && Number.isFinite(opts?.unitPrice) && (opts.unitPrice as number) > 0 ? opts.unitPrice : undefined,
    productQuantity: typeof opts?.productQuantity === 'number' && Number.isFinite(opts?.productQuantity) && (opts.productQuantity as number) > 0 ? opts.productQuantity : undefined
  }
  return { ok: true, reason: 'ok', list: [...list, next] }
}

/** 更新支出产品的默认单位/单价/商品数量（不校验名称；与 normExpense 同口径归一，空值/非法 → 清除） */
export function updateExpenseCategory(
  list: BusinessExpenseCategory[],
  id: string,
  patch: { unit?: string | null; unitPrice?: number | null; productQuantity?: number | null }
): CategoryOpResult<BusinessExpenseCategory> {
  const target = list.find(c => c.id === id)
  if (!target) return { ok: false, reason: 'not-found' }
  return {
    ok: true,
    reason: 'ok',
    list: list.map(c => {
      if (c.id !== id) return c
      const next: BusinessExpenseCategory = { ...c }
      if (patch.unit !== undefined) {
        next.unit = typeof patch.unit === 'string' && patch.unit.trim() ? patch.unit.trim().slice(0, EXPENSE_UNIT_MAX) : undefined
      }
      if (patch.unitPrice !== undefined) {
        next.unitPrice =
          typeof patch.unitPrice === 'number' && Number.isFinite(patch.unitPrice) && patch.unitPrice > 0 ? patch.unitPrice : undefined
      }
      if (patch.productQuantity !== undefined) {
        next.productQuantity =
          typeof patch.productQuantity === 'number' && Number.isFinite(patch.productQuantity) && patch.productQuantity > 0 ? patch.productQuantity : undefined
      }
      return next
    })
  }
}

/** 通用改名：商品/支出分类均允许（含支出内置）；名称唯一（除自身外） */
export function renameCategory<T extends CategoryLike>(list: T[], id: string, name: string): CategoryOpResult<T> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  const target = list.find(c => c.id === id)
  if (!target) return { ok: false, reason: 'not-found' }
  if (isCategoryNameTaken(trimmed, id, list)) return { ok: false, reason: 'duplicate' }
  return { ok: true, reason: 'ok', list: list.map(c => (c.id === id ? { ...c, name: trimmed.slice(0, 20) } : c)) }
}

/** 通用标签页显隐切换 */
export function toggleCategoryVisible<T extends CategoryLike>(list: T[], id: string): CategoryOpResult<T> {
  const target = list.find(c => c.id === id)
  if (!target) return { ok: false, reason: 'not-found' }
  return { ok: true, reason: 'ok', list: list.map(c => (c.id === id ? { ...c, visible: !c.visible } : c)) }
}

/** 通用移动（按 sortOrder 升序后与邻居对调 sortOrder 值）；首项上移/末项下移 → boundary */
export function moveCategory<T extends CategoryLike>(list: T[], id: string, dir: 'up' | 'down'): CategoryOpResult<T> {
  const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder)
  const idx = sorted.findIndex(c => c.id === id)
  if (idx === -1) return { ok: false, reason: 'not-found' }
  const target = dir === 'up' ? idx - 1 : idx + 1
  if (target < 0 || target >= sorted.length) return { ok: false, reason: 'boundary' }
  const a = sorted[idx]
  const b = sorted[target]
  const swapped = sorted.map((c, i) => {
    if (i === idx) return { ...c, sortOrder: b.sortOrder }
    if (i === target) return { ...c, sortOrder: a.sortOrder }
    return c
  })
  swapped.sort((x, y) => x.sortOrder - y.sortOrder)
  return { ok: true, reason: 'ok', list: swapped }
}

/** 删除商品分类：被商品引用 → in-use；内置种子可删（删除后商品归未分类由 store 处理） */
export function deleteProductCategory(
  list: BusinessProductCategory[],
  id: string,
  inUse: boolean
): CategoryOpResult<BusinessProductCategory> {
  const target = list.find(c => c.id === id)
  if (!target) return { ok: false, reason: 'not-found' }
  if (inUse) return { ok: false, reason: 'in-use' }
  return { ok: true, reason: 'ok', list: list.filter(c => c.id !== id) }
}

/** 删除支出分类：内置 → builtin；被支出记录引用 → in-use */
export function deleteExpenseCategory(
  list: BusinessExpenseCategory[],
  id: string,
  inUse: boolean
): CategoryOpResult<BusinessExpenseCategory> {
  const target = list.find(c => c.id === id)
  if (!target) return { ok: false, reason: 'not-found' }
  if (target.isBuiltIn) return { ok: false, reason: 'builtin' }
  if (inUse) return { ok: false, reason: 'in-use' }
  return { ok: true, reason: 'ok', list: list.filter(c => c.id !== id) }
}

// ===== 查找 / 排序 / 可见列表 =====

export function findProduct(products: BusinessProduct[], id: string): BusinessProduct | undefined {
  return products.find(p => p.id === id)
}

export function findProductCategory(categories: BusinessProductCategory[], id: string): BusinessProductCategory | undefined {
  return categories.find(c => c.id === id)
}

export function findExpenseCategory(categories: BusinessExpenseCategory[], id: string): BusinessExpenseCategory | undefined {
  return categories.find(c => c.id === id)
}

/** Tab/标签页可见分类（sortOrder 升序，返回新数组） */
export function visibleProductCategories(categories: BusinessProductCategory[]): BusinessProductCategory[] {
  return categories.filter(c => c.visible !== false).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function visibleExpenseCategories(categories: BusinessExpenseCategory[]): BusinessExpenseCategory[] {
  return categories.filter(c => c.visible !== false).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function sortProducts(products: BusinessProduct[]): BusinessProduct[] {
  return [...products].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function sortPurchases(purchases: BusinessPurchase[]): BusinessPurchase[] {
  return [...purchases].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
}

/** 按商品分类过滤进货记录：'all' 返回全部；其余返回 linked 商品分类匹配项。
 *  已删除商品（product 不存在）与未分类商品（categoryId 为 undefined）仅在 'all' 下可见，分类过滤排除。 */
export function filterPurchasesByCategory(
  purchases: BusinessPurchase[],
  products: BusinessProduct[],
  categoryId: string
): BusinessPurchase[] {
  if (categoryId === 'all') return sortPurchases(purchases)
  return sortPurchases(purchases.filter(p => {
    const product = products.find(pr => pr.id === p.productId)
    return product?.categoryId === categoryId
  }))
}

export function sortDailyRecords(records: BusinessDailyRecord[]): BusinessDailyRecord[] {
  return [...records].sort((a, b) => (a.date === b.date ? (a.updatedAt < b.updatedAt ? 1 : -1) : a.date < b.date ? 1 : -1))
}

/** 支出日记账按日期倒序（与销售记录同序；同日保持数组顺序） */
export function sortExpenseDailies(dailies: BusinessExpenseDaily[]): BusinessExpenseDaily[] {
  return [...dailies].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

// ===== 销售/库存/统计 =====

/** 单条目销售数量：max(0, 带出 − 剩余 − 损耗) */
export function soldCount(item: DailyRecordItem): number {
  return Math.max(0, item.broughtOut - item.remaining - item.loss)
}

/** 日记录收入：Σ 销售数量 × 商品售价（商品已删除记 0，防历史失真以现存售价为准） */
export function calcDailyRevenue(items: DailyRecordItem[], products: BusinessProduct[]): number {
  let total = 0
  for (const item of items) {
    const product = products.find(p => p.id === item.productId)
    if (!product) continue
    total += soldCount(item) * product.sellingPrice
  }
  return Math.round(total * 100) / 100
}

/**
 * 成本单价（兜底口径，仅供估算/无进货批次时使用）。
 * 严格 FIFO 成本一律走 calcFifoAllocation / calcDailyCostFifo；本函数只在拿不到结转结果时提供退路：
 * 优先未售完批次的实际进货单价均值（avgMap 由 avgUnsoldUnitPriceMap 预计算后传入），否则回退商品维护价。
 */
export function costUnitPriceOf(
  productId: string,
  products: BusinessProduct[],
  avgMap?: Record<string, number | null>
): number {
  const auto = avgMap ? avgMap[productId] : undefined
  if (typeof auto === 'number' && Number.isFinite(auto) && auto > 0) return auto
  const fallback = products.find(p => p.id === productId)?.purchasePrice ?? 0
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0
}

/** 日记录成本（兜底口径：Σ 售出数量 × 成本单价）。严格 FIFO 场景请改用 calcDailyCostFifo */
export function calcDailyCost(
  items: DailyRecordItem[],
  products: BusinessProduct[],
  avgMap?: Record<string, number | null>
): number {
  let total = 0
  for (const item of items) {
    total += soldCount(item) * costUnitPriceOf(item.productId, products, avgMap)
  }
  return Math.round(total * 100) / 100
}

/** 日记录损耗金额：Σ 损耗数量 × 商品售价（商品已删除计 0，按售价计潜在收入损失） */
export function calcDailyLossAmount(items: DailyRecordItem[], products: BusinessProduct[]): number {
  let total = 0
  for (const item of items) {
    const product = products.find(p => p.id === item.productId)
    total += item.loss * (product?.sellingPrice ?? 0)
  }
  return Math.round(total * 100) / 100
}

/** 库存：按商品计 = Σ进货 − Σ带出 + Σ剩余（等价 进货 − 销售 − 损耗） */
export function calcInventory(
  products: BusinessProduct[],
  purchases: BusinessPurchase[],
  dailyRecords: BusinessDailyRecord[]
): Record<string, number> {
  const stock: Record<string, number> = {}
  for (const p of purchases) {
    stock[p.productId] = (stock[p.productId] ?? 0) + p.quantity
  }
  for (const r of dailyRecords) {
    for (const item of r.items) {
      stock[item.productId] = (stock[item.productId] ?? 0) - item.broughtOut + item.remaining
    }
  }
  for (const p of products) {
    stock[p.id] = stock[p.id] ?? 0
  }
  return stock
}

/** 进货合计：按商品 Σ进货数量 */
export function calcPurchaseTotals(purchases: BusinessPurchase[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const p of purchases) {
    totals[p.productId] = (totals[p.productId] ?? 0) + p.quantity
  }
  return totals
}

/** 带出合计：按商品 Σ带出数量（跨全部销售记录） */
export function calcBroughtOutTotals(dailyRecords: BusinessDailyRecord[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const r of dailyRecords) {
    for (const item of r.items) {
      totals[item.productId] = (totals[item.productId] ?? 0) + item.broughtOut
    }
  }
  return totals
}

// ===== 进货批次剩余状态（先进先出）与未售完批次均价 =====

/** 按商品累计售出数量（销售记录口径：带出 − 剩余 − 损耗） */
export function calcSoldTotals(dailyRecords: BusinessDailyRecord[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const r of dailyRecords ?? []) {
    for (const item of r.items ?? []) {
      totals[item.productId] = (totals[item.productId] ?? 0) + soldCount(item)
    }
  }
  return totals
}

/** 按商品累计损耗数量（损耗同样离开库存，只是不计入售出与营业额） */
export function calcLossTotals(dailyRecords: BusinessDailyRecord[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const r of dailyRecords ?? []) {
    for (const item of r.items ?? []) {
      const loss = Number.isFinite(item?.loss) ? Math.max(0, item.loss) : 0
      if (loss <= 0) continue
      totals[item.productId] = (totals[item.productId] ?? 0) + loss
    }
  }
  return totals
}

/** 单笔记货批次的剩余状态：按「先进先出」消耗（最旧批次优先出库）
 *  出库量 = 售出 + 损耗（带出 − 剩余），因此 remaining 与 calcInventory 的库存口径一致。 */
export interface PurchaseStockStatus {
  purchaseId: string
  productId: string
  quantity: number // 本批进货数量
  sold: number // 本批已售出（FIFO 消耗量，不超过 quantity）
  /** 本批已损耗出库（不计入售出，但同样离开库存） */
  writtenOff: number
  /** 本批剩余 = quantity − sold − writtenOff */
  remaining: number
  soldOut: boolean // 是否已全部出库（remaining ≤ 0）
  /** 是否该商品 FIFO 队列中最旧的一批（判定「最旧那一笔是否已售完」的对象） */
  isOldest: boolean
  totalSold: number // 该商品累计售出（全部销售记录）
  /** 该商品累计损耗（全部销售记录） */
  totalWrittenOff: number
}

/** 进货排序：先进先出 = 日期升序（同日按创建时间/ id 升序，保证稳定） */
function fifoCompare(a: BusinessPurchase, b: BusinessPurchase): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  const ca = typeof a.createdAt === 'string' ? a.createdAt : ''
  const cb = typeof b.createdAt === 'string' ? b.createdAt : ''
  if (ca !== cb) return ca < cb ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * 进货批次剩余状态表（purchaseId → 状态）。
 * 规则：同一商品的进货按日期从旧到新排队，销售售出数量从最旧批次开始依次消耗；
 * 因此「最旧那一笔是否已全部售出」等价于队首批次的 soldOut。
 */
export function calcPurchaseStockStatus(
  purchases: BusinessPurchase[],
  dailyRecords: BusinessDailyRecord[]
): Record<string, PurchaseStockStatus> {
  const soldTotals = calcSoldTotals(dailyRecords)
  const lossTotals = calcLossTotals(dailyRecords)
  const byProduct = new Map<string, BusinessPurchase[]>()
  for (const p of purchases ?? []) {
    const list = byProduct.get(p.productId) ?? []
    list.push(p)
    byProduct.set(p.productId, list)
  }
  const out: Record<string, PurchaseStockStatus> = {}
  for (const [productId, list] of byProduct) {
    const queue = [...list].sort(fifoCompare)
    const totalSold = Math.max(0, soldTotals[productId] ?? 0)
    const totalLoss = Math.max(0, lossTotals[productId] ?? 0)
    // 同一批次内先扣售出、再扣损耗：两者都出库，只有售出计入 COGS
    let leftSold = totalSold
    let leftLoss = totalLoss
    queue.forEach((p, index) => {
      const sold = Math.max(0, Math.min(p.quantity, leftSold))
      leftSold -= sold
      const writtenOff = Math.max(0, Math.min(Math.max(0, p.quantity - sold), leftLoss))
      leftLoss -= writtenOff
      out[p.id] = {
        purchaseId: p.id,
        productId,
        quantity: p.quantity,
        sold,
        writtenOff,
        remaining: Math.max(0, p.quantity - sold - writtenOff),
        soldOut: p.quantity - sold - writtenOff <= 0,
        isOldest: index === 0,
        totalSold,
        totalWrittenOff: totalLoss
      }
    })
  }
  return out
}

/** 某商品「未售完」批次的进货单价列表（按 FIFO 顺序） */
export function unsoldPurchaseUnitPrices(
  purchases: BusinessPurchase[],
  dailyRecords: BusinessDailyRecord[],
  productId: string
): number[] {
  const status = calcPurchaseStockStatus(purchases, dailyRecords)
  return (purchases ?? [])
    .filter(p => p.productId === productId && status[p.id] && !status[p.id].soldOut)
    .sort(fifoCompare)
    .map(p => p.unitPrice)
}

/**
 * 全部商品「未售完批次单价均值」表（内部只算一次 FIFO，供列表反显批量使用）。
 * 口径：未售完批次进货单价的**简单平均**（非按剩余数量加权），保留两位小数。
 */
export function avgUnsoldUnitPriceMap(
  purchases: BusinessPurchase[],
  dailyRecords: BusinessDailyRecord[]
): Record<string, number> {
  const status = calcPurchaseStockStatus(purchases, dailyRecords)
  const acc: Record<string, { total: number; count: number }> = {}
  for (const p of purchases ?? []) {
    const st = status[p.id]
    if (!st || st.soldOut) continue
    const cur = acc[p.productId] ?? { total: 0, count: 0 }
    cur.total += p.unitPrice
    cur.count += 1
    acc[p.productId] = cur
  }
  const out: Record<string, number> = {}
  for (const [productId, cur] of Object.entries(acc)) {
    out[productId] = Math.round((cur.total / cur.count) * 100) / 100
  }
  return out
}

/**
 * 商品进货价自动反显值：未售完批次进货单价的简单平均（两位小数）。
 * 无进货记录或所有批次都已售完 → null（此时沿用商品自身进货价）
 */
export function avgUnsoldUnitPrice(
  purchases: BusinessPurchase[],
  dailyRecords: BusinessDailyRecord[],
  productId: string
): number | null {
  return avgUnsoldUnitPriceMap(purchases, dailyRecords)[productId] ?? null
}

// ===== 严格先进先出（FIFO）成本结转 =====

/** 销售记录升序：日期升序（同日按 updatedAt / id 升序，保证结转顺序稳定） */
function dailyAscCompare(a: BusinessDailyRecord, b: BusinessDailyRecord): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  const ua = typeof a.updatedAt === 'string' ? a.updatedAt : ''
  const ub = typeof b.updatedAt === 'string' ? b.updatedAt : ''
  if (ua !== ub) return ua < ub ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** 一次出库切片：从某个进货批次消耗的数量与金额 */
export interface FifoSlice {
  /** 进货批次 id；'' 表示进货库存不足（先卖后记等异常数据），按商品维护的进货单价兜底 */
  purchaseId: string
  quantity: number
  unitPrice: number
  amount: number
}

/** 某条销售记录中某个商品的当日结转明细 */
export interface FifoItemAllocation {
  /** 售出部分的切片（计入 COGS） */
  soldSlices: FifoSlice[]
  /** 损耗部分的切片（同样离开库存，但不计入毛利成本） */
  lossSlices: FifoSlice[]
  /** 售出成本 = Σ soldSlices.amount */
  cost: number
  /** 损耗出库成本 = Σ lossSlices.amount */
  lossCost: number
}

/** 严格 FIFO 结转结果 */
export interface FifoAllocation {
  /** recordId → productId → 当日结转明细 */
  byRecord: Record<string, Record<string, FifoItemAllocation>>
  /** recordId → 当日售出成本（COGS） */
  costByRecord: Record<string, number>
  /** recordId → 当日损耗出库成本 */
  lossCostByRecord: Record<string, number>
  /** productId → 累计售出成本 */
  costByProduct: Record<string, number>
  /** purchaseId → 结转后剩余数量 */
  remainingByPurchase: Record<string, number>
  /** productId → 结转后剩余数量（与 calcInventory 的库存一致） */
  remainingByProduct: Record<string, number>
}

/**
 * 严格先进先出成本结转（唯一权威口径）。
 * 规则：同一商品的进货按「日期 → 创建时间 → id」排队；销售记录按日期升序逐条处理；
 * 每条记录的出库量 = 售出 + 损耗（= 带出 − 剩余），从队首批次依次消耗，各段按**该批次自己的进货单价**计价。
 * 只有「售出」部分计入 COGS，「损耗」部分单独记 lossCost（不计入毛利）。
 * 进货库存被消耗完仍不够（先卖后记等异常）→ 超出的数量按商品维护的进货单价 purchasePrice 兜底。
 */
export function calcFifoAllocation(
  purchases: BusinessPurchase[],
  dailyRecords: BusinessDailyRecord[],
  products: BusinessProduct[] = []
): FifoAllocation {
  const round2 = (n: number): number => Math.round(n * 100) / 100
  const byProduct = new Map<string, BusinessPurchase[]>()
  for (const p of purchases ?? []) {
    if (!p?.productId) continue
    const list = byProduct.get(p.productId) ?? []
    list.push(p)
    byProduct.set(p.productId, list)
  }
  /** 每商品一条 FIFO 队列：游标 + 当前批次剩余可用量 */
  const queues = new Map<string, { list: BusinessPurchase[]; idx: number; left: number }>()
  for (const [pid, list] of byProduct) {
    const sorted = [...list].sort(fifoCompare)
    queues.set(pid, { list: sorted, idx: 0, left: sorted.length > 0 ? Math.max(0, sorted[0].quantity) : 0 })
  }

  /** 从队首依次消耗 n 件，返回切片（不修改入参） */
  function consume(productId: string, n: number): FifoSlice[] {
    const slices: FifoSlice[] = []
    let need = Math.max(0, n)
    if (need <= 0) return slices
    const q = queues.get(productId) ?? { list: [], idx: 0, left: 0 }
    while (need > 0) {
      if (q.idx >= q.list.length) {
        // 进货库存耗尽：剩余数量按商品维护的进货单价兜底
        const price = products.find(p => p.id === productId)?.purchasePrice ?? 0
        const unit = Number.isFinite(price) && price > 0 ? price : 0
        slices.push({ purchaseId: '', quantity: need, unitPrice: unit, amount: need * unit })
        need = 0
        break
      }
      const take = Math.min(q.left, need)
      if (take > 0) {
        const batch = q.list[q.idx]
        const unit = Number.isFinite(batch.unitPrice) ? batch.unitPrice : 0
        slices.push({ purchaseId: batch.id, quantity: take, unitPrice: unit, amount: take * unit })
        need -= take
        q.left -= take
      }
      if (q.left <= 0) {
        q.idx += 1
        q.left = q.idx < q.list.length ? Math.max(0, q.list[q.idx].quantity) : 0
      }
    }
    queues.set(productId, q)
    return slices
  }

  const byRecord: Record<string, Record<string, FifoItemAllocation>> = {}
  const costByRecord: Record<string, number> = {}
  const lossCostByRecord: Record<string, number> = {}
  const costByProduct: Record<string, number> = {}

  const records = [...(dailyRecords ?? [])].sort(dailyAscCompare)
  for (const r of records) {
    const perProduct: Record<string, FifoItemAllocation> = {}
    let dayCost = 0
    let dayLossCost = 0
    for (const item of r.items ?? []) {
      if (!item?.productId) continue
      const soldQty = soldCount(item)
      const lossQty = Number.isFinite(item.loss) ? Math.max(0, item.loss) : 0
      // 同一天内先结转售出、再结转损耗（两者都出库）
      const soldSlices = consume(item.productId, soldQty)
      const lossSlices = consume(item.productId, lossQty)
      const cost = soldSlices.reduce((s, x) => s + x.amount, 0)
      const lossCost = lossSlices.reduce((s, x) => s + x.amount, 0)
      perProduct[item.productId] = { soldSlices, lossSlices, cost: round2(cost), lossCost: round2(lossCost) }
      dayCost += cost
      dayLossCost += lossCost
      costByProduct[item.productId] = round2((costByProduct[item.productId] ?? 0) + cost)
    }
    byRecord[r.id] = perProduct
    costByRecord[r.id] = round2(dayCost)
    lossCostByRecord[r.id] = round2(dayLossCost)
  }

  const remainingByPurchase: Record<string, number> = {}
  const remainingByProduct: Record<string, number> = {}
  for (const [productId, q] of queues) {
    let sum = 0
    q.list.forEach((p, i) => {
      const used = i < q.idx ? Math.max(0, p.quantity) : i === q.idx ? Math.max(0, p.quantity - q.left) : 0
      const rest = Math.max(0, Math.max(0, p.quantity) - used)
      remainingByPurchase[p.id] = rest
      sum += rest
    })
    remainingByProduct[productId] = sum
  }
  return { byRecord, costByRecord, lossCostByRecord, costByProduct, remainingByPurchase, remainingByProduct }
}

/**
 * 单条销售记录的严格 FIFO 成本（COGS）。
 * 优先取结转表里的当日成本；拿不到（未纳入结转/异常）时回退 calcDailyCost（商品维护的进货单价）。
 */
export function calcDailyCostFifo(
  recordId: string,
  items: DailyRecordItem[],
  products: BusinessProduct[],
  alloc?: FifoAllocation | null
): number {
  const hit = alloc?.costByRecord?.[recordId]
  if (typeof hit === 'number' && Number.isFinite(hit)) return hit
  return calcDailyCost(items, products)
}

// ===== 待销售（在库未售出）估值 =====

export interface PendingSalesStats {
  /** 待销售数量合计（各商品单位不同，仅作参考） */
  quantity: number
  /** 待销售成本 = Σ 剩余批次数量 × 该批次进货单价（严格 FIFO 结转后） */
  cost: number
  /** 待销售营业额 = Σ 商品剩余数量 × 售价（预期收入，尚未发生） */
  revenue: number
  /** 待销售利润 = 待销售营业额 − 待销售成本 */
  profit: number
}

/** 待销售（当前库存）估值：成本按 FIFO 剩余批次的实际进货单价，营业额按商品售价 */
export function calcPendingSales(data: BusinessData, alloc?: FifoAllocation): PendingSalesStats {
  const round2 = (n: number): number => Math.round(n * 100) / 100
  const allocation = alloc ?? calcFifoAllocation(data?.purchases ?? [], data?.dailyRecords ?? [], data?.products ?? [])
  let quantity = 0
  let cost = 0
  let revenue = 0
  for (const p of data?.purchases ?? []) {
    const rest = allocation.remainingByPurchase[p.id] ?? 0
    if (rest <= 0) continue
    quantity += rest
    cost += rest * (Number.isFinite(p.unitPrice) ? p.unitPrice : 0)
    const product = (data?.products ?? []).find(x => x.id === p.productId)
    revenue += rest * (product?.sellingPrice ?? 0)
  }
  return {
    quantity,
    cost: round2(cost),
    revenue: round2(revenue),
    profit: round2(revenue - cost)
  }
}

// ===== 录入提效：上日模板 / 常用商品 =====

/** 日期键按天位移（用于「近 N 天」窗口；本地构造避免 UTC 偏移） */
export function shiftDateKey(date: string, days: number): string {
  const parts = (date ?? '').split('-').map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return date
  const dt = new Date(parts[0], parts[1] - 1, parts[2] + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** 最近的「早于 date」的销售记录（编辑当天时不会复制自己） */
export function lastDailyBefore(records: BusinessDailyRecord[], date: string): BusinessDailyRecord | null {
  return (
    (records ?? [])
      .filter(r => r.date < date)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0] ?? null
  )
}

/** 复制上日得到的商品行（带上日的商品与带出数量，剩余/损耗归零由当天重填） */
export interface DailyTemplateRow {
  productId: string
  broughtOut: number
  remaining: number
  loss: number
}

export function dailyTemplateFromLast(records: BusinessDailyRecord[], date: string): DailyTemplateRow[] {
  const last = lastDailyBefore(records, date)
  if (!last) return []
  return (last.items ?? [])
    .filter(it => it.broughtOut > 0)
    .map(it => ({ productId: it.productId, broughtOut: it.broughtOut, remaining: 0, loss: 0 }))
}

// ===== 录入校验（进货 / 销售 / 手填营业额） =====

export type IssueLevel = 'error' | 'warn'

export interface ValidationIssue {
  level: IssueLevel
  message: string
}

/** 进货录入校验：数量为 0、单价为 0、合计与关联支出汇总不符 */
export function validatePurchaseInput(input: {
  quantity: number
  unitPrice: number
  total: number
  /** 关联支出金额汇总；null/undefined = 未关联支出（合计按 数量 × 单价） */
  expenseTotal?: number | null
}): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const qty = Number.isFinite(input.quantity) ? input.quantity : 0
  const price = Number.isFinite(input.unitPrice) ? input.unitPrice : 0
  const total = Number.isFinite(input.total) ? input.total : 0
  const linked = typeof input.expenseTotal === 'number' && Number.isFinite(input.expenseTotal)
  if (qty <= 0) issues.push({ level: 'error', message: '进货数量必须 ≥ 1' })
  if (!linked && price <= 0) {
    issues.push({ level: 'error', message: '进货单价必须 > 0（若成本记在支出里，请改为关联支出记录）' })
  } else if (linked && price <= 0) {
    issues.push({ level: 'warn', message: '进价为 0：合计取自关联支出，该批单位成本按 0 参与均价计算' })
  }
  if (linked && Math.abs(total - (input.expenseTotal ?? 0)) > 0.01) {
    issues.push({
      level: 'error',
      message: `合计 ${total.toFixed(2)} 与关联支出汇总 ${(input.expenseTotal ?? 0).toFixed(2)} 不一致，请重新勾选`
    })
  }
  if (!linked && qty > 0 && price > 0 && Math.abs(total - qty * price) > 0.01) {
    issues.push({ level: 'warn', message: `合计 ${total.toFixed(2)} 与「数量 × 进价」${(qty * price).toFixed(2)} 不一致` })
  }
  return issues
}

/** 销售单行校验：剩余/损耗不得大于带出，剩余 + 损耗不得大于带出 */
export function validateDailyRow(row: {
  productId?: string
  broughtOut: number
  remaining: number
  loss: number
}): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const b = Math.max(0, Math.floor(Number.isFinite(row.broughtOut) ? row.broughtOut : 0))
  const r = Math.max(0, Math.floor(Number.isFinite(row.remaining) ? row.remaining : 0))
  const l = Math.max(0, Math.floor(Number.isFinite(row.loss) ? row.loss : 0))
  if (b === 0 && r === 0 && l === 0) {
    issues.push({ level: 'warn', message: '该行未填写带出数量，保存时不会计入营业额' })
  }
  // 三条互斥，保证一行最多一条 error（避免叠加同类提示）
  if (r + l > b) {
    issues.push({ level: 'error', message: `剩余 ${r} + 损耗 ${l} = ${r + l} 大于带出 ${b}，售出数量会为负` })
  } else if (r > b) {
    issues.push({ level: 'error', message: `剩余 ${r} 大于带出 ${b}` })
  } else if (l > b) {
    issues.push({ level: 'error', message: `损耗 ${l} 大于带出 ${b}` })
  }
  return issues
}

/** 销售全部行校验汇总（errors 阻断保存，warns 仅提示） */
export function validateDailyRows(
  rows: { productId?: string; broughtOut: number; remaining: number; loss: number }[]
): { errors: string[]; warns: string[] } {
  const errors: string[] = []
  const warns: string[] = []
  ;(rows ?? []).forEach((row, i) => {
    for (const issue of validateDailyRow(row)) {
      const text = `第 ${i + 1} 行：${issue.message}`
      if (issue.level === 'error') errors.push(text)
      else warns.push(text)
    }
  })
  return { errors, warns }
}

/** 手填营业额校验：与商品明细自动合计偏离超过阈值（默认 20%）时提示 */
export interface RevenueOverrideCheck {
  level: 'ok' | 'warn'
  diff: number // 手动 − 自动
  rate: number // 偏离率（0-1 以上）
  message: string
}

export function checkRevenueOverride(auto: number, manual: number | null, threshold = 0.2): RevenueOverrideCheck {
  const ok: RevenueOverrideCheck = { level: 'ok', diff: 0, rate: 0, message: '' }
  if (typeof manual !== 'number' || !Number.isFinite(manual)) return ok
  const base = Number.isFinite(auto) ? auto : 0
  const diff = Math.round((manual - base) * 100) / 100
  if (base <= 0) {
    return manual > 0
      ? { level: 'warn', diff, rate: 1, message: `商品明细自动合计为 0，手动值 ${manual.toFixed(2)} 将直接作为当日营业额` }
      : ok
  }
  const rate = Math.abs(diff) / base
  if (rate <= threshold) return { level: 'ok', diff, rate: Math.round(rate * 10000) / 10000, message: '' }
  return {
    level: 'warn',
    diff,
    rate: Math.round(rate * 10000) / 10000,
    message: `手动营业额与商品明细自动合计（${base.toFixed(2)}）相差 ${(rate * 100).toFixed(1)}%（${diff > 0 ? '+' : ''}${diff.toFixed(2)}），请确认是否漏填商品行或金额录错`
  }
}

// ===== 对账：进货↔支出关联 / 应收 vs 实收 / 按月账实差异 =====

/** 已关联的进货（含对应支出明细） */
export interface ExpenseLinkRow {
  purchaseId: string
  productId: string
  productName: string
  date: string
  total: number
  expenseIds: string[]
  expenseTotal: number
  /** 关联支出的日期（多笔用 / 连接，便于人工核对） */
  expenseDates: string
  /** 关联支出标签（日期 + 标题，多笔用 / 连接；同一天多笔时靠标题区分） */
  expenseLabels: string[]
  diff: number // 进货合计 − 关联支出汇总（正常为 0）
}

export interface ExpenseReconciliation {
  linked: ExpenseLinkRow[]
  /** 未关联任何支出的进货（成本只体现在 COGS，不影响对账结论，供人工确认） */
  unlinkedPurchases: { id: string; productId: string; productName: string; date: string; total: number }[]
  /** 未被任何进货关联的支出（可能漏记进货，也可能本就与进货无关）；附带其所属日容器日期便于展示 */
  unlinkedExpenses: (BusinessExpense & { date: string })[]
  linkedTotal: number
  unlinkedPurchaseTotal: number
  unlinkedExpenseTotal: number
}

/** 进货 ↔ 支出对账：已关联 / 未关联进货 / 未匹配支出 */
export function calcExpenseReconciliation(data: BusinessData): ExpenseReconciliation {
  const products = data.products ?? []
  const purchases = data.purchases ?? []
  const itemsWithDay = expenseItemsWithDay(data.expenseDailies)
  const expenses = itemsWithDay.map(x => x.item)
  const dateOf = new Map(itemsWithDay.map(x => [x.item.id, x.date]))
  const nameOf = (pid: string): string => products.find(p => p.id === pid)?.name ?? '（已删除商品）'
  const owners = expenseLinkOwners(purchases)
  const linked: ExpenseLinkRow[] = []
  const unlinkedPurchases: ExpenseReconciliation['unlinkedPurchases'] = []
  for (const p of purchases) {
    const ids = (p.expenseIds ?? []).filter(id => !!id)
    if (ids.length === 0) {
      unlinkedPurchases.push({ id: p.id, productId: p.productId, productName: nameOf(p.productId), date: p.date, total: p.total })
      continue
    }
    const picked = expenses.filter(e => ids.includes(e.id))
    const expenseTotal = sumExpenseAmounts(expenses, ids)
    linked.push({
      purchaseId: p.id,
      productId: p.productId,
      productName: nameOf(p.productId),
      date: p.date,
      total: p.total,
      expenseIds: ids,
      expenseTotal,
      expenseDates: picked.map(e => dateOf.get(e.id) ?? '').sort().join(' / '),
      expenseLabels: picked
        .slice()
        .sort((a, b) => {
          const da = dateOf.get(a.id) ?? ''
          const db = dateOf.get(b.id) ?? ''
          return da < db ? -1 : da > db ? 1 : 0
        })
        .map(e => expenseLabel(e, dateOf.get(e.id))),
      diff: Math.round((p.total - expenseTotal) * 100) / 100
    })
  }
  const unlinkedExpenses = expenses
    .filter(e => !owners.has(e.id))
    .map(e => ({ ...e, date: dateOf.get(e.id) ?? '' }))
  const round = (n: number): number => Math.round(n * 100) / 100
  return {
    linked: linked.sort((a, b) => (a.date < b.date ? 1 : -1)),
    unlinkedPurchases: unlinkedPurchases.sort((a, b) => (a.date < b.date ? 1 : -1)),
    unlinkedExpenses: unlinkedExpenses.sort((a, b) => {
      const da = dateOf.get(a.id) ?? ''
      const db = dateOf.get(b.id) ?? ''
      return da < db ? 1 : da > db ? -1 : 0
    }),
    linkedTotal: round(linked.reduce((s, r) => s + r.total, 0)),
    unlinkedPurchaseTotal: round(unlinkedPurchases.reduce((s, r) => s + r.total, 0)),
    unlinkedExpenseTotal: round(unlinkedExpenses.reduce((s, e) => s + e.amount, 0))
  }
}

/** 支出按「是否关联库存（进货）」拆分统计：已关联 = 被任意进货记录挂在 expenseIds 里 */
export interface ExpenseLinkStats {
  /** 支出总额（与 calcBusinessStats.expenseTotal 同口径） */
  total: number
  /** 已关联库存记录的支出金额 / 笔数 */
  linkedAmount: number
  linkedCount: number
  /** 未关联任何库存记录的支出金额 / 笔数（可能漏记进货，也可能本就与进货无关） */
  unlinkedAmount: number
  unlinkedCount: number
}

/**
 * 支出关联统计：把当前账本支出拆成「已关联库存」与「未关联库存」两组。
 * 归属口径与 `expenseLinkOwners` 一致（首次占用者为准），与对账页「未匹配支出」同源。
 */
export function calcExpenseLinkStats(data: BusinessData): ExpenseLinkStats {
  const purchases = data.purchases ?? []
  const expenses = flatExpenseItems(data.expenseDailies)
  const owners = expenseLinkOwners(purchases)
  const amountOf = (e: BusinessExpense): number =>
    typeof e.amount === 'number' && Number.isFinite(e.amount) ? e.amount : 0
  let linkedAmount = 0
  let linkedCount = 0
  let unlinkedAmount = 0
  let unlinkedCount = 0
  for (const e of expenses) {
    if (owners.has(e.id)) {
      linkedAmount += amountOf(e)
      linkedCount += 1
    } else {
      unlinkedAmount += amountOf(e)
      unlinkedCount += 1
    }
  }
  const round = (n: number): number => Math.round(n * 100) / 100
  return {
    total: round(linkedAmount + unlinkedAmount),
    linkedAmount: round(linkedAmount),
    linkedCount,
    unlinkedAmount: round(unlinkedAmount),
    unlinkedCount
  }
}

/** 单日应收（按商品明细自动合计）vs 实收（库内营业额，可能手动填写） */
export interface ReceivableRow {
  date: string
  receivable: number
  actual: number
  diff: number // 实收 − 应收
  manual: boolean
  transactionCount: number
}

export interface ReceivableSummary {
  rows: ReceivableRow[] // 日期倒序
  receivable: number
  actual: number
  diff: number
  manualDays: number // 手填营业额的天数
  diffDays: number // 有差异的天数
}

/** 账本维度应收/实收核对（差异来源于手填营业额、漏填商品行或售价调整） */
export function calcReceivableVsActual(data: BusinessData): ReceivableSummary {
  const products = data.products ?? []
  const rows: ReceivableRow[] = (data.dailyRecords ?? []).map(r => {
    const receivable = calcDailyRevenue(r.items, products)
    const actual = r.totalRevenue ?? 0
    return {
      date: r.date,
      receivable,
      actual,
      diff: Math.round((actual - receivable) * 100) / 100,
      manual: Math.abs(actual - receivable) > 0.005,
      transactionCount: r.transactionCount ?? 0
    }
  })
  rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  const round = (n: number): number => Math.round(n * 100) / 100
  return {
    rows,
    receivable: round(rows.reduce((s, r) => s + r.receivable, 0)),
    actual: round(rows.reduce((s, r) => s + r.actual, 0)),
    diff: round(rows.reduce((s, r) => s + r.diff, 0)),
    manualDays: rows.filter(r => r.manual).length,
    diffDays: rows.filter(r => Math.abs(r.diff) > 0.005).length
  }
}

/** 按月账实差异（严格限定在 year 年内，不跨年；无数据月份为 0） */
export interface MonthlyReconcileRow {
  month: number
  label: string
  receivable: number
  actual: number
  diff: number
  days: number
  manualDays: number
}

export function calcMonthlyReconciliation(data: BusinessData, year: number): MonthlyReconcileRow[] {
  const summary = calcReceivableVsActual(data)
  const prefix = `${year}-`
  const out: MonthlyReconcileRow[] = []
  for (let m = 1; m <= 12; m++) {
    const key = `${prefix}${String(m).padStart(2, '0')}`
    const rows = summary.rows.filter(r => r.date.startsWith(key))
    out.push({
      month: m,
      label: `${m}月`,
      receivable: Math.round(rows.reduce((s, r) => s + r.receivable, 0) * 100) / 100,
      actual: Math.round(rows.reduce((s, r) => s + r.actual, 0) * 100) / 100,
      diff: Math.round(rows.reduce((s, r) => s + r.diff, 0) * 100) / 100,
      days: rows.length,
      manualDays: rows.filter(r => r.manual).length
    })
  }
  return out
}

/** 按商品毛利行（含会员价模拟口径） */
export interface ProductProfitRow {
  productId: string
  name: string
  categoryId?: string
  categoryName: string
  unit: string
  sold: number
  revenue: number
  cost: number
  profit: number
  margin: number // 0-1 小数
  /** 该商品是否设置了会员价（决定会员价模拟是否等于售价口径） */
  hasMemberPrice: boolean
  /** 会员价模拟：售出 ×（会员价 ?? 售价） */
  memberRevenue: number
  memberProfit: number
  memberMargin: number
}

/** 按分类毛利行（含会员价模拟口径） */
export interface CategoryProfitRow {
  categoryId: string
  name: string
  sold: number
  revenue: number
  cost: number
  profit: number
  margin: number
  memberRevenue: number
  memberProfit: number
}

/** 按商品毛利报表（含会员价模拟口径）：售出 = Σ(带出 − 剩余 − 损耗)；成本按商品进货价 */
export function calcProductProfitReport(data: BusinessData): ProductProfitRow[] {
  const products = data.products ?? []
  const catName = (id?: string): string =>
    id ? (findProductCategory(data.productCategories ?? [], id)?.name ?? '未分类') : '未分类'
  const fifo = calcFifoAllocation(data.purchases ?? [], data.dailyRecords ?? [], products)
  const out: ProductProfitRow[] = []
  for (const p of products) {
    let sold = 0
    for (const r of data.dailyRecords ?? []) {
      for (const it of r.items ?? []) {
        if (it.productId === p.id) sold += soldCount(it)
      }
    }
    const revenue = Math.round(sold * p.sellingPrice * 100) / 100
    // 成本 = 严格 FIFO 逐批结转的累计售出成本
    const cost = Math.round((fifo.costByProduct[p.id] ?? 0) * 100) / 100
    const unitPrice = typeof p.memberPrice === 'number' ? p.memberPrice : p.sellingPrice
    const memberRevenue = Math.round(sold * unitPrice * 100) / 100
    out.push({
      productId: p.id,
      name: p.name,
      categoryId: p.categoryId,
      categoryName: catName(p.categoryId),
      unit: p.unit,
      sold,
      revenue,
      cost,
      profit: Math.round((revenue - cost) * 100) / 100,
      margin: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) / 10000 : 0,
      hasMemberPrice: typeof p.memberPrice === 'number',
      memberRevenue,
      memberProfit: Math.round((memberRevenue - cost) * 100) / 100,
      memberMargin: memberRevenue > 0 ? Math.round(((memberRevenue - cost) / memberRevenue) * 10000) / 10000 : 0
    })
  }
  return out.sort((a, b) => b.profit - a.profit || b.revenue - a.revenue)
}

/** 按分类毛利汇总（含会员价模拟口径；未分类归到 id 为 '' 的一组） */
export function calcCategoryProfitReport(data: BusinessData): CategoryProfitRow[] {
  const rows = calcProductProfitReport(data)
  const map = new Map<string, CategoryProfitRow>()
  for (const r of rows) {
    const key = r.categoryId ?? ''
    const cur =
      map.get(key) ??
      { categoryId: key, name: r.categoryName, sold: 0, revenue: 0, cost: 0, profit: 0, margin: 0, memberRevenue: 0, memberProfit: 0 }
    cur.sold += r.sold
    cur.revenue += r.revenue
    cur.cost += r.cost
    cur.profit += r.profit
    cur.memberRevenue += r.memberRevenue
    cur.memberProfit += r.memberProfit
    map.set(key, cur)
  }
  const round = (n: number): number => Math.round(n * 100) / 100
  return [...map.values()]
    .map(r => ({
      ...r,
      revenue: round(r.revenue),
      cost: round(r.cost),
      profit: round(r.profit),
      memberRevenue: round(r.memberRevenue),
      memberProfit: round(r.memberProfit),
      margin: r.revenue > 0 ? Math.round((r.profit / r.revenue) * 10000) / 10000 : 0
    }))
    .sort((a, b) => b.profit - a.profit)
}

// ===== 批次级库存与滞销 / 久存预警 =====

/** 两个日期键之间相差的天数（b − a，可为负） */
export function daysBetween(a: string, b: string): number {
  const pa = (a ?? '').split('-').map(Number)
  const pb = (b ?? '').split('-').map(Number)
  if (pa.length !== 3 || pb.length !== 3 || [...pa, ...pb].some(n => !Number.isFinite(n))) return 0
  const da = Date.UTC(pa[0], pa[1] - 1, pa[2])
  const db = Date.UTC(pb[0], pb[1] - 1, pb[2])
  return Math.round((db - da) / 86400000)
}

/** 单个进货批次的库存状态（基于先进先出剩余量） */
export interface BatchStockRow {
  purchaseId: string
  productId: string
  productName: string
  unit: string
  date: string
  quantity: number
  sold: number
  remaining: number
  unitPrice: number
  /** 剩余占用的资金 = 剩余 × 进货单价 */
  amount: number
  /** 入库至今的天数（库龄） */
  ageDays: number
  soldOut: boolean
  isOldest: boolean
}

/** 批次级库存：按商品聚合的 FIFO 剩余量 + 库龄 + 占用资金 */
export function calcBatchStock(data: BusinessData, today: string = localDateKey()): BatchStockRow[] {
  const status = calcPurchaseStockStatus(data.purchases ?? [], data.dailyRecords ?? [])
  const out: BatchStockRow[] = (data.purchases ?? []).map(p => {
    const st = status[p.id]
    const remaining = st ? st.remaining : p.quantity
    const product = (data.products ?? []).find(x => x.id === p.productId)
    return {
      purchaseId: p.id,
      productId: p.productId,
      productName: product?.name ?? '（已删除商品）',
      unit: product?.unit ?? '件',
      date: p.date,
      quantity: p.quantity,
      sold: st ? st.sold : 0,
      remaining,
      unitPrice: p.unitPrice,
      amount: Math.round(remaining * p.unitPrice * 100) / 100,
      ageDays: Math.max(0, daysBetween(p.date, today)),
      soldOut: st ? st.soldOut : false,
      isOldest: st ? st.isOldest : false
    }
  })
  // 未售完的排前面（在售批次优先），再按入库日期从旧到新
  return out.sort((a, b) => Number(a.soldOut) - Number(b.soldOut) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** 滞销商品：在售、当前库存 > 0，且最近 days 天内没有售出记录（从未售出也算） */
export interface SlowMovingItem {
  product: BusinessProduct
  stock: number
  /** 最近一次售出日期；null = 从未售出 */
  lastSoldDate: string | null
  /** 距最近售出已过去的天数；从未售出时为 null */
  idleDays: number | null
}

export function slowMovingProducts(
  data: BusinessData,
  days = 30,
  today: string = localDateKey()
): SlowMovingItem[] {
  const stock = calcInventory(data.products ?? [], data.purchases ?? [], data.dailyRecords ?? [])
  const lastSold = new Map<string, string>()
  for (const r of data.dailyRecords ?? []) {
    for (const it of r.items ?? []) {
      if (soldCount(it) <= 0) continue
      const cur = lastSold.get(it.productId)
      if (!cur || r.date > cur) lastSold.set(it.productId, r.date)
    }
  }
  const out: SlowMovingItem[] = []
  for (const p of data.products ?? []) {
    if (!p.active) continue
    const s = stock[p.id] ?? 0
    if (s <= 0) continue
    const last = lastSold.get(p.id) ?? null
    const idle = last ? daysBetween(last, today) : null
    if (last && idle !== null && idle <= days) continue
    out.push({ product: p, stock: s, lastSoldDate: last, idleDays: idle })
  }
  return out.sort((a, b) => (b.idleDays ?? 9999) - (a.idleDays ?? 9999) || b.stock - a.stock)
}

/** 久存（临期）批次：入库超过 agingDays 天且仍有剩余（未售完） */
export function agingBatches(data: BusinessData, agingDays = 60, today: string = localDateKey()): BatchStockRow[] {
  return calcBatchStock(data, today).filter(b => !b.soldOut && b.remaining > 0 && b.ageDays >= agingDays)
}

/** 常用商品：近 withinDays 天内「带出次数」最多的在售商品（次数相同比带出总量，再比最近日期） */
export function frequentProductIds(
  records: BusinessDailyRecord[],
  products: BusinessProduct[],
  withinDays = 30,
  today: string = localDateKey(),
  limit = 6
): string[] {
  const from = shiftDateKey(today, -(withinDays - 1))
  const stat = new Map<string, { count: number; qty: number; lastDate: string }>()
  for (const r of records ?? []) {
    if (r.date < from || r.date > today) continue
    for (const it of r.items ?? []) {
      if (it.broughtOut <= 0) continue
      const cur = stat.get(it.productId) ?? { count: 0, qty: 0, lastDate: '' }
      cur.count += 1
      cur.qty += it.broughtOut
      if (r.date > cur.lastDate) cur.lastDate = r.date
      stat.set(it.productId, cur)
    }
  }
  const active = new Set((products ?? []).filter(p => p.active).map(p => p.id))
  return [...stat.entries()]
    .filter(([pid]) => active.has(pid))
    .sort(
      (a, b) =>
        b[1].count - a[1].count ||
        b[1].qty - a[1].qty ||
        (a[1].lastDate < b[1].lastDate ? 1 : a[1].lastDate > b[1].lastDate ? -1 : 0)
    )
    .slice(0, limit)
    .map(([pid]) => pid)
}

/** 总统计：营业额 = Σ日记录收入；成本 = 纯 COGS（严格 FIFO 逐批结转，按销售记录，不计支出）；利润/毛利率；支出 = Σ支出金额 */
export interface BusinessStats {
  revenue: number
  cost: number
  profit: number
  margin: number // 0-1 小数（营业额 0 → 0）
  expenseTotal: number // Σ支出金额（全部支出记录）
  /** 待销售（在库未售出）：数量合计（单位不同仅供参考） */
  pendingQuantity: number
  /** 待销售成本 = Σ FIFO 剩余批次数量 × 该批进货单价 */
  pendingCost: number
  /** 待销售营业额 = Σ 剩余数量 × 售价 */
  pendingRevenue: number
  /** 待销售利润 = 待销售营业额 − 待销售成本 */
  pendingProfit: number
}

export function calcBusinessStats(data: BusinessData): BusinessStats {
  const revenue = data.dailyRecords.reduce((s, r) => s + r.totalRevenue, 0)
  // 成本 = 售出商品成本（COGS）：严格 FIFO——按销售日期升序，逐批从最旧进货批次结转，各段用该批次自己的进货单价
  const fifo = calcFifoAllocation(data.purchases, data.dailyRecords, data.products)
  let cost = 0
  for (const r of data.dailyRecords) {
    cost += calcDailyCostFifo(r.id, r.items, data.products, fifo)
  }
  const profit = revenue - cost
  const margin = revenue > 0 ? profit / revenue : 0
  const expenseTotal = flatExpenseItems(data.expenseDailies).reduce((s, e) => s + e.amount, 0)
  const pending = calcPendingSales(data, fifo)
  return {
    revenue: Math.round(revenue * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    margin: Math.round(margin * 10000) / 10000,
    expenseTotal: Math.round(expenseTotal * 100) / 100,
    pendingQuantity: pending.quantity,
    pendingCost: pending.cost,
    pendingRevenue: pending.revenue,
    pendingProfit: pending.profit
  }
}

/** 低库存预警清单：在售商品（停售商品不参与预警）库存 < 阈值，按库存升序 */
export interface LowStockItem {
  product: BusinessProduct
  stock: number
}

export function lowStockProducts(data: BusinessData): LowStockItem[] {
  const stock = calcInventory(data.products, data.purchases, data.dailyRecords)
  const threshold = data.settings.lowStockThreshold
  return data.products
    .filter(product => product.active)
    .map(product => ({ product, stock: stock[product.id] ?? 0 }))
    .filter(item => item.stock < threshold)
    .sort((a, b) => a.stock - b.stock)
}

// ===== 排行 / 趋势 =====

export interface ProductRankItem {
  productId: string
  name: string
  unit: string
  sold: number
  revenue: number
}

/** 商品排行：按销售额降序 → 销量降序（剔除无销售的） */
export function calcProductRanking(data: BusinessData): ProductRankItem[] {
  const acc: Record<string, { sold: number; revenue: number }> = {}
  for (const r of data.dailyRecords) {
    for (const item of r.items) {
      const sold = soldCount(item)
      if (sold <= 0) continue
      const product = data.products.find(p => p.id === item.productId)
      if (!product) continue
      const a = (acc[product.id] ??= { sold: 0, revenue: 0 })
      a.sold += sold
      a.revenue = Math.round((a.revenue + sold * product.sellingPrice) * 100) / 100
    }
  }
  return Object.entries(acc)
    .map(([productId, v]) => {
      const product = data.products.find(p => p.id === productId)!
      return { productId, name: product.name, unit: product.unit, sold: v.sold, revenue: v.revenue }
    })
    .sort((a, b) => (b.revenue === a.revenue ? b.sold - a.sold : b.revenue - a.revenue))
}

export interface CategoryRankItem {
  categoryId: string // 'uncategorized' = 未分类
  name: string
  sold: number
  revenue: number
}

/** 分类排行：商品分类维度（未分类商品归 'uncategorized'），按销售额降序 */
export function calcCategoryRanking(data: BusinessData): CategoryRankItem[] {
  const acc: Record<string, { sold: number; revenue: number }> = {}
  for (const r of data.dailyRecords) {
    for (const item of r.items) {
      const sold = soldCount(item)
      if (sold <= 0) continue
      const product = data.products.find(p => p.id === item.productId)
      if (!product) continue
      const catId = product.categoryId ?? 'uncategorized'
      const a = (acc[catId] ??= { sold: 0, revenue: 0 })
      a.sold += sold
      a.revenue = Math.round((a.revenue + sold * product.sellingPrice) * 100) / 100
    }
  }
  return Object.entries(acc)
    .map(([categoryId, v]) => {
      const cat = data.productCategories.find(c => c.id === categoryId)
      return { categoryId, name: cat?.name ?? '未分类', sold: v.sold, revenue: v.revenue }
    })
    .sort((a, b) => (b.revenue === a.revenue ? b.sold - a.sold : b.revenue - a.revenue))
}

export interface TrendPoint {
  date: string // YYYY-MM-DD 升序
  revenue: number
  cost: number
  profit: number
  transactionCount?: number // 当日交易笔数（Σ 各销售记录 transactionCount）
}

/** 近 days 天趋势（含 endDate 当天，升序）：按销售记录口径——revenue=当日销售收入；cost=当日销售 COGS（售出×进货价，缺失商品计 0）；profit=差；进货/支出不入趋势（无销售记录日全 0） */
export function calcBusinessTrend(data: BusinessData, endDate: string, days = 30): TrendPoint[] {
  if (!isValidDateKey(endDate) || days <= 0) return []
  const end = new Date(endDate + 'T00:00:00')
  const fifo = calcFifoAllocation(data.purchases, data.dailyRecords, data.products)
  const out: TrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i)
    const key = localDateKey(d)
    const dayRecords = data.dailyRecords.filter(r => r.date === key)
    const revenue = dayRecords.reduce((s, r) => s + r.totalRevenue, 0)
    const cost = dayRecords.reduce((s, r) => s + calcDailyCostFifo(r.id, r.items, data.products, fifo), 0)
    const count = dayRecords.reduce((s, r) => s + (typeof r.transactionCount === 'number' && Number.isFinite(r.transactionCount) ? r.transactionCount : 0), 0)
    const revenueR = Math.round(revenue * 100) / 100
    const costR = Math.round(cost * 100) / 100
    out.push({ date: key, revenue: revenueR, cost: costR, profit: Math.round((revenueR - costR) * 100) / 100, transactionCount: count })
  }
  return out
}

/** 月度聚合（统计模块「近 12 个月」）：严格限定在同一自然年内的 12 个月，不跨年；无数据月份全 0 */
export interface MonthlyStat {
  month: number // 1-12
  label: string // 「1月」
  revenue: number
  cost: number
  profit: number
  expense: number
  transactionCount: number
  days: number // 当月有销售记录的天数
  /** 会员价模拟营业额：Σ售出 ×（会员价 ?? 售价）（用于「如果全按会员价卖」的毛利模拟） */
  memberRevenue: number
  memberProfit: number
}

/**
 * 按自然年聚合 12 个月的营业额/成本/利润/支出/笔数。
 * 只取 date 前缀为 `YYYY-MM` 的记录（不跨年），无数据的月份返回全 0，便于图表连续展示。
 */
export function calcMonthlyStats(data: BusinessData, year: number): MonthlyStat[] {
  const round2 = (n: number): number => Math.round(n * 100) / 100
  const y = Math.floor(year)
  const records = (data?.dailyRecords ?? []).filter(r => typeof r?.date === 'string')
  const expenseItems = expenseItemsWithDay(data?.expenseDailies)
  const fifo = calcFifoAllocation(data?.purchases ?? [], data?.dailyRecords ?? [], data?.products ?? [])
  const out: MonthlyStat[] = []
  for (let m = 1; m <= 12; m++) {
    const prefix = `${y}-${String(m).padStart(2, '0')}`
    const monthRecords = records.filter(r => r.date.startsWith(prefix))
    const revenue = round2(monthRecords.reduce((s, r) => s + (typeof r.totalRevenue === 'number' && Number.isFinite(r.totalRevenue) ? r.totalRevenue : 0), 0))
    const cost = round2(monthRecords.reduce((s, r) => s + calcDailyCostFifo(r.id, r.items, data?.products ?? [], fifo), 0))
    const transactionCount = monthRecords.reduce(
      (s, r) => s + (typeof r.transactionCount === 'number' && Number.isFinite(r.transactionCount) ? r.transactionCount : 0),
      0
    )
    const expense = round2(
      expenseItems
        .filter(x => x.date.startsWith(prefix))
        .reduce((s, x) => s + (typeof x.item.amount === 'number' && Number.isFinite(x.item.amount) ? x.item.amount : 0), 0)
    )
    // 会员价模拟：售出数量 ×（会员价 ?? 售价），成本口径不变
    const memberRevenue = round2(
      monthRecords.reduce((s, r) => {
        let sub = 0
        for (const it of r.items ?? []) {
          const product = (data?.products ?? []).find(p => p.id === it.productId)
          if (!product) continue
          const unit = typeof product.memberPrice === 'number' ? product.memberPrice : product.sellingPrice
          sub += soldCount(it) * unit
        }
        return s + sub
      }, 0)
    )
    out.push({
      month: m,
      label: `${m}月`,
      revenue,
      cost,
      profit: round2(revenue - cost),
      expense,
      transactionCount,
      days: monthRecords.length,
      memberRevenue,
      memberProfit: round2(memberRevenue - cost)
    })
  }
  return out
}

/** 每日一柱堆叠分段几何（仅非零值生成；loss=亏损悬挂零下红段） */
export interface TrendSegment {
  key: 'revenue' | 'cost' | 'profit' | 'loss' | 'count' | 'count'
  x: number
  y: number
  w: number
  h: number
  value: number
}

/** 每日一柱：柱位 + 堆叠分段 + 单标签（空日无段，组件不渲染标签） */
export interface TrendDayBar {
  date: string
  x: number
  w: number
  segs: TrendSegment[]
  labelX: number
  labelY: number
  labelValue: number
}

/** 柱状图坐标（每日一柱堆叠分色：all=成本琥珀底+利润绿顶（段高和=营业额）、亏损红段悬挂零下、单标签（亏损日显负利润）；nice 天花板+底部 {1,2,5}×10^k、5 网格线、日期刻度） */
export interface TrendBarsScale {
  maxY: number
  minY: number
  zeroY: number
  gridlines: { y: number; label: string }[]
  days: TrendDayBar[]
  dayLabels: { x: number; label: string }[]
  allZero: boolean
}

export type TrendBarMode = 'all' | 'revenue' | 'profit' | 'count'

/** 金额紧凑格式（柱顶标签）：≥1万 → X.X万、≥1千 → X.Xk、其余四舍五入取整 */
export function compactAmount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 10000) return sign + Math.round(abs / 1000) / 10 + '万'
  if (abs >= 1000) return sign + Math.round(abs / 100) / 10 + 'k'
  return sign + String(Math.round(abs))
}

function niceCeil(v: number): number {
  if (v <= 0) return 0
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  for (const m of [1, 2, 5, 10]) {
    if (m * base >= v) return m * base
  }
  return Math.ceil(v)
}

export function businessTrendBars(
  series: TrendPoint[],
  width: number,
  height: number,
  mode: TrendBarMode,
  pad = 24
): TrendBarsScale | null {
  if (!Array.isArray(series) || series.length === 0 || width <= 0 || height <= 0) return null
  // 尺度口径：all → 营业额天花板 + 利润负值底部；单值模式 → 该值自身 ±
  const values =
    mode === 'all'
      ? series.flatMap(p => [p.revenue, p.profit])
      : mode === 'count'
        ? series.map(p => p.transactionCount ?? 0)
        : series.map(p => (mode === 'revenue' ? p.revenue : p.profit))
  const maxVal = Math.max(0, ...values)
  const minVal = Math.min(0, ...values)
  const allZero = maxVal <= 0 && minVal >= 0
  // nice 天花板/底部 {1,2,5}×10^k（minY 对称取 nice 底）
  const maxY = allZero ? 10 : niceCeil(maxVal)
  const minY = minVal < 0 ? -niceCeil(-minVal) : 0
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const span = maxY - minY || 1
  const yOf = (v: number) => pad + ((maxY - v) / span) * innerH
  const zeroY = yOf(0)
  const r2 = (v: number) => Math.round(v * 100) / 100
  const gridlines = Array.from({ length: 5 }, (_, i) => {
    const value = minY + (span * i) / 4
    const label = mode === 'count' ? `${Math.round(value)}笔` : formatYuan(value)
    return { y: r2(yOf(value)), label }
  })
  const n = series.length
  const dayW = innerW / n
  // 视觉放大：单柱宽上限从分组槽位 28px 提到 48px（72% 日宽）
  const barW = Math.max(2, Math.min(48, dayW * 0.72))
  const days: TrendDayBar[] = series.map((p, i) => {
    const x = pad + dayW * i + (dayW - barW) / 2
    const segs: TrendSegment[] = []
    if (mode === 'all') {
      if (p.profit >= 0) {
        // 盈利日：成本琥珀段(0→cost) + 利润绿段(cost→revenue)，段高和=营业额
        if (p.cost > 0)
          segs.push({ key: 'cost', x: r2(x), y: r2(yOf(p.cost)), w: r2(barW), h: r2(zeroY - yOf(p.cost)), value: p.cost })
        if (p.profit > 0)
          segs.push({
            key: 'profit',
            x: r2(x),
            y: r2(yOf(p.revenue)),
            w: r2(barW),
            h: r2(yOf(p.cost) - yOf(p.revenue)),
            value: p.profit
          })
      } else {
        // 亏损日：营业额全高成本色 + 亏损红段悬挂零下
        if (p.revenue > 0)
          segs.push({ key: 'cost', x: r2(x), y: r2(yOf(p.revenue)), w: r2(barW), h: r2(zeroY - yOf(p.revenue)), value: p.revenue })
        segs.push({ key: 'loss', x: r2(x), y: r2(zeroY), w: r2(barW), h: r2(yOf(p.profit) - zeroY), value: p.profit })
      }
    } else if (mode === 'revenue') {
      if (p.revenue !== 0)
        segs.push({ key: 'revenue', x: r2(x), y: r2(yOf(p.revenue)), w: r2(barW), h: r2(zeroY - yOf(p.revenue)), value: p.revenue })
    } else if (mode === 'count') {
      const cnt = p.transactionCount ?? 0
      if (cnt !== 0)
        segs.push({ key: 'count', x: r2(x), y: r2(yOf(cnt)), w: r2(barW), h: r2(zeroY - yOf(cnt)), value: cnt })
    } else if (p.profit > 0) {
      segs.push({ key: 'profit', x: r2(x), y: r2(yOf(p.profit)), w: r2(barW), h: r2(zeroY - yOf(p.profit)), value: p.profit })
    } else if (p.profit < 0) {
      segs.push({ key: 'loss', x: r2(x), y: r2(zeroY), w: r2(barW), h: r2(yOf(p.profit) - zeroY), value: p.profit })
    }
    // 单标签：count 模式显笔数；亏损日显负利润，其余显营业额（利润模式显利润）；空日无标签
    const labelValue =
      segs.length === 0
        ? 0
        : mode === 'count'
          ? (p.transactionCount ?? 0)
          : mode === 'revenue' || (mode === 'all' && p.profit >= 0)
            ? p.revenue
            : p.profit
    let labelY = zeroY
    if (segs.length > 0) {
      if (labelValue < 0) {
        const bottom = Math.max(...segs.map(s => s.y + s.h))
        labelY = bottom + 11
      } else {
        const top = Math.min(...segs.map(s => s.y))
        labelY = top - 4
      }
    }
    return { date: p.date, x: r2(x), w: r2(barW), segs, labelX: r2(x + barW / 2), labelY: r2(labelY), labelValue }
  })
  const labelEvery = Math.max(1, Math.ceil(n / 6))
  const dayLabels = series
    .map((p, i) => ({ x: r2(pad + dayW * i + dayW / 2), label: p.date.slice(5) }))
    .filter((_, i) => i % labelEvery === 0 || i === n - 1)
  return { maxY, minY, zeroY: r2(zeroY), gridlines, days, dayLabels, allZero }
}

// ===== P0/P1/P2 新增纯函数 =====

/** 加价率 = (售价 - 进价) / 进价 × 100%（进价 0 → Infinity 用 null 表示无法计算） */
export function calcMarkupRate(sellingPrice: number, purchasePrice: number): number | null {
  if (purchasePrice <= 0) return null
  return Math.round(((sellingPrice - purchasePrice) / purchasePrice) * 10000) / 100
}

/** P0-1：销售记录结构化商品明细行 */
export interface DailyItemDetail {
  productId: string
  name: string
  unit: string
  broughtOut: number
  remaining: number
  loss: number
  sold: number
  sellingPrice: number
  subtotal: number
  deleted: boolean
}

/** 计算销售记录的结构化商品明细行列表 */
export function calcDailyItemDetails(
  record: BusinessDailyRecord,
  products: BusinessProduct[]
): DailyItemDetail[] {
  return record.items.map(item => {
    const product = findProduct(products, item.productId)
    const sold = soldCount(item)
    const sellingPrice = product?.sellingPrice ?? 0
    return {
      productId: item.productId,
      name: product?.name ?? '（已删除商品）',
      unit: product?.unit ?? '件',
      broughtOut: item.broughtOut,
      remaining: item.remaining,
      loss: item.loss,
      sold,
      sellingPrice,
      subtotal: Math.round(sold * sellingPrice * 100) / 100,
      deleted: !product
    }
  })
}

/** P1-1：分类→商品树状排行节点 */
export interface CategoryProductRankNode {
  categoryId: string
  categoryName: string
  categoryRevenue: number
  categorySold: number
  products: ProductRankItem[]
}

/** 计算分类→商品树状排行（分类按销售额降序，商品取 top N） */
export function calcCategoryProductRanking(data: BusinessData, topN = 5): CategoryProductRankNode[] {
  const catRank = calcCategoryRanking(data)
  const prodRank = calcProductRanking(data)
  // 按分类 id 归组商品排行
  const byCat: Record<string, ProductRankItem[]> = {}
  for (const p of prodRank) {
    const product = data.products.find(pr => pr.id === p.productId)
    const catId = product?.categoryId ?? 'uncategorized'
    ;(byCat[catId] ??= []).push(p)
  }
  return catRank.map(cat => ({
    categoryId: cat.categoryId,
    categoryName: cat.name,
    categoryRevenue: cat.revenue,
    categorySold: cat.sold,
    products: (byCat[cat.categoryId] ?? []).slice(0, topN)
  }))
}

/** P2-1：支出趋势点 */
export interface ExpenseTrendPoint {
  date: string
  amount: number
}

/** 近 days 天支出趋势（含 endDate 当天，升序） */
export function calcExpenseTrend(data: BusinessData, endDate: string, days = 30): ExpenseTrendPoint[] {
  if (!isValidDateKey(endDate) || days <= 0) return []
  const end = new Date(endDate + 'T00:00:00')
  const items = expenseItemsWithDay(data.expenseDailies)
  const out: ExpenseTrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i)
    const key = localDateKey(d)
    const amount = items
      .filter(x => x.date === key)
      .reduce((s, x) => s + (typeof x.item.amount === 'number' && Number.isFinite(x.item.amount) ? x.item.amount : 0), 0)
    out.push({ date: key, amount: Math.round(amount * 100) / 100 })
  }
  return out
}

/** P2-1：支出分类占比 */
export interface ExpenseCategoryBreakdown {
  categoryId: string
  name: string
  amount: number
  percent: number // 0-100
}

/** 计算各支出分类金额占比 */
export function calcExpenseCategoryBreakdown(data: BusinessData): ExpenseCategoryBreakdown[] {
  const expenses = flatExpenseItems(data.expenseDailies)
  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const byCat: Record<string, number> = {}
  for (const e of expenses) {
    byCat[e.categoryId] = (byCat[e.categoryId] ?? 0) + e.amount
  }
  return Object.entries(byCat)
    .map(([categoryId, amount]) => {
      const cat = data.expenseCategories.find(c => c.id === categoryId)
      return {
        categoryId,
        name: cat?.name ?? '未知',
        amount: Math.round(amount * 100) / 100,
        percent: total > 0 ? Math.round((amount / total) * 10000) / 100 : 0
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

/** P2-1：分类营业额占比 */
export interface CategoryRevenueBreakdown {
  categoryId: string
  name: string
  revenue: number
  percent: number // 0-100
}

/** 计算各商品分类营业额占比 */
export function calcCategoryRevenueBreakdown(data: BusinessData): CategoryRevenueBreakdown[] {
  const catRank = calcCategoryRanking(data)
  const total = catRank.reduce((s, c) => s + c.revenue, 0)
  return catRank.map(cat => ({
    categoryId: cat.categoryId,
    name: cat.name,
    revenue: cat.revenue,
    percent: total > 0 ? Math.round((cat.revenue / total) * 10000) / 100 : 0
  }))
}

/** P2-2：商品聚合摘要 */
export interface ProductSummary {
  product: BusinessProduct | null
  totalPurchased: number
  totalBroughtOut: number
  totalSold: number
  totalLoss: number
  currentStock: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  recentPurchases: BusinessPurchase[]
  recentDailyRecords: BusinessDailyRecord[]
}

/** 计算商品聚合摘要（进货/带出/售出/损耗/库存/营业额/成本/利润 + 最近记录） */
export function calcProductSummary(data: BusinessData, productId: string): ProductSummary {
  const product = data.products.find(p => p.id === productId) ?? null
  const stock = calcInventory(data.products, data.purchases, data.dailyRecords)
  const fifo = calcFifoAllocation(data.purchases, data.dailyRecords, data.products)
  const purchases = data.purchases.filter(p => p.productId === productId)
  const dailyRecords = data.dailyRecords.filter(r => r.items.some(it => it.productId === productId))

  let totalPurchased = 0
  for (const p of purchases) totalPurchased += p.quantity

  let totalBroughtOut = 0
  let totalSold = 0
  let totalLoss = 0
  let totalRevenue = 0
  for (const r of dailyRecords) {
    for (const item of r.items) {
      if (item.productId !== productId) continue
      totalBroughtOut += item.broughtOut
      totalLoss += item.loss
      const sold = soldCount(item)
      totalSold += sold
      totalRevenue = Math.round((totalRevenue + sold * (product?.sellingPrice ?? 0)) * 100) / 100
    }
  }

  // 总成本 = 严格 FIFO 逐批结转的累计售出成本
  const totalCost = Math.round((fifo.costByProduct[productId] ?? 0) * 100) / 100

  const recentPurchases = sortPurchases(purchases).slice(0, 5)
  const recentDailyRecords = sortDailyRecords(dailyRecords).slice(0, 5)

  return {
    product,
    totalPurchased,
    totalBroughtOut,
    totalSold,
    totalLoss,
    currentStock: stock[productId] ?? 0,
    totalRevenue,
    totalCost,
    totalProfit: Math.round((totalRevenue - totalCost) * 100) / 100,
    recentPurchases,
    recentDailyRecords
  }
}

/** P1-2：库存溯源明细（某商品的进货记录 + 销售带出记录） */
export interface InventorySourcePurchase {
  type: 'purchase'
  id: string
  date: string
  quantity: number
  unitPrice: number
  total: number
}

export interface InventorySourceDaily {
  type: 'daily'
  id: string
  date: string
  broughtOut: number
  remaining: number
  loss: number
  sold: number
}

export type InventorySource = InventorySourcePurchase | InventorySourceDaily

/** 获取某商品的库存溯源记录（按日期降序混合排列） */
export function calcInventorySources(
  productId: string,
  purchases: BusinessPurchase[],
  dailyRecords: BusinessDailyRecord[]
): InventorySource[] {
  const sources: InventorySource[] = []
  for (const p of purchases) {
    if (p.productId !== productId) continue
    sources.push({ type: 'purchase', id: p.id, date: p.date, quantity: p.quantity, unitPrice: p.unitPrice, total: p.total })
  }
  for (const r of dailyRecords) {
    const item = r.items.find(it => it.productId === productId)
    if (!item) continue
    sources.push({
      type: 'daily',
      id: r.id,
      date: r.date,
      broughtOut: item.broughtOut,
      remaining: item.remaining,
      loss: item.loss,
      sold: soldCount(item)
    })
  }
  return sources.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

// ===== 账本（最外层数据容器：按自然年创建，同一年份可有多个账本，年内序号唯一） =====

/** 当前自然年（可注入便于单测） */
export function currentYear(d: Date = new Date()): number {
  return d.getFullYear()
}

function padSeq(n: number): string {
  return String(n).padStart(2, '0')
}

/** 账本默认名称：同年第 1 本「YYYY年账本」，第 2 本起「YYYY年账本（02）」 */
export function ledgerDefaultName(year: number, seq: number = 1): string {
  const s = Math.max(1, Math.floor(seq))
  return s <= 1 ? `${year}年账本` : `${year}年账本（${padSeq(s)}）`
}

/** 账本编号：「YYYY-NN」（年份 + 两位年内序号），唯一且可读；缺失 seq 时按 1 处理 */
export function ledgerCodeOf(ledger: Pick<BusinessLedger, 'year' | 'seq'>): string {
  if (!ledger || typeof ledger.year !== 'number') return ''
  const seq = typeof ledger.seq === 'number' && Number.isFinite(ledger.seq) && ledger.seq >= 1 ? Math.floor(ledger.seq) : 1
  return `${ledger.year}-${padSeq(seq)}`
}

/** 某年份下一个可用的账本序号（已有最大序号 + 1；无账本时为 1） */
export function nextLedgerSeq(list: BusinessLedger[], year: number): number {
  let max = 0
  for (const l of list ?? []) {
    if (l.year !== year) continue
    const s = typeof l.seq === 'number' && Number.isFinite(l.seq) ? Math.floor(l.seq) : 0
    if (s > max) max = s
  }
  return max + 1
}

/** 账本排序：年份倒序（新年份在前），同年份按序号升序（先建的在前） */
export function sortedLedgers(list: BusinessLedger[]): BusinessLedger[] {
  return [...list].sort((a, b) => (b.year - a.year) || (a.seq - b.seq))
}

/** 查找某年份的账本：同年份多本时取序号最小的一本（最早的账本） */
export function findLedgerByYear(list: BusinessLedger[], year: number): BusinessLedger | undefined {
  return sortedLedgers(list ?? []).find(l => l.year === year)
}

export function hasLedgerForYear(list: BusinessLedger[], year: number): boolean {
  return !!findLedgerByYear(list, year)
}

/** 默认选中：优先当前年账本，其次年份最大的账本 */
export function pickDefaultLedger(list: BusinessLedger[], year: number = currentYear()): BusinessLedger | undefined {
  return findLedgerByYear(list, year) ?? sortedLedgers(list)[0]
}

/** 归一化单个账本：年份非法视为脏数据丢弃，其余字段逐项兜底 */
export function normalizeLedger(raw: unknown): BusinessLedger | null {
  if (raw === null || typeof raw !== 'object') return null
  const l = raw as Record<string, unknown>
  const rawYear = typeof l.year === 'number' ? l.year : Number(l.year)
  if (!Number.isFinite(rawYear)) return null
  const year = Math.floor(rawYear)
  if (year < LEDGER_YEAR_MIN || year > LEDGER_YEAR_MAX) return null
  const createdAt = typeof l.createdAt === 'string' && l.createdAt ? l.createdAt : new Date().toISOString()
  const rawSeq = typeof l.seq === 'number' ? l.seq : Number(l.seq)
  const seq = Number.isFinite(rawSeq) && Math.floor(rawSeq) >= 1 ? Math.floor(rawSeq) : 1
  return {
    id: typeof l.id === 'string' && l.id ? l.id : newId(LEDGER_ID_PREFIX),
    year,
    seq,
    name: (typeof l.name === 'string' && l.name.trim() ? l.name.trim() : ledgerDefaultName(year, seq)).slice(0, 30),
    createdAt,
    updatedAt: typeof l.updatedAt === 'string' && l.updatedAt ? l.updatedAt : createdAt,
    data: normalizeBusinessData(l.data)
  }
}

/**
 * 归一化存储结构（幂等）：
 * - 新结构（含 ledgers 数组）→ 逐项归一，**按「年份 + 年内序号」唯一**；
 *   缺失 / 冲突 / 非法的 seq 会被自动补发（同年多账本迁移旧数据时不会丢账本），
 *   currentLedgerId 失效时回落默认账本
 * - 旧结构（v1 扁平 BusinessData，无 ledgers）→ 整体迁入一个「当前年账本」（seq=1），历史数据不丢
 */
export function normalizeBusinessStore(raw: unknown): BusinessStoreData {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { schemaVer: BUSINESS_STORE_SCHEMA_VER, ledgers: [], currentLedgerId: '' }
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.ledgers)) {
    // 旧数据迁移：把整个扁平业务数据作为当前年账本的 data
    const year = currentYear()
    const now = new Date().toISOString()
    const ledger: BusinessLedger = {
      id: newId(LEDGER_ID_PREFIX),
      year,
      seq: 1,
      name: ledgerDefaultName(year),
      createdAt: now,
      updatedAt: now,
      data: normalizeBusinessData(raw)
    }
    return { schemaVer: BUSINESS_STORE_SCHEMA_VER, ledgers: [ledger], currentLedgerId: ledger.id }
  }
  // 按（年份 + 序号）唯一：旧数据无 seq 一律补 1；序号冲突时顺延补发，保证同年份可共存多本
  const taken = new Set<string>()
  const yearMaxSeq = new Map<number, number>()
  const ledgers: BusinessLedger[] = []
  for (const item of r.ledgers) {
    const l = normalizeLedger(item)
    if (!l) continue
    let seq = l.seq
    const keyOf = (s: number) => `${l.year}#${s}`
    if (taken.has(keyOf(seq))) {
      const next = (yearMaxSeq.get(l.year) ?? 0) + 1
      seq = next
    }
    taken.add(keyOf(seq))
    yearMaxSeq.set(l.year, Math.max(yearMaxSeq.get(l.year) ?? 0, seq))
    ledgers.push(seq === l.seq ? l : { ...l, seq })
  }
  const sorted = sortedLedgers(ledgers)
  const wanted = typeof r.currentLedgerId === 'string' ? r.currentLedgerId : ''
  const currentLedgerId = sorted.some(l => l.id === wanted) ? wanted : (pickDefaultLedger(sorted)?.id ?? '')
  return { schemaVer: BUSINESS_STORE_SCHEMA_VER, ledgers: sorted, currentLedgerId }
}

export type LedgerOpResult =
  | { ok: true; reason: 'ok'; ledgers: BusinessLedger[]; ledger: BusinessLedger }
  | { ok: false; reason: 'invalid-year' | 'empty-name' }

/**
 * 新建账本：**同一年份允许创建多个**，年内序号 seq 自动分配（该年份已有最大序号 + 1），
 * 编号 = 「年份-序号」（如 2026-02），账本只记录该年份的数据。
 * 年份非法 / 名称空白 返回失败原因，由 UI 给出明确提示。
 * 名称可留空（自动用「YYYY年账本（NN）」）。不改入参，返回新列表（已按年份倒序、同年份序号升序）。
 */
export function createLedger(list: BusinessLedger[], year: number, name?: string): LedgerOpResult {
  const rawYear = typeof year === 'number' ? year : Number(year)
  if (!Number.isFinite(rawYear)) return { ok: false, reason: 'invalid-year' }
  const y = Math.floor(rawYear)
  if (y < LEDGER_YEAR_MIN || y > LEDGER_YEAR_MAX) return { ok: false, reason: 'invalid-year' }
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (typeof name === 'string' && name.length > 0 && !trimmed) return { ok: false, reason: 'empty-name' }
  const seq = nextLedgerSeq(list ?? [], y)
  const now = new Date().toISOString()
  const ledger: BusinessLedger = {
    id: newId(LEDGER_ID_PREFIX),
    year: y,
    seq,
    name: (trimmed || ledgerDefaultName(y, seq)).slice(0, 30),
    createdAt: now,
    updatedAt: now,
    data: emptyBusinessData()
  }
  return { ok: true, reason: 'ok', ledgers: sortedLedgers([...list, ledger]), ledger }
}

/**
 * 重命名账本：仅修改 name（自动补 updatedAt），编号（年份-序号）与年份不变。
 * 名称空白 / 账本不存在返回失败原因，由 UI 给出明确提示。不改入参。
 */
export type LedgerRenameResult =
  | { ok: true; reason: 'ok'; ledgers: BusinessLedger[]; ledger: BusinessLedger }
  | { ok: false; reason: 'not-found' | 'empty-name' }

export function renameLedger(
  list: BusinessLedger[],
  id: string,
  name: string
): LedgerRenameResult {
  const index = (list ?? []).findIndex(l => l.id === id)
  if (index === -1) return { ok: false, reason: 'not-found' }
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) return { ok: false, reason: 'empty-name' }
  const target = list[index]
  const ledger: BusinessLedger = {
    ...target,
    name: trimmed.slice(0, 30),
    updatedAt: new Date().toISOString()
  }
  const ledgers = [...list]
  ledgers[index] = ledger
  return { ok: true, reason: 'ok', ledgers, ledger }
}

/** 日期（YYYY-MM-DD）所属年份；空 / 非法返回 null */
export function yearOfDate(date: string): number | null {
  if (typeof date !== 'string') return null
  const y = Number(date.slice(0, 4))
  return Number.isFinite(y) && date.length >= 4 ? Math.floor(y) : null
}

/** 日期是否属于该账本的年份 */
export function isDateInLedgerYear(date: string, ledgerYear: number): boolean {
  const y = yearOfDate(date)
  return y !== null && y === ledgerYear
}

/** 跨年写入提示文案（store 写入守卫与 UI 共用同一口径） */
export function crossYearMessage(date: string, ledgerYear: number): string {
  const y = yearOfDate(date)
  return `账本编号 ${ledgerYear}-… 只记录 ${ledgerYear} 年的数据，${date} 属于 ${y ?? '未知'} 年；请切换到 ${y ?? '对应'} 年的账本后再录入`
}

/** 写入结果：跨年 / 无账本时拒绝写入（不改数据） */
export type LedgerWriteResult =
  | { ok: true; reason: 'ok' }
  | { ok: false; reason: 'cross-year' | 'no-ledger'; message: string }

/** 跨年写入守卫：日期不在当前账本年份 → 拒绝并给出提示（纯函数，便于单测） */
export function checkLedgerYearWrite(date: string, ledgerYear: number | null | undefined): LedgerWriteResult {
  if (ledgerYear === null || ledgerYear === undefined || !Number.isFinite(ledgerYear)) {
    return { ok: false, reason: 'no-ledger', message: '请先创建账本，再录入数据' }
  }
  if (isDateInLedgerYear(date, ledgerYear)) return { ok: true, reason: 'ok' }
  return { ok: false, reason: 'cross-year', message: crossYearMessage(date, ledgerYear) }
}

/** 账本内数据是否有内容（用于空状态文案判断） */
export function isLedgerEmpty(data: BusinessData): boolean {
  return (
    !data.products.length &&
    !data.purchases.length &&
    !data.dailyRecords.length &&
    !data.expenseDailies.length
  )
}

// ===== 账本合并（云同步 business.json 用；与 genealogyCore.mergeFamily 一样放在领域 core 内） =====

/** 按 id 并集：本地先入 map，同 id 时远端仅在 tsKey 更新时胜出（本地优先，与云同步 mergeById 同语义） */
function mergeByIdKeepNewest<T>(local: T[] | undefined, remote: T[] | undefined, idKey: keyof T, tsKey?: keyof T): T[] {
  const map = new Map<string, T>()
  for (const item of local ?? []) map.set(String(item[idKey]), item)
  for (const item of remote ?? []) {
    const id = String(item[idKey])
    const existing = map.get(id)
    if (!existing) {
      map.set(id, item)
    } else if (tsKey) {
      const lTs = existing[tsKey]
      const rTs = item[tsKey]
      const rNewer =
        typeof lTs === 'number' && typeof rTs === 'number'
          ? rTs > lTs
          : typeof lTs === 'string' && typeof rTs === 'string'
            ? rTs > lTs
            : false
      if (rNewer) map.set(id, item)
    }
  }
  return [...map.values()]
}

/** 销售记录按日期唯一：同 date 只保留 updatedAt（缺失取 createdAt）最新的一条 */
function dedupeDailyByDate(records: BusinessDailyRecord[]): BusinessDailyRecord[] {
  const map = new Map<string, BusinessDailyRecord>()
  for (const item of records) {
    const existing = map.get(item.date)
    if (!existing) {
      map.set(item.date, item)
      continue
    }
    const exTs = existing.updatedAt ?? existing.createdAt ?? ''
    const ts = item.updatedAt ?? item.createdAt ?? ''
    if (ts > exTs) map.set(item.date, item)
  }
  return [...map.values()]
}

/** 单个账本内的业务数据合并（分类同 id 取本地；实体按时间戳较新者胜；销售按日期去重） */
function mergeLedgerData(l: BusinessData | undefined, r: BusinessData | undefined): BusinessData {
  return {
    productCategories: mergeByIdKeepNewest(l?.productCategories, r?.productCategories, 'id'),
    expenseCategories: mergeByIdKeepNewest(l?.expenseCategories, r?.expenseCategories, 'id'),
    products: mergeByIdKeepNewest(l?.products, r?.products, 'id', 'createdAt'),
    purchases: mergeByIdKeepNewest(l?.purchases, r?.purchases, 'id', 'createdAt'),
    dailyRecords: dedupeDailyByDate(mergeByIdKeepNewest(l?.dailyRecords, r?.dailyRecords, 'id', 'updatedAt')),
    expenseDailies: mergeByIdKeepNewest(l?.expenseDailies, r?.expenseDailies, 'id', 'updatedAt'),
    // 档口设置是单例对象、无时间戳可比 → 本地优先，缺失时取远端，都没有才回默认
    settings: l?.settings ?? r?.settings ?? emptyBusinessData().settings
  }
}

/** 账本删除保护判定：不存在 / 最后一个 / 当前正在使用 → 禁止删除（UI 据此禁用按钮并给出原因） */
export type LedgerDeleteGuard = 'ok' | 'not-found' | 'is-current' | 'last-one'

/** 账本删除范围：records = 仅清空交易流水（保留商品/分类/账本设置）；ledger = 连同账本一并删除 */
export type LedgerDeleteScope = 'records' | 'ledger'

export type LedgerMutateResult =
  | { ok: true; reason: 'ok'; ledgers: BusinessLedger[]; ledger: BusinessLedger }
  | { ok: false; reason: 'not-found' | 'is-current' | 'last-one' }

/** 账本内数据条数（用于删除前的关联数据提示；商品属主数据，单独列出） */
export function ledgerRecordCounts(data: BusinessData | undefined): {
  products: number
  purchases: number
  dailyRecords: number
  expenseDailies: number
} {
  return {
    products: data?.products?.length ?? 0,
    purchases: data?.purchases?.length ?? 0,
    dailyRecords: data?.dailyRecords?.length ?? 0,
    expenseDailies: data?.expenseDailies?.length ?? 0
  }
}

/** 删前守卫：账本不存在 / 仅剩最后一个（至少保留一个）/ 当前正在使用（需先切换） → 不可删 */
export function ledgerDeleteGuard(
  list: BusinessLedger[],
  id: string,
  currentLedgerId: string
): LedgerDeleteGuard {
  const target = list.find(l => l.id === id)
  if (!target) return 'not-found'
  if (list.length <= 1) return 'last-one'
  if (currentLedgerId && target.id === currentLedgerId) return 'is-current'
  return 'ok'
}

/** 清空某账本的交易流水（进货/销售/支出），保留商品、分类与账本设置；不改入参 */
export function clearLedgerRecords(list: BusinessLedger[], id: string, now: string = new Date().toISOString()): LedgerMutateResult {
  const index = list.findIndex(l => l.id === id)
  if (index === -1) return { ok: false, reason: 'not-found' }
  const target = list[index]
  const ledger: BusinessLedger = {
    ...target,
    updatedAt: now,
    data: { ...target.data, purchases: [], dailyRecords: [], expenseDailies: [] }
  }
  const ledgers = [...list]
  ledgers[index] = ledger
  return { ok: true, reason: 'ok', ledgers, ledger }
}

/** 删除账本整体（含其下全部数据）；受 ledgerDeleteGuard 保护，不改入参 */
export function deleteLedger(list: BusinessLedger[], id: string, currentLedgerId: string): LedgerMutateResult {
  const guard = ledgerDeleteGuard(list, id, currentLedgerId)
  if (guard !== 'ok') return { ok: false, reason: guard }
  const target = list.find(l => l.id === id) as BusinessLedger
  const ledgers = sortedLedgers(list.filter(l => l.id !== id))
  return { ok: true, reason: 'ok', ledgers, ledger: target }
}
/**
 * 账本容器合并（business.json 信封专用，幂等）：
 * - 两侧先经 normalizeBusinessStore 归一（旧扁平信封自动迁入当年账本），确保拿到的一定是 v2 结构；
 * - 账本按「年份 + 年内序号」并集而非 id —— 不同设备各自创建的同年账本 id 不同，按 id 并集会拆成多本；
 *   同年同序号的账本合并为一本（本地优先），不同序号各自保留（支持同年多账本）；
 * - 同年同序号账本：外壳取本地（id/name 本地优先），业务数据走 mergeLedgerData 逐字段并集；
 * - currentLedgerId：本地选中优先，失效回落远端，再回落默认（当前年 → 最大年份）。
 */
export function mergeBusinessStore(
  l: BusinessStoreData | BusinessData | undefined,
  r: BusinessStoreData | BusinessData | undefined
): BusinessStoreData {
  const ll = normalizeBusinessStore(l)
  const rr = normalizeBusinessStore(r)
  const byKey = new Map<string, BusinessLedger>()
  // 本地先入 map → 同年同序号冲突时 existing 恒为本地账本（本地优先）
  for (const ledger of [...ll.ledgers, ...rr.ledgers]) {
    const key = `${ledger.year}#${ledger.seq}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, ledger)
      continue
    }
    byKey.set(key, {
      id: existing.id,
      year: ledger.year,
      seq: ledger.seq,
      name: existing.name,
      createdAt: existing.createdAt < ledger.createdAt ? existing.createdAt : ledger.createdAt,
      updatedAt: existing.updatedAt > ledger.updatedAt ? existing.updatedAt : ledger.updatedAt,
      data: mergeLedgerData(existing.data, ledger.data)
    })
  }
  const ledgers = sortedLedgers([...byKey.values()])
  const wanted = ll.currentLedgerId || rr.currentLedgerId || ''
  const currentLedgerId = ledgers.some(x => x.id === wanted) ? wanted : (pickDefaultLedger(ledgers)?.id ?? '')
  return { schemaVer: BUSINESS_STORE_SCHEMA_VER, ledgers, currentLedgerId }
}
