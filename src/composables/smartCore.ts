/**
 * 智能工作台纯逻辑引擎（零 vue / 零 pinia / 零 DOM，node --experimental-strip-types 可测）
 * ------------------------------------------------------------------
 * 承载：技能与提示词的归一化、过滤排序、校验、模板变量解析与填充、
 *       导入导出信封的序列化与解析（JSON 信封 / Markdown 单条）。
 * 所有函数不改入参，返回新值；非法输入一律降级而非抛错，保证 UI 永不崩。
 */

import type {
  SmartEnvelope,
  SmartImportPreview,
  SmartPrompt,
  SmartPromptVariable,
  SmartSkill
} from '@/types'

// ==================== 常量与上限 ====================

export const SMART_SKILL_KIND = 'smart-skills'
export const SMART_PROMPT_KIND = 'smart-prompts'
export const SMART_ENVELOPE_VERSION = 1

export const SMART_NAME_MAX = 60
export const SMART_DESC_MAX = 200
export const SMART_CONTENT_MAX = 20000
export const SMART_TAG_MAX = 16
export const SMART_TAGS_MAX = 8
export const UNCATEGORIZED = '未分类'
/** 分类筛选的「全部」哨兵值（分类名不可能等于它） */
export const UNCATEGORIZED_ALL = '__all__'

/** 模板变量：{{name}}，name 允许中英文/数字/下划线，1-32 字 */
export const VAR_PATTERN = /\{\{\s*([A-Za-z0-9_\u4e00-\u9fa5]{1,32})\s*\}\}/g

// ==================== 通用小工具 ====================

/** 生成 id：`sk_`/`pm_` + 时间戳 + 随机后缀，避免同毫秒批量创建撞号 */
export function makeSmartId(prefix: 'sk' | 'pm'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 截断字符串到指定长度（按 code point，避免中文被切断） */
export function truncateText(text: string, max: number): string {
  if (typeof text !== 'string') return ''
  const chars = [...text]
  return chars.length <= max ? text : chars.slice(0, max).join('')
}

/** 归一化标签数组：去空白、去空、去重、截断、限量 */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const tag = raw.trim()
    if (!tag) continue
    if (!out.includes(tag)) out.push(truncateText(tag, SMART_TAG_MAX))
    if (out.length >= SMART_TAGS_MAX) break
  }
  return out
}

/** 归一化分类：空值回落「未分类」 */
export function normalizeCategory(input: unknown): string {
  if (typeof input !== 'string') return UNCATEGORIZED
  const v = input.trim()
  return v || UNCATEGORIZED
}

