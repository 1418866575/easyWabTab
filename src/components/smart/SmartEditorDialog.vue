<script setup lang="ts">
/**
 * 智能工作台 · 提示词编辑弹框
 * 技能编辑走 SkillEditorDialog（字段要对齐 skill.md 的 frontmatter，且要管附属资源）。
 * 校验与「提交后才暴露错误」沿用业务弹框同一套口径（见 BusinessProducts.vue）。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { isNameTaken, makeSmartId, normalizeTags, parseVariables, SMART_PROMPT_IMAGES_MAX, validatePrompt } from '@/composables/smartCore'
import { useSmartStore } from '@/stores/smart'
import { useToast } from '@/composables/useToast'
import { compressImageFile } from '@/utils/imageCompress'
import type { SmartPrompt, SmartPromptImage } from '@/types'

const props = defineProps<{
  model: Partial<SmartPrompt>
  editingId: string | null
  categories: string[]
  nameMax: number
  descMax: number
  contentMax: number
}>()

const emit = defineEmits<{ close: []; save: [value: Partial<SmartPrompt>] }>()

const store = useSmartStore()
const toast = useToast()

const title = computed(() => (props.editingId ? '编辑提示词' : '新增提示词'))

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
    // 参考图：编辑时带入，新增时回落空数组（避免沿用上一次的草稿）
    draft.value.images = Array.isArray(m.images) ? (m.images as SmartPromptImage[]).map(i => ({ ...i })) : []
    tagsInput.value = Array.isArray(m.tags) ? m.tags.join('、') : ''
  },
  { immediate: true }
)

/** 参考图：与草稿双向绑定的计算属性（数组整体替换以触发响应） */
const images = computed<SmartPromptImage[]>({
  get: () => (Array.isArray(draft.value.images) ? (draft.value.images as SmartPromptImage[]) : []),
  set: v => {
    draft.value = { ...draft.value, images: v }
  }
})

const fileInput = ref<HTMLInputElement | null>(null)

function pickImages(): void {
  fileInput.value?.click()
}

/** 选图 → 压缩成 JPEG dataURL → 入草稿；非图片/超限忽略并提示 */
async function onPickImages(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = input.files ? Array.from(input.files).filter(f => f.type.startsWith('image/')) : []
  input.value = '' // 允许重复选同一文件
  if (!files.length) return
  const room = SMART_PROMPT_IMAGES_MAX - images.value.length
  if (room <= 0) {
    toast.warning(`最多 ${SMART_PROMPT_IMAGES_MAX} 张参考图`)
    return
  }
  const toProcess = files.slice(0, room)
  if (files.length !== toProcess.length) toast.warning(`已忽略非图片文件或超出 ${SMART_PROMPT_IMAGES_MAX} 张上限`)
  let added = 0
  for (const f of toProcess) {
    try {
      const c = await compressImageFile(f)
      images.value = [...images.value, { id: makeSmartId('img'), name: f.name || '图片', dataUrl: c.dataUrl, width: c.width, height: c.height }]
      added++
    } catch {
      toast.error(`图片「${f.name}」处理失败`)
    }
  }
  if (added) toast.success(`已添加 ${added} 张参考图`)
}

function removeImage(id: string): void {
  images.value = images.value.filter(x => x.id !== id)
}

/** 提交后才展示行内错误，避免刚打开就飘红 */
const submitAttempted = ref(false)

const issues = computed(() => validatePrompt(draft.value as Partial<SmartPrompt>, store.prompts, props.editingId))

function errorOf(field: string): string {
  if (!submitAttempted.value) return ''
  return issues.value.find(i => i.field === field)?.message ?? ''
}

/** 模板变量：随正文实时解析，给用户即时反馈 */
const detectedVars = computed(() => parseVariables(String(draft.value.content ?? '')))

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
  emit('save', { ...draft.value, tags } as Partial<SmartPrompt>)
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
  const name = String(draft.value.title ?? '').trim()
  if (!name) return false
  return isNameTaken(store.prompts, name, props.editingId)
})
</script>

