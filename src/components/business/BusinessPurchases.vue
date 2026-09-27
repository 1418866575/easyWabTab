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
    { label: '数量', value: '×' + row.quantity },
    { label: '进价', value: '@' + formatYuanOf(row.unitPrice) },
    { label: '合计', value: formatYuanOf(row.total) },
    { label: '售价', value: p ? formatYuanOf(productSellingPrice(row.productId)!) + '/' + productUnitOf(row.productId) : '—' },
    { label: '加价率', value: m != null ? m + '%' : '—' },
    { label: '剩余状态', value: stockLabel(row) },
    { label: '备注', value: row.note || '—' }
  ]
}

import Icon from '../Icon.vue'
// 进货记录：分类 tabs（全部+可见分类）+ el-table 行式列表 + 新增/编辑弹框
// P0-2：进货行展示售价与加价率对照
// P1-3：跨模块联动跳转
import { computed, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import {
  calcMarkupRate,
  calcPurchaseStockStatus,
  calcPurchaseTotal,
  deriveQuantity,
  deriveUnitPrice,
  expenseLabel,
  filterPurchasesByCategory,
  findProduct,
  findProductCategory,
  formatYuanOf,
  localDateKey,
  selectableExpenses,
  sumExpenseAmounts,
  validatePurchaseInput,
  visibleProductCategories
} from '@/composables/businessCore'
import { buildCsv, csvFileName, downloadCsv } from '@/composables/csvExport'
import type { BusinessPurchase } from '@/types'
import { usePageSize } from '@/composables/usePageSize'
import { useToast } from '@/composables/useToast'

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

// ===== 一键导出 CSV（进货记录：按当前分类/商品筛选导出）=====
function exportPurchasesCsv(): void {
  const headers = ['日期', '商品', '分类', '数量', '进价', '金额', '剩余状态', '备注']
  const rows: (string | number)[][] = filteredWithProductFilter.value.map(p => [
    p.date,
    productNameOf(p.productId),
    catNameOf(p.productId),
    p.quantity,
    p.unitPrice.toFixed(2),
    p.total.toFixed(2),
    stockLabel(p),
    p.note ?? ''
  ])
  downloadCsv(csvFileName('进货记录'), buildCsv(headers, rows))
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

// ===== 新增/编辑弹框 =====
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formProductId = ref('')
const formDate = ref(localDateKey())
const formQuantity = ref('')
const formUnitPrice = ref('')
const formNote = ref('')
/** 进货优化：本次进货关联的支出记录 id（可多条；合计金额由支出金额自动汇总） */
const formExpenseIds = ref<string[]>([])

/** 可选支出列表（日期倒序）：已被其它进货关联的置灰并标注关联商品，不可重复关联 */
const expenseOptions = computed(() => selectableExpenses(store.expenses, store.purchases, editingId.value))

/** 已关联支出金额合计 */
const linkedExpenseTotal = computed(() => sumExpenseAmounts(store.expenses, formExpenseIds.value))
/** 是否走「支出汇总」口径：关联了支出 → 合计由支出决定；否则 数量 × 进价 */
const useExpenseTotal = computed(() => formExpenseIds.value.length > 0)

const formTotal = computed(() =>
  useExpenseTotal.value ? linkedExpenseTotal.value : calcPurchaseTotal(Number(formQuantity.value) || 0, Number(formUnitPrice.value) || 0)
)

/** 关联支出后：输入数量 → 自动反算进价（合计 ÷ 数量；合计为 0 或数量为 0 时不算，避免除零） */
function onQuantityInput(): void {
  if (!useExpenseTotal.value) return
  const price = deriveUnitPrice(linkedExpenseTotal.value, Number(formQuantity.value) || 0)
  if (price !== null) formUnitPrice.value = String(price)
}

/** 关联支出后：输入进价 → 自动反算数量（合计 ÷ 进价；合计为 0 或进价为 0 时不算，避免除零） */
function onUnitPriceInput(): void {
  if (!useExpenseTotal.value) return
  const qty = deriveQuantity(linkedExpenseTotal.value, Number(formUnitPrice.value) || 0)
  if (qty !== null) formQuantity.value = String(qty)
}

/** 勾选/取消关联支出后同步联动一次（数量为空时按进价反推，保证合计始终等于支出汇总） */
function onExpenseChange(): void {
  if (!useExpenseTotal.value) return
  if (Number(formQuantity.value) > 0) onQuantityInput()
  else if (Number(formUnitPrice.value) > 0) onUnitPriceInput()
}

/** 支出项是否可选（已被其它进货记录占用 → 不可再关联） */
function isExpenseTaken(opt: { linkedPurchaseId?: string }): boolean {
  return !!opt.linkedPurchaseId
}

/** 占用该支出的进货记录所属商品名（用于在可选列表中标注「已被谁关联」） */
function linkedPurchaseProductName(purchaseId: string): string {
  const p = store.purchases.find(x => x.id === purchaseId)
  return p ? productNameOf(p.productId) : '（已删除记录）'
}

/** 已关联支出标签列表（「日期 标题」，按日期+创建时间升序），用于徽章悬浮与提示 */
function linkedExpenseLabels(purchase: { expenseIds?: string[] }): string[] {
  const ids = purchase.expenseIds ?? []
  if (ids.length === 0) return []
  return store.expenses
    .filter(e => ids.includes(e.id))
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) : a.date < b.date ? -1 : 1))
    .map(e => expenseLabel(e))
}

