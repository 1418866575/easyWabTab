/**
 * AI 平台入口纯逻辑测试
 * 运行：npm run test:ai-platforms
 */
import assert from 'node:assert/strict'
import {
  PLATFORM_NAME_MAX,
  PLATFORM_UNGROUPED,
  PLATFORM_GROUPS_DEFAULT,
  PLATFORM_WINDOW,
  PLATFORM_SEED_AT,
  builtinPlatformId,
  computePopupRect,
  defaultAiPlatforms,
  groupPlatforms,
  isPlatformNameTaken,
  mergeDefaultPlatforms,
  nextOrder,
  normalizeAiPlatforms,
  normalizePlatform,
  normalizeUrlForCompare,
  sortPlatforms,
  validatePlatform,
  validatePlatformUrl,
  type PlatformSort
} from '../src/composables/aiPlatformsCore.ts'
import type { AiPlatform } from '../src/types/index.ts'

const tests: { name: string; fn: () => void }[] = []
const test = (name: string, fn: () => void) => tests.push({ name, fn })

function make(over: Partial<AiPlatform> = {}): AiPlatform {
  return {
    id: 'ai_test_1',
    name: '测试平台',
    url: 'https://example.com/',
    group: '通用对话',
    icon: '',
    accountLabel: '',
    plan: '',
    note: '',
    pinned: false,
    isFavorite: false,
    order: 0,
    usageCount: 0,
    lastOpenedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...over
  }
}

// ==================== T1 合法 URL ====================
test('T1 合法 URL：https 直通、无协议自动补 https', () => {
  assert.deepEqual(validatePlatformUrl('https://a.com'), { ok: true, url: 'https://a.com' })
  assert.equal(validatePlatformUrl('a.com/chat').ok, true)
  assert.equal((validatePlatformUrl('a.com/chat') as { url: string }).url, 'https://a.com/chat')
  assert.equal(validatePlatformUrl('  https://a.com/x  ').ok, true)
  assert.equal((validatePlatformUrl('  https://a.com/x  ') as { url: string }).url, 'https://a.com/x')
})

// ==================== T2 非法 URL ====================
test('T2 非法 URL：http / 危险协议 / 内嵌凭据 / 无域名 / 超长 / 空格', () => {
  const bad = [
    'http://a.com',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<b>x</b>',
    'vbscript:msgbox',
    'file:///c:/x',
    'blob:https://a.com/x',
    'about:blank',
    'https://u:p@a.com',
    'https://',
    'https://localhost',
    'https://a b.com',
    'https://' + 'a'.repeat(2050) + '.com'
  ]
  for (const u of bad) {
    const r = validatePlatformUrl(u)
    assert.equal(r.ok, false, `应拒绝: ${u}`)
    assert.ok((r as { error: string }).error.length > 0, `应给出原因: ${u}`)
  }
  assert.equal(validatePlatformUrl('').ok, false)
})

// ==================== T3 归一化保留墓碑 ====================
test('T3 归一化保留 deletedAt / ver / clientId（防复活）', () => {
  const p = normalizePlatform({
    id: 'x',
    name: 'A',
    url: 'https://a.com',
    deletedAt: '2026-10-01T00:00:00.000Z',
    ver: 7,
    clientId: 'c1'
  })
  assert.ok(p)
  assert.equal(p!.deletedAt, '2026-10-01T00:00:00.000Z')
  assert.equal(p!.ver, 7)
  assert.equal(p!.clientId, 'c1')
})

// ==================== T4 危险 URL 置空但保留记录 ====================
test('T4 危险协议：url 置空、记录保留', () => {
  const p = normalizePlatform({ id: 'x', name: '坏链接', url: 'javascript:alert(1)' })
  assert.ok(p)
  assert.equal(p!.url, '')
  assert.equal(p!.name, '坏链接')
})

// ==================== T5 默认集 ====================
test('T5 默认集：10 条、id/URL/builtinKey 唯一、戳固定为 1、无 ver', () => {
  const list = defaultAiPlatforms()
  assert.equal(list.length, 10)
  assert.equal(new Set(list.map(p => p.id)).size, 10)
  assert.equal(new Set(list.map(p => p.builtinKey)).size, 10)
  assert.equal(new Set(list.map(p => p.url)).size, 10)
  for (const p of list) {
    assert.equal(validatePlatformUrl(p.url).ok, true, `${p.name} 的 URL 应合法`)
    assert.equal(p.updatedAt, PLATFORM_SEED_AT)
    assert.equal(p.createdAt, PLATFORM_SEED_AT)
    assert.equal(p.ver, undefined)
    assert.equal(p.id, builtinPlatformId(p.builtinKey as string))
    assert.equal(p.pinned, false)
  }
})

