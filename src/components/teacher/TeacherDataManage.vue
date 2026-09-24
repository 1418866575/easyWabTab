<script setup lang="ts">
// 数据管理（工作台首页）：班级信息、统计卡、三类表格导入、备份/恢复、学期与班级管理。
// 导入统一走 teacherImportCore（表头归一、缺列明确报错、重名不静默错配）。
//
// section：设置页已把原「数据管理」拆成 4 个独立菜单项（学期与班级 / 班级信息 / 导入数据 /
// 备份与恢复），这里不拆组件，只按 section 控制区块显隐 + 换标题，
// 页面内容、交互逻辑与数据完全复用同一份实现（'all' = 整页，教师工作台内嵌用）。

import { computed, reactive, ref } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import TeacherStatCard from './TeacherStatCard.vue'
import {
  backupFileName,
  fileToRows,
  rowsToExams,
  rowsToParents,
  rowsToStudents,
  rowsToTimetable
} from '@/composables/teacherImportCore'
import {
  exportExcel,
  excelFileName
} from '@/composables/teacherExcelCore'
import {
  CLASS_LEVELS_BY_STAGE,
  STAGE_OPTIONS,
  TERM_OPTIONS,
  TEACHER_DATA_SECTIONS,
  type ClassGroup,
  type Semester,
  type TeacherDataSectionKey,
  type TeacherRole,
  type TeacherStage,
  type TeacherTerm,
  WEEK_DAYS
} from '@/types/teacher'

const props = withDefaults(defineProps<{ section?: TeacherDataSectionKey }>(), { section: 'all' })

const store = useTeacherStore()

/** 当前区块的标题 / 副标题（'all' 时仍是「数据管理」整页说明） */
const meta = computed<{ label: string; sub: string }>(() => {
  if (props.section === 'all') {
    return {
      label: '数据管理',
      sub: '班级信息、数据导入导出与备份恢复。数据保存在本机浏览器，可随时备份带走。'
    }
  }
  return (
    TEACHER_DATA_SECTIONS.find((s) => s.key === props.section) ?? { label: '数据管理', sub: '' }
  )
})

/** 整页模式（'all'）：单区块模式下区块说明已上移为副标题，卡片内的提示语不再重复输出 */
const isAll = computed(() => props.section === 'all')

/** 区块是否显示：'all' 全部显示；指定 section 时只显示对应区块 */
function show(section: TeacherDataSectionKey): boolean {
  const cur = props.section
  if (cur === 'all') return true
  return cur === section
}

const message = ref('')
const messageKind = ref<'info' | 'warn'>('info')

function notify(text: string, kind: 'info' | 'warn' = 'info'): void {
  message.value = text
  messageKind.value = kind
}

// ---------- 班级信息（只读） ----------
// 班级信息一律随所选学期 / 班级自动读出，不再提供手改入口：
// 写错只能删除该班级后重新新建（新建时可指定年级 / 班级 / 科目 / 身份）。
const grade = computed(() => store.cls?.grade ?? '')
const className = computed(() => store.cls?.name ?? '')
const subject = computed(() => store.cls?.subject ?? '')
const teacherName = computed(() => store.data.teacher.name)
const roleLabel = computed(() => (store.role === 'head' ? '班主任' : '非班主任 · 科任'))

// ---------- 统计 ----------
const b = computed(() => store.bucket)
const growthCount = computed(() =>
  Object.values(b.value?.growth ?? {}).reduce((n, list) => n + list.length, 0)
)

// ---------- 导入 ----------
const studentFile = ref<HTMLInputElement | null>(null)
const examFile = ref<HTMLInputElement | null>(null)
const parentFile = ref<HTMLInputElement | null>(null)
const timetableFile = ref<HTMLInputElement | null>(null)
const backupFile = ref<HTMLInputElement | null>(null)

async function onStudentFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const rows = await fileToRows(file)
    const res = rowsToStudents(rows, store.data.current.sem, store.data.current.cls)
    if (res.errors.length) {
      notify(`导入失败：${res.errors.join('；')}`, 'warn')
      return
    }
    await store.importStudents(res.students)
    notify(
      `导入 ${res.students.length} 名学生，座位表已同步重排${res.warnings.length ? `（${res.warnings.length} 条提示：${res.warnings.slice(0, 3).join('；')}）` : ''}`,
      res.warnings.length ? 'warn' : 'info'
    )
  } catch (err) {
    notify(`读取失败：${err instanceof Error ? err.message : String(err)}`, 'warn')
  } finally {
    input.value = ''
  }
}

