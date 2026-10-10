<script setup lang="ts">
/**
 * 智能工作台 · 技能编辑弹框（v2：字段与 skill.md 一一对应）
 * ------------------------------------------------------------------
 * 界面分组 = skill.md 的三段结构：
 *   基础信息 → frontmatter 的 name / description / version / author / category / tags / license
 *   触发条件 → frontmatter 的 when_to_use
 *   可用工具 → frontmatter 的 tools
 *   技能正文 → skill.md 的正文（frontmatter 之后全部内容）
 *   附属资源 → 同级目录下的文件（导出时按原层级还原）
 * 校验沿用「提交后才暴露错误」的口径（见 BusinessProducts.vue）。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { useSmartStore } from '@/stores/smart'
import { useToast } from '@/composables/useToast'
import {
  classifySkillIcon,
  isNameTaken,
  normalizeTags,
  SMART_DESC_MAX,
  SMART_NAME_MAX,
  validateSkill,
  type SmartIssue
} from '@/composables/smartCore'
import { SKILL_FILE, RESOURCE_COUNT_MAX, RESOURCE_FILE_MAX } from '@/composables/skillPackageCore'
import { pickResourceFiles } from '@/utils/skillPackage'
import Icon from '@/components/Icon.vue'
import IconPickerDialog from '@/components/IconPickerDialog.vue'
import type { SmartSkill, SmartSkillResource } from '@/types'

const props = defineProps<{
  model: Partial<SmartSkill>
  editingId: string | null
  categories: string[]
  contentMax: number
}>()

const emit = defineEmits<{ close: []; save: [value: Partial<SmartSkill>] }>()

const store = useSmartStore()
const toast = useToast()

const title = computed(() => (props.editingId ? '编辑技能' : '新增技能'))

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

/** 本地草稿：取消/关闭不影响外部数据 */
const draft = ref<Partial<SmartSkill>>({})
const tagsInput = ref('')
const toolsInput = ref('')
const resources = ref<SmartSkillResource[]>([])

// ===== 技能图标：从「图标管理」选择 =====
// 与添加网站、分类管理同源：IconPickerDialog 负责图标库（预置 + 自定义）的搜索、分类筛选、
// 导入/上传；这里只保存选择结果到 extra.icon。空串 = 恢复默认内置图标。
const iconValue = ref('')
const iconPickerOpen = ref(false)

/** 渲染分支：image 走 <img>，builtin 走 <Icon>，text 走原样文本（v1 的 emoji） */
const iconInfo = computed(() => classifySkillIcon(iconValue.value))

function onPickIcon(src: string): void {
  iconValue.value = src
  iconPickerOpen.value = false
}

watch(
  () => props.model,
  m => {
    draft.value = { ...m, tags: Array.isArray(m.tags) ? [...m.tags] : [] }
    tagsInput.value = (m.tags ?? []).join('、')
    toolsInput.value = (m.tools ?? []).join('、')
    resources.value = (m.resources ?? []).map(r => ({ ...r }))
    // 图标存在 extra.icon：v1 迁过来的 emoji 与图标库地址都原样带回
    const raw = m.extra?.icon
    iconValue.value = typeof raw === 'string' ? raw : ''
  },
  { immediate: true }
)

const submitAttempted = ref(false)

const issues = computed<SmartIssue[]>(() => validateSkill(draft.value, store.skills, props.editingId))

function errorOf(field: string): string {
  if (!submitAttempted.value) return ''
  return issues.value.find(i => i.field === field)?.message ?? ''
}

const nameTaken = computed(() => {
  const name = String(draft.value.name ?? '').trim()
  if (!name) return false
  return isNameTaken(store.skills, name, props.editingId)
})

// ==================== 资源 ====================

const resourceTotal = computed(() => resources.value.reduce((s, r) => s + (r.size || 0), 0))

function removeResource(index: number): void {
  resources.value.splice(index, 1)
}

