<script setup lang="ts">
/**
 * 健康 · 跟练方案卡（运动面板内使用）。
 *
 * 定位：这不是「记录」，而是一套**处方模板**——把海报里的一周循环跟练
 * （周一/三/五/日训练 + 周二/四/六休息，每个训练日的动作 / 组数×次数 / 组间休息）
 * 变成可执行、可打勾、可一键排进本周计划的东西。
 *
 * 数据流（本组件零读写，全部走 props/emit）：
 *   props.template —— 内置模板常量（composables/healthPlanTemplates.ts）
 *   props.progress —— 按日期存的勾选结果 { 'YYYY-MM-DD': ['tplId:moveIdx:setIdx', ...] }
 *   emit.toggle/reset —— 面板转手给 store.togglePlanProgress / resetPlanProgress
 *   emit.apply —— 面板调 store.setWeeklyPlanItems 把四个训练日写进本周计划
 *
 * 勾选进度按「日期」而非「星期」存：同一套方案跨周复用时，上周的完成情况不会串到本周。
 */
import { computed, ref, watch } from 'vue'
import Icon from '@/components/Icon.vue'
import { weekDayKeys } from '@/composables/healthCore'
import { planDayDoneSets, planDayTotalSets, progressKey } from '@/composables/healthPlanTemplates'
import type { ExercisePlanTemplate } from '@/types'

const props = defineProps<{
  template: ExercisePlanTemplate
  /** 该周周一日期键 'YYYY-MM-DD' */
  weekStart: string
  /** 勾选进度：键 = 日期 */
  progress: Record<string, string[]>
  /** 是否已套用到本周（用于按钮文案/禁用态） */
  applied?: boolean
}>()

const emit = defineEmits<{
  toggle: [dateKey: string, key: string]
  reset: [dateKey: string]
  apply: []
}>()

/** 日卡里的短标签：直接用 role 会把「完整主训练日」截成「完整主」 */
const DAY_SHORT: Record<number, string> = {
  1: '主训练日',
  2: '休息',
  3: '巩固训练',
  4: '休息',
  5: '侧重训练',
  6: '休息',
  7: '激活训练'
}

const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const weekDates = computed<string[]>(() => weekDayKeys(props.weekStart))

function dateKeyOf(day: number): string {
  return weekDates.value[day - 1] ?? ''
}

function checkedOf(day: number): string[] {
  const key = dateKeyOf(day)
  return key ? (props.progress[key] ?? []) : []
}

function doneOf(day: number): number {
  const d = props.template.days.find(x => x.day === day)
  if (!d) return 0
  return planDayDoneSets(d, props.template.id, checkedOf(day))
}

function totalOf(day: number): number {
  const d = props.template.days.find(x => x.day === day)
  return d ? planDayTotalSets(d) : 0
}

/** 默认展开「今天」所在的那一天；不在本周时退回周一 */
const activeDay = ref(1)
watch(
  () => props.weekStart,
  () => {
    const todayKey = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const today = `${todayKey.getFullYear()}-${pad(todayKey.getMonth() + 1)}-${pad(todayKey.getDate())}`
    const idx = weekDates.value.indexOf(today)
    activeDay.value = idx >= 0 ? idx + 1 : 1
  },
  { immediate: true }
)

const activePlanDay = computed(() => props.template.days.find(d => d.day === activeDay.value) ?? props.template.days[0])
const activeDone = computed(() => doneOf(activeDay.value))
const activeTotal = computed(() => totalOf(activeDay.value))
const activeDateKey = computed(() => dateKeyOf(activeDay.value))

/**
 * 今天是休息日时给一个「去看下一个训练日」的跳板：
 * 默认停在今天是对的（用户看的是「我今天该干嘛」），但不能让卡片看上去是空的。
 */
const nextTrainingDay = computed(() => {
  const after = props.template.days.find(d => !d.isRest && d.day > activeDay.value)
  if (after) return after
  return [...props.template.days].reverse().find(d => !d.isRest && d.day < activeDay.value) ?? null
})

const showFoot = ref(true)

function onToggle(moveIndex: number, setIndex: number): void {
  if (!activeDateKey.value) return
  emit('toggle', activeDateKey.value, progressKey(props.template.id, moveIndex, setIndex))
}

function isChecked(moveIndex: number, setIndex: number): boolean {
  return checkedOf(activeDay.value).includes(progressKey(props.template.id, moveIndex, setIndex))
}

const partClass: Record<string, string> = {
  back: 'p-back',
  arm: 'p-arm',
  shoulder: 'p-shoulder',
  chest: 'p-chest'
}

