/**
 * 面板「列表 / 卡片」视图偏好（纯逻辑，零 Vue 依赖，node 可直测）
 *
 * 只有登记在 PANEL_VIEW_MODE_KEYS 里的面板才持久化 + 云同步；唯一未登记的
 * BusinessCategoryManager 只用 vm.isMobile 做断点判断（没有切换按钮），
 * 沿用 useViewMode() 的组件实例局部状态，行为不变。
 * 偏好是「用户级 UI 设置」，统一走 settings → workbench.json 信封，不跟各模块自己的
 * 数据信封（business.json / student.json）走——与 AppSettingsData.businessActiveSection 同款语义。
 *
 * 关键约定：默认值 'list' **不落库**（缺省即默认）。这样多设备合并时，
 * 「本机没改过该面板」不会用一个显式的 list 把云端设的 card 覆盖掉
 * （飞书 feishuPull 常规合并是本地优先 {...remote, ...local}）。
 */

// 按工作台分组登记（五台全覆盖，便于后续新增面板按组追加）。
// 个人工作台 4 个 key 与 WORKBENCH_MENU_KEYS 逐字一致，且已有用户数据落库，**不可改名**。
export const WORKBENCH_VIEW_MODE_KEYS = ['todos', 'notes', 'countdowns', 'genealogy'] as const
/** 销售记账：biz- 前缀。BusinessCategoryManager 只用 isMobile，不参与视图偏好 */
export const BUSINESS_VIEW_MODE_KEYS = ['biz-purchases', 'biz-expenses', 'biz-daily'] as const
/** 学生工作台：stu- 前缀，与 STUDENT_MENU_KEYS 的面板一一对应 */
export const STUDENT_VIEW_MODE_KEYS = [
  'stu-education', 'stu-grades', 'stu-height', 'stu-homework', 'stu-goals',
  'stu-mistakes', 'stu-exam', 'stu-plan', 'stu-reading', 'stu-review', 'stu-reward'
] as const

/** 教师工作台：tea- 前缀 */
export const TEACHER_VIEW_MODE_KEYS = ['tea-talks', 'tea-homework', 'tea-groups'] as const
/** 博客后台：blog- 前缀（文章列表） */
export const BLOG_VIEW_MODE_KEYS = ['blog-posts'] as const

export const PANEL_VIEW_MODE_KEYS = [
  ...WORKBENCH_VIEW_MODE_KEYS,
  ...BUSINESS_VIEW_MODE_KEYS,
  ...STUDENT_VIEW_MODE_KEYS,
  ...TEACHER_VIEW_MODE_KEYS,
  ...BLOG_VIEW_MODE_KEYS
] as const
export type PanelViewModeKey = (typeof PANEL_VIEW_MODE_KEYS)[number]
export type PanelViewMode = 'list' | 'card'
export type PanelViewModeMap = Partial<Record<PanelViewModeKey, PanelViewMode>>

const KEY_SET: ReadonlySet<string> = new Set<string>(PANEL_VIEW_MODE_KEYS)

/** 是否是需要持久化的面板 key（防误传 / 防云端脏 key 落库） */
export function isPanelViewModeKey(key: unknown): key is PanelViewModeKey {
  return typeof key === 'string' && KEY_SET.has(key)
}

/**
 * 归一化云端 / IDB 拉回的偏好字典：
 * 只保留白名单 key 且值为 'card' 的项；'list'、非法枚举、数组、null 一律丢弃。
 */
export function normalizePanelViewModes(raw: unknown): PanelViewModeMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const src = raw as Record<string, unknown>
  const out: PanelViewModeMap = {}
  for (const key of PANEL_VIEW_MODE_KEYS) {
    if (src[key] === 'card') out[key] = 'card'
  }
  return out
}

/** 读取单面板偏好：未登记 key / 未设置 / 脏数据 → 'list' */
export function panelViewModeOf(raw: unknown, key: string): PanelViewMode {
  if (!isPanelViewModeKey(key)) return 'list'
  return normalizePanelViewModes(raw)[key] ?? 'list'
}

/** 写入单面板偏好：返回新字典（不修改入参）；写 'list' = 删除该键回到默认 */
export function withPanelViewMode(raw: unknown, key: string, mode: PanelViewMode): PanelViewModeMap {
  const next: PanelViewModeMap = { ...normalizePanelViewModes(raw) }
  if (!isPanelViewModeKey(key)) return next
  if (mode === 'list') delete next[key]
  else next[key] = 'card'
  return next
}