async function addResources(): Promise<void> {
  const picked = await pickResourceFiles()
  if (!picked) return
  const byPath = new Map(resources.value.map(r => [r.path, r]))
  let replaced = 0
  for (const r of picked.resources) {
    if (byPath.has(r.path)) replaced++
    byPath.set(r.path, r)
  }
  resources.value = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  const skipped = picked.skipped.length
  if (skipped) toast.warning(`已忽略 ${skipped} 个文件（超出数量或体积上限）`)
  else toast.success(`已添加 ${picked.resources.length} 个文件${replaced ? `，覆盖同名 ${replaced} 个` : ''}`)
}

function formatSize(n: number): string {
  const size = Number(n) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

// ==================== 提交 ====================

function submit(): void {
  submitAttempted.value = true
  if (issues.value.length) {
    toast.error(issues.value[0].message)
    return
  }
  const tags = normalizeTags(tagsInput.value.split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean))
  const tools = normalizeTags(toolsInput.value.split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean))
  // 图标写入 extra.icon（随技能一起落盘、进 zip、随 smart.json 同步）；
  // 选「恢复默认」时为空串，保留键但渲染层会回落到默认内置图标
  emit('save', {
    ...draft.value,
    tags,
    tools,
    extra: { ...(draft.value.extra ?? {}), icon: iconValue.value },
    resources: resources.value.map(r => ({ ...r }))
  })
}
</script>

