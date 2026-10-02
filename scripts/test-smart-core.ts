// smartCore.ts 纯函数测试（node --experimental-strip-types 直跑，npm run test:smart）
// 覆盖：归一化 / 标签 / 模板变量解析与填充 / 过滤排序 / 校验 / 信封解析 / Markdown 往返 / 导入计划 / 统计
import assert from 'node:assert/strict'
import {
  applyImport,
  buildEnvelope,
  calcSmartStats,
  categoriesOf,
  fillTemplate,
  filterSmart,
  isNameTaken,
  markdownToSkill,
  mergeVariables,
  normalizePrompt,
  normalizeSkill,
  normalizeTags,
  parseEnvelope,
  parseVariables,
  planImport,
  skillToMarkdown,
  sortSmart,
  UNCATEGORIZED,
  UNCATEGORIZED_ALL,
  validatePrompt,
  validateSkill,
  SMART_CONTENT_MAX,
  SMART_NAME_MAX,
  SMART_PROMPT_KIND,
  SMART_SKILL_KIND
} from '../src/composables/smartCore.ts'
import type { SmartPrompt, SmartSkill } from '../src/types/index.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

/** 造一条技能（默认字段齐备，测试只覆盖关心的字段） */
function skill(over: Partial<SmartSkill> = {}): SmartSkill {
  return {
    id: 'sk_1',
    name: '需求文档生成',
    category: '写作',
    icon: '\u{1F4DD}',
    tags: ['产品'],
    version: '1.0.0',
    author: '',
    description: '把想法展开为文档',
    content: '正文',
    usageCount: 0,
    lastUsedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...over
  }
}

function prompt(over: Partial<SmartPrompt> = {}): SmartPrompt {
  return {
    id: 'pm_1',
    title: '概念讲解',
    category: '学习',
    tags: ['讲解'],
    model: '通用',
    content: '请讲解 {{概念}}',
    variables: [{ name: '概念' }],
    isFavorite: false,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...over
  }
}

// T1 — 技能归一化：缺字段补默认、类型纠正、非法剔除
test('T1 normalizeSkill（默认值 / 类型纠正 / 非法返回 null）', () => {
  const s = normalizeSkill({ name: 'A', content: '正文' })
  assert.ok(s, '合法对象应归一成功')
  assert.equal(s!.category, UNCATEGORIZED, '缺分类 → 未分类')
  assert.equal(s!.version, '1.0.0', '缺版本 → 1.0.0')
  assert.equal(s!.usageCount, 0, '缺使用次数 → 0')
  assert.equal(s!.lastUsedAt, null, '缺最近使用 → null')
  assert.ok(s!.id.startsWith('sk_'), '缺 id 自动补 sk_ 前缀')
  assert.deepEqual(s!.tags, [], '缺 tags → 空数组')

  // 非法
  assert.equal(normalizeSkill(null), null, 'null → null')
  assert.equal(normalizeSkill('字符串'), null, '非对象 → null')
  assert.equal(normalizeSkill({}), null, '名称与正文都空 → null')

  // 类型纠正：数字/布尔标量转字符串（导入的 JSON 里 content: 456 不该被当垃圾丢掉）
  const weird = normalizeSkill({ name: 123 as unknown as string, content: 456 as unknown as string, usageCount: 'x' })
  assert.ok(weird, '标量类型字段仍归一成功')
  assert.equal(weird!.name, '123', '数字名称 → 字符串')
  assert.equal(weird!.content, '456', '数字正文 → 字符串')
  assert.equal(weird!.usageCount, 0, 'usageCount 非数字 → 0')
  // 对象/数组等不可转的类型回落空串 → 名称与正文都空 → 判为垃圾
  assert.equal(normalizeSkill({ name: {}, content: {} }), null, '对象型字段 → 空 → null')
})