function toInt(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

/**
 * 文本字段取值：字符串直接用；数字/布尔等标量转为字符串（导入的 JSON 里
 * `content: 456` 这类写法不该被当成垃圾丢掉）；其余类型回落空串。
 */
function toText(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

// ==================== 技能归一化 ====================

/**
 * 归一化单条技能：缺字段补默认、类型纠正、长度截断，幂等。
 * 非法（非对象 / 无名称）返回 null —— 由调用方计入「跳过」。
 */
export function normalizeSkill(raw: unknown): SmartSkill | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const name = truncateText(toText(o.name).trim(), SMART_NAME_MAX)
  const content = toText(o.content)
  // 名称与正文都为空 → 视为垃圾数据
  if (!name && !content.trim()) return null
  const now = Date.now()
  const createdAt = toInt(o.createdAt, now)
  return {
    id: typeof o.id === 'string' && o.id ? o.id : makeSmartId('sk'),
    name: name || '未命名技能',
    category: normalizeCategory(o.category),
    icon: typeof o.icon === 'string' && o.icon.trim() ? o.icon.trim() : '\u{1F9E9}',
    tags: normalizeTags(o.tags),
    version: typeof o.version === 'string' && o.version.trim() ? truncateText(o.version.trim(), 20) : '1.0.0',
    author: typeof o.author === 'string' ? truncateText(o.author.trim(), SMART_NAME_MAX) : '',
    description: typeof o.description === 'string' ? truncateText(o.description.trim(), SMART_DESC_MAX) : '',
    content: truncateText(content, SMART_CONTENT_MAX),
    usageCount: Math.max(0, toInt(o.usageCount, 0)),
    lastUsedAt: typeof o.lastUsedAt === 'number' && Number.isFinite(o.lastUsedAt) ? o.lastUsedAt : null,
    isBuiltIn: o.isBuiltIn === true ? true : undefined,
    createdAt,
    updatedAt: toInt(o.updatedAt, createdAt || now)
  }
}

/** 归一化技能数组（过滤非法项，不改入参） */
export function normalizeSkills(input: unknown): SmartSkill[] {
  if (!Array.isArray(input)) return []
  const out: SmartSkill[] = []
  for (const raw of input) {
    const s = normalizeSkill(raw)
    if (s) out.push(s)
  }
  return out
}

// ==================== 提示词归一化 ====================

/** 归一化单条提示词；非法返回 null */
export function normalizePrompt(raw: unknown): SmartPrompt | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const title = truncateText(toText(o.title).trim(), SMART_NAME_MAX)
  const content = toText(o.content)
  if (!title && !content.trim()) return null
  const now = Date.now()
  const createdAt = toInt(o.createdAt, now)
  return {
    id: typeof o.id === 'string' && o.id ? o.id : makeSmartId('pm'),
    title: title || '未命名提示词',
    category: normalizeCategory(o.category),
    tags: normalizeTags(o.tags),
    model: typeof o.model === 'string' ? truncateText(o.model.trim(), 40) : '',
    content: truncateText(content, SMART_CONTENT_MAX),
    // 变量恒由正文推导，避免与正文不一致（存量 variables 仅作元信息合并来源）
    variables: mergeVariables(parseVariables(content), o.variables),
    isFavorite: o.isFavorite === true,
    usageCount: Math.max(0, toInt(o.usageCount, 0)),
    lastUsedAt: typeof o.lastUsedAt === 'number' && Number.isFinite(o.lastUsedAt) ? o.lastUsedAt : null,
    isBuiltIn: o.isBuiltIn === true ? true : undefined,
    createdAt,
    updatedAt: toInt(o.updatedAt, createdAt || now)
  }
}

export function normalizePrompts(input: unknown): SmartPrompt[] {
  if (!Array.isArray(input)) return []
  const out: SmartPrompt[] = []
  for (const raw of input) {
    const p = normalizePrompt(raw)
    if (p) out.push(p)
  }
  return out
}

// ==================== 模板变量 ====================

/** 从正文提取变量名（按首次出现顺序去重） */
export function parseVariables(content: unknown): SmartPromptVariable[] {
  if (typeof content !== 'string' || !content) return []
  const out: SmartPromptVariable[] = []
  const seen = new Set<string>()
  // 重置 lastIndex：模块级正则带 g，多次 exec/匹配必须归零，否则第二次起漏匹配
  VAR_PATTERN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = VAR_PATTERN.exec(content)) !== null) {
    const name = m[1]
    if (!seen.has(name)) {
      seen.add(name)
      out.push({ name })
    }
  }
  return out
}

/**
 * 合并「解析出的变量」与「存量变量元信息」：
 * 以正文解析结果为准（顺序与存在性），元信息（desc/defaultValue）有则继承。
 */
export function mergeVariables(parsed: SmartPromptVariable[], stored: unknown): SmartPromptVariable[] {
  const meta = new Map<string, { desc?: string; defaultValue?: string }>()
  if (Array.isArray(stored)) {
    for (const v of stored) {
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      if (typeof o.name !== 'string' || !o.name) continue
      meta.set(o.name, {
        desc: typeof o.desc === 'string' ? o.desc : undefined,
        defaultValue: typeof o.defaultValue === 'string' ? o.defaultValue : undefined
      })
    }
  }
  return parsed.map(v => {
    const m = meta.get(v.name)
    if (!m) return { ...v }
    return { ...v, ...(m.desc ? { desc: m.desc } : {}), ...(m.defaultValue ? { defaultValue: m.defaultValue } : {}) }
  })
}

