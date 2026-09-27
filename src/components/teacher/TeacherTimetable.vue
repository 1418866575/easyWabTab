<script setup lang="ts">
// 教师工作台课程表面板（复刻学生课程表富模型，按班级隔离）
// 布局：顶部工具条（周次/导出/清空） + 今日速览条 + 学科图例 + 7列网格（首列&表头 sticky）
// 配置入口：设置弹窗「课程表配置」子页（内嵌 TeacherTimetableConfig）
// 数据：useTeacherTimetableStore（读写落 teacher_workbench 单对象的 ClassBucket.timetable，随班级自动重载）
// 学科下拉用教师统一的 SubjectSelect（小学/初中/高中/大学分组、可筛选、可自定义）；
// 图例取课表内实际出现的学科（契合教师多学段自定义学科场景）

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { showConfirm } from '@/utils/dialog'
import { useTeacherTimetableStore } from '@/stores/teacherTimetable'
import { useTeacherStore } from '@/stores/teacher'
import { useToast } from '@/composables/useToast'
import {
  weekdayLabel,
  subjectColor,
  subjectStyleVars,
  normalizeTiming,
  computePeriodTime,
  timeToMinutes
} from '@/composables/studentTimetableCore'
import { TEACHER_SUBJECT_GROUPS } from '@/composables/teacherSubjects'
import type { StudentTimetableCell } from '@/types'
import Icon from '@/components/Icon.vue'
import SubjectSelect from '@/components/teacher/SubjectSelect.vue'

const store = useTeacherTimetableStore()
const teacherStore = useTeacherStore()
const toast = useToast()

/** 教师学科全集（四阶段分组），用于判断已有课程的学科是否「自定义」（不在预设列表里） */
const TEACHER_SUBJECT_SET = new Set(TEACHER_SUBJECT_GROUPS.flatMap((g) => g.subjects))

const DAYS = [1, 2, 3, 4, 5, 6, 7] // 周一~周日

/** 节次时间配置（缺省回落默认：08:00 开始 / 45 分钟 / 休息 10 分钟 / 上午 4 节） */
const timing = computed(() => normalizeTiming(store.data.timing))

/**
 * 第 N 节起止时间 —— 全表唯一时间来源。
 * 算法集中在 core.computePeriodTime：开始 = 首节 + (N-1)×(单节时长+课间休息)，结束 = 开始 + 单节时长。
 */
function timeOf(period: number): { startHHMM: string; endHHMM: string } {
  return computePeriodTime(period, timing.value)
}

/** 上午 / 下午分段：第 1~morningPeriods 节为上午，其余为下午 */
const morningPeriods = computed(() =>
  Math.max(1, Math.min(store.data.periodsPerDay, timing.value.morningPeriods))
)
const afternoonCount = computed(() => Math.max(0, store.data.periodsPerDay - morningPeriods.value))
const morningRows = computed(() => Array.from({ length: morningPeriods.value }, (_, i) => i + 1))
const afternoonRows = computed(() =>
  Array.from({ length: afternoonCount.value }, (_, i) => morningPeriods.value + i + 1)
)

/** 网格行高：表头 + [上午标题] + 上午各节 + [下午标题] + 下午各节；剩余高度按 1fr 均分，不产生滚动条 */
const gridRowsStyle = computed(() => {
  const parts: string[] = ['var(--stt-head-h)']
  if (morningRows.value.length) {
    parts.push('var(--stt-sec-h)')
    parts.push('repeat(' + morningRows.value.length + ', minmax(var(--stt-row-min), 1fr))')
  }
  if (afternoonRows.value.length) {
    parts.push('var(--stt-sec-h)')
    parts.push('repeat(' + afternoonRows.value.length + ', minmax(var(--stt-row-min), 1fr))')
  }
  return parts.join(' ')
})

const periods = computed(() => {
  const n = store.data.periodsPerDay
  const arr: number[] = []
  for (let i = 1; i <= n; i++) arr.push(i)
  return arr
})

/** 格子悬浮提示：课程名 + 时间 + 老师/教室（格子内只显示课程名，避免重复展示时间） */
function cellTitle(day: number, period: number): string {
  const cell = getCell(day, period)
  if (!cell) return weekdayLabel(day) + ' 第' + period + '节（空）'
  const t = timeOf(period)
  const parts = [cell.subject, t.startHHMM + '-' + t.endHHMM]
  if (cell.teacher) parts.push(cell.teacher)
  if (cell.room) parts.push(cell.room)
  return parts.join(' · ')
}

