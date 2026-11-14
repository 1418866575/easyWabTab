<script setup lang="ts">
/**
 * 健康工作台 · 体重记录（仅 /health 使用）。
 * 与身高面板同构：按人员分标签页、按分类筛选人员；每条记录带 personId。
 * BMI 身高来源 = 当前人员「身高记录」里最近一次（date 降序、同日 createdAt 降序），
 * 由 healthCore.latestHeightRecordOf 从身高模块共享数据取回；体重来源 = 当前人员最近
 * 一次体重记录（同序）。二者经 calcBmi 计算，任一缺失则 BMI 显示「—」。
 */
import { computed, onMounted, ref, watch } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import BaseTabs from '@/components/common/BaseTabs.vue'
import Icon from '@/components/Icon.vue'
import { DIALOG_BTN } from '@/config/dialogText'
import { showConfirm } from '@/utils/dialog'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { injectHealthStore, type HealthStoreLike } from '@/composables/healthStoreContext'
import { calcBmi, classifyBmi, dietCalories, latestHeightRecordOf, weightChartScale, weightTarget } from '@/composables/healthCore'
import type { WeightChartPoint } from '@/composables/healthCore'
import { localToday } from '@/composables/todoCore'
import type { HeightRecord, Person } from '@/types'

// 表单弹框尺寸（沿用原 .dialog 固定尺寸，非设置项）
const PANEL_WIDTH = '480px'
const PANEL_MAX_HEIGHT = '85vh'

/** 体重合理范围（kg）：与身高一致做范围校验，越界视为异常。 */
const WT_MIN = 2
const WT_MAX = 400

// ===== 图表尺寸 =====
const CHART_W = 600
const CHART_H = 220
const CHART_PAD = 24 // 与 weightChartScale 默认 pad 一致
const GRID_COUNT = 4

const LIST_PAGE_SIZE = 10

// store 来源可注入：默认成人端 store，学生端容器 provide 自己的 store 后自动改为学生数据（见 healthStoreContext）
const store = (injectHealthStore() ?? useWorkbenchHealthStore()) as HealthStoreLike

// ===== 人员 / 分类（与身高共用 personConfig） =====
const config = computed(() => store.personConfig ?? { persons: [], categories: [] })
const persons = computed(() => config.value.persons)
const categories = computed(() => config.value.categories)
const categoryFilter = ref('')

// 旧单人数据（personId 为空）或尚未建人员时，提供一个合成「默认 / 未分类」人员，
// 避免历史记录丢失，同时兼容「未分人」直接查看全部。
const allWeightRecords = computed(() => store.records.weight ?? [])
const hasOrphans = computed(() => allWeightRecords.value.some(r => !r.personId))
const effectivePersons = computed<Person[]>(() => {
  const real = persons.value
  if (real.length === 0 || hasOrphans.value) {
    return [...real, { id: '', name: real.length === 0 ? '默认' : '未分类', createdAt: '' }]
  }
  return real
})
const activePersonId = ref('')
const visiblePersons = computed(() =>
  categoryFilter.value
    ? effectivePersons.value.filter(p => p.categoryId === categoryFilter.value)
    : effectivePersons.value
)
const activePerson = computed(
  () => visiblePersons.value.find(p => p.id === activePersonId.value) ?? visiblePersons.value[0] ?? null
)
// 切分类时重置到首位可见人员（避免选中已过滤掉的人员）
watch(categoryFilter, () => {
  activePersonId.value = visiblePersons.value[0]?.id ?? ''
})
// 初始默认选中首位
if (activePerson.value) activePersonId.value = activePerson.value.id

const personTabs = computed(() =>
  visiblePersons.value.map(p => ({
    value: p.id,
    label: p.name,
    badge: recordsOf(p.id).length,
    testid: `wt-person-${p.id}`
  }))
)

// BMI 身高来源唯一：当前人员「身高记录」里最近一次（date 降序、同日 createdAt 降序）。
// 设置里的「体重设置」已删除，不再回落到旧全局默认身高 store.height。
const activeHeightRecord = computed<HeightRecord | null>(() =>
  latestHeightRecordOf(store.records.height ?? [], activePerson.value?.id ?? '')
)
const activeHeightCm = computed<number | undefined>(() => activeHeightRecord.value?.heightCm)

