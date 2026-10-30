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
  SmartPromptImage,
  SmartPromptVariable,
  SmartSkill,
  SmartSkillResource,
  SmartWorkflow
} from '@/types'
import { migrateLegacySkill } from './skillPackageCore.ts'

// ==================== 墓碑（软删除）====================
/**
 * 为什么这里不复用 composables/tombstoneCore.ts：
 * 那里的 SyncStamp 规定 `updatedAt?: string`，而智能工作台三条资产的时间戳是**数字**
 * （Date.now()，概览/卡片都用 relTime(number)）。硬套会发生类型冲突，改了又会牵连
 * blog / teacher / todos / notes / ledger / diary / genealogy 七个模块。
 * 因此这里保留同一套语义（deletedAt 墓碑 + ver 逻辑时钟 + clientId tie-break），
 * 只把时间戳换回数字；比较规则与 compareStamp 一致：ver → updatedAt → clientId。
 */

/** 智能资产最小戳结构（技能 / 提示词 / 工作流共用） */
export interface SmartStamp {
  id: string
  updatedAt: number
  ver?: number
  clientId?: string
  deletedAt?: string | null
}

/** 是否墓碑（已删除） */
export function isSmartDeleted(item: { deletedAt?: string | null } | null | undefined): boolean {
  return !!item && !!item.deletedAt
}

/**
 * 展示/统计用：剔除墓碑。
 * ⚠ 顺序不可颠倒：合并（含墓碑）→ 落库 → **再**用本函数过滤展示。
 */
export function activeSmart<T extends { deletedAt?: string | null }>(items: T[] | undefined | null): T[] {
  return (items ?? []).filter(i => !isSmartDeleted(i))
}

/**
 * 归一化函数内保留墓碑与版本戳（对应 tombstoneCore.keepStamp）。
 * 三个 normalize* 都是"重建对象、只拷已知字段"，漏了这三步删除状态会被抹掉 → 合并时复活。
 */
export function keepSmartStamp<T extends { ver?: number; clientId?: string; deletedAt?: string | null }>(
  target: T,
  src: unknown
): T {
  const s = (src ?? {}) as Partial<SmartStamp>
  if (typeof s.deletedAt === 'string' && s.deletedAt) target.deletedAt = s.deletedAt
  if (typeof s.ver === 'number') target.ver = s.ver
  if (typeof s.clientId === 'string' && s.clientId) target.clientId = s.clientId
  return target
}

/** 软删除：写墓碑 + updatedAt 前进 + ver+1（记录保留在数组里，随信封上云） */
export function markSmartDeleted<T extends SmartStamp>(item: T, now = Date.now(), clientId?: string): T {
  return {
    ...item,
    deletedAt: new Date(now).toISOString(),
    updatedAt: now,
    ver: (item.ver ?? 0) + 1,
    ...(clientId ? { clientId } : {})
  }
}

/** 普通变更：推进 ver 与 updatedAt（不写墓碑） */
export function bumpSmartStamp<T extends SmartStamp>(item: T, now = Date.now(), clientId?: string): T {
  return {
    ...item,
    updatedAt: now,
    ver: (item.ver ?? 0) + 1,
    ...(clientId ? { clientId } : {})
  }
}

/**
 * 墓碑感知合并（对应 tombstoneCore.mergeTombstonedById）：
 * 按 id 并集 + 逐条取新，墓碑同样参与比较 —— 于是「本端墓碑 vs 云端活记录」保持删除。
 */
export function mergeSmartById<T extends SmartStamp>(local: T[] | undefined | null, remote: T[] | undefined | null): T[] {
  const map = new Map<string, T>()
  for (const item of [...(local ?? []), ...(remote ?? [])]) {
    const prev = map.get(item.id)
    if (!prev || compareSmartStamp(item, prev) > 0) map.set(item.id, item)
  }
  return Array.from(map.values())
}

/** 版本比较：ver → updatedAt（数字）→ clientId；>0 表示 a 更新 */
export function compareSmartStamp(a: SmartStamp, b: SmartStamp): number {
  const va = a.ver ?? 0
  const vb = b.ver ?? 0
  if (va !== vb) return va > vb ? 1 : -1
  const ua = Number(a.updatedAt) || 0
  const ub = Number(b.updatedAt) || 0
  if (ua !== ub) return ua > ub ? 1 : -1
  const ca = a.clientId ?? ''
  const cb = b.clientId ?? ''
  if (ca !== cb) return ca > cb ? 1 : -1
  return 0
}

