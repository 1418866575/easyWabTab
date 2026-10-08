<script setup lang="ts">
// 班级小组（全员可见：班主任、科任都能用）：长期固定分组 + 活动临时分组 + 随机分组 + 分组快照。
// 数据挂在班级桶 groups[] / snapshots[]（学期×班级隔离），计算走 teacherCore 纯函数，store 只做读写。
// 布局 / 交互对齐其它教师面板：列表+卡片双视图 + el-pagination + el-dialog(ewt-dialog-footer) + showConfirm/useToast。

import { computed, nextTick, ref, watch } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import { useViewMode } from '@/composables/useViewMode'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'
import Icon from '@/components/Icon.vue'
import TeacherStatCard from '@/components/teacher/TeacherStatCard.vue'
import TeacherStudentPicker from '@/components/teacher/TeacherStudentPicker.vue'
import { showConfirm } from '@/utils/dialog'
import { useToast } from '@/composables/useToast'
import { avgScoreByStudent, generateGroups, sortedStudents, uid } from '@/composables/teacherCore'
import { usePageSize } from '@/composables/usePageSize'
import {
  type StudentGroup,
  type GroupingSnapshot,
  type GroupMode,
  type RemainderMode,
  type GroupMember,
  type Student,
  GROUP_ROLES
} from '@/types/teacher'

const store = useTeacherStore()
const vm = useViewMode()
const toast = useToast()
const b = computed(() => store.bucket)

const studentMap = computed<Map<string, Student>>(() => {
  const m = new Map<string, Student>()
  for (const s of store.bucket?.students ?? []) m.set(s.id, s)
  return m
})

// ---------- 过滤 / 分页 ----------
const keyword = ref('')
const typeFilter = ref<'all' | 'fixed' | 'temp'>('all')

const filteredGroups = computed<StudentGroup[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  return (b.value?.groups ?? []).filter((g) => {
    if (typeFilter.value !== 'all' && g.type !== typeFilter.value) return false
    if (!kw) return true
    if (g.name.toLowerCase().includes(kw)) return true
    if (g.description && g.description.toLowerCase().includes(kw)) return true
    return g.members.some((m) => studentMap.value.get(m.studentId)?.name.toLowerCase().includes(kw))
  })
})

const { pageSize, PAGE_SIZES } = usePageSize('teacher-groups-pager', 10)
const currentPage = ref(1)
const pageItems = computed<StudentGroup[]>(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredGroups.value.slice(start, start + pageSize.value)
})
watch(
  () => [filteredGroups.value.length, pageSize.value],
  () => {
    const max = Math.max(1, Math.ceil(filteredGroups.value.length / pageSize.value))
    if (currentPage.value > max) currentPage.value = max
  }
)

const stats = computed(() => store.groupSummary)

// ---------- 成员展示 ----------
interface DispMember {
  studentId: string
  role?: string
  student: Student | null
}
function memberList(g: StudentGroup): DispMember[] {
  return g.members.map((m) => ({ studentId: m.studentId, role: m.role, student: studentMap.value.get(m.studentId) ?? null }))
}
function visibleChips(g: StudentGroup, max = 12): { list: DispMember[]; overflow: number } {
  const all = memberList(g)
  return { list: all.slice(0, max), overflow: Math.max(0, all.length - max) }
}
function genderClass(g: '男' | '女'): string {
  return g === '男' ? 'is-boy' : 'is-girl'
}

// ---------- 新建 / 编辑小组弹框 ----------
const showForm = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formType = ref<'fixed' | 'temp'>('fixed')
const formDesc = ref('')
const formMembers = ref<string[]>([])
const formRoles = ref<Record<string, string>>({})

function resetForm(): void {
  editingId.value = null
  formName.value = ''
  formType.value = 'fixed'
  formDesc.value = ''
  formMembers.value = []
  formRoles.value = {}
}

function openAddDialog(): void {
  resetForm()
  showForm.value = true
}

function openEditDialog(g: StudentGroup): void {
  editingId.value = g.id
  formName.value = g.name
  formType.value = g.type
  formDesc.value = g.description ?? ''
  formMembers.value = g.members.map((m) => m.studentId)
  formRoles.value = {}
  for (const m of g.members) if (m.role) formRoles.value[m.studentId] = m.role
  showForm.value = true
}

