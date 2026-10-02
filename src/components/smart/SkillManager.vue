<script setup lang="ts">
/**
 * 智能工作台 · 技能管理
 * 列表（搜索 / 分类 / 标签筛选 / 排序）+ 增删改查 + 导入导出（下载 & 上传）+ 一键复制正文。
 * 校验、归一化、信封解析全部委托 smartCore 纯函数，本组件只负责交互与呈现。
 */
import { computed, ref } from 'vue'
import { useSmartStore } from '@/stores/smart'
import { showConfirm } from '@/utils/dialog'
import { useToast } from '@/composables/useToast'
import { copyText, dateStamp, downloadText, pickFileText } from '@/utils/download'
import {
  filterSmart,
  markdownToSkill,
  normalizeSkill,
  parseEnvelope,
  skillToMarkdown,
  SMART_SKILL_KIND,
  SMART_CONTENT_MAX,
  SMART_DESC_MAX,
  SMART_NAME_MAX,
  sortSmart,
  UNCATEGORIZED,
  validateSkill,
  type SmartSort,
  type SmartFilter
} from '@/composables/smartCore'
import type { SmartImportPreview, SmartSkill } from '@/types'
import SmartEditorDialog from './SmartEditorDialog.vue'
import SmartImportDialog from './SmartImportDialog.vue'
import SmartDetailDialog from './SmartDetailDialog.vue'

const store = useSmartStore()
const toast = useToast()

// ===== 筛选与排序 =====
const keyword = ref('')
const category = ref('')
const activeTags = ref<string[]>([])
const sort = ref<SmartSort>('updated')

const filter = computed<SmartFilter>(() => ({
  q: keyword.value,
  category: category.value,
  tags: activeTags.value
}))

const visible = computed(() => sortSmart(filterSmart(store.skills, filter.value), sort.value))
const allTags = computed(() => {
  const out: string[] = []
  for (const s of store.skills) for (const t of s.tags) if (!out.includes(t)) out.push(t)
  return out
})
const hasFilter = computed(() => !!keyword.value.trim() || !!category.value || activeTags.value.length > 0)

function resetFilter(): void {
  keyword.value = ''
  category.value = ''
  activeTags.value = []
}

function toggleTag(t: string): void {
  activeTags.value = activeTags.value.includes(t) ? activeTags.value.filter(x => x !== t) : [...activeTags.value, t]
}

// ===== 编辑弹框 =====
const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const form = ref<Partial<SmartSkill>>({})

function openAdd(): void {
  editingId.value = null
  form.value = { name: '', category: UNCATEGORIZED, icon: '', tags: [], version: '1.0.0', author: '', description: '', content: '' }
  editorOpen.value = true
}

function openEdit(s: SmartSkill): void {
  editingId.value = s.id
  form.value = { ...s, tags: [...s.tags] }
  editorOpen.value = true
}

/** 保存：校验通过才落库；失败提示首个错误（行内错误由弹框组件自己展示） */
function handleSave(next: Partial<SmartSkill>): void {
  const issues = validateSkill(next, store.skills, editingId.value)
  if (issues.length) {
    toast.error(issues[0].message)
    return
  }
  if (editingId.value) {
    store.updateSkill(editingId.value, next)
    toast.success('技能已保存')
  } else {
    store.addSkill(next)
    toast.success('技能已添加')
  }
  editorOpen.value = false
}

// ===== 删除 / 克隆 / 使用 =====
async function handleDelete(s: SmartSkill): Promise<void> {
  if (!await showConfirm(`确定删除技能「${s.name}」吗？删除后不可恢复。`)) return
  if (store.deleteSkill(s.id)) toast.success('已删除')
}

function handleClone(s: SmartSkill): void {
  const id = store.cloneSkill(s.id)
  if (id) toast.success(`已复制为「${store.skills.find(x => x.id === id)?.name}」`)
}

async function handleCopy(s: SmartSkill): Promise<void> {
  const ok = await copyText(s.content, `已复制「${s.name}」正文`)
  if (ok) store.touchSkill(s.id)
}

// ===== 详情 =====
const detailOpen = ref(false)
const detailItem = ref<SmartSkill | null>(null)
function openDetail(s: SmartSkill): void {
  detailItem.value = s
  detailOpen.value = true
}

// ===== 导出 =====
function exportOneJson(s: SmartSkill): void {
  const env = { kind: SMART_SKILL_KIND, version: 1, exportedAt: Date.now(), items: [s] }
  downloadText(`${safeName(s.name)}.json`, JSON.stringify(env, null, 2))
}

function exportOneMd(s: SmartSkill): void {
  downloadText(`${safeName(s.name)}.md`, skillToMarkdown(s), 'text/markdown;charset=utf-8')
}

function exportAll(): void {
  const env = store.exportSkills()
  if (env.items.length === 0) {
    toast.warning('还没有技能可导出')
    return
  }
  downloadText(`smart-skills-${dateStamp()}.json`, JSON.stringify(env, null, 2))
}

/** 文件名安全化：去掉路径分隔符与控制字符，避免下载名异常 */
function safeName(name: string): string {
  return (name || 'skill').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
}

