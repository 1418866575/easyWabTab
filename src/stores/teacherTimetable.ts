// 教师工作台课程表 store（薄封装，数据仍落在 teacher_workbench 单对象的 ClassBucket.timetable）。
// 复用 studentTimetableCore 纯逻辑（归一化 / cell 增删改 / 时间推算），不重复造轮子。
// 与独立 IDB 的学生课程表不同：教师课程表按「班级」隔离，读写都经 useTeacherStore.updateTimetable，
// 切换班级 / 数据管理导入改写时通过 watch 自动重载本地 data。

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
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
import type { StudentTimetableCell, StudentTimetableData, StudentTimetableTiming } from '@/types'
import { useTeacherStore } from '@/stores/teacher'

export type TeacherTimetableOpError = 'empty' | 'invalid-time' | 'not-found'
export type TeacherTimetableOp = { ok: boolean; reason?: TeacherTimetableOpError }

export const useTeacherTimetableStore = defineStore('teacherTimetable', () => {
  const teacherStore = useTeacherStore()
  const data = ref<StudentTimetableData>(emptyTimetableData())

  /** 从当前班级桶同步本地 data（归一化兜底；非法/缺失回落默认） */
  function syncFromBucket(): void {
    const t = teacherStore.bucket?.timetable
    data.value = normalizeTimetableData(t)
  }

  async function loadTimetable(): Promise<void> {
    syncFromBucket()
  }

  /** 写回教师 store（整体替换当前班级的课程表并持久化） */
  async function persist(): Promise<void> {
    await teacherStore.updateTimetable(data.value)
  }

  // 切换班级 / 外部（数据管理导入）改写课程表时，自动同步本地 data。
  // 自身 mutation 后 persist 写入的仍是 data.value 同一引用，故不会触发重复重载（t !== data.value 才重载）。
  watch(
    () => teacherStore.bucket?.timetable,
    (t) => {
      if (t && t !== data.value) syncFromBucket()
    }
  )

  /** 设置/更新某节课：校验时间范围 → 写入 → 持久化 */
  async function setCell(day: number, period: number, cell: StudentTimetableCell): Promise<TeacherTimetableOp> {
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
    await persist()
    return { ok: true }
  }

  /** 清除某节课 */
  async function clearCell(day: number, period: number): Promise<TeacherTimetableOp> {
    const existing = getCellCore(data.value.schedule, day, period)
    if (!existing) return { ok: false, reason: 'not-found' }
    data.value = { ...data.value, schedule: clearCellCore(data.value.schedule, day, period) }
    await persist()
    return { ok: true }
  }

  /** 更新配置（学周数、每日节数）；节数变化时超出范围的 cell 自动保留但不渲染 */
  async function updateConfig(weeks: number, periodsPerDay: number, classroom?: string): Promise<void> {
    const w = Math.max(1, Math.min(52, Math.floor(weeks) || 1))
    const p = Math.max(1, Math.min(12, Math.floor(periodsPerDay) || 1))
    data.value = { ...data.value, weeks: w, periodsPerDay: p, classroom: classroom?.trim() || data.value.classroom }
    await persist()
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
    await persist()
  }

  /**
   * 新增/更新某节课：起止时间由节次配置自动推算（不再逐节手工填写），
   * 保证 cell.startHHMM/endHHMM 与当前配置一致。
   */
  async function setCellAuto(
    day: number,
    period: number,
    meta: { subject: string; teacher?: string; room?: string }
  ): Promise<TeacherTimetableOp> {
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
    await persist()
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
    await persist()
    return n
  }

  return {
    data,
    loadTimetable,
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