async function onExamFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const rows = await fileToRows(file)
    const students = b.value?.students ?? []
    if (!students.length) {
      notify('请先导入学生名单，再导入成绩（成绩按学生姓名匹配）', 'warn')
      return
    }
    const res = rowsToExams(rows, students, store.cls?.subject ?? '')
    if (res.errors.length) {
      notify(`导入失败：${res.errors.join('；')}`, 'warn')
      return
    }
    await store.importExams(res.exams)
    notify(
      `生成 ${res.exams.length} 场考试${res.warnings.length ? `（${res.warnings.length} 条提示：${res.warnings.slice(0, 3).join('；')}）` : ''}`,
      res.warnings.length ? 'warn' : 'info'
    )
  } catch (err) {
    notify(`读取失败：${err instanceof Error ? err.message : String(err)}`, 'warn')
  } finally {
    input.value = ''
  }
}

async function onParentFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const rows = await fileToRows(file)
    const students = b.value?.students ?? []
    const res = rowsToParents(rows, students)
    if (res.errors.length) {
      notify(`导入失败：${res.errors.join('；')}`, 'warn')
      return
    }
    await store.importParents(res.parents)
    notify(`更新 ${Object.keys(res.parents).length} 位家长信息${res.warnings.length ? `（${res.warnings.slice(0, 3).join('；')}）` : ''}`, res.warnings.length ? 'warn' : 'info')
  } catch (err) {
    notify(`读取失败：${err instanceof Error ? err.message : String(err)}`, 'warn')
  } finally {
    input.value = ''
  }
}

async function onTimetableFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const rows = await fileToRows(file)
    const res = rowsToTimetable(rows)
    if (res.errors.length) {
      notify(`导入失败：${res.errors.join('；')}`, 'warn')
      return
    }
    await store.importTimetable(res.periods, res.grid)
    notify(`已导入课程表（${res.periods.length} 节次 × ${WEEK_DAYS.length} 天）`, 'info')
  } catch (err) {
    notify(`读取失败：${err instanceof Error ? err.message : String(err)}`, 'warn')
  } finally {
    input.value = ''
  }
}

// ---------- 下载 Excel 模板 ----------
// 模板表头与导入解析（teacherImportCore.mapHeaders）严格对齐，便于用户照填。
// 各模板含一行示例数据，导入时按「姓名」为空自动跳过，不会误写库。
function classTitleForTemplate(): string {
  return `${store.cls?.grade ?? ''}${store.cls?.name ?? ''}`
}

async function downloadStudentTemplate(): Promise<void> {
  await exportExcel(
    excelFileName('学生名单模板', classTitleForTemplate()),
    [{ name: '学生名单', headers: ['姓名', '性别', '学号'], rows: [['张三', '男', '1']] }]
  )
  notify('学生名单 Excel 模板已下载')
}

async function downloadExamTemplate(): Promise<void> {
  await exportExcel(
    excelFileName('成绩模板', classTitleForTemplate()),
    [{ name: '成绩', headers: ['姓名', '期中成绩', '期末成绩'], rows: [['张三', 90, 85]] }]
  )
  notify('成绩 Excel 模板已下载')
}

async function downloadParentTemplate(): Promise<void> {
  await exportExcel(
    excelFileName('家长信息模板', classTitleForTemplate()),
    [{ name: '家长信息', headers: ['姓名', '家长', '电话', '关系'], rows: [['张三', '张父', '13800000000', '父亲']] }]
  )
  notify('家长信息 Excel 模板已下载')
}

async function downloadTimetableTemplate(): Promise<void> {
  await exportExcel(
    excelFileName('课程表模板', classTitleForTemplate()),
    [
      {
        name: '课程表',
        headers: ['节次', ...WEEK_DAYS],
        rows: [
          ['第1节', '语文', '数学', '英语', '语文', '数学', '自习'],
          ['第2节', '数学', '英语', '语文', '体育', '美术', '音乐'],
          ['第3节', '英语', '语文', '数学', '科学', '书法', '班会']
        ]
      }
    ]
  )
  notify('课程表 Excel 模板已下载')
}

