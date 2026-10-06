<script setup lang="ts">
// 销售记账首页：问候头（含出摊总天数，右上角）+ 营业额/利润等主指标卡 + 低库存概览 + 销售排行（树状）
import { computed, ref, watch } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { buildLedgerSummaryBlocks, calcBusinessStats, calcCategoryProductRanking, calcExpenseLinkStats, calcInventory, calcMonthlyStats, calcMonthlyTargetProgress, calcTodayStats, formatYuanOf, localDateKey } from '@/composables/businessCore'
import { exportXlsxMulti } from '@/composables/xlsxExport'
import type { SummaryBlock } from '@/composables/businessCore'
import type { BusinessProduct } from '@/types'
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
  expenseDailies: store.expenseDailies,
  settings: store.settings
}))

// 商品当前库存（按商品汇总进货与销售出库，实时随库存/销售数据变化）
const inventory = computed(() => calcInventory(data.value.products, data.value.purchases, data.value.dailyRecords))
const threshold = computed(() => data.value.settings.lowStockThreshold)

interface StockRow {
  product: BusinessProduct
  stock: number
  /** 是否处于预警范围：与 core lowStockProducts 口径一致（仅在售 + 库存 < 阈值） */
  warn: boolean
}
// 全部商品：预警项（库存 < 阈值，红）置顶并按库存升序，正常项（绿）在后按库存升序，保证状态一目了然
// 2026-10-06 口径对齐：此前是 stock <= t且不过滤 active，导致「阈值恰好等于库存时首页标红但库存预警页不列」
// 且「停售商品首页参与预警、库存预警页不显示」。现与 core lowStockProducts 统一。
const stockRows = computed<StockRow[]>(() => {
  const t = threshold.value
  return data.value.products
    .filter(p => p.active)
    .map(p => {
      const stock = inventory.value[p.id] ?? 0
      return { product: p, stock, warn: stock < t }
    })
    .sort((a, b) => (a.warn === b.warn ? a.stock - b.stock : a.warn ? -1 : 1))
})
const warnCount = computed(() => stockRows.value.filter(r => r.warn).length)

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

// 当前账本内的销售记录（账本即年度容器，不做二次按年过滤）
const ledgerDailyRecords = computed(() => data.value.dailyRecords)
const ledgerStats = computed(() => calcBusinessStats(data.value))

/**
 * 毛利率 =（营业收入 − 成本价）/ 营业收入 × 100%
 * 成本价 = 严格先进先出（FIFO）逐批结转：销售按日期升序，售出数量从最旧进货批次开始消耗，各段用该批次自己的进货单价
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

// ===== M-07（2026-10-06）今日维度 =====
// 此前首页 13 张指标卡全是账本年度累计，摆摊用户首屏最关心的「今天卖了多少」看不到。
// 这里加一组「今日」卡片（放在问候头下方），年度累计区保留但可折叠（对账/结算仍需要）。
const todayStats = computed(() => calcTodayStats(data.value, localDateKey()))
/** 年度累计区是否展开（默认展开，保持旧习惯；用户可收起只看今日） */
const cumulativeOpen = ref(true)

/**
 * M-14（2026-10-06）月度目标进度环：激活 monthlyRevenueTarget。
 * 该字段在 types/store/normalize 早已就绪（用户能在设置里填），但此前无任何 UI 消费 →
 * 「填了目标却永不显示」。这里复用 calcMonthlyStats 口径渲染进度环。
 */
const monthlyTarget = computed(() => {
  const now = new Date()
  return calcMonthlyTargetProgress(data.value, now.getFullYear(), now.getMonth() + 1, localDateKey())
})

/**
 * M-16 账本汇总导出：把散在 7 个面板的导出入口合并成一份多 sheet 工作簿
 * （销售/进货/支出各一页 + 关键指标页）。此前首页/商品页无导出，
 * 想对账得先想清楚去哪个子面板导、再手工拼。
 */
const exporting = ref(false)
async function exportSummary(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  try {
    const blocks: SummaryBlock[] = buildLedgerSummaryBlocks(data.value, localDateKey())
    await exportXlsxMulti(
      '账本汇总',
      blocks.map(b => ({ name: b.section, headers: b.headers, rows: b.rows })),
      { year: ledgerYear.value, ledgerName: ledgerName.value }
    )
  } finally {
    exporting.value = false
  }
}

