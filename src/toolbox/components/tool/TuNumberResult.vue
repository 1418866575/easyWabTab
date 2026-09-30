<script setup lang="ts">
/**
 * 号码类工具通用结果区（数量 / 生成 / 列表 / 复制下载 / 反向校验 / 使用说明）
 * 各号码工具只负责自己的参数区与「生成」实现，结果展示与校验复用本组件。
 */
import { computed, ref, watch } from 'vue'
import { useToolActions } from '../../composables/useToolActions'
import TuField from './TuField.vue'
import TuOutput from './TuOutput.vue'
import type { ValidateResult } from '../../core/idnumber'

const props = withDefaults(
  defineProps<{
    /** 已生成的号码列表 */
    items: string[]
    /** 下载文件名（如 idcard.txt） */
    filename: string
    /** 校验函数（由调用方按号码类型传入） */
    validate: (value: string) => ValidateResult
    /** 校验输入框占位提示 */
    placeholder: string
    /** 生成数量（与父组件双向绑定） */
    count: number
    /** 列表展示上限，避免一次渲染上千条 */
    maxShown?: number
    /** 空态提示 */
    empty?: string
  }>(),
  { maxShown: 200, empty: '点击「生成」按钮生成号码' }
)

const emit = defineEmits<{
  (e: 'update:count', value: number): void
  (e: 'generate'): void
  (e: 'clear'): void
}>()

const checkInput = ref('')
const checkResult = ref<ValidateResult | null>(null)
const { copy, save } = useToolActions()

const shown = computed(() => props.items.slice(0, props.maxShown))
const text = computed(() => props.items.join('\n'))

/** 换一批结果时清掉上一次的校验结论，避免误导 */
watch(
  () => props.items,
  () => {
    checkResult.value = null
  }
)

function onCountInput(e: Event) {
  const raw = Number((e.target as HTMLInputElement).value)
  emit('update:count', Number.isFinite(raw) ? raw : 1)
}

function doCheck() {
  checkResult.value = props.validate(checkInput.value)
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-row">
      <TuField label="生成数量">
        <input
          type="number"
          min="1"
          max="1000"
          class="tu-input tu-inline"
          style="max-width: 120px"
          :value="props.count"
          @input="onCountInput"
        />
      </TuField>
    </div>

    <div class="tu-row">
      <button type="button" class="tu-btn" @click="emit('generate')">生成 {{ props.count }} 条</button>
      <button type="button" class="tu-btn ghost" :disabled="!props.items.length" @click="copy(text)">复制全部</button>
      <button
        type="button"
        class="tu-btn ghost"
        :disabled="!props.items.length"
        @click="save(props.filename, text)"
      >下载 txt</button>
      <button v-if="props.items.length" type="button" class="tu-btn ghost" @click="emit('clear')">清空结果</button>
    </div>

    <TuOutput title="生成结果" :text="text" :filename="props.filename" :empty="props.empty">
      <ol v-if="shown.length" class="tu-list">
        <li v-for="(v, i) in shown" :key="i" class="tu-mono">{{ v }}</li>
      </ol>
      <p v-if="props.items.length > props.maxShown" class="tu-hint">
        共 {{ props.items.length }} 条，此处仅展示前 {{ props.maxShown }} 条，完整结果请复制或下载。
      </p>
    </TuOutput>

    <TuField label="校验号码">
      <div class="tu-row">
        <input
          v-model="checkInput"
          class="tu-input"
          spellcheck="false"
          :placeholder="props.placeholder"
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
        <slot name="help" />
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
.tu-list { margin: 0; padding-left: 20px; font-size: 12.5px; line-height: 1.8; word-break: break-all; }
</style>