/**
 * 用输入值填充模板：命中 `{{name}}` 替换为对应值。
 * 未提供值的变量**保留原占位符**（不静默清空，避免用户以为已填）。
 * @returns { text, missing } —— missing 为未填写的变量名
 */
export function fillTemplate(content: string, values: Record<string, string>): { text: string; missing: string[] } {
  const src = typeof content === 'string' ? content : ''
  const missing: string[] = []
  const seen = new Set<string>()
  const text = src.replace(VAR_PATTERN, (whole, name: string) => {
    const raw = values?.[name]
    const v = typeof raw === 'string' ? raw.trim() : ''
    if (!v) {
      if (!seen.has(name)) {
        seen.add(name)
        missing.push(name)
      }
      return whole
    }
    return v
  })
  return { text, missing }
}

// ==================== 过滤与排序 ====================

export interface SmartFilter {
  /** 关键字：命中名称/标题、描述、标签、正文 */
  q?: string
  category?: string
  /** 标签：多选，命中任一即算（OR） */
  tags?: string[]
  /** 提示词专用：只看收藏 */
  favoriteOnly?: boolean
}

export type SmartSort = 'updated' | 'name' | 'usage'

/** 关键字匹配（大小写不敏感） */
function matchKeyword(item: SmartSkill | SmartPrompt, q: string): boolean {
  const kw = q.trim().toLowerCase()
  if (!kw) return true
  const name = 'name' in item ? item.name : item.title
  const haystack = [name, item.category, item.tags.join(' '), item.content, ('description' in item ? item.description : '')]
    .join('\n')
    .toLowerCase()
  return haystack.includes(kw)
}

/** 通用过滤（技能与提示词共用） */
export function filterSmart<T extends SmartSkill | SmartPrompt>(items: T[], f: SmartFilter): T[] {
  const tags = Array.isArray(f.tags) ? f.tags.filter(Boolean) : []
  return items.filter(item => {
    if (!matchKeyword(item, f.q ?? '')) return false
    if (f.category && f.category !== UNCATEGORIZED_ALL && item.category !== f.category) return false
    if (tags.length && !tags.some(t => item.tags.includes(t))) return false
    if (f.favoriteOnly && 'isFavorite' in item && !item.isFavorite) return false
    return true
  })
}

/** 排序（不改入参） */
export function sortSmart<T extends SmartSkill | SmartPrompt>(items: T[], sort: SmartSort): T[] {
  const out = [...items]
  if (sort === 'name') {
    return out.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'zh-Hans-CN'))
  }
  if (sort === 'usage') {
    return out.sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt)
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

function nameOf(item: SmartSkill | SmartPrompt): string {
  return 'name' in item ? item.name : item.title
}