// ===== M-08（2026-10-06）首次使用引导 =====
// 此前空态是死文案（「暂无商品」/「暂无数据」，纯灰字无按钮），新账本建完后首页只有 13 个 0
// 且没有任何下一步指引。现在按数据完备度给出「下一步该做什么」的引导卡。
/** 下一步该做什么：按「商品 → 进货 → 销售」的业务先后顺序取第一个缺口 */
const nextStep = computed<{ section: string; title: string; desc: string; action: string } | null>(() => {
  if (data.value.products.length === 0) {
    return {
      section: 'products',
      title: '第一步：添加你卖的商品',
      desc: '记销售和进货都要先有商品。填好名称、售价就能开始，售价用于自动算营业额。',
      action: '去添加商品'
    }
  }
  if (data.value.purchases.length === 0) {
    return {
      section: 'purchases',
      title: '第二步：记一笔进货',
      desc: '有进货记录后才能算成本和毛利。若进货的钱已记在「支出」里，可在这里勾选关联。',
      action: '去记进货'
    }
  }
  if (data.value.dailyRecords.length === 0) {
    return {
      section: 'daily',
      title: '第三步：记今天的销售',
      desc: '出摊后随手记一笔：填「售出」数量即可，营业额和毛利会自动算好。',
      action: '去记销售'
    }
  }
  return null
})

/** 今日是否已记销售（复用 todayStats，避免重复过滤 dailyRecords） */
const todayHasDaily = computed(() => todayStats.value.hasDaily)

/**
 * M-13 账实异常（需用户处理的问题）汇总。
 * 原先这些信息只藏在「账本累计」区（要滚动下去才看到），且文案是分类统计视角（「未关联库存支出」），
 * 用户不会意识到「账漏了」。现在把「需要行动的问题」提到首屏，与引导卡/今日提示同层。
 * 口径与对账页一致（有未关联支出 / 当日未记账 / 有库存预警项）。
 */
const issues = computed(() => {
  const out: { id: string; text: string; section: string; action: string; level: 'warn' | 'info' }[] = []
  if (expenseLink.value.unlinkedCount > 0) {
    out.push({
      id: 'unlinked-expense',
      text: `${expenseLink.value.unlinkedCount} 笔支出没有挂到进货记录，可能漏记了本批成本`,
      section: 'reconcile',
      action: '去核对',
      level: 'warn'
    })
  }
  if (!todayHasDaily.value && data.value.products.length > 0) {
    out.push({ id: 'no-today-daily', text: '今天还没记销售', section: 'daily', action: '去记账', level: 'info' })
  }
  if (warnCount.value > 0) {
    out.push({
      id: 'low-stock',
      text: `${warnCount.value} 个商品库存低于阈值（当前阈值 ${threshold.value}），该补货了`,
      section: 'inventory',
      action: '看详情',
      level: 'warn'
    })
  }
  return out
})
</script>

