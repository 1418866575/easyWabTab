/**
 * 健康工作台左侧菜单配置（纯逻辑，零 Vue / Pinia 依赖）
 * 与个人工作台 workbenchMenuCore 同构：6 项（4 个指标 + 菜谱 + 身高），支持排序 / 改名 / 显隐。
 * 数据作为界面偏好存 settings，随 workbench.json 同步；健康业务数据独立在 health.json。
 */
export const HEALTH_MENU_KEYS = ['exercise', 'diet', 'sleep', 'weight', 'recipes', 'height'] as const
export type HealthMenuKey = (typeof HEALTH_MENU_KEYS)[number]

export const HEALTH_MENU_DEFAULT_LABELS: Record<HealthMenuKey, string> = {
  exercise: '运动',
  diet: '饮食',
  sleep: '睡眠',
  weight: '体重',
  recipes: '菜谱',
  height: '身高'
}

export const HEALTH_MENU_ICONS: Record<HealthMenuKey, string> = {
  exercise: 'exercise',
  diet: 'diet',
  sleep: 'sleep',
  weight: 'weight',
  recipes: 'recipe',
  height: 'trending-up'
}

export interface HealthMenuData {
  order: string[]
  labels: Record<string, string>
  /** false = 隐藏；缺失一律显示 */
  visibility: Record<string, boolean>
}

export interface HealthMenuItem {
  key: HealthMenuKey
  label: string
  icon: string
}

export function emptyHealthMenuData(): HealthMenuData {
  return { order: [...HEALTH_MENU_KEYS], labels: {}, visibility: {} }
}

/** 只保留已知键；缺失按默认序补齐；不可全部隐藏（至少保留 1 项） */
export function normalizeHealthMenu(data?: unknown): HealthMenuData {
  const raw = (data && typeof data === 'object' ? data : {}) as Partial<HealthMenuData>
  const seen = new Set<string>()
  const order: string[] = []
  if (Array.isArray(raw.order)) {
    for (const k of raw.order) {
      if (typeof k === 'string' && (HEALTH_MENU_KEYS as readonly string[]).includes(k) && !seen.has(k)) {
        seen.add(k)
        order.push(k)
      }
    }
  }
  for (const k of HEALTH_MENU_KEYS) if (!seen.has(k)) order.push(k)

  const labels: Record<string, string> = {}
  if (raw.labels && typeof raw.labels === 'object') {
    for (const k of HEALTH_MENU_KEYS) {
      const v = (raw.labels as Record<string, unknown>)[k]
      if (typeof v === 'string' && v.trim() && v.trim() !== HEALTH_MENU_DEFAULT_LABELS[k]) {
        labels[k] = Array.from(v.trim()).slice(0, 12).join('')
      }
    }
  }
  const visibility: Record<string, boolean> = {}
  if (raw.visibility && typeof raw.visibility === 'object') {
    for (const k of HEALTH_MENU_KEYS) {
      if ((raw.visibility as Record<string, unknown>)[k] === false) visibility[k] = false
    }
  }
  if (Object.keys(visibility).length >= HEALTH_MENU_KEYS.length) {
    visibility[order[0]] = true
  }
  return { order, labels, visibility }
}

export function moveHealthMenuItem(order: string[], key: string, dir: 'up' | 'down'): { ok: boolean; order: string[] } {
  const next = [...order]
  const i = next.indexOf(key)
  const j = dir === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= next.length) return { ok: false, order: next }
  ;[next[i], next[j]] = [next[j], next[i]]
  return { ok: true, order: next }
}

/** 过滤隐藏项，label 回退默认名，icon 查表 */
export function resolveHealthMenuItems(data: HealthMenuData): HealthMenuItem[] {
  return data.order
    .filter((k): k is HealthMenuKey => (HEALTH_MENU_KEYS as readonly string[]).includes(k) && data.visibility[k] !== false)
    .map((k) => ({ key: k, label: data.labels[k] ?? HEALTH_MENU_DEFAULT_LABELS[k], icon: HEALTH_MENU_ICONS[k] }))
}
