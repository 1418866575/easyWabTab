// 摆摊进销存纯逻辑引擎（销售记账业务核心）
// 零 vue/pinia/DOM 依赖（node --experimental-strip-types 可测）：数据归一化/种子分类/双分类 CRUD
// 结果计算/库存/日收入/统计/排行/趋势坐标。组件与 store 禁止内联重算本模块公式。
import { DEFAULT_BUSINESS_EXPENSE_CATEGORIES, DEFAULT_BUSINESS_PRODUCT_CATEGORIES } from '../types/index.ts'
import type {
  BusinessDailyRecord,
  BusinessData,
  BusinessExpense,
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
export const ID_PREFIX = { product: 'bp_', productCat: 'bpc_', expense: 'be_', expenseCat: 'bec_', purchase: 'bpr_', daily: 'bd_' } as const

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
    expenses: [],
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
      isBuiltIn: c.isBuiltIn === true || BUSINESS_EXPENSE_BUILTIN_IDS.includes(c.id)
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
    unit: typeof p.unit === 'string' ? p.unit.trim().slice(0, 8) || '件' : '件',
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

// ===== 进货优化：关联支出 + 数量/单价双向联动 =====

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

/** 可选支出项：linkedPurchaseId 为空表示可选，非空表示已被该进货记录占用（编辑自身时不算冲突） */
export interface ExpenseLinkOption {
  expense: BusinessExpense
  linkedPurchaseId?: string
  /** 展示标签：`YYYY-MM-DD 标题`（同一天多笔时用于区分） */
  label: string
}

/** 支出候选列表（日期倒序，同日按创建时间倒序）；已被其它进货占用的支出带 linkedPurchaseId，UI 据此禁用并标注关联商品 */
export function selectableExpenses(
  expenses: BusinessExpense[],
  purchases: BusinessPurchase[],
  editingId?: string | null
): ExpenseLinkOption[] {
  const owners = expenseLinkOwners(purchases ?? [])
  return [...(expenses ?? [])]
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
    })
    .map(e => {
      const owner = owners.get(e.id)
      return { expense: e, linkedPurchaseId: owner && owner !== editingId ? owner : undefined, label: expenseLabel(e) }
    })
}

/** 合计 ÷ 数量 = 单价；合计为 0 或数量 ≤ 0（除零）→ null（调用方保持原值，不写 NaN/Infinity） */
export function deriveUnitPrice(total: number, quantity: number): number | null {
  if (!(total > 0) || !(quantity > 0)) return null
  return Math.round((total / quantity) * 100) / 100
}

/** 合计 ÷ 单价 = 数量（取整，至少 1）；合计为 0 或单价 ≤ 0（除零）→ null */
export function deriveQuantity(total: number, unitPrice: number): number | null {
  if (!(total > 0) || !(unitPrice > 0)) return null
  return Math.max(1, Math.round(total / unitPrice))
}

/** 归一化关联支出 id：去空、去重、保持顺序（非法输入 → 空数组） */
export function normalizeExpenseIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return Array.from(new Set(ids.filter((x): x is string => typeof x === 'string' && !!x)))
}

/** 未关联支出时的常规合计：数量 × 单价（两位小数） */
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

/** 支出展示标签：`YYYY-MM-DD 标题`（同一天多笔时用它区分） */
export function expenseLabel(e: BusinessExpense): string {
  const title = typeof e?.title === 'string' && e.title.trim() ? e.title.trim() : DEFAULT_EXPENSE_TITLE
  return `${e?.date ?? ''} ${title}`
}

/** 单笔支出录入校验（标题必填且不超长 / 金额 > 0 / 分类必选） */
export function validateExpenseRow(row: {
  title?: string
  categoryId?: string
  amount?: number | string
}): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const amount = Number(row.amount)
  if (!title) issues.push({ level: 'error', message: '请填写支出标题' })
  else if (title.length > EXPENSE_TITLE_MAX) {
    issues.push({ level: 'error', message: `标题不能超过 ${EXPENSE_TITLE_MAX} 个字` })
  }
  if (!row.categoryId) issues.push({ level: 'error', message: '请选择支出分类' })
  if (!Number.isFinite(amount) || amount <= 0) issues.push({ level: 'error', message: '支出金额必须 > 0' })
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

