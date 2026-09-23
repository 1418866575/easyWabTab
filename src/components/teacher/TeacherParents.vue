<script setup lang="ts">
// 家长联系方式：搜索（学生/家长/电话）+ 导入表格 + 导出纸质版；联系电话以文本展示，不提供一键拨号。
// 该页仅班主任可见（由 TeacherView 的可见性矩阵控制）。

import { computed, ref } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import TeacherStatCard from './TeacherStatCard.vue'
import { sortedStudents } from '@/composables/teacherCore'
import { fileToRows, rowsToParents } from '@/composables/teacherImportCore'
import { exportExcel, excelFileName } from '@/composables/teacherExcelCore'

const store = useTeacherStore()

const b = computed(() => store.bucket)
const students = computed(() => sortedStudents(b.value?.students ?? []))
const keyword = ref('')
const message = ref('')

const rows = computed(() =>
  students.value.map((s) => ({
    student: s,
    parent: b.value?.parents[s.id] ?? null
  }))
)

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return rows.value
  return rows.value.filter((r) =>
    [r.student.name, r.parent?.parentName ?? '', r.parent?.phone ?? '', r.student.no].some((v) =>
      v.toLowerCase().includes(k)
    )
  )
})

const registered = computed(() => Object.values(b.value?.parents ?? {}).filter((p) => p.phone || p.parentName).length)
const phoneCount = computed(() => Object.values(b.value?.parents ?? {}).filter((p) => p.phone).length)
const missingPhone = computed(() => Object.values(b.value?.parents ?? {}).filter((p) => !p.phone).length)

const fileInput = ref<HTMLInputElement | null>(null)

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const parsed = await fileToRows(file)
    const res = rowsToParents(parsed, students.value)
    if (res.errors.length) {
      message.value = `导入失败：${res.errors.join('；')}`
      return
    }
    await store.importParents(res.parents)
    message.value = `更新 ${Object.keys(res.parents).length} 位家长${res.warnings.length ? `（${res.warnings.slice(0, 3).join('；')}）` : ''}`
  } catch (err) {
    message.value = `读取失败：${err instanceof Error ? err.message : String(err)}`
  } finally {
    input.value = ''
  }
}

function exportPaper(): void {
  window.print()
}

async function exportExcelFile(): Promise<void> {
  const dataRows = rows.value.map((r) => [
    r.student.no,
    r.student.name,
    r.student.gender,
    r.parent?.parentName ?? '',
    r.parent?.relation ?? '',
    r.parent?.phone ?? ''
  ])
  await exportExcel(excelFileName('家长联系方式', store.cls ? `${store.cls.grade}${store.cls.name}` : '班级'), [
    { name: '家长联系表', headers: ['学号', '学生姓名', '性别', '家长姓名', '关系', '联系电话'], rows: dataRows }
  ])
}
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">家长联系方式</h3>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn tw-btn-primary" @click="fileInput?.click()">导入表格</button>
        <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" class="pt-file" @change="onFile" />
        <button type="button" class="tw-btn tw-no-print" @click="exportPaper">打印</button>
        <button type="button" class="tw-btn tw-no-print" @click="exportExcelFile">导出 Excel</button>
      </div>
    </div>

    <section class="tw-stat-grid">
      <TeacherStatCard :value="registered" label="已登记家长（人）" accent="#3fa37c" />
      <TeacherStatCard :value="phoneCount" label="联系电话（个）" accent="#6da3d8" />
      <TeacherStatCard :value="missingPhone" label="未填家长联系方式（人）" accent="#d98c3f" />
    </section>

    <section class="tw-card">
      <h4 class="tw-card-title">家长联系表</h4>
      <div class="tw-toolbar tw-no-print">
        <input v-model="keyword" class="tw-input" placeholder="搜索学生 / 家长 / 电话" />
        <span class="tw-spacer"></span>
        <span class="tw-label">共 {{ filtered.length }} 条</span>
      </div>
      <div class="tw-table-wrap">
        <table class="tw-table">
          <thead>
            <tr>
              <th>学号</th>
              <th>学生姓名</th>
              <th>性别</th>
              <th>家长姓名</th>
              <th>关系</th>
              <th>联系电话</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filtered" :key="r.student.id">
              <td class="tw-num">{{ r.student.no }}</td>
              <td>{{ r.student.name }}</td>
              <td class="tw-num">{{ r.student.gender }}</td>
              <td>{{ r.parent?.parentName || '-' }}</td>
              <td class="tw-num">{{ r.parent?.relation || '-' }}</td>
              <td class="tw-num">{{ r.parent?.phone || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!filtered.length" class="tw-empty">还没有家长信息，可导入表格或在「学生名单」里补录。</p>
      <p v-if="message" class="tw-note">{{ message }}</p>
    </section>
  </div>
</template>

<style scoped>
.pt-file {
  display: none;
}
</style>
