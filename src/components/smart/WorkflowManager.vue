<script setup lang="ts">
/**
 * 智能工作台 · 工作流管理
 * 列表（搜索 / 分类 / 标签 / 收藏筛选 / 排序）+ 多选（批量导出 / 批量删除）+ 增删改查 + 导入导出。
 * 复用 smartCore 的归一化 / 校验 / 信封解析 / 导入预览，本组件只负责交互与呈现。
 * 四个核心操作均带明确反馈：分类设置在设置弹框（见 SmartSettingsDialog），
 * 上传（导入本地文件并校验）、下载（导出所选 / 全部为文件）、删除（单条 + 批量带确认）。
 */
import { computed, ref } from 'vue'
import { useSmartStore } from '@/stores/smart'
import { showConfirm } from '@/utils/dialog'
import { useToast } from '@/composables/useToast'
import { copyText, dateStamp, downloadText, pickFileText } from '@/utils/download'
import {
  filterSmart,
  normalizeWorkflow,
  parseEnvelope,
  SMART_CONTENT_MAX,
  SMART_DESC_MAX,
  SMART_NAME_MAX,
  SMART_WORKFLOW_KIND,
  sortSmart,
  validateWorkflow,
  type SmartFilter,
  type SmartSort
} from '@/composables/smartCore'
import type { SmartImportPreview, SmartWorkflow } from '@/types'
import WorkflowEditorDialog from './WorkflowEditorDialog.vue'
import WorkflowDetailDialog from './WorkflowDetailDialog.vue'
import SmartImportDialog from './SmartImportDialog.vue'

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

const visible = computed(() => sortSmart(filterSmart(store.workflows, filter.value), sort.value))
const allTags = computed(() => {
  const out: string[] = []
  for (const w of store.workflows) for (const t of w.tags) if (!out.includes(t)) out.push(t)
  return out
})
const hasFilter = computed(
  () => !!keyword.value.trim() || !!category.value || activeTags.value.length > 0 || favoriteOnly.value
)

/**
 * 分类筛选药丸（工具箱同款）：全部 + 各分类，带工作流数量。
 * 保留数量为 0 的分类，便于看到已建但还没有工作流挂上去的分类。
 */
const categoryTabs = computed(() => {
  const counts = new Map<string, number>()
  for (const w of store.workflows) counts.set(w.category, (counts.get(w.category) ?? 0) + 1)
  return [
    { id: '', name: '全部', count: store.workflows.length },
    ...store.allWorkflowCategories.map(c => ({ id: c, name: c, count: counts.get(c) ?? 0 }))
  ]
})

function resetFilter(): void {
  keyword.value = ''
  category.value = ''
  activeTags.value = []
  favoriteOnly.value = false
}

function toggleTag(t: string): void {
  activeTags.value = activeTags.value.includes(t) ? activeTags.value.filter(x => x !== t) : [...activeTags.value, t]
}

// ===== 多选（批量导出 / 删除）=====
const selectedIds = ref<string[]>([])
const selectedCount = computed(() => selectedIds.value.length)
const selectedItems = computed(() => store.workflows.filter(w => selectedIds.value.includes(w.id)))

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id)
}
function toggleSelect(id: string): void {
  selectedIds.value = isSelected(id) ? selectedIds.value.filter(x => x !== id) : [...selectedIds.value, id]
}
function toggleSelectAll(): void {
  const visibleIds = visible.value.map(w => w.id)
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => isSelected(id))
  selectedIds.value = allSelected ? [] : [...visibleIds]
}
const allVisibleSelected = computed(() => visible.value.length > 0 && visible.value.every(w => isSelected(w.id)))
function clearSelection(): void {
  selectedIds.value = []
}

// ===== 编辑 =====
const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const form = ref<Partial<SmartWorkflow>>({})

function openEdit(w: SmartWorkflow): void {
  editingId.value = w.id
  form.value = { ...w, tags: [...w.tags] }
  editorOpen.value = true
}

function handleSave(next: Partial<SmartWorkflow>): void {
  const issues = validateWorkflow(next, store.workflows, editingId.value)
  if (issues.length) {
    toast.error(issues[0].message)
    return
  }
  if (editingId.value) {
    store.updateWorkflow(editingId.value, next)
    toast.success('工作流已保存')
  } else {
    store.addWorkflow(next)
    toast.success('工作流已添加')
  }
  editorOpen.value = false
}

