<script setup lang="ts">
/**
 * 健康周计划共享看板（运动 / 饮食共用，纯展示组件）。
 *
 * 结构：标题栏（图标 + 标题 + 周区间 + ‹今天› 导航 + 统计胶囊）
 *      + 表格（行 = rows 定义的时段/餐次，列 = 周一～周日，今日列主色高亮）
 *      + 内容单元格（done/planned/rest/pending/empty 五态）+ 底部图例。
 *
 * 单元格数据由父面板组装（cells），本组件不做任何数据读写；
 * 点击单元格 / 周导航只 emit，编辑弹框与落库在父面板完成。
 * 设计稿与 token 对齐见 docs/UI_STYLE_GUIDE.md（全部走 var(--token, fallback)，暗色自动适配）。
 */
import { computed } from 'vue'
import { weekDayKeys } from '@/composables/healthCore'

export interface WeeklyPlanRow {
  key: string
  label: string
  icon: 'sun' | 'moon' | 'bowl' | 'sum'
}

/** 五态单元格：done 已完成 / planned 待进行 / rest 休息 / pending 待安排 / empty 未安排（显示 +） */
export interface WeeklyPlanCell {
  name?: string
  sub?: string
  subTone?: 'primary' | 'success' | 'warning'
  state: 'done' | 'planned' | 'rest' | 'pending' | 'empty'
}

const props = defineProps<{
  title: string
  /** 该周周一日期键 'YYYY-MM-DD' */
  weekStart: string
  weekLabel: string
  statText: string
  statTone?: 'success' | 'warning'
  iconBg: string
  iconColor: string
  rows: WeeklyPlanRow[]
  /** 键 = `${rowKey}:${day}`（day 1..7） */
  cells: Record<string, WeeklyPlanCell>
  hint?: string
}>()

const emit = defineEmits<{
  nav: [dir: number]
  'cell-click': [rowKey: string, day: number]
}>()

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 今天的日期键（本地时区），用于「今日」列高亮 */
const todayKey = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})

/** 7 列表头：星期标签 + MM/DD（来自 weekStart 起连排 7 天） */
const dayHeads = computed(() => {
  const keys = weekDayKeys(props.weekStart)
  return keys.map((key, i) => {
    const [, m, d] = key.split('-')
    return { key, index: i + 1, label: DAY_LABELS[i], md: `${Number(m)}/${Number(d)}`, isToday: key === todayKey.value }
  })
})

function cellOf(rowKey: string, day: number): WeeklyPlanCell {
  return props.cells[`${rowKey}:${day}`] ?? { state: 'empty' }
}

function onCell(rowKey: string, day: number): void {
  emit('cell-click', rowKey, day)
}
</script>

<template>
  <section class="wp-board" data-testid="weekly-plan-board">
    <div class="wp-head">
      <div class="wp-icon" :style="{ background: iconBg }">
        <slot name="icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="iconColor" stroke-width="2" stroke-linecap="round">
            <path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" />
          </svg>
        </slot>
      </div>
      <div class="wp-title-wrap">
        <div class="wp-title">{{ title }}</div>
        <div class="wp-week">{{ weekLabel }}</div>
      </div>
      <div class="wp-nav">
        <button type="button" class="wp-nav-btn" data-testid="wp-prev" title="上一周" @click="emit('nav', -1)">‹</button>
        <button type="button" class="wp-nav-btn wp-nav-today" data-testid="wp-today" @click="emit('nav', 0)">今天</button>
        <button type="button" class="wp-nav-btn" data-testid="wp-next" title="下一周" @click="emit('nav', 1)">›</button>
      </div>
      <div class="wp-stat" :class="statTone === 'warning' ? 'is-warning' : 'is-success'" data-testid="wp-stat">{{ statText }}</div>
    </div>

    <div class="wp-scroll">
      <table class="wp-table">
        <tr>
          <td class="wp-corner"></td>
          <td
            v-for="d in dayHeads"
            :key="d.key"
            class="wp-day-head"
            :class="{ 'is-today': d.isToday }"
          >
            <div class="wp-day-label">{{ d.label }}<template v-if="d.isToday"> · 今天</template></div>
            <div class="wp-day-date">{{ d.md }}</div>
          </td>
        </tr>
        <tr v-for="(row, ri) in rows" :key="row.key">
          <td class="wp-row-head" :class="{ 'is-last': ri === rows.length - 1 }">
            <div class="wp-row-head-inner">
              <svg v-if="row.icon === 'sun'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning, #f59e0b)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></svg>
              <svg v-else-if="row.icon === 'moon'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary, #64748b)" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              <svg v-else-if="row.icon === 'bowl'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning, #f59e0b)" stroke-width="2" stroke-linecap="round"><path d="M4 11h16a8 8 0 0 1-16 0z" /><path d="M8 11V7M12 11V5M16 11V8" /></svg>
              <span v-else style="font-size: 13px; color: var(--color-text-secondary, #64748b); line-height: 1;">Σ</span>
              <span>{{ row.label }}</span>
            </div>
          </td>
          <td
            v-for="d in dayHeads"
            :key="d.key"
            class="wp-cell"
            :class="{ 'is-today': d.isToday, 'is-last-row': ri === rows.length - 1 }"
            :data-testid="`wp-cell-${row.key}-${d.index}`"
            @click="onCell(row.key, d.index)"
          >
            <template v-if="cellOf(row.key, d.index).state === 'done'">
              <div class="wp-item-name">{{ cellOf(row.key, d.index).name }}</div>
              <div class="wp-item-sub is-success">✓ {{ cellOf(row.key, d.index).sub }}</div>
            </template>
            <template v-else-if="cellOf(row.key, d.index).state === 'planned'">
              <div class="wp-item-name">{{ cellOf(row.key, d.index).name }}</div>
              <div class="wp-item-sub is-primary">{{ cellOf(row.key, d.index).sub }}</div>
            </template>
            <template v-else-if="cellOf(row.key, d.index).state === 'rest'">
              <span class="wp-tag is-rest">休息</span>
            </template>
            <template v-else-if="cellOf(row.key, d.index).state === 'pending'">
              <span class="wp-tag is-rest">待安排</span>
            </template>
            <template v-else>
              <span class="wp-add">＋</span>
            </template>
          </td>
        </tr>
      </table>
    </div>

    <div class="wp-legend">
      <span><span class="wp-dot" style="background: var(--color-success, #10b981);"></span>已完成（✓）</span>
      <span><span class="wp-dot" style="background: var(--color-primary, #3b82f6);"></span>待进行</span>
      <span><span class="wp-dot" style="background: var(--color-border-strong, #cbd5e1);"></span>休息 / 待安排</span>
      <span v-if="hint" class="wp-hint">{{ hint }}</span>
    </div>
  </section>