/** 墓碑保留期（天）：与 tombstoneCore 的 TOMBSTONE_TTL_DAYS 保持一致 */
export const SMART_TOMBSTONE_TTL_DAYS = 7

/**
 * 墓碑 GC：物理清除超过保留期的墓碑。
 * 调用时机必须在**墓碑已成功推送上云之后**，否则对端会把它当新增补回来。
 */
export function gcSmartTombstones<T extends SmartStamp>(items: T[], now = Date.now(), ttlDays = SMART_TOMBSTONE_TTL_DAYS): { kept: T[]; purged: number } {
  const ttl = ttlDays * 24 * 60 * 60 * 1000
  const kept: T[] = []
  let purged = 0
  for (const item of items) {
    if (!item.deletedAt) {
      kept.push(item) // 活记录
      continue
    }
    const t = Date.parse(item.deletedAt)
    if (Number.isFinite(t) && now - t >= ttl) {
      purged += 1 // 过期墓碑 → 物理清除
      continue
    }
    kept.push(item) // 未过期，或 deletedAt 非法（保守保留）
  }
  return { kept, purged }
}

// ==================== 常量与上限 ====================

// 技能不再有 JSON 信封：技能 = 一个目录，导入导出统一走 zip（见 utils/skillPackage）。
// 提示词与工作流走 JSON 信封（kind 区分）。
export const SMART_PROMPT_KIND = 'smart-prompts'
export const SMART_WORKFLOW_KIND = 'smart-workflows'
export const SMART_ENVELOPE_VERSION = 1

export const SMART_NAME_MAX = 60
export const SMART_DESC_MAX = 200
export const SMART_CONTENT_MAX = 20000
export const SMART_TAG_MAX = 16
export const SMART_TAGS_MAX = 8
/** 单条资源体积上限（与 skillPackageCore 保持一致，供界面提示复用） */
export const SMART_RESOURCE_FILE_MAX = 1024 * 1024
/** 单条提示词附属参考图上限（每张已压缩到 ~300KB JPEG，9 张约 2.7MB，避免信封过大） */
export const SMART_PROMPT_IMAGES_MAX = 9
export const UNCATEGORIZED = '未分类'
/** 分类筛选的「全部」哨兵值（分类名不可能等于它） */
export const UNCATEGORIZED_ALL = '__all__'

// ==================== 技能图标 ====================

/**
 * 技能未设置图标时使用的内置矢量图标名（对应 Icon.vue / iconPaths 的 ICON_PATHS）。
 * 走内置矢量图标而不是 emoji：可跟随主题色、与站点图标视觉统一。
 */
export const SMART_SKILL_DEFAULT_ICON = 'toolbox'

/**
 * 技能图标的三个来源，渲染层据此走不同分支：
 *   - image  ：图标库图片（/icons/xxx.svg、自定义上传的 dataUrl、外链图片）→ <img>
 *   - text   ：v1 迁移过来的 emoji 等文本 → 原样显示
 *   - builtin：未设置图标 → 用 SMART_SKILL_DEFAULT_ICON 走 <Icon>
 */
export type SkillIconKind = 'builtin' | 'image' | 'text'

export interface SkillIconInfo {
  kind: SkillIconKind
  value: string
}

/** 与 composables/categoryIcon 的 isImageIcon 同规则，此处内联以保持 core 零依赖 */
function looksLikeImageIcon(v: string): boolean {
  return /^data:image\//i.test(v) || v.startsWith('/') || /^https?:\/\//i.test(v)
}

/** 归一化技能图标：空值回落默认内置图标；非字符串同样回落。 */
export function classifySkillIcon(raw: unknown): SkillIconInfo {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return { kind: 'builtin', value: SMART_SKILL_DEFAULT_ICON }
  if (looksLikeImageIcon(v)) return { kind: 'image', value: v }
  return { kind: 'text', value: v }
}

/** 模板变量：{{name}}，name 允许中英文/数字/下划线，1-32 字 */
export const VAR_PATTERN = /\{\{\s*([A-Za-z0-9_\u4e00-\u9fa5]{1,32})\s*\}\}/g

// ==================== 通用小工具 ====================

