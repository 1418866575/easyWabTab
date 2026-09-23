<script setup lang="ts">
// 试卷分析：按试卷录入题目（题号/题型/知识点/我班错误人数），自动算错误率，
// 并按知识点汇总出「易错知识点排行」柱状图，用于讲评与针对性练习。

import { computed, ref, watch } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import { examStats } from '@/composables/teacherCore'
import { exportExcel, excelFileName } from '@/composables/teacherExcelCore'

const store = useTeacherStore()

const b = computed(() => store.bucket)
const papers = computed(() => b.value?.papers ?? [])
const exams = computed(() => b.value?.exams ?? [])

const selectedId = ref('')
watch(
  () => papers.value.map((p) => p.id).join(','),
  () => {
    if (!papers.value.some((p) => p.id === selectedId.value)) selectedId.value = papers.value[0]?.id ?? ''
  },
  { immediate: true }
)

const paper = computed(() => papers.value.find((p) => p.id === selectedId.value) ?? null)
const linkedExam = computed(() => exams.value.find((e) => e.id === paper.value?.examId) ?? null)
/** 参考人数：优先取关联考试的人数，否则用本班学生数 */
const refCount = computed(() => {
  const n = linkedExam.value ? examStats(linkedExam.value.scores).count : 0
  return n || (b.value?.students.length ?? 0)
})

const questions = computed(() => paper.value?.questions ?? [])

function errorRate(wrong: number): string {
  const n = refCount.value
  if (!n) return '-'
  return `${Math.round((wrong / n) * 1000) / 10}%`
}

function sortedByWrong() {
  return [...questions.value].sort((a, b2) => b2.wrongCount - a.wrongCount).slice(0, 8)
}

const CHART_W = 700
const chartRowH = 34
const chartHeight = computed(() => Math.max(80, sortedByWrong().length * chartRowH + 20))
const chartMax = computed(() => Math.max(1, ...sortedByWrong().map((q) => q.wrongCount)))

// ---------- 试卷增删 ----------
const newTitle = ref('')
const newExamId = ref('')

async function onAddPaper(): Promise<void> {
  if (!newTitle.value.trim()) return
  await store.addPaper(newExamId.value, newTitle.value)
  newTitle.value = ''
}

async function onDeletePaper(): Promise<void> {
  if (!paper.value) return
  if (!window.confirm(`删除试卷「${paper.value.title}」？`)) return
  await store.deletePaper(paper.value.id)
}

// ---------- 题目编辑 ----------
function commit(next: { no: number; type: string; point: string; wrongCount: number }[]): void {
  if (!paper.value) return
  void store.setPaperQuestions(paper.value.id, next)
}

function onField(i: number, field: 'no' | 'type' | 'point' | 'wrongCount', raw: string): void {
  const next = questions.value.map((q, idx) =>
    idx === i ? { ...q, [field]: field === 'wrongCount' || field === 'no' ? Number(raw) || 0 : raw } : q
  )
  commit(next)
}

function onAddQuestion(): void {
  commit([...questions.value, { no: questions.value.length + 1, type: '选择题', point: '', wrongCount: 0 }])
}

function onRemoveQuestion(i: number): void {
  commit(questions.value.filter((_, idx) => idx !== i))
}

function exportPaper(): void {
  window.print()
}

