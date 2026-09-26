<script setup lang="ts">
// 统计报表：近 N 天营业额/成本/利润趋势图——每日一柱堆叠分色（盈利=成本琥珀底+利润绿顶、段高和=营业额；亏损=红段悬挂零下；顶部单标签，亏损日显负利润；全部/营业额/利润模式切换；坐标走 businessCore）
// P2-1：支出趋势叠加折线 + 分类营业额占比环形图 + 趋势柱下钻 + 支出分类占比
import { computed, ref } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import {
  businessTrendBars,
  calcBusinessTrend,
  calcExpenseCategoryBreakdown,
  calcExpenseTrend,
  calcCategoryRevenueBreakdown,
  calcMonthlyStats,
  compactAmount,
  formatYuanOf,
  localDateKey
} from '@/composables/businessCore'

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

// 趋势窗口：30 / 14 / 7 天切换；展示模式：全部（每日一柱堆叠分色）/ 仅营业额 / 仅利润
const TREND_W = 900
const TREND_H = 320
const trendDays = ref(30)
const trendMode = ref<'all' | 'revenue' | 'profit' | 'count'>('all')

const trendSeries = computed(() => calcBusinessTrend(data.value, localDateKey(), trendDays.value))
const trendScale = computed(() => businessTrendBars(trendSeries.value, TREND_W, TREND_H, trendMode.value))

// P2-1：支出趋势折线叠加
const PAD = 24
const expenseTrend = computed(() => calcExpenseTrend(data.value, localDateKey(), trendDays.value))