// T2 — 归一化幂等 + 长度截断
test('T2 normalizeSkill 幂等与截断', () => {
  const long = 'x'.repeat(SMART_NAME_MAX + 50)
  const once = normalizeSkill({ name: long, content: 'y'.repeat(SMART_CONTENT_MAX + 100) })
  assert.equal([...once!.name].length, SMART_NAME_MAX, '名称截断到上限')
  assert.equal([...once!.content].length, SMART_CONTENT_MAX, '正文截断到上限')
  const twice = normalizeSkill(once)
  assert.deepEqual(twice, once, '二次归一结果不变（幂等）')
})

// T3 — 标签归一化
test('T3 normalizeTags（去空白/去重/限量/类型过滤）', () => {
  assert.deepEqual(normalizeTags([' 产品 ', '产品', '', '文档']), ['产品', '文档'], '去空白 + 去重')
  assert.deepEqual(normalizeTags(['a', 1, null, 'b'] as unknown[]), ['a', 'b'], '非字符串剔除')
  assert.equal(normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 8, '最多保留 8 个')
  assert.deepEqual(normalizeTags('not-array'), [], '非数组 → 空')
})

// T4 — 模板变量解析（含「多次调用漏匹配」回归）
test('T4 parseVariables（顺序去重 + 多次调用一致）', () => {
  const content = '讲 {{概念}}，用 {{领域}} 举例，再说 {{概念}}'
  const vars = parseVariables(content)
  assert.deepEqual(vars.map(v => v.name), ['概念', '领域'], '按首现顺序且去重')
  // 模块级正则带 g，第二次调用若未重置 lastIndex 会漏匹配 —— 这里断言两次结果一致
  const again = parseVariables(content)
  assert.deepEqual(again.map(v => v.name), ['概念', '领域'], '重复调用结果一致（lastIndex 已重置）')
  assert.deepEqual(parseVariables('没有变量'), [], '无占位 → 空')
  assert.deepEqual(parseVariables(''), [], '空串 → 空')
  assert.deepEqual(parseVariables(123 as unknown), [], '非字符串 → 空')
})

// T5 — 变量填充：已填替换、未填保留占位
test('T5 fillTemplate（替换 + 未填保留占位并计数）', () => {
  const content = '讲 {{概念}} 与 {{领域}}'
  const r1 = fillTemplate(content, { 概念: '事务', 领域: '数据库' })
  assert.equal(r1.text, '讲 事务 与 数据库', '全部填写 → 全部替换')
  assert.deepEqual(r1.missing, [], '无缺失')

  const r2 = fillTemplate(content, { 概念: '事务' })
  assert.equal(r2.text, '讲 事务 与 {{领域}}', '未填变量保留原占位，不静默清空')
  assert.deepEqual(r2.missing, ['领域'], '缺失列表正确')

  const r3 = fillTemplate(content, { 概念: '   ' })
  assert.equal(r3.text, '讲 {{概念}} 与 {{领域}}', '纯空白视为未填')
  assert.equal(r3.missing.length, 2, '两个都缺')

  // 空格容错：{{ 概念 }} 也能解析并替换
  const r4 = fillTemplate('讲 {{ 概念 }}', { 概念: '事务' })
  assert.equal(r4.text, '讲 事务', '占位内空格容错')
})

// T6 — 变量元信息合并
test('T6 mergeVariables（以正文为准，继承 desc/defaultValue）', () => {
  const parsed = [{ name: 'a' }, { name: 'b' }]
  const merged = mergeVariables(parsed, [
    { name: 'a', desc: '说明A', defaultValue: '默认A' },
    { name: 'c', desc: '已删除的变量' }
  ])
  assert.deepEqual(merged.map(v => v.name), ['a', 'b'], '顺序与存在性以正文为准，正文没有的 c 被丢弃')
  assert.equal(merged[0].desc, '说明A', '继承 desc')
  assert.equal(merged[0].defaultValue, '默认A', '继承 defaultValue')
  assert.equal(merged[1].desc, undefined, '无元信息不补字段')
})

