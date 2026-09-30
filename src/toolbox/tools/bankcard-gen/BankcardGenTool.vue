<script setup lang="ts">
/**
 * 银行卡号生成器：发卡行标识（BIN）+ 随机账号 + Luhn 校验位
 * 位数 16-19 位可选，留空为随机；校验使用标准 Luhn 算法。
 */
import { computed, ref } from 'vue'
import {
  BANK_CARD_PREFIXES,
  generateBankCard,
  generateBatch,
  normalizeCount,
  validateBankCard
} from '../../core/idnumber'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import TuField from '../../components/tool/TuField.vue'
import TuNumberResult from '../../components/tool/TuNumberResult.vue'

const countInput = ref(10)
const prefix = ref('')
const length = ref('')
const items = ref<string[]>([])

const count = computed(() => normalizeCount(countInput.value))

useDirtyFlag(() => items.value.length > 0)

function generate() {
  items.value = generateBatch(count.value, () =>
    generateBankCard({
      prefix: prefix.value || undefined,
      length: length.value ? Number(length.value) : undefined
    })
  )
}

function clear() {
  items.value = []
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-row bc-opts">
      <TuField label="发卡行标识">
        <select v-model="prefix" class="tu-select tu-inline">
          <option value="">随机</option>
          <option v-for="p in BANK_CARD_PREFIXES" :key="p" :value="p">{{ p }}</option>
        </select>
      </TuField>
      <TuField label="卡号位数">
        <select v-model="length" class="tu-select tu-inline">
          <option value="">随机（16-19）</option>
          <option value="16">16 位</option>
          <option value="17">17 位</option>
          <option value="18">18 位</option>
          <option value="19">19 位</option>
        </select>
      </TuField>
    </div>

    <TuNumberResult
      :items="items"
      filename="bankcard.txt"
      :validate="validateBankCard"
      placeholder="输入银行卡号进行校验，如 6222021234567890123"
      :count="count"
      empty="点击「生成」按钮生成银行卡号"
      @update:count="countInput = $event"
      @generate="generate"
      @clear="clear"
    >
      <template #help>
        <ol>
          <li>可指定发卡行标识（BIN）与卡号位数，留空则随机；末位为 Luhn 校验位。</li>
          <li>位数不足时会自动按所选前缀补齐随机账号，前缀非法则回退随机前缀。</li>
          <li>校验规则为 Luhn（模 10）算法，支持 13-19 位，输入中的空格会被忽略。</li>
          <li>数量支持 1-1000，超出自动收敛；结果超过 200 条时列表只展示前 200 条。</li>
          <li>仅生成符合校验规则的号码，不涉及任何真实账户，请勿用于真实业务场景。</li>
        </ol>
      </template>
    </TuNumberResult>
  </div>
</template>

<style scoped>
.bc-opts { flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.bc-opts :deep(.tu-field) { margin-bottom: 0; }
</style>
