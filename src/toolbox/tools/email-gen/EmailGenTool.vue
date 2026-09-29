<script setup lang="ts">
/**
 * 邮箱生成器：随机账号 + 常见邮箱域名
 * QQ / Foxmail 域名使用纯数字账号（5-11 位），其余域名使用字母数字账号（6-12 位）。
 */
import { computed, ref } from 'vue'
import {
  EMAIL_DOMAINS,
  generateBatch,
  generateEmail,
  normalizeCount,
  validateEmail
} from '../../core/idnumber'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import TuField from '../../components/tool/TuField.vue'
import TuNumberResult from '../../components/tool/TuNumberResult.vue'

const countInput = ref(10)
const domain = ref('')
const items = ref<string[]>([])

const count = computed(() => normalizeCount(countInput.value))

useDirtyFlag(() => items.value.length > 0)

function generate() {
  items.value = generateBatch(count.value, () => generateEmail({ domain: domain.value || undefined }))
}

function clear() {
  items.value = []
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-row">
      <TuField label="邮箱域名">
        <select v-model="domain" class="tu-select tu-inline">
          <option value="">随机</option>
          <option v-for="d in EMAIL_DOMAINS" :key="d" :value="d">{{ d }}</option>
        </select>
      </TuField>
    </div>

    <TuNumberResult
      :items="items"
      filename="email.txt"
      :validate="validateEmail"
      placeholder="输入邮箱地址进行校验，如 name@example.com"
      :count="count"
      empty="点击「生成」按钮生成邮箱地址"
      @update:count="countInput = $event"
      @generate="generate"
      @clear="clear"
    >
      <template #help>
        <ol>
          <li>可指定域名（如 qq.com / 163.com / gmail.com），留空则从常见域名中随机。</li>
          <li>QQ 与 Foxmail 域名生成纯数字账号（5-11 位），其余域名生成字母数字账号（6-12 位）。</li>
          <li>校验按通用邮箱格式检查（本地部分 + @ + 域名 + 顶级域），长度上限 254 字符。</li>
          <li>数量支持 1-1000，超出自动收敛；结果超过 200 条时列表只展示前 200 条。</li>
          <li>地址随机生成，不保证真实存在，请勿用于真实注册或发送邮件。</li>
        </ol>
      </template>
    </TuNumberResult>
  </div>
</template>
