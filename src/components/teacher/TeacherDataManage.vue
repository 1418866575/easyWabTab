<script setup lang="ts">
// 数据管理（工作台首页）：班级信息、统计卡、三类表格导入、备份/恢复、学期与班级管理。
// 导入统一走 teacherImportCore（表头归一、缺列明确报错、重名不静默错配）。

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
import type { TeacherRole } from '@/types/teacher'

const store = useTeacherStore()

const message = ref('')
const messageKind = ref<'info' | 'warn'>('info')

function notify(text: string, kind: 'info' | 'warn' = 'info'): void {
  message.value = text
  messageKind.value = kind
}

// ---------- 班级信息 ----------
const grade = computed({
  get: () => store.cls?.grade ?? '',
  set: (v: string) => void store.updateClassInfo({ grade: v })
})
const className = computed({
  get: () => store.cls?.name ?? '',
  set: (v: string) => void store.updateClassInfo({ name: v })
})
const subject = computed({
  get: () => store.cls?.subject ?? '',
  set: (v: string) => void store.updateClassInfo({ subject: v })
})
const teacherName = computed({
  get: () => store.data.teacher.name,
  set: (v: string) => void store.updateTeacherInfo({ name: v })
})

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
        <h3 class="tw-title">数据管理</h3>
        <p class="tw-subtitle">班级信息、数据导入导出与备份恢复。数据保存在本机浏览器，可随时备份带走。</p>
      </div>
    </div>

    <section class="tw-card">
      <h4 class="tw-card-title">班级信息</h4>
      <p class="tw-card-hint">修改后立即生效，影响侧栏班级标题与各页导出纸质版的页眉。</p>
      <div class="dm-grid">
        <label class="tw-label">年级<input v-model="grade" class="tw-input" placeholder="如 三年级" /></label>
        <label class="tw-label">班级<input v-model="className" class="tw-input" placeholder="如 1班" /></label>
        <label class="tw-label">任教科目<input v-model="subject" class="tw-input" placeholder="如 语文" /></label>
        <label class="tw-label">班主任<input v-model="teacherName" class="tw-input" placeholder="如 王老师" /></label>
      </div>
    </section>

    <section class="tw-stat-grid">
      <TeacherStatCard :value="b?.students.length ?? 0" label="学生人数" accent="#6da3d8" />
      <TeacherStatCard :value="b?.exams.length ?? 0" label="考试成绩（场）" accent="#3fa37c" />
      <TeacherStatCard :value="b?.papers.length ?? 0" label="试卷分析（卷）" accent="#f0b429" />
      <TeacherStatCard :value="growthCount" label="成长记录（条）" accent="#8b7ec8" />
    </section>

    <section class="tw-card">
      <h4 class="tw-card-title">导入表格</h4>
      <p class="tw-card-hint">
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

    <section class="tw-card">
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

    <section class="tw-card">
      <h4 class="tw-card-title">学期与班级</h4>
      <p class="tw-card-hint">顶层分组为「学期 × 班级」。切换只改指针，不搬动记录；新建班级为独立数据桶。</p>
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
    </section>

    <p v-if="message" class="tw-note" :class="{ 'tw-note-warn': messageKind === 'warn' }">{{ message }}</p>
  </div>
</template>

<style scoped>
.dm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

.dm-grid .tw-label {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
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
