<script setup lang="ts">
/**
 * 智能工作台 · 技能编辑弹框（v2：字段与 skill.md 一一对应）
 * ------------------------------------------------------------------
 * 界面分组 = skill.md 的结构：
 *   基础信息 → frontmatter 的 name / description / version / author / category / tags / license / github
 *   附属资源 → 同级目录下的文件（导出时按原层级还原）；其中 skill.md 是固定条目，
 *              点开可查看 frontmatter 并编辑正文
 * when_to_use / tools 不提供输入框（原「使用时机与工具」区块已移除）：
 *   导入的 skill.md 若带这两项，保存时原样保留（不覆盖、不清空）。
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
import { SKILL_FILE, RESOURCE_COUNT_MAX, RESOURCE_FILE_MAX, skillToMarkdown } from '@/composables/skillPackageCore'
import { pickResourceFiles } from '@/utils/skillPackage'
import { copyText } from '@/utils/download'
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
    // 正文的输入框在 skill.md 子弹框里，校验失败时直接打开，避免「看不到哪里要改」
    if (issues.value.some(i => i.field === 'body')) skillFileOpen.value = true
    return
  }
  const tags = splitList(tagsInput.value)
  // 图标写入 extra.icon（随技能一起落盘、进 zip、随 smart.json 同步）；
  // 选「恢复默认」时为空串，保留键但渲染层会回落到默认内置图标。
  // tools 无输入框：不覆盖 draft.tools，导入来的 skill.md 若带 tools 原样保留。
  emit('save', {
    ...draft.value,
    tags,
    extra: { ...(draft.value.extra ?? {}), icon: iconValue.value },
    resources: resources.value.map(r => ({ ...r }))
  })
}

// ==================== skill.md 查看 / 编辑 ====================
// 正文不再单独成段：「技能正文」就是 skill.md，在附属资源里作为固定条目展示，
// 点开子弹框可查看 frontmatter（由基础信息实时生成）并编辑正文。

const skillFileOpen = ref(false)

/** 把「标签 / 工具」输入框的文本切成数组（与提交同口径） */
function splitList(raw: string): string[] {
  return normalizeTags(raw.split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean))
}

const bodyText = computed(() => String(draft.value.body ?? ''))
const bodyLength = computed(() => bodyText.value.length)

/** skill.md 全文（frontmatter 由上方字段实时生成），用于预览与复制 */
const skillMdText = computed(() =>
  skillToMarkdown({
    ...draft.value,
    tags: splitList(tagsInput.value),
    tools: Array.isArray(draft.value.tools) ? draft.value.tools : []
  })
)
/** 只截 frontmatter 段（--- ... ---），正文在下方单独编辑 */
const frontmatterText = computed(() => {
  const matched = /^---\r?\n[\s\S]*?\r?\n---/.exec(skillMdText.value)
  return matched ? matched[0] : '---\n---'
})

/** ESC 只关 skill.md 子弹框：注册在 document 捕获阶段并阻止继续传播，
    避免连带关闭技能编辑弹框（后者在 window 冒泡阶段监听 ESC）。 */
function onSkillFileKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  skillFileOpen.value = false
}
watch(skillFileOpen, open => {
  if (open) document.addEventListener('keydown', onSkillFileKeydown, true)
  else document.removeEventListener('keydown', onSkillFileKeydown, true)
})
onUnmounted(() => document.removeEventListener('keydown', onSkillFileKeydown, true))

