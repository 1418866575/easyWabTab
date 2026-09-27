<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import { showConfirm } from '@/utils/dialog'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

// 卡片视图：一笔支出一张卡（日期/标题/分类/金额/备注）
function cardFields(e: any) {
  return [
    { label: '日期', value: e.date },
    { label: '标题', value: e.title },
    { label: '分类', value: catNameOf(e.categoryId) },
    { label: '金额', value: formatYuanOf(e.amount) },
    { label: '备注', value: e.note || '—' }
  ]
}

// 支出记录：逐笔一条一行（不按天合并），日期倒序 + 同日按创建时间倒序
import { computed, reactive, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { EXPENSE_TITLE_MAX, validateExpenseRow, findExpenseCategory, formatYuanOf, localDateKey, sortExpenses } from '@/composables/businessCore'
import { buildCsv, csvFileName, downloadCsv } from '@/composables/csvExport'
import type { BusinessExpense } from '@/types'
import Icon from '@/components/Icon.vue'
import { usePageSize } from '@/composables/usePageSize'
import { useAppSettingsDialog } from '@/composables/useAppSettingsDialog'

const store = useWorkbenchBusinessStore()

// 分类管理入口已迁移到「设置 → 销售记账 → 基础设置」：这里只负责跳转，不再内嵌弹框
const appSettings = useAppSettingsDialog()
function openCategorySettings(): void {
  appSettings.openAppSettings({ tab: 'business', sub: 'biz-base', action: 'expense-cats' })
}

function catNameOf(id: string): string {
  return findExpenseCategory(store.expenseCategories, id)?.name ?? '未知'
}

// 逐笔列表（日期倒序、同日按创建时间倒序）；同一天不合并，每笔一行
const allExpenses = computed<BusinessExpense[]>(() => sortExpenses(store.expenses))

// ===== 一键导出 CSV（逐笔：日期/标题/分类/金额/备注）=====
function exportExpensesCsv(): void {
  const headers = ['日期', '标题', '分类', '金额', '备注']
  const rows: (string | number)[][] = allExpenses.value.map(e => [
    e.date,
    e.title,
    catNameOf(e.categoryId),
    e.amount.toFixed(2),
    e.note ?? ''
  ])
  downloadCsv(csvFileName('支出记录'), buildCsv(headers, rows))
}

// ===== 分页（逐笔：列表一行一笔，卡片一卡一笔） =====
const LIST_PAGE_SIZE = 10
const { pageSize, PAGE_SIZES } = usePageSize('bizexp-list-pager', LIST_PAGE_SIZE)
const listPage = ref(1)
const pageItems = computed<BusinessExpense[]>(() => {
  const start = (listPage.value - 1) * pageSize.value
  return allExpenses.value.slice(start, start + pageSize.value)
})
watch([allExpenses, () => vm.mode], () => { listPage.value = 1 })

// ===== 新增/编辑弹框：一笔支出 = 一条记录 = 一个标题（同一天想记多笔 → 多次新增） =====
const showDialog = ref(false)
const editingId = ref<string | null>(null) // null = 新增模式
const form = reactive<{ title: string; date: string; categoryId: string; amount: string; note: string }>({
  title: '',
  date: localDateKey(),
  categoryId: '',
  amount: '',
  note: ''
})

/** 表单校验：标题必填且 ≤20 字、分类必选、金额 > 0（全部为 error，阻断保存） */
const formIssues = computed(() => validateExpenseRow(form))
const isFormValid = computed(() => form.date !== '' && formIssues.value.length === 0)

function resetForm(date?: string): void {
  form.title = ''
  form.date = date ?? localDateKey()
  form.categoryId = store.expenseCategories[0]?.id ?? ''
  form.amount = ''
  form.note = ''
}

function startAdd(): void {
  editingId.value = null
  resetForm()
  showDialog.value = true
}

function startEdit(e: BusinessExpense): void {
  editingId.value = e.id
  form.title = e.title ?? ''
  form.date = e.date
  form.categoryId = e.categoryId
  form.amount = String(e.amount)
  form.note = e.note ?? ''
  showDialog.value = true
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const payload = {
    title: form.title.trim(),
    date: form.date,
    categoryId: form.categoryId,
    amount: Number(form.amount),
    note: form.note.trim() || undefined
  }
  if (editingId.value) await store.updateExpense(editingId.value, payload)
  else await store.addExpense(payload)
  showDialog.value = false
}

async function handleDelete(e: BusinessExpense): Promise<void> {
  if (!await showConfirm(`确定要删除「${e.date} ${e.title}」这笔支出吗？`)) return
  await store.deleteExpense(e.id)
}

/** 弹框内删除：删完直接关闭（避免停留在已删除的记录上） */
async function handleDeleteFromDialog(): Promise<void> {
  const target = allExpenses.value.find(e => e.id === editingId.value)
  if (!target) return
  await handleDelete(target)
  showDialog.value = false
}
</script>

<template>
  <div class="bizexp">
    <!-- 单行工具条：左=新增/导出，右=视图切换 + 分类管理 -->
    <div class="ewt-table-toolbar is-split">
      <div class="bizexp-toolbar-left">
        <el-button type="primary" data-testid="bizexp-add" @click="startAdd">＋ 新增支出</el-button>
        <el-button class="btn-export-csv" data-testid="bizexp-export" :disabled="store.expenses.length === 0" @click="exportExpensesCsv">导出 CSV</el-button>
      </div>
      <div class="bizexp-toolbar-right">
        <ViewModeToggle v-if="allExpenses.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
        <el-button size="small" data-testid="bizexp-cat-manager" title="支出分类管理（设置）" @click="openCategorySettings"><Icon name="cog" :size="15" /></el-button>
      </div>
    </div>

    <!-- 逐笔列表：一笔支出一行（同一天不合并） -->
    <div v-if="allExpenses.length === 0" class="bizexp-empty" data-testid="bizexp-empty">暂无支出记录，点击「＋ 新增支出」记下第一笔</div>
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
          <el-table-column label="日期" width="130" align="center">
            <template #default="{ row }">
              <span style="font-weight: 600;">{{ row.date }}</span>
            </template>
          </el-table-column>
          <el-table-column label="标题" min-width="180" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="bizexp-title-text" :data-testid="`bizexp-title-${row.id}`">{{ row.title }}</span>
            </template>
          </el-table-column>
          <el-table-column label="分类" width="130" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="bizexp-cat">{{ catNameOf(row.categoryId) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="金额" width="120" align="right">
            <template #default="{ row }">
              <span class="bizexp-amt" :data-testid="`bizexp-amount-${row.id}`">{{ formatYuanOf(row.amount) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="160" align="left" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="bizexp-note">{{ row.note || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" class-name="ewt-op-col" width="130" align="center" fixed="right">
            <template #default="{ row }">
              <div class="bizexp-actions" @click.stop>
                <el-button size="small" :data-testid="`bizexp-edit-${row.id}`" @click="startEdit(row)">编辑</el-button>
                <el-button size="small" type="danger" :data-testid="`bizexp-del-${row.id}`" @click="handleDelete(row)">删除</el-button>
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
      <div class="bizexp-list-pager ewt-pager">
        <el-pagination
          v-model:current-page="listPage"
          @size-change="listPage = 1"
          v-model:page-size="pageSize"
          :page-sizes="PAGE_SIZES"
          layout="total, prev, pager, next, jumper"
          :total="allExpenses.length"
          background
          small
          prev-text="上一页"
          next-text="下一页"
          data-testid="bizexp-pagination"
        />
      </div>
    </template>

    <!-- 新增/编辑弹框：一笔支出 = 一条记录（日期 + 标题 + 分类 + 金额 + 备注） -->
    <el-dialog
      v-if="showDialog"
      :model-value="true"
      :show-close="false"
      width="560px"
      class="bizexp-dialog"
      data-testid="bizexp-dialog"
      @close="showDialog = false"
    >
      <template #header>
        <div class="biz-dialog-header">
          <h3>{{ editingId ? '编辑支出' : '新增支出' }}</h3>
          <button class="biz-dialog-close" @click="showDialog = false"><Icon name="close" /></button>
        </div>
      </template>
      <form class="biz-dialog-body" @submit.prevent="handleSave">
        <div class="biz-field">
          <label>日期 *（同一天可记多笔，列表按日合并、组内按录入先后排序）</label>
          <div data-testid="bizexp-form-date">
            <el-date-picker
              v-model="form.date"
              type="date"
              value-format="YYYY-MM-DD"
              size="small"
            />
          </div>
        </div>

        <div class="biz-field">
          <label>标题 *（简短说明这笔支出，≤{{ EXPENSE_TITLE_MAX }} 字）</label>
          <el-input
            v-model="form.title"
            size="small"
            :maxlength="EXPENSE_TITLE_MAX"
            placeholder="如：采购原料、摊位费、燃气"
            data-testid="bizexp-form-title"
          />
        </div>

        <div class="biz-field">
          <label>分类 *</label>
          <el-select v-model="form.categoryId" size="small" class="bizexp-form-cat" data-testid="bizexp-form-category">
            <el-option v-for="cat in store.expenseCategories" :key="cat.id" :value="cat.id" :label="cat.name" />
          </el-select>
        </div>

        <div class="biz-field">
          <label>金额 *</label>
          <el-input-number
            :model-value="form.amount === '' ? undefined : Number(form.amount)"
            :min="0"
            :step="0.01"
            size="small"
            class="bizexp-form-amt"
            data-testid="bizexp-form-amount"
            placeholder="金额"
            @update:model-value="form.amount = $event == null ? '' : String($event)"
          />
        </div>

        <div class="biz-field">
          <label>备注（可选）</label>
          <el-input
            v-model="form.note"
            size="small"
            maxlength="100"
            placeholder="备注"
            data-testid="bizexp-form-note"
          />
        </div>

        <!-- 表单校验提示（标题/分类/金额，均为 error → 保存按钮禁用） -->
        <ul v-if="formIssues.length > 0" class="bizexp-issues" data-testid="bizexp-form-issues">
          <li
            v-for="(issue, idx) in formIssues"
            :key="idx"
            class="bizexp-issue"
            :class="issue.level"
            :data-testid="`bizexp-issue-${idx}`"
          >{{ issue.message }}</li>
        </ul>

        <div class="biz-form-actions ewt-dialog-footer">
          <el-button size="small" @click="showDialog = false">取消</el-button>
          <el-button type="primary" size="small" native-type="submit" :disabled="!isFormValid" data-testid="bizexp-save">
            {{ editingId ? '保存' : '添加' }}
          </el-button>
          <el-button
            v-if="editingId"
            size="small"
            type="danger"
            data-testid="bizexp-delete"
            @click="handleDeleteFromDialog"
          >删除</el-button>
        </div>
      </form>
    </el-dialog>

    <!-- 支出分类管理已迁移到「设置 → 销售记账 → 基础设置」 -->
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

/* ===== el-table 表格容器（参考 WorkbenchNotes / BusinessDaily） ===== */
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

/* ===== 分页条（参考 WorkbenchNotes / BusinessDaily） ===== */
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

/* 分类徽标 */
.bizexp-cat {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--radius-full, 999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
  white-space: nowrap;
  display: inline-block;
}
.bizexp-amt {
  font-weight: 700;
  color: var(--color-error, var(--color-error));
  font-variant-numeric: tabular-nums;
}
.bizexp-note {
  color: var(--color-text-muted, var(--color-text-muted));
}

/* ===== 弹框单条表单 ===== */
.bizexp-form-cat { width: 100%; }
.bizexp-form-amt { width: 100%; }

/* 表单校验提示（标题/分类/金额） */
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
.bizexp-issue.warn {
  color: var(--color-warning, #d97706);
}

/* 标题文本（表格列 / 展开行） */
.bizexp-title-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

/* 弹框通用样式 */
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

/* el-dialog 换皮：对齐原 biz-dialog 视觉 */
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
:global(html.dark) .bizexp-amt {
  color: #f87171;
}

:global(html.dark) .bizexp-issues {
  background-color: var(--color-bg-hover, #111827);
  border-color: var(--color-border, #374151);
}

:global(html.dark) .bizexp-issue.error {
  color: #f87171;
}

:global(html.dark) .bizexp-title-text {
  color: var(--color-text, #f9fafb);
}

:global(html.dark) .biz-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

:global(html.dark) .bizexp-cat {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  color: #93c5fd;
}

@media (max-width: 640px) {
  .bizexp-actions {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
