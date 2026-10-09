<script setup lang="ts">
/**
 * 提前还贷计算器
 *
 * 关键在于两件事：
 *   1. 提前还款那一刻的「剩余本金」要从原合同的还款计划里取，不能用「本金 − 已还期数×月均本金」估算。
 *   2. 银行给的两条路（月供不变缩短期限 / 期限不变降低月供）省息效果不同，
 *      前者省得更多，因为利息是按剩余本金逐期滚的，缩短期限能更快压掉本金。
 * 本工具两条路都算，方便直接对比。
 */
import { computed, ref } from 'vue'
import { calcPrepay, type PrepayMode, type RepayMethod } from '../../core/loanExtra'
import { scheduleToCsv } from '../../core/loan'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const principal = ref(1000000)
const annualRate = ref(3.5)
const months = ref(360)
const method = ref<RepayMethod>('equalPayment')
/** 已还期数（在第 N 期期末办理） */
const paidMonths = ref(12)
const payAll = ref(false)
const amount = ref(200000)
const mode = ref<PrepayMode>('keepTerm')

useDirtyFlag(() => Number(principal.value) > 0)
const { copy, save } = useToolActions()

const input = computed(() => ({
  principal: Number(principal.value) || 0,
  annualRate: Number(annualRate.value) || 0,
  months: Number(months.value) || 0,
  method: method.value,
  paidMonths: Number(paidMonths.value) || 0,
  amount: Number(amount.value) || 0,
  payAll: payAll.value,
  mode: mode.value
}))

/** 当前选择的方案 */
const result = computed(() => calcPrepay(input.value))
/** 另一条路，用于对比 */
const other = computed(() => calcPrepay({ ...input.value, mode: mode.value === 'keepTerm' ? 'keepPayment' : 'keepTerm' }))
/** 顺序固定：先「期限不变」，后「月供不变」，避免对比表随选择跳动 */
const compareRows = computed(() => {
  const keepTerm = mode.value === 'keepTerm' ? result.value : other.value
  const keepPayment = mode.value === 'keepPayment' ? result.value : other.value
  return [
    { key: 'keepTerm', label: '期限不变（降月供）', r: keepTerm },
    { key: 'keepPayment', label: '月供不变（缩期限）', r: keepPayment }
  ]
})

const csv = computed(() => (result.value.newRows.length ? scheduleToCsv(result.value.newRows) : ''))

const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const modeLabel = (m: PrepayMode) => (m === 'keepTerm' ? '期限不变（降低月供）' : '月供不变（缩短期限）')

