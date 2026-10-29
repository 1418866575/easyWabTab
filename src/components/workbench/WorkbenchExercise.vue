<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { showConfirm } from '@/utils/dialog'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { injectHealthStore, type HealthStoreLike } from '@/composables/healthStoreContext'
import WeeklyPlanBoard, { type WeeklyPlanCell, type WeeklyPlanRow } from './WeeklyPlanBoard.vue'
import { calcExerciseAttainment, calcYearDistanceTotals, mondayOfDate, shiftDateKey, weekDayKeys } from '@/composables/healthCore'
import type { HealthWeeklyPlanItem } from '@/types'
import { localToday } from '@/composables/todoCore'
import { EXERCISE_TYPES, type HealthPlanMetric } from '@/types'
import WorkbenchHealthReminders from './WorkbenchHealthReminders.vue'
import Icon from '@/components/Icon.vue'
import WorkbenchFab from '@/components/workbench/WorkbenchFab.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'

/** 表单弹框尺寸（沿用原 .dialog 的固定尺寸，非设置项） */
const PANEL_WIDTH = '480px'
const PANEL_MAX_HEIGHT = '85vh'


// store 来源可注入：默认成人端 store，学生端容器 provide 自己的 store 后自动改为学生数据（见 healthStoreContext）
const store = (injectHealthStore() ?? useWorkbenchHealthStore()) as HealthStoreLike


// ===== 本周计划（早晨 / 傍晚，仅成人端 store 提供周计划能力时显示）=====
const PLAN_ROWS: WeeklyPlanRow[] = [
  { key: 'morning', label: '早晨', icon: 'sun' },
  { key: 'evening', label: '傍晚', icon: 'moon' }
]
const planWeekStart = ref(mondayOfDate(localToday()))
// 进入/切换某周时：该周从未编辑过且上周有内容 → 自动复制上周计划（幂等）
watch(planWeekStart, (wk) => { void store.ensureWeeklyPlanCopied?.(wk) }, { immediate: true })
const canPlan = computed(() => !!store.weeklyPlans && !!store.setWeeklyPlanItems)
const planItems = computed<HealthWeeklyPlanItem[]>(() => store.weeklyPlans?.[planWeekStart.value]?.exercise ?? [])
const planWeekLabel = computed(() => {
  const keys = weekDayKeys(planWeekStart.value)
  if (keys.length !== 7) return ''
  const fmt = (k: string) => `${Number(k.slice(5, 7))}.${Number(k.slice(8, 10))}`
  return `${keys[0].slice(0, 4)} 年 · ${fmt(keys[0])} – ${fmt(keys[6])}`
})
const planStat = computed(() => `已完成 ${planItems.value.filter(i => i.done).length}/${planItems.value.length} 项`)
const planCells = computed<Record<string, WeeklyPlanCell>>(() => {
  const cells: Record<string, WeeklyPlanCell> = {}
  for (const row of PLAN_ROWS) {
    for (let day = 1; day <= 7; day++) {
      const it = planItems.value.find(x => x.rowKey === row.key && x.day === day)
      cells[`${row.key}:${day}`] = !it
        ? { state: 'empty' }
        : it.name === '休息'
          ? { state: 'rest' }
          : it.done
            ? { name: it.name, sub: it.value, subTone: 'success', state: 'done' }
            : { name: it.name, sub: it.value, subTone: 'primary', state: 'planned' }
    }
  }
  return cells
})
function onPlanNav(dir: number): void {
  if (dir === 0) {
    planWeekStart.value = mondayOfDate(todayStr)
    return
  }
  const keys = weekDayKeys(planWeekStart.value)
  const base = dir < 0 ? keys[0] : keys[6]
  // 平移后必须归位到周一：从周日 +7 会落到下周二，导致「上周」查错周而复制失败
  planWeekStart.value = mondayOfDate(shiftDateKey(base, dir * 7))
}
const planDialogOpen = ref(false)
const planEditCell = ref<{ rowKey: string; day: number } | null>(null)
const planHasExisting = ref(false)
const planForm = ref({ name: '', value: '', done: false })
function onPlanCellClick(rowKey: string, day: number): void {
  const existing = planItems.value.find(x => x.rowKey === rowKey && x.day === day)
  planEditCell.value = { rowKey, day }
  planHasExisting.value = !!existing
  planForm.value = { name: existing?.name ?? '', value: existing?.value ?? '', done: existing?.done ?? false }
  planDialogOpen.value = true
}
/** 保存：名称填「休息」= 休息日；留空 = 删除该格；否则按 (rowKey, day) 覆盖 */
async function savePlanItem(): Promise<void> {
  const cell = planEditCell.value
  if (!cell || !store.setWeeklyPlanItems) return
  const name = planForm.value.name.trim()
  const value = planForm.value.value.trim()
  const others = planItems.value.filter(x => !(x.rowKey === cell.rowKey && x.day === cell.day))
  const items: HealthWeeklyPlanItem[] = name
    ? [...others, { id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, day: cell.day, rowKey: cell.rowKey, name, value: value || undefined, done: planForm.value.done }]
    : others
  await store.setWeeklyPlanItems(planWeekStart.value, 'exercise', items)
  planDialogOpen.value = false
}
async function deletePlanItem(): Promise<void> {
  const cell = planEditCell.value
  if (!cell || !store.setWeeklyPlanItems) return
  await store.setWeeklyPlanItems(planWeekStart.value, 'exercise', planItems.value.filter(x => !(x.rowKey === cell.rowKey && x.day === cell.day)))
  planDialogOpen.value = false
}

