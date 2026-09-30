<script setup lang="ts">
/**
 * 日历（年/月切换，标识法定节假日与调休上班日）
 */
import { computed, ref } from 'vue'
import { buildMonth, holidayMap, monthStats, type DayCell } from '../../core/calendar'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const today = new Date()
const year = ref(today.getFullYear())
const month = ref(today.getMonth() + 1)
const weekStart = ref<1 | 0>(1)
const activeDate = ref('')

useDirtyFlag(() => !!activeDate.value)
const { copy } = useToolActions()

const cells = computed<DayCell[]>(() => buildMonth(year.value, month.value, weekStart.value))
const stats = computed(() => monthStats(year.value, month.value))
const holidays = computed(() => holidayMap(year.value))

const weeks = computed(() => {
  const out: DayCell[][] = []
  for (let i = 0; i < cells.value.length; i += 7) out.push(cells.value.slice(i, i + 7))
  return out
})

const weekLabels = computed(() =>
  weekStart.value === 1 ? ['一', '二', '三', '四', '五', '六', '日'] : ['日', '一', '二', '三', '四', '五', '六']
)

function prev() {
  if (month.value === 1) {
    year.value -= 1
    month.value = 12
  } else month.value -= 1
}

function next() {
  if (month.value === 12) {
    year.value += 1
    month.value = 1
  } else month.value += 1
}

function jumpToday() {
  year.value = today.getFullYear()
  month.value = today.getMonth() + 1
}

function kindText(c: DayCell): string {
  if (c.kind === 'holiday') return c.label || '休'
  if (c.kind === 'makeup') return '班'
  return ''
}

const holidayList = computed(() =>
  Object.entries(holidays.value)
    .filter(([d]) => d.startsWith(`${year.value}-${String(month.value).padStart(2, '0')}`))
    .map(([d, name]) => `${d}　${name}`)
)

const monthText = computed(() =>
  cells.value
    .filter(c => c.inMonth)
    .map(c => `${c.date}\t${c.kind === 'holiday' ? '休' : c.kind === 'makeup' ? '班' : c.kind === 'weekend' ? '周末' : '工作日'}`)
    .join('\n')
)
</script>

<template>
  <div class="tu-t6">
    <div class="tu-toolbar">
      <button type="button" class="tu-btn ghost" @click="prev">上一月</button>
      <span class="tu-cal-title">{{ year }} 年 {{ month }} 月</span>
      <button type="button" class="tu-btn ghost" @click="next">下一月</button>
      <button type="button" class="tu-btn ghost" @click="jumpToday">回到今天</button>
      <span class="tu-spacer" />
      <button type="button" class="tu-check" :class="{ 'is-on': weekStart === 1 }" @click="weekStart = 1">
        周一起始
      </button>
      <button type="button" class="tu-check" :class="{ 'is-on': weekStart === 0 }" @click="weekStart = 0">
        周日起始
      </button>
    </div>

    <div class="tu-stat">
      <span>工作日 {{ stats.workdays }} 天</span>
      <span>周末 {{ stats.weekends }} 天</span>
      <span>法定节假日 {{ stats.holidays }} 天</span>
      <span>调休上班 {{ stats.makeup }} 天</span>
    </div>

    <div class="tu-cal">
      <div v-for="w in weekLabels" :key="w" class="tu-cal-head">{{ w }}</div>
      <template v-for="(week, wi) in weeks" :key="wi">
        <div
          v-for="c in week"
          :key="c.date"
          class="tu-cal-cell"
          :class="{
            'is-out': !c.inMonth,
            'is-weekend': c.kind === 'weekend',
            'is-holiday': c.kind === 'holiday',
            'is-makeup': c.kind === 'makeup',
            'is-today': c.isToday,
            'is-active': activeDate === c.date
          }"
          :title="c.date + (kindText(c) ? ' ' + kindText(c) : '')"
          @click="activeDate = c.date"
        >
          <span class="tu-cal-day">{{ c.day }}</span>
          <span v-if="kindText(c)" class="tu-cal-tag">{{ kindText(c) }}</span>
        </div>
      </template>
    </div>

    <div class="tu-row">
      <span class="tu-legend"><i class="dot workday" />工作日</span>
      <span class="tu-legend"><i class="dot weekend" />周末</span>
      <span class="tu-legend"><i class="dot holiday" />节假日</span>
      <span class="tu-legend"><i class="dot makeup" />调休上班</span>
    </div>

    <div class="tu-t2">
      <TuOutput
        v-if="holidayList.length"
        :title="`${month} 月节假日安排`"
        :text="holidayList.join('\n')"
        filename="holidays.txt"
        empty="本月无法定节假日"
      >
        <ul class="tu-list">
          <li v-for="h in holidayList" :key="h">{{ h }}</li>
        </ul>
      </TuOutput>

      <TuOutput title="本月日期明细" :text="monthText" filename="calendar.tsv" empty="—">
        <template #actions>
          <button type="button" class="tu-btn ghost" @click="copy(monthText)">复制</button>
        </template>
        <pre class="tu-code">{{ monthText }}</pre>
      </TuOutput>
    </div>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>可切换年月与周起始日，点击日期可高亮选中。</li>
          <li>节假日与调休数据内置 2025–2026 年，以国务院公布安排为准。</li>
          <li>本月日期明细可复制为 TSV，便于导入表格。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-cal-title { font-size: 14px; font-weight: 600; }
.tu-cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.tu-cal-head {
  text-align: center;
  font-size: 11.5px;
  padding: 4px 0;
  color: var(--color-text-muted);
}
.tu-cal-cell {
  position: relative;
  min-height: 46px;
  padding: 4px 2px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  cursor: pointer;
  text-align: center;
}
.tu-cal-cell.is-out { opacity: 0.4; }
.tu-cal-cell.is-weekend { background: var(--color-bg-hover); }
.tu-cal-cell.is-holiday { background: var(--color-success-soft); border-color: var(--color-success); }
.tu-cal-cell.is-makeup { background: var(--color-warning-soft); border-color: var(--color-warning); }
.tu-cal-cell.is-today { outline: 2px solid var(--color-primary); }
.tu-cal-cell.is-active { box-shadow: inset 0 0 0 2px var(--color-primary); }
.tu-cal-day { font-size: 13px; }
.tu-cal-tag { display: block; font-size: 10px; color: var(--color-text-secondary); }
.tu-legend { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--color-text-secondary); }
.dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; border: 1px solid var(--color-border); }
.dot.workday { background: var(--color-bg-card); }
.dot.weekend { background: var(--color-bg-hover); }
.dot.holiday { background: var(--color-success-soft); border-color: var(--color-success); }
.dot.makeup { background: var(--color-warning-soft); border-color: var(--color-warning); }
.tu-list { margin: 0; padding-left: 20px; font-size: 12.5px; line-height: 1.8; }
.tu-code {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12px;
}
</style>
