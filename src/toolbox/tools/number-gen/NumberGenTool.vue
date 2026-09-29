<script setup lang="ts">
/**
 * 号码生成器（纯前端实现）
 * 覆盖：身份证 / 组织机构代码 / 统一社会信用代码 / 银行卡 / 手机号 / 邮箱 / IP
 * 每种号码均可批量生成（1-1000 条）与反向校验。
 */
import { computed, ref, watch } from 'vue'
import {
  AGE_RANGES,
  EMAIL_DOMAINS,
  NUMBER_TYPES,
  generateNumbers,
  listCities,
  listProvinces,
  normalizeCount,
  validateNumber,
  type AgeRange,
  type GenderOption,
  type NumberGenOptions,
  type NumberTypeId
} from '../../core/idnumber'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

/** 展示上限，避免一次渲染上千条导致卡顿 */
const MAX_SHOWN = 200

const type = ref<NumberTypeId>('idcard')
const countInput = ref(10)
const province = ref('')
const city = ref('')
const gender = ref<GenderOption>('any')
const ageRange = ref<AgeRange>('')
const hyphen = ref(true)
const domain = ref('')
const ipPrefix = ref('')
const results = ref<string[]>([])
const checkInput = ref('')
const checkResult = ref<{ valid: boolean; message: string } | null>(null)

const provinces = listProvinces()
const cities = computed(() => (province.value ? listCities(province.value) : []))

watch(province, () => {
  city.value = ''
})

const count = computed(() => normalizeCount(countInput.value))
const currentMeta = computed(() => NUMBER_TYPES.find(t => t.id === type.value)!)
const options = computed<NumberGenOptions>(() => ({
  count: count.value,
  province: province.value || undefined,
  city: city.value || undefined,
  gender: gender.value,
  ageRange: ageRange.value,
  hyphen: hyphen.value,
  domain: domain.value || undefined,
  ipPrefix: ipPrefix.value || undefined
}))

const shown = computed(() => results.value.slice(0, MAX_SHOWN))
const resultText = computed(() => results.value.join('\n'))
const filename = computed(() => {
  const map: Record<NumberTypeId, string> = {
    idcard: 'idcard',
    orgcode: 'orgcode',
    creditcode: 'creditcode',
    bankcard: 'bankcard',
    phone: 'phone',
    email: 'email',
    ip: 'ip'
  }
  return `${map[type.value]}.txt`
})

useDirtyFlag(() => results.value.length > 0)
const { copy, save } = useToolActions()

function generate() {
  results.value = generateNumbers(type.value, options.value)
  checkResult.value = null
}

function switchType(id: NumberTypeId) {
  type.value = id
  results.value = []
  checkResult.value = null
  checkInput.value = ''
}

function doCheck() {
  checkResult.value = validateNumber(type.value, checkInput.value)
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-toolbar">
      <span class="tu-label">号码类型</span>
      <button
        v-for="t in NUMBER_TYPES"
        :key="t.id"
        type="button"
        class="tu-btn ghost"
        :class="{ 'is-on': type === t.id }"
        @click="switchType(t.id)"
      >
        {{ t.name }}
      </button>
    </div>

    <p class="tu-hint">{{ currentMeta.desc }}｜示例：{{ currentMeta.sample }}</p>

    <div class="tu-row ng-opts">
      <TuField label="生成数量">
        <input v-model.number="countInput" type="number" min="1" max="1000" class="tu-input tu-inline" style="max-width: 120px" />
      </TuField>

      <template v-if="type === 'idcard' || type === 'creditcode'">
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
      </template>

      <template v-if="type === 'idcard'">
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
      </template>

      <TuField v-if="type === 'orgcode'" label="格式">
        <button type="button" class="tu-check" :class="{ 'is-on': hyphen }" @click="hyphen = !hyphen">
          带连字符（XXXXXXXX-X）
        </button>
      </TuField>

      <TuField v-if="type === 'email'" label="邮箱域名">
        <select v-model="domain" class="tu-select tu-inline">
          <option value="">随机</option>
          <option v-for="d in EMAIL_DOMAINS" :key="d" :value="d">{{ d }}</option>
        </select>
      </TuField>

      <TuField v-if="type === 'ip'" label="IP 前缀">
        <input v-model="ipPrefix" class="tu-input tu-inline" style="max-width: 160px" placeholder="如 10.5（留空随机私网）" />
      </TuField>
    </div>

    <div class="tu-row">
      <button type="button" class="tu-btn" @click="generate">生成 {{ count }} 条</button>
      <button type="button" class="tu-btn ghost" :disabled="!results.length" @click="copy(resultText)">
        复制全部
      </button>
      <button type="button" class="tu-btn ghost" :disabled="!results.length" @click="save(filename, resultText)">
        下载 txt
      </button>
      <button v-if="results.length" type="button" class="tu-btn ghost" @click="results = []">清空结果</button>
    </div>

    <TuOutput
      title="生成结果"
      :text="resultText"
      :filename="filename"
      :empty="`点击「生成」按钮生成${currentMeta.name}`"
    >
      <ol v-if="shown.length" class="tu-list">
        <li v-for="(v, i) in shown" :key="i" class="tu-mono">{{ v }}</li>
      </ol>
      <p v-if="results.length > MAX_SHOWN" class="tu-hint">
        共 {{ results.length }} 条，此处仅展示前 {{ MAX_SHOWN }} 条，完整结果请复制或下载。
      </p>
    </TuOutput>

    <TuField label="校验号码" :extra="`校验规则：${currentMeta.name}`">
      <div class="tu-row">
        <input
          v-model="checkInput"
          class="tu-input"
          spellcheck="false"
          :placeholder="`输入${currentMeta.name}进行校验，如 ${currentMeta.sample}`"
          @keyup.enter="doCheck"
        />
        <button type="button" class="tu-btn ghost" @click="doCheck">校验</button>
      </div>
    </TuField>

    <p v-if="checkResult" class="tu-alert" :class="checkResult.valid ? 'ok' : ''">
      {{ checkResult.valid ? '✓' : '✗' }} {{ checkResult.message }}
    </p>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>先选号码类型，再按需设置参数（地区 / 性别 / 年龄段 / 域名 / 前缀等），点击「生成」。</li>
          <li>数量支持 1-1000，超出会自动收敛；结果超过 {{ MAX_SHOWN }} 条时列表只展示前 {{ MAX_SHOWN }} 条。</li>
          <li>
            校验规则：身份证 ISO 7064 Mod 11,2；组织机构代码 GB/T 11714；
            统一社会信用代码 ISO 7064 Mod 31,31；银行卡 Luhn；手机号 1[3-9] 开头 11 位。
          </li>
          <li>全部数据在本机生成，仅用于开发与测试，请勿用于任何真实业务场景。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.ng-opts { flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.ng-opts :deep(.tu-field) { margin-bottom: 0; }
.tu-btn.is-on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
.tu-list { margin: 0; padding-left: 20px; font-size: 12.5px; line-height: 1.8; word-break: break-all; }
</style>