// T7 — 提示词归一化：变量由正文推导
test('T7 normalizePrompt 变量由正文推导（与正文保持一致）', () => {
  const p = normalizePrompt({ title: 'P', content: '讲 {{概念}}，{{领域}}' })
  assert.deepEqual(p!.variables.map(v => v.name), ['概念', '领域'], '自动解析变量')
  // 存量 variables 与正文不一致时，以正文为准
  const stale = normalizePrompt({ title: 'P', content: '讲 {{概念}}', variables: [{ name: '已删除' }] })
  assert.deepEqual(stale!.variables.map(v => v.name), ['概念'], '正文没有的变量被丢弃')
})

// T8 — 过滤：关键字 / 分类 / 标签 / 收藏
test('T8 filterSmart（关键字 / 分类 / 标签 OR / 收藏）', () => {
  const list = [
    skill({ id: 'a', name: '需求文档', category: '写作', tags: ['产品'], content: '正文A' }),
    skill({ id: 'b', name: '代码评审', category: '研发', tags: ['代码'], content: '正文B' })
  ]
  assert.equal(filterSmart(list, { q: '需求' }).length, 1, '关键字命中名称')
  assert.equal(filterSmart(list, { q: '正文B' }).length, 1, '关键字命中正文')
  assert.equal(filterSmart(list, { q: '代码' }).length, 1, '关键字命中标签')
  assert.equal(filterSmart(list, { category: '写作' }).length, 1, '分类筛选')
  assert.equal(filterSmart(list, { category: UNCATEGORIZED_ALL }).length, 2, '分类「全部」哨兵不过滤')
  assert.equal(filterSmart(list, { tags: ['产品', '代码'] }).length, 2, '多标签是 OR 关系')
  assert.equal(filterSmart(list, { q: '不存在的词' }).length, 0, '无命中返回空')
})

// T9 — 排序
test('T9 sortSmart（最近更新 / 名称 / 使用次数，不改入参）', () => {
  const list = [
    skill({ id: 'a', name: 'B', updatedAt: 1, usageCount: 5 }),
    skill({ id: 'b', name: 'A', updatedAt: 3, usageCount: 1 })
  ]
  assert.deepEqual(sortSmart(list, 'updated').map(s => s.id), ['b', 'a'], '按更新时间倒序')
  assert.deepEqual(sortSmart(list, 'name').map(s => s.name), ['A', 'B'], '按名称')
  assert.deepEqual(sortSmart(list, 'usage').map(s => s.id), ['a', 'b'], '按使用次数倒序')
  assert.equal(list[0].id, 'a', '不改入参')
})

// T10 — 分类/标签汇总
test('T10 categoriesOf 去重排序', () => {
  const list = [skill({ category: '写作' }), skill({ category: '研发' }), skill({ category: '写作' })]
  assert.deepEqual(categoriesOf(list), ['写作', '研发'], '去重并保持顺序（本地排序稳定）')
})

// T11 — 校验：必填、重名、超长
test('T11 validateSkill / validatePrompt（必填 / 重名 / 超长）', () => {
  assert.deepEqual(validateSkill({ name: '', content: '' }, []).map(i => i.field), ['name', 'content'], '两项必填都报')
  assert.ok(validateSkill({ name: 'A', content: 'x' }, []).length === 0, '合法通过')
  assert.equal(
    validateSkill({ name: 'A', content: 'x' }, [skill({ name: 'A' })]).find(i => i.field === 'name')?.message.includes('同名'),
    true,
    '新增同名 → 重名错误'
  )
  // 编辑自身不算重名
  assert.equal(validateSkill({ name: 'A', content: 'x' }, [skill({ id: 'sk_1', name: 'A' })], 'sk_1').length, 0, '编辑自身不算重名')
  assert.equal(validateSkill({ name: 'x'.repeat(SMART_NAME_MAX + 1), content: 'x' }, [])[0].field, 'name', '超长报 name')

  assert.deepEqual(validatePrompt({ title: '', content: '' }, []).map(i => i.field), ['title', 'content'], '提示词必填')
  assert.equal(isNameTaken([prompt({ title: 'P' })], 'P'), true, 'isNameTaken 命中')
  assert.equal(isNameTaken([prompt({ id: 'pm_1', title: 'P' })], 'P', 'pm_1'), false, 'isNameTaken 排除自身')
})

