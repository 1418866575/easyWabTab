<script setup lang="ts">
// 随机点名：名字快速轮换（间隔递增减速后停），落定后写入历史。
// 「只点一遍」模式排除已点过的学生；可重置记录。定时器在卸载时清理，避免泄漏。

import { computed, onBeforeUnmount, ref } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import { sortedStudents } from '@/composables/teacherCore'

const store = useTeacherStore()

const b = computed(() => store.bucket)
const students = computed(() => sortedStudents(b.value?.students ?? []))
const state = computed(() => b.value?.random ?? { history: [], mode: 'all' as const })
const history = computed(() => state.value.history)

// ---------- 名单筛选：男生 / 女生 / 班委（单一或组合，组合取交集）----------
type FilterMode = 'male' | 'female' | 'committee'
const FILTER_LABELS: Record<FilterMode, string> = { male: '男生', female: '女生', committee: '班委' }
const filterModes: FilterMode[] = ['male', 'female', 'committee']
const activeFilters = ref<FilterMode[]>([])

const committeeRoleMap = computed(() => {
  const m = new Map<string, string>()
  for (const c of b.value?.committee ?? []) {
    const prev = m.get(c.studentId)
    m.set(c.studentId, prev ? `${prev}、${c.role}` : c.role)
  }
  return m
})
const isCommittee = (id: string): boolean => committeeRoleMap.value.has(id)
function roleOf(id: string): string {
  return committeeRoleMap.value.get(id) ?? ''
}

const filteredStudents = computed(() => {
  if (!activeFilters.value.length) return students.value
  return students.value.filter((s) =>
    activeFilters.value.every((f) => {
      if (f === 'male') return s.gender === '男'
      if (f === 'female') return s.gender === '女'
      return isCommittee(s.id)
    })
  )
})

const filterSummary = computed(() =>
  activeFilters.value.length ? activeFilters.value.map((f) => FILTER_LABELS[f]).join(' + ') : '全部学生'
)

const stats = computed(() => {
  const all = students.value
  return {
    total: all.length,
    male: all.filter((s) => s.gender === '男').length,
    female: all.filter((s) => s.gender === '女').length,
    committee: all.filter((s) => isCommittee(s.id)).length
  }
})

function toggleFilter(f: FilterMode): void {
  activeFilters.value = activeFilters.value.includes(f)
    ? activeFilters.value.filter((x) => x !== f)
    : [...activeFilters.value, f]
}
function clearFilters(): void {
  activeFilters.value = []
}

const pool = computed(() => {
  if (state.value.mode === 'once') return filteredStudents.value.filter((s) => !history.value.includes(s.id))
  return filteredStudents.value
})

const rolling = ref(false)
const display = ref('准备点名')
const picked = ref<{ id: string; name: string } | null>(null)

let timer: number | null = null
let elapsed = 0

