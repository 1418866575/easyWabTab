/**
 * 面板「列表 / 卡片」视图偏好纯逻辑测试（npm run test:viewmode）。
 *
 * 覆盖：白名单归一化、默认值不落库、读写幂等、不修改入参，
 * 以及最关键的「本机没改过 → 不覆盖云端 card」多设备合并语义。
 * 组件挂载 / 移动端强制卡片 / 云同步出站由 scripts/qa-panel-view-mode.mjs 验证。
 */
import assert from 'node:assert/strict'
import {
  PANEL_VIEW_MODE_KEYS,
  WORKBENCH_VIEW_MODE_KEYS,
  BUSINESS_VIEW_MODE_KEYS,
  STUDENT_VIEW_MODE_KEYS,
  TEACHER_VIEW_MODE_KEYS,
  BLOG_VIEW_MODE_KEYS,
  isPanelViewModeKey,
  normalizePanelViewModes,
  panelViewModeOf,
  withPanelViewMode
} from '../src/composables/viewModeCore.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

test('S1 脏输入一律归一为空字典', () => {
  for (const raw of [null, undefined, '', 0, false, [], ['card'], { foo: 'bar' }]) {
    assert.deepEqual(normalizePanelViewModes(raw), {}, String(raw))
  }
})

test('S2 五工作台 key 分组完整、无重复、前缀分明', () => {
  assert.equal(WORKBENCH_VIEW_MODE_KEYS.length, 4)
  assert.equal(BUSINESS_VIEW_MODE_KEYS.length, 3)
  assert.equal(STUDENT_VIEW_MODE_KEYS.length, 11)
  assert.equal(TEACHER_VIEW_MODE_KEYS.length, 3)
  assert.equal(BLOG_VIEW_MODE_KEYS.length, 1)
  assert.equal(PANEL_VIEW_MODE_KEYS.length, 22)
  assert.equal(new Set(PANEL_VIEW_MODE_KEYS).size, 22)
  // 个人工作台 4 个 key 已落库，改名会让老用户偏好失效
  assert.deepEqual([...WORKBENCH_VIEW_MODE_KEYS], ['todos', 'notes', 'countdowns', 'genealogy'])
  for (const k of BUSINESS_VIEW_MODE_KEYS) assert.ok(k.startsWith('biz-'))
  for (const k of STUDENT_VIEW_MODE_KEYS) assert.ok(k.startsWith('stu-'))
  for (const k of TEACHER_VIEW_MODE_KEYS) assert.ok(k.startsWith('tea-'))
  for (const k of BLOG_VIEW_MODE_KEYS) assert.ok(k.startsWith('blog-'))
  for (const key of PANEL_VIEW_MODE_KEYS) assert.equal(isPanelViewModeKey(key), true)
})

test('S3 只保留 card，非法 key / 非法枚举 / 显式 list 全丢弃', () => {
  assert.deepEqual(
    normalizePanelViewModes({
      todos: 'card',
      notes: 'list',
      countdowns: 'grid',
      genealogy: 'card',
      diary: 'card',
      __proto__: 'card',
      0: 'card'
    }),
    { todos: 'card', genealogy: 'card' }
  )
})

test('S4 key 校验：非法 / 非字符串 / 相似键名一律拒绝', () => {
  for (const key of ['diary', 'todo', 'Todos', 'todos ', '', 1, null, undefined, {}]) {
    assert.equal(isPanelViewModeKey(key), false, String(key))
  }
})

test('S5 读单面板：缺省、未登记 key、脏数据都回退 list', () => {
  assert.equal(panelViewModeOf(undefined, 'todos'), 'list')
  assert.equal(panelViewModeOf({ todos: 'card' }, 'todos'), 'card')
  assert.equal(panelViewModeOf({ todos: 'card' }, 'notes'), 'list')
  assert.equal(panelViewModeOf({ todos: 'card' }, 'diary'), 'list')
  assert.equal(panelViewModeOf({ todos: 'oops' }, 'todos'), 'list')
})

