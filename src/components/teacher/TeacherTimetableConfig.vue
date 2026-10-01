<script setup lang="ts">
// 教师工作台「课程表配置」面板（复刻学生配置，按班级隔离）
// 承载：基础配置（学周数 / 每日节数 / 班级 / 节次时间）+ Excel 模板下载 + Excel 导入（校验 → 预览 → 写库）。
// 与教师课程表面板共用 useTeacherTimetableStore 与 studentTimetableCore / studentTimetableImportCore 纯逻辑，
// 数据读写落 teacher_workbench 单对象的 ClassBucket.timetable，随班级自动重载。

import { computed, onMounted, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import { useTeacherTimetableStore } from '@/stores/teacherTimetable'
import { useToast } from '@/composables/useToast'
import { normalizeTiming, computePeriodTime } from '@/composables/studentTimetableCore'
import {
  mapHeaders,
  validateImportRows,
  buildImportErrorCsv,
  importSummaryText,
  type ImportResult
} from '@/composables/studentTimetableImportCore'
import { downloadTemplate as downloadTpl } from '@/composables/teacherTemplateCore'
import { downloadCsv, csvFileName } from '@/composables/csvExport'

const props = withDefaults(defineProps<{
  /** 嵌入设置弹窗时隐藏自带标题（外层已有标题），仅保留操作按钮 */
  embedded?: boolean
}>(), { embedded: false })

const store = useTeacherTimetableStore()
const toast = useToast()

// ===== 基础配置 =====
const timing = computed(() => normalizeTiming(store.data.timing))

const configWeeks = ref(store.data.weeks)
const configPeriods = ref(store.data.periodsPerDay)
const configClassroom = ref(store.data.classroom || '')
const configFirstStart = ref(timing.value.firstStart)
const configAfternoonStart = ref(timing.value.afternoonStart)
const configLessonMinutes = ref(timing.value.lessonMinutes)
const configBreakMinutes = ref(timing.value.breakMinutes)
const configMorningPeriods = ref(timing.value.morningPeriods)

function resetConfigForm(): void {
  configWeeks.value = store.data.weeks
  configPeriods.value = store.data.periodsPerDay
  configClassroom.value = store.data.classroom || ''
  configFirstStart.value = timing.value.firstStart
  configAfternoonStart.value = timing.value.afternoonStart
  configLessonMinutes.value = timing.value.lessonMinutes
  configBreakMinutes.value = timing.value.breakMinutes
  configMorningPeriods.value = timing.value.morningPeriods
}

const saving = ref(false)

async function saveConfig(): Promise<void> {
  saving.value = true
  try {
    await store.updateConfig(configWeeks.value, configPeriods.value, configClassroom.value)
    await store.updateTiming({
      firstStart: configFirstStart.value,
      afternoonStart: configAfternoonStart.value,
      lessonMinutes: configLessonMinutes.value,
      breakMinutes: configBreakMinutes.value,
      morningPeriods: configMorningPeriods.value
    })
    toast.success('课程表配置已保存')
  } catch (e) {
    console.error('[TeacherTimetableConfig] save failed', e)
    toast.error('保存失败，请重试')
  } finally {
    saving.value = false
  }
}

/** 时间预览：按当前表单值推算首节 / 末节，便于填配置时核对 */
const timePreview = computed(() => {
  const t = {
    firstStart: configFirstStart.value,
    afternoonStart: configAfternoonStart.value,
    lessonMinutes: configLessonMinutes.value,
    breakMinutes: configBreakMinutes.value,
    morningPeriods: configMorningPeriods.value
  }
  const n = Math.max(1, Math.min(12, Math.floor(configPeriods.value) || 1))
  const first = computePeriodTime(1, t)
  const last = computePeriodTime(n, t)
  return `第 1 节 ${first.startHHMM}-${first.endHHMM}　·　第 ${n} 节 ${last.startHHMM}-${last.endHHMM}`
})

// ===== 模板下载 =====
const templateLoading = ref(false)

async function downloadTemplate(): Promise<void> {
  templateLoading.value = true
  try {
    await downloadTpl('studentTimetable', {
      classTitle: store.data.classroom || '',
      onSuccess: () => toast.success('模板已下载'),
      onError: (m) => toast.error(m)
    })
  } catch (e) {
    console.error('[TeacherTimetableConfig] template failed', e)
    toast.error('模板下载失败，请重试')
  } finally {
    templateLoading.value = false
  }
}

// ===== Excel 导入 =====
const fileInput = ref<HTMLInputElement | null>(null)
const parsing = ref(false)
const importing = ref(false)
const result = ref<ImportResult | null>(null)
const fileName = ref('')

function triggerUpload(): void {
  fileInput.value?.click()
}

/** 判断一行是否全空（Excel 常有空行尾随） */
function isBlankRow(values: readonly unknown[]): boolean {
  return values.every(v => v === undefined || v === null || String(v).trim() === '')
}

async function onFileChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // 先清空，保证同一个文件可以再次选择（修正后重新导入）
  input.value = ''
  if (!file) return

  const okExt = /\.(xlsx|xls)$/i.test(file.name)
  if (!okExt) {
    toast.error('请上传 .xlsx 或 .xls 格式的 Excel 文件')
    return
  }

  parsing.value = true
  result.value = null
  fileName.value = file.name
  try {
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) {
      toast.error('文件里没有工作表，请按模板填写后重新导入')
      return
    }
    const ws = wb.Sheets[sheetName]
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' })
    if (!aoa.length) {
      toast.error('工作表是空的，请按模板填写后重新导入')
      return
    }

    const headers = mapHeaders(aoa[0] ?? [])
    if (headers.missing.length) {
      toast.error(`文件缺少必填列：${headers.missing.join('、')}`)
      return
    }

    const rows = aoa
      .slice(1)
      .map((values, i) => ({ row: i + 2, values }))
      .filter(r => !isBlankRow(r.values))

    if (!rows.length) {
      toast.error('没有解析到数据行，请在「课程表模板」里填写后重新导入')
      return
    }

    result.value = validateImportRows(rows, headers, {
      periodsPerDay: store.data.periodsPerDay,
      weeks: store.data.weeks,
      timing: timing.value,
      existing: store.data.schedule
    })

    if (result.value.failed > 0 && result.value.success === 0) {
      toast.error(`全部 ${result.value.failed} 行校验失败，请查看错误明细`)
    } else if (result.value.failed > 0) {
      toast.warning(importSummaryText(result.value))
    } else {
      toast.success(importSummaryText(result.value))
    }
  } catch (err) {
    console.error('[TeacherTimetableConfig] parse failed', err)
    toast.error('文件解析失败，请确认是按模板下载的 Excel 文件')
  } finally {
    parsing.value = false
  }
}

