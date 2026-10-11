// smartCore.ts 纯函数测试（node --experimental-strip-types 直跑，npm run test:smart）
// 覆盖：归一化 / 标签 / 模板变量解析与填充 / 过滤排序 / 校验 / 信封解析 / Markdown 往返 / 导入计划 / 统计
import assert from 'node:assert/strict'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import {
  applyImport,
  buildEnvelope,
  calcSmartStats,
  categoriesOf,
  classifySkillIcon,
  fillTemplate,
  filterSmart,
  isNameTaken,
  mergeVariables,
  normalizePrompt,
  normalizeSkill,
  normalizeTags,
  parseEnvelope,
  parseVariables,
  planImport,
  sortSmart,
  UNCATEGORIZED,
  UNCATEGORIZED_ALL,
  validatePrompt,
  validateSkill,
  SMART_CONTENT_MAX,
  SMART_NAME_MAX,
  SMART_PROMPT_KIND,
  SMART_SKILL_DEFAULT_ICON
} from '../src/composables/smartCore.ts'
import {
  normalizeRelPath,
  parseFrontmatter,
  parseSkillMarkdown,
  skillToMarkdown as toSkillMd,
  planResources,
  planSkillImports,
  RESOURCE_COUNT_MAX,
  RESOURCE_FILE_MAX,
  SKILL_FILE
} from '../src/composables/skillPackageCore.ts'
import type { SmartPrompt, SmartSkill, SmartWorkflow } from '../src/types/index.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

