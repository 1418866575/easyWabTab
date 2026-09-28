<script setup lang="ts">
// 家校谈话记录（班主任专属）：新建/编辑/删除谈话 → 列表+卡片双视图 + 筛选 + 统计 + 导出 Excel。
// 数据挂在班级桶 talks[]（学期×班级隔离），计算走 teacherCore 纯函数，store 只做读写。
// 布局 / 交互对齐 TeacherHomework：双视图 + el-pagination + el-dialog(ewt-dialog-footer) + showConfirm/useToast。

import { computed, ref, watch } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import { useViewMode } from '@/composables/useViewMode'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'
import Icon from '@/components/Icon.vue'
import { showConfirm } from '@/utils/dialog'
import { useToast } from '@/composables/useToast'
import { usePageSize } from '@/composables/usePageSize'
import type { HomeSchoolTalkRecord } from '@/types/teacher'
import { TALK_MODES, TALK_CATEGORIES, TALK_COUNTERPARTS } from '@/types/teacher'

const store = useTeacherStore()
const vm = useViewMode()
const toast = useToast()

const b = computed(() => store.bucket)
const students = computed(() => b.value?.students ?? [])

function studentLabel(s: { no: string; name: string }): string {
  return `${s.no}. ${s.name}`
}
function studentMeta(id: string): { name: string; no?: string } {
  const s = students.value.find((x) => x.id === id)
  return { name: s?.name ?? '', no: s?.no }
}

// ---------- 全部谈话（按日期倒序，同日按创建时间倒序） ----------
const allTalks = computed<HomeSchoolTalkRecord[]>(() =>
  [...(b.value?.talks ?? [])].sort((a, c) => {
    if (a.date !== c.date) return a.date < c.date ? 1 : -1
    return a.createdAt < c.createdAt ? 1 : -1
  })
)

// ---------- 筛选 ----------
const filterStudent = ref('')
const filterMode = ref('')
const filterCategory = ref('')
const filterFollowUp = ref<'all' | 'yes' | 'no'>('all')
const filterRange = ref<'all' | '30d' | 'month'>('all')
const keyword = ref('')