<template>
  <div class="bizhome">
    <!-- 骨架屏：首屏数据（IndexedDB）加载中显示占位，加载完成淡入真实内容 -->
    <template v-if="loading">
      <div class="bizhome-hero-skeleton">
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
      <!-- 问候头：问候语 + 日期 + 出摊总天数（右上角，点击进入销售记录） -->
      <section class="bizhome-greeting" data-testid="bizhome-greeting">
        <div class="bizhome-greeting-info">
          <h2 class="bizhome-greeting-title">{{ greeting }}{{ store.settings.stallName ? '，' + store.settings.stallName : '' }}</h2>
          <p class="bizhome-greeting-sub">{{ dateText }}</p>
        </div>
        <div
          class="bizhome-greeting-stat clickable"
          role="button"
          tabindex="0"
          title="出摊总天数（进入销售记录）"
          data-testid="bizhome-stalldays"
          @click="go('daily')"
          @keydown.enter="go('daily')"
        >
          <span class="greeting-stat-value">{{ totalStallDays }}<small class="greeting-stat-unit">天</small></span>
          <span class="greeting-stat-label">出摊总天数</span>
        </div>
        <!-- M-16 账本汇总导出：一份多 sheet 工作簿（销售/进货/支出/关键指标） -->
        <button
          type="button"
          class="bizhome-export"
          :disabled="exporting"
          title="导出账本汇总（销售/进货/支出/关键指标，各一页）"
          data-testid="bizhome-export"
          @click="exportSummary"
        >
          <Icon name="download" :size="14" /> {{ exporting ? '导出中…' : '导出汇总' }}
        </button>
      </section>

      <!-- M-07 今日维度：摆摊首屏最关心「今天卖了多少、赚了多少」 -->
      <section class="bizhome-today" data-testid="bizhome-today">
        <div class="bizhome-today-head">
          <span class="bizhome-today-title"><Icon name="daily" :size="14" /> 今日（{{ todayStats.date }}）</span>
          <span v-if="!todayStats.hasDaily" class="bizhome-today-none" data-testid="bizhome-today-none">还没记账</span>
        </div>
        <div class="bizhome-today-grid">
          <div class="bizhome-today-card clickable" role="button" tabindex="0" data-testid="bizhome-today-revenue" @click="go('daily')" @keydown.enter="go('daily')">
            <span class="today-label">营业额</span>
            <span class="today-value">{{ formatYuanOf(todayStats.revenue) }}</span>
          </div>
          <div class="bizhome-today-card clickable" role="button" tabindex="0" data-testid="bizhome-today-profit" @click="go('daily')" @keydown.enter="go('daily')">
            <span class="today-label">毛利</span>
            <span class="today-value" :class="todayStats.profit < 0 ? 'negative' : ''">{{ formatYuanOf(todayStats.profit) }}</span>
            <span class="today-sub">毛利率 {{ (todayStats.margin * 100).toFixed(1) }}%</span>
          </div>
          <div class="bizhome-today-card clickable" role="button" tabindex="0" data-testid="bizhome-today-expense" @click="go('expenses')" @keydown.enter="go('expenses')">
            <span class="today-label">支出</span>
            <span class="today-value">{{ formatYuanOf(todayStats.expense) }}</span>
          </div>
          <div class="bizhome-today-card" data-testid="bizhome-today-net">
            <span class="today-label">净利</span>
            <span class="today-value" :class="todayStats.net < 0 ? 'negative' : 'accent'">{{ formatYuanOf(todayStats.net) }}</span>
            <span class="today-sub">毛利 − 支出</span>
          </div>
          <div class="bizhome-today-card" data-testid="bizhome-today-count">
            <span class="today-label">交易笔数</span>
            <span class="today-value">{{ todayStats.transactionCount }}<small>笔</small></span>
            <span class="today-sub">{{ todayStats.itemLines }} 行商品</span>
          </div>
          <!-- M-14 本月目标进度环：仅在设置过目标（月度营收目标 > 0）时渲染 -->
          <div
            v-if="monthlyTarget.target !== null"
            class="bizhome-today-card bizhome-target"
            :class="{ behind: monthlyTarget.behind }"
            data-testid="bizhome-target"
          >
            <span class="today-label">本月目标</span>
            <div class="target-body">
              <div
                class="target-ring"
                :style="{ '--pct': Math.min(100, Math.round((monthlyTarget.rate ?? 0) * 100)) + '%' }"
                role="img"
                :aria-label="`本月目标完成 ${Math.round((monthlyTarget.rate ?? 0) * 100)}%`"
              >
                <span class="target-ring-inner">{{ Math.round((monthlyTarget.rate ?? 0) * 100) }}%</span>
              </div>
              <div class="target-meta">
                <span class="target-amount">{{ formatYuanOf(monthlyTarget.revenue) }} / {{ formatYuanOf(monthlyTarget.target) }}</span>
                <span class="target-sub" :class="{ behind: monthlyTarget.behind }">
                  {{ monthlyTarget.gap >= 0 ? `还差 ${formatYuanOf(monthlyTarget.gap)}` : `已超额 ${formatYuanOf(Math.abs(monthlyTarget.gap))}` }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 年度累计区（保留旧指标，可折叠后只看今日） -->
      <button
        type="button"
        class="bizhome-cumulative-toggle"
        data-testid="bizhome-cumulative-toggle"
        @click="cumulativeOpen = !cumulativeOpen"
      >
        <span>账本累计（{{ ledgerYear }} 年）</span>
        <Icon name="chevron-down" :size="14" :class="{ up: cumulativeOpen }" />
      </button>

      <!-- M-08 首次使用引导：无商品/无进货/无销售时给出明确的下一步，而不是 13 个 0 -->
      <section
        v-if="nextStep"
        class="bizhome-onboard"
        data-testid="bizhome-onboard"
      >
        <div class="bizhome-onboard-body">
          <div class="bizhome-onboard-title">{{ nextStep.title }}</div>
          <p class="bizhome-onboard-desc">{{ nextStep.desc }}</p>
        </div>
        <button
          type="button"
          class="bizhome-onboard-btn"
          :data-testid="`bizhome-onboard-go-${nextStep.section}`"
          @click="go(nextStep.section)"
        >{{ nextStep.action }}</button>
      </section>

      <!-- M-13 待处理问题（账实异常 / 今日未记账 / 库存预警）：提到首屏，每条带直达动作 -->
      <section
        v-if="issues.length > 0"
        class="bizhome-issues"
        data-testid="bizhome-issues"
      >
        <div
          v-for="iss in issues"
          :key="iss.id"
          class="bizhome-issue"
          :class="iss.level"
          :data-testid="`bizhome-issue-${iss.id}`"
        >
          <Icon :name="iss.level === 'warn' ? 'alert' : 'info'" :size="15" />
          <span class="issue-text">{{ iss.text }}</span>
          <button
            type="button"
            class="issue-go"
            :data-testid="`bizhome-issue-go-${iss.id}`"
            @click="go(iss.section)"
          >{{ iss.action }}</button>
        </div>
      </section>

      <!-- 统计范围 + 毛利率计算公式（每本账本只记录所属年份的数据，同一年份可有多本） -->
      <!-- 账本累计区（M-07 折叠：默认展开保持旧习惯，收起后只看今日） -->
      <template v-show="cumulativeOpen">
      <div class="bizhome-scope" data-testid="bizhome-scope">
        <div class="scope-head">
          <span class="scope-label" data-testid="bizhome-scope-label">{{ ledgerCode }} · {{ ledgerName }}</span>
          <span class="scope-hint">统计维度：按账本（同一年份可有多本账本，每本只记录所属年份的数据）</span>
        </div>
        <div class="scope-formula" data-testid="bizhome-margin-formula">
          <span class="formula-main">毛利率 =（营业收入 − 成本价）/ 营业收入 × 100%</span>
        </div>
      </div>

      <!-- 主指标按账本统计，分三组各占一行（组间分隔 + 组内竖向分隔线）：①待销售（成本/营业额/利润）②支出拆分（支出/已关联/未关联）③营收（营业收入/成本/毛利率/利润）；出摊总天数移至问候头右上角 -->
      <section class="bizhome-hero">
        <div class="bizhome-hero-group cols-3" data-testid="bizhome-group-pending">
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
        </div>

        <div class="bizhome-hero-group cols-3" data-testid="bizhome-group-expense">
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
          <!-- M-13（2026-10-06）：改为「问题视角」文案。原文案「未关联库存支出」是支出视角的分类统计，
     用户看到「未关联 500 元」不会意识到「我的账漏了 500 块的进货」；这里点明后果并给明确动作 -->
          <div class="bizhome-hero-card clickable" role="button" tabindex="0" data-testid="bizhome-expense-unlinked" @click="go('reconcile')" @keydown.enter="go('reconcile')">
            <span class="hero-label">进货可能漏记</span>
            <span class="hero-value unlinked">{{ formatYuanOf(expenseLink.unlinkedAmount) }}</span>
            <span class="hero-sub">{{ expenseLink.unlinkedCount }} 笔支出未挂到进货 · 点此核对</span>
          </div>
        </div>

        <div class="bizhome-hero-group cols-4" data-testid="bizhome-group-main">
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
        </div>
      </section>

      <!-- 低库存 + 销售排行：一行两列（40% / 60%） -->
      <div class="bizhome-row bizhome-split-row">
        <!-- 商品库存预警（左 40%）：列出全部商品及其当前库存数量，库存 ≤ 阈值显示红色，> 阈值显示绿色 -->
        <div
          class="bizhome-card bizhome-col bizhome-col-40 clickable"
          role="button"
          tabindex="0"
          data-testid="bizhome-lowstock"
          @click="go('inventory')"
          @keydown.enter="go('inventory')"
        >
          <div class="bizhome-card-title"><Icon name="alert" :size="15" />商品库存预警（阈值 {{ threshold }}）</div>
          <p class="bizhome-stock-summary" data-testid="bizhome-stock-summary">{{ warnCount }} 项低于阈值 · 共 {{ stockRows.length }} 项</p>
          <p v-if="stockRows.length === 0" class="bizhome-empty" data-testid="bizhome-lowstock-empty">
            还没有商品。<span class="bizhome-empty-action" data-testid="bizhome-lowstock-add" @click.stop="go('products')">去添加商品 →</span>
          </p>
          <div v-else class="bizhome-low-list">
            <div
              v-for="row in stockRows"
              :key="row.product.id"
              class="bizhome-low-item"
              :class="row.warn ? 'warn' : 'ok'"
              :data-testid="'bizhome-stock-' + row.product.id"
            >
              <span class="bizhome-low-name">
                {{ row.product.name }}<span v-if="!row.product.active" class="bizhome-low-stopped">（停售）</span>
              </span>
              <span class="bizhome-low-stock" :class="row.warn ? 'low' : 'ok'">{{ row.stock }} {{ row.product.unit }}</span>
            </div>
          </div>
        </div>

        <!-- 销售排行（右 60%，分类→商品树状展开） -->
        <section class="bizhome-card bizhome-col bizhome-col-60" data-testid="bizhome-rank-tree">
          <div class="bizhome-card-title"><Icon name="stats" :size="15" />销售排行（分类→商品）</div>
          <p v-if="treeRank.length === 0" class="bizhome-empty">
            还没有销售数据。<span class="bizhome-empty-action" @click.stop="go('daily')">去记第一笔销售 →</span>
          </p>
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
    </template>
  </div>
</template>


<style scoped>
.bizhome {
  display: flex;
  flex-direction: column;
  gap: 16px;
  
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

/* ===== 主指标：分三组，每组各占一行独立显示（组间分隔 + 组内竖向分隔线） ===== */
/* 骨架屏：首屏占位仍用 3 列网格，避免与分组布局耦合 */
.bizhome-hero-skeleton {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

/* 分组容器：纵向堆叠三组，组间用间距 + 分隔线区分 */
.bizhome-hero {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 每组为一行：等宽单元格 + 组内竖向分隔线 */
.bizhome-hero-group {
  display: grid;
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
  background: var(--color-bg-card, var(--color-bg-card));
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.bizhome-hero-group.cols-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.bizhome-hero-group.cols-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

/* 组内各项之间竖向分隔线（首列无） */
.bizhome-hero-group .bizhome-hero-card + .bizhome-hero-card {
  border-left: 1px solid var(--color-border, var(--color-border));
}

.bizhome-hero-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 12px;
  transition: background var(--transition-fast, 0.15s ease);
}

.bizhome-hero-card:hover {
  background: color-mix(in srgb, var(--color-primary, #3b82f6) 10%, transparent);
}

.bizhome-hero-card.clickable {
  cursor: pointer;
}

.bizhome-hero-card.clickable:focus-visible {
  outline: 2px solid var(--color-primary, var(--color-primary));
  outline-offset: -2px;
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
  gap: 6px;
  /* 全部商品完整呈现：限高内滚动，避免长列表撑破卡片布局 */
  max-height: 360px;
  overflow-y: auto;
  padding-right: 2px;
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
  border-left: 3px solid transparent;
}

.bizhome-low-item.warn {
  background: color-mix(in srgb, var(--color-error, #dc2626) 10%, var(--color-bg-card, var(--color-bg-hover)));
  border-left-color: var(--color-error, #dc2626);
}

.bizhome-low-item.ok {
  background: color-mix(in srgb, var(--color-success, #16a34a) 8%, var(--color-bg-card, var(--color-bg-hover)));
  border-left-color: var(--color-success, #16a34a);
}

.bizhome-low-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text, var(--color-text));
}

.bizhome-low-stopped {
  margin-left: 4px;
  font-size: 11px;
  color: var(--color-text-muted, #9ca3af);
}

.bizhome-stock-summary {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

.bizhome-low-stock {
  flex-shrink: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text, var(--color-text));
}

.bizhome-low-stock.low {
  color: var(--color-error, #dc2626);
}

.bizhome-low-stock.ok {
  color: var(--color-success, #16a34a);
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

/* 出摊总天数：问候头右上角，点击进入销售记录 */
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

/* ===== M-07 今日维度卡片组 ===== */
.bizhome-today {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 10px);
}
.bizhome-today-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bizhome-today-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}
.bizhome-today-none {
  margin-left: auto;
  padding: 2px 8px;
  font-size: 11px;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 999px;
}
.bizhome-today-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.bizhome-today-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 9px 10px;
  background: var(--color-bg, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
}
.bizhome-today-card.clickable {
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
}
.bizhome-today-card.clickable:hover {
  background: var(--color-bg-hover, #f1f5f9);
  border-color: var(--color-primary, #3b82f6);
}
.bizhome-today-card .today-label {
  font-size: 11px;
  color: var(--color-text-secondary, #64748b);
  white-space: nowrap;
}
.bizhome-today-card .today-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bizhome-today-card .today-value small {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-secondary, #64748b);
  margin-left: 2px;
}
.bizhome-today-card .today-value.negative {
  color: var(--color-error, #dc2626);
}
.bizhome-today-card .today-value.accent {
  color: var(--color-primary, #3b82f6);
}
.bizhome-today-card .today-sub {
  font-size: 10px;
  color: var(--color-text-muted, var(--color-text-muted));
  white-space: nowrap;
}

/* 累计区折叠开关 */
.bizhome-cumulative-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  padding: 7px 0;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  background: transparent;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.bizhome-cumulative-toggle:hover {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}
.bizhome-cumulative-toggle :deep(.icon) {
  transition: transform 0.15s;
}
.bizhome-cumulative-toggle :deep(.icon.up) {
  transform: rotate(180deg);
}

/* M-16 汇总导出按钮 */
.bizhome-export {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 7px 12px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.bizhome-export:hover:not(:disabled) {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}
.bizhome-export:disabled {
  opacity: 0.6;
  cursor: progress;
}

/* ===== M-14 本月目标进度环 ===== */
.bizhome-target {
  grid-column: span 2;
}
.target-body {
  display: flex;
  align-items: center;
  gap: 10px;
}
.target-ring {
  --pct: 0%;
  position: relative;
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: conic-gradient(var(--color-primary, #3b82f6) var(--pct), var(--color-border, #e2e8f0) 0);
}
.bizhome-target.behind .target-ring {
  background: conic-gradient(#f59e0b var(--pct), var(--color-border, #e2e8f0) 0);
}
.target-ring-inner {
  position: absolute;
  inset: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  background: var(--color-bg, #f8fafc);
  border-radius: 50%;
  font-variant-numeric: tabular-nums;
}
.target-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.target-amount {
  font-size: 12px;
  color: var(--color-text, #1e293b);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.target-sub {
  font-size: 10px;
  color: var(--color-success, #16a34a);
}
.target-sub.behind {
  color: #f59e0b;
}

/* ===== M-08 首次使用引导卡 ===== */
.bizhome-onboard {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 35%, transparent);
  border-radius: var(--radius-md, 10px);
}
.bizhome-onboard-body {
  flex: 1;
  min-width: 0;
}
.bizhome-onboard-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary, #3b82f6);
  margin-bottom: 3px;
}
.bizhome-onboard-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary, #64748b);
}
.bizhome-onboard-btn {
  flex-shrink: 0;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--color-primary, #3b82f6);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s;
}
.bizhome-onboard-btn:hover {
  background: var(--color-primary-hover, #2563eb);
}

/* M-13 待处理问题列表：账实异常 / 今日未记账 / 库存预警 */
.bizhome-issues {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bizhome-issue {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  border-radius: var(--radius-md, 10px);
}
.bizhome-issue .issue-text {
  flex: 1;
  min-width: 0;
  line-height: 1.5;
}
/* warn = 需要处理的问题（漏记成本/ 库存预警） */
.bizhome-issue.warn {
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fcd34d;
}
/* info = 提醒（今天还没记账） */
.bizhome-issue.info {
  color: var(--color-text-secondary, #64748b);
  background: var(--color-bg-card, #ffffff);
  border: 1px dashed var(--color-border, #e2e8f0);
}
.issue-go {
  flex-shrink: 0;
  margin-left: auto;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--color-primary, #3b82f6);
  background: transparent;
  border: 1px solid var(--color-primary, #3b82f6);
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.issue-go:hover {
  color: #fff;
  background: var(--color-primary, #3b82f6);
}

/* 空态里的行动链接 */
.bizhome-empty-action {
  color: var(--color-primary, #3b82f6);
  cursor: pointer;
  font-weight: 600;
}
.bizhome-empty-action:hover {
  text-decoration: underline;
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
html.dark .bizhome-hero-group {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .bizhome-hero-card {
  background: transparent;
}

html.dark .bizhome-hero-group .bizhome-hero-card + .bizhome-hero-card {
  border-left-color: var(--color-border, #374151);
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
html.dark .bizhome-card:hover {
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.4));
}

html.dark .bizhome-hero-card:hover {
  background: color-mix(in srgb, var(--color-primary, #3b82f6) 18%, transparent);
}

html.dark .bizhome-low-item {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

html.dark .bizhome-low-item.warn {
  background: rgba(220, 38, 38, 0.18);
  border-left-color: #f87171;
}

html.dark .bizhome-low-item.ok {
  background: rgba(22, 163, 74, 0.16);
  border-left-color: #34d399;
}

html.dark .bizhome-low-stock.low {
  color: #f87171;
}

html.dark .bizhome-low-stock.ok {
  color: #34d399;
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

  /* 窄屏：每组改为每行 2 列，组内竖向分隔线保留 */
  .bizhome-hero-group.cols-3,
  .bizhome-hero-group.cols-4 {
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

  /* 超窄屏：每组内单列堆叠，竖向分隔线改为横向分隔线 */
  .bizhome-hero-group.cols-3,
  .bizhome-hero-group.cols-4 {
    grid-template-columns: 1fr;
  }
  .bizhome-hero-group .bizhome-hero-card + .bizhome-hero-card {
    border-left: none;
    border-top: 1px solid var(--color-border, var(--color-border));
  }
}

/* M-08 移动端：引导卡竖排（按钮独占一行更好点），今日提示允许换行 */
@media (max-width: 768px) {
  /* M-07 今日卡片：5 列在375px 屏会挤成一条数字 → 改 2 列（末卡跨列） */
  .bizhome-today-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .bizhome-today-card:last-child {
    grid-column: 1 / -1;
  }

  .bizhome-onboard {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .bizhome-onboard-btn {
    width: 100%;
    min-height: 44px; /* 触控目标 ≥44px */
  }

  /* M-13 问题条：窄屏允许换行，动作按钮独占可点区域 */
  .bizhome-issue {
    flex-wrap: wrap;
  }

  .issue-go {
    margin-left: 0;
    min-height: 36px;
  }
}

/* M-08 暗色 */
html.dark .bizhome-onboard {
  background: #1e3a5f;
  border-color: #60a5fa;
}
html.dark .bizhome-onboard-title {
  color: #60a5fa;
}
html.dark .bizhome-onboard-desc {
  color: #d1d5db;
}
html.dark .bizhome-issue.info {
  background: #1f2937;
  border-color: #374151;
  color: #d1d5db;
}
html.dark .bizhome-issue.warn {
  color: #fcd34d;
  background: rgba(252, 211, 77, 0.12);
  border-color: rgba(252, 211, 77, 0.5);
}
html.dark .bizhome-empty-action {
  color: #60a5fa;
}

/* M-07 暗色 */
html.dark .bizhome-today {
  background: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}
html.dark .bizhome-today-title {
  color: var(--color-text, #f9fafb);
}
html.dark .bizhome-today-none {
  color: #fcd34d;
  background: rgba(252, 211, 77, 0.14);
  border-color: rgba(252, 211, 77, 0.5);
}
html.dark .bizhome-today-card {
  background: #111827;
  border-color: #374151;
}
html.dark .bizhome-today-card.clickable:hover {
  background: #1f2937;
}
html.dark .bizhome-today-card .today-value {
  color: var(--color-text, #f9fafb);
}
html.dark .bizhome-today-card .today-label,
html.dark .bizhome-today-card .today-sub {
  color: #9ca3af;
}
html.dark .bizhome-cumulative-toggle {
  border-color: #374151;
}

/* M-14 暗色：进度环内芯要用卡片底色，否则挖空处露出页面底色 */
html.dark .target-ring-inner {
  background: #111827;
  color: #f9fafb;
}
html.dark .target-amount {
  color: #f9fafb;
}
html.dark .target-sub.behind {
  color: #fbbf24;
}
</style>
