<script setup lang="ts">
// 库存管理：库存总览卡片网格（商品/单位/进货合计/带出合计）+ 低库存预警清单 + 阈值可配置
// P1-2：库存卡片增加展开溯源功能（进货明细 + 销售带出记录）
import { computed, nextTick, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { agingBatches, calcBroughtOutTotals, calcBatchStock, calcInventory, calcInventorySources, calcPurchaseTotals, findProductCategory, formatYuanOf, localDateKey, lowStockProducts, slowMovingProducts, sortProducts } from '@/composables/businessCore'
import { exportXlsx } from '@/composables/xlsxExport'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'
import Icon from '@/components/Icon.vue'
import { useAppSettingsDialog } from '@/composables/useAppSettingsDialog'

// P1-3：跨模块联动跳转 emit
const emit = defineEmits<{ navigate: [section: string, filter?: string] }>()

const store = useWorkbenchBusinessStore()

const stockMap = computed(() => calcInventory(store.products, store.purchases, store.dailyRecords))

const purchaseTotals = computed(() => calcPurchaseTotals(store.purchases))

const broughtOutTotals = computed(() => calcBroughtOutTotals(store.dailyRecords))

const rows = computed(() =>
  sortProducts(store.products)
    .map(p => ({ product: p, stock: stockMap.value[p.id] ?? 0 }))
    .sort((a, b) => a.stock - b.stock)
)

/** 商品分类名（未分类兜底）：卡片加宽后展示，避免只靠商品名辨识 */
function categoryNameOf(productId: string): string {
  const p = store.products.find(x => x.id === productId)
  const catId = p?.categoryId
  return catId ? (findProductCategory(store.productCategories, catId)?.name ?? '未分类') : '未分类'
}

// ===== 自适应分页（2 列宽卡，rowHeight 实测 ~124，maxRows 4 = 每页最多 8 卡）=====
const listEl = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => rows.value,
  rowHeight: 124,
  gap: 12,
  maxRows: 4,
  containerRef: listEl,
  gridRef: gridEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto } = paging
watch(rows, () => nextTick(() => goto(1)))

const lowStock = computed(() => lowStockProducts({
  productCategories: store.productCategories,
  expenseCategories: store.expenseCategories,
  products: store.products,
  purchases: store.purchases,
  dailyRecords: store.dailyRecords,
  expenseDailies: store.expenseDailies,
  settings: store.settings
}))

// ===== 滞销 / 久存预警（阈值走「设置 → 销售记账 → 基础设置」） =====
const slowDays = computed(() => store.settings.slowMovingDays ?? 30)
const agingDays = computed(() => store.settings.agingBatchDays ?? 60)
const today = computed(() => localDateKey())

const data = computed(() => ({
  productCategories: store.productCategories,
  expenseCategories: store.expenseCategories,
  products: store.products,
  purchases: store.purchases,
  dailyRecords: store.dailyRecords,
  expenseDailies: store.expenseDailies,
  settings: store.settings
}))

/** 滞销商品：在售、有库存且近 N 天没有售出 */
const slowMoving = computed(() => slowMovingProducts(data.value, slowDays.value, today.value))
/** 久存批次：入库超过 N 天仍未售完 */
const aging = computed(() => agingBatches(data.value, agingDays.value, today.value))

/** 批次明细弹框（按商品的 FIFO 批次库存） */
const batchProductId = ref<string | null>(null)
const batchRows = computed(() => {
  if (!batchProductId.value) return []
  return calcBatchStock(data.value, today.value).filter(b => b.productId === batchProductId.value)
})
const batchProduct = computed(() =>
  batchProductId.value ? store.products.find(p => p.id === batchProductId.value) ?? null : null
)
/** 该商品未售完批次占用的资金合计 */
const batchOpenAmount = computed(() =>
  Math.round(batchRows.value.filter(b => !b.soldOut).reduce((s, b) => s + b.amount, 0) * 100) / 100
)
function openBatchModal(productId: string): void {
  batchProductId.value = productId
}
function closeBatchModal(): void {
  batchProductId.value = null
}
function batchStatusText(row: { soldOut: boolean; remaining: number }): string {
  return row.soldOut ? '已售完' : `未售完 · 剩 ${row.remaining}`
}

// 低库存阈值已迁移到「设置 → 销售记账 → 基础设置」：「库存预警」页只展示当前值并提供跳转入口
const appSettings = useAppSettingsDialog()
function openThresholdSettings(): void {
  appSettings.openAppSettings({ tab: 'business', sub: 'biz-base' })
}

