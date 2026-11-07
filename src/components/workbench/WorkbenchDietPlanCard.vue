<script setup lang="ts">
/**
 * 健康 · 食谱方案卡（饮食面板内使用）。
 *
 * 同一张卡承载两种形态（由模板自身字段决定，不做 kind 之外的硬编码）：
 *   - 有 weeks  → 4 周推进型（小基数增肌：每周 5 餐 + 期目标 + 可替换食材）
 *   - 有 stages → 30 天分段型（大基数减脂：3 段 × 10 天餐单表）
 *
 * 关于 30 天餐单的可信度：原图表格逐格约 20px，内容由用户 OCR 后提供，
 * 三列存在串行风险。每段带 trust 标记，UI **必须**如实显示「已核 / 待核」，
 * 不允许静默当成已确认数据。
 *
 * 数据流：模板是内置常量；本组件只 emit（activate 换方案 / logMeal 记入饮食记录），
 * 不改任何 store。
 */
import { computed, ref } from 'vue'
import { activeGainWeekIndex, PLAN_TRUST_LABEL, PLAN_TRUST_NOTE } from '@/composables/healthPlanTemplates'
import type { DietPlanTemplate, MealType } from '@/types'

const props = defineProps<{
  templates: DietPlanTemplate[]
  /** 当前启用的模板 id */
  activeId?: string
  /** 食谱方案启用日期 'YYYY-MM-DD'，用于推算今天该执行第几周 */
  planStart?: string
  /** 今天 'YYYY-MM-DD' */
  today: string
}>()

const emit = defineEmits<{
  activate: [id: string]
  logMeal: [meal: MealType, content: string]
}>()

const activeTemplate = computed<DietPlanTemplate | undefined>(
  () => props.templates.find(t => t.id === props.activeId) ?? props.templates[0]
)

const hasWeeks = computed(() => (activeTemplate.value?.weeks?.length ?? 0) > 0)
const hasStages = computed(() => (activeTemplate.value?.stages?.length ?? 0) > 0)

/** 增肌方案默认落在「今天该执行第几周」，用户可手动切换查看 */
const weekIndex = ref(0)
const weekIndexInit = ref(false)
const activeWeek = computed(() => {
  const weeks = activeTemplate.value?.weeks ?? []
  if (weeks.length === 0) return undefined
  if (!weekIndexInit.value) {
    weekIndexInit.value = true
    weekIndex.value = props.planStart
      ? activeGainWeekIndex(props.planStart, props.today, weeks.length)
      : 0
  }
  return weeks[Math.min(weekIndex.value, weeks.length - 1)]
})

const stageIndex = ref(0)
const activeStage = computed(() => (activeTemplate.value?.stages ?? [])[stageIndex.value])
const stagePager = computed(() => activeTemplate.value?.stages ?? [])

/** 餐次键 → 记录用的 MealType（早/上午加餐/午/下午加餐/晚） */
const MEAL_TO_TYPE: Record<string, MealType> = {
  breakfast: '早餐',
  am: '加餐',
  lunch: '午餐',
  pm: '加餐',
  dinner: '晚餐'
}

const DAY_START_OF_STAGE = [1, 11, 21]

function onLogMeal(mealKey: string, items: string[]): void {
  const type = MEAL_TO_TYPE[mealKey] ?? '加餐'
  // 记录正文最长 200 字（面板侧校验），这里先截断避免填进去就存不了
  const text = items.join(' · ').slice(0, 200)
  emit('logMeal', type, text)
}

const trustLabel = (t: 'high' | 'mid' | 'low') => PLAN_TRUST_LABEL[t]
const trustNote = computed(() =>
  activeStage.value ? PLAN_TRUST_NOTE[activeStage.value.trust] : ''
)
const trustToneClass = computed(() => {
  const t = activeStage.value?.trust
  return t === 'high' ? 'ok' : t === 'mid' ? 'warn' : 'danger'
})

