<script setup lang="ts">
import { showConfirm } from '@/utils/dialog'
import BaseDialog from '@/components/common/BaseDialog.vue'

/** 表单弹框尺寸（沿用原 .dialog 的固定尺寸，非设置项） */
const PANEL_WIDTH = '480px'
const PANEL_MAX_HEIGHT = '85vh'


import { computed, onMounted, ref, watch } from 'vue'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { injectHealthStore, type HealthStoreLike } from '@/composables/healthStoreContext'
import WeeklyPlanBoard, { type WeeklyPlanCell, type WeeklyPlanRow } from './WeeklyPlanBoard.vue'
import { calcDailyAttainment, mondayOfDate, shiftDateKey, weekDayKeys } from '@/composables/healthCore'
import type { HealthWeeklyPlanItem } from '@/types'
import { localToday } from '@/composables/todoCore'
import { MEAL_TYPES, type MealType } from '@/types'
import WorkbenchHealthReminders from './WorkbenchHealthReminders.vue'

// store 来源可注入：默认成人端 store，学生端容器 provide 自己的 store 后自动改为学生数据（见 healthStoreContext）
const store = (injectHealthStore() ?? useWorkbenchHealthStore()) as HealthStoreLike

// ===== 本周饮食计划（早/午/晚 + 合计行，仅成人端 store 提供周计划能力时显示）=====
const PLAN_ROWS: WeeklyPlanRow[] = [
  { key: 'breakfast', label: '早餐', icon: 'sun' },
  { key: 'lunch', label: '午餐', icon: 'bowl' },
  { key: 'dinner', label: '晚餐', icon: 'moon' },
  { key: 'total', label: '合计', icon: 'sum' }
]
const planWeekStart = ref(mondayOfDate(localToday()))
// 进入/切换某周时：该周从未编辑过且上周有内容 → 自动复制上周计划（幂等）
watch(planWeekStart, (wk) => { void store.ensureWeeklyPlanCopied?.(wk) }, { immediate: true })
const canPlan = computed(() => !!store.weeklyPlans && !!store.setWeeklyPlanItems)
const planItems = computed<HealthWeeklyPlanItem[]>(() => store.weeklyPlans?.[planWeekStart.value]?.diet ?? [])
const dailyKcalTarget = computed(() => store.plans.diet?.target)
const planWeekLabel = computed(() => {
  const keys = weekDayKeys(planWeekStart.value)
  if (keys.length !== 7) return ''
  const fmt = (k: string) => `${Number(k.slice(5, 7))}.${Number(k.slice(8, 10))}`
  return `${keys[0].slice(0, 4)} 年 · ${fmt(keys[0])} – ${fmt(keys[6])}`
})
function dayKcal(day: number): number {
  return planItems.value.filter(x => x.day === day).reduce((sum, x) => sum + (x.kcal ?? 0), 0)
}
const planStat = computed(() => {
  const overDays = [1, 2, 3, 4, 5, 6, 7].filter(day => {
    const t = dailyKcalTarget.value
    return t !== undefined && dayKcal(day) > t
  }).length
  if (dailyKcalTarget.value === undefined) return `已安排 ${planItems.value.length} 餐`
  return overDays > 0 ? `${overDays} 天超出目标` : '各日均未超目标'
})
const planStatTone = computed(() => (planStat.value.includes('超标') ? 'warning' : 'success') as 'warning' | 'success')
const planCells = computed<Record<string, WeeklyPlanCell>>(() => {
  const cells: Record<string, WeeklyPlanCell> = {}
  const mealRows = PLAN_ROWS.filter(r => r.key !== 'total')
  for (const row of mealRows) {
    for (let day = 1; day <= 7; day++) {
      const it = planItems.value.find(x => x.rowKey === row.key && x.day === day)
      cells[`${row.key}:${day}`] = !it
        ? { state: 'empty' }
        : { name: it.name, sub: it.kcal !== undefined ? `${it.kcal} kcal` : it.value, subTone: 'warning', state: 'planned' }
    }
  }
  const t = dailyKcalTarget.value
  for (let day = 1; day <= 7; day++) {
    const sum = dayKcal(day)
    const hasAny = planItems.value.some(x => x.day === day)
    const over = t !== undefined && sum > t
    cells[`total:${day}`] = !hasAny
      ? { state: 'empty' }
      : {
          name: `${sum} kcal`,
          sub: over ? `超 ${sum - (t ?? 0)}` : '未超目标',
          subTone: over ? 'warning' : 'success',
          state: 'planned'
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
const planForm = ref({ name: '', kcal: '' })
function onPlanCellClick(rowKey: string, day: number): void {
  if (rowKey === 'total') return // 合计行只读
  const existing = planItems.value.find(x => x.rowKey === rowKey && x.day === day)
  planEditCell.value = { rowKey, day }
  planHasExisting.value = !!existing
  planForm.value = { name: existing?.name ?? '', kcal: existing?.kcal !== undefined ? String(existing.kcal) : '' }
  planDialogOpen.value = true
}
/** 保存：名称留空 = 删除该格；热量可空 */
async function savePlanItem(): Promise<void> {
  const cell = planEditCell.value
  if (!cell || !store.setWeeklyPlanItems) return
  const name = planForm.value.name.trim()
  const kcalNum = Number(planForm.value.kcal)
  const kcal = planForm.value.kcal !== '' && Number.isFinite(kcalNum) ? Math.round(kcalNum) : undefined
  const others = planItems.value.filter(x => !(x.rowKey === cell.rowKey && x.day === cell.day))
  const items: HealthWeeklyPlanItem[] = name
    ? [...others, { id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, day: cell.day, rowKey: cell.rowKey, name, kcal, value: kcal !== undefined ? `${kcal} kcal` : undefined }]
    : others
  await store.setWeeklyPlanItems(planWeekStart.value, 'diet', items)
  planDialogOpen.value = false
}
async function deletePlanItem(): Promise<void> {
  const cell = planEditCell.value
  if (!cell || !store.setWeeklyPlanItems) return
  await store.setWeeklyPlanItems(planWeekStart.value, 'diet', planItems.value.filter(x => !(x.rowKey === cell.rowKey && x.day === cell.day)))
  planDialogOpen.value = false
}

// ===== 顶部目标卡 =====
const todayStr = localToday()

// 达标率/每日计算禁止在组件内重算，必须调 healthCore 纯函数
const targetView = computed<{ label: string; current: number; target: number; percent: number } | null>(() => {
  const plan = store.plans.diet
  if (!plan) return null
  const a = calcDailyAttainment(store.records.diet, store.plans.diet, todayStr)
  return {
    label: `每日热量目标 ${plan.target} 千卡`,
    current: a?.current ?? 0,
    target: a?.target ?? plan.target,
    // 进度条宽度 = min(percent,1)*100%（取整显示，超量钳到 100%）
    percent: Math.floor(Math.min(a?.percent ?? 0, 1) * 100)
  }
})

// ===== 目标弹框（metric/period 固定为 calories/daily，不展示选择器）=====
const showTargetDialog = ref(false)
const formTarget = ref('')

// 目标必须 > 0，否则保存按钮 disabled
const isTargetValid = computed(() => {
  const t = Number(formTarget.value)
  return Number.isFinite(t) && t > 0
})

function openTargetDialog(): void {
  const plan = store.plans.diet
  formTarget.value = plan ? String(plan.target) : ''
  showTargetDialog.value = true
}

function closeTargetDialog(): void {
  showTargetDialog.value = false
}

async function handleSaveTarget(): Promise<void> {
  if (!isTargetValid.value) return
  await store.setPlan('diet', { metric: 'calories', period: 'daily', target: Number(formTarget.value) })
  closeTargetDialog()
}

async function handleClearTarget(): Promise<void> {
  if (await showConfirm('确定要清除每日热量目标吗？')) {
    await store.setPlan('diet', null)
    closeTargetDialog()
  }
}

// ===== 记录列表（date 降序，同日按 createdAt 降序）=====
const sortedRecords = computed(() => {
  return [...store.records.diet].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1
  )
})

// 四类餐次徽章配色
const MEAL_BADGE_CLASS: Record<MealType, string> = {
  早餐: 'dt-meal-breakfast',
  午餐: 'dt-meal-lunch',
  晚餐: 'dt-meal-dinner',
  加餐: 'dt-meal-snack'
}

// ===== 记录表单（新增/编辑共用弹框）=====
const showRecordDialog = ref(false)
const editingId = ref<string | null>(null)
const formDate = ref(localToday())
const formMeal = ref<MealType>(MEAL_TYPES[0])
const formContent = ref('')
const formCalories = ref('0')
const formNote = ref('')

// ===== 记录列表分页（面板底部内联展示，固定每页 10 条）=====
const listPage = ref(1)
const LIST_PAGE_SIZE = 10

const listPageItems = computed(() => {
  const start = (listPage.value - 1) * LIST_PAGE_SIZE
  return sortedRecords.value.slice(start, start + LIST_PAGE_SIZE)
})



// date 必填 + content 非空 ≤200 字 + calories ≥ 0，否则保存按钮 disabled
const isFormValid = computed(() => {
  const cal = Number(formCalories.value)
  const content = formContent.value.trim()
  return formDate.value !== '' && content !== '' && content.length <= 200 && Number.isFinite(cal) && cal >= 0
})

function startAddRecord(): void {
  editingId.value = null
  formDate.value = localToday()
  formMeal.value = MEAL_TYPES[0]
  formContent.value = ''
  formCalories.value = '0'
  formNote.value = ''
  showRecordDialog.value = true
}

function startEditRecord(id: string): void {
  const rec = store.records.diet.find(r => r.id === id)
  if (!rec) return
  editingId.value = id
  formDate.value = rec.date
  formMeal.value = rec.mealType
  formContent.value = rec.content
  formCalories.value = String(rec.calories)
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
    mealType: formMeal.value,
    content: formContent.value.trim(),
    calories: Number(formCalories.value)
  }
  if (note) payload.note = note
  if (editingId.value) {
    await store.updateRecord('diet', editingId.value, payload)
  } else {
    await store.addRecord('diet', payload)
  }
  listPage.value = 1
  cancelRecordForm()
}

async function handleDeleteRecord(id: string): Promise<void> {
  if (await showConfirm('确定要删除这条饮食记录吗？')) {
    await store.deleteRecord('diet', id)
    listPage.value = 1
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
  <div class="wb-diet">
    <!-- 顶部目标卡（复用 stat-card 结构） -->
    <div class="stat-card">
      <div class="stat-header">
        <span class="stat-icon">🍽️</span>
        <span class="stat-label">每日热量目标</span>
        <div class="stat-panel-actions">
          <el-button class="btn-add" data-testid="dt-add" @click="startAddRecord">＋ 新增</el-button>
        </div>
        <el-button v-if="targetView" class="nav-btn" data-testid="dt-edit-target" @click="openTargetDialog">
          调整目标
        </el-button>
        <el-button v-else class="nav-btn" data-testid="dt-target" @click="openTargetDialog">设定目标</el-button>
      </div>
      <template v-if="targetView">
        <div class="stat-value" data-testid="dt-plan-label">{{ targetView.label }}</div>
        <div class="dt-attainment" data-testid="dt-attainment">今日 {{ targetView.current }}/{{ targetView.target }} 千卡</div>
        <div class="dt-progress" data-testid="dt-progress">
          <div class="dt-progress-fill" :style="{ width: targetView.percent + '%' }"></div>
        </div>
      </template>
      <div v-else class="stat-sub">尚未设定每日热量目标</div>
    </div>

    <!-- 本周饮食计划（早/午/晚 + 合计） -->
    <WeeklyPlanBoard
      v-if="canPlan"
      title="饮食周计划"
      :week-start="planWeekStart"
      :week-label="planWeekLabel"
      :stat-text="planStat"
      :stat-tone="planStatTone"
      icon-bg="var(--color-warning-soft, #fef3c7)"
      icon-color="var(--color-warning-hover, #b45309)"
      :rows="PLAN_ROWS"
      :cells="planCells"
      hint="合计行自动按热量求和；点餐次单元格即可编辑"
      data-testid="dt-plan-board"
      @nav="onPlanNav"
      @cell-click="onPlanCellClick"
    />

    <!-- 定时提醒（只读小模块） -->
    <WorkbenchHealthReminders module="diet" />
    <!-- 空态 -->
    <div
      v-if="store.records.diet.length === 0"
      class="empty-state empty-invite"
      data-testid="dt-empty"
      @click="startAddRecord"
    >
      ＋ 新增第一条饮食记录
    </div>

    <!-- 饮食记录列表（面板底部内联展示，固定每页 10 条） -->
    <section v-if="sortedRecords.length > 0" class="ewt-inline-section" data-testid="dt-records-section">
      <div class="ewt-inline-head">
        <h3 class="ewt-inline-title">饮食记录（{{ sortedRecords.length }} 条）</h3>
      </div>
      <el-table class="ewt-table" :data="listPageItems" stripe border size="default" style="width: 100%" empty-text="暂无饮食记录">
        <el-table-column type="index" label="序号" width="70" align="center" class-name="ewt-index-col" :index="(i: number) => (listPage - 1) * LIST_PAGE_SIZE + i + 1" />
        <el-table-column label="日期" width="130" align="center">
          <template #default="{ row }">{{ row.date }}</template>
        </el-table-column>
        <el-table-column label="餐别" width="110" align="center">
          <template #default="{ row }"><span class="dt-meal-badge" :class="MEAL_BADGE_CLASS[row.mealType as MealType]">{{ row.mealType }}</span></template>
        </el-table-column>
        <el-table-column label="食物" min-width="220" align="center" show-overflow-tooltip>
          <template #default="{ row }">{{ row.content }}</template>
        </el-table-column>
        <el-table-column label="热量(kcal)" width="130" align="right">
          <template #default="{ row }"><span style="font-weight:700;color:var(--color-success,#16a34a);font-variant-numeric: tabular-nums;">{{ row.calories }} kcal</span></template>
        </el-table-column>
        <el-table-column label="备注" min-width="200" align="center" show-overflow-tooltip>
          <template #default="{ row }"><span v-if="row.note">{{ row.note }}</span><span v-else style="color: var(--color-text-secondary, #9ca3af);">—</span></template>
        </el-table-column>
        <el-table-column label="操作" width="170" align="center" fixed="right" class-name="ewt-op-col">
          <template #default="{ row }"><el-button class="btn-edit" :data-testid="`dt-edit-${row.id}`" @click="startEditRecord(row.id)">编辑</el-button><el-button class="btn-delete" :data-testid="`dt-delete-${row.id}`" @click="handleDeleteRecord(row.id)">删除</el-button></template>
        </el-table-column>
      </el-table>
      <div class="dt-list-pager ewt-pager">
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
        data-testid="dt-dialog"
        @close="closeTargetDialog"
      >
          <form class="dialog-body" @submit.prevent="handleSaveTarget">
            <div class="form-group">
              <label>每日热量目标（千卡）*</label>
              <el-input-number
                :model-value="formTarget === '' ? undefined : Number(formTarget)"
                :min="1"
                :step="1"
               
                placeholder="例如：2000"
                data-testid="dt-target-input"
                :controls="false"
                @update:model-value="formTarget = $event == null ? '' : String($event)"
              />
            </div>

            <div class="form-actions">
              <el-button
                v-if="targetView"
                native-type="button"
                class="btn-clear"
                data-testid="dt-clear-target"
                @click="handleClearTarget"
              >
                清除目标
              </el-button>
              <span class="form-actions-spacer"></span>
              <el-button native-type="button" class="btn-cancel" data-testid="dt-cancel" @click="closeTargetDialog">取消</el-button>
              <el-button native-type="submit" class="btn-save" :disabled="!isTargetValid" data-testid="dt-save">保存</el-button>
            </div>
          </form>
      </BaseDialog>

    <!-- 周计划单元格编辑弹框（合计行只读，不触发） -->
    <BaseDialog
      v-if="planDialogOpen"
      title="编辑餐单"
      width="420px"
      data-testid="dt-plan-dialog"
      @close="planDialogOpen = false"
    >
      <form class="dialog-body" @submit.prevent="savePlanItem">
        <div class="form-group">
          <label>餐品名称 *</label>
          <el-input v-model="planForm.name" maxlength="30" placeholder="如：燕麦+鸡蛋" data-testid="dt-plan-name" />
        </div>
        <div class="form-group">
          <label>热量（kcal，可选）</label>
          <el-input v-model="planForm.kcal" maxlength="6" placeholder="如：380" data-testid="dt-plan-kcal" />
        </div>
        <div class="form-actions">
          <el-button v-if="planHasExisting" native-type="button" size="small" class="btn-clear" data-testid="dt-plan-delete" @click="deletePlanItem">
            删除
          </el-button>
          <span class="form-actions-spacer"></span>
          <el-button size="small" data-testid="dt-plan-cancel" @click="planDialogOpen = false">取消</el-button>
          <el-button type="primary" native-type="submit" size="small" data-testid="dt-plan-save">保存</el-button>
        </div>
      </form>
    </BaseDialog>

    <!-- 新增/编辑记录弹框 -->
<BaseDialog
        v-if="showRecordDialog"
        :title="editingId ? '编辑记录' : '新增记录'"
        :width="PANEL_WIDTH"
        :max-height="PANEL_MAX_HEIGHT"
        class="dt-record-overlay"
        data-testid="dt-dialog"
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
                data-testid="dt-form-date"
              />
            </div>
            <div class="field">
              <label class="field-label">餐次 *</label>
              <el-select v-model="formMeal" class="field-meal" data-testid="dt-form-meal">
                <el-option v-for="m in MEAL_TYPES" :key="m" :value="m" :label="m" />
              </el-select>
            </div>
          </div>

          <div class="form-row-fields">
            <div class="field">
              <label class="field-label">内容 *</label>
              <el-input
                v-model="formContent"
                type="text"
                maxlength="200"
                class="field-content"
                placeholder="例如：鸡蛋牛奶"
                data-testid="dt-form-content"
              />
            </div>
            <div class="field">
              <label class="field-label">热量（千卡）</label>
              <el-input-number
                :model-value="Number(formCalories)"
                :min="0"
                :step="1"
                class="field-calories"
                placeholder="例如：500"
                data-testid="dt-form-calories"
                :controls="false"
                @update:model-value="formCalories = $event == null ? '0' : String($event)"
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
              data-testid="dt-form-note"
            />
          </div>

          <div class="form-actions ewt-dialog-footer">
            <el-button native-type="button" class="btn-cancel" data-testid="dt-cancel-record" @click="cancelRecordForm">
              取消
            </el-button>
            <el-button native-type="submit" class="btn-save" :disabled="!isFormValid" data-testid="dt-save-record">
              {{ editingId ? '保存' : '添加' }}
            </el-button>
            <el-button v-if="editingId" type="danger" native-type="button" data-testid="dt-record-delete" @click="handleDeleteRecord(editingId)">删除</el-button>
          </div>
        </form>
      </BaseDialog>
  </div>
</template>

<style scoped>
/* 面板容器 */
.wb-diet {
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

/* 今日达标行 + 进度条（--color-primary） */
.dt-attainment {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.dt-progress {
  height: 8px;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  overflow: hidden;
}

.dt-progress-fill {
  height: 100%;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-primary, var(--color-primary));
  transition: width var(--transition-fast, 0.15s ease);
}

/* ===== 操作栏（废弃：stat-panel-actions 代替） ===== */

/* ===== stat-card 右上角按钮组（与 Exercise/Sleep/Weight 一致） ===== */
.stat-panel-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
/* .btn-add 视觉已统一到全局 .ui-btn--primary（style.css） */

.btn-toggle-list {
  padding: 10px 16px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-toggle-list:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

/* .btn-add 视觉已统一到全局 .ui-btn--primary（style.css） */

/* ===== 记录列表（弹框内 5 列卡片网格：5 卡/行 × maxRows 3 = 15 卡/页）===== */

.dt-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px 12px;
  background: var(--color-bg-card, var(--color-bg-card));
  background-image: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-primary, #3b82f6) 7%, transparent),
    transparent 55%
  );
  border: 1px solid var(--color-border, var(--color-border));
  border-left: 4px solid var(--color-primary, var(--color-primary));
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.dt-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dt-date {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
}

/* 餐次徽章（复用范本 ex-type-badge 体系），四类餐次不同色 */
.dt-meal-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 9999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}

/* 午餐：蓝（默认同徽章基色） */
.dt-meal-lunch {
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border-color: color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}

/* 早餐：琥珀 */
.dt-meal-breakfast {
  color: #d97706;
  background: #fef3c7;
  border-color: rgba(217, 119, 6, 0.3);
}

/* 晚餐：紫 */
.dt-meal-dinner {
  color: #7c3aed;
  background: #f3e8ff;
  border-color: rgba(124, 58, 237, 0.3);
}

/* 加餐：绿 */
.dt-meal-snack {
  color: #059669;
  background: #d1fae5;
  border-color: rgba(5, 150, 105, 0.3);
}

.dt-meta {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.dt-note {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 0;
}

.dt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
}

/* ===== 按钮（复用 WorkbenchTodo 体系）===== */
/* .btn-edit/.btn-delete 视觉已统一到全局 .ui-btn（style.css） */

/* .btn-clear 视觉已统一到全局 .ui-btn--danger（style.css） */

/* ===== 空态 ===== */
.empty-state {
  text-align: center;
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
}

.empty-invite {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary, var(--color-text-secondary));
  transition: color var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.empty-invite:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

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

.field-meal {
  width: 140px;
}

.field-content {
  flex: 1;
  min-width: 180px;
}

.field-calories {
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

html.dark .dt-item {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .empty-state {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .dt-date {
  color: var(--color-text, #f9fafb);
}

html.dark .dt-meta,
html.dark .dt-note {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .dt-meal-lunch {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

html.dark .dt-meal-breakfast {
  color: #fbbf24;
  background: rgba(217, 119, 6, 0.2);
  border-color: rgba(217, 119, 6, 0.45);
}

html.dark .dt-meal-dinner {
  color: #c4b5fd;
  background: rgba(124, 58, 237, 0.2);
  border-color: rgba(124, 58, 237, 0.45);
}

html.dark .dt-meal-snack {
  color: #6ee7b7;
  background: rgba(5, 150, 105, 0.2);
  border-color: rgba(5, 150, 105, 0.45);
}

html.dark .dt-progress {
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

html.dark .btn-toggle-list {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

@media (max-width: 640px) {
  .field-date,
  .field-meal,
  .field-content,
  .field-calories {
    width: 100%;
  }
}


.dt-list-pager {
  flex: 0 0 auto;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .dt-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}

@media (max-width: 768px) {
  .stat-header {
    flex-wrap: wrap;
    row-gap: 8px;
  }
  .stat-panel-actions {
    order: 3;
    margin-left: 0;
    width: 100%;
  }
  .stat-panel-actions .btn-add { flex: 1; text-align: center; }
  .nav-btn {
    margin-left: auto;
  }
}

/* ===== 弹框层级（BaseDialog 统一 z-index: 300）===== */
.dt-record-overlay { z-index: 320; }



/* ===== 桌面端 ≥769px：面板根钉满 tab 内容区 ===== */
@media (min-width: 769px) {
  :global(.wb-health) {
    display: flex;
    flex-direction: column;
  }

  .wb-diet {
    flex: 1;
    min-height: 0;
  }
}
</style>