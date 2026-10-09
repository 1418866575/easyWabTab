/**
 * 技能包纯逻辑引擎（零 vue / 零 pinia / 零 DOM，node --experimental-strip-types 可测）
 * ------------------------------------------------------------------
 * 一个技能 = 一个目录：核心是 skill.md（YAML frontmatter + 正文），其余为附属资源。
 * 本模块负责：
 *   1. frontmatter 的解析与序列化（YAML 子集：标量 / 引号串 / 行内数组 / 块数组 / 注释）
 *   2. skill.md ⇄ SmartSkill 的双向映射（含未识别键 extra 的保真）
 *   3. 资源归一化与体积上限（超限跳过并给出原因，不静默丢也不整体失败）
 *   4. 文件夹导入规划（定位 skill.md、剥掉顶层目录名、产出可直接落库的草稿）
 * 规范见 docs/smart-skill-structure.md。
 */

import type { SmartSkill, SmartSkillResource } from '@/types'

// ==================== 常量 ====================

/** 技能核心文件名（固定） */
export const SKILL_FILE = 'skill.md'

/** 单文件上限 1MB；单技能资源最多 50 个、总计 5MB */
export const RESOURCE_FILE_MAX = 1024 * 1024
export const RESOURCE_COUNT_MAX = 50
export const RESOURCE_TOTAL_MAX = 5 * 1024 * 1024

/** frontmatter 键 → 数据字段（顺序即序列化顺序） */
export const SKILL_FIELD_MAP = {
  name: 'name',
  description: 'description',
  version: 'version',
  author: 'author',
  category: 'category',
  tags: 'tags',
  when_to_use: 'whenToUse',
  tools: 'tools',
  license: 'license'
} as const

export type SkillFrontmatterKey = keyof typeof SKILL_FIELD_MAP
export type SkillFieldName = (typeof SKILL_FIELD_MAP)[SkillFrontmatterKey]

/** 必需字段：缺任一即非法（提示时会指明字段名） */
export const SKILL_REQUIRED_FIELDS: { key: SkillFrontmatterKey; label: string }[] = [
  { key: 'name', label: 'name（技能名称）' },
  { key: 'description', label: 'description（一句话说明）' }
]

/** 视为文本的资源扩展名（其余走 base64） */
const TEXT_EXT = new Set([
  'md', 'txt', 'json', 'yaml', 'yml', 'toml', 'ini', 'csv', 'tsv',
  'py', 'js', 'ts', 'jsx', 'tsx', 'sh', 'bash', 'sql', 'html', 'css', 'scss',
  'xml', 'java', 'go', 'rb', 'php', 'c', 'h', 'cpp', 'rs', 'kt', 'swift',
  'env', 'log', 'conf', 'cfg', 'properties', 'gradle', 'gitignore'
])

/** 按扩展名判定是否按文本存储 */
export function isTextPath(path: string): boolean {
  const i = path.lastIndexOf('.')
  if (i < 0) return false
  return TEXT_EXT.has(path.slice(i + 1).toLowerCase())
}

// ==================== frontmatter 解析 / 序列化 ====================

export interface ParsedFrontmatter {
  /** 解析出的键值对 */
  data: Record<string, unknown>
  /** 正文（frontmatter 之后的全部内容） */
  body: string
  /** 是否带 frontmatter 段（false 表示整个文件都是正文） */
  hasFrontmatter: boolean
}

function unquote(v: string): string {
  const s = v.trim()
  if (s.length >= 2) {
    const a = s[0]
    const b = s[s.length - 1]
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      return s.slice(1, -1)
    }
  }
  return s
}

/** 把标量文本转成合适类型：true/false → 布尔，数字 → 数字，其余去引号后的字符串 */
function toScalar(v: string): unknown {
  const s = v.trim()
  if (s === '' || s === 'null' || s === '~') return ''
  if (s === 'true') return true
  if (s === 'false') return false
  if (/^-?\d+$/.test(s)) return Number(s)
  if (/^-?\d*\.\d+$/.test(s)) return Number(s)
  return unquote(s)
}

