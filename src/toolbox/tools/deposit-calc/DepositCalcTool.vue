<script setup lang="ts">
/**
 * 存款利息计算器
 * - 三期限（1/3/5 年）单利对比 + 跨期限复利等效年化
 * - 统一到 5 年口径比选滚动策略（续存方式影响复利）
 * - 按「流动资金占比」推导 1/3/5 年阶梯分配，并给出流动性成本
 */
import { computed, ref } from 'vue'
import { calcDeposit, PRINCIPAL_MAX, PRINCIPAL_MIN } from '../../core/deposit'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const principal = ref(1000000)
const rateY1 = ref(0.95)
/** true = 3/5 年利率按「基准 + 利差」推导；false = 分别手填 */
const rateAuto = ref(true)
const spreadY3 = ref(0.3)
const spreadY5 = ref(0.35)
const manualY3 = ref(1.25)
const manualY5 = ref(1.3)
/** 本息续存 = 利滚利；关掉则利息取出、只续本金 */
const compound = ref(true)
/** 5 年内希望保有的流动资金占比（%），决定 1 年档比例 */
const liquidityPct = ref(30)
const demandRate = ref(0.05)

const PRESETS = [200000, 500000, 1000000, 3000000]

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const rates = computed(() =>
  rateAuto.value
    ? { y1: rateY1.value, y3: round2(rateY1.value + spreadY3.value), y5: round2(rateY1.value + spreadY5.value) }
    : { y1: rateY1.value, y3: manualY3.value, y5: manualY5.value }
)

const result = computed(() =>
  calcDeposit({
    principal: Number(principal.value) || 0,
    rates: rates.value,
    compound: compound.value,
    demandRate: Number(demandRate.value) || 0,
    liquidityPct: Number(liquidityPct.value) || 0
  })
)

useDirtyFlag(() => Number(principal.value) > 0)

const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const wan = (n: number) => `${(n / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 万`
const pct = (n: number) => `${n.toFixed(2)}%`

const rows = computed(() => (result.value.ok ? result.value.terms : []))
const ladder = computed(() => result.value.ladder)
const best = computed(() => result.value.bestStrategy)

/** 三期限利息条：以最大利息为 100% */
const maxTermInterest = computed(() => Math.max(1, ...rows.value.map(r => r.interest)))
const barWidth = (v: number) => `${Math.max(2, (v / maxTermInterest.value) * 100)}%`

/** 最优策略的展示文案：单步策略的 steps 只有「5 年」，补全成「一次存 5 年」 */
const bestDesc = computed(() => {
  const s = best.value
  if (!s) return ''
  return s.steps.includes('→') ? s.steps : `一次存 ${s.steps}`
})

const termText = computed(() =>
  rows.value.map(r => `${r.term} 年期：年利率 ${pct(r.rate)}，利息 ${money(r.interest)} 元，到期本息 ${money(r.maturity)} 元，折合年化 ${pct(r.annualized)}`).join('\n')
)

const strategyText = computed(() => {
  const list = result.value.strategies5
  if (!list.length) return ''
  const head = '【5 年期口径】'
  const body = list.map(s => `${s.steps}：利息 ${money(s.interest)} 元`).join('\n')
  const bestLine = best.value ? `\n最高：${best.value.steps}，利息 ${money(best.value.interest)} 元` : ''
  return `${head}\n${body}${bestLine}`
})

const ladderText = computed(() => {
  if (!result.value.ok) return ''
  const l = ladder.value
  const legs = l.legs
    .filter(g => g.amount > 0)
    .map(
      g =>
        `${g.term} 年档：本金 ${money(g.amount)} 元（${g.pct.toFixed(0)}%），年利率 ${pct(g.rate)}，` +
        `期内利息 ${money(g.termInterest)} 元，5 年末本息 ${money(g.finalAt5)} 元`
    )
    .join('\n')
  const timeline = l.timeline.map(t => `第 ${t.year} 年末：${t.matured} 到期，可支取约 ${money(t.amount)} 元`).join('\n')
  return `${legs}\n\n5 年合计：本息 ${money(l.total)} 元，利息 ${money(l.interestAt5)} 元，加权年化 ${pct(l.annualized)}\n流动性成本：${money(l.liquidityCost)} 元（相对全额存 5 年）\n\n${timeline}`
})

const timelineText = computed(() =>
  result.value.ok
    ? ladder.value.timeline.map(t => `第 ${t.year} 年末：${t.matured}到期，可支取约 ${money(t.amount)} 元`).join('\n')
    : ''
)

