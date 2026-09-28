<script setup lang="ts">
// 班委信息：从值日生模块迁出的独立模块。
// - 列表字段：序号 / 学号（按所选学生反查）/ 姓名（学生可搜索下拉）/ 职务（可搜索下拉+允许自定义）/ 职责 / 操作。
// - 数据落在 ClassBucket.committee（按班级隔离），与学生信息「职务」双向联动：
//   此处增删改 → 学生.职务 自动同步；学生信息改职务 → 回写此处（见 stores/teacher.ts 的 syncStudentPosts / updateStudent）。

import { computed } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import { sortedStudents } from '@/composables/teacherCore'
import { exportExcel, excelFileName } from '@/composables/teacherExcelCore'
import CommitteeRoleSelect from '@/components/teacher/CommitteeRoleSelect.vue'

const store = useTeacherStore()

const b = computed(() => store.bucket)
const students = computed(() => sortedStudents(b.value?.students ?? []))
const committee = computed(() => b.value?.committee ?? [])

const studentOf = (id: string) => students.value.find((s) => s.id === id)
const noOf = (id: string): string => studentOf(id)?.no ?? ''
const nameOf = (id: string): string => studentOf(id)?.name ?? ''

type Field = 'studentId' | 'role' | 'duty'

function onField(i: number, field: Field, value: string): void {
  const next = committee.value.map((c, idx) => (idx === i ? { ...c, [field]: value } : c))
  void store.setCommittee(next)
}

function onStudentChange(i: number, val: unknown): void {
  onField(i, 'studentId', typeof val === 'string' ? val : '')
}

function onRoleChange(i: number, val: unknown): void {
  onField(i, 'role', typeof val === 'string' ? val : '')
}

function onAdd(): void {
  void store.setCommittee([...committee.value, { studentId: '', role: '', duty: '' }])
}

function onRemove(i: number): void {
  void store.setCommittee(committee.value.filter((_, idx) => idx !== i))
}

function exportPaper(): void {
  window.print()
}

async function exportExcelFile(): Promise<void> {
  const rows = committee.value.map((c, i) => [i + 1, noOf(c.studentId), nameOf(c.studentId), c.role, c.duty])
  await exportExcel(
    excelFileName('班委信息', store.cls ? `${store.cls.grade}${store.cls.name}` : '班级'),
    [{ name: '班委名单', headers: ['序号', '学号', '姓名', '职务', '职责'], rows }]
  )
}
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">班委信息</h3>
        <p class="tw-subtitle">设置班级班委（职务 / 姓名 / 职责）；学生信息中的「职务」会随此处自动同步。修改后自动保存。</p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn" @click="exportPaper">打印</button>
        <button type="button" class="tw-btn" @click="exportExcelFile">导出 Excel</button>
      </div>
    </div>

    <section class="tw-card">
      <h4 class="tw-card-title">班委名单</h4>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn tw-btn-sm tw-btn-primary" @click="onAdd">添加班委</button>
        <span class="tw-label">职务支持搜索与自定义；姓名从学生名单中选择（自动带出学号）。</span>
      </div>

      <div class="tw-table-wrap">
        <table class="tw-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>学号</th>
              <th>姓名</th>
              <th>职务</th>
              <th>职责</th>
              <th class="tw-no-print">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(c, i) in committee" :key="i">
              <td class="tw-num">{{ i + 1 }}</td>
              <td class="tw-num">{{ noOf(c.studentId) }}</td>
              <td>
                <el-select
                  :model-value="c.studentId"
                  filterable
                  clearable
                  size="small"
                  placeholder="选择学生"
                  class="cm-stu-select"
                  @update:model-value="(val: unknown) => onStudentChange(i, val)"
                >
                  <el-option v-for="s in students" :key="s.id" :value="s.id" :label="`${s.name}（${s.no}）`" />
                </el-select>
              </td>
              <td>
                <CommitteeRoleSelect :model-value="c.role" :size="'small'" @update:model-value="(val: unknown) => onRoleChange(i, val)" />
              </td>
              <td>
                <input
                  class="tw-input tw-input-sm"
                  :value="c.duty"
                  placeholder="职责说明"
                  @change="onField(i, 'duty', ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="tw-no-print">
                <button type="button" class="tw-btn tw-btn-sm tw-btn-danger" @click="onRemove(i)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!committee.length" class="tw-empty">还没有班委，点击「添加班委」新增。</p>
      <p v-else-if="committee.some((c) => !c.studentId)" class="tw-note tw-note-warn">有班委未选择姓名，请先指定学生以带出学号。</p>
    </section>
  </div>
</template>

<style scoped>
.cm-stu-select {
  width: 100%;
  min-width: 140px;
}
</style>
