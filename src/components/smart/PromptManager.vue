<script setup lang="ts">
/**
 * 智能工作台 · 提示词管理
 * 列表（搜索 / 分类 / 标签 / 收藏筛选 / 排序）+ 增删改查 + 导入导出 + **变量填充**。
 * 变量填充是本模块的核心提效点：填表即生成可粘贴的最终文本，而不是手动替换 {{占位}}。
 */
import { computed, ref } from 'vue'
import { useSmartStore } from '@/stores/smart'
import { showConfirm } from '@/utils/dialog'
import { useToast } from '@/composables/useToast'
import { copyText, dateStamp, downloadText, pickFileText } from '@/utils/download'
import {
  filterSmart,
  normalizePrompt,
  parseEnvelope,
  SMART_CONTENT_MAX,
  SMART_DESC_MAX,
  SMART_NAME_MAX,
  SMART_PROMPT_KIND,
  sortSmart,
  UNCATEGORIZED,
  validatePrompt,
  type SmartSort,
  type SmartFilter
} from '@/composables/smartCore'
import type { SmartImportPreview, SmartPrompt } from '@/types'
import SmartEditorDialog from './SmartEditorDialog.vue'
import SmartImportDialog from './SmartImportDialog.vue'
import SmartDetailDialog from './SmartDetailDialog.vue'
import PromptUseDialog from './PromptUseDialog.vue'

const store = useSmartStore()
const toast = useToast()

// ===== 筛选与排序 =====
const keyword = ref('')
const category = ref('')
const activeTags = ref<string[]>([])
const sort = ref<SmartSort>('updated')
const favoriteOnly = ref(false)

const filter = computed<SmartFilter>(() => ({
  q: keyword.value,
  category: category.value,
  tags: activeTags.value,
  favoriteOnly: favoriteOnly.value
}))

const visible = computed(() => sortSmart(filterSmart(store.prompts, filter.value), sort.value))
const allTags = computed(() => {
  const out: string[] = []
  for (const p of store.prompts) for (const t of p.tags) if (!out.includes(t)) out.push(t)
  return out
})
const hasFilter = computed(
  () => !!keyword.value.trim() || !!category.value || activeTags.value.length > 0 || favoriteOnly.value
)

function resetFilter(): void {
  keyword.value = ''
  category.value = ''
  activeTags.value = []
  favoriteOnly.value = false
}

function toggleTag(t: string): void {
  activeTags.value = activeTags.value.includes(t) ? activeTags.value.filter(x => x !== t) : [...activeTags.value, t]
}

// ===== 编辑 =====
const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const form = ref<Partial<SmartPrompt>>({})

function openAdd(): void {
  editingId.value = null
  form.value = { title: '', category: UNCATEGORIZED, tags: [], model: '', content: '', isFavorite: false }
  editorOpen.value = true
}

function openEdit(p: SmartPrompt): void {
  editingId.value = p.id
  form.value = { ...p, tags: [...p.tags] }
  editorOpen.value = true
}

function handleSave(next: Partial<SmartPrompt>): void {
  const issues = validatePrompt(next, store.prompts, editingId.value)
  if (issues.length) {
    toast.error(issues[0].message)
    return
  }
  if (editingId.value) {
    store.updatePrompt(editingId.value, next)
    toast.success('提示词已保存')
  } else {
    store.addPrompt(next)
    toast.success('提示词已添加')
  }
  editorOpen.value = false
}

// ===== 其它操作 =====
async function handleDelete(p: SmartPrompt): Promise<void> {
  if (!await showConfirm(`确定删除提示词「${p.title}」吗？删除后不可恢复。`)) return
  if (store.deletePrompt(p.id)) toast.success('已删除')
}

function handleClone(p: SmartPrompt): void {
  const id = store.clonePrompt(p.id)
  if (id) toast.success(`已复制为「${store.prompts.find(x => x.id === id)?.title}」`)
}

async function handleCopy(p: SmartPrompt): Promise<void> {
  const ok = await copyText(p.content, `已复制「${p.title}」`)
  if (ok) store.touchPrompt(p.id)
}

