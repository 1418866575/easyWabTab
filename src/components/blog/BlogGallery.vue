<script setup lang="ts">
/**
 * 博客图库管理（后台·左侧菜单「文章 → 图库」）
 *
 * 卡片列表展示图片库全部图片，支持上传（多选）、单张删除、勾选批量删除、搜索/排序/分页。
 * 与项目其它面板一致：查询区走卡片式（输入 + 排序）、分页统一 el-pagination + .ewt-pager、
 * 每页条数复用 usePageSize。
 *
 * 删除语义：**强制删除**——被文章引用的图片会同步把这些文章正文里的引用移除
 * （store.removeImages），避免留下指向已删图片的悬空引用（正文会退化显示 `img:<id>` 文本）。
 */
import { computed, ref, watch } from 'vue'
import { useBlogStore } from '@/stores/blog'
import { filterImages, formatBytes, formatDateTime, paginate, sortImages } from '@/composables/blogCore'
import { isAllowedDataImage } from '@/composables/blogImages'
import { PAGE_SIZES, usePageSize } from '@/composables/usePageSize'
import { showConfirm, toastAlert } from '@/utils/dialog'
import BaseDialog from '@/components/common/BaseDialog.vue'
import type { BlogImage, BlogImageSort } from '@/types'

const store = useBlogStore()
const { pageSize } = usePageSize('bg-grid-pager', 20)

const keyword = ref('')
const sort = ref<BlogImageSort>('created-desc')
const page = ref(1)
/** 勾选中的图片 id（批量删除用） */
const selected = ref<string[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
/** 重命名弹框：正在改名的图片 + 输入框值 */
const renaming = ref<BlogImage | null>(null)
const renameText = ref('')
const renameSaving = ref(false)

const filtered = computed(() => sortImages(filterImages(store.images, keyword.value), sort.value))
const total = computed(() => filtered.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
/** 页码夹到合法范围，避免删到最后一页越界出现空页 */
const pageClamped = computed(() => Math.min(page.value, totalPages.value))
const paged = computed(() => paginate(filtered.value, pageClamped.value, pageSize.value))

// 筛选条件变化回到第 1 页（与 BlogPosts 等面板行为一致）
watch([keyword, sort, pageSize], () => {
  page.value = 1
})

const allOnPageSelected = computed(
  () => paged.value.length > 0 && paged.value.every(i => selected.value.includes(i.id))
)

function isSelected(id: string): boolean {
  return selected.value.includes(id)
}

function toggleSelect(id: string): void {
  const i = selected.value.indexOf(id)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(id)
}

/** 全选/取消全选只作用于当前页，避免误删看不见的图片 */
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

function usageLabel(img: BlogImage): string {
  const n = store.imageUsage.get(img.id) ?? 0
  return n > 0 ? `被 ${n} 篇文章引用` : '未使用'
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

/** 上传：逐个读 base64 → 白名单校验 → 批量入库（只落盘一次） */
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

/**
 * 删除：被引用时二次确认并说明影响（会同时清理文章正文引用）。
 * 单张删除与批量删除共用此逻辑，避免两处语义分叉。
 */
async function doRemove(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const used = ids.filter(id => (store.imageUsage.get(id) ?? 0) > 0)
  let msg = `确定删除${ids.length > 1 ? `选中的 ${ids.length} 张` : '这张'}图片吗？`
  if (used.length > 0) {
    const refs = used.reduce((sum, id) => sum + (store.imageUsage.get(id) ?? 0), 0)
    msg = `其中 ${used.length} 张正被 ${refs} 篇文章引用，删除后这些文章正文里的图片会一并移除。确定删除${ids.length > 1 ? `选中的 ${ids.length} 张` : '这张'}图片吗？`
  }
  if (!await showConfirm(msg, '删除')) return
  const res = await store.removeImages(ids)
  selected.value = selected.value.filter(id => !ids.includes(id))
  if (res.affectedArticles > 0) {
    toastAlert(`已删除 ${res.removed} 张图片，并同步清理了 ${res.affectedArticles} 篇文章中的引用`, 'success')
  } else {
    toastAlert(`已删除 ${res.removed} 张图片`, 'success')
  }
}
</script>

<template>
  <section class="bg-panel">
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
          type="button"
          class="ui-btn ui-btn--sm ui-btn--danger"
          :disabled="selected.length === 0"
          data-testid="blog-gallery-batch-delete"
          @click="doRemove(selected)"
        >
          批量删除{{ selected.length > 0 ? `（${selected.length}）` : '' }}
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

    <div class="bg-bar">
      <label class="bg-select-all">
        <input type="checkbox" :checked="allOnPageSelected" :disabled="total === 0" @change="toggleAllOnPage" />
        <span>全选本页</span>
      </label>
      <span class="bg-total">共 {{ total }} 张</span>
      <button v-if="selected.length > 0" type="button" class="bg-clear" @click="selected = []">取消勾选</button>
    </div>

    <p v-if="total === 0" class="bg-empty">
      {{ keyword ? `没有匹配「${keyword}」的图片，换个关键词试试。` : '图库还是空的，点右上角「上传图片」添加。' }}
    </p>

    <ul v-else class="bg-grid">
      <li v-for="img in paged" :key="img.id" class="bg-item">
        <div class="bg-card" :class="{ 'is-on': isSelected(img.id) }">
          <label class="bg-check">
            <input type="checkbox" :checked="isSelected(img.id)" @change="toggleSelect(img.id)" />
          </label>
          <div class="bg-thumb">
            <img :src="img.dataUrl" :alt="img.name" />
          </div>
          <div class="bg-meta">
            <span class="bg-name" :title="img.name">{{ img.name }}</span>
            <span class="bg-sub">{{ formatBytes(img.size) }} · {{ formatDateTime(img.createdAt) }}</span>
            <span class="bg-usage">{{ usageLabel(img) }}</span>
          </div>
          <div class="bg-ops">
            <button
              type="button"
              class="bg-del bg-rename"
              :disabled="(store.imageUsage.get(img.id) ?? 0) > 0"
              :title="(store.imageUsage.get(img.id) ?? 0) > 0 ? '图片已被文章引用，不可修改名称' : '修改图片名称'"
              :data-testid="`blog-gallery-rename-${img.id}`"
              @click="openRename(img)"
            >
              重命名
            </button>
            <button
              type="button"
              class="bg-del"
              title="删除这张图片"
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
  .bg-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
}
</style>
