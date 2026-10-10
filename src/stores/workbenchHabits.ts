import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import type { Habit, HabitFrequency, HabitImage, HabitRecord, HabitsData, StreakResult, WeeklyAttainment } from '@/composables/habitCore'
import {
  HABIT_ID_PREFIX,
  HABIT_RECORD_ID_PREFIX,
  emptyHabitsData,
  isDateStr,
  normalizeHabitImages,
  normalizeHabitsData,
  streakOf as streakOfCore,
  weekCompletions,
  weeklyAttainment
} from '@/composables/habitCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'

// 习惯 CRUD 操作错误语义：empty 空名 / duplicate 重名 / not-found 不存在 / invalid 入参非法。
export type HabitOpError = 'empty' | 'duplicate' | 'not-found' | 'invalid'
/** 习惯/打卡操作统一返回结构（ok:true 无 reason；ok:false 时 reason 语义精确，仿 todo 分类 CRUD 惯例）。 */
export type HabitOp = { ok: boolean; reason?: HabitOpError }

// 工作台习惯打卡 store（数据存 IndexedDB store 'habits'：双数组 habits + records，经 habitCore 归一化后读写）
export const useWorkbenchHabitsStore = defineStore('workbenchHabits', () => {
  const habits = ref<Habit[]>([])
  const records = ref<HabitRecord[]>([])

  async function loadHabits(): Promise<void> {
    try {
      // 存量脏数据（坏习惯/孤儿记录/同日重复打卡等）经 normalizeHabitsData 幂等归一
      const norm = normalizeHabitsData(await idbGet<HabitsData>('habits'))
      habits.value = norm.habits
      records.value = norm.records
    } catch (e) {
      console.error('[Habits] load failed', e)
      const empty = emptyHabitsData()
      habits.value = empty.habits
      records.value = empty.records
    }
  }

  async function saveHabits(): Promise<void> {
    try {
      // toRaw：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）。
      // toRaw 只解开最外层代理，故对每个 reactive 数组分别 toRaw 后再放入普通对象——
      // 对 { ... } 字面量整体 toRaw 无效（字面量本身非响应式，嵌套 Proxy 不会被解开）。
      await idbPut('habits', { habits: toRaw(habits.value), records: toRaw(records.value) })
      markDirty()
    } catch (e) {
      console.error('[Habits] save failed', e)
    }
  }

  /**
   * 新增习惯：name trim 后非空、与现有习惯（大小写不敏感）唯一 → 才写入；id 前缀 hb_。
   * imageEnabled 默认 false（保持原有打卡行为），仅显式传入 true 时开启按天图片详情。
   */
  async function addHabit(
    name: string,
    frequency: HabitFrequency,
    color?: string,
    imageEnabled = false
  ): Promise<HabitOp> {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    if (habits.value.some(h => h.name.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, reason: 'duplicate' }
    }
    habits.value.push({
      id: `${HABIT_ID_PREFIX}${Date.now()}`,
      name: trimmed,
      frequency,
      color,
      createdAt: new Date().toISOString(),
      ...(imageEnabled ? { imageEnabled: true } : {})
    })
    await saveHabits()
    return { ok: true }
  }

  /** 改名/改频次/改颜色/改图片开关：name 唯一校验排除自身；失败（未找到/空名/重名）返回对应 reason，不写入。 */
  async function updateHabit(
    id: string,
    patch: Partial<Pick<Habit, 'name' | 'frequency' | 'color' | 'imageEnabled'>>
  ): Promise<HabitOp> {
    const index = habits.value.findIndex(h => h.id === id)
    if (index === -1) return { ok: false, reason: 'not-found' }
    const changes: Partial<Habit> = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) return { ok: false, reason: 'empty' }
      if (habits.value.some(h => h.id !== id && h.name.toLowerCase() === name.toLowerCase())) {
        return { ok: false, reason: 'duplicate' }
      }
      changes.name = name
    }
    if (patch.frequency !== undefined) changes.frequency = patch.frequency
    if (patch.color !== undefined) changes.color = patch.color
    if (patch.imageEnabled !== undefined) changes.imageEnabled = patch.imageEnabled
    const next: Habit = { ...habits.value[index], ...changes }
    // 与 normalizeHabit 口径一致：关闭时不落字段，避免库里出现一堆 imageEnabled:false
    if (!next.imageEnabled) delete next.imageEnabled
    habits.value[index] = next
    await saveHabits()
    return { ok: true }
  }

  /** 删除习惯：同时清理该习惯的全部打卡记录（在 toRaw 原始数组上 filter，防 DataCloneError）。 */
  async function deleteHabit(id: string): Promise<HabitOp> {
    if (!habits.value.some(h => h.id === id)) return { ok: false, reason: 'not-found' }
    // 从 toRaw 的原始数组 filter：在 reactive 代理上直接 filter 会得到 Proxy 元素，
    // toRaw 只解开一层数组，残留的 Proxy 元素会让 IDB 结构化克隆抛 DataCloneError
    habits.value = toRaw(habits.value).filter(h => h.id !== id)
    records.value = toRaw(records.value).filter(r => r.habitId !== id)
    await saveHabits()
    return { ok: true }
  }

  /** 打卡/取消打卡：同一天已打卡 → 移除（取消），未打卡 → 追加（id 前缀 hr_）；幂等。 */
  async function toggleCheckIn(habitId: string, date: string): Promise<HabitOp> {
    if (!habits.value.some(h => h.id === habitId)) return { ok: false, reason: 'not-found' }
    const existing = records.value.find(r => r.habitId === habitId && r.date === date)
    if (existing) {
      records.value = toRaw(records.value).filter(r => r.id !== existing.id)
    } else {
      records.value.push({
        id: `${HABIT_RECORD_ID_PREFIX}${Date.now()}`,
        habitId,
        date,
        createdAt: new Date().toISOString()
      })
    }
    await saveHabits()
    return { ok: true }
  }

  /**
   * 某天详情统一保存入口（加减打卡 + 图片一次写库，避免两次 saveHabits 造成 dirty 抖动）：
   * - checked=false → 删除该天记录（连同图片）；本就无记录也返回 ok（幂等）
   * - checked=true  → 已打卡则只替换 images；未打卡则创建记录（「补打卡」语义）并写入图片
   * images 在此处统一走 normalizeHabitImages（剔除非法 dataURL + 截断到上限），UI 无需自行校验。
   */
  async function saveRecordDetail(
    habitId: string,
    date: string,
    images: HabitImage[],
    checked: boolean
  ): Promise<HabitOp> {
    if (!habits.value.some(h => h.id === habitId)) return { ok: false, reason: 'not-found' }
    if (!isDateStr(date)) return { ok: false, reason: 'invalid' }
    // toRaw 解开数组层后再对每个元素解一层：直接展开 Proxy 元素会让 IDB 结构化克隆抛 DataCloneError
    const raw = toRaw(records.value).map<HabitRecord>(r => toRaw(r))
    const index = raw.findIndex(r => r.habitId === habitId && r.date === date)

    if (!checked) {
      records.value = index === -1 ? raw : raw.filter(r => !(r.habitId === habitId && r.date === date))
      await saveHabits()
      return { ok: true }
    }

    const clean = normalizeHabitImages(images)
    const withImages = clean.length > 0 ? { images: clean } : {}
    if (index === -1) {
      raw.push({
        id: `${HABIT_RECORD_ID_PREFIX}${Date.now()}`,
        habitId,
        date,
        createdAt: new Date().toISOString(),
        ...withImages
      })
    } else {
      raw[index] = { ...raw[index], ...withImages }
    }
    records.value = raw
    await saveHabits()
    return { ok: true }
  }

  // ---- 周视图/连续天数：只读薄委托 habitCore（公式属 core，store 禁止内联重算）----

  /** 本周完成打卡日期列表（周一起点，去重升序）。 */
  function weekCompletionsOf(habitId: string, date: string): string[] {
    return weekCompletions(records.value, habitId, date)
  }

  /** 连续达成（按频率语义：每日=连续天，每周=连续达标周）。 */
  function streakOf(habitId: string, frequency: HabitFrequency, today: string): StreakResult {
    return streakOfCore(records.value, habitId, frequency, today)
  }

  /** 周达成率（completed=本周打卡天数，target=频率目标，percent 不截断）。 */
  function weeklyAttainmentOf(habitId: string, frequency: HabitFrequency, date: string): WeeklyAttainment {
    return weeklyAttainment(records.value, habitId, frequency, date)
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
    saveRecordDetail,
    weekCompletionsOf,
    streakOf,
    weeklyAttainmentOf
  }
})