// ===== 其它操作 =====
async function handleDelete(w: SmartWorkflow): Promise<void> {
  if (!await showConfirm(`确定删除工作流「${w.name}」吗？删除后不可恢复。`)) return
  if (store.deleteWorkflow(w.id)) {
    selectedIds.value = selectedIds.value.filter(x => x !== w.id)
    toast.success('已删除')
  }
}

function handleClone(w: SmartWorkflow): void {
  const id = store.cloneWorkflow(w.id)
  if (id) toast.success(`已复制为「${store.workflows.find(x => x.id === id)?.name}」`)
}

async function handleCopy(w: SmartWorkflow): Promise<void> {
  const ok = await copyText(w.definition, `已复制「${w.name}」定义`)
  if (ok) store.touchWorkflow(w.id)
}

function toggleFav(w: SmartWorkflow): void {
  store.toggleWorkflowFavorite(w.id)
}

// ===== 详情 =====
const detailOpen = ref(false)
const detailItem = ref<SmartWorkflow | null>(null)
function openDetail(w: SmartWorkflow): void {
  detailItem.value = w
  detailOpen.value = true
}

// ===== 导出 =====
function safeName(name: string): string {
  return (name || 'workflow').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
}

function exportOne(w: SmartWorkflow): void {
  const env = { kind: SMART_WORKFLOW_KIND, version: 1, exportedAt: Date.now(), items: [w] }
  downloadText(`${safeName(w.name)}.json`, JSON.stringify(env, null, 2))
}

function exportSelected(): void {
  if (selectedCount.value === 0) {
    toast.warning('请先勾选要导出的工作流')
    return
  }
  if (selectedCount.value === 1) {
    exportOne(selectedItems.value[0])
    return
  }
  const env = { kind: SMART_WORKFLOW_KIND, version: 1, exportedAt: Date.now(), items: selectedItems.value }
  downloadText(`smart-workflows-${dateStamp()}.json`, JSON.stringify(env, null, 2))
  toast.success(`已导出 ${selectedCount.value} 个工作流`)
}

function exportAll(): void {
  if (store.workflows.length === 0) {
    toast.warning('还没有工作流可导出')
    return
  }
  const env = store.exportWorkflows()
  downloadText(`smart-workflows-${dateStamp()}.json`, JSON.stringify(env, null, 2))
  toast.success(`已导出全部 ${store.workflows.length} 个工作流`)
}

// ===== 批量删除 =====
async function handleBatchDelete(): Promise<void> {
  if (selectedCount.value === 0) {
    toast.warning('请先勾选要删除的工作流')
    return
  }
  if (!await showConfirm(`确定删除选中的 ${selectedCount.value} 个工作流吗？删除后不可恢复。`)) return
  let n = 0
  for (const id of selectedIds.value) {
    if (store.deleteWorkflow(id)) n++
  }
  selectedIds.value = []
  toast.success(`已删除 ${n} 个工作流`)
}

// ===== 导入 =====
const importOpen = ref(false)
const pendingPlan = ref<SmartImportPreview<SmartWorkflow> | null>(null)

async function handleImport(): Promise<void> {
  const picked = await pickFileText('.json,application/json')
  if (!picked) return
  const res = parseEnvelope(picked.text, SMART_WORKFLOW_KIND, normalizeWorkflow)
  if (!res.ok) {
    toast.error(res.message)
    return
  }
  const plan = store.previewWorkflowImport(res.items)
  if (plan.added.length === 0 && plan.updated.length === 0) {
    toast.info(plan.skipped > 0 ? '文件内容与现有工作流相同，无需导入' : '没有可导入的条目')
    return
  }
  pendingPlan.value = plan
  importOpen.value = true
}

function confirmImport(): void {
  const plan = pendingPlan.value
  if (!plan) return
  const r = store.commitWorkflowImport(plan)
  toast.success(`导入完成：新增 ${r.added} 条，更新 ${r.updated} 条`)
  importOpen.value = false
  pendingPlan.value = null
}

/**
 * 空态说明文案（常量承载，避免模板里直接写会破坏编译的示例文本）。
 */
const emptyHint = '把重复执行的一套流程存下来，按步骤写下定义，下次照着跑即可。'

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

/** 预览定义片段，便于快速辨认内容 */
function excerpt(w: SmartWorkflow): string {
  return w.definition.replace(/\s+/g, ' ').slice(0, 80)
}
</script>

