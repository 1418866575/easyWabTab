<script setup lang="ts">
/**
 * 公积金贷款计算器
 *
 * 与商业贷款计算器的差别只有利率来源：公积金利率由「第几套房 + 期限档」决定
 * （5 年以下(含 5 年) / 5 年以上），因此本工具把这四项做成联动选择，
 * 利率自动带出、也允许手动覆盖（各地会有小幅浮动）。
 */
import { computed, ref, watch } from 'vue'
import { calcLoan, scheduleToCsv, type RepayMethod, type ScheduleRow } from '../../core/loan'
import { GJJ_RATE_INFO } from '../../core/loanExtra'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

/** 期限档：5 年以下（含 5 年） / 5 年以上 */
type TermTier = 'short' | 'long'
/** 第几套房 */
type HouseOrder = 'first' | 'second'

const principal = ref(600000)
const months = ref(360)
const order = ref<HouseOrder>('first')
const tier = ref<TermTier>('long')
/** 利率覆盖：null 表示跟随上方选择自动带出 */
const rateOverride = ref<number | null>(null)
const method = ref<RepayMethod>('equalPayment')

/** 按套数 + 期限档取公积金基准利率（%） */
function rateOf(o: HouseOrder, t: TermTier): number {
  const row = GJJ_RATE_INFO.rows.find(r => (t === 'short' ? r.term.includes('5 年以下') : r.term.includes('5 年以上')))
  if (!row) return 2.6
  return o === 'first' ? row.rate : (row.rate2 ?? row.rate)
}

const autoRate = computed(() => rateOf(order.value, tier.value))
const annualRate = computed(() => (rateOverride.value === null ? autoRate.value : rateOverride.value))
/**
 * 利率输入框的可写绑定：读取时取「自动带出值 / 手动覆盖值」，
 * 写入时记为手动覆盖（rateOverride 非 null 即代表用户改过）。
 */
const annualRateProxy = computed({
  get: () => annualRate.value,
  set: (v: number) => {
    rateOverride.value = Number.isFinite(v) && v >= 0 ? v : null
  }
})
/** 期限档随期数自动切换，用户也可手动改 */
watch(months, (m) => {
  tier.value = Number(m) <= 60 ? 'short' : 'long'
})

function resetRate() {
  rateOverride.value = null
}

useDirtyFlag(() => Number(principal.value) > 0)
const { copy, save } = useToolActions()

const input = computed(() => ({
  principal: Number(principal.value) || 0,
  annualRate: Number(annualRate.value) || 0,
  months: Number(months.value) || 0,
  method: method.value
}))
const result = computed(() => calcLoan(input.value))
const rows = computed<ScheduleRow[]>(() => (result.value.ok ? result.value.rows : []))
const csv = computed(() => (rows.value.length ? scheduleToCsv(rows.value) : ''))

const compare = computed(() => ({
  equalPayment: calcLoan({ ...input.value, method: 'equalPayment' }),
  equalPrincipal: calcLoan({ ...input.value, method: 'equalPrincipal' })
}))

const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })

