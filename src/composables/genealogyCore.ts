/**
 * 家庭家谱纯函数核心（零 vue/pinia 运行时依赖，可单测）。
 * 成员为中心 + 最小边模型：Person 仅挂 parents[] 与 spouses[] 两条边，
 * 子女/兄弟姐妹/祖孙全部运行时派生，不单独建关系表。
 */
import type { FamilyMember, GenealogyData } from '../types'

/** 空家谱数据集（导入兜底 / 初始化） */
export function emptyGenealogyData(): GenealogyData {
  return { members: [], rootId: null }
}

/** 成员名称校验：trim 后非空且 ≤50 字符 */
export function validateMemberName(name: string): boolean {
  const n = name.trim()
  return n.length > 0 && n.length <= 50
}

/** 父母（直接） */
export function getParents(members: FamilyMember[], id: string): FamilyMember[] {
  const m = members.find((x) => x.id === id)
  if (!m) return []
  return members.filter((x) => m.parents.includes(x.id))
}

/** 子女（直接） */
export function getChildren(members: FamilyMember[], id: string): FamilyMember[] {
  return members.filter((x) => x.parents.includes(id))
}

/** 兄弟姐妹（共享任一父母，去重，不含自身） */
export function getSiblings(members: FamilyMember[], id: string): FamilyMember[] {
  const m = members.find((x) => x.id === id)
  if (!m || m.parents.length === 0) return []
  const sibIds = new Set<string>()
  for (const p of m.parents) {
    for (const c of getChildren(members, p)) {
      if (c.id !== id) sibIds.add(c.id)
    }
  }
  return members.filter((x) => sibIds.has(x.id))
}

/** 祖先（沿 parents 上溯，去重，按出现顺序） */
export function getAncestors(members: FamilyMember[], id: string): FamilyMember[] {
  const out: FamilyMember[] = []
  const seen = new Set<string>()
  const stack = [...(members.find((x) => x.id === id)?.parents ?? [])]
  while (stack.length) {
    const pid = stack.pop() as string
    if (seen.has(pid)) continue
    seen.add(pid)
    const p = members.find((x) => x.id === pid)
    if (p) {
      out.push(p)
      stack.push(...p.parents)
    }
  }
  return out
}

/** 后代（沿子女下溯，去重，按出现顺序） */
export function getDescendants(members: FamilyMember[], id: string): FamilyMember[] {
  const out: FamilyMember[] = []
  const seen = new Set<string>()
  const stack = [...getChildren(members, id).map((c) => c.id)]
  while (stack.length) {
    const cid = stack.pop() as string
    if (seen.has(cid)) continue
    seen.add(cid)
    const c = members.find((x) => x.id === cid)
    if (c) {
      out.push(c)
      stack.push(...getChildren(members, cid).map((x) => x.id))
    }
  }
  return out
}

/**
 * 把 newParentId 设为 childId 的父是否会成环。
 * 自引用（childId === newParentId）必为环；若 newParentId 已是 childId 的后代亦为环。
 */
export function wouldCreateCycle(members: FamilyMember[], childId: string, newParentId: string): boolean {
  if (childId === newParentId) return true
  return getDescendants(members, childId).some((d) => d.id === newParentId)
}

/** 家谱树节点 */
export interface FamilyTreeNode {
  member: FamilyMember
  children: FamilyTreeNode[]
}

/**
 * 以主根为根构建家谱树；无主根（或为 null/不存在）时返回森林（多棵根树）。
 * 防御：visited 防重复（理论上最小边无环，仍加保护），depth 上限防极端深递归。
 */
export function buildTree(members: FamilyMember[], rootId: string | null): FamilyTreeNode[] {
  const byId = new Map(members.map((m) => [m.id, m] as const))
  const visited = new Set<string>()
  function nodeOf(id: string, depth: number): FamilyTreeNode | null {
    if (visited.has(id) || depth > 50) return null
    visited.add(id)
    const m = byId.get(id)
    if (!m) return null
    return {
      member: m,
      children: getChildren(members, id)
        .map((c) => nodeOf(c.id, depth + 1))
        .filter((n): n is FamilyTreeNode => n !== null)
    }
  }
  if (rootId && byId.has(rootId)) {
    const root = nodeOf(rootId, 0)
    return root ? [root] : []
  }
  // 森林：父母为空的成员作为根
  return members
    .filter((m) => m.parents.length === 0)
    .map((r) => nodeOf(r.id, 0))
    .filter((n): n is FamilyTreeNode => n !== null)
}

/** 树扁平化为 pre-order 列表（带深度，用于无障碍/无递归渲染） */
export interface FlatTreeNode {
  member: FamilyMember
  depth: number
  hasChildren: boolean
}
export function flattenTree(nodes: FamilyTreeNode[]): FlatTreeNode[] {
  const out: FlatTreeNode[] = []
  const walk = (list: FamilyTreeNode[], depth: number) => {
    for (const n of list) {
      out.push({ member: n.member, depth, hasChildren: n.children.length > 0 })
      if (n.children.length) walk(n.children, depth + 1)
    }
  }
  walk(nodes, 0)
  return out
}

/**
 * 合并家谱（云同步 merge 用）：成员按 id 合并——本地优先（updatedAt 较新者胜，
 * 本地先入 map，远端仅补缺失 id）；rootId 取 本地 ?? 远端。与 mergeStudentValue 的
 * 「本地优先」策略对齐。
 */
