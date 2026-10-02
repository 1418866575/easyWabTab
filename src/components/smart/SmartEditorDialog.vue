<script setup lang="ts">
/**
 * 智能工作台 · 技能/提示词编辑弹框（两类共用）
 * 差异仅在字段：技能多 icon/version/author，提示词多 model/favorite。
 * 校验与「保存中禁用 + 提交时才暴露错误」沿用业务弹框同一套口径（见 BusinessProducts.vue）。
 */
import { computed, ref, watch } from 'vue'
import { isNameTaken, normalizeTags, parseVariables, validatePrompt, validateSkill } from '@/composables/smartCore'
import { useSmartStore } from '@/stores/smart'
import { useToast } from '@/composables/useToast'
import type { SmartPrompt, SmartSkill } from '@/types'

const props = defineProps<{
  kind: 'skill' | 'prompt'
  model: Partial<SmartSkill> | Partial<SmartPrompt>
  editingId: string | null
  categories: string[]
  nameMax: number
  descMax: number
  contentMax: number
}>()

const emit = defineEmits<{ close: []; save: [value: Partial<SmartSkill> | Partial<SmartPrompt>] }>()

const store = useSmartStore()
const toast = useToast()

const isSkill = computed(() => props.kind === 'skill')
const title = computed(() => (props.editingId ? (isSkill.value ? '编辑技能' : '编辑提示词') : isSkill.value ? '新增技能' : '新增提示词'))

// 本地草稿：取消/关闭不影响外部数据
const draft = ref<Record<string, unknown>>({})
const tagsInput = ref('')

watch(
  () => props.model,
  m => {
    draft.value = { ...m }
    tagsInput.value = Array.isArray((m as { tags?: string[] }).tags) ? (m as { tags: string[] }).tags.join('、') : ''
  },
  { immediate: true }
)

/** 提交后才展示行内错误，避免刚打开就飘红 */
const submitAttempted = ref(false)

const issues = computed(() => {
  if (isSkill.value) {
    return validateSkill(draft.value as Partial<SmartSkill>, store.skills, props.editingId)
  }
  return validatePrompt(draft.value as Partial<SmartPrompt>, store.prompts, props.editingId)
})

function errorOf(field: string): string {
  if (!submitAttempted.value) return ''
  return issues.value.find(i => i.field === field)?.message ?? ''
}

/** 提示词的模板变量：随正文实时解析，给用户即时反馈 */
const detectedVars = computed(() => {
  if (isSkill.value) return []
  return parseVariables(String(draft.value.content ?? ''))
})

function submit(): void {
  submitAttempted.value = true
  if (issues.value.length) {
    toast.error(issues.value[0].message)
    return
  }
  const tags = normalizeTags(
    tagsInput.value
      .split(/[、,，\s]+/)
      .map(s => s.trim())
      .filter(Boolean)
  )
  emit('save', { ...draft.value, tags } as Partial<SmartSkill> | Partial<SmartPrompt>)
}

/**
 * 变量占位展示文本。
 * 注意：不要在模板里写 `{{ '{{' + name + '}}' }}` —— 模板解析器会把字符串里的 `}}`
 * 当成插值结束，编译直接失败（vue-tsc 不报，运行时才炸）。统一在脚本里拼好再插值。
 */
function varLabel(name: string): string {
  return '{{' + name + '}}'
}

/** 名称重复即时提示（编辑自身不算）。
 *  两类数组类型不同，先统一成联合类型再查重，避免把 union 数组传给泛型函数推断失败。 */
const nameTaken = computed(() => {
  const name = String(draft.value.name ?? draft.value.title ?? '').trim()
  if (!name) return false
  const pool: (SmartSkill | SmartPrompt)[] = isSkill.value ? store.skills : store.prompts
  return isNameTaken(pool, name, props.editingId)
})
</script>

