<script setup lang="ts">
// 月历习惯卡片（成人 / 学生通用）
// 数据与操作全部由父组件注入：records 提供已打卡日期（及可选积分），
// streak/week 由父组件 store 计算，打卡动作通过 toggle(date) 事件上抛。
// 这样成人与学生共用同一份卡片结构与样式，保证两侧展示与交互完全一致。
import { computed, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import { localToday } from '@/composables/todoCore'
import type { HabitImage, StreakResult, WeeklyAttainment } from '@/composables/habitCore'

/** 卡片所需的最小习惯结构（成人 Habit 与学生 StudentHabit 均满足） */
interface CalendarHabitLike {
  id: string
  name: string
  color?: string
}
/** 打卡记录最小结构（学生侧带 points，用于展示本次积分；成人侧无该字段） */
interface CalendarRecordLike {
  habitId: string
  date: string
  points?: number
  images?: readonly HabitImage[] // 仅用于区分当日是否附图
}

const props = defineProps<{
  habit: CalendarHabitLike
  records: readonly CalendarRecordLike[]
  streak: StreakResult
  week: WeeklyAttainment
  /** habit.color 缺省时的回退色 */
  defaultColor: string
  /**
   * 是否开启「某天打卡详情」模式（由习惯的 imageEnabled 驱动，成人习惯面板专用）。
   * - true：点某天直接打开详情弹框（打卡/取消、图片都在弹框里完成），并显示右上角图片角标
   * - false（默认）：保持原有行为——点某天直接打卡 / 取消打卡；学生侧面板即此分支，零变化
   */
  detailMode?: boolean
}>()
const emit = defineEmits<{
  edit: [id: string]
  toggle: [date: string]
  /** 点某天右上角的图片角标 = 打开该天打卡详情（与格子本身的打卡/取消互不干扰） */
  openDetail: [date: string]
}>()

// 今天 = 本地日期 YYYY-MM-DD（防 UTC 偏移）
const today = localToday()

// 该习惯已打卡日期集合（响应式，打卡后自动重算）
const checkedSet = computed(
  () => new Set(props.records.filter(r => r.habitId === props.habit.id).map(r => r.date))
)

/** 该习惯 日期 → 本次积分（仅学生侧有值；成人侧为空对象 → 不展示积分） */
const pointsByDate = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {}
  for (const r of props.records) {
    if (r.habitId === props.habit.id && typeof r.points === 'number') m[r.date] = r.points
  }
  return m
})

// ===== 月历视图状态（默认当月，可前后切换补卡/回看）=====
const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth()) // 0-based

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const pad = (n: number) => String(n).padStart(2, '0')

/** 该习惯 日期 → 附图张数（仅 >0 的日期进表，供日历角标显示张数红点） */
const imageCountByDate = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {}
  for (const r of props.records) {
    if (r.habitId !== props.habit.id) continue
    const n = r.images?.length ?? 0
    if (n > 0) m[r.date] = n
  }
  return m
})

interface CalCell {
  blank?: boolean
  dateStr?: string
  dayNum?: number
  isChecked?: boolean
  isToday?: boolean
  isFuture?: boolean
  points?: number
  imageCount?: number
}

const cells = computed<CalCell[]>(() => {
  const y = viewYear.value
  const m = viewMonth.value
  const startW = new Date(y, m, 1).getDay() // 0=周日
  const days = new Date(y, m + 1, 0).getDate()
  const total = Math.ceil((startW + days) / 7) * 7
  const out: CalCell[] = []
  const pts = pointsByDate.value
  const imgs = imageCountByDate.value
  for (let i = 0; i < total; i++) {
    const d = i - startW + 1
    if (d < 1 || d > days) {
      out.push({ blank: true })
      continue
    }
    const ds = `${y}-${pad(m + 1)}-${pad(d)}`
    out.push({
      dateStr: ds,
      dayNum: d,
      isChecked: checkedSet.value.has(ds),
      isToday: ds === today,
      isFuture: ds > today,
      ...(typeof imgs[ds] === 'number' ? { imageCount: imgs[ds] } : {}),
      ...(typeof pts[ds] === 'number' ? { points: pts[ds] } : {})
    })
  }
  return out
})

function prevMonth(): void {
  if (viewMonth.value === 0) {
    viewMonth.value = 11
    viewYear.value--
  } else {
    viewMonth.value--
  }
}

function nextMonth(): void {
  if (viewMonth.value === 11) {
    viewMonth.value = 0
    viewYear.value++
  } else {
    viewMonth.value++
  }
}

