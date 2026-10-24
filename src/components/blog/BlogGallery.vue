<script setup lang="ts">
/**
 * 博客图库管理（后台·左侧菜单「文章 → 图库」）
 *
 * 卡片列表展示图片库全部图片，支持上传（多选）、单张删除、分类筛选、批量归类、搜索/排序/分页。
 * 与项目其它面板一致：查询区走卡片式（输入 + 排序）、分页统一 el-pagination + .ewt-pager、
 * 每页条数复用 usePageSize。
 *
 * 删除语义：**被文章引用（正文 `img:<id>` 或封面 coverImageId）的图片禁止删除**——
 * 删除按钮置灰并在 title 里列出引用它的文章，未引用的图片才允许正常删除。
 * 早期版本是「强制删除 + 自动清理正文引用」，2026-10-25 起改为本语义（store.removeImages 同步加守卫）。
 *
 * 批量编辑：默认不显示复选框；点「批量编辑」才进入多选模式，避免常态化的勾选框干扰浏览。
 */
import { computed, ref, watch } from 'vue'
import { useBlogStore } from '@/stores/blog'
import {
  filterImages,
  filterImagesByCategory,
  formatBytes,
  formatDateTime,
  paginate,
  sortImages
} from '@/composables/blogCore'
import { isAllowedDataImage } from '@/composables/blogImages'
import { PAGE_SIZES, usePageSize } from '@/composables/usePageSize'
import { showConfirm, toastAlert } from '@/utils/dialog'
import { BLOG_IMAGE_CATEGORY_ALL, BLOG_IMAGE_CATEGORY_NONE } from '@/types'
import type { BlogImage, BlogImageSort } from '@/types'
import BaseDialog from '@/components/common/BaseDialog.vue'

const store = useBlogStore()
const { pageSize } = usePageSize('bg-grid-pager', 20)

const keyword = ref('')
const sort = ref<BlogImageSort>('created-desc')
const page = ref(1)
/** 分类筛选：'all' 全部 / 'uncategorized' 未分类 / 具体分类 id */
const categoryFilter = ref<string>(BLOG_IMAGE_CATEGORY_ALL)
/** 批量编辑（多选）模式开关 */
const batchMode = ref(false)
/** 勾选中的图片 id（批量归类 / 批量删除用） */
const selected = ref<string[]>([])
/** 批量移动的目标分类（下拉值；'uncategorized' 表示移到未分类） */
const moveTarget = ref<string>(BLOG_IMAGE_CATEGORY_NONE)
const moving = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
/** 重命名弹框：正在改名的图片 + 输入框值 */
const renaming = ref<BlogImage | null>(null)
const renameText = ref('')
const renameSaving = ref(false)

/** 提示文案里最多列出几篇文章标题，超出折叠为「等 N 篇」 */
const USAGE_TITLE_LIMIT = 3

/** 关键词命中集合：分类计数与列表都以此为基数，保证芯片上的数字与点击后看到的一致 */
const keywordMatched = computed(() => filterImages(store.images, keyword.value))

