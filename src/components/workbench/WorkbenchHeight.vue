<script setup lang="ts">
/**
 * 健康工作台 · 身高成长记录（仅 /health 使用）。
 * 骨架与 WorkbenchWeight.vue 保持一致：stat-card + 内联 SVG 折线图 + el-table/分页 + BaseDialog 表单。
 * 差异：按人员分标签页、按分类筛选人员，记录字段 heightCm(cm) / personId。
 * 坐标换算统一走 healthCore.heightChartScale，组件内不重算。
 */
import { computed, onMounted, ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import BaseTabs from '@/components/common/BaseTabs.vue'
import { DIALOG_BTN } from '@/config/dialogText'
import { showConfirm } from '@/utils/dialog'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { heightChartScale } from '@/composables/healthCore'
import { localToday } from '@/composables/todoCore'

const PANEL_WIDTH = '480px'
const PANEL_MAX_HEIGHT = '85vh'
const HG_MIN = 30
const HG_MAX = 250
const CHART_W = 600
const CHART_H = 220
const CHART_PAD = 24
const GRID_COUNT = 4
const LIST_PAGE_SIZE = 10

const store = useWorkbenchHealthStore()

const config = computed(() => store.personConfig ?? { persons: [], categories: [] })
const persons = computed(() => config.value.persons)
const categories = computed(() => config.value.categories)
const categoryFilter = ref('')
const activePersonId = ref('')

const visiblePersons = computed(() =>
  categoryFilter.value ? persons.value.filter(p => p.categoryId === categoryFilter.value) : persons.value
)
const activePerson = computed(
  () => visiblePersons.value.find(p => p.id === activePersonId.value) ?? visiblePersons.value[0] ?? null
)
const personTabs = computed(() =>
  visiblePersons.value.map(p => ({
    value: p.id,
    label: p.name,
    badge: recordsOf(p.id).length,
    testid: `hg-person-${p.id}`
  }))
)

const allRecords = computed(() => store.records.height ?? [])
/** 异常记录（heightCm=0，由 normalize 归零）不参与统计与图表 */
function recordsOf(personId: string) {
  return allRecords.value.filter(r => r.personId === personId && r.heightCm > 0)
}
const currentRecords = computed(() => (activePerson.value ? recordsOf(activePerson.value.id) : []))
const sortedRecords = computed(() =>
  [...currentRecords.value].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1
  )
)
const latest = computed(() => sortedRecords.value[0] ?? null)
const first = computed(() => sortedRecords.value[sortedRecords.value.length - 1] ?? null)
const deltaCm = computed(() =>
  latest.value && first.value ? Math.round((latest.value.heightCm - first.value.heightCm) * 10) / 10 : null
)

// ===== SVG 折线图（与体重面板同款：4 条网格 + 首尾日期 + polyline + 点） =====
const chartScale = computed(() =>
  heightChartScale(
    [...currentRecords.value].sort((a, b) =>
      a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1
    ),
    CHART_W,
    CHART_H
  )
)
const chartPoints = computed(() => chartScale.value?.points ?? [])
const gridLines = computed<{ y: number; label: string }[]>(() => {
  const s = chartScale.value
  if (!s) return []
  const span = s.maxY - s.minY
  const inner = CHART_H - 2 * CHART_PAD
  const lines: { y: number; label: string }[] = []
  for (let i = 0; i < GRID_COUNT; i++) {
    const v = s.minY + (span * i) / (GRID_COUNT - 1)
    const y = CHART_PAD + (1 - (v - s.minY) / span) * inner
    lines.push({ y: Math.round(y * 100) / 100, label: Number.isInteger(v) ? String(v) : v.toFixed(1) })
  }
  return lines
})
const chartXLabels = computed(() => {
  const pts = chartPoints.value
  if (!pts.length) return []
  if (pts.length === 1) return [{ x: pts[0].x, date: pts[0].date, anchor: 'start' as const }]
  return [
    { x: pts[0].x, date: pts[0].date, anchor: 'start' as const },
    { x: pts[pts.length - 1].x, date: pts[pts.length - 1].date, anchor: 'end' as const }
  ]
})
const chartPolyline = computed(() => chartPoints.value.map(p => p.x + ',' + p.y).join(' '))

