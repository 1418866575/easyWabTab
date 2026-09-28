<script setup lang="ts">
// 对账：① 账本应收 vs 实收（手填营业额/漏填商品行造成的差异）② 按月账实差异 ③ 进货 ↔ 支出关联对账
// 全部计算委托 businessCore 纯函数；本组件只做取数、渲染与 Excel 导出
import { computed } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import {
  calcExpenseReconciliation,
  calcMonthlyReconciliation,
  calcReceivableVsActual,
  expenseLabel,
  findExpenseCategory,
  formatYuanOf
} from '@/composables/businessCore'
import { exportXlsx } from '@/composables/xlsxExport'
import Icon from '@/components/Icon.vue'

const store = useWorkbenchBusinessStore()

const data = computed(() => ({
  productCategories: store.productCategories,
  expenseCategories: store.expenseCategories,
  products: store.products,
  purchases: store.purchases,
  dailyRecords: store.dailyRecords,
  expenses: store.expenses,
  settings: store.settings
}))

const ledgerYear = computed(() => store.currentLedgerYear)
/** 导出文件名前缀：账本年份 + 账本名称 */
const ledgerName = computed(() => store.currentLedgerName)
const ledgerMeta = computed(() => ({ year: ledgerYear.value, ledgerName: ledgerName.value }))

// ===== ① 应收 vs 实收 =====
const receivable = computed(() => calcReceivableVsActual(data.value))

// ===== ② 按月账实差异 =====
const monthly = computed(() => calcMonthlyReconciliation(data.value, ledgerYear.value))
const monthlyWithData = computed(() => monthly.value.filter(m => m.days > 0 || Math.abs(m.diff) > 0.005))

// ===== ③ 进货 ↔ 支出对账 =====
const expenseRec = computed(() => calcExpenseReconciliation(data.value))

function expenseCatName(categoryId: string): string {
  return findExpenseCategory(store.expenseCategories, categoryId)?.name ?? '未分类'
}

// ===== Excel 导出 =====
function exportReceivableExcel(): void {
  const headers = ['日期', '应收(商品明细)', '实收(记录)', '差异', '是否手动', '交易笔数']
  const rows: (string | number)[][] = receivable.value.rows.map(r => [
    r.date,
    r.receivable.toFixed(2),
    r.actual.toFixed(2),
    r.diff.toFixed(2),
    r.manual ? '手动' : '自动',
    r.transactionCount
  ])
  void exportXlsx(`应收实收对账-${ledgerYear.value}`, headers, rows, ledgerMeta.value)
}

function exportMonthlyExcel(): void {
  const headers = ['月份', '应收', '实收', '差异', '收摊天数', '手动天数']
  const rows: (string | number)[][] = monthly.value.map(m => [
    m.label,
    m.receivable.toFixed(2),
    m.actual.toFixed(2),
    m.diff.toFixed(2),
    m.days,
    m.manualDays
  ])
  void exportXlsx(`按月账实差异-${ledgerYear.value}`, headers, rows, ledgerMeta.value)
}

function exportExpenseExcel(): void {
  const headers = ['类型', '日期', '对象', '金额', '关联支出（日期 标题）', '差异']
  const rows: (string | number)[][] = []
  for (const r of expenseRec.value.linked) {
    rows.push(['已关联进货', r.date, r.productName, r.total.toFixed(2), r.expenseLabels.join('、'), r.diff.toFixed(2)])
  }
  for (const p of expenseRec.value.unlinkedPurchases) {
    rows.push(['未关联进货', p.date, p.productName, p.total.toFixed(2), '', ''])
  }
  for (const e of expenseRec.value.unlinkedExpenses) {
    rows.push(['未匹配支出', e.date, expenseLabel(e) + '（' + expenseCatName(e.categoryId) + '）' + (e.note ? `（${e.note}）` : ''), e.amount.toFixed(2), '', ''])
  }
  void exportXlsx('进货支储对账', headers, rows, ledgerMeta.value)
}
</script>