function closeForm(): void {
  showForm.value = false
  editingId.value = null
}

const formValid = computed(() => !!formName.value.trim() && formMembers.value.length > 0)

async function saveForm(): Promise<void> {
  if (!formValid.value) return
  const members: GroupMember[] = formMembers.value.map((id) => ({
    studentId: id,
    role: formRoles.value[id] || undefined
  }))
  const now = new Date().toISOString().slice(0, 10)
  const group: StudentGroup = {
    id: editingId.value ?? uid('grp'),
    name: formName.value.trim(),
    type: formType.value,
    description: formDesc.value.trim() || undefined,
    members,
    createdAt: editingId.value ? (b.value?.groups.find((g) => g.id === editingId.value)?.createdAt ?? now) : now,
    updatedAt: now
  }
  if (editingId.value) await store.updateGroup(group)
  else await store.addGroup(group)
  toast.success(editingId.value ? '小组已更新' : '小组已创建')
  closeForm()
  currentPage.value = 1
}

/** 复制为临时组（保留成员与角色，类型转临时） */
async function duplicateAsTemp(g: StudentGroup): Promise<void> {
  const now = new Date().toISOString().slice(0, 10)
  const copy: StudentGroup = {
    id: uid('grp'),
    name: `${g.name}（副本）`,
    type: 'temp',
    description: g.description,
    members: g.members.map((m) => ({ studentId: m.studentId, role: m.role })),
    createdAt: now,
    updatedAt: now
  }
  await store.addGroup(copy)
  toast.success('已复制为临时组')
}

async function onRemove(g: StudentGroup): Promise<void> {
  if (!(await showConfirm(`删除小组「${g.name}」？该操作不可撤销。`))) return
  await store.removeGroup(g.id)
  toast.success('小组已删除')
  currentPage.value = 1
}

// ---------- 随机分组弹框 ----------
const showRandom = ref(false)
const rgMode = ref<GroupMode>('random')
const rgUsePerGroup = ref(false)
const rgGroupCount = ref(4)
const rgPerGroup = ref(6)
const rgGenderSplit = ref(false)
const rgRemainder = ref<RemainderMode>('rotate')
const rgLocks = ref<string[][]>([])
const rgSeparates = ref<string[][]>([])
const rgNamePrefix = ref('分组')

function openRandomDialog(): void {
  rgMode.value = 'random'
  rgUsePerGroup.value = false
  rgGroupCount.value = Math.max(2, Math.min(8, Math.ceil((store.bucket?.students.length ?? 0) / 6)))
  rgPerGroup.value = 6
  rgGenderSplit.value = false
  rgRemainder.value = 'rotate'
  rgLocks.value = [[]]
  rgSeparates.value = [[]]
  rgNamePrefix.value = '分组'
  showRandom.value = true
}

const rgScores = computed(() => avgScoreByStudent(store.bucket?.exams ?? []))
const rgPreview = computed(() => {
  const students = sortedStudents(store.bucket?.students ?? [])
  return generateGroups(
    students,
    {
      mode: rgMode.value,
      groupCount: rgUsePerGroup.value ? undefined : rgGroupCount.value,
      perGroup: rgUsePerGroup.value ? rgPerGroup.value : undefined,
      genderSplit: rgGenderSplit.value,
      remainder: rgRemainder.value,
      lockTogether: rgLocks.value.filter((g) => g.length > 0),
      separate: rgSeparates.value.filter((g) => g.length > 0)
    },
    rgScores.value
  )
})

// 各模式说明，辅助用户理解
const MODE_DESC: Record<GroupMode, string> = {
  random: '纯随机打乱后均分',
  gender: '按性别分配（可开启男女各自独立分组）',
  score_homo: '按成绩升序切块，水平相当者同组',
  score_hetero: '按成绩降序蛇形，高低均衡',
  order: '按学号顺序轮流均分',
  hetero: '性别 + 成绩综合均衡',
  boarding: '按住校 / 走读分桶（可开启各自独立）'
}
const scoreModes: GroupMode[] = ['score_homo', 'score_hetero', 'hetero']
const needsScore = computed(() => scoreModes.includes(rgMode.value))

function addLock(): void {
  rgLocks.value = [...rgLocks.value, []]
}
function addSeparate(): void {
  rgSeparates.value = [...rgSeparates.value, []]
}