// ===== 顶部目标卡 =====
const todayStr = localToday()

// 达标率/周计算禁止在组件内重算，必须调 healthCore 纯函数
const targetView = computed<{ label: string; current: number; target: number; percent: number } | null>(() => {
  const plan = store.plans.exercise
  if (!plan) return null
  const a = calcExerciseAttainment(store.records.exercise, store.plans.exercise, todayStr)
  return {
    label: `每周 ${plan.target} ${METRIC_LABELS[plan.metric]}`,
    current: a?.current ?? 0,
    target: a?.target ?? plan.target,
    // 进度条宽度 = min(percent,1)*100%（取整显示，超量钳到 100%）
    percent: Math.floor(Math.min(a?.percent ?? 0, 1) * 100)
  }
})

// 年度跑步/骑行距离总数（公里，1 位小数）——纯展示，无交互；禁止组件内重算
const yearTotals = computed(() => calcYearDistanceTotals(store.records.exercise, todayStr.slice(0, 4)))

const METRIC_LABELS: Record<HealthPlanMetric, string> = {
  times: '次',
  minutes: '分钟',
  calories: '千卡',
  duration: '小时'
}

// ===== 目标弹框 =====
const showTargetDialog = ref(false)
const formMetric = ref<HealthPlanMetric>('times')
const formTarget = ref('')

const METRIC_OPTIONS: { value: HealthPlanMetric; label: string }[] = [
  { value: 'times', label: '次数' },
  { value: 'minutes', label: '时长（分钟）' },
  { value: 'calories', label: '热量（千卡）' }
]

// 目标必须 > 0，否则保存按钮 disabled
const isTargetValid = computed(() => {
  const t = Number(formTarget.value)
  return Number.isFinite(t) && t > 0
})

function openTargetDialog(): void {
  const plan = store.plans.exercise
  formMetric.value =
    plan && METRIC_OPTIONS.some(o => o.value === plan.metric) ? plan.metric : 'times'
  formTarget.value = plan ? String(plan.target) : ''
  showTargetDialog.value = true
}

function closeTargetDialog(): void {
  showTargetDialog.value = false
}

async function handleSaveTarget(): Promise<void> {
  if (!isTargetValid.value) return
  await store.setPlan('exercise', { metric: formMetric.value, period: 'weekly', target: Number(formTarget.value) })
  closeTargetDialog()
}

async function handleClearTarget(): Promise<void> {
  if (await showConfirm('确定要清除运动目标吗？')) {
    await store.setPlan('exercise', null)
    closeTargetDialog()
  }
}

// ===== 记录列表（date 降序，同日按 createdAt 降序）=====
const sortedRecords = computed(() => {
  return [...store.records.exercise].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1
  )
})