/** 徽章悬浮文案：逐笔列出「日期 标题」 */
function linkedExpenseTip(purchase: { expenseIds?: string[] }): string {
  const labels = linkedExpenseLabels(purchase)
  if (labels.length === 0) return ''
  return `已关联 ${labels.length} 笔支出：\n${labels.join('\n')}`
}

function toggleExpense(id: string): void {
  if (formExpenseIds.value.includes(id)) {
    formExpenseIds.value = formExpenseIds.value.filter(x => x !== id)
  } else {
    formExpenseIds.value = [...formExpenseIds.value, id]
  }
  onExpenseChange()
}

// ===== 录入校验（数量为 0 / 进价为 0 / 合计与关联支出汇总不符）=====
const purchaseIssues = computed(() =>
  validatePurchaseInput({
    quantity: Number(formQuantity.value) || 0,
    unitPrice: Number(formUnitPrice.value) || 0,
    total: formTotal.value,
    expenseTotal: useExpenseTotal.value ? linkedExpenseTotal.value : null
  })
)
/** error 级问题阻断保存，warn 级仅提示 */
const purchaseErrors = computed(() => purchaseIssues.value.filter(i => i.level === 'error'))

const isFormValid = computed(
  () =>
    formProductId.value !== '' &&
    formDate.value !== '' &&
    formTotal.value > 0 &&
    purchaseErrors.value.length === 0
)

function startAdd(): void {
  editingId.value = null
  formProductId.value = store.products.find(p => p.active)?.id ?? store.products[0]?.id ?? ''
  formDate.value = localDateKey()
  formQuantity.value = ''
  formUnitPrice.value = ''
  formNote.value = ''
  formExpenseIds.value = []
  showDialog.value = true
}

async function startEdit(p: BusinessPurchase): Promise<void> {
  editingId.value = p.id
  formProductId.value = p.productId
  formDate.value = p.date
  formQuantity.value = String(p.quantity)
  formUnitPrice.value = String(p.unitPrice)
  formNote.value = p.note ?? ''
  // 编辑时回填已关联支出（含已被本记录占用的，自身占用不算冲突）
  formExpenseIds.value = [...(p.expenseIds ?? [])]
  showDialog.value = true
}

// 复制：以当前进货记录预填表单，打开「新增」弹框（editingId 置空 → 生成新记录）。
// 关联支出不复制：同一笔支出不可被两笔记货同时关联（复制后由用户重新选择）
function startCopy(p: BusinessPurchase): void {
  editingId.value = null
  formProductId.value = p.productId
  formDate.value = p.date
  formQuantity.value = String(p.quantity)
  formUnitPrice.value = String(p.unitPrice)
  formNote.value = p.note ?? ''
  formExpenseIds.value = []
  showDialog.value = true
}