/** 造一条技能（v2 结构，默认字段齐备，测试只覆盖关心的字段） */
function skill(over: Partial<SmartSkill> = {}): SmartSkill {
  return {
    id: 'sk_1',
    name: '需求文档生成',
    description: '把想法展开为文档',
    version: '1.0.0',
    author: '',
    category: '写作',
    tags: ['产品'],
    whenToUse: '',
    tools: [],
    license: '',
    extra: { icon: '\u{1F4DD}' },
    body: '正文',
    resources: [],
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

function workflow(over: Partial<SmartWorkflow> = {}): SmartWorkflow {
  return {
    id: 'wf_1',
    name: '周报自动生成',
    description: '',
    category: '写作',
    tags: [],
    author: '',
    version: '1.0.0',
    definition: '1. 收集会议记录\n2. 生成周报',
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
  assert.deepEqual(s!.resources, [], '缺 resources → 空数组')
  assert.deepEqual(s!.tools, [], '缺 tools → 空数组')

  // 非法
  assert.equal(normalizeSkill(null), null, 'null → null')
  assert.equal(normalizeSkill('字符串'), null, '非对象 → null')
  assert.equal(normalizeSkill({}), null, '名称与正文都空 → null')

  // 类型纠正：数字/布尔标量转字符串（导入的 JSON 里 body: 456 不该被当垃圾丢掉）
  const weird = normalizeSkill({ name: 123 as unknown as string, body: 456 as unknown as string, usageCount: 'x' })
  assert.ok(weird, '标量类型字段仍归一成功')
  assert.equal(weird!.name, '123', '数字名称 → 字符串')
  assert.equal(weird!.body, '456', '数字正文 → 字符串')
  assert.equal(weird!.usageCount, 0, 'usageCount 非数字 → 0')
  // 对象/数组等不可转的类型回落空串 → 名称与正文都空 → 判为垃圾
  assert.equal(normalizeSkill({ name: {}, body: {} }), null, '对象型字段 → 空 → null')
})

// T1b — v1 扁平结构自动迁移到 v2（content → body，icon → extra.icon）
test('T1b normalizeSkill 迁移 v1 结构（content → body / icon → extra.icon）', () => {
  const s = normalizeSkill({ name: '旧技能', content: '旧正文', icon: '\u{1F9E9}', category: '写作' })
  assert.ok(s, 'v1 结构可迁移')
  assert.equal(s!.body, '旧正文', 'content 迁移为 body')
  assert.equal(s!.extra.icon, '\u{1F9E9}', 'icon 保真进 extra')
  assert.equal((s as unknown as Record<string, unknown>).content, undefined, '不再保留 content 字段')
  assert.deepEqual(normalizeSkill(s), s, '二次归一结果不变（迁移幂等）')
})

// T2 — 归一化幂等 + 长度截断
test('T2 normalizeSkill 幂等与截断', () => {
  const long = 'x'.repeat(SMART_NAME_MAX + 50)
  const once = normalizeSkill({ name: long, body: 'y'.repeat(SMART_CONTENT_MAX + 100) })
  assert.equal([...once!.name].length, SMART_NAME_MAX, '名称截断到上限')
  assert.equal([...once!.body].length, SMART_CONTENT_MAX, '正文截断到上限')
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
    skill({ id: 'a', name: '需求文档', category: '写作', tags: ['产品'], body: '正文A' }),
    skill({ id: 'b', name: '代码评审', category: '研发', tags: ['代码'], body: '正文B' })
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
  assert.deepEqual(
    validateSkill({ name: '', description: '', body: '' }, []).map(i => i.field),
    ['name', 'description', 'body'],
    '三项必填都报'
  )
  assert.ok(validateSkill({ name: 'A', description: 'd', body: 'x' }, []).length === 0, '合法通过')
  assert.equal(
    validateSkill({ name: 'A', description: 'd', body: 'x' }, [skill({ name: 'A' })])
      .find(i => i.field === 'name')?.message.includes('同名'),
    true,
    '新增同名 → 重名错误'
  )
  // 编辑自身不算重名
  assert.equal(
    validateSkill({ name: 'A', description: 'd', body: 'x' }, [skill({ id: 'sk_1', name: 'A' })], 'sk_1').length,
    0,
    '编辑自身不算重名'
  )
  assert.equal(
    validateSkill({ name: 'x'.repeat(SMART_NAME_MAX + 1), description: 'd', body: 'x' }, [])[0].field,
    'name',
    '超长报 name'
  )
  assert.equal(validateSkill({ name: 'A', description: '', body: 'x' }, [])[0].field, 'description', '缺说明报 description')

  assert.deepEqual(validatePrompt({ title: '', content: '' }, []).map(i => i.field), ['title', 'content'], '提示词必填')
  assert.equal(isNameTaken([prompt({ title: 'P' })], 'P'), true, 'isNameTaken 命中')
  assert.equal(isNameTaken([prompt({ id: 'pm_1', title: 'P' })], 'P', 'pm_1'), false, 'isNameTaken 排除自身')
})

// T12 — 信封打包与解析（技能已改为 zip 目录导入，信封只剩提示词在用）
test('T12 parseEnvelope（正常 / 非 JSON / kind 不符 / 版本过高 / 裸数组）', () => {
  const env = buildEnvelope(SMART_PROMPT_KIND, [prompt()])
  assert.equal(env.version, 1, '信封版本为 1')
  const okRes = parseEnvelope(JSON.stringify(env), SMART_PROMPT_KIND, normalizePrompt)
  assert.equal(okRes.ok, true, '合法信封解析成功')
  assert.equal(okRes.ok && okRes.items.length, 1, '解析出 1 条')

  const notJson = parseEnvelope('{坏 JSON', SMART_PROMPT_KIND, normalizePrompt)
  assert.equal(notJson.ok === false && notJson.reason, 'not-json', '非 JSON → not-json')

  // 旧版导出的技能 JSON 已不再支持导入，应被判为 kind 不符
  const legacySkillJson = JSON.stringify({ kind: 'smart-skills', version: 1, exportedAt: 0, items: [] })
  const wrongKind = parseEnvelope(legacySkillJson, SMART_PROMPT_KIND, normalizePrompt)
  assert.equal(wrongKind.ok === false && wrongKind.reason, 'kind-mismatch', 'kind 不符 → kind-mismatch')

  const tooNew = parseEnvelope(JSON.stringify({ ...env, version: 99 }), SMART_PROMPT_KIND, normalizePrompt)
  assert.equal(tooNew.ok === false && tooNew.reason, 'version-too-new', '版本过高拒绝')

  const noItems = parseEnvelope(JSON.stringify({ kind: SMART_PROMPT_KIND, version: 1 }), SMART_PROMPT_KIND, normalizePrompt)
  assert.equal(noItems.ok === false && noItems.reason, 'bad-structure', '缺 items → bad-structure')

  // 裸数组与单对象宽容处理
  const bare = parseEnvelope(JSON.stringify([{ title: 'A', content: 'x' }]), SMART_PROMPT_KIND, normalizePrompt)
  assert.equal(bare.ok && bare.items.length, 1, '裸数组可导入')
  const one = parseEnvelope(JSON.stringify({ title: 'A', content: 'x' }), SMART_PROMPT_KIND, normalizePrompt)
  assert.equal(one.ok && one.items.length, 1, '单对象可导入')

  // 全是垃圾条目
  const junk = parseEnvelope(JSON.stringify({ kind: SMART_PROMPT_KIND, version: 1, items: [{}, null] }), SMART_PROMPT_KIND, normalizePrompt)
  assert.equal(junk.ok, false, '无有效条目 → 失败')
})

// T13 — skill.md 往返（序列化与解析都在 skillPackageCore）
test('T13 skillToMarkdown / parseSkillMarkdown 往返不丢字段', () => {
  const s = skill({
    name: '周报生成',
    category: '写作',
    tags: ['汇报', '文档'],
    version: '2.1.0',
    author: '我',
    description: '整理周报',
    whenToUse: '周末整理周报时',
    tools: ['Read'],
    license: 'MIT',
    body: '正文内容\n第二行'
  })
  const md = toSkillMd(s)
  assert.ok(md.startsWith('---'), '带 YAML 头')
  assert.ok(md.includes('when_to_use: 周末整理周报时'), 'frontmatter 用下划线键名')
  assert.ok(md.includes('tools: [Read]'), 'tools 序列化为数组')

  const parsed = parseSkillMarkdown(md)
  assert.equal(parsed.ok, true, '可解析回来')
  const back = normalizeSkill({ ...parsed.draft, body: parsed.body })
  assert.ok(back, '可归一为技能')
  assert.equal(back!.name, '周报生成', '名称还原')
  assert.equal(back!.category, '写作', '分类还原')
  assert.deepEqual(back!.tags, ['汇报', '文档'], '标签还原')
  assert.equal(back!.version, '2.1.0', '版本还原')
  assert.equal(back!.author, '我', '作者还原')
  assert.equal(back!.description, '整理周报', '说明还原')
  assert.equal(back!.whenToUse, '周末整理周报时', 'when_to_use 还原')
  assert.deepEqual(back!.tools, ['Read'], 'tools 还原')
  assert.equal(back!.license, 'MIT', 'license 还原')
  assert.ok(back!.body.includes('第二行'), '正文还原')

  // 空文件 / 缺 frontmatter 的失败分支见 T17（那里逐个断言错误文案）
  assert.equal(parseSkillMarkdown('').ok, false, '空内容 → 解析失败')
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
test('T15 calcSmartStats（计数 / 本月新增 / 累计使用 / 分类 / 最近使用 / 工作流）', () => {
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
  const workflows = [
    workflow({ id: 'w1', category: '写作', usageCount: 1, createdAt: monthStart + 30, lastUsedAt: now - 500 }),
    workflow({ id: 'w2', category: '研发', usageCount: 0, createdAt: 1, lastUsedAt: null })
  ]
  // 注意：第三参是 workflows，now 是第四参（新增工作流后签名顺延）
  const st = calcSmartStats(skills, prompts, workflows, now)
  assert.equal(st.skillCount, 2, '技能数')
  assert.equal(st.promptCount, 2, '提示词数')
  assert.equal(st.workflowCount, 2, '工作流数')
  assert.equal(st.monthAdded, 3, '本月新增 3（a、p1、w1）')
  assert.equal(st.totalUsage, 7, '累计使用 3+1+2+1')
  assert.equal(st.byCategory[0].category, '写作', '写作最多排第一')
  assert.equal(st.byCategory[0].skills, 1, '分类内技能数')
  assert.equal(st.byCategory[0].prompts, 1, '分类内提示词数')
  assert.equal(st.byCategory[0].workflows, 1, '分类内工作流数')
  // 工作流计入最近使用（w1 比 p1 早 500ms，排在其后）
  assert.equal(st.recent.length, 3, '最近使用三条（a/p1/w1 的 lastUsedAt 非空）')
  assert.equal(st.recent[0].id, 'p1', '最近的是 p1')
  assert.equal(st.recent[0].type, 'prompt', '类型标记正确')
  assert.equal(st.recent.find(r => r.id === 'w1')!.type, 'workflow', '工作流出现在最近使用且类型正确')
})

// T16 — frontmatter 解析（YAML 子集：标量 / 引号 / 行内数组 / 块数组 / 注释）
test('T16 parseFrontmatter（多种 YAML 写法 + 无头时全文为正文）', () => {
  const md = [
    '---',
    '# 这是注释，应被忽略',
    'name: "需求: 生成"',
    "description: '一句话说明'",
    'version: 1.2.0',
    'draft: false',
    'tags: [产品, 文档, "a,b"]',
    'tools:',
    '  - Read',
    '  - Grep',
    '---',
    '',
    '正文第一行'
  ].join('\n')
  const r = parseFrontmatter(md)
  assert.equal(r.hasFrontmatter, true, '识别到 frontmatter')
  assert.equal(r.data.name, '需求: 生成', '双引号内的冒号不被截断')
  assert.equal(r.data.description, '一句话说明', '单引号去引号')
  assert.equal(r.data.version, '1.2.0', '三段版本号保持字符串（不会被误当成数字）')
  assert.equal(r.data.draft, false, '布尔解析为布尔')
  assert.deepEqual(r.data.tags, ['产品', '文档', 'a,b'], '行内数组支持引号内逗号')
  assert.deepEqual(r.data.tools, ['Read', 'Grep'], '块数组解析')
  assert.equal(r.data['# 这是注释，应被忽略'], undefined, '注释行被忽略')
  assert.ok(r.body.includes('正文第一行'), '正文取 frontmatter 之后的内容')

  const plain = parseFrontmatter('没有元数据的全文')
  assert.equal(plain.hasFrontmatter, false, '无头文件 hasFrontmatter=false')
  assert.equal(plain.body, '没有元数据的全文', '无头时全文即正文')
})

// T17 — skill.md 解析：必填缺失要给出明确字段名
test('T17 parseSkillMarkdown（必需字段缺失给明确提示）', () => {
  const good = ['---', 'name: A', 'description: 说明', '---', '', '正文'].join('\n')
  const ok = parseSkillMarkdown(good)
  assert.equal(ok.ok, true, '合法 skill.md 解析成功')
  assert.equal(ok.draft.name, 'A', 'name 映射')
  assert.equal(ok.draft.description, '说明', 'description 映射')
  assert.equal(ok.body.trim(), '正文', '正文取出')

  assert.equal(parseSkillMarkdown('').ok, false, '空文件 → 失败')
  assert.ok(parseSkillMarkdown('').error?.includes('空文件'), '提示空文件')

  const noFm = parseSkillMarkdown('只有正文没有元数据')
  assert.equal(noFm.ok, false, '缺 frontmatter → 失败')
  assert.ok(noFm.error?.includes('frontmatter'), '提示缺 frontmatter')

  const noName = parseSkillMarkdown(['---', 'description: 说明', '---', '', '正文'].join('\n'))
  assert.equal(noName.ok, false, '缺 name → 失败')
  assert.ok(noName.error?.includes('name'), '错误里点名 name 字段')

  const noDesc = parseSkillMarkdown(['---', 'name: A', '---', '', '正文'].join('\n'))
  assert.ok(noDesc.error?.includes('description'), '错误里点名 description 字段')

  const noBody = parseSkillMarkdown(['---', 'name: A', 'description: d', '---', '', '   '].join('\n'))
  assert.equal(noBody.ok, false, '正文为空 → 失败')
  assert.ok(noBody.error?.includes('正文'), '错误里点名正文')

  // 未识别的键进 extra，保证导入导出不丢信息
  const withExtra = parseSkillMarkdown(['---', 'name: A', 'description: d', 'icon: 🧩', '---', '', '正文'].join('\n'))
  assert.deepEqual(withExtra.draft.extra, { icon: '🧩' }, '未识别键进 extra')
})

// T18 — 资源规划：剥顶层目录名、排除 skill.md、超限留痕
test('T18 planResources（路径归一化 / 排除 skill.md / 超限跳过并给原因）', () => {
  const files = [
    { path: 'my-skill/skill.md', size: 10, text: '正文' },
    { path: 'my-skill/tpl/prd.md', size: 5, text: '模板' },
    { path: 'my-skill/scripts/run.py', size: 20, text: 'print(1)' },
    { path: 'my-skill/big.bin', size: RESOURCE_FILE_MAX + 1, base64: 'AAA' }
  ]
  const plan = planResources(files, 'my-skill')
  assert.deepEqual(plan.resources.map(r => r.path), ['tpl/prd.md', 'scripts/run.py'], '剥掉顶层目录名并排除 skill.md（保持原顺序）')
  assert.equal(plan.resources.every(r => r.encoding === 'text'), true, '文本扩展名走 text 编码')
  assert.equal(plan.skipped.length, 1, '超限文件被跳过')
  assert.ok(plan.skipped[0].reason.includes('1MB'), '跳过原因写明上限')
  assert.equal(plan.skipped[0].path, 'big.bin', '跳过项路径已归一化')

  // 数量上限
  const many = Array.from({ length: RESOURCE_COUNT_MAX + 5 }, (_, i) => ({ path: `f${i}.txt`, size: 1, text: 'x' }))
  const capped = planResources(many, '')
  assert.equal(capped.resources.length, RESOURCE_COUNT_MAX, '资源数量被限制在上限内')
  assert.equal(capped.skipped.length, 5, '超出部分进 skipped')

  // 路径清洗
  assert.equal(normalizeRelPath('./a/b.txt'), 'a/b.txt', '去掉 ./ 前缀')
  assert.equal(normalizeRelPath('root/a.txt', 'root'), 'a.txt', '剥掉指定顶层目录')
  assert.equal(normalizeRelPath('dir/'), '', '目录项返回空串（应忽略）')
})

// T19 — 文件夹 / zip 批量导入规划
test('T19 planSkillImports（单目录 / 父目录多技能 / 缺 skill.md / 失败项留原因）', () => {
  const mkSkill = (name: string) => ['---', `name: ${name}`, 'description: 说明', '---', '', '正文'].join('\n')

  // 1. 直接选中技能目录
  const one = planSkillImports([
    { path: 'my-skill/skill.md', size: 10, text: mkSkill('A') },
    { path: 'my-skill/tpl/x.md', size: 3, text: 'x' }
  ])
  assert.equal(one.error, undefined, '无整体错误')
  assert.equal(one.packages.length, 1, '解析出 1 个技能')
  assert.equal(one.packages[0].draft.name, 'A', '名称来自 frontmatter')
  assert.deepEqual(one.packages[0].resources.map(r => r.path), ['tpl/x.md'], '资源相对技能根目录')
  assert.deepEqual(one.orphans, [], '无游离文件')

  // 2. 选中父目录（下面多个技能）
  const many = planSkillImports([
    { path: 'skills/skill-a/skill.md', size: 10, text: mkSkill('A') },
    { path: 'skills/skill-a/tpl/x.md', size: 3, text: 'x' },
    { path: 'skills/skill-b/skill.md', size: 10, text: mkSkill('B') },
    { path: 'skills/README.md', size: 3, text: 'readme' }
  ])
  assert.equal(many.packages.length, 2, '解析出 2 个技能')
  assert.deepEqual(many.packages.map(p => p.draft.name), ['A', 'B'], '两个技能各自独立')
  assert.deepEqual(many.packages[0].resources.map(r => r.path), ['tpl/x.md'], '资源归各自的技能')
  assert.deepEqual(many.orphans, ['skills/README.md'], '不属于任何技能的文件进 orphans')

  // 3. 完全没有 skill.md
  const none = planSkillImports([{ path: 'a/b.txt', size: 1, text: 'x' }])
  assert.equal(none.packages.length, 0, '没有技能')
  assert.ok(none.error?.includes(SKILL_FILE), '错误提示点名 skill.md')

  // 4. 有 skill.md 但字段缺失 → 进 failed 并写明原因
  const bad = planSkillImports([
    { path: 'x/skill.md', size: 10, text: ['---', 'name: A', '---', '', '正文'].join('\n') },
    { path: 'y/skill.md', size: 10, text: mkSkill('B') }
  ])
  assert.equal(bad.packages.length, 1, '合法的那个照常解析')
  assert.equal(bad.failed.length, 1, '非法的进 failed')
  assert.ok(bad.failed[0].error.includes('description'), '失败原因点名缺失字段')
  assert.equal(bad.failed[0].skillFile, 'x/skill.md', '失败项带出文件路径')

  // 5. 嵌套技能：资源归最深的那个 skill.md 所有
  const nested = planSkillImports([
    { path: 'outer/skill.md', size: 10, text: mkSkill('外') },
    { path: 'outer/demo/skill.md', size: 10, text: mkSkill('内') },
    { path: 'outer/demo/t.txt', size: 1, text: 't' },
    { path: 'outer/top.txt', size: 1, text: 't' }
  ])
  assert.equal(nested.packages.length, 2, '嵌套的两个技能都解析')
  const inner = nested.packages.find(p => p.draft.name === '内')
  const outer = nested.packages.find(p => p.draft.name === '外')
  assert.deepEqual(inner!.resources.map(r => r.path), ['t.txt'], '内层资源归内层技能')
  assert.deepEqual(outer!.resources.map(r => r.path), ['top.txt'], '外层只拿到自己目录下的文件')
})

// T20 — 闭环：技能 → skill.md + 资源 → zip → 解包 → 再解析，字段与资源不应丢失
test('T20 导出 zip 后可直接再次导入（目录层级与字段都不丢）', () => {
  const s = skill({
    name: '周报生成',
    description: '整理周报',
    version: '1.3.0',
    author: '我',
    category: '写作',
    tags: ['汇报'],
    whenToUse: '周末',
    tools: ['Read'],
    license: 'MIT',
    body: '# 步骤\n按项目分组',
    resources: [
      { path: 'templates/weekly.md', size: 10, encoding: 'text', data: '# 周报模板' },
      { path: 'scripts/run.py', size: 12, encoding: 'text', data: 'print(1)' }
    ]
  })

  // 1. 打包（与 utils/skillPackage.ts 的 skillZipEntries 一致的目录结构）
  const root = '周报生成'
  const entries: Record<string, Uint8Array> = {
    [`${root}/skill.md`]: strToU8(toSkillMd(s))
  }
  for (const r of s.resources) entries[`${root}/${r.path}`] = strToU8(r.data)

  // 2. 压缩再解包
  const unzipped = unzipSync(zipSync(entries, { level: 6 }))
  const files = Object.entries(unzipped)
    .filter(([p]) => !p.endsWith('/'))
    .map(([p, data]) => ({
      path: p,
      size: data.length,
      text: strFromU8(data)
    }))

  assert.deepEqual(files.map(f => f.path).sort(), [`${root}/scripts/run.py`, `${root}/skill.md`, `${root}/templates/weekly.md`], 'zip 内保持目录层级')

  // 3. 再导入
  const plan = planSkillImports(files)
  assert.equal(plan.error, undefined, '再导入无整体错误')
  assert.equal(plan.packages.length, 1, '解析出 1 个技能')
  const back = normalizeSkill({ ...plan.packages[0].draft, body: plan.packages[0].body, resources: plan.packages[0].resources })
  assert.ok(back, '可归一为技能')
  assert.equal(back!.name, '周报生成', 'name 不丢')
  assert.equal(back!.description, '整理周报', 'description 不丢')
  assert.equal(back!.version, '1.3.0', 'version 不丢')
  assert.equal(back!.author, '我', 'author 不丢')
  assert.equal(back!.category, '写作', 'category 不丢')
  assert.deepEqual(back!.tags, ['汇报'], 'tags 不丢')
  assert.equal(back!.whenToUse, '周末', 'when_to_use 不丢')
  assert.deepEqual(back!.tools, ['Read'], 'tools 不丢')
  assert.equal(back!.license, 'MIT', 'license 不丢')
  assert.ok(back!.body.includes('按项目分组'), '正文不丢')
  assert.deepEqual(back!.resources.map(r => r.path).sort(), ['scripts/run.py', 'templates/weekly.md'], '资源路径不丢（已剥掉顶层目录名）')
  assert.equal(back!.resources.find(r => r.path === 'templates/weekly.md')!.data, '# 周报模板', '资源内容不丢')
})

// T21 — 技能图标分类：空值回落默认内置图标；图片地址 / emoji 各自走对应渲染分支
test('T21 classifySkillIcon 空值回落默认、地址与 emoji 分流', () => {
  // 未设置图标 → 内置矢量图标（不再是 🧩）
  for (const empty of [undefined, null, '', '   ', 123, {}]) {
    const r = classifySkillIcon(empty)
    assert.equal(r.kind, 'builtin', '空/非法值应回落 builtin：' + JSON.stringify(empty))
    assert.equal(r.value, SMART_SKILL_DEFAULT_ICON)
  }

  // 图标库图片（本站路径 / 自定义上传 dataUrl / 外链）→ image
  assert.deepEqual(classifySkillIcon('/icons/deepseek.svg'), {
    kind: 'image',
    value: '/icons/deepseek.svg'
  })
  const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
  assert.deepEqual(classifySkillIcon(dataUrl), { kind: 'image', value: dataUrl })
  assert.deepEqual(classifySkillIcon('https://example.com/a.png'), {
    kind: 'image',
    value: 'https://example.com/a.png'
  })

  // v1 迁移过来的 emoji → text 原样显示
  assert.deepEqual(classifySkillIcon('📝'), { kind: 'text', value: '📝' })
  // 前后空白先裁掉，避免存进脏空格
  assert.deepEqual(classifySkillIcon('  📝  '), { kind: 'text', value: '📝' })
  // 非图片协议（如 javascript:）不当图片，按文本处理
  assert.equal(classifySkillIcon('javascript:alert(1)').kind, 'text')
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
