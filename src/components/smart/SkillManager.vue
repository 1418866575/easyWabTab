<script setup lang="ts">
/**
 * 智能工作台 · 技能管理（v2：一个技能 = 一个目录）
 * ------------------------------------------------------------------
 * 列表（搜索 / 分类 / 标签筛选 / 排序）+ 增删改查 + 导入导出。
 * - 导入：选择技能文件夹（或 zip），自动扫描 skill.md 与附属资源
 * - 导出：单个技能打包 zip（含目录层级），可原样再次导入
 * 校验、归一化、解析全部委托纯函数（smartCore / skillPackageCore），本组件只负责交互与呈现。
 */
import { computed, ref } from 'vue'
import { useSmartStore } from '@/stores/smart'
import { showConfirm } from '@/utils/dialog'
import { useToast } from '@/composables/useToast'
import { dateStamp } from '@/utils/download'
import {
  downloadSkillZip,
  downloadSkillsZip,
  pickSkillFolder,
  pickSkillZip,
  readSkillFiles,
  type SkillSource
} from '@/utils/skillPackage'
import {
  classifySkillIcon,
  normalizeSkill,
  SMART_CONTENT_MAX,
  UNCATEGORIZED,
  validateSkill,
  type SkillIconInfo
} from '@/composables/smartCore'
import { useSmartList } from '@/composables/useSmartList'
import { SKILL_FILE, planSkillImports } from '@/composables/skillPackageCore'
import type { SmartImportPreview, SmartSkill } from '@/types'
import Icon from '@/components/Icon.vue'
import IconPickerDialog from '@/components/IconPickerDialog.vue'
import SkillEditorDialog from './SkillEditorDialog.vue'
import SkillDetailDialog from './SkillDetailDialog.vue'
import SmartImportDialog from './SmartImportDialog.vue'

const store = useSmartStore()
const toast = useToast()

// ===== 筛选 / 排序 / 分页（与提示词、工作流共用 useSmartList） =====
const {
  keyword,
  category,
  activeTags,
  sort,
  favoriteOnly,
  filtered,
  visible,
  allTags,
  hasFilter,
  categoryTabs,
  page,
  pageSize,
  PAGE_SIZES,
  resetFilter,
  toggleTag
} = useSmartList({
  items: computed(() => store.skills),
  categories: computed(() => store.skillCategories),
  pagerKey: 'smart-skills-pager',
  favoriteFilter: true
})

// ===== 编辑弹框 =====
const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const form = ref<Partial<SmartSkill>>({})

function openAdd(): void {
  editingId.value = null
  form.value = {
    name: '',
    description: '',
    category: UNCATEGORIZED,
    tags: [],
    version: '1.0.0',
    author: '',
    whenToUse: '',
    tools: [],
    license: '',
    extra: {},
    body: '',
    resources: []
  }
  editorOpen.value = true
}

