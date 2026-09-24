// 教师工作台左侧菜单纯逻辑模块：顺序归一化 / 上移下移 / 改名 / 解析渲染（零 vue/pinia 依赖，node 可单测）。
// 与 workbenchMenuCore / studentMenuCore 同构：字段命名 teacherMenuOrder / teacherMenuLabels。
//
// 两个关键约定：
// 1. 可定制菜单 = TEACHER_PAGES 去掉 TEACHER_SETTINGS_ONLY_PAGES（数据管理 / 使用说明已迁入设置页），
//    即「基础功能 + 特色功能」两组；「工作台」分组不再作为菜单项存在。
// 2. 移动限制在同一分组内：渲染按每个页面的 group 字段重新分组，若允许跨组调换，
//    移动后组内相对顺序不变、界面毫无变化（用户会以为按钮失灵）。故跨组一律视为 boundary 拒绝。

import {
  type TeacherPageKey,
  type TeacherRole,
  TEACHER_HEAD_ONLY_PAGES,
  TEACHER_PAGES,
  TEACHER_SETTINGS_ONLY_PAGES
} from '@/types/teacher'

/** 可定制的菜单键（顺序即默认展示顺序；不含已迁入设置页的 data / help）。 */
export const TEACHER_MENU_KEYS: readonly string[] = TEACHER_PAGES.filter(
  (p) => !TEACHER_SETTINGS_ONLY_PAGES.includes(p.key)
).map((p) => p.key)

/** 默认菜单顺序（与键集合一致）。 */
export const TEACHER_MENU_DEFAULT_ORDER: readonly string[] = [...TEACHER_MENU_KEYS]

/** 菜单默认名称（取自 TEACHER_PAGES 的 label）。 */
export const TEACHER_MENU_DEFAULT_LABELS: Record<string, string> = Object.fromEntries(
  TEACHER_PAGES.filter((p) => !TEACHER_SETTINGS_ONLY_PAGES.includes(p.key)).map((p) => [p.key, p.label])
)

/** 菜单图标（取自 TEACHER_PAGES 的 icon）。 */
export const TEACHER_MENU_ICONS: Record<string, string> = Object.fromEntries(
  TEACHER_PAGES.filter((p) => !TEACHER_SETTINGS_ONLY_PAGES.includes(p.key)).map((p) => [p.key, p.icon])
)

/** 菜单键 → 所属分组（渲染时据此重新分组）。 */
export const TEACHER_MENU_GROUP_OF: Record<string, string> = Object.fromEntries(
  TEACHER_PAGES.filter((p) => !TEACHER_SETTINGS_ONLY_PAGES.includes(p.key)).map((p) => [p.key, p.group])
)

const KNOWN_MENU_KEYS: ReadonlySet<string> = new Set<string>(TEACHER_MENU_KEYS)

/** 改名上限（按 code point 计，emoji 代理对算 1 个，绝不拆对）。 */
const MAX_LABEL_LENGTH = 12

function truncate(name: string): string {
  return Array.from(name).slice(0, MAX_LABEL_LENGTH).join('')
}

/** 归一化后的菜单数据形状。 */
export interface TeacherMenuData {
  order: string[]
  labels: Record<string, string>
}

/** 解析后的菜单项（Vue 侧渲染消费）。 */
export interface TeacherMenuItem {
  key: TeacherPageKey
  label: string
  icon: string
  group: string
}

/** 分组聚合结果（与 store.groups 形状一致，供左侧导航 v-for 直接用）。 */
export interface TeacherMenuGroup {
  group: string
  pages: TeacherMenuItem[]
}

/**
 * 归一化菜单顺序与名称（幂等）：
 * order → 仅保留已知键、去重（首次出现优先），缺失的已知键按默认序补全；
 * labels → 仅保留已知键、trim、去空、截断 12 code point。
 * 非数组 / 非对象输入按缺省处理（兜底默认）。
 */
export function normalizeTeacherMenu(order?: unknown, labels?: unknown): TeacherMenuData {
  const seen = new Set<string>()
  const filtered: string[] = []
  if (Array.isArray(order)) {
    for (const key of order) {
      if (typeof key !== 'string' || seen.has(key) || !KNOWN_MENU_KEYS.has(key)) continue
      seen.add(key)
      filtered.push(key)
    }
  }
  for (const key of TEACHER_MENU_KEYS) {
    if (seen.has(key)) continue
    seen.add(key)
    filtered.push(key)
  }
  return { order: filtered, labels: normalizeLabels(labels) }
}

