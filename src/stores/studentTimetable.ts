// 学生工作台课程表 store（数据存 IndexedDB store 'student_timetable' 单对象）
// 薄委托 studentTimetableCore：归一化/cell 增删改/时间校验均为纯函数，store 禁止内联重算。
// 严格隔离成人数据。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  emptyTimetableData,
  normalizeTimetableData,
  setCell as setCellCore,
  clearCell as clearCellCore,
  getCell as getCellCore,
  isValidTimeRange,
  computePeriodTime,
  normalizeTiming,
  applyTimingToSchedule,
  parseCellKey
} from '@/composables/studentTimetableCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'
import type { StudentTimetableCell, StudentTimetableData, StudentTimetableTiming } from '@/types'

export type StudentTimetableOpError = 'empty' | 'invalid-time' | 'not-found'
export type StudentTimetableOp = { ok: boolean; reason?: StudentTimetableOpError }

export const useStudentTimetableStore = defineStore('studentTimetable', () => {
  const data = ref<StudentTimetableData>(emptyTimetableData())

  async function loadTimetable(): Promise<void> {
    try {
      data.value = normalizeTimetableData(await idbGet<StudentTimetableData>('student_timetable'))
    } catch (e) {
      console.error('[studentTimetable] load failed', e)
      data.value = emptyTimetableData()
    }
  }

  async function saveTimetable(): Promise<void> {
    try {
      await idbPut('student_timetable', JSON.parse(JSON.stringify(data.value)))
      markDirty()
    } catch (e) {
      console.error('[studentTimetable] save failed', e)
    }
  }

  /** 设置/更新某节课：校验时间范围 → 写入 → 持久化 */
  async function setCell(day: number, period: number, cell: StudentTimetableCell): Promise<StudentTimetableOp> {
    if (!cell.subject.trim()) return { ok: false, reason: 'empty' }
    if (!isValidTimeRange(cell.startHHMM, cell.endHHMM)) return { ok: false, reason: 'invalid-time' }
    data.value = {
      ...data.value,
      schedule: setCellCore(data.value.schedule, day, period, {
        subject: cell.subject.trim(),
        startHHMM: cell.startHHMM,
        endHHMM: cell.endHHMM,
        teacher: cell.teacher?.trim() || undefined,
        room: cell.room?.trim() || undefined
      })
    }
    await saveTimetable()
    return { ok: true }
  }

  /** 清除某节课 */
  async function clearCell(day: number, period: number): Promise<StudentTimetableOp> {
    const existing = getCellCore(data.value.schedule, day, period)
    if (!existing) return { ok: false, reason: 'not-found' }
    data.value = { ...data.value, schedule: clearCellCore(data.value.schedule, day, period) }
    await saveTimetable()
    return { ok: true }
  }

  /** 更新配置（学周数、每日节数）；节数变化时超出范围的 cell 自动保留但不渲染 */
  async function updateConfig(weeks: number, periodsPerDay: number, classroom?: string): Promise<void> {
    const w = Math.max(1, Math.min(52, Math.floor(weeks) || 1))
    const p = Math.max(1, Math.min(12, Math.floor(periodsPerDay) || 1))
    data.value = { ...data.value, weeks: w, periodsPerDay: p, classroom: classroom?.trim() || data.value.classroom }
    await saveTimetable()
  }

  /**
   * 更新节次时间配置（上午第一节开始 / 下午第一节开始 / 单节时长 / 课间休息 / 上午节数）。
   * 保存时按新配置重算全部 cell 的起止时间，保证展示与存储始终自洽。
   */
  async function updateTiming(timing: Partial<StudentTimetableTiming>): Promise<void> {
    const t = normalizeTiming(timing)
    data.value = {
      ...data.value,
      timing: t,
      schedule: applyTimingToSchedule(data.value.schedule, t)
    }
    await saveTimetable()
  }

  /**
   * 新增/更新某节课：起止时间由节次配置自动推算（不再逐节手工填写），
   * 保证 cell.startHHMM/endHHMM 与当前配置一致。
   */
  async function setCellAuto(
    day: number,
    period: number,
    meta: { subject: string; teacher?: string; room?: string }
  ): Promise<StudentTimetableOp> {
    const t = normalizeTiming(data.value.timing)
    return setCell(day, period, {
      subject: meta.subject,
      teacher: meta.teacher,
      room: meta.room,
      ...computePeriodTime(period, t)
    })
  }

  /** 清空全部课程 */
  async function clearAll(): Promise<void> {
    data.value = { ...data.value, schedule: {} }
    await saveTimetable()
  }

  /** 只读：获取某节课 */
  function getCell(day: number, period: number): StudentTimetableCell | undefined {
    return getCellCore(data.value.schedule, day, period)
  }

  /**
   * 批量导入课程（Excel 导入）：cells 的 key 为 `${day}_${period}`，同 key 覆盖已有课程。
   * 入参应为 studentTimetableImportCore.validateImportRows 校验通过的 cells。
   * @returns 实际写入条数
   */
  async function importCells(cells: Record<string, StudentTimetableCell>): Promise<number> {
    const keys = Object.keys(cells ?? {})
    if (!keys.length) return 0
    const schedule = { ...data.value.schedule }
    let n = 0
    for (const key of keys) {
      const parsed = parseCellKey(key)
      const cell = cells[key]
      if (!parsed || !cell || !cell.subject.trim()) continue
      if (!isValidTimeRange(cell.startHHMM, cell.endHHMM)) continue
      schedule[key] = { ...cell, subject: cell.subject.trim() }
      n++
    }
    if (!n) return 0
    data.value = { ...data.value, schedule }
    await saveTimetable()
    return n
  }

  return {
    data,
    loadTimetable,
    saveTimetable,
    setCell,
    setCellAuto,
    clearCell,
    updateConfig,
    updateTiming,
    clearAll,
    importCells,
    getCell
  }
})