// ===== 记录表单 =====
const showRecordDialog = ref(false)
const editingId = ref<string | null>(null)
const formDate = ref(localToday())
const formHeightCm = ref<number | undefined>(undefined)
const formNote = ref('')

const isFormValid = computed(
  () =>
    formDate.value !== '' &&
    formHeightCm.value !== undefined &&
    Number.isFinite(formHeightCm.value) &&
    formHeightCm.value >= HG_MIN &&
    formHeightCm.value <= HG_MAX
)
/** 异常提示：有输入但不在合理范围 / 非数值 / 缺日期 */
const formError = computed(() => {
  if (formDate.value === '') return '请选择测量日期'
  if (formHeightCm.value === undefined || !Number.isFinite(formHeightCm.value)) return '请输入身高数值'
  if (formHeightCm.value < HG_MIN || formHeightCm.value > HG_MAX) return `身高需在 ${HG_MIN}–${HG_MAX} cm 之间`
  return ''
})

function startAddRecord(): void {
  if (!activePerson.value) return
  editingId.value = null
  formDate.value = localToday()
  formHeightCm.value = undefined
  formNote.value = ''
  showRecordDialog.value = true
}
function startEditRecord(id: string): void {
  const rec = allRecords.value.find(r => r.id === id)
  if (!rec) return
  editingId.value = id
  formDate.value = rec.date
  formHeightCm.value = rec.heightCm
  formNote.value = rec.note ?? ''
  showRecordDialog.value = true
}
function cancelRecordForm(): void {
  showRecordDialog.value = false
  editingId.value = null
}
async function handleSaveRecord(): Promise<void> {
  if (!isFormValid.value || !activePerson.value) return
  const note = formNote.value.trim()
  const payload: Record<string, unknown> = {
    date: formDate.value,
    heightCm: Number(formHeightCm.value),
    personId: activePerson.value.id
  }
  if (note) payload.note = note
  if (editingId.value) await store.updateRecord('height', editingId.value, payload)
  else await store.addRecord('height', payload)
  listPage.value = 1
  cancelRecordForm()
}
async function handleDeleteRecord(id: string): Promise<void> {
  if (await showConfirm('确定要删除这条身高记录吗？')) {
    await store.deleteRecord('height', id)
    listPage.value = 1
  }
}

const listPage = ref(1)
const listPageItems = computed(() =>
  sortedRecords.value.slice((listPage.value - 1) * LIST_PAGE_SIZE, listPage.value * LIST_PAGE_SIZE)
)
/** 表格「较上次变化」：按时间升序的相邻差值 */
function deltaOf(rowDate: string, rowCreatedAt: string): string {
  const asc = [...currentRecords.value].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1
  )
  const i = asc.findIndex(r => r.date === rowDate && r.createdAt === rowCreatedAt)
  if (i <= 0) return '—'
  const d = Math.round((asc[i].heightCm - asc[i - 1].heightCm) * 10) / 10
  return (d > 0 ? '+' : '') + d.toFixed(1)
}

onMounted(async () => {
  const recs = store.records
  const empty =
    recs.exercise.length === 0 && recs.diet.length === 0 && recs.sleep.length === 0 &&
    recs.weight.length === 0 && recs.height.length === 0
  if (empty && store.height === undefined) await store.loadHealth()
})
</script>