/** 两种口径合成一张表：分开两张表会超出结果卡固定高度，被内部滚动截断 */
const strategyRows = computed(() => [
  ...result.value.strategies5.map(s => ({ ...s, scope: '5 年期' })),
  ...result.value.strategies3.map(s => ({ ...s, scope: '3 年期' }))
])

const scaleText = computed(() =>
  result.value.scaleTable
    .map(s => `${wan(s.principal)}：阶梯利息 ${money(s.ladderInterest)} 元，少赚 ${money(s.gapToPure)} 元，需分 ${s.banks} 家银行`)
    .join('\n')
)

const summaryText = computed(() => {
  if (!result.value.ok || !best.value) return ''
  const l = ladder.value
  const lines = [
    `存款利息测算（本金 ${money(Number(principal.value))} 元，1 年期 ${pct(rates.value.y1)}，3 年期 ${pct(rates.value.y3)}，5 年期 ${pct(rates.value.y5)}，${compound.value ? '本息续存' : '只续本金'}）`,
    '',
    '一、同期限全额存入',
    termText.value,
    '',
    '二、统一到 5 年期末的策略比选',
    strategyText.value,
    '',
    '三、推荐阶梯配置（1 年档按流动资金占比分配，其余对半分给 3 年与 5 年）',
    ladderText.value,
    '',
    '四、依据说明',
    '1. 定期整存整取按单利计息（利息 = 本金 × 年利率 × 存期），单期内没有复利；复利只在到期续存时产生。',
    `2. 当前${compound.value ? '本息续存' : '只续本金'}，5 年内收益上限是「${best.value.steps}」的 ${money(best.value.interest)} 元；`,
    `3. 全额锁 5 年收益最高，但 5 年内动用只能按活期计息，3/5 年档提前支取会少拿约 ${money(l.earlyLoss)} 元；`,
    `4. 阶梯配置用 ${money(l.liquidityCost)} 元利息换每年一次的到期现金流，兼顾收益与流动性；`,
    '5. 收益率与本金规模无关（线性），本金差异体现在利息绝对值与存款保险分散要求（50 万/家）。'
  ]
  return lines.join('\n')
})