/** 全周合计：N 个训练日 / M 组（表头概览用） */
const weekSummary = computed(() => {
  const trainDays = props.template.days.filter(d => !d.isRest)
  const sets = trainDays.reduce((sum, d) => sum + planDayTotalSets(d), 0)
  return `${trainDays.length} 个训练日 · ${sets} 组`
})
</script>

<template>
  <section class="xp-card" data-testid="ex-plan-card">
    <header class="xp-head">
      <div class="xp-head-main">
        <span class="xp-kicker" data-testid="ex-plan-kicker">跟练方案</span>
        <div class="xp-title">
          <h2 data-testid="ex-plan-name">{{ template.name }}</h2>
          <span class="xp-pill">{{ template.mode.split('，')[0] }}</span>
        </div>
        <p class="xp-desc">{{ template.desc }}</p>
        <div class="xp-meta">
          <span class="xp-meta-item"><b>训练目标</b>{{ template.goal }}</span>
          <span class="xp-meta-item"><b>单次时长</b>{{ template.minutes }}</span>
          <span class="xp-meta-item"><b>强度</b>{{ template.mode.split('，').slice(1).join('，') }}</span>
        </div>
      </div>
      <div class="xp-head-actions">
        <el-button
          type="primary"
          size="small"
          class="btn-primary"
          data-testid="ex-plan-apply"
          :disabled="applied"
          @click="emit('apply')"
        >
          {{ applied ? '已套用到本周' : '套用到本周' }}
        </el-button>
        <el-button size="small" data-testid="ex-plan-toggle-foot" @click="showFoot = !showFoot">
          {{ showFoot ? '收起说明' : '进阶 / 退阶' }}
        </el-button>
      </div>
    </header>

    <!-- 一周条：训练日 / 休息日一眼分得开 -->
    <div class="xp-strip" data-testid="ex-plan-strip">
      <button
        v-for="d in template.days"
        :key="d.day"
        class="xp-day"
        :class="{ 'is-rest': d.isRest, 'is-active': d.day === activeDay, 'is-done': !d.isRest && doneOf(d.day) === totalOf(d.day) && totalOf(d.day) > 0 }"
        :aria-pressed="d.day === activeDay"
        :data-testid="`ex-plan-day-${d.day}`"
        @click="activeDay = d.day"
      >
        <span class="xp-day-name">{{ DAY_NAMES[d.day - 1] }}</span>
        <span class="xp-day-role">{{ DAY_SHORT[d.day] }}</span>
        <span class="xp-day-stat">
          {{ d.isRest ? '拉伸休息' : (doneOf(d.day) > 0 ? `${doneOf(d.day)}/${totalOf(d.day)} 组` : `${d.moves.length} 个动作`) }}
        </span>
      </button>
    </div>

    <!-- 当日详情 -->
    <div class="xp-detail" data-testid="ex-plan-detail">
      <div class="xp-detail-head">
        <span class="xp-detail-name">{{ DAY_NAMES[activeDay - 1] }}</span>
        <span class="xp-detail-role">{{ activePlanDay?.role }}</span>
        <span v-if="activePlanDay && !activePlanDay.isRest && activePlanDay.restText" class="xp-rest-tag">
          {{ activePlanDay.restText }}
        </span>
        <span class="xp-detail-right">
          <span v-if="activePlanDay && !activePlanDay.isRest" class="xp-progress" data-testid="ex-plan-progress">
            已勾选 {{ activeDone }}/{{ activeTotal }} 组
          </span>
          <el-button
            v-if="activePlanDay && !activePlanDay.isRest && activeDone > 0"
            size="small"
            text
            data-testid="ex-plan-reset"
            @click="emit('reset', activeDateKey)"
          >
            重置
          </el-button>
        </span>
      </div>

      <template v-if="activePlanDay && !activePlanDay.isRest">
        <ul class="xp-moves">
          <li v-for="(m, mi) in activePlanDay.moves" :key="m.name + mi" class="xp-move">
            <span class="xp-move-name">
              {{ m.name }}
              <span class="xp-part" :class="partClass[m.partTone]">{{ m.part }}</span>
            </span>
            <span class="xp-move-dose">{{ m.dose }}</span>
            <span class="xp-move-sets">
              <button
                v-for="si in m.sets"
                :key="si"
                class="xp-pip"
                :class="{ on: isChecked(mi, si - 1) }"
                :aria-label="`${m.name} 第 ${si} 组`"
                :data-testid="`ex-plan-pip-${mi}-${si - 1}`"
                @click="onToggle(mi, si - 1)"
              ></button>
            </span>
          </li>
        </ul>
        <div v-if="activePlanDay.foot" class="xp-foot">{{ activePlanDay.foot }}</div>
      </template>
      <div v-else class="xp-rest-box">
        <p class="xp-rest-hint" data-testid="ex-plan-rest">
          练 1 休 1 循环的休息位。{{ activePlanDay?.foot }}。
        </p>
        <el-button
          v-if="nextTrainingDay"
          size="small"
          data-testid="ex-plan-next"
          @click="activeDay = nextTrainingDay.day"
        >
          查看{{ DAY_NAMES[nextTrainingDay.day - 1] }}训练（{{ nextTrainingDay.moves.length }} 个动作）
        </el-button>
      </div>
    </div>

    <!-- 进阶 / 退阶 + 区域选择 + 注意 -->
    <div v-if="showFoot" class="xp-notes">
      <div class="xp-note-grid">
        <div class="xp-note">
          <h3>进阶 &amp; 退阶</h3>
          <p><b>进阶</b>：{{ template.advance }}</p>
          <p><b>退阶</b>：{{ template.regress }}</p>
        </div>
        <div class="xp-note">
          <h3>区域选择</h3>
          <ul class="xp-zones">
            <li v-for="z in template.zones" :key="z.label">
              <i class="xp-swatch" :style="{ background: z.color }"></i>{{ z.label }}
            </li>
          </ul>
        </div>
      </div>
      <div class="xp-caution">
        <b>注意</b><span>{{ template.caution }}</span>
      </div>
    </div>

    <footer class="xp-footer">
      <Icon name="exercise" :size="13" />
      <span>本周 {{ weekSummary }}</span>
    </footer>
  </section>
