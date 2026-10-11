/**
 * 智能工作台设置纯逻辑（零 vue / 零 pinia / 零 DOM，node --experimental-strip-types 可测）
 * ------------------------------------------------------------------
 * 两块设置都在这里落地规则，UI 只负责呈现与事件：
 *   1. 左侧菜单：顺序 / 改名 / 显示隐藏（与 teacherMenuCore 同构，但多一个 hidden 维度）
 *   2. 技能分类：新增 / 重命名 / 删除，以及「分类 → 技能」的归属计算
 * 所有函数不改入参，返回新值；非法输入一律降级而非抛错。
 */

// ==================== 左侧菜单 ====================

export const SMART_MENU_KEYS = ['overview', 'skills', 'prompts', 'workflows'] as const
export type SmartMenuKey = (typeof SMART_MENU_KEYS)[number]

export const SMART_MENU_DEFAULT_LABELS: Record<string, string> = {
  overview: '概览',
  skills: '技能管理',
  prompts: '提示词管理',
  workflows: '工作流管理'
}

export const SMART_MENU_ICONS: Record<string, string> = {
  overview: 'chart',
  skills: 'toolbox',
  prompts: 'notes',
  workflows: 'merge'
}

/** 改名上限（按 code point，emoji 代理对算 1 个，绝不拆对） */
export const SMART_MENU_LABEL_MAX = 12

export interface SmartMenuData {
  /** 展示顺序（只含已知 key） */
  order: string[]
  /** key → 自定义名称（缺省用默认名） */
  labels: Record<string, string>
  /** 被隐藏的 key */
  hidden: string[]
}

export interface SmartMenuItem {
  key: string
  label: string
  icon: string
  hidden: boolean
}

const KNOWN: ReadonlySet<string> = new Set<string>(SMART_MENU_KEYS)

/** 按 code point 截断（emoji 代理对算 1 个，绝不拆对）；默认上限为菜单改名上限 */
function truncateLabel(v: string, max: number = SMART_MENU_LABEL_MAX): string {
  return Array.from(v).slice(0, max).join('')
}

/** 默认菜单数据：默认顺序、无改名、全部显示 */
export function defaultMenuData(): SmartMenuData {
  return { order: [...SMART_MENU_KEYS], labels: {}, hidden: [] }
}

/** 归一化菜单数据：补全缺失项、剔除未知 key、去重、改名截断。幂等。 */
export function normalizeMenuData(raw: unknown): SmartMenuData {
  const o = (raw ?? {}) as Record<string, unknown>
  const seen = new Set<string>()
  const order: string[] = []
  const push = (k: string) => {
    if (!KNOWN.has(k) || seen.has(k)) return
    seen.add(k)
    order.push(k)
  }
  if (Array.isArray(o.order)) {
    for (const k of o.order) if (typeof k === 'string') push(k)
  }
  // 未知/缺失的 key 按默认顺序补在后面，保证菜单不会缺项
  for (const k of SMART_MENU_KEYS) push(k)

  const labels: Record<string, string> = {}
  const rawLabels = (o.labels ?? {}) as Record<string, unknown>
  for (const k of order) {
    const v = rawLabels[k]
    if (typeof v === 'string') {
      const t = truncateLabel(v.trim())
      if (t) labels[k] = t
    }
  }

  const hidden: string[] = []
  if (Array.isArray(o.hidden)) {
    for (const k of o.hidden) if (typeof k === 'string' && KNOWN.has(k) && !hidden.includes(k)) hidden.push(k)
  }
  return { order, labels, hidden }
}

/** 解析为渲染用菜单项（已按顺序、已应用改名、带 hidden 标记） */
export function resolveMenu(data: SmartMenuData): SmartMenuItem[] {
  const d = normalizeMenuData(data)
  return d.order.map(k => ({
    key: k,
    label: d.labels[k] ?? SMART_MENU_DEFAULT_LABELS[k] ?? k,
    icon: SMART_MENU_ICONS[k] ?? 'dot',
    hidden: d.hidden.includes(k)
  }))
}

/** 可见菜单项（解析后过滤 hidden） */
export function visibleMenu(data: SmartMenuData): SmartMenuItem[] {
  return resolveMenu(data).filter(i => !i.hidden)
}

/** 上移 / 下移：越界返回原值 */
export function moveMenu(data: SmartMenuData, key: string, dir: 'up' | 'down'): SmartMenuData {
  const d = normalizeMenuData(data)
  const i = d.order.indexOf(key)
  if (i === -1) return d
  const j = dir === 'up' ? i - 1 : i + 1
  if (j < 0 || j >= d.order.length) return d
  const order = [...d.order]
  ;[order[i], order[j]] = [order[j], order[i]]
  return { ...d, order }
}

/** 拖拽换位：把 fromIndex 处的项插到 toIndex 处，越界返回原值 */
export function reorderMenu(data: SmartMenuData, fromIndex: number, toIndex: number): SmartMenuData {
  const d = normalizeMenuData(data)
  if (fromIndex === toIndex) return d
  if (fromIndex < 0 || fromIndex >= d.order.length) return d
  if (toIndex < 0 || toIndex >= d.order.length) return d
  const order = [...d.order]
  const [moved] = order.splice(fromIndex, 1)
  order.splice(toIndex, 0, moved)
  return { ...d, order }
}

