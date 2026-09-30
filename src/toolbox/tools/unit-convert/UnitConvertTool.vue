<script setup lang="ts">
/**
 * 单位换算器（长度 / 重量 / 温度 / 面积 / 体积 / 速度 / 数据存储 / 时间）
 */
import { computed, ref, watch } from 'vue'
import { convertUnit, getCategory, UNIT_CATEGORIES } from '../../core/unit'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const categoryId = ref('length')
const value = ref(1)
const from = ref('m')
const to = ref('cm')
const precision = ref(6)

useDirtyFlag(() => !!String(value.value))
const { copy } = useToolActions()

const category = computed(() => getCategory(categoryId.value))

watch(category, c => {
  if (!c.units.some(u => u.id === from.value)) from.value = c.units[0].id
  if (!c.units.some(u => u.id === to.value)) to.value = c.units[1]?.id || c.units[0].id
})

const result = computed(() =>
  convertUnit(categoryId.value, Number(value.value), from.value, to.value, precision.value)
)

const allText = computed(() =>
  result.value.ok ? result.value.all.map(x => `${x.name}\t${x.text}`).join('\n') : ''
)

function swap() {
  const f = from.value
  from.value = to.value
  to.value = f
}
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="类别">
        <div class="tu-toolbar">
          <button
            v-for="c in UNIT_CATEGORIES"
            :key="c.id"
            type="button"
            class="tu-check"
            :class="{ 'is-on': categoryId === c.id }"
            @click="categoryId = c.id"
          >{{ c.name }}</button>
        </div>
      </TuField>

      <TuField label="数值">
        <input v-model.number="value" type="number" step="any" class="tu-input" data-testid="tb-modal-input" />
      </TuField>

      <TuField label="单位">
        <div class="tu-row">
          <select v-model="from" class="tu-select">
            <option v-for="u in category.units" :key="u.id" :value="u.id">{{ u.name }}</option>
          </select>
          <button type="button" class="tu-btn ghost" @click="swap">⇄</button>
          <select v-model="to" class="tu-select">
            <option v-for="u in category.units" :key="u.id" :value="u.id">{{ u.name }}</option>
          </select>
        </div>
      </TuField>

      <TuField label="小数精度" :extra="String(precision)">
        <input v-model.number="precision" type="range" min="0" max="10" class="tu-range" />
      </TuField>
    </div>

    <div>
      <TuOutput
        title="换算结果"
        :text="result.ok ? result.text : ''"
        filename="unit.txt"
        empty="输入有效数值"
      >
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!result.ok" @click="copy(result.text)">复制</button>
        </template>
        <p v-if="!result.ok" class="tu-alert">{{ result.error }}</p>
        <template v-else>
          <div class="tu-card">
            <div class="tu-card-title">
              {{ value }} {{ category.units.find(u => u.id === from)?.name }}
            </div>
            <div class="tu-card-value tu-mono">
              {{ result.text }} {{ category.units.find(u => u.id === to)?.name }}
            </div>
          </div>
        </template>
      </TuOutput>

      <TuOutput title="该类全部单位" :text="allText" filename="unit-all.txt" empty="—">
        <div class="tu-table-wrap">
          <table class="tu-table">
            <tbody>
              <tr v-for="u in result.all" :key="u.id">
                <td style="width: 140px">{{ u.name }}</td>
                <td class="tu-mono break">{{ u.text }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TuOutput>

      <details class="tu-folding">
        <summary>使用说明</summary>
        <div class="tu-folding-body">
          <ol>
            <li>共支持 8 大类单位，切换类别后自动重置可选单位。</li>
            <li>温度采用仿射换算（摄氏/华氏/开尔文），数据存储同时给出 SI 与 IEC 口径。</li>
            <li>下方列表给出该类别所有单位的换算值，便于对照。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 13px; }
.break { word-break: break-all; }
</style>