// 溯源弹框
const traceModalProductId = ref<string | null>(null)
const traceModalProduct = computed(() =>
  traceModalProductId.value ? store.products.find(p => p.id === traceModalProductId.value) ?? null : null
)
const traceModalSources = computed(() =>
  traceModalProductId.value ? calcInventorySources(traceModalProductId.value, store.purchases, store.dailyRecords) : []
)

function openTraceModal(productId: string): void {
  traceModalProductId.value = productId
}

function closeTraceModal(): void {
  traceModalProductId.value = null
}

/** 导出文件名前缀：账本年份 + 账本名称（缺失时由 xlsxFileName 自动省略该段） */
const ledgerMeta = computed(() => ({ year: store.currentLedgerYear, ledgerName: store.currentLedgerName }))

// ===== 一键导出 Excel（库存总览：全部商品，含当前库存）=====
function exportInventoryExcel(): void {
  const headers = ['商品名称', '分类', '单位', '进货价', '售价', '当前库存', '状态']
  const rows: (string | number)[][] = sortProducts(store.products).map(p => [
    p.name,
    (p.categoryId ? findProductCategory(store.productCategories, p.categoryId)?.name : undefined) ?? '未分类',
    p.unit,
    p.purchasePrice.toFixed(2),
    p.sellingPrice.toFixed(2),
    stockMap.value[p.id] ?? 0,
    p.active ? '在售' : '停售'
  ])
  void exportXlsx('库存总览', headers, rows, ledgerMeta.value)
}
</script>

