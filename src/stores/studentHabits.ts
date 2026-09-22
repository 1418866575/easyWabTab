// 学生工作台习惯打卡 store（数据存 IndexedDB store 'student_habits'：双数组 habits + records）
// 复用成人 habitCore 连续天数/周达成率纯函数 + studentHabitsCore 扩展归一化与学段播种。
// 严格隔离成人 habits store（独立 IDB 名 + 独立前缀 shb_/shr_）。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  STUDENT_HABIT_ID_PREFIX,
  STUDENT_HABIT_RECORD_ID_PREFIX,
  emptyStudentHabitsData,
  normalizeStudentHabitsData,
  weekCompletionsOf,
  streakOf as streakOfCore,
  weeklyAttainmentOf,
  buildStageSeedHabits,
  mergeStageSeedHabits,
  filterHabitsByCategory,
  normalizeHabitPoints,
  DEFAULT_HABIT_POINTS
} from '@/composables/studentHabitsCore'
import type { HabitFrequency, StreakResult, WeeklyAttainment } from '@/composables/habitCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import type {
  StudentHabit,
  StudentHabitCategory,
  StudentHabitRecord,
  StudentHabitsData,
  StudentStage
} from '@/types'
import { useStudentRewardsStore } from '@/stores/studentRewards'
import { markDirty } from '@/composables/useCloudSync'

// 分类 CRUD 操作错误语义
export type StudentHabitOpError = 'empty' | 'duplicate' | 'not-found' | 'in-use'
export type StudentHabitOp = { ok: boolean; reason?: StudentHabitOpError }

