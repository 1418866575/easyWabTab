<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import { showConfirm } from '@/utils/dialog'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

function cardFields(row: any) {
  const p = findProduct(store.products, row.productId)
  const m = markupRateOf(row.productId, row.unitPrice)
  return [
    { label: '日期', value: row.date },
    { label: '商品', value: productNameOf(row.productId) },
    { label: '分类', value: catNameOf(row.productId) },
    { label: '入库数量', value: '×' + displayQuantity(row) },
    { label: '进价', value: '@' + formatYuanOf(row.unitPrice) },
    { label: '合计', value: formatYuanOf(row.total) },
    { label: '售价', value: p ? formatYuanOf(productSellingPrice(row.productId)!) + '/' + productUnitOf(row.productId) : '—' },
    { label: '加价率', value: m != null ? m + '%' : '—' },
    { label: '剩余状态', value: stockLabel(row) },
    { label: '备注', value: row.note || '—' }
  ]
}

import Icon from '../Icon.vue'
// 库存记录（菜单「库存」）：分类 tabs（全部+可见分类）+ el-table 行式列表 + 新增/编辑弹框
// 页面内仍保留「进货」作为数据动作用语（进货价/进价、进货批次、进货明细），仅模块级文案跟随菜单改名
// P0-2：进货行展示售价与加价率对照
// P1-3：跨模块联动跳转
import { computed, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import {
  avgUnsoldUnitPrice,
  autoLinkExpensesForProduct,
  calcMarkupRate,
  checkLedgerYearWrite,
  calcPurchaseStockStatus,
  calcPurchaseTotal,
  deriveInventoryQuantity,
  expenseQtyUnit,
  expenseItemsWithDay,
  flatExpenseItems,
  filterPurchasesByCategory,
  findProduct,
  findProductCategory,
  formatYuanOf,
  localDateKey,
  selectableExpenses,
  sumExpenseAmounts,
  validatePurchaseInput,
  visibleProductCategories,
  type ExpenseLinkOption,
  type ValidationIssue
} from '@/composables/businessCore'
import { exportXlsx } from '@/composables/xlsxExport'
import type { BusinessPurchase, BusinessExpense } from '@/types'
import { usePageSize } from '@/composables/usePageSize'
import { useToast } from '@/composables/useToast'
import { useBizSaving } from '@/composables/useBizSaving'

const toast = useToast()

// P1-3：跨模块联动跳转 emit
const emit = defineEmits<{ navigate: [section: string, filter?: string] }>()

const store = useWorkbenchBusinessStore()

const activeCat = ref('all')
const tabs = computed(() => visibleProductCategories(store.productCategories))
const filtered = computed(() => filterPurchasesByCategory(store.purchases, store.products, activeCat.value))

function productNameOf(id: string): string {
  return findProduct(store.products, id)?.name ?? '（已删除商品）'
}

function catNameOf(productId: string): string {
  const catId = findProduct(store.products, productId)?.categoryId
  return catId ? (findProductCategory(store.productCategories, catId)?.name ?? '未分类') : '未分类'
}

/** 库存数量展示（需求 D）：已关联支出时显示「派生库存数量」（Σ 支出数量 × 商品数量），否则显示录入数量 */
function displayQuantity(row: BusinessPurchase): number {
  if (row.expenseIds && row.expenseIds.length > 0) {
    const dq = deriveInventoryQuantity(row.expenseIds, store.expenseDailies, store.expenseCategories)
    if (dq > 0) return dq
  }
  return row.quantity
}

/** 导出文件名前缀：账本年份 + 账本名称（缺失时由 xlsxFileName 自动省略该段） */
const ledgerMeta = computed(() => ({ year: store.currentLedgerYear, ledgerName: store.currentLedgerName }))

// ===== 一键导出 Excel（库存记录：按当前分类/商品筛选导出）=====
function exportPurchasesExcel(): void {
  const headers = ['日期', '商品', '分类', '入库数量', '进价', '金额', '剩余状态', '备注']
  const rows: (string | number)[][] = filteredWithProductFilter.value.map(p => [
    p.date,
    productNameOf(p.productId),
    catNameOf(p.productId),
    displayQuantity(p),
    p.unitPrice.toFixed(2),
    p.total.toFixed(2),
    stockLabel(p),
    p.note ?? ''
  ])
  void exportXlsx('库存记录', headers, rows, ledgerMeta.value)
}

// P0-2：获取商品售价
function productSellingPrice(productId: string): number | null {
  return findProduct(store.products, productId)?.sellingPrice ?? null
}

// 获取商品单位：进货记录本身不存 unit（BusinessPurchase 无该字段），单位属于商品，
// 显示时必须从关联商品取，回退「件」仅用于商品已删除/缺值的兜底
function productUnitOf(productId: string): string {
  return findProduct(store.products, productId)?.unit || '件'
}

// P0-2：计算加价率（售价 vs 进价）
function markupRateOf(productId: string, unitPrice: number): number | null {
  const product = findProduct(store.products, productId)
  if (!product) return null
  return calcMarkupRate(product.sellingPrice, unitPrice)
}

// P1-3：按商品筛选 prop
const props = defineProps<{ productFilter?: string }>()

/**
 * 进货批次剩余状态（先进先出：最旧批次优先被售出消耗）。
 * 取全量 purchases/dailyRecords 计算（不按筛选），保证跨分类 tab 结果一致。
 */
const stockStatus = computed(() => calcPurchaseStockStatus(store.purchases, store.dailyRecords))

/** 某笔记货的剩余状态（数据异常/新记录时返回 null，表格显示 —） */
function stockOf(purchaseId: string) {
  return stockStatus.value[purchaseId] ?? null
}

/** 剩余状态文案：已售完 / 未售完（剩 N） */
function stockLabel(row: BusinessPurchase): string {
  const st = stockOf(row.id)
  if (!st) return '—'
  return st.soldOut ? '已售完' : `未售完 · 剩 ${st.remaining}`
}

/** 剩余状态样式：sold-out（已售完）/ unsold（未售完）/ none（无数据） */
function stockClass(row: BusinessPurchase): string {
  const st = stockOf(row.id)
  if (!st) return 'none'
  return st.soldOut ? 'sold-out' : 'unsold'
}

/** 剩余状态悬浮说明（说明 FIFO 口径与本批消耗情况） */
function stockTip(row: BusinessPurchase): string {
  const st = stockOf(row.id)
  if (!st) return '暂无数据'
  const base = `按先进先出消耗（最旧批次优先售出）：本批进货 ${st.quantity}，已售 ${st.sold}，剩余 ${st.remaining}；该商品累计售出 ${st.totalSold}`
  return st.isOldest ? `${base}（本批为该商品最旧批次）` : base
}

// P1-3：实际过滤后的列表（叠加 productFilter）
const filteredWithProductFilter = computed(() => {
  let list = filtered.value
  if (props.productFilter) {
    list = list.filter(p => p.productId === props.productFilter)
  }
  return list
})

// ===== el-pagination 分页（固定 10 条/页） =====
const LIST_PAGE_SIZE = 10
/** 移动端（卡片视图）固定每页 6 个 */
const MOBILE_PAGE_SIZE = 6
const { pageSize, PAGE_SIZES } = usePageSize('bizpur-list-pager', LIST_PAGE_SIZE)
const listPage = ref(1)
/** 移动端固定 6/页，桌面沿用持久化 pageSize；setter 在移动端忽略写入，避免污染用户偏好 */
const activePageSize = computed({
  get: () => (vm.isMobile ? MOBILE_PAGE_SIZE : pageSize.value),
  set: (v: number) => {
    if (!vm.isMobile) pageSize.value = v
  }
})
const pageItems = computed<BusinessPurchase[]>(() => {
  const start = (listPage.value - 1) * activePageSize.value
  return filteredWithProductFilter.value.slice(start, start + activePageSize.value)
})
watch(activeCat, () => { listPage.value = 1 })
watch(() => props.productFilter, () => { listPage.value = 1 })
watch(filteredWithProductFilter, () => { listPage.value = 1 })

// ===== 新增/编辑弹框（原型 v2：多行批量录入） =====
const showDialog = ref(false)
// 保存中状态：用于按钮禁用 + loading，防止 await 期间连点重复写入（本弹框为多行循环 + 多次 await，风险最高）
const { saving, run } = useBizSaving()
const editingId = ref<string | null>(null)
const formDate = ref(localDateKey())

/** 弹框内一行库存记录（商品 + 关联支出；数量/进价由关联支出派生或手动填写，兼容旧的无支出记录） */
interface DialogRow {
  id: string | null
  productId: string
  quantity: string
  unitPrice: string
  expenseIds: string[]
}

function emptyRow(productId = ''): DialogRow {
  return { id: null, productId, quantity: '', unitPrice: '', expenseIds: [] }
}

const formRows = ref<DialogRow[]>([])

/** 关联支出展示用：取「支出产品名」（支出产品配置 name），缺省回落到支出标题/兜底 */
function expenseProductOf(e: BusinessExpense): string {
  const cat = store.expenseCategories.find(c => c.id === e.categoryId)
  if (cat && cat.name) return cat.name
  return (typeof e.title === 'string' && e.title.trim()) ? e.title.trim() : '未命名支出'
}
/** 关联支出标签（库存管理：标题改为显示产品）：`日期 产品名` */
function expenseProductLabel(e: BusinessExpense, date?: string): string {
  return `${date ?? ''} ${expenseProductOf(e)}`
}

/** 已关联支出标签列表（「日期 产品名 数量单位」，按日期升序），用于列表徽章悬浮与提示 */
function linkedExpenseLabels(purchase: { expenseIds?: string[] }): string[] {
  const ids = purchase.expenseIds ?? []
  if (ids.length === 0) return []
  return expenseItemsWithDay(store.expenseDailies)
    .filter(x => ids.includes(x.item.id))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(x => {
      const base = expenseProductLabel(x.item, x.date)
      const qu = expenseQtyUnit(x.item)
      return qu ? `${base} ${qu}` : base
    })
}

/** 徽章悬浮文案：逐笔列出「日期 标题」 */
function linkedExpenseTip(purchase: { expenseIds?: string[] }): string {
  const labels = linkedExpenseLabels(purchase)
  if (labels.length === 0) return ''
  return `已关联 ${labels.length} 笔支出：\n${labels.join('\n')}`
}

// ===== 每行派生值（总支出 / 数量 / 进价，原型要求只读） =====
function rowHasExpense(row: DialogRow): boolean {
  return row.expenseIds.length > 0
}
/** 关联支出金额合计（= 总支出列，始终只读） */
function rowTotalExpense(row: DialogRow): number {
  return sumExpenseAmounts(flatExpenseItems(store.expenseDailies), row.expenseIds)
}
/** 关联支出派生的库存数量（Σ 支出数量 × 商品数量） */
function rowDerivedQty(row: DialogRow): number {
  return deriveInventoryQuantity(row.expenseIds, store.expenseDailies, store.expenseCategories)
}
/** 数量是否由关联支出锁定（只读）：关联了支出且能派生出数量 */
function rowLocked(row: DialogRow): boolean {
  return rowHasExpense(row) && rowDerivedQty(row) > 0
}
/** 实际数量：锁定 → 派生值；否则手动输入值 */
function rowQuantity(row: DialogRow): number {
  if (rowLocked(row)) return rowDerivedQty(row)
  return Number(row.quantity) || 0
}
/** 实际进价：关联了支出 → 总支出 ÷ 数量（只读）；否则手动输入值 */
function rowUnitPrice(row: DialogRow): number {
  if (rowHasExpense(row)) {
    const qty = rowQuantity(row)
    const total = rowTotalExpense(row)
    return qty > 0 ? Math.round((total / qty) * 100) / 100 : 0
  }
  return Number(row.unitPrice) || 0
}

/**
 * 每行的可选支出：基础候选由 core.selectableExpenses 给出（排除被其它进货占用的、保留本行已选），
 * 再剔除被本弹框其它行选走的（这些尚未落库，core 看不见），保证一笔支出只能归属一行。
 */
function rowExpenseOptions(index: number): ExpenseLinkOption[] {
  const row = formRows.value[index]
  if (!row) return []
  const othersSelected = new Set<string>()
  formRows.value.forEach((r, i) => {
    if (i !== index) r.expenseIds.forEach(id => othersSelected.add(id))
  })
  const base = selectableExpenses(store.expenseDailies, store.purchases, row.id ?? null, row.expenseIds)
  return base.filter(o => row.expenseIds.includes(o.expense.id) || !othersSelected.has(o.expense.id))
}

/** 勾选 / 取消某行的关联支出（多选） */
function toggleRowExpense(index: number, id: string): void {
  const row = formRows.value[index]
  if (!row) return
  if (row.expenseIds.includes(id)) {
    row.expenseIds = row.expenseIds.filter(x => x !== id)
  } else {
    row.expenseIds = [...row.expenseIds, id]
  }
}

/** 新增一行（商品默认空，用户选择） */
function addRow(): void {
  formRows.value = [...formRows.value, emptyRow()]
}

/** 移除一行；若来自已存在的进货记录则同步删除该记录 */
async function removeRow(index: number): Promise<void> {
  const row = formRows.value[index]
  if (!row) return
  if (row.id) {
    if (!(await showConfirm('确定删除这笔记货吗？'))) return
    await store.deletePurchase(row.id)
  }
  formRows.value = formRows.value.filter((_, i) => i !== index)
}

/**
 * 切换行内商品：重置该行关联支出与数量/进价，按新商品重新自动关联「同名且未关联」支出。
 * 这样下拉选择商品后即刷新后面的数据（关联支出列表 + 派生数量/进价），不会残留上一商品的支出。
 * 仅在选择变化时触发（@change）；打开编辑/复制预填时不调用，保留原有关联。
 */
function onRowProductChange(index: number): void {
  const row = formRows.value[index]
  if (!row) return
  if (!row.productId) {
    row.expenseIds = []
    row.quantity = ''
    row.unitPrice = ''
    return
  }
  const auto = autoLinkExpensesForProduct(row.productId, store.expenseDailies, store.purchases, store.expenseCategories)
  row.expenseIds = [...auto]
  row.quantity = ''
  row.unitPrice = ''
}

// ===== 录入校验（每行独立；error 阻断保存，warn 仅提示） =====
function rowIssues(row: DialogRow): ValidationIssue[] {
  const qty = rowQuantity(row)
  const price = rowUnitPrice(row)
  const hasExp = rowHasExpense(row)
  const total = hasExp ? rowTotalExpense(row) : calcPurchaseTotal(qty, price)
  const issues: ValidationIssue[] = validatePurchaseInput({
    quantity: qty,
    unitPrice: price,
    total,
    expenseTotal: hasExp ? rowTotalExpense(row) : null
  })
  if (!row.productId) issues.unshift({ level: 'error', message: '请选择商品' })
  if (hasExp && rowDerivedQty(row) <= 0 && qty <= 0) {
    issues.push({ level: 'warn', message: '已关联支出但未解析出数量（支出未配置数量），请手动填写数量' })
  }
  return issues
}

const formIssues = computed<ValidationIssue[]>(() => {
  const all: ValidationIssue[] = []
  formRows.value.forEach((row, idx) => {
    rowIssues(row).forEach(i => all.push({ level: i.level, message: `第 ${idx + 1} 行：${i.message}` }))
  })
  return all
})
/** error 级问题阻断保存，warn 级仅提示 */
const formErrors = computed(() => formIssues.value.filter(i => i.level === 'error'))
const isFormValid = computed(() => formRows.value.length > 0 && formErrors.value.length === 0)

// ===== 打开弹框 =====
function startAdd(): void {
  editingId.value = null
  formDate.value = localDateKey()
  // 预置一行：默认商品为首个在售商品，并自动关联同名未关联支出
  const firstProduct = store.products.find(p => p.active)?.id ?? store.products[0]?.id ?? ''
  const row = emptyRow(firstProduct)
  if (firstProduct) {
    row.expenseIds = [...autoLinkExpensesForProduct(firstProduct, store.expenseDailies, store.purchases, store.expenseCategories)]
  }
  formRows.value = [row]
  showDialog.value = true
}

async function startEdit(p: BusinessPurchase): Promise<void> {
  editingId.value = p.id
  formDate.value = p.date
  formRows.value = [{
    id: p.id,
    productId: p.productId,
    quantity: String(p.quantity),
    unitPrice: String(p.unitPrice),
    expenseIds: [...(p.expenseIds ?? [])]
  }]
  showDialog.value = true
}

// 复制：以当前进货记录预填弹框（editingId 置空 → 生成新记录）；关联支出不复制（同一笔支出不可被两笔记货同时关联）
function startCopy(p: BusinessPurchase): void {
  editingId.value = null
  formDate.value = p.date
  formRows.value = [{
    id: null,
    productId: p.productId,
    quantity: String(p.quantity),
    unitPrice: String(p.unitPrice),
    expenseIds: []
  }]
  showDialog.value = true
}

/** 账本只记录其所属年份的数据：日期选择器禁用其它年份（与 store 写入守卫同口径） */
const ledgerYear = computed(() => store.currentLedgerYear)
function disabledDate(d: Date): boolean {
  return d.getFullYear() !== ledgerYear.value
}

/**
 * 进价 → 商品销售成本价：进货保存后按「未售完批次均价」回写商品成本价（口径同商品页展示）。
 * 成本结转本身走 FIFO 逐批单价，这里回写的是商品成本价（兜底口径 + 商品页展示值）。
 */
async function syncProductCostPrice(productId: string): Promise<void> {
  const avg = avgUnsoldUnitPrice(store.purchases, store.dailyRecords, productId)
  if (avg === null) return
  const p = findProduct(store.products, productId)
  if (!p || Math.abs(p.purchasePrice - avg) < 0.005) return
  await store.updateProduct(productId, { purchasePrice: avg })
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const date = formDate.value
  // 预检日期：跨年 / 无账本会在写入时被统一拦截。提前校验可避免
  // 「前几行已入库、到第 N 行才报错」的半成品状态（所有行共用同一个日期）。
  const guard = checkLedgerYearWrite(date, ledgerYear.value)
  if (!guard.ok) { toast.error(guard.message); return }

  let saved = 0
  // 用快照遍历：行号取原始序号，保存成功的行会从 formRows 移出（见下）
  const snapshot = [...formRows.value]
  const ok = await run(async () => {
    for (let i = 0; i < snapshot.length; i++) {
      const row = snapshot[i]
      const rowNo = i + 1
      const qty = rowQuantity(row)
      const price = rowUnitPrice(row)
      const payload = {
        productId: row.productId,
        date,
        quantity: qty,
        unitPrice: price,
        expenseIds: [...row.expenseIds],
        note: undefined
      }
      const tail = saved > 0 ? `（前 ${saved} 条已保存，剩余行请修正后重试）` : ''
      if (row.id) {
        // 换了商品：新旧两个商品的成本价都要重算
        const prevProductId = store.purchases.find(p => p.id === row.id)?.productId
        const r = await store.updatePurchase(row.id, payload)
        if (!r.ok) throw new Error(`第 ${rowNo} 行：${r.message}${tail}`)
        await syncProductCostPrice(row.productId)
        if (prevProductId && prevProductId !== row.productId) await syncProductCostPrice(prevProductId)
      } else {
        const added = await store.addPurchase(payload)
        if (!added.ok) throw new Error(`第 ${rowNo} 行：${added.message}${tail}`)
        await syncProductCostPrice(row.productId)
      }
      // 已入库的行移出待保存列表：store.addPurchase 不回传新 id，
      // 若仍留在 formRows 中，失败后重试会把已成功的行再写一遍（重复建单）
      formRows.value = formRows.value.filter(r => r !== row)
      saved++
    }
  })
  // 失败时 run 已提示具体行号与原因，弹框保留未保存的行供修正后重试
  if (!ok) return
  toast.success(`已保存 ${saved} 条库存记录`)
  showDialog.value = false
}

async function handleDelete(id: string): Promise<void> {
  if (!await showConfirm('确定要删除这笔记货吗？')) return
  await store.deletePurchase(id)
}
</script>

<template>
  <div class="bizpur">
    <!-- 分类 tabs + 新增 -->
    <div class="bizpur-bar">
      <div class="bizpur-tabs">
        <el-radio-group v-model="activeCat" size="small">
          <el-radio-button value="all" data-testid="bizpur-cat-all">全部</el-radio-button>
          <el-radio-button
            v-for="cat in tabs"
            :key="cat.id"
            :value="cat.id"
            :data-testid="`bizpur-cat-${cat.id}`"
          >{{ cat.name }}</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <div class="ewt-table-toolbar is-split">
      <div class="bizpur-toolbar-left">
        <el-button type="primary" data-testid="bizpur-add" @click="startAdd">＋ 新增库存记录</el-button>
        <el-button class="btn-export-xlsx" data-testid="bizpur-export" :disabled="filteredWithProductFilter.length === 0" @click="exportPurchasesExcel">导出 Excel</el-button>
      </div>
      <ViewModeToggle v-if="filteredWithProductFilter.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
    </div>

    <div v-if="filteredWithProductFilter.length === 0" class="bizpur-empty" data-testid="bizpur-empty">暂无库存记录</div>
    <template v-else>
      <div class="bizpur-table-wrap">
        <el-table v-if="vm.mode === 'list'" class="ewt-table"
          :data="pageItems"
          data-testid="bizpur-table"
          stripe
          border
          size="default"
          style="width: 100%"
          height="100%"
          empty-text="暂无库存记录"
        >
          <el-table-column type="index" label="序号" width="70" align="center" class-name="ewt-index-col" :index="(i: number) => (listPage - 1) * activePageSize + i + 1" />
          <el-table-column label="日期" width="120" align="center">
            <template #default="{ row }">
              <span style="font-weight: 600;">{{ row.date }}</span>
            </template>
          </el-table-column>
          <el-table-column label="商品" min-width="160" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span
                class="bizpur-product-link"
                :data-testid="`bizpur-product-${row.id}`"
                @click="findProduct(store.products, row.productId) && emit('navigate', 'products', row.productId)"
              >{{ productNameOf(row.productId) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="分类" width="110" align="center">
            <template #default="{ row }">
              <span class="bizpur-cat-badge" :data-testid="`bizpur-cat-badge-${row.id}`">{{ catNameOf(row.productId) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="入库数量" width="80" align="right">
            <template #default="{ row }">×{{ displayQuantity(row) }}</template>
          </el-table-column>
          <el-table-column label="进价" width="100" align="right">
            <template #default="{ row }">@{{ formatYuanOf(row.unitPrice) }}</template>
          </el-table-column>
          <el-table-column label="合计" width="140" align="right">
            <template #default="{ row }">
              <span class="bizpur-total-text">{{ formatYuanOf(row.total) }}</span>
              <span
                v-if="row.expenseIds && row.expenseIds.length"
                class="bizpur-linked-badge"
                :data-testid="`bizpur-linked-${row.id}`"
                :title="linkedExpenseTip(row)"
              >关联{{ row.expenseIds.length }}笔</span>
            </template>
          </el-table-column>
          <el-table-column label="售价" width="100" align="right">
            <template #default="{ row }">
              <span v-if="findProduct(store.products, row.productId)">{{ formatYuanOf(productSellingPrice(row.productId)!) }}/{{ productUnitOf(row.productId) }}</span>
              <span v-else style="color: var(--color-text-muted, #9ca3af);">—</span>
            </template>
          </el-table-column>
          <el-table-column label="加价率" width="100" align="center">
            <template #default="{ row }">
              <span
                v-if="markupRateOf(row.productId, row.unitPrice) !== null"
                class="bizpur-markup-rate"
                :class="{
                  'rate-high': (markupRateOf(row.productId, row.unitPrice) ?? 0) > 0,
                  'rate-low': (markupRateOf(row.productId, row.unitPrice) ?? 0) <= 0
                }"
              >{{ markupRateOf(row.productId, row.unitPrice) }}%</span>
              <span v-else style="color: var(--color-text-muted, #9ca3af);">—</span>
            </template>
          </el-table-column>
          <!-- 剩余状态：按销售售出数量先进先出消耗，判定该批（最旧批次优先）是否已全部售出 -->
          <el-table-column label="剩余状态" width="140" align="center">
            <template #default="{ row }">
              <span
                class="bizpur-stock"
                :class="stockClass(row)"
                :data-testid="`bizpur-stock-${row.id}`"
                :title="stockTip(row)"
              >
                {{ stockLabel(row) }}
                <span v-if="stockOf(row.id)?.isOldest" class="bizpur-stock-oldest">最旧</span>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="140" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.note" class="bizpur-note-text">{{ row.note }}</span>
              <span v-else style="color: var(--color-text-muted, #9ca3af);">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" class-name="ewt-op-col" width="200" align="center" fixed="right">
            <template #default="{ row }">
              <div class="bizpur-actions" @click.stop>
                <el-button size="small" :data-testid="`bizpur-edit-${row.id}`" @click="startEdit(row)">编辑</el-button>
                <el-button size="small" :data-testid="`bizpur-copy-${row.id}`" @click="startCopy(row)">复制</el-button>
                <el-button size="small" type="danger" :data-testid="`bizpur-del-${row.id}`" @click="handleDelete(row.id)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="ewt-card-grid">
          <RecordsCard
            @edit="startEdit(item)"
            v-for="item in pageItems"
            :key="item.id"
            :fields="cardFields(item)"
          >
            <template #actions>
              <el-button size="small" :data-testid="`bizpur-card-edit-${item.id}`" @click.stop="startEdit(item)">编辑</el-button>
              <el-button size="small" :data-testid="`bizpur-card-copy-${item.id}`" @click.stop="startCopy(item)">复制</el-button>
              <el-button size="small" type="danger" :data-testid="`bizpur-card-del-${item.id}`" @click.stop="handleDelete(item.id)">删除</el-button>
            </template>
          </RecordsCard>
        </div>

      </div>
      <div class="bizpur-list-pager ewt-pager">
        <el-pagination
          v-model:current-page="listPage"
          @size-change="listPage = 1"
          v-model:page-size="activePageSize"
          :page-sizes="PAGE_SIZES"
          layout="total, prev, pager, next, jumper"
          :total="filteredWithProductFilter.length"
          background
          small
          prev-text="上一页"
          next-text="下一页"
          data-testid="bizpur-pagination"
        />
      </div>
    </template>

    <!-- 新增/编辑弹框（原型 v2：多行批量录入） -->
    <el-dialog
      v-if="showDialog"
      :model-value="true"
      :show-close="false"
      width="90%"
      data-testid="bizpur-dialog"
      @close="showDialog = false"
    >
      <template #header>
        <div class="biz-dialog-header">
          <h3>{{ editingId ? '编辑库存记录' : '新增库存记录' }}</h3>
          <button class="biz-dialog-close" @click="showDialog = false"><Icon name="close" /></button>
        </div>
      </template>
      <form class="biz-dialog-body" @submit.prevent="handleSave">
        <!-- 第一行：日期 -->
        <div class="biz-field">
          <label>日期 *</label>
          <div data-testid="bizpur-form-date">
            <el-date-picker
              v-model="formDate"
              type="date"
              value-format="YYYY-MM-DD"
              size="small"
              :disabled-date="disabledDate"
            />
          </div>
        </div>
        <!-- 第二行：添加库存（最右） -->
        <div class="bizpur-add-bar">
          <el-button type="primary" size="small" data-testid="bizpur-add-row" @click="addRow">＋ 添加库存</el-button>
        </div>
        <!-- 表格类列表：商品 / 总支出 / 入库数量 / 进价 / 关联支出（多选） / 操作 -->
        <div class="bizpur-row-table" data-testid="bizpur-row-table">
          <table class="bizpur-line-table">
            <thead>
              <tr>
                <th class="col-idx">#</th>
                <th class="col-prod">商品 *</th>
                <th>总支出</th>
                <th>入库数量</th>
                <th>进价</th>
                <th class="col-exp">关联支出（多选）</th>
                <th class="col-op">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in formRows" :key="row.id ?? ('new-' + idx)">
                <td class="col-idx">{{ idx + 1 }}</td>
                <td class="col-prod">
                  <el-select v-model="row.productId" size="small" filterable :fit-input-width="false" :data-testid="`bizpur-row-product-${idx}`" @change="onRowProductChange(idx)">
                    <el-option
                      v-for="p in store.products"
                      :key="p.id"
                      :value="p.id"
                      :label="p.name + (p.active ? '' : '（已停售）')"
                    />
                  </el-select>
                </td>
                <td class="bizpur-td-num">
                  <span class="rd rd-money">{{ formatYuanOf(rowTotalExpense(row)) }}</span>
                </td>
                <td class="bizpur-td-num">
                  <span v-if="rowLocked(row)" class="rd">{{ rowQuantity(row) }}</span>
                  <el-input-number
                    v-else
                    :min="1"
                    :step="1"
                    size="small"
                    controls-position="right"
                    :model-value="row.quantity === '' ? undefined : Number(row.quantity)"
                    @update:model-value="row.quantity = String($event ?? '')"
                    :data-testid="`bizpur-row-qty-${idx}`"
                  />
                </td>
                <td class="bizpur-td-num">
                  <span v-if="rowHasExpense(row)" class="rd">{{ formatYuanOf(rowUnitPrice(row)) }}</span>
                  <el-input-number
                    v-else
                    :min="0"
                    :step="0.01"
                    :precision="2"
                    size="small"
                    controls-position="right"
                    :model-value="row.unitPrice === '' ? undefined : Number(row.unitPrice)"
                    @update:model-value="row.unitPrice = String($event ?? '')"
                    :data-testid="`bizpur-row-price-${idx}`"
                  />
                </td>
                <td class="col-exp">
                  <div class="exps" :data-testid="`bizpur-row-exps-${idx}`">
                    <label
                      v-for="opt in rowExpenseOptions(idx)"
                      :key="opt.expense.id"
                      class="exp"
                      :class="row.expenseIds.includes(opt.expense.id) ? 'linked' : 'unlinked'"
                    >
                      <input
                        type="checkbox"
                        :checked="row.expenseIds.includes(opt.expense.id)"
                        :data-testid="`bizpur-row-exp-${idx}-${opt.expense.id}`"
                        @change="toggleRowExpense(idx, opt.expense.id)"
                      />
                      <span class="exp-label">{{ expenseProductLabel(opt.expense, opt.date) }}</span>
                      <span v-if="expenseQtyUnit(opt.expense)" class="exp-qty">{{ expenseQtyUnit(opt.expense) }}</span>
                      <span class="exp-amt">{{ formatYuanOf(opt.expense.amount) }}</span>
                    </label>
                    <p v-if="rowExpenseOptions(idx).length === 0" class="exps-empty">暂无可关联的支出</p>
                  </div>
                </td>
                <td class="col-op">
                  <el-button size="small" type="danger" :data-testid="`bizpur-row-remove-${idx}`" @click="removeRow(idx)">移除</el-button>
                </td>
              </tr>
              <tr v-if="formRows.length === 0">
                <td colspan="7" class="bizpur-empty-row">暂无库存记录行，点击右上角「添加库存」新增一行</td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- 校验提示（error 阻断保存 / warn 仅提示） -->
        <ul v-if="formIssues.length > 0" class="bizpur-issues" data-testid="bizpur-form-issues">
          <li
            v-for="(issue, idx) in formIssues"
            :key="idx"
            class="bizpur-issue"
            :class="issue.level"
            :data-testid="`bizpur-issue-${idx}`"
          >{{ issue.level === 'error' ? '✕ ' : '! ' }}{{ issue.message }}</li>
        </ul>
        <div class="biz-form-actions ewt-dialog-footer">
          <el-button @click="showDialog = false">取消</el-button>
          <el-button type="primary" native-type="submit" :disabled="!isFormValid || saving" :loading="saving" data-testid="bizpur-save">
            {{ editingId ? '保存' : '添加' }}
          </el-button>
        </div>
      </form>
    </el-dialog>
  </div>
</template>

<style scoped>
.bizpur {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.bizpur-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bizpur-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bizpur-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bizpur-empty {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-muted, var(--color-text-muted));
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

/* ===== el-table 表格容器（参考 WorkbenchNotes） ===== */
.bizpur-table-wrap {
  flex: 1 1 auto;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.bizpur-table-wrap > :global(.el-table) {
  flex: 1 1 auto;
  min-height: 220px;
  width: 100% !important;
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.bizpur-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.bizpur-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .bizpur-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .bizpur-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.bizpur-table-wrap > :global(.el-table .el-table__body-wrapper .cell),
.bizpur-table-wrap > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条（参考 WorkbenchNotes） ===== */
.bizpur-list-pager {
  flex: 0 0 auto;
  padding: 14px 16px 18px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  margin: 0 0 8px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .bizpur-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}

/* ===== 表格内徽章/链接/标签 ===== */
.bizpur-product-link {
  color: var(--color-link, var(--color-primary, #3b82f6));
  cursor: pointer;
  text-decoration: underline;
}
.bizpur-product-link:hover {
  color: var(--color-primary-hover, var(--color-primary, #2563eb));
}
.bizpur-cat-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-primary, var(--color-primary));
  background: color-mix(in srgb, var(--color-primary, var(--color-primary)) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary, var(--color-primary)) 30%, transparent);
  border-radius: var(--radius-full, 999px);
  white-space: nowrap;
}
.bizpur-total-text {
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

/* ===== 进货优化：关联支出（多选列表 + 搜索 + 分页 + 关联笔数徽章） ===== */
.bizpur-expense-empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, #9ca3af);
}

.bizpur-expense-search {
  margin-bottom: 6px;
}

.bizpur-expense-more {
  display: flex;
  justify-content: center;
  margin-top: 6px;
}

.bizpur-expense-list {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background: var(--color-bg-input, #f9fafb);
}

.bizpur-expense-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-text, #111827);
  cursor: pointer;
}

.bizpur-expense-item:hover {
  background: var(--color-bg-hover, #f1f5f9);
}

.bizpur-expense-item.checked {
  background: var(--color-primary-soft, #eff6ff);
}

/* 已被其它进货关联的支出不再出现在候选里，故无需置灰样式 */

.bizpur-expense-date {
  font-weight: 600;
  flex-shrink: 0;
}

.bizpur-expense-amount {
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.bizpur-expense-qty {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--color-bg-tag, #f1f5f9);
  color: var(--color-text-muted, #6b7280);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
:global(html.dark) .bizpur-expense-qty {
  background: var(--color-bg-tag-dark, #1f2937);
  color: var(--color-text-muted, #9ca3af);
}

.bizpur-expense-note {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted, #9ca3af);
}

/* 录入校验提示 */
.bizpur-issues {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bizpur-issue {
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
}

.bizpur-issue.error {
  color: var(--color-error, #dc2626);
  background: color-mix(in srgb, var(--color-error, #dc2626) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-error, #dc2626) 30%, transparent);
}

.bizpur-issue.warn {
  color: var(--color-warning, #b45309);
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-warning, #f59e0b) 30%, transparent);
}

.bizpur-expense-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

/* 需求 D：数量由关联支出派生时的只读提示 */
.bizpur-qty-derived {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
  border-radius: 6px;
  padding: 4px 8px;
  font-variant-numeric: tabular-nums;
}
:global(html.dark) .bizpur-qty-derived {
  background: rgba(59, 130, 246, 0.16);
  color: #93c5fd;
  border-color: rgba(59, 130, 246, 0.45);
}

/* ===== 剩余状态（先进先出消耗：已售完 / 未售完 · 剩 N） ===== */
.bizpur-stock {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 1.6;
  border-radius: var(--radius-full, 999px);
  border: 1px solid transparent;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.bizpur-stock.sold-out {
  color: var(--color-success, #16a34a);
  background: color-mix(in srgb, var(--color-success, #16a34a) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-success, #16a34a) 32%, transparent);
}

.bizpur-stock.unsold {
  color: var(--color-warning, #b45309);
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 14%, transparent);
  border-color: color-mix(in srgb, var(--color-warning, #f59e0b) 34%, transparent);
}

.bizpur-stock.none {
  color: var(--color-text-muted, #9ca3af);
}

.bizpur-stock-oldest {
  padding: 0 5px;
  border-radius: var(--radius-full, 999px);
  font-size: 11px;
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-muted, #6b7280);
}

.bizpur-linked-badge {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 400;
  background: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
}

:global(html.dark) .bizpur-expense-list {
  background: var(--color-bg-hover, #111827);
  border-color: var(--color-border, #374151);
}
.bizpur-markup-rate.rate-high {
  color: var(--color-success, var(--color-success));
  font-weight: 600;
}
.bizpur-markup-rate.rate-low {
  color: var(--color-error, var(--color-error));
  font-weight: 600;
}
.bizpur-note-text {
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
}
.bizpur-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
}

/* 销售成本价预览：当前 → 保存后（未售完批次均价） */
.bizpur-cost-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.bizpur-cost-current {
  color: var(--color-text-muted, #6b7280);
  text-decoration: line-through;
}
.bizpur-cost-arrow {
  color: var(--color-text-muted, #9ca3af);
}
.bizpur-cost-next {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text, #1f2937);
}
.bizpur-cost-next.changed {
  color: var(--color-primary, #3b82f6);
}
.bizpur-cost-tip {
  font-size: 12px;
  color: var(--color-text-muted, #9ca3af);
}
:global(html.dark) .bizpur-cost-next {
  color: var(--color-text, #e5e7eb);
}

/* P0-2：编辑弹框售价参考 */
.bizpur-form-price-ref {
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
}

.bizpur-total-preview {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

/* 弹框 */
.biz-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
}

.biz-dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

.biz-dialog-close {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--color-text-muted, var(--color-text-muted));
  cursor: pointer;
}

.biz-dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.biz-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.biz-field > label {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.biz-form-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.biz-form-row .biz-field {
  flex: 1;
  min-width: 110px;
}

.biz-form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.biz-input {
  box-sizing: border-box;
  padding: 9px 12px;
  background-color: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text, var(--color-text));
}

.biz-input:focus {
  outline: none;
  border-color: var(--color-primary, var(--color-primary));
}

html.dark .biz-dialog {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .bizpur-stock.sold-out {
  color: #6ee7b7;
  background: rgba(22, 163, 74, 0.2);
  border-color: rgba(22, 163, 74, 0.45);
}

html.dark .bizpur-stock.unsold {
  color: #fcd34d;
  background: rgba(245, 158, 11, 0.18);
  border-color: rgba(245, 158, 11, 0.45);
}

html.dark .bizpur-stock-oldest {
  background: rgba(148, 163, 184, 0.2);
  color: #cbd5e1;
}

html.dark .bizpur-cat-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

html.dark .biz-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

/* el-* 表单控件撑满字段 */
.bizpur :deep(.el-date-editor) {
  width: 100%;
}

.bizpur :deep(.el-input-number) {
  width: 100%;
}

/* el-dialog 外壳对齐原弹框 */
.bizpur :deep(.el-dialog) {
  padding: 0;
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
  max-height: 85vh;
  overflow-y: auto;
}

.bizpur :deep(.el-dialog__header) {
  padding: 0;
}

.bizpur :deep(.el-dialog__body) {
  padding: 0;
}

/* ===== 原型 v2：多行批量录入弹框 ===== */
.bizpur-add-bar {
  display: flex;
  justify-content: flex-end;
}

.bizpur-row-table {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  background: var(--color-bg-card, #fff);
}

.bizpur-line-table {
  width: 100%;
  min-width: 920px;
  border-collapse: collapse;
  font-size: 13px;
}

.bizpur-line-table thead th {
  position: sticky;
  top: 0;
  background: var(--color-bg-hover, #f3f4f6);
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  text-align: center;
  padding: 9px 10px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  white-space: nowrap;
}

.bizpur-line-table thead th.col-prod,
.bizpur-line-table thead th.col-exp {
  text-align: left;
}

.bizpur-line-table tbody td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  vertical-align: middle;
}

.bizpur-line-table tbody tr:hover {
  background: var(--color-bg-card, #f9fafb);
}

.bizpur-line-table .col-idx {
  width: 40px;
  text-align: center;
  color: var(--color-text-muted, #9ca3af);
}

.bizpur-line-table .col-op {
  width: 72px;
  text-align: center;
  white-space: nowrap;
}

/* 商品列：给足宽度避免长商品名被挤压截断；下拉框撑满列宽 */
.bizpur-line-table .col-prod {
  min-width: 200px;
}

.bizpur-line-table :deep(.el-select) {
  width: 100%;
}

.bizpur-td-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* 只读派生值徽标 */
.rd {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--color-bg-hover, #f3f4f6);
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.rd-money {
  color: var(--color-success, #16a34a);
}

/* 关联支出：多选框列表 */
.exps {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background: var(--color-bg-input, #f9fafb);
  max-height: 132px;
  overflow-y: auto;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.exp {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-text, #111827);
  cursor: pointer;
  white-space: nowrap;
}

.exp:hover {
  background: var(--color-bg-hover, #f1f5f9);
}

.exp input {
  accent-color: var(--color-primary, #3b82f6);
}

.exp.linked {
  background: color-mix(in srgb, var(--color-success, #16a34a) 12%, transparent);
}

.exp .exp-label {
  font-weight: 600;
  flex-shrink: 0;
}

.exp .exp-qty {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--color-bg-tag, #f1f5f9);
  color: var(--color-text-muted, #6b7280);
  font-size: 11px;
}

.exp .exp-amt {
  margin-left: auto;
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.exps-empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, #9ca3af);
}

.bizpur-empty-row {
  text-align: center;
  color: var(--color-text-muted, #9ca3af);
  font-size: 13px;
  padding: 16px 10px;
}

html.dark .bizpur-row-table {
  background: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

html.dark .bizpur-line-table thead th {
  background: var(--color-bg-hover, #111827);
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .bizpur-line-table tbody td {
  border-bottom-color: var(--color-border, #374151);
}

html.dark .bizpur-line-table tbody tr:hover {
  background: var(--color-bg-hover, #111827);
}

html.dark .exps {
  background: var(--color-bg-hover, #111827);
  border-color: var(--color-border, #374151);
}

html.dark .rd {
  background: var(--color-bg-hover, #111827);
  color: #cbd5e1;
}
</style>