// ---------- 备份 / 恢复 ----------
function downloadBackup(): void {
  const json = JSON.stringify(store.data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFileName()
  a.click()
  URL.revokeObjectURL(url)
  notify('备份文件已下载')
}

async function onBackupFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    await store.importBackup(JSON.parse(text))
    notify('已从备份文件导入数据')
  } catch (err) {
    notify(`导入失败：${err instanceof Error ? err.message : String(err)}`, 'warn')
  } finally {
    input.value = ''
  }
}

async function onClearAll(): Promise<void> {
  if (!window.confirm('确定清空所有数据？此操作不可撤销。')) return
  if (!window.confirm('再次确认：清空后本机的学期、班级、学生、成绩等全部数据都会被删除，建议先备份。继续？')) return
  await store.clearAll()
  notify('已清空所有数据')
}

async function onLoadDemo(): Promise<void> {
  if (!window.confirm('将填充一套虚构的演示数据（会覆盖当前数据），继续？')) return
  await store.loadDemoData()
  notify('演示数据已载入')
}

// ---------- 学期与班级：单表格管理 ----------
interface ClassRow {
  cls: ClassGroup
  sem: Semester | null
}

const rows = computed<ClassRow[]>(() => {
  const semMap = new Map(store.data.semesters.map((s) => [s.id, s]))
  return store.data.classes.map((c) => ({ cls: c, sem: semMap.get(c.semesterId) ?? null }))
})

function isDefaultRow(row: ClassRow): boolean {
  return store.isDefaultSemester(row.cls.semesterId) && store.isDefaultClass(row.cls.id)
}

// ---------- 新增 / 编辑弹框 ----------
const dialogVisible = ref(false)
const dialogMode = ref<'add' | 'edit'>('add')
const editingId = ref('')

const form = reactive({
  year: '',
  stage: '幼儿园' as TeacherStage,
  term: '上半年' as TeacherTerm,
  grade: '',
  role: 'subject' as TeacherRole,
  subject: ''
})

const classOptions = computed<string[]>(() => CLASS_LEVELS_BY_STAGE[form.stage] ?? [])

function resetAddForm(): void {
  form.year = ''
  form.stage = '幼儿园'
  form.term = '上半年'
  form.grade = CLASS_LEVELS_BY_STAGE['幼儿园'][0]
  form.role = 'subject'
  form.subject = ''
}

function openAdd(): void {
  dialogMode.value = 'add'
  editingId.value = ''
  resetAddForm()
  dialogVisible.value = true
}

function openEdit(row: ClassRow): void {
  dialogMode.value = 'edit'
  editingId.value = row.cls.id
  form.year = row.sem?.year ?? ''
  form.stage = row.cls.stage
  form.term = (row.sem?.term as TeacherTerm) ?? '上半年'
  form.grade = row.cls.grade
  form.role = row.cls.role
  form.subject = row.cls.subject
  dialogVisible.value = true
}

// 学段变化 → 班级可选项变化，班级重置为该学段首项
function onStageChange(): void {
  form.grade = classOptions.value[0] ?? ''
}

async function onSave(): Promise<void> {
  if (!form.year) {
    notify('请选择学年', 'warn')
    return
  }
  if (!form.grade) {
    notify('请选择班级', 'warn')
    return
  }
  if (dialogMode.value === 'add') {
    await store.createClassEntry({
      year: form.year,
      term: form.term,
      stage: form.stage,
      grade: form.grade,
      name: '',
      role: form.role,
      subject: form.subject
    })
    notify('已新增班级')
  } else {
    const cls = store.data.classes.find((c) => c.id === editingId.value)
    await store.updateClassEntry(editingId.value, {
      year: form.year,
      term: form.term,
      stage: form.stage,
      grade: form.grade,
      name: cls?.name ?? '',
      role: form.role,
      subject: form.subject
    })
    notify('已保存修改')
  }
  dialogVisible.value = false
}

async function onRowSetDefault(row: ClassRow): Promise<void> {
  await store.markDefault(row.cls.semesterId, row.cls.id)
  notify('已设为默认组合，下次进入工作台自动进入')
}

