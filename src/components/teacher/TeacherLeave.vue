<script setup lang="ts">
// 请假信息（班主任专属）：登记 → 审批 → 销假 → 统计 → 导出。
// 数据挂在班级桶 leaves[]（学期×班级隔离），计算全部走 teacherCore 纯函数，store 只做读写。
// 布局 / 样式沿用 teacher.css 的 tw-* 公共类，与「奖励记录」「值日生表」保持一致。

import { computed, ref, watch } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import { diffDays, sortedLeaves, sortedStudents, todayStr } from '@/composables/teacherCore'
import {
  type LeaveRecord,
  type LeaveStatus,
  type LeaveType,
  LEAVE_STATUS_META,
  LEAVE_TYPES
} from '@/types/teacher'

const store = useTeacherStore()

const b = computed(() => store.bucket)
const students = computed(() => sortedStudents(b.value?.students ?? []))
const nameOf = (id: string): string => students.value.find((s) => s.id === id)?.name ?? '（已删除）'
const teacherName = computed(() => store.data?.teacher?.name ?? '')

// ---------- 列表 + 筛选 ----------
const keyword = ref('')
const statusFilter = ref<'all' | LeaveStatus>('all')
const typeFilter = ref<'all' | LeaveType>('all')

const leaves = computed<LeaveRecord[]>(() => sortedLeaves(b.value?.leaves ?? []))

const filtered = computed<LeaveRecord[]>(() => {
  const k = keyword.value.trim()
  return leaves.value.filter((l) => {
    if (statusFilter.value !== 'all' && l.status !== statusFilter.value) return false
    if (typeFilter.value !== 'all' && l.type !== typeFilter.value) return false
    if (!k) return true
    return `${nameOf(l.studentId)}${l.reason}${l.applicant}${l.approver}`.includes(k)
  })
})

const stats = computed(() => store.leaveSummary)
const statusLabel = (s: LeaveStatus): string => LEAVE_STATUS_META.find((x) => x.key === s)?.label ?? s
const statusTone = (s: LeaveStatus): string => LEAVE_STATUS_META.find((x) => x.key === s)?.tone ?? 'info'

// ---------- 新增 / 编辑 ----------
const editingId = ref('')
const formStudentId = ref('')
const formType = ref<LeaveType>('事假')
const formStart = ref(todayStr())
const formEnd = ref(todayStr())
const formDays = ref(1)
const formReason = ref('')
const formApplicant = ref('')
const formApprover = ref(teacherName.value)
const formStatus = ref<LeaveStatus>('pending')
const formRemark = ref('')

function resetForm(): void {
  editingId.value = ''
  formStudentId.value = students.value[0]?.id ?? ''
  formType.value = '事假'
  formStart.value = todayStr()
  formEnd.value = todayStr()
  formDays.value = 1
  formReason.value = ''
  formApplicant.value = ''
  formApprover.value = teacherName.value
  formStatus.value = 'pending'
  formRemark.value = ''
}

// 起止日期变化时自动重算天数（手动改过也会被覆盖，保证与日期一致）
watch([formStart, formEnd], ([s, e]) => {
  formDays.value = diffDays(s, e) || 1
})

watch(
  () => students.value.map((s) => s.id).join(','),
  () => {
    if (!students.value.some((s) => s.id === formStudentId.value)) {
      formStudentId.value = students.value[0]?.id ?? ''
    }
  },
  { immediate: true }
)

resetForm()

const dateValid = computed(() => !!formStart.value && !!formEnd.value && formStart.value <= formEnd.value)
const canSubmit = computed(
  () => !!formStudentId.value && dateValid.value && formDays.value > 0 && !!formReason.value.trim()
)

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) return
  const payload = {
    studentId: formStudentId.value,
    type: formType.value,
    startDate: formStart.value,
    endDate: formEnd.value,
    days: Math.max(1, Math.round(formDays.value)),
    reason: formReason.value.trim(),
    applicant: formApplicant.value.trim(),
    approver: formApprover.value.trim(),
    status: formStatus.value,
    remark: formRemark.value.trim()
  }
  if (editingId.value) {
    await store.updateLeave({ ...payload, id: editingId.value, createdAt: todayStr() })
  } else {
    await store.addLeave(payload)
  }
  resetForm()
}

function onEdit(r: LeaveRecord): void {
  editingId.value = r.id
  formStudentId.value = r.studentId
  formType.value = r.type
  formStart.value = r.startDate
  formEnd.value = r.endDate
  formDays.value = r.days || 1
  formReason.value = r.reason
  formApplicant.value = r.applicant
  formApprover.value = r.approver
  formStatus.value = r.status
  formRemark.value = r.remark
}

async function onRemove(r: LeaveRecord): Promise<void> {
  if (!window.confirm(`删除「${nameOf(r.studentId)}」${r.startDate} 起的${r.type}记录？`)) return
  await store.removeLeave(r.id)
  if (editingId.value === r.id) resetForm()
}

