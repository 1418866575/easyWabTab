<script setup lang="ts">
/**
 * 博客文章列表（后台）
 *
 * 与其它工作台记录列表同构：列表 / 卡片双视图 + 关键词搜索 + 条件筛选 + 分页，
 * 右侧操作列统一由 records.css 的 .ewt-op-col 承载。
 * 状态流转按钮由 blogCore 的状态机决定可选项，不合法的动作不出现在界面上（而非点了才报错）。
 */
import { computed, ref, watch } from 'vue'
import { useBlogStore } from '@/stores/blog'
import {
  ARTICLE_STATUS_LABELS,
  filterArticles,
  formatDateTime,
  paginate,
  relativeTime,
  sortArticles,
  slugify,
  canTransitionArticle
} from '@/composables/blogCore'
import { useViewMode } from '@/composables/useViewMode'
import { usePageSize } from '@/composables/usePageSize'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/Icon.vue'
import { showConfirm, toastAlert } from '@/utils/dialog'
import type { ArticleStatus, BlogArticle, BlogSort } from '@/types'

const emit = defineEmits<{ edit: [id: string]; create: [] }>()

const store = useBlogStore()
const vm = useViewMode()

// ---------- 筛选与排序 ----------
const keyword = ref('')
const status = ref<ArticleStatus | 'all' | 'active'>('all')
const categoryId = ref('')
const tagId = ref('')
const sort = ref<BlogSort>('updated-desc')

const STATUS_FILTERS: Array<{ value: ArticleStatus | 'all' | 'active'; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'reviewing', label: '待审核' },
  { value: 'scheduled', label: '待定时发布' },
  { value: 'published', label: '已发布' },
  { value: 'offline', label: '已下架' },
  { value: 'rejected', label: '未通过' }
]

const SORT_OPTIONS: Array<{ value: BlogSort; label: string }> = [
  { value: 'updated-desc', label: '最近更新' },
  { value: 'updated-asc', label: '最早更新' },
  { value: 'created-desc', label: '最新创建' },
  { value: 'published-desc', label: '最近发布' },
  { value: 'views-desc', label: '阅读量' },
  { value: 'title-asc', label: '标题 A→Z' }
]

const filtered = computed(() =>
  sortArticles(
    filterArticles(store.activeArticles, {
      keyword: keyword.value,
      status: status.value,
      categoryId: categoryId.value || undefined,
      tagId: tagId.value || undefined
    }),
    sort.value
  )
)

// 筛选条件变化或数据变化导致越界时回到第 1 页
const { pageSize, PAGE_SIZES } = usePageSize('blog-posts-pager', store.settings.pageSize)
const page = ref(1)
const total = computed(() => filtered.value.length)
const pageItems = computed(() => paginate(filtered.value, page.value, pageSize.value))

watch([keyword, status, categoryId, tagId, sort, total], () => {
  const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value))
  if (page.value > maxPage) page.value = maxPage
  if (page.value < 1) page.value = 1
})

const hasFilter = computed(
  () => !!keyword.value.trim() || status.value !== 'all' || !!categoryId.value || !!tagId.value
)

function resetFilter(): void {
  keyword.value = ''
  status.value = 'all'
  categoryId.value = ''
  tagId.value = ''
  page.value = 1
}

// ---------- 状态流转 ----------
/** 当前状态可见的操作；用状态机判定，避免出现「点了才知道不行」的按钮 */
function actionsOf(row: BlogArticle): Array<{ key: string; label: string; kind?: 'primary' | 'danger' }> {
  const list: Array<{ key: string; label: string; kind?: 'primary' | 'danger' }> = []
  const can = (action: Parameters<typeof canTransitionArticle>[1]) => canTransitionArticle(row.status, action)
  if (can('publish')) list.push({ key: 'publish', label: row.status === 'offline' ? '重新发布' : '发布', kind: 'primary' })
  if (can('submit')) list.push({ key: 'submit', label: '提交审核' })
  if (can('approve')) list.push({ key: 'approve', label: '通过', kind: 'primary' })
  if (can('reject')) list.push({ key: 'reject', label: '驳回' })
  if (can('withdraw')) list.push({ key: 'withdraw', label: row.status === 'scheduled' ? '取消定时' : '撤回' })
  if (can('offline')) list.push({ key: 'offline', label: '下架' })
  if (can('schedule') && row.status !== 'scheduled') list.push({ key: 'schedule', label: '定时发布' })
  list.push({ key: 'delete', label: '删除', kind: 'danger' })
  return list
}