<template>
  <div class="wm-wrap">
    <!-- 搜索区（工具箱同款：父容器内居中，聚焦高亮） -->
    <div class="wm-search-wrap">
      <div class="wm-search" role="search">
        <svg class="wm-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          v-model="keyword"
          class="wm-search-input"
          data-testid="smart-workflow-search"
          type="text"
          placeholder="搜索工作流名称、分类、标签或定义…"
          aria-label="搜索工作流"
          autocomplete="off"
        />
        <button v-if="keyword" type="button" class="wm-search-clear" title="清空搜索" aria-label="清空搜索" @click="keyword = ''">✕</button>
      </div>
    </div>

    <!-- 分类筛选（工具箱同款药丸；保留 0 计数的分类） -->
    <div class="wm-cats" role="group" aria-label="工作流分类筛选">
      <button
        v-for="t in categoryTabs"
        :key="t.id || '__all__'"
        type="button"
        class="wm-cat-pill"
        :class="{ 'is-on': category === t.id }"
        :aria-pressed="category === t.id"
        :data-testid="`smart-workflow-cat-${t.id || 'all'}`"
        @click="category = t.id"
      >
        <span>{{ t.name }}</span>
        <span class="wm-cat-pill-cnt">{{ t.count }}</span>
      </button>
    </div>

    <!-- 排序 + 收藏筛选 + 操作 -->
    <div class="wm-toolbar">
      <div class="wm-toolbar-left">
        <select v-model="sort" class="wm-select" aria-label="排序方式">
          <option value="updated">最近更新</option>
          <option value="name">名称</option>
          <option value="usage">使用次数</option>
        </select>
        <button
          type="button"
          class="wm-fav"
          :class="{ 'is-on': favoriteOnly }"
          :aria-pressed="favoriteOnly"
          @click="favoriteOnly = !favoriteOnly"
        >★ 只看收藏</button>
        <span v-if="hasFilter" class="wm-result">筛选出 {{ visible.length }} 个</span>
      </div>
      <div class="wm-toolbar-right">
        <el-button size="small" data-testid="smart-workflow-import" @click="handleImport">导入</el-button>
        <el-button size="small" data-testid="smart-workflow-export-selected" :disabled="selectedCount === 0" @click="exportSelected">导出所选</el-button>
        <el-button size="small" data-testid="smart-workflow-export-all" @click="exportAll">导出全部</el-button>
        <el-button size="small" type="danger" data-testid="smart-workflow-delete-selected" :disabled="selectedCount === 0" @click="handleBatchDelete">删除所选</el-button>
      </div>
    </div>

    <div v-if="allTags.length" class="wm-tags">
      <button
        v-for="t in allTags"
        :key="t"
        type="button"
        class="wm-tag"
        :class="{ 'is-on': activeTags.includes(t) }"
        @click="toggleTag(t)"
      >{{ t }}</button>
      <button v-if="hasFilter" type="button" class="wm-tag-reset" @click="resetFilter">清空筛选</button>
    </div>

    <!-- 批量条：有勾选时浮现，显示数量与快捷操作 -->
    <div v-if="selectedCount > 0" class="wm-batchbar">
      <label class="wm-selall">
        <input type="checkbox" :checked="allVisibleSelected" @change="toggleSelectAll" />
        全选当前
      </label>
      <span class="wm-batch-count">已选 {{ selectedCount }} 个</span>
      <span class="wm-spacer" />
      <button type="button" class="wm-batch-btn" data-testid="smart-workflow-batch-export" @click="exportSelected">导出所选</button>
      <button type="button" class="wm-batch-btn is-danger" data-testid="smart-workflow-batch-delete" @click="handleBatchDelete">删除所选</button>
      <button type="button" class="wm-batch-btn" @click="clearSelection">取消选择</button>
    </div>

    <div v-if="visible.length" class="wm-list">
      <article v-for="w in visible" :key="w.id" class="wm-card" :class="{ 'is-selected': isSelected(w.id) }" :data-testid="`smart-workflow-${w.id}`">
        <label class="wm-check">
          <input
            type="checkbox"
            :checked="isSelected(w.id)"
            :data-testid="`smart-workflow-check-${w.id}`"
            @change="toggleSelect(w.id)"
          />
        </label>
        <header class="wm-card-head">
          <button
            type="button"
            class="wm-star"
            :class="{ 'is-on': w.isFavorite }"
            :title="w.isFavorite ? '取消收藏' : '收藏'"
            :aria-label="w.isFavorite ? '取消收藏' : '收藏'"
            @click="toggleFav(w)"
          >{{ w.isFavorite ? '★' : '☆' }}</button>
          <div class="wm-card-title">
            <button type="button" class="wm-name" @click="openDetail(w)">{{ w.name }}</button>
            <span class="wm-meta">
              <span>{{ w.category }}</span>
              <span v-if="w.author" class="wm-dot">·</span>
              <span v-if="w.author">{{ w.author }}</span>
              <span class="wm-dot">·</span>
              <span>{{ relTime(w.updatedAt) }}</span>
              <span v-if="w.usageCount > 0" class="wm-dot">·</span>
              <span v-if="w.usageCount > 0">用过 {{ w.usageCount }} 次</span>
            </span>
          </div>
          <span v-if="w.isBuiltIn" class="wm-builtin" title="内置示例">内置</span>
        </header>

        <p v-if="w.description" class="wm-desc">{{ w.description }}</p>
        <p class="wm-excerpt">{{ excerpt(w) }}</p>

        <div class="wm-card-foot">
          <span v-for="t in w.tags" :key="t" class="wm-chip">#{{ t }}</span>
        </div>

        <footer class="wm-actions">
          <button type="button" class="wm-btn is-primary" :data-testid="`smart-workflow-detail-${w.id}`" @click="openDetail(w)">详情</button>
          <button type="button" class="wm-btn" @click="openEdit(w)">编辑</button>
          <button type="button" class="wm-btn" @click="handleClone(w)">副本</button>
          <span class="wm-spacer" />
          <button type="button" class="wm-btn" :data-testid="`smart-workflow-copy-${w.id}`" @click="handleCopy(w)">复制定义</button>
          <button type="button" class="wm-btn" @click="exportOne(w)" title="下载为 JSON">↓ json</button>
          <button type="button" class="wm-btn is-danger" :data-testid="`smart-workflow-del-${w.id}`" @click="handleDelete(w)">删除</button>
        </footer>
      </article>
    </div>

    <div v-else class="wm-empty">
      <p class="wm-empty-title">{{ hasFilter ? '没有匹配的工作流' : '还没有工作流' }}</p>
      <p class="wm-empty-hint">
        {{ hasFilter ? '换个关键字，或清空筛选条件试试。' : emptyHint }}
      </p>
      <div class="wm-empty-actions">
        <el-button v-if="hasFilter" size="small" @click="resetFilter">清空筛选</el-button>
        <el-button v-else size="small" type="primary" @click="handleImport">导入文件</el-button>
      </div>
    </div>

    <WorkflowEditorDialog
      v-if="editorOpen"
      :model="form"
      :editing-id="editingId"
      :categories="store.allWorkflowCategories"
      :name-max="SMART_NAME_MAX"
      :desc-max="SMART_DESC_MAX"
      :content-max="SMART_CONTENT_MAX"
      @close="editorOpen = false"
      @save="handleSave"
    />

    <WorkflowDetailDialog
      v-if="detailOpen && detailItem"
      :item="detailItem"
      @close="detailOpen = false"
    />

    <SmartImportDialog
      v-if="importOpen && pendingPlan"
      kind-label="工作流"
      :added="pendingPlan.added.map(w => w.name)"
      :updated="pendingPlan.updated.map(w => w.name)"
      :skipped="pendingPlan.skipped"
      @close="importOpen = false; pendingPlan = null"
      @confirm="confirmImport"
    />
  </div>
