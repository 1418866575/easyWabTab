import type { Site, SitesData, Category, PasswordEntry, Countdown } from '../types'
import type { SearchEngine } from '../stores/searchEngines'
import { parseRepeat } from './countdownCore'
import yaml from 'js-yaml'

/**
 * 容错解析：当标准 YAML 解析失败时，按导出文法逐行恢复站点数据。
 *
 * 背景：旧版导出未对字符串值加引号，站点描述/名称里若含 `: ` 等 YAML 特殊字符，
 * 会写出非法 YAML，标准解析直接整体失败 → 导入报「未能解析到站点数据」。
 * 这里按固定导出格式（section → `  - key: value` 列表项 → `    key: value` 字段，
 * 倒计时的 `repeat:` 子块在 6/8 空格层级）做宽容逐行解析，保证用户「已导出但未入库」的
 * 文件仍能导入回来。
 */
function tolerantParseSites(content: string): RawStore | null {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*/
  const m = content.match(frontmatterRegex)
  if (!m) return null
  const lines = m[1].split('\n')
  const result: RawStore = { sites: [], categories: [], searchEngines: [], passwords: [], countdowns: [] }
  let section: keyof RawStore | null = null
  let current: Record<string, unknown> | null = null
  let repeatBuf: Record<string, unknown> | null = null

  const splitKV = (line: string): { key: string; value: string } | null => {
    const i = line.indexOf(': ')
    if (i === -1) {
      const j = line.indexOf(':')
      if (j === -1) return null
      return { key: line.slice(0, j).trim(), value: '' }
    }
    return { key: line.slice(0, i).trim(), value: line.slice(i + 2).trim() }
  }

  const coerce = (key: string, raw: string): unknown => {
    let r = (raw ?? '').toString().trim()
    if (r.length >= 2 && ((r[0] === '"' && r[r.length - 1] === '"') || (r[0] === "'" && r[r.length - 1] === "'"))) {
      r = r.slice(1, -1)
    }
    if (key === 'sort' || key === 'sortOrder' || key === 'dayOfMonth' || key === 'intervalMinutes') {
      const n = Number(r)
      return Number.isFinite(n) ? n : 0
    }
    if (key === 'isDefault' || key === 'showOnDisplay' || key === 'emailReminder') {
      return r === 'true'
    }
    return r
  }

  const SECTION_RE = /^(categories|searchEngines|passwords|countdowns|sites):$/

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '    ')
    const indent = line.length - line.trimStart().length
    const text = line.trim()

    // 顶层 section 头：`categories:` 等（0 缩进、无同行值）
    if (indent === 0 && SECTION_RE.test(text)) {
      section = text.slice(0, -1) as keyof RawStore
      current = null
      repeatBuf = null
      continue
    }
    // 列表项起始：`  - key: value`（2 缩进）
    if (indent === 2 && text.startsWith('- ')) {
      const kv = splitKV(text.slice(2))
      if (!kv) continue
      current = {}
      current[kv.key] = coerce(kv.key, kv.value)
      repeatBuf = null
      if (section) result[section].push(current)
      continue
    }
    // repeat 子块开始：`    repeat:`（4 缩进、空值）
    if (indent === 4 && text === 'repeat:') {
      repeatBuf = {}
      if (current) current.repeat = repeatBuf
      continue
    }
    // repeat 子字段：`      type: weekly` 等（6 缩进）
    if (indent === 6 && repeatBuf) {
      const kv = splitKV(text)
      if (!kv) continue
      if (kv.key === 'daysOfWeek') repeatBuf.daysOfWeek = []
      else repeatBuf[kv.key] = coerce(kv.key, kv.value)
      continue
    }
    // repeat.daysOfWeek 列表项：`        - 1`（8 缩进）
    if (indent === 8 && text.startsWith('- ') && repeatBuf) {
      if (!Array.isArray(repeatBuf.daysOfWeek)) repeatBuf.daysOfWeek = []
      ;(repeatBuf.daysOfWeek as number[]).push(Number(text.slice(2).trim()))
      continue
    }
    // 普通字段：`    key: value`（4 缩进）
    if (indent === 4 && current) {
      const kv = splitKV(text)
      if (!kv) continue
      if (kv.key === 'tags') {
        const inner = kv.value.replace(/^\[/, '').replace(/\]$/, '').trim()
        current.tags = inner ? inner.split(',').map(s => coerce('tag', s.trim())) : []
      } else {
        current[kv.key] = coerce(kv.key, kv.value)
      }
      continue
    }
  }
  return result
}