const filtered = computed(() =>
  sortImages(filterImagesByCategory(keywordMatched.value, categoryFilter.value), sort.value)
)
const total = computed(() => filtered.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
/** 页码夹到合法范围，避免删到最后一页越界出现空页 */
const pageClamped = computed(() => Math.min(page.value, totalPages.value))
const paged = computed(() => paginate(filtered.value, pageClamped.value, pageSize.value))

/**
 * 分类筛选入口：全部 + 各分类（按 order）+ 未分类。
 * 无分类数据时自然只剩「全部 / 未分类」两项（不额外分支）。
 */
const categoryOptions = computed(() => {
  const base = keywordMatched.value
  const byCat = new Map<string, number>()
  let none = 0
  for (const img of base) {
    if (!img.categoryId) {
      none += 1
      continue
    }
    byCat.set(img.categoryId, (byCat.get(img.categoryId) ?? 0) + 1)
  }
  const opts: Array<{ key: string; label: string; count: number }> = [
    { key: BLOG_IMAGE_CATEGORY_ALL, label: '全部', count: base.length }
  ]
  for (const c of store.sortedImageCategories) {
    opts.push({ key: c.id, label: c.name, count: byCat.get(c.id) ?? 0 })
  }
  opts.push({ key: BLOG_IMAGE_CATEGORY_NONE, label: '未分类', count: none })
  return opts
})

/** 批量移动下拉项：未分类 + 各分类；无分类时仍至少可移到「未分类」 */
const moveTargetOptions = computed(() => [
  { key: BLOG_IMAGE_CATEGORY_NONE, label: '未分类' },
  ...store.sortedImageCategories.map(c => ({ key: c.id, label: c.name }))
])

// 筛选条件变化回到第 1 页（与 BlogPosts 等面板行为一致）
watch([keyword, sort, pageSize, categoryFilter], () => {
  page.value = 1
})

// 边界：正在筛选的分类在「图库设置」里被删掉时，自动回到「全部」，避免停在永远为空的视图
watch(
  () => store.sortedImageCategories.map(c => c.id).join('\u0000'),
  () => {
    const key = categoryFilter.value
    if (key === BLOG_IMAGE_CATEGORY_ALL || key === BLOG_IMAGE_CATEGORY_NONE) return
    if (!store.sortedImageCategories.some(c => c.id === key)) {
      categoryFilter.value = BLOG_IMAGE_CATEGORY_ALL
    }
  }
)

const allOnPageSelected = computed(
  () => paged.value.length > 0 && paged.value.every(i => selected.value.includes(i.id))
)

/** 当前筛选下可勾选的图片（批量模式用） */
const selectableCount = computed(() => filtered.value.length)

function isSelected(id: string): boolean {
  return selected.value.includes(id)
}

function toggleSelect(id: string): void {
  const i = selected.value.indexOf(id)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(id)
}

/** 全选/取消全选只作用于当前页，避免误操作看不见的图片 */
function toggleAllOnPage(): void {
  if (allOnPageSelected.value) {
    const ids = new Set(paged.value.map(i => i.id))
    selected.value = selected.value.filter(id => !ids.has(id))
    return
  }
  const next = new Set(selected.value)
  for (const img of paged.value) next.add(img.id)
  selected.value = Array.from(next)
}

function clearSelection(): void {
  selected.value = []
}

function enterBatch(): void {
  batchMode.value = true
}

/** 退出批量编辑：清空勾选，避免残留的选中项影响下次进入 */
function exitBatch(): void {
  batchMode.value = false
  clearSelection()
}

/** 该图片被引用情况（含正文与封面；未引用返回 undefined） */
function usageOf(img: BlogImage) {
  return store.imageUsage.get(img.id)
}

/** 卡片副标题文案 */
function usageLabel(img: BlogImage): string {
  const n = usageOf(img)?.count ?? 0
  return n > 0 ? `被 ${n} 篇文章引用` : '未使用'
}

/** 该图片是否允许删除：未被任何文章引用才允许 */
function isRemovable(img: BlogImage): boolean {
  return (usageOf(img)?.count ?? 0) === 0
}

/** 引用它的文章标题（用于禁用原因提示） */
function usageTitles(img: BlogImage): string[] {
  const u = usageOf(img)
  if (!u || u.count === 0) return []
  return u.articleIds.map(id => store.findArticle(id)?.title?.trim() || '（无标题）')
}

/** 删除按钮的 title：未引用给正常说明，已引用给出原因 + 引用它的文章 */
function deleteTitle(img: BlogImage): string {
  const titles = usageTitles(img)
  if (titles.length === 0) return '删除这张图片'
  const shown = titles.slice(0, USAGE_TITLE_LIMIT).map(t => `《${t}》`).join('、')
  const more = titles.length > USAGE_TITLE_LIMIT ? ` 等 ${titles.length} 篇` : ''
  return `已被 ${titles.length} 篇文章引用（正文或封面）：${shown}${more}。请先在这些文章中移除该图片，之后即可删除。`
}

/** 打开重命名弹框（仅未引用的图片可点，见模板 disabled 分支） */
function openRename(img: BlogImage): void {
  renaming.value = img
  renameText.value = img.name
}

async function submitRename(): Promise<void> {
  const img = renaming.value
  if (!img || renameSaving.value) return
  renameSaving.value = true
  const r = await store.renameImage(img.id, renameText.value)
  renameSaving.value = false
  if (!r.ok) {
    toastAlert(r.reason ?? '重命名失败', 'warning')
    return
  }
  renaming.value = null
  toastAlert('图片名称已修改', 'success')
}

/** FileReader → base64 data URL（Promise 化，便于多文件串行读取） */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function openUpload(): void {
  fileInput.value?.click()
}

/** 上传：逐个读 base64 → 白名单校验 → 批量入库（只落盘一次）。新图一律落在「未分类」 */
async function onPickFiles(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = '' // 复位，便于重复选择同一文件
  if (files.length === 0) return
  uploading.value = true
  let rejected = 0
  const payload: Array<{ name: string; dataUrl: string; size?: number }> = []
  for (const file of files) {
    let dataUrl: string
    try {
      dataUrl = await readAsDataUrl(file)
    } catch {
      rejected += 1
      continue
    }
    if (!isAllowedDataImage(dataUrl)) {
      rejected += 1
      continue
    }
    payload.push({ name: file.name.replace(/\.[^.]+$/, '') || '图片', dataUrl, size: file.size })
  }
  if (payload.length > 0) await store.addImages(payload)
  uploading.value = false
  if (payload.length === 0) {
    toastAlert(`已跳过 ${rejected} 个不支持的图片（仅支持位图 base64，svg 被禁止）`, 'warning')
    return
  }
  if (rejected > 0) {
    toastAlert(`已上传 ${payload.length} 张，${rejected} 个不支持的格式被跳过`, 'warning')
    return
  }
  toastAlert(`已上传 ${payload.length} 张图片`, 'success')
}

/** 批量移动到指定分类；未选任何图片时给出提示而不是静默无反应 */
async function batchMove(): Promise<void> {
  if (selected.value.length === 0) {
    toastAlert('请先选择要移动的图片', 'warning')
    return
  }
  if (moving.value) return
  moving.value = true
  const targetId = moveTarget.value === BLOG_IMAGE_CATEGORY_NONE ? null : moveTarget.value
  const res = await store.moveImagesToCategory(selected.value, targetId)
  moving.value = false
  if (!res.ok) {
    toastAlert(res.reason ?? '移动失败', 'warning')
    return
  }
  if (res.moved === 0) {
    toastAlert('所选图片已在该分类下，未做变更', 'warning')
    return
  }
  const name = targetId ? store.imageCategoryName(targetId) : '未分类'
  toastAlert(`已将 ${res.moved} 张图片移动到「${name}」`, 'success')
  clearSelection()
}

/**
 * 删除：被文章引用的图片由 store 拦下（UI 侧已置灰禁用，这里是兜底）。
 * 单张删除与批量删除共用此逻辑，避免两处语义分叉。
 */
async function doRemove(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const what = ids.length > 1 ? `选中的 ${ids.length} 张` : '这张'
  if (!await showConfirm(`确定删除${what}图片吗？删除后不可恢复。`, '删除')) return
  const res = await store.removeImages(ids)
  selected.value = selected.value.filter(id => !ids.includes(id))
  if (res.blocked > 0 && res.removed > 0) {
    toastAlert(`已删除 ${res.removed} 张；另有 ${res.blocked} 张正被文章引用，已跳过`, 'warning')
    return
  }
  if (res.blocked > 0) {
    toastAlert(`所选图片正被文章引用，无法删除。请先在文章中移除这些图片。`, 'error')
    return
  }
  toastAlert(`已删除 ${res.removed} 张图片`, 'success')
}
</script>

<template>
  <section class="bg-panel">
    <!-- 分类筛选入口 -->
    <div class="bg-filter" role="group" aria-label="图库分类筛选" data-testid="blog-gallery-filter">
      <button
        v-for="opt in categoryOptions"
        :key="opt.key"
        type="button"
        class="bg-chip"
        :class="{ 'is-on': categoryFilter === opt.key }"
        :aria-pressed="categoryFilter === opt.key"
        :data-testid="`blog-gallery-filter-${opt.key}`"
        @click="categoryFilter = opt.key"
      >
        <span class="bg-chip-label">{{ opt.label }}</span>
        <span class="bg-chip-count">{{ opt.count }}</span>
      </button>
    </div>

    <div class="bg-query">
      <div class="bg-query-field">
        <span class="bg-query-label">关键词</span>
        <el-input
          v-model="keyword"
          size="small"
          placeholder="按名称搜索图片"
          clearable
          data-testid="blog-gallery-search"
        />
      </div>
      <div class="bg-query-field">
        <span class="bg-query-label">排序</span>
        <select v-model="sort" class="bg-select" data-testid="blog-gallery-sort">
          <option value="created-desc">最新优先</option>
          <option value="created-asc">最早优先</option>
          <option value="name-asc">名称升序</option>
        </select>
      </div>
      <div class="bg-query-ops">
        <button type="button" class="ui-btn ui-btn--sm ui-btn--primary" :disabled="uploading" data-testid="blog-gallery-upload" @click="openUpload">
          {{ uploading ? '上传中…' : '上传图片' }}
        </button>
        <button
          v-if="!batchMode"
          type="button"
          class="ui-btn ui-btn--sm"
          :disabled="total === 0"
          data-testid="blog-gallery-batch-edit"
          @click="enterBatch"
        >
          批量编辑
        </button>
        <button
          v-else
          type="button"
          class="ui-btn ui-btn--sm"
          data-testid="blog-gallery-batch-exit"
          @click="exitBatch"
        >
          退出批量编辑
        </button>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        class="bg-file-hidden"
        data-testid="blog-gallery-file"
        @change="onPickFiles"
      />
    </div>

    <!-- 非批量模式：只显示总数 -->
    <div v-if="!batchMode" class="bg-bar">
      <span class="bg-total">共 {{ total }} 张</span>
    </div>

    <!-- 批量编辑模式：全选 / 取消 / 移动到分类 / 批量删除 -->
    <div v-else class="bg-batch">
      <label class="bg-select-all">
        <input type="checkbox" :checked="allOnPageSelected" :disabled="total === 0" @change="toggleAllOnPage" />
        <span>全选本页</span>
      </label>
      <span class="bg-total">已选 {{ selected.length }} 张 / 共 {{ total }} 张</span>
      <button type="button" class="bg-clear" :disabled="selected.length === 0" @click="clearSelection">取消选择</button>

      <div class="bg-batch-ops">
        <select
          v-model="moveTarget"
          class="bg-select"
          :disabled="selected.length === 0"
          data-testid="blog-gallery-move-target"
        >
          <option v-for="opt in moveTargetOptions" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
        </select>
        <button
          type="button"
          class="ui-btn ui-btn--sm ui-btn--primary"
          :disabled="selected.length === 0 || moving"
          data-testid="blog-gallery-move-apply"
          @click="batchMove"
        >
          {{ moving ? '移动中…' : '移动到该分类' }}
        </button>
        <button
          type="button"
          class="ui-btn ui-btn--sm ui-btn--danger"
          :disabled="selected.length === 0"
          data-testid="blog-gallery-batch-delete"
          @click="doRemove(selected)"
        >
          批量删除{{ selected.length > 0 ? `（${selected.length}）` : '' }}
        </button>
      </div>
      <p v-if="selectableCount === 0" class="bg-batch-hint">当前筛选下没有图片，无法批量操作。</p>
    </div>

    <p v-if="total === 0" class="bg-empty">
      {{ keyword ? `没有匹配「${keyword}」的图片，换个关键词试试。` : '图库还是空的，点右上角「上传图片」添加。' }}
    </p>

    <ul v-else class="bg-grid">
      <li v-for="img in paged" :key="img.id" class="bg-item">
        <div class="bg-card" :class="{ 'is-on': batchMode && isSelected(img.id) }">
          <label v-if="batchMode" class="bg-check">
            <input
              type="checkbox"
              :checked="isSelected(img.id)"
              :data-testid="`blog-gallery-check-${img.id}`"
              @change="toggleSelect(img.id)"
            />
          </label>
          <div class="bg-thumb">
            <img :src="img.dataUrl" :alt="img.name" />
          </div>
          <div class="bg-meta">
            <span class="bg-name" :title="img.name">{{ img.name }}</span>
            <span class="bg-sub">{{ formatBytes(img.size) }} · {{ formatDateTime(img.createdAt) }}</span>
            <span class="bg-usage">{{ usageLabel(img) }}</span>
            <span class="bg-cat">{{ store.imageCategoryName(img.categoryId) }}</span>
          </div>
          <div class="bg-ops">
            <button
              type="button"
              class="bg-del bg-rename"
              :disabled="!isRemovable(img)"
              :title="isRemovable(img) ? '修改图片名称' : deleteTitle(img)"
              :data-testid="`blog-gallery-rename-${img.id}`"
              @click="openRename(img)"
            >
              重命名
            </button>
            <button
              type="button"
              class="bg-del"
              :disabled="!isRemovable(img)"
              :title="deleteTitle(img)"
              :data-testid="`blog-gallery-delete-${img.id}`"
              @click="doRemove([img.id])"
            >
              删除
            </button>
          </div>
        </div>
      </li>
    </ul>

    <BaseDialog v-if="renaming" title="重命名图片" width="480px" data-testid="blog-gallery-rename-dialog" @close="renaming = null">
      <div class="bg-rename-body">
        <div class="bg-rename-thumb">
          <img :src="renaming.dataUrl" :alt="renaming.name" />
        </div>
        <label class="bg-rename-field">
          <span class="bg-rename-label">图片名称</span>
          <el-input
            v-model="renameText"
            size="small"
            maxlength="60"
            placeholder="用于列表展示与插入正文时的默认别名"
            data-testid="blog-gallery-rename-input"
            @keyup.enter="submitRename"
          />
        </label>
      </div>
      <template #footer>
        <button type="button" class="ui-btn ui-btn--sm" data-testid="blog-gallery-rename-cancel" @click="renaming = null">取消</button>
        <button
          type="button"
          class="ui-btn ui-btn--sm ui-btn--primary"
          :disabled="renameSaving || !renameText.trim()"
          data-testid="blog-gallery-rename-confirm"
          @click="submitRename"
        >
          保存
        </button>
      </template>
    </BaseDialog>

    <div v-if="total > 0" class="bg-pager ewt-pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="PAGE_SIZES"
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        background
        small
        prev-text="上一页"
        next-text="下一页"
      />
    </div>
  </section>
</template>

<style scoped>
.bg-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ---------- 分类筛选 ---------- */
.bg-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bg-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-family: inherit;
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
}

