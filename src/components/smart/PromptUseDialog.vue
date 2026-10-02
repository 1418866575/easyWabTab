<script setup lang="ts">
/**
 * 智能工作台 · 提示词「使用」弹框（变量填充）
 * 左填变量、右实时预览；未填的变量保留原 {{占位}} 并计数提示，绝不静默清空，
 * 避免用户拿到一份看起来完整、实际缺内容的提示词。
 */
import { computed, ref, watch } from 'vue'
import { fillTemplate, parseVariables } from '@/composables/smartCore'
import { copyText } from '@/utils/download'
import type { SmartPrompt } from '@/types'

const props = defineProps<{ prompt: SmartPrompt }>()
const emit = defineEmits<{ close: []; used: [] }>()

const values = ref<Record<string, string>>({})

const vars = computed(() => parseVariables(props.prompt.content))

watch(
  () => props.prompt.id,
  () => {
    // 初始值：变量元信息里有 defaultValue 则带上，否则留空
    const init: Record<string, string> = {}
    for (const v of parseVariables(props.prompt.content)) {
      init[v.name] = props.prompt.variables.find(x => x.name === v.name)?.defaultValue ?? ''
    }
    values.value = init
  },
  { immediate: true }
)

const filled = computed(() => fillTemplate(props.prompt.content, values.value))
const missingCount = computed(() => filled.value.missing.length)

/** 未填变量名集合（用于输入框红框提示） */
const missingSet = computed(() => new Set(filled.value.missing))

async function copyResult(): Promise<void> {
  if (missingCount.value > 0) {
    // 不阻断：允许带占位复制，但明确告知，避免"复制了才发现没填全"
    if (!window.confirm(`还有 ${missingCount.value} 个变量未填写，复制结果会保留 {{占位}}。继续吗？`)) return
  }
  const ok = await copyText(filled.value.text, '已复制填充后的提示词')
  if (ok) emit('used')
}

async function copyRaw(): Promise<void> {
  const ok = await copyText(props.prompt.content, '已复制原文')
  if (ok) emit('used')
}

function fillAllWithPlaceholders(): void {
  // 一键把剩余变量填成示例值（用书名号包裹），便于先看清整体结构
  const next = { ...values.value }
  for (const v of vars.value) {
    if (!String(next[v.name] ?? '').trim()) next[v.name] = `【${v.name}】`
  }
  values.value = next
}

function clearAll(): void {
  const next: Record<string, string> = {}
  for (const v of vars.value) next[v.name] = ''
  values.value = next
}
</script>

<template>
  <el-dialog :model-value="true" width="860px" :title="`使用：${prompt.title}`" @close="emit('close')">
    <div class="pu-body">
      <!-- 无变量：直接给原文，不摆无意义的表单 -->
      <div v-if="vars.length === 0" class="pu-plain">
        <p class="pu-tip">这条提示词没有变量，可直接复制使用。</p>
        <pre class="pu-preview">{{ prompt.content }}</pre>
      </div>

      <div v-else class="pu-grid">
        <section class="pu-form">
          <div class="pu-form-head">
            <h4 class="pu-title">填写变量（{{ vars.length }}）</h4>
            <div class="pu-form-actions">
              <button type="button" class="pu-link" @click="fillAllWithPlaceholders">填入示例</button>
              <button type="button" class="pu-link" @click="clearAll">清空</button>
            </div>
          </div>
          <label v-for="v in vars" :key="v.name" class="pu-field">
            <span class="pu-label">
              {{ v.name }}
              <span v-if="v.desc" class="pu-desc">{{ v.desc }}</span>
            </span>
            <el-input
              v-model="values[v.name]"
              size="small"
              :placeholder="`请输入 ${v.name}`"
              :class="{ 'is-missing': missingSet.has(v.name) }"
            />
          </label>
          <p v-if="missingCount > 0" class="pu-warn">
            {{ missingCount }} 个变量未填写：{{ filled.missing.join('、') }}（预览中保留原占位）
          </p>
        </section>

        <section class="pu-result">
          <h4 class="pu-title">预览</h4>
          <pre class="pu-preview">{{ filled.text }}</pre>
        </section>
      </div>
    </div>

    <template #footer>
      <div class="pu-actions">
        <el-button size="small" @click="copyRaw">复制原文</el-button>
        <span class="pu-spacer" />
        <el-button size="small" @click="emit('close')">关闭</el-button>
        <el-button type="primary" size="small" data-testid="smart-use-copy" @click="copyResult">复制结果</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.pu-body { display: flex; flex-direction: column; gap: 12px; }
.pu-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 14px; align-items: start; }
.pu-form { display: flex; flex-direction: column; gap: 10px; }
.pu-form-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pu-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--color-text, #111827); }
.pu-form-actions { display: flex; gap: 8px; }
.pu-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--color-primary, #3b82f6);
  font-size: 12px;
  cursor: pointer;
}
.pu-field { display: flex; flex-direction: column; gap: 4px; }
.pu-label { font-size: 12px; color: var(--color-text-secondary, #6b7280); }
.pu-desc { color: var(--color-text-muted, #9ca3af); }
.pu-warn { margin: 0; font-size: 12px; color: var(--color-error, #dc2626); }

.pu-result { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.pu-preview {
  margin: 0;
  padding: 12px;
  max-height: 46vh;
  overflow: auto;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  color: var(--color-text, #111827);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.pu-tip { margin: 0; font-size: 12px; color: var(--color-text-secondary, #6b7280); }
.pu-plain { display: flex; flex-direction: column; gap: 8px; }

.pu-actions { display: flex; align-items: center; gap: 8px; }
.pu-spacer { flex: 1 1 auto; }

:deep(.is-missing .el-input__wrapper) { box-shadow: 0 0 0 1px var(--color-error, #dc2626) inset; }

@media (max-width: 768px) {
  .pu-grid { grid-template-columns: 1fr; }
  .pu-preview { max-height: 34vh; }
}
</style>
