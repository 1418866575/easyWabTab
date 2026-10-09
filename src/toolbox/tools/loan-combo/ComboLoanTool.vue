<script setup lang="ts">
/**
 * 组合贷款计算器
 *
 * 商贷与公积金是两笔独立合同：各自按自己的利率生成还款计划，
 * 本工具只负责把它们逐期相加，得到「每月实际掏多少钱」。
 * 因此不能简单用「总金额 × 平均利率」估算——那会算错月供。
 */
import { computed, ref } from 'vue'
import { calcCombo, comboToCsv, comboRowsToText, type ComboRow, type RepayMethod } from '../../core/loanExtra'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const commercialPrincipal = ref(700000)
const commercialRate = ref(3.5)
const providentPrincipal = ref(300000)
const providentRate = ref(2.6)
const months = ref(360)
const method = ref<RepayMethod>('equalPayment')

useDirtyFlag(() => Number(commercialPrincipal.value) + Number(providentPrincipal.value) > 0)
const { copy, save } = useToolActions()

const input = computed(() => ({
  commercial: { principal: Number(commercialPrincipal.value) || 0, annualRate: Number(commercialRate.value) || 0 },
  provident: { principal: Number(providentPrincipal.value) || 0, annualRate: Number(providentRate.value) || 0 },
  months: Number(months.value) || 0,
  method: method.value
}))
const result = computed(() => calcCombo(input.value))
const rows = computed<ComboRow[]>(() => (result.value.ok ? result.value.rows : []))
const csv = computed(() => (rows.value.length ? comboToCsv(rows.value) : ''))

const totalPrincipal = computed(() =>
  (Number(commercialPrincipal.value) || 0) + (Number(providentPrincipal.value) || 0)
)

const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })

const summaryText = computed(() =>
  result.value.ok
    ? [
        `商贷：${money(Number(commercialPrincipal.value))} 元 @ ${commercialRate.value}%`,
        `公积金：${money(Number(providentPrincipal.value))} 元 @ ${providentRate.value}%`,
        `期限：${months.value} 期（${(Number(months.value) / 12).toFixed(1)} 年）`,
        `还款方式：${method.value === 'equalPayment' ? '等额本息' : '等额本金'}`,
        `商贷月供：${money(result.value.commercialMonthly)} 元`,
        `公积金月供：${money(result.value.providentMonthly)} 元`,
        `合并首月月供：${money(result.value.firstPayment)} 元`,
        `合并末月月供：${money(result.value.lastPayment)} 元`,
        `总利息：${money(result.value.totalInterest)} 元`,
        `本息合计：${money(result.value.totalPayment)} 元`
      ].join('\n')
    : ''
)

/** 明细纯文本（前 60 期，避免复制出超长文本） */
const detailText = computed(() => comboRowsToText(rows.value, 60))
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="商业贷款金额（元）">
        <input v-model.number="commercialPrincipal" type="number" min="0" class="tu-input" data-testid="tb-modal-input" />
      </TuField>

      <TuField label="商业贷款年利率（%）">
        <input v-model.number="commercialRate" type="number" step="0.01" min="0" class="tu-input" />
      </TuField>

      <TuField label="公积金贷款金额（元）">
        <input v-model.number="providentPrincipal" type="number" min="0" class="tu-input" />
      </TuField>

      <TuField label="公积金年利率（%）">
        <input v-model.number="providentRate" type="number" step="0.001" min="0" class="tu-input" />
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
          <button type="button" class="tu-check" :class="{ 'is-on': method === 'equalPayment' }" @click="method = 'equalPayment'">等额本息</button>
          <button type="button" class="tu-check" :class="{ 'is-on': method === 'equalPrincipal' }" @click="method = 'equalPrincipal'">等额本金</button>
        </div>
      </TuField>

      <p class="tu-hint">贷款总额：{{ money(totalPrincipal) }} 元</p>
    </div>

    <div>
      <p v-if="!result.ok" class="tu-alert">{{ result.error }}</p>

      <TuOutput title="合并还款概要" :text="summaryText" filename="combo-loan-summary.txt" empty="填写参数后自动计算">
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!summaryText" @click="copy(summaryText)">复制</button>
        </template>
        <div class="tu-grid">
          <div class="tu-card">
            <div class="tu-card-title">合并首月月供</div>
            <div class="tu-card-value">{{ money(result.firstPayment) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">商贷月供</div>
            <div class="tu-card-value">{{ money(result.commercialMonthly) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">公积金月供</div>
            <div class="tu-card-value">{{ money(result.providentMonthly) }}</div>
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

      <TuOutput title="还款计划明细" :text="csv" filename="combo-loan-schedule.csv" mime="text/csv;charset=utf-8" empty="—">
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!detailText" @click="copy(detailText)">复制前 60 期</button>
          <button type="button" class="tu-btn ghost" :disabled="!csv" @click="save('combo-loan-schedule.csv', csv, 'text/csv;charset=utf-8')">下载 CSV</button>
        </template>
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>期数</th>
                <th>商贷月供</th>
                <th>公积金月供</th>
                <th>合计月供</th>
                <th>本金</th>
                <th>利息</th>
                <th>剩余本金</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.period">
                <td>{{ r.period }}</td>
                <td>{{ money(r.commercial) }}</td>
                <td>{{ money(r.provident) }}</td>
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
            <li>商贷与公积金按各自的利率分别计息，本工具逐期相加得到真实月供——不要用「总额 × 平均利率」估算。</li>
            <li>两笔贷款的期限通常一致；若不一致，请以较短的那笔为准分别计算。</li>
            <li>任一部分填 0 即退化为单笔贷款计算。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>
