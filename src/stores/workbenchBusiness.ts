import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type {
  BusinessData,
  BusinessExpenseCategory,
  BusinessLedger,
  BusinessProduct,
  BusinessProductCategory,
  BusinessPurchase,
  BusinessStoreData,
  DailyRecordItem
} from '@/types'
import {
  addExpenseCategory as addExpenseCategoryCore,
  addExpenseItem,
  addProductCategory as addProductCategoryCore,
  updateExpenseCategory as updateExpenseCategoryCore,
  updateExpenseItem,
  deleteExpenseItem,
  upsertExpenseDaily as coreUpsertExpenseDaily,
  flatExpenseItems,
  BUSINESS_STORE_SCHEMA_VER,
  calcDailyRevenue,
  checkLedgerYearWrite,
  createLedger as createLedgerCore,
  clearLedgerRecords as clearLedgerRecordsCore,
  currentYear,
  deleteLedger as deleteLedgerCore,
  ledgerDeleteGuard as ledgerDeleteGuardCore,
  ledgerCodeOf,
  deleteExpenseCategory as deleteExpenseCategoryCore,
  deleteProductCategory as deleteProductCategoryCore,
  emptyBusinessData,
  hasLedgerForYear,
  isLedgerEmpty,
  BIZ_UNIT_MAX,
  ledgerDefaultName,
  moveCategory,
  newId,
  normalizeBusinessData,
  normalizeBusinessStore,
  normalizeExpenseIds,
  normalizeExpenseTitle,
  pickDefaultLedger,
  renameLedger as renameLedgerCore,
  renameCategory,
  sortedLedgers,
  sumExpenseAmounts,
  toggleCategoryVisible
} from '@/composables/businessCore'
import type { CategoryOpResult, ExpenseItemDraft, LedgerDeleteGuard, LedgerMutateResult, LedgerOpResult, LedgerRenameResult, LedgerWriteResult } from '@/composables/businessCore'
import { idbGet, idbPut } from '../composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'

// 销售记账 store（数据存 IndexedDB store 'business'，key 'items'；随备份 v7 导出/导入）
//
// v2 结构：账本（BusinessLedger）是最外层数据容器，按自然年创建、**同一年份可有多本**（年内序号 seq 唯一，编号 YYYY-NN）；
// 所有业务数据挂在「当前账本」的 data 下，切换账本即整体切换数据集；
// 每本账本只记录其所属年份的数据：写入（进货/销售/支出）时按日期做跨年守卫，跨年数据不混入同一账本。
// 对外仍暴露与旧版同名的 products / purchases / dailyRecords / expenseDailies / settings / 两类分类，
// 但它们现在是「指向当前账本」的可写 computed —— 业务面板无需感知账本即可继续工作。
/**
 * 递归解包 Vue reactive Proxy：structured clone（IndexedDB put 使用）无法正确序列化
 * 嵌套的 reactive 代理元素，在严格引擎（如 iOS Safari / 移动端）上会抛 DataCloneError，
 * 导致写入静默失败——内存里有数据、IndexedDB 没落盘，刷新后记录全部消失。
 * 单层 toRaw 只解一层，必须逐层递归解包为纯对象（见 saveBusiness）。
 */
function deepToRaw<T>(value: T): T {
  const v = toRaw(value as unknown as object) as unknown
  if (Array.isArray(v)) {
    return v.map((item) => deepToRaw(item)) as unknown as T
  }
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(v as Record<string, unknown>)) {
      out[key] = deepToRaw((v as Record<string, unknown>)[key])
    }
    return out as unknown as T
  }
  return value
}

