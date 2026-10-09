<script setup lang="ts">
/**
 * LPR 与基准利率速查
 *
 * 房贷利率不是拍脑袋定的，它由「定价基准 + 加点」组成：
 *   执行利率 = 对应期限 LPR + 加点（BP，1BP = 0.01%）
 * 加点可正可负，一旦签约在整笔贷款期内固定不变，之后随 LPR 重定价而浮动。
 * 本工具把常用利率表集中速查，并顺手算出「加点后」的月供，方便横向对比。
 */
import { computed, ref } from 'vue'
import { monthlyPayment } from '../../core/loan'
import {
  BASE_RATE_INFO,
  DOWN_PAYMENT_INFO,
  GJJ_RATE_INFO,
  LPR_INFO
} from '../../core/loanExtra'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

/** LPR 期限档：0 = 1 年期，1 = 5 年期以上 */
const termIndex = ref(1)
const bp = ref(0)
const principalWan = ref(100)
const years = ref(30)

useDirtyFlag(() => true)
const { copy } = useToolActions()

const lprRate = computed(() => LPR_INFO.rows[termIndex.value]?.rate ?? 0)
const lprTerm = computed(() => LPR_INFO.rows[termIndex.value]?.term ?? '')
/** 执行年利率（%） */
const execRate = computed(() => Math.round((lprRate.value + Number(bp.value || 0) / 100) * 1e4) / 1e4)

const months = computed(() => Math.round(Number(years.value || 0) * 12))
const principal = computed(() => Number(principalWan.value || 0) * 10000)

const monthly = computed(() =>
  monthlyPayment(principal.value, execRate.value / 100 / 12, months.value)
)
const totalInterest = computed(() => monthly.value * months.value - principal.value)

/** 同样条件按 2019 年以前的商业基准利率（5 年以上 4.9%）试算，用于感受差别 */
const baseMonthly = computed(() => {
  const base = BASE_RATE_INFO.rows[BASE_RATE_INFO.rows.length - 1]?.rate ?? 0
  return monthlyPayment(principal.value, base / 100 / 12, months.value)
})
const monthlyDelta = computed(() => monthly.value - baseMonthly.value)