<template>
  <el-dialog :model-value="true" width="720px" :title="title" :close-on-click-modal="false" @close="emit('close')">
    <form class="se-form" @submit.prevent="submit">
      <div class="se-row">
        <label class="se-field">
          <span class="se-label">{{ isSkill ? '名称' : '标题' }}<span class="req">*</span></span>
          <el-input
            v-if="isSkill"
            v-model="draft.name"
            :maxlength="nameMax"
            size="small"
            placeholder="例如：需求文档生成"
            data-testid="smart-editor-name"
          />
          <el-input
            v-else
            v-model="draft.title"
            :maxlength="nameMax"
            size="small"
            placeholder="例如：概念讲解（费曼式）"
            data-testid="smart-editor-name"
          />
          <span v-if="errorOf(isSkill ? 'name' : 'title') || nameTaken" class="se-error">
            {{ errorOf(isSkill ? 'name' : 'title') || '已存在同名条目' }}
          </span>
        </label>

        <label class="se-field se-field-sm">
          <span class="se-label">分类</span>
          <el-select v-model="draft.category" size="small" filterable allow-create default-first-option placeholder="选择或输入分类">
            <el-option v-for="c in categories" :key="c" :value="c" :label="c" />
          </el-select>
        </label>
      </div>

      <div class="se-row">
        <label v-if="isSkill" class="se-field se-field-sm">
          <span class="se-label">图标</span>
          <el-input v-model="draft.icon" size="small" maxlength="8" placeholder="🧩" />
        </label>
        <label v-else class="se-field se-field-sm">
          <span class="se-label">建议模型</span>
          <el-input v-model="draft.model" size="small" maxlength="40" placeholder="如 GPT-4o / 通用" />
        </label>

        <label class="se-field">
          <span class="se-label">标签<span class="se-hint">（用、或逗号分隔，最多 8 个）</span></span>
          <el-input v-model="tagsInput" size="small" placeholder="产品、文档" />
        </label>
      </div>

      <div v-if="isSkill" class="se-row">
        <label class="se-field se-field-sm">
          <span class="se-label">版本</span>
          <el-input v-model="draft.version" size="small" maxlength="20" placeholder="1.0.0" />
        </label>
        <label class="se-field">
          <span class="se-label">作者 / 来源</span>
          <el-input v-model="draft.author" size="small" :maxlength="nameMax" placeholder="留空表示自己整理" />
        </label>
      </div>

      <label v-if="isSkill" class="se-field">
        <span class="se-label">一句话说明<span class="se-hint">（列表副标题，可留空）</span></span>
        <el-input v-model="draft.description" size="small" :maxlength="descMax" placeholder="把想法展开为结构化需求文档" />
      </label>

      <label class="se-field">
        <span class="se-label">
          正文<span class="req">*</span>
          <!-- v-pre：这里要显示字面的 {{变量名}} 语法示例，不能被当作插值编译 -->
          <span v-if="!isSkill" class="se-hint" v-pre>（用 {{变量名}} 定义可填写的占位，保存时自动识别）</span>
        </span>
        <el-input
          v-model="draft.content"
          type="textarea"
          :rows="12"
          :maxlength="contentMax"
          show-word-limit
          resize="vertical"
          placeholder="支持 Markdown"
          data-testid="smart-editor-content"
        />
        <span v-if="errorOf('content')" class="se-error">{{ errorOf('content') }}</span>
      </label>

      <div v-if="!isSkill && detectedVars.length" class="se-vars">
        识别到 {{ detectedVars.length }} 个变量：
        <code v-for="v in detectedVars" :key="v.name" class="se-var">{{ varLabel(v.name) }}</code>
      </div>

      <label v-if="!isSkill" class="se-check">
        <input v-model="draft.isFavorite" type="checkbox" />
        <span>收藏这条提示词</span>
      </label>

      <div class="se-actions">
        <el-button size="small" @click="emit('close')">取消</el-button>
        <el-button type="primary" size="small" native-type="submit" data-testid="smart-editor-save">
          {{ editingId ? '保存' : '添加' }}
        </el-button>
      </div>
    </form>
  </el-dialog>
</template>

<style scoped>
.se-form { display: flex; flex-direction: column; gap: 12px; }
.se-row { display: flex; gap: 10px; flex-wrap: wrap; }
.se-field { display: flex; flex-direction: column; gap: 6px; flex: 1 1 220px; min-width: 0; }
.se-field-sm { flex: 0 1 160px; }
.se-label { font-size: 13px; color: var(--color-text-secondary, #6b7280); }
.se-hint { color: var(--color-text-muted, #9ca3af); font-size: 12px; }
.req { color: var(--color-error, #dc2626); }
.se-error { font-size: 12px; color: var(--color-error, #dc2626); }
.se-vars { font-size: 12px; color: var(--color-text-secondary, #6b7280); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.se-var {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--color-bg-hover, #f3f4f6);
  color: var(--color-primary, #3b82f6);
  font-size: 12px;
}
.se-check { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-text, #111827); }
.se-actions { display: flex; justify-content: flex-end; gap: 8px; }

@media (max-width: 768px) {
  .se-field-sm { flex: 1 1 100%; }
}
</style>