.bg-chip:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}

.bg-chip.is-on {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}

.bg-chip-count {
  padding: 0 5px;
  border-radius: 999px;
  background-color: var(--color-bg-2, #f1f5f9);
  color: var(--color-text-muted, #94a3b8);
  font-size: 11px;
}

.bg-chip.is-on .bg-chip-count {
  background-color: rgba(59, 130, 246, 0.16);
  color: var(--color-primary, #3b82f6);
}

/* 查询卡片：与其它工作台 .td-search / .ba-query 同款 */
.bg-query {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card, #ffffff);
  box-shadow: var(--shadow-card, 0 1px 2px rgba(0, 0, 0, 0.06));
}

.bg-query-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
}

.bg-query-label {
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
}

.bg-query-ops {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.bg-select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-input, #ffffff);
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
}

.bg-select:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

/* 视觉隐藏但保留可点击（不用 display:none，便于自动化测试） */
.bg-file-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.bg-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ---------- 批量编辑条 ---------- */
.bg-batch {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-primary, #3b82f6);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-primary-soft, #eff6ff);
}

.bg-batch-ops {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}

.bg-batch-hint {
  flex: 1 1 100%;
  margin: 0;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
}

.bg-select-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
}

.bg-total {
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
}

.bg-clear {
  padding: 0;
  border: none;
  background: none;
  color: var(--color-primary, #3b82f6);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
}

.bg-clear:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.bg-empty {
  margin: 0;
  padding: 40px 12px;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  text-align: center;
}

.bg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bg-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card, #ffffff);
}

.bg-card.is-on {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary-soft, #eff6ff);
}

.bg-check {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 1;
}

.bg-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  overflow: hidden;
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-2, #f1f5f9);
}

