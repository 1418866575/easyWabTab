/**
 * 家谱 · 取名记录纯函数核心（零 vue / 零 pinia 运行时依赖，可单测）。
 * 对应需求文档 docs/家谱-取名记录-功能需求.md：
 *   - 校验 / 归一化 / 过滤 / 排序 / 合并 全部抽成纯函数，便于 node --experimental-strip-types 单测
 *   - 导入导出信封 kind='family-names'，与家谱成员信封 easy-web-tab-genealogy 相互独立
 */
import type { FamilyNameRecord } from '../types'
import { mergeTombstonedById } from './tombstoneCore.ts'

/** 取名记录字段长度上限（与需求 §6 一致） */
export const NAME_NAME_MAX = 50
export const NAME_MEANING_MAX = 500
export const NAME_NOTE_MAX = 500

/** 导出文件格式版本号 */
export const NAMES_EXPORT_VERSION = 1
/** 导出文件名固定前缀（后缀追加日期，见 buildNamesExport 调用方） */
export const NAMES_EXPORT_FILENAME = 'family-names.json'

/** 导出信封（落盘/分享的 JSON 结构） */
export interface NameExportFile {
  kind: 'family-names'
  version: number
  exportedAt: string
  data: FamilyNameRecord[]
}

/** 构造导出信封（纯对象，不含响应式代理） */
export function buildNamesExport(records: FamilyNameRecord[], now: Date = new Date()): NameExportFile {
  return {
    kind: 'family-names',
    version: NAMES_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    data: JSON.parse(JSON.stringify(records ?? []))
  }
}

/** 导入清洗结果与统计 */
export interface NormalizeNamesResult {
  records: FamilyNameRecord[]
  /** 成功导入的记录数 */
  valid: number
  /** 被丢弃的记录数（缺名字等） */
  skipped: number
  warnings: string[]
}

const NAME_GENDERS: Array<FamilyNameRecord['gender']> = ['male', 'female', '']

/** 'YYYY-MM-DD' 合法校验（拒绝 2 月 30 日这类溢出日期） */
function isDateKey(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
  if (!m) return false
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

/** 取本地当天 0 点的毫秒（用于"不晚于今天"判定，去掉时分秒偏移） */
function todayStartMs(): number {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t.getTime()
}

/** 取名日期是否为未来（晚于今天）；非法/空 → false */
export function isFutureDateKey(v: unknown): boolean {
  if (typeof v !== 'string' || !isDateKey(v)) return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())!
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return dt.getTime() > todayStartMs()
}

function truncate(s: unknown, max: number): { value: string; truncated: boolean } {
  if (typeof s !== 'string') return { value: '', truncated: false }
  const t = s.trim()
  if (t.length <= max) return { value: t, truncated: false }
  return { value: t.slice(0, max), truncated: true }
}