/** 连续录入：新增保存后不关闭弹框，自动带出上次商品与日期，便于连开多单 */
const continuous = ref(true)

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const payload = {
    productId: formProductId.value,
    date: formDate.value,
    quantity: Number(formQuantity.value),
    unitPrice: Number(formUnitPrice.value),
    expenseIds: [...formExpenseIds.value],
    note: formNote.value.trim() || undefined
  }
  if (editingId.value) {
    await store.updatePurchase(editingId.value, payload)
    showDialog.value = false
    return
  }
  await store.addPurchase(payload)
  // 连续录入：保留商品与日期，清空数量/进价/备注/关联支出，弹框继续开
  if (continuous.value) {
    const keepProduct = formProductId.value
    const keepDate = formDate.value
    formQuantity.value = ''
    formUnitPrice.value = ''
    formNote.value = ''
    formExpenseIds.value = []
    formProductId.value = keepProduct
    formDate.value = keepDate
    toast.success(`已保存「${productNameOf(keepProduct)}」进货，可继续录入下一笔`)
    return
  }
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
        <el-button type="primary" data-testid="bizpur-add" @click="startAdd">＋ 新增进货</el-button>
        <el-button class="btn-export-csv" data-testid="bizpur-export" :disabled="filteredWithProductFilter.length === 0" @click="exportPurchasesCsv">导出 CSV</el-button>
      </div>
      <ViewModeToggle v-if="filteredWithProductFilter.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
    </div>

    <div v-if="filteredWithProductFilter.length === 0" class="bizpur-empty" data-testid="bizpur-empty">暂无进货记录</div>
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
          empty-text="暂无进货记录"
        >
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
          <el-table-column label="数量" width="80" align="right">
            <template #default="{ row }">×{{ row.quantity }}</template>
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
          <!-- 剩余状态：按收摊售出数量先进先出消耗，判定该批（最旧批次优先）是否已全部售出 -->
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

    <!-- 新增/编辑弹框 -->
    <el-dialog
      v-if="showDialog"
      :model-value="true"
      :show-close="false"
      width="480px"
      data-testid="bizpur-dialog"
      @close="showDialog = false"
    >
      <template #header>
        <div class="biz-dialog-header">
          <h3>{{ editingId ? '编辑进货' : '新增进货' }}</h3>
          <button class="biz-dialog-close" @click="showDialog = false"><Icon name="close" /></button>
        </div>
      </template>
      <form class="biz-dialog-body" @submit.prevent="handleSave">
        <div class="biz-field">
          <label>商品 *</label>
          <el-select v-model="formProductId" size="small" data-testid="bizpur-form-product">
            <el-option
              v-for="p in store.products"
              :key="p.id"
              :value="p.id"
              :label="p.name + (p.active ? '' : '（已停售）')"
            />
          </el-select>
          <!-- P0-2：选中商品后回显当前售价作为参考 -->
          <span v-if="formProductId && findProduct(store.products, formProductId)" class="bizpur-form-price-ref">
            当前售价参考：{{ formatYuanOf(findProduct(store.products, formProductId)!.sellingPrice) }}/{{ productUnitOf(formProductId) }}
          </span>
        </div>
        <div class="biz-form-row">
          <div class="biz-field">
            <label>日期 *</label>
            <div data-testid="bizpur-form-date">
              <el-date-picker
                v-model="formDate"
                type="date"
                value-format="YYYY-MM-DD"
                size="small"
              />
            </div>
          </div>
          <div class="biz-field">
            <label>数量 *</label>
            <el-input-number
              :min="1"
              :step="1"
              size="small"
              controls-position="right"
              :model-value="formQuantity === '' ? undefined : Number(formQuantity)"
              @update:model-value="formQuantity = String($event ?? ''); onQuantityInput()"
              data-testid="bizpur-form-qty"
            />
          </div>
          <div class="biz-field">
            <label>进价 *</label>
            <el-input-number
              :min="0"
              :step="0.01"
              :precision="2"
              size="small"
              controls-position="right"
              :model-value="formUnitPrice === '' ? undefined : Number(formUnitPrice)"
              @update:model-value="formUnitPrice = String($event ?? ''); onUnitPriceInput()"
              data-testid="bizpur-form-price"
            />
          </div>
        </div>
        <!-- 进货优化：关联支出（可多条）；合计金额 = 已关联支出金额之和，数量与进价随合计双向联动 -->
        <div class="biz-field">
          <label>关联支出（可选，可多选）</label>
          <p v-if="expenseOptions.length === 0" class="bizpur-expense-empty" data-testid="bizpur-expense-empty">当前账本暂无支出记录</p>
          <div v-else class="bizpur-expense-list" data-testid="bizpur-expense-list">
            <label
              v-for="opt in expenseOptions"
              :key="opt.expense.id"
              class="bizpur-expense-item"
              :class="{ taken: isExpenseTaken(opt), checked: formExpenseIds.includes(opt.expense.id) }"
              :data-testid="`bizpur-expense-${opt.expense.id}`"
            >
              <input
                type="checkbox"
                :checked="formExpenseIds.includes(opt.expense.id)"
                :disabled="isExpenseTaken(opt)"
                :data-testid="`bizpur-expense-check-${opt.expense.id}`"
                @change="toggleExpense(opt.expense.id)"
              />
              <!-- 日期 + 标题：同一天可能有多笔支出，靠标题区分 -->
              <span class="bizpur-expense-date">{{ opt.label }}</span>
              <span class="bizpur-expense-amount">{{ formatYuanOf(opt.expense.amount) }}</span>
              <span v-if="opt.expense.note" class="bizpur-expense-note">{{ opt.expense.note }}</span>
              <span v-if="isExpenseTaken(opt)" class="bizpur-expense-taken">已关联：{{ linkedPurchaseProductName(opt.linkedPurchaseId!) }}</span>
            </label>
          </div>
          <p class="bizpur-expense-hint" data-testid="bizpur-expense-hint">
            已选 {{ formExpenseIds.length }} 笔，关联金额合计 {{ formatYuanOf(linkedExpenseTotal) }}；勾选后修改数量自动算进价、修改进价自动反算数量。
          </p>
        </div>
        <div class="biz-field">
          <label>{{ useExpenseTotal ? '合计（= 关联支出汇总）' : '合计（自动计算）' }}</label>
          <div class="bizpur-total-preview" data-testid="bizpur-form-total">{{ formatYuanOf(formTotal) }}</div>
        </div>
        <!-- 录入校验提示（error 阻断保存 / warn 仅提示） -->
        <ul v-if="purchaseIssues.length > 0" class="bizpur-issues" data-testid="bizpur-form-issues">
          <li
            v-for="(issue, idx) in purchaseIssues"
            :key="idx"
            class="bizpur-issue"
            :class="issue.level"
            :data-testid="`bizpur-issue-${idx}`"
          >{{ issue.level === 'error' ? '✕ ' : '! ' }}{{ issue.message }}</li>
        </ul>
        <div class="biz-field">
          <label>备注（可选）</label>
          <el-input v-model="formNote" size="small" maxlength="100" data-testid="bizpur-form-note" />
        </div>
        <div class="biz-form-actions ewt-dialog-footer">
          <el-checkbox v-if="!editingId" v-model="continuous" data-testid="bizpur-continuous" title="勾选后保存不关闭弹框，自动带出上次商品与日期">连续录入</el-checkbox>
          <el-button @click="showDialog = false">取消</el-button>
          <el-button type="primary" native-type="submit" :disabled="!isFormValid" data-testid="bizpur-save">
            {{ editingId ? '保存' : '添加' }}
          </el-button>
          <el-button v-if="editingId" type="danger" native-type="button" data-testid="bizpur-record-delete" @click="handleDelete(editingId)">删除</el-button>
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

/* ===== 进货优化：关联支出（多选列表 + 已占用标记 + 关联笔数徽章） ===== */
.bizpur-expense-empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, #9ca3af);
}

.bizpur-expense-list {
  display: grid;
  gap: 6px;
  max-height: 168px;
  overflow-y: auto;
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

/* 已被其它进货关联：置灰 + 禁止勾选 */
.bizpur-expense-item.taken {
  opacity: 0.55;
  cursor: not-allowed;
}

.bizpur-expense-date {
  font-weight: 600;
  flex-shrink: 0;
}

.bizpur-expense-amount {
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.bizpur-expense-note {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted, #9ca3af);
}

.bizpur-expense-taken {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-muted, #6b7280);
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
</style>