export const useStudentHabitsStore = defineStore('studentHabits', () => {
  const habits = ref<StudentHabit[]>([])
  const records = ref<StudentHabitRecord[]>([])

  async function loadHabits(): Promise<void> {
    try {
      const norm = normalizeStudentHabitsData(await idbGet<StudentHabitsData>('student_habits'))
      habits.value = norm.habits
      records.value = norm.records
    } catch (e) {
      console.error('[studentHabits] load failed', e)
      const empty = emptyStudentHabitsData()
      habits.value = empty.habits
      records.value = empty.records
    }
  }

  async function saveHabits(): Promise<void> {
    try {
      //, ：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）
      await idbPut('student_habits', { habits: JSON.parse(JSON.stringify(habits.value)), records: JSON.parse(JSON.stringify(records.value)) })
      markDirty()
      // M2-M4 云同步 student-backup 信封留后续阶段接入
    } catch (e) {
      console.error('[studentHabits] save failed', e)
    }
  }

  /** 新增习惯：name trim 非空、同分类内唯一（大小写不敏感）→ 写入；id 前缀 shb_。 */
  async function addHabit(name: string, category: StudentHabitCategory, frequency: HabitFrequency, color?: string): Promise<StudentHabitOp> {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    if (habits.value.some(h => h.category === category && h.name.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, reason: 'duplicate' }
    }
    habits.value.push({
      id: `${STUDENT_HABIT_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      category: category.trim(),
      frequency,
      color,
      createdAt: new Date().toISOString()
    })
    await saveHabits()
    return { ok: true }
  }

  /** 改名/改分类/改频次/改颜色：name 唯一校验排除自身。 */
  async function updateHabit(
    id: string,
    patch: Partial<Pick<StudentHabit, 'name' | 'category' | 'frequency' | 'color'>>
  ): Promise<StudentHabitOp> {
    const index = habits.value.findIndex(h => h.id === id)
    if (index === -1) return { ok: false, reason: 'not-found' }
    const changes: Partial<StudentHabit> = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) return { ok: false, reason: 'empty' }
      const targetCategory = patch.category ?? habits.value[index].category
      if (habits.value.some(h => h.id !== id && h.category === targetCategory && h.name.toLowerCase() === name.toLowerCase())) {
        return { ok: false, reason: 'duplicate' }
      }
      changes.name = name
    }
    if (patch.category !== undefined) changes.category = patch.category.trim()
    if (patch.frequency !== undefined) changes.frequency = patch.frequency
    if (patch.color !== undefined) changes.color = patch.color
    habits.value[index] = { ...habits.value[index], ...changes }
    await saveHabits()
    return { ok: true }
  }

  /** 删除习惯：同时清理全部打卡记录，并撤销所有已加分记录的积分。 */
  async function deleteHabit(id: string): Promise<StudentHabitOp> {
    if (!habits.value.some(h => h.id === id)) return { ok: false, reason: 'not-found' }
    // 撤销该习惯所有打卡记录的加分
    const habitRecords = records.value.filter(r => r.habitId === id)
    if (habitRecords.length > 0) {
      try {
        const rewardsStore = useStudentRewardsStore()
        for (const r of habitRecords) {
          await rewardsStore.revokeFromHabit(id, r.date)
        }
      } catch (e) {
        console.warn('[studentHabits] revokeFromHabit (delete) failed', e)
      }
    }
    habits.value = habits.value.filter(h => h.id !== id)
    records.value = records.value.filter(r => r.habitId !== id)
    await saveHabits()
    return { ok: true }
  }

  /** 打卡/取消打卡：同一天已打卡 → 移除（取消），未打卡 → 追加（id 前缀 shr_）；幂等。
   *  打卡成功按「本次积分」联动加分（默认 POINTS_HABIT=5；0 分表示本次不加分），
   *  取消打卡时撤销该次积分（revokeFromHabit）。
   */
  async function toggleCheckIn(
    habitId: string,
    date: string,
    parentMarked = false,
    points?: number
  ): Promise<StudentHabitOp> {
    const habit = habits.value.find(h => h.id === habitId)
    if (!habit) return { ok: false, reason: 'not-found' }
    const existing = records.value.find(r => r.habitId === habitId && r.date === date)
    let shouldRevoke = false
    let earnPoints = 0
    if (existing) {
      records.value = records.value.filter(r => r.id !== existing.id)
      shouldRevoke = true
    } else {
      earnPoints = normalizeHabitPoints(points)
      records.value.push({
        id: `${STUDENT_HABIT_RECORD_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        habitId,
        date,
        parentMarked: parentMarked || undefined,
        points: earnPoints,
        createdAt: new Date().toISOString()
      })
    }
    await saveHabits()
    // 积分联动：在 save 后触发，失败仅记录日志不回滚
    const rewardsStore = useStudentRewardsStore()
    if (shouldRevoke) {
      try {
        await rewardsStore.revokeFromHabit(habitId, date)
      } catch (e) {
        console.warn('[studentHabits] revokeFromHabit failed', e)
      }
    } else if (earnPoints > 0) {
      try {
        await rewardsStore.earnFromHabit(habit.id, habit.name, date, earnPoints)
      } catch (e) {
        console.warn('[studentHabits] earnFromHabit failed', e)
      }
    }
    return { ok: true }
  }

  /** 新增打卡记录（可自定义本次积分）：同一习惯同一天已打卡 → duplicate。 */
  async function addRecord(input: {
    habitId: string
    date: string
    points?: number
    parentMarked?: boolean
  }): Promise<StudentHabitOp> {
    const habit = habits.value.find(h => h.id === input.habitId)
    if (!habit) return { ok: false, reason: 'not-found' }
    if (records.value.some(r => r.habitId === input.habitId && r.date === input.date)) {
      return { ok: false, reason: 'duplicate' }
    }
    const points = normalizeHabitPoints(input.points)
    records.value.push({
      id: `${STUDENT_HABIT_RECORD_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      habitId: input.habitId,
      date: input.date,
      parentMarked: input.parentMarked === true || undefined,
      points,
      createdAt: new Date().toISOString()
    })
    await saveHabits()
    if (points > 0) {
      try {
        const rewardsStore = useStudentRewardsStore()
        await rewardsStore.earnFromHabit(habit.id, habit.name, input.date, points)
      } catch (e) {
        console.warn('[studentHabits] earnFromHabit (addRecord) failed', e)
      }
    }
    return { ok: true }
  }

  /** 编辑打卡记录（改积分/改日期）：改积分后先撤销旧分再按新分重加（sourceId 幂等，不会重复加分）。 */
  async function updateRecord(
    id: string,
    patch: { points?: number; date?: string }
  ): Promise<StudentHabitOp> {
    const rec = records.value.find(r => r.id === id)
    if (!rec) return { ok: false, reason: 'not-found' }
    const nextPoints =
      patch.points === undefined
        ? (rec.points ?? DEFAULT_HABIT_POINTS)
        : normalizeHabitPoints(patch.points)
    rec.points = nextPoints
    if (patch.date !== undefined && patch.date !== rec.date) rec.date = patch.date
    await saveHabits()
    try {
      const rewardsStore = useStudentRewardsStore()
      await rewardsStore.revokeFromHabit(rec.habitId, rec.date)
      if (nextPoints > 0) {
        const habit = habits.value.find(h => h.id === rec.habitId)
        await rewardsStore.earnFromHabit(rec.habitId, habit?.name ?? '', rec.date, nextPoints)
      }
    } catch (e) {
      console.warn('[studentHabits] updateRecord points sync failed', e)
    }
    return { ok: true }
  }

  /** 删除打卡记录：移除记录并撤销该次积分。 */
  async function deleteRecord(id: string): Promise<StudentHabitOp> {
    const rec = records.value.find(r => r.id === id)
    if (!rec) return { ok: false, reason: 'not-found' }
    const habitId = rec.habitId
    const date = rec.date
    records.value = records.value.filter(r => r.id !== id)
    await saveHabits()
    try {
      const rewardsStore = useStudentRewardsStore()
      await rewardsStore.revokeFromHabit(habitId, date)
    } catch (e) {
      console.warn('[studentHabits] revokeFromHabit (deleteRecord) failed', e)
    }
    return { ok: true }
  }

  // ---- 只读薄委托 studentHabitsCore（公式属 core，store 禁止内联重算）----

  function weekCompletionsOfHabit(habitId: string, date: string): string[] {
    return weekCompletionsOf(records.value, habitId, date)
  }

  function streakOfHabit(habitId: string, frequency: HabitFrequency, today: string): StreakResult {
    return streakOfCore(records.value, habitId, frequency, today)
  }

  function weeklyAttainmentOfHabit(habitId: string, frequency: HabitFrequency, date: string): WeeklyAttainment {
    return weeklyAttainmentOf(records.value, habitId, frequency, date)
  }

  function filterByCategory(category: string): StudentHabit[] {
    return filterHabitsByCategory(habits.value, category)
  }

  /**
   * 学段默认习惯播种：首次进入或学段切换后调用。
   * 合并学段种子到现有习惯（不覆盖用户已新增的同名习惯），写入 stageHabitsSeeded。
   * 幂等：已播种该学段则跳过。
   */
  async function seedStageHabits(stage: StudentStage): Promise<void> {
    const seed = buildStageSeedHabits(stage)
    habits.value = mergeStageSeedHabits(habits.value, seed)
    await saveHabits()
  }

  return {
    habits,
    records,
    loadHabits,
    saveHabits,
    addHabit,
    updateHabit,
    deleteHabit,
    toggleCheckIn,
    addRecord,
    updateRecord,
    deleteRecord,
    weekCompletionsOfHabit,
    streakOfHabit,
    weeklyAttainmentOfHabit,
    filterByCategory,
    seedStageHabits
  }
})
