<script setup lang="ts">
/**
 * BMI 与每日热量计算（BMR 用 Mifflin-St Jeor 公式）
 */
import { computed, ref } from 'vue'
import { ACTIVITY_LEVELS, calcBmi, type ActivityLevel, type Sex } from '../../core/bmi'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const height = ref(172)
const weight = ref(68)
const age = ref(30)
const sex = ref<Sex>('male')
const activity = ref<ActivityLevel>(2)
const standard = ref<'who' | 'asia'>('who')
const ratio = ref({ protein: 30, fat: 25, carb: 45 })

useDirtyFlag(() => Number(height.value) > 0 && Number(weight.value) > 0)
const { copy } = useToolActions()

const result = computed(() =>
  calcBmi({
    height: Number(height.value) || 0,
    weight: Number(weight.value) || 0,
    age: Number(age.value) || 0,
    sex: sex.value,
    activity: activity.value,
    standard: standard.value,
    macroRatio: { ...ratio.value }
  })
)

const ratioSum = computed(() => ratio.value.protein + ratio.value.fat + ratio.value.carb)

const summaryText = computed(() =>
  result.value.ok
    ? [
        `BMI：${result.value.bmi}（${result.value.bmiLevel}）`,
        `基础代谢 BMR：${result.value.bmr} kcal/天`,
        `每日总消耗 TDEE：${result.value.tdee} kcal/天`,
        `理想体重范围：${result.value.idealRange.min} – ${result.value.idealRange.max} kg`,
        `减脂建议摄入：${result.value.target.cut} kcal/天`,
        `维持体重摄入：${result.value.target.maintain} kcal/天`,
        `增肌建议摄入：${result.value.target.bulk} kcal/天`
      ].join('\n')
    : ''
)

const macroText = computed(() =>
  result.value.ok
    ? `蛋白质 ${result.value.macros.protein} g\n脂肪 ${result.value.macros.fat} g\n碳水 ${result.value.macros.carb} g`
    : ''
)
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="身高（cm）">
        <input v-model.number="height" type="number" min="0" class="tu-input" data-testid="tb-modal-input" />
      </TuField>
      <TuField label="体重（kg）">
        <input v-model.number="weight" type="number" min="0" step="0.1" class="tu-input" />
      </TuField>
      <TuField label="年龄">
        <input v-model.number="age" type="number" min="0" class="tu-input" />
      </TuField>

      <TuField label="性别">
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': sex === 'male' }" @click="sex = 'male'">男</button>
          <button type="button" class="tu-check" :class="{ 'is-on': sex === 'female' }" @click="sex = 'female'">女</button>
        </div>
      </TuField>

      <TuField label="活动强度">
        <select v-model.number="activity" class="tu-select">
          <option v-for="a in ACTIVITY_LEVELS" :key="a.id" :value="a.id">{{ a.name }}（×{{ a.factor }}）</option>
        </select>
      </TuField>

      <TuField label="BMI 标准">
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': standard === 'who' }" @click="standard = 'who'">
            WHO 标准
          </button>
          <button type="button" class="tu-check" :class="{ 'is-on': standard === 'asia' }" @click="standard = 'asia'">
            亚太标准
          </button>
        </div>
      </TuField>

      <TuField label="三大营养素比例（%）" :extra="`合计 ${ratioSum}%`">
        <div class="tu-row">
          <span class="tu-label">蛋白</span>
          <input v-model.number="ratio.protein" type="number" min="0" class="tu-input tu-inline" style="max-width: 80px" />
          <span class="tu-label">脂肪</span>
          <input v-model.number="ratio.fat" type="number" min="0" class="tu-input tu-inline" style="max-width: 80px" />
          <span class="tu-label">碳水</span>
          <input v-model.number="ratio.carb" type="number" min="0" class="tu-input tu-inline" style="max-width: 80px" />
        </div>
        <p v-if="ratioSum !== 100" class="tu-hint">当前合计 {{ ratioSum }}%，建议调整为 100%</p>
      </TuField>
    </div>

    <div>
      <p v-if="!result.ok" class="tu-alert">{{ result.error }}</p>

      <TuOutput title="计算结果" :text="summaryText" filename="bmi.txt" empty="填写身体数据后自动计算">
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!summaryText" @click="copy(summaryText)">复制</button>
        </template>
        <div class="tu-grid">
          <div class="tu-card">
            <div class="tu-card-title">BMI</div>
            <div class="tu-card-value">{{ result.bmi }}</div>
            <div class="tu-hint">{{ result.bmiLevel }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">基础代谢 BMR</div>
            <div class="tu-card-value">{{ result.bmr }}</div>
            <div class="tu-hint">kcal/天</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">每日消耗 TDEE</div>
            <div class="tu-card-value">{{ result.tdee }}</div>
            <div class="tu-hint">kcal/天</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">理想体重</div>
            <div class="tu-card-value">{{ result.idealRange.min }}–{{ result.idealRange.max }}</div>
            <div class="tu-hint">kg</div>
          </div>
        </div>
      </TuOutput>

      <TuOutput title="热量目标" :text="`减脂 ${result.target.cut}\n维持 ${result.target.maintain}\n增肌 ${result.target.bulk}`" filename="calorie.txt" empty="—">
        <div class="tu-grid">
          <div class="tu-card">
            <div class="tu-card-title">减脂（-20%）</div>
            <div class="tu-card-value">{{ result.target.cut }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">维持</div>
            <div class="tu-card-value">{{ result.target.maintain }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">增肌（+15%）</div>
            <div class="tu-card-value">{{ result.target.bulk }}</div>
          </div>
        </div>
      </TuOutput>

      <TuOutput title="三大营养素（克）" :text="macroText" filename="macros.txt" empty="—">
        <div class="tu-grid">
          <div class="tu-card">
            <div class="tu-card-title">蛋白质</div>
            <div class="tu-card-value">{{ result.macros.protein }} g</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">脂肪</div>
            <div class="tu-card-value">{{ result.macros.fat }} g</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">碳水</div>
            <div class="tu-card-value">{{ result.macros.carb }} g</div>
          </div>
        </div>
      </TuOutput>

      <details class="tu-folding">
        <summary>使用说明</summary>
        <div class="tu-folding-body">
          <ol>
            <li>BMI 支持 WHO 与亚太两套分级标准。</li>
            <li>BMR 采用 Mifflin-St Jeor 公式，TDEE = BMR × 活动系数。</li>
            <li>三大营养素比例可自定义，按维持热量换算为克数。</li>
            <li>结果仅供参考，不构成医疗建议。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>
