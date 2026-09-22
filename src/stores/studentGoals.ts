// 学生工作台学习目标 store（数据存 IndexedDB store 'student_goals' 单对象 { entries }）
// 薄委托 studentGoalCore：归一化/筛选/排序/进度/状态/统计均为纯函数，store 禁止内联重算。
// 严格隔离成人数据（独立 IDB 名 + 独立前缀 gl_）。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  emptyGoalData,
  normalizeGoalData,
  sortGoals as sortGoalsCore,
  filterBySubject as filterBySubjectCore,
  filterByStatus as filterByStatusCore,
  calcGoalStats as calcGoalStatsCore,
  calcGoalProgress as calcGoalProgressCore,
  deriveGoalStatus as deriveGoalStatusCore,
  validateGoalInput as validateGoalInputCore,
  makeGoal as makeGoalCore
} from '@/composables/studentGoalCore'
import { localToday } from '@/composables/todoCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'
import type { StudentGoal, StudentGoalData, StudentGoalStatus, StudentGoalType } from '@/types'

const STORE_KEY = 'student_goals'

/** 目标操作错误语义 */
export type StudentGoalOpError = 'empty' | 'invalid-number' | 'deadline-past' | 'not-found'
export type StudentGoalOp = { ok: boolean; reason?: StudentGoalOpError }

function isoNow(): string {
  return new Date().toISOString()
}