<template>
  <div class="bizrec">
    <!-- ① 应收 vs 实收 -->
    <section class="bizrec-card" data-testid="bizrec-receivable">
      <div class="bizrec-head">
        <h3><Icon name="daily" :size="15" /> 应收 vs 实收（{{ ledgerYear }} 年账本）</h3>
        <el-button class="btn-export-xlsx" size="small" data-testid="bizrec-receivable-export" :disabled="receivable.rows.length === 0" @click="exportReceivableExcel">导出 Excel</el-button>
      </div>
      <div class="bizrec-stats">
        <div class="bizrec-stat">
          <span class="bizrec-stat-label">应收合计</span>
          <span class="bizrec-stat-value" data-testid="bizrec-receivable-total">{{ formatYuanOf(receivable.receivable) }}</span>
        </div>
        <div class="bizrec-stat">
          <span class="bizrec-stat-label">实收合计</span>
          <span class="bizrec-stat-value" data-testid="bizrec-actual-total">{{ formatYuanOf(receivable.actual) }}</span>
        </div>
        <div class="bizrec-stat">
          <span class="bizrec-stat-label">差异（实收 − 应收）</span>
          <span class="bizrec-stat-value" :class="{ negative: receivable.diff < 0, positive: receivable.diff > 0 }" data-testid="bizrec-diff-total">
            {{ formatYuanOf(receivable.diff) }}
          </span>
        </div>
        <div class="bizrec-stat">
          <span class="bizrec-stat-label">手填营业额 / 有差异天数</span>
          <span class="bizrec-stat-value" data-testid="bizrec-manual-days">{{ receivable.manualDays }} / {{ receivable.diffDays }} 天</span>
        </div>
      </div>
      <p v-if="receivable.rows.length === 0" class="bizrec-empty" data-testid="bizrec-receivable-empty">暂无收摊记录，无法对账</p>
      <el-table
        v-else
        class="ewt-table"
        :data="receivable.rows"
        data-testid="bizrec-receivable-table"
        stripe
        border
        size="small"
        max-height="280"
        empty-text="暂无收摊记录"
      >
        <el-table-column label="日期" width="120" align="center" prop="date" />
        <el-table-column label="应收（商品明细）" min-width="140" align="right">
          <template #default="{ row }">{{ formatYuanOf(row.receivable) }}</template>
        </el-table-column>
        <el-table-column label="实收（记录）" min-width="140" align="right">
          <template #default="{ row }">{{ formatYuanOf(row.actual) }}</template>
        </el-table-column>
        <el-table-column label="差异" min-width="120" align="right">
          <template #default="{ row }">
            <span :class="{ negative: row.diff < 0, positive: row.diff > 0 }">{{ formatYuanOf(row.diff) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="100" align="center">
          <template #default="{ row }">
            <span class="bizrec-tag" :class="row.manual ? 'manual' : 'auto'">{{ row.manual ? '手动' : '自动' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="交易笔数" width="100" align="right">
          <template #default="{ row }">{{ row.transactionCount || '—' }}</template>
        </el-table-column>
      </el-table>
    </section>

    <!-- ② 按月账实差异 -->
    <section class="bizrec-card" data-testid="bizrec-monthly">
      <div class="bizrec-head">
        <h3><Icon name="stats" :size="15" /> 按月账实差异（{{ ledgerYear }} 年，不跨年）</h3>
        <el-button class="btn-export-xlsx" size="small" data-testid="bizrec-monthly-export" :disabled="monthlyWithData.length === 0" @click="exportMonthlyExcel">导出 Excel</el-button>
      </div>
      <div class="bizrec-month-grid" data-testid="bizrec-month-grid">
        <div
          v-for="m in monthly"
          :key="m.month"
          class="bizrec-month"
          :class="{ 'has-diff': Math.abs(m.diff) > 0.005 }"
          :data-testid="`bizrec-month-${m.month}`"
          :title="`${m.label}：应收 ${formatYuanOf(m.receivable)}｜实收 ${formatYuanOf(m.actual)}｜差异 ${formatYuanOf(m.diff)}｜${m.days} 天收摊（${m.manualDays} 天手动）`"
        >
          <span class="bizrec-month-label">{{ m.label }}</span>
          <span class="bizrec-month-actual">{{ formatYuanOf(m.actual) }}</span>
          <span class="bizrec-month-diff" :class="{ negative: m.diff < 0, positive: m.diff > 0 }">
            {{ m.diff === 0 ? '持平' : (m.diff > 0 ? '+' : '') + formatYuanOf(m.diff) }}
          </span>
        </div>
      </div>
      <p class="bizrec-tip">差异 = 实收（收摊记录营业额，可能手动填写）− 应收（售出数量 × 售价自动合计）；有差异的月份标红。</p>
    </section>

    <!-- ③ 进货 ↔ 支出对账 -->
    <section class="bizrec-card" data-testid="bizrec-expense">
      <div class="bizrec-head">
        <h3><Icon name="expenses" :size="15" /> 进货 ↔ 支出关联对账</h3>
        <el-button class="btn-export-xlsx" size="small" data-testid="bizrec-expense-export" :disabled="store.purchases.length === 0 && store.expenses.length === 0" @click="exportExpenseExcel">导出 Excel</el-button>
      </div>
      <div class="bizrec-stats">
        <div class="bizrec-stat">
          <span class="bizrec-stat-label">已关联进货</span>
          <span class="bizrec-stat-value" data-testid="bizrec-linked-total">{{ formatYuanOf(expenseRec.linkedTotal) }}（{{ expenseRec.linked.length }} 笔）</span>
        </div>
        <div class="bizrec-stat">
          <span class="bizrec-stat-label">未关联进货</span>
          <span class="bizrec-stat-value" data-testid="bizrec-unlinked-purchase-total">{{ formatYuanOf(expenseRec.unlinkedPurchaseTotal) }}（{{ expenseRec.unlinkedPurchases.length }} 笔）</span>
        </div>
        <div class="bizrec-stat">
          <span class="bizrec-stat-label">未匹配支出</span>
          <span class="bizrec-stat-value" data-testid="bizrec-unlinked-expense-total">{{ formatYuanOf(expenseRec.unlinkedExpenseTotal) }}（{{ expenseRec.unlinkedExpenses.length }} 笔）</span>
        </div>
      </div>

      <div class="bizrec-sub">
        <span class="bizrec-subtitle">已关联（进货合计 = 关联支出汇总）</span>
      </div>
      <p v-if="expenseRec.linked.length === 0" class="bizrec-empty" data-testid="bizrec-linked-empty">暂无关联记录</p>
      <el-table
        v-else
        class="ewt-table"
        :data="expenseRec.linked"
        data-testid="bizrec-linked-table"
        stripe
        border
        size="small"
        max-height="220"
        empty-text="暂无关联记录"
      >
        <el-table-column label="进货日期" width="120" align="center" prop="date" />
        <el-table-column label="商品" min-width="140" align="left" prop="productName" />
        <el-table-column label="进货合计" width="120" align="right">
          <template #default="{ row }">{{ formatYuanOf(row.total) }}</template>
        </el-table-column>
        <el-table-column label="关联支出（日期 标题）" min-width="220" align="left">
          <template #default="{ row }">
            <span :data-testid="`bizrec-linked-labels-${row.purchaseId}`">{{ row.expenseLabels.join('、') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="支出汇总" width="120" align="right">
          <template #default="{ row }">{{ formatYuanOf(row.expenseTotal) }}</template>
        </el-table-column>
        <el-table-column label="差异" width="100" align="right">
          <template #default="{ row }">
            <span :class="{ negative: row.diff < 0, positive: row.diff > 0 }">{{ formatYuanOf(row.diff) }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="bizrec-sub">
        <span class="bizrec-subtitle">未被进货关联的支出（可能漏记进货，也可能本就与进货无关）</span>
      </div>
      <p v-if="expenseRec.unlinkedExpenses.length === 0" class="bizrec-empty" data-testid="bizrec-unlinked-empty">全部支出都已关联进货</p>
      <ul v-else class="bizrec-list" data-testid="bizrec-unlinked-list">
        <li v-for="e in expenseRec.unlinkedExpenses" :key="e.id" class="bizrec-list-item" :data-testid="`bizrec-unlinked-${e.id}`">
          <span class="bizrec-list-date">{{ expenseLabel(e) }}</span>
          <span class="bizrec-list-cat">{{ expenseCatName(e.categoryId) }}</span>
          <span class="bizrec-list-amount">{{ formatYuanOf(e.amount) }}</span>
          <span class="bizrec-list-note">{{ e.note || '—' }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.bizrec {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.bizrec-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 10px);
}

.bizrec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bizrec-head h3 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.bizrec-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.bizrec-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: var(--color-bg-hover, #f3f4f6);
  border-radius: var(--radius-sm, 6px);
}

.bizrec-stat-label {
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
}

.bizrec-stat-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text, #111827);
  font-variant-numeric: tabular-nums;
}

.bizrec-stat-value.negative {
  color: var(--color-error, #dc2626);
}

.bizrec-stat-value.positive {
  color: var(--color-success, #16a34a);
}

.bizrec-empty {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted, #9ca3af);
}

.bizrec-tag {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
}

.bizrec-tag.manual {
  color: var(--color-warning, #b45309);
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 15%, transparent);
}

.bizrec-tag.auto {
  color: var(--color-text-muted, #6b7280);
  background: var(--color-bg-hover, #f1f5f9);
}

/* 按月差异网格 */
.bizrec-month-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.bizrec-month {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background: var(--color-bg-hover, #f9fafb);
  font-variant-numeric: tabular-nums;
}

.bizrec-month.has-diff {
  border-color: color-mix(in srgb, var(--color-warning, #f59e0b) 45%, transparent);
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 10%, transparent);
}

.bizrec-month-label {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

.bizrec-month-actual {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text, #111827);
}

.bizrec-month-diff {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

.bizrec-month-diff.negative {
  color: var(--color-error, #dc2626);
}

.bizrec-month-diff.positive {
  color: var(--color-success, #16a34a);
}

.bizrec-tip {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

.bizrec-sub {
  padding-top: 4px;
  border-top: 1px dashed var(--color-border, #e2e8f0);
}

.bizrec-subtitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
}

.bizrec-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bizrec-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  font-size: 13px;
  background: var(--color-bg-hover, #f9fafb);
  border-radius: var(--radius-sm, 6px);
  font-variant-numeric: tabular-nums;
}

.bizrec-list-date {
  font-weight: 600;
  flex-shrink: 0;
}

.bizrec-list-cat {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--color-primary, #3b82f6);
  background: color-mix(in srgb, var(--color-primary, #3b82f6) 12%, transparent);
}

.bizrec-list-amount {
  flex-shrink: 0;
  font-weight: 700;
  color: var(--color-error, #dc2626);
}

.bizrec-list-note {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted, #9ca3af);
  font-size: 12px;
}

@media (max-width: 768px) {
  .bizrec-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .bizrec-month-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

html.dark .bizrec-stat {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .bizrec-list-item {
  background-color: var(--color-bg-card, #1f2937);
}
</style>