// ==================== T6 去重取新 ====================
test('T6 同 id 去重：按 ver 取新，墓碑压过旧活记录', () => {
  const merged = normalizeAiPlatforms([
    { id: 'a', name: '旧', url: 'https://a.com', updatedAt: 1, ver: 1 },
    { id: 'a', name: '新', url: 'https://a.com', updatedAt: 2, ver: 2 }
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].name, '新')

  const withTomb = normalizeAiPlatforms([
    { id: 'b', name: '活', url: 'https://b.com', updatedAt: 999, ver: 1 },
    { id: 'b', name: '活', url: 'https://b.com', updatedAt: 1, ver: 3, deletedAt: '2026-10-01T00:00:00.000Z' }
  ])
  assert.equal(withTomb.length, 1)
  assert.ok(withTomb[0].deletedAt, '墓碑应胜出')

  // 非法输入降级
  assert.deepEqual(normalizeAiPlatforms(null), [])
  assert.deepEqual(normalizeAiPlatforms('not json'), [])
  assert.deepEqual(normalizeAiPlatforms([null, 1, 'x', {}]), [])
})

// ==================== T7 排序 ====================
test('T7 排序：置顶恒前、recent 的 null 垫底、usage 降序、name 中文排序、不改入参', () => {
  const a = make({ id: 'a', name: '乙', order: 0, lastOpenedAt: null, usageCount: 1 })
  const b = make({ id: 'b', name: '甲', order: 1, lastOpenedAt: 500, usageCount: 9 })
  const c = make({ id: 'c', name: '丙', order: 2, lastOpenedAt: 900, usageCount: 3, pinned: true })
  const list = [a, b, c]
  const snapshot = JSON.stringify(list)

  assert.deepEqual(sortPlatforms(list, 'manual').map(p => p.id), ['c', 'a', 'b'])
  assert.deepEqual(sortPlatforms(list, 'recent').map(p => p.id), ['c', 'b', 'a'])
  assert.deepEqual(sortPlatforms(list, 'usage').map(p => p.id), ['c', 'b', 'a'])
  const byName = sortPlatforms(list, 'name').map(p => p.id)
  assert.deepEqual(byName[0], 'c', '置顶恒在最前')
  assert.equal(JSON.stringify(list), snapshot, '不得修改入参')
})

// ==================== T8 分组 ====================
test('T8 分组：显式组优先、额外组按 order、未分组垫底、空列表返回空', () => {
  const list = [
    make({ id: '1', group: '通用对话', order: 0 }),
    make({ id: '2', group: '搜索研究', order: 1 }),
    make({ id: '3', group: '自建组', order: 2 }),
    make({ id: '4', group: PLATFORM_UNGROUPED, order: 3 })
  ]
  const groups = groupPlatforms(list, PLATFORM_GROUPS_DEFAULT)
  assert.deepEqual(groups.map(g => g.group), ['通用对话', '搜索研究', '创作生成', '自建组', PLATFORM_UNGROUPED])
  assert.equal(groups[0].count, 1, '空组计数为 0')
  assert.equal(groups.find(g => g.group === '自建组')!.count, 1)
  assert.equal(groups.at(-1)!.group, PLATFORM_UNGROUPED)

  assert.deepEqual(groupPlatforms([], []), [])
})

// ==================== T9 nextOrder ====================
test('T9 nextOrder：空数组 0、取最大 +1', () => {
  assert.equal(nextOrder([]), 0)
  assert.equal(nextOrder([make({ order: 0 }), make({ order: 3 }), make({ order: 1 })]), 4)
})

