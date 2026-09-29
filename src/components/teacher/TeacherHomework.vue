<script setup lang="ts">
// 作业记录（全员可见：班主任、代课老师都能用）：新建作业 → 按名册为每位同学生成一条未交记录；
// 同学补交后人工标记「已补交」（可填补交时间/备注，留空则保持空）；一键导出未交名单 Excel。
// 数据挂在班级桶 homeworks[]（学期×班级隔离），计算走 teacherCore 纯函数，store 只做读写。
// 布局 / 交互对齐 StudentMistakes：列表+卡片双视图 + el-pagination + el-dialog(ewt-dialog-footer) + showConfirm/useToast。

import { computed, ref, watch } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import { useViewMode } from '@/composables/useViewMode'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'
import Icon from '@/components/Icon.vue'
import { showConfirm } from '@/utils/dialog'
import { useToast } from '@/composables/useToast'
import { countMisses } from '@/composables/teacherCore'
import { usePageSize } from '@/composables/usePageSize'
import type { TeacherHomework, TeacherHomeworkMiss, HomeworkMissStatus } from '@/types/teacher'
import { HOMEWORK_MISS_STATUS_META } from '@/types/teacher'
import SubjectSelect from '@/components/teacher/SubjectSelect.vue'

const store = useTeacherStore()
const vm = useViewMode()
const toast = useToast()

const b = computed(() => store.bucket)

// ---------- 列表 + 分页 ----------
const homeworks = computed<TeacherHomework[]>(() =>
  [...(b.value?.homeworks ?? [])].sort((a, c) => {
    if (a.assignDate !== c.assignDate) return a.assignDate < c.assignDate ? 1 : -1
    return a.createdAt < c.createdAt ? 1 : -1
  })
)

const LIST_PAGE_SIZE = 10
const { pageSize, PAGE_SIZES } = usePageSize('teacher-homework-pager', LIST_PAGE_SIZE)
const currentPage = ref(1)
const pageItems = computed<TeacherHomework[]>(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return homeworks.value.slice(start, start + pageSize.value)
})
watch(
  () => [homeworks.value.length, pageSize.value],
  () => {
    const max = Math.max(1, Math.ceil(homeworks.value.length / pageSize.value))
    if (currentPage.value > max) currentPage.value = max
  }
)

const stats = computed(() => store.homeworkSummary)

// ---------- 新建 / 编辑弹框 ----------
const showForm = ref(false)
const editingId = ref<string | null>(null)
const formSubject = ref('')
const formTitle = ref('')
const formContent = ref('')
const formAssign = ref('')
const formDue = ref('')

function resetForm(): void {
  editingId.value = null
  // 学科默认反显当前班级的任教学科（ClassGroup.subject）；未设置则留空由用户选择
  formSubject.value = store.cls?.subject || ''
  formTitle.value = ''
  formContent.value = ''
  formAssign.value = todayLocal()
  formDue.value = todayLocal()
}

function todayLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function openAddDialog(): void {
  resetForm()
  showForm.value = true
}

function openEditDialog(hw: TeacherHomework): void {
  editingId.value = hw.id
  formSubject.value = hw.subject
  formTitle.value = hw.title
  formContent.value = hw.content ?? ''
  formAssign.value = hw.assignDate
  formDue.value = hw.dueDate
  showForm.value = true
}

function closeForm(): void {
  showForm.value = false
  editingId.value = null
}

const formValid = computed(
  () => !!formTitle.value.trim() && !!formAssign.value && !!formDue.value && formAssign.value <= formDue.value
)

