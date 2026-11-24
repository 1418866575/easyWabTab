/**
 * 工具箱开关纯逻辑测试：node --experimental-strip-types scripts/test-toolbox-visibility.ts
 * 覆盖：默认全开 / 切换幂等 / 不改入参 / 脏数据容错 / 过滤 / 清理 / 同步合并
 */
import assert from 'node:assert/strict'
import {
  normalizeDisabled,
  isToolEnabled,
  toggleToolDisabled,
  enableAllTools,
  disableAllTools,
  filterEnabledTools,
  pruneDisabled
} from '../src/toolbox/core/toolVisibility.ts'
import { mergeToolboxData, normalizeToolboxData, toolboxSignature, toolboxDiffSize } from '../src/toolbox/core/toolboxSyncCore.ts'

let pass = 0
let fail = 0
function test(name: string, fn: () => void): void {
  try {
    fn()
    pass++
    console.log('  ✓', name)
  } catch (e) {
    fail++
    console.log('  ✗', name, '→', (e as Error).message)
  }
}

console.log('[toolVisibility]')

// ── 规范化 ────────────────────────────────────────────────
test('T1 非数组 → []（=全部开启）', () => {
  for (const v of [undefined, null, 0, '', {}, true]) {
    assert.deepEqual(normalizeDisabled(v), [])
  }
})

test('T2 过滤非字符串 / 空串 / 去重 / 保序', () => {
  assert.deepEqual(normalizeDisabled(['a', '', '  ', 1, null, 'a', 'b']), ['a', 'b'])
})

test('T3 新用户无字段 → 全部开启', () => {
  const d = normalizeDisabled(undefined)
  assert.equal(isToolEnabled(d, 'json-format'), true)
  assert.equal(isToolEnabled(d, 'not-exist'), true)
})

// ── 单工具切换 ────────────────────────────────────────────
test('T4 关闭加入列表，返回新数组且不改入参', () => {
  const src: string[] = []
  const r = toggleToolDisabled(src, 'a', false)
  assert.equal(r.ok, true)
  assert.deepEqual(r.ok && r.disabled, ['a'])
  assert.deepEqual(src, [], '入参必须不被修改')
})

test('T5 重复关闭幂等（不产生重复项）', () => {
  const r1 = toggleToolDisabled([], 'a', false)
  const r2 = toggleToolDisabled(r1.ok ? r1.disabled : [], 'a', false)
  assert.deepEqual(r2.ok && r2.disabled, ['a'])
})

test('T6 开启从列表移除', () => {
  const r = toggleToolDisabled(['a', 'b'], 'a', true)
  assert.deepEqual(r.ok && r.disabled, ['b'])
})

test('T7 开启不存在的项 = 无变化', () => {
  const r = toggleToolDisabled(['a'], 'z', true)
  assert.deepEqual(r.ok && r.disabled, ['a'])
})

test('T8 空 id 拒绝', () => {
  const r = toggleToolDisabled([], '', false)
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.reason, 'invalid-id')
})

test('T9 关闭只影响该工具，不波及其它', () => {
  const d = toggleToolDisabled([], 'a', false)
  const list = d.ok ? d.disabled : []
  assert.equal(isToolEnabled(list, 'a'), false)
  assert.equal(isToolEnabled(list, 'b'), true)
  assert.equal(isToolEnabled(list, 'c'), true)
})

// ── 批量 ──────────────────────────────────────────────────
test('T10 全部开启 → 空数组', () => {
  assert.deepEqual(enableAllTools(), [])
  assert.deepEqual(disableAllTools([]), [])
})

test('T11 全部关闭 → 去重后的全部 id', () => {
  assert.deepEqual(disableAllTools(['a', 'b', 'a']), ['a', 'b'])
})