</template>

<style scoped>
.wp-board {
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
}

.wp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--color-surface-2, #f8fafc);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.wp-icon {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-md, 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.wp-title {
  font-size: var(--font-size-base, 14px);
  font-weight: 500;
  color: var(--color-text, #1e293b);
  line-height: 1.3;
}

.wp-week {
  font-size: var(--font-size-xs, 11px);
  color: var(--color-text-secondary, #64748b);
}

.wp-nav {
  margin-left: auto;
  display: flex;
  gap: 4px;
}

.wp-nav-btn {
  min-width: 26px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 11px);
  cursor: pointer;
}

.wp-nav-btn:hover {
  border-color: var(--color-border-strong, #cbd5e1);
  color: var(--color-text, #1e293b);
}

.wp-stat {
  height: 26px;
  padding: 0 12px;
  border-radius: var(--radius-full, 9999px);
  font-size: var(--font-size-xs, 11px);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.wp-stat.is-success {
  background: var(--color-success-soft, #d1fae5);
  color: var(--color-success-hover, #059669);
}

.wp-stat.is-warning {
  background: var(--color-warning-soft, #fef3c7);
  color: var(--color-warning-hover, #b45309);
}

.wp-scroll {
  padding: 12px 16px;
  overflow-x: auto;
}

.wp-table {
  width: 100%;
  min-width: 680px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.wp-corner {
  width: 52px;
}

.wp-day-head {
  padding: 6px 4px;
  text-align: center;
  background: var(--color-surface-2, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px) var(--radius-md, 8px) 0 0;
}

.wp-day-head.is-today {
  background: var(--color-primary-light, #eff6ff);
  border: 1.5px solid var(--color-primary, #3b82f6);
  border-bottom: none;
}

.wp-day-label {
  font-size: var(--font-size-xs, 11px);
  font-weight: 500;
  color: var(--color-text, #1e293b);
}

.wp-day-head.is-today .wp-day-label,
.wp-day-head.is-today .wp-day-date {
  color: var(--color-primary, #3b82f6);
}

.wp-day-date {
  font-size: var(--font-size-xs, 11px);
  color: var(--color-text-muted, #94a3b8);
}

.wp-row-head {
  background: var(--color-surface-2, #f8fafc);
  border-left: 1px solid var(--color-border, #e2e8f0);
  border-top: 1px solid var(--color-border, #e2e8f0);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  text-align: center;
}

.wp-row-head.is-last {
  border-radius: 0 0 0 var(--radius-md, 8px);
}

.wp-row-head-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 0;
  font-size: var(--font-size-xs, 11px);
  color: var(--color-text, #1e293b);
}

.wp-cell {
  padding: 7px 4px;
  text-align: center;
  cursor: pointer;
  min-height: 52px;
}

.wp-cell:hover {
  background: var(--color-bg-hover, #f1f5f9);
}

.wp-cell.is-today {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.1));
}

.wp-cell.is-today:hover {
  background: var(--color-primary-light, #eff6ff);
}

.wp-cell.is-last-row {
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.wp-cell.is-today.is-last-row {
  border-bottom: 1.5px solid var(--color-primary, #3b82f6);
}

.wp-item-name {
  font-size: var(--font-size-xs, 11px);
  color: var(--color-text, #1e293b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wp-item-sub {
  font-size: var(--font-size-xs, 11px);
}

.wp-item-sub.is-primary {
  color: var(--color-primary, #3b82f6);
}

.wp-item-sub.is-success {
  color: var(--color-success-hover, #059669);
}

.wp-item-sub.is-warning {
  color: var(--color-warning-hover, #b45309);
}

.wp-tag {
  border: 1px dashed var(--color-border-strong, #cbd5e1);
  border-radius: var(--radius-full, 9999px);
  padding: 2px 10px;
  font-size: var(--font-size-xs, 11px);
  color: var(--color-text-muted, #94a3b8);
  display: inline-block;
}

.wp-add {
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-sm, 13px);
}

.wp-legend {
  display: flex;
  gap: 14px;
  padding: 0 16px 12px;
  font-size: var(--font-size-xs, 11px);
  color: var(--color-text-secondary, #64748b);
  flex-wrap: wrap;
}

.wp-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}

.wp-hint {
  margin-left: auto;
}
</style>