async function onRowDelete(row: ClassRow): Promise<void> {
  if (!window.confirm(`删除「${row.cls.grade}${row.cls.name}」及其全部数据？`)) return
  await store.deleteClass(row.cls.id)
  notify('班级已删除')
}

// ---------- 删除学期（整学期 + 其全部班级） ----------
const semesterToDelete = ref('')
const semesterOptions = computed(() => store.data.semesters)
async function onDeleteSemester(): Promise<void> {
  const semId = semesterToDelete.value
  if (!semId) return
  const sem = store.data.semesters.find((s) => s.id === semId)
  const label = sem ? `${sem.year} ${sem.term}` : '该学期'
  if (!window.confirm(`确定删除「${label}」及其全部班级与数据？此操作会通过云同步传播，删除后无法恢复。`)) return
  await store.deleteSemester(semId)
  semesterToDelete.value = ''
  notify('已删除学期')
}

async function onClearSemesterData(): Promise<void> {
  const semId = semesterToDelete.value
  if (!semId) return
  const sem = store.data.semesters.find((s) => s.id === semId)
  const label = sem ? `${sem.year} ${sem.term}` : '该学期'
  if (!window.confirm(`确定清空「${label}」的全部数据记录（学生 / 家长 / 成绩 / 试卷 / 座位 / 值日 / 课程表 / 奖励 / 点名等）？学期与班级结构保留，数据不可恢复。`)) return
  try {
    await store.clearSemesterData(semId)
    notify(`已清空「${label}」的数据`)
  } catch (e) {
    notify(`清空失败：${e instanceof Error ? e.message : String(e)}`, 'warn')
  }
}
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">{{ meta.label }}</h3>
        <p class="tw-subtitle">{{ meta.sub }}</p>
      </div>
    </div>

    <section v-if="show('class')" class="tw-card">
      <h4 v-if="isAll" class="tw-card-title">班级信息</h4>
      <p v-if="isAll" class="tw-card-hint">
        以下信息随当前所选学期与班级自动读出，<strong>不可手动修改</strong>；影响侧栏班级标题与各页「打印 / 导出 Excel」的班级页眉。
        如需更正，请到「学期与班级」编辑或删除该班级后重新新建。
      </p>
      <div class="dm-readonly-grid">
        <div class="dm-readonly-item">
          <span class="dm-ro-label">年级</span>
          <span class="dm-ro-value">{{ grade || '—' }}</span>
        </div>
        <div class="dm-readonly-item">
          <span class="dm-ro-label">班级</span>
          <span class="dm-ro-value">{{ className || '—' }}</span>
        </div>
        <div class="dm-readonly-item">
          <span class="dm-ro-label">任教科目</span>
          <span class="dm-ro-value">{{ subject || '—' }}</span>
        </div>
        <div class="dm-readonly-item">
          <span class="dm-ro-label">班主任</span>
          <span class="dm-ro-value">{{ teacherName || '—' }}</span>
        </div>
        <div class="dm-readonly-item">
          <span class="dm-ro-label">本班身份</span>
          <span class="dm-ro-value">{{ roleLabel }}</span>
        </div>
        <div class="dm-readonly-item">
          <span class="dm-ro-label">默认组合</span>
          <span class="dm-ro-value">{{ store.isDefaultCurrent ? '是（进入工作台自动进入）' : '否' }}</span>
        </div>
      </div>
    </section>

    <section v-if="show('class')" class="tw-stat-grid">
      <TeacherStatCard :value="b?.students.length ?? 0" label="学生人数" accent="#6da3d8" />
      <TeacherStatCard :value="b?.exams.length ?? 0" label="考试成绩（场）" accent="#3fa37c" />
      <TeacherStatCard :value="b?.papers.length ?? 0" label="试卷分析（卷）" accent="#f0b429" />
      <TeacherStatCard :value="growthCount" label="奖励记录（条）" accent="#8b7ec8" />
    </section>

    <section v-if="show('import')" class="tw-card">
      <h4 v-if="isAll" class="tw-card-title">导入数据</h4>
      <p v-if="isAll" class="tw-card-hint">
        支持 .xlsx / .xls / .csv。学生名单需含「姓名」「性别」（学号列可选，列名带 * 也能识别）；
        成绩表第一列为姓名、其余数值列各生成一场考试；家长表需含「姓名」「家长」「电话」；
        课程表首列为节次、其后每列依次对应 周一~周六。
        不确定列名？点击右侧「下载模板」获取对应 Excel 模板（含示例行，导入时按姓名自动跳过，不会误写库）。
      </p>
      <div class="tw-toolbar">
        <button type="button" class="tw-btn tw-btn-primary" @click="studentFile?.click()">导入学生信息</button>
        <button type="button" class="tw-btn tw-btn-primary" @click="examFile?.click()">导入成绩</button>
        <button type="button" class="tw-btn tw-btn-primary" @click="parentFile?.click()">导入家长信息</button>
        <button type="button" class="tw-btn tw-btn-primary" @click="timetableFile?.click()">导入课程表</button>
        <button type="button" class="tw-btn" @click="downloadStudentTemplate">下载学生名单模板</button>
        <button type="button" class="tw-btn" @click="downloadExamTemplate">下载成绩模板</button>
        <button type="button" class="tw-btn" @click="downloadParentTemplate">下载家长信息模板</button>
        <button type="button" class="tw-btn" @click="downloadTimetableTemplate">下载课程表模板</button>
        <input ref="studentFile" type="file" accept=".xlsx,.xls,.csv" class="dm-file" @change="onStudentFile" />
        <input ref="examFile" type="file" accept=".xlsx,.xls,.csv" class="dm-file" @change="onExamFile" />
        <input ref="parentFile" type="file" accept=".xlsx,.xls,.csv" class="dm-file" @change="onParentFile" />
        <input ref="timetableFile" type="file" accept=".xlsx,.xls,.csv" class="dm-file" @change="onTimetableFile" />
      </div>
    </section>

    <section v-if="show('backup')" class="tw-card">
      <h4 v-if="isAll" class="tw-card-title">备份与恢复</h4>
      <div class="tw-toolbar">
        <button type="button" class="tw-btn tw-btn-primary" @click="downloadBackup">导出</button>
        <button type="button" class="tw-btn" @click="backupFile?.click()">导入</button>
        <input ref="backupFile" type="file" accept=".json" class="dm-file" @change="onBackupFile" />
        <button type="button" class="tw-btn" @click="onLoadDemo">演示数据</button>
        <span class="tw-spacer"></span>
        <button type="button" class="tw-btn tw-btn-danger" @click="onClearAll">清空所有数据</button>
      </div>
    </section>

    <section v-if="show('semester')" class="tw-card">
      <h4 v-if="isAll" class="tw-card-title">学期与班级</h4>
      <p v-if="isAll" class="tw-card-hint">
        以班级为单位管理「学年 × 学段 × 学期 × 班级」组合。每行可编辑、设为默认或删除；设为默认后进入工作台自动进入该组合。
      </p>
      <div class="tw-toolbar">
        <button type="button" class="tw-btn tw-btn-primary" @click="openAdd">新增</button>
        <span class="dm-toolbar-sep"></span>
        <label class="dm-inline-field">
          <span class="dm-field-label">学期</span>
          <el-select v-model="semesterToDelete" class="dm-select-sm" placeholder="选择学期" :disabled="!semesterOptions.length">
            <el-option v-for="s in semesterOptions" :key="s.id" :label="`${s.year} ${s.term}`" :value="s.id" />
          </el-select>
        </label>
        <button type="button" class="tw-btn tw-btn-danger" :disabled="!semesterToDelete" @click="onDeleteSemester">删除学期</button>
        <span class="dm-toolbar-sep"></span>
        <button type="button" class="tw-btn tw-btn-danger" :disabled="!semesterToDelete" @click="onClearSemesterData">清空数据</button>
      </div>

      <table v-if="rows.length" class="dm-table">
        <thead>
          <tr>
            <th>学年</th>
            <th>学段</th>
            <th>学期</th>
            <th>班级</th>
            <th class="dm-op-col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.cls.id">
            <td>{{ row.sem?.year || '—' }}</td>
            <td>{{ row.cls.stage }}</td>
            <td>{{ row.sem?.term || '—' }}</td>
            <td>{{ row.cls.grade }}{{ row.cls.name }}</td>
            <td class="dm-op-col">
              <span v-if="isDefaultRow(row)" class="dm-default-tag">默认</span>
              <button type="button" class="tw-btn tw-btn-sm" @click="openEdit(row)">编辑</button>
              <button v-if="!isDefaultRow(row)" type="button" class="tw-btn tw-btn-sm" @click="onRowSetDefault(row)">设为默认</button>
              <button type="button" class="tw-btn tw-btn-sm tw-btn-danger" @click="onRowDelete(row)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="tw-note">暂无班级，点击「新增」添加第一个班级。</p>

      <el-dialog
        v-model="dialogVisible"
        :title="dialogMode === 'add' ? '新增班级' : '编辑班级'"
        width="420px"
        append-to-body
        class="dm-dialog"
      >
        <div class="dm-form">
          <label class="dm-field">
            <span class="dm-field-label">学年</span>
            <el-date-picker
              v-model="form.year"
              type="year"
              value-format="YYYY"
              placeholder="选择学年"
              class="dm-year-picker"
            />
          </label>
          <label class="dm-field">
            <span class="dm-field-label">学段</span>
            <el-select v-model="form.stage" class="dm-select" @change="onStageChange">
              <el-option v-for="s in STAGE_OPTIONS" :key="s" :label="s" :value="s" />
            </el-select>
          </label>
          <label class="dm-field">
            <span class="dm-field-label">学期</span>
            <el-select v-model="form.term" class="dm-select">
              <el-option v-for="t in TERM_OPTIONS" :key="t" :label="t" :value="t" />
            </el-select>
          </label>
          <label class="dm-field">
            <span class="dm-field-label">班级</span>
            <el-select v-model="form.grade" class="dm-select">
              <el-option v-for="g in classOptions" :key="g" :label="g" :value="g" />
            </el-select>
          </label>
          <label class="dm-field">
            <span class="dm-field-label">本班身份</span>
            <el-select v-model="form.role" class="dm-select">
              <el-option label="班主任" value="head" />
              <el-option label="科任" value="subject" />
            </el-select>
          </label>
          <label class="dm-field">
            <span class="dm-field-label">任教科目</span>
            <el-input v-model="form.subject" placeholder="如 数学" />
          </label>
        </div>
        <template #footer>
          <button type="button" class="tw-btn" @click="dialogVisible = false">取消</button>
          <button type="button" class="tw-btn tw-btn-primary" @click="onSave">保存</button>
        </template>
      </el-dialog>
    </section>

    <p v-if="message" class="tw-note" :class="{ 'tw-note-warn': messageKind === 'warn' }">{{ message }}</p>
  </div>