// ===== 导入 =====
const importOpen = ref(false)
const pendingPlan = ref<SmartImportPreview<SmartSkill> | null>(null)

async function handleImport(): Promise<void> {
  const picked = await pickFileText('.json,.md,application/json,text/markdown')
  if (!picked) return

  let items: SmartSkill[] = []
  if (picked.name.toLowerCase().endsWith('.md')) {
    const one = markdownToSkill(picked.text, picked.name.replace(/\.md$/i, ''))
    if (!one) {
      toast.error('Markdown 文件没有可导入的内容')
      return
    }
    items = [one]
  } else {
    const res = parseEnvelope(picked.text, SMART_SKILL_KIND, normalizeSkill)
    if (!res.ok) {
      toast.error(res.message)
      return
    }
    items = res.items
  }

  const plan = store.previewSkillImport(items)
  if (plan.added.length === 0 && plan.updated.length === 0) {
    toast.info(plan.skipped > 0 ? '文件内容与现有技能相同，无需导入' : '没有可导入的条目')
    return
  }
  pendingPlan.value = plan
  importOpen.value = true
}

function confirmImport(): void {
  const plan = pendingPlan.value
  if (!plan) return
  const r = store.commitSkillImport(plan)
  toast.success(`导入完成：新增 ${r.added} 条，更新 ${r.updated} 条`)
  importOpen.value = false
  pendingPlan.value = null
}

// ===== 恢复内置示例 =====
function restoreBuiltIns(): void {
  const r = store.restoreBuiltIns()
  toast.success(r.skills > 0 ? `已补回 ${r.skills} 条内置示例` : '内置示例都在，无需补回')
}