/** 支出折线 SVG points 字符串（使用趋势图同一 Y 标尺） */
const expenseLinePoints = computed<string>(() => {
  if (!trendScale.value || trendScale.value.allZero) return ''
  const { maxY, minY } = trendScale.value
  const span = maxY - minY || 1
  const innerH = TREND_H - PAD * 2
  return expenseTrend.value
    .map((pt, i) => {
      const day = trendScale.value!.days[i]
      const x = day ? day.x + day.w / 2 : 0
      const clampedExp = Math.max(minY, Math.min(maxY, pt.amount))
      const y = PAD + ((maxY - clampedExp) / span) * innerH
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

// P2-1：分类营业额占比环形图
const categoryBreakdown = computed(() => calcCategoryRevenueBreakdown(data.value))

// 环形图颜色
const DONUT_COLORS = ['#3b82f6', '#f59e0b', '#22c55e', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#64748b']
const DONUT_R = 60
const DONUT_CX = 80
const DONUT_CY = 80
const DONUT_CIRC = 2 * Math.PI * DONUT_R

/** 环形图各段 */
const donutSegments = computed(() => {
  return categoryBreakdown.value.map((cat, i) => {
    const offset = categoryBreakdown.value
      .slice(0, i)
      .reduce((s, c) => s + c.percent, 0)
    return {
      ...cat,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
      dashArray: `${(cat.percent / 100) * DONUT_CIRC} ${DONUT_CIRC}`,
      dashOffset: -(offset / 100) * DONUT_CIRC
    }
  })
})

// 支出分类占比
const expenseBreakdown = computed(() => calcExpenseCategoryBreakdown(data.value))

// ===== 近 12 个月（严格限定在当前账本年份的 12 个月，不跨年；无数据月份为 0） =====
const monthMode = ref<'revenue' | 'profit' | 'expense'>('revenue')
const ledgerYear = computed(() => store.currentLedgerYear)
const monthlyStats = computed(() => calcMonthlyStats(data.value, ledgerYear.value))
const monthBars = computed(() => {
  const valueOf = (m: { revenue: number; profit: number; expense: number }): number =>
    monthMode.value === 'revenue' ? m.revenue : monthMode.value === 'profit' ? m.profit : m.expense
  const max = Math.max(1, ...monthlyStats.value.map(m => Math.abs(valueOf(m))))
  return monthlyStats.value.map(m => {
    const value = valueOf(m)
    return { ...m, value, pct: (Math.abs(value) / max) * 100 }
  })
})
const monthModeLabel = computed(() =>
  monthMode.value === 'revenue' ? '营业额' : monthMode.value === 'profit' ? '利润' : '支出'
)
/** 12 个月合计（当前模式） */
const monthTotal = computed(() => Math.round(monthBars.value.reduce((s, b) => s + b.value, 0) * 100) / 100)
</script>

<template>
  <div class="bizstats">
    <div class="bizstats-main">
    <!-- 趋势图 -->
    <section class="bizstats-card bizstats-trend-section" data-testid="bizstats-trend">
      <div class="bizstats-head">
        <h3>近 {{ trendDays }} 天经营趋势 · 每日一柱</h3>
        <div class="bizstats-head-btns">
          <div class="bizstats-days">
            <el-radio-group v-model="trendDays" size="small">
              <el-radio-button :value="7" data-testid="bizstats-days-7">7 天</el-radio-button>
              <el-radio-button :value="14" data-testid="bizstats-days-14">14 天</el-radio-button>
              <el-radio-button :value="30" data-testid="bizstats-days-30">30 天</el-radio-button>
            </el-radio-group>
          </div>
          <div class="bizstats-days">
            <el-radio-group v-model="trendMode" size="small">
              <el-radio-button value="all" data-testid="bizstats-mode-all">全部</el-radio-button>
              <el-radio-button value="revenue" data-testid="bizstats-mode-revenue">营业额</el-radio-button>
              <el-radio-button value="profit" data-testid="bizstats-mode-profit">利润</el-radio-button>
              <el-radio-button value="count" data-testid="bizstats-mode-count">交易笔数</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </div>
      <div v-if="trendScale && !trendScale.allZero" class="bizstats-svg-wrap">
        <svg :viewBox="'0 0 ' + TREND_W + ' ' + TREND_H" class="bizstats-svg">
          <!-- 网格线 -->
          <g>
            <line v-for="(g, gi) in trendScale.gridlines" :key="'gl' + gi" class="bizstats-gridline" x1="24" :x2="TREND_W - 24" :y1="g.y" :y2="g.y" />
            <text v-for="(g, gi) in trendScale.gridlines" :key="'glt' + gi" class="bizstats-axis" x="6" :y="g.y + 4" font-size="11">{{ g.label }}</text>
          </g>
          <!-- 零基线（亏损红段悬挂其下） -->
          <line class="bizstats-zero" x1="24" :x2="TREND_W - 24" :y1="trendScale.zeroY" :y2="trendScale.zeroY" />
          <!-- 每日一柱（堆叠分色：盈利 成本琥珀+利润绿 / 亏损 红段悬挂零下；非零段才渲染） -->
          <g
            v-for="d in trendScale.days"
            :key="d.date"
            class="bizstats-bar-group"
          >
            <rect
              v-for="s in d.segs"
              :key="d.date + '-' + s.key"
              class="bizstats-bar"
              :class="s.key"
              :x="s.x"
              :y="s.y"
              :width="s.w"
              :height="s.h"
              :rx="s.h >= 4 ? 2 : 0"
            />
            <text
              v-if="d.segs.length > 0"
              class="bizstats-bar-label"
              :x="d.labelX"
              :y="d.labelY"
              font-size="10"
              text-anchor="middle"
            >{{ trendMode === 'count' ? (d.labelValue + '笔') : compactAmount(d.labelValue) }}</text>
          </g>
          <!-- P2-1：支出趋势折线叠加 -->
          <polyline
            v-if="expenseLinePoints && trendMode !== 'count'"
            class="bizstats-expense-line"
            :points="expenseLinePoints"
            fill="none"
          />
          <!-- 日期刻度 -->
          <text v-for="(l, li) in trendScale.dayLabels" :key="'d' + li" class="bizstats-axis" :x="l.x" :y="TREND_H - 6" font-size="11" text-anchor="middle">{{ l.label }}</text>
        </svg>
        <div class="bizstats-legend">
          <template v-if="trendMode === 'count'">
            <span class="bizstats-legend-item"><i class="dot count"></i>交易笔数</span>
          </template>
          <template v-else>
            <span class="bizstats-legend-item"><i class="dot revenue"></i>营业额</span>
            <span class="bizstats-legend-item"><i class="dot cost"></i>成本</span>
            <span class="bizstats-legend-item"><i class="dot profit"></i>利润</span>
            <span class="bizstats-legend-item"><i class="dot loss"></i>亏损</span>
            <span class="bizstats-legend-item"><i class="dot expense"></i>支出</span>
          </template>
        </div>
      </div>
      <p v-else class="bizstats-empty bizstats-empty-trend" data-testid="bizstats-trend-empty">暂无趋势数据，先添加进货与收摊记录吧</p>
    </section>

    <!-- 右侧：支出占比（上）+ 营业额占比（下），垂直排列 -->
    <div class="bizstats-pies">
      <!-- 支出占比 -->
      <section class="bizstats-card" data-testid="bizstats-expense-pie">
        <h3>支出占比</h3>
        <div v-if="expenseBreakdown.length === 0" class="bizstats-empty">暂无支出数据</div>
        <div v-else class="bizstats-pie-wrap">
          <svg :viewBox="`0 0 ${DONUT_CX * 2} ${DONUT_CY * 2}`" class="bizstats-donut">
            <circle :cx="DONUT_CX" :cy="DONUT_CY" :r="DONUT_R" fill="none" :stroke="'var(--color-bg-card, var(--color-bg-hover))'" :stroke-width="16" />
            <circle
              v-for="(seg, i) in expenseBreakdown"
              :key="seg.categoryId"
              :cx="DONUT_CX"
              :cy="DONUT_CY"
              :r="DONUT_R"
              fill="none"
              :stroke="DONUT_COLORS[i % DONUT_COLORS.length]"
              :stroke-width="16"
              :stroke-dasharray="`${(seg.percent / 100) * DONUT_CIRC} ${DONUT_CIRC}`"
              :stroke-dashoffset="-((expenseBreakdown.slice(0, i).reduce((s, c) => s + c.percent, 0)) / 100) * DONUT_CIRC"
              transform="rotate(-90, 80, 80)"
            />
            <text :x="DONUT_CX" :y="DONUT_CY - 4" text-anchor="middle" font-size="11" fill="var(--color-text-muted)">总支出</text>
            <text :x="DONUT_CX" :y="DONUT_CY + 14" text-anchor="middle" font-size="14" font-weight="700" fill="var(--color-text)">{{ compactAmount(expenseBreakdown.reduce((s, c) => s + c.amount, 0)) }}</text>
          </svg>
          <div class="bizstats-pie-legend">
            <div v-for="(seg, i) in expenseBreakdown" :key="seg.categoryId" class="bizstats-pie-legend-item">
              <i class="dot" :style="{ background: DONUT_COLORS[i % DONUT_COLORS.length] }"></i>
              <span class="bizstats-pie-legend-name">{{ seg.name }}</span>
              <span class="bizstats-pie-legend-val">{{ seg.percent }}%</span>
              <span class="bizstats-pie-legend-rev">{{ formatYuanOf(seg.amount) }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 营业占比 -->
      <section class="bizstats-card" data-testid="bizstats-cat-pie">
        <h3>营业占比</h3>
        <div v-if="categoryBreakdown.length === 0" class="bizstats-empty">暂无数据</div>
        <div v-else class="bizstats-pie-wrap">
          <svg :viewBox="`0 0 ${DONUT_CX * 2} ${DONUT_CY * 2}`" class="bizstats-donut">
            <circle :cx="DONUT_CX" :cy="DONUT_CY" :r="DONUT_R" fill="none" :stroke="'var(--color-bg-card, var(--color-bg-hover))'" :stroke-width="16" />
            <circle
              v-for="seg in donutSegments"
              :key="seg.categoryId"
              :cx="DONUT_CX"
              :cy="DONUT_CY"
              :r="DONUT_R"
              fill="none"
              :stroke="seg.color"
              :stroke-width="16"
              :stroke-dasharray="seg.dashArray"
              :stroke-dashoffset="seg.dashOffset"
              transform="rotate(-90, 80, 80)"
            />
            <text :x="DONUT_CX" :y="DONUT_CY - 4" text-anchor="middle" font-size="11" fill="var(--color-text-muted)">总营业额</text>
            <text :x="DONUT_CX" :y="DONUT_CY + 14" text-anchor="middle" font-size="14" font-weight="700" fill="var(--color-text)">{{ compactAmount(categoryBreakdown.reduce((s, c) => s + c.revenue, 0)) }}</text>
          </svg>
          <div class="bizstats-pie-legend">
            <div v-for="seg in donutSegments" :key="seg.categoryId" class="bizstats-pie-legend-item">
              <i class="dot" :style="{ background: seg.color }"></i>
              <span class="bizstats-pie-legend-name">{{ seg.name }}</span>
              <span class="bizstats-pie-legend-val">{{ seg.percent }}%</span>
              <span class="bizstats-pie-legend-rev">{{ formatYuanOf(seg.revenue) }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
    </div>

    <!-- 近 12 个月：范围严格限定在当前账本年份内的 12 个月（不跨年），未产生数据的月份以 0 展示 -->
    <section class="bizstats-card bizstats-monthly" data-testid="bizstats-monthly">
      <div class="bizstats-head">
        <h3>{{ ledgerYear }} 年 12 个月{{ monthModeLabel }}（不跨年，无数据月份记 0）</h3>
        <div class="bizstats-days">
          <el-radio-group v-model="monthMode" size="small">
            <el-radio-button value="revenue" data-testid="bizstats-month-revenue">营业额</el-radio-button>
            <el-radio-button value="profit" data-testid="bizstats-month-profit">利润</el-radio-button>
            <el-radio-button value="expense" data-testid="bizstats-month-expense">支出</el-radio-button>
          </el-radio-group>
        </div>
      </div>
      <div class="bizstats-month-bars" data-testid="bizstats-month-bars">
        <div
          v-for="m in monthBars"
          :key="m.month"
          class="bizstats-month-col"
          :class="{ negative: m.value < 0 }"
          :data-testid="`bizstats-month-${m.month}`"
          :title="`${m.label}：${monthModeLabel} ${formatYuanOf(m.value)}｜营业额 ${formatYuanOf(m.revenue)}｜成本 ${formatYuanOf(m.cost)}｜支出 ${formatYuanOf(m.expense)}｜${m.transactionCount} 笔`"
        >
          <span class="bizstats-month-value">{{ compactAmount(m.value) }}</span>
          <div class="bizstats-month-track">
            <div class="bizstats-month-bar" :style="{ height: m.pct + '%' }"></div>
          </div>
          <span class="bizstats-month-label">{{ m.label }}</span>
        </div>
      </div>
      <p class="bizstats-month-total" data-testid="bizstats-month-total">
        全年{{ monthModeLabel }}合计：{{ formatYuanOf(monthTotal) }}（共 {{ monthlyStats.reduce((s, m) => s + m.days, 0) }} 天收摊记录）
      </p>
    </section>
  </div>
</template>

<style scoped>
.bizstats {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

/* 布局：趋势图 70% + 环形图 30%，左右排列；高度对齐 */
.bizstats-main {
  display: flex;
  gap: 16px;
  align-items: stretch;
}

.bizstats-trend-section {
  flex: 7 1 0;
  min-width: 0;
}

/* ===== 近 12 个月（限定当前年份，不跨年；空月为 0） ===== */
.bizstats-monthly {
  margin-top: 4px;
}

.bizstats-month-bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 180px;
  padding: 16px 4px 0;
}

.bizstats-month-col {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.bizstats-month-value {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary, #6b7280);
  white-space: nowrap;
}

/* 柱轨道：占满列内剩余高度，柱子按百分比从底部生长（0 值月份仅剩 2px 底座） */
.bizstats-month-track {
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.bizstats-month-bar {
  width: 100%;
  max-width: 40px;
  min-height: 2px;
  border-radius: 4px 4px 0 0;
  background: linear-gradient(180deg, var(--color-primary, #3b82f6), color-mix(in srgb, var(--color-primary, #3b82f6) 55%, transparent));
  transition: height var(--transition-fast, 0.3s ease);
}

.bizstats-month-col.negative .bizstats-month-bar {
  background: linear-gradient(180deg, var(--color-danger, #ef4444), color-mix(in srgb, var(--color-danger, #ef4444) 55%, transparent));
}

.bizstats-month-label {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-text-muted, #9ca3af);
}

.bizstats-month-total {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

.bizstats-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.bizstats-card h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizstats-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bizstats-head h3 {
  margin: 0;
}

.bizstats-head-btns {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.bizstats-days {
  display: flex;
  gap: 6px;
}

.bizstats-btn {
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-full, 999px);
  transition: all var(--transition-fast, 0.15s ease);
}

.bizstats-btn.active {
  color: #fff;
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.bizstats-svg-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bizstats-svg {
  display: block;
  width: 100%;
  height: auto;
}

.bizstats-gridline {
  stroke: var(--color-border, #e2e8f0);
  stroke-dasharray: 4 4;
}

.bizstats-zero {
  stroke: var(--color-text-muted, #94a3b8);
  stroke-width: 1;
}

.bizstats-axis {
  fill: var(--color-text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.bizstats-bar.revenue {
  fill: var(--color-primary, var(--color-primary));
}

.bizstats-bar.cost {
  fill: #f59e0b;
}

.bizstats-bar.profit {
  fill: var(--color-success, var(--color-success));
}

.bizstats-bar.loss {
  fill: var(--danger-color, #ef4444);
}

.bizstats-bar.count {
  fill: var(--color-primary, #3b82f6);
}

.bizstats-bar-label {
  fill: var(--color-text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.bizstats-legend {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizstats-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.bizstats-legend-item .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.dot.revenue {
  background: var(--color-primary, var(--color-primary));
}

.dot.cost {
  background: #f59e0b;
}

.dot.profit {
  background: var(--color-success, var(--color-success));
}

.dot.loss {
  background: var(--danger-color, #ef4444);
}

.dot.count {
  background: var(--color-primary, #3b82f6);
}

/* P2-1：支出趋势折线 */
.bizstats-expense-line {
  stroke: var(--danger-color, #ef4444);
  stroke-width: 2;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
  opacity: 0.8;
}

/* 右侧环形图区域：垂直排列，占 30% 宽度，高度撑满与左侧柱状图对齐 */
.bizstats-pies {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 3 1 0;
  min-width: 0;
  min-height: 0;
}

/* 每个环形图卡片均匀分配高度 */
.bizstats-pies > .bizstats-card {
  flex: 1 1 0;
  min-height: 0;
}

.bizstats-pie-wrap {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.bizstats-donut {
  flex-shrink: 0;
  width: 100px;
  height: 100px;
}

.bizstats-pie-legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.bizstats-pie-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizstats-pie-legend-item .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.bizstats-pie-legend-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizstats-pie-legend-val {
  font-weight: 600;
  color: var(--color-text, var(--color-text-primary));
  font-variant-numeric: tabular-nums;
}

.bizstats-pie-legend-rev {
  color: var(--color-text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
}

.bizstats-empty {
  margin: 0;
  padding: 20px 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-muted, var(--color-text-muted));
  /* 无数据时保持占位高度、内容垂直居中，避免页面折叠 */
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

/* 趋势图占位：与 .bizstats-svg 同宽高比（viewBox 900×320 + width:100%/height:auto），
   无数据时高度与有数据时一致，不再塌陷 */
.bizstats-empty-trend {
  aspect-ratio: 900 / 320;
}

/* 环形图卡片占位：撑满卡片剩余高度（对齐有数据时的 .bizstats-pie-wrap） */
.bizstats-pies .bizstats-empty {
  flex: 1;
  min-height: 100px;
}

html.dark .bizstats-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .bizstats-btn {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .bizstats-bar.cost {
  fill: #fbbf24;
}

html.dark .bizstats-bar.profit {
  fill: #4ade80;
}

html.dark .bizstats-bar.count {
  fill: #60a5fa;
}

html.dark .bizstats-bar.loss {
  fill: #f87171;
}

html.dark .dot.loss {
  background: #f87171;
}

html.dark .bizstats-expense-line {
  stroke: #f87171;
}

html.dark .dot.expense {
  background: #f87171;
}

/* 响应式：窄屏整体纵向排列，环形图内部也纵向 */
@media (max-width: 768px) {
  .bizstats-main {
    flex-direction: column;
    align-items: stretch;
  }

  .bizstats-trend-section,
  .bizstats-pies {
    flex: 1 1 auto;
  }

  /* 纵向排列时取消高度强制，避免拉伸过度 */
  .bizstats-pies > .bizstats-card {
    flex: 0 1 auto;
  }
}

@media (max-width: 640px) {
  .bizstats-pie-wrap {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