const showMassiveHint = computed(() => Number(principal.value) < PRINCIPAL_MIN || Number(principal.value) > PRINCIPAL_MAX)
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="本金（元）" :extra="wan(Number(principal) || 0)">
        <input
          v-model.number="principal"
          type="number"
          min="0"
          step="10000"
          class="tu-input"
          data-testid="tb-modal-input"
        />
        <div class="dp-presets">
          <button
            v-for="v in PRESETS"
            :key="v"
            type="button"
            class="tu-btn ghost"
            :class="{ 'is-on': Number(principal) === v }"
            @click="principal = v"
          >{{ v / 10000 }} 万</button>
        </div>
      </TuField>

      <TuField label="三档年利率（%）" hint="按银行实际挂牌利率填；3 / 5 年默认按 1 年期加常见利差推导">
        <div class="dp-rate-grid">
          <span class="tu-label">1 年期</span>
          <input v-model.number="rateY1" type="number" step="0.01" min="0" class="tu-input" />
          <span />
        </div>
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': rateAuto }" @click="rateAuto = true">
            按利差推导
          </button>
          <button type="button" class="tu-check" :class="{ 'is-on': !rateAuto }" @click="rateAuto = false">
            分别填写
          </button>
        </div>
        <div v-if="rateAuto" class="dp-rate-grid">
          <span class="tu-label">3 年利差</span>
          <input v-model.number="spreadY3" type="number" step="0.01" class="tu-input" />
          <span class="dp-rate-eq">= {{ pct(rates.y3) }}</span>
          <span class="tu-label">5 年利差</span>
          <input v-model.number="spreadY5" type="number" step="0.01" class="tu-input" />
          <span class="dp-rate-eq">= {{ pct(rates.y5) }}</span>
        </div>
        <div v-else class="dp-rate-grid">
          <span class="tu-label">3 年期</span>
          <input v-model.number="manualY3" type="number" step="0.01" min="0" class="tu-input" />
          <span />
          <span class="tu-label">5 年期</span>
          <input v-model.number="manualY5" type="number" step="0.01" min="0" class="tu-input" />
          <span />
        </div>
      </TuField>

      <TuField label="续存方式" hint="单期内一律单利；本息续存才会利滚利">
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': compound }" @click="compound = true">
            本息续存
          </button>
          <button type="button" class="tu-check" :class="{ 'is-on': !compound }" @click="compound = false">
            只续本金
          </button>
        </div>
      </TuField>

      <TuField
        label="5 年内需保留的流动资金（%）"
        :extra="`${Number(liquidityPct) || 0}%`"
        hint="这部分放 1 年期档，剩余对半分给 3 年与 5 年"
      >
        <input
          v-model.number="liquidityPct"
          type="range"
          min="0"
          max="100"
          step="5"
          class="tu-range"
          data-testid="tb-modal-input"
        />
        <input v-model.number="liquidityPct" type="number" min="0" max="100" step="5" class="tu-input" />
      </TuField>

      <details class="tu-folding">
        <summary>高级参数</summary>
        <div class="tu-folding-body">
          <TuField label="活期年利率（%）" hint="仅用于估算提前支取损失">
            <input v-model.number="demandRate" type="number" step="0.01" min="0" class="tu-input" />
          </TuField>
          <p class="tu-hint">
            不计算利息税（2008 年起储蓄存款利息免征个人所得税），未考虑通胀与利率变动。
          </p>
        </div>
      </details>

      <p v-if="showMassiveHint" class="tu-hint">
        支持区间 {{ PRINCIPAL_MIN / 10000 }} 万 – {{ PRINCIPAL_MAX / 10000 }} 万，当前数值超出区间仍可试算。
      </p>
    </div>

    <div>
      <p v-if="!result.ok" class="tu-alert">{{ result.error }}</p>

      <TuOutput title="结论速览" :text="summaryText" filename="deposit-summary.txt" empty="填写本金与利率后自动计算">
        <div class="tu-grid">
          <div class="tu-card">
            <div class="tu-card-title">收益最高策略</div>
            <div class="tu-card-value">{{ best ? money(best.interest) : '—' }}</div>
            <div class="dp-card-sub">{{ bestDesc }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">推荐阶梯 5 年利息</div>
            <div class="tu-card-value">{{ money(ladder.interestAt5) }}</div>
            <div class="dp-card-sub">加权年化 {{ pct(ladder.annualized) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">流动性成本</div>
            <div class="tu-card-value">{{ money(ladder.liquidityCost) }}</div>
            <div class="dp-card-sub">相对全额存 5 年少赚</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">提前支取损失</div>
            <div class="tu-card-value">{{ money(ladder.earlyLoss) }}</div>
            <div class="dp-card-sub">3/5 年档按活期计息</div>
          </div>
        </div>
        <ul v-if="result.warnings.length" class="dp-warn">
          <li v-for="w in result.warnings" :key="w">{{ w }}</li>
        </ul>
      </TuOutput>

      <TuOutput title="三期限利息对比（同一笔全额存入）" :text="termText" filename="deposit-terms.txt">
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>期限</th>
                <th>年利率</th>
                <th>利息</th>
                <th>到期本息</th>
                <th>折合年化</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.term">
                <td>{{ r.term }} 年期</td>
                <td>{{ pct(r.rate) }}</td>
                <td>{{ money(r.interest) }}</td>
                <td>{{ money(r.maturity) }}</td>
                <td>{{ pct(r.annualized) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="dp-bars">
          <div v-for="r in rows" :key="r.term" class="dp-bar-row">
            <span class="dp-bar-label">{{ r.term }} 年</span>
            <span class="dp-bar-track"><span class="dp-bar-fill" :style="{ width: barWidth(r.interest) }" /></span>
            <span class="dp-bar-value">{{ money(r.interest) }}</span>
          </div>
        </div>
      </TuOutput>
      <p class="tu-hint dp-note">
        三个期限的存期不同，利息绝对值不可直接比较；「折合年化」按复利口径折算，才反映真实收益率高低。
      </p>

      <TuOutput title="阶梯配置：1 年 / 3 年 / 5 年怎么分" :text="ladderText" filename="deposit-ladder.txt">
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>档位</th>
                <th>建议本金</th>
                <th>占比</th>
                <th>年利率</th>
                <th>期内利息</th>
                <th>5 年末本息</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="g in ladder.legs" :key="g.term">
                <td>{{ g.term }} 年档</td>
                <td>{{ money(g.amount) }}</td>
                <td>{{ g.pct.toFixed(0) }}%</td>
                <td>{{ pct(g.rate) }}</td>
                <td>{{ money(g.termInterest) }}</td>
                <td>{{ money(g.finalAt5) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>合计</td>
                <td>{{ money(Number(principal) || 0) }}</td>
                <td>100%</td>
                <td>—</td>
                <td>—</td>
                <td>{{ money(ladder.total) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </TuOutput>
      <p class="tu-hint dp-note">
        5 年累计利息 <b>{{ money(ladder.interestAt5) }}</b> 元，加权年化 {{ pct(ladder.annualized) }}；比全额存 5 年少赚
        {{ money(ladder.liquidityCost) }} 元。「期内利息」是该笔存满自己期限的利息；「5 年末本息」把 1/3 年档到期后继续按 1 年期续存到第 5 年，便于横向相加。
      </p>

      <TuOutput title="各年末可支取（阶梯的流动性）" :text="timelineText" filename="deposit-timeline.txt">
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>时点</th>
                <th>到期档位</th>
                <th>可支取金额（按续存推算）</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in ladder.timeline" :key="t.year">
                <td>第 {{ t.year }} 年末</td>
                <td>{{ t.matured }}</td>
                <td>{{ money(t.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TuOutput>
      <p class="tu-hint dp-note">
        1 年档每年到期一次，是这套配置的应急出口；3 年档与 5 年档中途取出会按活期计息，损失约 {{ money(ladder.earlyLoss) }} 元。
      </p>

      <TuOutput title="滚动续存策略比选（统一时间口径）" :text="strategyText" filename="deposit-strategy.txt">
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>口径</th>
                <th>策略</th>
                <th>分步</th>
                <th>利息</th>
                <th>期末本息</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in strategyRows" :key="s.key" :class="{ 'dp-best': best && s.key === best.key }">
                <td>{{ s.scope }}</td>
                <td>
                  {{ s.label }}
                  <span v-if="best && s.key === best.key" class="dp-badge">收益最高</span>
                </td>
                <td>{{ s.steps }}</td>
                <td>{{ money(s.interest) }}</td>
                <td>{{ money(s.total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TuOutput>
      <p class="tu-hint dp-note">
        只有把不同期限折算到同一时点，才能判断哪种存法更赚；{{ compound ? '本息续存下，短期续存的复利会被长期利率的差距吃掉' : '只续本金时利息不再生息，长期锁定优势更明显' }}。
      </p>

      <TuOutput title="不同本金下的差异" :text="scaleText" filename="deposit-scale.txt">
        <div class="tu-table-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>本金</th>
                <th>阶梯 5 年利息</th>
                <th>相对全额 5 年少赚</th>
                <th>需分银行</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in result.scaleTable" :key="s.principal" :class="{ 'dp-best': s.current }">
                <td>
                  {{ wan(s.principal) }}
                  <span v-if="s.current" class="dp-badge">当前</span>
                </td>
                <td>{{ money(s.ladderInterest) }}</td>
                <td>{{ money(s.gapToPure) }}</td>
                <td>{{ s.banks }} 家</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TuOutput>
      <p class="tu-hint dp-note">
        收益是按比例线性放大的，比例结论不会因为本金变大而改变；本金规模真正改变的是利息绝对差、以及超过 50 万存款保险上限后必须分银行存放。
      </p>

      <details class="tu-folding">
        <summary>推荐依据与使用说明</summary>
        <div class="tu-folding-body">
          <ol>
            <li>定期整存整取按<b>单利</b>计息：利息 = 本金 × 年利率 × 存期，单期内没有复利，所以「5 年一次存」的利息就是本金 ×5 年利率 ×5。</li>
            <li><b>复利只来自续存</b>：本息续存才利滚利；只续本金、利息取走则相当于单利滚动。</li>
            <li>跨期限比较统一折算到 <b>5 年期末</b>：1 年档滚 5 次、3+1+1、1+3+1、一次存 5 年，四种走法的收益差异一目了然。</li>
            <li>推荐配置的推导：先按「5 年内流动资金占比」切出 1 年档（保证每年有到期现金流），剩余对半分给 3 年与 5 年；差额即「流动性成本」——为随时用钱付出的代价。</li>
            <li>本金越大，绝对利息差越大，但比例结论不变；超过 50 万建议按银行分散（存款保险每人每行 50 万），并且每家的资金可独立做同样的阶梯。</li>
            <li>提前支取按活期计息，是长期存款最大的隐性成本；确有周转需求时优先动 1 年档，或使用可部分支取的产品。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.dp-rate-grid {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 6px 8px;
  align-items: center;
}
.dp-rate-eq {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}
.dp-presets {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
}
.dp-note {
  margin: 6px 0 14px;
  line-height: 1.6;
}
.dp-card-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-muted);
}
.dp-warn {
  margin: 12px 0 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text-muted);
}
.dp-bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}
.dp-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.dp-bar-label {
  width: 40px;
  color: var(--color-text-muted);
}
.dp-bar-track {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--color-border);
  overflow: hidden;
}
.dp-bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--color-primary);
}
.dp-bar-value {
  width: 96px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.dp-best {
  background: var(--color-primary-soft);
}
.tu-table tfoot td {
  font-weight: 600;
  background: var(--color-bg-hover);
}
.dp-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 17px;
  white-space: nowrap;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
</style>
