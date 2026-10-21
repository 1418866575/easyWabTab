import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { TodoPriority, TodoStatus, WorkbenchTodo } from '@/types'
import {
  normalizeTodo,
  moveCustomCategoryInList,
  migrateLegacyBuiltinCategories,
  purgeLegacyBuiltinCategories,
  applyCheckIn,
  autoArchiveTodos,
  sortTodosByStatus,
  todoStatus,
  localToday,
  ARCHIVE_AFTER_DAYS
} from '@/composables/todoCore'
import { idbGet, idbPut } from '../composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'

// 分类注册表偏好（localStorage，不随 JSON 备份导出——与倒计时分类偏好同策略）：
// customCategories = 用户自定义分类名数组；tabCategories = 标签页可见分类（默认全部内置）
const TODO_CATEGORIES_KEY = 'user-todo-categories'
const TODO_TAB_CATEGORIES_KEY = 'user-todo-tab-categories'
const TODO_BUILTIN_MIGRATED_KEY = 'user-todo-categories-migrated'

/** 分类操作错误语义：empty 空名 / duplicate 重名 / not-found 不存在 / in-use 被引用 / boundary 已在边界。 */
export type TodoCategoryError = 'empty' | 'duplicate' | 'not-found' | 'in-use' | 'boundary'
/** 分类 CRUD 统一返回结构（ok:true 无 reason；ok:false 时 reason 语义精确）。 */
export type TodoCategoryOp = { ok: boolean; reason?: TodoCategoryError }

/** 从 localStorage 读字符串数组：JSON.parse 校验是 string[]，损坏/非数组 → []。 */
function readStringArray(key: string): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(raw) && raw.every(item => typeof item === 'string') ? raw : []
  } catch {
    return []
  }
}

