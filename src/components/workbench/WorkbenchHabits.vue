<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { showConfirm } from '@/utils/dialog'
import { compressImageFile } from '@/utils/imageCompress'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import {
  DEFAULT_HABIT_COLOR,
  MAX_IMAGES_PER_RECORD,
  MAX_IMAGE_BYTES,
  estimateDataUrlBytes,
  normalizeHabitImages
} from '@/composables/habitCore'
import type { HabitFrequency, HabitImage } from '@/composables/habitCore'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/Icon.vue'
import WorkbenchFab from '@/components/workbench/WorkbenchFab.vue'
import HabitCalendarCard from './HabitCalendarCard.vue'

const store = useWorkbenchHabitsStore()
const toast = useToast()

// 今天 = 本地日期 YYYY-MM-DD（localToday 防 UTC 偏移）
const today = localToday()

/** 今日是否已打卡（records 同日记录存在性判断，非公式）。 */
function isChecked(habitId: string): boolean {
  return store.records.some(r => r.habitId === habitId && r.date === today)
}

// 卡片排序：未打卡置顶（「今天要处理」一眼可见），已打卡沉底；同状态内保持录入顺序稳定。
// 仅依赖 records/today 的响应式派生；打卡（今日）后由 <TransitionGroup> 平滑滑动到新位置。
const viewHabits = computed(() =>
  store.habits
    .map((h, i) => ({ h, i, checked: isChecked(h.id) }))
    .sort((a, b) => (a.checked === b.checked ? a.i - b.i : a.checked ? 1 : -1))
    .map(({ h }) => h)
)

// 一次性展示全部习惯（无分页）：月历卡片随内容撑开，由页面统一滚动

// 月历卡片点击某天 = 打卡/取消（卡片只上抛 toggle，具体由 store 执行）
async function onToggleCheckIn(habitId: string, date: string): Promise<void> {
  const res = await store.toggleCheckIn(habitId, date)
  if (!res.ok) toast.error('打卡失败，请重试')
}

// 频率选项与 habitCore HabitFrequency（每周目标次数 1-7）对齐：「每天」即 7
const FREQUENCY_OPTIONS: { value: HabitFrequency; label: string }[] = [
  { value: 7, label: '每天' },
  { value: 5, label: '每周 5 次' },
  { value: 3, label: '每周 3 次' },
  { value: 1, label: '每周 1 次' }
]

// 习惯操作失败 toast：reason 语义 → 中文文案
const HABIT_ERROR_MESSAGES: Record<string, string> = {
  empty: '习惯名称不能为空',
  duplicate: '同名习惯已存在',
  'not-found': '习惯不存在',
  invalid: '日期格式不正确'
}

function habitErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(HABIT_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

// ===== 新增/编辑弹框（顶部「新增习惯」按钮与卡片点击共用同一弹框）=====
const showEditDialog = ref(false)
const editingId = ref<string | null>(null)
const dialogName = ref('')
const dialogFrequency = ref<HabitFrequency>(7)
const dialogColor = ref(DEFAULT_HABIT_COLOR)
/** 是否开启「打卡图片」：开启后点日历某天进入详情弹框，可传图；关闭则保持「点一下就打卡」 */
const dialogImageEnabled = ref(false)

function openAddDialog(): void {
  editingId.value = null
  dialogName.value = ''
  dialogFrequency.value = 7
  dialogColor.value = DEFAULT_HABIT_COLOR
  dialogImageEnabled.value = false
  showEditDialog.value = true
}

function openEditDialog(id: string): void {
  const h = store.habits.find(x => x.id === id)
  if (!h) return
  editingId.value = h.id
  dialogName.value = h.name
  dialogFrequency.value = h.frequency
  dialogColor.value = h.color ?? DEFAULT_HABIT_COLOR
  dialogImageEnabled.value = h.imageEnabled === true
  showEditDialog.value = true
}

function closeEditDialog(): void {
  showEditDialog.value = false
  editingId.value = null
}

async function saveEditDialog(): Promise<void> {
  const name = dialogName.value.trim()
  if (!name) return
  if (editingId.value !== null) {
    const result = await store.updateHabit(editingId.value, {
      name,
      frequency: dialogFrequency.value,
      color: dialogColor.value,
      imageEnabled: dialogImageEnabled.value
    })
    if (result.ok) closeEditDialog()
    habitErrorToast(result)
    return
  }
  const result = await store.addHabit(
    name,
    dialogFrequency.value,
    dialogColor.value,
    dialogImageEnabled.value
  )
  if (result.ok) {
    closeEditDialog()
  }
  habitErrorToast(result)
}

async function handleDelete(id: string): Promise<void> {
  const h = store.habits.find(x => x.id === id)
  if (!await showConfirm(`确定要删除习惯「${h?.name ?? ''}」吗？删除后打卡记录一并清除。`)) return
  const result = await store.deleteHabit(id)
  if (result.ok) {
    if (editingId.value === id) closeEditDialog()
  }
  habitErrorToast(result)
}

function deleteCurrent(): void {
  if (editingId.value) void handleDelete(editingId.value)
}

// ===== 某天打卡详情弹框（图片）：由日历格子的图片角标进入 =====
const showDetailDialog = ref(false)
const detailHabitId = ref('')
const detailDate = ref('')
/** 弹框内的打卡状态初稿（未打卡 = false；勾选后点保存才写库） */
const detailChecked = ref(false)
/** 弹框内的图片初稿：草稿态，保存时整批交给 store 落库 */
const detailImages = ref<HabitImage[]>([])
/** 打开弹框时的初稿快照（JSON 串），用于判断「保存」是否需要可点 */
const detailSnapshot = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const previewSrc = ref('')

const detailHabit = computed(() => store.habits.find(h => h.id === detailHabitId.value) ?? null)
const detailTitle = computed(() => {
  if (!detailDate.value) return '打卡详情'
  const parts = detailDate.value.split('-')
  return `${Number(parts[1])}月${Number(parts[2])}日 · 打卡详情`
})
const detailStreakWeek = computed(() => {
  const h = detailHabit.value
  if (!h || !detailDate.value) return ''
  const s = store.streakOf(h.id, h.frequency, today)
  const w = store.weeklyAttainmentOf(h.id, h.frequency, detailDate.value)
  return `连续 ${s.count}${s.unit} · 本周 ${w.completed}/${w.target}`
})
const detailBytes = computed(() => detailImages.value.reduce((sum, im) => sum + im.bytes, 0))
const canAddImage = computed(() => detailImages.value.length < MAX_IMAGES_PER_RECORD)
const detailDirty = computed(
  () =>
    detailSnapshot.value !==
    JSON.stringify({ checked: detailChecked.value, images: detailImages.value.map(im => im.id) })
)

/** 体积友好显示：<1MB 用 KB，否则 MB。 */
function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function openDetail(habitId: string, date: string): void {
  const rec = store.records.find(r => r.habitId === habitId && r.date === date) ?? null
  detailHabitId.value = habitId
  detailDate.value = date
  // 开关默认开：点某天进入详情即视为打卡；想取消当天打卡，把开关关掉即可
  detailChecked.value = true
  detailImages.value = (rec?.images ?? []).map(im => ({ ...im }))
  // 快照记录的是「库里的真实状态」：未打卡日打开详情时初稿（开）≠ 快照（关），
  // 因此「保存」直接可点，符合「点开就是来打卡」的意图
  detailSnapshot.value = JSON.stringify({
    checked: rec !== null,
    images: detailImages.value.map(im => im.id)
  })
  showDetailDialog.value = true
}

function closeDetail(): void {
  showDetailDialog.value = false
  previewSrc.value = ''
  detailHabitId.value = ''
  detailDate.value = ''
  detailChecked.value = false
  detailImages.value = [] // 释放草稿里的 base64 字符串
  detailSnapshot.value = ''
}

/** 添加图片：达到上限时不弹文件框，直接提示（省一次无效操作）。 */
function triggerImagePicker(): void {
  if (!canAddImage.value) {
    toast.warning(`最多上传 ${MAX_IMAGES_PER_RECORD} 张图片`)
    return
  }
  fileInputRef.value?.click()
}

/**
 * 选图 → 校验 → 压缩：类型非 image 或原图 >10MB 的文件直接跳过并汇总提示，
 * 合法文件压缩后进入草稿；「还能加几张」以外的多余文件一并忽略。
 */
async function handleImageFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = '' // 清空以便重复选同一文件也能触发 change
  if (files.length === 0) return
  const room = MAX_IMAGES_PER_RECORD - detailImages.value.length
  if (room <= 0) {
    toast.warning(`最多上传 ${MAX_IMAGES_PER_RECORD} 张图片`)
    return
  }
  if (files.length > room) toast.warning(`最多 ${MAX_IMAGES_PER_RECORD} 张，本次仅添加前 ${room} 张`)

  const badType: string[] = []
  const tooLarge: string[] = []
  const failed: string[] = []
  const added: HabitImage[] = []
  for (const file of files.slice(0, room)) {
    if (!file.type.startsWith('image/')) {
      badType.push(file.name)
      continue
    }
    if (file.size > MAX_IMAGE_BYTES) {
      tooLarge.push(file.name)
      continue
    }
    try {
      const compressed = await compressImageFile(file)
      added.push({
        id: '', // normalizeHabitImages 会补 hbi_ 前缀 id
        dataUrl: compressed.dataUrl,
        bytes: estimateDataUrlBytes(compressed.dataUrl),
        name: file.name
      })
    } catch {
      failed.push(file.name)
    }
  }
  if (badType.length > 0) toast.error(`只能上传 JPG / PNG / WebP 图片：${badType.join('、')}`)
  if (tooLarge.length > 0) toast.error(`「${tooLarge.join('」「')}」超过 10MB，已跳过`)
  if (failed.length > 0) toast.error(`「${failed.join('」「')}」读取失败，已跳过`)
  if (added.length === 0) return
  // 走 normalize：补 id（草稿里 id 为空，不经归一化会让删除按钮按 id 误删同批图片）+ 截断到上限
  detailImages.value = normalizeHabitImages([...detailImages.value, ...added])
  toast.success(`已添加 ${added.length} 张（自动压缩）`)
}