/** 复制整份 skill.md（含 frontmatter）；复制后记为一次使用（编辑态才计数） */
async function copySkillMd(): Promise<void> {
  if (!bodyText.value.trim()) {
    toast.warning('正文为空，暂无可复制内容')
    return
  }
  const ok = await copyText(skillMdText.value, `已复制 ${SKILL_FILE}`)
  if (ok && props.editingId) store.touchSkill(props.editingId)
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
        </div>

        <!-- 一句话说明：改多行输入（description 通常是完整短句，单行看不全） -->
        <label class="sk-field">
          <span class="sk-label">一句话说明 description<span class="req">*</span></span>
          <el-input
            v-model="draft.description"
            type="textarea"
            :rows="2"
            :maxlength="SMART_DESC_MAX"
            show-word-limit
            resize="vertical"
            placeholder="说明这个技能做什么、什么时候该用它"
            data-testid="skill-editor-desc"
          />
          <span v-if="errorOf('description')" class="sk-error">{{ errorOf('description') }}</span>
        </label>

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
          <span class="sk-label">GitHub 地址 github<span class="sk-hint">（可选，仓库或主页链接）</span></span>
          <el-input v-model="draft.github" size="small" maxlength="255" placeholder="https://github.com/owner/repo" data-testid="skill-editor-github" />
        </label>

        <label class="sk-field">
          <span class="sk-label">标签 tags<span class="sk-hint">（用、或逗号分隔，最多 8 个）</span></span>
          <el-input v-model="tagsInput" size="small" placeholder="产品、文档" />
        </label>

        <!-- 图标：点图标弹框从「图标管理」选择（与添加网站、分类管理同源）；
             存 extra.icon，随技能一起落盘与云同步。不选则用默认内置图标 -->
        <div class="sk-field sk-field--icon-inline">
          <span class="sk-label">图标 icon</span>
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

      <section class="sk-sec sk-sec--res">
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

        <ul class="sk-res-list">
          <!-- skill.md 是技能主文件：固定存在、不可移除；点开可查看 frontmatter 并编辑正文 -->
          <li class="sk-res-item sk-res-item--main">
            <span class="sk-res-path" :title="SKILL_FILE">{{ SKILL_FILE }}</span>
            <span class="sk-res-size">{{ bodyLength }} 字</span>
            <span class="sk-res-enc">文本</span>
            <span v-if="!bodyText.trim()" class="sk-res-tag">正文待填写</span>
            <button
              type="button"
              class="sk-res-open"
              data-testid="skill-editor-open-skillmd"
              @click="skillFileOpen = true"
            >
              查看 / 编辑
            </button>
          </li>
          <li v-for="(r, i) in resources" :key="r.path" class="sk-res-item">
            <span class="sk-res-path" :title="r.path">{{ r.path }}</span>
            <span class="sk-res-size">{{ formatSize(r.size) }}</span>
            <span class="sk-res-enc">{{ r.encoding === 'text' ? '文本' : '二进制' }}</span>
            <button type="button" class="sk-res-del" @click="removeResource(i)">移除</button>
          </li>
        </ul>
        <p v-if="!resources.length" class="sk-res-empty">
          暂无其它资源。技能可以只有 {{ SKILL_FILE }}，也可以带上脚本、模板、参考文档。
        </p>
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

    <!-- skill.md 查看 / 编辑子弹框：正文直接写回 draft.body（实时生效，无需额外保存） -->
    <BaseDialog
      v-if="skillFileOpen"
      :title="`查看 / 编辑 ${SKILL_FILE}`"
      width="760px"
      max-height="86vh"
      :z-index="400"
      :close-on-escape="false"
      teleport
      @close="skillFileOpen = false"
    >
      <div class="sk-md">
        <p class="sk-md-tip">
          frontmatter 由「基础信息」自动生成，这里只需维护正文（frontmatter 之后的 Markdown 内容）。
        </p>
        <div class="sk-md-block">
          <span class="sk-md-label">frontmatter<span class="sk-hint">（只读，随上方字段实时更新）</span></span>
          <pre class="sk-md-fm">{{ frontmatterText }}</pre>
        </div>
        <label class="sk-field">
          <span class="sk-label">正文 body<span class="req">*</span><span class="sk-hint">（支持 Markdown）</span></span>
          <el-input
            v-model="draft.body"
            type="textarea"
            :rows="16"
            :maxlength="contentMax"
            show-word-limit
            resize="vertical"
            placeholder="写给 AI 的操作指令：步骤、约束、输出格式……"
            data-testid="skill-editor-body"
          />
          <span v-if="errorOf('body')" class="sk-error">{{ errorOf('body') }}</span>
        </label>
      </div>
      <template #footer>
        <el-button size="small" data-testid="skill-editor-copy-skillmd" @click="copySkillMd">复制全文</el-button>
        <el-button type="primary" size="small" data-testid="skill-editor-skillmd-done" @click="skillFileOpen = false">
          完成
        </el-button>
      </template>
    </BaseDialog>

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
.sk-form { display: flex; flex-direction: column; gap: 14px; min-height: 100%; }
.sk-sec { display: flex; flex-direction: column; gap: 10px; }
/* 「附属资源」吃掉弹框剩余高度（内容少时列表铺到底，内容多时整页由 .bd-body 滚动） */
.sk-sec--res { flex: 1 1 auto; }
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
.sk-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
/* 仅「基础信息」行内字段按 240px 弹性分配宽度；独立成行的字段（说明 / 标签 / 图标 / 触发条件 / 工具）
   不再被 flex-basis:240px 撑成 240px 高的大块空白，改按内容自然高度 */
.sk-row .sk-field { flex: 1 1 240px; }
.sk-row .sk-field-sm { flex: 0 1 180px; }
.sk-md { display: flex; flex-direction: column; gap: 12px; }
.sk-md-tip { margin: 0; font-size: 12px; color: var(--color-text-muted, #9ca3af); }
.sk-md-block { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.sk-md-label { font-size: 13px; color: var(--color-text-secondary, #6b7280); }
.sk-md-fm {
  margin: 0;
  padding: 8px 10px;
  max-height: 150px;
  overflow: auto;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background-color: var(--color-bg-subtle, rgba(148, 163, 184, 0.08));
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--color-text-secondary, #6b7280);
}
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
/* 列表不设内部滚动（原 max-height:180px + overflow-y:auto 会让资源多时出现嵌套滚动条）：
   高度随内容自然撑满，超出部分由弹框 body 整体滚动 */
.sk-res-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  max-height: none;
  overflow: visible;
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
/* skill.md 固定条目：淡主色底 + 可点开的「查看 / 编辑」按钮 */
.sk-res-item--main { background-color: var(--color-primary-soft, rgba(59, 130, 246, 0.07)); }
.sk-res-tag {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
  color: var(--color-warning, #d97706);
  background-color: var(--color-warning-soft, rgba(217, 119, 6, 0.12));
}
.sk-res-open {
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 4px;
  background: transparent;
  color: var(--color-primary, #3b82f6);
  font-size: 12px;
  cursor: pointer;
}
.sk-res-open:hover { border-color: var(--color-primary, #3b82f6); }
.sk-res-empty { margin: 0; font-size: 12px; color: var(--color-text-muted, #9ca3af); }


@media (max-width: 768px) {
  .sk-row .sk-field-sm { flex: 1 1 100%; }
}
</style>
