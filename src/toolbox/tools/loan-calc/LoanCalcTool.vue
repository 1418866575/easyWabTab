<script setup lang="ts">
/**
 * 贷款 / 房贷计算器（等额本息 / 等额本金 / 提前还款模拟）
 */
import { computed, ref } from 'vue'
import { calcLoan, compareMethods, scheduleToCsv, yearlyInterest, yearlyToCsv, type RepayMethod, type ScheduleRow, type YearRow } from '../../core/loan'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const principal = ref(1000000)
const annualRate = ref(3.5)
const months = ref(360)
const method = ref<RepayMethod>('equalPayment')
const prepayOn = ref(false)
const prepayAmount = ref(200000)
const prepayAt = ref(12)
const prepayMode = ref<'reducePayment' | 'shortenTerm'>('reducePayment')

useDirtyFlag(() => Number(principal.value) > 0)
const { copy, save } = useToolActions()

const loanInput = computed(() => ({
  principal: Number(principal.value) || 0,
  annualRate: Number(annualRate.value) || 0,
  months: Number(months.value) || 0,
  method: method.value,
  prepay: prepayOn.value
    ? { amount: Number(prepayAmount.value) || 0, atMonth: Number(prepayAt.value) || 1, mode: prepayMode.value }
    : undefined
}))

const result = computed(() => calcLoan(loanInput.value))
const compare = computed(() => compareMethods({
  principal: Number(principal.value) || 0,
  annualRate: Number(annualRate.value) || 0,
  months: Number(months.value) || 0
}))

const rows = computed<ScheduleRow[]>(() => result.value.ok ? result.value.rows : [])
const csv = computed(() => (rows.value.length ? scheduleToCsv(rows.value) : ''))

/** 年度统计：累计已还利息（含占比）+ 当年实际支付利息，数据源与还款明细一致 */
const yearRows = computed<YearRow[]>(() =>
  result.value.ok ? yearlyInterest(rows.value, result.value.totalInterest, Number(months.value) || undefined) : []
)
const yearlyCsv = computed(() => (yearRows.value.length ? yearlyToCsv(yearRows.value) : ''))