// ===== 记录表单（新增/编辑共用弹框）=====
const showRecordDialog = ref(false)
const editingId = ref<string | null>(null)
const formDate = ref(localToday())
const formType = ref<string>(EXERCISE_TYPES[0])
const formDuration = ref('')
const formCalories = ref('0')
const formDistance = ref('')
const formNote = ref('')

// 距离（公里）仅对 跑步/游泳/骑行 可选展示
const DISTANCE_TYPES = new Set(['跑步', '游泳', '骑行'])
const showDistanceField = computed(() => DISTANCE_TYPES.has(formType.value))

// ===== 记录列表分页（面板底部内联展示，固定每页 10 条）=====
const listPage = ref(1)
const LIST_PAGE_SIZE = 10

const listPageItems = computed(() => {
  const start = (listPage.value - 1) * LIST_PAGE_SIZE
  return sortedRecords.value.slice(start, start + LIST_PAGE_SIZE)
})



// date 必填 + duration > 0 + calories ≥ 0 + （距离可选，填写则须 ≥ 0），否则保存按钮 disabled
const isFormValid = computed(() => {
  const dur = Number(formDuration.value)
  const cal = Number(formCalories.value)
  const dist = Number(formDistance.value)
  const distOk = !showDistanceField.value || formDistance.value === '' || (Number.isFinite(dist) && dist >= 0)
  return formDate.value !== '' && Number.isFinite(dur) && dur > 0 && Number.isFinite(cal) && cal >= 0 && distOk
})

function startAddRecord(): void {
  editingId.value = null
  formDate.value = localToday()
  formType.value = EXERCISE_TYPES[0]
  formDuration.value = ''
  formCalories.value = '0'
  formDistance.value = ''
  formNote.value = ''
  showRecordDialog.value = true
}

function startEditRecord(id: string): void {
  const rec = store.records.exercise.find(r => r.id === id)
  if (!rec) return
  editingId.value = id
  formDate.value = rec.date
  formType.value = rec.exerciseType
  formDuration.value = String(rec.duration)
  formCalories.value = String(rec.calories)
  formDistance.value = String(rec.distanceKm ?? '')
  formNote.value = rec.note ?? ''
  showRecordDialog.value = true
}

function cancelRecordForm(): void {
  showRecordDialog.value = false
  editingId.value = null
}

async function handleSaveRecord(): Promise<void> {
  if (!isFormValid.value) return
  const note = formNote.value.trim()
  const payload: Record<string, unknown> = {
    date: formDate.value,
    exerciseType: formType.value,
    duration: Number(formDuration.value),
    calories: Number(formCalories.value)
  }
  if (note) payload.note = note
  if (showDistanceField.value) {
    payload.distanceKm = formDistance.value === '' ? undefined : Number(formDistance.value)
  }
  if (editingId.value) {
    await store.updateRecord('exercise', editingId.value, payload)
  } else {
    await store.addRecord('exercise', payload)
  }
  listPage.value = 1 // 新增/编辑后回到第 1 页
  cancelRecordForm()
}

async function handleDeleteRecord(id: string): Promise<void> {
  if (await showConfirm('确定要删除这条运动记录吗？')) {
    await store.deleteRecord('exercise', id)
    listPage.value = 1 // 删除后回到第 1 页
  }
}

// 面板自管理数据加载（WorkbenchView 后续集成后会统一加载，这里防御性幂等重载）
onMounted(async () => {
  const recs = store.records
  const recordsEmpty =
    recs.exercise.length === 0 && recs.diet.length === 0 && recs.sleep.length === 0 && recs.weight.length === 0
  const notLoaded = store.height === undefined && Object.keys(store.plans).length === 0
  if (recordsEmpty && notLoaded) {
    await store.loadHealth()
  }
})
</script>

