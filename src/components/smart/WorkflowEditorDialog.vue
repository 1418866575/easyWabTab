<script setup lang="ts">
/**
 * 智能工作台 · 工作流编辑弹框
 * 字段：名称 / 描述 / 分类 / 作者 / 版本 / 标签 / 定义（自由文本）/ 收藏。
 * 校验与「提交后才暴露错误」沿用提示词编辑弹框同一套口径（见 SmartEditorDialog.vue）。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { isNameTaken, normalizeTags, validateWorkflow } from '@/composables/smartCore'
import { useSmartStore } from '@/stores/smart'
import { useToast } from '@/composables/useToast'
import type { SmartWorkflow } from '@/types'

const props = defineProps<{
  model: Partial<SmartWorkflow>
  editingId: string | null
  categories: string[]
  nameMax: number
  descMax: number
  contentMax: number
}>()

const emit = defineEmits<{ close: []; save: [value: Partial<SmartWorkflow>] }>()

const store = useSmartStore()
const toast = useToast()

const title = computed(() => (props.editingId ? '编辑工作流' : '新增工作流'))

// 全屏（最大化）：点右上角按钮切换；全屏下 ESC 先退出全屏，否则关闭弹框
const fullscreen = ref(false)
function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  e.preventDefault()
  if (fullscreen.value) fullscreen.value = false
  else emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// 本地草稿：取消/关闭不影响外部数据
const draft = ref<Record<string, unknown>>({})
const tagsInput = ref('')

watch(
  () => props.model,
  m => {
    draft.value = { ...m }
    tagsInput.value = Array.isArray(m.tags) ? m.tags.join('、') : ''
  },
  { immediate: true }
)

/** 提交后才展示行内错误，避免刚打开就飘红 */
const submitAttempted = ref(false)

const issues = computed(() => validateWorkflow(draft.value as Partial<SmartWorkflow>, store.workflows, props.editingId))

function errorOf(field: string): string {
  if (!submitAttempted.value) return ''
  return issues.value.find(i => i.field === field)?.message ?? ''
}

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
  emit('save', { ...draft.value, tags } as Partial<SmartWorkflow>)
}

/** 名称重复即时提示（编辑自身不算）。
 *  两类数组类型不同，先统一成联合类型再查重，避免把 union 数组传给泛型函数推断失败。 */
const nameTaken = computed(() => {
  const name = String(draft.value.name ?? '').trim()
  if (!name) return false
  return isNameTaken(store.workflows, name, props.editingId)
})
</script>

<template>
  <BaseDialog :title="title" width="720px" :fullscreen="fullscreen" :close-on-overlay="false" :close-on-escape="false" @close="emit('close')">
    <!-- form 包住正文（回车提交仍可用）；底部按钮走 #footer（基类统一右对齐）。
         注意：#footer 在 form 之外，故保存按钮不能再用 native-type="submit"，改为 @click="submit"。 -->
    <form class="we-form" @submit.prevent="submit">
      <div class="we-row">
        <label class="we-field">
          <span class="we-label">名称<span class="req">*</span></span>
          <el-input
            v-model="draft.name"
            :maxlength="nameMax"
            size="small"
            placeholder="例如：周报自动生成流程"
            data-testid="smart-workflow-editor-name"
          />
          <span v-if="errorOf('name') || nameTaken" class="we-error">
            {{ errorOf('name') || '已存在同名工作流' }}
          </span>
        </label>

        <label class="we-field we-field-sm">
          <span class="we-label">分类</span>
          <el-select v-model="draft.category" size="small" filterable allow-create default-first-option placeholder="选择或输入分类">
            <el-option v-for="c in categories" :key="c" :value="c" :label="c" />
          </el-select>
        </label>
      </div>

      <label class="we-field">
        <span class="we-label">描述<span class="we-hint">（一句话说明用途）</span></span>
        <el-input
          v-model="draft.description"
          :maxlength="descMax"
          size="small"
          placeholder="例如：把本周的会议记录整理成周报"
          data-testid="smart-workflow-editor-desc"
        />
        <span v-if="errorOf('description')" class="we-error">{{ errorOf('description') }}</span>
      </label>

      <div class="we-row">
        <label class="we-field we-field-sm">
          <span class="we-label">作者</span>
          <el-input v-model="draft.author" size="small" :maxlength="40" placeholder="可留空" />
          <span v-if="errorOf('author')" class="we-error">{{ errorOf('author') }}</span>
        </label>

        <label class="we-field we-field-sm">
          <span class="we-label">版本</span>
          <el-input v-model="draft.version" size="small" :maxlength="20" placeholder="如 1.0.0" />
          <span v-if="errorOf('version')" class="we-error">{{ errorOf('version') }}</span>
        </label>
      </div>

      <label class="we-field">
        <span class="we-label">标签<span class="we-hint">（用、或逗号分隔，最多 8 个）</span></span>
        <el-input v-model="tagsInput" size="small" placeholder="日报、自动化" />
      </label>

      <label class="we-field">
        <span class="we-label">
          定义<span class="req">*</span>
          <span class="we-hint">（按步骤写下流程：可用 Markdown / 清单 / YAML，自由组织）</span>
        </span>
        <el-input
          v-model="draft.definition"
          type="textarea"
          :rows="12"
          :maxlength="contentMax"
          show-word-limit
          resize="vertical"
          placeholder="1. 收集本周会议记录&#10;2. 提取关键结论与待办&#10;3. 按「已完成 / 进行中 / 下周计划」生成周报"
          data-testid="smart-workflow-editor-definition"
        />
        <span v-if="errorOf('definition')" class="we-error">{{ errorOf('definition') }}</span>
      </label>

      <label class="we-check">
        <input v-model="draft.isFavorite" type="checkbox" />
        <span>收藏这条工作流</span>
      </label>
    </form>

    <template #header-actions>
      <button
        class="close-btn"
        type="button"
        :title="fullscreen ? '退出全屏' : '全屏显示'"
        :aria-label="fullscreen ? '退出全屏' : '全屏显示'"
        @click="fullscreen = !fullscreen"
      >
        <Icon :name="fullscreen ? 'fullscreen-exit' : 'fullscreen'" />
      </button>
    </template>

    <template #footer>
      <el-button size="small" @click="emit('close')">取消</el-button>
      <el-button type="primary" size="small" data-testid="smart-workflow-editor-save" @click="submit">
        {{ editingId ? '保存' : '添加' }}
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.we-form { display: flex; flex-direction: column; gap: 12px; }
.we-row { display: flex; gap: 10px; flex-wrap: wrap; }
.we-field { display: flex; flex-direction: column; gap: 6px; flex: 1 1 220px; min-width: 0; }
.we-field-sm { flex: 0 1 160px; }
.we-label { font-size: 13px; color: var(--color-text-secondary, #6b7280); }
.we-hint { color: var(--color-text-muted, #9ca3af); font-size: 12px; }
.req { color: var(--color-error, #dc2626); }
.we-error { font-size: 12px; color: var(--color-error, #dc2626); }
.we-check { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-text, #111827); }

@media (max-width: 768px) {
  .we-field-sm { flex: 1 1 100%; }
}
</style>