/** labels 归一化：仅已知键、trim、去空、截断 12 code point；非字符串值剔除。 */
function normalizeLabels(labels?: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (labels === null || typeof labels !== 'object' || Array.isArray(labels)) return out
  for (const [key, value] of Object.entries(labels as Record<string, unknown>)) {
    if (!KNOWN_MENU_KEYS.has(key) || typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    out[key] = truncate(trimmed)
  }
  return out
}

/** 上移/下移结果。 */
export interface MoveMenuResult {
  ok: boolean
  reason: 'boundary' | 'not-found' | 'ok'
  order?: string[]
}

/**
 * 菜单项上移/下移一格，且**仅允许与同分组的相邻项对调**：
 * 目标越界 → boundary；目标属于别的分组 → boundary（跨组移动不会改变界面呈现）；
 * 未知键 → not-found。成功时返回对调后的新顺序（不改入参）。
 */
export function moveTeacherMenuItem(order: string[], key: string, dir: 'up' | 'down'): MoveMenuResult {
  const idx = order.indexOf(key)
  if (idx === -1) return { ok: false, reason: 'not-found' }
  const target = dir === 'up' ? idx - 1 : idx + 1
  if (target < 0 || target >= order.length) return { ok: false, reason: 'boundary' }
  if (TEACHER_MENU_GROUP_OF[order[target]] !== TEACHER_MENU_GROUP_OF[key]) {
    return { ok: false, reason: 'boundary' }
  }
  const next = [...order]
  const tmp = next[idx]
  next[idx] = next[target]
  next[target] = tmp
  return { ok: true, reason: 'ok', order: next }
}

/** 改名结果。 */
export interface RenameMenuLabelResult {
  ok: boolean
  reason: 'empty' | 'not-found' | 'ok'
  labels?: Record<string, string>
}

/** 重命名菜单项：trim 后为空 → empty；未知键 → not-found；成功返回新 labels（不可变）。 */
export function renameTeacherMenuLabel(
  labels: Record<string, string>,
  key: string,
  name: string
): RenameMenuLabelResult {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (!KNOWN_MENU_KEYS.has(key)) return { ok: false, reason: 'not-found' }
  return { ok: true, reason: 'ok', labels: { ...labels, [key]: truncate(trimmed) } }
}

/** 某菜单项在当前身份（班主任 / 科任）下是否可见。 */
export function isTeacherMenuPageVisible(key: string, role: TeacherRole): boolean {
  if (role === 'head') return true
  return !TEACHER_HEAD_ONLY_PAGES.includes(key as TeacherPageKey)
}

/**
 * 解析菜单渲染项：按 order 顺序迭代，label = 用户改名 ?? 默认名，icon / group 查表。
 * role 传入时按身份过滤（科任隐藏班务模块）；不传则返回全部（设置页配置用）。
 */
export function resolveTeacherMenuItems(
  order: string[],
  labels: Record<string, string>,
  role?: TeacherRole
): TeacherMenuItem[] {
  return order
    .filter((key) => (role ? isTeacherMenuPageVisible(key, role) : true))
    .map((key) => ({
      key: key as TeacherPageKey,
      label: labels[key] ?? TEACHER_MENU_DEFAULT_LABELS[key],
      icon: TEACHER_MENU_ICONS[key],
      group: TEACHER_MENU_GROUP_OF[key]
    }))
}

/**
 * 按 group 聚合菜单项（保持组内顺序，整组为空则不返回 —— 分组标题一并隐藏）。
 * 分组顺序固定为 TEACHER_PAGES 里出现的分组次序。
 */
export function groupTeacherMenuItems(items: TeacherMenuItem[]): TeacherMenuGroup[] {
  const groups: string[] = []
  for (const it of items) {
    if (!groups.includes(it.group)) groups.push(it.group)
  }
  return groups
    .map((group) => ({ group, pages: items.filter((it) => it.group === group) }))
    .filter((g) => g.pages.length > 0)
}

/** 恢复默认：清掉自定义顺序与名称（返回空结构，由调用方写入 data）。 */
export function defaultTeacherMenu(): TeacherMenuData {
  return { order: [...TEACHER_MENU_DEFAULT_ORDER], labels: {} }
}
