/**
 * 树状任务列表纯逻辑
 *
 * 结构：TaskData.lists（多列表分组）+ TaskData.nodes（树，最多 3 层）
 * 归档：archived=true 的节点仍在树里，但不参与默认视图与统计。
 */

export type TaskStatus = 'pending' | 'doing' | 'done'

export interface TaskList {
  id: string
  name: string
}

export interface TaskNode {
  id: string
  text: string
  status: TaskStatus
  listId: string
  archived: boolean
  collapsed: boolean
  children: TaskNode[]
}

export interface TaskData {
  lists: TaskList[]
  nodes: TaskNode[]
}

export const MAX_DEPTH = 3
export const MAX_NODES = 1000
export const MAX_CHILDREN = 50
export const MAX_TEXT = 200

export const STATUS_META: { id: TaskStatus; name: string }[] = [
  { id: 'pending', name: '待办' },
  { id: 'doing', name: '进行中' },
  { id: 'done', name: '完成' }
]

export function emptyTaskData(): TaskData {
  return { lists: [{ id: 'inbox', name: '收件箱' }], nodes: [] }
}

function normStatus(v: unknown): TaskStatus {
  return v === 'doing' || v === 'done' ? v : 'pending'
}

function normNode(raw: unknown, listIds: Set<string>, count: { n: number }): TaskNode | null {
  const it = raw as Partial<TaskNode>
  if (!it || typeof it.id !== 'string' || typeof it.text !== 'string' || count.n >= MAX_NODES) return null
  count.n++
  const children: TaskNode[] = []
  if (Array.isArray(it.children)) {
    for (const c of it.children) {
      if (children.length >= MAX_CHILDREN) break
      const n = normNode(c, listIds, count)
      if (n) children.push(n)
    }
  }
  return {
    id: it.id,
    text: it.text.slice(0, MAX_TEXT),
    status: normStatus(it.status),
    listId: typeof it.listId === 'string' && listIds.has(it.listId) ? it.listId : 'inbox',
    archived: !!it.archived,
    collapsed: !!it.collapsed,
    children
  }
}

export function normalizeTaskData(raw: unknown): TaskData {
  const obj = raw as { lists?: unknown; nodes?: unknown } | null
  const listsRaw = Array.isArray(obj?.lists) ? obj.lists : []
  const lists: TaskList[] = []
  const listIds = new Set<string>()
  for (const r of listsRaw) {
    const l = r as Partial<TaskList>
    if (!l || typeof l.id !== 'string' || typeof l.name !== 'string' || listIds.has(l.id)) continue
    lists.push({ id: l.id, name: l.name.slice(0, 20) })
    listIds.add(l.id)
  }
  if (!listIds.has('inbox')) {
    lists.unshift({ id: 'inbox', name: '收件箱' })
    listIds.add('inbox')
  }
  const count = { n: 0 }
  const nodes: TaskNode[] = []
  if (Array.isArray(obj?.nodes)) {
    for (const r of obj.nodes) {
      if (nodes.length >= MAX_CHILDREN) break
      const n = normNode(r, listIds, count)
      if (n) nodes.push(n)
    }
  }
  return { lists, nodes }
}

/** 深度优先展开成带缩进层级的扁平列表（跳过 collapsed 分支的子孙） */
export function flattenTree(nodes: TaskNode[], depth = 0): { node: TaskNode; depth: number }[] {
  const out: { node: TaskNode; depth: number }[] = []
  for (const n of nodes) {
    out.push({ node: n, depth })
    if (!n.collapsed && n.children.length) out.push(...flattenTree(n.children, depth + 1))
  }
  return out
}

export function maxDepth(nodes: TaskNode[], depth = 1): number {
  let m = depth
  for (const n of nodes) if (n.children.length) m = Math.max(m, maxDepth(n.children, depth + 1))
  return m
}

export function countAll(nodes: TaskNode[]): { total: number; done: number; archived: number } {
  let total = 0
  let done = 0
  let archived = 0
  const walk = (list: TaskNode[]) => {
    for (const n of list) {
      total++
      if (n.status === 'done') done++
      if (n.archived) archived++
      walk(n.children)
    }
  }
  walk(nodes)
  return { total, done, archived }
}

/** 找节点与其父（父为 null 表示顶层） */
export function findNode(
  nodes: TaskNode[],
  id: string,
  parent: TaskNode | null = null
): { node: TaskNode; parent: TaskNode | null } | null {
  for (const n of nodes) {
    if (n.id === id) return { node: n, parent }
    const hit = findNode(n.children, id, n)
    if (hit) return hit
  }
  return null
}

/** 深度删除（返回新数组，不动原数组） */
export function removeNode(nodes: TaskNode[], id: string): TaskNode[] {
  return nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: removeNode(n.children, id) }))
}

export function updateNode(nodes: TaskNode[], id: string, patch: (n: TaskNode) => TaskNode): TaskNode[] {
  return nodes.map((n) => (n.id === id ? patch(n) : { ...n, children: updateNode(n.children, id, patch) }))
}

/** 子节点是否可再嵌一层 */
export function canNest(nodes: TaskNode[], id: string): boolean {
  const hit = findNode(nodes, id)
  return !!hit && flattenTree([hit.node]).length > 0 && depthOf(nodes, id) < MAX_DEPTH
}

export function depthOf(nodes: TaskNode[], id: string, d = 1): number {
  for (const n of nodes) {
    if (n.id === id) return d
    const hit = depthOf(n.children, id, d + 1)
    if (hit > 0) return hit
  }
  return -1
}

/** 在目标节点下新增子节点（超过层级/数量上限时拒绝） */
export function addChild(nodes: TaskNode[], parentId: string, node: TaskNode): { nodes: TaskNode[]; ok: boolean } {
  if (!canNest(nodes, parentId)) return { nodes, ok: false }
  const hit = findNode(nodes, parentId)
  if (!hit || hit.node.children.length >= MAX_CHILDREN) return { nodes, ok: false }
  return {
    nodes: updateNode(nodes, parentId, (n) => ({ ...n, children: n.children.concat([node]) })),
    ok: true
  }
}

/** 设置状态；标记为完成时子孙节点一并完成 */
export function setStatusDeep(nodes: TaskNode[], id: string, status: TaskStatus): TaskNode[] {
  return updateNode(nodes, id, (n) => ({
    ...n,
    status,
    children: status === 'done' ? deepDone(n.children) : n.children
  }))
}

function deepDone(nodes: TaskNode[]): TaskNode[] {
  return nodes.map((n) => ({ ...n, status: 'done', children: deepDone(n.children) }))
}

export function cycleStatus(s: TaskStatus): TaskStatus {
  return s === 'pending' ? 'doing' : s === 'doing' ? 'done' : 'pending'
}

export function statusName(s: TaskStatus): string {
  return STATUS_META.find((x) => x.id === s)?.name ?? '待办'
}