function getCell(day: number, period: number): StudentTimetableCell | undefined {
  return store.getCell(day, period)
}

// ===== 主题态（用于学科文字色提亮，暗色下保证对比度）=====
function isDarkNow(): boolean {
  if (typeof document === 'undefined') return true
  return document.documentElement.classList.contains('dark')
}
const themeTick = ref(0)
let themeObserver: MutationObserver | null = null

// ===== 实时「今天 / 当前节次」=====
const now = ref(new Date())
let nowTimer: number | undefined
function nowMinutes(): number {
  const d = now.value
  return d.getHours() * 60 + d.getMinutes()
}
// 1=周一 ... 7=周日
const todayIdx = computed(() => {
  const d = now.value.getDay()
  return d === 0 ? 7 : d
})
function isCurrent(day: number, period: number): boolean {
  const cell = getCell(day, period)
  if (!cell || day !== todayIdx.value) return false
  const t = timeOf(period)
  const cur = nowMinutes()
  return cur >= timeToMinutes(t.startHHMM) && cur < timeToMinutes(t.endHHMM)
}

// ===== 学科配色（图例取课表内实际出现的学科，兼容自定义学科）=====
const legendSubjects = computed(() => {
  const seen = new Set<string>()
  for (const cell of Object.values(store.data.schedule)) {
    if (cell.subject) seen.add(cell.subject)
  }
  return Array.from(seen)
})
function cellVars(subject: string): Record<string, string> {
  return subjectStyleVars(subject, isDarkNow())
}

// ===== 今日速览 =====
const todayLessons = computed(() => {
  const d = todayIdx.value
  return Object.keys(store.data.schedule)
    .filter((k) => k.startsWith(d + '_'))
    .map((k) => {
      const period = Number(k.split('_')[1])
      return { period, ...(store.getCell(d, period) as StudentTimetableCell) }
    })
    .sort((a, b) => timeOf(a.period).startHHMM.localeCompare(timeOf(b.period).startHHMM))
})
function lessonState(period: number): 'now' | 'upcoming' | 'done' {
  const t = timeOf(period)
  const s = timeToMinutes(t.startHHMM)
  const e = timeToMinutes(t.endHHMM)
  const cur = nowMinutes()
  if (cur >= s && cur < e) return 'now'
  if (cur < s) return 'upcoming'
  return 'done'
}

// ===== 空状态 =====
const hasAnyCell = computed(() => Object.keys(store.data.schedule).length > 0)

// ===== 周次展示切换（仅展示，不改 schedule）=====
const currentWeek = ref(1)
watch(
  () => store.data.weeks,
  (w) => {
    if (currentWeek.value > w) currentWeek.value = w
  }
)
function prevWeek(): void {
  if (currentWeek.value > 1) currentWeek.value--
}
function nextWeek(): void {
  if (currentWeek.value < store.data.weeks) currentWeek.value++
}

