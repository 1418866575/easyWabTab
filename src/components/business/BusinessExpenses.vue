<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import { showConfirm } from '@/utils/dialog'
import { useToast } from '@/composables/useToast'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

// 卡片视图：一张卡 = 一天的支出日记账（日期 + 当天支出合计 + 产品数 + 备注）
function cardFields(d: BusinessExpenseDaily) {
  return [
    { label: '支出合计', value: formatYuanOf(dayTotal(d)), emphasis: true },
    { label: '产品数', value: d.items.length + ' 笔' },
    { label: '备注', value: d.note || '—' }
  ]
}

// 列表/卡片均为「一天一笔」的日容器视图：日期倒序，同日多产品归入同一天
import { computed, reactive, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import {
  EXPENSE_TITLE_MAX,
  EXPENSE_UNITS,
  EXPENSE_PAYMENT_METHODS,
  calcExpenseAmount,
  validateExpenseRow,
  findExpenseCategory,
  formatYuanOf,
  localDateKey,
  sortExpenseDailies,
  type ExpenseItemDraft
} from '@/composables/businessCore'
import { exportXlsx } from '@/composables/xlsxExport'
import type { BusinessExpenseDaily } from '@/types'
import Icon from '@/components/Icon.vue'
import { usePageSize } from '@/composables/usePageSize'

const store = useWorkbenchBusinessStore()
const toast = useToast()

function catNameOf(id: string): string {
  return findExpenseCategory(store.expenseCategories, id)?.name ?? '未知'
}

/** 某天支出合计（该日所有产品明细金额之和） */
function dayTotal(d: BusinessExpenseDaily): number {
  return Math.round(
    d.items.reduce((s, e) => s + (typeof e.amount === 'number' && Number.isFinite(e.amount) ? e.amount : 0), 0) * 100
  ) / 100
}

// 日容器按日期倒序
const sorted = computed<BusinessExpenseDaily[]>(() => sortExpenseDailies(store.expenseDailies))

/** 导出文件名前缀：账本年份 + 账本名称（缺失时由 xlsxFileName 自动省略该段） */
const ledgerMeta = computed(() => ({ year: store.currentLedgerYear, ledgerName: store.currentLedgerName }))

// ===== 一键导出 Excel（按「日期 × 产品」展开）=====
function exportExpensesExcel(): void {
  const headers = ['日期', '产品', '单位', '数量', '单价', '金额', '支付方式', '标题', '订货电话', '订货地址', '业务员', '备注']
  const rows: (string | number)[][] = []
  for (const d of sorted.value) {
    for (const e of d.items) {
      rows.push([
        d.date,
        catNameOf(e.categoryId),
        e.unit ?? '',
        e.quantity ?? '',
        typeof e.unitPrice === 'number' ? e.unitPrice.toFixed(2) : '',
        e.amount.toFixed(2),
        e.paymentMethod ?? '',
        e.title ?? '',
        e.orderPhone ?? '',
        e.orderAddress ?? '',
        e.salesman ?? '',
        e.note ?? ''
      ])
    }
    if (d.items.length === 0) {
      rows.push([d.date, '（无产品明细）', '', '', '', '', '', '', '', '', ''])
    }
  }
  void exportXlsx('支出记录', headers, rows, ledgerMeta.value)
}

// ===== 分页（一天一卡/一行）=====
const LIST_PAGE_SIZE = 10
const MOBILE_PAGE_SIZE = 6
const { pageSize, PAGE_SIZES } = usePageSize('bizexp-list-pager', LIST_PAGE_SIZE)
const listPage = ref(1)
/** 移动端固定 6/页，桌面沿用持久化 pageSize */
const activePageSize = computed({
  get: () => (vm.isMobile ? MOBILE_PAGE_SIZE : pageSize.value),
  set: (v: number) => {
    if (!vm.isMobile) pageSize.value = v
  }
})
const pageItems = computed<BusinessExpenseDaily[]>(() => {
  const start = (listPage.value - 1) * activePageSize.value
  return sorted.value.slice(start, start + activePageSize.value)
})
watch(sorted, () => { listPage.value = 1 })

// ===== 新增/编辑弹框：一天可记多个产品支出（动态产品行，类似销售记录的「商品行」）=====
const showDialog = ref(false)
/** 编辑中的原日容器 id（新增为 null）：删除按 id，不能拿日期当 id（日期 ≠ id 会导致删不掉） */
const editingDailyId = ref<string | null>(null)
const editingDate = ref(localDateKey())
const formNote = ref('')

/** 弹框内单条产品支出草稿行（id 仅编辑态存在，新增行为空） */
interface ExpenseRow {
  id?: string
  categoryId: string
  title: string
  quantity: string
  unitPrice: string
  unit: string
  note: string
  orderPhone: string
  orderAddress: string
  salesman: string
  paymentMethod: string
}
const rows = reactive<ExpenseRow[]>([])

/** 选中产品时自动回填默认单位/单价（仅新增行；编辑已有行保留已存值不被覆盖） */
function onCategoryChange(r: ExpenseRow): void {
  if (r.id) return
  const cat = store.expenseCategories.find(c => c.id === r.categoryId)
  if (!cat) return
  if (cat.unit) r.unit = cat.unit
  if (typeof cat.unitPrice === 'number' && cat.unitPrice > 0) r.unitPrice = String(cat.unitPrice)
}

/** 单行金额 = 数量 × 单价（只读，自动计算，两位小数） */
function rowAmount(r: ExpenseRow): number {
  return calcExpenseAmount(r.quantity, r.unitPrice)
}

function emptyRow(): ExpenseRow {
  return {
    categoryId: store.expenseCategories[0]?.id ?? '',
    title: '',
    quantity: '',
    unitPrice: '',
    unit: '',
    note: '',
    orderPhone: '',
    orderAddress: '',
    salesman: '',
    paymentMethod: ''
  }
}

function startAdd(): void {
  editingDailyId.value = null
  editingDate.value = localDateKey()
  formNote.value = ''
  rows.splice(0, rows.length, emptyRow())
  showDialog.value = true
}

function startEdit(d: BusinessExpenseDaily): void {
  editingDailyId.value = d.id
  editingDate.value = d.date
  formNote.value = d.note ?? ''
  // 旧明细无 quantity/unitPrice → 按「数量 1 × 单价=金额」回显，保证金额不变
  rows.splice(
    0,
    rows.length,
    ...d.items.map(e => ({
      id: e.id,
      categoryId: e.categoryId,
      title: e.title ?? '',
      quantity: typeof e.quantity === 'number' && e.quantity > 0 ? String(e.quantity) : (e.amount > 0 ? '1' : ''),
      unitPrice: typeof e.unitPrice === 'number' && e.unitPrice > 0 ? String(e.unitPrice) : (e.amount > 0 ? String(e.amount) : ''),
      unit: e.unit ?? '',
      note: e.note ?? '',
      orderPhone: e.orderPhone ?? '',
      orderAddress: e.orderAddress ?? '',
      salesman: e.salesman ?? '',
      paymentMethod: e.paymentMethod ?? ''
    }))
  )
  showDialog.value = true
}

function addRow(): void {
  rows.push(emptyRow())
}

function removeRow(index: number): void {
  rows.splice(index, 1)
}

/** 单行校验（标题在支出里可选，故传 titleRequired: false）：产品必选、数量 / 单价 / 金额均须 > 0 */
function rowIssues(index: number) {
  const r = rows[index]
  if (!r) return []
  return validateExpenseRow(
    { title: r.title, categoryId: r.categoryId, amount: rowAmount(r), quantity: r.quantity, unitPrice: r.unitPrice },
    { titleRequired: false }
  )
}

/** 全部行的 error 文案（阻断保存）；标题/分类/金额，均为 error → 保存按钮禁用 */
const formErrors = computed(() => {
  const errs: string[] = []
  rows.forEach((_, i) => {
    rowIssues(i)
      .filter(x => x.level === 'error')
      .forEach(x => errs.push(`第 ${i + 1} 行：${x.message}`))
  })
  return errs
})

const isFormValid = computed(() => editingDate.value !== '' && rows.length > 0 && formErrors.value.length === 0)

/** 账本只记录其所属年份的数据：日期选择器禁用其它年份 */
const ledgerYear = computed(() => store.currentLedgerYear)
function disabledDate(d: Date): boolean {
  return d.getFullYear() !== ledgerYear.value
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const items: ExpenseItemDraft[] = rows
    .filter(r => r.categoryId)
    .map(r => ({
      id: r.id,
      categoryId: r.categoryId,
      amount: rowAmount(r),
      title: r.title.trim() || undefined,
      note: r.note.trim() || undefined,
      quantity: Number(r.quantity) > 0 ? Number(r.quantity) : undefined,
      unitPrice: Number(r.unitPrice) > 0 ? Number(r.unitPrice) : undefined,
      unit: r.unit.trim() || undefined,
      orderPhone: r.orderPhone.trim() || undefined,
      orderAddress: r.orderAddress.trim() || undefined,
      salesman: r.salesman.trim() || undefined,
      paymentMethod: r.paymentMethod.trim() || undefined
    }))
  const r = await store.upsertExpenseDaily({ originalDailyId: editingDailyId.value, date: editingDate.value, items })
  if (!r.ok) { toast.error(r.message); return }
  showDialog.value = false
}

async function handleDelete(id: string): Promise<void> {
  const d = store.expenseDailies.find(x => x.id === id)
  if (!d) return
  if (!await showConfirm(`确定要删除「${d.date}」这天的支出（共 ${d.items.length} 笔）吗？删除后统计将重新计算。`)) return
  await store.deleteExpenseDaily(id)
}

/** 弹框内删除：删完直接关闭（避免停留在已删除的记录上） */
async function handleDeleteFromDialog(): Promise<void> {
  const id = editingDailyId.value
  if (!id) return
  if (!await showConfirm('确定要删除这一天的支出记录吗？')) return
  await store.deleteExpenseDaily(id)
  showDialog.value = false
}
</script>

<template>
  <div class="bizexp">
    <!-- 单行工具条：左=新增/导出，右=视图切换 -->
    <div class="ewt-table-toolbar is-split">
      <div class="bizexp-toolbar-left">
        <el-button type="primary" data-testid="bizexp-add" @click="startAdd">＋ 新增支出</el-button>
        <el-button class="btn-export-xlsx" data-testid="bizexp-export" :disabled="sorted.length === 0" @click="exportExpensesExcel">导出 Excel</el-button>
      </div>
      <div class="bizexp-toolbar-right">
        <ViewModeToggle v-if="sorted.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
      </div>
    </div>

    <!-- 一天一行的日容器视图：同一天可记多笔产品支出，自动合并到同一天 -->
    <div v-if="sorted.length === 0" class="bizexp-empty" data-testid="bizexp-empty">暂无支出记录，点击「＋ 新增支出」记下第一天</div>
    <template v-else>
      <div class="bizexp-table-wrap">
        <el-table v-if="vm.mode === 'list'" class="ewt-table"
          :data="pageItems"
          data-testid="bizexp-table"
          stripe
          border
          size="default"
          style="width: 100%"
          height="100%"
          empty-text="暂无支出记录"
          row-key="id"
        >
          <el-table-column type="index" label="序号" width="70" align="center" class-name="ewt-index-col" :index="(i: number) => (listPage - 1) * activePageSize + i + 1" />
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="bizexp-expand" @click.stop>
                <div class="bizexp-expand-title">产品明细（{{ row.items.length }} 笔）</div>
                <div class="bizexp-detail-head">
                  <span class="bizexp-detail-th name">产品</span>
                  <span class="bizexp-detail-th">单位</span>
                  <span class="bizexp-detail-th">数量</span>
                  <span class="bizexp-detail-th">单价</span>
                  <span class="bizexp-detail-th sub">金额</span>
                  <span class="bizexp-detail-th">支付方式</span>
                  <span class="bizexp-detail-th name">标题 / 备注</span>
                </div>
                <div v-for="e in row.items" :key="e.id" class="bizexp-detail-row" :data-testid="`bizexp-detail-${e.id}`">
                  <span class="bizexp-detail-td name">{{ catNameOf(e.categoryId) }}</span>
                  <span class="bizexp-detail-td">{{ e.unit || '—' }}</span>
                  <span class="bizexp-detail-td">{{ e.quantity ?? '—' }}</span>
                  <span class="bizexp-detail-td">¥{{ typeof e.unitPrice === 'number' ? e.unitPrice.toFixed(2) : '—' }}</span>
                  <span class="bizexp-detail-td sub-bold">{{ formatYuanOf(e.amount) }}</span>
                  <span class="bizexp-detail-td">{{ e.paymentMethod || '—' }}</span>
                  <span class="bizexp-detail-td name bizexp-detail-note">{{ e.title || '—' }}{{ e.note ? '（' + e.note + '）' : '' }}</span>
                </div>
                <div v-if="row.items.length === 0" class="bizexp-detail-empty">（无产品明细）</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="日期" width="130" align="center">
            <template #default="{ row }">
              <span style="font-weight: 600;">{{ row.date }}</span>
            </template>
          </el-table-column>
          <el-table-column label="产品数" width="100" align="center">
            <template #default="{ row }">{{ row.items.length }} 笔</template>
          </el-table-column>
          <el-table-column label="支出合计" width="140" align="right">
            <template #default="{ row }">
              <span class="bizexp-amt" :data-testid="`bizexp-day-total-${row.id}`">{{ formatYuanOf(dayTotal(row)) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="180" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="bizexp-note">{{ row.note || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" class-name="ewt-op-col" width="130" align="center" fixed="right">
            <template #default="{ row }">
              <div class="bizexp-actions" @click.stop>
                <el-button size="small" :data-testid="`bizexp-edit-${row.id}`" @click="startEdit(row)">编辑</el-button>
                <el-button size="small" type="danger" :data-testid="`bizexp-del-${row.id}`" @click="handleDelete(row.id)">删除</el-button>
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
            <template #header>
              <div class="bizexp-card-head">
                <span class="bizexp-card-date" :data-testid="`bizexp-card-date-${item.id}`">{{ item.date }}</span>
                <span class="bizexp-card-count">{{ item.items.length }} 笔</span>
              </div>
            </template>
            <template #actions>
              <el-button size="small" :data-testid="`bizexp-card-edit-${item.id}`" @click.stop="startEdit(item)">编辑</el-button>
              <el-button size="small" type="danger" :data-testid="`bizexp-card-del-${item.id}`" @click.stop="handleDelete(item.id)">删除</el-button>
            </template>
          </RecordsCard>
        </div>

      </div>
      <div class="bizexp-list-pager ewt-pager">
        <el-pagination
          v-model:current-page="listPage"
          @size-change="listPage = 1"
          v-model:page-size="activePageSize"
          :page-sizes="PAGE_SIZES"
          layout="total, prev, pager, next, jumper"
          :total="sorted.length"
          background
          small
          prev-text="上一页"
          next-text="下一页"
          data-testid="bizexp-pagination"
        />
      </div>
    </template>

    <!-- 新增/编辑弹框：一天可记多个产品支出（动态产品行） -->
    <el-dialog
      v-if="showDialog"
      :model-value="true"
      :show-close="false"
      width="80%"
      class="bizexp-dialog"
      data-testid="bizexp-dialog"
      @close="showDialog = false"
    >
      <template #header>
        <div class="biz-dialog-header">
          <h3>{{ editingDailyId ? '编辑支出' : '新增支出' }}</h3>
          <button class="biz-dialog-close" @click="showDialog = false"><Icon name="close" /></button>
        </div>
      </template>
      <form class="biz-dialog-body" @submit.prevent="handleSave">
        <!-- 日期（日级字段，独立成行：左字段名 / 右控件） -->
        <div class="biz-kv-row">
          <label class="biz-kv-label">日期 <span class="req">*</span></label>
          <div class="biz-kv-ctrl">
            <div data-testid="bizexp-form-date">
              <el-date-picker
                v-model="editingDate"
                type="date"
                value-format="YYYY-MM-DD"
                size="small"
                :disabled-date="disabledDate"
              />
            </div>
          </div>
        </div>

        <!-- 产品明细：一天可记多笔，以表格方式展示；每行一笔产品，列即字段 -->
        <div class="bizexp-table-wrap">
          <table class="bizexp-table">
            <thead>
              <tr>
                <th class="col-idx">#</th>
                <th>产品/分类<span class="req">*</span></th>
                <th>数量<span class="req">*</span></th>
                <th>单价（元）<span class="req">*</span></th>
                <th>金额<span class="req">*</span></th>
                <th>单位</th>
                <th>支付方式</th>
                <th>标题</th>
                <th>订货电话</th>
                <th>订货地址</th>
                <th>业务员</th>
                <th>备注</th>
                <th class="col-ops">操作</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(row, i) in rows" :key="i">
                <tr class="bizexp-prod-row" data-testid="bizexp-row">
                  <td class="col-idx">{{ i + 1 }}</td>
                  <td>
                    <el-select v-model="row.categoryId" size="small" class="bizexp-row-cat" data-testid="bizexp-row-category" @change="onCategoryChange(row)">
                      <el-option v-for="cat in store.expenseCategories" :key="cat.id" :value="cat.id" :label="cat.name + (cat.visible ? '' : '（隐藏）')" />
                    </el-select>
                  </td>
                  <td>
                    <el-input-number
                      :model-value="row.quantity === '' ? undefined : Number(row.quantity)"
                      :min="0"
                      :step="1"
                      size="small"
                      class="bizexp-kv-num"
                  controls-position="right"
                  data-testid="bizexp-row-quantity"
                  @update:model-value="row.quantity = $event == null ? '' : String($event)"
                    />
                  </td>
                  <td>
                    <el-input-number
                      :model-value="row.unitPrice === '' ? undefined : Number(row.unitPrice)"
                      :min="0"
                      :step="0.01"
                      :precision="2"
                      size="small"
                      class="bizexp-kv-num"
                  controls-position="right"
                  data-testid="bizexp-row-unit-price"
                  @update:model-value="row.unitPrice = $event == null ? '' : String($event)"
                    />
                  </td>
                  <td class="bizexp-td-amount">
                    <span class="biz-kv-amount">{{ formatYuanOf(rowAmount(row)) }}</span>
                  </td>
                  <td>
                    <el-select
                      v-model="row.unit"
                      size="small"
                      class="bizexp-row-unit"
                  data-testid="bizexp-row-unit"
                  clearable
                      filterable
                      allow-create
                      default-first-option
                    >
                      <el-option v-for="u in EXPENSE_UNITS" :key="u" :value="u" :label="u" />
                    </el-select>
                  </td>
                  <td>
                    <el-select
                      v-model="row.paymentMethod"
                      size="small"
                      class="bizexp-row-pay"
                  data-testid="bizexp-row-payment"
                  clearable
                      filterable
                      allow-create
                      default-first-option
                    >
                      <el-option v-for="m in EXPENSE_PAYMENT_METHODS" :key="m" :value="m" :label="m" />
                    </el-select>
                  </td>
                  <td><el-input v-model="row.title" size="small" :maxlength="EXPENSE_TITLE_MAX" data-testid="bizexp-row-title" /></td>
                  <td><el-input v-model="row.orderPhone" size="small" maxlength="30" data-testid="bizexp-row-order-phone" /></td>
                  <td><el-input v-model="row.orderAddress" size="small" maxlength="100" data-testid="bizexp-row-order-address" /></td>
                  <td><el-input v-model="row.salesman" size="small" maxlength="30" data-testid="bizexp-row-salesman" /></td>
                  <td><el-input v-model="row.note" size="small" maxlength="100" data-testid="bizexp-row-note" /></td>
                  <td class="col-ops">
                    <el-button type="danger" size="small" plain :data-testid="`bizexp-row-del-${i}`" @click="removeRow(i)">移除</el-button>
                  </td>
                </tr>
                <tr v-if="rowIssues(i).some(x => x.level === 'error')" class="bizexp-row-issue-row">
                  <td class="bizexp-row-issue" :colspan="13" :data-testid="`bizexp-row-issue-${i}`">
                    {{ rowIssues(i).find(x => x.level === 'error')?.message }}
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <el-button data-testid="bizexp-row-add" @click="addRow">＋ 添加产品行</el-button>

        <!-- 当天备注（日级字段，独立成行） -->
        <div class="biz-kv-row">
          <label class="biz-kv-label">当天备注</label>
          <div class="biz-kv-ctrl">
            <el-input v-model="formNote" size="small" maxlength="200" data-testid="bizexp-form-note" />
          </div>
        </div>

        <!-- 表单校验提示（产品/金额，均为 error → 保存按钮禁用） -->
        <ul v-if="formErrors.length > 0" class="bizexp-issues" data-testid="bizexp-form-issues">
          <li
            v-for="(issue, idx) in formErrors"
            :key="idx"
            class="bizexp-issue error"
            :data-testid="`bizexp-issue-${idx}`"
          >{{ issue }}</li>
        </ul>

        <div class="biz-form-actions ewt-dialog-footer">
          <el-button size="small" @click="showDialog = false">取消</el-button>
          <el-button type="primary" size="small" native-type="submit" :disabled="!isFormValid" data-testid="bizexp-save">
            {{ editingDailyId ? '保存' : '添加' }}
          </el-button>
          <el-button
            v-if="editingDailyId"
            size="small"
            type="danger"
            data-testid="bizexp-delete"
            @click="handleDeleteFromDialog"
          >删除</el-button>
        </div>
      </form>
    </el-dialog>
  </div>
</template>

<style scoped>
.bizexp {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
}

.bizexp-toolbar-left,
.bizexp-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bizexp-empty {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-muted, var(--color-text-muted));
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

/* ===== el-table 表格容器（参考 BusinessDaily） ===== */
.bizexp-table-wrap {
  flex: 1 1 auto;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.bizexp-table-wrap > :global(.el-table) {
  flex: 1 1 auto;
  min-height: 220px;
  width: 100% !important;
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.bizexp-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.bizexp-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .bizexp-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .bizexp-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.bizexp-table-wrap > :global(.el-table .el-table__body-wrapper .cell),
.bizexp-table-wrap > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条 ===== */
.bizexp-list-pager {
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
:global(html.dark) .bizexp-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}

/* ===== 表格内文本样式 ===== */
.bizexp-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
}
.bizexp-amt {
  font-weight: 700;
  color: var(--color-error, var(--color-error));
  font-variant-numeric: tabular-nums;
}
.bizexp-note {
  color: var(--color-text-muted, var(--color-text-muted));
}

/* ===== 展开行内产品明细 ===== */
.bizexp-expand { padding: 12px 24px 12px 48px; }
.bizexp-expand-title {
  font-size: 13px; font-weight: 600;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 8px;
}
.bizexp-detail-head {
  display: grid;
  grid-template-columns: minmax(80px, 1.4fr) minmax(40px, 0.6fr) minmax(40px, 0.6fr) minmax(60px, 0.7fr) minmax(70px, 0.85fr) minmax(70px, 0.8fr) minmax(80px, 1.4fr);
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-muted, var(--color-text-muted));
  padding: 0 4px 6px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
}
.bizexp-detail-th {
  text-align: right;
  font-weight: 600;
}
.bizexp-detail-th.name,
.bizexp-detail-th.sub {
  text-align: left;
}
.bizexp-detail-row {
  display: grid;
  grid-template-columns: minmax(80px, 1.4fr) minmax(40px, 0.6fr) minmax(40px, 0.6fr) minmax(60px, 0.7fr) minmax(70px, 0.85fr) minmax(70px, 0.8fr) minmax(80px, 1.4fr);
  gap: 6px;
  padding: 4px 4px;
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
  align-items: center;
}
.bizexp-detail-td {
  text-align: right;
}
.bizexp-detail-td.name {
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bizexp-detail-note {
  color: var(--color-text-muted, var(--color-text-muted));
}
.bizexp-detail-td.sub-bold {
  font-weight: 700;
  color: var(--color-error, var(--color-error));
}
.bizexp-detail-empty {
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  padding: 6px 4px;
}

/* ===== 卡片头部：日期 + 产品数 ===== */
.bizexp-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  line-height: 1.4;
}
.bizexp-card-date {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary, #6b7280);
  white-space: nowrap;
}
.bizexp-card-count {
  flex: 1 1 auto;
  text-align: right;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
}
:global(html.dark) .bizexp-card-date {
  color: var(--color-text-secondary, #9ca3af);
}

/* ===== 弹框：支出信息表格（每行一笔产品，列即字段） ===== */
.bizexp-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
}
.bizexp-table {
  width: 100%;
  min-width: 1180px;
  border-collapse: collapse;
  font-size: 13px;
}
.bizexp-table th,
.bizexp-table td {
  border: 1px solid var(--color-border, #e5e7eb);
  padding: 6px 8px;
  text-align: left;
  vertical-align: middle;
}
.bizexp-table thead th {
  background: var(--color-bg-hover, #f7f8fa);
  font-weight: 600;
  color: var(--color-text-secondary, #6b7280);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}
.bizexp-table .col-idx {
  width: 36px;
  text-align: center;
  color: var(--color-text-muted, #9ca3af);
}
.bizexp-table .col-ops {
  width: 72px;
  text-align: center;
  white-space: nowrap;
}
.bizexp-table .bizexp-td-amount {
  text-align: right;
  white-space: nowrap;
}
.bizexp-table .bizexp-prod-row:hover td {
  background: var(--color-bg-hover, #fafbfc);
}
.bizexp-table .el-select,
.bizexp-table .el-input,
.bizexp-table .el-input-number {
  width: 100%;
}
.bizexp-table .bizexp-kv-num {
  width: 100%;
}
.bizexp-table .bizexp-row-cat {
  min-width: 150px;
}
.bizexp-table .bizexp-row-unit {
  min-width: 90px;
}
.bizexp-table .bizexp-row-pay {
  min-width: 110px;
}
.bizexp-table .req {
  color: var(--color-error, #dc2626);
}
.bizexp-row-issue-row .bizexp-row-issue {
  font-size: 12px;
  color: var(--color-error, #dc2626);
  background: var(--color-bg-hover, #fef2f2);
}

/* ===== 弹框：日级字段（日期 / 当天备注）键值行 ===== */
.biz-kv-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--color-border, #eef0f2);
}
.biz-kv-row:last-child {
  border-bottom: none;
}
.biz-kv-label {
  flex: 0 0 96px;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
  text-align: right;
  line-height: 1.4;
}
.biz-kv-label .req {
  color: var(--color-error, #dc2626);
}
.biz-kv-ctrl {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.biz-kv-ctrl .el-select,
.biz-kv-ctrl .el-input,
.biz-kv-ctrl .el-input-number {
  max-width: 240px;
}
.biz-kv-amount {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-error, #dc2626);
  font-variant-numeric: tabular-nums;
}
.bizexp-row-issue {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-error, #dc2626);
}

/* ===== 弹框通用样式 ===== */
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
.biz-form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* 表单校验提示 */
.bizexp-issues {
  list-style: none;
  margin: 0;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--color-bg-hover, #f3f4f6);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border, #e5e7eb);
}
.bizexp-issue {
  font-size: 12px;
  line-height: 1.5;
}
.bizexp-issue.error {
  color: var(--color-error, #dc2626);
}

.bizexp-dialog :deep(.el-dialog) {
  border-radius: var(--radius-lg, 12px);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}
.bizexp-dialog :deep(.el-dialog__header) {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  margin-right: 0;
  flex-shrink: 0;
}
.bizexp-dialog :deep(.el-dialog__body) {
  padding: 0;
  overflow-y: auto;
}

/* ===== 暗色模式 ===== */
:global(html.dark) .bizexp-amt,
:global(html.dark) .bizexp-detail-td.sub-bold,
:global(html.dark) .biz-kv-amount {
  color: #f87171;
}
:global(html.dark) .bizexp-issues {
  background-color: var(--color-bg-hover, #111827);
  border-color: var(--color-border, #374151);
}
:global(html.dark) .bizexp-table th,
:global(html.dark) .bizexp-table td {
  border-color: var(--color-border, #374151);
}
:global(html.dark) .bizexp-table thead th {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .bizexp-table .bizexp-prod-row:hover td {
  background-color: var(--color-bg-hover, #111827);
}
:global(html.dark) .bizexp-row-issue-row .bizexp-row-issue {
  background-color: var(--color-bg-hover, #2a1414);
}
:global(html.dark) .biz-kv-row {
  border-bottom-color: var(--color-border, #374151);
}
:global(html.dark) .biz-kv-label {
  color: var(--color-text-secondary, #d1d5db);
}

@media (max-width: 767px) {
  .ewt-table-toolbar.is-split {
    flex-wrap: wrap;
    gap: 8px;
  }
  .bizexp-toolbar-left {
    flex-wrap: wrap;
    width: 100%;
  }
  .biz-kv-row {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  .biz-kv-label {
    flex-basis: auto;
    text-align: left;
  }
  .biz-kv-ctrl .el-select,
  .biz-kv-ctrl .el-input,
  .biz-kv-ctrl .el-input-number,
  .bizexp-row-cat,
  .bizexp-row-unit,
  .bizexp-row-pay,
  .bizexp-kv-num {
    max-width: 100%;
    width: 100%;
  }
}
</style>