/** 生成 id：`sk_`/`pm_`/`wf_`/`img_` + 时间戳 + 随机后缀，避免同毫秒批量创建撞号 */
export function makeSmartId(prefix: 'sk' | 'pm' | 'wf' | 'img' | 'ai'): string {
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
  // v1 扁平结构（name/description/content/icon）先迁移到 v2（body/resources/…），幂等
  const o = migrateLegacySkill(raw as Record<string, unknown>)
  const name = truncateText(toText(o.name).trim(), SMART_NAME_MAX)
  const body = toText(o.body)
  // 名称与正文都为空 → 视为垃圾数据
  if (!name && !body.trim()) return null
  const now = Date.now()
  const createdAt = toInt(o.createdAt, now)
  // 末尾 keepSmartStamp：把 deletedAt / ver / clientId 原样带回（漏了墓碑就在这里被抹掉 → 合并时复活）
  return keepSmartStamp<SmartSkill>({
    id: typeof o.id === 'string' && o.id ? o.id : makeSmartId('sk'),
    name: name || '未命名技能',
    description: toText(o.description).trim().slice(0, SMART_DESC_MAX),
    version: typeof o.version === 'string' && o.version.trim() ? truncateText(o.version.trim(), 20) : '1.0.0',
    author: toText(o.author).trim().slice(0, SMART_NAME_MAX),
    category: normalizeCategory(o.category),
    tags: normalizeTags(o.tags),
    whenToUse: toText(o.whenToUse).trim().slice(0, SMART_DESC_MAX),
    tools: normalizeTags(o.tools).slice(0, SMART_TAGS_MAX),
    license: toText(o.license).trim().slice(0, 40),
    github: typeof o.github === 'string' ? toText(o.github).trim().slice(0, 255) : '',
    extra: o.extra && typeof o.extra === 'object' && !Array.isArray(o.extra)
      ? { ...(o.extra as Record<string, unknown>) }
      : {},
    body: truncateText(body, SMART_CONTENT_MAX),
    resources: normalizeResources(o.resources),
    usageCount: Math.max(0, toInt(o.usageCount, 0)),
    lastUsedAt: typeof o.lastUsedAt === 'number' && Number.isFinite(o.lastUsedAt) ? o.lastUsedAt : null,
    // 收藏：与提示词/工作流同字段；老数据没有该键时按未收藏处理
    isFavorite: o.isFavorite === true,
    isBuiltIn: o.isBuiltIn === true ? true : undefined,
    createdAt,
    updatedAt: toInt(o.updatedAt, createdAt || now)
  }, o)
}

/** 归一化资源数组：路径清洗、去重（同路径后者覆盖）、非对象剔除 */
export function normalizeResources(input: unknown): SmartSkillResource[] {
  if (!Array.isArray(input)) return []
  const map = new Map<string, SmartSkillResource>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const path = typeof o.path === 'string' ? o.path.replace(/\\/g, '/').replace(/^\.?\//, '').trim() : ''
    if (!path) continue
    const data = typeof o.data === 'string' ? o.data : ''
    map.set(path, {
      path,
      size: Math.max(0, toInt(o.size, data.length)),
      encoding: o.encoding === 'base64' ? 'base64' : 'text',
      data
    })
  }
  return [...map.values()]
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

/** 归一化参考图数组：仅保留合法 dataURL，非法/超限项剔除（不改入参） */
export function normalizePromptImages(input: unknown): SmartPromptImage[] {
  if (!Array.isArray(input)) return []
  const out: SmartPromptImage[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const dataUrl = typeof o.dataUrl === 'string' && /^data:image\//i.test(o.dataUrl) ? o.dataUrl : ''
    if (!dataUrl) continue
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : makeSmartId('img'),
      name: typeof o.name === 'string' ? o.name.slice(0, 120) : '图片',
      dataUrl,
      width: toInt(o.width, 0),
      height: toInt(o.height, 0)
    })
    if (out.length >= SMART_PROMPT_IMAGES_MAX) break
  }
  return out
}