<template>
  <div class="wb-exercise">
    <!-- 顶部目标卡（复用 stat-card 结构） -->
    <div class="stat-card">
      <div class="stat-header">
        <Icon name="exercise" :size="16" class="stat-icon" />
        <span class="stat-label">运动目标</span>
        <span class="stat-pill" data-testid="ex-year-run">跑步 {{ yearTotals['跑步'] ?? 0 }} 公里</span>
        <span class="stat-pill" data-testid="ex-year-ride">骑行 {{ yearTotals['骑行'] ?? 0 }} 公里</span>
        <div class="stat-panel-actions">
          <el-button class="btn-add" data-testid="ex-add" @click="startAddRecord">＋ 新增</el-button>
        </div>
        <el-button v-if="targetView" class="nav-btn" data-testid="ex-edit-target" @click="openTargetDialog">
          调整目标
        </el-button>
        <el-button v-else class="nav-btn" data-testid="ex-target" @click="openTargetDialog">设定目标</el-button>
      </div>
      <template v-if="targetView">
        <div class="stat-value" data-testid="ex-plan-label">{{ targetView.label }}</div>
        <div class="ex-attainment" data-testid="ex-attainment">本周 {{ targetView.current }}/{{ targetView.target }}</div>
        <div class="ex-progress" data-testid="ex-progress">
          <div class="ex-progress-fill" :style="{ width: targetView.percent + '%' }"></div>
        </div>
      </template>
      <div v-else class="stat-sub">尚未设定周目标</div>
    </div>

    <!-- 本周计划（早晨/傍晚） -->
    <WeeklyPlanBoard
      v-if="canPlan"
      title="运动周计划"
      :week-start="planWeekStart"
      :week-label="planWeekLabel"
      :stat-text="planStat"
      stat-tone="success"
      icon-bg="var(--color-primary-light, #eff6ff)"
      icon-color="var(--color-primary, #3b82f6)"
      :rows="PLAN_ROWS"
      :cells="planCells"
      hint="点任意单元格即可编辑该项目"
      data-testid="ex-plan-board"
      @nav="onPlanNav"
      @cell-click="onPlanCellClick"
    />

    <!-- 定时提醒（只读小模块） -->
    <WorkbenchHealthReminders module="exercise" />

    <!-- 空态 -->
    <div
      v-if="store.records.exercise.length === 0"
      class="empty-state empty-invite"
      data-testid="ex-empty"
      @click="startAddRecord"
    >
      ＋ 新增第一条运动记录
    </div>

    <!-- 运动记录列表（面板底部内联展示，固定每页 10 条） -->
    <section v-if="sortedRecords.length > 0" class="ewt-inline-section" data-testid="ex-records-section">
      <div class="ewt-inline-head">
        <h3 class="ewt-inline-title">运动记录（{{ sortedRecords.length }} 条）</h3>
      </div>
      <el-table class="ewt-table"
        :data="listPageItems"
        stripe
        border
        size="default"
        style="width: 100%"
        empty-text="暂无运动记录"
      >
        <el-table-column type="index" label="序号" width="70" align="center" class-name="ewt-index-col" :index="(i: number) => (listPage - 1) * LIST_PAGE_SIZE + i + 1" />
        <el-table-column label="日期" width="130" align="center">
          <template #default="{ row }">{{ row.date }}</template>
        </el-table-column>
        <el-table-column label="类型" width="120" align="center">
          <template #default="{ row }">
            <span class="ld-cat-type-badge">{{ row.exerciseType }}</span>
          </template>
        </el-table-column>
        <el-table-column label="时长" width="110" align="right">
          <template #default="{ row }">{{ row.duration }} 分钟</template>
        </el-table-column>
        <el-table-column label="距离" width="110" align="right">
          <template #default="{ row }">
            <template v-if="DISTANCE_TYPES.has(row.exerciseType) && row.distanceKm !== undefined">
              {{ Number(row.distanceKm).toFixed(1) }} km
            </template>
            <span v-else style="color: var(--color-text-secondary, #9ca3af);">—</span>
          </template>
        </el-table-column>
        <el-table-column label="消耗" width="110" align="right">
          <template #default="{ row }">
            <span style="font-weight: 700; color: var(--color-success, #16a34a); font-variant-numeric: tabular-nums;">
              {{ row.calories }} kcal
            </span>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="200" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.note">{{ row.note }}</span>
            <span v-else style="color: var(--color-text-secondary, #9ca3af);">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" align="center" fixed="right" class-name="ewt-op-col">
          <template #default="{ row }">
            <el-button class="btn-edit" :data-testid="`ex-edit-${row.id}`" @click="startEditRecord(row.id)">编辑</el-button>
            <el-button class="btn-delete" :data-testid="`ex-delete-${row.id}`" @click="handleDeleteRecord(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="ex-list-pager ewt-pager">
        <el-pagination
          v-model:current-page="listPage"
          :page-size="LIST_PAGE_SIZE"
          layout="total, prev, pager, next, jumper"
          :total="sortedRecords.length"
          background
          small
          prev-text="上一页"
          next-text="下一页"
        />
      </div>
    </section>

    <!-- 目标弹框 -->