<template>
  <div class="wb-height">
    <!-- 顶部：当前人员与最新身高 -->
    <div class="stat-card">
      <div class="stat-header">
        <span class="stat-icon">📏</span>
        <span class="stat-label">身高记录</span>
        <div class="stat-panel-actions">
          <el-select v-model="categoryFilter" class="hg-cat-select" data-testid="hg-category-filter">
            <el-option label="全部分类" value="" />
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-button class="btn-add" data-testid="hg-add" :disabled="!activePerson" @click="startAddRecord">＋ 新增</el-button>
        </div>
      </div>
      <template v-if="activePerson">
        <div class="stat-value" data-testid="hg-latest">{{ latest ? latest.heightCm.toFixed(1) + ' cm' : '—' }}</div>
        <div class="stat-sub">{{ activePerson.name }} · 最新记录{{ latest ? ' · ' + latest.date : '' }}</div>
      </template>
      <div v-else class="stat-sub">尚未创建人员，请到「设置 → 身高设置」添加</div>
    </div>

    <!-- 一人一个标签页 -->
    <BaseTabs
      v-if="personTabs.length"
      v-model="activePersonId"
      :items="personTabs"
      testid="hg-person"
    />
    <div v-else class="empty-state" data-testid="hg-no-person">没有可显示的人员，请在「设置 → 身高设置」创建人员或切换分类</div>

    <template v-if="activePerson">
      <!-- 累计变化 -->
      <div class="stat-card">
        <div class="stat-header"><span class="stat-label">累计变化</span></div>
        <div class="stat-value" data-testid="hg-delta">
          {{ deltaCm === null ? '—' : (deltaCm > 0 ? '+' : '') + deltaCm.toFixed(1) + ' cm' }}
        </div>
        <div class="stat-sub">{{ first ? '首次 ' + first.date + ' · ' + first.heightCm.toFixed(1) + ' cm' : '至少需要两条记录' }}</div>
      </div>

      <!-- 趋势图 -->
      <div class="stat-card hg-chart-card">
        <div class="stat-header"><span class="stat-label">身高变化趋势</span></div>
        <svg v-if="chartScale" class="hg-chart" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" data-testid="hg-chart" role="img" aria-label="身高变化趋势折线图">
          <g v-for="(line, i) in gridLines" :key="'g' + i">
            <line :x1="CHART_PAD" :y1="line.y" :x2="CHART_W - CHART_PAD" :y2="line.y" class="hg-grid" />
            <text :x="CHART_PAD - 4" :y="line.y + 3" class="hg-axis" text-anchor="end">{{ line.label }}</text>
          </g>
          <polyline v-if="chartPoints.length >= 2" :points="chartPolyline" class="hg-line" />
          <circle v-for="(pt, i) in chartPoints" :key="'p' + i" :cx="pt.x" :cy="pt.y" r="4" class="hg-dot">
            <title>{{ pt.date }} · {{ pt.heightCm.toFixed(1) }} cm</title>
          </circle>
          <text v-for="(lab, i) in chartXLabels" :key="'x' + i" :x="lab.x" :y="CHART_H - 4" :text-anchor="lab.anchor" class="hg-axis">{{ lab.date }}</text>
        </svg>
        <div v-else class="hg-chart-empty" data-testid="hg-chart-empty">暂无身高记录</div>
      </div>

      <!-- 记录列表 -->
      <section v-if="sortedRecords.length" class="ewt-inline-section" data-testid="hg-records-section">
        <div class="ewt-inline-head">
          <h3 class="ewt-inline-title">身高记录（{{ sortedRecords.length }} 条）</h3>
        </div>
        <el-table class="ewt-table" :data="listPageItems" stripe border style="width: 100%" empty-text="暂无身高记录">
          <el-table-column type="index" label="序号" width="70" align="center" class-name="ewt-index-col" :index="(i: number) => (listPage - 1) * LIST_PAGE_SIZE + i + 1" />
          <el-table-column label="日期" width="130" align="center">
            <template #default="{ row }">{{ row.date }}</template>
          </el-table-column>
          <el-table-column label="身高 (cm)" width="130" align="right">
            <template #default="{ row }"><span class="hg-value">{{ row.heightCm.toFixed(1) }}</span></template>
          </el-table-column>
          <el-table-column label="较上次 (cm)" width="140" align="right">
            <template #default="{ row }">{{ deltaOf(row.date, row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="备注" min-width="200" align="center" show-overflow-tooltip>
            <template #default="{ row }">{{ row.note || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="170" align="center" fixed="right" class-name="ewt-op-col">
            <template #default="{ row }">
              <el-button class="btn-edit" :data-testid="`hg-edit-${row.id}`" @click="startEditRecord(row.id)">编辑</el-button>
              <el-button class="btn-delete" :data-testid="`hg-delete-${row.id}`" @click="handleDeleteRecord(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="hg-list-pager ewt-pager">
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
      <div v-else class="empty-state empty-invite" data-testid="hg-empty" @click="startAddRecord">＋ 新增第一条身高记录</div>
    </template>

    <!-- 新增 / 编辑弹框 -->
    <BaseDialog
      v-if="showRecordDialog"
      :title="editingId ? '编辑身高记录' : '新增身高记录'"
      :width="PANEL_WIDTH"
      :max-height="PANEL_MAX_HEIGHT"
      class="hg-record-overlay"
      data-testid="hg-dialog"
      @close="cancelRecordForm"
    >
      <form class="dialog-body" @submit.prevent="handleSaveRecord">
        <div class="form-group">
          <label>测量日期 *</label>
          <el-date-picker
            v-model="formDate"
            type="date"
            value-format="YYYY-MM-DD"
            class="field-date"
            data-testid="hg-form-date"
          />
        </div>
        <div class="form-group">
          <label>身高（cm）*</label>
          <el-input-number
            v-model="formHeightCm"
            :step="0.1"
            :precision="1"
            :controls="false"
            class="field-height"
            :placeholder="`${HG_MIN}–${HG_MAX}`"
            data-testid="hg-form-height"
          />
          <p v-if="formError" class="hg-form-error" data-testid="hg-form-error">{{ formError }}</p>
        </div>
        <div class="form-group">
          <label>备注（可选）</label>
          <el-input v-model="formNote" type="textarea" :rows="2" class="desc-input" maxlength="200" placeholder="如：晨起测量 / 体检数据" data-testid="hg-form-note" />
        </div>
        <div class="form-actions ewt-dialog-footer">
          <el-button native-type="button" class="btn-cancel" data-testid="hg-cancel" @click="cancelRecordForm">{{ DIALOG_BTN.close }}</el-button>
          <el-button type="primary" native-type="submit" class="btn-save" :disabled="!isFormValid" data-testid="hg-save">{{ DIALOG_BTN.save }}</el-button>
          <el-button v-if="editingId" type="danger" native-type="button" data-testid="hg-record-delete" @click="handleDeleteRecord(editingId)">删除</el-button>
        </div>
      </form>
    </BaseDialog>
  </div>