async function saveForm(): Promise<void> {
  if (!formValid.value) return
  const payload = {
    subject: formSubject.value.trim(),
    title: formTitle.value.trim(),
    content: formContent.value.trim() || undefined,
    assignDate: formAssign.value,
    dueDate: formDue.value
  }
  if (editingId.value) {
    const orig = b.value?.homeworks.find((h) => h.id === editingId.value)
    if (!orig) return
    const updated: TeacherHomework = {
      ...orig,
      ...payload,
      content: payload.content
    }
    await store.updateHomework(updated)
    toast.success('作业已更新')
  } else {
    await store.addHomework(payload)
    toast.success('作业已创建，已为每位同学生成未交记录')
  }
  closeForm()
  currentPage.value = 1
}

// ---------- 详情弹框（未交名单） ----------
const showDetail = ref(false)
const detailId = ref('')
const detailHw = computed<TeacherHomework | undefined>(() =>
  b.value?.homeworks.find((h) => h.id === detailId.value)
)
const detailCounts = computed(() =>
  detailHw.value ? countMisses(detailHw.value.misses) : { pending: 0, submitted: 0, madeup: 0 }
)
// 详情列表按提交状态排序：未交(pending) 排最前，其次已交、已补交，便于优先处理未交同学
const STATUS_SORT_ORDER: Record<HomeworkMissStatus, number> = { pending: 0, submitted: 1, madeup: 2 }
const detailMissesSorted = computed<TeacherHomeworkMiss[]>(() => {
  const list = detailHw.value?.misses ?? []
  return [...list].sort((a, b) => STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status])
})

function openDetail(hw: TeacherHomework): void {
  detailId.value = hw.id
  showDetail.value = true
}

watch(
  () => b.value?.homeworks,
  () => {
    // 切换班级后当前详情作业可能已不存在，自动关闭避免悬空
    if (showDetail.value && !detailHw.value) showDetail.value = false
  }
)

async function onRemove(hw: TeacherHomework): Promise<void> {
  if (!(await showConfirm(`删除作业「${hw.subject || ''} ${hw.title}」？未交名单将一并删除。`))) return
  await store.removeHomework(hw.id)
  toast.success('作业已删除')
  if (detailId.value === hw.id) showDetail.value = false
  currentPage.value = 1
}

async function onExportMisses(): Promise<void> {
  if (!detailId.value) return
  await store.exportMissesExcel(detailId.value)
  toast.success('未交名单已导出')
}

// ---------- 标记已补交（弹小窗填时间/备注） ----------
const showMark = ref(false)
const markMissId = ref('')
const markMadeUpAt = ref('')
const markNote = ref('')

function openMark(miss: TeacherHomeworkMiss): void {
  markMissId.value = miss.id
  markMadeUpAt.value = ''
  markNote.value = ''
  showMark.value = true
}

function closeMark(): void {
  showMark.value = false
  markMissId.value = ''
}

async function saveMark(): Promise<void> {
  if (!detailId.value || !markMissId.value) return
  await store.markMadeup(detailId.value, markMissId.value, {
    madeUpAt: markMadeUpAt.value || undefined,
    note: markNote.value.trim() || undefined
  })
  toast.success('已标记为补交')
  closeMark()
}

function statusMeta(status: HomeworkMissStatus) {
  return HOMEWORK_MISS_STATUS_META.find((m) => m.key === status) ?? HOMEWORK_MISS_STATUS_META[0]
}

async function onSubmit(miss: TeacherHomeworkMiss): Promise<void> {
  if (!detailId.value) return
  await store.markSubmitted(detailId.value, miss.id)
  toast.success('已标记为已交')
}

async function onPending(miss: TeacherHomeworkMiss): Promise<void> {
  if (!detailId.value) return
  await store.markPending(detailId.value, miss.id)
  toast.success('已标记为未交')
}
</script>

