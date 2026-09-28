<script setup lang="ts">
// 学生信息：统计卡 + 班级花名册（男蓝/女粉、特异体质红色「!」角标）+ 可编辑明细表（含家庭地址）。
// 明细表改动即存（onchange → store → IndexedDB），与项目其它面板「修改后自动保存」一致。
// 「导入学生信息 / 下载模板」复用设置页「导入数据」的既有能力（teacherImportCore + store.importStudents），
// 模板表头与学生名单解析（mapHeaders）共用 teacherExcelCore 的 exportStudentTemplateExcel，避免两处不一致。

import { computed, ref } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import TeacherStatCard from './TeacherStatCard.vue'
import { sortedStudents } from '@/composables/teacherCore'
import { exportExcel, excelFileName, exportStudentTemplateExcel } from '@/composables/teacherExcelCore'
import { fileToRows, rowsToStudents } from '@/composables/teacherImportCore'
import { useToast } from '@/composables/useToast'
import type { Student } from '@/types/teacher'

const store = useTeacherStore()
const toast = useToast()

const keyword = ref('')
const b = computed(() => store.bucket)
const students = computed(() => sortedStudents(b.value?.students ?? []))

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return students.value
  return students.value.filter((s) => s.name.toLowerCase().includes(k) || s.no.toLowerCase().includes(k))
})

const maleCount = computed(() => students.value.filter((s) => s.gender === '男').length)
const femaleCount = computed(() => students.value.filter((s) => s.gender === '女').length)
const specialCount = computed(() => students.value.filter((s) => s.special).length)
const parentCount = computed(() => Object.keys(b.value?.parents ?? {}).length)

// ---------- 新增 ----------
const newNo = ref('')
const newName = ref('')
const newGender = ref<'男' | '女'>('男')

async function onAdd(): Promise<void> {
  if (!newName.value.trim()) return
  await store.addStudent({ no: newNo.value, name: newName.value, gender: newGender.value })
  newNo.value = ''
  newName.value = ''
}

// ---------- 编辑 ----------
function onStudentField(s: Student, patch: Partial<Student>): void {
  void store.updateStudent(s.id, patch)
}

function onParentField(studentId: string, field: 'parentName' | 'relation' | 'phone', value: string): void {
  const cur = b.value?.parents[studentId] ?? { parentName: '', relation: '', phone: '' }
  void store.setParent(studentId, { ...cur, [field]: value })
}

async function onRemove(s: Student): Promise<void> {
  if (!window.confirm(`删除学生「${s.name}」？其成绩、座位、值日记录会一并清理（奖励记录保留）。`)) return
  await store.removeStudent(s.id)
}

function exportPaper(): void {
  window.print()
}

async function exportExcelFile(): Promise<void> {
  const rows = students.value.map((s) => {
    const p = b.value?.parents[s.id]
    return [s.no, s.name, s.gender, s.post, p?.parentName ?? '', p?.relation ?? '', p?.phone ?? '', s.address ?? '']
  })
  await exportExcel(excelFileName('学生名单', store.cls ? `${store.cls.grade}${store.cls.name}` : '班级'), [
    { name: '学生名单', headers: ['学号', '姓名', '性别', '职务', '家长姓名', '关系', '联系电话', '家庭地址'], rows }
  ])
}

// ---------- 导入学生信息 / 下载模板（与设置页「导入数据」同一套能力） ----------
const studentFile = ref<HTMLInputElement | null>(null)