async function removeDetailImage(id: string): Promise<void> {
  if (!await showConfirm('确定删除这张图片吗？')) return
  detailImages.value = detailImages.value.filter(im => im.id !== id)
  if (previewSrc.value) previewSrc.value = ''
}

/** 保存详情：以「打卡」开关为准 —— 关掉即取消当天打卡（图片随记录一并清除，故有图时二次确认）。 */
async function saveDetail(): Promise<void> {
  if (!detailHabitId.value || !detailDate.value) return
  if (!detailChecked.value && detailImages.value.length > 0) {
    if (!await showConfirm('关闭打卡会连同当天的图片一起删除，确定吗？')) return
  }
  const result = await store.saveRecordDetail(
    detailHabitId.value,
    detailDate.value,
    detailImages.value,
    detailChecked.value
  )
  if (!result.ok) {
    habitErrorToast(result)
    return
  }
  closeDetail()
  toast.success('已保存')
}

function openPreview(im: HabitImage): void {
  previewSrc.value = im.dataUrl
}

function closePreview(): void {
  previewSrc.value = ''
}

// 预览层在 document 捕获阶段拦截 ESC：否则 BaseDialog 的 window 监听会连带关闭详情弹框
function onPreviewKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !previewSrc.value) return
  event.stopPropagation()
  closePreview()
}

// 面板自管理数据加载
onMounted(() => {
  void store.loadHabits()
  document.addEventListener('keydown', onPreviewKeydown, true)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onPreviewKeydown, true)
})
</script>

