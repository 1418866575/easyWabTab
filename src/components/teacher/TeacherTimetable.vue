<script setup lang="ts">
// 课程表：行=节次（时间可配置），列=周一~周六；点击格子即可编辑科目，修改自动保存。
// 支持清空课程表与打印（打印按钮已加 tw-no-print，打印样式隐藏无关元素）。

import { computed, nextTick, ref } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import { WEEK_DAYS } from '@/types/teacher'
import { exportExcel, excelFileName } from '@/composables/teacherExcelCore'

const store = useTeacherStore()

const b = computed(() => store.bucket)
const periods = computed(() => b.value?.timetable.periods ?? [])
const grid = computed(() => b.value?.timetable.grid ?? [])

const editing = ref<{ p: number; d: number } | null>(null)
const draft = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

/** 用函数式 ref：单元格输入框位于 v-for 内，字符串 ref 会退化成数组 */
function setInputRef(el: unknown): void {
  inputRef.value = (el as HTMLInputElement | null) ?? null
}

async function beginEdit(p: number, d: number): Promise<void> {
  editing.value = { p, d }
  draft.value = grid.value[p]?.[d] ?? ''
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
}

async function commit(): Promise<void> {
  if (!editing.value) return
  const { p, d } = editing.value
  editing.value = null
  await store.setTimetableCell(p, d, draft.value)
}

function cancel(): void {
  editing.value = null
}

async function onClear(): Promise<void> {
  if (!window.confirm('清空整个课程表？')) return
  await store.clearTimetable()
}

async function onPeriodField(i: number, field: 'label' | 'time', value: string): Promise<void> {
  const next = periods.value.map((p, idx) => (idx === i ? { ...p, [field]: value } : p))
  await store.setTimetablePeriods(next)
}

function exportPaper(): void {
  window.print()
}

async function exportExcelFile(): Promise<void> {
  const rows = periods.value.map((p, i) => [`${p.label} ${p.time}`, ...(grid.value[i] ?? [])])
  await exportExcel(excelFileName('课程表', store.cls ? `${store.cls.grade}${store.cls.name}` : '班级'), [
    { name: '课程表', headers: ['节次', ...WEEK_DAYS], rows }
  ])
}
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">课程表</h3>
        <p class="tw-subtitle">点击任意格子即可编辑科目；节次名称与时间可直接修改。</p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn" @click="exportPaper">打印</button>
        <button type="button" class="tw-btn" @click="exportExcelFile">导出 Excel</button>
        <button type="button" class="tw-btn tw-btn-danger" @click="onClear">清空课程表</button>
      </div>
    </div>

    <section class="tw-card">
      <h4 class="tw-card-title">本周课程表</h4>
      <div class="tw-table-wrap">
        <table class="tw-table tt-table">
          <thead>
            <tr>
              <th class="tt-period-head">节次</th>
              <th v-for="d in WEEK_DAYS" :key="d">{{ d }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, pi) in periods" :key="pi">
              <td class="tt-period">
                <div class="tt-period-label">{{ p.label }}</div>
                <div class="tt-period-time">{{ p.time }}</div>
              </td>
              <td v-for="(day, di) in WEEK_DAYS" :key="day" class="tt-cell">
                <button
                  v-if="editing && editing.p === pi && editing.d === di"
                  type="button"
                  class="tt-cell-btn"
                  @click="commit"
                >
                  保存
                </button>
                <input
                  v-if="editing && editing.p === pi && editing.d === di"
                  :ref="setInputRef"
                  v-model="draft"
                  class="tw-input tw-input-sm tt-input"
                  placeholder="科目"
                  @keyup.enter="commit"
                  @keyup.esc="cancel"
                  @blur="commit"
                />
                <button v-else type="button" class="tt-cell-btn tt-cell-empty" @click="beginEdit(pi, di)">
                  {{ grid[pi]?.[di] || '＋' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="tw-card tw-no-print">
      <h4 class="tw-card-title">节次时间</h4>
      <div class="tt-periods">
        <div v-for="(p, i) in periods" :key="i" class="tt-period-row">
          <input class="tw-input tw-input-sm tt-p-label" :value="p.label" @change="onPeriodField(i, 'label', ($event.target as HTMLInputElement).value)" />
          <input class="tw-input tw-input-sm tt-p-time" :value="p.time" @change="onPeriodField(i, 'time', ($event.target as HTMLInputElement).value)" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tt-table th,
.tt-table td {
  text-align: center;
}

.tt-period-head {
  width: 96px;
}

.tt-period {
  background-color: var(--color-bg-hover, #f1f5f9);
}

.tt-period-label {
  font-weight: var(--font-weight-semibold, 600);
}

.tt-period-time {
  font-size: var(--font-size-xs, 11px);
  color: var(--color-text-muted, #94a3b8);
}

.tt-cell {
  padding: 4px;
}

.tt-cell-btn {
  width: 100%;
  min-height: 34px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 8px);
  background-color: transparent;
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
  cursor: pointer;
  transition: background-color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}

.tt-cell-btn:hover {
  background-color: var(--color-primary-soft, #eff6ff);
}

.tt-cell-empty {
  color: var(--color-text-muted, #94a3b8);
}

.tt-input {
  width: 100%;
}

.tt-periods {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.tt-period-row {
  display: flex;
  gap: 6px;
}

.tt-p-label {
  width: 72px;
}

.tt-p-time {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
