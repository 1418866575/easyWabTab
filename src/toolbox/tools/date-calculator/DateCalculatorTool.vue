<script setup lang="ts">
/**
 * 日期计算器：日期推算（±N 天/月/年）与日期间隔（含工作日口径）
 */
import { computed, ref } from 'vue'
import {
  addDays,
  addMonths,
  addYears,
  diffDays,
  isDateStr,
  MAX_DATE,
  MIN_DATE,
  WEEKDAY_NAMES,
  weekdayOf,
  workdaysBetween
} from './dateCalcCore'
import { useDirtyFlag } from '../../prefs/useToolDirty'

type Mode = 'add' | 'diff'
type Unit = 'day' | 'month' | 'year'

const mode = ref<Mode>('add')

const base = ref(todayStr())
const unit = ref<Unit>('day')
const amount = ref(30)
const from = ref(todayStr())
const to = ref(plus(todayStr(), 90))
const inclusive = ref(false)

useDirtyFlag(() => true)

function todayStr(): string {
  const d = new Date()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mo}-${dd}`
}

function plus(s: string, n: number): string {
  return addDays(s, n) ?? s
}

const baseOk = computed(() => isDateStr(base.value))
const fromOk = computed(() => isDateStr(from.value))
const toOk = computed(() => isDateStr(to.value))

const computedDate = computed(() => {
  if (!baseOk.value) return null
  const n = Math.trunc(Number(amount.value) || 0)
  return unit.value === 'day' ? addDays(base.value, n) : unit.value === 'month' ? addMonths(base.value, n) : addYears(base.value, n)
})

const computedWeekday = computed(() => (computedDate.value ? weekdayOf(computedDate.value) : null))

const diff = computed(() => {
  if (!fromOk.value || !toOk.value) return null
  return diffDays(from.value, to.value, inclusive.value)
})

const workInfo = computed(() => {
  if (!fromOk.value || !toOk.value) return null
  return workdaysBetween(from.value, to.value)
})

const rangeErr = computed(() => {
  const bad: string[] = []
  if (base.value && !baseOk.value) bad.push('基准日期')
  if (from.value && !fromOk.value) bad.push('起始日期')
  if (to.value && !toOk.value) bad.push('结束日期')
  return bad
})
</script>

<template>
  <div class="tu-t1">
    <div class="tu-toolbar">
      <div class="tu-seg">
        <button type="button" :class="{ 'is-on': mode === 'add' }" @click="mode = 'add'">日期推算</button>
        <button type="button" :class="{ 'is-on': mode === 'diff' }" @click="mode = 'diff'">日期间隔</button>
      </div>
      <span class="tu-spacer"></span>
      <span class="tu-hint dc-inline">支持范围 {{ MIN_DATE }} ~ {{ MAX_DATE }}</span>
    </div>

    <p v-if="rangeErr.length" class="tu-alert">{{ rangeErr.join(' / ') }}格式应为 YYYY-MM-DD</p>

    <template v-if="mode === 'add'">
      <div class="tu-row">
        <label class="tu-label dc-inline">基准日期</label>
        <input v-model="base" type="date" class="tu-input dc-date" :min="MIN_DATE" :max="MAX_DATE" />
      </div>
      <div class="tu-row">
        <div class="tu-seg">
          <button type="button" :class="{ 'is-on': unit === 'day' }" @click="unit = 'day'">天</button>
          <button type="button" :class="{ 'is-on': unit === 'month' }" @click="unit = 'month'">月</button>
          <button type="button" :class="{ 'is-on': unit === 'year' }" @click="unit = 'year'">年</button>
        </div>
        <label class="tu-label dc-inline">增减</label>
        <input v-model.number="amount" type="number" class="tu-input dc-num" step="1" />
        <span class="tu-hint dc-inline">支持负数表示往前推</span>
      </div>

      <div class="tu-card">
        <div class="tu-card-title">推算结果</div>
        <div class="tu-card-value">
          {{ computedDate || '—' }}
          <span v-if="computedWeekday !== null" class="dc-wd">{{ WEEKDAY_NAMES[computedWeekday] }}</span>
        </div>
      </div>
      <p v-if="baseOk && !computedDate" class="tu-alert">结果超出支持范围（{{ MIN_DATE }} ~ {{ MAX_DATE }}）。</p>
      <p class="tu-hint">按月/年推算时，月末溢出会钳制到当月最后一天（如 1/31 + 1 个月 → 2/28）。</p>
    </template>

    <template v-else>
      <div class="tu-row">
        <label class="tu-label dc-inline">起始日期</label>
        <input v-model="from" type="date" class="tu-input dc-date" :min="MIN_DATE" :max="MAX_DATE" />
        <label class="tu-label dc-inline">结束日期</label>
        <input v-model="to" type="date" class="tu-input dc-date" :min="MIN_DATE" :max="MAX_DATE" />
      </div>
      <div class="tu-row">
        <label class="tu-check" :class="{ 'is-on': inclusive }">
          <input v-model="inclusive" type="checkbox" /> 含首尾两天
        </label>
      </div>

      <div class="tu-grid">
        <div class="tu-card">
          <div class="tu-card-title">相隔天数</div>
          <div class="tu-card-value">{{ diff === null ? '—' : diff }}</div>
        </div>
        <div class="tu-card">
          <div class="tu-card-title">工作日天数</div>
          <div class="tu-card-value">{{ workInfo ? workInfo.workdays : '—' }}</div>
        </div>
        <div class="tu-card">
          <div class="tu-card-title">自然日总数</div>
          <div class="tu-card-value">{{ workInfo ? workInfo.total : '—' }}</div>
        </div>
        <div class="tu-card">
          <div class="tu-card-title">折算周数</div>
          <div class="tu-card-value">{{ diff === null ? '—' : (diff / 7).toFixed(1) }}</div>
        </div>
      </div>
      <p v-if="workInfo?.uncovered" class="tu-alert info">
        所选区间含内置节假日表未覆盖的年份，该年份仅按周末排除计算。
      </p>
      <p class="tu-hint">工作日已计入调休上班日、剔除法定节假日（内置表覆盖 2025–2026 年）。</p>
    </template>
  </div>
</template>

<style scoped>
.dc-inline { margin-bottom: 0; }
.dc-date { width: auto; min-width: 150px; }
.dc-num { width: 110px; }
.dc-wd { margin-left: 8px; font-size: var(--fs-sm); font-weight: 400; color: var(--color-text-muted); }
</style>
