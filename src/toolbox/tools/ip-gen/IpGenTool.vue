<script setup lang="ts">
/**
 * IP 地址生成器：默认随机私网地址（10.x / 172.16-31.x / 192.168.x）
 * 可指定 1-3 段网段前缀（如 10.5），前缀非法时回退随机私网地址。
 */
import { computed, ref } from 'vue'
import { generateBatch, generateIP, normalizeCount, validateIP } from '../../core/idnumber'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import TuField from '../../components/tool/TuField.vue'
import TuNumberResult from '../../components/tool/TuNumberResult.vue'

const countInput = ref(10)
const prefix = ref('')
const items = ref<string[]>([])

const count = computed(() => normalizeCount(countInput.value))
const prefixValid = computed(() => {
  const raw = prefix.value.trim()
  if (!raw) return true
  const parts = raw.split('.').filter(p => p !== '')
  return parts.length > 0 && parts.length <= 3 && parts.every(p => /^\d+$/.test(p) && Number(p) <= 255)
})

useDirtyFlag(() => items.value.length > 0)

function generate() {
  items.value = generateBatch(count.value, () => generateIP({ prefix: prefix.value || undefined }))
}

function clear() {
  items.value = []
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-row">
      <TuField
        label="网段前缀"
        :hint="prefixValid ? '留空为随机私网地址；支持 1-3 段，如 10 / 10.5 / 192.168.1' : '前缀不合法，将回退为随机私网地址'"
      >
        <input
          v-model="prefix"
          class="tu-input tu-inline"
          style="max-width: 180px"
          placeholder="如 10.5（留空随机私网）"
          spellcheck="false"
        />
      </TuField>
    </div>

    <TuNumberResult
      :items="items"
      filename="ip.txt"
      :validate="validateIP"
      placeholder="输入 IPv4 地址进行校验，如 192.168.1.23"
      :count="count"
      empty="点击「生成」按钮生成 IP 地址"
      @update:count="countInput = $event"
      @generate="generate"
      @clear="clear"
    >
      <template #help>
        <ol>
          <li>留空时随机生成私网地址（10.x.x.x / 172.16-31.x.x / 192.168.x.x）。</li>
          <li>填写前缀后按 1-3 段补全剩余段位；前缀非法（含非数字、超 255、超过 3 段）时回退随机私网。</li>
          <li>校验按 IPv4 四段 0-255 规则检查，并提示是私网、公网还是保留地址。</li>
          <li>数量支持 1-1000，超出自动收敛；结果超过 200 条时列表只展示前 200 条。</li>
          <li>地址随机生成，仅用于开发与测试，请勿用于任何真实网络场景。</li>
        </ol>
      </template>
    </TuNumberResult>
  </div>
</template>
