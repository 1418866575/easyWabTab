<script setup lang="ts">
/**
 * 购房税费计算器
 *
 * 税费是「政策 + 地方细则」，本工具只实现全国通用规则：
 *   契税（买方）、增值税与个税（卖方，仅二手房）、公共维修基金（买方，仅新房）。
 * 普通住宅判定、维修基金单价各地不同，所以这两项都允许手动改，并在结果下方统一标注免责说明。
 */
import { computed, ref, watch } from 'vue'
import {
  calcHouseTax,
  isOrdinaryByArea,
  MAINTENANCE_DEFAULT,
  type HouseNature,
  type HouseType,
  type TaxMode
} from '../../core/loanExtra'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const nature = ref<HouseNature>('second')
const familyOrder = ref<1 | 2 | 3>(1)
const area = ref(100)
const totalPrice = ref(5000000)
const ordinary = ref(true)
const sellerUnique = ref(true)
const holdYears = ref(5)
const taxMode = ref<TaxMode>('total')
const originalPrice = ref(3000000)
const houseType = ref<HouseType>('high')
const maintenancePerSqm = ref<number>(MAINTENANCE_DEFAULT.high)

/** 面积变化时，按「≤144㎡ 为普通住宅」的通用标准自动同步（用户可手动改） */
watch(area, (a) => {
  ordinary.value = isOrdinaryByArea(a)
})
/** 房屋类型变化时带出对应的维修基金默认单价 */
watch(houseType, (t) => {
  maintenancePerSqm.value = MAINTENANCE_DEFAULT[t]
})

useDirtyFlag(() => Number(totalPrice.value) > 0)
const { copy } = useToolActions()

const result = computed(() =>
  calcHouseTax({
    nature: nature.value,
    familyOrder: familyOrder.value,
    area: Number(area.value) || 0,
    totalPrice: Number(totalPrice.value) || 0,
    ordinary: ordinary.value,
    sellerUnique: sellerUnique.value,
    holdYears: Number(holdYears.value) || 0,
    taxMode: taxMode.value,
    originalPrice: Number(originalPrice.value) || 0,
    houseType: houseType.value,
    maintenancePerSqm: Number(maintenancePerSqm.value) || 0
  })
)

const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const payerLabel = (p: 'buyer' | 'seller') => (p === 'buyer' ? '买方' : '卖方')