async function runAction(row: BlogArticle, key: string): Promise<void> {
  switch (key) {
    case 'edit':
      emit('edit', row.id)
      return
    case 'publish': {
      const res = await store.publishArticle(row.id)
      if (!res.ok) {
        toastAlert(res.errors?.join('；') ?? '发布失败', 'error')
        return
      }
      toastAlert('已发布', 'success')
      return
    }
    case 'submit': {
      const res = await store.submitForReview(row.id)
      if (!res.ok) {
        toastAlert(res.errors?.join('；') ?? '提交失败', 'error')
        return
      }
      toastAlert('已提交，等待审核', 'success')
      return
    }
    case 'approve': {
      const res = await store.approveArticle(row.id)
      if (!res.ok) toastAlert(res.reason ?? '操作失败', 'error')
      else toastAlert('已通过并发布', 'success')
      return
    }
    case 'reject':
      openReject(row)
      return
    case 'withdraw': {
      if (row.status === 'scheduled') {
        await store.cancelSchedule(row.id)
        toastAlert('已取消定时，回到草稿', 'success')
        return
      }
      const res = await store.withdrawArticle(row.id)
      if (!res.ok) toastAlert(res.reason ?? '操作失败', 'error')
      else toastAlert('已撤回为草稿', 'success')
      return
    }
    case 'offline': {
      if (!await showConfirm(`确定要将《${row.title}》下架吗？下架后前台不可见，可从列表重新发布。`)) return
      const res = await store.offlineArticle(row.id)
      if (!res.ok) toastAlert(res.reason ?? '操作失败', 'error')
      else toastAlert('已下架', 'success')
      return
    }
    case 'schedule':
      openSchedule(row)
      return
    case 'delete': {
      if (!await showConfirm(`《${row.title}》将被移入回收站，可在回收站恢复。确定删除吗？`)) return
      await store.softDeleteArticle(row.id)
      toastAlert('已移入回收站', 'success')
      return
    }
    default:
      return
  }
}

async function togglePin(row: BlogArticle): Promise<void> {
  const res = await store.togglePin(row.id)
  if (!res.ok) toastAlert(res.reason ?? '置顶失败', 'error')
  else toastAlert(row.pinned ? '已取消置顶' : '已置顶', 'success')
}

// ---------- 驳回弹框（不写原因不允许驳回，退回后作者在列表可直接看到原因） ----------
const rejectRow = ref<BlogArticle | null>(null)
const rejectReason = ref('')

function openReject(row: BlogArticle): void {
  rejectReason.value = row.auditRemark ?? ''
  rejectRow.value = row
}

async function submitReject(): Promise<void> {
  if (!rejectRow.value) return
  const reason = rejectReason.value.trim()
  if (!reason) {
    toastAlert('请填写驳回原因，作者需要据此修改', 'warning')
    return
  }
  const res = await store.rejectArticle(rejectRow.value.id, reason)
  if (!res.ok) {
    toastAlert(res.reason ?? '操作失败', 'error')
    return
  }
  toastAlert('已驳回', 'success')
  rejectRow.value = null
}

// ---------- 定时发布弹框 ----------
const scheduleRow = ref<BlogArticle | null>(null)
const scheduleAt = ref('')