function stopTimer(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

function start(): void {
  if (rolling.value) return
  if (!pool.value.length) {
    display.value =
      state.value.mode === 'once'
        ? '该范围内学生都已点过'
        : activeFilters.value.length
          ? '当前筛选条件下没有学生'
          : '还没有学生'
    return
  }
  rolling.value = true
  picked.value = null
  elapsed = 0
  stopTimer()
  // 间隔随时间递增（越滚越慢），约 2 秒后停下
  timer = window.setInterval(() => {
    elapsed += 60
    const idx = Math.floor(Math.random() * pool.value.length)
    display.value = pool.value[idx].name
    if (elapsed >= 1800) {
      stopTimer()
      rolling.value = false
      const final = pool.value[idx]
      picked.value = { id: final.id, name: final.name }
      void store.pushRandomHistory(final.id)
    }
  }, 60) as unknown as number
}

async function setMode(m: 'all' | 'once'): Promise<void> {
  await store.setRandomMode(m)
}

async function reset(): Promise<void> {
  await store.resetRandomHistory()
  picked.value = null
  display.value = '准备点名'
}

async function removeHistory(id: string): Promise<void> {
  await store.removeRandomHistory(id)
}

function nameOf(id: string): string {
  return students.value.find((s) => s.id === id)?.name ?? '（已移除）'
}

onBeforeUnmount(stopTimer)
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">点名</h3>
        <p class="tw-subtitle">课堂提问随机抽人；可按「男生 / 女生 / 班委」单一或组合筛选点名范围，「只点一遍」模式下已点过的学生不再出现。</p>
      </div>
    </div>

    <section class="tw-card">
      <h4 class="tw-card-title">点名器</h4>
      <div class="rd-stage">
        <div class="rd-display" :class="{ 'is-rolling': rolling, 'is-picked': !!picked }">{{ display }}</div>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn tw-btn-primary rd-start" :disabled="rolling || !pool.length" @click="start">
          {{ rolling ? '点名中…' : '开始点名' }}
        </button>
        <label class="tw-label">
          模式
          <el-select size="small" :model-value="state.mode" @change="(val: unknown) => setMode(val as 'all' | 'once')">
            <el-option value="all" label="全部学生" />
            <el-option value="once" label="只点一遍（排除已点）" />
          </el-select>
        </label>
        <button type="button" class="tw-btn tw-btn-sm" @click="reset">重置记录</button>
        <span class="tw-label">候选 {{ pool.length }} 人 / 已点 {{ history.length }} 人</span>
      </div>
    </section>

    <section class="tw-card">
      <h4 class="tw-card-title">名单筛选</h4>
      <div class="rd-filters">
        <button type="button" class="rd-chip" :class="{ 'is-active': activeFilters.length === 0 }" @click="clearFilters">全部</button>
        <button
          v-for="f in filterModes"
          :key="f"
          type="button"
          class="rd-chip"
          :class="{ 'is-active': activeFilters.includes(f) }"
          @click="toggleFilter(f)"
        >{{ FILTER_LABELS[f] }}</button>
      </div>
      <p class="rd-filter-summary">当前筛选：{{ filterSummary }}（共 {{ filteredStudents.length }} 人）</p>
      <div class="rd-stats">
        <span class="rd-stat">总人数 {{ stats.total }}</span>
        <span class="rd-stat">男生 {{ stats.male }}</span>
        <span class="rd-stat">女生 {{ stats.female }}</span>
        <span class="rd-stat">班委 {{ stats.committee }}</span>
      </div>
      <div v-if="filteredStudents.length" class="rd-roster">
        <span
          v-for="s in filteredStudents"
          :key="s.id"
          class="rd-roster-tag"
          :class="{ 'is-committee': isCommittee(s.id) }"
        >
          {{ s.name }}
          <em v-if="s.gender === '男'" class="rd-gender rd-male">♂</em>
          <em v-else-if="s.gender === '女'" class="rd-gender rd-female">♀</em>
          <em v-if="isCommittee(s.id)" class="rd-role">{{ roleOf(s.id) }}</em>
        </span>
      </div>
      <p v-else class="tw-empty">当前筛选条件下没有学生。</p>
    </section>

    <section class="tw-card">
      <h4 class="tw-card-title">点名历史</h4>
      <div v-if="history.length" class="rd-history">
        <span v-for="(id, i) in history" :key="`${id}-${i}`" class="rd-tag">
          {{ nameOf(id) }}
          <button type="button" class="rd-tag-remove" :title="`移除 ${nameOf(id)}`" @click="removeHistory(id)">×</button>
        </span>
      </div>
      <p v-else class="tw-empty">还没有点名记录。</p>
    </section>
  </div>
</template>

<style scoped>
.rd-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 12px;
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-hover, #f1f5f9);
}

.rd-display {
  font-size: 40px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-text, #0f172a);
  letter-spacing: 0.08em;
  transition: color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}

.rd-display.is-rolling {
  color: var(--color-text-secondary, #64748b);
}

.rd-display.is-picked {
  color: var(--color-primary, #3b82f6);
}

.rd-start {
  min-width: 120px;
}

.rd-history {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.rd-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px 3px 10px;
  border-radius: 999px;
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-size: var(--font-size-sm, 12px);
}

.rd-tag-remove {
  flex: none;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.55;
  transition: background 0.15s ease, opacity 0.15s ease;
}

.rd-tag-remove:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.08);
}

/* ---------- 名单筛选 ---------- */
.rd-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.rd-chip {
  padding: 5px 14px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background: var(--color-bg-card, #fff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 12px);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.rd-chip:hover {
  border-color: var(--color-primary, #3b82f6);
}

.rd-chip.is-active {
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  color: #fff;
}

.rd-filter-summary {
  margin: 0 0 8px;
  font-size: var(--font-size-sm, 12px);
  color: var(--color-text-secondary, #64748b);
}

.rd-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-bottom: 12px;
}

.rd-stat {
  font-size: var(--font-size-sm, 12px);
  color: var(--color-text, #334155);
}

.rd-stat::before {
  content: '·';
  margin-right: 6px;
  color: var(--color-border, #cbd5e1);
}

.rd-roster {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.rd-roster-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text, #334155);
  font-size: var(--font-size-sm, 12px);
}

.rd-roster-tag.is-committee {
  background: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
}

.rd-gender {
  font-style: normal;
  opacity: 0.65;
}

.rd-gender.rd-male {
  color: #2563eb;
}

.rd-gender.rd-female {
  color: #db2777;
}

.rd-role {
  font-style: normal;
  font-size: 11px;
  opacity: 0.9;
}

@media (max-width: 768px) {
  .rd-display {
    font-size: 30px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rd-display {
    transition: none;
  }
}
</style>
