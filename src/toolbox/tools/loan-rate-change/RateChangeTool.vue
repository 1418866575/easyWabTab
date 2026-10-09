<script setup lang="ts">
/**
 * 利率变动还款计算器
 *
 * 场景：LPR 每年重定价、存量房贷转换、或转贷后利率变了。
 * 做法是「已还的按旧利率照算，剩下的按新利率重算」——
 * 已还部分不会因为利率变动而追溯调整，这一点必须与用户说清楚。
 */
import { computed, ref } from 'vue'
import { calcRateChange, type RepayMethod } from '../../core/loanExtra'
import { scheduleToCsv } from '../../core/loan'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const principal = ref(1000000)
const annualRate = ref(3.9)
const months = ref(360)
const method = ref<RepayMethod>('equalPayment')
/** 已按旧利率还了多少期 */
const paidMonths = ref(24)
const newRate = ref(3.5)

useDirtyFlag(() => Number(principal.value) > 0)
const { copy, save } = useToolActions()

const input = computed(() => ({
  principal: Number(principal.value) || 0,
  annualRate: Number(annualRate.value) || 0,
  months: Number(months.value) || 0,
  method: method.value,
  paidMonths: Number(paidMonths.value) || 0,
  newRate: Number(newRate.value) || 0
}))
const result = computed(() => calcRateChange(input.value))
const csv = computed(() => (result.value.newRows.length ? scheduleToCsv(result.value.newRows) : ''))

const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const signed = (n: number) => (n > 0 ? `+${money(n)}` : money(n))

const summaryText = computed(() => {
  const r = result.value
  if (!r.ok) return ''
  return [
    `原合同：${money(Number(principal.value))} 元 @ ${annualRate.value}% × ${months.value} 期（${method.value === 'equalPayment' ? '等额本息' : '等额本金'}）`,
    `已按 ${annualRate.value}% 还了 ${paidMonths.value} 期：已还本金 ${money(r.paidPrincipal)} 元、已还利息 ${money(r.paidInterest)} 元`,
    `变动时剩余本金：${money(r.remainPrincipal)} 元，剩余 ${r.remainMonths} 期`,
    `利率变动：${annualRate.value}% → ${newRate.value}%`,
    `新月供：${money(r.newMonthly)} 元（首期 ${money(r.newFirstPayment)} / 末期 ${money(r.newLastPayment)}）`,
    `剩余利息：${money(r.newRemainInterest)} 元（若利率不变为 ${money(r.oldRemainInterest)} 元）`,
    `利息变化：${signed(r.interestDelta)} 元`
  ].join('\n')
})
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="原贷款金额（元）">
        <input v-model.number="principal" type="number" min="0" class="tu-input" data-testid="tb-modal-input" />
      </TuField>

      <TuField label="原年利率（%）">
        <input v-model.number="annualRate" type="number" step="0.01" min="0" class="tu-input" />
      </TuField>

      <TuField label="原贷款期限（月）" :extra="`约 ${(Number(months) / 12).toFixed(1)} 年`">
        <input v-model.number="months" type="number" min="1" class="tu-input" />
        <div class="tu-row">
          <button type="button" class="tu-btn ghost" @click="months = 240">20 年</button>
          <button type="button" class="tu-btn ghost" @click="months = 360">30 年</button>
        </div>
      </TuField>

      <TuField label="还款方式">
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': method === 'equalPayment' }" @click="method = 'equalPayment'">等额本息</button>
          <button type="button" class="tu-check" :class="{ 'is-on': method === 'equalPrincipal' }" @click="method = 'equalPrincipal'">等额本金</button>
        </div>
      </TuField>

      <TuField label="已还期数（按旧利率）" hint="已还部分不追溯调整">
        <input v-model.number="paidMonths" type="number" min="0" class="tu-input" />
      </TuField>

      <TuField label="变动后年利率（%）">
        <input v-model.number="newRate" type="number" step="0.01" min="0" class="tu-input" />
        <div class="tu-row">
          <button type="button" class="tu-btn ghost" @click="newRate = 3.5">LPR 5 年期 3.50%</button>
          <button type="button" class="tu-btn ghost" @click="newRate = 3.0">3.00%</button>
        </div>
      </TuField>
    </div>

    <div>
      <p v-if="!result.ok" class="tu-alert">{{ result.error }}</p>

      <TuOutput title="变动结果" :text="summaryText" filename="rate-change-summary.txt" empty="填写参数后自动计算">
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!summaryText" @click="copy(summaryText)">复制</button>
        </template>
        <div class="tu-grid">
          <div class="tu-card">
            <div class="tu-card-title">新月供</div>
            <div class="tu-card-value">{{ money(result.newMonthly) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">剩余本金</div>
            <div class="tu-card-value">{{ money(result.remainPrincipal) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">剩余利息（新利率）</div>
            <div class="tu-card-value">{{ money(result.newRemainInterest) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">剩余利息（原利率）</div>
            <div class="tu-card-value">{{ money(result.oldRemainInterest) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">利息变化</div>
            <div class="tu-card-value">{{ signed(result.interestDelta) }}</div>
          </div>
        </div>
      </TuOutput>

      <TuOutput
        title="已还与剩余对照"
        :text="`已还本息 ${money(result.paidTotal)}\n剩余本息 ${money(result.newRemainPayment)}`"
        filename="rate-change-split.txt"
        empty="—"
      >
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>阶段</th>
                <th>本金</th>
                <th>利息</th>
                <th>本息合计</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>已还（{{ paidMonths }} 期）</td>
                <td>{{ money(result.paidPrincipal) }}</td>
                <td>{{ money(result.paidInterest) }}</td>
                <td>{{ money(result.paidTotal) }}</td>
              </tr>
              <tr>
                <td>剩余（{{ result.remainMonths }} 期）</td>
                <td>{{ money(result.remainPrincipal) }}</td>
                <td>{{ money(result.newRemainInterest) }}</td>
                <td>{{ money(result.newRemainPayment) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TuOutput>

      <TuOutput
        v-if="result.newRows.length"
        title="变动后还款计划"
        :text="csv"
        filename="rate-change-schedule.csv"
        mime="text/csv;charset=utf-8"
        empty="—"
      >
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!csv" @click="save('rate-change-schedule.csv', csv, 'text/csv;charset=utf-8')">下载 CSV</button>
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
              <tr v-for="r in result.newRows" :key="r.period">
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
            <li>已还的期数按旧利率照算，利率变动只影响「剩余本金 × 剩余期数」这一段。</li>
            <li>LPR 浮动利率贷款通常按年重定价，重定价日之前的月供不变。</li>
            <li>本工具假设变动后期限不变；若银行同时调整了期限，请用「提前还贷计算器」核算。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>