function normExpense(raw: unknown, categories?: BusinessExpenseCategory[]): BusinessExpense | null {
  if (raw === null || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (typeof e.id !== 'string' || !e.id) return null
  if (typeof e.date !== 'string' || !isValidDateKey(e.date)) return null
  if (typeof e.categoryId !== 'string' || !e.categoryId) return null
  const categoryName = categories?.find(c => c.id === e.categoryId)?.name
  return {
    id: e.id,
    // 历史数据无 title → 用分类名兜底，再退回「未命名支出」（保证兼容且可读）
    title: normalizeExpenseTitle(e.title, categoryName),
    date: e.date,
    categoryId: e.categoryId,
    amount: Math.max(0, numOf(e.amount)),
    note: typeof e.note === 'string' && e.note.trim() ? e.note.trim().slice(0, 100) : undefined,
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date(0).toISOString()
  }
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
    expenses: Array.isArray(data.expenses)
      ? (data.expenses.map(e => normExpense(e, normalizeExpenseCategories(data.expenseCategories))).filter(Boolean) as BusinessExpense[])
      : [],
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

/** 新增支出分类（自定义 bec_ 前缀） */
export function addExpenseCategory(list: BusinessExpenseCategory[], name: string): CategoryOpResult<BusinessExpenseCategory> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (isCategoryNameTaken(trimmed, '', list)) return { ok: false, reason: 'duplicate' }
  const next: BusinessExpenseCategory = {
    id: newId(ID_PREFIX.expenseCat),
    name: trimmed.slice(0, 20),
    sortOrder: list.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1,
    visible: true,
    isBuiltIn: false
  }
  return { ok: true, reason: 'ok', list: [...list, next] }
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

export function sortExpenses(expenses: BusinessExpense[]): BusinessExpense[] {
  return [...expenses].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
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

/** 日记录成本（纯 COGS）：Σ 销售数量 × 商品进货价（商品已删除计 0，与 calcBusinessStats 同口径） */
export function calcDailyCost(items: DailyRecordItem[], products: BusinessProduct[]): number {
  let total = 0
  for (const item of items) {
    const product = products.find(p => p.id === item.productId)
    total += soldCount(item) * (product?.purchasePrice ?? 0)
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

/** 带出合计：按商品 Σ带出数量（跨全部收摊记录） */
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

/** 按商品累计售出数量（收摊记录口径：带出 − 剩余 − 损耗） */
export function calcSoldTotals(dailyRecords: BusinessDailyRecord[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const r of dailyRecords ?? []) {
    for (const item of r.items ?? []) {
      totals[item.productId] = (totals[item.productId] ?? 0) + soldCount(item)
    }
  }
  return totals
}

/** 单笔记货批次的剩余状态：按「先进先出」消耗（最旧批次优先售出） */
export interface PurchaseStockStatus {
  purchaseId: string
  productId: string
  quantity: number // 本批进货数量
  sold: number // 本批已售出（FIFO 消耗量，不超过 quantity）
  remaining: number // 本批剩余 = quantity − sold
  soldOut: boolean // 是否已全部售出（remaining ≤ 0）
  /** 是否该商品 FIFO 队列中最旧的一批（判定「最旧那一笔是否已售完」的对象） */
  isOldest: boolean
  totalSold: number // 该商品累计售出（全部收摊记录）
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
 * 规则：同一商品的进货按日期从旧到新排队，收摊售出数量从最旧批次开始依次消耗；
 * 因此「最旧那一笔是否已全部售出」等价于队首批次的 soldOut。
 */
export function calcPurchaseStockStatus(
  purchases: BusinessPurchase[],
  dailyRecords: BusinessDailyRecord[]
): Record<string, PurchaseStockStatus> {
  const soldTotals = calcSoldTotals(dailyRecords)
  const byProduct = new Map<string, BusinessPurchase[]>()
  for (const p of purchases ?? []) {
    const list = byProduct.get(p.productId) ?? []
    list.push(p)
    byProduct.set(p.productId, list)
  }
  const out: Record<string, PurchaseStockStatus> = {}
  for (const [productId, list] of byProduct) {
    const queue = [...list].sort(fifoCompare)
    let left = Math.max(0, soldTotals[productId] ?? 0)
    queue.forEach((p, index) => {
      const sold = Math.max(0, Math.min(p.quantity, left))
      left -= sold
      out[p.id] = {
        purchaseId: p.id,
        productId,
        quantity: p.quantity,
        sold,
        remaining: Math.max(0, p.quantity - sold),
        soldOut: p.quantity - sold <= 0,
        isOldest: index === 0,
        totalSold: Math.max(0, soldTotals[productId] ?? 0)
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

// ===== 录入提效：上日模板 / 常用商品 =====

/** 日期键按天位移（用于「近 N 天」窗口；本地构造避免 UTC 偏移） */
export function shiftDateKey(date: string, days: number): string {
  const parts = (date ?? '').split('-').map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return date
  const dt = new Date(parts[0], parts[1] - 1, parts[2] + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** 最近的「早于 date」的收摊记录（编辑当天时不会复制自己） */
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

// ===== 录入校验（进货 / 收摊 / 手填营业额） =====

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
    issues.push({ level: 'warn', message: '单价为 0：合计取自关联支出，该批单位成本按 0 参与均价计算' })
  }
  if (linked && Math.abs(total - (input.expenseTotal ?? 0)) > 0.01) {
    issues.push({
      level: 'error',
      message: `合计 ${total.toFixed(2)} 与关联支出汇总 ${(input.expenseTotal ?? 0).toFixed(2)} 不一致，请重新勾选`
    })
  }
  if (!linked && qty > 0 && price > 0 && Math.abs(total - qty * price) > 0.01) {
    issues.push({ level: 'warn', message: `合计 ${total.toFixed(2)} 与「数量 × 单价」${(qty * price).toFixed(2)} 不一致` })
  }
  return issues
}

/** 收摊单行校验：剩余/损耗不得大于带出，剩余 + 损耗不得大于带出 */
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

/** 收摊全部行校验汇总（errors 阻断保存，warns 仅提示） */
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
  /** 未被任何进货关联的支出（可能漏记进货，也可能本就与进货无关） */
  unlinkedExpenses: BusinessExpense[]
  linkedTotal: number
  unlinkedPurchaseTotal: number
  unlinkedExpenseTotal: number
}

/** 进货 ↔ 支出对账：已关联 / 未关联进货 / 未匹配支出 */
export function calcExpenseReconciliation(data: BusinessData): ExpenseReconciliation {
  const products = data.products ?? []
  const purchases = data.purchases ?? []
  const expenses = data.expenses ?? []
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
      expenseDates: picked.map(e => e.date).sort().join(' / '),
      expenseLabels: picked
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1))
        .map(e => expenseLabel(e)),
      diff: Math.round((p.total - expenseTotal) * 100) / 100
    })
  }
  const unlinkedExpenses = expenses.filter(e => !owners.has(e.id))
  const round = (n: number): number => Math.round(n * 100) / 100
  return {
    linked: linked.sort((a, b) => (a.date < b.date ? 1 : -1)),
    unlinkedPurchases: unlinkedPurchases.sort((a, b) => (a.date < b.date ? 1 : -1)),
    unlinkedExpenses: unlinkedExpenses.sort((a, b) => (a.date < b.date ? 1 : -1)),
    linkedTotal: round(linked.reduce((s, r) => s + r.total, 0)),
    unlinkedPurchaseTotal: round(unlinkedPurchases.reduce((s, r) => s + r.total, 0)),
    unlinkedExpenseTotal: round(unlinkedExpenses.reduce((s, e) => s + e.amount, 0))
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
  const out: ProductProfitRow[] = []
  for (const p of products) {
    let sold = 0
    for (const r of data.dailyRecords ?? []) {
      for (const it of r.items ?? []) {
        if (it.productId === p.id) sold += soldCount(it)
      }
    }
    const revenue = Math.round(sold * p.sellingPrice * 100) / 100
    const cost = Math.round(sold * p.purchasePrice * 100) / 100
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

/** 总统计：营业额 = Σ日记录收入；成本 = 纯 COGS（Σ售出数量 × 进货价，按收摊记录，不计支出）；利润/毛利率；支出 = Σ支出金额 */
export interface BusinessStats {
  revenue: number
  cost: number
  profit: number
  margin: number // 0-1 小数（营业额 0 → 0）
  expenseTotal: number // Σ支出金额（全部支出记录）
}

export function calcBusinessStats(data: BusinessData): BusinessStats {
  const revenue = data.dailyRecords.reduce((s, r) => s + r.totalRevenue, 0)
  // 成本 = 售出商品成本（COGS）：按收摊记录售出数量 × 商品进货价；缺失商品计 0（与 calcDailyRevenue 同口径）
  let cost = 0
  for (const r of data.dailyRecords) {
    for (const item of r.items) {
      const product = data.products.find(p => p.id === item.productId)
      cost += soldCount(item) * (product?.purchasePrice ?? 0)
    }
  }
  const profit = revenue - cost
  const margin = revenue > 0 ? profit / revenue : 0
  const expenseTotal = data.expenses.reduce((s, e) => s + e.amount, 0)
  return {
    revenue: Math.round(revenue * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    margin: Math.round(margin * 10000) / 10000,
    expenseTotal: Math.round(expenseTotal * 100) / 100
  }
}

/**
 * 首页毛利率口径：毛利率 =（营业额 − 支出）/ 营业额。
 * 与 calcBusinessStats.margin（营业额 − 售出成本 COGS）不同：这里只扣「支出的钱」，不扣进货成本。
 * 营业额 ≤ 0 → 0（不产生 Infinity / NaN；负数营收同样按 0 处理）。
 * 返回值是比率（0.35 = 35%），保留 4 位小数。
 */
export function calcExpenseMargin(revenue: number, expenseTotal: number): number {
  const r = Number.isFinite(revenue) ? revenue : 0
  const e = Number.isFinite(expenseTotal) ? expenseTotal : 0
  if (r <= 0) return 0
  return Math.round(((r - e) / r) * 10000) / 10000
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
  transactionCount?: number // 当日交易笔数（Σ 各收摊记录 transactionCount）
}

/** 近 days 天趋势（含 endDate 当天，升序）：按收摊记录口径——revenue=当日收摊收入；cost=当日收摊 COGS（售出×进货价，缺失商品计 0）；profit=差；进货/支出不入趋势（无收摊记录日全 0） */
export function calcBusinessTrend(data: BusinessData, endDate: string, days = 30): TrendPoint[] {
  if (!isValidDateKey(endDate) || days <= 0) return []
  const end = new Date(endDate + 'T00:00:00')
  const out: TrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i)
    const key = localDateKey(d)
    const dayRecords = data.dailyRecords.filter(r => r.date === key)
    const revenue = dayRecords.reduce((s, r) => s + r.totalRevenue, 0)
    const cost = dayRecords.reduce((s, r) => s + calcDailyCost(r.items, data.products), 0)
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
  days: number // 当月有收摊记录的天数
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
  const expenses = (data?.expenses ?? []).filter(e => typeof e?.date === 'string')
  const out: MonthlyStat[] = []
  for (let m = 1; m <= 12; m++) {
    const prefix = `${y}-${String(m).padStart(2, '0')}`
    const monthRecords = records.filter(r => r.date.startsWith(prefix))
    const revenue = round2(monthRecords.reduce((s, r) => s + (typeof r.totalRevenue === 'number' && Number.isFinite(r.totalRevenue) ? r.totalRevenue : 0), 0))
    const cost = round2(monthRecords.reduce((s, r) => s + calcDailyCost(r.items, data?.products ?? []), 0))
    const transactionCount = monthRecords.reduce(
      (s, r) => s + (typeof r.transactionCount === 'number' && Number.isFinite(r.transactionCount) ? r.transactionCount : 0),
      0
    )
    const expense = round2(
      expenses
        .filter(e => e.date.startsWith(prefix))
        .reduce((s, e) => s + (typeof e.amount === 'number' && Number.isFinite(e.amount) ? e.amount : 0), 0)
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

/** P0-1：收摊记录结构化商品明细行 */
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

/** 计算收摊记录的结构化商品明细行列表 */
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
  const out: ExpenseTrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i)
    const key = localDateKey(d)
    const amount = data.expenses
      .filter(e => e.date === key)
      .reduce((s, e) => s + e.amount, 0)
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
  const total = data.expenses.reduce((s, e) => s + e.amount, 0)
  const byCat: Record<string, number> = {}
  for (const e of data.expenses) {
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
  const purchases = data.purchases.filter(p => p.productId === productId)
  const dailyRecords = data.dailyRecords.filter(r => r.items.some(it => it.productId === productId))

  let totalPurchased = 0
  for (const p of purchases) totalPurchased += p.quantity

  let totalBroughtOut = 0
  let totalSold = 0
  let totalLoss = 0
  let totalRevenue = 0
  let totalCost = 0
  for (const r of dailyRecords) {
    for (const item of r.items) {
      if (item.productId !== productId) continue
      totalBroughtOut += item.broughtOut
      totalLoss += item.loss
      const sold = soldCount(item)
      totalSold += sold
      totalRevenue = Math.round((totalRevenue + sold * (product?.sellingPrice ?? 0)) * 100) / 100
      totalCost = Math.round((totalCost + sold * (product?.purchasePrice ?? 0)) * 100) / 100
    }
  }

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

/** P1-2：库存溯源明细（某商品的进货记录 + 收摊带出记录） */
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

// ===== 账本（最外层数据容器：按自然年创建，同年唯一） =====

/** 当前自然年（可注入便于单测） */
export function currentYear(d: Date = new Date()): number {
  return d.getFullYear()
}

/** 账本默认名称：「YYYY年账本」 */
export function ledgerDefaultName(year: number): string {
  return `${year}年账本`
}

/** 账本排序：年份倒序（新账本在前） */
export function sortedLedgers(list: BusinessLedger[]): BusinessLedger[] {
  return [...list].sort((a, b) => b.year - a.year)
}

export function findLedgerByYear(list: BusinessLedger[], year: number): BusinessLedger | undefined {
  return list.find(l => l.year === year)
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
  return {
    id: typeof l.id === 'string' && l.id ? l.id : newId(LEDGER_ID_PREFIX),
    year,
    name: (typeof l.name === 'string' && l.name.trim() ? l.name.trim() : ledgerDefaultName(year)).slice(0, 30),
    createdAt,
    updatedAt: typeof l.updatedAt === 'string' && l.updatedAt ? l.updatedAt : createdAt,
    data: normalizeBusinessData(l.data)
  }
}

/**
 * 归一化存储结构（幂等）：
 * - 新结构（含 ledgers 数组）→ 逐项归一，年份去重，currentLedgerId 失效时回落默认账本
 * - 旧结构（v1 扁平 BusinessData，无 ledgers）→ 整体迁入一个「当前年账本」，历史数据不丢
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
      name: ledgerDefaultName(year),
      createdAt: now,
      updatedAt: now,
      data: normalizeBusinessData(raw)
    }
    return { schemaVer: BUSINESS_STORE_SCHEMA_VER, ledgers: [ledger], currentLedgerId: ledger.id }
  }
  // 年份去重（同年份保留首个，防御脏数据 / 云端合并）
  const seen = new Set<number>()
  const ledgers: BusinessLedger[] = []
  for (const item of r.ledgers) {
    const l = normalizeLedger(item)
    if (!l || seen.has(l.year)) continue
    seen.add(l.year)
    ledgers.push(l)
  }
  const sorted = sortedLedgers(ledgers)
  const wanted = typeof r.currentLedgerId === 'string' ? r.currentLedgerId : ''
  const currentLedgerId = sorted.some(l => l.id === wanted) ? wanted : (pickDefaultLedger(sorted)?.id ?? '')
  return { schemaVer: BUSINESS_STORE_SCHEMA_VER, ledgers: sorted, currentLedgerId }
}

export type LedgerOpResult =
  | { ok: true; reason: 'ok'; ledgers: BusinessLedger[]; ledger: BusinessLedger }
  | { ok: false; reason: 'invalid-year' | 'empty-name' | 'duplicate' }

/**
 * 新建账本（同年唯一）：年份非法 / 名称空白 / 年份已存在 均返回失败原因，由 UI 给出明确提示。
 * 名称可留空（自动用「YYYY年账本」）。不改入参，返回新列表（已按年份倒序）。
 */
export function createLedger(list: BusinessLedger[], year: number, name?: string): LedgerOpResult {
  const rawYear = typeof year === 'number' ? year : Number(year)
  if (!Number.isFinite(rawYear)) return { ok: false, reason: 'invalid-year' }
  const y = Math.floor(rawYear)
  if (y < LEDGER_YEAR_MIN || y > LEDGER_YEAR_MAX) return { ok: false, reason: 'invalid-year' }
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (typeof name === 'string' && name.length > 0 && !trimmed) return { ok: false, reason: 'empty-name' }
  if (list.some(l => l.year === y)) return { ok: false, reason: 'duplicate' }
  const now = new Date().toISOString()
  const ledger: BusinessLedger = {
    id: newId(LEDGER_ID_PREFIX),
    year: y,
    name: (trimmed || ledgerDefaultName(y)).slice(0, 30),
    createdAt: now,
    updatedAt: now,
    data: emptyBusinessData()
  }
  return { ok: true, reason: 'ok', ledgers: sortedLedgers([...list, ledger]), ledger }
}

/** 账本内数据是否有内容（用于空状态文案判断） */
export function isLedgerEmpty(data: BusinessData): boolean {
  return (
    !data.products.length &&
    !data.purchases.length &&
    !data.dailyRecords.length &&
    !data.expenses.length
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

/** 收摊记录按日期唯一：同 date 只保留 updatedAt（缺失取 createdAt）最新的一条 */
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

/** 单个账本内的业务数据合并（分类同 id 取本地；实体按时间戳较新者胜；收摊按日期去重） */
function mergeLedgerData(l: BusinessData | undefined, r: BusinessData | undefined): BusinessData {
  return {
    productCategories: mergeByIdKeepNewest(l?.productCategories, r?.productCategories, 'id'),
    expenseCategories: mergeByIdKeepNewest(l?.expenseCategories, r?.expenseCategories, 'id'),
    products: mergeByIdKeepNewest(l?.products, r?.products, 'id', 'createdAt'),
    purchases: mergeByIdKeepNewest(l?.purchases, r?.purchases, 'id', 'createdAt'),
    dailyRecords: dedupeDailyByDate(mergeByIdKeepNewest(l?.dailyRecords, r?.dailyRecords, 'id', 'updatedAt')),
    expenses: mergeByIdKeepNewest(l?.expenses, r?.expenses, 'id', 'createdAt'),
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
  expenses: number
} {
  return {
    products: data?.products?.length ?? 0,
    purchases: data?.purchases?.length ?? 0,
    dailyRecords: data?.dailyRecords?.length ?? 0,
    expenses: data?.expenses?.length ?? 0
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

/** 清空某账本的交易流水（进货/收摊/支出），保留商品、分类与账本设置；不改入参 */
export function clearLedgerRecords(list: BusinessLedger[], id: string, now: string = new Date().toISOString()): LedgerMutateResult {
  const index = list.findIndex(l => l.id === id)
  if (index === -1) return { ok: false, reason: 'not-found' }
  const target = list[index]
  const ledger: BusinessLedger = {
    ...target,
    updatedAt: now,
    data: { ...target.data, purchases: [], dailyRecords: [], expenses: [] }
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
 * - 账本按「年份」并集而非 id —— 不同设备各自创建的同年账本 id 不同，按 id 并集会破坏同年唯一约束；
 * - 同年账本：外壳取本地（id/name 本地优先），业务数据走 mergeLedgerData 逐字段并集；
 * - currentLedgerId：本地选中优先，失效回落远端，再回落默认（当前年 → 最大年份）。
 */
export function mergeBusinessStore(
  l: BusinessStoreData | BusinessData | undefined,
  r: BusinessStoreData | BusinessData | undefined
): BusinessStoreData {
  const ll = normalizeBusinessStore(l)
  const rr = normalizeBusinessStore(r)
  const byYear = new Map<number, BusinessLedger>()
  // 本地先入 map → 同年冲突时 existing 恒为本地账本（本地优先）
  for (const ledger of [...ll.ledgers, ...rr.ledgers]) {
    const existing = byYear.get(ledger.year)
    if (!existing) {
      byYear.set(ledger.year, ledger)
      continue
    }
    byYear.set(ledger.year, {
      id: existing.id,
      year: ledger.year,
      name: existing.name,
      createdAt: existing.createdAt < ledger.createdAt ? existing.createdAt : ledger.createdAt,
      updatedAt: existing.updatedAt > ledger.updatedAt ? existing.updatedAt : ledger.updatedAt,
      data: mergeLedgerData(existing.data, ledger.data)
    })
  }
  const ledgers = sortedLedgers([...byYear.values()])
  const wanted = ll.currentLedgerId || rr.currentLedgerId || ''
  const currentLedgerId = ledgers.some(x => x.id === wanted) ? wanted : (pickDefaultLedger(ledgers)?.id ?? '')
  return { schemaVer: BUSINESS_STORE_SCHEMA_VER, ledgers, currentLedgerId }
}