function toggleFav(p: SmartPrompt): void {
  store.toggleFavorite(p.id)
}

// ===== 变量填充 =====
const useOpen = ref(false)
const useItem = ref<SmartPrompt | null>(null)
function openUse(p: SmartPrompt): void {
  useItem.value = p
  useOpen.value = true
}

/** 填充弹框回调：复制成功后累加使用次数 */
function onUsed(): void {
  const p = useItem.value
  if (p) store.touchPrompt(p.id)
}

// ===== 详情 =====
const detailOpen = ref(false)
const detailItem = ref<SmartPrompt | null>(null)
function openDetail(p: SmartPrompt): void {
  detailItem.value = p
  detailOpen.value = true
}

// ===== 导出 / 导入 =====
function safeName(name: string): string {
  return (name || 'prompt').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
}

function exportOne(p: SmartPrompt): void {
  const env = { kind: SMART_PROMPT_KIND, version: 1, exportedAt: Date.now(), items: [p] }
  downloadText(`${safeName(p.title)}.json`, JSON.stringify(env, null, 2))
}

function exportAll(): void {
  const env = store.exportPrompts()
  if (env.items.length === 0) {
    toast.warning('还没有提示词可导出')
    return
  }
  downloadText(`smart-prompts-${dateStamp()}.json`, JSON.stringify(env, null, 2))
}

const importOpen = ref(false)
const pendingPlan = ref<SmartImportPreview<SmartPrompt> | null>(null)

async function handleImport(): Promise<void> {
  const picked = await pickFileText('.json,application/json')
  if (!picked) return
  const res = parseEnvelope(picked.text, SMART_PROMPT_KIND, normalizePrompt)
  if (!res.ok) {
    toast.error(res.message)
    return
  }
  const plan = store.previewPromptImport(res.items)
  if (plan.added.length === 0 && plan.updated.length === 0) {
    toast.info(plan.skipped > 0 ? '文件内容与现有提示词相同，无需导入' : '没有可导入的条目')
    return
  }
  pendingPlan.value = plan
  importOpen.value = true
}

function confirmImport(): void {
  const plan = pendingPlan.value
  if (!plan) return
  const r = store.commitPromptImport(plan)
  toast.success(`导入完成：新增 ${r.added} 条，更新 ${r.updated} 条`)
  importOpen.value = false
  pendingPlan.value = null
}

/**
 * 空态说明文案。
 * 注意：文案里的 `{{变量}}` 是给用户的语法示例，不能直接写在模板文本里 ——
 * 模板解析器会把 `{{` 当插值起点，编译失败。故在脚本中以常量承载。
 */
const emptyHint = '把反复重写的提示词存下来，用 {{变量}} 占位，下次填表即可。'

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

/** 预览首页片段，便于快速辨认内容 */
function excerpt(p: SmartPrompt): string {
  return p.content.replace(/\s+/g, ' ').slice(0, 80)
}
</script>

