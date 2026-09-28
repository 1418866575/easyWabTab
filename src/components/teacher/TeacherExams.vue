<script setup lang="ts">
// 成绩信息：考试选择 + 七项统计卡 + 分段柱状图 + 排名走势折线图 + 可编辑成绩表。
// 图表全部内联 SVG 手写（项目约定：不使用 echarts），纯计算委托 teacherCore。

import { computed, ref, watch } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import TeacherStatCard from './TeacherStatCard.vue'
import { bandCounts, examStats, rankRows } from '@/composables/teacherCore'
import { SCORE_BANDS } from '@/types/teacher'
import { exportExcel, excelFileName } from '@/composables/teacherExcelCore'
import SubjectSelect from '@/components/teacher/SubjectSelect.vue'
import ExamNameSelect from '@/components/ExamNameSelect.vue'

const store = useTeacherStore()

const b = computed(() => store.bucket)
const exams = computed(() => b.value?.exams ?? [])
const students = computed(() => b.value?.students ?? [])

const selectedId = ref('')
watch(
  () => exams.value.map((e) => e.id).join(','),
  () => {
    if (!exams.value.some((e) => e.id === selectedId.value)) {
      selectedId.value = exams.value[0]?.id ?? ''
    }
  },
  { immediate: true }
)

const exam = computed(() => exams.value.find((e) => e.id === selectedId.value) ?? null)
const stats = computed(() => examStats(exam.value?.scores ?? {}))
const bands = computed(() => bandCounts(exam.value?.scores ?? {}))
const rows = computed(() => (exam.value ? rankRows(exam.value, students.value) : []))

// ---------- 新增考试 ----------
const newName = ref('')
const newSubject = ref(store.cls?.subject || '')
const newDate = ref('')

watch(
  () => store.cls?.subject,
  (s) => { if (!newSubject.value.trim()) newSubject.value = s || '' }
)

async function onAddExam(): Promise<void> {
  if (!newName.value.trim()) return
  await store.addExam(newName.value, newSubject.value || store.cls?.subject || '', newDate.value)
  newName.value = ''
  newDate.value = ''
}

async function onDeleteExam(): Promise<void> {
  if (!exam.value) return
  if (!window.confirm(`删除考试「${exam.value.name}」及其成绩？此操作不可撤销。`)) return
  await store.deleteExam(exam.value.id)
}

// ---------- 成绩编辑 ----------
function onScore(studentId: string, raw: string): void {
  if (!exam.value) return
  const v = raw.trim() === '' ? null : Number(raw)
  void store.setScore(exam.value.id, studentId, v === null || Number.isNaN(v) ? null : v)
}

// ---------- 图表 ----------
const CHART_W = 700
const CHART_H = 220
const barMax = computed(() => Math.max(1, ...bands.value))
const barWidth = CHART_W / SCORE_BANDS.length

function barHeight(count: number): number {
  return Math.round((count / barMax.value) * (CHART_H - 46))
}

const linePoints = computed(() => {
  const list = rows.value
  if (!list.length) return ''
  const maxV = 100
  const step = list.length > 1 ? (CHART_W - 40) / (list.length - 1) : 0
  return list
    .map((r, i) => `${20 + i * step},${CHART_H - 30 - (r.score / maxV) * (CHART_H - 60)}`)
    .join(' ')
})

function exportPaper(): void {
  window.print()
}