// ==================== T10 表单校验 ====================
test('T10 validatePlatform：必填、长度、重名、URL、编辑自身不算重名、同 URL 不报错', () => {
  const existing = [make({ id: 'a', name: '通义千问', url: 'https://a.com' })]

  assert.ok(validatePlatform({ name: '', url: '' }, existing).some(i => i.field === 'name'))
  assert.ok(validatePlatform({ name: '', url: 'https://b.com' }, existing).some(i => i.field === 'name'))

  assert.ok(
    validatePlatform({ name: 'x'.repeat(PLATFORM_NAME_MAX + 1), url: 'https://b.com' }, existing).some(i => i.field === 'name'),
    '超长名称应报错'
  )

  assert.ok(validatePlatform({ name: ' 通义千问 ', url: 'https://b.com' }, existing).some(i => i.field === 'name'), '首尾空格也算重名')
  assert.deepEqual(validatePlatform({ name: '通义千问', url: 'https://b.com' }, existing, 'a'), [], '编辑自身不算重名')

  assert.ok(validatePlatform({ name: '新', url: 'http://b.com' }, existing).some(i => i.field === 'url'))
  assert.ok(validatePlatform({ name: '新', url: '', }, existing).some(i => i.field === 'url'))

  const sameUrl = validatePlatform({ name: '另一个号', url: 'https://a.com' }, existing)
  assert.deepEqual(sameUrl, [], '同 URL 不同名允许（多账号场景）')

  assert.equal(isPlatformNameTaken(existing, '通义千问'), true)
  assert.equal(isPlatformNameTaken(existing, '通义千问', 'a'), false)
})

// ==================== T11 恢复预置 ====================
test('T11 mergeDefaultPlatforms：补齐缺失、不复活墓碑、幂等、不改入参', () => {
  const tomb = { ...defaultAiPlatforms()[0], deletedAt: '2026-10-01T00:00:00.000Z', ver: 2 }
  const custom = make({ id: 'ai_custom', name: '自建', builtinKey: undefined, order: 99 })
  const list = [tomb, custom]
  const snapshot = JSON.stringify(list)

  const merged = mergeDefaultPlatforms(list)
  assert.equal(JSON.stringify(list), snapshot, '不得修改入参')
  assert.equal(merged.filter(p => p.builtinKey === tomb.builtinKey).length, 1, '墓碑不应被复活')
  assert.equal(merged.length, 11, '补齐其余 9 条 + 自定义 1 + 墓碑 1')
  assert.ok(merged.every(p => p.builtinKey !== tomb.builtinKey || p.deletedAt))

  const again = mergeDefaultPlatforms(merged)
  assert.equal(again.length, merged.length, '幂等')
})

// ==================== T12 窗口几何 ====================
test('T12 computePopupRect：居中、clamp 到可用区、最小尺寸、超大请求被压缩', () => {
  const normal = computePopupRect(1920, 1080, 1180, 820)
  assert.equal(normal.width, 1180)
  assert.equal(normal.height, 820)
  assert.equal(normal.left, Math.floor((1920 - 1180) / 2))
  assert.equal(normal.top, Math.floor((1080 - 820) / 2))

  const small = computePopupRect(800, 600, 1180, 820)
  assert.equal(small.width, 800)
  assert.equal(small.height, 600)
  assert.equal(small.left, 0)
  assert.equal(small.top, 0)

  const tiny = computePopupRect(500, 400, 300, 200)
  assert.ok(tiny.width >= 1 && tiny.width <= 500)
  assert.ok(tiny.height >= 1 && tiny.height <= 400)

  const zero = computePopupRect(0, 0, 0, 0)
  assert.ok(zero.width > 0 && zero.height > 0, `退化输入应回落到默认档：${JSON.stringify(zero)}`)
  assert.ok(zero.width <= PLATFORM_WINDOW.defaultW)
})

// ==================== T13 URL 比较归一化 ====================
test('T13 normalizeUrlForCompare：host 小写、去尾斜杠与 hash', () => {
  assert.equal(normalizeUrlForCompare('https://A.com/x/#h'), 'https://a.com/x')
  assert.equal(normalizeUrlForCompare('https://a.com/x/'), 'https://a.com/x')
  assert.equal(normalizeUrlForCompare('https://a.com'), 'https://a.com')
  assert.equal(normalizeUrlForCompare('not a url'), 'not a url')
})

let passed = 0, failed = 0
for (const t of tests) {
  try { t.fn(); passed++; console.log(`  ✓ ${t.name}`) }
  catch (e) { failed++; console.error(`  ✗ ${t.name}`); console.error(e) }
}
console.log(`\n${passed}/${tests.length} passed`)
if (failed > 0) process.exit(1)