<template>
  <div class="pm-wrap">
    <div class="pm-toolbar">
      <div class="pm-toolbar-left">
        <el-input v-model="keyword" size="small" class="pm-search" placeholder="搜索标题 / 标签 / 正文" clearable />
        <select v-model="category" class="pm-select" aria-label="按分类筛选">
          <option value="">全部分类</option>
          <option v-for="c in store.promptCategories" :key="c" :value="c">{{ c }}</option>
        </select>
        <select v-model="sort" class="pm-select" aria-label="排序方式">
          <option value="updated">最近更新</option>
          <option value="name">名称</option>
          <option value="usage">使用次数</option>
        </select>
        <button
          type="button"
          class="pm-fav"
          :class="{ 'is-on': favoriteOnly }"
          :aria-pressed="favoriteOnly"
          @click="favoriteOnly = !favoriteOnly"
        >★ 只看收藏</button>
      </div>
      <div class="pm-toolbar-right">
        <el-button size="small" data-testid="smart-prompt-add" @click="openAdd">＋ 新增提示词</el-button>
        <el-button size="small" data-testid="smart-prompt-import" @click="handleImport">导入</el-button>
        <el-button size="small" data-testid="smart-prompt-export-all" @click="exportAll">导出全部</el-button>
      </div>
    </div>

    <div v-if="allTags.length" class="pm-tags">
      <button
        v-for="t in allTags"
        :key="t"
        type="button"
        class="pm-tag"
        :class="{ 'is-on': activeTags.includes(t) }"
        @click="toggleTag(t)"
      >{{ t }}</button>
      <button v-if="hasFilter" type="button" class="pm-tag-reset" @click="resetFilter">清空筛选</button>
    </div>

    <div v-if="visible.length" class="pm-list">
      <article v-for="p in visible" :key="p.id" class="pm-card" :data-testid="`smart-prompt-${p.id}`">
        <header class="pm-card-head">
          <button
            type="button"
            class="pm-star"
            :class="{ 'is-on': p.isFavorite }"
            :title="p.isFavorite ? '取消收藏' : '收藏'"
            :aria-label="p.isFavorite ? '取消收藏' : '收藏'"
            @click="toggleFav(p)"
          >{{ p.isFavorite ? '★' : '☆' }}</button>
          <div class="pm-card-title">
            <button type="button" class="pm-name" @click="openDetail(p)">{{ p.title }}</button>
            <span class="pm-meta">
              <span>{{ p.category }}</span>
              <span v-if="p.model" class="pm-dot">·</span>
              <span v-if="p.model">{{ p.model }}</span>
              <span class="pm-dot">·</span>
              <span>{{ relTime(p.updatedAt) }}</span>
              <span v-if="p.usageCount > 0" class="pm-dot">·</span>
              <span v-if="p.usageCount > 0">用过 {{ p.usageCount }} 次</span>
            </span>
          </div>
          <span v-if="p.isBuiltIn" class="pm-builtin" title="内置示例">内置</span>
        </header>

        <p class="pm-excerpt">{{ excerpt(p) }}</p>

        <div class="pm-card-foot">
          <span v-for="t in p.tags" :key="t" class="pm-chip">#{{ t }}</span>
          <span v-if="p.variables.length" class="pm-vars">{{ p.variables.length }} 个变量</span>
        </div>

        <footer class="pm-actions">
          <button type="button" class="pm-btn is-primary" :data-testid="`smart-prompt-use-${p.id}`" @click="openUse(p)">使用</button>
          <button type="button" class="pm-btn" @click="openDetail(p)">详情</button>
          <button type="button" class="pm-btn" @click="openEdit(p)">编辑</button>
          <button type="button" class="pm-btn" @click="handleClone(p)">副本</button>
          <span class="pm-spacer" />
          <button type="button" class="pm-btn" :data-testid="`smart-prompt-copy-${p.id}`" @click="handleCopy(p)">复制原文</button>
          <button type="button" class="pm-btn" @click="exportOne(p)" title="下载为 JSON">↓ json</button>
          <button type="button" class="pm-btn is-danger" :data-testid="`smart-prompt-del-${p.id}`" @click="handleDelete(p)">删除</button>
        </footer>
      </article>
    </div>

    <div v-else class="pm-empty">
      <p class="pm-empty-title">{{ hasFilter ? '没有匹配的提示词' : '还没有提示词' }}</p>
      <p class="pm-empty-hint">
        {{ hasFilter ? '换个关键字，或清空筛选条件试试。' : emptyHint }}
      </p>
      <div class="pm-empty-actions">
        <el-button v-if="hasFilter" size="small" @click="resetFilter">清空筛选</el-button>
        <el-button v-else size="small" type="primary" @click="openAdd">＋ 新增提示词</el-button>
        <el-button size="small" @click="handleImport">导入文件</el-button>
      </div>
    </div>

    <SmartEditorDialog
      v-if="editorOpen"
      :model="form"
      :editing-id="editingId"
      :categories="store.promptCategories"
      :name-max="SMART_NAME_MAX"
      :desc-max="SMART_DESC_MAX"
      :content-max="SMART_CONTENT_MAX"
      @close="editorOpen = false"
      @save="handleSave"
    />

    <PromptUseDialog
      v-if="useOpen && useItem"
      :prompt="useItem"
      @close="useOpen = false"
      @used="onUsed"
    />

    <SmartDetailDialog
      v-if="detailOpen && detailItem"
      :item="detailItem"
      @close="detailOpen = false"
    />

    <SmartImportDialog
      v-if="importOpen && pendingPlan"
      kind-label="提示词"
      :added="pendingPlan.added.map(p => p.title)"
      :updated="pendingPlan.updated.map(p => p.title)"
      :skipped="pendingPlan.skipped"
      @close="importOpen = false; pendingPlan = null"
      @confirm="confirmImport"
    />
  </div>
