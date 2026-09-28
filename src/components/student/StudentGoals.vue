<script setup lang="ts">
// 学生工作台学习目标面板
// 布局：工具条 + 统计卡 + 学科/状态筛选 + 表格/卡片双视图 + 分页 + 新增/编辑弹框
// 数据：useStudentGoalsStore（独立 IDB store 'student_goals'，严格隔离）

import { computed, onMounted, ref, watch } from 'vue'
import { showConfirm } from '@/utils/dialog'
import { useViewMode } from '@/composables/useViewMode'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'
import { useStudentGoalsStore } from '@/stores/studentGoals'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import type { StudentGoal, StudentGoalType } from '@/types'
import Icon from '@/components/Icon.vue'
import StudentToolbar from '@/components/student/StudentToolbar.vue'
import { usePageSize } from '@/composables/usePageSize'

const store = useStudentGoalsStore()
const toast = useToast()
const vm = useViewMode()
const today = localToday()

// ===== 筛选 =====
const activeSubject = ref<string>('all')
const activeStatus = ref<'all' | 'active' | 'completed' | 'overdue' | 'abandoned'>('all')

const subjectTabs = computed<{ key: string; label: string }[]>(() => {
  const set = new Set<string>()
  store.entries.forEach(g => set.add(g.subject))
  return [{ key: 'all', label: '全部' }, ...[...set].map(s => ({ key: s, label: s }))]
})

const STATUS_TABS: { key: 'all' | 'active' | 'completed' | 'overdue' | 'abandoned'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'overdue', label: '已逾期' },
  { key: 'abandoned', label: '已放弃' }
]

const viewEntries = computed<StudentGoal[]>(() => {
  const bySubject = store.filterBySubject(activeSubject.value)
  if (activeStatus.value === 'all') return bySubject
  return bySubject.filter(g => store.goalStatus(g) === activeStatus.value)
})

// ===== 分页 =====
const LIST_PAGE_SIZE = 10
const { pageSize, PAGE_SIZES } = usePageSize('sg-list-pager', LIST_PAGE_SIZE)
const listPage = ref(1)
const listPageItems = computed<StudentGoal[]>(() => {
  const start = (listPage.value - 1) * pageSize.value
  return viewEntries.value.slice(start, start + pageSize.value)
})

watch([activeSubject, activeStatus], () => goto(1))
function goto(page: number): void {
  listPage.value = page
}

// ===== 统计 =====
const stats = computed(() => store.stats())

// ===== 类型标签 =====
const TYPE_LABELS: Record<StudentGoalType, string> = {
  score: '分数',
  count: '数量',
  days: '天数',
  custom: '自定义'
}
function typeLabel(t: StudentGoalType): string {
  return TYPE_LABELS[t] ?? '自定义'
}

// ===== 进度颜色 =====
function progressColor(p: number): string {
  if (p >= 100) return '#10b981'
  if (p >= 71) return '#3b82f6'
  if (p >= 31) return '#f59e0b'
  return '#ef4444'
}

function statusLabel(s: string): string {
  return s === 'completed' ? '已完成' : s === 'abandoned' ? '已放弃' : s === 'overdue' ? '已逾期' : '进行中'
}
function statusClass(s: string): string {
  return s === 'completed' ? 'sg-badge-completed' : s === 'abandoned' ? 'sg-badge-abandoned' : s === 'overdue' ? 'sg-badge-overdue' : 'sg-badge-active'
}
function leftText(deadline?: string): string {
  if (!deadline) return '无截止'
  const d = Math.round((new Date(deadline).getTime() - new Date(today).getTime()) / 86400000)
  if (d > 0) return `剩余 ${d} 天`
  if (d === 0) return '今天截止'
  return `超期 ${Math.abs(d)} 天`
}