function openEdit(s: SmartSkill): void {
  editingId.value = s.id
  form.value = { ...s, tags: [...s.tags], tools: [...s.tools], resources: s.resources.map(r => ({ ...r })) }
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

// ===== 删除 =====
async function handleDelete(s: SmartSkill): Promise<void> {
  if (!(await showConfirm(`确定删除技能「${s.name}」吗？删除后不可恢复。`))) return
  if (store.deleteSkill(s.id)) toast.success('已删除')
}

// ===== 详情 =====
const detailOpen = ref(false)
const detailItem = ref<SmartSkill | null>(null)
function openDetail(s: SmartSkill): void {
  detailItem.value = s
  detailOpen.value = true
}

// ===== 导出 =====
/** 单个技能 → zip（skill.md + 附属资源，保持目录层级，可再次导入） */
function exportOneZip(s: SmartSkill): void {
  downloadSkillZip(s)
}

/** 全部技能打包成一个 zip，每个技能一个顶层目录 */
function exportAllZip(): void {
  if (!store.skills.length) {
    toast.warning('还没有技能可打包')
    return
  }
  downloadSkillsZip(store.skills, `smart-skills-${dateStamp()}`)
}

// ===== 导入 =====
const importOpen = ref(false)
const pendingPlan = ref<SmartImportPreview<SmartSkill> | null>(null)
const importNotes = ref<string[]>([])

/** 选择文件夹 → 自动扫描 skill.md 与附属资源（可一次导入多个技能） */
async function importFromFolder(): Promise<void> {
  const source = await pickSkillFolder()
  if (!source) return
  await runPackageImport(source)
}

/** 选择 zip → 解压后同上 */
async function importFromZip(): Promise<void> {
  const source = await pickSkillZip()
  if (!source) return
  await runPackageImport(source)
}

/**
 * 扫描技能包并生成导入预览。
 * 失败项（缺少必填字段等）直接列出具体原因，不静默丢弃。
 */
async function runPackageImport(source: SkillSource): Promise<void> {
  const files = await readSkillFiles(source)
  const plan = planSkillImports(files)
  if (plan.error) {
    toast.error(plan.error)
    return
  }

  const notes: string[] = []
  for (const f of plan.failed) notes.push(`${f.skillFile}：${f.error}`)
  for (const p of plan.packages) for (const w of p.warnings) notes.push(`${p.skillFile} 的 ${w}`)
  if (plan.orphans.length) notes.push(`${plan.orphans.length} 个文件不属于任何技能目录，已忽略`)

  const items: SmartSkill[] = []
  for (const p of plan.packages) {
    const one = normalizeSkill({ ...p.draft, body: p.body, resources: p.resources })
    if (one) items.push(one)
  }
  if (!items.length) {
    toast.error(notes[0] ?? '没有解析出可导入的技能')
    return
  }

  const preview = store.previewSkillImport(items)
  if (preview.added.length === 0 && preview.updated.length === 0) {
    toast.info(preview.skipped > 0 ? '所选内容与现有技能相同，无需导入' : '没有可导入的条目')
    return
  }
  pendingPlan.value = preview
  importNotes.value = notes
  importOpen.value = true
}

function confirmImport(): void {
  const plan = pendingPlan.value
  if (!plan) return
  const r = store.commitSkillImport(plan)
  toast.success(`导入完成：新增 ${r.added} 条，更新 ${r.updated} 条`)
  importOpen.value = false
  pendingPlan.value = null
  importNotes.value = []
}

/**
 * 卡片图标：extra.icon 存「图标库图片地址」或 v1 迁过来的 emoji；
 * 未设置时由 classifySkillIcon 回落为内置矢量图标（不再是 🧩）。
 */
function iconOf(s: SmartSkill): SkillIconInfo {
  return classifySkillIcon(s.extra?.icon)
}

// ===== 卡片图标：点击弹框从「图标管理」选择 =====
// 复用 IconPickerDialog（与添加网站、分类管理同源）：图标库（预置 + 自定义）的搜索、
// 分类筛选、导入/上传都在弹框内完成；这里只负责记录「正在给哪个技能挑图标」与回写。
// 选中即写回技能并持久化（store.updateSkill → prefs → smart.json），取消/关闭不修改原值。
const iconPickerId = ref<string | null>(null)

const iconPickerCurrent = computed(() => {
  const s = store.skills.find(x => x.id === iconPickerId.value)
  // extra 是 Record<string, unknown>，取 icon 需收窄为 string 才能传给弹框
  const v = s?.extra?.icon
  return typeof v === 'string' ? v : ''
})

function openIconPicker(s: SmartSkill): void {
  iconPickerId.value = s.id
}

function closeIconPicker(): void {
  iconPickerId.value = null
}

function onPickIcon(src: string): void {
  const id = iconPickerId.value
  closeIconPicker()
  if (!id) return
  const target = store.skills.find(x => x.id === id)
  if (!target) return
  // 「恢复默认」回传空串：清掉 extra.icon，渲染层自动回落到默认内置图标
  store.updateSkill(id, { ...target, extra: { ...target.extra, icon: src } })
  toast.success(src ? '技能图标已更新' : '已恢复默认图标')
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
    <!-- 搜索区（工具箱同款：父容器内居中，聚焦高亮） -->
    <div class="sm-search-wrap">
      <div class="sm-search" role="search">
        <svg class="sm-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          v-model="keyword"
          class="sm-search-input"
          data-testid="smart-skill-search"
          type="text"
          placeholder="搜索技能名称、分类、标签或正文…"
          aria-label="搜索技能"
          autocomplete="off"
        />
        <button v-if="keyword" type="button" class="sm-search-clear" title="清空搜索" aria-label="清空搜索" @click="keyword = ''">✕</button>
      </div>
    </div>

    <!-- 分类筛选（工具箱同款药丸；保留 0 个技能的分类，便于看到默认分类及其数量） -->
    <div class="sm-cats" role="group" aria-label="技能分类筛选">
      <button
        v-for="t in categoryTabs"
        :key="t.id || '__all__'"
        type="button"
        class="sm-cat-pill"
        :class="{ 'is-on': category === t.id }"
        :aria-pressed="category === t.id"
        :data-testid="`smart-skill-cat-${t.id || 'all'}`"
        @click="category = t.id"
      >
        <span>{{ t.name }}</span>
        <span class="sm-cat-pill-cnt">{{ t.count }}</span>
      </button>
    </div>

    <!-- 排序 + 收藏筛选 + 操作 -->
    <div class="sm-toolbar">
      <div class="sm-toolbar-left">
        <select v-model="sort" class="sm-select" aria-label="排序方式">
          <option value="updated">最近更新</option>
          <option value="name">名称</option>
          <option value="usage">使用次数</option>
        </select>
        <button
          type="button"
          class="sm-fav"
          :class="{ 'is-on': favoriteOnly }"
          :aria-pressed="favoriteOnly"
          data-testid="smart-skill-fav-only"
          @click="favoriteOnly = !favoriteOnly"
        >★ 只看收藏</button>
        <span v-if="hasFilter" class="sm-result">筛选出 {{ filtered.length }} 个</span>
      </div>
      <div class="sm-toolbar-right">
        <el-button size="small" data-testid="smart-skill-add" @click="openAdd">＋ 新增技能</el-button>
        <el-button size="small" data-testid="smart-skill-import-folder" @click="importFromFolder">导入技能（目录）</el-button>
        <el-button size="small" data-testid="smart-skill-import-zip" @click="importFromZip">导入技能（zip）</el-button>
        <el-button size="small" data-testid="smart-skill-export-all" @click="exportAllZip">导出技能</el-button>
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
    <div v-if="filtered.length" class="sm-list">
      <article v-for="s in visible" :key="s.id" class="sm-card" :data-testid="`smart-skill-${s.id}`">
        <header class="sm-card-head">
          <button
            type="button"
            class="sm-icon-btn"
            :title="`更换「${s.name}」的图标（从图标管理中选择）`"
            :data-testid="`smart-skill-icon-${s.id}`"
            @click="openIconPicker(s)"
          >
            <img
              v-if="iconOf(s).kind === 'image'"
              :src="iconOf(s).value"
              :alt="`${s.name} 图标`"
              class="sm-icon-img"
            />
            <Icon v-else-if="iconOf(s).kind === 'builtin'" :name="iconOf(s).value" :size="18" />
            <span v-else class="sm-icon-text">{{ iconOf(s).value }}</span>
            <span class="sm-icon-edit" aria-hidden="true"><Icon name="pencil" :size="11" /></span>
          </button>
          <div class="sm-card-title">
            <button type="button" class="sm-name" @click="openDetail(s)">{{ s.name }}</button>
            <span class="sm-meta">
              <span class="sm-cat">{{ s.category }}</span>
              <span v-if="s.version" class="sm-dot">·</span>
              <span v-if="s.version" class="sm-version">v{{ s.version }}</span>
              <span v-if="s.resources.length" class="sm-dot">·</span>
              <span v-if="s.resources.length">{{ s.resources.length }} 个资源</span>
              <span class="sm-dot">·</span>
              <span>{{ relTime(s.updatedAt) }}</span>
              <span v-if="s.usageCount > 0" class="sm-dot">·</span>
              <span v-if="s.usageCount > 0">用过 {{ s.usageCount }} 次</span>
            </span>
          </div>
          <button
            type="button"
            class="sm-star"
            :class="{ 'is-on': s.isFavorite }"
            :title="s.isFavorite ? '取消收藏' : '收藏'"
            :aria-label="s.isFavorite ? '取消收藏' : '收藏'"
            :aria-pressed="!!s.isFavorite"
            :data-testid="`smart-skill-star-${s.id}`"
            @click="store.toggleSkillFavorite(s.id)"
          >{{ s.isFavorite ? '★' : '☆' }}</button>
          <span v-if="s.isBuiltIn" class="sm-builtin" title="内置示例">内置</span>
        </header>
        <p v-if="s.description" class="sm-desc">{{ s.description }}</p>
        <div v-if="s.tags.length" class="sm-card-tags">
          <span v-for="t in s.tags" :key="t" class="sm-chip">#{{ t }}</span>
        </div>
        <footer class="sm-actions">
          <button type="button" class="sm-btn is-primary" @click="openDetail(s)">详情</button>
          <button type="button" class="sm-btn" @click="openEdit(s)">编辑</button>
          <span class="sm-spacer" />
          <button type="button" class="sm-btn" :data-testid="`smart-skill-zip-${s.id}`" @click="exportOneZip(s)" :title="`下载为 zip（${SKILL_FILE} + 资源，保持目录层级）`">下载</button>
          <button type="button" class="sm-btn is-danger" :data-testid="`smart-skill-del-${s.id}`" @click="handleDelete(s)">删除</button>
        </footer>
      </article>
    </div>

    <!-- 空态 -->
    <div v-else class="sm-empty">
      <p class="sm-empty-title">{{ hasFilter ? '没有匹配的技能' : '还没有技能' }}</p>
      <p class="sm-empty-hint">
        {{ hasFilter ? '换个关键字，或清空筛选条件试试。' : '一个技能就是一个目录：核心是 ' + SKILL_FILE + '，再配上脚本、模板等附属资源。' }}
      </p>
      <div class="sm-empty-actions">
        <el-button v-if="hasFilter" size="small" @click="resetFilter">清空筛选</el-button>
        <el-button v-else size="small" type="primary" @click="openAdd">＋ 新增技能</el-button>
        <el-button size="small" @click="importFromFolder">导入技能（目录）</el-button>
        <el-button size="small" @click="importFromZip">导入技能（zip）</el-button>
      </div>
    </div>

    <!-- 分页（与项目其它列表同款：.ewt-pager + el-pagination，移动端自动精简） -->
    <div v-if="filtered.length" class="sm-pager ewt-pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="PAGE_SIZES"
        layout="total, sizes, prev, pager, next, jumper"
        :total="filtered.length"
        background
        small
        prev-text="上一页"
        next-text="下一页"
        data-testid="smart-skill-pagination"
      />
    </div>

    <!-- 编辑弹框 -->
    <SkillEditorDialog
      v-if="editorOpen"
      :model="form"
      :editing-id="editingId"
      :categories="store.skillCategories"
      :content-max="SMART_CONTENT_MAX"
      @close="editorOpen = false"
      @save="handleSave"
    />

    <!-- 详情弹框 -->
    <SkillDetailDialog
      v-if="detailOpen && detailItem"
      :item="detailItem"
      @close="detailOpen = false"
      @download="exportOneZip(detailItem)"
    />

    <!-- 导入预览 -->
    <SmartImportDialog
      v-if="importOpen && pendingPlan"
      kind-label="技能"
      :added="pendingPlan.added.map(s => s.name)"
      :updated="pendingPlan.updated.map(s => s.name)"
      :skipped="pendingPlan.skipped"
      :notes="importNotes"
      @close="importOpen = false; pendingPlan = null; importNotes = []"
      @confirm="confirmImport"
    />

    <!-- 技能图标选择弹框：从「图标管理」的图标库（预置 + 自定义）挑选，选中即写回该技能并持久化；
         取消 / 点遮罩 / ESC 关闭均不修改原值。放在编辑弹框之外，避免搜索框回车误触表单提交 -->
    <IconPickerDialog
      v-if="iconPickerId"
      title="选择技能图标"
      :current="iconPickerCurrent"
      @select="onPickIcon"
      @close="closeIconPicker"
    />
  </div>
</template>

<style scoped>
.sm-wrap { display: flex; flex-direction: column; gap: 12px; }

/* 搜索框：工具箱同款（父容器内居中、卡片式、聚焦高亮） */
.sm-search-wrap { display: flex; justify-content: center; }
.sm-search {
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
.sm-search:focus-within {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px var(--color-primary-soft, #eff6ff);
}
.sm-search-icon { color: var(--color-text-muted, #9ca3af); flex: none; }
.sm-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text, #111827);
  font-size: 14px;
  font-family: inherit;
}
.sm-search-input::placeholder { color: var(--color-text-muted, #9ca3af); }
.sm-search-clear {
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
.sm-search-clear:hover { color: var(--color-primary, #3b82f6); background: var(--color-bg-hover, #f1f5f9); }

/* 分类药丸：工具箱同款 */
.sm-cats { display: flex; flex-wrap: wrap; gap: 8px; }
.sm-cat-pill {
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
.sm-cat-pill:hover { color: var(--color-primary, #3b82f6); border-color: var(--color-primary, #3b82f6); }
.sm-cat-pill.is-on { background: var(--color-primary, #3b82f6); color: #fff; border-color: var(--color-primary, #3b82f6); }
.sm-cat-pill-cnt { font-size: 12px; opacity: 0.78; }

/* 排序 + 操作行 */
.sm-toolbar { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center; }
.sm-toolbar-left, .sm-toolbar-right { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.sm-result { font-size: 12px; color: var(--color-text-muted, #9ca3af); }
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
/* 卡片图标：可点击换图标（hover 浮出小铅笔），尺寸与原 emoji 图标一致不撑高卡片 */
.sm-icon-btn {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 8px);
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
  font-family: inherit;
  cursor: pointer;
  overflow: hidden;
  transition: border-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    background-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}

.sm-icon-btn:hover {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
}

.sm-icon-btn:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 2px;
}

.sm-icon-img { width: 100%; height: 100%; object-fit: contain; }

.sm-icon-text { font-size: 16px; line-height: 1; }

/* hover 时右下角浮出小铅笔，提示「可点击更换」 */
.sm-icon-edit {
  position: absolute;
  right: -1px;
  bottom: -1px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
  opacity: 0;
  transition: opacity var(--motion-duration, 0.2s) var(--motion-ease, ease);
}

.sm-icon-btn:hover .sm-icon-edit { opacity: 1; }

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
/* 主 CTA：与提示词 / 工作流卡片一致——第一颗按钮是该资产的主动作（技能 = 详情） */
.sm-btn.is-primary {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary-soft, rgba(59, 130, 246, 0.08));
  color: var(--color-primary, #3b82f6);
}
.sm-btn.is-primary:hover {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
}

/* 收藏筛选 + 卡片星标：与提示词 / 工作流同款 */
.sm-fav {
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  cursor: pointer;
}
.sm-fav.is-on {
  border-color: var(--color-warning, #f59e0b);
  color: var(--color-warning, #f59e0b);
}
.sm-star {
  flex: 0 0 auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-muted, #9ca3af);
  font-size: 16px;
  line-height: 1.2;
  cursor: pointer;
}
.sm-star.is-on { color: var(--color-warning, #f59e0b); }

/* 分页容器：只负责间距与右对齐，控件观感由 styles/pager.css 的 .ewt-pager 统一接管 */
.sm-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

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
  .sm-cat-pill { min-height: 40px; }
  .sm-toolbar-left, .sm-toolbar-right { width: 100%; }
  .sm-btn { min-height: 44px; padding: 8px 12px; font-size: 13px; }
  .sm-select { height: 44px; font-size: 16px; }
  /* 触屏没有 hover，小铅笔常驻提示可点；放大到 34px 便于点按 */
  .sm-icon-btn { width: 34px; height: 34px; }
  .sm-icon-text { font-size: 20px; }
  .sm-icon-edit { opacity: 1; }
  /* 窄屏隐藏「每页条数」与「跳转」，只留 总数 + 上一页/下一页（pager.css 已处理居中与触控尺寸） */
  .sm-pager { justify-content: center; }
  .sm-pager :deep(.el-pagination__sizes),
  .sm-pager :deep(.el-pagination__jump) { display: none; }
}
</style>
