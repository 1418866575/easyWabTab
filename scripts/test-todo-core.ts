import assert from 'node:assert/strict'
import {
  normalizeTodo,
  filterTodos,
  dueInfo,
  localToday,
  isTodoUncategorized,
  moveCustomCategoryInList,
  migrateLegacyBuiltinCategories,
  applyCheckIn,
  shouldArchive,
  autoArchiveTodos,
  sortTodosByStatus,
  ARCHIVE_AFTER_DAYS
} from '../src/composables/todoCore.ts'
import * as todoCore from '../src/composables/todoCore.ts'
import type { WorkbenchTodo } from '../src/types'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// T1 — normalizeTodo defaults: priority=medium, completed=false, color=default blue
test('T1 normalizeTodo defaults', () => {
  const base = normalizeTodo({})
  assert.equal(base.priority, 'medium')
  assert.equal(base.completed, false)
  assert.equal(base.color, '#3b82f6')
  assert.equal(typeof base.id, 'string')
  assert.ok(base.createdAt.length > 0)
  assert.ok(base.updatedAt.length > 0)
})

// T2 — normalizeTodo passthrough + priority/color validation + completed coercion
test('T2 normalizeTodo normalize', () => {
  const passthrough = normalizeTodo({ title: '周报', priority: 'high', dueDate: '2026-12-31' })
  assert.equal(passthrough.title, '周报')
  assert.equal(passthrough.priority, 'high')
  assert.equal(passthrough.dueDate, '2026-12-31')

  const migrated = normalizeTodo({ priority: 'bogus' as never, completed: 1 as never })
  assert.equal(migrated.priority, 'medium')
  // 严格布尔：非 true 一律视为未完成（防脏数据误标完成）
  assert.equal(migrated.completed, false)
  assert.equal(normalizeTodo({ completed: true }).completed, true)

  const colorOk = normalizeTodo({ color: '#EF4444' })
  assert.equal(colorOk.color, '#EF4444')
  assert.equal(normalizeTodo({ color: '#f00' }).color, '#f00')
  assert.equal(normalizeTodo({ color: 'red' }).color, '#3b82f6')
  assert.equal(normalizeTodo({ color: '' }).color, '#3b82f6')
  assert.equal(normalizeTodo({ color: 123 as unknown as string }).color, '#3b82f6')
})

