<script setup lang="ts">
// 学生工作台习惯打卡面板（M2）
// 复刻成人 WorkbenchHabits 布局，差异：
// 1. 使用 useStudentHabitsStore（独立 IDB store 'student_habits'，严格隔离成人数据）
// 2. 增加分类筛选 tabs（全部/生活/学习/运动 + 自定义分类入口）
// 3. 学段默认习惯播种：首次加载时若 stageHabitsSeeded !== stage 触发
// 4. 弹框增加 category 字段
// 5. 卡片栅格/行高与成人 WorkbenchHabits 完全一致（minmax(300px,1fr)，rowHeight 330，自适应每页条数）

import { computed, onMounted, ref, watch } from 'vue'
import { showConfirm, toastAlert } from '@/utils/dialog'
import { useStudentHabitsStore } from '@/stores/studentHabits'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import { DEFAULT_HABIT_COLOR } from '@/composables/habitCore'
import {
  categoryLabel,
  filterHabitsByCategory,
  isBuiltinCategory,
  shouldSeedStageHabits
} from '@/composables/studentHabitsCore'
import type { HabitFrequency } from '@/composables/habitCore'
import type { StudentHabitCategory } from '@/types'
import {
  DEFAULT_HABIT_POINTS,
  HABIT_POINTS_MIN,
  HABIT_POINTS_MAX,
  validateHabitPoints
} from '@/composables/studentHabitsCore'
import HabitCalendarCard from '@/components/workbench/HabitCalendarCard.vue'
import { STUDENT_HABIT_BUILTIN_CATEGORIES } from '@/types'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'
import Icon from '@/components/Icon.vue'
import StudentToolbar from '@/components/student/StudentToolbar.vue'

const store = useStudentHabitsStore()
const settingsStore = useStudentSettingsStore()
const toast = useToast()

const today = localToday()

/** 今日是否已打卡。 */
function isChecked(habitId: string): boolean {
  return store.records.some(r => r.habitId === habitId && r.date === today)
}

// 分类筛选：'all' 全部 / 内置 3 类 / 'uncategorized' 未分类 / 自定义
const activeCategory = ref<string>('all')

/** 可见分类 tabs：全部 + 内置 3 类 + 用户自定义分类（去重保序） */
const categoryTabs = computed(() => {
  const tabs: { key: string; label: string }[] = [{ key: 'all', label: '全部' }]
  for (const c of STUDENT_HABIT_BUILTIN_CATEGORIES) {
    tabs.push({ key: c, label: categoryLabel(c) })
  }
  const custom = new Set<string>()
  for (const h of store.habits) {
    if (h.category && !isBuiltinCategory(h.category)) {
      custom.add(h.category)
    }
  }
  for (const c of custom) {
    tabs.push({ key: c, label: categoryLabel(c) })
  }
  tabs.push({ key: 'uncategorized', label: '未分类' })
  return tabs
})

/** 筛选后的习惯列表 */
const filteredHabits = computed(() => filterHabitsByCategory(store.habits, activeCategory.value))

/** 卡片视图数据：未打卡置顶，已打卡沉底；同状态内保持录入顺序 */
const viewHabits = computed(() =>
  filteredHabits.value
    .map((h, i) => ({ h, i, checked: isChecked(h.id) }))
    .sort((a, b) => (a.checked === b.checked ? a.i - b.i : a.checked ? 1 : -1))
    .map(({ h }) => ({
      habit: h,
      checked: isChecked(h.id),
      streak: store.streakOfHabit(h.id, h.frequency, today),
      week: store.weeklyAttainmentOfHabit(h.id, h.frequency, today)
    }))
)

// 自适应分页（改用月历卡片后行高与成人一致：330）
const mainEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => viewHabits.value,
  rowHeight: 330,
  containerRef: mainEl,
  gridRef: listEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto } = paging

watch(activeCategory, () => goto(1))

const FREQUENCY_OPTIONS: { value: HabitFrequency; label: string }[] = [
  { value: 7, label: '每天' },
  { value: 5, label: '每周 5 次' },
  { value: 3, label: '每周 3 次' },
  { value: 1, label: '每周 1 次' }
]