export const useStudentGoalsStore = defineStore('studentGoals', () => {
  const entries = ref<StudentGoal[]>([])

  // ========================================
  // 持久化
  // ========================================

  async function loadGoals(): Promise<void> {
    try {
      const norm = normalizeGoalData(await idbGet<StudentGoalData>(STORE_KEY))
      entries.value = sortGoalsCore(norm.entries)
    } catch (e) {
      console.error('[studentGoals] load failed', e)
      entries.value = emptyGoalData().entries
    }
  }

  async function saveGoals(): Promise<void> {
    try {
      await idbPut(STORE_KEY, { entries: JSON.parse(JSON.stringify(entries.value)) })
      markDirty()
    } catch (e) {
      console.error('[studentGoals] save failed', e)
      console.warn('[studentGoals] save error:', e instanceof Error ? e.message : String(e))
    }
  }

  // ========================================
  // CRUD
  // ========================================

  async function addGoal(input: {
    name: string
    subject: string
    goalType: StudentGoalType
    targetValue: number
    currentValue: number
    unit: string
    deadline?: string
    note?: string
  }): Promise<StudentGoalOp> {
    const today = localToday()
    const err = validateGoalInputCore({
      name: input.name,
      targetValue: input.targetValue,
      currentValue: input.currentValue,
      deadline: input.deadline,
      today
    })
    if (err) return { ok: false, reason: err }
    const goal = makeGoalCore(input, today)
    entries.value.push(goal)
    entries.value = sortGoalsCore(entries.value)
    await saveGoals()
    return { ok: true }
  }

  async function updateGoal(
    id: string,
    patch: {
      name?: string
      subject?: string
      goalType?: StudentGoalType
      targetValue?: number
      currentValue?: number
      unit?: string
      deadline?: string
      note?: string
    }
  ): Promise<StudentGoalOp> {
    const idx = entries.value.findIndex(g => g.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const cur = entries.value[idx]
    const nextName = patch.name !== undefined ? patch.name.trim() : cur.name
    if (!nextName) return { ok: false, reason: 'empty' }
    const nextTarget = patch.targetValue !== undefined ? patch.targetValue : cur.targetValue
    const nextCurrent = patch.currentValue !== undefined ? patch.currentValue : cur.currentValue
    const today = localToday()
    const err = validateGoalInputCore({ name: nextName, targetValue: nextTarget, currentValue: nextCurrent, deadline: patch.deadline, today })
    if (err) return { ok: false, reason: err }
    const next: StudentGoal = {
      ...cur,
      name: Array.from(nextName).slice(0, 50).join(''),
      subject: (patch.subject !== undefined ? patch.subject : cur.subject).trim() ? (patch.subject ?? cur.subject).trim().slice(0, 20) : '其他',
      goalType: patch.goalType ?? cur.goalType,
      targetValue: Math.min(1_000_000, Math.max(0, Math.floor(nextTarget))),
      currentValue: Math.min(1_000_000, Math.max(0, Math.floor(nextCurrent))),
      unit: (patch.unit !== undefined ? patch.unit : cur.unit).trim().slice(0, 10),
      updatedAt: isoNow()
    }
    if (patch.deadline !== undefined) {
      if (patch.deadline) next.deadline = patch.deadline
      else delete next.deadline
    }
    if (patch.note !== undefined) {
      const note = patch.note.trim()
      if (note) next.note = note.slice(0, 200)
      else delete next.note
    }
    entries.value = [...entries.value.slice(0, idx), next, ...entries.value.slice(idx + 1)]
    entries.value = sortGoalsCore(entries.value)
    await saveGoals()
    return { ok: true }
  }

  async function deleteGoal(id: string): Promise<void> {
    entries.value = entries.value.filter(g => g.id !== id)
    await saveGoals()
  }

  // ========================================
  // 状态管理
  // ========================================

  /** 更新当前进度（任意值，封顶目标值即可；不直接写入 completed/abandoned 状态，由派生决定） */
  async function setProgress(id: string, value: number): Promise<StudentGoalOp> {
    const idx = entries.value.findIndex(g => g.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const cur = entries.value[idx]
    if (cur.status === 'abandoned') return { ok: false, reason: 'not-found' }
    const v = Math.min(1_000_000, Math.max(0, Math.floor(value)))
    const next: StudentGoal = { ...cur, currentValue: v, updatedAt: isoNow() }
    entries.value = [...entries.value.slice(0, idx), next, ...entries.value.slice(idx + 1)]
    entries.value = sortGoalsCore(entries.value)
    await saveGoals()
    return { ok: true }
  }

  /** 标记完成：状态置 completed，当前值对齐目标值 */
  async function completeGoal(id: string): Promise<StudentGoalOp> {
    const idx = entries.value.findIndex(g => g.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const cur = entries.value[idx]
    if (cur.status === 'abandoned') return { ok: false, reason: 'not-found' }
    const next: StudentGoal = {
      ...cur,
      status: 'completed',
      currentValue: cur.targetValue,
      updatedAt: isoNow()
    }
    entries.value = [...entries.value.slice(0, idx), next, ...entries.value.slice(idx + 1)]
    entries.value = sortGoalsCore(entries.value)
    await saveGoals()
    return { ok: true }
  }

  /** 标记放弃：状态置 abandoned（进度保留，可重新激活） */
  async function abandonGoal(id: string): Promise<StudentGoalOp> {
    const idx = entries.value.findIndex(g => g.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const cur = entries.value[idx]
    const next: StudentGoal = { ...cur, status: 'abandoned', updatedAt: isoNow() }
    entries.value = [...entries.value.slice(0, idx), next, ...entries.value.slice(idx + 1)]
    entries.value = sortGoalsCore(entries.value)
    await saveGoals()
    return { ok: true }
  }

  /** 重新激活（放弃/完成 → 进行中） */
  async function reactivate(id: string): Promise<StudentGoalOp> {
    const idx = entries.value.findIndex(g => g.id === id)
    if (idx === -1) return { ok: false, reason: 'not-found' }
    const cur = entries.value[idx]
    const next: StudentGoal = { ...cur, status: 'active', updatedAt: isoNow() }
    entries.value = [...entries.value.slice(0, idx), next, ...entries.value.slice(idx + 1)]
    entries.value = sortGoalsCore(entries.value)
    await saveGoals()
    return { ok: true }
  }

  // ========================================
  // 薄委托查询
  // ========================================

  function filterBySubject(subject: string | 'all'): StudentGoal[] {
    return filterBySubjectCore(entries.value, subject)
  }

  function filterByStatus(status: 'all' | StudentGoalStatus | 'overdue'): StudentGoal[] {
    return filterByStatusCore(entries.value, status, localToday())
  }

  function goalProgress(goal: StudentGoal): number {
    return calcGoalProgressCore(goal)
  }

  function goalStatus(goal: StudentGoal): 'active' | 'completed' | 'abandoned' | 'overdue' {
    return deriveGoalStatusCore(goal, localToday())
  }

  function stats() {
    return calcGoalStatsCore(entries.value, localToday())
  }

  return {
    entries,
    loadGoals,
    saveGoals,
    addGoal,
    updateGoal,
    deleteGoal,
    setProgress,
    completeGoal,
    abandonGoal,
    reactivate,
    filterBySubject,
    filterByStatus,
    goalProgress,
    goalStatus,
    stats
  }
})
