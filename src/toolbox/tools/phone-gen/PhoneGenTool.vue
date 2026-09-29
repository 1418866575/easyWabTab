<script setup lang="ts">
/**
 * 手机号生成器：3 位在用运营商号段 + 8 位随机数字
 * 号段取自移动 / 联通 / 电信在用的公开号段，可指定或随机。
 */
import { computed, ref } from 'vue'
import {
  PHONE_PREFIXES,
  generateBatch,
  generatePhone,
  normalizeCount,
  validatePhone
} from '../../core/idnumber'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import TuField from '../../components/tool/TuField.vue'
import TuNumberResult from '../../components/tool/TuNumberResult.vue'

const countInput = ref(10)
const prefix = ref('')
const items = ref<string[]>([])

const count = computed(() => normalizeCount(countInput.value))

useDirtyFlag(() => items.value.length > 0)

function generate() {
  items.value = generateBatch(count.value, () => generatePhone({ prefix: prefix.value || undefined }))
}

function clear() {
  items.value = []
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-row">
      <TuField label="号码段">
        <select v-model="prefix" class="tu-select tu-inline">
          <option value="">随机</option>
          <option v-for="p in PHONE_PREFIXES" :key="p" :value="p">{{ p }}</option>
        </select>
      </TuField>
    </div>

    <TuNumberResult
      :items="items"
      filename="phone.txt"
      :validate="validatePhone"
      placeholder="输入 11 位手机号进行校验，如 13800138000"
      :count="count"
      empty="点击「生成」按钮生成手机号"
      @update:count="countInput = $event"
      @generate="generate"
      @clear="clear"
    >
      <template #help>
        <ol>
          <li>可指定 3 位号段（移动 / 联通 / 电信在用号段），留空则随机。</li>
          <li>结构为 3 位号段 + 8 位随机数字，共 11 位；号段非法时会自动回退随机号段。</li>
          <li>校验规则：1 开头、第二位 3-9、共 11 位数字，输入中的空格会被忽略。</li>
          <li>数量支持 1-1000，超出自动收敛；结果超过 200 条时列表只展示前 200 条。</li>
          <li>号码为随机生成，不指向任何真实用户，请勿用于注册、营销等真实场景。</li>
        </ol>
      </template>
    </TuNumberResult>
  </div>
</template>