/** 提取全部分类（去重，按首现顺序） */
export function categoriesOf<T extends SmartSkill | SmartPrompt>(items: T[]): string[] {
  const out: string[] = []
  for (const it of items) {
    if (!out.includes(it.category)) out.push(it.category)
  }
  return out.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

/** 提取全部标签（去重，按首现顺序） */
export function tagsOf<T extends SmartSkill | SmartPrompt>(items: T[]): string[] {
  const out: string[] = []
  for (const it of items) {
    for (const t of it.tags) if (!out.includes(t)) out.push(t)
  }
  return out
}

// ==================== 校验 ====================

export interface SmartIssue {
  field: string
  message: string
}

/** 校验技能输入（返回全部问题，空数组即通过） */
export function validateSkill(input: Partial<SmartSkill>, existing: SmartSkill[], editingId?: string | null): SmartIssue[] {
  const out: SmartIssue[] = []
  const name = (input.name ?? '').trim()
  if (!name) out.push({ field: 'name', message: '请填写技能名称' })
  else if ([...name].length > SMART_NAME_MAX) out.push({ field: 'name', message: `名称不能超过 ${SMART_NAME_MAX} 字` })
  else if (isNameTaken(existing, name, editingId)) out.push({ field: 'name', message: `已存在同名技能「${name}」` })
  if (!(input.content ?? '').trim()) out.push({ field: 'content', message: '请填写技能正文' })
  else if ([...input.content!].length > SMART_CONTENT_MAX) out.push({ field: 'content', message: `正文不能超过 ${SMART_CONTENT_MAX} 字` })
  return out
}

/** 校验提示词输入 */
export function validatePrompt(input: Partial<SmartPrompt>, existing: SmartPrompt[], editingId?: string | null): SmartIssue[] {
  const out: SmartIssue[] = []
  const title = (input.title ?? '').trim()
  if (!title) out.push({ field: 'title', message: '请填写提示词标题' })
  else if ([...title].length > SMART_NAME_MAX) out.push({ field: 'title', message: `标题不能超过 ${SMART_NAME_MAX} 字` })
  else if (isNameTaken(existing, title, editingId)) out.push({ field: 'title', message: `已存在同名提示词「${title}」` })
  if (!(input.content ?? '').trim()) out.push({ field: 'content', message: '请填写提示词正文' })
  else if ([...input.content!].length > SMART_CONTENT_MAX) out.push({ field: 'content', message: `正文不能超过 ${SMART_CONTENT_MAX} 字` })
  return out
}

/** 同名判定（编辑自身不算重复） */
export function isNameTaken<T extends SmartSkill | SmartPrompt>(existing: T[], name: string, editingId?: string | null): boolean {
  const target = name.trim()
  if (!target) return false
  return existing.some(it => nameOf(it) === target && (!editingId || it.id !== editingId))
}

// ==================== 导入导出 ====================

/** 打包为导出信封 */
export function buildEnvelope<T>(kind: SmartEnvelope<T>['kind'], items: T[]): SmartEnvelope<T> {
  return { kind, version: SMART_ENVELOPE_VERSION, exportedAt: Date.now(), items }
}

export type ParseResult<T> =
  | { ok: true; items: T[] }
  | { ok: false; reason: 'not-json' | 'bad-structure' | 'kind-mismatch' | 'version-too-new'; message: string }

/**
 * 解析导入文本（JSON 信封，也容忍「裸数组」与「单对象」两种简化写法）。
 * @param expectKind 期望的资产类型，不符则拒绝，避免把提示词导进技能库
 */
export function parseEnvelope<T>(
  text: string,
  expectKind: SmartEnvelope<T>['kind'],
  normalizeOne: (raw: unknown) => T | null
): ParseResult<T> {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'not-json', message: '文件不是合法的 JSON' }
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'bad-structure', message: '文件内容不是有效的对象' }
  }
  const o = data as Record<string, unknown>

  // 信封形态：校验 kind 与 version
  if (typeof o.kind === 'string') {
    if (o.kind !== expectKind) {
      const want = expectKind === SMART_SKILL_KIND ? '技能' : '提示词'
      return { ok: false, reason: 'kind-mismatch', message: `文件是${o.kind === SMART_SKILL_KIND ? '技能' : o.kind === SMART_PROMPT_KIND ? '提示词' : o.kind}数据，与当前「${want}」页面不匹配` }
    }
    const v = typeof o.version === 'number' ? o.version : 1
    if (v > SMART_ENVELOPE_VERSION) {
      return { ok: false, reason: 'version-too-new', message: `文件版本 v${v} 高于当前支持的 v${SMART_ENVELOPE_VERSION}，请升级后再导入` }
    }
    if (!Array.isArray(o.items)) {
      return { ok: false, reason: 'bad-structure', message: '文件缺少 items 数组' }
    }
    const items: T[] = []
    for (const raw of o.items) {
      const it = normalizeOne(raw)
      if (it) items.push(it)
    }
    if (items.length === 0) {
      return { ok: false, reason: 'bad-structure', message: '文件中没有可导入的有效条目' }
    }
    return { ok: true, items }
  }

  // 裸数组 / 单对象：宽容处理
  const list = Array.isArray(data) ? data : [data]
  const items: T[] = []
  for (const raw of list) {
    const it = normalizeOne(raw)
    if (it) items.push(it)
  }
  if (items.length === 0) {
    return { ok: false, reason: 'bad-structure', message: '文件中没有可导入的有效条目' }
  }
  return { ok: true, items }
}