function openSchedule(row: BlogArticle): void {
  // datetime-local 需要本地时间的 YYYY-MM-DDTHH:mm串，不能直接用 ISO（含时区后缀）
  const t = new Date(Date.now() + 60 * 60 * 1000)
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  scheduleAt.value = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`
  scheduleRow.value = row
}

async function submitSchedule(): Promise<void> {
  if (!scheduleRow.value) return
  const local = new Date(scheduleAt.value)
  if (Number.isNaN(local.getTime())) {
    toastAlert('发布时间格式不正确', 'error')
    return
  }
  const res = await store.scheduleArticle(scheduleRow.value.id, local.toISOString())
  if (!res.ok) {
    toastAlert(res.errors?.join('；') ?? '定时失败', 'error')
    return
  }
  toastAlert('已设为定时发布', 'success')
  scheduleRow.value = null
}

// ---------- 展示辅助 ----------
const statusClass = (s: ArticleStatus): string => `ba-status ba-status-${s}`

function displayTime(row: BlogArticle): string {
  if (row.status === 'scheduled' && row.scheduledAt) {
    return `将于 ${formatDateTime(row.scheduledAt)} 发布`
  }
  if (row.status === 'published' && row.publishedAt) {
    return `发布于 ${relativeTime(row.publishedAt)}`
  }
  return `更新于 ${relativeTime(row.updatedAt)}`
}
</script>

<template>
  <section class="ba-posts">
    <!-- 工具栏：左筛选 / 右操作 -->
    <div class="ewt-table-toolbar is-split">
      <div class="ba-posts-actions">
        <el-button type="primary" data-testid="blog-posts-create" @click="emit('create')">
          <Icon name="plus" :size="14" />
          <span>写文章</span>
        </el-button>
      </div>
      <ViewModeToggle v-if="total > 0" :mode="vm.mode" @toggle="vm.toggle" />
    </div>

    <div class="ba-filters">
      <el-input
        v-model="keyword"
        size="small"
        class="ba-search"
        placeholder="搜索标题 / 正文 / slug"
        clearable
      />
      <select v-model="status" class="ba-select" aria-label="按状态筛选">
        <option v-for="s in STATUS_FILTERS" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
      <select v-model="categoryId" class="ba-select" aria-label="按分类筛选">
        <option value="">全部分类</option>
        <option v-for="c in store.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <select v-model="tagId" class="ba-select" aria-label="按标签筛选">
        <option value="">全部标签</option>
        <option v-for="t in store.tags" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <select v-model="sort" class="ba-select" aria-label="排序方式">
        <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <button v-if="hasFilter" type="button" class="ba-reset" @click="resetFilter">清空筛选</button>
    </div>

    <p class="ba-count" data-testid="blog-posts-count">
      共 {{ total }} 篇<template v-if="total !== store.counts.all">（筛选自 {{ store.counts.all }} 篇）</template>
    </p>

    <div v-if="total === 0" class="ba-empty" data-testid="blog-posts-empty">
      {{ hasFilter ? '没有符合条件的文章，试试清空筛选条件' : '还没有文章，点击上方「写文章」开始第一篇' }}
    </div>

    <!-- 列表视图 -->
    <template v-else>
      <el-table
        v-if="vm.mode === 'list'"
        class="ewt-table"
        :data="pageItems"
        data-testid="blog-posts-table"
        stripe
        border
        size="default"
        style="width: 100%"
        row-key="id"
        empty-text="暂无文章"
      >
        <el-table-column label="标题" min-width="240">
          <template #default="{ row }">
            <div class="ba-cell-title">
              <span v-if="row.pinned" class="ba-pin" title="已置顶">置顶</span>
              <button type="button" class="ba-link" @click="emit('edit', row.id)">
                {{ row.title || '（无标题）' }}
              </button>
              <span class="ba-status-tag" :class="statusClass(row.status)">
                {{ ARTICLE_STATUS_LABELS[row.status as ArticleStatus] }}
              </span>
            </div>
            <div class="ba-cell-sub">
              <code>/{{ row.slug }}</code>
              <span class="ba-dot">·</span>
              <span>{{ row.readingMinutes }} 分钟</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="120" align="center">
          <template #default="{ row }">
            <span class="ba-cell-muted">{{ store.categoryName(row.categoryId) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="标签" min-width="140">
          <template #default="{ row }">
            <span v-if="store.tagNames(row.tagIds).length === 0" class="ba-cell-muted">—</span>
            <span v-for="name in store.tagNames(row.tagIds)" :key="name" class="ba-chip">#{{ name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="180" align="center">
          <template #default="{ row }">
            <span class="ba-cell-muted">{{ displayTime(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" align="center" class-name="ewt-op-col">
          <template #default="{ row }">
            <el-button size="small" @click="emit('edit', row.id)">编辑</el-button>
            <el-button size="small" @click="togglePin(row)">{{ row.pinned ? '取消置顶' : '置顶' }}</el-button>
            <el-button
              v-for="act in actionsOf(row)"
              :key="act.key"
              size="small"
              :class="{ 'ba-op-danger': act.kind === 'danger' }"
              @click="runAction(row, act.key)"
            >
              {{ act.label }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 卡片视图 -->
      <div v-else class="ewt-card-grid">
        <article v-for="row in pageItems" :key="row.id" class="ba-card" :data-testid="`blog-post-card-${row.id}`">
          <header class="ba-card-head">
            <button type="button" class="ba-card-title" @click="emit('edit', row.id)">
              {{ row.title || '（无标题）' }}
            </button>
            <button
              type="button"
              class="ba-pin-btn"
              :class="{ 'is-on': row.pinned }"
              :title="row.pinned ? '取消置顶' : '置顶'"
              @click="togglePin(row)"
            >
              <Icon name="refresh" :size="12" />
            </button>
          </header>
          <div class="ba-card-meta">
            <span class="ba-status-tag" :class="statusClass(row.status)">
              {{ ARTICLE_STATUS_LABELS[row.status as ArticleStatus] }}
            </span>
            <span class="ba-cell-muted">{{ store.categoryName(row.categoryId) }}</span>
          </div>
          <p v-if="row.excerpt" class="ba-card-excerpt">{{ row.excerpt }}</p>
          <div v-if="store.tagNames(row.tagIds).length" class="ba-card-tags">
            <span v-for="name in store.tagNames(row.tagIds)" :key="name" class="ba-chip">#{{ name }}</span>
          </div>
          <footer class="ba-card-foot">
            <span class="ba-cell-muted">{{ displayTime(row) }}</span>
            <div class="ba-card-ops">
              <button type="button" class="ba-mini" @click="emit('edit', row.id)">编辑</button>
              <button
                v-for="act in actionsOf(row)"
                :key="act.key"
                type="button"
                class="ba-mini"
                :class="{ 'is-danger': act.kind === 'danger' }"
                @click="runAction(row, act.key)"
              >
                {{ act.label }}
              </button>
            </div>
          </footer>
        </article>
      </div>

      <div class="ba-pager ewt-pager">
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
          data-testid="blog-posts-pagination"
        />
      </div>
    </template>

    <!-- 驳回：必须填原因 -->
    <BaseDialog v-if="rejectRow" title="驳回文章" @close="rejectRow = null">
      <p class="ba-dialog-text">
        《{{ rejectRow.title || '无标题' }}》将被退回草稿箱，作者可在列表看到你填写的原因。
      </p>
      <label class="ba-field">
        <span class="ba-field-label">驳回原因（必填）</span>
        <textarea
          v-model="rejectReason"
          class="ba-textarea"
          rows="3"
          placeholder="例如：正文第二段数据来源需补充出处"
          data-testid="blog-reject-reason"
        ></textarea>
      </label>
      <template #footer>
        <button type="button" class="btn-cancel" @click="rejectRow = null">取消</button>
        <button type="button" class="btn-submit" data-testid="blog-reject-submit" @click="submitReject">确定驳回</button>
      </template>
    </BaseDialog>

    <!-- 定时发布 -->
    <BaseDialog v-if="scheduleRow" title="定时发布" @close="scheduleRow = null">
      <p class="ba-dialog-text">
        为《{{ scheduleRow.title || '无标题' }}》设定发布时间，到点后会自动转为「已发布」。
      </p>
      <label class="ba-field">
        <span class="ba-field-label">发布时间</span>
        <input v-model="scheduleAt" type="datetime-local" class="ba-input" />
      </label>
      <p class="ba-dialog-hint">slug 建议：<code>{{ slugify(scheduleRow.title) || '需手填' }}</code></p>
      <template #footer>
        <button type="button" class="btn-cancel" @click="scheduleRow = null">取消</button>
        <button type="button" class="btn-submit" data-testid="blog-schedule-submit" @click="submitSchedule">确定</button>
      </template>
    </BaseDialog>
  </section>
</template>

<style scoped>
.ba-posts {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ba-posts-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ba-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.ba-search {
  width: 240px;
  max-width: 100%;
}

.ba-select {
  min-height: 24px;
  padding: 0 8px;
  height: 24px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-xs, 12px);
}

.ba-reset {
  border: none;
  background: transparent;
  color: var(--color-primary, #3b82f6);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
}

.ba-count {
  margin: 0 0 8px;
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-muted, #94a3b8);
}

.ba-empty {
  padding: 32px 16px;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  text-align: center;
}

.ba-cell-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ba-pin {
  padding: 0 6px;
  border-radius: 999px;
  background-color: var(--color-warning-soft, #fef3c7);
  color: var(--color-warning, #b45309);
  font-size: var(--font-size-xs, 11px);
  line-height: 18px;
}

.ba-link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--color-primary, #3b82f6);
  font-size: var(--font-size-sm, 13px);
  text-align: left;
  cursor: pointer;
}

.ba-cell-sub code {
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 11px);
}

.ba-dot {
  margin: 0 6px;
  color: var(--color-text-muted, #94a3b8);
}

.ba-cell-muted {
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
}

.ba-status-tag {
  padding: 0 8px;
  border-radius: 999px;
  font-size: var(--font-size-xs, 11px);
  line-height: 18px;
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
}

.ba-status-draft { background-color: var(--color-bg-hover, #f1f5f9); color: var(--color-text-secondary, #64748b); }
.ba-status-reviewing { background-color: var(--color-warning-soft, #fef3c7); color: var(--color-warning, #b45309); }
.ba-status-scheduled { background-color: var(--color-primary-soft, #eff6ff); color: var(--color-primary, #3b82f6); }
.ba-status-published { background-color: var(--color-success-soft, #dcfce7); color: var(--color-success, #16a34a); }
.ba-status-offline { background-color: var(--color-bg-hover, #f1f5f9); color: var(--color-text-muted, #94a3b8); }
.ba-status-rejected { background-color: var(--color-error-soft, #fee2e2); color: var(--color-error, #ef4444); }

.ba-chip {
  display: inline-block;
  margin-right: 4px;
  padding: 0 6px;
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-size: var(--font-size-xs, 11px);
  line-height: 18px;
}

.ba-op-danger.el-button {
  color: var(--color-error, #ef4444);
}

/* ---------- 卡片视图 ---------- */
.ba-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
}

.ba-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.ba-card-title {
  flex: 1 1 auto;
  border: none;
  background: transparent;
  padding: 0;
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-sm, 14px);
  font-weight: var(--font-weight-medium, 500);
  text-align: left;
  cursor: pointer;
}

.ba-pin-btn {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
}

.ba-pin-btn.is-on {
  border-color: var(--color-warning, #f59e0b);
  color: var(--color-warning, #f59e0b);
}

.ba-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ba-card-excerpt {
  margin: 0;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  line-height: var(--line-height-relaxed, 1.6);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.ba-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ba-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 6px;
  border-top: 1px solid var(--color-border, #e2e8f0);
}

.ba-card-ops {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

.ba-mini {
  padding: 2px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 11px);
  cursor: pointer;
}

.ba-mini:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.ba-mini.is-danger:hover { border-color: var(--color-error, #ef4444); color: var(--color-error, #ef4444); }

.ba-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

/* ---------- 弹框内 ---------- */
.ba-dialog-text {
  margin: 0 0 12px;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
}

.ba-dialog-hint {
  margin: 8px 0 0;
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
}

.ba-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ba-field-label {
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
}

.ba-textarea {
  padding: 8px 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-input, #ffffff);
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
  line-height: var(--line-height-relaxed, 1.6);
  resize: vertical;
}

.ba-input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-input, #ffffff);
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
}

@media (max-width: 768px) {
  .ba-search { width: 100%; }
  .ba-pager :deep(.el-pagination__sizes),
  .ba-pager :deep(.el-pagination__jump) { display: none; }
}
</style>