const summaryText = computed(() =>
  result.value.ok
    ? [
        `贷款类型：住房公积金（${order.value === 'first' ? '首套' : '二套'}）`,
        `贷款金额：${money(Number(principal.value))} 元`,
        `年利率：${annualRate.value}%（${tier.value === 'short' ? '5 年以下(含 5 年)' : '5 年以上'}档）`,
        `期限：${months.value} 期（${(Number(months.value) / 12).toFixed(1)} 年）`,
        `还款方式：${method.value === 'equalPayment' ? '等额本息' : '等额本金'}`,
        `月供（首期）：${money(result.value.firstPayment)} 元`,
        `末期月供：${money(result.value.lastPayment)} 元`,
        `总利息：${money(result.value.totalInterest)} 元`,
        `本息合计：${money(result.value.totalPayment)} 元`
      ].join('\n')
    : ''
)
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="贷款金额（元）">
        <input v-model.number="principal" type="number" min="0" class="tu-input" data-testid="tb-modal-input" />
      </TuField>

      <TuField label="第几套房" hint="首套与二套的公积金利率不同">
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': order === 'first' }" @click="order = 'first'">首套住房</button>
          <button type="button" class="tu-check" :class="{ 'is-on': order === 'second' }" @click="order = 'second'">二套住房</button>
        </div>
      </TuField>

      <TuField label="贷款期限（月）" :extra="`约 ${(Number(months) / 12).toFixed(1)} 年`">
        <input v-model.number="months" type="number" min="1" class="tu-input" />
        <div class="tu-row">
          <button type="button" class="tu-btn ghost" @click="months = 60">5 年</button>
          <button type="button" class="tu-btn ghost" @click="months = 120">10 年</button>
          <button type="button" class="tu-btn ghost" @click="months = 240">20 年</button>
          <button type="button" class="tu-btn ghost" @click="months = 360">30 年</button>
        </div>
        <div class="tu-row">
          <button type="button" class="tu-check" :class="{ 'is-on': tier === 'short' }" @click="tier = 'short'">5 年以下（含 5 年）</button>
          <button type="button" class="tu-check" :class="{ 'is-on': tier === 'long' }" @click="tier = 'long'">5 年以上</button>
        </div>
      </TuField>

      <TuField label="贷款利率（%）" :extra="rateOverride === null ? '自动带出' : '手动覆盖'">
        <div class="tu-row">
          <input v-model.number="annualRateProxy" type="number" step="0.001" min="0" class="tu-input tu-inline" />
          <button type="button" class="tu-btn ghost" :disabled="rateOverride === null" @click="resetRate">恢复默认</button>
        </div>
        <p class="tu-hint">
          公积金基准（{{ GJJ_RATE_INFO.updatedAt }} 更新）：首套 {{ tier === 'short' ? '2.1' : '2.60' }}%、二套 {{ tier === 'short' ? '2.525' : '3.075' }}%
        </p>
      </TuField>

      <TuField label="还款方式">
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': method === 'equalPayment' }" @click="method = 'equalPayment'">等额本息</button>
          <button type="button" class="tu-check" :class="{ 'is-on': method === 'equalPrincipal' }" @click="method = 'equalPrincipal'">等额本金</button>
        </div>
      </TuField>
    </div>

    <div>
      <p v-if="!result.ok" class="tu-alert">{{ result.error }}</p>

      <TuOutput title="还款概要" :text="summaryText" filename="gjj-loan-summary.txt" empty="填写参数后自动计算">
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!summaryText" @click="copy(summaryText)">复制</button>
        </template>
        <div class="tu-grid">
          <div class="tu-card">
            <div class="tu-card-title">月供（首期）</div>
            <div class="tu-card-value">{{ money(result.firstPayment) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">年利率</div>
            <div class="tu-card-value">{{ annualRate }}%</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">总利息</div>
            <div class="tu-card-value">{{ money(result.totalInterest) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">本息合计</div>
            <div class="tu-card-value">{{ money(result.totalPayment) }}</div>
          </div>
        </div>
      </TuOutput>

      <TuOutput
        title="两种方式对比"
        :text="`等额本息总利息 ${money(compare.equalPayment.totalInterest)}\n等额本金总利息 ${money(compare.equalPrincipal.totalInterest)}`"
        filename="gjj-loan-compare.txt"
        empty="—"
      >
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>方式</th>
                <th>月供（首期）</th>
                <th>末期月供</th>
                <th>总利息</th>
                <th>本息合计</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>等额本息</td>
                <td>{{ money(compare.equalPayment.firstPayment) }}</td>
                <td>{{ money(compare.equalPayment.lastPayment) }}</td>
                <td>{{ money(compare.equalPayment.totalInterest) }}</td>
                <td>{{ money(compare.equalPayment.totalPayment) }}</td>
              </tr>
              <tr>
                <td>等额本金</td>
                <td>{{ money(compare.equalPrincipal.firstPayment) }}</td>
                <td>{{ money(compare.equalPrincipal.lastPayment) }}</td>
                <td>{{ money(compare.equalPrincipal.totalInterest) }}</td>
                <td>{{ money(compare.equalPrincipal.totalPayment) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TuOutput>

      <TuOutput title="还款计划明细" :text="csv" filename="gjj-loan-schedule.csv" mime="text/csv;charset=utf-8" empty="—">
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!csv" @click="save('gjj-loan-schedule.csv', csv, 'text/csv;charset=utf-8')">下载 CSV</button>
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
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.period">
                <td>{{ r.period }}</td>
                <td>{{ money(r.payment) }}</td>
                <td>{{ money(r.principal) }}</td>
                <td>{{ money(r.interest) }}</td>
                <td>{{ money(r.balance) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TuOutput>

      <details class="tu-folding">
        <summary>使用说明</summary>
        <div class="tu-folding-body">
          <ol>
            <li>选择首套 / 二套与期限后，利率会自动带出；各地如有浮动可手动覆盖，点「恢复默认」还原。</li>
            <li>公积金贷款额度由各地公积金中心核定，本工具只按「申请到的额度」计算月供。</li>
            <li>利率数据为内置静态数据（{{ GJJ_RATE_INFO.updatedAt }} 更新），以当地公积金中心公布为准。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>
