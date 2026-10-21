// 工作台待办纯逻辑模块：normalizeTodo 归一化 → filterTodos 查询 → dueInfo 截止倒计时主角。
// 运行时依赖仅 DEFAULT_TODO_COLOR / TODO_PRIORITIES（node --experimental-strip-types 可运行）；其余类型全部 type-only。
import { DEFAULT_TODO_COLOR } from '../types/index.ts'
import type { TodoPriority, TodoStatus, WorkbenchTodo } from '../types'

export const TODO_PRIORITIES: TodoPriority[] = ['high', 'medium', 'low']

/** 待办工作流状态枚举（顺序即筛选下拉与统计口径的顺序）；「已归档」由 archived 布尔承载，不在此列。 */
export const TODO_STATUSES: TodoStatus[] = ['pending', 'in_progress', 'completed']

/** 状态展示文案（列表状态列 / 筛选下拉 / 首页统计共用，避免多处漂移）。 */
export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  pending: '未完成',
  in_progress: '进行中',
  completed: '已完成'
}

/**
 * 取待办的工作流状态：存量数据没有 status 字段时按 completed 推导（未完成 → pending）。
 * 只读不改入参；涉及状态的判定统一走这里，保证新老数据口径一致。
 */
export function todoStatus(todo: Pick<WorkbenchTodo, 'status' | 'completed'>): TodoStatus {
  if (todo.status === 'pending' || todo.status === 'in_progress' || todo.status === 'completed') {
    return todo.status
  }
  return todo.completed ? 'completed' : 'pending'
}

/** 旧版内置分类名（存量迁移用）：work/life/study 已废弃，todos 与分类注册表均需清理。 */
export const LEGACY_BUILTIN_TODO_CATEGORIES: readonly string[] = ['work', 'life', 'study']

/** 清理分类注册表（customCategories/tabCategories）中残留的旧版内置分类名；返回新数组，不改入参，幂等。 */
export function purgeLegacyBuiltinCategories(list: string[]): string[] {
  const legacy = new Set<string>(LEGACY_BUILTIN_TODO_CATEGORIES)
  return list.filter(c => !legacy.has(c))
}

/** 存量内置分类迁移：work/life/study → undefined（未分类），其余 categoryId 原样保留；返回新数组，不改入参，幂等 */
export function migrateLegacyBuiltinCategories(todos: WorkbenchTodo[]): WorkbenchTodo[] {
  const legacy = new Set<string>(LEGACY_BUILTIN_TODO_CATEGORIES)
  return todos.map((t) =>
    typeof t.categoryId === 'string' && legacy.has(t.categoryId) ? { ...t, categoryId: undefined } : t
  )
}

/** 是否为未分类待办：categoryId 为 undefined/''/null → true（categoryId 仅 string 类型，falsy 判定即等价）。 */
export function isTodoUncategorized(todo: { categoryId?: string }): boolean {
  return !todo.categoryId
}

