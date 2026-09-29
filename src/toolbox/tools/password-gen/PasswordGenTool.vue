<script setup lang="ts">
/**
 * 密码生成器（本地随机生成 + 熵值评估 + 强度分析）
 */
import { computed, ref } from 'vue'
import { analyzePassword, estimateEntropy, generatePasswords, type PasswordOptions } from '../../core/password'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const length = ref(16)
const lower = ref(true)
const upper = ref(true)
const digit = ref(true)
const symbol = ref(true)
const excludeSimilar = ref(false)
const requireEach = ref(true)
const count = ref(5)
const passwords = ref<string[]>([])
const analyzeInput = ref('')

useDirtyFlag(() => passwords.value.length > 0)
const { copy, save } = useToolActions()

const opts = computed<PasswordOptions>(() => ({
  length: Math.max(4, Math.min(128, Number(length.value) || 16)),
  lower: lower.value,
  upper: upper.value,
  digit: digit.value,
  symbol: symbol.value,
  excludeSimilar: excludeSimilar.value,
  requireEach: requireEach.value
}))

function generate() {
  passwords.value = generatePasswords(Math.max(1, Math.min(100, Number(count.value) || 1)), opts.value)
}

const pwdText = computed(() => passwords.value.join('\n'))

const entropy = computed(() => (passwords.value.length ? estimateEntropy(passwords.value[0], opts.value) : null))

const analyzed = computed(() => (analyzeInput.value ? analyzePassword(analyzeInput.value) : null))
const analyzedEntropy = computed(() =>
  analyzeInput.value ? estimateEntropy(analyzeInput.value, { lower: true, upper: true, digit: true, symbol: true }) : null
)

const poolEmpty = computed(() => !lower.value && !upper.value && !digit.value && !symbol.value)

generate()
</script>

<template>
  <div class="tu-t1">
    <TuField label="密码长度" :extra="String(length)">
      <input v-model.number="length" type="range" min="4" max="64" class="tu-range" />
    </TuField>

    <TuField label="字符集">
      <div class="tu-toolbar">
        <button type="button" class="tu-check" :class="{ 'is-on': lower }" @click="lower = !lower">小写 a-z</button>
        <button type="button" class="tu-check" :class="{ 'is-on': upper }" @click="upper = !upper">大写 A-Z</button>
        <button type="button" class="tu-check" :class="{ 'is-on': digit }" @click="digit = !digit">数字 0-9</button>
        <button type="button" class="tu-check" :class="{ 'is-on': symbol }" @click="symbol = !symbol">符号 !@#$</button>
      </div>
      <div class="tu-row">
        <button type="button" class="tu-check" :class="{ 'is-on': excludeSimilar }" @click="excludeSimilar = !excludeSimilar">
          排除易混淆字符
        </button>
        <button type="button" class="tu-check" :class="{ 'is-on': requireEach }" @click="requireEach = !requireEach">
          每类至少包含一个
        </button>
      </div>
      <p v-if="poolEmpty" class="tu-alert">至少选择一种字符类型</p>
    </TuField>

    <div class="tu-row">
      <span class="tu-label">数量</span>
      <input v-model.number="count" type="number" min="1" max="100" class="tu-input tu-inline" style="max-width: 110px" />
      <button type="button" class="tu-btn" :disabled="poolEmpty" @click="generate">生成</button>
    </div>

    <TuOutput
      :title="`生成结果（${passwords.length} 个）`"
      :text="pwdText"
      filename="passwords.txt"
      empty="点击「生成」"
    >
      <template #actions>
        <button type="button" class="tu-btn ghost" :disabled="!passwords.length" @click="copy(pwdText)">复制全部</button>
        <button type="button" class="tu-btn ghost" :disabled="!passwords.length" @click="save('passwords.txt', pwdText)">
          下载
        </button>
      </template>
      <div class="tu-table-wrap">
        <table class="tu-table">
          <tbody>
            <tr v-for="(p, i) in passwords" :key="i">
              <td style="width: 32px; color: var(--color-text-muted)">{{ i + 1 }}</td>
              <td class="tu-mono break">{{ p }}</td>
              <td style="width: 60px">
                <button type="button" class="tu-link" @click="copy(p)">复制</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="entropy" class="tu-stat">
        <span>字符池 {{ entropy.poolSize }}</span>
        <span>熵 {{ entropy.bits.toFixed(1) }} bits</span>
        <span>强度 {{ entropy.level }}</span>
      </div>
    </TuOutput>

    <TuField label="强度分析（可粘贴已有密码）">
      <input v-model="analyzeInput" type="text" class="tu-input" autocomplete="off" placeholder="输入密码进行分析" />
      <div v-if="analyzed" class="tu-stat">
        <span>长度 {{ analyzed.length }}</span>
        <span :class="{ 'is-off': !analyzed.hasLower }">小写{{ analyzed.hasLower ? '✓' : '✗' }}</span>
        <span :class="{ 'is-off': !analyzed.hasUpper }">大写{{ analyzed.hasUpper ? '✓' : '✗' }}</span>
        <span :class="{ 'is-off': !analyzed.hasDigit }">数字{{ analyzed.hasDigit ? '✓' : '✗' }}</span>
        <span :class="{ 'is-off': !analyzed.hasSymbol }">符号{{ analyzed.hasSymbol ? '✓' : '✗' }}</span>
      </div>
      <div v-if="analyzedEntropy" class="tu-stat">
        <span>估算熵 {{ analyzedEntropy.bits.toFixed(1) }} bits</span>
        <span>强度 {{ analyzedEntropy.level }}</span>
      </div>
    </TuField>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>密码在本地使用 crypto 随机源生成，不会离开浏览器。</li>
          <li>熵值按字符池大小与长度估算：≥128 bits 极强，≥80 强，≥60 中等。</li>
          <li>建议长度 ≥ 16 且包含四类字符；重要账户请配合密码管理器。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
.break { word-break: break-all; }
.is-off { color: var(--color-error); }
</style>