</template>

<style scoped>
.wm-wrap { display: flex; flex-direction: column; gap: 12px; }

/* 搜索框：工具箱同款（父容器内居中、卡片式、聚焦高亮） */
.wm-search-wrap { display: flex; justify-content: center; }
.wm-search {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 720px;
  padding: 10px 14px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
  transition: border-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    box-shadow var(--motion-duration, 0.2s) var(--motion-ease, ease);
}
.wm-search:focus-within {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px var(--color-primary-soft, #eff6ff);
}
.wm-search-icon { color: var(--color-text-muted, #9ca3af); flex: none; }
.wm-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text, #111827);
  font-size: 14px;
  font-family: inherit;
}
.wm-search-input::placeholder { color: var(--color-text-muted, #9ca3af); }
.wm-search-clear {
  flex: none;
  min-height: 24px;
  padding: 2px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted, #9ca3af);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}
.wm-search-clear:hover { color: var(--color-primary, #3b82f6); background: var(--color-bg-hover, #f1f5f9); }

/* 分类药丸：工具箱同款 */
.wm-cats { display: flex; flex-wrap: wrap; gap: 8px; }
.wm-cat-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-card, #fff);
  color: var(--color-text-secondary, #6b7280);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    border-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    background-color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}
.wm-cat-pill:hover { color: var(--color-primary, #3b82f6); border-color: var(--color-primary, #3b82f6); }
.wm-cat-pill.is-on { background: var(--color-primary, #3b82f6); color: #fff; border-color: var(--color-primary, #3b82f6); }
.wm-cat-pill-cnt { font-size: 12px; opacity: 0.78; }

/* 排序 + 收藏 + 操作行 */
.wm-toolbar { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center; }
.wm-toolbar-left, .wm-toolbar-right { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.wm-result { font-size: 12px; color: var(--color-text-muted, #9ca3af); }
.wm-select {
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  color: var(--color-text, #111827);
  font-size: 13px;
}
.wm-fav {
  padding: 4px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  cursor: pointer;
}
.wm-fav.is-on { border-color: var(--color-warning, #f59e0b); color: var(--color-warning, #f59e0b); }

.wm-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.wm-tag, .wm-tag-reset {
  padding: 2px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  cursor: pointer;
}
.wm-tag.is-on { border-color: var(--color-primary, #3b82f6); background: var(--color-primary-soft, #eff6ff); color: var(--color-primary, #3b82f6); }
.wm-tag-reset { color: var(--color-text-muted, #9ca3af); }

/* 批量条：与工具栏同款胶囊按钮，浮现于列表上方 */
.wm-batchbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border: 1px solid var(--color-primary-soft, #bfdbfe);
  border-radius: var(--radius-md, 10px);
  background: var(--color-primary-soft, #eff6ff);
}
.wm-selall { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-text-secondary, #6b7280); cursor: pointer; }
.wm-batch-count { font-size: 13px; color: var(--color-text, #111827); font-weight: 600; }
.wm-spacer { flex: 1 1 auto; }
.wm-batch-btn {
  min-height: 28px;
  padding: 4px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: var(--color-bg-card, #fff);
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  cursor: pointer;
}
.wm-batch-btn:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.wm-batch-btn.is-danger:hover { border-color: var(--color-error, #dc2626); color: var(--color-error, #dc2626); }

.wm-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.wm-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 14px 14px 38px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 10px);
  background: var(--color-bg-card, #fff);
}
.wm-card.is-selected { border-color: var(--color-primary, #3b82f6); box-shadow: 0 0 0 1px var(--color-primary, #3b82f6); }
.wm-check { position: absolute; top: 14px; left: 12px; display: inline-flex; align-items: center; }
.wm-check input { width: 16px; height: 16px; cursor: pointer; }

.wm-card-head { display: flex; gap: 8px; align-items: flex-start; }
.wm-star {
  flex: 0 0 auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-muted, #9ca3af);
  font-size: 16px;
  line-height: 1.2;
  cursor: pointer;
}
.wm-star.is-on { color: var(--color-warning, #f59e0b); }
.wm-card-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.wm-name {
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
.wm-name:hover { color: var(--color-primary, #3b82f6); }
.wm-meta { font-size: 12px; color: var(--color-text-muted, #9ca3af); display: flex; gap: 4px; flex-wrap: wrap; }
.wm-dot { opacity: .6; }
.wm-builtin {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--color-bg-hover, #f3f4f6);
  color: var(--color-text-muted, #9ca3af);
  font-size: 11px;
}
.wm-desc { margin: 0; font-size: 13px; color: var(--color-text-secondary, #6b7280); }
.wm-excerpt {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.wm-card-foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12px; }
.wm-chip { color: var(--color-primary, #3b82f6); }

.wm-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: auto; }
.wm-spacer { flex: 1 1 auto; }
.wm-btn {
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  cursor: pointer;
}
.wm-btn:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.wm-btn.is-primary { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); font-weight: 600; }
.wm-btn.is-danger:hover { border-color: var(--color-error, #dc2626); color: var(--color-error, #dc2626); }

.wm-empty {
  padding: 40px 16px;
  text-align: center;
  border: 1px dashed var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 10px);
}
.wm-empty-title { margin: 0 0 4px; font-size: 14px; font-weight: 600; color: var(--color-text, #111827); }
.wm-empty-hint { margin: 0 0 12px; font-size: 13px; color: var(--color-text-secondary, #6b7280); }
.wm-empty-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }

@media (max-width: 768px) {
  .wm-list { grid-template-columns: 1fr; }
  .wm-cat-pill, .wm-fav { min-height: 40px; }
  .wm-toolbar-left, .wm-toolbar-right { width: 100%; }
  .wm-btn { min-height: 44px; padding: 8px 12px; font-size: 13px; }
  .wm-select { height: 44px; font-size: 16px; }
}
</style>