// T12 — 信封打包与解析
test('T12 parseEnvelope（正常 / 非 JSON / kind 不符 / 版本过高 / 裸数组）', () => {
  const env = buildEnvelope(SMART_SKILL_KIND, [skill()])
  assert.equal(env.version, 1, '信封版本为 1')
  const okRes = parseEnvelope(JSON.stringify(env), SMART_SKILL_KIND, normalizeSkill)
  assert.equal(okRes.ok, true, '合法信封解析成功')
  assert.equal(okRes.ok && okRes.items.length, 1, '解析出 1 条')

  const notJson = parseEnvelope('{坏 JSON', SMART_SKILL_KIND, normalizeSkill)
  assert.equal(notJson.ok === false && notJson.reason, 'not-json', '非 JSON → not-json')

  const wrongKind = parseEnvelope(JSON.stringify(env), SMART_PROMPT_KIND, normalizePrompt)
  assert.equal(wrongKind.ok === false && wrongKind.reason, 'kind-mismatch', 'kind 不符 → kind-mismatch')

  const tooNew = parseEnvelope(JSON.stringify({ ...env, version: 99 }), SMART_SKILL_KIND, normalizeSkill)
  assert.equal(tooNew.ok === false && tooNew.reason, 'version-too-new', '版本过高拒绝')

  const noItems = parseEnvelope(JSON.stringify({ kind: SMART_SKILL_KIND, version: 1 }), SMART_SKILL_KIND, normalizeSkill)
  assert.equal(noItems.ok === false && noItems.reason, 'bad-structure', '缺 items → bad-structure')

  // 裸数组与单对象宽容处理
  const bare = parseEnvelope(JSON.stringify([{ name: 'A', content: 'x' }]), SMART_SKILL_KIND, normalizeSkill)
  assert.equal(bare.ok && bare.items.length, 1, '裸数组可导入')
  const one = parseEnvelope(JSON.stringify({ name: 'A', content: 'x' }), SMART_SKILL_KIND, normalizeSkill)
  assert.equal(one.ok && one.items.length, 1, '单对象可导入')

  // 全是垃圾条目
  const junk = parseEnvelope(JSON.stringify({ kind: SMART_SKILL_KIND, version: 1, items: [{}, null] }), SMART_SKILL_KIND, normalizeSkill)
  assert.equal(junk.ok, false, '无有效条目 → 失败')
})

// T13 — Markdown 往返
test('T13 skillToMarkdown / markdownToSkill 往返不丢字段', () => {
  const s = skill({ name: '周报生成', category: '写作', tags: ['汇报', '文档'], version: '2.1.0', author: '我', description: '整理周报', content: '正文内容\n第二行' })
  const md = skillToMarkdown(s)
  assert.ok(md.startsWith('---'), '带 YAML 头')
  const back = markdownToSkill(md)
  assert.ok(back, '可解析回来')
  assert.equal(back!.name, '周报生成', '名称还原')
  assert.equal(back!.category, '写作', '分类还原')
  assert.deepEqual(back!.tags, ['汇报', '文档'], '标签还原')
  assert.equal(back!.version, '2.1.0', '版本还原')
  assert.equal(back!.author, '我', '作者还原')
  assert.equal(back!.description, '整理周报', '说明还原')
  assert.ok(back!.content.includes('第二行'), '正文还原')

  // 无 YAML 头：以 fallback 名称 + 全文为正文
  const plain = markdownToSkill('纯正文', '文件名')
  assert.equal(plain!.name, '文件名', '无头时用 fallback 名称')
  assert.equal(plain!.content, '纯正文', '无头时全文为正文')
  assert.equal(markdownToSkill(''), null, '空内容 → null')
})

