/**
 * 待办事项纯逻辑
 *
 * - 分类：默认三组（工作 / 生活 / 学习），可自定义追加；内置组不可删除
 * - 状态：pending 待办 / doing 进行中 / done 已完成
 * - 排序：items 数组顺序即展示顺序（拖拽或上移下移改变）
 */

export type TodoStatus = 'pending' | 'doing' | 'done'

export interface TodoCategory {
  id: string
  name: string
  builtin: boolean
}

export interface TodoItem {
  id: string
  text: string
  cat: string
  status: TodoStatus
  ts: number
}

export interface TodoData {
  categories: TodoCategory[]
  items: TodoItem[]
}

export const DEFAULT_CATEGORIES: TodoCategory[] = [
  { id: 'work', name: '工作', builtin: true },
  { id: 'life', name: '生活', builtin: true },
  { id: 'study', name: '学习', builtin: true }
]

export const STATUS_META: { id: TodoStatus; name: string }[] = [
  { id: 'pending', name: '待办' },
  { id: 'doing', name: '进行中' },
  { id: 'done', name: '已完成' }
]

export const MAX_ITEMS = 500
export const MAX_TEXT = 200

export function emptyTodoData(): TodoData {
  return { categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), items: [] }
}

function normalizeStatus(v: unknown): TodoStatus {
  return v === 'doing' || v === 'done' ? v : 'pending'
}

export function normalizeTodoData(raw: unknown): TodoData {
  const obj = raw as { categories?: unknown; items?: unknown } | null
  const catsRaw = Array.isArray(obj?.categories) ? obj.categories : []
  const categories: TodoCategory[] = DEFAULT_CATEGORIES.map((c) => ({ ...c }))
  const seen = new Set(categories.map((c) => c.id))
  for (const r of catsRaw) {
    const c = r as Partial<TodoCategory>
    if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || seen.has(c.id)) continue
    categories.push({ id: c.id, name: c.name.slice(0, 20), builtin: false })
    seen.add(c.id)
  }

  const itemsRaw = Array.isArray(obj?.items) ? obj.items : []
  const items: TodoItem[] = []
  for (const r of itemsRaw) {
    const it = r as Partial<TodoItem>
    if (!it || typeof it.id !== 'string' || typeof it.text !== 'string') continue
    items.push({
      id: it.id,
      text: it.text.slice(0, MAX_TEXT),
      cat: typeof it.cat === 'string' && seen.has(it.cat) ? it.cat : 'work',
      status: normalizeStatus(it.status),
      ts: typeof it.ts === 'number' ? it.ts : Date.now()
    })
    if (items.length >= MAX_ITEMS) break
  }
  return { categories, items }
}

export function addTodo(data: TodoData, text: string, cat: string): { data: TodoData; ok: boolean } {
  const t = text.trim().slice(0, MAX_TEXT)
  if (!t || data.items.length >= MAX_ITEMS) return { data, ok: false }
  return {
    data: {
      ...data,
      items: data.items.concat([
        { id: `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`, text: t, cat, status: 'pending', ts: Date.now() }
      ])
    },
    ok: true
  }
}

export function addCategory(data: TodoData, name: string): { data: TodoData; ok: boolean } {
  const n = name.trim().slice(0, 20)
  if (!n || data.categories.some((c) => c.name === n)) return { data, ok: false }
  const id = `c${Date.now()}${Math.random().toString(36).slice(2, 5)}`
  return { data: { ...data, categories: data.categories.concat([{ id, name: n, builtin: false }]) }, ok: true }
}

export function removeCategory(data: TodoData, id: string): TodoData {
  const c = data.categories.find((x) => x.id === id)
  if (!c || c.builtin) return data
  return {
    categories: data.categories.filter((x) => x.id !== id),
    // 该分类下的待办回落到「工作」，不静默删除用户数据
    items: data.items.map((it) => (it.cat === id ? { ...it, cat: 'work' } : it))
  }
}

export function setStatus(data: TodoData, id: string, status: TodoStatus): TodoData {
  return { ...data, items: data.items.map((it) => (it.id === id ? { ...it, status } : it)) }
}

export function cycleStatus(data: TodoData, id: string): TodoData {
  const it = data.items.find((x) => x.id === id)
  if (!it) return data
  const next: TodoStatus = it.status === 'pending' ? 'doing' : it.status === 'doing' ? 'done' : 'pending'
  return setStatus(data, id, next)
}

export function renameTodo(data: TodoData, id: string, text: string): TodoData {
  const t = text.trim().slice(0, MAX_TEXT)
  if (!t) return data
  return { ...data, items: data.items.map((it) => (it.id === id ? { ...it, text: t } : it)) }
}

export function removeTodo(data: TodoData, id: string): TodoData {
  return { ...data, items: data.items.filter((it) => it.id !== id) }
}

/** 在同分类列表内移动位置（from / to 为索引） */
export function moveTodo(data: TodoData, cat: string, from: number, to: number): TodoData {
  const list = data.items.filter((it) => it.cat === cat)
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return data
  const next = list.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  // 仅重排该分类占用的位置，其他分类条目的相对顺序不变
  let k = 0
  const items = data.items.map((it) => (it.cat === cat ? next[k++] : it))
  return { ...data, items }
}

export function statsOf(list: TodoItem[]): { pending: number; doing: number; done: number } {
  return {
    pending: list.filter((i) => i.status === 'pending').length,
    doing: list.filter((i) => i.status === 'doing').length,
    done: list.filter((i) => i.status === 'done').length
  }
}
