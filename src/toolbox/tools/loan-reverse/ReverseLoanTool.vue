<script setup lang="ts">
/**
 * 贷款反算计算器
 *
 * 两个方向：
 *   1. 反算金额：知道月供、利率、期限 → 当初贷了多少
 *   2. 反算利率：知道金额、月供、期限 → 银行给的实际利率是多少（等额本息用二分求解）
 * 等额本金时输入的月供指「首月还款额」，因为等额本金每月递减、没有固定月供。
 */
import { computed, ref } from 'vue'
import { solveReverse, type RepayMethod, type ReverseTarget } from '../../core/loanExtra'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const target = ref<ReverseTarget>('principal')
const method = ref<RepayMethod>('equalPayment')
const monthly = ref(4490.45)
const months = ref(360)
/** 反算利率时的已知本金 */
const principal = ref(1000000)
/** 反算金额时的已知利率 */
const annualRate = ref(3.5)

useDirtyFlag(() => Number(monthly.value) > 0)
const { copy } = useToolActions()

const input = computed(() => ({
  target: target.value,
  method: method.value,
  monthly: Number(monthly.value) || 0,
  months: Number(months.value) || 0,
  principal: Number(principal.value) || 0,
  annualRate: Number(annualRate.value) || 0
}))
const result = computed(() => solveReverse(input.value))

const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const wan = (n: number) => (n / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })

const summaryText = computed(() => {
  const r = result.value
  if (!r.ok) return ''
  if (r.principal !== undefined) {
    return [
      `反算目标：贷款金额`,
      `已知月供：${money(Number(monthly.value))} 元`,
      `已知年利率：${annualRate.value}%`,
      `已知期限：${months.value} 期（${(Number(months.value) / 12).toFixed(1)} 年）`,
      `还款方式：${method.value === 'equalPayment' ? '等额本息' : '等额本金（首月还款额）'}`,
      `→ 贷款金额：${money(r.principal)} 元（约 ${wan(r.principal)} 万元）`,
      `校验：按此金额正算月供为 ${money(r.checkMonthly ?? 0)} 元`
    ].join('\n')
  }
  return [
    `反算目标：贷款利率`,
    `已知金额：${money(Number(principal.value))} 元`,
    `已知月供：${money(Number(monthly.value))} 元`,
    `已知期限：${months.value} 期（${(Number(months.value) / 12).toFixed(1)} 年）`,
    `还款方式：${method.value === 'equalPayment' ? '等额本息' : '等额本金（首月还款额）'}`,
    `→ 年利率：${r.annualRate}%`,
    `校验：按此利率正算月供为 ${money(r.checkMonthly ?? 0)} 元`
  ].join('\n')
})
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="反算目标">
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': target === 'principal' }" @click="target = 'principal'">反算贷款金额</button>
          <button type="button" class="tu-check" :class="{ 'is-on': target === 'rate' }" @click="target = 'rate'">反算贷款利率</button>
        </div>
      </TuField>

      <TuField label="还款方式">
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': method === 'equalPayment' }" @click="method = 'equalPayment'">等额本息</button>
          <button type="button" class="tu-check" :class="{ 'is-on': method === 'equalPrincipal' }" @click="method = 'equalPrincipal'">等额本金</button>
        </div>
        <p v-if="method === 'equalPrincipal'" class="tu-hint">等额本金每月递减，此处月供请填「首月还款额」</p>
      </TuField>

      <TuField label="月还款额（元）">
        <input v-model.number="monthly" type="number" min="0" step="0.01" class="tu-input" data-testid="tb-modal-input" />
      </TuField>

      <TuField label="贷款期限（月）" :extra="`约 ${(Number(months) / 12).toFixed(1)} 年`">
        <input v-model.number="months" type="number" min="1" class="tu-input" />
        <div class="tu-row">
          <button type="button" class="tu-btn ghost" @click="months = 120">10 年</button>
          <button type="button" class="tu-btn ghost" @click="months = 240">20 年</button>
          <button type="button" class="tu-btn ghost" @click="months = 360">30 年</button>
        </div>
      </TuField>

      <TuField v-if="target === 'rate'" label="已知贷款金额（元）">
        <input v-model.number="principal" type="number" min="0" class="tu-input" />
      </TuField>

      <TuField v-else label="已知年利率（%）">
        <input v-model.number="annualRate" type="number" step="0.01" min="0" class="tu-input" />
      </TuField>
    </div>

    <div>
      <p v-if="!result.ok" class="tu-alert">{{ result.error }}</p>

      <TuOutput title="反算结果" :text="summaryText" filename="loan-reverse.txt" empty="填写参数后自动计算">
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!summaryText" @click="copy(summaryText)">复制</button>
        </template>
        <div class="tu-grid">
          <template v-if="result.principal !== undefined">
            <div class="tu-card">
              <div class="tu-card-title">贷款金额</div>
              <div class="tu-card-value">{{ money(result.principal) }}</div>
            </div>
            <div class="tu-card">
              <div class="tu-card-title">折合万元</div>
              <div class="tu-card-value">{{ wan(result.principal) }} 万</div>
            </div>
          </template>
          <template v-else>
            <div class="tu-card">
              <div class="tu-card-title">年利率</div>
              <div class="tu-card-value">{{ result.annualRate }}%</div>
            </div>
          </template>
          <div class="tu-card">
            <div class="tu-card-title">正算校验月供</div>
            <div class="tu-card-value">{{ money(result.checkMonthly ?? 0) }}</div>
          </div>
        </div>
        <p class="tu-hint" style="margin-top: 8px">
          「正算校验月供」是用反算结果倒推回去的月供，与你输入的月供一致即说明反算可信。
        </p>
      </TuOutput>

      <details class="tu-folding">
        <summary>使用说明</summary>
        <div class="tu-folding-body">
          <ol>
            <li><strong>反算金额</strong>：知道月供和利率，推算当初贷了多少 —— 适合核对合同或评估自己能贷多少。</li>
            <li><strong>反算利率</strong>：知道贷了多少、每月还多少，推算银行的实际年利率 —— 适合判断报价是否划算。</li>
            <li>等额本息的利率用二分法求解，精度到 0.01%；等额本金可直接由首月还款额解出。</li>
            <li>若月供低于每期应还本金，说明输入有误，工具会给出提示。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>