async function onStudentFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const rows = await fileToRows(file)
    const res = rowsToStudents(rows, store.data.current.sem, store.data.current.cls)
    if (res.errors.length) {
      toast.error(`导入失败：${res.errors.join('；')}`)
      return
    }
    await store.importStudents(res.students)
    toast.success(
      `导入 ${res.students.length} 名学生，座位表已同步重排${res.warnings.length ? `（${res.warnings.length} 条提示：${res.warnings.slice(0, 3).join('；')}）` : ''}`
    )
  } catch (err) {
    toast.error(`读取失败：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    input.value = ''
  }
}

async function downloadTemplate(): Promise<void> {
  await exportStudentTemplateExcel(store.cls ? `${store.cls.grade}${store.cls.name}` : '班级')
  toast.success('学生名单 Excel 模板已下载')
}
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">学生信息</h3>
        <p class="tw-subtitle">花名册按学号排序；明细表可直接修改，修改后自动保存。</p>
      </div>
      <div class="tw-toolbar">
        <button type="button" class="tw-btn tw-no-print" @click="studentFile?.click()">导入学生信息</button>
        <button type="button" class="tw-btn tw-no-print" @click="downloadTemplate">下载模板</button>
        <button type="button" class="tw-btn tw-no-print" @click="exportPaper">打印</button>
        <button type="button" class="tw-btn tw-no-print" @click="exportExcelFile">导出 Excel</button>
        <input ref="studentFile" type="file" accept=".xlsx,.xls,.csv" class="stu-file" @change="onStudentFile" />
      </div>
    </div>

    <section class="tw-stat-grid">
      <TeacherStatCard :value="students.length" label="班级总人数" accent="#6da3d8" />
      <TeacherStatCard :value="maleCount" label="男生人数" accent="#6da3d8" />
      <TeacherStatCard :value="femaleCount" label="女生人数" accent="#e989a6" />
      <TeacherStatCard :value="specialCount" label="特异体质人数" accent="#ef4444" />
      <TeacherStatCard :value="parentCount" label="家长已登记" accent="#3fa37c" />
    </section>

    <section class="tw-card">
      <h4 class="tw-card-title">班级花名册</h4>
      <div class="tw-toolbar tw-no-print">
        <input v-model="keyword" class="tw-input" placeholder="搜索姓名 / 学号" />
        <span class="tw-spacer"></span>
        <span class="tw-label">共 {{ filtered.length }} 人</span>
      </div>
      <div v-if="filtered.length" class="tw-roster">
        <div
          v-for="s in filtered"
          :key="s.id"
          class="tw-chip"
          :class="s.gender === '男' ? 'tw-chip-male' : 'tw-chip-female'"
          :title="s.special ? `特异体质：${s.health.notes || s.health.allergy || '需关注'}` : s.name"
        >
          <span class="tw-chip-badge" v-if="s.special">!</span>
          <span>{{ s.name }}</span>
          <span class="tw-chip-no">{{ s.no }}</span>
        </div>
      </div>
      <p v-else class="tw-empty">还没有学生，请在下方添加，或点上方「导入学生信息」导入名单。</p>
    </section>

    <section class="tw-card">
      <h4 class="tw-card-title">学生明细表</h4>
      <div class="tw-toolbar tw-no-print">
        <label class="tw-label">学号<input v-model="newNo" class="tw-input tw-input-sm" placeholder="自动" /></label>
        <label class="tw-label">姓名<input v-model="newName" class="tw-input tw-input-sm" placeholder="必填" /></label>
        <label class="tw-label">
          性别
          <select v-model="newGender" class="tw-select tw-input-sm">
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
        </label>
        <button type="button" class="tw-btn tw-btn-sm tw-btn-primary" :disabled="!newName.trim()" @click="onAdd">添加学生</button>
      </div>

      <div v-if="filtered.length" class="tw-table-wrap">
        <table class="tw-table">
          <thead>
            <tr>
              <th>学号</th>
              <th>姓名</th>
              <th>性别</th>
              <th>职务</th>
              <th>家长姓名</th>
              <th>关系</th>
              <th>联系电话</th>
              <th>家庭地址</th>
              <th class="tw-no-print">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in filtered" :key="s.id">
              <td>
                <input class="tw-input tw-input-sm stu-no" :value="s.no" @change="onStudentField(s, { no: ($event.target as HTMLInputElement).value })" />
              </td>
              <td>
                <input class="tw-input tw-input-sm" :value="s.name" @change="onStudentField(s, { name: ($event.target as HTMLInputElement).value })" />
              </td>
              <td>
                <select
                  class="tw-select tw-input-sm"
                  :value="s.gender"
                  @change="onStudentField(s, { gender: (($event.target as HTMLSelectElement).value as '男' | '女') })"
                >
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </td>
              <td>
                <input class="tw-input tw-input-sm" :value="s.post" placeholder="如 班长" @change="onStudentField(s, { post: ($event.target as HTMLInputElement).value })" />
              </td>
              <td>
                <input class="tw-input tw-input-sm" :value="b?.parents[s.id]?.parentName ?? ''" @change="onParentField(s.id, 'parentName', ($event.target as HTMLInputElement).value)" />
              </td>
              <td>
                <input class="tw-input tw-input-sm" :value="b?.parents[s.id]?.relation ?? ''" @change="onParentField(s.id, 'relation', ($event.target as HTMLInputElement).value)" />
              </td>
              <td>
                <input class="tw-input tw-input-sm" :value="b?.parents[s.id]?.phone ?? ''" @change="onParentField(s.id, 'phone', ($event.target as HTMLInputElement).value)" />
              </td>
              <td>
                <input class="tw-input tw-input-sm stu-address" :value="s.address" placeholder="家庭地址" @change="onStudentField(s, { address: ($event.target as HTMLInputElement).value })" />
              </td>
              <td class="tw-no-print">
                <button type="button" class="tw-btn tw-btn-sm tw-btn-danger" @click="onRemove(s)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="tw-empty">暂无学生记录。</p>
    </section>
  </div>
</template>

<style scoped>
.stu-no {
  width: 64px;
}

/* 隐藏的「导入学生信息」文件选择框（由按钮代理点击） */
.stu-file {
  display: none;
}

.stu-address {
  min-width: 180px;
}

@media (max-width: 768px) {
  .stu-no {
    width: 56px;
  }
}
</style>
