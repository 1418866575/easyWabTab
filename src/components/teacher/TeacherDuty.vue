<script setup lang="ts">
// 值日生表：周一~周五值日安排（名单按顿号「、」编辑）+ 班委名单与职责。
// 名单存 studentId，界面展示姓名；保存时按姓名回查 id，姓名不存在则提示且不写入该人。

import { computed, ref } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import { sortedStudents } from '@/composables/teacherCore'
import { exportExcel, excelFileName } from '@/composables/teacherExcelCore'

const store = useTeacherStore()

const b = computed(() => store.bucket)
const students = computed(() => sortedStudents(b.value?.students ?? []))
const days = computed(() => b.value?.duty.days ?? [])

const nameOf = (id: string): string => students.value.find((s) => s.id === id)?.name ?? ''
const idOf = (name: string): string => students.value.find((s) => s.name === name.trim())?.id ?? ''

const warning = ref('')

/** 名单文本（姓名、顿号分隔） */
function membersText(ids: string[]): string {
  return ids.map(nameOf).filter(Boolean).join('、')
}

async function onMembersChange(day: string, raw: string, currentLeader: string): Promise<void> {
  const names = raw
    .split(/[、,，]/)
    .map((n) => n.trim())
    .filter(Boolean)
  const ids: string[] = []
  const missing: string[] = []
  for (const n of names) {
    const id = idOf(n)
    if (id) ids.push(id)
    else missing.push(n)
  }
  warning.value = missing.length ? `未找到：${missing.join('、')}（已忽略）` : ''
  await store.setDutyMembers(day, ids, currentLeader && ids.includes(currentLeader) ? currentLeader : ids[0] ?? '')
}

async function onLeaderChange(day: string, leaderId: string, members: string[]): Promise<void> {
  await store.setDutyMembers(day, members, leaderId)
}

const groupSize = ref(8)

async function onAuto(): Promise<void> {
  await store.autoDuty(groupSize.value)
  warning.value = ''
}

function exportPaper(): void {
  window.print()
}

async function exportExcelFile(): Promise<void> {
  const dutyRows = days.value.map((d) => [d.day, membersText(d.members), nameOf(d.leader)])
  await exportExcel(excelFileName('值日生表', store.cls ? `${store.cls.grade}${store.cls.name}` : '班级'), [
    { name: '值日生安排', headers: ['星期', '值日生名单', '小组长'], rows: dutyRows }
  ])
}
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">值日生表</h3>
        <p class="tw-subtitle">值日生名单用顿号「、」分隔，可直接编辑；修改后自动保存。</p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn" @click="exportPaper">打印</button>
        <button type="button" class="tw-btn" @click="exportExcelFile">导出 Excel</button>
      </div>
    </div>

    <section class="tw-card">
      <h4 class="tw-card-title">值日生安排</h4>
      <div class="tw-toolbar tw-no-print">
        <label class="tw-label">每组人数<input v-model.number="groupSize" type="number" min="1" class="tw-input tw-input-sm dt-num" /></label>
        <button type="button" class="tw-btn tw-btn-sm tw-btn-primary" @click="onAuto">按名单自动安排</button>
        <span class="tw-label">按学号顺序轮流分配，组长为组内学号最靠前者。</span>
      </div>

      <div class="tw-table-wrap">
        <table class="tw-table">
          <thead>
            <tr>
              <th>星期</th>
              <th>值日生名单（顿号分隔）</th>
              <th>小组长</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in days" :key="d.day">
              <td class="tw-num">{{ d.day }}</td>
              <td>
                <input
                  class="tw-input tw-input-sm dt-members"
                  :value="membersText(d.members)"
                  placeholder="如 闫婉、曹静、夏梓"
                  @change="onMembersChange(d.day, ($event.target as HTMLInputElement).value, d.leader)"
                />
              </td>
              <td>
                <select
                  class="tw-select tw-input-sm"
                  :value="d.leader"
                  @change="onLeaderChange(d.day, ($event.target as HTMLSelectElement).value, d.members)"
                >
                  <option value="">未指定</option>
                  <option v-for="s in students" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="warning" class="tw-note tw-note-warn">{{ warning }}</p>
      <p v-if="!students.length" class="tw-empty">请先到设置页「导入数据」导入学生名单。</p>
    </section>
  </div>
</template>

<style scoped>
.dt-num {
  width: 72px;
}

.dt-members {
  min-width: 260px;
}
</style>