async function exportExcelFile(): Promise<void> {
  const dataRows = rows.value.map((r) => [r.rank, r.no, r.name, r.gender, r.score, r.comment])
  await exportExcel(excelFileName(`成绩_${exam.value?.name ?? ''}`, store.cls ? `${store.cls.grade}${store.cls.name}` : '班级'), [
    { name: '成绩排名', headers: ['排名', '学号', '姓名', '性别', '成绩', '评价'], rows: dataRows }
  ])
}
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">成绩信息</h3>
        <p class="tw-subtitle">按考试查看分布与排名；成绩可直接编辑，修改后自动保存。</p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn" @click="exportPaper">打印</button>
        <button type="button" class="tw-btn" @click="exportExcelFile">导出 Excel</button>
      </div>
    </div>

    <section class="tw-card tw-no-print">
      <h4 class="tw-card-title">考试选择</h4>
      <div class="tw-toolbar">
        <select v-model="selectedId" class="tw-select">
          <option v-for="e in exams" :key="e.id" :value="e.id">{{ e.name }}{{ e.date ? `（${e.date}）` : '' }}</option>
          <option v-if="!exams.length" value="">暂无考试</option>
        </select>
        <span class="tw-spacer"></span>
        <button type="button" class="tw-btn tw-btn-sm tw-btn-danger" :disabled="!exam" @click="onDeleteExam">删除本场考试</button>
      </div>
      <div class="tw-toolbar ex-add">
        <label class="tw-label">考试名<ExamNameSelect v-model="newName" placeholder="如 语文期中" size="small" /></label>
        <label class="tw-label">
          学科
          <SubjectSelect v-model="newSubject" placeholder="请选择学科" size="small" />
        </label>
        <label class="tw-label">日期<input v-model="newDate" class="tw-input tw-input-sm" placeholder="如 2026-04" /></label>
        <button type="button" class="tw-btn tw-btn-sm tw-btn-primary" :disabled="!newName.trim()" @click="onAddExam">新增考试</button>
        <span class="tw-label">批量成绩请到设置页「导入数据」</span>
      </div>
    </section>

    <template v-if="exam">
      <section class="tw-stat-grid">
        <TeacherStatCard :value="stats.count" label="参考人数" accent="#6da3d8" />
        <TeacherStatCard :value="stats.max" label="最高分" accent="#3fa37c" />
        <TeacherStatCard :value="stats.min" label="最低分" accent="#f0b429" />
        <TeacherStatCard :value="stats.avg" label="平均分" accent="#8b7ec8" />
        <TeacherStatCard :value="`${stats.passRate}%`" label="及格率（≥60）" accent="#3fa37c" />
        <TeacherStatCard :value="`${stats.poorRate}%`" label="过差率（&lt;40）" accent="#ef4444" />
        <TeacherStatCard :value="`${stats.excellentRate}%`" label="优秀率（≥90）" accent="#f0b429" />
      </section>

      <section class="tw-card">
        <h4 class="tw-card-title">成绩分段分布</h4>
        <svg class="ex-chart" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" role="img" aria-label="成绩分段分布柱状图">
          <line x1="0" :y1="CHART_H - 30" :x2="CHART_W" :y2="CHART_H - 30" stroke="currentColor" stroke-opacity="0.25" stroke-width="1" />
          <g v-for="(band, i) in SCORE_BANDS" :key="band.label">
            <rect
              :x="i * barWidth + barWidth * 0.18"
              :y="CHART_H - 30 - barHeight(bands[i])"
              :width="barWidth * 0.64"
              :height="barHeight(bands[i])"
              rx="4"
              fill="var(--color-primary, #3b82f6)"
              :fill-opacity="0.85"
            />
            <text :x="i * barWidth + barWidth / 2" :y="CHART_H - 34 - barHeight(bands[i])" text-anchor="middle" font-size="12" fill="currentColor">
              {{ bands[i] }}
            </text>
            <text :x="i * barWidth + barWidth / 2" :y="CHART_H - 12" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity="0.7">
              {{ band.label }}
            </text>
          </g>
        </svg>
      </section>

      <section class="tw-card">
        <h4 class="tw-card-title">学生成绩排名走势</h4>
        <svg v-if="linePoints" class="ex-chart" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" role="img" aria-label="学生成绩排名走势折线图">
          <line x1="20" :y1="CHART_H - 30" :x2="CHART_W - 20" :y2="CHART_H - 30" stroke="currentColor" stroke-opacity="0.25" stroke-width="1" />
          <polyline :points="linePoints" fill="none" stroke="var(--color-primary, #3b82f6)" stroke-width="2" />
          <circle
            v-for="(r, i) in rows"
            :key="r.studentId"
            :cx="20 + (rows.length > 1 ? i * ((CHART_W - 40) / (rows.length - 1)) : 0)"
            :cy="CHART_H - 30 - (r.score / 100) * (CHART_H - 60)"
            r="3"
            fill="var(--color-primary, #3b82f6)"
          >
            <title>{{ r.name }} {{ r.score }}</title>
          </circle>
          <text v-if="rows.length" x="20" :y="CHART_H - 10" font-size="11" fill="currentColor" fill-opacity="0.7">{{ rows[0].name }}</text>
          <text v-if="rows.length" :x="CHART_W - 20" :y="CHART_H - 10" text-anchor="end" font-size="11" fill="currentColor" fill-opacity="0.7">
            {{ rows[rows.length - 1].name }}
          </text>
        </svg>
        <p v-else class="tw-empty">暂无成绩数据。</p>
      </section>

      <section class="tw-card">
        <h4 class="tw-card-title">成绩录入表</h4>
        <div class="tw-table-wrap">
          <table class="tw-table">
            <thead>
              <tr>
                <th>排名</th>
                <th>学号</th>
                <th>姓名</th>
                <th>性别</th>
                <th>成绩</th>
                <th>评价</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.studentId">
                <td class="tw-num">{{ r.rank }}</td>
                <td class="tw-num">{{ r.no }}</td>
                <td>{{ r.name }}</td>
                <td class="tw-num">{{ r.gender }}</td>
                <td>
                  <input
                    class="tw-input tw-input-sm ex-score"
                    type="number"
                    :value="r.score"
                    @change="onScore(r.studentId, ($event.target as HTMLInputElement).value)"
                  />
                </td>
                <td class="tw-num">{{ r.comment }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!rows.length" class="tw-empty">本场考试还没有成绩。</p>
      </section>
    </template>

    <p v-else class="tw-empty">还没有考试，请先「新增考试」或到设置页「导入数据」导入成绩。</p>
  </div>
</template>

<style scoped>
.ex-add {
  margin-top: 8px;
}

.ex-chart {
  width: 100%;
  height: auto;
  color: var(--color-text, #0f172a);
}

.ex-score {
  width: 72px;
  text-align: center;
}
</style>
