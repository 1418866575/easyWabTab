<script setup lang="ts">
/**
 * 统一社会信用代码生成器：GB 32100-2015，18 位
 * 1 位登记管理部门 + 1 位机构类别 + 6 位地区码 + 9 位主体标识（组织机构代码）+ 1 位 ISO 7064 Mod 31,31 校验码
 */
import { computed, ref, watch } from 'vue'
import {
  generateBatch,
  generateCreditCode,
  listCities,
  listProvinces,
  normalizeCount,
  validateCreditCode
} from '../../core/idnumber'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import TuField from '../../components/tool/TuField.vue'
import TuNumberResult from '../../components/tool/TuNumberResult.vue'

const countInput = ref(10)
const province = ref('')
const city = ref('')
const items = ref<string[]>([])

const provinces = listProvinces()
const cities = computed(() => (province.value ? listCities(province.value) : []))
const count = computed(() => normalizeCount(countInput.value))

watch(province, () => {
  city.value = ''
})

useDirtyFlag(() => items.value.length > 0)

function generate() {
  items.value = generateBatch(count.value, () =>
    generateCreditCode({ province: province.value || undefined, city: city.value || undefined })
  )
}

function clear() {
  items.value = []
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-row cc-opts">
      <TuField label="登记省份">
        <select v-model="province" class="tu-select tu-inline">
          <option value="">随机</option>
          <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
        </select>
      </TuField>
      <TuField v-if="cities.length" label="登记城市 / 地区">
        <select v-model="city" class="tu-select tu-inline">
          <option value="">随机</option>
          <option v-for="c in cities" :key="c.code" :value="c.code">{{ c.name }}</option>
        </select>
      </TuField>
    </div>

    <TuNumberResult
      :items="items"
      filename="creditcode.txt"
      :validate="validateCreditCode"
      placeholder="输入 18 位统一社会信用代码进行校验，如 91310000702818468A"
      :count="count"
      empty="点击「生成」按钮生成统一社会信用代码"
      @update:count="countInput = $event"
      @generate="generate"
      @clear="clear"
    >
      <template #help>
        <ol>
          <li>先选登记省份 / 城市（留空为全国随机），点击「生成」。</li>
          <li>结构：1 位登记管理部门 + 1 位机构类别 + 6 位地区码 + 9 位主体标识 + 1 位校验码。</li>
          <li>校验规则为 ISO 7064 Mod 31,31，校验通过时会回显登记地区。</li>
          <li>数量支持 1-1000，超出自动收敛；结果超过 200 条时列表只展示前 200 条。</li>
          <li>全部数据在本机生成，仅用于开发与测试，请勿用于任何真实业务场景。</li>
        </ol>
      </template>
    </TuNumberResult>
  </div>
</template>

<style scoped>
.cc-opts { flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.cc-opts :deep(.tu-field) { margin-bottom: 0; }
</style>