<template>
  <div class="bizinv">
    <!-- 阈值设置 + 预警清单 -->
    <div class="bizinv-alert" data-testid="bizinv-alert">
      <div class="bizinv-alert-head">
        <span class="bizinv-alert-title"><Icon name="alert" :size="15" /> 低库存预警</span>
        <div class="bizinv-alert-actions">
          <el-button class="btn-export-xlsx" size="small" data-testid="bizinv-export" :disabled="store.products.length === 0" @click="exportInventoryExcel">导出 Excel</el-button>
          <el-button size="small" data-testid="bizinv-threshold" title="低库存阈值（设置）" @click="openThresholdSettings">
            <Icon name="cog" :size="14" /> 阈值 {{ store.settings.lowStockThreshold }}
          </el-button>
        </div>
      </div>
      <p v-if="lowStock.length === 0" class="bizinv-empty" data-testid="bizinv-low-empty">库存充足，暂无预警商品</p>
      <div v-else class="bizinv-low-grid">
        <div
          v-for="item in lowStock"
          :key="item.product.id"
          class="bizinv-low-card"
          :data-testid="'bizinv-low-' + item.product.id"
        >
          <span class="bizinv-low-name">{{ item.product.name }}</span>
          <span class="bizinv-low-stock">{{ item.stock }} {{ item.product.unit }}</span>
        </div>
      </div>
    </div>

    <!-- 滞销预警 + 久存批次预警 -->
    <div class="bizinv-warns">
      <div class="bizinv-warn" data-testid="bizinv-slow">
        <div class="bizinv-warn-head">
          <span class="bizinv-warn-title"><Icon name="alert" :size="15" /> 滞销预警（{{ slowDays }} 天无售出）</span>
          <el-button size="small" data-testid="bizinv-slow-threshold" title="滞销天数（设置）" @click="openThresholdSettings">
            <Icon name="cog" :size="14" /> {{ slowDays }} 天
          </el-button>
        </div>
        <p v-if="slowMoving.length === 0" class="bizinv-empty" data-testid="bizinv-slow-empty">暂无滞销商品</p>
        <ul v-else class="bizinv-warn-list">
          <li
            v-for="item in slowMoving"
            :key="item.product.id"
            class="bizinv-warn-item"
            :data-testid="'bizinv-slow-' + item.product.id"
          >
            <span class="bizinv-warn-name">{{ item.product.name }}</span>
            <span class="bizinv-warn-meta">库存 {{ item.stock }} {{ item.product.unit }}</span>
            <span class="bizinv-warn-days">
              {{ item.lastSoldDate ? `${item.idleDays} 天未售出（${item.lastSoldDate}）` : '从未售出' }}
            </span>
          </li>
        </ul>
      </div>

      <div class="bizinv-warn" data-testid="bizinv-aging">
        <div class="bizinv-warn-head">
          <span class="bizinv-warn-title"><Icon name="purchases" :size="15" /> 久存批次（入库 ≥ {{ agingDays }} 天未售完）</span>
          <el-button size="small" data-testid="bizinv-aging-threshold" title="久存天数（设置）" @click="openThresholdSettings">
            <Icon name="cog" :size="14" /> {{ agingDays }} 天
          </el-button>
        </div>
        <p v-if="aging.length === 0" class="bizinv-empty" data-testid="bizinv-aging-empty">暂无久存批次</p>
        <ul v-else class="bizinv-warn-list">
          <li
            v-for="b in aging"
            :key="b.purchaseId"
            class="bizinv-warn-item"
            :data-testid="'bizinv-aging-' + b.purchaseId"
          >
            <span class="bizinv-warn-name">{{ b.productName }}</span>
            <span class="bizinv-warn-meta">剩 {{ b.remaining }} {{ b.unit }} · 占用 {{ formatYuanOf(b.amount) }}</span>
            <span class="bizinv-warn-days">{{ b.date }} 入库 · 库龄 {{ b.ageDays }} 天</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- 库存总览卡片网格 -->
    <div ref="listEl" class="bizinv-list" :class="{ 'bizinv-list-scroll': !fitsOnePage }">
      <div ref="gridEl" class="bizinv-grid" data-testid="bizinv-grid">
      <div
        v-for="row in pageItems"
        :key="row.product.id"
        class="bizinv-card"
        :data-testid="'bizinv-card-' + row.product.id"
      >
        <!-- 卡片头：商品名 + 状态 + 单位/分类 + 操作按钮（宽卡横向排布，不再挤压截断） -->
        <div class="bizinv-card-head">
          <div class="bizinv-card-title">
            <span class="bizinv-name">{{ row.product.name }}</span>
            <span class="bizinv-badge" :class="row.product.active ? 'on' : 'off'">{{ row.product.active ? '在售' : '停售' }}</span>
          </div>
          <div class="bizinv-card-actions">
            <el-button size="small" @click="openTraceModal(row.product.id)">查看溯源</el-button>
            <el-button size="small" :data-testid="'bizinv-batch-' + row.product.id" @click="openBatchModal(row.product.id)">批次明细</el-button>
          </div>
        </div>
        <div class="bizinv-card-meta">
          <span>单位：{{ row.product.unit }}</span>
          <span class="bizinv-meta-sep">·</span>
          <span>分类：{{ categoryNameOf(row.product.id) }}</span>
        </div>
        <!-- 三项指标横向铺开：进货合计（蓝）/ 带出合计（橙）/ 库存剩余（绿） -->
        <div class="bizinv-card-metrics">
          <div class="bizinv-metric num-purchase">
            <span class="metric-label">进货合计</span>
            <span class="metric-value"><b>{{ purchaseTotals[row.product.id] ?? 0 }}</b> {{ row.product.unit }}</span>
          </div>
          <div class="bizinv-metric num-brought">
            <span class="metric-label">带出合计</span>
            <span class="metric-value"><b>{{ broughtOutTotals[row.product.id] ?? 0 }}</b> {{ row.product.unit }}</span>
          </div>
          <div class="bizinv-metric num-stock">
            <span class="metric-label">库存剩余</span>
            <span class="metric-value"><b>{{ row.stock }}</b> {{ row.product.unit }}</span>
          </div>
        </div>
      </div>
      </div>
      <PanelPager
        v-if="totalPages > 1"
        :page="currentPage"
        :total="totalPages"
        data-testid="panel-pager"
        @prev="prev()"
        @next="next()"
      />
    </div>

    <!-- 批次明细弹框（FIFO 剩余量 / 库龄 / 占用资金） -->
    <el-dialog
      v-if="batchProductId"
      :model-value="true"
      width="560px"
      class="bizinv-batch"
      data-testid="bizinv-batch-modal"
      :title="`批次库存 · ${batchProduct?.name ?? '未知商品'}`"
      @close="closeBatchModal"
    >
      <div class="bizinv-batch-body">
        <p v-if="batchRows.length === 0" class="bizinv-trace-empty">暂无进货批次</p>
        <template v-else>
          <div
            v-for="b in batchRows"
            :key="b.purchaseId"
            class="bizinv-batch-row"
            :class="{ 'sold-out': b.soldOut }"
            :data-testid="'bizinv-batch-row-' + b.purchaseId"
          >
            <span class="bizinv-batch-date">{{ b.date }}</span>
            <span class="bizinv-batch-detail">进货 {{ b.quantity }} · 已售 {{ b.sold }} · 剩 {{ b.remaining }} {{ b.unit }}</span>
            <span class="bizinv-batch-price">@{{ formatYuanOf(b.unitPrice) }}</span>
            <span class="bizinv-batch-amount">{{ b.soldOut ? '—' : formatYuanOf(b.amount) }}</span>
            <span class="bizinv-batch-status" :class="b.soldOut ? 'done' : 'open'">{{ batchStatusText(b) }}</span>
          </div>
          <p class="bizinv-batch-summary" data-testid="bizinv-batch-summary">
            未售完批次占用资金合计：{{ formatYuanOf(batchOpenAmount) }}（按先进先出，最旧批次优先售出）
          </p>
        </template>
      </div>
    </el-dialog>

    <!-- 溯源弹框（屏幕居中） -->
    <el-dialog
      v-if="traceModalProductId"
      :model-value="true"
      width="480px"
      class="bizinv-trace"
      data-testid="bizinv-trace"
      :title="`溯源记录 · ${traceModalProduct?.name ?? '未知商品'}`"
      @close="closeTraceModal"
    >
      <div class="bizinv-trace-body" data-testid="bizinv-trace-modal">
        <p v-if="traceModalSources.length === 0" class="bizinv-trace-empty">暂无溯源记录</p>
        <div
          v-for="src in traceModalSources"
          :key="src.type + '-' + src.id"
          class="bizinv-source-row"
          @click="emit('navigate', src.type === 'purchase' ? 'purchases' : 'daily', traceModalProductId!)"
        >
          <span v-if="src.type === 'purchase'" class="bizinv-source-type purchase">进货</span>
          <span v-else class="bizinv-source-type daily">销售</span>
          <span class="bizinv-source-date">{{ src.date }}</span>
          <span v-if="src.type === 'purchase'" class="bizinv-source-detail">
            ×{{ src.quantity }} @{{ formatYuanOf(src.unitPrice) }} {{ formatYuanOf(src.total) }}
          </span>
          <span v-else class="bizinv-source-detail">
            带出 {{ src.broughtOut }} 剩余 {{ src.remaining }} 损耗 {{ src.loss }}
          </span>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.bizinv {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

/* 卡片操作按钮组 */
.bizinv-card-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

/* 滞销 / 久存预警 */
.bizinv-warns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.bizinv-warn {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 10px);
}