// ── 过滤 ──────────────────────────────────────────────────
test('T12 过滤保持原顺序、返回新数组', () => {
  const tools = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const out = filterEnabledTools(tools, ['b'])
  assert.deepEqual(out.map((t) => t.id), ['a', 'c'])
  assert.notEqual(out, tools, '必须返回新数组')
  assert.equal(tools.length, 3, '入参不变')
})

test('T13 关闭列表为空 → 全量返回（等价副本）', () => {
  const tools = [{ id: 'x' }, { id: 'y' }]
  assert.deepEqual(filterEnabledTools(tools, []).map((t) => t.id), ['x', 'y'])
})

test('T14 全部关闭 → 空列表', () => {
  const tools = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(filterEnabledTools(tools, ['a', 'b']), [])
})

// ── 清理 ──────────────────────────────────────────────────
test('T15 prune 移除已不存在的工具 id', () => {
  assert.deepEqual(pruneDisabled(['a', 'gone', 'b'], ['a', 'b', 'c']), ['a', 'b'])
})

test('T16 prune 无变化时内容一致（幂等）', () => {
  const d = ['a', 'b']
  assert.deepEqual(pruneDisabled(d, ['a', 'b']), d)
  assert.deepEqual(pruneDisabled(pruneDisabled(d, ['a', 'b']), ['a', 'b']), d)
})

// ── 云同步：规范化与合并 ──────────────────────────────────
console.log('\n[toolboxSyncCore · disabled]')

test('T17 信封缺 disabled → []（新用户/旧信封 = 全部开启）', () => {
  assert.deepEqual(normalizeToolboxData({}).disabled, [])
  assert.deepEqual(normalizeToolboxData(null).disabled, [])
  assert.deepEqual(normalizeToolboxData({ favorites: ['a'] }).disabled, [])
})

test('T18 信封 disabled 脏数据 → []', () => {
  assert.deepEqual(normalizeToolboxData({ disabled: 'oops' }).disabled, [])
  assert.deepEqual(normalizeToolboxData({ disabled: [1, null, ''] }).disabled, [])
})

test('T19 合并取并集：任一端关过就关', () => {
  const m = mergeToolboxData({ disabled: ['a'] }, { disabled: ['b'] })
  assert.deepEqual(m.disabled.sort(), ['a', 'b'])
})

test('T20 合并：只有远端有 disabled 时也生效（换设备场景）', () => {
  const m = mergeToolboxData({}, { disabled: ['pdf-merge'] })
  assert.deepEqual(m.disabled, ['pdf-merge'])
})

test('T21 合并幂等：同一份数据合并两次结果一致', () => {
  const local = { disabled: ['a'] }
  const remote = { disabled: ['b', 'a'] }
  const once = mergeToolboxData(local, remote)
  const twice = mergeToolboxData(once, remote)
  assert.deepEqual(twice.disabled, once.disabled)
})

test('T22 合并去重', () => {
  const m = mergeToolboxData({ disabled: ['a', 'a'] }, { disabled: ['a'] })
  assert.deepEqual(m.disabled, ['a'])
})

test('T23 合并不影响其它四项', () => {
  const m = mergeToolboxData(
    { favorites: ['f1'], clicks: { f1: 3 }, disabled: ['a'] },
    { favorites: ['f2'], disabled: ['b'] }
  )
  assert.deepEqual(m.favorites.sort(), ['f1', 'f2'])
  assert.equal(m.clicks.f1, 3)
})

test('T24 签名随 disabled 变化而变化', () => {
  const a = toolboxSignature({ disabled: [] })
  const b = toolboxSignature({ disabled: ['x'] })
  assert.notEqual(a, b)
})

test('T25 差异计数把开关差异算进去', () => {
  assert.equal(toolboxDiffSize({ disabled: [] }, { disabled: [] }), 0)
  assert.ok(toolboxDiffSize({ disabled: ['a'] }, { disabled: [] }) > 0)
})

console.log(`\n${pass}/${pass + fail} passed${fail ? `, ${fail} failed` : ''}`)
process.exit(fail ? 1 : 0)