const HABIT_ERROR_MESSAGES: Record<string, string> = {
  empty: '习惯名称不能为空',
  duplicate: '该分类下已存在同名习惯',
  'not-found': '习惯不存在',
  'in-use': '该分类下有习惯，无法删除'
}

function habitErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(HABIT_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

const showEditDialog = ref(false)
const editingId = ref<string | null>(null)
const dialogName = ref('')
const dialogCategory = ref<StudentHabitCategory>('life')
const dialogFrequency = ref<HabitFrequency>(7)
const dialogColor = ref(DEFAULT_HABIT_COLOR)

function openAddDialog(): void {
  editingId.value = null
  dialogName.value = ''
  dialogCategory.value = activeCategory.value !== 'all' && activeCategory.value !== 'uncategorized'
    ? activeCategory.value
    : 'life'
  dialogFrequency.value = 7
  dialogColor.value = DEFAULT_HABIT_COLOR
  showEditDialog.value = true
}

function openEditDialog(id: string): void {
  const h = store.habits.find(x => x.id === id)
  if (!h) return
  editingId.value = h.id
  dialogName.value = h.name
  dialogCategory.value = h.category || 'life'
  dialogFrequency.value = h.frequency
  dialogColor.value = h.color ?? DEFAULT_HABIT_COLOR
  showEditDialog.value = true
}

async function closeEditDialog(): void {
  showEditDialog.value = false
  editingId.value = null
}

async function saveEditDialog(): Promise<void> {
  const name = dialogName.value.trim()
  if (!name) {
    toast.error('习惯名称不能为空')
    return
  }
  if (editingId.value !== null) {
    const result = await store.updateHabit(editingId.value, {
      name,
      category: dialogCategory.value,
      frequency: dialogFrequency.value,
      color: dialogColor.value
    })
    if (result.ok) closeEditDialog()
    habitErrorToast(result)
    return
  }
  const result = await store.addHabit(name, dialogCategory.value, dialogFrequency.value, dialogColor.value)
  if (result.ok) {
    closeEditDialog()
    goto(1)
  }
  habitErrorToast(result)
}

async function handleDelete(id: string): Promise<void> {
  const h = store.habits.find(x => x.id === id)
  if (!h) return
  if (!await showConfirm(`确定要删除习惯「${h.name}」吗？删除后打卡记录一并清除。`)) return
  const result = await store.deleteHabit(id)
  if (result.ok) {
    if (editingId.value === id) closeEditDialog()
    goto(1)
  }
  habitErrorToast(result)
}

// 月历卡片点击某天 = 打卡/取消（卡片只上抛 toggle，具体由 store 执行）
async function onToggleCheckIn(habitId: string, date: string): Promise<void> {
  const result = await store.toggleCheckIn(habitId, date)
  if (!result.ok) habitErrorToast(result)
}

// ===== 打卡记录（列表 + 新增/编辑本次积分）=====
const RECORD_LIMIT = 50
const recordListVisible = ref(false)
const recordDialogVisible = ref(false)
const recordEditingId = ref<string | null>(null)
const recordFormHabitId = ref('')
const recordFormDate = ref(today)
const recordFormPoints = ref<number>(DEFAULT_HABIT_POINTS)

/** 打卡记录行：日期倒序，最多最近 50 条 */
const recordRows = computed(() =>
  [...store.records]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, RECORD_LIMIT)
    .map(r => ({
      id: r.id,
      date: r.date,
      habitName: store.habits.find(h => h.id === r.habitId)?.name ?? '（已删除习惯）',
      points: r.points ?? DEFAULT_HABIT_POINTS,
      parentMarked: r.parentMarked === true
    }))
)

function openRecordList(): void {
  recordListVisible.value = true
}

function openRecordAdd(): void {
  if (store.habits.length === 0) { toast.error('请先新增习惯'); return }
  recordEditingId.value = null
  recordFormHabitId.value = store.habits[0]?.id ?? ''
  recordFormDate.value = today
  recordFormPoints.value = DEFAULT_HABIT_POINTS
  recordDialogVisible.value = true
}

async function openRecordEdit(r: { id: string }): void {
  const rec = store.records.find(x => x.id === r.id)
  if (!rec) return
  recordEditingId.value = rec.id
  recordFormHabitId.value = rec.habitId
  recordFormDate.value = rec.date
  recordFormPoints.value = rec.points ?? DEFAULT_HABIT_POINTS
  recordDialogVisible.value = true
}

