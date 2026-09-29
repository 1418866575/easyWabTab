<script setup lang="ts">
/**
 * 进制转换（2–36，BigInt 保证大数精度）
 */
import { computed, ref } from 'vue'
import { convertBase, groupDigits, isValidBase, multiBase } from '../../core/base'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const value = ref('255')
const from = ref(10)
const to = ref(16)
const group = ref(0)

useDirtyFlag(() => !!value.value.trim())
const { copy } = useToolActions()

const result = computed(() => convertBase(value.value, Number(from.value), Number(to.value)))
const all = computed(() => multiBase(value.value, Number(from.value)))
const grouped = computed(() => (group.value > 0 ? groupDigits(result.value.text, group.value) : result.value.text))

const baseError = computed(() => {
  if (!isValidBase(Number(from.value))) return '源进制需在 2–36 之间'
  if (!isValidBase(Number(to.value))) return '目标进制需在 2–36 之间'
  return ''
})

const BASES = [2, 8, 10, 16, 32, 36]
</script>

<template>
  <div class="tu-t1">
    <div class="tu-row">
      <span class="tu-label">源进制</span>
      <select v-model.number="from" class="tu-select tu-inline" style="max-width: 110px">
        <option v-for="b in BASES" :key="b" :value="b">{{ b }}</option>
      </select>
      <span class="tu-label">目标进制</span>
      <select v-model.number="to" class="tu-select tu-inline" style="max-width: 110px">
        <option v-for="b in BASES" :key="b" :value="b">{{ b }}</option>
      </select>
      <span class="tu-label">分组</span>
      <select v-model.number="group" class="tu-select tu-inline" style="max-width: 110px">
        <option :value="0">不分组</option>
        <option :value="4">每 4 位</option>
        <option :value="8">每 8 位</option>
      </select>
    </div>

    <TuField label="输入值（支持负号与下划线分隔）">
      <input v-model="value" class="tu-input" spellcheck="false" placeholder="255" data-testid="tb-modal-input" />
    </TuField>

    <p v-if="baseError" class="tu-alert">{{ baseError }}</p>
    <p v-else-if="!result.ok" class="tu-alert">{{ result.error }}</p>

    <TuOutput
      :title="`转换结果（${from} → ${to}）`"
      :text="result.text"
      filename="base-result.txt"
      empty="输入合法数值后显示结果"
    >
      <pre class="tu-code">{{ result.ok ? grouped : '—' }}</pre>
    </TuOutput>

    <TuOutput
      title="常用进制一览"
      :text="`BIN  ${all.bin}\nOCT  ${all.oct}\nDEC  ${all.dec}\nHEX  ${all.hex}`"
      filename="base-all.txt"
      empty="—"
    >
      <div class="tu-grid">
        <div class="tu-card">
          <div class="tu-card-title">二进制 BIN (2)</div>
          <div class="tu-card-value tu-mono break">{{ all.bin || '—' }}</div>
        </div>
        <div class="tu-card">
          <div class="tu-card-title">八进制 OCT (8)</div>
          <div class="tu-card-value tu-mono break">{{ all.oct || '—' }}</div>
        </div>
        <div class="tu-card">
          <div class="tu-card-title">十进制 DEC (10)</div>
          <div class="tu-card-value tu-mono break">{{ all.dec || '—' }}</div>
        </div>
        <div class="tu-card">
          <div class="tu-card-title">十六进制 HEX (16)</div>
          <div class="tu-card-value tu-mono break">{{ all.hex || '—' }}</div>
        </div>
      </div>
    </TuOutput>

    <div class="tu-row">
      <button type="button" class="tu-btn ghost" :disabled="!result.ok" @click="copy(result.text)">复制结果</button>
    </div>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>支持 2–36 进制互转，内部使用 BigInt，超出 Number 安全范围也不会失真。</li>
          <li>输入可带负号；可用下划线或空格做分隔（如 <code>1111_0000</code>）。</li>
          <li>「分组」仅影响显示，便于阅读长二进制 / 十六进制串。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
.break { word-break: break-all; }
.tu-code {
  margin: 0;
  font-family: var(--font-family-mono);
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