async function confirmImport(): Promise<void> {
  const r = result.value
  if (!r || !r.success) return
  importing.value = true
  try {
    const n = await store.importCells(r.cells)
    toast.success(`已导入 ${n} 条课程`)
    result.value = null
    fileName.value = ''
  } catch (e) {
    console.error('[TeacherTimetableConfig] import failed', e)
    toast.error('写入失败，请重试')
  } finally {
    importing.value = false
  }
}

function downloadErrors(): void {
  const r = result.value
  if (!r || !r.errors.length) return
  downloadCsv(csvFileName('课程表导入错误明细'), buildImportErrorCsv(r.errors))
}

onMounted(async () => {
  await store.loadTimetable()
  resetConfigForm()
})
</script>

<template>
  <div class="sttc-shell" :class="{ 'is-embedded': props.embedded }">
    <div v-if="!props.embedded" class="tw-head">
      <div>
        <h2 class="tw-title">课程表配置</h2>
        <p class="tw-subtitle">{{ store.data.classroom || '未设班级' }} · 每日 {{ store.data.periodsPerDay }} 节</p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <el-button size="small" :loading="templateLoading" @click="downloadTemplate">
          <Icon name="download" :size="14" /> 下载模板
        </el-button>
        <el-button size="small" type="primary" :loading="parsing" @click="triggerUpload">
          <Icon name="download" :size="14" /> 导入 Excel
        </el-button>
      </div>
    </div>

    <!-- 嵌入设置弹窗时仍需要触发导入的按钮（外层头部不可见，但导入入口不能丢） -->
    <div v-else class="tw-toolbar tw-no-print sttc-embed-actions">
      <el-button size="small" :loading="templateLoading" @click="downloadTemplate">
        <Icon name="download" :size="14" /> 下载模板
      </el-button>
      <el-button size="small" type="primary" :loading="parsing" @click="triggerUpload">
        <Icon name="download" :size="14" /> 导入 Excel
      </el-button>
    </div>

    <!-- 基础配置 -->
    <div class="sttc-card">
      <div class="sttc-card-title">基础配置</div>
      <div class="sttc-form">
        <div class="form-row">
          <div class="form-field">
            <label>学周数（1-52）</label>
            <el-input v-model.number="configWeeks" type="number" min="1" max="52" />
          </div>
          <div class="form-field">
            <label>每日节数（1-12）</label>
            <el-input v-model.number="configPeriods" type="number" min="1" max="12" />
          </div>
        </div>
        <div class="form-field">
          <label>教室/班级（可选）</label>
          <el-input v-model="configClassroom" type="text" maxlength="30" placeholder="如：三年二班 / 301" />
        </div>

        <div class="sttc-sub-title">节次时间（上午 / 下午分别起算，段内后续各节自动推算）</div>
        <div class="form-row">
          <div class="form-field">
            <label>上午第一节开始时间</label>
            <el-input v-model="configFirstStart" type="time" />
          </div>
          <div class="form-field">
            <label>下午第一节开始时间</label>
            <el-input v-model="configAfternoonStart" type="time" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>单节课时长（分钟）</label>
            <el-input v-model.number="configLessonMinutes" type="number" min="1" max="120" />
          </div>
          <div class="form-field">
            <label>课间休息（分钟）</label>
            <el-input v-model.number="configBreakMinutes" type="number" min="0" max="60" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>上午节数</label>
            <el-input v-model.number="configMorningPeriods" type="number" min="1" max="12" />
          </div>
        </div>
        <div class="sttc-preview">{{ timePreview }}</div>
        <div class="sttc-actions">
          <el-button @click="resetConfigForm">重置</el-button>
          <el-button type="primary" :loading="saving" @click="saveConfig">保存配置</el-button>
        </div>
      </div>
    </div>

    <!-- Excel 导入 -->
    <div class="sttc-card">
      <div class="sttc-card-title">Excel 导入</div>
      <p class="sttc-tip">
        先「下载模板」，按「填写说明」填好「课程表模板」工作表后导入。系统会先校验，校验通过才会写入；
        同一「星期 + 节次」的已有课程默认被覆盖。
      </p>
      <p class="sttc-tip">
        当前设置：每日 {{ store.data.periodsPerDay }} 节 · 共 {{ store.data.weeks }} 周。节次超出该设置的行会导入失败。
      </p>

      <input
        ref="fileInput"
        type="file"
        accept=".xlsx,.xls"
        class="sttc-file"
        data-testid="sttc-file-input"
        @change="onFileChange"
      />

      <div v-if="result" class="sttc-result" data-testid="sttc-result">
        <div class="sttc-result-head">
          <span class="sttc-result-file">{{ fileName }}</span>
          <span class="sttc-result-summary">{{ importSummaryText(result) }}</span>
        </div>
        <div class="sttc-stat-row">
          <span class="sttc-stat">共 {{ result.total }} 行</span>
          <span class="sttc-stat is-ok">成功 {{ result.success }}</span>
          <span class="sttc-stat is-new">新增 {{ result.created }}</span>
          <span class="sttc-stat is-upd">覆盖 {{ result.updated }}</span>
          <span class="sttc-stat" :class="{ 'is-err': result.failed > 0 }">失败 {{ result.failed }}</span>
        </div>

        <div v-if="result.errors.length" class="sttc-errors">
          <div class="sttc-errors-head">
            <span>失败明细（Excel 行号 / 原因）</span>
            <el-button size="small" @click="downloadErrors">
              <Icon name="download" :size="14" /> 下载错误明细
            </el-button>
          </div>
          <div class="sttc-errors-list">
            <div v-for="(err, i) in result.errors.slice(0, 20)" :key="i" class="sttc-error-item">
              <span class="sttc-error-row">第 {{ err.row }} 行</span>
              <span class="sttc-error-subject">{{ err.subject || '（空）' }}</span>
              <span class="sttc-error-reason">{{ err.reason }}</span>
            </div>
            <div v-if="result.errors.length > 20" class="sttc-error-more">
              仅显示前 20 条，完整明细请下载查看
            </div>
          </div>
        </div>

        <div class="sttc-actions">
          <el-button @click="result = null">取消</el-button>
          <el-button
            v-if="result.success"
            type="primary"
            :loading="importing"
            data-testid="sttc-confirm-import"
            @click="confirmImport"
          >
            确认导入 {{ result.success }} 条
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sttc-shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  min-height: 0;
  overflow: visible;
}
/* 嵌入设置弹窗：由外层容器负责内边距与滚动，自身不再撑满高度 */
.sttc-shell.is-embedded {
  padding: 0;
  overflow: visible;
}
.sttc-embed-actions {
  margin-bottom: 4px;
}
.sttc-card {
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 14px 16px;
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}
.sttc-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, #4b5563);
  border-left: 3px solid var(--color-primary, #3b82f6);
  padding-left: 8px;
  margin-bottom: 12px;
}
.sttc-sub-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary, #4b5563);
  border-left: 3px solid var(--color-primary, #3b82f6);
  padding-left: 8px;
  margin: 4px 0;
}
.sttc-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #4b5563);
}
.form-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.form-row .form-field {
  flex: 1;
  min-width: 150px;
}
.sttc-preview {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  background: var(--color-hover, #f3f4f6);
  border-radius: 6px;
  padding: 8px 10px;
}
.sttc-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.sttc-tip {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  margin: 0 0 8px;
  line-height: 1.6;
}
/* 隐藏原生 file input，由工具栏按钮触发（避免默认控件样式与面板不一致） */
.sttc-file {
  display: none;
}

/* ===== 导入结果 ===== */
.sttc-result {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 12px;
  background: var(--color-bg, #f9fafb);
}
.sttc-result-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  margin-bottom: 8px;
}
.sttc-result-file {
  color: var(--color-text-muted, #6b7280);
  word-break: break-all;
}
.sttc-result-summary {
  font-weight: 600;
  color: var(--color-text, #1f2937);
}
.sttc-stat-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
  margin-bottom: 10px;
}
.sttc-stat {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-hover, #f3f4f6);
  color: var(--color-text-secondary, #4b5563);
}
.sttc-stat.is-ok { background: rgba(16, 185, 129, 0.14); color: #059669; }
.sttc-stat.is-new { background: rgba(59, 130, 246, 0.14); color: #2563eb; }
.sttc-stat.is-upd { background: rgba(245, 158, 11, 0.16); color: #b45309; }
.sttc-stat.is-err { background: rgba(239, 68, 68, 0.14); color: #dc2626; }

.sttc-errors {
  margin-bottom: 10px;
}
.sttc-errors-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}
.sttc-errors-list {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: var(--color-bg-card, #fff);
}
.sttc-error-item {
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  border-bottom: 1px solid var(--color-border, #f3f4f6);
}
.sttc-error-item:last-child { border-bottom: none; }
.sttc-error-row {
  flex: 0 0 auto;
  font-weight: 600;
  color: #dc2626;
}
.sttc-error-subject {
  flex: 0 0 auto;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text, #1f2937);
}
.sttc-error-reason {
  flex: 1;
  min-width: 0;
  color: var(--color-text-muted, #6b7280);
}
.sttc-error-more {
  padding: 6px 10px;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

@media (max-width: 768px) {
  .sttc-shell { padding: 12px; }
  .sttc-actions { justify-content: stretch; }
  .sttc-actions > * { flex: 1; }
}
</style>