/** 行内数组 `[a, b, "c,d"]` → 数组（按逗号切分，尊重引号） */
function parseInlineArray(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '')
  if (!inner.trim()) return []
  const out: string[] = []
  let buf = ''
  let quote: string | null = null
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = null
      else buf += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === ',') {
      out.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out.filter(Boolean)
}

/**
 * 解析 frontmatter（YAML 子集）。
 * 不引第三方 YAML 库：既要保持本模块零依赖可测，也避免把作者手写的不规范 YAML 直接抛错。
 */
export function parseFrontmatter(text: string): ParsedFrontmatter {
  const src = typeof text === 'string' ? text : ''
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(src)
  if (!m) return { data: {}, body: src, hasFrontmatter: false }

  const data: Record<string, unknown> = {}
  const lines = m[1].split(/\r?\n/)
  let pendingKey: string | null = null
  let blockItems: string[] | null = null

  const flushBlock = () => {
    if (pendingKey && blockItems) data[pendingKey] = blockItems
    pendingKey = null
    blockItems = null
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim() || line.trimStart().startsWith('#')) continue

    // 块数组项：`- item`
    if (/^\s*-\s+/.test(line) && pendingKey) {
      blockItems = blockItems ?? []
      blockItems.push(unquote(line.replace(/^\s*-\s+/, '')))
      continue
    }

    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!kv) continue
    flushBlock()
    const key = kv[1]
    const val = kv[2]

    if (val.trim() === '') {
      // `key:` 后可能跟块数组，先挂起
      pendingKey = key
      blockItems = []
      continue
    }
    if (val.trim().startsWith('[')) {
      data[key] = parseInlineArray(val)
      continue
    }
    data[key] = toScalar(val)
  }
  flushBlock()

  return { data, body: m[2] ?? '', hasFrontmatter: true }
}