.bg-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.bg-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bg-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-sm, 13px);
}

.bg-sub,
.bg-usage {
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 11px);
}

/* 所属分类标签：已分类高亮，未分类弱化 */
.bg-cat {
  align-self: flex-start;
  margin-top: 2px;
  padding: 1px 7px;
  border-radius: 999px;
  background-color: var(--color-bg-2, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
  font-size: 11px;
}

.bg-del {
  align-self: flex-start;
  padding: 2px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
}

.bg-del:hover {
  border-color: var(--color-error, #ef4444);
  color: var(--color-error, #ef4444);
}

.bg-ops {
  display: flex;
  align-self: flex-start;
  gap: 6px;
}

.bg-rename:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}

.bg-del:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.bg-del:disabled:hover {
  border-color: var(--color-border, #e2e8f0);
  color: var(--color-text-secondary, #64748b);
}

/* 重命名弹框：缩略图 + 名称输入 */
.bg-rename-body {
  display: flex;
  gap: 14px;
}

.bg-rename-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 120px;
  height: 120px;
  overflow: hidden;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-2, #f1f5f9);
}

.bg-rename-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.bg-rename-field {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.bg-rename-label {
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
}

@media (max-width: 768px) {
  .bg-query-ops {
    margin-left: 0;
    width: 100%;
  }
  .bg-query-ops .ui-btn {
    flex: 1 1 auto;
    min-height: 44px;
  }
  .bg-batch-ops {
    margin-left: 0;
    width: 100%;
  }
  .bg-batch-ops .ui-btn {
    min-height: 44px;
  }
  .bg-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
}
</style>