/** 导出为 Markdown（技能专用：YAML 元信息头 + 正文），便于阅读与 git 托管 */
export function skillToMarkdown(s: SmartSkill): string {
  const esc = (v: string) => v.replace(/"/g, '\\"')
  const tags = s.tags.length ? `[${s.tags.map(t => `"${esc(t)}"`).join(', ')}]` : '[]'
  return [
    '---',
    `kind: ${SMART_SKILL_KIND}`,
    `version: ${SMART_ENVELOPE_VERSION}`,
    `name: "${esc(s.name)}"`,
    `category: "${esc(s.category)}"`,
    `tags: ${tags}`,
    s.version ? `skillVersion: "${esc(s.version)}"` : '',
    s.author ? `author: "${esc(s.author)}"` : '',
    s.description ? `description: "${esc(s.description)}"` : '',
    '---',
    '',
    s.content
  ].filter(line => line !== '').join('\n')
}

/**
 * 从 Markdown 还原技能：优先解析 YAML 头，无头时以 fallbackName 为名称、全文为正文。
 * 只解析本项目导出的固定字段，不引入 YAML 库。
 */
export function markdownToSkill(md: string, fallbackName = ''): SmartSkill | null {
  if (typeof md !== 'string' || !md.trim()) return null
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(md)
  if (!m) {
    return normalizeSkill({ name: fallbackName || '导入的技能', content: md })
  }
  const header = m[1]
  const body = m[2]
  const field = (key: string): string => {
    const fm = new RegExp(`^${key}:\\s*"?([^"\\n]*)"?\\s*$`, 'm').exec(header)
    return fm ? fm[1].trim() : ''
  }
  const tagsRaw = /^tags:\s*\[(.*?)\]\s*$/m.exec(header)
  const tags = tagsRaw
    ? tagsRaw[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
    : []
  return normalizeSkill({
    name: field('name') || fallbackName || '导入的技能',
    category: field('category') || UNCATEGORIZED,
    tags,
    version: field('skillVersion') || '1.0.0',
    author: field('author'),
    description: field('description'),
    content: body
  })
}

/**
 * 计算导入预览：与现有库对比，得出新增 / 更新 / 跳过。
 * - id 相同 → 更新
 * - 名称相同 → 更新（避免同名双胞胎）
 * - 其余 → 新增
 * 更新以 updatedAt 新者胜：导入条目更旧则不计入更新。
 */
export function planImport<T extends SmartSkill | SmartPrompt>(
  incoming: T[],
  existing: T[]
): SmartImportPreview<T> {
  const byId = new Map(existing.map(it => [it.id, it]))
  const byName = new Map(existing.map(it => [nameOf(it), it]))
  const added: T[] = []
  const updated: T[] = []
  let skipped = 0

  for (const item of incoming) {
    const hit = byId.get(item.id) ?? byName.get(nameOf(item))
    if (!hit) {
      added.push(item)
      continue
    }
    // 导入条目比库内旧 → 跳过（不倒退）
    if (item.updatedAt <= hit.updatedAt) {
      skipped++
      continue
    }
    // 以库内 id 为准，避免同 id 不同 id 的重复插入
    updated.push({ ...item, id: hit.id })
  }
  return { added, updated, skipped }
}

/** 应用导入：返回合并后的新数组（不改入参），新增追加、更新就地替换 */
export function applyImport<T extends SmartSkill | SmartPrompt>(
  existing: T[],
  plan: SmartImportPreview<T>
): T[] {
  const map = new Map(plan.updated.map(it => [it.id, it]))
  const merged = existing.map(it => map.get(it.id) ?? it)
  // 同名但不同 id（planImport 已统一 id，理论上不会重复）兜底过滤
  const names = new Set(merged.map(nameOf))
  const fresh = plan.added.filter(it => !names.has(nameOf(it)))
  return [...merged, ...fresh]
}

// ==================== 统计 ====================

export interface SmartStats {
  skillCount: number
  promptCount: number
  /** 本月新增（技能 + 提示词） */
  monthAdded: number
  /** 累计使用次数 */
  totalUsage: number
  /** 分类分布：{ 分类名: 数量 } */
  byCategory: { category: string; skills: number; prompts: number }[]
  /** 最近使用 Top N（跨技能与提示词，按 lastUsedAt 倒序） */
  recent: { id: string; type: 'skill' | 'prompt'; name: string; lastUsedAt: number }[]
}

/** 汇总统计（纯函数，供概览卡片消费） */
export function calcSmartStats(skills: SmartSkill[], prompts: SmartPrompt[], now = Date.now(), topN = 5): SmartStats {
  const d = new Date(now)
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  const monthAdded =
    skills.filter(s => s.createdAt >= monthStart).length + prompts.filter(p => p.createdAt >= monthStart).length

  const catMap = new Map<string, { category: string; skills: number; prompts: number }>()
  const bump = (c: string, kind: 'skills' | 'prompts') => {
    const cur = catMap.get(c) ?? { category: c, skills: 0, prompts: 0 }
    cur[kind] += 1
    catMap.set(c, cur)
  }
  for (const s of skills) bump(s.category, 'skills')
  for (const p of prompts) bump(p.category, 'prompts')
  const byCategory = [...catMap.values()].sort(
    (a, b) => b.skills + b.prompts - (a.skills + a.prompts) || a.category.localeCompare(b.category, 'zh-Hans-CN')
  )

  const recent = [
    ...skills.filter(s => s.lastUsedAt !== null).map(s => ({ id: s.id, type: 'skill' as const, name: s.name, lastUsedAt: s.lastUsedAt as number })),
    ...prompts.filter(p => p.lastUsedAt !== null).map(p => ({ id: p.id, type: 'prompt' as const, name: p.title, lastUsedAt: p.lastUsedAt as number }))
  ]
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, topN)

  return {
    skillCount: skills.length,
    promptCount: prompts.length,
    monthAdded,
    totalUsage:
      skills.reduce((sum, s) => sum + s.usageCount, 0) + prompts.reduce((sum, p) => sum + p.usageCount, 0),
    byCategory,
    recent
  }
}

// ==================== 内置示例 ====================

/** 内置示例技能：首次进入播种，可删除；「恢复示例」按 id 幂等补回 */
export const BUILT_IN_SKILLS: SmartSkill[] = [
  {
    id: 'sk_builtin_prd',
    name: '需求文档生成',
    category: '写作',
    icon: '\u{1F4DD}',
    tags: ['产品', '文档'],
    version: '1.0.0',
    author: '内置示例',
    description: '把一句话想法展开为结构化的需求说明文档',
    content:
      '你是一名资深产品经理。请把下面这个想法展开为一份需求说明文档。\n\n' +
      '想法：{{idea}}\n目标用户：{{audience}}\n\n' +
      '请按以下结构输出：\n' +
      '1. 背景与问题\n2. 目标与非目标\n3. 用户故事（不少于 3 条）\n' +
      '4. 功能需求（FR 编号 + 描述 + 优先级）\n5. 非功能需求\n6. 异常与边界\n7. 验收标准\n\n' +
      '要求：语言克制、结论先行；每条需求可独立验收。',
    usageCount: 0,
    lastUsedAt: null,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'sk_builtin_review',
    name: '代码评审清单',
    category: '研发',
    icon: '\u{1F50D}',
    tags: ['代码', '质量'],
    version: '1.0.0',
    author: '内置示例',
    description: '按统一清单评审一段代码，输出可执行的修改建议',
    content:
      '你是代码评审专家。请评审下面的代码，语言：{{语言}}\n\n' +
      '代码：\n```\n{{代码}}\n```\n\n' +
      '按以下维度逐项检查并给出结论（通过 / 需修改 + 具体行号 + 修改建议）：\n' +
      '- 正确性：边界、空值、并发、异常路径\n- 可读性：命名、函数长度、重复代码\n' +
      '- 性能：不必要的循环/查询、内存占用\n- 安全：注入、越权、敏感信息泄露\n' +
      '- 可维护性：耦合、魔法值、缺少测试\n\n' +
      '最后给出「必须改 / 建议改」两档清单，不要泛泛而谈。',
    usageCount: 0,
    lastUsedAt: null,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'sk_builtin_weekly',
    name: '周报生成',
    category: '写作',
    icon: '\u{1F4C5}',
    tags: ['汇报'],
    version: '1.0.0',
    author: '内置示例',
    description: '把零散的工作记录整理为结构化周报',
    content:
      '请把下面的工作记录整理成一份周报。\n\n' +
      '本周记录：{{记录}}\n\n' +
      '输出结构：\n1. 本周进展（按项目分组，每条含「做了什么 + 结果/数据」）\n' +
      '2. 风险与阻塞（需要谁协助）\n3. 下周计划（不超过 3 条，可验证）\n\n' +
      '要求：去掉流水账，突出结果；没有数据的地方写「暂无」而不是编造。',
    usageCount: 0,
    lastUsedAt: null,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0
  }
]

/** 内置示例提示词 */
export const BUILT_IN_PROMPTS: SmartPrompt[] = [
  {
    id: 'pm_builtin_explain',
    title: '概念讲解（费曼式）',
    category: '学习',
    tags: ['讲解'],
    model: '通用',
    content:
      '请用费曼学习法讲解「{{概念}}」。\n\n' +
      '要求：\n1. 先用一句大白话讲清楚它是什么\n2. 再给一个 {{领域}} 里的具体例子\n' +
      '3. 指出新手最常见的 2 个误解\n4. 最后给一个 3 句话的总结\n\n' +
      '语言风格：{{风格}}，避免堆砌术语。',
    variables: [],
    isFavorite: true,
    usageCount: 0,
    lastUsedAt: null,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'pm_builtin_sql',
    title: 'SQL 优化建议',
    category: '研发',
    tags: ['数据库', '性能'],
    model: '通用',
    content:
      '你是数据库性能专家。请优化下面的 SQL（数据库：{{数据库类型}}）。\n\n' +
      'SQL：\n```sql\n{{SQL}}\n```\n\n' +
      '表结构与数据量：{{表信息}}\n\n' +
      '请给出：\n1. 当前 SQL 的性能瓶颈（结合执行计划推断）\n2. 改写后的 SQL\n' +
      '3. 建议新增/调整的索引（含理由与代价）\n4. 预期提升量级与验证方法',
    variables: [],
    isFavorite: false,
    usageCount: 0,
    lastUsedAt: null,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'pm_builtin_email',
    title: '商务邮件改写',
    category: '写作',
    tags: ['沟通'],
    model: '通用',
    content:
      '请把下面的草稿改写为一封得体的商务邮件。\n\n' +
      '收件人：{{收件人身份}}\n目的：{{目的}}\n语气：{{语气}}\n草稿：{{草稿}}\n\n' +
      '要求：主题行不超过 20 字；正文先说结论再说原因；不超过 200 字；' +
      '结尾给出明确的下一步与时间。',
    variables: [],
    isFavorite: false,
    usageCount: 0,
    lastUsedAt: null,
    isBuiltIn: true,
    createdAt: 0,
    updatedAt: 0
  }
]
