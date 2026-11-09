/**
 * 个人工作台「留言板」纯逻辑测试
 * 运行：npm run test:messages
 *
 * 覆盖：空数据 / 归一化兼容 / 墓碑与版本戳保留 / 色调归一 / 截断 /
 *      置顶排序 / 关键词筛选 / 云端合并（删除不复活）/ 回收站标签
 */
import assert from 'node:assert/strict'
import {
  MESSAGE_COLOR_OPTIONS,
  MESSAGE_CONTENT_MAX,
  MESSAGE_PRESET_HEX,
  MESSAGE_RANDOM_COLORS,
  MESSAGE_TITLE_MAX,
  emptyMessageData,
  filterMessages,
  isCustomMessageColor,
  mergeMessages,
  messageLabel,
  normalizeMessageColor,
  normalizeMessageData,
  randomMessageColor,
  sortMessages,
  toPickerColor
} from '../src/composables/messageBoardCore.ts'
import type { MessageBoardMessage } from '../src/types/index.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) { tests.push({ name, fn }) }

function mk(id: string, patch: Partial<MessageBoardMessage> = {}): MessageBoardMessage {
  return {
    id,
    title: '',
    content: `留言 ${id}`,
    color: 'default',
    pinned: false,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
    ...patch
  }
}

// T1 空数据
test('T1 emptyMessageData', () => {
  assert.deepEqual(emptyMessageData(), { messages: [] })
  assert.deepEqual(normalizeMessageData(undefined), { messages: [] })
  assert.deepEqual(normalizeMessageData({ nope: 1 }), { messages: [] })
})

// T2 归一化：对象 / 裸数组 / 非法条目
test('T2 normalizeMessageData shapes', () => {
  const raw = [mk('a'), { id: 'b', content: 42 }, null, 3, { content: '无 id' }]
  assert.deepEqual(normalizeMessageData({ messages: raw }).messages.map((m) => m.id), ['a'])
  assert.deepEqual(normalizeMessageData(raw).messages.map((m) => m.id), ['a'])
  const out = normalizeMessageData(raw)
  assert.equal(out.messages[0].color, 'default')
  assert.equal(out.messages[0].pinned, false)
  assert.equal(out.messages[0].title, '')
})

// T3 墓碑与版本戳必须保留（归一化抹掉 = 删除状态失效 → 云端复活）
test('T3 normalize keeps tombstone stamps', () => {
  const out = normalizeMessageData({ messages: [mk('a', { deletedAt: '2026-11-02T00:00:00.000Z', ver: 7, clientId: 'cid-x' })] })
  assert.equal(out.messages[0].deletedAt, '2026-11-02T00:00:00.000Z')
  assert.equal(out.messages[0].ver, 7)
  assert.equal(out.messages[0].clientId, 'cid-x')
})

// T4 色调归一与截断
test('T4 color + truncation', () => {
  assert.equal(normalizeMessageColor('primary'), 'primary')
  assert.equal(normalizeMessageColor('bogus'), 'default')
  assert.equal(normalizeMessageColor(undefined), 'default')
  assert.equal(MESSAGE_COLOR_OPTIONS.length, 5)
  const out = normalizeMessageData({ messages: [mk('a', { title: '一'.repeat(50), content: '二'.repeat(2100) })] })
  assert.equal(Array.from(out.messages[0].title).length, MESSAGE_TITLE_MAX)
  assert.equal(Array.from(out.messages[0].content).length, MESSAGE_CONTENT_MAX)
})

// T5 排序：置顶优先 → 创建时间倒序 → id 稳定兜底
test('T5 sortMessages', () => {
  const list = [
    mk('new', { createdAt: '2026-11-03T08:00:00.000Z' }),
    mk('old', { createdAt: '2026-11-01T08:00:00.000Z', pinned: true }),
    mk('mid', { createdAt: '2026-11-02T08:00:00.000Z' })
  ]
  assert.deepEqual(sortMessages(list).map((m) => m.id), ['old', 'new', 'mid'])
})

// T6 关键词筛选：标题 / 正文、大小写不敏感、空词返回原引用
test('T6 filterMessages', () => {
  const list = [mk('a', { title: '周末计划', content: '去爬山' }), mk('b', { content: 'Buy MILK' })]
  assert.equal(filterMessages(list, '爬山').length, 1)
  assert.equal(filterMessages(list, 'milk')[0].id, 'b')
  assert.equal(filterMessages(list, '  '), list)
})

// T7 合并：并集 + 墓碑优先（删除不复活）
test('T7 mergeMessages union + tombstone wins', () => {
  const local = { messages: [mk('a', { content: '本地', ver: 2 }), mk('b', { deletedAt: '2026-11-04T00:00:00.000Z', ver: 9 })] }
  const remote = { messages: [mk('a', { content: '远端', ver: 1 }), mk('b', { content: '远端还活着', ver: 3 }), mk('c')] }
  const merged = mergeMessages(local, remote).messages
  assert.equal(merged.length, 3)
  assert.equal(merged.find((m) => m.id === 'a')?.content, '本地', 'ver 大者胜')
  assert.ok(merged.find((m) => m.id === 'b')?.deletedAt, '墓碑胜出')
  assert.ok(merged.find((m) => m.id === 'c'), '远端独有补入')
})

// T8 合并空入参
test('T8 mergeMessages empty inputs', () => {
  assert.deepEqual(mergeMessages(undefined, undefined), { messages: [] })
  assert.equal(mergeMessages(undefined, { messages: [mk('a')] }).messages.length, 1)
})

// T9 回收站标签
test('T9 messageLabel', () => {
  assert.equal(messageLabel(mk('a', { title: '提醒', content: '记得喝水' })), '提醒 · 记得喝水')
  assert.equal(messageLabel(mk('b', { content: '一'.repeat(30) })), `${'一'.repeat(24)}…`)
  assert.equal(messageLabel(mk('c', { content: '   ' })), '（空留言）')
})

// T10 — 取色器：语义键兼容、hex 归一化、未选随机色
test('T10 picker colors + random fallback', () => {
  assert.equal(normalizeMessageColor('primary'), 'primary', '旧语义键保持兼容')
  assert.equal(normalizeMessageColor('#ABC'), '#aabbcc', '3 位简写展开并小写')
  assert.equal(normalizeMessageColor('#3B82F6'), '#3b82f6')
  assert.equal(normalizeMessageColor('bogus'), 'default')
  assert.equal(normalizeMessageColor(undefined), 'default')
  assert.equal(isCustomMessageColor('#3b82f6'), true)
  assert.equal(isCustomMessageColor('primary'), false)
  assert.equal(toPickerColor('primary'), MESSAGE_PRESET_HEX.primary)
  assert.equal(toPickerColor('#ABC'), '#aabbcc')
  assert.equal(toPickerColor(null), MESSAGE_PRESET_HEX.default)
  for (let i = 0; i < 20; i++) {
    const c = randomMessageColor()
    assert.ok(MESSAGE_RANDOM_COLORS.includes(c), `随机色应来自色板：${c}`)
    assert.ok(isCustomMessageColor(c))
  }
})

let passed = 0
let failed = 0
for (const t of tests) {
  try { t.fn(); passed++; console.log(`  ✓ ${t.name}`) }
  catch (e) { failed++; console.error(`  ✗ ${t.name}`); console.error(e) }
}
console.log(`\n${passed}/${tests.length} passed`)
if (failed > 0) process.exit(1)