const money = (n: number) => (Number.isFinite(n) ? n.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '—')
const wan = (n: number) => (Number.isFinite(n) ? (n / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '—')
const signed = (n: number) => (n >= 0 ? `+${money(n)}` : `-${money(Math.abs(n))}`)

const summaryText = computed(() => {
  const lines = [
    `定价基准：${lprTerm.value} LPR ${lprRate.value}%（${LPR_INFO.updatedAt} 公布）`,
    `加点：${bp.value} BP（${Number(bp.value || 0) / 100}%）`,
    `执行年利率：${execRate.value}%`,
    `试算：${principalWan.value} 万元 / ${years.value} 年（${months.value} 期）等额本息`,
    `月供：${money(monthly.value)} 元 · 利息总额 ${money(totalInterest.value)} 元（${wan(totalInterest.value)} 万元）`,
    `对比旧基准 ${BASE_RATE_INFO.rows[BASE_RATE_INFO.rows.length - 1]?.rate}%：月供 ${signed(monthlyDelta.value)} 元`,
    '',
    '【LPR】'
  ]
  for (const r of LPR_INFO.rows) lines.push(`${r.term}：${r.rate}%`)
  lines.push('', '【商业贷款基准利率（已停更）】')
  for (const r of BASE_RATE_INFO.rows) lines.push(`${r.term}：${r.rate}%`)
  lines.push('', '【公积金贷款利率】')
  for (const r of GJJ_RATE_INFO.rows) lines.push(`${r.term}：首套 ${r.rate}% / 二套 ${r.rate2}%`)
  lines.push(
    '',
    `【最低首付比例】首套 ${DOWN_PAYMENT_INFO.first}% / 二套 ${DOWN_PAYMENT_INFO.second}%（${DOWN_PAYMENT_INFO.updatedAt} 起）`
  )
  return lines.join('\n')
})

const tableToText = (title: string, header: string[], rows: string[][]) =>
  [title, header.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n')
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="LPR 期限档">
        <div class="tu-row">
          <button
            type="button"
            class="tu-btn"
            :class="termIndex === 0 ? '' : 'ghost'"
            @click="termIndex = 0"
          >
            1 年期
          </button>
          <button
            type="button"
            class="tu-btn"
            :class="termIndex === 1 ? '' : 'ghost'"
            @click="termIndex = 1"
          >
            5 年期以上
          </button>
        </div>
        <p class="tu-hint">{{ lprTerm }} LPR = {{ lprRate }}%</p>
      </TuField>

      <TuField label="加点（BP）" hint="1 BP = 0.01%，可为负数">
        <input v-model.number="bp" type="number" step="1" class="tu-input" />
        <div class="tu-row">
          <button type="button" class="tu-btn ghost" @click="bp = 0">+0</button>
          <button type="button" class="tu-btn ghost" @click="bp = -20">-20</button>
          <button type="button" class="tu-btn ghost" @click="bp = 20">+20</button>
          <button type="button" class="tu-btn ghost" @click="bp = 60">+60</button>
        </div>
      </TuField>

      <TuField label="试算金额（万元）">
        <input v-model.number="principalWan" type="number" min="0" class="tu-input" />
      </TuField>

      <TuField label="试算期限（年）" :extra="`${months} 期`">
        <input v-model.number="years" type="number" min="1" class="tu-input" />
        <div class="tu-row">
          <button type="button" class="tu-btn ghost" @click="years = 20">20 年</button>
          <button type="button" class="tu-btn ghost" @click="years = 30">30 年</button>
        </div>
      </TuField>
    </div>

    <div>
      <TuOutput title="执行利率试算" :text="summaryText" filename="loan-lpr.txt" empty="—">
        <template #actions>
          <button type="button" class="tu-btn ghost" @click="copy(summaryText)">复制</button>
        </template>
        <div class="tu-grid">
          <div class="tu-card">
            <div class="tu-card-title">执行年利率</div>
            <div class="tu-card-value">{{ execRate }}%</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">月供（等额本息）</div>
            <div class="tu-card-value">{{ money(monthly) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">利息总额</div>
            <div class="tu-card-value">{{ wan(totalInterest) }} 万</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">对比旧基准 4.9%</div>
            <div class="tu-card-value" :class="monthlyDelta > 0 ? 'is-up' : 'is-down'">
              {{ signed(monthlyDelta) }}
            </div>
          </div>
        </div>
        <p class="tu-hint" style="margin-top: 8px">
          执行利率 = {{ lprRate }}%（{{ lprTerm }} LPR） + {{ bp }} BP。签约后加点固定不变，
          之后每年按重定价日跟随最新 LPR 浮动。
        </p>
      </TuOutput>

      <TuOutput
        title="贷款市场报价利率（LPR）"
        :text="tableToText('LPR', ['期限', '利率'], LPR_INFO.rows.map((r) => [r.term, `${r.rate}%`]))"
        filename="lpr.txt"
        empty="—"
      >
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>期限</th>
                <th>利率（年化）</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in LPR_INFO.rows" :key="r.term">
                <td>{{ r.term }}</td>
                <td>{{ r.rate }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="tu-hint">公布日期：{{ LPR_INFO.updatedAt }}（每月 20 日更新，遇节假日顺延）</p>
      </TuOutput>

      <TuOutput
        title="商业贷款基准利率"
        :text="tableToText('商业贷款基准利率', ['期限', '利率'], BASE_RATE_INFO.rows.map((r) => [r.term, `${r.rate}%`]))"
        filename="base-rate.txt"
        empty="—"
      >
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>期限</th>
                <th>利率（年化）</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in BASE_RATE_INFO.rows" :key="r.term">
                <td>{{ r.term }}</td>
                <td>{{ r.rate }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="tu-hint">{{ BASE_RATE_INFO.updatedAt }}：2019 年 10 月起新发放商业性个人住房利率改为以 LPR 为定价基准。</p>
      </TuOutput>

      <TuOutput
        title="住房公积金贷款利率"
        :text="tableToText('公积金贷款利率', ['期限', GJJ_RATE_INFO.columns[0], GJJ_RATE_INFO.columns[1]], GJJ_RATE_INFO.rows.map((r) => [r.term, `${r.rate}%`, `${r.rate2}%`]))"
        filename="gjj-rate.txt"
        empty="—"
      >
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>期限</th>
                <th>{{ GJJ_RATE_INFO.columns[0] }}</th>
                <th>{{ GJJ_RATE_INFO.columns[1] }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in GJJ_RATE_INFO.rows" :key="r.term">
                <td>{{ r.term }}</td>
                <td>{{ r.rate }}%</td>
                <td>{{ r.rate2 }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="tu-hint">执行日期：{{ GJJ_RATE_INFO.updatedAt }}。公积金利率由央行统一调整，不随 LPR 浮动。</p>
      </TuOutput>

      <TuOutput
        title="商业住房贷款最低首付比例"
        :text="`最低首付比例\n首套住房\t${DOWN_PAYMENT_INFO.first}%\n二套住房\t${DOWN_PAYMENT_INFO.second}%`"
        filename="down-payment.txt"
        empty="—"
      >
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>最低首付比例</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>首套住房</td>
                <td>{{ DOWN_PAYMENT_INFO.first }}%</td>
              </tr>
              <tr>
                <td>二套住房</td>
                <td>{{ DOWN_PAYMENT_INFO.second }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="tu-hint">执行日期：{{ DOWN_PAYMENT_INFO.updatedAt }}。各地可在全国下限基础上自主确定，以当地政策为准。</p>
      </TuOutput>

      <div class="tu-alert tu-alert--warn">
        表中数据为内置静态快照（LPR {{ LPR_INFO.updatedAt }} / 公积金 {{ GJJ_RATE_INFO.updatedAt }}），
        可能滞后于最新公布值；实际执行利率、加点与首付比例以贷款银行、当地公积金中心与住建部门口径为准。
      </div>

      <details class="tu-folding">
        <summary>使用说明</summary>
        <div class="tu-folding-body">
          <ol>
            <li>新房贷定价 = 相应期限 LPR + 加点（BP），加点在合同期内固定，LPR 每年重定价一次。</li>
            <li>存量房贷在 2020 年已完成定价基准转换，原「基准利率上浮/打折」被换算成固定加点。</li>
            <li>公积金贷款利率独立于 LPR，由央行单独公布，通常明显低于商业贷款。</li>
            <li>「对比旧基准」用 5 年以上 4.9% 试算同额度同期限的月供，便于直观感受利率变化的影响。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.tu-alert--warn {
  margin-top: 12px;
  color: var(--color-warning);
  background: var(--color-warning-soft);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
}

.tu-card-value.is-up {
  color: var(--color-error, #ef4444);
}

.tu-card-value.is-down {
  color: var(--color-success, #16a34a);
}
</style>