<BaseDialog
        v-if="showTargetDialog"
        :title="targetView ? '调整目标' : '设定目标'"
        :width="PANEL_WIDTH"
        :max-height="PANEL_MAX_HEIGHT"
        data-testid="ex-dialog"
        @close="closeTargetDialog"
      >
          <form class="dialog-body" @submit.prevent="handleSaveTarget">
            <div class="form-group">
              <label>目标指标</label>
              <el-select v-model="formMetric" data-testid="ex-metric" size="default">
                <el-option v-for="opt in METRIC_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
              </el-select>
            </div>

            <div class="form-group">
              <label>每周目标 *</label>
              <el-input-number
                :model-value="Number(formTarget) || undefined"
                :min="1"
                :step="1"
               
                placeholder="例如：3"
                data-testid="ex-target-input"
                :controls="false"
                @update:model-value="formTarget = $event == null ? '' : String($event)"
              />
            </div>

            <div class="form-actions">
              <el-button
                v-if="targetView"
                native-type="button"
                class="btn-clear"
                data-testid="ex-clear-target"
                @click="handleClearTarget"
              >
                清除目标
              </el-button>
              <span class="form-actions-spacer"></span>
              <el-button native-type="button" class="btn-cancel" data-testid="ex-cancel" @click="closeTargetDialog">取消</el-button>
              <el-button native-type="submit" class="btn-save" :disabled="!isTargetValid" data-testid="ex-save">保存</el-button>
            </div>
          </form>
      </BaseDialog>

    <!-- 周计划单元格编辑弹框 -->
    <BaseDialog
      v-if="planDialogOpen"
      title="编辑运动计划"
      width="420px"
      data-testid="ex-plan-dialog"
      @close="planDialogOpen = false"
    >
      <form class="dialog-body" @submit.prevent="savePlanItem">
        <div class="form-group">
          <label>项目名称 *</label>
          <el-input v-model="planForm.name" maxlength="30" placeholder="如：晨跑 / 力量训练；填「休息」标记休息日" data-testid="ex-plan-name" />
        </div>
        <div class="form-group">
          <label>强度（可选）</label>
          <el-input v-model="planForm.value" maxlength="20" placeholder="如：45 min / 5 km" data-testid="ex-plan-value" />
        </div>
        <el-checkbox v-model="planForm.done" data-testid="ex-plan-done">已完成</el-checkbox>
        <div class="form-actions">
          <el-button v-if="planHasExisting" native-type="button" size="small" class="btn-clear" data-testid="ex-plan-delete" @click="deletePlanItem">
            删除
          </el-button>
          <span class="form-actions-spacer"></span>
          <el-button size="small" data-testid="ex-plan-cancel" @click="planDialogOpen = false">取消</el-button>
          <el-button type="primary" native-type="submit" size="small" data-testid="ex-plan-save">保存</el-button>
        </div>
      </form>
    </BaseDialog>

    <!-- 新增/编辑记录弹框 -->