// T3 — filterTodos: title / description / priority / status / combined / empty
function mkTodo(id: string, title: string, priority: WorkbenchTodo['priority'], completed = false, description?: string): WorkbenchTodo {
  return {
    id,
    title,
    description,
    priority,
    completed,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

test('T3 filterTodos', () => {
  const items = [
    mkTodo('a', '提交季度报告', 'high', false, '财务部'),
    mkTodo('b', '购买办公用品', 'low', false),
    mkTodo('c', '周会记录', 'medium', true, '整理本周会议纪要')
  ]

  // 空条件返回全部（且保持顺序）
  assert.equal(filterTodos(items).length, 3)

  // 标题模糊：只命中标题
  assert.deepEqual(filterTodos(items, { title: '季度' }).map(t => t.id), ['a'])
  assert.deepEqual(filterTodos(items, { title: '周会' }).map(t => t.id), ['c'])
  // 描述模糊：只命中描述
  assert.deepEqual(filterTodos(items, { description: '纪要' }).map(t => t.id), ['c'])
  // 标题不匹配描述内容（title 只查标题）
  assert.deepEqual(filterTodos(items, { title: '纪要' }).map(t => t.id), [])
  assert.deepEqual(filterTodos(items, { description: '财务部' }).map(t => t.id), ['a'])
  // 空串 = 无约束
  assert.equal(filterTodos(items, { title: '' }).length, 3)
  assert.equal(filterTodos(items, { description: '' }).length, 3)
  // AND：标题 + 描述同时命中
  assert.deepEqual(filterTodos(items, { title: '周会', description: '纪要' }).map(t => t.id), ['c'])
  // AND：无条目同时命中两者
  assert.deepEqual(filterTodos(items, { title: '季度', description: '纪要' }).map(t => t.id), [])
  // 优先级精确
  assert.deepEqual(filterTodos(items, { priority: 'medium' }).map(t => t.id), ['c'])
  // 状态：待办（未完成）
  assert.deepEqual(filterTodos(items, { status: 'active' }).map(t => t.id), ['a', 'b'])
  // 状态：已完成
  assert.deepEqual(filterTodos(items, { status: 'completed' }).map(t => t.id), ['c'])
  // 状态 all = 不限制
  assert.equal(filterTodos(items, { status: 'all' }).length, 3)
  // 组合：高优先级 + 待办
  assert.deepEqual(filterTodos(items, { priority: 'high', status: 'active' }).map(t => t.id), ['a'])
  // 标题 + 状态组合无结果
  assert.equal(filterTodos(items, { title: '周会', status: 'active' }).length, 0)
})

// T4 — dueInfo: future / today / overdue / no date
test('T4 dueInfo', () => {
  const now = new Date(2026, 7, 5) // 2026-08-05 本地
  assert.deepEqual(dueInfo('2026-08-08', false, now), { label: '剩余 3 天', status: 'normal' })
  assert.deepEqual(dueInfo('2026-08-05', false, now), { label: '今天到期', status: 'today' })
  assert.deepEqual(dueInfo('2026-08-02', false, now), { label: '已逾期 3 天', status: 'overdue' })
  assert.equal(dueInfo(undefined, false, now), null)
  assert.equal(dueInfo('2026-08-08', true, now), null)
  assert.equal(dueInfo('not-a-date', false, now), null)
})

// T5 — localToday uses local date, not UTC
test('T5 localToday', () => {
  // 2026-08-05 00:30 本地时刻：UTC 前一天，验证不偏移
  const d = new Date(2026, 7, 5, 0, 30)
  assert.equal(localToday(d), '2026-08-05')
})

// T6 — filterTodos categoryId 维度（RED：todoCore 当前忽略 categoryId，故以下断言应失败）
test('T6 filterTodos categoryId', () => {
  const items: (WorkbenchTodo & { categoryId?: string })[] = [
    mkTodo('a', '标题A', 'medium', false),
    mkTodo('b', '标题B', 'medium', false),
    mkTodo('c', '标题C', 'high', false)
  ]
  items[0].categoryId = 'work'
  items[2].categoryId = 'study'

  // 空条件返回全部
  assert.equal(filterTodos(items).length, 3)
  // 指定分类精确命中
  assert.deepEqual(filterTodos(items, { categoryId: 'work' }).map(t => t.id), ['a'])
  // 'uncategorized' 字面量匹配未分类
  assert.deepEqual(filterTodos(items, { categoryId: 'uncategorized' }).map(t => t.id), ['b'])
  // 空串 = 全部不过滤
  assert.equal(filterTodos(items, { categoryId: '' }).length, 3)
  // 与既有维度 AND 组合：work + high 无交集
  assert.deepEqual(filterTodos(items, { categoryId: 'work', priority: 'high' }).map(t => t.id), [])
})

// T7 — normalizeTodo categoryId 归一化（RED：todoCore 当前未处理 categoryId，故以下断言应失败）
test('T7 normalizeTodo categoryId', () => {
  assert.equal(normalizeTodo({ categoryId: 'work' }).categoryId, 'work')
  assert.equal(normalizeTodo({ categoryId: '  work  ' }).categoryId, 'work')
  assert.equal(normalizeTodo({ categoryId: '' }).categoryId, undefined)
  assert.equal(normalizeTodo({ categoryId: '   ' }).categoryId, undefined)
  assert.equal(normalizeTodo({}).categoryId, undefined)
})

// T8 — isTodoUncategorized: undefined/''/null → true，其余 false
test('T8 isTodoUncategorized', () => {
  assert.equal(isTodoUncategorized({}), true)
  assert.equal(isTodoUncategorized({ categoryId: '' }), true)
  assert.equal(isTodoUncategorized({ categoryId: 'work' }), false)
})

// T9 — moveCustomCategoryInList: 上移/下移一格；不存在或已在边界时原样返回（不改入参）
test('T9 moveCustomCategoryInList', () => {
  assert.deepEqual(moveCustomCategoryInList(['work', 'life', 'study'], 'life', 'up'), ['life', 'work', 'study'])
  assert.deepEqual(moveCustomCategoryInList(['work', 'life', 'study'], 'work', 'up'), ['work', 'life', 'study'])
  assert.deepEqual(moveCustomCategoryInList(['work', 'life', 'study'], 'study', 'down'), ['work', 'life', 'study'])
  assert.deepEqual(moveCustomCategoryInList(['work', 'life', 'study'], 'study', 'down'), ['work', 'life', 'study'])
  assert.deepEqual(moveCustomCategoryInList(['work', 'life', 'study'], 'nope', 'up'), ['work', 'life', 'study'])
})

// T10 — 内置分类常量与判定函数已移除（迁移为全自定义分类）
test('T10 builtin helpers removed', () => {
  assert.equal('BUILTIN_TODO_CATEGORIES' in todoCore, false, '内置分类常量应已移除')
  assert.equal('isTodoBuiltinCategory' in todoCore, false, '内置分类判定应已移除')
})

// T11 — migrateLegacyBuiltinCategories: 存量 work/life/study → undefined，其余值原样保留，不改入参
test('T11 migrateLegacyBuiltinCategories', () => {
  const todos: WorkbenchTodo[] = [
    { id: '1', title: 'a', categoryId: 'work' },
    { id: '2', title: 'b', categoryId: 'life' },
    { id: '3', title: 'c', categoryId: 'study' },
    { id: '4', title: 'd', categoryId: 'custom' },
    { id: '5', title: 'e', categoryId: '' }
  ]
  const out = migrateLegacyBuiltinCategories(todos)
  assert.equal(out[0].categoryId, undefined, 'work 迁移为未分类')
  assert.equal(out[1].categoryId, undefined, 'life 迁移为未分类')
  assert.equal(out[2].categoryId, undefined, 'study 迁移为未分类')
  assert.equal(out[3].categoryId, 'custom', '自定义分类保留')
  assert.equal(out[4].categoryId, '', '空串保留')
  // 不改入参
  assert.equal(todos[0].categoryId, 'work', '入参不被修改')
  assert.equal(todos[3].categoryId, 'custom', '入参不被修改')
  // 幂等：迁移后再迁移无变化
  const out2 = migrateLegacyBuiltinCategories(out)
  assert.equal(out2[0].categoryId, undefined, '幂等')
  assert.equal(out2[3].categoryId, 'custom', '幂等')
})

// T12 — purgeLegacyBuiltinCategories: 清理分类注册表残留的 work/life/study，自定义分类保留
test('T12 purgeLegacyBuiltinCategories happy path', () => {
  const result = todoCore.purgeLegacyBuiltinCategories(['work', 'life', 'study', 'custom'])
  assert.deepEqual(result, ['custom'])
})

// T13 — purgeLegacyBuiltinCategories: 不改入参（返回新数组）
test('T13 purgeLegacyBuiltinCategories no-mutation', () => {
  const input = ['work', 'life', 'study', 'custom']
  const snapshot = [...input]
  todoCore.purgeLegacyBuiltinCategories(input)
  assert.deepEqual(input, snapshot, '入参不被修改')
})

// T14 — purgeLegacyBuiltinCategories: 幂等（清理后再清理无变化）
test('T14 purgeLegacyBuiltinCategories idempotent', () => {
  const once = todoCore.purgeLegacyBuiltinCategories(['work', 'custom'])
  assert.deepEqual(todoCore.purgeLegacyBuiltinCategories(once), once)
})

// T15 — purgeLegacyBuiltinCategories: 空数组 → 空数组
test('T15 purgeLegacyBuiltinCategories empty list', () => {
  assert.deepEqual(todoCore.purgeLegacyBuiltinCategories([]), [])
})

// T16 — purgeLegacyBuiltinCategories: 无旧版分类名时原样返回且为新数组引用
test('T16 purgeLegacyBuiltinCategories no legacy names', () => {
  const input = ['custom']
  const result = todoCore.purgeLegacyBuiltinCategories(input)
  assert.deepEqual(result, ['custom'])
  assert.notEqual(result, input, '应返回新数组引用')
})

// T-C1 — applyCheckIn 写入打卡字段，其余字段与原对象保持一致（且不修改入参）
test('T-C1 applyCheckIn 写入打卡字段', () => {
  const base = normalizeTodo({ id: 'a', title: '写周报', priority: 'high' })
  const after = applyCheckIn(base)
  assert.equal(after.checkedIn, true)
  assert.ok(typeof after.checkedInAt === 'string' && after.checkedInAt.length > 0)
  assert.equal(after.id, base.id)
  assert.equal(after.title, base.title)
  assert.equal(after.priority, base.priority)
  assert.equal(after.completed, base.completed)
  assert.equal(after.createdAt, base.createdAt)
  assert.equal(base.checkedIn, undefined)
})

// T-C2 — applyCheckIn 幂等：已打卡原样返回同一引用
test('T-C2 applyCheckIn 幂等', () => {
  const once = applyCheckIn(normalizeTodo({ id: 'b', title: 'x' }))
  const twice = applyCheckIn(once)
  assert.equal(twice, once)
  assert.equal(twice.checkedInAt, once.checkedInAt)
})

// T-C3 — 核心不变量：打卡不改变列表顺序与索引（即便被打卡项优先级最低）
test('T-C3 打卡前后列表顺序完全一致', () => {
  const list: WorkbenchTodo[] = ['t1', 't2', 't3', 't4', 't5'].map((id, i) =>
    normalizeTodo({ id, title: `任务${i + 1}`, priority: i === 2 ? 'low' : 'high' })
  )
  const before = list.map(t => t.id)
  const idx = 2
  list[idx] = applyCheckIn(list[idx])
  assert.deepEqual(list.map(t => t.id), before)
  assert.equal(list[idx].id, 't3')
  assert.equal(list[idx].checkedIn, true)
  assert.equal(list[idx].priority, 'low')
})

// T-C4 — 打卡与「完成」互不影响，且两者都不导致重排
test('T-C4 打卡与完成互不干扰且不重排', () => {
  const list: WorkbenchTodo[] = ['a', 'b', 'c'].map(id => normalizeTodo({ id, title: id }))
  const before = list.map(t => t.id)
  list[0] = applyCheckIn(list[0])
  list[1] = { ...list[1], completed: true }
  assert.deepEqual(list.map(t => t.id), before)
  assert.equal(list[0].checkedIn, true)
  assert.equal(list[0].completed, false)
  assert.equal(list[1].completed, true)
  assert.equal(list[1].checkedIn, undefined)
})

// T-D1 — shouldArchive 口径：仅「已完成 + 超 30 天」命中，未完成/已归档/无时间戳一律不归档
test('T-D1 shouldArchive 判定口径', () => {
  const now = Date.parse('2026-09-24T00:00:00.000Z')
  const DAY = 24 * 60 * 60 * 1000
  const done40d = { ...normalizeTodo({ id: 'a', title: 'a', completed: true }), completedAt: new Date(now - 40 * DAY).toISOString() }
  const done10d = { ...normalizeTodo({ id: 'b', title: 'b', completed: true }), completedAt: new Date(now - 10 * DAY).toISOString() }
  const active = { ...normalizeTodo({ id: 'c', title: 'c' }), completedAt: new Date(now - 40 * DAY).toISOString() }
  const already = { ...done40d, id: 'd', archived: true }

  assert.equal(ARCHIVE_AFTER_DAYS, 30)
  assert.equal(shouldArchive(done40d, now), true)
  assert.equal(shouldArchive(done10d, now), false)
  assert.equal(shouldArchive(active, now), false)
  assert.equal(shouldArchive(already, now), false)
  // 边界：刚好 30 天不归档（> 才归档），31 天才归档
  const exact30 = { ...done40d, id: 'e', completedAt: new Date(now - 30 * DAY).toISOString() }
  assert.equal(shouldArchive(exact30, now), false)
  assert.equal(shouldArchive({ ...exact30, completedAt: new Date(now - 30 * DAY - 1).toISOString() }, now), true)
  // 无 completedAt 时退化为 updatedAt
  const byUpdated = { ...normalizeTodo({ id: 'f', title: 'f', completed: true }), updatedAt: new Date(now - 40 * DAY).toISOString() }
  assert.equal(shouldArchive(byUpdated, now), true)
})

// T-D2 — autoArchiveTodos：只给命中项补 archived=true，其余保持原引用（不 mutate 入参）
test('T-D2 autoArchiveTodos 批量归档', () => {
  const now = Date.parse('2026-09-24T00:00:00.000Z')
  const DAY = 24 * 60 * 60 * 1000
  const old = { ...normalizeTodo({ id: 'old', title: '旧任务', completed: true }), completedAt: new Date(now - 60 * DAY).toISOString() }
  const recent = { ...normalizeTodo({ id: 'new', title: '新任务', completed: true }), completedAt: new Date(now - 2 * DAY).toISOString() }
  const todo = normalizeTodo({ id: 'todo', title: '未完成' })
  const list: WorkbenchTodo[] = [old, recent, todo]

  const { items, changed } = autoArchiveTodos(list, now)
  assert.equal(changed.length, 1)
  assert.equal(changed[0].id, 'old')
  assert.equal(items[0].archived, true)
  assert.equal(items[1].archived, undefined)
  assert.equal(items[2].archived, undefined)
  // 其余条目保持同一引用 → 不会触发无谓的写盘/重渲染
  assert.equal(items[1], recent)
  assert.equal(items[2], todo)
  // 入参未被修改（纯函数）
  assert.equal(list[0].archived, undefined)
  // 幂等：第二次调用不再产生变更
  const again = autoArchiveTodos(items, now)
  assert.equal(again.changed.length, 0)
})

// T-D3 — sortTodosByStatus：未完成 → 已完成（未归档）→ 已归档，段内保持手工顺序
test('T-D3 sortTodosByStatus 未完成优先', () => {
  const mk = (id: string, patch: Partial<WorkbenchTodo>): WorkbenchTodo =>
    ({ ...normalizeTodo({ id, title: id }), ...patch }) as WorkbenchTodo
  const list: WorkbenchTodo[] = [
    mk('d1', { completed: true }),
    mk('a1', {}),
    mk('ar1', { completed: true, archived: true }),
    mk('a2', {}),
    mk('d2', { completed: true }),
    mk('ar2', { completed: true, archived: true })
  ]
  const sorted = sortTodosByStatus(list).map(t => t.id)
  assert.deepEqual(sorted, ['a1', 'a2', 'd1', 'd2', 'ar1', 'ar2'])
  // 原数组不被修改
  assert.deepEqual(list.map(t => t.id), ['d1', 'a1', 'ar1', 'a2', 'd2', 'ar2'])
})

// T-D4 — filterTodos 增加 archived 状态筛选
test('T-D4 filterTodos 已归档状态', () => {
  const mk = (id: string, patch: Partial<WorkbenchTodo>): WorkbenchTodo =>
    ({ ...normalizeTodo({ id, title: id }), ...patch }) as WorkbenchTodo
  const list: WorkbenchTodo[] = [
    mk('a', {}),
    mk('b', { completed: true }),
    mk('c', { completed: true, archived: true })
  ]
  assert.deepEqual(filterTodos(list, { status: 'archived' }).map(t => t.id), ['c'])
  // 已归属「已归档」的条目不再出现在「已完成」里（互斥，避免重复计数）
  assert.deepEqual(filterTodos(list, { status: 'completed' }).map(t => t.id), ['b'])
  assert.deepEqual(filterTodos(list, { status: 'active' }).map(t => t.id), ['a'])
  assert.deepEqual(filterTodos(list, { status: 'all' }).map(t => t.id), ['a', 'b', 'c'])
})

// T-D5 — normalizeTodo：archived 只在 completed 为真时保留（防脏数据出现「未完成却已归档」）
test('T-D5 normalizeTodo archived 字段校验', () => {
  assert.equal(normalizeTodo({ archived: true, completed: true }).archived, true)
  assert.equal(normalizeTodo({ archived: true }).archived, undefined)
  assert.equal(normalizeTodo({}).archived, undefined)
})

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    passed++
    console.log(`  ✓ ${t.name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${t.name}`)
    console.error(e)
  }
}
console.log(`\n${passed}/${tests.length} passed`)
if (failed > 0) process.exit(1)