interface RawStore {
  sites: Record<string, unknown>[]
  categories: Record<string, unknown>[]
  searchEngines: Record<string, unknown>[]
  passwords: Record<string, unknown>[]
  countdowns: Record<string, unknown>[]
}

/** 把原始解析结果（标准 YAML 或容错解析产出）归一化为导入所需的形状。 */
function normalizeParsed(data: RawStore): SitesData & { categories?: Category[]; searchEngines?: SearchEngine[]; passwords?: PasswordEntry[]; countdowns?: Countdown[] } {
  const sitesData = data.sites as Site[] | undefined
  const categoriesData = data.categories as Category[] | undefined
  const searchEnginesData = data.searchEngines as SearchEngine[] | undefined
  const passwordsData = data.passwords as PasswordEntry[] | undefined

  // 解析倒计时数据（防御性解析：缺失字段使用生成的默认值兜底）
  const countdownsData: Countdown[] | undefined = Array.isArray(data.countdowns)
    ? data.countdowns.map((item, index) => {
        const raw = item as Record<string, unknown> | null
        const now = new Date().toISOString()
        const fallbackId = `cd_${Date.now()}_${index}`
        return {
          id: typeof raw?.id === 'string' && raw.id.trim() !== '' ? raw.id : fallbackId,
          name: typeof raw?.name === 'string' ? raw.name : '',
          endDateTime: typeof raw?.endDateTime === 'string' ? raw.endDateTime : '',
          repeat: parseRepeat(raw?.repeat),
          // 分类：任意非空字符串透传（内置 6 类 + 用户自定义名），缺失/空串 → undefined（后续 normalize 兜底 'work'）
          category: typeof raw?.category === 'string' && raw.category.trim() !== '' ? raw.category.trim() : undefined,
          color: typeof raw?.color === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.color) ? raw.color : undefined,
          lastRemindedAt: typeof raw?.lastRemindedAt === 'string' && raw.lastRemindedAt.trim() !== '' ? raw.lastRemindedAt : undefined,
          createdAt: typeof raw?.createdAt === 'string' && raw.createdAt.trim() !== '' ? raw.createdAt : now,
          updatedAt: typeof raw?.updatedAt === 'string' && raw.updatedAt.trim() !== '' ? raw.updatedAt : now,
          sortOrder: typeof raw?.sortOrder === 'number' ? raw.sortOrder : undefined,
          showOnDisplay: typeof raw?.showOnDisplay === 'boolean' ? raw.showOnDisplay : undefined,
          // 邮件提醒开关：仅布尔值透传，缺失 → undefined（后续 normalize 缺省不发邮件）
          emailReminder: typeof raw?.emailReminder === 'boolean' ? raw.emailReminder : undefined
        }
      })
    : undefined

  return {
    sites: sitesData || [],
    lastUpdated: data.lastUpdated as string | undefined,
    categories: categoriesData,
    searchEngines: searchEnginesData,
    passwords: passwordsData,
    countdowns: countdownsData
  }
}

export function useMarkdown() {
  function parseSitesFromMarkdown(content: string): SitesData & { categories?: Category[]; searchEngines?: SearchEngine[]; passwords?: PasswordEntry[]; countdowns?: Countdown[] } {
    // 先走标准 YAML 解析（快、严）
    try {
      const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*/
      const match = content.match(frontmatterRegex)
      if (!match) {
        return { sites: [] }
      }
      const frontmatter = match[1]
      const data = yaml.load(frontmatter) as RawStore
      return normalizeParsed(data)
    } catch (error) {
      console.warn('[Import] 标准 YAML 解析失败，尝试容错逐行解析:', (error as Error).message)
      // 兜底：导出文件若含未引号化的 `: ` 等特殊字符会写出非法 YAML，标准解析会整体失败；
      // 这里按导出文法逐行恢复，保证用户已导出（但曾导入失败）的文件仍可导入。
      try {
        const tolerant = tolerantParseSites(content)
        if (tolerant) return normalizeParsed(tolerant)
      } catch (e2) {
        console.error('[Import] 容错解析也失败:', e2)
      }
      return { sites: [] }
    }
  }

  return {
    parseSitesFromMarkdown
  }
}
