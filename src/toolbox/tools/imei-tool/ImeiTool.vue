<script setup lang="ts">
/**
 * IMEI 校验与生成：Luhn 校验、14 位补全、结构拆解、批量生成测试号
 */
import { computed, ref } from 'vue'
import { completeImei, generateImeis, isValidImei, isValidImeisv, MAX_GEN, parseImei } from './imeiCore'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'

const input = ref('')
const prefix = ref('356938')
const count = ref(5)
const generated = ref<string[]>([])

const { copy, save } = useToolActions()

const parts = computed(() => parseImei(input.value))
const valid15 = computed(() => isValidImei(input.value))
const valid16 = computed(() => isValidImeisv(input.value))
const filled = computed(() => (input.value.replace(/\D/g, '').length === 14 ? completeImei(input.value) : null))

function gen() {
  const list = generateImeis(prefix.value, count.value)
  generated.value = list
  if (!list.length) generated.value = []
}

const genText = computed(() => generated.value.join('\n'))
</script>

<template>
  <div class="tu-t1">
    <p class="tu-alert">生成的 IMEI 仅供软件测试使用，禁止用于真实设备申报或规避监管。</p>

    <TuField label="校验 / 解析" hint="支持 15 位 IMEI 与 16 位 IMEISV，自动识别并拆解结构">
      <input v-model="input" type="text" class="tu-input" placeholder="例如：356938035198467" data-testid="tb-imei-input" />
    </TuField>

    <div class="tu-grid">
      <div class="tu-card">
        <div class="tu-card-title">15 位 IMEI</div>
        <div class="tu-card-value">{{ valid15 ? '有效' : '无效' }}</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">16 位 IMEISV</div>
        <div class="tu-card-value">{{ valid16 ? '有效' : '无效' }}</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">TAC（型号核准）</div>
        <div class="tu-card-value">{{ parts ? parts.tac : '—' }}</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">SNR（序列号）</div>
        <div class="tu-card-value">{{ parts ? parts.snr : '—' }}</div>
      </div>
    </div>

    <p v-if="filled" class="tu-alert ok">
      输入 14 位 → 补全校验位为 {{ filled }}
      <button type="button" class="tu-btn ghost im-btn" @click="copy(filled)">复制</button>
    </p>
    <p v-if="parts" class="tu-hint">
      {{ parts.isSv ? 'IMEISV：末 2 位为软件版本号，无校验位' : `IMEI：末位 ${parts.cd} 为 Luhn 校验位` }}
      <button v-if="valid15 || valid16" type="button" class="tu-btn ghost im-btn" @click="copy(input.replace(/[\s-]/g, ''))">复制原串</button>
    </p>

    <TuField label="批量生成（测试用）" hint="填 2~8 位 TAC 前缀，不足部分随机补齐">
      <div class="tu-row im-nomargin">
        <input v-model="prefix" type="text" class="tu-input im-narrow" maxlength="8" />
        <label class="tu-label im-inline">数量</label>
        <input v-model.number="count" type="number" class="tu-input im-num" min="1" :max="MAX_GEN" />
        <button type="button" class="tu-btn" @click="gen">生成</button>
        <button v-if="generated.length" type="button" class="tu-btn ghost" @click="copy(genText)">复制全部</button>
        <button v-if="generated.length" type="button" class="tu-btn ghost" @click="save('imei-list.txt', genText)">下载</button>
      </div>
    </TuField>

    <div v-if="generated.length" class="tu-out im-out">{{ genText }}</div>
  </div>
</template>

<style scoped>
.im-inline { margin-bottom: 0; }
.im-narrow { width: 140px; }
.im-num { width: 90px; }
.im-btn {height: 36px;
  padding: 0 12px;
  font-size: 12px;}
.im-nomargin { margin-bottom: 0; }
.im-out { max-height: 240px; }
</style>