// 点日历某天：详情模式下 = 打开该天打卡详情（打卡/取消在弹框内完成）；
// 否则 = 打卡 / 取消（仅今天与过去可点，未来置灰）。具体动作均由父组件执行。
function onDayClick(c: CalCell): void {
  if (!c.dateStr || c.isFuture) return
  if (props.detailMode) {
    emit('openDetail', c.dateStr)
    return
  }
  emit('toggle', c.dateStr)
}

// 点某天右上角的图片角标 = 打开该天打卡详情（@click.stop 已在模板处理，不会连带触发打卡）
function onOpenDetail(c: CalCell): void {
  if (!c.dateStr || c.isFuture) return
  emit('openDetail', c.dateStr)
}

// 点卡片其它区域（名称/信息/留白）= 打开编辑弹框（由父组件处理）
function onCardClick(): void {
  emit('edit', props.habit.id)
}
</script>

<template>
  <div
    class="hb-cal-card"
    :style="{ '--hb-color': habit.color ?? defaultColor }"
    :data-testid="`hb-card-${habit.id}`"
    @click="onCardClick"
  >
    <!-- 头部：色点 + 名称/连续/本周 + 月份切换 -->
    <div class="hb-cal-head">
      <span class="hb-cal-dot"></span>
      <div class="hb-cal-title">
        <div class="hb-cal-name">{{ habit.name }}</div>
        <div class="hb-cal-sub">连续 {{ streak.count }}{{ streak.unit }} · 本周 {{ week.completed }}/{{ week.target }}</div>
      </div>
      <div class="hb-cal-nav" @click.stop>
        <button class="hb-cal-navbtn" type="button" aria-label="上个月" @click="prevMonth">&#8249;</button>
        <span class="hb-cal-month">{{ viewYear }}年{{ viewMonth + 1 }}月</span>
        <button class="hb-cal-navbtn" type="button" aria-label="下个月" @click="nextMonth">&#8250;</button>
      </div>
    </div>

    <!-- 当月日历 -->
    <div class="hb-cal-grid">
      <div v-for="w in WEEK_LABELS" :key="w" class="hb-cal-wk">{{ w }}</div>
      <template v-for="(c, idx) in cells" :key="idx">
        <span v-if="c.blank" class="hb-cal-day blank"></span>
        <button
          v-else
          type="button"
          class="hb-cal-day"
          :class="{ checked: c.isChecked, today: c.isToday, future: c.isFuture }"
          :disabled="!!c.isFuture"
          :aria-label="
            c.dateStr
              ? detailMode
                ? '打开打卡详情 ' + c.dateStr
                : c.isChecked
                  ? '取消打卡 ' + c.dateStr
                  : '打卡 ' + c.dateStr
              : ''
          "
          :title="
            detailMode
              ? '打卡详情 ' + (c.dateStr ?? '')
              : c.isChecked && typeof c.points === 'number'
                ? `已打卡 +${c.points} 分`
                : (c.dateStr ?? '')
          "
          @click.stop="onDayClick(c)"
        >
          <span class="hb-cal-daynum">{{ c.dayNum }}</span>
          <span v-if="c.isChecked && typeof c.points === 'number'" class="hb-cal-pts">+{{ c.points }}</span>
          <!-- 图片角标：打开该天打卡详情的独立入口，@click.stop 与格子的打卡 toggle 隔离 -->
          <span
            v-if="detailMode && !c.isFuture"
            class="hb-cal-img"
            :class="{ has: (c.imageCount ?? 0) > 0 }"
            role="button"
            :aria-label="`查看 ${c.dateStr} 打卡详情`"
            :title="(c.imageCount ?? 0) > 0 ? `查看打卡详情（${c.imageCount} 张图片）` : '查看打卡详情 / 添加图片'"
            :data-testid="`hb-cal-img-${habit.id}-${c.dateStr}`"
            @click.stop="onOpenDetail(c)"
          >
            <Icon name="image" :size="10" />
            <span v-if="(c.imageCount ?? 0) > 1" class="hb-cal-imgcnt">{{ c.imageCount }}</span>
          </span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* ===== 月历习惯卡片 ===== */
.hb-cal-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 12px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: border-color var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease);
}

.hb-cal-card:hover {
  border-color: var(--hb-color, var(--color-primary, var(--color-primary)));
  /* 卡片 hover 抬升走阴影 token（原字面值作为 fallback 保留，视觉几乎一致） */
  box-shadow: var(--shadow-md, 0 4px 14px rgba(0, 0, 0, 0.1));
}