async function saveRecordDialog(): Promise<void> {
  if (validateHabitPoints(recordFormPoints.value) !== null) {
    toast.error(`积分需为 ${HABIT_POINTS_MIN}-${HABIT_POINTS_MAX} 的整数`)
    return
  }
  if (!recordFormDate.value) {
    toast.error('请选择日期')
    return
  }
  if (recordEditingId.value) {
    const r = await store.updateRecord(recordEditingId.value, { points: recordFormPoints.value })
    if (!r.ok) { habitErrorToast(r); return }
    toast.success('打卡记录已更新')
  } else {
    if (!recordFormHabitId.value) { toast.error('请选择习惯'); return }
    const r = await store.addRecord({
      habitId: recordFormHabitId.value,
      date: recordFormDate.value,
      points: recordFormPoints.value
    })
    if (!r.ok) {
      toast.error(r.reason === 'duplicate' ? '该习惯这一天已打卡' : '新增失败')
      return
    }
    toast.success('打卡记录已新增')
  }
  recordDialogVisible.value = false
}

async function handleRecordDelete(id: string): Promise<void> {
  if (!await showConfirm('确定删除这条打卡记录吗？将同时撤销该次积分。')) return
  const r = await store.deleteRecord(id)
  if (!r.ok) { habitErrorToast(r); return }
  toast.success('打卡记录已删除')
}

const stageSeeding = ref(false)

async function seedStageDefaultsIfNeeded(): Promise<void> {
  const stage = settingsStore.stage
  if (!shouldSeedStageHabits(settingsStore.settings.stageSeeded, stage)) return
  stageSeeding.value = true
  try {
    await store.seedStageHabits(stage)
    await settingsStore.markStageSeeded(stage)
  } catch (e) {
    console.error('[studentHabits] seedStageDefaults failed', e)
  } finally {
    stageSeeding.value = false
  }
}

onMounted(async () => {
  await store.loadHabits()
  await seedStageDefaultsIfNeeded()
})
</script>