<template>
  <div class="wb-habits">
    <!-- 顶部工具栏：左上角新增习惯按钮 -->
    <div class="hb-toolbar">
      <el-button class="hb-add-btn" type="primary" size="small" data-testid="hb-add-btn" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增习惯
      </el-button>
    </div>

    <!-- 习惯月历卡片网格（多列并排，分页在网格下方） -->
    <div class="hb-main">
      <div v-if="store.habits.length === 0" class="empty-state" data-testid="hb-empty">
        还没有习惯，点上方「新增习惯」开始吧
      </div>

      <div v-else class="hb-list">
        <TransitionGroup name="grid">
          <HabitCalendarCard
            v-for="h in viewHabits"
            :key="h.id"
            :habit="h"
            :records="store.records"
            :streak="store.streakOf(h.id, h.frequency, today)"
            :week="store.weeklyAttainmentOf(h.id, h.frequency, today)"
            :default-color="DEFAULT_HABIT_COLOR"
            :detail-mode="h.imageEnabled === true"
            @edit="openEditDialog"
            @toggle="(d: string) => onToggleCheckIn(h.id, d)"
            @open-detail="(d: string) => openDetail(h.id, d)"
          />
        </TransitionGroup>
      </div>
    </div>

    <!-- 新增/编辑弹框（顶部按钮与卡片点击共用） -->
    <el-dialog
      :model-value="showEditDialog"
      :title="editingId ? '编辑习惯' : '新增习惯'"
      width="440px"
      :aria-label="editingId ? '编辑习惯' : '新增习惯'"
      @close="closeEditDialog"
      @update:model-value="(v: boolean) => { if (!v) closeEditDialog() }"
    >
      <template #header>
        <div class="dialog-header">
          <span class="dialog-title">{{ editingId ? '编辑习惯' : '新增习惯' }}</span>
        </div>
      </template>
      <div class="dialog-body">
        <div class="field">
          <label class="field-label">名称 *</label>
          <el-input
            v-model="dialogName"
            placeholder="例如：每天喝水 8 杯"
            maxlength="30"
            data-testid="hb-dialog-name"
          />
        </div>
        <div class="field">
          <label class="field-label">频率</label>
          <el-select v-model="dialogFrequency" data-testid="hb-dialog-frequency">
            <el-option
              v-for="opt in FREQUENCY_OPTIONS"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </el-select>
        </div>
        <div class="field field-inline">
          <label class="field-label">是否上传图片</label>
          <el-switch v-model="dialogImageEnabled" data-testid="hb-dialog-image-enabled" />
        </div>
        <p class="field-hint">
          {{
            dialogImageEnabled
              ? '开启后：点日历某天打开「打卡详情」，可上传最多 3 张图片（单张 ≤10MB），打卡 / 取消在详情内完成。'
              : '关闭：点日历某天直接打卡 / 取消打卡（原有行为）。'
          }}
        </p>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button size="small" data-testid="hb-dialog-cancel" @click="closeEditDialog">取消</el-button>
          <el-button
            type="primary"
            size="small"
            :disabled="!dialogName.trim()"
            data-testid="hb-dialog-save"
            @click="saveEditDialog"
          >
            {{ editingId ? '保存' : '添加' }}
          </el-button>
          <el-button
            v-if="editingId"
            size="small"
            class="btn-danger"
            data-testid="hb-dialog-delete"
            @click="deleteCurrent"
          >
            删除
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 某天打卡详情（图片）：由日历格子的图片角标进入；外壳统一用 BaseDialog -->
    <BaseDialog
      v-if="showDetailDialog"
      :title="detailTitle"
      :width="'480px'"
      data-testid="hb-detail-dialog"
      @close="closeDetail"
    >
      <div class="habit-detail-meta">
        <span class="habit-detail-chip">
          <i :style="{ backgroundColor: detailHabit?.color ?? DEFAULT_HABIT_COLOR }"></i>
          <span>{{ detailHabit?.name ?? '' }}</span>
        </span>
        <span>{{ detailStreakWeek }}</span>
      </div>

      <div class="habit-detail-status">
        <span class="habit-detail-statustitle">打卡</span>
        <el-switch
          v-model="detailChecked"
          active-text="已打卡"
          inactive-text="未打卡"
          data-testid="hb-detail-check-switch"
        />
      </div>

      <div class="habit-detail-block">
        <div class="habit-detail-label">
          <h4>打卡图片</h4>
          <span class="habit-detail-count">{{ detailImages.length }}/{{ MAX_IMAGES_PER_RECORD }}</span>
        </div>

        <div class="habit-detail-grid">
          <div v-for="im in detailImages" :key="im.id" class="habit-detail-tile" :data-testid="`hb-detail-tile-${im.id}`">
            <img :src="im.dataUrl" :alt="im.name ?? '打卡图片'" @click="openPreview(im)" />
            <button class="habit-detail-remove" type="button" title="删除" @click="removeDetailImage(im.id)">
              <Icon name="close" :size="12" />
            </button>
            <span class="habit-detail-size">{{ formatBytes(im.bytes) }}</span>
          </div>

          <button
            v-if="canAddImage"
            class="habit-detail-add"
            type="button"
            data-testid="hb-detail-add"
            @click="triggerImagePicker"
          >
            <Icon name="plus" :size="20" />
            <span>添加图片</span>
          </button>
          <button v-else class="habit-detail-add" type="button" disabled title="最多上传 3 张图片">
            <Icon name="plus" :size="20" />
            <span>已达上限</span>
          </button>
        </div>

        <div class="habit-detail-bar">
          <span>{{
            detailImages.length > 0
              ? `共 ${detailImages.length} 张 · 占用约 ${formatBytes(detailBytes)}`
              : '暂无图片'
          }}</span>
        </div>
        <p class="habit-detail-hint">
          支持 JPG / PNG / WebP，单张最大 10MB，最多 {{ MAX_IMAGES_PER_RECORD }} 张。<br />
          为保证云同步速度，原图会压缩到长边 1280px（约 300KB）后再保存，不保留原图。
        </p>
      </div>

      <input ref="fileInputRef" type="file" accept="image/*" multiple hidden @change="handleImageFiles" />

      <template #footer>
        <button class="btn-cancel" data-testid="hb-detail-cancel" @click="closeDetail">取消</button>
        <button class="btn-submit" data-testid="hb-detail-save" :disabled="!detailDirty" @click="saveDetail">
          保存
        </button>
      </template>
    </BaseDialog>

    <!-- 图片预览：层级高于详情弹框，ESC 先关预览（由 document 捕获阶段拦截） -->
    <Teleport to="body">
      <div
        v-if="previewSrc"
        class="habit-detail-preview"
        data-testid="hb-detail-preview"
        @click.self="closePreview"
      >
        <button class="close-btn habit-detail-preview-close" type="button" aria-label="关闭预览" @click="closePreview">
          <Icon name="close" :size="16" />
        </button>
        <img :src="previewSrc" alt="图片预览" />
      </div>
    </Teleport>
  </div>