// T14 — 导入计划：新增 / 更新 / 跳过（按 updatedAt 新者胜）
test('T14 planImport / applyImport（新增 / 更新 / 跳过 + 合并落库）', () => {
  const existing = [
    skill({ id: 'a', name: 'A', updatedAt: 100 }),  // 会被更新（导入的更新）
    skill({ id: 'b', name: 'B', updatedAt: 999 })   // 导入更旧 → 跳过
  ]
  const incoming = [
    skill({ id: 'a', name: 'A-new', updatedAt: 200 }),
    skill({ id: 'b', name: 'B-old', updatedAt: 50 }),
    skill({ id: 'c', name: 'C', updatedAt: 10 })
  ]
  const plan = planImport(incoming, existing)
  assert.deepEqual(plan.added.map(s => s.name), ['C'], 'c 为新增')
  assert.deepEqual(plan.updated.map(s => s.name), ['A-new'], 'a 为更新')
  assert.equal(plan.skipped, 1, 'b 因更旧被跳过')

  // 同名不同 id → 也视为更新，并统一用库内 id（避免插出双胞胎）
  const plan2 = planImport([skill({ id: 'x', name: 'A', updatedAt: 500 })], existing)
  assert.equal(plan2.updated[0].id, 'a', '同名命中时沿用库内 id')

  const merged = applyImport(existing, plan)
  assert.deepEqual(merged.map(s => s.id).sort(), ['a', 'b', 'c'], '合并后三条')
  assert.equal(merged.find(s => s.id === 'a')!.name, 'A-new', '更新生效')
  assert.equal(merged.find(s => s.id === 'b')!.name, 'B', '旧数据不被倒退覆盖')
})

// T15 — 统计
test('T15 calcSmartStats（计数 / 本月新增 / 累计使用 / 分类 / 最近使用）', () => {
  const now = new Date(2026, 9, 2).getTime() // 2026-10-02
  const monthStart = new Date(2026, 9, 1).getTime()
  const skills = [
    skill({ id: 'a', category: '写作', usageCount: 3, createdAt: monthStart + 10, lastUsedAt: now - 1000 }),
    skill({ id: 'b', category: '研发', usageCount: 1, createdAt: 1, lastUsedAt: null })
  ]
  const prompts = [
    prompt({ id: 'p1', category: '写作', usageCount: 2, createdAt: monthStart + 20, lastUsedAt: now }),
    prompt({ id: 'p2', category: '学习', usageCount: 0, createdAt: 1, lastUsedAt: null })
  ]
  const st = calcSmartStats(skills, prompts, now)
  assert.equal(st.skillCount, 2, '技能数')
  assert.equal(st.promptCount, 2, '提示词数')
  assert.equal(st.monthAdded, 2, '本月新增 2（a 与 p1）')
  assert.equal(st.totalUsage, 6, '累计使用 3+1+2')
  assert.equal(st.byCategory[0].category, '写作', '写作最多排第一')
  assert.equal(st.byCategory[0].skills, 1, '分类内技能数')
  assert.equal(st.byCategory[0].prompts, 1, '分类内提示词数')
  assert.equal(st.recent.length, 2, '最近使用两条（lastUsedAt 非空）')
  assert.equal(st.recent[0].id, 'p1', '最近的是 p1')
  assert.equal(st.recent[0].type, 'prompt', '类型标记正确')
})

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    passed++
    console.log('  ✓ ' + t.name)
  } catch (e) {
    failed++
    console.error('  ✗ ' + t.name)
    console.error(e)
  }
}
console.log('\n' + passed + '/' + tests.length + ' passed')
if (failed > 0) process.exit(1)