/** 缺省 id 兜底（沿用 store 的 td_ 前缀，追加随机段防批量碰撞）。 */
function genId(): string {
  return `td_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 卡片自定义颜色：'#RGB' 或 '#RRGGBB'（大小写均可）。 */
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** 将任意来源的待办数据归一化为规范 WorkbenchTodo（priority/completed/color 强制归一，字符串字段安全兜底）。 */
export function normalizeTodo(raw: Partial<WorkbenchTodo>): WorkbenchTodo {
  const priority: TodoPriority =
    typeof raw.priority === 'string' && (TODO_PRIORITIES as string[]).includes(raw.priority)
      ? (raw.priority as TodoPriority)
      : 'medium'
  const categoryId = typeof raw.categoryId === 'string' ? raw.categoryId.trim() : ''
  // 状态为唯一真值源、completed 为镜像：无 status（存量数据）时按 completed 推导，反之由 status 回写
  const status: TodoStatus = todoStatus({ status: raw.status, completed: raw.completed === true })
  const completed = status === 'completed'
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : genId(),
    title: typeof raw.title === 'string' ? raw.title : '',
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    priority,
    ...(typeof raw.dueDate === 'string' ? { dueDate: raw.dueDate } : {}),
    completed,
    status,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    color: typeof raw.color === 'string' && HEX_COLOR_RE.test(raw.color) ? raw.color : DEFAULT_TODO_COLOR,
    ...(categoryId ? { categoryId } : {}),
    ...(raw.checkedIn === true ? { checkedIn: true } : {}),
    ...(typeof raw.checkedInAt === 'string' ? { checkedInAt: raw.checkedInAt } : {}),
    ...(typeof raw.completedAt === 'string' ? { completedAt: raw.completedAt } : {}),
    // 归档只对已完成的条目有意义：未完成的一律不保留归档标记，避免脏数据把未完成项藏起来
    ...(raw.archived === true && completed ? { archived: true } : {})
  }
}

/** 已完成距今超过 N 天（默认 30）自动归档。 */
export const ARCHIVE_AFTER_DAYS = 30

/**
 * 是否应自动归档：仅对「已完成且未归档」的条目成立。
 * 判定基准 = completedAt ?? updatedAt（旧数据没有 completedAt，用最后更新时间兜底）。
 */
export function shouldArchive(
  todo: WorkbenchTodo,
  now: number = Date.now(),
  days: number = ARCHIVE_AFTER_DAYS
): boolean {
  if (!todo.completed || todo.archived === true) return false
  const base = typeof todo.completedAt === 'string' ? todo.completedAt : todo.updatedAt
  const ts = base ? Date.parse(base) : NaN
  if (!Number.isFinite(ts)) return false
  return now - ts > days * 24 * 60 * 60 * 1000
}

/**
 * 批量自动归档：把符合 shouldArchive 的条目补上 archived=true，其余保持原引用。
 * 返回新数组（不 mutate 入参）；changed 为本次被归档的条目，便于 UI 提示条数。
 */
export function autoArchiveTodos<T extends WorkbenchTodo>(
  items: T[],
  now: number = Date.now(),
  days: number = ARCHIVE_AFTER_DAYS
): { items: T[]; changed: T[] } {
  const changed: T[] = []
  const next = items.map((t) => {
    if (!shouldArchive(t, now, days)) return t
    const archived = { ...t, archived: true } as T
    changed.push(archived)
    return archived
  })
  return { items: next, changed }
}

/**
 * 展示排序：未完成 → 已完成（未归档）→ 已归档，段内严格保持手工顺序。
 * 稳定排序（Array.prototype.sort 在现代引擎稳定），用于替换原先「数组顺序即展示顺序」。
 */
export function sortTodosByStatus<T extends WorkbenchTodo>(items: T[]): T[] {
  const statusRank: Record<TodoStatus, number> = { pending: 0, in_progress: 1, completed: 2 }
  // 未完成 → 进行中 → 已完成 → 已归档；段内保持手工顺序
  const rank = (t: WorkbenchTodo): number => (t.archived === true ? 3 : statusRank[todoStatus(t)])
  return [...items].sort((a, b) => rank(a) - rank(b))
}

/**
 * 状态筛选项：'' / 'all' = 不限；'active' = 未完成总览（未完成 + 进行中）；
 * 'pending' / 'in_progress' / 'completed' = 精确工作流状态；'archived' = 已归档。
 */
export type TodoStatusFilter = '' | 'all' | 'active' | TodoStatus | 'archived'

/** 查询筛选条件：标题模糊匹配标题 / 描述模糊匹配描述 / 两者同时非空为 AND / priority 精确 / status 状态；空串或 undefined 表示不限制。 */
export interface TodoFilterCriteria {
  title?: string
  description?: string
  priority?: '' | TodoPriority
  status?: TodoStatusFilter
  /** 分类筛选：undefined/'' = 全部不过滤；'uncategorized' 字面量 = 未分类；其他 = 分类名精确匹配。 */
  categoryId?: string
}

/** 按条件过滤待办（纯函数，供查询栏复用；空条件返回全部）。保留原条目类型（WorkbenchTodo 及其扩展）。 */
export function filterTodos<T extends WorkbenchTodo>(items: T[], criteria: TodoFilterCriteria = {}): T[] {
  const title = (criteria.title ?? '').trim().toLowerCase()
  const description = (criteria.description ?? '').trim().toLowerCase()
  const priority = criteria.priority || undefined
  const status = criteria.status || undefined
  const categoryId = criteria.categoryId || undefined
  return items.filter(todo => {
    if (title && !todo.title.toLowerCase().includes(title)) return false
    if (description && !(todo.description ?? '').toLowerCase().includes(description)) return false
    if (priority !== undefined && todo.priority !== priority) return false
    // 归档项独立成段：不出现在「未完成 / 进行中 / 已完成」里，只在「已归档」筛选下可见
    if (status === 'active' && (todoStatus(todo) === 'completed' || todo.archived === true)) return false
    if (status === 'completed' && (todoStatus(todo) !== 'completed' || todo.archived === true)) return false
    if (status === 'pending' || status === 'in_progress') {
      if (todo.archived === true || todoStatus(todo) !== status) return false
    }
    if (status === 'archived' && todo.archived !== true) return false
    if (categoryId !== undefined) {
      if (categoryId === 'uncategorized') {
        if (!isTodoUncategorized(todo)) return false
      } else if (todo.categoryId !== categoryId) {
        return false
      }
    }
    return true
  })
}

/** 截止倒计时主角文案与状态：未来 →「剩余 N 天」；今天 →「今天到期」；过去且未完成 →「已逾期 N 天」。 */
export interface DueInfo {
  label: string
  status: 'normal' | 'today' | 'overdue'
}

/** 今天 = 本地日期 YYYY-MM-DD（不能用 toISOString，那是 UTC，会偏一天）。 */
export function localToday(d?: Date): string {
  const base = d ?? new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`
}

