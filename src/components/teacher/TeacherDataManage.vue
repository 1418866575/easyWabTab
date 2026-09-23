<script setup lang="ts">
// 数据管理（工作台首页）：班级信息、统计卡、三类表格导入、备份/恢复、学期与班级管理。
// 导入统一走 teacherImportCore（表头归一、缺列明确报错、重名不静默错配）。
//
// section：设置页已把原「数据管理」拆成 4 个独立菜单项（学期与班级 / 班级信息 / 导入表格 /
// 备份与恢复），这里不拆组件，只按 section 控制区块显隐 + 换标题，
// 页面内容、交互逻辑与数据完全复用同一份实现（'all' = 整页，教师工作台内嵌用）。

import { computed, ref } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import TeacherStatCard from './TeacherStatCard.vue'
import {
  backupFileName,
  fileToRows,
  rowsToExams,
  rowsToParents,
  rowsToStudents
} from '@/composables/teacherImportCore'
import {
  TEACHER_DATA_SECTIONS,
  type TeacherDataSectionKey,
  type TeacherRole
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

// ---------- 当前学期（只读派生） ----------
const curSemester = computed(() => store.semesters.find((s) => s.id === store.data.current.sem) ?? null)
const semYear = computed(() => curSemester.value?.year ?? '')
const semTerm = computed(() => curSemester.value?.term ?? '')

// ---------- 学期 / 班级切换（可切换项）与默认组合 ----------
async function onSemesterChange(e: Event): Promise<void> {
  const v = (e.target as HTMLSelectElement).value
  if (v) await store.selectSemester(v)
}

async function onClassChange(e: Event): Promise<void> {
  const v = (e.target as HTMLSelectElement).value
  if (v) await store.selectClass(v)
}

async function onSetDefault(): Promise<void> {
  await store.setDefaultSelection()
  notify('已把当前学期 + 班级设为默认，下次进入工作台自动进入')
}

async function onClearDefault(): Promise<void> {
  await store.clearDefaultSelection()
  notify('已取消默认组合，进入工作台时按常规规则选择学期与班级')
}

// ---------- 统计 ----------
const b = computed(() => store.bucket)
const growthCount = computed(() =>
  Object.values(b.value?.growth ?? {}).reduce((n, list) => n + list.length, 0)
)

// ---------- 导入 ----------
const studentFile = ref<HTMLInputElement | null>(null)
const examFile = ref<HTMLInputElement | null>(null)
const parentFile = ref<HTMLInputElement | null>(null)
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
    notify('已从备份文件恢复数据')
  } catch (err) {
    notify(`恢复失败：${err instanceof Error ? err.message : String(err)}`, 'warn')
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

// ---------- 学期 / 班级 ----------
const newSemYear = ref('')
const newSemTerm = ref('')
const newClsGrade = ref('')
const newClsName = ref('')
const newClsSubject = ref('')
const newClsRole = ref<TeacherRole>('subject')

async function onCreateSemester(): Promise<void> {
  if (!newSemYear.value.trim() || !newSemTerm.value.trim()) return
  await store.addSemester(newSemYear.value, newSemTerm.value)
  newSemYear.value = ''
  newSemTerm.value = ''
  notify('学期已创建')
}

async function onCreateClass(): Promise<void> {
  if (!newClsGrade.value.trim() || !newClsName.value.trim()) return
  await store.addClass(newClsGrade.value, newClsName.value, newClsSubject.value, newClsRole.value)
  newClsGrade.value = ''
  newClsName.value = ''
  newClsSubject.value = ''
  notify('班级已创建并切换过去')
}

async function onDeleteClass(): Promise<void> {
  const c = store.cls
  if (!c) return
  if (!window.confirm(`删除「${c.grade}${c.name}」及其全部数据？`)) return
  await store.deleteClass(c.id)
  notify('班级已删除')
}

async function onDeleteSemester(): Promise<void> {
  const semId = store.data.current.sem
  if (!semId) return
  if (!window.confirm('删除当前学期及其下所有班级数据？')) return
  await store.deleteSemester(semId)
  notify('学期已删除')
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
      <h4 class="tw-card-title">班级信息</h4>
      <p class="tw-card-hint">
        以下信息随当前所选学期与班级自动读出，<strong>不可手动修改</strong>；影响侧栏班级标题与各页「打印 / 导出 Excel」的班级页眉。
        如需更正，请到「学期与班级」删除该班级后重新新建。
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
      <h4 class="tw-card-title">导入表格</h4>
      <p v-if="isAll" class="tw-card-hint">
        支持 .xlsx / .xls / .csv。学生名单需含「姓名」「性别」（学号列可选，列名带 * 也能识别）；
        成绩表第一列为姓名、其余数值列各生成一场考试；家长表需含「姓名」「家长」「电话」。
      </p>
      <div class="tw-toolbar">
        <button type="button" class="tw-btn tw-btn-primary" @click="studentFile?.click()">导入学生名单</button>
        <button type="button" class="tw-btn tw-btn-primary" @click="examFile?.click()">导入成绩</button>
        <button type="button" class="tw-btn tw-btn-primary" @click="parentFile?.click()">导入家长信息</button>
        <input ref="studentFile" type="file" accept=".xlsx,.xls,.csv" class="dm-file" @change="onStudentFile" />
        <input ref="examFile" type="file" accept=".xlsx,.xls,.csv" class="dm-file" @change="onExamFile" />
        <input ref="parentFile" type="file" accept=".xlsx,.xls,.csv" class="dm-file" @change="onParentFile" />
      </div>
    </section>

    <section v-if="show('backup')" class="tw-card">
      <h4 class="tw-card-title">备份与恢复</h4>
      <div class="tw-toolbar">
        <button type="button" class="tw-btn tw-btn-primary" @click="downloadBackup">备份数据</button>
        <button type="button" class="tw-btn" @click="backupFile?.click()">恢复数据</button>
        <input ref="backupFile" type="file" accept=".json" class="dm-file" @change="onBackupFile" />
        <button type="button" class="tw-btn" @click="onLoadDemo">恢复示例数据</button>
        <span class="tw-spacer"></span>
        <button type="button" class="tw-btn tw-btn-danger" @click="onClearAll">清空所有数据</button>
      </div>
    </section>

    <section v-if="show('semester')" class="tw-card">
      <h4 class="tw-card-title">学期与班级</h4>
      <p v-if="isAll" class="tw-card-hint">顶层分组为「学期 × 班级」。切换只改指针，不搬动记录；新建班级为独立数据桶。</p>

      <!-- ① 可切换项：学期 / 班级 + 默认组合 -->
      <div class="dm-zone" data-testid="dm-zone-switch">
        <div class="dm-zone-head">可切换项</div>
        <p class="tw-card-hint">切换学期后，班级自动更新为该学期的默认班级（无默认则取第一个班）。</p>
        <div class="dm-form-row">
          <label class="tw-label">
            学期
            <select class="tw-select tw-input-sm" :value="store.data.current.sem" @change="onSemesterChange">
              <option v-for="s in store.semesters" :key="s.id" :value="s.id">
                {{ s.year }} {{ s.term }}{{ store.isDefaultSemester(s.id) ? '（默认）' : '' }}
              </option>
            </select>
          </label>
          <label class="tw-label">
            班级
            <select class="tw-select tw-input-sm" :value="store.data.current.cls" @change="onClassChange">
              <option v-for="c in store.classesOfCurrentSem" :key="c.id" :value="c.id">
                {{ c.grade }}{{ c.name }}（{{ c.role === 'head' ? '班主任' : '科任' }}）{{ store.isDefaultClass(c.id) ? '（默认）' : '' }}
              </option>
            </select>
          </label>
          <button
            v-if="!store.isDefaultCurrent"
            type="button"
            class="tw-btn tw-btn-sm"
            data-testid="dm-set-default"
            @click="onSetDefault"
          >设为默认</button>
          <button
            v-else
            type="button"
            class="tw-btn tw-btn-sm"
            data-testid="dm-clear-default"
            @click="onClearDefault"
          >取消默认</button>
          <span v-if="store.isDefaultCurrent" class="dm-default-tag">当前即默认组合</span>
        </div>
        <p class="tw-card-hint">
          设为默认后，下次进入教室工作台直接进入该学期与班级，无需重新选择（默认组合随云同步，多设备一致）。
        </p>
      </div>

      <!-- ② 只读项：随上方选择自动更新 -->
      <div class="dm-zone" data-testid="dm-zone-readonly">
        <div class="dm-zone-head">只读信息（随上方选择自动更新）</div>
        <div class="dm-readonly-grid">
          <div class="dm-readonly-item">
            <span class="dm-ro-label">学年</span>
            <span class="dm-ro-value">{{ semYear || '—' }}</span>
          </div>
          <div class="dm-readonly-item">
            <span class="dm-ro-label">学期</span>
            <span class="dm-ro-value">{{ semTerm || '—' }}</span>
          </div>
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
            <span class="dm-ro-label">本班身份</span>
            <span class="dm-ro-value">{{ roleLabel }}</span>
          </div>
        </div>
      </div>

      <!-- ③ 新增 / 删除：年级、班级名、科目、身份只能在新建时指定 -->
      <div class="dm-zone" data-testid="dm-zone-edit">
        <div class="dm-zone-head">新增与删除</div>
        <p class="tw-card-hint">学年、年级、班级名、科目与身份均在新建时确定；写错了请删除后重新新建。</p>
        <div class="dm-form-row">
          <label class="tw-label">学年<input v-model="newSemYear" class="tw-input tw-input-sm" placeholder="2026" /></label>
          <label class="tw-label">学期<input v-model="newSemTerm" class="tw-input tw-input-sm" placeholder="上学期" /></label>
          <button type="button" class="tw-btn tw-btn-sm" @click="onCreateSemester">新增学期</button>
          <button type="button" class="tw-btn tw-btn-sm tw-btn-danger" @click="onDeleteSemester">删除当前学期</button>
        </div>
        <div class="dm-form-row">
          <label class="tw-label">年级<input v-model="newClsGrade" class="tw-input tw-input-sm" placeholder="三年级" /></label>
          <label class="tw-label">班级<input v-model="newClsName" class="tw-input tw-input-sm" placeholder="2班" /></label>
          <label class="tw-label">科目<input v-model="newClsSubject" class="tw-input tw-input-sm" placeholder="数学" /></label>
          <label class="tw-label">
            身份
            <select v-model="newClsRole" class="tw-select tw-input-sm">
              <option value="head">班主任</option>
              <option value="subject">科任</option>
            </select>
          </label>
          <button type="button" class="tw-btn tw-btn-sm" @click="onCreateClass">新增班级</button>
          <button type="button" class="tw-btn tw-btn-sm tw-btn-danger" @click="onDeleteClass">删除当前班级</button>
        </div>
      </div>
    </section>

    <p v-if="message" class="tw-note" :class="{ 'tw-note-warn': messageKind === 'warn' }">{{ message }}</p>
  </div>
</template>

<style scoped>
/* 分区：可切换项 / 只读信息 / 新增与删除 —— 用浅底 + 左侧色条区分层级 */
.dm-zone {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-left: 3px solid var(--color-primary, #6da3d8);
  border-radius: var(--radius-sm, 6px);
  background: var(--color-bg-card, #ffffff);
}

.dm-zone-head {
  font-size: var(--font-size-sm, 12px);
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
  margin-bottom: 4px;
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

.dm-form-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.dm-form-row .tw-label {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

/* 隐藏原生 file input，用按钮触发 */
.dm-file {
  display: none;
}
</style>