<WorkbenchFab @click="openAddDialog" />
</template>

<style scoped>
/* 面板容器：顶部工具栏 + 下方卡片网格（单栏纵向堆叠） */
.wb-habits {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hb-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.hb-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hb-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

/* ===== 表单/弹框通用字段 ===== */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

/* 开关行：标签左 + 开关右（与 .field 的纵向堆叠互补） */
.field-inline {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.field-hint {
  margin: -6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-muted, var(--color-text-muted));
}

/* ===== 习惯卡片网格（多列并排，月历卡片） ===== */
.hb-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
  align-content: start;
}

/* ===== 弹框（新增/编辑）===== */
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
  position: sticky;
  top: 0;
  background: var(--color-bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border, var(--color-border));
}

.btn-danger {
  /* 视觉已统一到全局 .ui-btn--danger（style.css）：红色危险操作 */
}

.btn-danger:hover {
  /* 视觉已统一到全局 .ui-btn--danger（style.css） */
}

/* ===== 空态：.empty-state 已收敛到全局基类（src/style.css） ===== */

/* ===== 某天打卡详情弹框（图片）===== */
.habit-detail-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-3, 12px);
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-secondary, #64748b);
}

.habit-detail-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text, #1e293b);
}

html.dark .habit-detail-chip {
  background: var(--color-bg-hover, #334155);
  color: var(--color-text, #e5e7eb);
}

.habit-detail-chip i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.habit-detail-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  padding: 10px var(--space-3, 12px);
  margin-bottom: var(--space-4, 16px);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-hover, #f1f5f9);
}

/* 状态行左侧标题：与右侧 el-switch 同一行，垂直居中 */
.habit-detail-statustitle {
  font-size: var(--font-size-sm, 13px);
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.habit-detail-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-2, 8px);
}