async function exportExcelFile(): Promise<void> {
  const rows = questions.value.map((q) => [q.no, q.type, q.point, q.wrongCount, errorRate(q.wrongCount)])
  await exportExcel(excelFileName(`试卷_${paper.value?.title ?? ''}`, store.cls ? `${store.cls.grade}${store.cls.name}` : '班级'), [
    { name: '题目明细', headers: ['题号', '题型', '知识点', '我班错误人数', '错误率'], rows }
  ])
}
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">试卷分析</h3>
        <p class="tw-subtitle">录题后自动计算错误率，并按知识点排出易错题，便于讲评。</p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn" @click="exportPaper">打印</button>
        <button type="button" class="tw-btn" @click="exportExcelFile">导出 Excel</button>
      </div>
    </div>

    <section class="tw-card tw-no-print">
      <h4 class="tw-card-title">试卷选择</h4>
      <div class="tw-toolbar">
        <select v-model="selectedId" class="tw-select">
          <option v-for="p in papers" :key="p.id" :value="p.id">{{ p.title }}</option>
          <option v-if="!papers.length" value="">暂无试卷</option>
        </select>
        <span class="tw-spacer"></span>
        <button type="button" class="tw-btn tw-btn-sm tw-btn-danger" :disabled="!paper" @click="onDeletePaper">删除本卷</button>
      </div>
      <div class="tw-toolbar pp-add">
        <label class="tw-label">试卷名<input v-model="newTitle" class="tw-input tw-input-sm" placeholder="如 语文期中试卷" /></label>
        <label class="tw-label">
          关联考试
          <select v-model="newExamId" class="tw-select tw-input-sm">
            <option value="">不关联</option>
            <option v-for="e in exams" :key="e.id" :value="e.id">{{ e.name }}</option>
          </select>
        </label>
        <button type="button" class="tw-btn tw-btn-sm tw-btn-primary" :disabled="!newTitle.trim()" @click="onAddPaper">新增试卷</button>
      </div>
    </section>

    <template v-if="paper">
      <section class="tw-card">
        <h4 class="tw-card-title">易错知识点排行</h4>
        <p class="tw-card-hint">参考人数 {{ refCount }} 人（取自关联考试；未关联时按班级人数）。</p>
        <svg
          v-if="sortedByWrong().length"
          class="pp-chart"
          :viewBox="`0 0 ${CHART_W} ${chartHeight}`"
          role="img"
          aria-label="易错知识点排行图"
        >
          <g v-for="(q, i) in sortedByWrong()" :key="`${q.no}-${q.point}-${i}`">
            <text x="0" :y="i * chartRowH + 22" font-size="12" fill="currentColor" fill-opacity="0.8">
              {{ q.no }}. {{ q.point || q.type }}
            </text>
            <rect x="180" :y="i * chartRowH + 8" width="400" height="18" rx="4" fill="currentColor" fill-opacity="0.08" />
            <rect
              x="180"
              :y="i * chartRowH + 8"
              :width="Math.max(2, (q.wrongCount / chartMax) * 400)"
              height="18"
              rx="4"
              fill="var(--color-danger, #ef4444)"
              fill-opacity="0.8"
            />
            <text x="592" :y="i * chartRowH + 22" font-size="12" fill="currentColor">
              {{ q.wrongCount }} 人 · {{ errorRate(q.wrongCount) }}
            </text>
          </g>
        </svg>
        <p v-else class="tw-empty">还没有题目数据。</p>
      </section>

      <section class="tw-card">
        <h4 class="tw-card-title">题目明细</h4>
        <div class="tw-toolbar tw-no-print">
          <button type="button" class="tw-btn tw-btn-sm tw-btn-primary" @click="onAddQuestion">添加题目</button>
        </div>
        <div class="tw-table-wrap">
          <table class="tw-table">
            <thead>
              <tr>
                <th>题号</th>
                <th>题型</th>
                <th>知识点</th>
                <th>我班错误人数</th>
                <th>错误率</th>
                <th class="tw-no-print">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(q, i) in questions" :key="i">
                <td><input class="tw-input tw-input-sm pp-no" type="number" :value="q.no" @change="onField(i, 'no', ($event.target as HTMLInputElement).value)" /></td>
                <td><input class="tw-input tw-input-sm" :value="q.type" @change="onField(i, 'type', ($event.target as HTMLInputElement).value)" /></td>
                <td><input class="tw-input tw-input-sm" :value="q.point" @change="onField(i, 'point', ($event.target as HTMLInputElement).value)" /></td>
                <td>
                  <input
                    class="tw-input tw-input-sm pp-wrong"
                    type="number"
                    :value="q.wrongCount"
                    @change="onField(i, 'wrongCount', ($event.target as HTMLInputElement).value)"
                  />
                </td>
                <td class="tw-num">{{ errorRate(q.wrongCount) }}</td>
                <td class="tw-no-print">
                  <button type="button" class="tw-btn tw-btn-sm tw-btn-danger" @click="onRemoveQuestion(i)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!questions.length" class="tw-empty">点击「添加题目」开始录入。</p>
      </section>
    </template>

    <p v-else class="tw-empty">还没有试卷，请先新增试卷。</p>
  </div>
</template>

<style scoped>
.pp-add {
  margin-top: 8px;
}

.pp-chart {
  width: 100%;
  height: auto;
  color: var(--color-text, #0f172a);
}

.pp-no,
.pp-wrong {
  width: 68px;
  text-align: center;
}
</style>