</template>

<style scoped>
.pm-wrap { display: flex; flex-direction: column; gap: 12px; }

.pm-toolbar { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center; }
.pm-toolbar-left, .pm-toolbar-right { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pm-search { width: 240px; }
.pm-select {
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  color: var(--color-text, #111827);
  font-size: 13px;
}
.pm-fav {
  padding: 4px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  cursor: pointer;
}
/* 收藏态用橙色：走 --color-warning 令牌（规范 §1.5：语义色不写死） */
.pm-fav.is-on { border-color: var(--color-warning, #f59e0b); color: var(--color-warning, #f59e0b); }

.pm-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.pm-tag, .pm-tag-reset {
  padding: 2px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  cursor: pointer;
}
.pm-tag.is-on { border-color: var(--color-primary, #3b82f6); background: var(--color-primary-soft, #eff6ff); color: var(--color-primary, #3b82f6); }
.pm-tag-reset { color: var(--color-text-muted, #9ca3af); }

.pm-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.pm-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 10px);
  background: var(--color-bg-card, #fff);
}
.pm-card-head { display: flex; gap: 8px; align-items: flex-start; }
.pm-star {
  flex: 0 0 auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-muted, #9ca3af);
  font-size: 16px;
  line-height: 1.2;
  cursor: pointer;
}
.pm-star.is-on { color: var(--color-warning, #f59e0b); }
.pm-card-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.pm-name {
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
.pm-name:hover { color: var(--color-primary, #3b82f6); }
.pm-meta { font-size: 12px; color: var(--color-text-muted, #9ca3af); display: flex; gap: 4px; flex-wrap: wrap; }
.pm-dot { opacity: .6; }
.pm-builtin {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--color-bg-hover, #f3f4f6);
  color: var(--color-text-muted, #9ca3af);
  font-size: 11px;
}
.pm-excerpt {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pm-card-foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12px; }
.pm-chip { color: var(--color-primary, #3b82f6); }
.pm-vars { color: var(--color-text-muted, #9ca3af); }

.pm-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: auto; }
.pm-spacer { flex: 1 1 auto; }
.pm-btn {
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  cursor: pointer;
}
.pm-btn:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.pm-btn.is-primary { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); font-weight: 600; }
.pm-btn.is-danger:hover { border-color: var(--color-error, #dc2626); color: var(--color-error, #dc2626); }

.pm-empty {
  padding: 40px 16px;
  text-align: center;
  border: 1px dashed var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 10px);
}
.pm-empty-title { margin: 0 0 4px; font-size: 14px; font-weight: 600; color: var(--color-text, #111827); }
.pm-empty-hint { margin: 0 0 12px; font-size: 13px; color: var(--color-text-secondary, #6b7280); }
.pm-empty-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }

@media (max-width: 768px) {
  .pm-list { grid-template-columns: 1fr; }
  .pm-search { width: 100%; }
  .pm-toolbar-left, .pm-toolbar-right { width: 100%; }
  .pm-btn { min-height: 44px; padding: 8px 12px; font-size: 13px; }
  .pm-select { height: 44px; font-size: 16px; }
}
</style>