/** 相对时间：与项目既有文案口径一致（今天 / 昨天 / N 天前 / 日期） */
function relTime(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const day0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (ts >= day0) return `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (ts >= day0 - 86400000) return '昨天'
  const days = Math.floor((day0 - ts) / 86400000)
  if (days < 30) return `${days} 天前`
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
</script>

<template>
  <div class="sm-wrap">
    <!-- 工具栏 -->
    <div class="sm-toolbar">
      <div class="sm-toolbar-left">
        <el-input v-model="keyword" size="small" class="sm-search" placeholder="搜索名称 / 描述 / 标签 / 正文" clearable />
        <select v-model="category" class="sm-select" aria-label="按分类筛选">
          <option value="">全部分类</option>
          <option v-for="c in store.skillCategories" :key="c" :value="c">{{ c }}</option>
        </select>
        <select v-model="sort" class="sm-select" aria-label="排序方式">
          <option value="updated">最近更新</option>
          <option value="name">名称</option>
          <option value="usage">使用次数</option>
        </select>
      </div>
      <div class="sm-toolbar-right">
        <el-button size="small" data-testid="smart-skill-add" @click="openAdd">＋ 新增技能</el-button>
        <el-button size="small" data-testid="smart-skill-import" @click="handleImport">导入</el-button>
        <el-button size="small" data-testid="smart-skill-export-all" @click="exportAll">导出全部</el-button>
      </div>
    </div>

    <!-- 标签筛选 -->
    <div v-if="allTags.length" class="sm-tags">
      <button
        v-for="t in allTags"
        :key="t"
        type="button"
        class="sm-tag"
        :class="{ 'is-on': activeTags.includes(t) }"
        @click="toggleTag(t)"
      >{{ t }}</button>
      <button v-if="hasFilter" type="button" class="sm-tag-reset" @click="resetFilter">清空筛选</button>
    </div>

    <!-- 列表 -->
    <div v-if="visible.length" class="sm-list">
      <article v-for="s in visible" :key="s.id" class="sm-card" :data-testid="`smart-skill-${s.id}`">
        <header class="sm-card-head">
          <span class="sm-icon">{{ s.icon }}</span>
          <div class="sm-card-title">
            <button type="button" class="sm-name" @click="openDetail(s)">{{ s.name }}</button>
            <span class="sm-meta">
              <span class="sm-cat">{{ s.category }}</span>
              <span v-if="s.version" class="sm-dot">·</span>
              <span v-if="s.version" class="sm-version">v{{ s.version }}</span>
              <span class="sm-dot">·</span>
              <span>{{ relTime(s.updatedAt) }}</span>
              <span v-if="s.usageCount > 0" class="sm-dot">·</span>
              <span v-if="s.usageCount > 0">用过 {{ s.usageCount }} 次</span>
            </span>
          </div>
          <span v-if="s.isBuiltIn" class="sm-builtin" title="内置示例">内置</span>
        </header>
        <p v-if="s.description" class="sm-desc">{{ s.description }}</p>
        <div v-if="s.tags.length" class="sm-card-tags">
          <span v-for="t in s.tags" :key="t" class="sm-chip">#{{ t }}</span>
        </div>
        <footer class="sm-actions">
          <button type="button" class="sm-btn" :data-testid="`smart-skill-copy-${s.id}`" @click="handleCopy(s)">复制正文</button>
          <button type="button" class="sm-btn" @click="openDetail(s)">详情</button>
          <button type="button" class="sm-btn" @click="openEdit(s)">编辑</button>
          <button type="button" class="sm-btn" @click="handleClone(s)">副本</button>
          <span class="sm-spacer" />
          <button type="button" class="sm-btn" @click="exportOneMd(s)" title="下载为 Markdown">↓ md</button>
          <button type="button" class="sm-btn" @click="exportOneJson(s)" title="下载为 JSON">↓ json</button>
          <button type="button" class="sm-btn is-danger" :data-testid="`smart-skill-del-${s.id}`" @click="handleDelete(s)">删除</button>
        </footer>
      </article>
    </div>

    <!-- 空态 -->
    <div v-else class="sm-empty">
      <p class="sm-empty-title">{{ hasFilter ? '没有匹配的技能' : '还没有技能' }}</p>
      <p class="sm-empty-hint">
        {{ hasFilter ? '换个关键字，或清空筛选条件试试。' : '把反复使用的 AI 工作流沉淀成技能，下次直接复制即可。' }}
      </p>
      <div class="sm-empty-actions">
        <el-button v-if="hasFilter" size="small" @click="resetFilter">清空筛选</el-button>
        <el-button v-else size="small" type="primary" @click="openAdd">＋ 新增技能</el-button>
        <el-button size="small" @click="handleImport">导入文件</el-button>
        <el-button size="small" @click="restoreBuiltIns">恢复内置示例</el-button>
      </div>
    </div>

    <!-- 编辑弹框 -->
    <SmartEditorDialog
      v-if="editorOpen"
      kind="skill"
      :model="form"
      :editing-id="editingId"
      :categories="store.skillCategories"
      :name-max="SMART_NAME_MAX"
      :desc-max="SMART_DESC_MAX"
      :content-max="SMART_CONTENT_MAX"
      @close="editorOpen = false"
      @save="handleSave"
    />

    <!-- 详情弹框 -->
    <SmartDetailDialog
      v-if="detailOpen && detailItem"
      kind="skill"
      :item="detailItem"
      @close="detailOpen = false"
    />

    <!-- 导入预览 -->
    <SmartImportDialog
      v-if="importOpen && pendingPlan"
      kind-label="技能"
      :added="pendingPlan.added.map(s => s.name)"
      :updated="pendingPlan.updated.map(s => s.name)"
      :skipped="pendingPlan.skipped"
      @close="importOpen = false; pendingPlan = null"
      @confirm="confirmImport"
    />
  </div>
</template>

<style scoped>
.sm-wrap { display: flex; flex-direction: column; gap: 12px; }

.sm-toolbar { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center; }
.sm-toolbar-left, .sm-toolbar-right { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.sm-search { width: 260px; }
.sm-select {
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  color: var(--color-text, #111827);
  font-size: 13px;
}

.sm-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.sm-tag, .sm-tag-reset {
  padding: 2px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  cursor: pointer;
}
.sm-tag.is-on {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
}
.sm-tag-reset { color: var(--color-text-muted, #9ca3af); }

.sm-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.sm-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 10px);
  background: var(--color-bg-card, #fff);
}
.sm-card-head { display: flex; gap: 10px; align-items: flex-start; }
.sm-icon { font-size: 20px; line-height: 1.2; flex: 0 0 auto; }
.sm-card-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.sm-name {
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text, #111827);
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-name:hover { color: var(--color-primary, #3b82f6); }
.sm-meta { font-size: 12px; color: var(--color-text-muted, #9ca3af); display: flex; gap: 4px; flex-wrap: wrap; }
.sm-cat { color: var(--color-text-secondary, #6b7280); }
.sm-dot { opacity: .6; }
.sm-builtin {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--color-bg-hover, #f3f4f6);
  color: var(--color-text-muted, #9ca3af);
  font-size: 11px;
}
.sm-desc {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sm-card-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.sm-chip { font-size: 12px; color: var(--color-primary, #3b82f6); }

.sm-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: auto; }
.sm-spacer { flex: 1 1 auto; }
.sm-btn {
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  cursor: pointer;
}
.sm-btn:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.sm-btn.is-danger:hover { border-color: var(--color-error, #dc2626); color: var(--color-error, #dc2626); }

.sm-empty {
  padding: 40px 16px;
  text-align: center;
  border: 1px dashed var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 10px);
}
.sm-empty-title { margin: 0 0 4px; font-size: 14px; font-weight: 600; color: var(--color-text, #111827); }
.sm-empty-hint { margin: 0 0 12px; font-size: 13px; color: var(--color-text-secondary, #6b7280); }
.sm-empty-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }

/* 移动端：单列 + 触控目标 ≥44px */
@media (max-width: 768px) {
  .sm-list { grid-template-columns: 1fr; }
  .sm-search { width: 100%; }
  .sm-toolbar-left, .sm-toolbar-right { width: 100%; }
  .sm-btn { min-height: 44px; padding: 8px 12px; font-size: 13px; }
  .sm-select { height: 44px; font-size: 16px; }
}
</style>