export const useWorkbenchBusinessStore = defineStore('workbenchBusiness', () => {
  const ledgers = ref<BusinessLedger[]>([])
  const currentLedgerId = ref('')
  // 首屏数据加载态：loadBusiness 完成（成功或失败）后置 true，驱动首页骨架屏
  const loaded = ref(false)

  /** 当前账本（不存在为 null：尚未创建任何账本） */
  const currentLedger = computed<BusinessLedger | null>(
    () => ledgers.value.find(l => l.id === currentLedgerId.value) ?? null
  )
  /** 当前账本的业务数据（无账本时返回空数据快照，仅供读取兜底） */
  function currentData(): BusinessData {
    return currentLedger.value?.data ?? emptyBusinessData()
  }
  /** 写回当前账本：更新 data 与 updatedAt（无账本时静默忽略，UI 已由引导拦截） */
  function patchCurrentData(patch: Partial<BusinessData>): void {
    const index = ledgers.value.findIndex(l => l.id === currentLedgerId.value)
    if (index === -1) return
    const target = toRaw(ledgers.value[index])
    ledgers.value[index] = {
      ...target,
      updatedAt: new Date().toISOString(),
      data: { ...toRaw(target.data), ...patch }
    }
  }

  /** 可写 computed：读当前账本字段，写回当前账本（业务面板零改动的关键） */
  function ledgerField<K extends keyof BusinessData>(key: K) {
    return computed<BusinessData[K]>({
      get: () => currentData()[key],
      set: (value: BusinessData[K]) => patchCurrentData({ [key]: value } as Partial<BusinessData>)
    })
  }

  const productCategories = ledgerField('productCategories')
  const expenseCategories = ledgerField('expenseCategories')
  const products = ledgerField('products')
  const purchases = ledgerField('purchases')
  const dailyRecords = ledgerField('dailyRecords')
  const expenseDailies = ledgerField('expenseDailies')
  const settings = ledgerField('settings')

  // ===== 账本元信息（供视图渲染切换器 / 引导 / 空状态） =====
  const ledgerList = computed<BusinessLedger[]>(() => sortedLedgers(ledgers.value))
  const hasLedgers = computed(() => ledgers.value.length > 0)
  const currentYearLedgerExists = computed(() => hasLedgerForYear(ledgers.value, currentYear()))
  /** 当前自然年还没有账本：视图据此展示创建引导 / 跨年提示（不允许在无账本时进入业务模块） */
  const needsCurrentYearLedger = computed(() => !currentYearLedgerExists.value)
  const currentLedgerName = computed(() => currentLedger.value?.name ?? '')
  /** 当前账本编号（YYYY-NN）：年份 + 年内序号，唯一且可读 */
  const currentLedgerCode = computed(() => (currentLedger.value ? ledgerCodeOf(currentLedger.value) : ''))
  const currentLedgerYear = computed(() => currentLedger.value?.year ?? currentYear())
  const currentLedgerIsEmpty = computed(() => (currentLedger.value ? isLedgerEmpty(currentLedger.value.data) : true))

  async function loadBusiness(): Promise<void> {
    try {
      // IDB 存量旧结构（扁平 BusinessData）经 normalizeBusinessStore 自动迁入「当前年账本」
      const raw = await idbGet<BusinessStoreData | BusinessData>('business')
      // 旧结构（无 ledgers 数组）判定：迁移后立刻落库，保证备份导出/云同步/其它标签页读到的一定是 v2 结构
      const isLegacy = !raw || typeof raw !== 'object' || !Array.isArray((raw as unknown as Record<string, unknown>).ledgers)
      const store = normalizeBusinessStore(raw)
      ledgers.value = store.ledgers
      currentLedgerId.value = store.currentLedgerId
      if (isLegacy) await saveBusiness()
    } catch (e) {
      // 加载失败降级为空态（无账本，由引导承接），不向上抛
      console.error('[workbenchBusiness] loadBusiness', e)
      ledgers.value = []
      currentLedgerId.value = ''
    } finally {
      loaded.value = true
    }
  }

  async function saveBusiness(): Promise<void> {
    try {
      // 必须递归解包所有嵌套 reactive 代理：整体/单层 toRaw 解不掉内层 Proxy，
      // 严格引擎（iOS Safari / 移动端）的 IndexedDB put 会抛 DataCloneError，写入静默失败，
      // 表现为「内存里有、刷新后没了」。deepToRaw 逐层还原为纯对象，彻底规避该问题。
      const raw: BusinessStoreData = {
        schemaVer: BUSINESS_STORE_SCHEMA_VER,
        ledgers: deepToRaw(ledgers.value),
        currentLedgerId: currentLedgerId.value
      }
      await idbPut('business', raw)
      markDirty()
    } catch (e) {
      console.error('[workbenchBusiness] saveBusiness', e)
    }
  }

  // ===== 账本归属年份守卫：跨年数据不混入同一账本 =====
  /** 写入前校验日期是否属于当前账本年份；跨年 / 无账本时拒绝写入（返回提示文案给 UI） */
  function guardLedgerYear(date: string): LedgerWriteResult {
    return checkLedgerYearWrite(date, currentLedger.value?.year ?? null)
  }

  // ===== 账本 CRUD =====

  /** 创建账本（同一年份可有多本，年内序号 seq 自动分配，编号 = 年份-序号）；成功后自动切换为当前账本。失败原因交由 UI 提示 */
  function createLedger(year: number, name?: string): LedgerOpResult {
    const r = createLedgerCore(ledgers.value, year, name)
    if (r.ok) {
      ledgers.value = r.ledgers
      currentLedgerId.value = r.ledger.id
      void saveBusiness()
    }
    return r
  }

  /** 快捷创建当前年账本（引导页 / 跨年提示条使用），已存在则直接切过去 */
  function ensureCurrentYearLedger(name?: string): LedgerOpResult {
    const year = currentYear()
    const existing = ledgers.value.find(l => l.year === year)
    if (existing) {
      currentLedgerId.value = existing.id
      void saveBusiness()
      return { ok: true, reason: 'ok', ledgers: ledgers.value, ledger: existing }
    }
    return createLedger(year, name ?? ledgerDefaultName(year))
  }

  /** 切换账本：id 无效时保持原状 */
  function switchLedger(id: string): boolean {
    if (!ledgers.value.some(l => l.id === id)) return false
    currentLedgerId.value = id
    void saveBusiness()
    return true
  }

  /** 按年份切换（存在该年账本才切） */
  function switchLedgerByYear(year: number): boolean {
    const target = ledgers.value.find(l => l.year === year)
    return target ? switchLedger(target.id) : false
  }

  // ===== 账本删除（设置弹窗「基础设置 → 账本管理」入口） =====

  /** 删前守卫：not-found / last-one（至少保留一个）/ is-current（当前使用中，需先切换） */
  function ledgerDeleteGuard(id: string): LedgerDeleteGuard {
    return ledgerDeleteGuardCore(ledgers.value, id, currentLedgerId.value)
  }

  /** 仅清空某账本的交易流水（进货/销售/支出），账本本体与商品/分类/设置保留 */
  function clearLedgerRecords(id: string): LedgerMutateResult {
    const r = clearLedgerRecordsCore(ledgers.value, id)
    if (r.ok) {
      ledgers.value = r.ledgers
      void saveBusiness()
    }
    return r
  }

  /** 删除账本整体（受守卫保护）；成功后重置当前选中（被删账本失效时回落默认账本） */
  function deleteLedger(id: string): LedgerMutateResult {
    const r = deleteLedgerCore(ledgers.value, id, currentLedgerId.value)
    if (r.ok) {
      ledgers.value = r.ledgers
      // 刷新选中：原选中仍在则保留，否则回落到默认账本（当前年 → 最大年份）
      if (!r.ledgers.some(l => l.id === currentLedgerId.value)) {
        currentLedgerId.value = pickDefaultLedger(r.ledgers)?.id ?? ''
      }
      void saveBusiness()
    }
    return r
  }

  /** 重命名账本：仅改名称（编号/年份不变）；成功持久化。失败原因交由 UI 提示 */
  function renameLedger(id: string, name: string): LedgerRenameResult {
    const r = renameLedgerCore(ledgers.value, id, name)
    if (r.ok) {
      ledgers.value = r.ledgers
      void saveBusiness()
    }
    return r
  }

  // ===== 商品分类 CRUD（全部委托 businessCore 纯函数，store 只做薄委托 + 持久化） =====
  function addProductCategory(name: string): CategoryOpResult<BusinessProductCategory> {
    const r = addProductCategoryCore(productCategories.value, name)
    if (r.ok) {
      productCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function renameProductCategory(id: string, name: string): CategoryOpResult<BusinessProductCategory> {
    const r = renameCategory(productCategories.value, id, name)
    if (r.ok) {
      productCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function toggleProductCategoryVisible(id: string): CategoryOpResult<BusinessProductCategory> {
    const r = toggleCategoryVisible(productCategories.value, id)
    if (r.ok) {
      productCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function moveProductCategory(id: string, dir: 'up' | 'down'): CategoryOpResult<BusinessProductCategory> {
    const r = moveCategory(productCategories.value, id, dir)
    if (r.ok) {
      productCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function deleteProductCategory(id: string): CategoryOpResult<BusinessProductCategory> {
    const inUse = products.value.some(p => p.categoryId === id)
    const r = deleteProductCategoryCore(productCategories.value, id, inUse)
    if (r.ok) {
      productCategories.value = r.list
      // 删除后该分类商品归未分类（toRaw 原始数组上重建，防残留 Proxy 元素 DataCloneError）
      products.value = toRaw(products.value).map(p => (p.categoryId === id ? { ...p, categoryId: undefined } : p))
      void saveBusiness()
    }
    return r
  }

  // ===== 支出产品 CRUD（原「支出分类」→「支出产品管理」→ 2026-10-09 改名「进货商品管理」） =====
  function addExpenseCategory(
    name: string,
    opts?: { unit?: string; unitPrice?: number; productQuantity?: number; productId?: string }
  ): CategoryOpResult<BusinessExpenseCategory> {
    const r = addExpenseCategoryCore(expenseCategories.value, name, opts)
    if (r.ok) {
      expenseCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function updateExpenseCategory(
    id: string,
    patch: { unit?: string | null; unitPrice?: number | null; productQuantity?: number | null; productId?: string | null }
  ): CategoryOpResult<BusinessExpenseCategory> {
    const r = updateExpenseCategoryCore(expenseCategories.value, id, patch)
    if (r.ok) {
      expenseCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function renameExpenseCategory(id: string, name: string): CategoryOpResult<BusinessExpenseCategory> {
    const r = renameCategory(expenseCategories.value, id, name)
    if (r.ok) {
      expenseCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function toggleExpenseCategoryVisible(id: string): CategoryOpResult<BusinessExpenseCategory> {
    const r = toggleCategoryVisible(expenseCategories.value, id)
    if (r.ok) {
      expenseCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function moveExpenseCategory(id: string, dir: 'up' | 'down'): CategoryOpResult<BusinessExpenseCategory> {
    const r = moveCategory(expenseCategories.value, id, dir)
    if (r.ok) {
      expenseCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  function deleteExpenseCategory(id: string): CategoryOpResult<BusinessExpenseCategory> {
    const inUse = flatExpenseItems(expenseDailies.value).some(e => e.categoryId === id)
    const r = deleteExpenseCategoryCore(expenseCategories.value, id, inUse)
    if (r.ok) {
      expenseCategories.value = r.list
      void saveBusiness()
    }
    return r
  }

  // ===== 商品 CRUD =====
  async function addProduct(input: {
    name: string
    categoryId?: string
    unit: string
    purchasePrice: number
    sellingPrice: number
    /** 会员价（可选，仅记录展示；未设置不写入，保持字段缺省；null = 清空） */
    memberPrice?: number | null
    active?: boolean
  }): Promise<void> {
    products.value.push({
      id: newId('bp_'),
      name: input.name.trim().slice(0, 40),
      categoryId: input.categoryId ?? undefined,
      unit: input.unit.trim().slice(0, BIZ_UNIT_MAX) || '件',
      purchasePrice: Math.max(0, input.purchasePrice),
      sellingPrice: Math.max(0, input.sellingPrice),
      ...(typeof input.memberPrice === 'number' && Number.isFinite(input.memberPrice) && input.memberPrice >= 0
        ? { memberPrice: Math.round(input.memberPrice * 100) / 100 }
        : {}),
      active: input.active !== false,
      createdAt: new Date().toISOString()
    })
    await saveBusiness()
  }

  async function updateProduct(
    id: string,
    // memberPrice 允许传 null：表示「清空会员价」（内部会移除该字段）
    patch: Partial<Omit<BusinessProduct, 'id' | 'createdAt'>> & { memberPrice?: number | null }
  ): Promise<void> {
    const index = products.value.findIndex(p => p.id === id)
    if (index === -1) return
    const merged = { ...toRaw(products.value[index]), ...patch, id }
    // 单位：与支出同口径（trim + BIZ_UNIT_MAX 截断），空值回退「件」
    if (typeof patch.unit === 'string') {
      merged.unit = patch.unit.trim().slice(0, BIZ_UNIT_MAX) || '件'
    }
    // 会员价：传值则校验（有限且 ≥0）后保留两位小数，清空/undefined 则移除字段
    if (patch.memberPrice !== undefined && patch.memberPrice !== null) {
      if (Number.isFinite(patch.memberPrice) && patch.memberPrice >= 0) {
        merged.memberPrice = Math.round(patch.memberPrice * 100) / 100
      } else {
        delete merged.memberPrice
      }
    }
    products.value[index] = merged
    await saveBusiness()
  }

  async function deleteProduct(id: string): Promise<{ ok: boolean; reason: 'not-found' | 'in-use' | 'ok' }> {
    const index = products.value.findIndex(p => p.id === id)
    if (index === -1) return { ok: false, reason: 'not-found' }
    // 被进货/销售记录引用 → 禁删（防历史统计失真）；停售请用 active 开关
    const inUse =
      purchases.value.some(p => p.productId === id) ||
      dailyRecords.value.some(r => r.items.some(it => it.productId === id))
    if (inUse) return { ok: false, reason: 'in-use' }
    products.value = toRaw(products.value).filter(p => p.id !== id)
    await saveBusiness()
    return { ok: true, reason: 'ok' }
  }

  // ===== 进货 CRUD =====
  async function addPurchase(input: {
    productId: string
    quantity: number
    unitPrice: number
    date: string
    note?: string
    /** 关联的支出记录 id（进货优化：合计金额 = 已关联支出金额之和） */
    expenseIds?: string[]
  }): Promise<LedgerWriteResult> {
    const guard = guardLedgerYear(input.date)
    if (!guard.ok) return guard
    const quantity = Math.max(0, Math.floor(input.quantity))
    const unitPrice = Math.max(0, input.unitPrice)
    const ids = normalizeExpenseIds(input.expenseIds)
    purchases.value.push({
      id: newId('bpr_'),
      productId: input.productId,
      quantity,
      unitPrice,
      // 关联了支出 → 合计取支出汇总（UI 与之一致）；否则沿用 数量 × 单价
      total: ids.length ? sumExpenseAmounts(flatExpenseItems(expenseDailies.value), ids) : Math.round(quantity * unitPrice * 100) / 100,
      date: input.date,
      ...(ids.length ? { expenseIds: ids } : {}),
      note: input.note?.trim() || undefined,
      createdAt: new Date().toISOString()
    })
    await saveBusiness()
    return { ok: true, reason: 'ok' }
  }

  async function updatePurchase(
    id: string,
    patch: Partial<Omit<BusinessPurchase, 'id' | 'createdAt' | 'total'>>
  ): Promise<LedgerWriteResult> {
    const index = purchases.value.findIndex(p => p.id === id)
    if (index === -1) return { ok: false, reason: 'no-ledger', message: '记录不存在或已被删除' }
    if (patch.date !== undefined) {
      const guard = guardLedgerYear(patch.date)
      if (!guard.ok) return guard
    }
    const old = toRaw(purchases.value[index])
    const merged = { ...old, ...patch, id }
    merged.quantity = Math.max(0, Math.floor(merged.quantity))
    merged.unitPrice = Math.max(0, merged.unitPrice)
    // 关联了支出 → 合计取支出汇总；否则 数量 × 单价（与 addPurchase 同口径）
    const ids = normalizeExpenseIds(patch.expenseIds ?? old.expenseIds)
    if (ids.length) {
      merged.expenseIds = ids
      merged.total = sumExpenseAmounts(flatExpenseItems(expenseDailies.value), ids)
    } else {
      delete merged.expenseIds
      merged.total = Math.round(merged.quantity * merged.unitPrice * 100) / 100
    }
    purchases.value[index] = merged
    await saveBusiness()
    return { ok: true, reason: 'ok' }
  }

  async function deletePurchase(id: string): Promise<void> {
    purchases.value = toRaw(purchases.value).filter(p => p.id !== id)
    await saveBusiness()
  }

  // ===== 销售日记录（date 唯一 upsert 语义；totalRevenue 默认由 core 算，传 revenueOverride 则以手动金额为准） =====
  async function upsertDailyRecord(input: {
    date: string
    items: DailyRecordItem[]
    note?: string
    transactionCount?: number
    /** 手动填写的营业额（销售优化）：传入则覆盖自动合计，保留两位小数 */
    revenueOverride?: number | null
  }): Promise<LedgerWriteResult> {
    const guard = guardLedgerYear(input.date)
    if (!guard.ok) return guard
    const now = new Date().toISOString()
    const autoRevenue = calcDailyRevenue(input.items, toRaw(products.value))
    // 手动营业额：仅接受有限且 ≥0 的数值，否则回退自动合计（防止 NaN/负数入库）
    const totalRevenue =
      typeof input.revenueOverride === 'number' && Number.isFinite(input.revenueOverride) && input.revenueOverride >= 0
        ? Math.round(input.revenueOverride * 100) / 100
        : autoRevenue
    const transactionCount = typeof input.transactionCount === 'number' && Number.isFinite(input.transactionCount) ? Math.max(0, Math.floor(input.transactionCount)) : undefined
    const existing = dailyRecords.value.findIndex(r => r.date === input.date)
    if (existing !== -1) {
      const old = toRaw(dailyRecords.value[existing])
      dailyRecords.value[existing] = {
        ...old,
        items: input.items.map(it => ({ ...it })),
        totalRevenue,
        transactionCount,
        note: input.note?.trim() || undefined,
        updatedAt: now
      }
    } else {
      dailyRecords.value.push({
        id: newId('bd_'),
        date: input.date,
        items: input.items.map(it => ({ ...it })),
        totalRevenue,
        transactionCount,
        note: input.note?.trim() || undefined,
        createdAt: now,
        updatedAt: now
      })
    }
    await saveBusiness()
    return { ok: true, reason: 'ok' }
  }

  async function deleteDailyRecord(id: string): Promise<void> {
    dailyRecords.value = toRaw(dailyRecords.value).filter(r => r.id !== id)
    await saveBusiness()
  }

  // ===== 支出 CRUD（同一天可有多笔；title 必填，缺省按分类名/默认标题补齐） =====
  async function addExpense(input: {
    /** 所属日期（决定归入哪一天的支出日记账；同日多次新增自动合并到同一天） */
    date: string
    categoryId: string
    /** 金额（调用方按 数量 × 单价 算好） */
    amount: number
    title?: string
    note?: string
    /** 数量（金额 = 数量 × 单价；可选，旧数据缺省） */
    quantity?: number
    /** 单价（金额 = 数量 × 单价；可选，旧数据缺省） */
    unitPrice?: number
    unit?: string
    orderPhone?: string
    orderAddress?: string
    salesman?: string
  }): Promise<LedgerWriteResult> {
    const guard = guardLedgerYear(input.date)
    if (!guard.ok) return guard
    const categoryName = expenseCategories.value.find(c => c.id === input.categoryId)?.name
    // 标题可选：留空时用产品（分类）名兜底，再退回「未命名支出」
    const title = normalizeExpenseTitle(input.title, categoryName)
    expenseDailies.value = addExpenseItem(expenseDailies.value, input.date, {
      categoryId: input.categoryId,
      amount: Math.max(0, input.amount),
      title,
      note: input.note?.trim() || undefined,
      quantity: Number.isFinite(input.quantity) && (input.quantity as number) > 0 ? input.quantity : undefined,
      unitPrice: Number.isFinite(input.unitPrice) && (input.unitPrice as number) > 0 ? input.unitPrice : undefined,
      unit: input.unit?.trim() || undefined,
      orderPhone: input.orderPhone?.trim() || undefined,
      orderAddress: input.orderAddress?.trim() || undefined,
      salesman: input.salesman?.trim() || undefined
    })
    await saveBusiness()
    return { ok: true, reason: 'ok' }
  }

  /** 编辑某条支出明细（按 item id，跨日容器查找）；日期属于日容器，不在明细上，编辑不改所属日 */
  async function updateExpense(
    id: string,
    patch: {
      categoryId?: string
      amount?: number
      title?: string
      note?: string
      quantity?: number
      unitPrice?: number
      unit?: string
      orderPhone?: string
      orderAddress?: string
      salesman?: string
    }
  ): Promise<LedgerWriteResult> {
    const found = flatExpenseItems(expenseDailies.value).find(e => e.id === id)
    if (!found) return { ok: false, reason: 'no-ledger', message: '支出明细不存在或已被删除' }
    const nextPatch: Record<string, unknown> = { ...patch }
    if (patch.title !== undefined || found.title === undefined) {
      const categoryName = expenseCategories.value.find(c => c.id === (patch.categoryId ?? found.categoryId))?.name
      nextPatch.title = normalizeExpenseTitle(patch.title ?? found.title, categoryName)
    }
    if (patch.unit !== undefined) nextPatch.unit = patch.unit?.trim() || undefined
    if (patch.orderPhone !== undefined) nextPatch.orderPhone = patch.orderPhone?.trim() || undefined
    if (patch.orderAddress !== undefined) nextPatch.orderAddress = patch.orderAddress?.trim() || undefined
    if (patch.salesman !== undefined) nextPatch.salesman = patch.salesman?.trim() || undefined
    if (patch.amount !== undefined) nextPatch.amount = Math.max(0, patch.amount)
    expenseDailies.value = updateExpenseItem(expenseDailies.value, id, nextPatch as never)
    await saveBusiness()
    return { ok: true, reason: 'ok' }
  }

  /** 移除进货记录里对这些支出明细的关联，避免删除后 expenseIds 悬空（仅当确有引用时才改 purchases） */
  function detachExpenseIds(ids: string[]): void {
    if (!ids.length) return
    const set = new Set(ids)
    let changed = false
    const next = toRaw(purchases.value).map(p => {
      if (!p.expenseIds || p.expenseIds.length === 0) return p
      const kept = p.expenseIds.filter(eid => !set.has(eid))
      if (kept.length !== p.expenseIds.length) {
        changed = true
        return { ...p, expenseIds: kept }
      }
      return p
    })
    if (changed) purchases.value = next
  }

  async function deleteExpense(id: string): Promise<void> {
    if (!flatExpenseItems(expenseDailies.value).some(e => e.id === id)) return
    expenseDailies.value = deleteExpenseItem(expenseDailies.value, id)
    detachExpenseIds([id])
    await saveBusiness()
  }

  /**
   * 支出日记账 upsert（对应销售 upsertDailyRecord）：以日期为容器键，明细整体替换/合并。
   * 标题归一化（产品名兜底）在此完成；年守卫拦截跨年写入。删除某天整日容器由 deleteExpenseDaily 负责。
   */
  async function upsertExpenseDaily(input: {
    /** 编辑态原日容器 id（新增为 null）；用于同日期整体替换或日期变更时迁移 */
    originalDailyId: string | null
    date: string
    items: ExpenseItemDraft[]
  }): Promise<LedgerWriteResult> {
    const guard = guardLedgerYear(input.date)
    if (!guard.ok) return guard
    const items: ExpenseItemDraft[] = input.items.map(it => ({
      ...it,
      // 标题可选：留空时用产品（分类）名兜底，再退回「未命名支出」
      title: normalizeExpenseTitle(it.title, expenseCategories.value.find(c => c.id === it.categoryId)?.name)
    }))
    expenseDailies.value = coreUpsertExpenseDaily(expenseDailies.value, input.originalDailyId, input.date, items)
    await saveBusiness()
    return { ok: true, reason: 'ok' }
  }

  /** 删除整天的支出日记账（连同其下所有产品明细）；同时清理进货记录中对这些明细的关联 */
  async function deleteExpenseDaily(id: string): Promise<void> {
    const day = expenseDailies.value.find(d => d.id === id)
    if (!day) return
    const removedIds = day.items.map(e => e.id)
    expenseDailies.value = toRaw(expenseDailies.value).filter(d => d.id !== id)
    detachExpenseIds(removedIds)
    await saveBusiness()
  }

  // ===== 整包导入（销售记账独立 JSON 备份，BusinessView 头部「导入」按钮入口） =====
  // 兼容两种信封：v2 整包（含 ledgers）→ 替换全部账本；v1 单账本（扁平 BusinessData）→ 覆盖当前账本
  async function importData(raw: unknown): Promise<BusinessData> {
    const isBundle =
      raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as unknown as Record<string, unknown>).ledgers)
    if (isBundle) {
      const bundle = normalizeBusinessStore(raw)
      ledgers.value = bundle.ledgers
      currentLedgerId.value = bundle.currentLedgerId
      await saveBusiness()
      return currentData()
    }
    const data = normalizeBusinessData(raw)
    if (!currentLedger.value) ensureCurrentYearLedger()
    patchCurrentData(data)
    await saveBusiness()
    return currentData()
  }

  // ===== 设置 =====
  async function setStallName(name: string): Promise<void> {
    settings.value.stallName = name.trim().slice(0, 30)
    await saveBusiness()
  }

  async function setLowStockThreshold(n: number): Promise<void> {
    settings.value.lowStockThreshold = Math.max(0, Math.floor(n))
    await saveBusiness()
  }

  async function setMonthlyRevenueTarget(n: number): Promise<void> {
    settings.value.monthlyRevenueTarget = Math.max(0, Math.floor(n))
    await saveBusiness()
  }

  /** 滞销预警天数：在售商品超过该天数无售出即预警 */
  async function setSlowMovingDays(n: number): Promise<void> {
    settings.value.slowMovingDays = Math.max(1, Math.floor(n))
    await saveBusiness()
  }

  /** 久存（临期）批次预警天数：进货入库超过该天数仍未售完即预警 */
  async function setAgingBatchDays(n: number): Promise<void> {
    settings.value.agingBatchDays = Math.max(1, Math.floor(n))
    await saveBusiness()
  }

  return {
    // 账本（最外层容器）
    ledgers: ledgerList,
    currentLedger,
    currentLedgerId,
    hasLedgers,
    needsCurrentYearLedger,
    currentLedgerName,
    currentLedgerCode,
    currentLedgerYear,
    currentLedgerIsEmpty,
    createLedger,
    ensureCurrentYearLedger,
    switchLedger,
    switchLedgerByYear,
    ledgerDeleteGuard,
    clearLedgerRecords,
    deleteLedger,
    renameLedger,
    // 当前账本内的业务数据（可写 computed，业务面板无需感知账本）
    productCategories,
    expenseCategories,
    products,
    purchases,
    dailyRecords,
    expenseDailies,
    settings,
    loaded,
    loadBusiness,
    saveBusiness,
    importData,
    addProductCategory,
    renameProductCategory,
    toggleProductCategoryVisible,
    moveProductCategory,
    deleteProductCategory,
    addExpenseCategory,
    updateExpenseCategory,
    renameExpenseCategory,
    toggleExpenseCategoryVisible,
    moveExpenseCategory,
    deleteExpenseCategory,
    addProduct,
    updateProduct,
    deleteProduct,
    addPurchase,
    updatePurchase,
    deletePurchase,
    upsertDailyRecord,
    deleteDailyRecord,
    addExpense,
    updateExpense,
    deleteExpense,
    upsertExpenseDaily,
    deleteExpenseDaily,
    setStallName,
    setLowStockThreshold,
    setMonthlyRevenueTarget,
    setSlowMovingDays,
    setAgingBatchDays
  }
})