const summaryText = computed(() => {
  const r = result.value
  if (!r.ok) return ''
  const head = [
    `原合同：${money(Number(principal.value))} 元 @ ${annualRate.value}% × ${months.value} 期（${method.value === 'equalPayment' ? '等额本息' : '等额本金'}）`,
    `已还 ${paidMonths.value} 期：已还本金 ${money(r.paidPrincipal)} 元、已还利息 ${money(r.paidInterest)} 元`,
    `办理时剩余本金：${money(r.remainPrincipal)} 元`,
    payAll.value ? `本次全部还清：${money(r.payAmount)} 元` : `本次提前还款：${money(r.payAmount)} 元（调整方案：${modeLabel(mode.value)}）`
  ]
  if (r.newMonths === 0) {
    head.push(`剩余利息全部免除，节省利息 ${money(r.savedInterest)} 元`)
  } else {
    head.push(
      `新合同：剩余本金 ${money(r.newPrincipal)} 元 × ${r.newMonths} 期`,
      `新月供：${money(r.newMonthly)} 元（首期 ${money(r.newFirstPayment)} / 末期 ${money(r.newLastPayment)}）`,
      `剩余利息：${money(r.newRemainInterest)} 元（原方案 ${money(r.oldRemainInterest)} 元）`,
      `节省利息：${money(r.savedInterest)} 元`
    )
  }
  return head.join('\n')
})
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="原贷款金额（元）">
        <input v-model.number="principal" type="number" min="0" class="tu-input" data-testid="tb-modal-input" />
      </TuField>

      <TuField label="原贷款年利率（%）">
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

      <TuField label="已还期数" hint="在第 N 期期末办理提前还款，填 N">
        <input v-model.number="paidMonths" type="number" min="0" class="tu-input" />
      </TuField>

      <TuField label="提前还款方式">
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': !payAll }" @click="payAll = false">部分提前还款</button>
          <button type="button" class="tu-check" :class="{ 'is-on': payAll }" @click="payAll = true">全部提前还清</button>
        </div>
        <template v-if="!payAll">
          <input v-model.number="amount" type="number" min="0" class="tu-input" style="margin-top: 8px" />
          <p class="tu-hint">剩余本金 {{ money(result.remainPrincipal) }} 元，超出部分会自动按剩余本金截断</p>
        </template>
      </TuField>

      <TuField v-if="!payAll" label="调整方案" hint="选哪条路决定省多少利息">
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': mode === 'keepTerm' }" @click="mode = 'keepTerm'">期限不变（降月供）</button>
          <button type="button" class="tu-check" :class="{ 'is-on': mode === 'keepPayment' }" @click="mode = 'keepPayment'">月供不变（缩期限）</button>
        </div>
      </TuField>
    </div>

    <div>
      <p v-if="!result.ok" class="tu-alert">{{ result.error }}</p>

      <TuOutput title="提前还贷结果" :text="summaryText" filename="prepay-summary.txt" empty="填写参数后自动计算">
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!summaryText" @click="copy(summaryText)">复制</button>
        </template>
        <div class="tu-grid">
          <div class="tu-card">
            <div class="tu-card-title">办理时剩余本金</div>
            <div class="tu-card-value">{{ money(result.remainPrincipal) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">本次还款</div>
            <div class="tu-card-value">{{ money(result.payAmount) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">新月供</div>
            <div class="tu-card-value">{{ result.newMonths === 0 ? '已结清' : money(result.newMonthly) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">剩余期数</div>
            <div class="tu-card-value">{{ result.newMonths === 0 ? '0' : result.newMonths }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">节省利息</div>
            <div class="tu-card-value">{{ money(result.savedInterest) }}</div>
          </div>
        </div>
      </TuOutput>

      <TuOutput
        v-if="!payAll"
        title="两条路对比"
        :text="compareRows.map(c => `${c.label}：省息 ${money(c.r.savedInterest)} 元，新期限 ${c.r.newMonths} 期，新月供 ${money(c.r.newMonthly)} 元`).join('\n')"
        filename="prepay-compare.txt"
        empty="—"
      >
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>调整方案</th>
                <th>剩余期数</th>
                <th>新月供</th>
                <th>剩余利息</th>
                <th>节省利息</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in compareRows" :key="c.key">
                <td>{{ c.label }}</td>
                <td>{{ c.r.newMonths }}</td>
                <td>{{ money(c.r.newMonthly) }}</td>
                <td>{{ money(c.r.newRemainInterest) }}</td>
                <td>{{ money(c.r.savedInterest) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="tu-hint" style="margin-top: 8px">
          同样的还款金额，「月供不变缩短期限」通常更省钱 —— 本金压得更快，利息滚得更少。
        </p>
      </TuOutput>

      <TuOutput
        v-if="result.newRows.length"
        title="新合同还款计划"
        :text="csv"
        filename="prepay-schedule.csv"
        mime="text/csv;charset=utf-8"
        empty="—"
      >
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!csv" @click="save('prepay-schedule.csv', csv, 'text/csv;charset=utf-8')">下载 CSV</button>
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
            <li>「已还期数」填实际已还的月数；剩余本金取自原合同还款计划，与银行对账单一致。</li>
            <li>「月供不变」是按原月供反解剩余期数；若算出的月供不足以覆盖利息，会自动退化为「期限不变」。</li>
            <li>本工具不含违约金 / 补偿金，实际办理时请向银行确认。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>