function cardFields(row: StudentGoal) {
  return [
    { label: '学科', value: row.subject },
    { label: '类型', value: typeLabel(row.goalType) },
    { label: '目标', value: `${row.targetValue} ${row.unit}` },
    { label: '当前', value: `${row.currentValue} ${row.unit}` },
    { label: '进度', value: store.goalProgress(row) + '%' },
    { label: '截止', value: row.deadline ?? '—' },
    { label: '状态', value: statusLabel(store.goalStatus(row)) },
    { label: '备注', value: row.note ?? '—' }
  ]
}

// ===== 错误提示 =====
const GOAL_ERROR_MESSAGES: Record<string, string> = {
  empty: '名称不能为空',
  'invalid-number': '目标值/当前值需为非负数',
  'deadline-past': '截止日期不能早于今天',
  'not-found': '目标不存在'
}
function goalErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(GOAL_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

// ===== 新增/编辑弹框 =====
const showEditDialog = ref(false)
const editingId = ref<string | null>(null)
const dialogName = ref('')
const dialogSubject = ref('数学')
const dialogGoalType = ref<StudentGoalType>('score')
const dialogTarget = ref<number>(100)
const dialogCurrent = ref<number>(0)
const dialogUnit = ref('分')
const dialogDeadline = ref('')
const dialogNote = ref('')

const SUBJECT_OPTIONS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治', '其他']

function openAddDialog(): void {
  editingId.value = null
  dialogName.value = ''
  dialogSubject.value = '数学'
  dialogGoalType.value = 'score'
  dialogTarget.value = 100
  dialogCurrent.value = 0
  dialogUnit.value = '分'
  dialogDeadline.value = ''
  dialogNote.value = ''
  showEditDialog.value = true
}

function openEditDialog(id: string): void {
  const g = store.entries.find(x => x.id === id)
  if (!g) return
  editingId.value = g.id
  dialogName.value = g.name
  dialogSubject.value = g.subject
  dialogGoalType.value = g.goalType
  dialogTarget.value = g.targetValue
  dialogCurrent.value = g.currentValue
  dialogUnit.value = g.unit
  dialogDeadline.value = g.deadline ?? ''
  dialogNote.value = g.note ?? ''
  showEditDialog.value = true
}

function closeEditDialog(): void {
  showEditDialog.value = false
  editingId.value = null
}

async function saveEditDialog(): Promise<void> {
  const name = dialogName.value.trim()
  if (editingId.value !== null) {
    const result = await store.updateGoal(editingId.value, {
      name,
      subject: dialogSubject.value,
      goalType: dialogGoalType.value,
      targetValue: dialogTarget.value,
      currentValue: dialogCurrent.value,
      unit: dialogUnit.value,
      deadline: dialogDeadline.value,
      note: dialogNote.value
    })
    goalErrorToast(result)
    if (!result.ok) return
  } else {
    const result = await store.addGoal({
      name,
      subject: dialogSubject.value,
      goalType: dialogGoalType.value,
      targetValue: dialogTarget.value,
      currentValue: dialogCurrent.value,
      unit: dialogUnit.value,
      deadline: dialogDeadline.value,
      note: dialogNote.value
    })
    goalErrorToast(result)
    if (!result.ok) return
  }
  toast.success(editingId.value !== null ? '目标已更新' : '目标已新增')
  closeEditDialog()
  listPage.value = 1
}

async function handleDelete(id: string): Promise<void> {
  if (!await showConfirm('确定删除该学习目标？')) return
  await store.deleteGoal(id)
  toast.success('已删除')
  listPage.value = 1
}

async function handleComplete(id: string): Promise<void> {
  const result = await store.completeGoal(id)
  goalErrorToast(result)
}
async function handleAbandon(id: string, abandoned: boolean): Promise<void> {
  const result = abandoned ? await store.reactivate(id) : await store.abandonGoal(id)
  goalErrorToast(result)
}

onMounted(() => {
  store.loadGoals()
})
</script>

<template>
  <div class="sg-shell">
    <StudentToolbar title="学习目标">
      <el-button type="primary" size="small" class="sg-add-btn" data-testid="sg-add-btn" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增目标
      </el-button>
      <ViewModeToggle :mode="vm.mode" @toggle="vm.toggle" />
    </StudentToolbar>

    <div class="sg-stats">
      <div class="sg-stat-card">
        <div class="sg-stat-label">进行中</div>
        <div class="sg-stat-value">{{ stats.active }}</div>
      </div>
      <div class="sg-stat-card">
        <div class="sg-stat-label">已完成</div>
        <div class="sg-stat-value">{{ stats.completed }}</div>
      </div>
      <div class="sg-stat-card">
        <div class="sg-stat-label">已逾期</div>
        <div class="sg-stat-value">{{ stats.overdue }}</div>
      </div>
      <div class="sg-stat-card">
        <div class="sg-stat-label">总计</div>
        <div class="sg-stat-value">{{ stats.total }}</div>
      </div>
    </div>

    <div class="sg-filters">
      <el-radio-group v-model="activeSubject" class="sg-subject-tabs" size="small">
        <el-radio-button
          v-for="tab in subjectTabs"
          :key="tab.key"
          :value="tab.key"
          :data-testid="`sg-subject-${tab.key}`"
        >{{ tab.label }}</el-radio-button>
      </el-radio-group>
      <el-radio-group v-model="activeStatus" class="sg-status-tabs" size="small">
        <el-radio-button
          v-for="tab in STATUS_TABS"
          :key="tab.key"
          :value="tab.key"
          :data-testid="`sg-status-${tab.key}`"
        >{{ tab.label }}</el-radio-button>
      </el-radio-group>
    </div>

    <div class="sg-main">
      <div v-if="store.entries.length === 0" class="empty-state" data-testid="sg-empty">
        <p>还没有学习目标，点上方「新增目标」开始吧</p>
      </div>
      <template v-else>
        <div class="ewt-table-toolbar is-split">
          <span class="sg-count">共 {{ viewEntries.length }} 条</span>
        </div>
        <div class="sg-list">
          <el-table v-if="vm.mode === 'list'" class="ewt-table"
            :data="listPageItems"
            stripe border size="default"
            style="width: 100%" height="100%"
            empty-text="没有符合条件的目标"
          >
            <el-table-column label="学科" width="90" align="center">
              <template #default="{ row }">
                <span class="sg-subject-tag">{{ row.subject }}</span>
              </template>
            </el-table-column>
            <el-table-column label="目标名称" min-width="160" align="left" show-overflow-tooltip>
              <template #default="{ row }">
                <span style="font-weight: 600">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="80" align="center">
              <template #default="{ row }">{{ typeLabel(row.goalType) }}</template>
            </el-table-column>
            <el-table-column label="目标值" width="100" align="center">
              <template #default="{ row }">{{ row.targetValue }} {{ row.unit }}</template>
            </el-table-column>
            <el-table-column label="当前值" width="100" align="center">
              <template #default="{ row }">{{ row.currentValue }} {{ row.unit }}</template>
            </el-table-column>
            <el-table-column label="进度" width="160" align="center">
              <template #default="{ row }">
                <div class="sg-progress-cell">
                  <div class="sg-progress-bar">
                    <div class="sg-progress-fill" :style="{ width: `${store.goalProgress(row)}%`, backgroundColor: progressColor(store.goalProgress(row)) }"></div>
                  </div>
                  <span class="sg-progress-text">{{ store.goalProgress(row) }}%</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="截止" width="120" align="center">
              <template #default="{ row }">
                <span :class="{ 'sg-overdue-text': store.goalStatus(row) === 'overdue' }">{{ row.deadline ?? '—' }}</span>
                <div class="sg-left-text" :class="{ 'sg-overdue-text': store.goalStatus(row) === 'overdue' }">{{ leftText(row.deadline) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <span class="sg-badge" :class="statusClass(store.goalStatus(row))">{{ statusLabel(store.goalStatus(row)) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" class-name="ewt-op-col" width="230" align="center" fixed="right">
              <template #default="{ row }">
                <button class="btn-edit" :data-testid="`sg-edit-${row.id}`" @click="openEditDialog(row.id)">编辑</button>
                <button v-if="store.goalStatus(row) !== 'completed'" class="btn-done" :data-testid="`sg-complete-${row.id}`" @click="handleComplete(row.id)">完成</button>
                <button v-else class="btn-edit" :data-testid="`sg-reactivate-${row.id}`" @click="handleAbandon(row.id, true)">激活</button>
                <button v-if="store.goalStatus(row) !== 'abandoned'" class="btn-warn" :data-testid="`sg-abandon-${row.id}`" @click="handleAbandon(row.id, false)">放弃</button>
                <button v-else class="btn-edit" :data-testid="`sg-reactivate2-${row.id}`" @click="handleAbandon(row.id, true)">激活</button>
                <button class="btn-delete" :data-testid="`sg-del-${row.id}`" @click="handleDelete(row.id)">删除</button>
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="ewt-card-grid">
            <RecordsCard
              @edit="openEditDialog(item.id)"
              v-for="item in listPageItems"
              :key="item.id"
              :fields="cardFields(item)"
            >
            </RecordsCard>
          </div>
        </div>

        <div v-if="viewEntries.length > 0" class="sg-list-pager ewt-pager">
          <el-pagination
            v-model:current-page="listPage"
            @size-change="listPage = 1"
            v-model:page-size="pageSize"
            :page-sizes="PAGE_SIZES"
            layout="total, prev, pager, next, jumper"
            :total="viewEntries.length"
            background small
            prev-text="上一页" next-text="下一页"
          />
        </div>
      </template>
    </div>

    <el-dialog
      v-model="showEditDialog"
      :title="editingId !== null ? '编辑目标' : '新增目标'"
      width="480px"
      class="sg-dialog"
      @close="closeEditDialog"
    >
      <div class="dialog-body">
        <div class="sg-field">
          <label>目标名称 *</label>
          <el-input v-model="dialogName" maxlength="50" placeholder="如：期末数学冲 90 分" data-testid="sg-form-name" />
        </div>
        <div class="sg-field-row">
          <div class="sg-field">
            <label>学科</label>
            <el-select v-model="dialogSubject" data-testid="sg-form-subject" style="width:100%">
              <el-option v-for="s in SUBJECT_OPTIONS" :key="s" :value="s" :label="s" />
            </el-select>
          </div>
          <div class="sg-field">
            <label>目标类型</label>
            <el-select v-model="dialogGoalType" data-testid="sg-form-type" style="width:100%">
              <el-option value="score" label="分数" />
              <el-option value="count" label="数量" />
              <el-option value="days" label="天数" />
              <el-option value="custom" label="自定义" />
            </el-select>
          </div>
        </div>
        <div class="sg-field-row">
          <div class="sg-field">
            <label>目标值</label>
            <el-input-number v-model="dialogTarget" :min="0" :max="1000000" :step="1" data-testid="sg-form-target" style="width:100%" />
          </div>
          <div class="sg-field">
            <label>当前值</label>
            <el-input-number v-model="dialogCurrent" :min="0" :max="1000000" :step="1" data-testid="sg-form-current" style="width:100%" />
          </div>
        </div>
        <div class="sg-field-row">
          <div class="sg-field">
            <label>单位</label>
            <el-input v-model="dialogUnit" maxlength="10" placeholder="分/个/天" data-testid="sg-form-unit" />
          </div>
          <div class="sg-field">
            <label>截止日期</label>
            <el-input v-model="dialogDeadline" type="date" data-testid="sg-form-deadline" />
          </div>
        </div>
        <div class="sg-field">
          <label>备注</label>
          <el-input v-model="dialogNote" type="textarea" :rows="2" maxlength="200" placeholder="选填" data-testid="sg-form-note" />
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="closeEditDialog">取消</el-button>
          <el-button type="primary" data-testid="sg-form-save" @click="saveEditDialog">
            {{ editingId !== null ? '保存' : '新增' }}
          </el-button>
          <el-button v-if="editingId" type="danger" data-testid="sg-form-delete" @click="handleDelete(editingId)">删除</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sg-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 12px;
  padding: 16px;
}
.sg-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 0 4px;
  flex-shrink: 0;
}
.sg-stat-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 8px 10px;
  text-align: center;
}
.sg-stat-label { font-size: 12px; color: var(--color-text-secondary, #6b7280); }
.sg-stat-value { font-size: 18px; font-weight: 600; margin-top: 2px; }
.sg-filters {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 0 4px;
  flex-shrink: 0;
}
.sg-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sg-count { font-size: 12px; color: var(--color-text-secondary, #6b7280); }

.sg-list {
  flex: 1 1 auto;
  min-height: 240px;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.sg-list > :global(.el-table) {
  flex: 1 1 auto;
  min-height: 220px;
  width: 100% !important;
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.sg-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.sg-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .sg-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .sg-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.sg-subject-tag {
  display: inline-flex;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  background: var(--color-primary-soft, #e9f0ff);
  color: var(--color-primary, #5b8def);
}
.sg-progress-cell { display: flex; align-items: center; gap: 8px; }
.sg-progress-bar {
  flex: 1; height: 6px;
  background: var(--color-hover, #f3f4f6);
  border-radius: 4px; overflow: hidden; min-width: 50px;
}
.sg-progress-fill { height: 100%; transition: width 0.3s, background-color 0.3s; }
.sg-progress-text { font-size: 12px; color: var(--color-text-secondary, #6b7280); white-space: nowrap; width: 36px; text-align: right; }
.sg-left-text { font-size: 11px; color: var(--color-text-secondary, #9ca3af); margin-top: 2px; }
.sg-overdue-text { color: #e0a800 !important; }
.sg-badge {
  display: inline-flex; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 600;
}
.sg-badge-active { background: var(--color-primary-soft, #e9f0ff); color: var(--color-primary, #5b8def); }
.sg-badge-completed { background: rgba(16,185,129,0.12); color: #10b981; }
.sg-badge-overdue { background: #fdf3d8; color: #d97706; }
.sg-badge-abandoned { background: rgba(239,68,68,0.12); color: #ef4444; }

.sg-list-pager {
  flex: 0 0 auto;
  padding: 14px 16px 18px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  margin: 0 0 8px;
  display: flex; justify-content: center; align-items: center;
}
:global(html.dark) .sg-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}

.btn-edit, .btn-delete, .btn-done, .btn-warn {
  padding: 5px 10px; font-size: 12px;
  border: 1px solid transparent; border-radius: 6px;
  cursor: pointer; font-weight: 500; line-height: 1.5; white-space: nowrap;
  margin: 0 2px;
}
.btn-edit { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.3); color: #3b82f6; }
.btn-done { background: rgba(16,185,129,0.12); border-color: rgba(16,185,129,0.3); color: #10b981; }
.btn-warn { background: rgba(224,168,0,0.12); border-color: rgba(224,168,0,0.3); color: #d97706; }
.btn-delete { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ef4444; }

.dialog-body { display: flex; flex-direction: column; gap: 12px; }
.sg-field { display: flex; flex-direction: column; gap: 4px; }
.sg-field label { font-size: 13px; color: var(--color-text-secondary, #6b7280); }
.sg-field-row { display: flex; gap: 12px; }
.sg-field-row .sg-field { flex: 1; }

@media (max-width: 768px) {
  .sg-shell { padding: 12px; }
  .sg-stats { grid-template-columns: repeat(2, 1fr); }
  .sg-field-row { flex-direction: column; }
}
@media (max-width: 480px) {
  .sg-dialog :deep(.el-dialog) { width: 92vw !important; max-width: 92vw; }
}
</style>