/** 归一化单条提示词；非法返回 null */
export function normalizePrompt(raw: unknown): SmartPrompt | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const title = truncateText(toText(o.title).trim(), SMART_NAME_MAX)
  const content = toText(o.content)
  if (!title && !content.trim()) return null
  const now = Date.now()
  const createdAt = toInt(o.createdAt, now)
  return keepSmartStamp<SmartPrompt>({
    id: typeof o.id === 'string' && o.id ? o.id : makeSmartId('pm'),
    title: title || '未命名提示词',
    category: normalizeCategory(o.category),
    tags: normalizeTags(o.tags),
    model: typeof o.model === 'string' ? truncateText(o.model.trim(), 40) : '',
    content: truncateText(content, SMART_CONTENT_MAX),
    // 变量恒由正文推导，避免与正文不一致（存量 variables 仅作元信息合并来源）
    variables: mergeVariables(parseVariables(content), o.variables),
    images: normalizePromptImages(o.images),
    isFavorite: o.isFavorite === true,
    usageCount: Math.max(0, toInt(o.usageCount, 0)),
    lastUsedAt: typeof o.lastUsedAt === 'number' && Number.isFinite(o.lastUsedAt) ? o.lastUsedAt : null,
    isBuiltIn: o.isBuiltIn === true ? true : undefined,
    createdAt,
    updatedAt: toInt(o.updatedAt, createdAt || now)
  }, o)
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

// ==================== 工作流归一化 ====================

/** 归一化单条工作流；非法（非对象 / 无名称）返回 null */
export function normalizeWorkflow(raw: unknown): SmartWorkflow | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const name = truncateText(toText(o.name).trim(), SMART_NAME_MAX)
  const definition = toText(o.definition)
  // 名称与定义都为空 → 视为垃圾数据
  if (!name && !definition.trim()) return null
  const now = Date.now()
  const createdAt = toInt(o.createdAt, now)
  return keepSmartStamp<SmartWorkflow>({
    id: typeof o.id === 'string' && o.id ? o.id : makeSmartId('wf'),
    name: name || '未命名工作流',
    description: toText(o.description).trim().slice(0, SMART_DESC_MAX),
    category: normalizeCategory(o.category),
    tags: normalizeTags(o.tags),
    author: toText(o.author).trim().slice(0, SMART_NAME_MAX),
    version: typeof o.version === 'string' && o.version.trim() ? truncateText(o.version.trim(), 20) : '1.0.0',
    definition: truncateText(definition, SMART_CONTENT_MAX),
    isFavorite: o.isFavorite === true,
    usageCount: Math.max(0, toInt(o.usageCount, 0)),
    lastUsedAt: typeof o.lastUsedAt === 'number' && Number.isFinite(o.lastUsedAt) ? o.lastUsedAt : null,
    isBuiltIn: o.isBuiltIn === true ? true : undefined,
    createdAt,
    updatedAt: toInt(o.updatedAt, createdAt || now)
  }, o)
}