async function saveRandomAsTemp(): Promise<void> {
  const { results, warns } = rgPreview.value
  if (results.length === 0) {
    toast.warning('暂无可保存的分组结果')
    return
  }
  const now = new Date().toISOString().slice(0, 10)
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const group: StudentGroup = {
      id: uid('grp'),
      name: `${rgNamePrefix.value || '分组'}-${r.groupName || `第${i + 1}组`}`,
      type: 'temp',
      members: r.memberIds.map((sid) => ({ studentId: sid })),
      createdAt: now,
      updatedAt: now
    }
    await store.addGroup(group)
  }
  if (warns.length) toast.warning(warns.join('；'))
  else toast.success(`已生成 ${results.length} 个临时小组`)
  showRandom.value = false
  currentPage.value = 1
}

async function saveRandomAsSnapshot(): Promise<void> {
  const { results, warns } = rgPreview.value
  if (results.length === 0) {
    toast.warning('暂无可保存的分组结果')
    return
  }
  const snapshot: GroupingSnapshot = {
    id: uid('snap'),
    name: rgNamePrefix.value || '分组快照',
    createdAt: new Date().toISOString().slice(0, 10),
    strategy: {
      mode: rgMode.value,
      groupCount: rgUsePerGroup.value ? undefined : rgGroupCount.value,
      perGroup: rgUsePerGroup.value ? rgPerGroup.value : undefined,
      genderSplit: rgGenderSplit.value,
      remainder: rgRemainder.value,
      lockTogether: rgLocks.value.filter((g) => g.length > 0),
      separate: rgSeparates.value.filter((g) => g.length > 0)
    },
    results: results.map((r) => ({ groupName: r.groupName, memberIds: r.memberIds }))
  }
  await store.saveSnapshot(snapshot)
  if (warns.length) toast.warning(warns.join('；'))
  else toast.success('分组已存为快照')
  showRandom.value = false
}

// ---------- 快照弹框 ----------
const showSnap = ref(false)
const snapRenameId = ref<string | null>(null)
const snapRenameName = ref('')

function openSnapDialog(): void {
  snapRenameId.value = null
  snapRenameName.value = ''
  showSnap.value = true
}

const snapshots = computed<GroupingSnapshot[]>(() =>
  [...(b.value?.snapshots ?? [])].sort((a, c) => (a.createdAt < c.createdAt ? 1 : -1))
)
function snapMemberTotal(s: GroupingSnapshot): number {
  return s.results.reduce((sum, r) => sum + r.memberIds.length, 0)
}

async function applySnap(s: GroupingSnapshot): Promise<void> {
  const n = await store.applySnapshot(s.id)
  toast.success(`已应用为 ${n} 个临时小组`)
  showSnap.value = false
  currentPage.value = 1
}

function startRename(s: GroupingSnapshot): void {
  snapRenameId.value = s.id
  snapRenameName.value = s.name
}
async function commitRename(): Promise<void> {
  if (!snapRenameId.value || !snapRenameName.value.trim()) return
  const snap = b.value?.snapshots.find((s) => s.id === snapRenameId.value)
  if (!snap) return
  const updated: GroupingSnapshot = { ...snap, name: snapRenameName.value.trim() }
  await store.saveSnapshot(updated)
  snapRenameId.value = null
  toast.success('快照已重命名')
}
function cancelRename(): void {
  snapRenameId.value = null
}

async function removeSnap(s: GroupingSnapshot): Promise<void> {
  if (!(await showConfirm(`删除快照「${s.name}」？`))) return
  await store.removeSnapshot(s.id)
  toast.success('快照已删除')
}

// ---------- 导出 / 复制 ----------
function buildMarkdown(groups: StudentGroup[]): string {
  const cls = store.cls ? `${store.cls.grade}${store.cls.name}` : '本班'
  let md = `# ${cls} 小组名单\n\n`
  for (const g of groups) {
    md += `## ${g.name}（${g.members.length} 人${g.type === 'fixed' ? ' · 固定' : ' · 临时'}）\n`
    if (g.description) md += `> ${g.description}\n\n`
    const list = memberList(g)
    list.forEach((m, i) => {
      md += `${i + 1}. ${m.student ? m.student.name : '（已移除）'}（${m.student ? m.student.gender : '—'}）${m.role ? ' · ' + m.role : ''}\n`
    })
    md += '\n'
  }
  return md
}

