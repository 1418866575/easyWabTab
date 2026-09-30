<script setup lang="ts">
/**
 * 组织机构代码生成器：GB/T 11714，8 位主体标识 + 1 位校验码（可选连字符）
 * 字符集排除易混淆的 I / O / S / V / Z，校验和为 11 取模（10 记为 X）。
 */
import { computed, ref } from 'vue'
import { generateBatch, generateOrgCode, normalizeCount, validateOrgCode } from '../../core/idnumber'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import TuField from '../../components/tool/TuField.vue'
import TuNumberResult from '../../components/tool/TuNumberResult.vue'

const countInput = ref(10)
const hyphen = ref(true)
const items = ref<string[]>([])

const count = computed(() => normalizeCount(countInput.value))

useDirtyFlag(() => items.value.length > 0)

function generate() {
  items.value = generateBatch(count.value, () => generateOrgCode({ hyphen: hyphen.value }))
}

function clear() {
  items.value = []
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-row">
      <TuField label="输出格式">
        <button type="button" class="tu-check" :class="{ 'is-on': hyphen }" @click="hyphen = !hyphen">
          带连字符（XXXXXXXX-X）
        </button>
      </TuField>
    </div>

    <TuNumberResult
      :items="items"
      filename="orgcode.txt"
      :validate="validateOrgCode"
      placeholder="输入组织机构代码进行校验，如 70281846-8"
      :count="count"
      empty="点击「生成」按钮生成组织机构代码"
      @update:count="countInput = $event"
      @generate="generate"
      @clear="clear"
    >
      <template #help>
        <ol>
          <li>勾选「带连字符」时输出 XXXXXXXX-X，否则输出 9 位连续字符。</li>
          <li>代码由 8 位主体标识（数字 + 大写字母）+ 1 位校验码组成，字符集不含 I、O、S、V、Z。</li>
          <li>校验时连字符可写可不写，会自动忽略；校验和按 GB/T 11714 加权取模计算。</li>
          <li>数量支持 1-1000，超出自动收敛；结果超过 200 条时列表只展示前 200 条。</li>
          <li>全部数据在本机生成，仅用于开发与测试，请勿用于任何真实业务场景。</li>
        </ol>
      </template>
    </TuNumberResult>
  </div>
</template>
