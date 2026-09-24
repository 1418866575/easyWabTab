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

const pool = computed(() => {
  if (state.value.mode === 'once') return students.value.filter((s) => !history.value.includes(s.id))
  return students.value
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
    display.value = state.value.mode === 'once' ? '全部学生都已点过' : '还没有学生'
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
        <p class="tw-subtitle">课堂提问随机抽人；「只点一遍」模式下已点过的学生不再出现。</p>
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
          <select class="tw-select tw-input-sm" :value="state.mode" @change="setMode(($event.target as HTMLSelectElement).value as 'all' | 'once')">
            <option value="all">全部学生</option>
            <option value="once">只点一遍（排除已点）</option>
          </select>
        </label>
        <button type="button" class="tw-btn tw-btn-sm" @click="reset">重置记录</button>
        <span class="tw-label">候选 {{ pool.length }} 人 / 已点 {{ history.length }} 人</span>
      </div>
    </section>

    <section class="tw-card">
      <h4 class="tw-card-title">点名历史</h4>
      <div v-if="history.length" class="rd-history">
        <span v-for="(id, i) in history" :key="`${id}-${i}`" class="rd-tag">{{ nameOf(id) }}</span>
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
  border-radius: var(--radius-md, 12px);
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
  padding: 4px 10px;
  border-radius: 999px;
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-size: var(--font-size-sm, 12px);
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