</template>

<style scoped>
.xp-card {
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.1));
  overflow: hidden;
  min-width: 0;
}

/* ---------- 头部 ---------- */
.xp-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 16px 12px;
  background: linear-gradient(180deg, var(--color-primary-light, #eff6ff) 0%, var(--color-bg-card, #fff) 100%);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.xp-head-main {
  min-width: 0;
  flex: 1 1 320px;
}

.xp-kicker {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.1));
  color: var(--color-primary-text, #1d4ed8);
  font-size: calc(var(--fs-caption) - 1px);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.xp-title {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  margin: 6px 0 2px;
}

.xp-title h2 {
  margin: 0;
  font-size: var(--fs-title, 18px);
  font-weight: 650;
  letter-spacing: -0.01em;
}

.xp-pill {
  padding: 1px 8px;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-muted, #5b677f);
  font-size: var(--fs-caption, 12px);
}

.xp-desc {
  margin: 0;
  font-size: var(--fs-sm, 13px);
  color: var(--color-text-muted, #5b677f);
}

.xp-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
  margin-top: 8px;
}

.xp-meta-item {
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-soft, #6a7995);
}

.xp-meta-item b {
  margin-right: 4px;
  color: var(--color-text-secondary, #445064);
  font-weight: 600;
}

.xp-head-actions {
  display: flex;
  gap: 8px;
  flex: none;
}

/* ---------- 一周条 ---------- */
.xp-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.xp-day {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
}

.xp-day:hover {
  border-color: var(--color-border-strong, #cbd5e1);
  background: var(--color-bg-hover, #f1f5f9);
}

.xp-day.is-rest {
  background: var(--color-bg, #f8fafc);
}

.xp-day.is-active {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
  box-shadow: 0 0 0 2px var(--color-primary-soft, rgba(59, 130, 246, 0.1));
}

.xp-day-name {
  font-size: var(--fs-sm, 13px);
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.xp-day.is-rest .xp-day-name {
  color: var(--color-text-soft, #6a7995);
  font-weight: 500;
}

.xp-day-role,
.xp-day-stat {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: calc(var(--fs-caption) - 1px);
  color: var(--color-text-soft, #6a7995);
}

.xp-day.is-done .xp-day-stat {
  color: var(--color-success-text, #047857);
  font-weight: 600;
}

/* ---------- 当日详情 ---------- */
.xp-detail {
  padding: 12px 16px 14px;
}

.xp-detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.xp-detail-name {
  font-size: var(--fs-md, 15px);
  font-weight: 650;
}

.xp-detail-role {
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-soft, #6a7995);
}

.xp-rest-tag {
  padding: 1px 8px;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-muted, #5b677f);
  font-size: var(--fs-caption, 12px);
}

.xp-detail-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.xp-progress {
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-soft, #6a7995);
}

.xp-moves {
  margin: 0;
  padding: 0;
  list-style: none;
}

.xp-move {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
}

.xp-move + .xp-move {
  border-top: 1px dashed var(--color-border, #e2e8f0);
}

.xp-move-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--fs-body, 14px);
  color: var(--color-text, #1e293b);
}

.xp-part {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: var(--radius-sm, 4px);
  font-size: calc(var(--fs-caption) - 1px);
  line-height: 18px;
  vertical-align: 1px;
}

.p-back {
  background: #fee2e2;
  color: var(--color-error-text);
}

.p-arm {
  background: #fef3c7;
  color: var(--color-warning-text);
}

.p-shoulder {
  background: #d1fae5;
  color: var(--color-success-text);
}

.p-chest {
  background: #dbeafe;
  color: var(--color-primary-text);
}

.xp-move-dose {
  flex: none;
  font-size: var(--fs-sm, 13px);
  color: var(--color-text-secondary, #445064);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.xp-move-sets {
  display: flex;
  flex: none;
  gap: 5px;
}

.xp-pip {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--color-border-strong, #cbd5e1);
  border-radius: 5px;
  background: var(--color-bg-card, #fff);
  font: inherit;
  font-size: calc(var(--fs-caption) - 2px);
  line-height: 1;
  color: transparent;
  cursor: pointer;
  transition: background-color 0.12s, border-color 0.12s;
}

.xp-pip:hover {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
}

.xp-pip.on {
  border-color: var(--color-success, #10b981);
  background: var(--color-success, #10b981);
  color: var(--color-on-accent);
}

.xp-pip.on::before {
  content: "✓";
}

.xp-foot {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  padding: 6px 10px;
  border-radius: var(--radius-md, 8px);
  background: var(--color-success-soft, #d1fae5);
  color: var(--color-success-text, #047857);
  font-size: var(--fs-caption, 12px);
}

.xp-rest-hint {
  margin: 0;
  font-size: var(--fs-sm, 13px);
  color: var(--color-text-muted, #5b677f);
}

.xp-rest-box {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* ---------- 进阶/退阶 ---------- */
.xp-notes {
  padding: 12px 16px 14px;
  border-top: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg, #f8fafc);
}

.xp-note-grid {
  display: grid;
  grid-template-columns: 1.55fr 1fr;
  gap: 12px;
}

.xp-note {
  padding: 10px 11px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
}

.xp-note h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  font-size: var(--fs-sm, 13px);
  font-weight: 650;
  color: var(--color-text-secondary, #445064);
}

.xp-note h3::before {
  content: "";
  width: 3px;
  height: 13px;
  border-radius: 2px;
  background: var(--color-primary, #3b82f6);
}

.xp-note p {
  margin: 0;
  font-size: var(--fs-caption, 12px);
  line-height: 1.65;
  color: var(--color-text-muted, #5b677f);
}

.xp-note p + p {
  margin-top: 5px;
}

.xp-note p b {
  color: var(--color-text-secondary, #445064);
}

.xp-zones {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.xp-zones li {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-muted, #5b677f);
}

.xp-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex: none;
}

.xp-caution {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 11px;
  border-radius: var(--radius-md, 8px);
  background: #0f172a;
  --xp-caution-ink: #cbd5e1;
  --xp-caution-hi: #fbbf24;
  color: var(--xp-caution-ink);
  font-size: var(--fs-caption, 12px);
}

.xp-caution b {
  flex: none;
  color: var(--xp-caution-hi);
}

.xp-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-top: 1px solid var(--color-border, #e2e8f0);
  font-size: calc(var(--fs-caption) - 1px);
  color: var(--color-text-soft, #6a7995);
}

/* ---------- 响应式 ---------- */
@media (max-width: 900px) {
  .xp-strip {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .xp-note-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .xp-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .xp-head-actions {
    width: 100%;
  }
  .xp-move {
    flex-wrap: wrap;
  }
  .xp-move-name {
    flex: 1 1 100%;
  }
  .xp-move-dose {
    margin-left: auto;
  }
}

/* 暗色：卡片底色走 token 自动翻转，渐变头部需要单独压暗 */
html.dark .xp-head {
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.12) 0%, var(--color-bg-card, #1f2937) 100%);
}

html.dark .p-back {
  background: rgba(239, 68, 68, 0.18);
}

html.dark .p-arm {
  background: rgba(245, 158, 11, 0.18);
}

html.dark .p-shoulder {
  background: rgba(16, 185, 129, 0.18);
}

html.dark .p-chest {
  background: rgba(59, 130, 246, 0.18);
}
</style>