<template>
  <div class="st-habits">
    <StudentToolbar title="习惯打卡">
      <el-button type="primary" size="small" class="sh-add-btn" data-testid="sh-add-btn" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增习惯
      </el-button>
      <el-button size="small" class="sh-record-add-btn" data-testid="sh-toolbar-record-add" @click="openRecordAdd">
        新增记录
      </el-button>
      <el-button size="small" class="sh-view-btn" data-testid="sh-record-view" @click="openRecordList">
        查看
      </el-button>
    </StudentToolbar>

    <el-radio-group v-model="activeCategory" class="sh-cat-tabs" size="small">
      <el-radio-button
        v-for="tab in categoryTabs"
        :key="tab.key"
        :value="tab.key"
        :data-testid="`sh-cat-${tab.key}`"
      >{{ tab.label }}</el-radio-button>
    </el-radio-group>

    <div ref="mainEl" class="sh-main">
      <div v-if="store.habits.length === 0" class="empty-state" data-testid="sh-empty">
        <p>还没有习惯{{ stageSeeding ? '，正在为你准备学段默认习惯...' : '，点上方「新增习惯」开始吧' }}</p>
      </div>

      <div v-else ref="listEl" class="sh-list" :class="{ 'sh-list-scroll': !fitsOnePage }">
        <TransitionGroup name="grid">
          <HabitCalendarCard
            v-for="v in pageItems"
            :key="v.habit.id"
            :habit="v.habit"
            :records="store.records"
            :streak="v.streak"
            :week="v.week"
            :default-color="DEFAULT_HABIT_COLOR"
            @edit="openEditDialog"
            @toggle="(d: string) => onToggleCheckIn(v.habit.id, d)"
          />
        </TransitionGroup>
      </div>
    </div>

    <PanelPager
      v-if="totalPages > 1"
      :page="currentPage"
      :total="totalPages"
      @prev="prev"
      @next="next"
    />

    <el-dialog
      v-model="showEditDialog"
      :title="editingId ? '编辑习惯' : '新增习惯'"
      width="480px"
      class="sh-dialog"
      @close="closeEditDialog"
    >
      <div class="dialog-body">
        <div class="form-field">
          <label>习惯名称</label>
          <el-input
            v-model="dialogName"
            placeholder="如：刷牙、写作业"
            maxlength="15"
            data-testid="sh-form-name"
            @keyup.enter="saveEditDialog"
          />
        </div>
        <div class="form-field">
          <label>分类</label>
          <el-select v-model="dialogCategory" data-testid="sh-form-category">
            <el-option v-for="c in STUDENT_HABIT_BUILTIN_CATEGORIES" :key="c" :value="c" :label="categoryLabel(c)" />
            <el-option value="" label="未分类" />
          </el-select>
        </div>
        <div class="form-field">
          <label>打卡频率</label>
          <el-select v-model="dialogFrequency" data-testid="sh-form-frequency">
            <el-option v-for="f in FREQUENCY_OPTIONS" :key="f.value" :value="f.value" :label="f.label" />
          </el-select>
        </div>
        <div class="form-field">
          <label>颜色</label>
          <el-color-picker v-model="dialogColor" class="form-color" data-testid="sh-form-color" />
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button v-if="editingId" type="danger" data-testid="sh-form-delete" @click="handleDelete(editingId)">
            删除
          </el-button>
          <div class="dialog-footer-right">
            <el-button @click="closeEditDialog">取消</el-button>
            <el-button type="primary" data-testid="sh-form-save" @click="saveEditDialog">保存</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
    <!-- 打卡记录新增/编辑弹框：可自定义本次打卡积分（0-100，默认 5） -->
    <el-dialog
      v-model="recordDialogVisible"
      :title="recordEditingId ? '编辑打卡记录' : '新增打卡记录'"
      width="440px"
      data-testid="sh-record-dialog"
    >
      <div class="dialog-body">
        <div class="field">
          <label class="field-label">习惯 *</label>
          <el-select
            v-model="recordFormHabitId"
            :disabled="!!recordEditingId"
            data-testid="sh-record-habit"
            style="width: 100%"
          >
            <el-option v-for="h in store.habits" :key="h.id" :value="h.id" :label="h.name" />
          </el-select>
        </div>
        <div class="field">
          <label class="field-label">日期 *</label>
          <input
            type="date"
            class="wb-menu-name-input"
            v-model="recordFormDate"
            data-testid="sh-record-date"
          />
        </div>
        <div class="field">
          <label class="field-label">本次积分（{{ HABIT_POINTS_MIN }}-{{ HABIT_POINTS_MAX }}）</label>
          <el-input-number
            v-model="recordFormPoints"
            :min="HABIT_POINTS_MIN"
            :max="HABIT_POINTS_MAX"
            :step="1"
            data-testid="sh-record-points"
          />
          <p class="sh-record-hint">默认 {{ DEFAULT_HABIT_POINTS }} 分；0 分表示本次不加分。</p>
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="recordDialogVisible = false">取消</el-button>
          <el-button type="primary" data-testid="sh-record-save" @click="saveRecordDialog">保存</el-button>
        </div>
      </template>
    </el-dialog>
    <!-- 打卡记录弹框（工具栏「查看」打开）：日期/习惯/积分/来源，支持新增与编辑 -->
    <el-dialog
      v-model="recordListVisible"
      title="打卡记录"
      width="720px"
      class="sh-dialog"
      data-testid="sh-record-list-dialog"
    >
      <div class="sh-records">
        <div class="sh-records-head">
          <span class="sh-records-count">最近 {{ recordRows.length }} 条</span>
          <el-button size="small" type="primary" data-testid="sh-record-add" @click="openRecordAdd">新增记录</el-button>
        </div>
        <div v-if="recordRows.length === 0" class="sh-records-empty" data-testid="sh-record-empty">暂无打卡记录</div>
        <div v-else class="sh-records-list">
          <div v-for="r in recordRows" :key="r.id" class="sh-record-row" :data-testid="`sh-record-${r.id}`">
            <span class="sh-record-date">{{ r.date }}</span>
            <span class="sh-record-habit">{{ r.habitName }}</span>
            <span class="sh-record-points" :data-testid="`sh-record-points-${r.id}`">+{{ r.points }} 分</span>
            <span v-if="r.parentMarked" class="sh-record-tag">家长代打卡</span>
            <span v-else class="sh-record-tag sh-record-tag-plain">自主</span>
            <span class="sh-record-ops">
              <el-button size="small" :data-testid="`sh-record-edit-${r.id}`" @click="openRecordEdit(r)">编辑</el-button>
              <el-button size="small" class="btn-delete" :data-testid="`sh-record-del-${r.id}`" @click="handleRecordDelete(r.id)">删除</el-button>
            </span>
          </div>
        </div>
      </div>
    </el-dialog>