function downloadText(filename: string, text: string, mime = 'text/markdown'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportMarkdown(): void {
  if (filteredGroups.value.length === 0) {
    toast.warning('没有可导出的小组')
    return
  }
  const cls = store.cls ? `${store.cls.grade}${store.cls.name}` : '本班'
  downloadText(`${cls}-小组名单.md`, buildMarkdown(filteredGroups.value))
  toast.success('Markdown 已导出')
}

async function copyMarkdown(): Promise<void> {
  const md = buildMarkdown(filteredGroups.value)
  try {
    await navigator.clipboard.writeText(md)
    toast.success('名单已复制到剪贴板')
  } catch {
    toast.warning('复制失败，请手动导出文件')
  }
}

watch(showForm, (v) => {
  if (v) nextTick(() => {})
})
</script>

<template>
  <div class="grp-shell">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">班级小组</h3>
        <p class="tw-subtitle">
          维护长期固定分组与活动临时分组；支持随机分组、按性别 / 成绩 / 住校等策略，以及分组快照复用。成员以学号主键记录，重名不冲突。
        </p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn tw-btn-primary" data-testid="grp-add-btn" @click="openAddDialog">
          <Icon name="plus" :size="14" /> 新建小组
        </button>
      </div>
    </div>

    <!-- 统计卡 -->
    <div class="grp-stats">
      <TeacherStatCard :value="stats.total" label="小组数" accent="var(--color-primary, #3b82f6)" />
      <TeacherStatCard :value="stats.fixed" label="固定组" accent="#10b981" />
      <TeacherStatCard :value="stats.temp" label="临时组" accent="#f59e0b" />
      <TeacherStatCard :value="stats.members" label="覆盖人数" accent="#8b5cf6" />
    </div>

    <div class="grp-main">
      <!-- 操作工具栏（随机分组 / 分组快照 / 导出 / 复制）置于表格上方，确保长列表时始终可见可操作 -->
      <div class="grp-actions tw-no-print">
        <button type="button" class="tw-btn" data-testid="grp-random-btn" @click="openRandomDialog">
          <Icon name="dice" :size="14" /> 随机分组
        </button>
        <button type="button" class="tw-btn" data-testid="grp-snap-btn" @click="openSnapDialog">
          <Icon name="bookmark" :size="14" /> 分组快照（{{ snapshots.length }}）
        </button>
        <button type="button" class="tw-btn" data-testid="grp-export-btn" @click="exportMarkdown">
          <Icon name="download" :size="14" /> 导出 Markdown
        </button>
        <button type="button" class="tw-btn tw-btn-sm" data-testid="grp-copy-btn" @click="copyMarkdown">
          <Icon name="copy" :size="14" /> 复制
        </button>
      </div>

      <div class="ewt-table-toolbar is-split">
        <div class="grp-toolbar-left">
          <el-input v-model="keyword" size="small" class="grp-search" placeholder="搜索组名 / 成员" />
          <el-select v-model="typeFilter" size="small" data-testid="grp-type-filter">
            <el-option value="all" label="全部" />
            <el-option value="fixed" label="固定组" />
            <el-option value="temp" label="临时组" />
          </el-select>
          <span class="grp-count">共 {{ filteredGroups.length }} 个小组</span>
        </div>
        <ViewModeToggle v-if="filteredGroups.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
      </div>

      <div v-if="filteredGroups.length === 0" class="empty-state" data-testid="grp-empty">
        <p>还没有小组，点右上角「新建小组」或「随机分组」开始吧。</p>
      </div>

      <template v-else>
        <!-- 列表视图 -->
        <div v-if="vm.mode === 'list'" class="grp-list-area">
          <el-table class="ewt-table" :data="pageItems" stripe border size="default" style="width: 100%" empty-text="没有小组">
            <el-table-column type="index" label="序号" width="70" align="center" class-name="ewt-index-col" :index="(i: number) => (currentPage - 1) * pageSize + i + 1" />
            <el-table-column label="组名" min-width="140" align="left" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="grp-name">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="90" align="center">
              <template #default="{ row }">
                <span class="grp-type" :class="row.type === 'fixed' ? 'is-fixed' : 'is-temp'">
                  {{ row.type === 'fixed' ? '固定' : '临时' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="人数" width="80" align="center">
              <template #default="{ row }">{{ row.members.length }}</template>
            </el-table-column>
            <el-table-column label="成员" min-width="240" align="left">
              <template #default="{ row }">
                <span
                  v-for="m in visibleChips(row, 10).list"
                  :key="m.studentId"
                  class="tw-chip"
                  :class="m.student ? genderClass(m.student.gender) : 'is-removed'"
                >
                  {{ m.student ? m.student.name : '（已移除）' }}
                  <em v-if="m.role" class="tw-chip-role">{{ m.role }}</em>
                </span>
                <span v-if="visibleChips(row, 10).overflow > 0" class="grp-more">+{{ visibleChips(row, 10).overflow }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" class-name="ewt-op-col" width="240" align="center" fixed="right">
              <template #default="{ row }">
                <button class="btn-edit" :data-testid="`grp-edit-${row.id}`" @click="openEditDialog(row)">编辑</button>
                <button class="btn-copy" :data-testid="`grp-copy-${row.id}`" @click="duplicateAsTemp(row)">复制</button>
                <button class="btn-delete" :data-testid="`grp-del-${row.id}`" @click="onRemove(row)">删除</button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 卡片视图 -->
        <div v-else class="ewt-card-grid">
          <div
            v-for="g in pageItems"
            :key="g.id"
            class="grp-card"
            :data-testid="`grp-card-${g.id}`"
          >
            <div class="grp-card-head">
              <span class="grp-name">{{ g.name }}</span>
              <span class="grp-type" :class="g.type === 'fixed' ? 'is-fixed' : 'is-temp'">
                {{ g.type === 'fixed' ? '固定' : '临时' }}
              </span>
            </div>
            <div v-if="g.description" class="grp-card-desc">{{ g.description }}</div>
            <div class="grp-card-meta">{{ g.members.length }} 人</div>
            <div class="grp-card-members">
              <span
                v-for="m in memberList(g)"
                :key="m.studentId"
                class="tw-chip"
                :class="m.student ? genderClass(m.student.gender) : 'is-removed'"
                :title="m.student ? m.student.name : '已移除'"
              >
                {{ m.student ? m.student.name : '（已移除）' }}
                <em v-if="m.role" class="tw-chip-role">{{ m.role }}</em>
              </span>
            </div>
            <div class="grp-card-foot">
              <el-button size="small" class="grp-edit-btn" :data-testid="`grp-edit-${g.id}`" @click="openEditDialog(g)">编辑</el-button>
              <el-button size="small" class="grp-copy-btn" :data-testid="`grp-copy-${g.id}`" @click="duplicateAsTemp(g)">复制</el-button>
              <el-button size="small" class="grp-del-btn" :data-testid="`grp-del-${g.id}`" @click="onRemove(g)">删除</el-button>
            </div>
          </div>
        </div>

        <!-- 分页 -->
        <div v-if="filteredGroups.length > 0" class="grp-list-pager ewt-pager">
          <el-pagination
            v-model:current-page="currentPage"
            @size-change="currentPage = 1"
            v-model:page-size="pageSize"
            :page-sizes="PAGE_SIZES"
            layout="total, prev, pager, next, jumper"
            :total="filteredGroups.length"
            background
            small
            prev-text="上一页"
            next-text="下一页"
          />
        </div>
      </template>
    </div>

    <!-- 新建 / 编辑小组弹框 -->
    <el-dialog
      v-model="showForm"
      :title="editingId !== null ? '编辑小组' : '新建小组'"
      width="620px"
      destroy-on-close
      data-testid="grp-form-dialog"
      @close="closeForm"
    >
      <div class="grp-dialog-body">
        <div class="grp-form-row">
          <label class="grp-form-label">组名 <span class="grp-required">*</span></label>
          <el-input v-model="formName" :maxlength="40" placeholder="如：第一学习小组" data-testid="grp-form-name" />
        </div>
        <div class="grp-form-row grp-form-inline">
          <div class="grp-form-col">
            <label class="grp-form-label">类型 <span class="grp-required">*</span></label>
            <el-radio-group v-model="formType" data-testid="grp-form-type">
              <el-radio value="fixed">固定</el-radio>
              <el-radio value="temp">临时</el-radio>
            </el-radio-group>
          </div>
          <div class="grp-form-col">
            <label class="grp-form-label">描述（可选）</label>
            <el-input v-model="formDesc" :maxlength="80" placeholder="如：负责早读领读" />
          </div>
        </div>
        <div class="grp-form-row">
          <label class="grp-form-label">成员 <span class="grp-required">*</span>（{{ formMembers.length }} 人）</label>
          <TeacherStudentPicker v-model="formMembers" :students="store.bucket?.students ?? []" placeholder="搜索并勾选学生" />
        </div>
        <div v-if="formMembers.length > 0" class="grp-form-row">
          <label class="grp-form-label">组内角色（可选，仅组长等需指定）</label>
          <div class="grp-role-list">
            <div v-for="id in formMembers" :key="id" class="grp-role-item">
              <span class="grp-role-name">{{ studentMap.get(id)?.name || '（已移除）' }}</span>
              <el-select
                v-model="formRoles[id]"
                size="small"
                placeholder="未指定"
                filterable
                allow-create
                default-first-option
                class="grp-role-select"
              >
                <el-option v-for="r in GROUP_ROLES" :key="r" :label="r" :value="r" />
              </el-select>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="closeForm">取消</el-button>
          <el-button type="primary" data-testid="grp-form-save" :disabled="!formValid" @click="saveForm">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 随机分组弹框 -->
    <el-dialog
      v-model="showRandom"
      title="随机分组"
      width="92%"
      class="grp-random-dialog"
      destroy-on-close
      data-testid="grp-random-dialog"
      @close="showRandom = false"
    >
      <div class="grp-rg">
        <div class="grp-rg-left">
          <div class="grp-rg-row">
            <label class="grp-form-label">分组方式</label>
            <el-radio-group v-model="rgMode" data-testid="rg-mode">
              <el-radio-button value="random">随机</el-radio-button>
              <el-radio-button value="gender">按性别</el-radio-button>
              <el-radio-button value="order">按学号</el-radio-button>
              <el-radio-button value="boarding">按住校</el-radio-button>
              <el-radio-button value="score_homo">成绩同质</el-radio-button>
              <el-radio-button value="score_hetero">成绩异质</el-radio-button>
              <el-radio-button value="hetero">综合均衡</el-radio-button>
            </el-radio-group>
          </div>
          <p class="grp-rg-hint">{{ MODE_DESC[rgMode] }}<span v-if="needsScore && rgScores && Object.keys(rgScores).length === 0" class="grp-rg-warn">（本班暂无成绩数据，将按学号随机替代）</span></p>

          <div class="grp-rg-row">
            <label class="grp-form-label">组数 / 每组人数</label>
            <el-radio-group v-model="rgUsePerGroup" data-testid="rg-count-mode">
              <el-radio :value="false">指定组数</el-radio>
              <el-radio :value="true">指定每组人数</el-radio>
            </el-radio-group>
            <el-input-number v-if="!rgUsePerGroup" v-model="rgGroupCount" :min="1" :max="Math.max(1, (store.bucket?.students.length ?? 1))" size="small" data-testid="rg-group-count" />
            <el-input-number v-else v-model="rgPerGroup" :min="1" :max="Math.max(1, (store.bucket?.students.length ?? 1))" size="small" data-testid="rg-per-group" />
          </div>

          <div class="grp-rg-row">
            <label class="grp-form-label">余数处理</label>
            <el-radio-group v-model="rgRemainder" data-testid="rg-remainder">
              <el-radio value="rotate">轮转补位</el-radio>
              <el-radio value="min">进最少组</el-radio>
              <el-radio value="random">随机补位</el-radio>
            </el-radio-group>
          </div>

          <div v-if="rgMode === 'gender' || rgMode === 'hetero' || rgMode === 'boarding'" class="grp-rg-row">
            <el-switch v-model="rgGenderSplit" active-text="男女各自独立分组" data-testid="rg-gender-split" />
          </div>

          <div class="grp-rg-constraints">
            <div class="grp-rg-con-head">
              <span>锁定同组（必须同在一组）</span>
              <button type="button" class="tw-btn tw-btn-sm" @click="addLock">+ 添加</button>
            </div>
            <div v-for="(_, i) in rgLocks" :key="'lock' + i" class="grp-rg-con-item">
              <TeacherStudentPicker v-model="rgLocks[i]" :students="store.bucket?.students ?? []" :placeholder="`第 ${i + 1} 组锁定成员`" />
            </div>

            <div class="grp-rg-con-head">
              <span>隔离（不能同在一组）</span>
              <button type="button" class="tw-btn tw-btn-sm" @click="addSeparate">+ 添加</button>
            </div>
            <div v-for="(_, i) in rgSeparates" :key="'sep' + i" class="grp-rg-con-item">
              <TeacherStudentPicker v-model="rgSeparates[i]" :students="store.bucket?.students ?? []" :placeholder="`第 ${i + 1} 组隔离成员`" />
            </div>
          </div>

          <div class="grp-rg-row">
            <label class="grp-form-label">生成名称前缀</label>
            <el-input v-model="rgNamePrefix" :maxlength="20" size="small" placeholder="如：分组" />
          </div>
        </div>

        <div class="grp-rg-right">
          <div class="grp-rg-preview-head">实时预览（{{ rgPreview.results.length }} 组）</div>
          <div v-if="rgPreview.warns.length" class="grp-rg-warns">
            <span v-for="(w, i) in rgPreview.warns" :key="i" class="grp-warn-chip">⚠ {{ w }}</span>
          </div>
          <div class="grp-rg-results">
            <div v-for="(r, i) in rgPreview.results" :key="i" class="grp-rg-group">
              <div class="grp-rg-group-name">{{ r.groupName }}（{{ r.memberIds.length }} 人）</div>
              <div class="grp-rg-members">
                <span
                  v-for="sid in r.memberIds"
                  :key="sid"
                  class="tw-chip"
                  :class="studentMap.get(sid) ? genderClass(studentMap.get(sid)!.gender) : 'is-removed'"
                >
                  {{ studentMap.get(sid) ? studentMap.get(sid)!.name : '（已移除）' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="showRandom = false">取消</el-button>
          <el-button data-testid="rg-save-snapshot" @click="saveRandomAsSnapshot">存为快照</el-button>
          <el-button type="primary" data-testid="rg-save-temp" @click="saveRandomAsTemp">保存为临时组</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 分组快照弹框 -->
    <el-dialog
      v-model="showSnap"
      title="分组快照"
      width="560px"
      destroy-on-close
      data-testid="grp-snap-dialog"
      @close="showSnap = false"
    >
      <div v-if="snapshots.length === 0" class="empty-state">
        <p>还没有快照。在「随机分组」里点「存为快照」即可保存当前分组方案。</p>
      </div>
      <div v-else class="grp-snap-list">
        <div v-for="s in snapshots" :key="s.id" class="grp-snap-item">
          <div class="grp-snap-info">
            <template v-if="snapRenameId === s.id">
              <el-input v-model="snapRenameName" size="small" data-testid="snap-rename-input" @keyup.enter="commitRename" />
              <button type="button" class="tw-btn tw-btn-sm tw-btn-primary" @click="commitRename">确定</button>
              <button type="button" class="tw-btn tw-btn-sm" @click="cancelRename">取消</button>
            </template>
            <template v-else>
              <span class="grp-snap-name">{{ s.name }}</span>
              <span class="grp-snap-meta">{{ s.results.length }} 组 · {{ snapMemberTotal(s) }} 人 · {{ s.createdAt }}</span>
            </template>
          </div>
          <div class="grp-snap-actions">
            <el-button size="small" @click="applySnap(s)">应用为临时组</el-button>
            <el-button size="small" @click="startRename(s)">重命名</el-button>
            <el-button size="small" class="grp-snap-del" @click="removeSnap(s)">删除</el-button>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="showSnap = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.grp-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.grp-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.grp-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.grp-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.grp-search {
  width: 160px;
}
.grp-count {
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}
.grp-list-area :deep(.el-table) {
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.grp-list-area :deep(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #64748b);
  font-weight: 600;
}
:deep(html.dark) .grp-list-area .el-table th.el-table__cell {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-soft, #d1d5db);
}
.grp-name {
  font-weight: 600;
}
.grp-type {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.grp-type.is-fixed {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}
.grp-type.is-temp {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}
.ewt-card-grid {
  align-content: start;
}
.grp-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 120px;
}
.grp-card:hover {
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.35);
}
.grp-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}
.grp-card-desc {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.grp-card-meta {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
}
.grp-card-members {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.grp-card-foot {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin-top: auto;
}
.grp-edit-btn { color: var(--color-link, #3b82f6); }
.grp-copy-btn { color: var(--color-text-secondary, #64748b); }
.grp-del-btn { color: var(--color-error, #ef4444); }

/* 成员 chip（男蓝 / 女粉 / 已移除灰） */
.tw-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  color: var(--color-primary, #3b82f6);
  max-width: 100%;
}
.tw-chip.is-boy {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}
.tw-chip.is-girl {
  background: rgba(236, 72, 153, 0.12);
  color: #ec4899;
}
.tw-chip.is-removed {
  background: rgba(148, 163, 184, 0.16);
  color: var(--color-text-muted, #94a3b8);
  font-style: italic;
}
.tw-chip-role {
  font-style: normal;
  font-size: 10px;
  opacity: 0.75;
  margin-left: 2px;
}
.grp-more {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
}

/* 列表内操作按钮 */
.btn-copy {
  padding: 5px 12px;
  font-size: 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
}
/* .btn-edit 视觉已统一到全局 .ui-btn（style.css） */
.btn-copy {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.3);
  color: #8b5cf6;
}
.btn-copy:hover { background: rgba(139, 92, 246, 0.18); }
/* .btn-delete 视觉已统一到全局 .ui-btn--danger（style.css） */

/* 分页 */
.grp-list-pager {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
}
:deep(html.dark) .grp-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}

/* 操作条 */
.grp-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  color: var(--color-text-soft, #6b7280);
  font-size: 14px;
}

/* 弹框 */
.grp-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.grp-form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.grp-form-row.grp-form-inline {
  flex-direction: row;
  gap: 12px;
}
.grp-form-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.grp-form-label {
  font-size: 13px;
  font-weight: 600;
}
.grp-required {
  color: var(--color-error, #ef4444);
}
.grp-role-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
}
.grp-role-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.grp-role-name {
  width: 90px;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.grp-role-select {
  flex: 1;
}

/* 随机分组弹框 */
.grp-rg {
  display: flex;
  gap: 16px;
  align-items: stretch;
}
.grp-rg-left {
  flex: 1 1 50%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.grp-rg-right {
  flex: 1 1 50%;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--color-border, #e5e7eb);
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.grp-rg-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.grp-rg-hint {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  margin: 0;
}
.grp-rg-warn {
  color: #f59e0b;
  margin-left: 4px;
}
.grp-rg-constraints {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px dashed var(--color-border, #e5e7eb);
  padding-top: 8px;
}
.grp-rg-con-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
}
.grp-rg-con-item {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 8px;
}
.grp-rg-preview-head {
  font-size: 13px;
  font-weight: 600;
}
.grp-rg-warns {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.grp-warn-chip {
  font-size: 12px;
  color: #f59e0b;
}
.grp-rg-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
.grp-rg-group {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 8px 10px;
}
.grp-rg-group-name {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}
.grp-rg-members {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* 快照列表 */
.grp-snap-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.grp-snap-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 8px 10px;
  flex-wrap: wrap;
}
.grp-snap-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.grp-snap-name {
  font-weight: 600;
  font-size: 14px;
}
.grp-snap-meta {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}
.grp-snap-actions {
  display: flex;
  gap: 6px;
}
.grp-snap-del {
  color: var(--color-error, #ef4444);
}

@media (max-width: 768px) {
  .grp-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .grp-rg {
    flex-direction: column;
  }
  .grp-rg-right {
    border-left: none;
    border-top: 1px solid var(--color-border, #e5e7eb);
    padding-left: 0;
    padding-top: 12px;
  }
}
@media (max-width: 480px) {
  .grp-shell :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 92vw;
  }
}
</style>

<!-- 随机分组弹框根元素被 Teleport 到 body，scoped 样式无法命中；此处用唯一 class 做整体高度约束：
     正常分组数时右侧预览区随列高铺满全部信息，不再出现「4 排就滚动 + 底部留白」；
     极端大班（多组多生）时整体不超过视口，由弹框 body 统一滚动，避免撑爆视口。 -->
<style>
.grp-random-dialog.el-dialog {
  max-height: 88vh;
}
.grp-random-dialog .el-dialog__body {
  max-height: calc(88vh - 140px);
  overflow-y: auto;
}
</style>