let normSeq = 0
function newNameId(): string {
  normSeq += 1
  return `nm_${Date.now().toString(36)}_${normSeq.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * 导入清洗（幂等、脏数据不抛错）：
 * - 记录：id 缺失/重复 → 重新生成；名字缺失/全空白 → 丢弃并计入 skipped；名字超 50 字 → 截断并提示
 * - 性别：非 male/female/'' → 归一为 ''
 * - 寓意/出处、备注：超 500 字 → 截断并提示
 * - 取名日期：非法 → null；未来日期 → 警告并置 null（取名是过去/当日动作）
 * - 关联成员、时间戳：原样保留（memberId 的悬空清理由 store 加载时统一处理；createdAt/updatedAt 缺省用当前 ISO）
 *
 * 兼容两种形态：带信封 {kind:'family-names',version,data} 或裸数组。
 */
export function normalizeNamesImport(raw: unknown): NormalizeNamesResult {
  const warnings: string[] = []
  const empty: NormalizeNamesResult = { records: [], valid: 0, skipped: 0, warnings }

  let arr: unknown = null
  if (Array.isArray(raw)) {
    arr = raw
  } else if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    if (r.kind && r.kind !== 'family-names') {
      warnings.push(`文件类型标识不符（期望 family-names，实为 ${String(r.kind)}），已拒绝导入`)
      return empty
    }
    if (r.kind === 'family-names') {
      arr = r.data
      if (typeof r.version === 'number') {
        // 版本兼容预留：当前仅 v1，未来可在此时做迁移
      }
    } else if (Array.isArray(r.data)) {
      // 形如 { data: [...] } 但无 kind —— 仍尝试解析（兼容老式裸 data 包裹）
      arr = r.data
      warnings.push('文件缺少 kind 标识，已按取名记录尝试解析')
    } else {
      return empty
    }
  }
  if (!Array.isArray(arr)) {
    warnings.push('文件中没有可取名记录数组')
    return empty
  }

  const usedIds = new Set<string>()
  const nowIso = new Date().toISOString()
  const records: FamilyNameRecord[] = []
  let skipped = 0

  for (const item of arr) {
    const r = (item ?? {}) as Record<string, unknown>
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    if (!name) { skipped += 1; continue }

    let id: string
    const oldId = typeof r.id === 'string' && r.id ? r.id : ''
    if (oldId && !usedIds.has(oldId)) {
      id = oldId
      usedIds.add(id)
    } else {
      id = newNameId()
    }

    const nt = truncate(r.meaning, NAME_MEANING_MAX)
    if (nt.truncated) warnings.push(`「${name.slice(0, 12)}…」寓意/出处超过 ${NAME_MEANING_MAX} 字，已截断`)

    let namingDate: string | null = null
    if (typeof r.namingDate === 'string' && isDateKey(r.namingDate)) {
      if (isFutureDateKey(r.namingDate)) {
        warnings.push(`「${name.slice(0, 12)}…」取名日期晚于今天，已清空`)
      } else {
        namingDate = r.namingDate
      }
    }

    const note = truncate(r.note, NAME_NOTE_MAX)
    if (note.truncated) warnings.push(`「${name.slice(0, 12)}…」备注超过 ${NAME_NOTE_MAX} 字，已截断`)

    const gender = NAME_GENDERS.includes(r.gender as never) ? (r.gender as FamilyNameRecord['gender']) : ''

    const rec: FamilyNameRecord = {
      id,
      name: name.length > NAME_NAME_MAX ? name.slice(0, NAME_NAME_MAX) : name,
      gender,
      namingDate,
      memberId: typeof r.memberId === 'string' && r.memberId ? r.memberId : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : nowIso
    }
    if (nt.value) rec.meaning = nt.value
    if (note.value) rec.note = note.value
    if (name.length > NAME_NAME_MAX) warnings.push(`「${name.slice(0, 12)}…」名字超过 ${NAME_NAME_MAX} 字，已截断`)
    records.push(rec)
  }

  return { records, valid: records.length, skipped, warnings }
}

/**
 * 合并取名记录（云同步 merge 用）：按 id 合并——本地优先（updatedAt 较新者胜，本地先入 map）。
 * 与 mergeFamily / mergeStudentValue 的「本地优先」策略对齐。
 */
export function mergeNames(local?: FamilyNameRecord[], remote?: FamilyNameRecord[]): FamilyNameRecord[] {
  // 墓碑感知合并（与 mergeFamily 同策略）：本地先入 → 版本相同时保留本地；墓碑版本更新则保留删除
  return mergeTombstonedById(local ?? [], remote ?? [], 'updatedAt')
}

/** 表单校验（UI 提交前调用，返回首个错误文案；ok=true 表示可提交） */
export function validateNameForm(input: {
  name: string
  namingDate?: string | null
}): { ok: boolean; error?: string } {
  const n = input.name.trim().length
  if (n === 0) return { ok: false, error: '名字不能为空' }
  if (n > NAME_NAME_MAX) return { ok: false, error: `名字不能超过 ${NAME_NAME_MAX} 字` }
  if (input.namingDate && isFutureDateKey(input.namingDate)) {
    return { ok: false, error: '取名日期不能晚于今天' }
  }
  return { ok: true }
}

export type NameSortKey = 'namingDate' | 'updatedAt' | 'name'

/**
 * 过滤 + 排序取名记录（纯函数）。
 * @param query   关键字：按 名字 / 寓意 / 备注 模糊匹配（空 = 不过滤）
 * @param gender  'all' = 不过滤；否则精确匹配 gender
 * @param sortKey 默认 namingDate（倒序，无日期沉底）
 */
export function filterNameRecords(
  records: FamilyNameRecord[],
  query: string,
  gender: 'all' | FamilyNameRecord['gender'],
  sortKey: NameSortKey = 'namingDate'
): FamilyNameRecord[] {
  const q = query.trim().toLowerCase()
  let out = records.filter((r) => {
    if (gender !== 'all' && (r.gender ?? '') !== gender) return false
    if (!q) return true
    const hay = [r.name, r.meaning ?? '', r.note ?? ''].join(' ').toLowerCase()
    return hay.includes(q)
  })
  const cmp = (a: FamilyNameRecord, b: FamilyNameRecord): number => {
    if (sortKey === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN')
    if (sortKey === 'updatedAt') return (b.updatedAt || '').localeCompare(a.updatedAt || '')
    // namingDate 倒序；null 沉底
    const da = a.namingDate ?? null
    const db = b.namingDate ?? null
    if (da && db) return db.localeCompare(da)
    if (da) return -1
    if (db) return 1
    return (b.updatedAt || '').localeCompare(a.updatedAt || '')
  }
  out = [...out].sort(cmp)
  return out
}
