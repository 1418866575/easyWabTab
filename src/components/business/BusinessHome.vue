<script setup lang="ts">
// 销售记账首页：问候头（含出摊总天数，右上角）+ 营业额/利润等主指标卡 + 低库存概览 + 销售排行（树状）
import { computed, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { calcBusinessStats, calcCategoryProductRanking, calcExpenseLinkStats, calcMonthlyStats, formatYuanOf, lowStockProducts } from '@/composables/businessCore'
import Icon from '@/components/Icon.vue'

const emit = defineEmits<{ navigate: [section: string, filter?: string] }>()

function go(section: string): void {
  emit('navigate', section)
}

const store = useWorkbenchBusinessStore()

// 首屏骨架屏：store 自 IndexedDB 加载完成（loaded=true）前显示占位，避免空白闪跳
const loading = computed(() => !store.loaded)

const data = computed(() => ({
  productCategories: store.productCategories,
  expenseCategories: store.expenseCategories,
  products: store.products,
  purchases: store.purchases,
  dailyRecords: store.dailyRecords,
  expenses: store.expenses,
  settings: store.settings
}))

const lowStock = computed(() => lowStockProducts(data.value))

const treeRank = computed(() => calcCategoryProductRanking(data.value, 5))

const expandedCategories = ref<Set<string>>(new Set())

function ensureDefaultExpanded(): void {
  if (expandedCategories.value.size > 0) return
  for (const node of treeRank.value.slice(0, 2)) {
    expandedCategories.value.add(node.categoryId)
  }
}

watch(treeRank, () => ensureDefaultExpanded(), { immediate: true })

function toggleCategory(categoryId: string): void {
  if (expandedCategories.value.has(categoryId)) {
    expandedCategories.value.delete(categoryId)
  } else {
    expandedCategories.value.add(categoryId)
  }
}

function isCategoryExpanded(categoryId: string): boolean {
  return expandedCategories.value.has(categoryId)
}

function maxProductRevenue(node: { products: { revenue: number }[] }): number {
  return Math.max(1, ...node.products.map(p => p.revenue))
}

// ===== 统计维度：按账本（同一年份可有多本，每本只记录所属年份的数据） =====
// 账本按自然年创建、年内自动分配序号（编号 = 年份-序号，如 2026-02），默认落在「当年第一本」→ 首屏即按当年统计；
// 因此首页不再提供「按年 / 按账本」切换，口径统一为「当前账本内全部记录」。
const ledgerYear = computed(() => store.currentLedgerYear)
const ledgerName = computed(() => store.currentLedgerName)
const ledgerCode = computed(() => store.currentLedgerCode)

// 当前账本内的收摊记录（账本即年度容器，不做二次按年过滤）
const ledgerDailyRecords = computed(() => data.value.dailyRecords)
const ledgerStats = computed(() => calcBusinessStats(data.value))

/**
 * 毛利率 =（营业收入 − 成本价）/ 营业收入 × 100%
 * 成本价 = 严格先进先出（FIFO）逐批结转：收摊按日期升序，售出数量从最旧进货批次开始消耗，各段用该批次自己的进货单价
 * 直接取 calcBusinessStats.margin（内部已按同一口径算成本），营业收入为 0 时为 0，不会出现 NaN
 */
const grossMargin = computed(() => ledgerStats.value.margin)

// 支出关联统计：已关联库存（被进货记录挂 expenseIds）/ 未关联库存
const expenseLink = computed(() => calcExpenseLinkStats(data.value))

// 出摊总天数：当前账本内的不同日期数
const totalStallDays = computed(() => new Set(ledgerDailyRecords.value.map(r => r.date)).size)

// 迷你柱状图：当前账本年份 12 个月营业额（无数据月份为 0，与统计模块同口径）
const monthlyStats = computed(() => calcMonthlyStats(data.value, ledgerYear.value))
const monthBars = computed(() => {
  const max = Math.max(1, ...monthlyStats.value.map(m => m.revenue))
  return monthlyStats.value.map(m => ({ label: m.label, revenue: m.revenue, pct: (m.revenue / max) * 100 }))
})

// 问候语（按当前时段）
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})
const dateText = computed(() =>
  new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
)
</script>