.bizinv-warn-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bizinv-warn-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.bizinv-warn-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bizinv-warn-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
  background: var(--color-bg-hover, #f9fafb);
  border-radius: var(--radius-sm, 6px);
  font-variant-numeric: tabular-nums;
}

.bizinv-warn-name {
  font-weight: 600;
  color: var(--color-text, #111827);
  flex-shrink: 0;
}

.bizinv-warn-meta {
  flex: 1;
  color: var(--color-text-secondary, #64748b);
}

.bizinv-warn-days {
  flex-shrink: 0;
  color: var(--color-warning, #b45309);
}

/* 批次明细 */
.bizinv-batch-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bizinv-batch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  font-size: 13px;
  background: var(--color-bg-hover, #f9fafb);
  border-radius: var(--radius-sm, 6px);
  font-variant-numeric: tabular-nums;
}

.bizinv-batch-row.sold-out {
  opacity: 0.6;
}

.bizinv-batch-date {
  font-weight: 600;
  flex-shrink: 0;
}

.bizinv-batch-detail {
  flex: 1;
  color: var(--color-text-secondary, #64748b);
}

.bizinv-batch-price {
  flex-shrink: 0;
}

.bizinv-batch-amount {
  flex-shrink: 0;
  font-weight: 700;
  color: var(--color-primary, #3b82f6);
}

.bizinv-batch-status {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
}

.bizinv-batch-status.done {
  color: var(--color-success, #16a34a);
  background: color-mix(in srgb, var(--color-success, #16a34a) 12%, transparent);
}

.bizinv-batch-status.open {
  color: var(--color-warning, #b45309);
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 14%, transparent);
}

.bizinv-batch-summary {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

@media (max-width: 768px) {
  .bizinv-warns {
    grid-template-columns: 1fr;
  }
}

.bizinv-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}
@media (max-width: 768px) {
  .bizinv { min-height: 0; }
  .bizinv-list { flex: none; overflow: visible; }
}

.bizinv-alert {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.bizinv-alert-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.bizinv-alert-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizinv-alert-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.bizinv-threshold {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizinv-th-input {
  width: 80px;
}

.bizinv-empty {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.bizinv-low-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}

.bizinv-low-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid color-mix(in srgb, var(--color-error, #ef4444) 40%, transparent);
  border-radius: var(--radius-md, 8px);
}

.bizinv-low-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizinv-low-stock {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-error, var(--color-error));
  font-variant-numeric: tabular-nums;
}

/* 宽卡网格：每行 2 个（信息横向铺开，不再挤压截断）；≤640px 回退单列 */
.bizinv-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
}

.bizinv-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.bizinv-card:hover {
  border-color: var(--color-primary, var(--color-primary));
}

/* 卡片头：商品名 + 在售/停售徽标（左） + 操作按钮（右） */
.bizinv-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.bizinv-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.bizinv-badge {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.bizinv-badge.on {
  color: var(--color-success, #16a34a);
  background: color-mix(in srgb, var(--color-success, #16a34a) 12%, transparent);
}

.bizinv-badge.off {
  color: var(--color-text-muted, #6b7280);
  background: var(--color-bg-hover, #f1f5f9);
}

/* 单位 / 分类一行 */
.bizinv-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizinv-meta-sep {
  color: var(--color-text-muted, #9ca3af);
}

/* 三项指标：横向等分铺开 */
.bizinv-card-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--color-border, #e2e8f0);
}

.bizinv-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-label {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.metric-value {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text, var(--color-text));
}

.bizinv-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizinv-unit {
  font-size: 13px;
  color: var(--color-text, var(--color-text));
}

.bizinv-num {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

/* 三色区分：进货合计（蓝）、带出合计（橙）、库存剩余（绿） */
.bizinv-metric.num-purchase .metric-value b {
  color: #3b82f6;
}

.bizinv-metric.num-brought .metric-value b {
  color: #f59e0b;
}

.bizinv-metric.num-stock .metric-value b {
  color: #22c55e;
}

/* 查看溯源按钮（卡片右上角） */
.bizinv-trace-btn {
  align-self: flex-end;
  padding: 2px 10px;
  font-size: 11px;
  cursor: pointer;
  color: var(--color-primary, var(--color-primary));
  background: none;
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm, 4px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizinv-trace-btn:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
  background: color-mix(in srgb, var(--color-primary, var(--color-primary)) 8%, transparent);
}

/* 溯源弹框遮罩 */
.bizinv-trace-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

/* 溯源弹框：屏幕居中 */
.bizinv-trace-modal {
  position: relative;
  z-index: 1001;
  width: 380px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.bizinv-trace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
}

.bizinv-trace-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

.bizinv-trace-close {
  padding: 2px 8px;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-muted, var(--color-text-muted));
  background: none;
  border: none;
  border-radius: var(--radius-sm, 4px);
  transition: all 0.15s ease;
}

.bizinv-trace-close:hover {
  color: var(--color-text, var(--color-text));
  background: var(--color-bg-card, var(--color-bg-hover));
}

.bizinv-trace-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bizinv-trace-empty {
  margin: 0;
  padding: 20px 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.bizinv-source-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  transition: background 0.15s ease;
}

.bizinv-source-row:hover {
  background: var(--color-bg-card, var(--color-bg-hover));
}

.bizinv-source-type {
  flex-shrink: 0;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-full, 999px);
}

.bizinv-source-type.purchase {
  color: var(--color-primary, var(--color-primary));
  background: color-mix(in srgb, var(--color-primary, var(--color-primary)) 12%, transparent);
}

.bizinv-source-type.daily {
  color: var(--color-success, var(--color-success));
  background: color-mix(in srgb, var(--color-success, var(--color-success)) 12%, transparent);
}

.bizinv-source-date {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

.bizinv-source-detail {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* el-dialog 换皮：溯源弹框 */
.bizinv-trace :deep(.el-dialog) {
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
}

.bizinv-trace :deep(.el-dialog__header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  margin-right: 0;
  flex-shrink: 0;
}

.bizinv-trace :deep(.el-dialog__body) {
  padding: 0;
  flex: 1;
  overflow-y: auto;
}

html.dark .bizinv-alert,
html.dark .bizinv-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .bizinv-low-card {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .bizinv-name {
  color: var(--color-text, #f9fafb);
}

html.dark .bizinv-low-stock {
  color: #f87171;
}

/* 暗色模式：三色适配 */
html.dark .bizinv-metric.num-purchase .metric-value b {
  color: #60a5fa;
}

html.dark .bizinv-metric.num-brought .metric-value b {
  color: #fbbf24;
}

html.dark .bizinv-metric.num-stock .metric-value b {
  color: #4ade80;
}

/* 暗色模式：溯源弹框 */
html.dark .bizinv-trace-modal {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

html.dark .bizinv-source-row:hover {
  background: var(--color-bg-card, #1f2937);
}

html.dark .biz-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

@media (max-width: 640px) {
  .bizinv-grid {
    grid-template-columns: 1fr;
  }
}
</style>