/* 头部 */
.hb-cal-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hb-cal-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--hb-color, var(--color-primary, var(--color-primary)));
  flex-shrink: 0;
}

.hb-cal-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hb-cal-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hb-cal-sub {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

/* 月份切换 */
.hb-cal-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.hb-cal-navbtn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-size: 16px;
  line-height: 1;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--transition-fast, 0.15s ease), color var(--transition-fast, 0.15s ease);
}

.hb-cal-navbtn:hover {
  background: var(--color-bg-hover, var(--color-bg-input));
  color: var(--hb-color, var(--color-primary, var(--color-primary)));
}

.hb-cal-month {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  min-width: 64px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* 日历网格 */
.hb-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.hb-cal-wk {
  text-align: center;
  font-size: 11px;
  color: var(--color-text-muted, var(--color-text-muted));
  padding: 2px 0;
}

.hb-cal-day {
  /* 角标的定位基准：没有它，图片角标会相对 .hb-cal-card 定位、全部叠到卡片右上角 */
  position: relative;
  aspect-ratio: 1 / 1;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text, var(--color-text));
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 0;
  transition: background-color var(--transition-fast, 0.15s ease), color var(--transition-fast, 0.15s ease);
}

.hb-cal-daynum {
  line-height: 1;
}

/* 本次打卡积分（仅学生侧有值） */
.hb-cal-pts {
  font-size: 9px;
  line-height: 1;
  opacity: 0.85;
}

.hb-cal-day:hover:not(.blank):not(.checked):not(:disabled) {
  background: color-mix(in srgb, var(--hb-color, var(--color-primary)) 12%, transparent);
}

.hb-cal-day.checked {
  background: var(--hb-color, var(--color-primary, var(--color-primary)));
  color: #fff;
  font-weight: 600;
  border-color: var(--hb-color, var(--color-primary, var(--color-primary)));
}

.hb-cal-day.today {
  border-color: var(--hb-color, var(--color-primary, var(--color-primary)));
}

.hb-cal-day.future {
  color: var(--color-text-muted, var(--color-text-muted));
  cursor: not-allowed;
  opacity: 0.5;
}

.hb-cal-day.blank {
  visibility: hidden;
  cursor: default;
}

/* ★ 图片角标：某天打卡详情入口。有图=白底实心（彩底格子上依然清晰），无图=淡色描边（hover 才明显） */
.hb-cal-img {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 15px;
  height: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full, 999px);
  cursor: pointer;
  transition: opacity var(--transition-fast, 0.15s ease), background-color var(--transition-fast, 0.15s ease);
  z-index: 2;
}

.hb-cal-img.has {
  background: rgba(255, 255, 255, 0.92);
  color: #1f2937;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(15, 23, 42, 0.06));
}

/* 未附图：常态弱存在（半透明），hover 格子时提亮，既不抢日期数字也不至于看不见 */
.hb-cal-img:not(.has) {
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  opacity: 0.55;
}

/* 已打卡格子是习惯色实底：角标必须转白，否则深灰图标压在实底上几乎不可见 */
.hb-cal-day.checked .hb-cal-img:not(.has) {
  color: rgba(255, 255, 255, 0.9);
  opacity: 0.8;
}

.hb-cal-day:hover .hb-cal-img:not(.has) {
  opacity: 1;
  background: var(--color-bg-hover, #f1f5f9);
}

.hb-cal-day.checked:hover .hb-cal-img:not(.has) {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
}

/* 张数红点：仅 >1 张时出现（1 张时角标本身已足够表达） */
.hb-cal-imgcnt {
  position: absolute;
  top: -3px;
  right: -4px;
  min-width: 12px;
  height: 12px;
  padding: 0 3px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-primary, #3b82f6);
  color: #fff;
  font-size: 9px;
  line-height: 12px;
  text-align: center;
  font-weight: 600;
}

.hb-cal-day.future .hb-cal-img {
  display: none;
}

/* ===== 暗色模式 ===== */
html.dark .hb-cal-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .hb-cal-day:hover:not(.blank):not(.checked):not(:disabled) {
  background: color-mix(in srgb, var(--hb-color, #60a5fa) 18%, transparent);
}

html.dark .hb-cal-wk,
html.dark .hb-cal-sub,
html.dark .hb-cal-month {
  color: #9ca3af;
}

html.dark .hb-cal-day.future {
  color: #6b7280;
}
</style>