</template>

<style scoped>
.st-habits {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
  padding: 16px;
}

.sh-cat-tabs {
  display: flex;
  flex-wrap: wrap;
}

.sh-main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.sh-list {
  display: grid;
  /* 与成人 WorkbenchHabits .hb-list 完全一致：按 300px 最小宽度自动填充，决定每行卡片个数 */
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
  align-content: start;
}
.sh-list-scroll {
  overflow-y: auto;
}

.sh-card {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 82px;
  padding: 10px 12px 10px 14px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.sh-card:hover {
  border-color: var(--sh-color, #3b82f6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.sh-card.is-checked {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.06));
}
.sh-card-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--sh-color, #3b82f6);
}

.sh-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
}
.sh-card-icon {
  color: var(--sh-color, #3b82f6);
  flex-shrink: 0;
}
.sh-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sh-card-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sh-card-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.sh-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
}
.sh-badge-cat {
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--color-hover, #f3f4f6);
}
.sh-check-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  border: 1px solid var(--sh-color, #3b82f6);
  border-radius: 6px;
  background: transparent;
  color: var(--sh-color, #3b82f6);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
  flex-shrink: 0;
}
.sh-check-btn:hover {
  background: var(--sh-color, #3b82f6);
  color: #fff;
}
.sh-check-btn.is-checked {
  background: var(--color-hover, #f3f4f6);
  border-color: var(--color-border, #e5e7eb);
  color: var(--color-text-muted, #9ca3af);
  cursor: default;
}

.sh-week-bar {
  height: 3px;
  background: var(--color-hover, #f3f4f6);
  border-radius: 2px;
  overflow: hidden;
}
.sh-week-fill {
  height: 100%;
  transition: width 0.3s;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
  color: var(--color-text-muted, #6b7280);
  font-size: 14px;
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-field label {
  font-size: 13px;
  font-weight: 500;
}
.form-color {
  width: 36px;
}
.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.dialog-footer-right {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.grid-enter-active, .grid-leave-active {
  transition: all 0.3s ease;
}
.grid-enter-from, .grid-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

@media (max-width: 768px) {
  /* 移动端解除高度约束，让面板随内容自然撑开，由外层 .st-content 统一滚动
     （避免记录被 .sh-main overflow:hidden 裁切、且 .sh-list 无高度约束致 overflow-y:auto 失效、无法下滑） */
  .st-habits {
    height: auto;
    min-height: 0;
    padding: 12px;
  }
  .sh-main {
    flex: none;
    min-height: 0;
    overflow: visible;
  }
  .sh-list {
    overflow: visible;
    max-height: none;
  }
}

@media (max-width: 480px) {
  .sh-dialog :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 92vw;
  }
}
/* ===== 打卡记录列表 ===== */
.sh-records {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sh-records-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.sh-records-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}
.sh-records-count {
  flex: 1;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}
.sh-records-empty {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  padding: 10px 0;
}
.sh-records-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 46vh;
  overflow-y: auto;
}
.sh-record-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  background: var(--color-bg-card, var(--color-bg-card));
  font-size: 13px;
  color: var(--color-text, var(--color-text));
}
.sh-record-date {
  font-variant-numeric: tabular-nums;
  min-width: 92px;
}
.sh-record-habit {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sh-record-points {
  min-width: 56px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-primary, var(--color-primary));
}
.sh-record-tag {
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  color: var(--color-primary, var(--color-primary));
}
.sh-record-tag-plain {
  background: transparent;
  color: var(--color-text-muted, #6b7280);
  border: 1px solid var(--color-border, var(--color-border));
}
.sh-record-ops {
  display: flex;
  gap: 4px;
}
.sh-record-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}
</style>