<BaseDialog
        v-if="showRecordDialog"
        :title="editingId ? '编辑记录' : '新增记录'"
        :width="PANEL_WIDTH"
        :max-height="PANEL_MAX_HEIGHT"
        class="ex-record-overlay"
        data-testid="ex-dialog"
        @close="cancelRecordForm"
      >
          <form class="dialog-body" @submit.prevent="handleSaveRecord">
            <div class="form-row-fields">
              <div class="field">
                <label class="field-label">日期 *</label>
                <el-date-picker
                  v-model="formDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  class="field-date"
                  data-testid="ex-form-date"
                />
              </div>
              <div class="field">
                <label class="field-label">运动类型 *</label>
                <el-select v-model="formType" class="field-type" data-testid="ex-form-type">
                  <el-option v-for="t in EXERCISE_TYPES" :key="t" :value="t" :label="t" />
                </el-select>
              </div>
            </div>

            <div class="form-row-fields">
              <div class="field">
                <label class="field-label">时长（分钟）*</label>
                <el-input-number
                  :model-value="formDuration === '' ? undefined : Number(formDuration)"
                  :min="1"
                  :step="1"
                  class="field-duration"
                  placeholder="例如：30"
                  data-testid="ex-form-duration"
                  :controls="false"
                  @update:model-value="formDuration = $event == null ? '' : String($event)"
                />
              </div>
              <div class="field">
                <label class="field-label">热量（千卡）</label>
                <el-input-number
                  :model-value="Number(formCalories)"
                  :min="0"
                  :step="1"
                  class="field-calories"
                  placeholder="例如：200"
                  data-testid="ex-form-calories"
                  :controls="false"
                  @update:model-value="formCalories = $event == null ? '0' : String($event)"
                />
              </div>
            </div>

            <div v-if="showDistanceField" class="form-row-fields">
              <div class="field">
                <label class="field-label">距离（公里）</label>
                <el-input-number
                  :model-value="formDistance === '' ? undefined : Number(formDistance)"
                  :min="0"
                  :step="0.1"
                  class="field-distance"
                  placeholder="例如：5.2"
                  data-testid="ex-form-distance"
                  :controls="false"
                  :precision="1"
                  @update:model-value="formDistance = $event == null ? '' : String($event)"
                />
              </div>
            </div>

            <div class="form-group">
              <label>备注（可选）</label>
              <el-input
                v-model="formNote"
                type="textarea"
                :rows="2"
                class="desc-input"
                placeholder="补充说明…"
                data-testid="ex-form-note"
              />
            </div>

            <div class="form-actions ewt-dialog-footer">
              <el-button native-type="button" class="btn-cancel" data-testid="ex-cancel-record" @click="cancelRecordForm">
                取消
              </el-button>
              <el-button native-type="submit" class="btn-save" :disabled="!isFormValid" data-testid="ex-save-record">
                {{ editingId ? '保存' : '添加' }}
              </el-button>
              <el-button v-if="editingId" type="danger" native-type="button" data-testid="ex-record-delete" @click="handleDeleteRecord(editingId)">删除</el-button>
            </div>
          </form>
      </BaseDialog>
  </div>
<WorkbenchFab @click="startAddRecord" />
</template>

<style scoped>
/* 面板容器 */
.wb-exercise {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 目标卡（复用 WorkbenchHome stat-card 结构）===== */
.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.stat-card:hover {
  border-color: var(--color-primary, var(--color-primary));
}

.stat-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-icon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}