</template>

<style scoped>
/* 学期与班级：单表格 */
.dm-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  font-size: var(--font-size-sm, 13px);
}

.dm-table th,
.dm-table td {
  border: 1px solid var(--color-border, #e2e8f0);
  padding: 8px 10px;
  text-align: left;
}

.dm-table th {
  background: var(--color-bg-hover, #f1f5f9);
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
  white-space: nowrap;
}

.dm-table td {
  color: var(--color-text, #334155);
}

.dm-op-col {
  white-space: nowrap;
}

.dm-op-col .tw-btn {
  margin-right: 4px;
}

/* 新增 / 编辑弹框表单 */
.dm-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dm-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dm-field-label {
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-secondary, #64748b);
}

.dm-select,
.dm-year-picker {
  width: 100%;
}

/* 行内「选择学期 + 删除学期」控件 */
.dm-inline-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dm-select-sm {
  width: 160px;
}

.dm-toolbar-sep {
  width: 1px;
  align-self: stretch;
  margin: 2px 4px;
  background: var(--color-border, #e2e8f0);
}

/* 只读信息格子：与输入框同样的栅格，但用虚框底色表明不可编辑 */
.dm-readonly-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.dm-readonly-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background: var(--color-bg-hover, #f1f5f9);
}

.dm-ro-label {
  font-size: var(--font-size-xs, 11px);
  color: var(--color-text-muted, #94a3b8);
}

.dm-ro-value {
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text, #334155);
  font-weight: 500;
  word-break: break-all;
}

.dm-default-tag {
  align-self: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-size-xs, 11px);
  color: var(--color-primary, #6da3d8);
  background: var(--color-primary-soft, #eaf2fb);
}

/* 隐藏原生 file input，用按钮触发 */
.dm-file {
  display: none;
}
</style>