/** 需要加引号的标量：含 `: ` `#` 或首尾空格、或以特殊字符开头 */
function needsQuote(v: string): boolean {
  if (v === '') return true
  if (/^[\s]|[\s]$/.test(v)) return true
  return /[:#\-\[\]{}&*!|>%@`"']/.test(v)
}

function fmtScalar(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  const s = String(v ?? '')
  return needsQuote(s) ? `"${s.replace(/"/g, '\\"')}"` : s
}

function fmtArray(items: unknown[]): string {
  const parts = items.map(i => {
    const s = String(i ?? '')
    return /[,\]\[#]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s
  })
  return `[${parts.join(', ')}]`
}

/** 构造 skill.md 全文：frontmatter（固定字段顺序 + extra）+ 正文 */
export function buildSkillMarkdown(manifest: Record<string, unknown>, body: string): string {
  const lines: string[] = ['---']
  const used = new Set<string>()

  for (const key of Object.keys(SKILL_FIELD_MAP) as SkillFrontmatterKey[]) {
    const field = SKILL_FIELD_MAP[key]
    const v = manifest[field]
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) {
      if (v.length === 0) continue
      lines.push(`${key}: ${fmtArray(v)}`)
    } else {
      const s = String(v).trim()
      if (!s) continue
      lines.push(`${key}: ${fmtScalar(s)}`)
    }
    used.add(field)
  }

  // 未识别键原样补在后面（保持导入导出不丢信息）
  for (const field of Object.keys(manifest).sort()) {
    if (used.has(field)) continue
    if (field === 'extra') continue
    const v = manifest[field]
    if (v === undefined || v === null) continue
    lines.push(Array.isArray(v) ? `${field}: ${fmtArray(v)}` : `${field}: ${fmtScalar(v)}`)
  }
  lines.push('---', '')
  const text = typeof body === 'string' ? body : ''
  return `${lines.join('\n')}${text.startsWith('\n') || text === '' ? text : `\n${text}`}`
}

// ==================== skill.md ⇄ SmartSkill ====================

export interface SkillMarkdownResult {
  ok: boolean
  /** 解析出的字段草稿（未做归一化，键为数据字段名） */
  draft: Record<string, unknown>
  body: string
  /** 失败原因（指明具体字段 / 位置） */
  error?: string
}

/** 从 skill.md 文本解析出技能草稿；必需字段缺失或正文为空时 ok=false 并给出明确原因 */
export function parseSkillMarkdown(text: string): SkillMarkdownResult {
  const src = typeof text === 'string' ? text : ''
  if (!src.trim()) {
    return { ok: false, draft: {}, body: '', error: `${SKILL_FILE} 是空文件` }
  }
  const { data, body, hasFrontmatter } = parseFrontmatter(src)
  if (!hasFrontmatter) {
    return {
      ok: false,
      draft: {},
      body: src,
      error: `${SKILL_FILE} 缺少 frontmatter（文件开头应为 --- 包裹的元数据块）`
    }
  }

  const draft: Record<string, unknown> = { extra: {} }
  const extra: Record<string, unknown> = {}
  const mapped = new Set<string>(Object.values(SKILL_FIELD_MAP))
  for (const [k, v] of Object.entries(data)) {
    const field = (SKILL_FIELD_MAP as Record<string, string>)[k]
    if (field) draft[field] = v
    else if (!mapped.has(k)) extra[k] = v
  }
  draft.extra = extra

  const missing: string[] = []
  const nameVal = typeof draft.name === 'string' ? draft.name.trim() : ''
  const descVal = typeof draft.description === 'string' ? draft.description.trim() : ''
  if (!nameVal) missing.push(SKILL_REQUIRED_FIELDS[0].label)
  if (!descVal) missing.push(SKILL_REQUIRED_FIELDS[1].label)
  if (!body.trim()) missing.push('正文（frontmatter 之后的技能指令内容）')

  if (missing.length) {
    return { ok: false, draft, body, error: `缺少必填内容：${missing.join('、')}` }
  }
  return { ok: true, draft, body }
}

/** 把技能对象序列化为 skill.md 全文 */
export function skillToMarkdown(skill: Partial<SmartSkill>): string {
  const manifest: Record<string, unknown> = {
    name: skill.name ?? '',
    description: skill.description ?? '',
    version: skill.version ?? '',
    author: skill.author ?? '',
    category: skill.category ?? '',
    tags: skill.tags ?? [],
    whenToUse: skill.whenToUse ?? '',
    tools: skill.tools ?? [],
    license: skill.license ?? ''
  }
  const extra = (skill.extra ?? {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(extra)) {
    if (!(k in manifest)) manifest[k] = v
  }
  return buildSkillMarkdown(manifest, skill.body ?? '')
}

// ==================== 资源 ====================

export interface RawResourceFile {
  /** 压缩包 / 文件夹内的完整路径 */
  path: string
  size: number
  /** 文本内容（二选一） */
  text?: string
  /** base64 内容（二选一） */
  base64?: string
}

export interface ResourcePlan {
  resources: SmartSkillResource[]
  /** 被跳过的文件及原因（明确提示，不静默丢） */
  skipped: { path: string; reason: string }[]
}

/**
 * 资源归一化：剥掉顶层目录名、过滤 skill.md 自身、按扩展名决定编码、
 * 应用数量与体积上限。超限的文件进入 skipped 并给出原因。
 */
export function planResources(files: RawResourceFile[], rootName?: string): ResourcePlan {
  const resources: SmartSkillResource[] = []
  const skipped: { path: string; reason: string }[] = []
  let total = 0

  for (const f of files) {
    let rel = normalizeRelPath(f.path, rootName)
    if (!rel) continue
    if (rel.toLowerCase() === SKILL_FILE) continue // skill.md 不进资源列表

    if (resources.length >= RESOURCE_COUNT_MAX) {
      skipped.push({ path: rel, reason: `资源数量超过上限 ${RESOURCE_COUNT_MAX} 个` })
      continue
    }
    if (f.size > RESOURCE_FILE_MAX) {
      skipped.push({ path: rel, reason: `单文件超过 ${Math.round(RESOURCE_FILE_MAX / 1024 / 1024)}MB 上限` })
      continue
    }
    if (total + f.size > RESOURCE_TOTAL_MAX) {
      skipped.push({ path: rel, reason: `技能资源总计超过 ${Math.round(RESOURCE_TOTAL_MAX / 1024 / 1024)}MB 上限` })
      continue
    }

    const asText = isTextPath(rel)
    const data = asText ? String(f.text ?? '') : String(f.base64 ?? f.text ?? '')
    resources.push({ path: rel, size: f.size, encoding: asText ? 'text' : 'base64', data })
    total += f.size
  }

  return { resources, skipped }
}

/**
 * 相对路径归一化：去掉最外层目录名（导入时它就是用户选中的容器目录），
 * 并清理 `./`、前导 `/`、反斜杠。返回空串表示应忽略（如目录项本身）。
 */
export function normalizeRelPath(path: string, rootName?: string): string {
  if (typeof path !== 'string') return ''
  let p = path.replace(/\\/g, '/').replace(/^\.?\//, '')
  if (!p || p.endsWith('/')) return ''
  if (rootName) {
    const prefix = `${rootName.replace(/^\.?\//, '').replace(/\/$/, '')}/`
    if (p.startsWith(prefix)) p = p.slice(prefix.length)
  }
  // 去掉剩余的 `./` 片段
  p = p.replace(/(^|\/)\.\//g, '$1')
  return p
}

/** 把绝对路径列表归拢成「顶层目录名 → 文件」的分组，用于定位各技能的根目录 */
export function groupByTopDir(paths: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const p of paths) {
    const clean = p.replace(/\\/g, '/').replace(/^\.?\//, '')
    if (!clean) continue
    const idx = clean.indexOf('/')
    const top = idx === -1 ? '' : clean.slice(0, idx)
    ;(out[top] = out[top] ?? []).push(clean)
  }
  return out
}

/** 在路径列表中定位 skill.md：取路径最浅者（层级最少，其次按字典序） */
export function findSkillFile(paths: string[]): string | null {
  const hits = paths
    .map(p => ({ p: p.replace(/\\/g, '/').replace(/^\.?\//, ''), depth: p.split('/').length }))
    .filter(x => x.p.split('/').pop()?.toLowerCase() === SKILL_FILE)
    .sort((a, b) => a.depth - b.depth || a.p.localeCompare(b.p))
  return hits.length ? hits[0].p : null
}

/** 取路径的顶层目录名（无目录层则返回空串） */
export function topDirOf(path: string): string {
  const clean = path.replace(/\\/g, '/').replace(/^\.?\//, '')
  const idx = clean.indexOf('/')
  return idx === -1 ? '' : clean.slice(0, idx)
}

// ==================== 旧数据迁移 ====================

// ==================== 批量导入规划 ====================

export interface SkillPackageDraft {
  /** 技能根目录（相对路径；skill.md 就在选中目录根部时为 ''） */
  root: string
  /** skill.md 的相对路径 */
  skillFile: string
  /** 解析出的字段草稿（键为数据字段名，未归一化） */
  draft: Record<string, unknown>
  /** 技能正文 */
  body: string
  /** 归到本技能的资源 */
  resources: SmartSkillResource[]
  /** 被跳过资源的提示（数量/体积超限） */
  warnings: string[]
}

export interface SkillImportPlan {
  packages: SkillPackageDraft[]
  /** 找到 skill.md 但格式不合法的条目（带明确原因） */
  failed: { skillFile: string; error: string }[]
  /** 未归入任何技能的文件路径 */
  orphans: string[]
  /** 整体失败原因（如完全没有 skill.md） */
  error?: string
}

function cleanPath(p: string): string {
  return String(p ?? '').replace(/\\/g, '/').replace(/^\.?\//, '')
}

function isSkillFile(p: string): boolean {
  const name = p.split('/').pop() ?? ''
  return name.toLowerCase() === SKILL_FILE
}

/** 取 skill.md 所在目录（根级返回 ''） */
export function skillRootOf(skillFile: string): string {
  const p = cleanPath(skillFile)
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

/**
 * 扫描一批文件，规划出可导入的技能包。
 * 支持三种常见选择方式：
 *   1. 直接选中技能目录（skill.md 在根）→ 1 个技能
 *   2. 选中父目录（下面多个技能子目录）→ N 个技能
 *   3. zip 包（含顶层目录）→ 同上，一视同仁
 * 归属规则：文件归「路径最长匹配的那个 skill.md 所在目录」所有，嵌套技能互不抢资源。
 */
export function planSkillImports(files: RawResourceFile[]): SkillImportPlan {
  const list = Array.isArray(files) ? files : []
  const paths = list.map(f => cleanPath(f.path))
  const skillFiles = paths
    .filter(isSkillFile)
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))

  if (skillFiles.length === 0) {
    return {
      packages: [],
      failed: [],
      orphans: paths.filter(Boolean),
      error: `所选内容中没有找到 ${SKILL_FILE}（技能目录必须包含该文件）`
    }
  }

  // 建立「文件 → 所属技能」的映射
  const owner = new Map<string, string>()
  const orphans: string[] = []
  for (let i = 0; i < list.length; i++) {
    const p = paths[i]
    if (!p || isSkillFile(p)) continue
    let best = ''
    let bestLen = -1
    for (const sf of skillFiles) {
      const root = skillRootOf(sf)
      const prefix = root ? `${root}/` : ''
      const hit = prefix ? p.startsWith(prefix) : true
      if (hit && root.length > bestLen) {
        best = sf
        bestLen = root.length
      }
    }
    if (best) owner.set(p, best)
    else orphans.push(p)
  }

  const packages: SkillPackageDraft[] = []
  const failed: { skillFile: string; error: string }[] = []
  const byPath = new Map<string, RawResourceFile>()
  for (let i = 0; i < list.length; i++) byPath.set(paths[i], list[i])

  for (const sf of skillFiles) {
    const file = byPath.get(sf)
    const parsed = parseSkillMarkdown(typeof file?.text === 'string' ? file.text : '')
    if (!parsed.ok) {
      failed.push({ skillFile: sf, error: parsed.error ?? `${SKILL_FILE} 解析失败` })
      continue
    }
    const root = skillRootOf(sf)
    const own: RawResourceFile[] = []
    for (const [p, o] of owner) {
      if (o !== sf) continue
      own.push({ path: normalizeRelPath(p, root), size: byPath.get(p)?.size ?? 0, text: byPath.get(p)?.text, base64: byPath.get(p)?.base64 })
    }
    // 同名（同一 skill.md 目录）去重后按路径排序，保证导出顺序稳定
    own.sort((a, b) => a.path.localeCompare(b.path))
    const planned = planResources(own, '')
    packages.push({
      root,
      skillFile: sf,
      draft: parsed.draft,
      body: parsed.body,
      resources: planned.resources,
      warnings: planned.skipped.map(s => `${s.path}：${s.reason}`)
    })
  }

  return { packages, failed, orphans }
}

// ==================== 旧数据迁移 ====================

/**
 * v1 扁平技能 → v2 目录结构的迁移（在 normalizeSkill 内调用，幂等）。
 * v1：{ name, description, content, icon, category, tags, version, author }
 * v2：{ name, description, body, resources, whenToUse, tools, license, extra }
 */
export function migrateLegacySkill(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw }
  // 已是 v2：有 body 或 resources
  const isV2 = typeof out.body === 'string' || Array.isArray(out.resources)
  if (isV2) return out

  if (typeof out.content === 'string') {
    out.body = out.content
    delete out.content
  }
  // v1 的 icon 无对应字段，落进 extra 保真（界面统一用内置图标）
  const extra: Record<string, unknown> =
    out.extra && typeof out.extra === 'object' ? { ...(out.extra as Record<string, unknown>) } : {}
  if (typeof out.icon === 'string' && out.icon.trim()) extra.icon = out.icon
  delete out.icon
  out.extra = extra
  return out
}