<template>
  <div class="bizhome">
    <!-- 骨架屏：首屏数据（IndexedDB）加载中显示占位，加载完成淡入真实内容 -->
    <template v-if="loading">
      <div class="bizhome-hero">
        <div v-for="i in 10" :key="'sk-hero-' + i" class="bizhome-hero-card sk-block">
          <span class="sk-line sk-line-sm"></span>
          <span class="sk-line sk-line-lg"></span>
        </div>
      </div>
      <div class="bizhome-row">
        <div class="bizhome-card sk-block sk-card-tall">
          <span class="sk-line sk-line-md"></span>
          <span class="sk-line sk-line-row"></span>
          <span class="sk-line sk-line-row"></span>
        </div>
      </div>
      <section class="bizhome-card sk-block sk-card-tall">
        <span class="sk-line sk-line-md"></span>
        <span class="sk-line sk-line-row"></span>
        <span class="sk-line sk-line-row"></span>
        <span class="sk-line sk-line-row"></span>
      </section>
    </template>

    <template v-else>
      <!-- 问候头：问候语 + 日期 + 出摊总天数（右上角，点击进入收摊记录） -->
      <section class="bizhome-greeting" data-testid="bizhome-greeting">
        <div class="bizhome-greeting-info">
          <h2 class="bizhome-greeting-title">{{ greeting }}{{ store.settings.stallName ? '，' + store.settings.stallName : '' }}</h2>
          <p class="bizhome-greeting-sub">{{ dateText }}</p>
        </div>
        <div
          class="bizhome-greeting-stat clickable"
          role="button"
          tabindex="0"
          title="出摊总天数（进入收摊记录）"
          data-testid="bizhome-stalldays"
          @click="go('daily')"
          @keydown.enter="go('daily')"
        >
          <span class="greeting-stat-value">{{ totalStallDays }}<small class="greeting-stat-unit">天</small></span>
          <span class="greeting-stat-label">出摊总天数</span>
        </div>
      </section>

      <!-- 统计范围 + 毛利率计算公式（每本账本只记录所属年份的数据，同一年份可有多本） -->
      <div class="bizhome-scope" data-testid="bizhome-scope">
        <div class="scope-head">
          <span class="scope-label" data-testid="bizhome-scope-label">{{ ledgerCode }} · {{ ledgerName }}</span>
          <span class="scope-hint">统计维度：按账本（同一年份可有多本账本，每本只记录所属年份的数据）</span>
        </div>
        <div class="scope-formula" data-testid="bizhome-margin-formula">
          <span class="formula-main">毛利率 =（营业收入 − 成本价）/ 营业收入 × 100%</span>
        </div>
      </div>

      <!-- 主指标（按账本统计）：营业收入 → 成本 → 毛利率 → 利润 → 支出 → 已关联库存支出 → 未关联库存支出 → 待销售（成本/营业额/利润）；出摊总天数移至问候头右上角 -->
      <section class="bizhome-hero">
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-revenue" @click="go('stats')" @keydown.enter="go('stats')">
          <span class="hero-label">营业收入</span>
          <span class="hero-value">{{ formatYuanOf(ledgerStats.revenue) }}</span>
        </div>
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-cost" @click="go('stats')" @keydown.enter="go('stats')">
          <span class="hero-label">成本</span>
          <span class="hero-value">{{ formatYuanOf(ledgerStats.cost) }}</span>
        </div>
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-margin" @click="go('stats')" @keydown.enter="go('stats')">
          <span class="hero-label">毛利率</span>
          <span class="hero-value" :class="{ negative: grossMargin < 0 }">{{ (grossMargin * 100).toFixed(1) }}%</span>
        </div>
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-profit" @click="go('stats')" @keydown.enter="go('stats')">
          <span class="hero-label">利润</span>
          <span class="hero-value" :class="{ negative: ledgerStats.profit < 0 }">{{ formatYuanOf(ledgerStats.profit) }}</span>
        </div>
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-expense" @click="go('expenses')" @keydown.enter="go('expenses')">
          <span class="hero-label">支出</span>
          <span class="hero-value">{{ formatYuanOf(ledgerStats.expenseTotal) }}</span>
        </div>
        <!-- 支出拆分：已关联库存（挂在进货记录上）/ 未关联库存（可能漏记进货，可到对账页核对） -->
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-expense-linked" @click="go('purchases')" @keydown.enter="go('purchases')">
          <span class="hero-label">已关联库存支出</span>
          <span class="hero-value linked">{{ formatYuanOf(expenseLink.linkedAmount) }}</span>
          <span class="hero-sub">{{ expenseLink.linkedCount }} 笔{{ expenseLink.total > 0 ? ` · 占支出 ${((expenseLink.linkedAmount / expenseLink.total) * 100).toFixed(1)}%` : '' }}</span>
        </div>
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-expense-unlinked" @click="go('reconcile')" @keydown.enter="go('reconcile')">
          <span class="hero-label">未关联库存支出</span>
          <span class="hero-value unlinked">{{ formatYuanOf(expenseLink.unlinkedAmount) }}</span>
          <span class="hero-sub">{{ expenseLink.unlinkedCount }} 笔{{ expenseLink.total > 0 ? ` · 占支出 ${((expenseLink.unlinkedAmount / expenseLink.total) * 100).toFixed(1)}%` : '' }}</span>
        </div>
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-pending-cost" @click="go('inventory')" @keydown.enter="go('inventory')">
          <span class="hero-label">待销售成本</span>
          <span class="hero-value">{{ formatYuanOf(ledgerStats.pendingCost) }}</span>
        </div>
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-pending-revenue" @click="go('inventory')" @keydown.enter="go('inventory')">
          <span class="hero-label">待销售营业额</span>
          <span class="hero-value">{{ formatYuanOf(ledgerStats.pendingRevenue) }}</span>
        </div>
        <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-pending-profit" @click="go('inventory')" @keydown.enter="go('inventory')">
          <span class="hero-label">待销售利润</span>
          <span class="hero-value" :class="{ negative: ledgerStats.pendingProfit < 0 }">{{ formatYuanOf(ledgerStats.pendingProfit) }}</span>
        </div>
      </section>

      <!-- 低库存 + 销售排行：一行两列（40% / 60%） -->
      <div class="bizhome-row bizhome-split-row">
        <!-- 低库存概览（左 40%） -->
        <div
          class="bizhome-card bizhome-col bizhome-col-40 clickable"
          role="button"
          tabindex="0"
          data-testid="bizhome-lowstock"
          @click="go('inventory')"
          @keydown.enter="go('inventory')"
        >
          <div class="bizhome-card-title"><Icon name="alert" :size="15" />低库存预警（阈值 {{ store.settings.lowStockThreshold }}）</div>
          <p v-if="lowStock.length === 0" class="bizhome-empty" data-testid="bizhome-lowstock-empty">暂无低库存商品</p>
          <div v-else class="bizhome-low-list">
            <div v-for="item in lowStock.slice(0, 5)" :key="item.product.id" class="bizhome-low-item">
              <span>{{ item.product.name }}</span>
              <span class="bizhome-low-stock">{{ item.stock }} {{ item.product.unit }}</span>
            </div>
          </div>
        </div>

        <!-- 销售排行（右 60%，分类→商品树状展开） -->
        <section class="bizhome-card bizhome-col bizhome-col-60" data-testid="bizhome-rank-tree">
          <div class="bizhome-card-title"><Icon name="stats" :size="15" />销售排行（分类→商品）</div>
          <p v-if="treeRank.length === 0" class="bizhome-empty">暂无数据</p>
          <div v-else class="bizhome-tree">
            <div v-for="node in treeRank" :key="node.categoryId" class="bizhome-tree-node" :data-testid="'bizhome-tree-cat-' + node.categoryId">
              <!-- 分类行 -->
              <div class="bizhome-tree-cat" @click="toggleCategory(node.categoryId)">
                <span class="bizhome-tree-arrow">{{ isCategoryExpanded(node.categoryId) ? '▾' : '▸' }}</span>
                <span class="bizhome-tree-cat-name">{{ node.categoryName }}</span>
                <span class="bizhome-tree-cat-val">{{ formatYuanOf(node.categoryRevenue) }}</span>
                <span class="bizhome-tree-cat-sold">×{{ node.categorySold }}</span>
              </div>
              <!-- 商品排行（展开后显示） -->
              <div v-if="isCategoryExpanded(node.categoryId)" class="bizhome-tree-products">
                <div
                  v-for="(prod, pi) in node.products"
                  :key="prod.productId"
                  class="bizhome-tree-prod"
                  :data-testid="'bizhome-tree-prod-' + prod.productId"
                  @click="emit('navigate', 'purchases', prod.productId)"
                >
                  <span class="bizhome-tree-prod-idx">{{ pi + 1 }}</span>
                  <span class="bizhome-tree-prod-name">{{ prod.name }}</span>
                  <div class="bizhome-tree-prod-bar">
                    <div class="bizhome-tree-prod-fill" :style="{ width: (prod.revenue / maxProductRevenue(node)) * 100 + '%' }"></div>
                  </div>
                  <span class="bizhome-tree-prod-val">{{ formatYuanOf(prod.revenue) }}</span>
                  <span class="bizhome-tree-prod-sold">×{{ prod.sold }}</span>
                </div>
                <p v-if="node.products.length === 0" class="bizhome-tree-empty">该分类暂无商品销售数据</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- {{ ledgerYear }} 年 12 个月营业额迷你柱状图（无数据月份为 0） -->
      <section class="bizhome-card bizhome-mini-chart" data-testid="bizhome-mini-chart">
        <div class="bizhome-card-title"><Icon name="stats" :size="15" />{{ ledgerYear }} 年 12 个月营业额</div>
        <div class="mini-bars" role="img" :aria-label="`${ledgerYear} 年 12 个月营业额，最高 ${formatYuanOf(Math.max(0, ...monthBars.map(b => b.revenue)))}`">
          <div
            v-for="bar in monthBars"
            :key="bar.label"
            class="mini-bar-col"
            :data-testid="`bizhome-month-bar-${bar.label}`"
            :title="`${bar.label}：${formatYuanOf(bar.revenue)}`"
          >
            <div class="mini-bar-track">
              <div class="mini-bar" :style="{ height: bar.pct + '%' }"></div>
            </div>
            <span class="mini-bar-label">{{ bar.label }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>


<style scoped>
.bizhome {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

/* ===== 骨架屏（首屏加载占位 + shimmer 微动效） ===== */
.sk-block {
  position: relative;
  overflow: hidden;
}

.sk-line {
  display: block;
  height: 12px;
  border-radius: 6px;
  background: var(--color-bg-card, var(--color-bg-hover));
}

.sk-line-sm { width: 50%; height: 12px; }
.sk-line-md { width: 40%; height: 14px; }
.sk-line-lg { width: 70%; height: 22px; }
.sk-line-row { width: 100%; height: 12px; margin-top: 10px; }

.sk-card-tall {
  min-height: 120px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* shimmer：从左上到右下的高光扫过，暗色下降低对比 */
.sk-block::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--color-text, #1e293b) 8%, transparent),
    transparent
  );
  animation: bizhome-shimmer 1.4s infinite;
}

@keyframes bizhome-shimmer {
  100% { transform: translateX(100%); }
}

html.dark .sk-line {
  background: var(--color-bg-card, #1f2937);
}

html.dark .sk-block::after {
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.08),
    transparent
  );
}