/** 状态流转：批准 / 不批准 / 销假（销假时把日期写入备注） */
async function onChangeStatus(r: LeaveRecord, status: LeaveStatus): Promise<void> {
  if (status === 'closed') {
    const remark = window.prompt('销假备注（可留空）', r.remark) ?? r.remark
    await store.setLeaveStatus(r.id, status, remark)
    return
  }
  await store.setLeaveStatus(r.id, status)
}

// ---------- 导出 ----------
function exportPrint(): void {
  window.print()
}

function exportCsv(): void {
  const head = ['学生', '类型', '开始日期', '结束日期', '天数', '事由', '申请人', '审批人', '状态', '备注']
  const rows = filtered.value.map((l) => [
    nameOf(l.studentId),
    l.type,
    l.startDate,
    l.endDate,
    String(l.days),
    l.reason,
    l.applicant,
    l.approver,
    statusLabel(l.status),
    l.remark
  ])
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`
  const csv = [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  // 带 BOM，保证 Excel 打开中文不乱码
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `请假记录-${todayStr()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">请假信息</h3>
        <p class="tw-subtitle">
          登记学生请假并完成审批 / 销假；数据按「学期 + 班级」独立保存，仅班主任可见。
        </p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn" :disabled="!filtered.length" @click="exportPrint">打印</button>
        <button type="button" class="tw-btn" :disabled="!filtered.length" @click="exportCsv">导出 CSV</button>
      </div>
    </div>

    <!-- 统计卡 -->
    <div class="tw-stat-grid lv-stats">
      <div class="tw-stat" style="--tw-accent: #f59e0b">
        <div class="tw-stat-value">{{ stats.ongoing }}</div>
        <div class="tw-stat-label">正在请假（人）</div>
      </div>
      <div class="tw-stat" style="--tw-accent: #3b82f6">
        <div class="tw-stat-value">{{ stats.monthCount }}</div>
        <div class="tw-stat-label">本月请假（人次）</div>
      </div>
      <div class="tw-stat" style="--tw-accent: #8b5cf6">
        <div class="tw-stat-value">{{ stats.monthDays }}</div>
        <div class="tw-stat-label">本月累计（天）</div>
      </div>
      <div class="tw-stat" style="--tw-accent: #ef4444">
        <div class="tw-stat-value">{{ stats.pending }}</div>
        <div class="tw-stat-label">待审批（条）</div>
      </div>
    </div>

    <!-- 类型分布 -->
    <div class="tw-card">
      <h4 class="tw-card-title">类型分布（全量）</h4>
      <div class="lv-types">
        <div v-for="t in stats.byType" :key="t.type" class="lv-type">
          <span class="lv-type-name">{{ t.type }}</span>
          <span class="lv-type-bar">
            <i :style="{ width: `${Math.round((t.count / Math.max(1, leaves.length)) * 100)}%` }"></i>
          </span>
          <span class="lv-type-count">{{ t.count }}</span>
        </div>
      </div>
    </div>

    <!-- 登记表单 -->
    <div class="tw-card tw-no-print">
      <h4 class="tw-card-title">{{ editingId ? '编辑请假记录' : '登记请假' }}</h4>
      <div class="lv-form">
        <label class="tw-label">
          学生
          <el-select v-model="formStudentId" size="small">
            <el-option v-for="s in students" :key="s.id" :value="s.id" :label="`${s.no} ${s.name}`" />
          </el-select>
        </label>
        <label class="tw-label">
          类型
          <el-select v-model="formType" size="small">
            <el-option v-for="t in LEAVE_TYPES" :key="t" :value="t" :label="t" />
          </el-select>
        </label>
        <label class="tw-label">
          开始日期
          <el-date-picker v-model="formStart" type="date" size="small" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width: 100%" :clearable="false" />
        </label>
        <label class="tw-label">
          结束日期
          <el-date-picker v-model="formEnd" type="date" size="small" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width: 100%" :clearable="false" />
        </label>
        <label class="tw-label">
          天数
          <el-input v-model.number="formDays" type="number" size="small" min="1" class="lv-days" />
        </label>
        <label class="tw-label">
          状态
          <el-select v-model="formStatus" size="small">
            <el-option v-for="s in LEAVE_STATUS_META" :key="s.key" :value="s.key" :label="s.label" />
          </el-select>
        </label>
        <label class="tw-label lv-span">
          请假事由
          <el-input v-model="formReason" size="small" placeholder="如：感冒发烧，需在家休息" />
        </label>
        <label class="tw-label">
          申请人
          <el-input v-model="formApplicant" size="small" placeholder="如：张三妈妈" />
        </label>
        <label class="tw-label">
          审批人
          <el-input v-model="formApprover" size="small" placeholder="班主任" />
        </label>
      </div>
      <el-input v-model="formRemark" type="textarea" class="lv-textarea" :rows="2" placeholder="备注（销假情况、补充说明）" />
      <div class="tw-toolbar">
        <span v-if="!dateValid" class="tw-note tw-note-warn">开始日期不能晚于结束日期</span>
        <span v-else-if="!formReason.trim()" class="tw-note">填写「请假事由」后可保存</span>
        <span class="tw-spacer"></span>
        <button type="button" class="tw-btn tw-btn-primary" :disabled="!canSubmit" @click="onSubmit">
          {{ editingId ? '保存修改' : '添加记录' }}
        </button>
        <button v-if="editingId" type="button" class="tw-btn" @click="resetForm">取消</button>
      </div>
    </div>

    <!-- 列表 -->
    <div class="tw-card">
      <h4 class="tw-card-title">请假记录（{{ filtered.length }}）</h4>
      <div class="tw-toolbar tw-no-print lv-filters">
        <el-input v-model="keyword" size="small" placeholder="搜索姓名 / 事由 / 申请人" />
        <el-select v-model="statusFilter" size="small">
          <el-option value="all" label="全部状态" />
          <el-option v-for="s in LEAVE_STATUS_META" :key="s.key" :value="s.key" :label="s.label" />
        </el-select>
        <el-select v-model="typeFilter" size="small">
          <el-option value="all" label="全部类型" />
          <el-option v-for="t in LEAVE_TYPES" :key="t" :value="t" :label="t" />
        </el-select>
      </div>

      <div v-if="filtered.length" class="tw-table-wrap">
        <table class="tw-table lv-table">
          <thead>
            <tr>
              <th class="tw-col-index">序号</th>
              <th>学生</th>
              <th>类型</th>
              <th>起止日期</th>
              <th>天数</th>
              <th>事由</th>
              <th>申请人</th>
              <th>状态</th>
              <th class="tw-no-print">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in filtered" :key="r.id">
              <td class="tw-col-index" data-label="序号">{{ i + 1 }}</td>
              <td data-label="学生">{{ nameOf(r.studentId) }}</td>
              <td data-label="类型">{{ r.type }}</td>
              <td data-label="起止日期">{{ r.startDate }} ~ {{ r.endDate }}</td>
              <td data-label="天数" class="tw-num">{{ r.days }}</td>
              <td data-label="事由">{{ r.reason }}</td>
              <td data-label="申请人">{{ r.applicant || '-' }}</td>
              <td data-label="状态">
                <span class="lv-tag" :class="`is-${statusTone(r.status)}`">{{ statusLabel(r.status) }}</span>
              </td>
              <td data-label="操作" class="tw-no-print">
                <div class="lv-ops">
                  <button type="button" class="tw-btn tw-btn-sm" @click="onEdit(r)">编辑</button>
                  <button
                    v-if="r.status === 'pending'"
                    type="button"
                    class="tw-btn tw-btn-sm tw-btn-primary"
                    @click="onChangeStatus(r, 'approved')"
                  >批准</button>
                  <button
                    v-if="r.status === 'pending'"
                    type="button"
                    class="tw-btn tw-btn-sm"
                    @click="onChangeStatus(r, 'rejected')"
                  >不批准</button>
                  <button
                    v-if="r.status === 'approved'"
                    type="button"
                    class="tw-btn tw-btn-sm"
                    @click="onChangeStatus(r, 'closed')"
                  >销假</button>
                  <button type="button" class="tw-btn tw-btn-sm tw-btn-danger" @click="onRemove(r)">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="tw-empty">
        {{ students.length ? '还没有符合条件的请假记录。' : '请先在「学生信息」中添加学生，再来登记请假。' }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.lv-stats {
  margin-bottom: var(--space-4, 16px);
}

.lv-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.lv-form .lv-span {
  grid-column: 1 / -1;
}

.lv-days {
  max-width: 90px;
}

.lv-textarea {
  margin-top: 10px;
  width: 100%;
  resize: vertical;
}

.lv-filters {
  margin-bottom: 10px;
}

/* 状态标签：四色语义，与统计卡主色一致 */
.lv-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: #fff;
  white-space: nowrap;
}

.lv-tag.is-warn { background-color: #f59e0b; }
.lv-tag.is-info { background-color: #3b82f6; }
.lv-tag.is-danger { background-color: #ef4444; }
.lv-tag.is-ok { background-color: #10b981; }

.lv-ops {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* 类型分布条 */
.lv-types {
  display: grid;
  gap: 6px;
}

.lv-type {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.lv-type-name {
  color: var(--color-text-secondary, #64748b);
}

.lv-type-bar {
  height: 8px;
  border-radius: 999px;
  background-color: var(--color-bg-input, #f1f5f9);
  overflow: hidden;
}

.lv-type-bar i {
  display: block;
  height: 100%;
  background-color: var(--color-primary, #3b82f6);
}

.lv-type-count {
  text-align: right;
  color: var(--color-text-secondary, #64748b);
}

/* 移动端：表格转卡片流（表头隐藏，单元格前置字段名） */
@media (max-width: 768px) {
  .lv-table thead {
    display: none;
  }

  .lv-table tbody tr {
    display: block;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 12px;
    padding: 10px;
    margin-bottom: 10px;
  }

  .lv-table tbody td {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    border-bottom: none;
    padding: 4px 0;
    text-align: right;
  }

  .lv-table tbody td::before {
    content: attr(data-label);
    color: var(--color-text-secondary, #64748b);
    font-size: 12px;
    flex: 0 0 auto;
  }

  .lv-ops .tw-btn {
    min-height: 44px;
  }
}
</style>