function recordsOf(personId: string) {
  return allWeightRecords.value.filter(r => r.personId === personId)
}
const currentRecords = computed(() => (activePerson.value ? recordsOf(activePerson.value.id) : []))

// ===== 最近体重 + BMI（date 降序，同日 createdAt 降序取第一条） =====
const sortedRecords = computed(() =>
  [...currentRecords.value].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1
  )
)
const recentWeight = computed(() => sortedRecords.value[0] ?? null)
const firstWeight = computed(() => sortedRecords.value[sortedRecords.value.length - 1] ?? null)
const deltaKg = computed(() =>
  recentWeight.value && firstWeight.value
    ? Math.round((recentWeight.value.weightKg - firstWeight.value.weightKg) * 10) / 10
    : null
)

// BMI 必须调 healthCore 纯函数（组件禁止重算）；身高或体重缺失 → null → 显示「—」防 NaN
const bmi = computed<number | null>(() => calcBmi(recentWeight.value?.weightKg, activeHeightCm.value))

// BMI 状态徽章（四色，分类必须调 healthCore classifyBmi）
type BmiClass = ReturnType<typeof classifyBmi>
const BMI_META: Record<BmiClass, { label: string; className: string }> = {
  under: { label: '偏瘦', className: 'bmi-under' },
  normal: { label: '正常', className: 'bmi-normal' },
  overweight: { label: '超重', className: 'bmi-overweight' },
  obese: { label: '肥胖', className: 'bmi-obese' }
}
const bmiStatus = computed<BmiClass | null>(() => (bmi.value === null ? null : classifyBmi(bmi.value)))

// ===== 减肥建议卡（仅 overweight/obese 且身高已设置） =====
const adviceTarget = computed<number | null>(() => {
  if (activeHeightCm.value === undefined) return null
  if (bmi.value === null) return null
  const status = classifyBmi(bmi.value)
  if (status !== 'overweight' && status !== 'obese') return null
  return weightTarget(activeHeightCm.value)
})

const adviceCalories = computed<number>(() => (adviceTarget.value === null ? 0 : dietCalories(adviceTarget.value)))

// ===== SVG 折线图（零依赖，坐标必须调 healthCore weightChartScale） =====
const chartScale = computed(() =>
  weightChartScale(
    [...currentRecords.value].sort((a, b) =>
      a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1
    ),
    CHART_W,
    CHART_H
  )
)

const chartPoints = computed<WeightChartPoint[]>(() => chartScale.value?.points ?? [])

// Y 轴 4 条水平网格线（minY/maxY 之间均分）+ 数值标签（像素公式与 weightChartScale 一致）
const gridLines = computed<{ y: number; label: string }[]>(() => {
  const s = chartScale.value
  if (!s) return []
  const { minY, maxY } = s
  const span = maxY - minY
  const inner = CHART_H - 2 * CHART_PAD
  const lines: { y: number; label: string }[] = []
  for (let i = 0; i < GRID_COUNT; i++) {
    const v = minY + (span * i) / (GRID_COUNT - 1)
    const y = CHART_PAD + (1 - (v - minY) / span) * inner
    lines.push({ y: Math.round(y * 100) / 100, label: fmtAxis(v) })
  }
  return lines
})

// X 轴首尾日期标签（首点与末点 date）
const chartXLabels = computed<{ x: number; date: string; anchor: 'start' | 'end' }[]>(() => {
  const pts = chartPoints.value
  if (pts.length === 0) return []
  if (pts.length === 1) return [{ x: pts[0].x, date: pts[0].date, anchor: 'start' }]
  return [
    { x: pts[0].x, date: pts[0].date, anchor: 'start' },
    { x: pts[pts.length - 1].x, date: pts[pts.length - 1].date, anchor: 'end' }
  ]
})