@media (prefers-reduced-motion: reduce) {
  .sk-block::after { animation: none; }
}

/* ===== 主指标 10 卡（3 列）：营业收入 / 成本 / 毛利率 / 利润 / 支出 / 已关联库存支出 / 未关联库存支出 / 待销售成本 / 待销售营业额 / 待销售利润（出摊总天数已移至问候头右上角） ===== */
.bizhome-hero {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.bizhome-hero-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 12px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #3b82f6) 10%, transparent), transparent),
    var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: box-shadow var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.bizhome-hero-card:hover {
  border-color: var(--color-primary, var(--color-primary));
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.12));
  transform: translateY(-2px);
}

.bizhome-hero-card.clickable {
  cursor: pointer;
}

.bizhome-hero-card.clickable:focus-visible {
  outline: 2px solid var(--color-primary, var(--color-primary));
  outline-offset: 2px;
}

.hero-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.hero-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-success, var(--color-success));
  font-variant-numeric: tabular-nums;
}

.hero-value.negative {
  color: var(--color-error, var(--color-error));
}

/* 支出拆分：已关联库存（主色蓝）/ 未关联库存（警示橙） */
.hero-value.linked {
  color: var(--color-primary, #3b82f6);
}

.hero-value.unlinked {
  color: var(--color-warning, #b45309);
}

.hero-unit {
  font-size: 13px;
  font-weight: 600;
  margin-left: 2px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.hero-sub {
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
}

/* ===== 统计卡悬浮反馈 ===== */
.stat-card,
.bizhome-card {
  transition: box-shadow var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.stat-card:hover,
.bizhome-card:hover {
  border-color: var(--color-primary, var(--color-primary));
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.12));
}

.stat-card:hover {
  transform: translateY(-2px);
}

/* P0-1：统计卡/低库存卡可点击下钻 —— 指针 + 键盘焦点态 */
.stat-card.clickable,
.bizhome-card.clickable {
  cursor: pointer;
}

.stat-card.clickable:focus-visible,
.bizhome-card.clickable:focus-visible {
  outline: 2px solid var(--color-primary, var(--color-primary));
  outline-offset: 2px;
}

.bizhome-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.stat-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.stat-label :deep(svg) {
  flex-shrink: 0;
  color: var(--color-primary, var(--color-primary));
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-value.negative {
  color: var(--color-error, var(--color-error));
}

.bizhome-row {
  display: block;
}

/* 双列并排：低库存 40% + 销售排行 60%，桌面端一行，移动端堆叠 */
.bizhome-split-row {
  display: flex;
  flex-direction: row;
  gap: 16px;
  align-items: stretch;
}
.bizhome-col { flex: 0 0 auto; min-width: 0; }
.bizhome-col-40 { flex-basis: 40%; }
.bizhome-col-60 { flex-basis: 60%; }

.bizhome-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.bizhome-card-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizhome-card-title :deep(svg) {
  flex-shrink: 0;
  color: var(--color-primary, var(--color-primary));
}

.bizhome-empty {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.bizhome-low-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bizhome-low-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-sm, 8px);
}

.bizhome-low-stock {
  font-weight: 700;
  color: var(--color-error, var(--color-error));
  font-variant-numeric: tabular-nums;
}

/* P1-1：树状排行 */
.bizhome-tree {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bizhome-tree-node {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bizhome-tree-cat {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition: background 0.15s ease;
}

.bizhome-tree-cat:hover {
  background: color-mix(in srgb, var(--color-primary, var(--color-primary)) 10%, var(--color-bg-card, var(--color-bg-hover)));
}

.bizhome-tree-arrow {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  width: 14px;
}

.bizhome-tree-cat-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizhome-tree-cat-val {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.bizhome-tree-cat-sold {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
}

.bizhome-tree-products {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0 4px 24px;
}

.bizhome-tree-prod {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: background 0.15s ease;
}

.bizhome-tree-prod:hover {
  background: var(--color-bg-card, var(--color-bg-hover));
}

.bizhome-tree-prod-idx {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: 50%;
}

.bizhome-tree-prod-name {
  flex-shrink: 0;
  min-width: 60px;
  max-width: 120px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizhome-tree-prod-bar {
  flex: 1;
  min-width: 30px;
  height: 6px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: 999px;
  overflow: hidden;
}

.bizhome-tree-prod-fill {
  height: 100%;
  background: var(--color-primary, var(--color-primary));
  border-radius: 999px;
  transition: width 0.3s ease;
}

.bizhome-tree-prod-val {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.bizhome-tree-prod-sold {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
}

.bizhome-tree-empty {
  margin: 0;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
}

/* ===== 问候头：问候语 + 今日/本月切换 + 目标进度环 ===== */
.bizhome-greeting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #3b82f6) 10%, transparent), transparent),
    var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.bizhome-greeting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.bizhome-greeting-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
}

.bizhome-greeting-sub {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

/* 出摊总天数：问候头右上角，点击进入收摊记录 */
.bizhome-greeting-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: var(--radius-md, 10px);
  transition: background var(--transition-fast, 0.15s ease);
}

.bizhome-greeting-stat.clickable {
  cursor: pointer;
}

.bizhome-greeting-stat.clickable:focus-visible {
  outline: 2px solid var(--color-primary, var(--color-primary));
  outline-offset: 2px;
}

.bizhome-greeting-stat:hover {
  background: color-mix(in srgb, var(--color-primary, var(--color-primary)) 10%, transparent);
}

.greeting-stat-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.greeting-stat-unit {
  font-size: 13px;
  font-weight: 600;
  margin-left: 2px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.greeting-stat-label {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

/* ===== 统计范围 + 毛利率公式 ===== */
.bizhome-scope {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

.scope-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
}

.scope-label {
  font-weight: 700;
  color: var(--color-text, var(--color-text));
}

.scope-hint {
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.scope-formula {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.formula-main {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

/* 迷你柱状图 */
.bizhome-mini-chart {
  gap: 14px;
}

.mini-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 96px;
  padding-top: 8px;
}

.mini-bar-col {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

/* 月份标签（12 个月柱状图） */
.mini-bar-label {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--color-text-muted, #9ca3af);
  font-variant-numeric: tabular-nums;
}

/* 柱轨道：占满列内剩余高度，柱子按百分比从底部生长 */
.mini-bar-track {
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.mini-bar {
  width: 100%;
  max-width: 14px;
  min-height: 2px;
  border-radius: 3px 3px 0 0;
  background: linear-gradient(180deg, var(--color-primary, #3b82f6), color-mix(in srgb, var(--color-primary, #3b82f6) 60%, transparent));
  transition: height var(--transition-fast, 0.3s ease);
}

.mini-bar-col:hover .mini-bar {
  background: var(--color-success, var(--color-success));
}

html.dark .stat-card,
html.dark .bizhome-card,
html.dark .bizhome-hero-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .bizhome-hero-card {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #3b82f6) 14%, transparent), transparent),
    var(--color-bg-card, #1f2937);
}

html.dark .hero-value {
  color: #34d399;
}

html.dark .hero-value.negative {
  color: #f87171;
}

html.dark .hero-value.linked {
  color: #60a5fa;
}

html.dark .hero-value.unlinked {
  color: #fbbf24;
}

html.dark .stat-card:hover,
html.dark .bizhome-card:hover,
html.dark .bizhome-hero-card:hover {
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.4));
}

html.dark .bizhome-low-item {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

html.dark .stat-value {
  color: var(--color-text, #f9fafb);
}

html.dark .stat-value.negative {
  color: #f87171;
}

html.dark .bizhome-greeting {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #3b82f6) 14%, transparent), transparent),
    var(--color-bg-card, #1f2937);
}

html.dark .bizhome-greeting-title {
  color: var(--color-text, #f9fafb);
}

html.dark .bizhome-scope {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

html.dark .scope-label {
  color: var(--color-text, #f9fafb);
}

html.dark .formula-main {
  color: #93c5fd;
}

html.dark .greeting-stat-value {
  color: #93c5fd;
}

html.dark .mini-bar {
  background: linear-gradient(180deg, #60a5fa, rgba(96, 165, 250, 0.5));
}

html.dark .mini-bar-col:hover .mini-bar {
  background: #34d399;
}

@media (max-width: 900px) {
  .bizhome {
    gap: 12px;
  }

  .bizhome-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bizhome-hero {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  /* 窄屏下双列堆叠为上下，各自 100% 宽度 */
  .bizhome-split-row { flex-direction: column; }
  .bizhome-col-40,
  .bizhome-col-60 { flex-basis: auto; }

  /* 问候头窄屏：单列排布（出摊总天数仍靠右） */
  .bizhome-greeting {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .bizhome-greeting-stat {
    align-self: flex-end;
  }
}

@media (max-width: 480px) {
  .bizhome-stats {
    grid-template-columns: 1fr;
  }
}
</style>