<template>
  <div class="hw-shell">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">作业记录</h3>
        <p class="tw-subtitle">
          布置作业后自动为每位同学生成「未交」记录；老师可手动标记「已交」「已补交」或撤销回「未交」，已补交可补填时间/备注。支持导出未交名单 Excel。
        </p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn tw-btn-primary" data-testid="hw-add-btn" @click="openAddDialog">
          <Icon name="plus" :size="14" /> 新建作业
        </button>
      </div>
    </div>

    <!-- 统计卡 -->
    <div class="hw-stats">
      <div class="tw-stat">
        <div class="tw-stat-value">{{ stats.homeworkCount }}</div>
        <div class="tw-stat-label">作业数</div>
      </div>
      <div class="tw-stat" style="--tw-accent: #ef4444">
        <div class="tw-stat-value">{{ stats.pending }}</div>
        <div class="tw-stat-label">未交（人次）</div>
      </div>
      <div class="tw-stat" style="--tw-accent: #10b981">
        <div class="tw-stat-value">{{ stats.submitted }}</div>
        <div class="tw-stat-label">已交（人次）</div>
      </div>
      <div class="tw-stat" style="--tw-accent: #3b82f6">
        <div class="tw-stat-value">{{ stats.madeup }}</div>
        <div class="tw-stat-label">已补交（人次）</div>
      </div>
    </div>

    <div class="hw-main">
      <div class="ewt-table-toolbar is-split">
        <div class="hw-toolbar-left">
          <span class="hw-count">共 {{ homeworks.length }} 次作业</span>
        </div>
        <ViewModeToggle v-if="homeworks.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
      </div>

      <div v-if="homeworks.length === 0" class="empty-state" data-testid="hw-empty">
        <p>还没有作业记录，点右上角「新建作业」开始吧。</p>
      </div>

      <template v-else>
        <!-- 列表视图 -->
        <div v-if="vm.mode === 'list'" class="hw-list-area">
          <el-table class="ewt-table" :data="pageItems" stripe border size="default" style="width: 100%" empty-text="还没有作业记录">
            <el-table-column type="index" label="序号" width="70" align="center" class-name="ewt-index-col" :index="(i: number) => (currentPage - 1) * pageSize + i + 1" />
            <el-table-column label="学科" width="110" align="center">
              <template #default="{ row }">
                <span class="hw-subject-badge">{{ row.subject || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="标题" min-width="160" align="left" show-overflow-tooltip>
              <template #default="{ row }">
                <span style="font-weight: 600;">{{ row.title }}</span>
              </template>
            </el-table-column>
            <el-table-column label="布置日" width="120" align="center">
              <template #default="{ row }">{{ row.assignDate || '—' }}</template>
            </el-table-column>
            <el-table-column label="截止日" width="120" align="center">
              <template #default="{ row }">{{ row.dueDate || '—' }}</template>
            </el-table-column>
            <el-table-column label="未交/已交/已补交" width="170" align="center">
              <template #default="{ row }">
                <span class="hw-miss-badge is-danger">{{ row.misses.filter((m: TeacherHomeworkMiss) => m.status === 'pending').length }} 未交</span>
                <span class="hw-miss-badge is-ok">{{ row.misses.filter((m: TeacherHomeworkMiss) => m.status === 'submitted').length }} 已交</span>
                <span class="hw-miss-badge is-info">{{ row.misses.filter((m: TeacherHomeworkMiss) => m.status === 'madeup').length }} 补交</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" class-name="ewt-op-col" width="200" align="center" fixed="right">
              <template #default="{ row }">
                <button class="btn-detail" :data-testid="`hw-detail-${row.id}`" @click="openDetail(row)">详情</button>
                <button class="btn-edit" :data-testid="`hw-edit-${row.id}`" @click="openEditDialog(row)">编辑</button>
                <button class="btn-delete" :data-testid="`hw-del-${row.id}`" @click="onRemove(row)">删除</button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 卡片视图 -->
        <div v-else class="hw-list">
          <div
            v-for="hw in pageItems"
            :key="hw.id"
            class="hw-card"
            :data-testid="`hw-card-${hw.id}`"
          >
            <div class="hw-card-head">
              <span class="hw-subject-badge">{{ hw.subject || '—' }}</span>
              <span class="hw-card-title" :title="hw.title">{{ hw.title }}</span>
            </div>
            <div class="hw-card-dates">{{ hw.assignDate }} → {{ hw.dueDate }}</div>
            <div class="hw-card-misses">
              <span class="hw-miss-badge is-danger">{{ hw.misses.filter((m) => m.status === 'pending').length }} 未交</span>
              <span class="hw-miss-badge is-ok">{{ hw.misses.filter((m) => m.status === 'submitted').length }} 已交</span>
              <span class="hw-miss-badge is-info">{{ hw.misses.filter((m) => m.status === 'madeup').length }} 补交</span>
            </div>
            <div class="hw-card-foot">
              <el-button size="small" class="hw-detail-btn" :data-testid="`hw-detail-${hw.id}`" @click="openDetail(hw)">详情</el-button>
              <el-button size="small" class="hw-edit-btn" :data-testid="`hw-edit-${hw.id}`" @click="openEditDialog(hw)">编辑</el-button>
              <el-button size="small" class="hw-del-btn" :data-testid="`hw-del-${hw.id}`" @click="onRemove(hw)">删除</el-button>
            </div>
          </div>
        </div>

        <!-- 分页 -->
        <div v-if="homeworks.length > 0" class="hw-list-pager ewt-pager">
          <el-pagination
            v-model:current-page="currentPage"
            @size-change="currentPage = 1"
            v-model:page-size="pageSize"
            :page-sizes="PAGE_SIZES"
            layout="total, prev, pager, next, jumper"
            :total="homeworks.length"
            background
            small
            prev-text="上一页"
            next-text="下一页"
          />
        </div>
      </template>
    </div>

    <!-- 新建 / 编辑弹框 -->
    <el-dialog
      v-model="showForm"
      :title="editingId !== null ? '编辑作业' : '新建作业'"
      width="560px"
      data-testid="hw-form-dialog"
      @close="closeForm"
    >
      <div class="hw-dialog-body">
        <div class="hw-form-row">
          <label class="hw-form-label">学科</label>
          <SubjectSelect v-model="formSubject" placeholder="请选择学科" data-testid="hw-form-subject" />
        </div>
        <div class="hw-form-row">
          <label class="hw-form-label">标题 <span class="hw-required">*</span></label>
          <el-input v-model="formTitle" :maxlength="100" placeholder="如：第3课 练习题" data-testid="hw-form-title" />
        </div>
        <div class="hw-form-row">
          <label class="hw-form-label">作业要求 / 描述</label>
          <el-input
            v-model="formContent"
            type="textarea"
            :rows="3"
            placeholder="选填，作业具体内容、范围等"
            data-testid="hw-form-content"
          />
        </div>
        <div class="hw-form-row hw-form-inline">
          <div class="hw-form-col">
            <label class="hw-form-label">布置日 <span class="hw-required">*</span></label>
            <input v-model="formAssign" type="date" class="tw-input tw-input-sm" data-testid="hw-form-assign" />
          </div>
          <div class="hw-form-col">
            <label class="hw-form-label">截止日 <span class="hw-required">*</span></label>
            <input v-model="formDue" type="date" class="tw-input tw-input-sm" data-testid="hw-form-due" />
          </div>
        </div>
        <p v-if="formAssign && formDue && formAssign > formDue" class="tw-note tw-note-warn">布置日不能晚于截止日</p>
        <p v-else-if="!formTitle.trim()" class="tw-note">填写「标题」后可保存</p>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="closeForm">取消</el-button>
          <el-button type="primary" data-testid="hw-form-save" :disabled="!formValid" @click="saveForm">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 详情弹框：未交名单 -->
    <el-dialog
      v-model="showDetail"
      title="作业记录"
      width="80%"
      data-testid="hw-detail-dialog"
      @close="showDetail = false"
    >
      <div v-if="detailHw" class="hw-detail">
        <div class="hw-detail-meta">
          <div class="hw-detail-line">
            <span class="hw-subject-badge">{{ detailHw.subject || '—' }}</span>
            <strong class="hw-detail-title">{{ detailHw.title }}</strong>
          </div>
          <div class="hw-detail-sub">
            <span>布置日：{{ detailHw.assignDate }}</span>
            <span>截止日：{{ detailHw.dueDate }}</span>
            <span class="hw-miss-badge is-danger">未交 {{ detailCounts.pending }}</span>
            <span class="hw-miss-badge is-ok">已交 {{ detailCounts.submitted }}</span>
            <span class="hw-miss-badge is-info">已补交 {{ detailCounts.madeup }}</span>
          </div>
          <p v-if="detailHw.content" class="hw-detail-content">{{ detailHw.content }}</p>
        </div>

        <div class="ewt-table-toolbar is-split">
          <div class="hw-toolbar-left">
            <span class="hw-count">共 {{ detailHw.misses.length }} 条记录</span>
          </div>
          <button type="button" class="tw-btn tw-btn-sm" data-testid="hw-export" @click="onExportMisses">
            <Icon name="document" :size="14" /> 导出 Excel<span class="hw-export-hint">（未交）</span>
          </button>
        </div>

        <div v-if="detailHw.misses.length === 0" class="empty-state">
          <p>班级还没有学生，未生成未交记录。请先在「学生信息」中添加学生。</p>
        </div>
        <div v-else class="hw-miss-area">
          <el-table class="ewt-table" :data="detailMissesSorted" stripe border size="default" style="width: 100%">
            <el-table-column type="index" label="序号" width="70" align="center" class-name="ewt-index-col" />
            <el-table-column label="学号" width="110" align="center" show-overflow-tooltip>
              <template #default="{ row }">{{ row.studentNo || '—' }}</template>
            </el-table-column>
            <el-table-column label="姓名" min-width="100" align="center">
              <template #default="{ row }">{{ row.studentName }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <span class="hw-tag" :class="`is-${statusMeta(row.status).tone}`">{{ statusMeta(row.status).label }}</span>
              </template>
            </el-table-column>
            <el-table-column label="补交时间" min-width="120" align="center" show-overflow-tooltip>
              <template #default="{ row }">{{ row.madeUpAt || '—' }}</template>
            </el-table-column>
            <el-table-column label="备注" min-width="120" align="left" show-overflow-tooltip>
              <template #default="{ row }">{{ row.note || '—' }}</template>
            </el-table-column>
            <el-table-column label="操作" class-name="ewt-op-col" width="240" align="center" fixed="right">
              <template #default="{ row }">
                <button
                  v-if="row.status !== 'madeup'"
                  class="btn-madeup"
                  :data-testid="`hw-mark-${row.id}`"
                  @click="openMark(row)"
                >已补交</button>
                <button
                  v-if="row.status !== 'submitted'"
                  class="btn-submit"
                  :data-testid="`hw-submit-${row.id}`"
                  @click="onSubmit(row)"
                >已交</button>
                <button
                  v-if="row.status !== 'pending'"
                  class="btn-pending"
                  :data-testid="`hw-pending-${row.id}`"
                  @click="onPending(row)"
                >未交</button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="showDetail = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 标记已补交弹窗 -->
    <el-dialog
      v-model="showMark"
      title="已补交"
      width="420px"
      data-testid="hw-mark-dialog"
      @close="closeMark"
    >
      <div class="hw-dialog-body">
        <div class="hw-form-row">
          <label class="hw-form-label">补交时间（可选，留空手填）</label>
          <input v-model="markMadeUpAt" type="date" class="tw-input tw-input-sm" data-testid="hw-mark-date" />
        </div>
        <div class="hw-form-row">
          <label class="hw-form-label">备注（可选）</label>
          <el-input v-model="markNote" :maxlength="200" placeholder="如：周一带回" data-testid="hw-mark-note" />
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="closeMark">取消</el-button>
          <el-button type="primary" data-testid="hw-mark-save" @click="saveMark">确认</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.hw-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hw-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.hw-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hw-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hw-count {
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}

/* ===== 列表/卡片双视图 ===== */
.hw-list-area {
  width: 100%;
}
.hw-list-area :deep(.el-table) {
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.hw-list-area :deep(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #64748b);
  font-weight: 600;
}
:deep(html.dark) .hw-list-area .el-table th.el-table__cell {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-soft, #d1d5db);
}

.hw-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.hw-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 120px;
}
.hw-card:hover {
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.35);
}
.hw-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hw-card-title {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.hw-card-dates {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}
.hw-card-misses {
  display: flex;
  gap: 6px;
}
.hw-card-foot {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin-top: auto;
}
.hw-detail-btn { color: var(--color-link, #3b82f6); }
.hw-edit-btn { color: var(--color-text-secondary, #64748b); }
.hw-del-btn { color: #ef4444; }

/* ===== 分页 ===== */
.hw-list-pager {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
}
:deep(html.dark) .hw-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  color: var(--color-text-soft, #6b7280);
  font-size: 14px;
}

/* ===== 学科/状态徽标 ===== */
.hw-subject-badge {
  padding: 2px 8px;
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  color: var(--color-primary, #3b82f6);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.hw-miss-badge {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  margin: 0 2px;
}
.hw-miss-badge.is-danger { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
.hw-miss-badge.is-ok { background: rgba(16, 185, 129, 0.12); color: #10b981; }
.hw-miss-badge.is-info { background: rgba(59, 130, 246, 0.12); color: #3b82f6; }

/* ===== 表格内按钮（与 StudentMistakes 一致） ===== */
.btn-detail,
.btn-edit,
.btn-delete,
.btn-madeup,
.btn-submit,
.btn-pending {
  padding: 5px 12px;
  font-size: 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
}
.btn-detail {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  color: var(--color-link, #3b82f6);
}
.btn-detail:hover { background: rgba(59, 130, 246, 0.18); }
.btn-edit {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  color: var(--color-link, #3b82f6);
}
.btn-edit:hover { background: rgba(59, 130, 246, 0.18); }
.btn-delete {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}
.btn-delete:hover { background: rgba(239, 68, 68, 0.18); }
.btn-madeup {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  color: #3b82f6;
}
.btn-madeup:hover { background: rgba(59, 130, 246, 0.18); }
.btn-submit {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
  color: #10b981;
}
.btn-submit:hover { background: rgba(16, 185, 129, 0.18); }
.btn-pending {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}
.btn-pending:hover { background: rgba(239, 68, 68, 0.18); }

.hw-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: #fff;
}
.hw-tag.is-danger { background-color: #ef4444; }
.hw-tag.is-ok { background-color: #10b981; }
.hw-tag.is-info { background-color: #3b82f6; }

/* ===== 弹框 ===== */
.hw-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hw-form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hw-form-row.hw-form-inline {
  flex-direction: row;
  gap: 12px;
}
.hw-form-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.hw-form-label {
  font-size: 13px;
  font-weight: 600;
}
.hw-required {
  color: #ef4444;
}

/* ===== 详情 ===== */
.hw-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hw-detail-meta {
  background: var(--color-bg-hover, #f8fafc);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hw-detail-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hw-detail-title {
  font-size: 15px;
}
.hw-detail-sub {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}
.hw-detail-content {
  font-size: 13px;
  color: var(--color-text, #334155);
  white-space: pre-wrap;
}
.hw-export-hint {
  font-size: 11px;
  opacity: 0.7;
  margin-left: 2px;
}
.hw-miss-area :deep(.el-table) {
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}

@media (max-width: 768px) {
  .hw-list {
    grid-template-columns: 1fr;
  }
  .hw-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hw-form-row.hw-form-inline {
    flex-direction: column;
  }
}

@media (max-width: 480px) {
  .hw-shell :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 92vw;
  }
}
</style>