const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
/** 累计占比：保留 2 位小数 */
const percent = (n: number) => `${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

const summaryText = computed(() =>
  result.value.ok
    ? [
        `还款方式：${method.value === 'equalPayment' ? '等额本息' : '等额本金'}`,
        `贷款金额：${money(Number(principal.value))} 元`,
        `年利率：${annualRate.value}%`,
        `期限：${months.value} 期（${(Number(months.value) / 12).toFixed(1)} 年）`,
        `月供（首期）：${money(result.value.firstPayment)} 元`,
        `末期月供：${money(result.value.lastPayment)} 元`,
        `总利息：${money(result.value.totalInterest)} 元`,
        `本息合计：${money(result.value.totalPayment)} 元`,
        prepayOn.value ? `提前还款节省利息：${money(result.value.savedInterest)} 元` : ''
      ]
        .filter(Boolean)
        .join('\n')
    : ''
)
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="贷款金额（元）">
        <input v-model.number="principal" type="number" min="0" class="tu-input" data-testid="tb-modal-input" />
      </TuField>

      <TuField label="年利率（%）">
        <input v-model.number="annualRate" type="number" step="0.01" min="0" class="tu-input" />
      </TuField>

      <TuField label="贷款期限（月）" :extra="`约 ${(Number(months) / 12).toFixed(1)} 年`">
        <input v-model.number="months" type="number" min="1" class="tu-input" />
        <div class="tu-row">
          <button type="button" class="tu-btn ghost" @click="months = 120">10 年</button>
          <button type="button" class="tu-btn ghost" @click="months = 240">20 年</button>
          <button type="button" class="tu-btn ghost" @click="months = 360">30 年</button>
        </div>
      </TuField>

      <TuField label="还款方式">
        <div class="tu-toolbar">
          <button
            type="button"
            class="tu-check"
            :class="{ 'is-on': method === 'equalPayment' }"
            @click="method = 'equalPayment'"
          >等额本息</button>
          <button
            type="button"
            class="tu-check"
            :class="{ 'is-on': method === 'equalPrincipal' }"
            @click="method = 'equalPrincipal'"
          >等额本金</button>
        </div>
      </TuField>

      <TuField label="提前还款">
        <div class="tu-row">
          <button type="button" class="tu-check" :class="{ 'is-on': prepayOn }" @click="prepayOn = !prepayOn">
            模拟提前还款
          </button>
        </div>
        <template v-if="prepayOn">
          <div class="tu-row">
            <span class="tu-label">金额</span>
            <input v-model.number="prepayAmount" type="number" min="0" class="tu-input tu-inline" style="max-width: 140px" />
            <span class="tu-label">第几期后</span>
            <input v-model.number="prepayAt" type="number" min="1" class="tu-input tu-inline" style="max-width: 110px" />
          </div>
          <div class="tu-row">
            <button
              type="button"
              class="tu-check"
              :class="{ 'is-on': prepayMode === 'reducePayment' }"
              @click="prepayMode = 'reducePayment'"
            >减少月供</button>
            <button
              type="button"
              class="tu-check"
              :class="{ 'is-on': prepayMode === 'shortenTerm' }"
              @click="prepayMode = 'shortenTerm'"
            >缩短期限</button>
          </div>
        </template>
      </TuField>
    </div>

    <div>
      <p v-if="!result.ok" class="tu-alert">{{ result.error }}</p>

      <TuOutput title="还款概要" :text="summaryText" filename="loan-summary.txt" empty="填写参数后自动计算">
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!summaryText" @click="copy(summaryText)">复制</button>
        </template>
        <div class="tu-grid">
          <div class="tu-card">
            <div class="tu-card-title">月供（首期）</div>
            <div class="tu-card-value">{{ money(result.firstPayment) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">总利息</div>
            <div class="tu-card-value">{{ money(result.totalInterest) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">本息合计</div>
            <div class="tu-card-value">{{ money(result.totalPayment) }}</div>
          </div>
          <div class="tu-card" v-if="prepayOn">
            <div class="tu-card-title">提前还款省息</div>
            <div class="tu-card-value">{{ money(result.savedInterest) }}</div>
          </div>
        </div>
      </TuOutput>

      <TuOutput title="两种方式对比" :text="`等额本息总利息 ${money(compare.equalPayment.totalInterest)}\n等额本金总利息 ${money(compare.equalPrincipal.totalInterest)}`" filename="loan-compare.txt" empty="—">
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>方式</th>
                <th>月供（首期）</th>
                <th>总利息</th>
                <th>本息合计</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>等额本息</td>
                <td>{{ money(compare.equalPayment.firstPayment) }}</td>
                <td>{{ money(compare.equalPayment.totalInterest) }}</td>
                <td>{{ money(compare.equalPayment.totalPayment) }}</td>
              </tr>
              <tr>
                <td>等额本金</td>
                <td>{{ money(compare.equalPrincipal.firstPayment) }}</td>
                <td>{{ money(compare.equalPrincipal.totalInterest) }}</td>
                <td>{{ money(compare.equalPrincipal.totalPayment) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TuOutput>

      <TuOutput
        title="还款计划明细"
        :text="csv"
        filename="loan-schedule.csv"
        mime="text/csv;charset=utf-8"
        empty="—"
      >
        <template #actions>
          <button
            type="button"
            class="tu-btn ghost"
            :disabled="!csv"
            @click="save('loan-schedule.csv', csv, 'text/csv;charset=utf-8')"
          >下载 CSV</button>
        </template>
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>期数</th>
                <th>月供</th>
                <th>本金</th>
                <th>利息</th>
                <th>剩余本金</th>
                <th v-if="prepayOn">提前还款</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.period">
                <td>{{ r.period }}</td>
                <td>{{ money(r.payment) }}</td>
                <td>{{ money(r.principal) }}</td>
                <td>{{ money(r.interest) }}</td>
                <td>{{ money(r.balance) }}</td>
                <td v-if="prepayOn">{{ r.prepaid ? money(r.prepaid) : '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TuOutput>

      <TuOutput
        title="年度统计"
        :text="yearlyCsv"
        filename="loan-yearly.csv"
        mime="text/csv;charset=utf-8"
        empty="—"
      >
        <template #actions>
          <button
            type="button"
            class="tu-btn ghost"
            :disabled="!yearlyCsv"
            @click="save('loan-yearly.csv', yearlyCsv, 'text/csv;charset=utf-8')"
          >下载 CSV</button>
        </template>
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>年份</th>
                <th>期数区间</th>
                <th>当年已还利息</th>
                <th>累计已还利息</th>
                <th>累计占总利息</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="y in yearRows" :key="y.year">
                <td>
                  第 {{ y.year }} 年
                  <span v-if="y.partial" class="ly-partial" title="该年度未还清">部分年度</span>
                </td>
                <td>{{ y.periodRange }} 期</td>
                <td>{{ money(y.yearInterest) }}</td>
                <td>{{ money(y.cumInterest) }}</td>
                <td>{{ percent(y.cumPercent) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="yearRows.some(y => y.partial)" class="tu-hint" style="margin-top: 8px">
          注：标注为「部分年度」的年份表示该年未还清（含提前还款缩短期限导致的最后一年不满 12 期）。
        </p>
      </TuOutput>

      <details class="tu-folding">
        <summary>使用说明</summary>
        <div class="tu-folding-body">
          <ol>
            <li>填写金额、年利率与期限后自动计算，并同时给出两种方式对比。</li>
            <li>提前还款支持「减少月供」与「缩短期限」两种策略，并计算节省的利息。</li>
            <li>完整还款计划可导出 CSV，便于在表格中继续分析。</li>
            <li>年度统计中，「当年已还利息」为该年度各期利息之和；「累计已还利息」为第 1 至第 N 年逐年叠加，并显示其占总利息的百分比。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.ly-partial {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
</style>