test('S6 写 card 落库，写 list 删键（默认值不落库）', () => {
  const a = withPanelViewMode({}, 'todos', 'card')
  assert.deepEqual(a, { todos: 'card' })
  const b = withPanelViewMode(a, 'todos', 'list')
  assert.deepEqual(b, {})
  const c = withPanelViewMode({ notes: 'card' }, 'todos', 'card')
  assert.deepEqual(c, { notes: 'card', todos: 'card' })
})

test('S7 写入不修改入参，且重复写入幂等', () => {
  const raw = { notes: 'card' }
  const a = withPanelViewMode(raw, 'todos', 'card')
  assert.deepEqual(raw, { notes: 'card' })
  assert.deepEqual(withPanelViewMode(a, 'todos', 'card'), a)
  assert.deepEqual(withPanelViewMode(a, 'todos', 'list'), { notes: 'card' })
})

test('S8 未知 key 写入被忽略，且顺带清掉脏数据', () => {
  const raw = { diary: 'card', todos: 'card' }
  assert.deepEqual(withPanelViewMode(raw, 'diary', 'card'), { todos: 'card' })
  assert.deepEqual(withPanelViewMode(raw, 'unknown', 'list'), { todos: 'card' })
})

test('S9 多设备合并语义：本机没改过不会覆盖云端 card', () => {
  // 飞书 feishuPull 常规合并为本地优先 {...remote, ...local}；
  // 因为默认 list 不落库，本地对象里根本没有该 key，云端 card 才能活下来。
  const remote = { workbenchPanelViewModes: { todos: 'card' } }
  const local = { workbenchPanelViewModes: {} }
  const merged = { ...remote, workbenchPanelViewModes: { ...remote.workbenchPanelViewModes, ...local.workbenchPanelViewModes } }
  assert.deepEqual(merged.workbenchPanelViewModes, { todos: 'card' })
  assert.equal(panelViewModeOf(merged.workbenchPanelViewModes, 'todos'), 'card')
})

test('S10 五个工作台的 key 混合后 JSON 往返无损', () => {
  const raw = {
    todos: 'card', notes: 'card', countdowns: 'card', genealogy: 'card',
    'biz-purchases': 'card', 'biz-expenses': 'card', 'biz-daily': 'card',
    'stu-reward': 'card', 'stu-reading': 'card', 'stu-exam': 'card',
    'tea-talks': 'card', 'tea-homework': 'card', 'tea-groups': 'card', 'blog-posts': 'card'
  }
  const out = normalizePanelViewModes(JSON.parse(JSON.stringify(raw)))
  assert.deepEqual(out, raw)
  assert.equal(Object.values(out).every((v) => v === 'card'), true)
})

test('S11 三类 key 同时读写互不干扰，未登记的 key 仍被丢弃', () => {
  const a = withPanelViewMode({}, 'biz-daily', 'card')
  const b = withPanelViewMode(a, 'stu-reward', 'card')
  const c = withPanelViewMode(b, 'todos', 'card')
  assert.deepEqual(c, { 'biz-daily': 'card', 'stu-reward': 'card', todos: 'card' })
  assert.equal(panelViewModeOf(c, 'biz-daily'), 'card')
  assert.equal(panelViewModeOf(c, 'stu-reward'), 'card')
  assert.equal(panelViewModeOf(c, 'biz-categories'), 'list')
  const d = withPanelViewMode(c, 'biz-daily', 'list')
  assert.deepEqual(d, { 'stu-reward': 'card', todos: 'card' })
  // 教师台 / 博客后台同一套读写，且未登记 key 仍回退 list
  const e = withPanelViewMode(d, 'tea-talks', 'card')
  const f = withPanelViewMode(e, 'blog-posts', 'card')
  assert.equal(panelViewModeOf(f, 'tea-talks'), 'card')
  assert.equal(panelViewModeOf(f, 'blog-posts'), 'card')
  assert.equal(panelViewModeOf(f, 'tea-unknown'), 'list')
})

let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log('  PASS  ' + t.name)
  } catch (e) {
    failed++
    console.log('  FAIL  ' + t.name + '  ' + (e instanceof Error ? e.message : String(e)))
  }
}
console.log(`\n[view-mode-core] ${tests.length - failed} pass / ${failed} fail`)
process.exitCode = failed ? 1 : 0