function stageDayStart(): number {
  return DAY_START_OF_STAGE[stageIndex.value] ?? stageIndex.value * 10 + 1
}
</script>

<template>
  <section v-if="activeTemplate" class="dp-card" data-testid="dt-plan-card">
    <header class="dp-head">
      <div class="dp-head-main">
        <span class="dp-kicker" data-testid="dt-plan-kicker">食谱方案</span>
        <div class="dp-title">
          <h2 data-testid="dt-plan-name">{{ activeTemplate.name }}</h2>
        </div>
        <p class="dp-desc">{{ activeTemplate.desc }}</p>
        <div v-if="activeTemplate.meta.length > 0" class="dp-meta">
          <span v-for="m in activeTemplate.meta" :key="m" class="dp-meta-item">{{ m }}</span>
        </div>
      </div>
      <div class="dp-switch" data-testid="dt-plan-switch">
        <button
          v-for="t in templates"
          :key="t.id"
          class="dp-switch-btn"
          :class="{ 'is-active': t.id === activeTemplate.id }"
          :aria-pressed="t.id === activeTemplate.id"
          :data-testid="`dt-plan-switch-${t.id}`"
          @click="emit('activate', t.id)"
        >
          <span class="dp-switch-name">{{ t.name.split(' · ')[0] }}</span>
          <span class="dp-switch-sub">{{ t.name.split(' · ')[1] }}</span>
        </button>
      </div>
    </header>

    <!-- ============ 形态 A：4 周推进（增肌） ============ -->
    <template v-if="hasWeeks && activeWeek">
      <div class="dp-body">
        <ul class="dp-rules">
          <li v-for="r in activeTemplate.rules" :key="r">{{ r }}</li>
        </ul>

        <div class="dp-week-tabs" data-testid="dt-plan-weeks">
          <button
            v-for="(w, i) in activeTemplate.weeks"
            :key="w.week"
            class="dp-week"
            :class="{ 'is-active': i === weekIndex }"
            :aria-pressed="i === weekIndex"
            :data-testid="`dt-plan-week-${w.week}`"
            @click="weekIndex = i"
          >
            <span class="dp-week-n">W{{ w.week }}</span>
            <span class="dp-week-t">{{ w.title }}</span>
          </button>
        </div>

        <div class="dp-goal" data-testid="dt-plan-goal">
          <b>W{{ activeWeek.week }} · {{ activeWeek.title }}</b>
          <span>{{ activeWeek.goal }}</span>
        </div>

        <div class="dp-meals" data-testid="dt-plan-meals">
          <article v-for="m in activeWeek.meals" :key="m.key" class="dp-meal">
            <div class="dp-meal-head">
              <span class="dp-meal-label">{{ m.label }}</span>
              <span v-if="m.time" class="dp-meal-time">{{ m.time }}</span>
            </div>
            <ul class="dp-meal-items">
              <li v-for="(it, i) in m.items" :key="i">{{ it }}</li>
            </ul>
            <div class="dp-meal-foot">
              <el-button
                size="small"
                text
                :data-testid="`dt-plan-log-${m.key}`"
                @click="onLogMeal(m.key, m.items)"
              >
                记入记录
              </el-button>
            </div>
          </article>
        </div>

        <div v-if="activeTemplate.swaps?.length" class="dp-swaps">
          <div v-for="s in activeTemplate.swaps" :key="s.title" class="dp-swap">
            <h4>{{ s.title }}</h4>
            <p>{{ s.text }}</p>
          </div>
        </div>

        <p v-if="activeTemplate.footer" class="dp-footer-note">{{ activeTemplate.footer }}</p>
      </div>
    </template>

    <!-- ============ 形态 B：30 天分段（减脂） ============ -->
    <template v-else-if="hasStages && activeStage">
      <div class="dp-body">
        <div class="dp-cols">
          <div class="dp-block">
            <h3>配合目标</h3>
            <ul class="dp-plain">
              <li v-for="t in activeTemplate.targets ?? []" :key="t">{{ t }}</li>
            </ul>
          </div>
          <div class="dp-block">
            <h3>训练前后加餐</h3>
            <ul class="dp-plain">
              <li v-for="t in activeTemplate.prePost ?? []" :key="t">{{ t }}</li>
            </ul>
          </div>
        </div>

        <div class="dp-block dp-block-full">
          <h3>每日简单原则</h3>
          <ul class="dp-plain">
            <li v-for="r in activeTemplate.rules" :key="r">{{ r }}</li>
          </ul>
        </div>

        <div class="dp-stage-head">
          <h3>30 天塑形饮食计划</h3>
          <span class="dp-stage-sub">分 3 段推进，每段 10 天</span>
        </div>

        <div class="dp-stage-tabs" data-testid="dt-plan-stages">
          <button
            v-for="(s, i) in stagePager"
            :key="s.range"
            class="dp-stage"
            :class="{ 'is-active': i === stageIndex }"
            :aria-pressed="i === stageIndex"
            :data-testid="`dt-plan-stage-${i}`"
            @click="stageIndex = i"
          >
            <span class="dp-stage-range">{{ s.range }}</span>
            <span class="dp-stage-name">{{ s.name }}</span>
            <span class="dp-trust" :class="`tone-${s.trust}`">{{ trustLabel(s.trust) }}</span>
          </button>
        </div>

        <div class="dp-stage-pill">
          <span class="dp-pill-strong">{{ activeStage.name }}</span>
          <span class="dp-pill-sub">{{ activeStage.range }}，共 {{ activeStage.days.length }} 天</span>
        </div>

        <div class="dp-table-wrap">
          <table class="dp-table" data-testid="dt-plan-30d">
            <thead>
              <tr>
                <th class="col-day">天</th>
                <th>早餐</th>
                <th>午餐</th>
                <th>晚餐</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in activeStage.days" :key="d.day">
                <td class="col-day">第 {{ stageDayStart() + i }} 天</td>
                <td>{{ d.breakfast }}</td>
                <td>{{ d.lunch }}</td>
                <td>{{ d.dinner }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="dp-trust-note" :class="trustToneClass" data-testid="dt-plan-trust-note">
          <b>{{ activeStage.trust === 'high' ? 'OCR 已核对' : 'OCR 待核对' }}</b>
          <span>{{ trustNote }}</span>
        </div>

        <p v-if="activeTemplate.footer" class="dp-footer-note">{{ activeTemplate.footer }}</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.dp-card {
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.1));
  overflow: hidden;
  min-width: 0;
}

