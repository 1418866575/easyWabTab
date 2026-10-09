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

// ============================================================
// 关系候选过滤（成员关系管理弹框：仅展示合理候选）
// 所有规则均为「排除不合理者」，不修改任何成员数据。
// ============================================================

/**
 * 可作为 person 父母的候选成员（返回过滤后的列表）。
 *
 * 排除规则（按优先级）：
 * 1. 自己（不能做自己的父母）
 * 2. 已是该成员父母者（避免重复添加）
 * 3. 该成员的后代（含间接后代）——防止血缘成环（A 是 B 的父，B 又做 A 的父）
 * 4. 年龄小于该成员者——父母在生物学上应年长于子女；双方都无出生日期时不判定
 * 5. 性别与已有父母角色冲突者——同一成员至多一位父亲（男）与一位母亲（女），
 *    若已存在某已知性别的父母，则不再允许添加同性别候选（避免「两位父亲 / 两位母亲」）。
 *    候选或已有父母性别未知时不据此排除。
 */
export function filterParentCandidates(members: FamilyMember[], personId: string): FamilyMember[] {
  const person = members.find((m) => m.id === personId)
  if (!person) return []
  const personAge = calcAge(person.birthDate)
  const existingParentGenders = new Set<string>()
  for (const pid of person.parents) {
    const p = members.find((m) => m.id === pid)
    if (p && p.gender) existingParentGenders.add(p.gender)
  }
  const banned = new Set<string>([
    person.id,
    ...person.parents,
    ...getDescendants(members, personId).map((d) => d.id)
  ])
  return members.filter((m) => {
    if (banned.has(m.id)) return false
    // 规则 4：年龄小于被关联人 → 不合理（父母应年长）
    if (personAge !== null) {
      const a = calcAge(m.birthDate)
      if (a !== null && a < personAge) return false
    }
    // 规则 5：性别与已有父母角色冲突（同性别已存在一位）
    if (m.gender && existingParentGenders.has(m.gender)) return false
    return true
  })
}

/**
 * 可作为 person 配偶的候选成员（返回过滤后的列表）。
 *
 * 排除规则：
 * 1. 自己（不能做自己的配偶）
 * 2. 已是该成员配偶者（UI 为「一对一」，已有配偶时下拉本就禁用）
 * 3. 关系互斥——与该成员已有血缘/亲属关系者（父母 / 子女 / 兄弟姐妹 / 祖先 / 后代）
 *    与「配偶」角色互斥，不能作为配偶候选。双方若在亲属链上，可能构成乱伦或血缘环，排除。
 * 4. 性别不匹配者——采用异性配偶模型：双方性别均已知且相同（男男 / 女女）视为不匹配，排除。
 *    任一方性别未知时无法确认匹配，不据此排除（保留候选，由用户判断）。
 */