.habit-detail-label h4 {
  margin: 0;
  font-size: var(--font-size-base, 14px);
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.habit-detail-count,
.habit-detail-bar {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-secondary, #64748b);
  font-variant-numeric: tabular-nums;
}

.habit-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3, 12px);
}

.habit-detail-tile {
  position: relative;
  aspect-ratio: 1 / 1;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
  background: var(--color-bg-hover, #f1f5f9);
}

.habit-detail-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  cursor: zoom-in;
}

.habit-detail-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-full, 999px);
  background: rgba(15, 23, 42, 0.66);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--motion-duration, 220ms) var(--motion-ease, ease);
}

/* 触屏无 hover：删除按钮常显，避免「看得到图片却删不掉」 */
.habit-detail-tile:hover .habit-detail-remove,
html.is-touch .habit-detail-remove {
  opacity: 1;
}

.habit-detail-size {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 3px 6px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.62), transparent);
  color: #fff;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.habit-detail-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  aspect-ratio: 1 / 1;
  border: 1px dashed var(--color-border-strong, #94a3b8);
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
  transition: border-color var(--motion-duration, 220ms) var(--motion-ease, ease),
    color var(--motion-duration, 220ms) var(--motion-ease, ease),
    background-color var(--motion-duration, 220ms) var(--motion-ease, ease);
}

.habit-detail-add:hover:not(:disabled) {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, #eff6ff);
}

.habit-detail-add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.habit-detail-bar {
  margin-top: var(--space-2, 8px);
  display: flex;
  justify-content: space-between;
}

.habit-detail-hint {
  margin: var(--space-3, 12px) 0 0;
  font-size: var(--font-size-xs, 12px);
  line-height: 1.7;
  color: var(--color-text-muted, #94a3b8);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 预览层：层级低于 toast、高于 BaseDialog（300），保证放大图盖在详情弹框之上 */
.habit-detail-preview {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6, 24px);
  background: rgba(0, 0, 0, 0.82);
}

.habit-detail-preview img {
  max-width: 92vw;
  max-height: 88vh;
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.15));
}

.habit-detail-preview-close {
  position: absolute;
  top: var(--space-4, 16px);
  right: var(--space-4, 16px);
}

@media (max-width: 768px) {
  .habit-detail-grid {
    gap: var(--space-2, 8px);
  }

  .habit-detail-preview {
    padding: var(--space-4, 16px);
  }
}

/* ===== 暗色模式覆盖 ===== */
html.dark .dialog-header,
html.dark .dialog-title {
  color: var(--color-text, #f9fafb);
  background-color: var(--color-bg-card, #1f2937);
}

/* html.dark .empty-state 背景已由全局 .empty-state 的 --color-bg-card token 自动跟随 */

/* ===== 桌面自适应分页（一屏布局：网格 flex:1 钉满，分页在网格下方）===== */
@media (min-width: 769px) {
  .hb-main {
    flex: 1;
    min-height: 0;
  }

  .hb-list {
    flex: 1;
    min-height: 0;
  }
}
</style>