export function mergeFamily(local?: GenealogyData, remote?: GenealogyData): GenealogyData {
  const l = local ?? emptyGenealogyData()
  const r = remote ?? emptyGenealogyData()
  const map = new Map<string, FamilyMember>()
  const newer = (a: FamilyMember, b: FamilyMember): FamilyMember =>
    (a.updatedAt || '') >= (b.updatedAt || '') ? a : b
  for (const m of l.members) map.set(m.id, m)
  for (const m of r.members) {
    const existing = map.get(m.id)
    map.set(m.id, existing ? newer(existing, m) : m)
  }
  return {
    members: Array.from(map.values()),
    rootId: l.rootId ?? r.rootId
  }
}

// ============================================================
// 年龄与人口统计（纯函数，零运行时依赖）
// ============================================================

/** 'YYYY-MM-DD' → 本地 Date（非法/空 → null；按 '-' 手拆避免 UTC 解析偏移） */
function parseDateKey(key?: string | null): Date | null {
  if (typeof key !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  // 拒绝 2 月 30 日这类溢出日期（Date 会自动进位）
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return dt
}

/**
 * 周岁年龄：在世成员按 today（默认当前日期）计算；已故成员按去世日期计算「享年」。
 * 出生日期缺失/非法、或基准日期早于出生日期 → null（不臆造年龄）。
 */
export function calcAge(birthDate?: string, deathDate?: string, today?: Date): number | null {
  const b = parseDateKey(birthDate)
  if (!b) return null
  const end = parseDateKey(deathDate) ?? today ?? new Date()
  if (end.getTime() < b.getTime()) return null
  let age = end.getFullYear() - b.getFullYear()
  const beforeBirthday =
    end.getMonth() < b.getMonth() ||
    (end.getMonth() === b.getMonth() && end.getDate() < b.getDate())
  if (beforeBirthday) age -= 1
  return age < 0 ? 0 : age
}

/** 年龄段 key（按国家规定/通行口径划分，互斥且全覆盖） */
export type AgeGroupKey = 'infant' | 'child' | 'teen' | 'youth' | 'elder'

export interface AgeGroupDef {
  key: AgeGroupKey
  label: string
  /** 含下界（周岁） */
  min: number
  /** 含上界；null = 无上限 */
  max: number | null
  /** 判定依据（UI 提示用，改动需同步法规口径） */
  basis: string
}

/**
 * 年龄段判定标准（互斥、无缝、全覆盖 0 岁起）：
 * - 婴儿 0 周岁（未满 1 周岁）
 * - 儿童 1–6 周岁（《0～6 岁儿童健康管理服务规范》覆盖的学龄前段）
 * - 少年 7–17 周岁（未满 18 周岁未成年人，7 周岁起为义务教育入学年龄）
 * - 青年 18–59 周岁（18 周岁成年起，至老年线前）
 * - 老年 ≥60 周岁（《中华人民共和国老年人权益保障法》第二条：老年人指 60 周岁以上公民）
 */
export const AGE_GROUPS: readonly AgeGroupDef[] = [
  { key: 'infant', label: '婴儿', min: 0, max: 0, basis: '未满 1 周岁' },
  { key: 'child', label: '儿童', min: 1, max: 6, basis: '1–6 周岁（0～6 岁儿童健康管理规范）' },
  { key: 'teen', label: '少年', min: 7, max: 17, basis: '7–17 周岁（未满 18 周岁未成年人）' },
  { key: 'youth', label: '青年', min: 18, max: 59, basis: '18–59 周岁（18 周岁成年至老年线前）' },
  { key: 'elder', label: '老年', min: 60, max: null, basis: '≥60 周岁（老年人权益保障法第二条）' }
]

/** 年龄 → 年龄段 key；age 为 null（无出生日期）→ null。 */
export function ageGroupOf(age: number | null): AgeGroupKey | null {
  if (age === null || !Number.isFinite(age) || age < 0) return null
  for (const g of AGE_GROUPS) {
    if (age >= g.min && (g.max === null || age <= g.max)) return g.key
  }
  return 'elder'
}

export interface GenealogyStats {
  /** 成员总数 */
  total: number
  male: number
  female: number
  /** 性别未填/未知 */
  unknownGender: number
  /** 各年龄段人数（顺序同 AGE_GROUPS） */
  groups: Record<AgeGroupKey, number>
  /** 无出生日期（年龄未知，不计入任何年龄段） */
  unknownAge: number
}

/** 空统计（无成员时的零值） */
export function emptyGenealogyStats(): GenealogyStats {
  const groups = {} as Record<AgeGroupKey, number>
  for (const g of AGE_GROUPS) groups[g.key] = 0
  return { total: 0, male: 0, female: 0, unknownGender: 0, groups, unknownAge: 0 }
}

/**
 * 家谱人口统计：总数 / 男女 / 年龄段分布。
 * 已故成员按去世日期计「享年」后归入对应年龄段（与列表展示口径一致）；
 * 无出生日期的成员只计入总数与 unknownAge，不猜测年龄段。
 */
export function genealogyStats(members: FamilyMember[], today?: Date): GenealogyStats {
  const stats = emptyGenealogyStats()
  stats.total = members.length
  for (const m of members) {
    if (m.gender === 'male') stats.male += 1
    else if (m.gender === 'female') stats.female += 1
    else stats.unknownGender += 1

    const age = calcAge(m.birthDate, m.deathDate, today)
    const key = ageGroupOf(age)
    if (key) stats.groups[key] += 1
    else stats.unknownAge += 1
  }
  return stats
}