// ===== 导出 Excel =====
function exportToExcel() {
  const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const ps = periods.value
  const rows: string[][] = []

  rows.push(['节次', ...dayLabels])

  for (const p of ps) {
    const pt = timeOf(p)
    const row: string[] = ['第' + p + '节 ' + pt.startHHMM + '-' + pt.endHHMM]
    for (const d of DAYS) {
      const cell = getCell(d, p)
      if (cell) {
        const parts = [cell.subject]
        if (cell.teacher) parts.push(cell.teacher)
        if (cell.room) parts.push(cell.room)
        row.push(parts.join(' / '))
      } else {
        row.push('')
      }
    }
    rows.push(row)
  }

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>课程表</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>td,th{border:1px solid #999;padding:6px 8px;font-size:14px;}th{background:#3b82f6;color:#fff;font-weight:bold;text-align:center;}.period{background:#f0f9ff;font-weight:bold;text-align:center;}</style>
</head><body><table><thead><tr><th class="period">节次</th>${dayLabels.map((d) => '<th>' + d + '</th>').join('')}</tr></thead><tbody>
${rows.slice(1).map((r) => '<tr><td class="period">' + r[0] + '</td>' + r.slice(1).map((c) => '<td>' + (c || '&nbsp;') + '</td>').join('') + '</tr>').join('\n')}
</tbody></table></body></html>`

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '课程表.xls'
  a.click()
  URL.revokeObjectURL(url)
  toast.success('课程表已导出')
}

// ===== cell 编辑弹框 =====
const showCellDialog = ref(false)
const editingDay = ref(0)
const editingPeriod = ref(0)
const dialogSubject = ref('')
const dialogTeacher = ref('')
const dialogRoom = ref('')
const dialogSubjectCustom = ref(false)

/** 当前节次起止时间：由节次配置自动推算，只读展示（不再逐节填写） */
const dialogTimeText = computed(() => {
  const t = timeOf(editingPeriod.value)
  return t.startHHMM + ' - ' + t.endHHMM
})

function openCellDialog(day: number, period: number): void {
  editingDay.value = day
  editingPeriod.value = period
  const existing = getCell(day, period)
  dialogSubject.value = existing?.subject ?? ''
  dialogTeacher.value = existing?.teacher ?? ''
  dialogRoom.value = existing?.room ?? ''
  // 已有课程且学科不在教师预设分组里 → 视为自定义学科，直接用文本输入框
  dialogSubjectCustom.value = existing ? !TEACHER_SUBJECT_SET.has(existing.subject) : false
  showCellDialog.value = true
}

function closeCellDialog(): void {
  showCellDialog.value = false
}

const TIMETABLE_ERROR_MESSAGES: Record<string, string> = {
  empty: '学科不能为空',
  'invalid-time': '时间格式错误或结束时间需晚于开始时间',
  'not-found': '课程不存在'
}
function timetableErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(TIMETABLE_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

async function saveCell(): Promise<void> {
  const subject = dialogSubject.value.trim()
  if (!subject) {
    toast.error('学科不能为空')
    return
  }
  // 起止时间不再逐节填写：由 store 按节次配置自动推算写入
  const result = await store.setCellAuto(editingDay.value, editingPeriod.value, {
    subject,
    teacher: dialogTeacher.value.trim() || undefined,
    room: dialogRoom.value.trim() || undefined
  })
  if (result.ok) closeCellDialog()
  timetableErrorToast(result)
}

async function removeCell(): Promise<void> {
  const result = await store.clearCell(editingDay.value, editingPeriod.value)
  if (result.ok) closeCellDialog()
  timetableErrorToast(result)
}

async function clearAllCells(): Promise<void> {
  if (!await showConfirm('确定要清空全部课程吗？此操作不可撤销。')) return
  await store.clearAll()
  toast.success('已清空全部课程')
}

// ===== 键盘导航（gridcell 方向键移动焦点）=====
function onCellKey(e: KeyboardEvent, day: number, period: number): void {
  const map: Record<string, [number, number]> = {
    ArrowRight: [day + 1, period],
    ArrowLeft: [day - 1, period],
    ArrowDown: [day, period + 1],
    ArrowUp: [day, period - 1]
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    openCellDialog(day, period)
    return
  }
  const target = map[e.key]
  if (!target) return
  e.preventDefault()
  const [nd, np] = target
  if (nd < 1 || nd > 7 || np < 1 || np > store.data.periodsPerDay) return
  const el = document.getElementById(`tt-cell-${nd}-${np}`)
  el?.focus()
}

onMounted(async () => {
  await store.loadTimetable()
  nowTimer = window.setInterval(() => {
    now.value = new Date()
  }, 30_000)
  // 主题切换时重算学科文字色
  themeObserver = new MutationObserver(() => {
    themeTick.value++
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => {
  if (nowTimer) window.clearInterval(nowTimer)
  themeObserver?.disconnect()
})
</script>

<template>
  <div class="stt-shell">
    <div class="tw-head">
      <div>
        <h2 class="tw-title">课程表</h2>
        <p class="tw-subtitle">{{ store.data.classroom || '未设班级' }} · 每日 {{ store.data.periodsPerDay }} 节</p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <div class="stt-week-switch">
          <button class="stt-week-btn" :disabled="currentWeek <= 1" title="上一周" @click="prevWeek">‹</button>
          <span class="stt-week-label">第 {{ currentWeek }} 周</span>
          <button class="stt-week-btn" :disabled="currentWeek >= store.data.weeks" title="下一周" @click="nextWeek">›</button>
        </div>
        <el-button size="small" @click="exportToExcel">
          <Icon name="download" :size="14" /> 导出Excel
        </el-button>
        <el-button size="small" type="danger" plain @click="clearAllCells">
          <Icon name="close" :size="14" /> 清空
        </el-button>
      </div>
    </div>

    <!-- 今日速览条 -->
    <div class="stt-today" :key="themeTick">
      <div class="stt-today-head">
        <h3>今日课程 · {{ weekdayLabel(todayIdx) }}</h3>
        <span class="stt-today-tag">今天</span>
      </div>
      <div v-if="todayLessons.length" class="stt-chips">
        <div
          v-for="c in todayLessons"
          :key="c.period"
          class="stt-chip"
          :class="{ 'is-now': lessonState(c.period) === 'now', 'is-teaching': c.subject === teacherStore.cls?.subject }"
          :style="cellVars(c.subject)"
        >
          <span class="stt-chip-subject">{{ c.subject }}</span>
          <span class="stt-chip-meta">第{{ c.period }}节 · {{ timeOf(c.period).startHHMM }}-{{ timeOf(c.period).endHHMM }}{{ c.room ? ' · ' + c.room : '' }}</span>
          <span class="stt-chip-state">
            {{ lessonState(c.period) === 'now' ? '● 正在进行' : lessonState(c.period) === 'upcoming' ? '○ 待上' : '— 已结束' }}
          </span>
        </div>
      </div>
      <div v-else class="stt-chips">
        <div class="stt-chip stt-chip-empty">
          <span class="stt-chip-subject">今天没有排课</span>
          <span class="stt-chip-meta">好好休息</span>
        </div>
      </div>
    </div>

    <!-- 学科图例 -->
    <div class="stt-legend">
      <span
        v-for="s in legendSubjects"
        :key="s"
        class="stt-legend-item"
        :style="{ '--c': subjectColor(s) }"
      >
        <span class="stt-legend-dot" />{{ s }}
      </span>
    </div>

    <!-- 网格：宽高均 100% 铺满容器、不出现滚动条；按上午 / 下午分段展示 -->
    <div class="stt-grid-wrap">
      <div v-if="!hasAnyCell" class="stt-empty-banner">
        <p>还没有排课。点击下方任意格子添加第一节课～</p>
        <p class="stt-empty-hint">提示：可先在「设置 → 课程表配置」里设置学周数、每日节数与节次时间。</p>
      </div>
      <div
        class="stt-grid"
        :style="{ gridTemplateRows: gridRowsStyle }"
        role="grid"
        aria-label="课程表"
      >
        <!-- 表头：角落 + 周一~周日 -->
        <div class="stt-cell stt-corner" role="columnheader">节次</div>
        <div
          v-for="d in DAYS"
          :key="`head-${d}`"
          class="stt-cell stt-head-cell"
          :class="{ today: d === todayIdx }"
          role="columnheader"
        >{{ weekdayLabel(d) }}</div>

        <!-- 上午段 -->
        <template v-if="morningRows.length">
          <div class="stt-section" role="row">上午</div>
        <template v-for="p in morningRows" :key="`row-morningRows-${p}`">
          <div class="stt-cell stt-period-cell" role="rowheader">
            <span class="stt-period-name">第 {{ p }} 节</span>
            <span class="stt-period-time">{{ timeOf(p).startHHMM }}-{{ timeOf(p).endHHMM }}</span>
          </div>
          <div
            v-for="d in DAYS"
            :key="`cell-${d}-${p}`"
            :id="`tt-cell-${d}-${p}`"
            class="stt-cell stt-body-cell"
            :class="{ 'has-lesson': !!getCell(d, p), 'empty': !getCell(d, p), 'col-today': d === todayIdx, 'current': isCurrent(d, p), 'is-teaching': !!getCell(d, p) && getCell(d, p)!.subject === teacherStore.cls?.subject }"
            :style="getCell(d, p) ? cellVars(getCell(d, p)!.subject) : undefined"
            :title="cellTitle(d, p)"
            role="gridcell"
            tabindex="0"
            :aria-label="getCell(d, p) ? `${weekdayLabel(d)} 第${p}节 ${getCell(d, p)!.subject}` : `${weekdayLabel(d)} 第${p}节 空`"
            @click="openCellDialog(d, p)"
            @keydown="onCellKey($event, d, p)"
          >
            <template v-if="getCell(d, p)">
              <span class="stt-subject">{{ getCell(d, p)!.subject }}</span>
            </template>
            <template v-else>
              <span class="stt-add-mark">+</span>
            </template>
          </div>
        </template>
        </template>

        <!-- 下午段 -->
        <template v-if="afternoonRows.length">
          <div class="stt-section" role="row">下午</div>
        <template v-for="p in afternoonRows" :key="`row-afternoonRows-${p}`">
          <div class="stt-cell stt-period-cell" role="rowheader">
            <span class="stt-period-name">第 {{ p }} 节</span>
            <span class="stt-period-time">{{ timeOf(p).startHHMM }}-{{ timeOf(p).endHHMM }}</span>
          </div>
          <div
            v-for="d in DAYS"
            :key="`cell-${d}-${p}`"
            :id="`tt-cell-${d}-${p}`"
            class="stt-cell stt-body-cell"
            :class="{ 'has-lesson': !!getCell(d, p), 'empty': !getCell(d, p), 'col-today': d === todayIdx, 'current': isCurrent(d, p), 'is-teaching': !!getCell(d, p) && getCell(d, p)!.subject === teacherStore.cls?.subject }"
            :style="getCell(d, p) ? cellVars(getCell(d, p)!.subject) : undefined"
            :title="cellTitle(d, p)"
            role="gridcell"
            tabindex="0"
            :aria-label="getCell(d, p) ? `${weekdayLabel(d)} 第${p}节 ${getCell(d, p)!.subject}` : `${weekdayLabel(d)} 第${p}节 空`"
            @click="openCellDialog(d, p)"
            @keydown="onCellKey($event, d, p)"
          >
            <template v-if="getCell(d, p)">
              <span class="stt-subject">{{ getCell(d, p)!.subject }}</span>
            </template>
            <template v-else>
              <span class="stt-add-mark">+</span>
            </template>
          </div>
        </template>
        </template>
      </div>
    </div>


    <!-- cell 编辑弹框 -->
    <el-dialog v-model="showCellDialog" :title="getCell(editingDay, editingPeriod) ? '编辑课程' : '新增课程'" width="460px" class="stt-cell-dialog" append-to-body>
      <div class="dialog-body">
        <div class="stt-dialog-meta">
          {{ weekdayLabel(editingDay) }} · 第 {{ editingPeriod }} 节
        </div>
        <div class="form-field">
          <label>学科</label>
          <SubjectSelect v-if="!dialogSubjectCustom" v-model="dialogSubject" placeholder="请选择学科" />
          <el-input
            v-else
            v-model="dialogSubject"
            type="text"
            placeholder="输入学科名称"
            maxlength="10"
          />
          <el-checkbox class="stt-custom-toggle" v-model="dialogSubjectCustom">自定义学科</el-checkbox>
        </div>
        <div class="stt-dialog-time">
          上课时间 <b>{{ dialogTimeText }}</b>（按节次配置自动推算）
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>老师（可选）</label>
            <el-input v-model="dialogTeacher" type="text" maxlength="20" placeholder="如：王老师" />
          </div>
          <div class="form-field">
            <label>教室（可选）</label>
            <el-input v-model="dialogRoom" type="text" maxlength="20" placeholder="如：301" />
          </div>
        </div>
      </div>
      <template #footer>
        <div class="stt-dialog-footer">
          <el-button v-if="getCell(editingDay, editingPeriod)" type="danger" @click="removeCell">
            删除
          </el-button>
          <div class="dialog-footer-right">
            <el-button @click="closeCellDialog">取消</el-button>
            <el-button type="primary" @click="saveCell">保存</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.stt-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  /* 关键修复：教师工作台内容区无定高（min-height:100vh），整页不滚动，
     导致课程表超出视口底部被截断且无法查看。此处把面板自身变为独立滚动容器：
     - max-height 以视口为准（减顶部栏与内容内边距预留量），内容短时不强制撑高（仅 max-height）；
     - overflow:auto 使内容超高时在本容器内垂直滚动，不撑破页面、不影响其他内容；
     - overscroll-behavior:contain 阻止滚动穿透到页面；表头 / 节次列 sticky 相对本容器吸顶。 */
  max-height: calc(100dvh - 130px);
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  /* 网格保底宽度：保证星期列不被压得不可读；超出时由本容器横向滚动查看。 */
  --stt-grid-min: 560px;
}

.stt-subtitle {
  margin: 4px 0 0;
  font-size: var(--font-size-sm, 12px);
  color: var(--color-text-muted, #94a3b8);
}

.stt-week-switch {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  padding: 2px;
}
.stt-week-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #4b5563);
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.stt-week-btn:hover:not(:disabled) {
  background: var(--color-hover, #f3f4f6);
  color: var(--color-primary, #3b82f6);
}
.stt-week-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.stt-week-label {
  min-width: 64px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
}

/* 今日速览条 */
.stt-today {
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 12px;
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}
.stt-today-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.stt-today-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.stt-today-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}
.stt-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.stt-chip {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 104px;
  padding: 8px 12px;
  border-radius: 8px;
  border-left: 3px solid var(--c, #64748b);
  background: var(--c-soft, var(--color-hover, #f3f4f6));
}
.stt-chip.is-now {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 1px;
}
.stt-chip-subject {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-strong, var(--color-text, #1f2937));
}
.stt-chip-meta {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}
.stt-chip-state {
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
}
.stt-chip-empty .stt-chip-subject {
  color: var(--color-text-muted, #6b7280);
}

/* 图例 */
.stt-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.stt-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary, #4b5563);
}
.stt-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--c, #64748b);
}

/* 网格容器：高度随内容自然撑开，宽度有 --stt-grid-min 保底；超出部分统一交给页面滚动。
   表头 / 节次列仍 position:sticky，滚动时相对页面吸顶 / 吸左。 */
.stt-grid-wrap {
  flex: 0 0 auto;
  width: 100%;
  min-width: var(--stt-grid-min, 560px);
  display: flex;
  flex-direction: column;
  overflow: visible;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  background: var(--color-bg-card, #fff);
}
/* ===== 移动端适配（与页面级滚动兼容：横向滚动交由页面层，此处只保证可读与触控）=====
   问题：375px 下每列仅剩约 36px，学科名被截成单字，触控宽度远低于 44px。
   改法：每列 64px 最小宽度 + 字号收敛 + 周次按钮 44px 触控目标；超宽时由页面级横向滚动。 */
@media (max-width: 768px) {
  .stt-grid {
    --stt-period-col: 52px;
    grid-template-columns: var(--stt-period-col) repeat(7, minmax(64px, 1fr));
    min-width: max-content;
  }

  /* 格子字号收敛，配合更紧凑的布局 */
  .stt-cell {
    font-size: 12px;
  }

  /* 周次切换按钮触控目标 44px（原 28×28px） */
  .stt-week-btn {
    min-width: 44px;
    min-height: 44px;
  }
}
.stt-grid {
  --stt-period-col: 74px;
  --stt-head-h: 40px;
  --stt-sec-h: 32px;
  /* 每节课行最小高度：保证格子不会因节数变多而被压得过矮 */
  --stt-row-min: 60px;
  flex: 0 0 auto;
  width: 100%;
  display: grid;
  grid-template-columns: var(--stt-period-col) repeat(7, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
}
.stt-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  font-size: 14px;
  overflow: hidden;
}
.stt-corner {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 5;
  background: var(--color-surface, #fff);
  font-weight: 600;
  color: var(--color-text-muted, #6b7280);
  min-height: 38px;
  min-width: 48px;
}
.stt-head-cell {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
  font-size: 14px;
  min-height: 38px;
}
.stt-head-cell.today {
  background: var(--color-primary, #3b82f6);
  color: #fff;
}
.stt-head-cell.today::after {
  content: '今天';
  display: block;
  font-size: 10px;
  font-weight: 500;
  opacity: 0.9;
  margin-top: 1px;
}
.stt-period-cell {
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  background: var(--color-hover, #f3f4f6);
  font-weight: 600;
  color: var(--color-text-muted, #6b7280);
  min-width: 0;
  min-height: 0;
  padding: 2px;
}
.stt-period-name {
  font-size: 13px;
  white-space: nowrap;
}
.stt-period-time {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted, #9ca3af);
  white-space: nowrap;
}
/* 上午 / 下午分段标题：独占一行、横跨所有列 */
.stt-section {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.1));
  border-radius: 6px;
}
.stt-body-cell {
  align-items: center;
  justify-content: center;
  padding: 4px;
  cursor: pointer;
  min-width: 0;
  min-height: 0;
  text-align: center;
  transition: background 0.15s, border-color 0.15s, transform 0.15s var(--ease-out, ease);
}
.stt-body-cell:hover {
  background: var(--color-hover, #f3f4f6);
  border-color: var(--color-primary, #3b82f6);
}
.stt-body-cell:active {
  transform: scale(0.98);
}
.stt-body-cell:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 1px;
}
.stt-body-cell.has-lesson {
  background: var(--c-soft, rgba(59, 130, 246, 0.06));
  border-left: 3px solid var(--c, var(--color-primary, #3b82f6));
}
.stt-body-cell.col-today {
  background: rgba(59, 130, 246, 0.06);
}
.stt-body-cell.current {
  box-shadow: 0 0 0 2px var(--color-primary, #3b82f6), 0 0 14px rgba(59, 130, 246, 0.45);
  z-index: 1;
}
.stt-body-cell.empty {
  border-style: dashed;
  align-items: center;
  justify-content: center;
}
.stt-body-cell.empty:hover {
  border-style: solid;
}
.stt-subject {
  font-size: 15px;
  font-weight: 600;
  color: var(--c-strong, var(--color-text, #1f2937));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
/* 课程表中与「当前班级任教科目」相同的格子：醒目高亮，便于快速区分任教学科 */
.stt-body-cell.is-teaching {
  background: rgba(245, 158, 11, 0.22);
  box-shadow: inset 0 0 0 2px #f59e0b;
}
.stt-chip.is-teaching {
  background: rgba(245, 158, 11, 0.22);
  box-shadow: inset 0 0 0 2px #f59e0b;
}
.stt-teacher {
  font-weight: 500;
  font-size: 13px;
  color: var(--color-text-muted, #9ca3af);
}
.stt-time {
  font-size: 13px;
  color: var(--c, var(--color-primary, #3b82f6));
  font-weight: 500;
  margin-top: 2px;
}
.stt-badges {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.stt-badge {
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 4px;
  padding: 1px 5px;
}
.stt-add-mark {
  font-size: 22px;
  color: var(--color-text-muted, #d1d5db);
  font-weight: 300;
}

/* 空状态提示条（始终保留下方网格，保证可点击空白格新增课程） */
.stt-empty-banner {
  padding: 12px 14px;
  margin-bottom: 8px;
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.08));
  border: 1px dashed var(--color-primary, #3b82f6);
  border-radius: 8px;
  color: var(--color-text-secondary, #4b5563);
  text-align: center;
}
.stt-empty-banner p {
  margin: 2px 0;
  font-size: 14px;
}
.stt-empty-hint {
  font-size: 13px;
}

.stt-tip {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-muted, #6b7280);
}
.stt-dialog-time {
  font-size: 14px;
  color: var(--color-text-muted, #6b7280);
  padding: 8px 10px;
  background: var(--color-hover, #f3f4f6);
  border-radius: 6px;
}
.stt-dialog-time b {
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}

.dialog-body {
  padding: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-field label {
  font-size: 15px;
  font-weight: 500;
}
.form-row {
  display: flex;
  gap: 12px;
}
.form-row .form-field { flex: 1; }
.stt-dialog-meta {
  font-size: 15px;
  color: var(--color-text-muted, #6b7280);
  padding: 6px 10px;
  background: var(--color-hover, #f3f4f6);
  border-radius: 6px;
}
.stt-custom-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 15px;
  font-weight: 400;
  color: var(--color-text-muted, #6b7280);
  cursor: pointer;
}
.dialog-footer-right {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.stt-dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

@media (max-width: 768px) {
  /* 移动端顶部栏换行更高、底部有安全区，预留更多余量避免被截断 */
  .stt-shell { max-height: calc(100dvh - 168px); }
  .stt-grid { --stt-period-col: 60px; --stt-head-h: 36px; --stt-sec-h: 30px; --stt-row-min: 54px; }
  .stt-period-name { font-size: 12px; }
  .stt-period-time { font-size: 10px; }
  .stt-subject { font-size: 14px; }
  .form-row { flex-direction: column; }
}

@media (max-width: 480px) {
  .stt-cell-dialog :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 92vw;
  }
}
</style>