</template>

<style scoped>
.wb-height {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.stat-panel-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}
.hg-cat-select { width: 130px; }
.stat-value {
  font-size: var(--fs-h2);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.stat-sub { font-size: var(--fs-sm); color: var(--color-text-secondary); }
.hg-value { font-weight: 700; color: var(--color-success-text); font-variant-numeric: tabular-nums; }

/* SVG 图表：颜色全走 token，暗色自动跟随 */
.hg-chart-card { min-width: 0; }
.hg-chart { display: block; width: 100%; height: auto; }
.hg-grid { stroke: var(--color-border); stroke-width: 1; }
.hg-axis { fill: var(--color-text-muted); font-size: var(--fs-caption); }
.hg-line { fill: none; stroke: var(--color-primary); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.hg-dot { fill: var(--color-primary); }
.hg-chart-empty { padding: var(--space-5); text-align: center; font-size: var(--fs-sm); color: var(--color-text-muted); }

.dialog-body { display: flex; flex-direction: column; gap: 14px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group > label { font-size: var(--fs-sm); color: var(--color-text-secondary); }
.field-date, .field-height { width: 180px; }
.hg-form-error { margin: 0; font-size: var(--fs-caption); color: var(--color-error-text); }
.form-actions { display: flex; align-items: center; gap: var(--space-2); justify-content: flex-end; }
.desc-input { resize: vertical; }

.hg-list-pager {
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-5) var(--space-4);
  border-top: 1px solid var(--color-border);
  border-radius: 0 0 14px 14px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .hg-list-pager { border-top-color: var(--color-border); }
.hg-record-overlay { z-index: var(--wb-dialog-z, 300); }

@media (max-width: 768px) {
  .stat-panel-actions { flex-wrap: wrap; }
  .hg-cat-select { width: 110px; }
}
@media (min-width: 769px) {
  .wb-height { flex: 1; min-height: 0; }
}
</style>