function fmtAxis(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

// polyline 的 points 串：坐标只由 chartPoints 决定，提到 computed 后同一份点位只拼一次。
const chartPolyline = computed(() => chartPoints.value.map(p => p.x + ',' + p.y).join(' '))

// ===== 身高弹框（BMI 依据：写入身高模块，作为当前人员最近一次身高记录） =====
const showHeightDialog = ref(false)
const formHeightDate = ref(localToday())
const formHeight = ref('')

function openHeightDialog(): void {
  formHeightDate.value = localToday()
  formHeight.value = activeHeightRecord.value ? String(activeHeightRecord.value.heightCm) : ''
  showHeightDialog.value = true
}

function closeHeightDialog(): void {
  showHeightDialog.value = false
}

// 30-250 数值必填（可含 1 位小数），越界/非数值 → 保存按钮 disabled
const isHeightValid = computed(() => {
  const h = Number(formHeight.value)
  return formHeight.value !== '' && Number.isFinite(h) && h >= 30 && h <= 250
})

async function handleSaveHeight(): Promise<void> {
  if (!isHeightValid.value || !activePerson.value) return
  const payload: Record<string, unknown> = {
    date: formHeightDate.value,
    heightCm: Number(formHeight.value),
    personId: activePerson.value.id
  }
  await store.addRecord('height', payload)
  closeHeightDialog()
}

// ===== 记录表单（新增/编辑共用弹框） =====
const showRecordDialog = ref(false)
const editingId = ref<string | null>(null)
const formDate = ref(localToday())
const formWeightKg = ref<number | undefined>(undefined)
const formNote = ref('')

// 与其他面板统一命名
const listPage = ref(1)

// date 必填 + weightKg 在合理范围（允许 1 位小数），否则保存按钮 disabled
const isRecordValid = computed(() =>
  formDate.value !== '' &&
  formWeightKg.value !== undefined &&
  Number.isFinite(formWeightKg.value) &&
  formWeightKg.value >= WT_MIN &&
  formWeightKg.value <= WT_MAX
)
// 异常提示：有输入但不在合理范围 / 非数值 / 缺日期
const formError = computed(() => {
  if (formDate.value === '') return '请选择测量日期'
  if (formWeightKg.value === undefined || !Number.isFinite(formWeightKg.value)) return '请输入体重数值'
  if (formWeightKg.value < WT_MIN || formWeightKg.value > WT_MAX) return `体重需在 ${WT_MIN}–${WT_MAX} kg 之间`
  return ''
})

function startAddRecord(): void {
  if (!activePerson.value) return
  editingId.value = null
  formDate.value = localToday()
  formWeightKg.value = undefined
  formNote.value = ''
  showRecordDialog.value = true
}

function startEditRecord(id: string): void {
  const rec = allWeightRecords.value.find(r => r.id === id)
  if (!rec) return
  editingId.value = id
  formDate.value = rec.date
  formWeightKg.value = rec.weightKg
  formNote.value = rec.note ?? ''
  showRecordDialog.value = true
}

function cancelRecordForm(): void {
  showRecordDialog.value = false
  editingId.value = null
}

async function handleSaveRecord(): Promise<void> {
  if (!isRecordValid.value || !activePerson.value) return
  const note = formNote.value.trim()
  const payload: Record<string, unknown> = {
    date: formDate.value,
    weightKg: Number(formWeightKg.value)
  }
  if (note) payload.note = note
  if (editingId.value) {
    // 编辑时保留记录原有归属（personId），不跨人员改派
    await store.updateRecord('weight', editingId.value, payload)
  } else {
    payload.personId = activePerson.value.id
    await store.addRecord('weight', payload)
  }
  cancelRecordForm()
}

async function handleDeleteRecord(id: string): Promise<void> {
  if (await showConfirm('确定要删除这条体重记录吗？')) {
    await store.deleteRecord('weight', id)
  }
}

const listPageItems = computed(() => {
  const start = (listPage.value - 1) * LIST_PAGE_SIZE
  return sortedRecords.value.slice(start, start + LIST_PAGE_SIZE)
})

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
  <div class="wb-weight">
    <!-- 顶部信息区（一排两卡） -->
    <div class="wt-top-cards">
      <!-- 身高卡（BMI 依据：当前人员最近一次身高记录；点击设置/更新即写入身高模块） -->
      <div class="stat-card" data-testid="wt-height-card">
        <div class="stat-header">
          <span class="stat-icon">📏</span>
          <span class="stat-label">身高（{{ activePerson?.name ?? '默认' }}）</span>
          <el-button class="nav-btn" data-testid="wt-set-height" :disabled="!activePerson" @click="openHeightDialog">
            {{ activeHeightRecord ? '更新' : '设置' }}
          </el-button>
        </div>
        <template v-if="activeHeightCm !== undefined">
          <div class="stat-value" data-testid="wt-height-value">身高 {{ activeHeightCm }} cm</div>
          <div v-if="activeHeightRecord" class="stat-sub" data-testid="wt-height-date">最新记录 · {{ activeHeightRecord.date }}</div>
        </template>
        <div v-else class="stat-sub" data-testid="wt-height-empty">未设置身高（BMI 暂不可算）</div>
      </div>

      <!-- 最近体重 + BMI 卡（右上角挂：新增） -->
      <div class="stat-card" data-testid="wt-bmi-card">
        <div class="stat-header">
          <Icon name="weight" :size="16" class="stat-icon" />
          <span class="stat-label">最近体重 · BMI</span>
          <div class="stat-panel-actions">
            <el-select v-model="categoryFilter" class="wt-cat-select" data-testid="wt-category-filter">
              <el-option label="全部分类" value="" />
              <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
            <el-button class="btn-add" data-testid="wt-add" :disabled="!activePerson" @click="startAddRecord">＋ 新增</el-button>
          </div>
        </div>
        <div class="wt-bmi-row">
          <span v-if="recentWeight" class="stat-value wt-recent-weight" data-testid="wt-recent-weight">
            {{ recentWeight.weightKg }} kg
          </span>
          <span v-else class="wt-bmi-dash" data-testid="wt-recent-weight">—</span>
          <span v-if="bmi !== null" class="wt-bmi-value" data-testid="wt-bmi">BMI {{ bmi.toFixed(1) }}</span>
          <span v-else class="wt-bmi-dash" data-testid="wt-bmi">—</span>
          <span v-if="bmiStatus" class="wt-status-badge" :class="BMI_META[bmiStatus].className" data-testid="wt-status">
            {{ BMI_META[bmiStatus].label }}
          </span>
        </div>
      </div>
    </div>

    <!-- 人员标签页（与身高面板同构） -->
    <BaseTabs
      v-if="personTabs.length"
      v-model="activePersonId"
      :items="personTabs"
      testid="wt-person"
    />
    <div v-else class="empty-state" data-testid="wt-no-person">没有可显示的人员</div>

    <!-- 累计变化 -->
    <div class="stat-card" data-testid="wt-delta-card">
      <div class="stat-header"><span class="stat-label">累计变化</span></div>
      <div class="stat-value" data-testid="wt-delta">
        {{ deltaKg === null ? '—' : (deltaKg > 0 ? '+' : '') + deltaKg.toFixed(1) + ' kg' }}
      </div>
      <div class="stat-sub">{{ firstWeight ? '首次 ' + firstWeight.date + ' · ' + firstWeight.weightKg + ' kg' : '至少需要两条记录' }}</div>
    </div>

    <!-- 减肥建议卡（仅 overweight/obese 且身高已设置） -->
    <div v-if="adviceTarget !== null" class="stat-card wt-advice" data-testid="wt-advice">
      <div class="stat-header">
        <Icon name="target" :size="16" class="stat-icon" />
        <span class="stat-label">减肥建议</span>
      </div>
      <div class="wt-advice-row">
        <span class="wt-advice-item" data-testid="wt-advice-target">减肥体重 {{ adviceTarget }} kg</span>
        <span class="wt-advice-item" data-testid="wt-advice-calories">
          建议每日摄入约 {{ adviceCalories }} 千卡（估算值）
        </span>
      </div>
    </div>

    <!-- 体重趋势折线图（内联 SVG，零依赖） -->
    <div class="stat-card wt-chart-card" data-testid="wt-chart-card">
      <div class="stat-header">
        <Icon name="profit" :size="16" class="stat-icon" />
        <span class="stat-label">体重趋势</span>
      </div>
      <svg
        v-if="chartScale"
        viewBox="0 0 600 220"
        width="100%"
        height="220"
        preserveAspectRatio="xMidYMid meet"
        class="wt-chart-svg"
        data-testid="wt-chart"
      >
        <!-- Y 轴 4 条水平网格线 + 数值标签 -->
        <g>
          <line
            v-for="g in gridLines"
            :key="'grid-' + g.y"
            class="wt-chart-gridline"
            x1="0"
            x2="600"
            :y1="g.y"
            :y2="g.y"
          />
          <text
            v-for="g in gridLines"
            :key="'val-' + g.y"
            class="wt-chart-value-label"
            x="6"
            :y="g.y + 4"
            font-size="11"
            text-anchor="start"
          >
            {{ g.label }}
          </text>
        </g>

        <!-- X 轴首尾日期标签 -->
        <g>
          <text
            v-for="l in chartXLabels"
            :key="'date-' + l.x + '-' + l.date"
            class="wt-chart-date-label"
            :x="l.x"
            y="214"
            font-size="11"
            :text-anchor="l.anchor"
          >
            {{ l.date }}
          </text>
        </g>

        <!-- 折线（≥2 点）+ 每点圆点（含 title 悬停提示） -->
        <polyline
          v-if="chartPoints.length >= 2"
          class="wt-chart-line"
          :points="chartPolyline"
          fill="none"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle v-for="p in chartPoints" :key="p.date + '-' + p.weightKg" class="wt-chart-dot" :cx="p.x" :cy="p.y" r="4">
          <title>{{ p.date }} · {{ p.weightKg }} kg</title>
        </circle>
      </svg>
      <div v-else class="wt-chart-empty" data-testid="wt-chart-empty">暂无体重记录</div>
    </div>

    <!-- 身高设置弹框（写入身高模块，作为当前人员 BMI 依据） -->
<BaseDialog
      v-if="showHeightDialog"
      :title="`设置身高（${activePerson?.name ?? '默认'}）`"
      :width="PANEL_WIDTH"
      :max-height="PANEL_MAX_HEIGHT"
      data-testid="wt-height-dialog"
      @close="closeHeightDialog"
    >
        <form class="dialog-body" @submit.prevent="handleSaveHeight">
          <div class="form-group">
            <label>测量日期 *</label>
            <el-date-picker
              v-model="formHeightDate"
              type="date"
              value-format="YYYY-MM-DD"
              class="field-date"
              data-testid="wt-height-date-input"
            />
          </div>
          <div class="form-group">
            <label>身高（cm）*</label>
            <el-input-number
              :model-value="formHeight === '' ? undefined : Number(formHeight)"
              :step="0.1"
              :precision="1"
              placeholder="例如：170"
              data-testid="wt-height-input"
              :controls="false"
              @update:model-value="formHeight = $event == null ? '' : String($event)"
            />
            <div class="field-hint">仅接受 30–250 cm（可含 1 位小数）；保存后作为当前人员最新身高记录参与 BMI 计算。</div>
          </div>
          <div class="form-actions">
            <el-button native-type="button" class="btn-cancel" data-testid="wt-height-cancel" @click="closeHeightDialog">{{ DIALOG_BTN.close }}</el-button>
            <el-button type="primary" native-type="submit" class="btn-save" :disabled="!isHeightValid" data-testid="wt-height-save">保存</el-button>
          </div>
        </form>
    </BaseDialog>

    <!-- 新增/编辑记录弹框 -->
<BaseDialog
      v-if="showRecordDialog"
      :title="editingId ? '编辑记录' : '新增记录'"
      :width="PANEL_WIDTH"
      :max-height="PANEL_MAX_HEIGHT"
      class="wt-record-overlay"
      data-testid="wt-dialog"
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
                data-testid="wt-form-date"
              />
            </div>
            <div class="field">
              <label class="field-label">体重（kg）*</label>
              <el-input-number
                v-model="formWeightKg"
                :step="0.1"
                :precision="1"
                :controls="false"
                class="field-weight"
                :placeholder="`${WT_MIN}–${WT_MAX}`"
                data-testid="wt-form-weight"
              />
              <p v-if="formError" class="wt-form-error" data-testid="wt-form-error">{{ formError }}</p>
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
              data-testid="wt-form-note"
            />
          </div>

          <div class="form-actions ewt-dialog-footer">
            <el-button native-type="button" class="btn-cancel" data-testid="wt-cancel-record" @click="cancelRecordForm">{{ DIALOG_BTN.close }}</el-button>
            <el-button type="primary" native-type="submit" class="btn-save" :disabled="!isRecordValid" data-testid="wt-save-record">{{ DIALOG_BTN.save }}</el-button>
            <el-button v-if="editingId" type="danger" native-type="button" data-testid="wt-record-delete" @click="handleDeleteRecord(editingId)">删除</el-button>
          </div>
        </form>
    </BaseDialog>

    <!-- 空态 -->
    <div
      v-if="currentRecords.length === 0"
      class="empty-state empty-invite"
      data-testid="wt-empty"
      @click="startAddRecord"
    >
      ＋ 新增第一条体重记录
    </div>

    <!-- 体重记录列表（面板底部内联展示，固定每页 10 条） -->
    <section v-if="currentRecords.length > 0" class="ewt-inline-section" data-testid="wt-records-section">
      <div class="ewt-inline-head">
        <h3 class="ewt-inline-title">体重记录（{{ sortedRecords.length }} 条）</h3>
      </div>
      <el-table class="ewt-table"
        :data="listPageItems"
        stripe
        border
        size="default"
        style="width: 100%"
        empty-text="暂无体重记录"
      >
        <el-table-column type="index" label="序号" width="70" align="center" class-name="ewt-index-col" :index="(i: number) => (listPage - 1) * LIST_PAGE_SIZE + i + 1" />
        <el-table-column label="日期" width="130" align="center">
          <template #default="{ row }">{{ row.date }}</template>
        </el-table-column>
        <el-table-column label="体重(kg)" width="130" align="right">
          <template #default="{ row }">
            <span style="font-weight:700;font-variant-numeric: tabular-nums;">{{ row.weightKg }} kg</span>
          </template>
        </el-table-column>
        <el-table-column label="BMI" width="130" align="right">
          <template #default="{ row }">
            <span v-if="activeHeightCm !== undefined" :class="BMI_META[classifyBmi(calcBmi(row.weightKg, activeHeightCm) ?? 20)].className">
              {{ calcBmi(row.weightKg, activeHeightCm)?.toFixed(1) ?? '—' }}
            </span>
            <span v-else style="color: var(--color-text-secondary);">未设身高</span>
          </template>
        </el-table-column>
        <el-table-column label="目标进度" width="160" align="right">
          <template #default="{ row }">
            <template v-if="adviceTarget !== null">
              <span style="font-variant-numeric: tabular-nums;">
                {{ row.weightKg > adviceTarget
                    ? `距目标 -${(row.weightKg - adviceTarget).toFixed(1)} kg`
                    : row.weightKg < adviceTarget
                    ? `距目标 +${(adviceTarget - row.weightKg).toFixed(1)} kg`
                    : '已达标 ✓' }}
              </span>
            </template>
            <span v-else style="color: var(--color-text-secondary);">未设身高</span>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="200" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.note">{{ row.note }}</span>
            <span v-else style="color: var(--color-text-secondary);">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" class-name="ewt-op-col" width="170" align="center" fixed="right">
          <template #default="{ row }">
            <el-button class="btn-edit" :data-testid="`wt-edit-${row.id}`" @click="startEditRecord(row.id)">编辑</el-button>
            <el-button class="btn-delete" :data-testid="`wt-delete-${row.id}`" @click="handleDeleteRecord(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="wt-list-pager ewt-pager">
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
  </div>
</template>

<style scoped>
/* 面板容器 */
.wb-weight {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* ===== 顶部信息区（一排两卡）===== */
.wt-top-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

/* 卡片外框 / 卡片标题 / 统计数字的统一取值在全局 styles/workbench.css（.wb-content .stat-*），
   面板内不再各抄一份 —— 这是此前 6 份重复定义漂移的根因。 */
/* .nav-btn 视觉已上收至全局 style.css（2026-11 按钮收敛），此处仅保留布局规则 */

.stat-value {
  font-size: var(--fs-h2, 22px);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.stat-sub {
  font-size: var(--fs-sm, 13px);
  color: var(--color-text-secondary);
}

/* ===== 最近体重 + BMI 行 ===== */
.wt-bmi-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.wt-bmi-value {
  font-size: var(--fs-lg, 16px);
  font-weight: 700;
  color: var(--color-primary-text);
  font-variant-numeric: tabular-nums;
}

.wt-bmi-dash {
  font-size: var(--fs-h2, 22px);
  font-weight: 700;
  color: var(--color-text-muted);
}

/* BMI 状态徽章（四色，参照 prio-badge 体系） */
.wt-status-badge {
  flex-shrink: 0;
  font-size: var(--fs-caption, 12px);
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 9999px);
  border: 1px solid transparent;
}

.bmi-under {
  color: var(--ds-primary-text);
  background: var(--ds-primary-soft);
  border-color: #93c5fd;
}

.bmi-normal {
  color: #15803d;
  background: #dcfce7;
  border-color: #86efac;
}

.bmi-overweight {
  color: #c2410c;
  background: #ffedd5;
  border-color: #fdba74;
}

.bmi-obese {
  color: #b91c1c;
  background: var(--ds-danger-soft);
  border-color: #fca5a5;
}

/* ===== 减肥建议卡 ===== */
.wt-advice-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.wt-advice-item {
  font-size: var(--fs-body, 14px);
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

/* ===== 折线图卡 ===== */
.wt-chart-svg {
  display: block;
  width: 100%;
  height: 220px;
}

.wt-chart-gridline {
  stroke: var(--color-border, #e2e8f0);
  stroke-dasharray: 4 4;
}

.wt-chart-value-label,
.wt-chart-date-label {
  fill: var(--color-text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.wt-chart-line {
  stroke: var(--color-primary);
}

.wt-chart-dot {
  fill: var(--color-primary);
}

.wt-chart-empty {
  padding: 36px 16px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--fs-body, 14px);
}

/* ===== 操作栏（wt-headbar 已废弃：stat-panel-actions 替代） ===== */

/* ===== stat-card 右上角按钮组（与 Exercise 一致） ===== */
.stat-panel-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}
/* .btn-add 视觉已统一到全局 .ui-btn--primary（style.css） */

.wt-cat-select {
  width: 130px;
}

.wt-form-error {
  margin: 0;
  font-size: var(--fs-caption, 12px);
  color: var(--color-error-text);
}

/* ===== 按钮（复用 WorkbenchTodo/Exercise 体系）===== */
/* .btn-edit/.btn-delete 视觉已统一到全局 .ui-btn（style.css） */

/* ===== 空态：.empty-state / .empty-invite 已收敛到全局基类（src/style.css） ===== */

/* ===== 弹框内容区（原 .dialog-body；外壳主体已由 BaseDialog 的 .bd-body 承担）===== */
.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ===== 弹框层级：统一引用外壳定义的 --wb-dialog-z（BaseDialog 基准 300），不再各写 z-index:320 ===== */
.wt-record-overlay { z-index: var(--wb-dialog-z, 300); }

.wt-list-pager {
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-5) var(--space-4);
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .wt-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}

/* BMI 颜色分级（与 classifyBmi 返回值映射：underweight/normal/overweight/obese） */
.bmi-underweight { color: var(--color-primary-text); font-weight:600; }
.bmi-normal { color: var(--color-success-text); font-weight:700; }
.bmi-overweight { color: var(--color-warning-text); font-weight:600; }
.bmi-obese { color: var(--color-error-text); font-weight:700; }

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group > label {
  font-size: var(--fs-sm, 13px);
  color: var(--color-text-secondary);
}

.field-hint {
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-muted);
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
  font-size: var(--fs-sm, 13px);
  color: var(--color-text-secondary);
}

.field-date {
  width: 170px;
}

.field-weight {
  width: 140px;
}

/* 输入框视觉统一到全局 .ui-input（src/style.css 的别名列表已含 .form-input）；
   这里不再写 border/background/border-radius/font-size/焦点态，避免与全局规范打架。 */

.desc-input {
  resize: vertical;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  justify-content: flex-end;
}

/* ===== 暗色模式覆盖 ===== */
html.dark .wt-item {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .dialog {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .dialog-header {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .bmi-under {
  color: var(--dark-accent-text);
  background: var(--color-primary-soft);
  border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
}

html.dark .bmi-normal {
  color: #86efac;
  background: rgba(22, 163, 74, 0.2);
  border-color: rgba(34, 197, 94, 0.45);
}

html.dark .bmi-overweight {
  color: #fdba74;
  background: rgba(249, 115, 22, 0.2);
  border-color: rgba(249, 115, 22, 0.45);
}

html.dark .bmi-obese {
  color: #fca5a5;
  background: rgba(185, 28, 28, 0.35);
  border-color: #991b1b;
}

/* 禁用态保存按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
html.dark .form-input,
html.dark select.form-input,
html.dark input.form-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text);
  border-color: var(--color-border, #374151);
}

@media (max-width: 640px) {
  .wt-top-cards {
    grid-template-columns: 1fr;
  }

  .field-date,
  .field-weight {
    width: 100%;
  }
}
</style>
