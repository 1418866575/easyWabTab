// 学生工作台学习目标纯逻辑模块。
// 归一化（幂等，兼容裸数组）+ 类型筛选 + 状态派生 + 进度计算 + 排序 + 统计 + 校验。
// 零 vue/pinia 运行时依赖，纯函数。

import type {
  StudentGoal,
  StudentGoalData,
  StudentGoalType,
  StudentGoalStatus
} from '@/types'

/** 目标 id 前缀 */
export const GOAL_ID_PREFIX = 'gl_'

const KNOWN_GOAL_TYPES: readonly StudentGoalType[] = ['score', 'count', 'days', 'custom']

function genId(prefix: string): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDateStr(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v)
}

function clampNum(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return 0
  return Math.min(max, Math.max(min, Math.floor(n)))
}

export function emptyGoalData(): StudentGoalData {
  return { entries: [] }
}

/** 归一化单个目标：name 必填；subject/unit/note 兜底；数值钳 0-…；status 仅取合法值 */
export function normalizeGoal(raw: unknown): StudentGoal | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Record<string, unknown>
  const name = typeof g.name === 'string' ? g.name.trim() : ''
  if (!name) return null
  const type: StudentGoalType =
    typeof g.goalType === 'string' && (KNOWN_GOAL_TYPES as readonly string[]).includes(g.goalType)
      ? (g.goalType as StudentGoalType)
      : 'score'
  const status: StudentGoalStatus =
    g.status === 'completed' || g.status === 'abandoned' ? g.status : 'active'
  const now = isoNow()
  const out: StudentGoal = {
    id: typeof g.id === 'string' && g.id !== '' ? g.id : genId(GOAL_ID_PREFIX),
    name: Array.from(name).slice(0, 50).join(''),
    subject: typeof g.subject === 'string' && g.subject.trim() ? g.subject.trim().slice(0, 20) : '其他',
    goalType: type,
    targetValue: clampNum(g.targetValue, 0, 1_000_000),
    currentValue: clampNum(g.currentValue, 0, 1_000_000),
    unit: typeof g.unit === 'string' ? g.unit.trim().slice(0, 10) : '',
    status,
    createdAt: typeof g.createdAt === 'string' ? g.createdAt : now,
    updatedAt: typeof g.updatedAt === 'string' ? g.updatedAt : now
  }
  if (isDateStr(g.deadline)) out.deadline = g.deadline
  if (typeof g.note === 'string' && g.note.trim()) out.note = g.note.trim().slice(0, 200)
  return out
}

/** 归一化目标数据（幂等；兼容裸数组） */
export function normalizeGoalData(raw: unknown): StudentGoalData {
  if (!raw || typeof raw !== 'object') return emptyGoalData()
  const src = raw as Record<string, unknown>
  if (Array.isArray(src.entries)) {
    return { entries: src.entries.map(normalizeGoal).filter((g): g is StudentGoal => g !== null) }
  }
  if (Array.isArray(raw)) {
    return {
      entries: (raw as unknown[]).map(normalizeGoal).filter((g): g is StudentGoal => g !== null)
    }
  }
  return emptyGoalData()
}

/**
 * 派生状态（渲染用，不入库）：
 * - 已手动置 completed / abandoned → 原样返回
 * - 当前值 >= 目标值（目标值>0）→ completed
 * - 截止日期 < 今日 → overdue（仅展示提醒，不写库）
 * - 其余 → active
 */
export function deriveGoalStatus(goal: StudentGoal, today: string): 'active' | 'completed' | 'abandoned' | 'overdue' {
  if (goal.status === 'completed' || goal.status === 'abandoned') return goal.status
  if (goal.targetValue > 0 && goal.currentValue >= goal.targetValue) return 'completed'
  if (goal.deadline && goal.deadline < today) return 'overdue'
  return 'active'
}

/** 进度百分比（0-100 整数；目标值<=0 回退 0） */
export function calcGoalProgress(goal: StudentGoal): number {
  if (goal.targetValue <= 0) return 0
  return Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
}

export interface GoalStats {
  total: number
  active: number
  completed: number
  /** 已逾期（未放弃/未完成且截止<今日） */
  overdue: number
}

/** 统计（today 为 'YYYY-MM-DD'） */
export function calcGoalStats(entries: StudentGoal[], today: string): GoalStats {
  const total = entries.length
  if (total === 0) return { total: 0, active: 0, completed: 0, overdue: 0 }
  let completed = 0
  let overdue = 0
  let active = 0
  for (const g of entries) {
    const st = deriveGoalStatus(g, today)
    if (st === 'completed') completed++
    else if (st === 'overdue') overdue++
    else if (st === 'active') active++
  }
  return { total, active, completed, overdue }
}

/** 排序：updatedAt 降序 → createdAt 降序（不改入参） */
export function sortGoals(entries: StudentGoal[]): StudentGoal[] {
  return [...entries].sort((a, b) => {
    const d = b.updatedAt.localeCompare(a.updatedAt)
    if (d !== 0) return d
    return b.createdAt.localeCompare(a.createdAt)
  })
}

/** 按学科筛选 */
export function filterBySubject(entries: StudentGoal[], subject: string | 'all'): StudentGoal[] {
  if (subject === 'all') return [...entries]
  return entries.filter(g => g.subject === subject)
}

/** 按状态筛选（含派生 overdue；'all' 返回全部） */
export function filterByStatus(
  entries: StudentGoal[],
  status: 'all' | StudentGoalStatus | 'overdue',
  today: string
): StudentGoal[] {
  if (status === 'all') return [...entries]
  return entries.filter(g => deriveGoalStatus(g, today) === status)
}

/** 校验新增/编辑输入：返回 null 表示通过，否则错误语义 */
export type GoalValidationError = 'empty' | 'invalid-number' | 'deadline-past'
export function validateGoalInput(input: {
  name: string
  targetValue: number
  currentValue: number
  deadline?: string
  today?: string
}): GoalValidationError | null {
  if (!input.name.trim()) return 'empty'
  if (!(input.targetValue >= 0) || !(input.currentValue >= 0)) return 'invalid-number'
  if (input.deadline && input.today && input.deadline < input.today) return 'deadline-past'
  return null
}

export interface NewGoalInput {
  name: string
  subject: string
  goalType: StudentGoalType
  targetValue: number
  currentValue: number
  unit: string
  deadline?: string
  note?: string
}

/** 构造新目标对象（薄委托 store 用） */
export function makeGoal(input: NewGoalInput, today: string): StudentGoal {
  const now = isoNow()
  const goal: StudentGoal = {
    id: genId(GOAL_ID_PREFIX),
    name: Array.from(input.name.trim()).slice(0, 50).join(''),
    subject: input.subject?.trim() ? input.subject.trim().slice(0, 20) : '其他',
    goalType: input.goalType,
    targetValue: Math.min(1_000_000, Math.max(0, Math.floor(input.targetValue))),
    currentValue: Math.min(1_000_000, Math.max(0, Math.floor(input.currentValue))),
    unit: (input.unit ?? '').trim().slice(0, 10),
    status: 'active',
    createdAt: now,
    updatedAt: now
  }
  if (input.deadline) goal.deadline = input.deadline
  if (input.note && input.note.trim()) goal.note = input.note.trim().slice(0, 200)
  void today
  return goal
}
