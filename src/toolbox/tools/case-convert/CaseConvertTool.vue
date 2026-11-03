<script setup lang="ts">
/**
 * 大小写与命名格式转换：一次输入，八种格式实时同步
 */
import { computed, ref } from 'vue'
import { CASE_KINDS, convertAll, splitWords, type CaseKind } from './caseCore'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'

const MAX_LEN = 10_000

const input = ref('hello world')
useDirtyFlag(() => input.value.length > 0)
const { copy } = useToolActions()

const src = computed(() => input.value.slice(0, MAX_LEN))
const tooLong = computed(() => input.value.length > MAX_LEN)
const result = computed(() => convertAll(src.value))
const words = computed(() => splitWords(src.value))

function copyOne(kind: CaseKind) {
  void copy(result.value[kind])
}
</script>

<template>
  <div class="tu-t1">
    <TuField label="原始文本" :extra="`${src.length} / ${MAX_LEN}`">
      <input
        v-model="input"
        type="text"
        class="tu-input"
        placeholder="例如：hello world / user name / HTTPServer"
        data-testid="tb-case-input"
      />
    </TuField>

    <p v-if="tooLong" class="tu-alert">输入超过 10,000 字符，已截断处理前 10,000 字符。</p>

    <p class="tu-hint">
      识别到 {{ words.length }} 个单词：{{ words.slice(0, 12).join(' · ') || '—' }}<template v-if="words.length > 12"> …</template>
    </p>

    <div class="tu-grid">
      <div v-for="k in CASE_KINDS" :key="k.id" class="tu-card">
        <div class="tu-card-title">{{ k.name }}</div>
        <div class="tu-card-value cc-val">{{ result[k.id] || '—' }}</div>
        <button type="button" class="tu-btn ghost cc-copy" @click="copyOne(k.id)">复制</button>
      </div>
    </div>

    <p class="tu-hint">分词规则：下划线 / 连字符 / 空白与大小写边界均视为分隔符，中文等非 ASCII 原样保留。</p>
  </div>
</template>

<style scoped>
.cc-val { font-size: var(--fs-body); margin-bottom: 6px; }
.cc-copy { min-height: 28px; padding: 3px 10px; font-size: var(--fs-caption); }
</style>