.stat-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  color: var(--color-primary, var(--color-primary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.nav-btn:hover {
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
  color: #fff;
}

.stat-pill {
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  color: var(--color-text-muted, var(--color-text-secondary));
  white-space: nowrap;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.stat-sub {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

/* 达标行 + 进度条（--color-primary） */
.ex-attainment {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.ex-progress {
  height: 8px;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  overflow: hidden;
}

.ex-progress-fill {
  height: 100%;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-primary, var(--color-primary));
  transition: width var(--transition-fast, 0.15s ease);
}

/* ===== 顶部 stat-header 右上角按钮容器（＋ 新增） ===== */
.stat-panel-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
/* .btn-add 视觉已统一到全局 .ui-btn--primary（style.css） */

/* ===== 操作栏（已弃用，占位保留样式兼容）===== */
.ex-headbar { display: none; }
.btn-toggle-list { display: none; }

/* ===== 弹框层级（BaseDialog 统一 z-index: 300）===== */
.ex-record-overlay { z-index: 320; }




.ex-list-pager {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  display: flex;
  justify-content: flex-end;
  align-items: center;
  background: var(--color-surface-2, #fafafa);
  border-radius: 0 0 var(--radius-lg, 12px) var(--radius-lg, 12px);
}

/* 暗色适配：.ld-cat-type-badge 已在 WorkbenchLedger 全局引入样式类在 AppSettingsDialog 内定义，
   但这里 scoped + 同名样式会被覆盖，重新定义一次保证运动/饮食/睡眠/体重等面板也生效 */
.ld-cat-type-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}
:global(html.dark) .ld-cat-type-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

@media (max-width: 640px) {
  .stat-header {
    flex-wrap: wrap;
  }
  .stat-panel-actions { margin-left: 0; width: 100%; }
  .stat-panel-actions .btn-add { flex: 1; text-align: center; }
  .field-date,
  .field-type,
  .field-duration,
  .field-calories,
  .field-distance { width: 100%; }
}

/* ===== 桌面端 ≥769px：面板钉满健康 tab 容器 ===== */
@media (min-width: 769px) {
  :global(.wb-health) {
    display: flex;
    flex-direction: column;
  }
  .wb-exercise {
    flex: 1;
    min-height: 0;
  }
}

/* .btn-add 视觉已统一到全局 .ui-btn--primary（style.css） */

/* ===== 旧卡片网格样式（已弃用：改为 ElTable，保留仅避免样式声明冗余报错）===== */
.ex-item, .ex-item-head, .ex-date, .ex-type-badge, .ex-meta, .ex-note, .ex-actions { display: none; }

/* ===== 按钮（复用 WorkbenchTodo 体系）===== */
/* .btn-edit/.btn-delete 视觉已统一到全局 .ui-btn（style.css） */
/* .btn-clear 视觉已统一到全局 .ui-btn--danger（style.css） */

/* ===== 空态：.empty-state / .empty-invite 已收敛到全局基类（src/style.css） ===== */

/* ===== 弹框内容区（原 .dialog-body；外壳主体已由 BaseDialog 的 .bd-body 承担）===== */
.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group > label {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.form-row-fields {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.field-date {
  width: 170px;
}

.field-type {
  width: 140px;
}

.field-duration {
  width: 140px;
}

.field-calories {
  width: 140px;
}

.field-distance {
  width: 140px;
}

.form-input {
  padding: 9px 12px;
  background-color: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text, var(--color-text));
  box-sizing: border-box;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary, var(--color-primary));
}

.desc-input {
  resize: vertical;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}

.form-actions-spacer {
  flex: 1;
}

.btn-save {
  padding: 9px 18px;
  background: var(--color-primary, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-save:hover:not(:disabled) {
  background: var(--color-primary-hover, var(--color-primary-hover));
}

.btn-save:disabled {
  background: var(--color-text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

/* .btn-cancel 视觉已统一到全局 .ui-btn（style.css） */

/* ===== 暗色模式覆盖 ===== */
html.dark .stat-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .ex-item {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

/* html.dark .empty-state 背景已由全局 .empty-state 的 --color-bg-card token 自动跟随 */

html.dark .ex-date {
  color: var(--color-text, #f9fafb);
}

html.dark .ex-meta,
html.dark .ex-note {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .ex-type-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

html.dark .ex-progress {
  background-color: var(--color-bg-input, #374151);
}

/* html.dark .btn-clear 视觉已统一到全局 .ui-btn--danger（style.css） */

/* 禁用态保存按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
html.dark .btn-save:disabled {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text-muted, #9ca3af);
}

html.dark .form-input,
html.dark select.form-input,
html.dark input.form-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

/* 暗色适配：ld-cat-type-badge 暗色（:global 穿透 scoped）*/
:global(html.dark) .ld-cat-type-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}


@media (max-width: 640px) {
  .stat-header { flex-wrap: wrap; }
  .stat-panel-actions { margin-left: 0; width: 100%; }
  .stat-panel-actions .btn-add { flex: 1; text-align: center; }
  .field-date,
  .field-type,
  .field-duration,
  .field-calories,
  .field-distance { width: 100%; }
}

/* ===== 弹框层级（BaseDialog 统一 z-index: 300）===== */
.ex-record-overlay { z-index: 320; }




.ex-list-pager {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  display: flex;
  justify-content: flex-end;
  align-items: center;
  background: var(--color-surface-2, #fafafa);
  border-radius: 0 0 var(--radius-lg, 12px) var(--radius-lg, 12px);
}

/* ===== 桌面端 ≥769px：面板钉满健康 tab 容器 ===== */
@media (min-width: 769px) {
  :global(.wb-health) {
    display: flex;
    flex-direction: column;
  }
  .wb-exercise {
    flex: 1;
    min-height: 0;
  }
}
</style>