const filteredTalks = computed<HomeSchoolTalkRecord[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000
  return allTalks.value.filter((t) => {
    if (filterStudent.value && t.studentId !== filterStudent.value) return false
    if (filterMode.value && t.mode !== filterMode.value) return false
    if (filterCategory.value && t.category !== filterCategory.value) return false
    if (filterFollowUp.value === 'yes' && !t.needFollowUp) return false
    if (filterFollowUp.value === 'no' && t.needFollowUp) return false
    if (filterRange.value === 'month' && !(t.date && t.date.startsWith(ym))) return false
    if (filterRange.value === '30d' && t.createdAt < cutoff) return false
    if (kw) {
      const hay = `${t.content} ${t.counterpartName ?? ''} ${t.studentName}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

const hasFilter = computed(
  () =>
    !!filterStudent.value ||
    !!filterMode.value ||
    !!filterCategory.value ||
    filterFollowUp.value !== 'all' ||
    filterRange.value !== 'all' ||
    !!keyword.value.trim()
)

const stats = computed(() => store.talksSummary)

// ---------- 分页 ----------
const LIST_PAGE_SIZE = 10
const { pageSize, PAGE_SIZES } = usePageSize('teacher-talks-pager', LIST_PAGE_SIZE)
const currentPage = ref(1)
const pageItems = computed<HomeSchoolTalkRecord[]>(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredTalks.value.slice(start, start + pageSize.value)
})
watch(
  () => [filteredTalks.value.length, pageSize.value],
  () => {
    const max = Math.max(1, Math.ceil(filteredTalks.value.length / pageSize.value))
    if (currentPage.value > max) currentPage.value = max
  }
)
function resetFilters(): void {
  filterStudent.value = ''
  filterMode.value = ''
  filterCategory.value = ''
  filterFollowUp.value = 'all'
  filterRange.value = 'all'
  keyword.value = ''
  currentPage.value = 1
}

// ---------- 新建 / 编辑弹框 ----------
const showForm = ref(false)
const editingId = ref<string | null>(null)
const formStudentId = ref('')
const formDate = ref('')
const formTime = ref('')
const formMode = ref('')
const formCounterpart = ref('')
const formCounterpartName = ref('')
const formCategory = ref('')
const formContent = ref('')
const formResult = ref('')
const formNeedFollowUp = ref(false)
const formFollowUpNote = ref('')

function todayLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function resetForm(): void {
  editingId.value = null
  formStudentId.value = ''
  formDate.value = todayLocal()
  formTime.value = ''
  formMode.value = ''
  formCounterpart.value = ''
  formCounterpartName.value = ''
  formCategory.value = ''
  formContent.value = ''
  formResult.value = ''
  formNeedFollowUp.value = false
  formFollowUpNote.value = ''
}

function openAddDialog(): void {
  resetForm()
  showForm.value = true
}

function openEditDialog(t: HomeSchoolTalkRecord): void {
  editingId.value = t.id
  formStudentId.value = t.studentId
  formDate.value = t.date
  formTime.value = t.time ?? ''
  formMode.value = t.mode
  formCounterpart.value = t.counterpart
  formCounterpartName.value = t.counterpartName ?? ''
  formCategory.value = t.category
  formContent.value = t.content
  formResult.value = t.result ?? ''
  formNeedFollowUp.value = t.needFollowUp
  formFollowUpNote.value = t.followUpNote ?? ''
  showForm.value = true
}

function closeForm(): void {
  showForm.value = false
  editingId.value = null
}

const formValid = computed(() => !!formStudentId.value && !!formDate.value && !!formContent.value.trim())

async function saveForm(): Promise<void> {
  if (!formValid.value) return
  const meta = studentMeta(formStudentId.value)
  const payload = {
    studentId: formStudentId.value,
    studentName: meta.name,
    studentNo: meta.no || undefined,
    date: formDate.value,
    time: formTime.value.trim() || undefined,
    mode: formMode.value.trim() || '其他',
    counterpart: formCounterpart.value.trim() || '其他',
    counterpartName: formCounterpartName.value.trim() || undefined,
    category: formCategory.value.trim() || '其他',
    content: formContent.value.trim(),
    result: formResult.value.trim() || undefined,
    needFollowUp: formNeedFollowUp.value,
    followUpNote: formNeedFollowUp.value ? formFollowUpNote.value.trim() || undefined : undefined
  }
  if (editingId.value) {
    const orig = b.value?.talks.find((t) => t.id === editingId.value)
    if (!orig) return
    const updated: HomeSchoolTalkRecord = { ...orig, ...payload }
    await store.updateTalk(updated)
    toast.success('谈话记录已更新')
  } else {
    await store.addTalk(payload)
    toast.success('谈话记录已创建')
  }
  closeForm()
  currentPage.value = 1
}

// ---------- 详情弹框（完整内容） ----------
const showDetail = ref(false)
const detailId = ref('')
const detailTalk = computed<HomeSchoolTalkRecord | undefined>(() =>
  b.value?.talks.find((t) => t.id === detailId.value)
)
function openDetail(t: HomeSchoolTalkRecord): void {
  detailId.value = t.id
  showDetail.value = true
}
watch(
  () => b.value?.talks,
  () => {
    if (showDetail.value && !detailTalk.value) showDetail.value = false
  }
)

async function onRemove(t: HomeSchoolTalkRecord): Promise<void> {
  if (!(await showConfirm(`删除与「${t.studentName || '该学生'}」的谈话记录？此操作不可撤销。`))) return
  await store.removeTalk(t.id)
  toast.success('谈话记录已删除')
  if (detailId.value === t.id) showDetail.value = false
  currentPage.value = 1
}

async function onExport(): Promise<void> {
  await store.exportTalksExcel(filteredTalks.value)
  toast.success(`已导出 ${filteredTalks.value.length} 条谈话记录`)
}

function truncate(text: string, n = 30): string {
  return text.length > n ? text.slice(0, n) + '…' : text
}
</script>

<template>
  <div class="tk-shell">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">家校谈话</h3>
        <p class="tw-subtitle">
          把与家长的沟通（电话 / 微信 / 面谈 / 家访等）结构化记录，便于回溯、统计与跟进。班主任专属，按当前班级隔离。
        </p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn tw-btn-sm" data-testid="tk-export" @click="onExport">
          <Icon name="document" :size="14" /> 导出 Excel
        </button>
        <button type="button" class="tw-btn tw-btn-primary" data-testid="tk-add-btn" @click="openAddDialog">
          <Icon name="plus" :size="14" /> 新建谈话
        </button>
      </div>
    </div>

    <!-- 统计卡 -->
    <div class="tk-stats">
      <div class="tw-stat">
        <div class="tw-stat-value">{{ stats.total }}</div>
        <div class="tw-stat-label">谈话总数</div>
      </div>
      <div class="tw-stat" style="--tw-accent: #8b5cf6">
        <div class="tw-stat-value">{{ stats.thisMonth }}</div>
        <div class="tw-stat-label">本月次数</div>
      </div>
      <div class="tw-stat" style="--tw-accent: #ef4444">
        <div class="tw-stat-value">{{ stats.needFollowUp }}</div>
        <div class="tw-stat-label">待跟进</div>
      </div>
      <div class="tw-stat" style="--tw-accent: #10b981">
        <div class="tw-stat-value">{{ stats.categories }}</div>
        <div class="tw-stat-label">涉及分类</div>
      </div>
    </div>

    <!-- 筛选条 -->
    <div class="tk-filters">
      <div class="tk-filter">
        <label class="tk-filter-label">学生</label>
        <el-select v-model="filterStudent" clearable filterable placeholder="全部学生" size="small" class="tk-select" data-testid="tk-filter-student">
          <el-option v-for="s in students" :key="s.id" :label="studentLabel(s)" :value="s.id" />
        </el-select>
      </div>
      <div class="tk-filter">
        <label class="tk-filter-label">方式</label>
        <el-select v-model="filterMode" clearable filterable allow-create default-first-option placeholder="全部" size="small" class="tk-select" data-testid="tk-filter-mode">
          <el-option v-for="m in TALK_MODES" :key="m" :label="m" :value="m" />
        </el-select>
      </div>
      <div class="tk-filter">
        <label class="tk-filter-label">分类</label>
        <el-select v-model="filterCategory" clearable placeholder="全部" size="small" class="tk-select" data-testid="tk-filter-category">
          <el-option v-for="c in TALK_CATEGORIES" :key="c" :label="c" :value="c" />
        </el-select>
      </div>
      <div class="tk-filter">
        <label class="tk-filter-label">跟进</label>
        <el-select v-model="filterFollowUp" placeholder="全部" size="small" class="tk-select" data-testid="tk-filter-followup">
          <el-option label="全部" value="all" />
          <el-option label="待跟进" value="yes" />
          <el-option label="已处理" value="no" />
        </el-select>
      </div>
      <div class="tk-filter">
        <label class="tk-filter-label">时间</label>
        <el-select v-model="filterRange" placeholder="全部" size="small" class="tk-select" data-testid="tk-filter-range">
          <el-option label="全部" value="all" />
          <el-option label="近 30 天" value="30d" />
          <el-option label="本月" value="month" />
        </el-select>
      </div>
      <div class="tk-filter tk-filter-keyword">
        <label class="tk-filter-label">搜索</label>
        <input v-model="keyword" type="text" class="tw-input tw-input-sm" placeholder="内容 / 对方姓名" data-testid="tk-filter-keyword" />
      </div>
      <button v-if="hasFilter" type="button" class="tw-btn tw-btn-sm tk-reset" data-testid="tk-reset" @click="resetFilters">重置</button>
    </div>

    <div class="tk-main">
      <div class="ewt-table-toolbar is-split">
        <div class="tk-toolbar-left">
          <span class="tk-count">共 {{ filteredTalks.length }} 条记录</span>
        </div>
        <ViewModeToggle v-if="filteredTalks.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
      </div>

      <div v-if="filteredTalks.length === 0" class="empty-state" data-testid="tk-empty">
        <p>还没有家校谈话记录，点右上角「新建谈话」开始吧。</p>
      </div>

      <template v-else>
        <!-- 列表视图 -->
        <div v-if="vm.mode === 'list'" class="tk-list-area">
          <el-table class="ewt-table" :data="pageItems" stripe border size="default" style="width: 100%" empty-text="没有匹配的谈话记录">
            <el-table-column label="日期" width="120" align="center">
              <template #default="{ row }">
                <div>{{ row.date || '—' }}</div>
                <div v-if="row.time" class="tk-cell-time">{{ row.time }}</div>
              </template>
            </el-table-column>
            <el-table-column label="学生" min-width="100" align="center">
              <template #default="{ row }">
                <span style="font-weight: 600;">{{ row.studentName || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="方式" width="90" align="center">
              <template #default="{ row }"><span class="tk-mode-badge">{{ row.mode || '—' }}</span></template>
            </el-table-column>
            <el-table-column label="对象" min-width="100" align="center">
              <template #default="{ row }">
                <span>{{ row.counterpart }}</span>
                <span v-if="row.counterpartName" class="tk-cell-sub">（{{ row.counterpartName }}）</span>
              </template>
            </el-table-column>
            <el-table-column label="分类" width="100" align="center">
              <template #default="{ row }"><span class="tk-cat-badge">{{ row.category }}</span></template>
            </el-table-column>
            <el-table-column label="内容摘要" min-width="200" align="left" show-overflow-tooltip>
              <template #default="{ row }">{{ truncate(row.content) }}</template>
            </el-table-column>
            <el-table-column label="跟进" width="90" align="center">
              <template #default="{ row }">
                <span v-if="row.needFollowUp" class="tk-tag is-warn">待跟进</span>
                <span v-else class="tk-tag is-ok">已处理</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" class-name="ewt-op-col" width="200" align="center" fixed="right">
              <template #default="{ row }">
                <button class="btn-detail" :data-testid="`tk-detail-${row.id}`" @click="openDetail(row)">详情</button>
                <button class="btn-edit" :data-testid="`tk-edit-${row.id}`" @click="openEditDialog(row)">编辑</button>
                <button class="btn-delete" :data-testid="`tk-del-${row.id}`" @click="onRemove(row)">删除</button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 卡片视图 -->
        <div v-else class="tk-list">
          <div
            v-for="t in pageItems"
            :key="t.id"
            class="tk-card"
            :data-testid="`tk-card-${t.id}`"
          >
            <div class="tk-card-head">
              <span class="tk-card-student">{{ t.studentName || '—' }}</span>
              <span class="tk-mode-badge">{{ t.mode || '—' }}</span>
              <span v-if="t.needFollowUp" class="tk-tag is-warn">待跟进</span>
            </div>
            <div class="tk-card-sub">
              <span>{{ t.date }}</span>
              <span v-if="t.time"> {{ t.time }}</span>
              <span class="tk-cat-badge">{{ t.category }}</span>
            </div>
            <div class="tk-card-content">{{ truncate(t.content, 40) }}</div>
            <div class="tk-card-foot">
              <el-button size="small" class="tk-detail-btn" :data-testid="`tk-detail-${t.id}`" @click="openDetail(t)">详情</el-button>
              <el-button size="small" class="tk-edit-btn" :data-testid="`tk-edit-${t.id}`" @click="openEditDialog(t)">编辑</el-button>
              <el-button size="small" class="tk-del-btn" :data-testid="`tk-del-${t.id}`" @click="onRemove(t)">删除</el-button>
            </div>
          </div>
        </div>

        <!-- 分页 -->
        <div v-if="filteredTalks.length > 0" class="tk-list-pager ewt-pager">
          <el-pagination
            v-model:current-page="currentPage"
            @size-change="currentPage = 1"
            v-model:page-size="pageSize"
            :page-sizes="PAGE_SIZES"
            layout="total, prev, pager, next, jumper"
            :total="filteredTalks.length"
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
      :title="editingId !== null ? '编辑谈话记录' : '新建谈话记录'"
      width="600px"
      data-testid="tk-form-dialog"
      @close="closeForm"
    >
      <div class="tk-dialog-body">
        <div class="tk-form-row">
          <label class="tk-form-label">学生 <span class="tk-required">*</span></label>
          <el-select v-model="formStudentId" filterable placeholder="选择学生" class="tk-form-control" data-testid="tk-form-student">
            <el-option v-for="s in students" :key="s.id" :label="studentLabel(s)" :value="s.id" />
          </el-select>
        </div>
        <div class="tk-form-inline">
          <div class="tk-form-col">
            <label class="tk-form-label">谈话日期 <span class="tk-required">*</span></label>
            <input v-model="formDate" type="date" class="tw-input tw-input-sm" data-testid="tk-form-date" />
          </div>
          <div class="tk-form-col">
            <label class="tk-form-label">时间（选填）</label>
            <input v-model="formTime" type="time" class="tw-input tw-input-sm" data-testid="tk-form-time" />
          </div>
        </div>
        <div class="tk-form-inline">
          <div class="tk-form-col">
            <label class="tk-form-label">沟通方式</label>
            <el-select v-model="formMode" filterable allow-create default-first-option placeholder="如：电话" class="tk-form-control" data-testid="tk-form-mode">
              <el-option v-for="m in TALK_MODES" :key="m" :label="m" :value="m" />
            </el-select>
          </div>
          <div class="tk-form-col">
            <label class="tk-form-label">谈话对象</label>
            <el-select v-model="formCounterpart" filterable allow-create default-first-option placeholder="如：母亲" class="tk-form-control" data-testid="tk-form-counterpart">
              <el-option v-for="c in TALK_COUNTERPARTS" :key="c" :label="c" :value="c" />
            </el-select>
          </div>
        </div>
        <div class="tk-form-inline">
          <div class="tk-form-col">
            <label class="tk-form-label">对象姓名（选填）</label>
            <el-input v-model="formCounterpartName" :maxlength="40" placeholder="如：张伟（父亲姓名）" data-testid="tk-form-counterpart-name" />
          </div>
          <div class="tk-form-col">
            <label class="tk-form-label">主题分类</label>
            <el-select v-model="formCategory" placeholder="选择分类" class="tk-form-control" data-testid="tk-form-category">
              <el-option v-for="c in TALK_CATEGORIES" :key="c" :label="c" :value="c" />
            </el-select>
          </div>
        </div>
        <div class="tk-form-row">
          <label class="tk-form-label">谈话内容 <span class="tk-required">*</span></label>
          <el-input
            v-model="formContent"
            type="textarea"
            :rows="3"
            :maxlength="500"
            placeholder="记录沟通要点：事由、家长反馈、达成事项等"
            data-testid="tk-form-content"
          />
        </div>
        <div class="tk-form-row">
          <label class="tk-form-label">处理结论（选填）</label>
          <el-input
            v-model="formResult"
            type="textarea"
            :rows="2"
            :maxlength="300"
            placeholder="达成的共识 / 后续处理结论"
            data-testid="tk-form-result"
          />
        </div>
        <div class="tk-form-row tk-form-switch">
          <el-switch v-model="formNeedFollowUp" data-testid="tk-form-followup" />
          <label class="tk-form-label">需要后续跟进</label>
        </div>
        <div v-if="formNeedFollowUp" class="tk-form-row">
          <label class="tk-form-label">跟进事项（选填）</label>
          <el-input
            v-model="formFollowUpNote"
            type="textarea"
            :rows="2"
            :maxlength="300"
            placeholder="下次计划 / 待办事项"
            data-testid="tk-form-followup-note"
          />
        </div>
        <p v-if="!formStudentId" class="tw-note tw-note-warn">请先选择学生</p>
        <p v-else-if="!formDate" class="tw-note tw-note-warn">请填写谈话日期</p>
        <p v-else-if="!formContent.trim()" class="tw-note">填写「谈话内容」后可保存</p>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="closeForm">取消</el-button>
          <el-button type="primary" data-testid="tk-form-save" :disabled="!formValid" @click="saveForm">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 详情弹框 -->
    <el-dialog
      v-model="showDetail"
      title="谈话记录详情"
      width="600px"
      data-testid="tk-detail-dialog"
      @close="showDetail = false"
    >
      <div v-if="detailTalk" class="tk-detail">
        <div class="tk-detail-meta">
          <div class="tk-detail-line">
            <span class="tk-card-student">{{ detailTalk.studentName || '—' }}</span>
            <span class="tk-mode-badge">{{ detailTalk.mode }}</span>
            <span class="tk-cat-badge">{{ detailTalk.category }}</span>
            <span v-if="detailTalk.needFollowUp" class="tk-tag is-warn">待跟进</span>
            <span v-else class="tk-tag is-ok">已处理</span>
          </div>
          <div class="tk-detail-sub">
            <span>日期：{{ detailTalk.date }}<template v-if="detailTalk.time"> {{ detailTalk.time }}</template></span>
            <span>对象：{{ detailTalk.counterpart }}<template v-if="detailTalk.counterpartName">（{{ detailTalk.counterpartName }}）</template></span>
          </div>
        </div>
        <div class="tk-detail-block">
          <div class="tk-detail-title">谈话内容</div>
          <p class="tk-detail-text">{{ detailTalk.content }}</p>
        </div>
        <div v-if="detailTalk.result" class="tk-detail-block">
          <div class="tk-detail-title">处理结论</div>
          <p class="tk-detail-text">{{ detailTalk.result }}</p>
        </div>
        <div v-if="detailTalk.needFollowUp" class="tk-detail-block">
          <div class="tk-detail-title">跟进事项</div>
          <p class="tk-detail-text">{{ detailTalk.followUpNote || '（未填写）' }}</p>
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="showDetail = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tk-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tk-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.tk-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tk-filters {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: var(--color-bg-hover, #f8fafc);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
}
:deep(html.dark) .tk-filters {
  background: var(--color-bg-hover, #111827);
  border-color: var(--color-border, #374151);
}
.tk-filter {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tk-filter-label {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}
.tk-select {
  width: 140px;
}
.tk-filter-keyword .tw-input {
  width: 160px;
}
.tk-reset {
  margin-left: auto;
}

.tk-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tk-count {
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}

.tk-list-area {
  width: 100%;
}
.tk-list-area :deep(.el-table) {
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.tk-list-area :deep(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #64748b);
  font-weight: 600;
}
:deep(html.dark) .tk-list-area .el-table th.el-table__cell {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-soft, #d1d5db);
}
.tk-cell-time {
  font-size: 11px;
  color: var(--color-text-soft, #94a3b8);
}
.tk-cell-sub {
  font-size: 11px;
  color: var(--color-text-soft, #94a3b8);
}

.tk-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.tk-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 120px;
}
.tk-card:hover {
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.35);
}
.tk-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.tk-card-student {
  font-size: 14px;
  font-weight: 600;
}
.tk-card-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}
.tk-card-content {
  font-size: 13px;
  color: var(--color-text, #334155);
  white-space: pre-wrap;
  word-break: break-word;
}
.tk-card-foot {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin-top: auto;
}
.tk-detail-btn { color: var(--color-link, #3b82f6); }
.tk-edit-btn { color: var(--color-text-secondary, #64748b); }
.tk-del-btn { color: #ef4444; }

.tk-list-pager {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
}
:deep(html.dark) .tk-list-pager {
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

/* 徽标 / 标签 */
.tk-mode-badge,
.tk-cat-badge {
  padding: 2px 8px;
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  color: var(--color-primary, #3b82f6);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.tk-cat-badge {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}
.tk-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: #fff;
}
.tk-tag.is-warn { background-color: #f59e0b; }
.tk-tag.is-ok { background-color: #10b981; }

/* 表格内按钮 */
.btn-detail,
.btn-edit,
.btn-delete {
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

/* 弹框表单 */
.tk-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tk-form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tk-form-inline {
  display: flex;
  gap: 12px;
}
.tk-form-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.tk-form-control {
  width: 100%;
}
.tk-form-label {
  font-size: 13px;
  font-weight: 600;
}
.tk-required {
  color: #ef4444;
}
.tk-form-switch {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.tk-form-switch .tk-form-label {
  margin-bottom: 0;
}

/* 详情 */
.tk-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tk-detail-meta {
  background: var(--color-bg-hover, #f8fafc);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tk-detail-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tk-detail-sub {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}
.tk-detail-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tk-detail-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
}
.tk-detail-text {
  font-size: 13px;
  color: var(--color-text, #334155);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

@media (max-width: 768px) {
  .tk-list {
    grid-template-columns: 1fr;
  }
  .tk-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .tk-form-inline {
    flex-direction: column;
  }
  .tk-select,
  .tk-filter-keyword .tw-input {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .tk-shell :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 92vw;
  }
}
</style>