<template>
  <BaseDialog :title="title" width="720px" :fullscreen="fullscreen" :close-on-overlay="false" :close-on-escape="false" @close="emit('close')">
    <!-- form 包住正文（回车提交仍可用）；底部按钮走 #footer（基类统一右对齐）。
         注意：#footer 在 form 之外，故保存按钮不能再用 native-type="submit"，改为 @click="submit"。 -->
    <form class="se-form" @submit.prevent="submit">
      <div class="se-row">
        <label class="se-field">
          <span class="se-label">标题<span class="req">*</span></span>
          <el-input
            v-model="draft.title"
            :maxlength="nameMax"
            size="small"
            placeholder="例如：概念讲解（费曼式）"
            data-testid="smart-editor-name"
          />
          <span v-if="errorOf('title') || nameTaken" class="se-error">
            {{ errorOf('title') || '已存在同名提示词' }}
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
        <label class="se-field se-field-sm">
          <span class="se-label">建议模型</span>
          <el-input v-model="draft.model" size="small" maxlength="40" placeholder="如 GPT-4o / 通用" />
        </label>

        <label class="se-field">
          <span class="se-label">标签<span class="se-hint">（用、或逗号分隔，最多 8 个）</span></span>
          <el-input v-model="tagsInput" size="small" placeholder="产品、文档" />
        </label>
      </div>

      <label class="se-field">
        <span class="se-label">
          正文<span class="req">*</span>
          <!-- v-pre：这里要显示字面的 {{变量名}} 语法示例，不能被当作插值编译 -->
          <span class="se-hint" v-pre>（用 {{变量名}} 定义可填写的占位，保存时自动识别）</span>
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

      <div class="se-field se-images">
        <span class="se-label">
          参考图片
          <span class="se-hint">（可选，最多 {{ SMART_PROMPT_IMAGES_MAX }} 张，自动压缩）</span>
        </span>
        <div class="se-img-grid">
          <div v-for="img in images" :key="img.id" class="se-img-thumb">
            <img :src="img.dataUrl" :alt="img.name" />
            <button
              type="button"
              class="se-img-del"
              :aria-label="`删除 ${img.name}`"
              data-testid="smart-editor-img-del"
              @click="removeImage(img.id)"
            >✕</button>
          </div>
          <button
            v-if="images.length < SMART_PROMPT_IMAGES_MAX"
            type="button"
            class="se-img-add"
            data-testid="smart-editor-img-add"
            @click="pickImages"
          >＋ 上传图片</button>
        </div>
        <input ref="fileInput" type="file" accept="image/*" multiple hidden data-testid="smart-editor-img-input" @change="onPickImages" />
      </div>

      <div v-if="detectedVars.length" class="se-vars">
        识别到 {{ detectedVars.length }} 个变量：
        <code v-for="v in detectedVars" :key="v.name" class="se-var">{{ varLabel(v.name) }}</code>
      </div>

      <label class="se-check">
        <input v-model="draft.isFavorite" type="checkbox" />
        <span>收藏这条提示词</span>
      </label>

    </form>

    <template #header-actions>
      <button
        class="close-btn"
        type="button"
        :title="fullscreen ? '退出全屏' : '全屏显示'"
        :aria-label="fullscreen ? '退出全屏' : '全屏显示'"
        data-testid="smart-editor-fullscreen"
        @click="fullscreen = !fullscreen"
      >
        <Icon :name="fullscreen ? 'fullscreen-exit' : 'fullscreen'" />
      </button>
    </template>

    <template #footer>
      <el-button size="small" @click="emit('close')">取消</el-button>
      <el-button type="primary" size="small" data-testid="smart-editor-save" @click="submit">
        {{ editingId ? '保存' : '添加' }}
      </el-button>
    </template>
  </BaseDialog>
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

.se-images { gap: 6px; }
.se-img-grid { display: flex; flex-wrap: wrap; gap: 10px; }
.se-img-thumb {
  position: relative;
  width: 96px;
  height: 96px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
  background: var(--color-bg-hover, #f3f4f6);
}
.se-img-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.se-img-del {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.se-img-del:hover { background: var(--color-error, #dc2626); }
.se-img-add {
  width: 96px;
  height: 96px;
  border: 1px dashed var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: var(--color-text-muted, #9ca3af);
  font-size: 13px;
  cursor: pointer;
}
.se-img-add:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }

@media (max-width: 768px) {
  .se-field-sm { flex: 1 1 100%; }
}
</style>