<template>
  <BaseDialog :title="title" width="860px" :fullscreen="fullscreen" :close-on-overlay="false" :close-on-escape="false" @close="emit('close')">
    <!-- form 包住正文（回车提交仍可用）；底部按钮走 #footer（基类统一右对齐）。
         #footer 在 form 之外，故保存按钮改为 @click="submit"，不再用 native-type="submit"。 -->
    <form class="sk-form" @submit.prevent="submit">
      <section class="sk-sec">
        <h4 class="sk-sec-title">基础信息<span class="sk-sec-hint">（写入 skill.md 的 frontmatter）</span></h4>

        <div class="sk-row">
          <label class="sk-field">
            <span class="sk-label">名称 name<span class="req">*</span></span>
            <el-input
              v-model="draft.name"
              :maxlength="SMART_NAME_MAX"
              size="small"
              placeholder="例如：需求文档生成"
              data-testid="skill-editor-name"
            />
            <span v-if="errorOf('name') || nameTaken" class="sk-error">
              {{ errorOf('name') || '已存在同名技能' }}
            </span>
          </label>

          <label class="sk-field">
            <span class="sk-label">一句话说明 description<span class="req">*</span></span>
            <el-input
              v-model="draft.description"
              :maxlength="SMART_DESC_MAX"
              size="small"
              placeholder="说明这个技能做什么、什么时候该用它"
              data-testid="skill-editor-desc"
            />
            <span v-if="errorOf('description')" class="sk-error">{{ errorOf('description') }}</span>
          </label>
        </div>

        <div class="sk-row">
          <label class="sk-field sk-field-sm">
            <span class="sk-label">版本 version</span>
            <el-input v-model="draft.version" size="small" maxlength="20" placeholder="1.0.0" />
            <span v-if="errorOf('version')" class="sk-error">{{ errorOf('version') }}</span>
          </label>
          <label class="sk-field sk-field-sm">
            <span class="sk-label">作者 author</span>
            <el-input v-model="draft.author" size="small" :maxlength="SMART_NAME_MAX" placeholder="留空表示自己整理" />
            <span v-if="errorOf('author')" class="sk-error">{{ errorOf('author') }}</span>
          </label>
          <label class="sk-field sk-field-sm">
            <span class="sk-label">分类 category</span>
            <el-select
              v-model="draft.category"
              size="small"
              filterable
              allow-create
              default-first-option
              placeholder="选择或输入分类"
            >
              <el-option v-for="c in categories" :key="c" :value="c" :label="c" />
            </el-select>
          </label>
          <label class="sk-field sk-field-sm">
            <span class="sk-label">许可 license</span>
            <el-input v-model="draft.license" size="small" maxlength="40" placeholder="如 MIT，可留空" />
          </label>
        </div>

        <label class="sk-field">
          <span class="sk-label">标签 tags<span class="sk-hint">（用、或逗号分隔，最多 8 个）</span></span>
          <el-input v-model="tagsInput" size="small" placeholder="产品、文档" />
        </label>

        <!-- 图标：点图标弹框从「图标管理」选择（与添加网站、分类管理同源）；
             存 extra.icon，随技能一起落盘与云同步。不选则用默认内置图标 -->
        <div class="sk-field sk-field--icon-inline">
          <span class="sk-label">图标 icon<span class="sk-hint">（从图标管理选择，可留空）</span></span>
          <div class="sk-icon-row">
            <button
              type="button"
              class="sk-icon-btn"
              :class="{ 'is-empty': !iconValue }"
              title="从图标管理选择技能图标"
              data-testid="skill-editor-icon-btn"
              @click="iconPickerOpen = true"
            >
              <img v-if="iconInfo.kind === 'image'" :src="iconInfo.value" alt="" class="sk-icon-img" />
              <Icon v-else-if="iconInfo.kind === 'builtin'" :name="iconInfo.value" :size="16" />
              <span v-else class="sk-icon-text">{{ iconInfo.value }}</span>
            </button>
            <span class="sk-icon-name">{{ iconValue || '默认图标' }}</span>
            <el-button v-if="iconValue" size="small" data-testid="skill-editor-icon-clear" @click="iconValue = ''">
              恢复默认
            </el-button>
          </div>
        </div>
      </section>

      <section class="sk-sec">
        <h4 class="sk-sec-title">使用时机与工具<span class="sk-sec-hint">（可选，决定技能何时被调用）</span></h4>
        <label class="sk-field">
          <span class="sk-label">触发条件 when_to_use</span>
          <el-input
            v-model="draft.whenToUse"
            type="textarea"
            :rows="2"
            :maxlength="SMART_DESC_MAX"
            resize="vertical"
            placeholder="例如：当用户需要把模糊想法整理成需求文档时使用"
          />
        </label>
        <label class="sk-field">
          <span class="sk-label">可用工具 tools<span class="sk-hint">（用、或逗号分隔）</span></span>
          <el-input v-model="toolsInput" size="small" placeholder="Read、Grep、Bash" />
        </label>
      </section>

      <section class="sk-sec">
        <h4 class="sk-sec-title">技能正文<span class="sk-sec-hint">（{{ SKILL_FILE }} 中 frontmatter 之后的内容）</span></h4>
        <label class="sk-field">
          <span class="sk-label">正文 body<span class="req">*</span><span class="sk-hint">（支持 Markdown）</span></span>
          <el-input
            v-model="draft.body"
            type="textarea"
            :rows="14"
            :maxlength="contentMax"
            show-word-limit
            resize="vertical"
            placeholder="写给 AI 的操作指令：步骤、约束、输出格式……"
            data-testid="skill-editor-body"
          />
          <span v-if="errorOf('body')" class="sk-error">{{ errorOf('body') }}</span>
        </label>
      </section>

      <section class="sk-sec">
        <h4 class="sk-sec-title">
          附属资源
          <span class="sk-sec-hint">
            （与 {{ SKILL_FILE }} 同级的脚本 / 模板 / 参考文档，最多 {{ RESOURCE_COUNT_MAX }} 个、单文件 ≤
            {{ Math.round(RESOURCE_FILE_MAX / 1024 / 1024) }}MB）
          </span>
        </h4>

        <div class="sk-res-bar">
          <el-button size="small" data-testid="skill-editor-add-res" @click="addResources">＋ 添加文件</el-button>
          <span v-if="resources.length" class="sk-res-sum">
            共 {{ resources.length }} 个 · {{ formatSize(resourceTotal) }}
          </span>
        </div>

        <ul v-if="resources.length" class="sk-res-list">
          <li v-for="(r, i) in resources" :key="r.path" class="sk-res-item">
            <span class="sk-res-path" :title="r.path">{{ r.path }}</span>
            <span class="sk-res-size">{{ formatSize(r.size) }}</span>
            <span class="sk-res-enc">{{ r.encoding === 'text' ? '文本' : '二进制' }}</span>
            <button type="button" class="sk-res-del" @click="removeResource(i)">移除</button>
          </li>
        </ul>
        <p v-else class="sk-res-empty">暂无资源。技能可以只有 {{ SKILL_FILE }}，也可以带上脚本、模板、参考文档。</p>
      </section>

    </form>

    <!-- 技能图标选择弹框：必须放在 <form> 之外——弹框内搜索框按回车会触发隐式表单提交，误保存技能 -->
    <IconPickerDialog
      v-if="iconPickerOpen"
      title="选择技能图标"
      :current="iconValue"
      @select="onPickIcon"
      @close="iconPickerOpen = false"
    />

    <template #header-actions>
      <button
        class="close-btn"
        type="button"
        :title="fullscreen ? '退出全屏' : '全屏显示'"
        :aria-label="fullscreen ? '退出全屏' : '全屏显示'"
        data-testid="skill-editor-fullscreen"
        @click="fullscreen = !fullscreen"
      >
        <Icon :name="fullscreen ? 'fullscreen-exit' : 'fullscreen'" />
      </button>
    </template>

    <template #footer>
      <el-button size="small" @click="emit('close')">取消</el-button>
      <el-button type="primary" size="small" data-testid="skill-editor-save" @click="submit">
        {{ editingId ? '保存' : '添加' }}
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.sk-form { display: flex; flex-direction: column; gap: 14px; }
.sk-sec { display: flex; flex-direction: column; gap: 10px; }
.sk-sec-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #111827);
  border-left: 3px solid var(--color-primary, #3b82f6);
  padding-left: 8px;
}
.sk-sec-hint { font-weight: 400; font-size: 12px; color: var(--color-text-muted, #9ca3af); }
.sk-row { display: flex; gap: 10px; flex-wrap: wrap; }
.sk-field { display: flex; flex-direction: column; gap: 6px; flex: 1 1 240px; min-width: 0; }
.sk-field-sm { flex: 0 1 180px; }
.sk-label { font-size: 13px; color: var(--color-text-secondary, #6b7280); }
.sk-hint { color: var(--color-text-muted, #9ca3af); font-size: 12px; }
.req { color: var(--color-error, #dc2626); }
.sk-error { font-size: 12px; color: var(--color-error, #dc2626); }

/* 技能图标选择行：图标按钮 + 当前图标说明 + 恢复默认（与分类管理的 .cat-icon-btn 同款） */
.sk-icon-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
/* 图标字段：label 与图标选择行并排一行（消除上下大空白），仅在技能编辑弹框使用 */
.sk-field--icon-inline { flex-direction: row; align-items: center; gap: 10px; }
.sk-field--icon-inline .sk-label { flex: 0 0 auto; }
.sk-field--icon-inline .sk-icon-row { flex: 1 1 auto; }
.sk-icon-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 3px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
  overflow: hidden;
  transition: border-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}
.sk-icon-btn:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}
.sk-icon-btn:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 2px;
}
.sk-icon-btn.is-empty { color: var(--color-text-muted, #94a3b8); }
.sk-icon-img { width: 100%; height: 100%; object-fit: contain; border-radius: 4px; }
.sk-icon-text { font-size: 18px; line-height: 1; }
.sk-icon-name { font-size: 12px; color: var(--color-text-muted, #9ca3af); }

.sk-res-bar { display: flex; align-items: center; gap: 10px; }
.sk-res-sum { font-size: 12px; color: var(--color-text-muted, #9ca3af); }
.sk-res-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}
.sk-res-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  font-size: 12px;
}
.sk-res-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text, #111827);
}
.sk-res-size { color: var(--color-text-muted, #9ca3af); flex: 0 0 auto; }
.sk-res-enc { color: var(--color-text-muted, #9ca3af); flex: 0 0 auto; }
.sk-res-del {
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  cursor: pointer;
}
.sk-res-del:hover { border-color: var(--color-error, #dc2626); color: var(--color-error, #dc2626); }
.sk-res-empty { margin: 0; font-size: 12px; color: var(--color-text-muted, #9ca3af); }


@media (max-width: 768px) {
  .sk-field-sm { flex: 1 1 100%; }
}
</style>