export function filterSpouseCandidates(members: FamilyMember[], personId: string): FamilyMember[] {
  const person = members.find((m) => m.id === personId)
  if (!person) return []
  // 互斥集合：自己 + 现有配偶 + 全部血缘/亲属（父母、子女、兄弟姐妹、祖先、后代）
  const banned = new Set<string>([
    person.id,
    ...person.spouses,
    ...getParents(members, personId).map((m) => m.id),
    ...getChildren(members, personId).map((m) => m.id),
    ...getSiblings(members, personId).map((m) => m.id),
    ...getAncestors(members, personId).map((m) => m.id),
    ...getDescendants(members, personId).map((m) => m.id)
  ])
  return members.filter((m) => {
    if (banned.has(m.id)) return false
    // 规则 4：双方性别均已知且相同 → 性别不匹配
    if (person.gender && m.gender && person.gender === m.gender) return false
    return true
  })
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

// ============================================================
// 导入 / 导出（家谱在家庭成员间分享）
// ============================================================

/** 导出文件格式版本号（后续结构演进据此兼容旧文件） */
export const GENEALOGY_EXPORT_VERSION = 1
/** 导出文件名固定前缀 */
export const GENEALOGY_EXPORT_FILENAME = '家谱数据.json'

/** 导出信封（落盘/分享的 JSON 结构） */
export interface GenealogyExportFile {
  /** 文件类型标识，便于导入时识别与将来支持其它格式 */
  kind: 'easy-web-tab-genealogy'
  version: number
  exportedAt: string
  data: GenealogyData
}

/** 构造导出信封（纯对象，不含响应式代理） */
export function buildGenealogyExport(data: GenealogyData, now: Date = new Date()): GenealogyExportFile {
  return {
    kind: 'easy-web-tab-genealogy',
    version: GENEALOGY_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    data: {
      members: JSON.parse(JSON.stringify(data.members ?? [])),
      rootId: data.rootId ?? null
    }
  }
}

/** 成员清洗结果与统计（导入时告知用户「导入 N 条 / 跳过 M 条」） */
export interface NormalizeGenealogyResult {
  data: GenealogyData
  /** 成功导入的成员数 */
  valid: number
  /** 被丢弃的成员数（缺少姓名/id 等） */
  skipped: number
  /** 悬空关系数（parents/spouses 指向不存在的 id，已剔除） */
  danglingRefs: number
  warnings: string[]
}

const GENDERS = ['male', 'female', '', null]

/** 'YYYY-MM-DD' 合法校验（复用 calcAge 的严格判法思路，拒绝 2 月 30 日） */
function isDateKey(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
  if (!m) return false
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

/**
 * 导入清洗（幂等、脏数据不抛错）：
 * - 成员：id 缺失/重名 → 重新生成；姓名缺失/超长 → 丢弃并计入 skipped
 * - 性别：非 male/female → 归一为 null（UI 显示「不详」）
 * - 日期：非法 → undefined；头像：非 data URL 字符串 → 丢弃（避免注入外链）
 * - 关系：指向不存在 id 的 parents/spouses → 剔除并计入 danglingRefs
 * - rootId：不存在于成员中 → 置 null
 */
export function normalizeGenealogyImport(raw: unknown): NormalizeGenealogyResult {
  const warnings: string[] = []
  const empty: NormalizeGenealogyResult = { data: emptyGenealogyData(), valid: 0, skipped: 0, danglingRefs: 0, warnings }

  // 兼容两种形态：带信封 {kind,version,data} 或裸 {members,rootId}
  let src: Record<string, unknown> | null = null
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    if (r.kind === 'easy-web-tab-genealogy' || r.data && typeof r.data === 'object') {
      src = (r.data ?? r) as Record<string, unknown>
      if (r.kind && r.kind !== 'easy-web-tab-genealogy') {
        warnings.push('文件类型标识不匹配，已按家谱数据尝试解析')
      }
    } else {
      src = r
    }
  }
  if (!src) return empty

  const rawMembers = Array.isArray(src.members) ? src.members : []
  if (!rawMembers.length) {
    warnings.push('文件中没有成员数据')
    return empty
  }

  const usedIds = new Set<string>()
  let seq = 0
  const nextId = (): string => {
    seq += 1
    let id = `fm_${Date.now().toString(36)}_${seq.toString(36)}`
    while (usedIds.has(id)) id = `fm_${Date.now().toString(36)}_${(seq + 1).toString(36)}`
    usedIds.add(id)
    return id
  }

  const nowIso = new Date().toISOString()
  const members: FamilyMember[] = []
  let skipped = 0
  // 第一轮：建成员、收集「原 id → 实际 id」映射（用于第二轮重挂关系）
  const idMap = new Map<string, string>()

  for (const raw2 of rawMembers) {
    const m = (raw2 ?? {}) as Record<string, unknown>
    const name = typeof m.name === 'string' ? m.name.trim() : ''
    if (!name) { skipped += 1; continue }
    if (name.length > 50) {
      warnings.push(`「${name.slice(0, 12)}…」姓名超过 50 字，已截断`)
    }
    const oldId = typeof m.id === 'string' && m.id ? m.id : ''
    // id 冲突时：**首个保留原 id**，后续重复者分配新 id；
    // 映射只登记「原 id → 实际 id」，且同名的原 id 只认第一个（后续重复者视为不同成员）
    let id: string
    if (oldId && !usedIds.has(oldId) && !idMap.has(oldId)) {
      id = oldId
      usedIds.add(id)
      idMap.set(oldId, id)
    } else {
      id = nextId()
      // 原 id 已被前面的成员占用 → 本条视为独立成员，不参与关系重挂映射
      if (!oldId) idMap.set(id, id)
    }

    const gender = GENDERS.includes(m.gender as never) ? (m.gender as FamilyMember['gender']) : null
    const out: FamilyMember = {
      id,
      name: name.slice(0, 50),
      gender,
      parents: [],
      spouses: [],
      createdAt: typeof m.createdAt === 'string' ? m.createdAt : nowIso,
      updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : nowIso
    }
    if (isDateKey(m.birthDate)) out.birthDate = m.birthDate
    if (isDateKey(m.deathDate)) out.deathDate = m.deathDate
    if (typeof m.phone === 'string' && m.phone) out.phone = m.phone
    if (typeof m.note === 'string' && m.note) out.note = m.note
    // 头像仅接受 data URL（分享文件体积可控，也避免外链注入）
    if (typeof m.avatar === 'string' && /^data:image\//i.test(m.avatar)) out.avatar = m.avatar
    members.push(out)
  }

  // 第二轮：重挂 parents / spouses（经 idMap 映射到新 id，并剔除悬空）
  // 注意：id 重复而被重新分配新 id 的成员**不参与**映射（其原 id 属于先出现的那位），
  // 因此下面只处理「idMap 里有登记」的成员。
  const existIds = new Set(members.map(m => m.id))
  let dangling = 0
  const byId = new Map(members.map(m => [m.id, m]))
  for (const [oldId, actualId] of idMap) {
    const target = byId.get(actualId)
    if (!target) continue
    // 从原始数据里找出这条成员，读取其关系
    const src = rawMembers.find((r2: any) => (r2 ?? {}).id === oldId) as Record<string, unknown> | undefined
    if (!src) continue
    const remap = (v: unknown): string | null => {
      if (typeof v !== 'string' || !v) return null
      const mapped = idMap.get(v) ?? v
      return existIds.has(mapped) ? mapped : null
    }
    for (const key of ['parents', 'spouses'] as const) {
      const list = Array.isArray(src[key]) ? (src[key] as unknown[]) : []
      const out: string[] = []
      for (const v of list) {
        const id = remap(v)
        if (id) out.push(id)
        else dangling += 1
      }
      target[key] = [...new Set(out)]
    }
  }

  // rootId 必须指向存在的成员，否则置空（避免树视图指向空成员）
  let rootId: string | null = null
  if (typeof src.rootId === 'string' && src.rootId) {
    const mapped = idMap.get(src.rootId) ?? src.rootId
    if (existIds.has(mapped)) rootId = mapped
    else warnings.push('主根成员不存在，已清空主根标记')
  }

  return { data: { members, rootId }, valid: members.length, skipped, danglingRefs: dangling, warnings }
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

/** 十二生肖（顺序固定：鼠→猪，下标 0..11） */
export const ZODIAC_ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'] as const

/**
 * 生肖（属相）：由出生年份推导，无需存储（与年龄同源，均派生自 birthDate）。
 * 公式：下标 = (年份 - 4) % 12（公元 4 年为甲子鼠年起点，2020 鼠年校验通过）。
 * 注：按公历年份计算；民俗以「春节」为生肖分界，跨春节出生者若需按农历判定需另行换算。
 * 出生日期缺失/非法 → null。
 */
export function calcZodiac(birthDate?: string | null): string | null {
  const d = parseDateKey(birthDate)
  if (!d) return null
  const idx = ((d.getFullYear() - 4) % 12 + 12) % 12
  return ZODIAC_ANIMALS[idx]
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