const summaryText = computed(() => {
  const r = result.value
  if (!r.ok) return ''
  return [
    `${nature.value === 'new' ? '新房' : '二手房'} · ${area.value}㎡ · 总价 ${money(Number(totalPrice.value))} 元 · ${familyOrder.value === 3 ? '三套及以上' : familyOrder.value === 1 ? '首套' : '二套'}`,
    ...r.items.map(i => `${i.name}（${payerLabel(i.payer)}）：${money(i.amount)} 元 —— ${i.note}`),
    `买方合计：${money(r.buyerTotal)} 元`,
    `卖方合计：${money(r.sellerTotal)} 元`,
    `税费总计：${money(r.total)} 元`
  ].join('\n')
})
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="房产性质">
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': nature === 'new' }" @click="nature = 'new'">新房</button>
          <button type="button" class="tu-check" :class="{ 'is-on': nature === 'second' }" @click="nature = 'second'">二手房</button>
        </div>
      </TuField>

      <TuField label="买房家庭">
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': familyOrder === 1 }" @click="familyOrder = 1">首套房</button>
          <button type="button" class="tu-check" :class="{ 'is-on': familyOrder === 2 }" @click="familyOrder = 2">二套房</button>
          <button type="button" class="tu-check" :class="{ 'is-on': familyOrder === 3 }" @click="familyOrder = 3">三套及以上</button>
        </div>
      </TuField>

      <TuField label="房屋面积（㎡）">
        <input v-model.number="area" type="number" min="0" class="tu-input" data-testid="tb-modal-input" />
      </TuField>

      <TuField label="房屋总价（元）">
        <input v-model.number="totalPrice" type="number" min="0" class="tu-input" />
      </TuField>

      <template v-if="nature === 'second'">
        <TuField label="是否普通住宅" hint="默认按 ≤144㎡ 判定，各地标准不同可手动改">
          <div class="tu-toolbar">
            <button type="button" class="tu-check" :class="{ 'is-on': ordinary }" @click="ordinary = true">普通住宅</button>
            <button type="button" class="tu-check" :class="{ 'is-on': !ordinary }" @click="ordinary = false">非普通住宅</button>
          </div>
        </TuField>

        <TuField label="房产年限（年）">
          <div class="tu-toolbar">
            <button type="button" class="tu-check" :class="{ 'is-on': Number(holdYears) < 2 }" @click="holdYears = 1">2 年以内</button>
            <button type="button" class="tu-check" :class="{ 'is-on': Number(holdYears) >= 2 && Number(holdYears) < 5 }" @click="holdYears = 3">2–5 年</button>
            <button type="button" class="tu-check" :class="{ 'is-on': Number(holdYears) >= 5 }" @click="holdYears = 5">5 年及以上</button>
          </div>
          <input v-model.number="holdYears" type="number" min="0" class="tu-input" style="margin-top: 8px" />
        </TuField>

        <TuField label="卖房家庭">
          <div class="tu-toolbar">
            <button type="button" class="tu-check" :class="{ 'is-on': sellerUnique }" @click="sellerUnique = true">唯一住房</button>
            <button type="button" class="tu-check" :class="{ 'is-on': !sellerUnique }" @click="sellerUnique = false">非唯一住房</button>
          </div>
          <p class="tu-hint">满 5 年且为卖方唯一住房时，个人所得税免征</p>
        </TuField>

        <TuField label="个税计征方式">
          <div class="tu-toolbar">
            <button type="button" class="tu-check" :class="{ 'is-on': taxMode === 'total' }" @click="taxMode = 'total'">按总价 1%</button>
            <button type="button" class="tu-check" :class="{ 'is-on': taxMode === 'diff' }" @click="taxMode = 'diff'">按差额 20%</button>
          </div>
        </TuField>

        <TuField label="房屋原价（元）" hint="按差额计征增值税 / 个税时使用">
          <input v-model.number="originalPrice" type="number" min="0" class="tu-input" />
        </TuField>
      </template>

      <template v-else>
        <TuField label="房屋类型" hint="决定公共维修基金单价">
          <div class="tu-toolbar">
            <button type="button" class="tu-check" :class="{ 'is-on': houseType === 'multi' }" @click="houseType = 'multi'">多层</button>
            <button type="button" class="tu-check" :class="{ 'is-on': houseType === 'midHigh' }" @click="houseType = 'midHigh'">小高层</button>
            <button type="button" class="tu-check" :class="{ 'is-on': houseType === 'high' }" @click="houseType = 'high'">高层</button>
          </div>
        </TuField>

        <TuField label="维修基金单价（元/㎡）">
          <input v-model.number="maintenancePerSqm" type="number" min="0" class="tu-input" />
        </TuField>
      </template>
    </div>

    <div>
      <p v-if="!result.ok" class="tu-alert">{{ result.error }}</p>

      <TuOutput title="税费明细" :text="summaryText" filename="house-tax.txt" empty="填写参数后自动计算">
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!summaryText" @click="copy(summaryText)">复制</button>
        </template>
        <div class="tu-grid">
          <div class="tu-card">
            <div class="tu-card-title">买方合计</div>
            <div class="tu-card-value">{{ money(result.buyerTotal) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">卖方合计</div>
            <div class="tu-card-value">{{ money(result.sellerTotal) }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">税费总计</div>
            <div class="tu-card-value">{{ money(result.total) }}</div>
          </div>
        </div>
        <div class="tu-table-wrap" style="margin-top: 12px">
          <table class="tu-table">
            <thead>
              <tr>
                <th>税种</th>
                <th>缴纳方</th>
                <th>金额（元）</th>
                <th>计税依据</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="i in result.items" :key="i.key">
                <td>{{ i.name }}</td>
                <td>{{ payerLabel(i.payer) }}</td>
                <td>{{ money(i.amount) }}</td>
                <td>{{ i.note }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TuOutput>

      <div class="tu-alert tu-alert--warn">
        以上按全国通用规则估算。普通住宅标准、契税优惠幅度、维修基金单价各地不同，
        实际缴纳请以当地税务与房管部门核定为准。
      </div>

      <details class="tu-folding">
        <summary>规则说明</summary>
        <div class="tu-folding-body">
          <ul>
            <li><strong>契税</strong>（买方）：首套 ≤90㎡ 1%、&gt;90㎡ 1.5%；二套 ≤90㎡ 1%、&gt;90㎡ 2%；三套及以上 3%。</li>
            <li><strong>增值税</strong>（卖方，二手房）：不满 2 年按全额 5%；满 2 年普通住宅免征、非普通住宅按差额 5%。</li>
            <li><strong>个人所得税</strong>（卖方，二手房）：满五唯一免征；否则按总价 1% 或差额 20%。</li>
            <li><strong>印花税</strong>：个人住房买卖暂免征收（保留条目，金额 0）。</li>
            <li><strong>公共维修基金</strong>（买方，新房）：面积 × 单价，多层 50 / 小高层 80 / 高层 100 元/㎡（可改）。</li>
          </ul>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
/* 政策类工具统一加一条警示条：结果只是估算，不能当缴税依据 */
.tu-alert--warn {
  margin-top: 12px;
  color: var(--color-warning);
  background: var(--color-warning-soft);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
}
</style>
