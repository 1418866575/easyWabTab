<script setup lang="ts">
/**
 * 购房能力评估
 *
 * 买房能买多贵，同时被两件事卡住：
 *   1. 月供上限 —— 每月还多少（反推可贷多少 → 可购总价）
 *   2. 首付现金 —— 手上有多少钱（首付 + 税费要一次付清）
 * 取两者较小值，并明确指出卡在哪个瓶颈上，比只给一个数字更有用。
 */
import { computed, ref } from 'vue'
import { calcAfford } from '../../core/loanExtra'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const cash = ref(1000000)
const monthlyBudget = ref(10000)
const months = ref(360)
const area = ref(100)
const annualRate = ref(3.5)
const downRatio = ref(30)

useDirtyFlag(() => Number(cash.value) > 0 && Number(monthlyBudget.value) > 0)
const { copy } = useToolActions()

const result = computed(() =>
  calcAfford({
    cash: Number(cash.value) || 0,
    monthlyBudget: Number(monthlyBudget.value) || 0,
    months: Number(months.value) || 0,
    area: Number(area.value) || 0,
    annualRate: Number(annualRate.value) || 0,
    downRatio: Number(downRatio.value) || 0
  })
)

const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const wan = (n: number) => (n / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })

const bottleneckText = computed(() => {
  const r = result.value
  if (!r.ok) return ''
  return r.bottleneck === 'loan'
    ? '当前主要卡在月供：按你每月能承受的支出，最多只能贷这么多。提高月供预算或延长贷款期限可以提高总价。'
    : '当前主要卡在首付现金：月供还有余量，但手上的钱不够付首付和税费。降低首付比例或增加购房资金可以提高总价。'
})

const summaryText = computed(() => {
  const r = result.value
  if (!r.ok) return ''
  return [
    `现有购房资金：${money(Number(cash.value))} 元`,
    `每月可承受支出：${money(Number(monthlyBudget.value))} 元`,
    `贷款期限：${months.value} 期（${(Number(months.value) / 12).toFixed(1)} 年） @ ${annualRate.value}%`,
    `首付比例：${downRatio.value}% · 计划面积：${area.value}㎡`,
    `月供上限可贷：${money(r.maxLoan)} 元 → 可购总价 ${money(r.totalByLoan)} 元`,
    `现金约束可购总价：${money(r.totalByCash)} 元`,
    `→ 可购房总价：${money(r.totalPrice)} 元（约 ${wan(r.totalPrice)} 万元）`,
    `可购单价：${money(r.unitPrice)} 元/㎡`,
    `首付：${money(r.downPayment)} 元 · 贷款 ${money(r.loanAmount)} 元 · 月供 ${money(r.monthly)} 元`,
    `税费估算（契税 + 维修基金）：${money(r.tax)} 元`,
    bottleneckText.value
  ].join('\n')
})
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="现有购房资金（元）" hint="用于首付与税费的部分">
        <input v-model.number="cash" type="number" min="0" class="tu-input" data-testid="tb-modal-input" />
      </TuField>

      <TuField label="每月可承受购房支出（元）" hint="即月供预算">
        <input v-model.number="monthlyBudget" type="number" min="0" class="tu-input" />
      </TuField>

      <TuField label="期望贷款期限（月）" :extra="`约 ${(Number(months) / 12).toFixed(1)} 年`">
        <input v-model.number="months" type="number" min="1" class="tu-input" />
        <div class="tu-row">
          <button type="button" class="tu-btn ghost" @click="months = 240">20 年</button>
          <button type="button" class="tu-btn ghost" @click="months = 360">30 年</button>
        </div>
      </TuField>

      <TuField label="贷款年利率（%）">
        <input v-model.number="annualRate" type="number" step="0.01" min="0" class="tu-input" />
      </TuField>

      <TuField label="计划购房面积（㎡）">
        <input v-model.number="area" type="number" min="0" class="tu-input" />
      </TuField>

      <TuField label="首付比例（%）">
        <input v-model.number="downRatio" type="number" min="1" max="99" class="tu-input" />
        <div class="tu-row">
          <button type="button" class="tu-btn ghost" @click="downRatio = 15">15%（最低）</button>
          <button type="button" class="tu-btn ghost" @click="downRatio = 30">30%</button>
        </div>
      </TuField>
    </div>

    <div>
      <p v-if="!result.ok" class="tu-alert">{{ result.error }}</p>

      <TuOutput title="评估结果" :text="summaryText" filename="house-afford.txt" empty="填写参数后自动计算">
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!summaryText" @click="copy(summaryText)">复制</button>
        </template>
        <div class="tu-grid">
          <div class="tu-card">
            <div class="tu-card-title">可购房总价</div>
            <div class="tu-card-value">{{ wan(result.totalPrice) }} 万</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">可购单价</div>
            <div class="tu-card-value">{{ money(result.unitPrice) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">首付</div>
            <div class="tu-card-value">{{ money(result.downPayment) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">贷款金额</div>
            <div class="tu-card-value">{{ money(result.loanAmount) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">月供</div>
            <div class="tu-card-value">{{ money(result.monthly) }}</div>
          </div>
        </div>
        <p class="tu-hint" style="margin-top: 8px">{{ bottleneckText }}</p>
      </TuOutput>

      <TuOutput
        title="两条约束对照"
        :text="`月供约束 ${money(result.totalByLoan)}\n现金约束 ${money(result.totalByCash)}`"
        filename="house-afford-constraint.txt"
        empty="—"
      >
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>约束</th>
                <th>可购总价（元）</th>
                <th>是否瓶颈</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>月供上限（可贷 {{ money(result.maxLoan) }}）</td>
                <td>{{ money(result.totalByLoan) }}</td>
                <td>{{ result.bottleneck === 'loan' ? '是' : '否' }}</td>
              </tr>
              <tr>
                <td>首付现金 + 税费</td>
                <td>{{ money(result.totalByCash) }}</td>
                <td>{{ result.bottleneck === 'cash' ? '是' : '否' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TuOutput>

      <div class="tu-alert tu-alert--warn">
        税费按契税 1.5% 与维修基金 100 元/㎡ 粗略估算，未计入中介费、评估费等杂费；
        实际可贷额度还受收入证明、征信与各地限购政策影响。
      </div>

      <details class="tu-folding">
        <summary>使用说明</summary>
        <div class="tu-folding-body">
          <ol>
            <li>「每月可承受购房支出」建议控制在家庭月收入的 40% 以内，留出生活与应急空间。</li>
            <li>月供约束 = 用月供反推可贷本金，再按首付比例折算成总价。</li>
            <li>现金约束 = 现有资金扣除税费后，按首付比例能撑起的总价。</li>
            <li>两者取小即为可购总价，工具会明确告诉你卡在哪一边。</li>
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
</style>