// 工作台待办任务 store（数据存 IndexedDB，T8 填充完整增删改查）
export const useWorkbenchTodosStore = defineStore('workbenchTodos', () => {
  const todos = ref<WorkbenchTodo[]>([])

  // ===== 分类管理（自定义分类注册表 + 标签页可见分类，仿倒计时 store）=====
  const customCategories = ref<string[]>([])
  const tabCategories = ref<string[]>([])

  // 自定义分类（表单下拉全量来源；无内置分类，全部自定义）
  const allCategories = computed<string[]>(() => [...customCategories.value])

  function loadCategoryPreferences(): void {
    customCategories.value = readStringArray(TODO_CATEGORIES_KEY)
    const saved = readStringArray(TODO_TAB_CATEGORIES_KEY)
    // 无默认定义：仅恢复用户勾选记录；首次无记录 → 空（筛选标签页不显示任何分类）
    tabCategories.value = saved
  }

  function persistCategoryPreferences(): void {
    localStorage.setItem(TODO_CATEGORIES_KEY, JSON.stringify(customCategories.value))
    localStorage.setItem(TODO_TAB_CATEGORIES_KEY, JSON.stringify(tabCategories.value))
  }

  function addCategory(name: string): TodoCategoryOp {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    // 大小写不敏感查重（含内置分类）
    if (allCategories.value.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, reason: 'duplicate' }
    }
    customCategories.value.push(trimmed)
    // 新建分类自动加入标签页
    if (!tabCategories.value.includes(trimmed)) tabCategories.value.push(trimmed)
    persistCategoryPreferences()
    return { ok: true }
  }

  async function updateCategory(oldName: string, newName: string): Promise<TodoCategoryOp> {
    if (!customCategories.value.includes(oldName)) return { ok: false, reason: 'not-found' }
    const trimmed = newName.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    // 与其他分类重名（≠ oldName 自身，大小写不敏感）
    if (allCategories.value.some(c => c !== oldName && c.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, reason: 'duplicate' }
    }
    const idx = customCategories.value.indexOf(oldName)
    customCategories.value[idx] = trimmed
    const ti = tabCategories.value.indexOf(oldName)
    if (ti !== -1) tabCategories.value[ti] = trimmed
    // 同步存量 todos 分类字段（toRaw 防 DataCloneError；整数组重建触发响应式）
    todos.value = toRaw(todos.value).map(t =>
      t.categoryId === oldName ? { ...t, categoryId: trimmed, updatedAt: new Date().toISOString() } : t
    )
    await saveTodos()
    persistCategoryPreferences()
    return { ok: true }
  }

  function deleteCategory(name: string): TodoCategoryOp {
    if (!customCategories.value.includes(name)) return { ok: false, reason: 'not-found' }
    // 被任一 todo（全量，非筛选视图）引用禁删（同倒计时/记账策略）
    if (todos.value.some(t => t.categoryId === name)) return { ok: false, reason: 'in-use' }
    customCategories.value = customCategories.value.filter(c => c !== name)
    tabCategories.value = tabCategories.value.filter(c => c !== name)
    persistCategoryPreferences()
    return { ok: true }
  }

  function moveCategory(name: string, dir: 'up' | 'down'): TodoCategoryOp {
    if (!customCategories.value.includes(name)) return { ok: false, reason: 'not-found' }
    const next = moveCustomCategoryInList(customCategories.value, name, dir)
    // 已在边界（顺序未变）→ boundary
    if (next.every((c, i) => c === customCategories.value[i])) {
      return { ok: false, reason: 'boundary' }
    }
    // 新数组整体赋值触发响应式（ref 数组替换）
    customCategories.value = next
    persistCategoryPreferences()
    return { ok: true }
  }

  function toggleTabCategory(name: string, visible: boolean): TodoCategoryOp {
    if (!allCategories.value.includes(name)) return { ok: false, reason: 'not-found' }
    if (visible) {
      if (!tabCategories.value.includes(name)) tabCategories.value.push(name)
    } else {
      tabCategories.value = tabCategories.value.filter(c => c !== name)
    }
    persistCategoryPreferences()
    return { ok: true }
  }

  // 分类偏好惰性加载（setup 内同步初始化）
  loadCategoryPreferences()

  async function loadTodos(): Promise<void> {
    try {
      // 加载数据（含 color 字段），经 normalizeTodo 幂等归一
      const loaded = ((await idbGet<WorkbenchTodo[]>('todos')) ?? []).map(normalizeTodo)
      // 存量迁移（marker 版本 '2' 门控，幂等）：旧版内置 work/life/study → 未分类 + 清理分类注册表残留
      if (localStorage.getItem(TODO_BUILTIN_MIGRATED_KEY) !== '2') {
        todos.value = migrateLegacyBuiltinCategories(loaded)
        customCategories.value = purgeLegacyBuiltinCategories(customCategories.value)
        tabCategories.value = purgeLegacyBuiltinCategories(tabCategories.value)
        localStorage.setItem(TODO_BUILTIN_MIGRATED_KEY, '2')
        persistCategoryPreferences()
        await saveTodos()
      } else {
        todos.value = loaded
      }
      // 加载即自动归档：已完成超过 30 天的条目在本次会话就置为已归档（纯函数判定，无变更不写库）
      await runAutoArchive()
    } catch (e) {
      console.error('[Todos] load failed', e)
      todos.value = []
    }
  }

  /**
   * 自动归档：把「已完成且超过 ARCHIVE_AFTER_DAYS 天」的条目置为 archived=true。
   * 无符合条目时不写库（避免无谓的 IndexedDB 写入与云同步 markDirty）。
   */
  async function runAutoArchive(): Promise<number> {
    const { items, changed } = autoArchiveTodos(todos.value)
    if (changed.length === 0) return 0
    todos.value = items
    await saveTodos()
    return changed.length
  }

  async function saveTodos(): Promise<void> {
    try {
      // toRaw：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError），需写入原始数组
      await idbPut('todos', toRaw(todos.value))
      markDirty()
    } catch (e) {
      console.error('[Todos] save failed', e)
    }
  }

  async function addTodo(input: {
    title: string
    description?: string
    priority: TodoPriority
    dueDate?: string
    color?: string
    categoryId?: string
    /** 新建时的初始状态（默认 'pending' 未完成）；直接建成「已完成」时会一并写入 completedAt */
    status?: TodoStatus
  }): Promise<void> {
    const status: TodoStatus = input.status ?? 'pending'
    const now = new Date().toISOString()
    todos.value.push(
      normalizeTodo({
        id: `td_${Date.now()}`,
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: input.dueDate,
        completed: status === 'completed',
        status,
        createdAt: now,
        updatedAt: now,
        ...(status === 'completed' ? { completedAt: now } : {}),
        color: input.color,
        categoryId: input.categoryId
      })
    )
    await saveTodos()
  }

  async function updateTodo(id: string, patch: Partial<WorkbenchTodo>): Promise<void> {
    const index = todos.value.findIndex(t => t.id === id)
    if (index !== -1) {
      const merged: WorkbenchTodo = {
        ...todos.value[index],
        ...patch,
        updatedAt: new Date().toISOString()
      }
      // status 与 completed 互为镜像：显式改状态时同步 completed，杜绝两个真值源漂移
      if (patch.status !== undefined) merged.completed = merged.status === 'completed'
      todos.value[index] = merged
      await saveTodos()
    }
  }

  async function deleteTodo(id: string): Promise<void> {
    // 从 toRaw 的原始数组 filter：在 reactive 代理上直接 filter 会得到 Proxy 元素，
    // toRaw 只解开一层数组，残留的 Proxy 元素会让 IDB 结构化克隆抛 DataCloneError（L1 变体）
    todos.value = toRaw(todos.value).filter(t => t.id !== id)
    await saveTodos()
  }

  /**
   * 设置工作流状态的唯一入口：同步 completed 镜像，并处理 completedAt / archived 联动。
   * - 已完成：completed=true，补 completedAt（自动归档以它为准，回退 updatedAt 会误判成"刚完成"）
   * - 未完成 / 进行中：completed=false，清 completedAt 与 archived（未完成项不该处于归档态）
   * 目标状态与当前一致时不写库。
   */
  async function setTodoStatus(id: string, status: TodoStatus): Promise<void> {
    const index = todos.value.findIndex(t => t.id === id)
    if (index === -1) return
    const prev = todos.value[index]
    if (todoStatus(prev) === status) return
    const now = new Date().toISOString()
    const next: WorkbenchTodo = { ...prev, status, completed: status === 'completed', updatedAt: now }
    if (status === 'completed') {
      next.completedAt = prev.completedAt ?? now
    } else {
      delete next.completedAt
      delete next.archived
    }
    todos.value[index] = next
    await saveTodos()
  }

  /** 完成态开关（沿用旧 toggle 语义）：已完成 ⇄ 未完成；进行中 → 已完成。 */
  async function toggleTodo(id: string): Promise<void> {
    const todo = todos.value.find(t => t.id === id)
    if (!todo) return
    await setTodoStatus(id, todoStatus(todo) === 'completed' ? 'pending' : 'completed')
  }

  /** 手动归档单条（只能归档已完成项）；已是归档态返回 false，不写库。 */
  async function archiveTodo(id: string): Promise<boolean> {
    const todo = todos.value.find(t => t.id === id)
    if (!todo || todoStatus(todo) !== 'completed' || todo.archived === true) return false
    todo.archived = true
    todo.updatedAt = new Date().toISOString()
    await saveTodos()
    return true
  }

  /** 取消归档（回到"已完成"段）：非归档项返回 false，不写库。 */
  async function unarchiveTodo(id: string): Promise<boolean> {
    const todo = todos.value.find(t => t.id === id)
    if (!todo || todo.archived !== true) return false
    delete todo.archived
    // 重置完成时间，避免下次自动归档立刻又把它归档回去
    todo.completedAt = new Date().toISOString()
    todo.updatedAt = new Date().toISOString()
    await saveTodos()
    return true
  }

  // 顺序：未完成优先 → 已完成（未归档）→ 已归档；段内严格保持手工顺序，
  // 原「数组顺序即展示顺序」改为按状态分段（需求：优先显示未完成的）。
  const orderedTodos = computed<WorkbenchTodo[]>(() => sortTodosByStatus(todos.value))

  /** 打卡（一次性）：写 checkedIn=true + checkedInAt；已打卡则幂等忽略。
   *  关键：只改字段，绝不改动数组顺序——打卡前后条目索引完全一致。 */
  async function checkInTodo(id: string): Promise<void> {
    const idx = todos.value.findIndex(t => t.id === id)
    if (idx === -1) return
    const next = applyCheckIn(todos.value[idx])
    // 已打卡时 applyCheckIn 原样返回同一引用 → 直接跳过，不写库
    if (next === todos.value[idx]) return
    // 按索引原地替换：位置与索引严格不变
    todos.value[idx] = next
    await saveTodos()
  }

  /** 手工排序：交换两条待办在数组中的位置（卡片拖拽落库）。其余条目相对顺序不变。 */
  async function reorderTodo(fromId: string, toId: string): Promise<void> {
    if (fromId === toId) return
    const arr = [...toRaw(todos.value)]
    const i = arr.findIndex(t => t.id === fromId)
    const j = arr.findIndex(t => t.id === toId)
    if (i === -1 || j === -1) return
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
    todos.value = arr
    await saveTodos()
  }

  /** 手工排序：上移/下移一格（表格视图用）。已在边界返回 false。 */
  async function moveTodo(id: string, dir: 'up' | 'down'): Promise<boolean> {
    const arr = [...toRaw(todos.value)]
    const i = arr.findIndex(t => t.id === id)
    const target = dir === 'up' ? i - 1 : i + 1
    if (i === -1 || target < 0 || target >= arr.length) return false
    const tmp = arr[i]
    arr[i] = arr[target]
    arr[target] = tmp
    todos.value = arr
    await saveTodos()
    return true
  }

  // 页签计数（状态判定统一走 todoStatus，兼容无 status 的存量数据）
  const totalCount = computed(() => todos.value.length)
  /** 未完成总览 = 未完成 + 进行中（不含已归档），沿用旧 active 口径 */
  const activeCount = computed(() => todos.value.filter(t => t.archived !== true && todoStatus(t) !== 'completed').length)
  /** 未完成（pending，不含已归档、不含进行中） */
  const pendingCount = computed(() => todos.value.filter(t => t.archived !== true && todoStatus(t) === 'pending').length)
  /** 进行中（in_progress，不含已归档） */
  const inProgressCount = computed(() => todos.value.filter(t => t.archived !== true && todoStatus(t) === 'in_progress').length)
  // 已完成（不含已归档）：归档项独立计数，避免"已完成 N"与列表分段不一致
  const completedCount = computed(() => todos.value.filter(t => t.archived !== true && todoStatus(t) === 'completed').length)
  const archivedCount = computed(() => todos.value.filter(t => t.archived === true).length)
  /** 今日条数：截止日期为今天且未完成（未完成 + 进行中）；随数据变化实时刷新 */
  const todayCount = computed(() => {
    const today = localToday()
    return todos.value.filter(t => t.archived !== true && todoStatus(t) !== 'completed' && t.dueDate === today).length
  })

  return {
    todos,
    customCategories,
    tabCategories,
    allCategories,
    loadTodos,
    saveTodos,
    addTodo,
    updateTodo,
    deleteTodo,
    toggleTodo,
    setTodoStatus,
    runAutoArchive,
    archiveTodo,
    unarchiveTodo,
    addCategory,
    updateCategory,
    deleteCategory,
    moveCategory,
    toggleTabCategory,
    orderedTodos,
    checkInTodo,
    reorderTodo,
    moveTodo,
    totalCount,
    activeCount,
    pendingCount,
    inProgressCount,
    completedCount,
    archivedCount,
    todayCount,
    ARCHIVE_AFTER_DAYS
  }
})