/** 改名：空值视为「恢复默认」，超长截断 */
export function setMenuLabel(data: SmartMenuData, key: string, label: string): SmartMenuData {
  const d = normalizeMenuData(data)
  if (!KNOWN.has(key)) return d
  const t = truncateLabel(String(label ?? '').trim())
  const labels = { ...d.labels }
  if (!t || t === SMART_MENU_DEFAULT_LABELS[key]) delete labels[key]
  else labels[key] = t
  return { ...d, labels }
}

/** 切换显示 / 隐藏 */
export function toggleMenuHidden(data: SmartMenuData, key: string): SmartMenuData {
  const d = normalizeMenuData(data)
  if (!KNOWN.has(key)) return d
  const hidden = d.hidden.includes(key) ? d.hidden.filter(k => k !== key) : [...d.hidden, key]
  return { ...d, hidden }
}

/** 是否允许再隐藏一项：可见项只剩 1 个时不允许继续隐藏（否则页面空白无处可去） */
export function canHideMenu(data: SmartMenuData, key: string): boolean {
  const d = normalizeMenuData(data)
  if (d.hidden.includes(key)) return true // 已隐藏 → 允许再显示
  return visibleMenu(d).length > 1
}

// ==================== 技能分类 ====================

export const SMART_CATEGORY_NAME_MAX = 20
export const UNCATEGORIZED = '未分类'

/**
 * 默认技能分类：覆盖日常使用 AI 技能的高频场景，新建 / 编辑技能时可直接选用。
 * 顺序即推荐顺序（越靠前越常用）；用户可在「智能工作台设置 → 技能分类」里自由增删改名。
 * 未分类（UNCATEGORIZED）不在此列——它是「没有指定分类」时的兜底值，不需要用户挑选。
 */
export const SMART_SKILL_DEFAULT_CATEGORIES: string[] = [
  '办公',
  '写作',
  '编程',
  '数据分析',
  '画画',
  '设计',
  '学习教育',
  '翻译',
  '营销',
  '效率工具',
  '音视频',
  '生活实用',
  '职场求职',
  '学术研究'
]

/**
 * 把默认分类合并进已有列表：默认分类按推荐顺序排在前，用户自建的分类排在其后。
 * 幂等（重复调用结果不变）；已存在的同名分类不会重复出现。
 */
export function mergeDefaultCategories(list: string[]): string[] {
  const cur = normalizeCategories(list)
  const extras = cur.filter(c => !SMART_SKILL_DEFAULT_CATEGORIES.includes(c))
  return [...SMART_SKILL_DEFAULT_CATEGORIES, ...extras]
}

/** 归一化分类名列表：去空白、去空、去重、截断；非法输入回落空数组 */
export function normalizeCategories(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const name = truncateLabel(v.trim(), SMART_CATEGORY_NAME_MAX)
    if (!name || out.includes(name)) continue
    out.push(name)
  }
  return out
}

export interface CategoryResult {
  ok: boolean
  list: string[]
  /** 失败原因（重名 / 空值 / 超限），ok=true 时为空 */
  error?: string
}

/** 新增分类：空值、重名、超长都拒绝并给出原因 */
export function addCategory(list: string[], name: string): CategoryResult {
  const cur = normalizeCategories(list)
  const t = String(name ?? '').trim()
  if (!t) return { ok: false, list: cur, error: '请填写分类名称' }
  if (Array.from(t).length > SMART_CATEGORY_NAME_MAX) {
    return { ok: false, list: cur, error: `分类名不能超过 ${SMART_CATEGORY_NAME_MAX} 字` }
  }
  if (cur.includes(t)) return { ok: false, list: cur, error: `已存在分类「${t}」` }
  return { ok: true, list: [...cur, t] }
}

/** 重命名分类：把 oldName 改为 newName（同时返回新列表；oldName 不存在则原样返回） */
export function renameCategory(list: string[], oldName: string, newName: string): CategoryResult {
  const cur = normalizeCategories(list)
  const t = String(newName ?? '').trim()
  if (t === oldName) return { ok: true, list: cur }
  if (!t) return { ok: false, list: cur, error: '请填写分类名称' }
  if (Array.from(t).length > SMART_CATEGORY_NAME_MAX) {
    return { ok: false, list: cur, error: `分类名不能超过 ${SMART_CATEGORY_NAME_MAX} 字` }
  }
  if (cur.includes(t)) return { ok: false, list: cur, error: `已存在分类「${t}」` }
  if (!cur.includes(oldName)) return { ok: false, list: cur, error: `分类「${oldName}」不存在` }
  return { ok: true, list: cur.map(c => (c === oldName ? t : c)) }
}

/** 删除分类（列表层面）；技能归属的清理由调用方配合 removeSkillsFromCategory 完成 */
export function removeCategory(list: string[], name: string): string[] {
  return normalizeCategories(list).filter(c => c !== name)
}

/**
 * 汇总分类清单：技能上实际出现的分类 ∪ 自定义分类（自定义列表允许存在「还没有技能」的空分类）。
 * 返回去重后的稳定列表（自定义列表顺序优先，其余按字典序补在后面）。
 */
export function collectCategories(custom: string[], skillCats: string[]): string[] {
  const out = normalizeCategories(custom)
  for (const c of skillCats) {
    if (typeof c !== 'string') continue
    const name = c.trim()
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

/** 统计每个分类下的技能数量（键为分类名） */
export function countByCategory(skillCats: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of skillCats) {
    const name = String(c ?? '').trim() || UNCATEGORIZED
    out[name] = (out[name] ?? 0) + 1
  }
  return out
}
