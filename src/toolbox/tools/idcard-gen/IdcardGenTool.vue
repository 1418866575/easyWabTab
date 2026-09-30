<script setup lang="ts">
/**
 * 身份证号生成器：18 位，6 位地区码 + 8 位出生日期 + 3 位顺序码 + ISO 7064 Mod 11,2 校验码
 * 可指定省份 / 城市 / 性别 / 年龄段，支持批量生成与反向校验。
 */
import { computed, ref, watch } from 'vue'
import {
  AGE_RANGES,
  generateBatch,
  generateIdCard,
  listCities,
  listProvinces,
  normalizeCount,
  validateIdCard,
  type AgeRange,
  type GenderOption
} from '../../core/idnumber'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import TuField from '../../components/tool/TuField.vue'
import TuNumberResult from '../../components/tool/TuNumberResult.vue'

const countInput = ref(10)
const province = ref('')
const city = ref('')
const gender = ref<GenderOption>('any')
const ageRange = ref<AgeRange>('')
const items = ref<string[]>([])

const provinces = listProvinces()
const cities = computed(() => (province.value ? listCities(province.value) : []))
const count = computed(() => normalizeCount(countInput.value))

/** 换省份后原城市码不再有效，清空避免生成非法组合 */
watch(province, () => {
  city.value = ''
})

useDirtyFlag(() => items.value.length > 0)

function generate() {
  items.value = generateBatch(count.value, () =>
    generateIdCard({
      province: province.value || undefined,
      city: city.value || undefined,
      gender: gender.value,
      ageRange: ageRange.value
    })
  )
}

function clear() {
  items.value = []
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-row idc-opts">
      <TuField label="省份">
        <select v-model="province" class="tu-select tu-inline">
          <option value="">随机</option>
          <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
        </select>
      </TuField>
      <TuField v-if="cities.length" label="城市 / 地区">
        <select v-model="city" class="tu-select tu-inline">
          <option value="">随机</option>
          <option v-for="c in cities" :key="c.code" :value="c.code">{{ c.name }}</option>
        </select>
      </TuField>
      <TuField label="性别">
        <select v-model="gender" class="tu-select tu-inline">
          <option value="any">随机</option>
          <option value="male">男</option>
          <option value="female">女</option>
        </select>
      </TuField>
      <TuField label="年龄段">
        <select v-model="ageRange" class="tu-select tu-inline">
          <option v-for="a in AGE_RANGES" :key="a.value" :value="a.value">{{ a.label }}</option>
        </select>
      </TuField>
    </div>

    <TuNumberResult
      :items="items"
      filename="idcard.txt"
      :validate="validateIdCard"
      placeholder="输入 18 位身份证号进行校验，如 110101199003071234"
      :count="count"
      empty="点击「生成」按钮生成身份证号"
      @update:count="countInput = $event"
      @generate="generate"
      @clear="clear"
    >
      <template #help>
        <ol>
          <li>先选省份 / 城市（留空为全国随机），再选性别与年龄段，点击「生成」。</li>
          <li>结构：6 位地区码 + 8 位出生日期（YYYYMMDD）+ 3 位顺序码（末位奇男偶女）+ 1 位校验码。</li>
          <li>校验规则为 ISO 7064 Mod 11,2，校验通过时会回显地区、出生日期与性别。</li>
          <li>数量支持 1-1000，超出自动收敛；结果超过 200 条时列表只展示前 200 条。</li>
          <li>全部数据在本机生成，仅用于开发与测试，请勿用于任何真实业务场景。</li>
        </ol>
      </template>
    </TuNumberResult>
  </div>
</template>

<style scoped>
.idc-opts { flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.idc-opts :deep(.tu-field) { margin-bottom: 0; }
</style>