/* ---------- 头部 ---------- */
.dp-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 16px 12px;
  background: linear-gradient(180deg, var(--color-warning-soft, #fef3c7) 0%, var(--color-bg-card, #fff) 100%);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.dp-head-main {
  flex: 1 1 320px;
  min-width: 0;
}

.dp-kicker {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: var(--radius-full, 9999px);
  background: rgba(245, 158, 11, 0.16);
  color: var(--color-warning-text, #b45309);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.dp-title {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  margin: 6px 0 2px;
}

.dp-title h2 {
  margin: 0;
  font-size: var(--fs-title, 18px);
  font-weight: 650;
  letter-spacing: -0.01em;
}

.dp-desc {
  margin: 0;
  font-size: var(--fs-sm, 13px);
  color: var(--color-text-muted, #5b677f);
}

.dp-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
  margin-top: 8px;
}

.dp-meta-item {
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-soft, #6a7995);
}

/* 方案切换 */
.dp-switch {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-hover, #f1f5f9);
  flex: none;
}

.dp-switch-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 5px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font: inherit;
  cursor: pointer;
  transition: background-color 0.15s, box-shadow 0.15s;
}

.dp-switch-btn:hover {
  background: rgba(255, 255, 255, 0.6);
}

.dp-switch-btn.is-active {
  background: var(--color-bg-card, #fff);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
}

.dp-switch-name {
  font-size: var(--fs-sm, 13px);
  color: var(--color-text-muted, #5b677f);
}

.dp-switch-btn.is-active .dp-switch-name {
  color: var(--color-text, #1e293b);
  font-weight: 600;
}

.dp-switch-sub {
  font-size: 10px;
  color: var(--color-text-soft, #6a7995);
}

/* ---------- 主体 ---------- */
.dp-body {
  padding: 12px 16px 14px;
}

.dp-rules {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px 20px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}

.dp-rules li {
  position: relative;
  padding-left: 14px;
  font-size: var(--fs-sm, 13px);
  color: var(--color-text-muted, #5b677f);
}

.dp-rules li::before {
  content: "";
  position: absolute;
  left: 3px;
  top: 8px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-primary, #3b82f6);
}

/* 周切换 */
.dp-week-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.dp-week {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  min-width: 84px;
  padding: 5px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  font: inherit;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
}

.dp-week:hover {
  border-color: var(--color-border-strong, #cbd5e1);
}

.dp-week.is-active {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
  box-shadow: 0 0 0 2px var(--color-primary-soft, rgba(59, 130, 246, 0.1));
}

.dp-week-n {
  font-size: var(--fs-sm, 13px);
  font-weight: 650;
  color: var(--color-text, #1e293b);
}

.dp-week.is-active .dp-week-n {
  color: var(--color-primary-text, #1d4ed8);
}

.dp-week-t {
  font-size: 10px;
  color: var(--color-text-soft, #6a7995);
}

.dp-goal {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 0;
  padding: 8px 11px;
  border-radius: var(--radius-md, 8px);
  background: var(--color-warning-soft, #fef3c7);
  color: var(--color-warning-text, #b45309);
  font-size: var(--fs-sm, 13px);
}

.dp-goal b {
  flex: none;
  font-weight: 650;
}

/* 五餐卡 */
.dp-meals {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.dp-meal {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 11px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.dp-meal:hover {
  border-color: var(--color-border-strong, #cbd5e1);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
}

.dp-meal-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dp-meal-label {
  font-size: var(--fs-sm, 13px);
  font-weight: 650;
}

.dp-meal-time {
  margin-left: auto;
  font-size: 10px;
  color: var(--color-text-soft, #6a7995);
}

.dp-meal-items {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dp-meal-items li {
  position: relative;
  padding-left: 9px;
  font-size: var(--fs-caption, 12px);
  line-height: 1.5;
  color: var(--color-text-muted, #5b677f);
}

.dp-meal-items li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 7px;
  width: 4px;
  height: 4px;
  border-radius: 1px;
  background: var(--color-border-strong, #cbd5e1);
}

.dp-meal-foot {
  margin-top: auto;
  padding-top: 2px;
  text-align: right;
}

/* 可替换食材 */
.dp-swaps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.dp-swap {
  padding: 9px 11px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg, #f8fafc);
}

.dp-swap h4 {
  margin: 0 0 3px;
  font-size: var(--fs-caption, 12px);
  font-weight: 650;
  color: var(--color-text-secondary, #445064);
}

.dp-swap p {
  margin: 0;
  font-size: var(--fs-caption, 12px);
  line-height: 1.6;
  color: var(--color-text-muted, #5b677f);
}

.dp-footer-note {
  margin: 12px 0 0;
  font-size: 11px;
  color: var(--color-text-soft, #6a7995);
}

/* ---------- 形态 B ---------- */
.dp-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.dp-block {
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
}

.dp-block-full {
  margin-top: 12px;
}

.dp-block h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  font-size: var(--fs-sm, 13px);
  font-weight: 650;
  color: var(--color-text-secondary, #445064);
}

.dp-block h3::before {
  content: "";
  width: 3px;
  height: 13px;
  border-radius: 2px;
  background: var(--color-primary, #3b82f6);
}

.dp-plain {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dp-plain li {
  font-size: var(--fs-caption, 12px);
  line-height: 1.6;
  color: var(--color-text-muted, #5b677f);
}

.dp-stage-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin: 16px 0 0;
}

.dp-stage-head h3 {
  margin: 0;
  font-size: var(--fs-sm, 13px);
  font-weight: 650;
  color: var(--color-text-secondary, #445064);
}

.dp-stage-sub {
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-soft, #6a7995);
}

.dp-stage-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.dp-stage {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  font: inherit;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
}

.dp-stage:hover {
  border-color: var(--color-border-strong, #cbd5e1);
}

.dp-stage.is-active {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
  box-shadow: 0 0 0 2px var(--color-primary-soft, rgba(59, 130, 246, 0.1));
}

.dp-stage-range {
  font-size: var(--fs-sm, 13px);
  font-weight: 650;
  color: var(--color-text-secondary, #445064);
}

.dp-stage.is-active .dp-stage-range {
  color: var(--color-primary-text, #1d4ed8);
}

.dp-stage-name {
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-soft, #6a7995);
}

.dp-trust {
  padding: 0 5px;
  border-radius: 3px;
  font-size: 10px;
  line-height: 16px;
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-soft, #6a7995);
}

.dp-trust.tone-high {
  background: var(--color-success-soft, #d1fae5);
  color: var(--color-success-text, #047857);
}

.dp-trust.tone-mid {
  background: var(--color-warning-soft, #fef3c7);
  color: var(--color-warning-text, #b45309);
}

.dp-trust.tone-low {
  background: #fee2e2;
  color: #b91c1c;
}

.dp-stage-pill {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  margin-top: 10px;
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-muted, #5b677f);
}

.dp-pill-strong {
  padding: 1px 8px;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.1));
  color: var(--color-primary-text, #1d4ed8);
  font-weight: 600;
}

.dp-table-wrap {
  margin-top: 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  overflow-x: auto;
}

.dp-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: var(--fs-caption, 12px);
}

.dp-table th {
  padding: 7px 10px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted, #5b677f);
  background: var(--color-bg-hover, #f1f5f9);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  white-space: nowrap;
}

.dp-table td {
  padding: 7px 10px;
  vertical-align: top;
  line-height: 1.55;
  color: var(--color-text-secondary, #445064);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.dp-table tbody tr:last-child td {
  border-bottom: 0;
}

.dp-table tbody tr:hover td {
  background: var(--color-primary-light, #eff6ff);
}

.dp-table .col-day {
  width: 76px;
  font-weight: 600;
  color: var(--color-text-muted, #5b677f);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.dp-trust-note {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 10px;
  padding: 8px 11px;
  border-radius: var(--radius-md, 8px);
  font-size: var(--fs-caption, 12px);
  line-height: 1.6;
}

.dp-trust-note b {
  flex: none;
  font-weight: 650;
}

.dp-trust-note.ok {
  background: var(--color-success-soft, #d1fae5);
  color: var(--color-success-text, #047857);
}

.dp-trust-note.warn {
  background: var(--color-warning-soft, #fef3c7);
  color: var(--color-warning-text, #b45309);
}

.dp-trust-note.danger {
  background: #fee2e2;
  color: #b91c1c;
}

/* ---------- 响应式 ---------- */
@media (max-width: 1200px) {
  .dp-meals {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .dp-cols {
    grid-template-columns: 1fr;
  }
  .dp-swaps {
    grid-template-columns: 1fr;
  }
  .dp-rules {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .dp-meals {
    grid-template-columns: 1fr;
  }
  .dp-switch {
    width: 100%;
  }
  .dp-switch-btn {
    flex: 1;
    align-items: center;
  }
}

/* 暗色 */
html.dark .dp-head {
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.12) 0%, var(--color-bg-card, #1f2937) 100%);
}

html.dark .dp-trust.tone-low,
html.dark .dp-trust-note.danger {
  background: rgba(239, 68, 68, 0.16);
  color: #fca5a5;
}
</style>
