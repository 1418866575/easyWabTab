<script setup lang="ts">
/**
 * 装修贷款计算器
 *
 * 算法与房贷完全一致（等额本息 / 等额本金），差别只在期限短、利率高：
 * 装修贷常见为 3～60 期，年利率通常显著高于房贷，故默认值与档位单独设置。
 */
import { computed, ref } from 'vue'
import { calcLoan, scheduleToCsv, type RepayMethod, type ScheduleRow } from '../../core/loan'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

/** 装修贷常见档位（期数, 文案） */
const TERM_PRESETS: { months: number; label: string }[] = [
  { months: 3, label: '3 个月' },
  { months: 6, label: '6 个月' },
  { months: 12, label: '1 年' },
  { months: 18, label: '1 年半' },
  { months: 24, label: '2 年' },
  { months: 36, label: '3 年' },
  { months: 48, label: '4 年' },
  { months: 60, label: '5 年' }
]

const principal = ref(100000)
const annualRate = ref(4.5)
const months = ref(24)
const method = ref<RepayMethod>('equalPayment')

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
        `装修贷款金额：${money(Number(principal.value))} 元`,
        `年利率：${annualRate.value}%`,
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

      <TuField label="年利率（%）" hint="装修贷利率通常高于房贷，请按银行实际报价填写">
        <input v-model.number="annualRate" type="number" step="0.01" min="0" class="tu-input" />
      </TuField>

      <TuField label="贷款期限（月）" :extra="`约 ${(Number(months) / 12).toFixed(1)} 年`">
        <input v-model.number="months" type="number" min="1" class="tu-input" />
        <div class="tu-row">
          <button
            v-for="t in TERM_PRESETS"
            :key="t.months"
            type="button"
            class="tu-btn ghost"
            @click="months = t.months"
          >{{ t.label }}</button>
        </div>
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

      <TuOutput title="还款概要" :text="summaryText" filename="decor-loan-summary.txt" empty="填写参数后自动计算">
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
          <div class="tu-card">
            <div class="tu-card-title">利息占本金</div>
            <div class="tu-card-value">
              {{ Number(principal) > 0 ? ((result.totalInterest / Number(principal)) * 100).toFixed(1) : '0' }}%
            </div>
          </div>
        </div>
      </TuOutput>

      <TuOutput
        title="两种方式对比"
        :text="`等额本息总利息 ${money(compare.equalPayment.totalInterest)}\n等额本金总利息 ${money(compare.equalPrincipal.totalInterest)}`"
        filename="decor-loan-compare.txt"
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
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>等额本息</td>
                <td>{{ money(compare.equalPayment.firstPayment) }}</td>
                <td>{{ money(compare.equalPayment.lastPayment) }}</td>
                <td>{{ money(compare.equalPayment.totalInterest) }}</td>
              </tr>
              <tr>
                <td>等额本金</td>
                <td>{{ money(compare.equalPrincipal.firstPayment) }}</td>
                <td>{{ money(compare.equalPrincipal.lastPayment) }}</td>
                <td>{{ money(compare.equalPrincipal.totalInterest) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TuOutput>

      <TuOutput title="还款计划明细" :text="csv" filename="decor-loan-schedule.csv" mime="text/csv;charset=utf-8" empty="—">
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!csv" @click="save('decor-loan-schedule.csv', csv, 'text/csv;charset=utf-8')">下载 CSV</button>
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
            <li>装修贷期限短、利率高，「利息占本金」这一项能直观看出资金成本。</li>
            <li>部分装修贷按「等额本息 + 手续费」收取，手续费未计入本工具，请自行加上。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>