/**
 * 计算截止倒计时主角。无 dueDate 或已完成 → null（已完成由卡片标题划线表达，不重复提示）。
 * 按天差值计算：dueDate 为 'YYYY-MM-DD'，与今天本地日期逐日相减。
 */
export function dueInfo(dueDate: string | undefined, completed: boolean, today?: Date): DueInfo | null {
  if (!dueDate || completed) return null
  const t = today ?? new Date()
  const todayStr = localToday(t)
  const diffMs = new Date(dueDate + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()
  if (isNaN(diffMs)) return null
  const days = Math.floor(diffMs / 86400000)
  if (days > 0) return { label: `剩余 ${days} 天`, status: 'normal' }
  if (days === 0) return { label: '今天到期', status: 'today' }
  return { label: `已逾期 ${-days} 天`, status: 'overdue' }
}

/**
 * 「逾期天数」：未完成且已过截止日期的天数（≥1，UI 以红色展示）。
 * 未逾期（含今天到期）/ 已完成 / 已归档 / 无截止日期 → null（UI 统一渲染「—」）。
 * 与 dueInfo 的「已逾期 N 天」同源同算法（天差值取反），两处口径必然一致。
 * 纯函数：today 可注入，便于测试固定「今天」。
 */
export function overdueDays(
  todo: Pick<WorkbenchTodo, 'dueDate' | 'status' | 'completed' | 'archived'>,
  today?: Date
): number | null {
  if (todo.archived === true) return null
  if (todoStatus(todo) === 'completed') return null
  if (!todo.dueDate) return null
  const t = today ?? new Date()
  const diffMs = new Date(todo.dueDate + 'T00:00:00').getTime() - new Date(localToday(t) + 'T00:00:00').getTime()
  if (isNaN(diffMs)) return null
  const days = Math.floor(diffMs / 86400000)
  return days < 0 ? -days : null
}

/**
 * 自定义分类排序：将 name 在 list 中上移/下移一格。
 * 返回新数组（不修改入参）；name 不存在或已在边界时返回与入参顺序相同的新数组。
 */
export function moveCustomCategoryInList(list: string[], name: string, dir: 'up' | 'down'): string[] {
  const idx = list.indexOf(name)
  if (idx === -1) return [...list]
  const target = dir === 'up' ? idx - 1 : idx + 1
  if (target < 0 || target >= list.length) return [...list]
  const next = [...list]
  const tmp = next[idx]
  next[idx] = next[target]
  next[target] = tmp
  return next
}

/**
 * 打卡（纯函数，不修改入参）：返回打完卡的新对象。
 * 已打卡（checkedIn === true）则原样返回同一引用，保证幂等。
 *
 * 只写 checkedIn / checkedInAt / updatedAt —— 绝不引入任何排序字段，
 * 顺序完全由数组本身承载，因此打卡前后列表顺序与各条目索引必然完全一致
 * （不置顶、不置底、不移到末尾、不改变相对顺序）。
 */
export function applyCheckIn(todo: WorkbenchTodo): WorkbenchTodo {
  if (todo.checkedIn === true) return todo
  const now = new Date().toISOString()
  return { ...todo, checkedIn: true, checkedInAt: now, updatedAt: now }
}