export function normalizeWorkflows(input: unknown): SmartWorkflow[] {
  if (!Array.isArray(input)) return []
  const out: SmartWorkflow[] = []
  for (const raw of input) {
    const w = normalizeWorkflow(raw)
    if (w) out.push(w)
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
function matchKeyword(item: SmartSkill | SmartPrompt | SmartWorkflow, q: string): boolean {
  const kw = q.trim().toLowerCase()
  if (!kw) return true
  const name = 'name' in item ? item.name : item.title
  // 技能正文在 body，提示词在 content，工作流在 definition；技能另有 description / whenToUse / tools 可搜
  const text =
    'body' in item ? item.body : 'content' in item ? item.content : 'definition' in item ? item.definition : ''
  const haystack = [
    name,
    item.category,
    item.tags.join(' '),
    text,
    ('description' in item ? item.description : ''),
    ('whenToUse' in item ? item.whenToUse : ''),
    ('tools' in item ? item.tools.join(' ') : '')
  ]
    .join('\n')
    .toLowerCase()
  return haystack.includes(kw)
}

/** 通用过滤（技能 / 提示词 / 工作流 共用） */
export function filterSmart<T extends SmartSkill | SmartPrompt | SmartWorkflow>(items: T[], f: SmartFilter): T[] {
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
export function sortSmart<T extends SmartSkill | SmartPrompt | SmartWorkflow>(items: T[], sort: SmartSort): T[] {
  const out = [...items]
  if (sort === 'name') {
    return out.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'zh-Hans-CN'))
  }
  if (sort === 'usage') {
    return out.sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt)
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * 取显示名：技能 / 工作流用 name，提示词用 title。
 * 三类资产都要走这里（filterSmart / sortSmart / isNameTaken / planImport / applyImport 都是三合一泛型），
 * 入参类型必须覆盖 SmartWorkflow，否则上面几处会把 union 传进来报 TS2345。
 */
function nameOf(item: SmartSkill | SmartPrompt | SmartWorkflow): string {
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

/**
 * 校验技能输入（返回全部问题，空数组即通过）。
 * 字段与 skill.md 的 frontmatter 一一对应：
 *   name / description 为必填（frontmatter 必需键），body 为技能正文（必填）。
 */
export function validateSkill(input: Partial<SmartSkill>, existing: SmartSkill[], editingId?: string | null): SmartIssue[] {
  const out: SmartIssue[] = []
  const name = (input.name ?? '').trim()
  if (!name) out.push({ field: 'name', message: '请填写技能名称（对应 skill.md 的 name）' })
  else if ([...name].length > SMART_NAME_MAX) out.push({ field: 'name', message: `名称不能超过 ${SMART_NAME_MAX} 字` })
  else if (isNameTaken(existing, name, editingId)) out.push({ field: 'name', message: `已存在同名技能「${name}」` })

  const desc = (input.description ?? '').trim()
  if (!desc) out.push({ field: 'description', message: '请填写一句话说明（对应 skill.md 的 description）' })
  else if ([...desc].length > SMART_DESC_MAX) out.push({ field: 'description', message: `说明不能超过 ${SMART_DESC_MAX} 字` })

  const body = (input.body ?? '').trim()
  if (!body) out.push({ field: 'body', message: '请填写技能正文（skill.md 的正文部分）' })
  else if ([...(input.body ?? '')].length > SMART_CONTENT_MAX) out.push({ field: 'body', message: `正文不能超过 ${SMART_CONTENT_MAX} 字` })

  const version = (input.version ?? '').trim()
  if (version && [...version].length > 20) out.push({ field: 'version', message: '版本号不能超过 20 字' })
  const author = (input.author ?? '').trim()
  if (author && [...author].length > SMART_NAME_MAX) out.push({ field: 'author', message: `作者不能超过 ${SMART_NAME_MAX} 字` })

  return out
}

/** 校验资源列表：路径合法性与体积上限（导入前兜底，超限项带明确原因） */
export function validateResources(resources: SmartSkillResource[]): SmartIssue[] {
  const out: SmartIssue[] = []
  const seen = new Set<string>()
  for (const r of resources) {
    const p = (r.path ?? '').trim()
    if (!p) {
      out.push({ field: 'resources', message: '存在路径为空的资源' })
      continue
    }
    if (p.includes('..') || p.startsWith('/')) {
      out.push({ field: 'resources', message: `资源路径不合法：${p}` })
      continue
    }
    if (seen.has(p)) out.push({ field: 'resources', message: `资源路径重复：${p}` })
    seen.add(p)
    if ((r.size ?? 0) > SMART_RESOURCE_FILE_MAX) {
      out.push({ field: 'resources', message: `资源「${p}」超过单文件 1MB 上限` })
    }
  }
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

/** 校验工作流输入（返回全部问题，空数组即通过） */
export function validateWorkflow(input: Partial<SmartWorkflow>, existing: SmartWorkflow[], editingId?: string | null): SmartIssue[] {
  const out: SmartIssue[] = []
  const name = (input.name ?? '').trim()
  if (!name) out.push({ field: 'name', message: '请填写工作流名称' })
  else if ([...name].length > SMART_NAME_MAX) out.push({ field: 'name', message: `名称不能超过 ${SMART_NAME_MAX} 字` })
  else if (isNameTaken(existing, name, editingId)) out.push({ field: 'name', message: `已存在同名工作流「${name}」` })

  const desc = (input.description ?? '').trim()
  if (desc && [...desc].length > SMART_DESC_MAX) out.push({ field: 'description', message: `说明不能超过 ${SMART_DESC_MAX} 字` })

  const definition = (input.definition ?? '').trim()
  if (!definition) out.push({ field: 'definition', message: '请填写工作流定义 / 步骤' })
  else if ([...definition].length > SMART_CONTENT_MAX) out.push({ field: 'definition', message: `定义不能超过 ${SMART_CONTENT_MAX} 字` })

  const version = (input.version ?? '').trim()
  if (version && [...version].length > 20) out.push({ field: 'version', message: '版本号不能超过 20 字' })
  const author = (input.author ?? '').trim()
  if (author && [...author].length > SMART_NAME_MAX) out.push({ field: 'author', message: `作者不能超过 ${SMART_NAME_MAX} 字` })

  return out
}

/** 同名判定（编辑自身不算重复） */
export function isNameTaken<T extends SmartSkill | SmartPrompt | SmartWorkflow>(existing: T[], name: string, editingId?: string | null): boolean {
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
      // 把已知 kind 映射为中文便于提示；未知 kind 原样回显便于排查
      const kindLabel = (k: string): string =>
        k === SMART_PROMPT_KIND ? '提示词' : k === SMART_WORKFLOW_KIND ? '工作流' : k
      const want = kindLabel(expectKind)
      const got = kindLabel(o.kind)
      return { ok: false, reason: 'kind-mismatch', message: `文件是「${got}」数据，与当前「${want}」页面不匹配` }
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

// 技能的 Markdown 序列化/反序列化统一在 skillPackageCore（skillToMarkdown / parseSkillMarkdown），
// 那里还负责 frontmatter 字段名映射与缺失字段的明确报错；本模块不再保留 v1 的旧包装函数。

/**
 * 计算导入预览：与现有库对比，得出新增 / 更新 / 跳过。
 * - id 相同 → 更新
 * - 名称相同 → 更新（避免同名双胞胎）
 * - 其余 → 新增
 * 更新以 updatedAt 新者胜：导入条目更旧则不计入更新。
 */
export function planImport<T extends SmartSkill | SmartPrompt | SmartWorkflow>(
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
export function applyImport<T extends SmartSkill | SmartPrompt | SmartWorkflow>(
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
  workflowCount: number
  /** 本月新增（技能 + 提示词 + 工作流） */
  monthAdded: number
  /** 累计使用次数 */
  totalUsage: number
  /** 分类分布：{ 分类名: 数量 } */
  byCategory: { category: string; skills: number; prompts: number; workflows: number }[]
  /** 最近使用 Top N（跨技能 / 提示词 / 工作流，按 lastUsedAt 倒序） */
  recent: { id: string; type: 'skill' | 'prompt' | 'workflow'; name: string; lastUsedAt: number }[]
}

/** 汇总统计（纯函数，供概览卡片消费） */
export function calcSmartStats(
  skills: SmartSkill[],
  prompts: SmartPrompt[],
  workflows: SmartWorkflow[] = [],
  now = Date.now(),
  topN = 5
): SmartStats {
  const d = new Date(now)
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  const monthAdded =
    skills.filter(s => s.createdAt >= monthStart).length +
    prompts.filter(p => p.createdAt >= monthStart).length +
    workflows.filter(w => w.createdAt >= monthStart).length

  const catMap = new Map<string, { category: string; skills: number; prompts: number; workflows: number }>()
  const bump = (c: string, kind: 'skills' | 'prompts' | 'workflows') => {
    const cur = catMap.get(c) ?? { category: c, skills: 0, prompts: 0, workflows: 0 }
    cur[kind] += 1
    catMap.set(c, cur)
  }
  for (const s of skills) bump(s.category, 'skills')
  for (const p of prompts) bump(p.category, 'prompts')
  for (const w of workflows) bump(w.category, 'workflows')
  const byCategory = [...catMap.values()].sort(
    (a, b) =>
      b.skills + b.prompts + b.workflows - (a.skills + a.prompts + a.workflows) ||
      a.category.localeCompare(b.category, 'zh-Hans-CN')
  )

  const recent = [
    ...skills.filter(s => s.lastUsedAt !== null).map(s => ({ id: s.id, type: 'skill' as const, name: s.name, lastUsedAt: s.lastUsedAt as number })),
    ...prompts.filter(p => p.lastUsedAt !== null).map(p => ({ id: p.id, type: 'prompt' as const, name: p.title, lastUsedAt: p.lastUsedAt as number })),
    ...workflows.filter(w => w.lastUsedAt !== null).map(w => ({ id: w.id, type: 'workflow' as const, name: w.name, lastUsedAt: w.lastUsedAt as number }))
  ]
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, topN)

  return {
    skillCount: skills.length,
    promptCount: prompts.length,
    workflowCount: workflows.length,
    monthAdded,
    totalUsage:
      skills.reduce((sum, s) => sum + s.usageCount, 0) +
      prompts.reduce((sum, p) => sum + p.usageCount, 0) +
      workflows.reduce((sum, w) => sum + w.usageCount, 0),
    byCategory,
    recent
  }
}
