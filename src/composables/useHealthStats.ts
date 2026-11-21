/**
 * 本机健康模块访问次数（设置 → 访问统计 → 我的使用 → 最常使用的健康模块）
 *
 * 像工具箱的「最常用的工具」那样，统计每个健康子模块（运动/饮食/睡眠/体重/菜谱/身高/健身）
 * 被打开的次数，按次数降序展示自己的使用习惯。只留本机 IndexedDB 的 nav store，
 * 不上传、不进云同步信封 —— 与 useVisitStats 同一套存储约定（信封只挑白名单键）。
 *
 * 只存一个 key：health:module-clicks → { [moduleKey]: number }。
 * 内存聚合 + 1s 防抖落盘；pagehide 时补一次强制落盘，防抖窗口内不丢数据。
 */
import { idbGetKey, idbPutKey } from './useIdb.ts'
import { HEALTH_MENU_DEFAULT_LABELS, HEALTH_MENU_KEYS, type HealthMenuKey } from './healthMenuCore.ts'

/** 单个模块计数上限（防止无限增长；与工具箱 click 上限同量级） */
const CLICK_MAX = 1_000_000
/** 存储 key（nav store，按 key 多记录的通用容器） */
const CLICKS_KEY = 'health:module-clicks'
/** 落盘防抖窗口 */
const FLUSH_DELAY = 1000

/** 内存态；null = 尚未装载 */
let cache: Record<string, number> | null = null
let timer: ReturnType<typeof setTimeout> | null = null
/** 并发调用共用同一次装载 */
let loading: Promise<void> | null = null

/** 把库里读出的值收敛成「已知模块 → 正整数」，脏数据/改名模块一律丢弃 */
function normalizeClicks(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw || typeof raw !== 'object') return out
  const o = raw as Record<string, unknown>
  for (const k of HEALTH_MENU_KEYS) {
    const v = o[k]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[k] = Math.min(Math.floor(v), CLICK_MAX)
    }
  }
  return out
}

async function ensureLoaded(): Promise<void> {
  if (cache) return
  if (loading) return loading
  loading = (async () => {
    let next: Record<string, number> = {}
    try {
      next = normalizeClicks(await idbGetKey<unknown>('nav', CLICKS_KEY))
    } catch (e) {
      // IndexedDB 不可用 → 降级为内存态，不影响其它功能
      console.warn('[health-stats] IndexedDB 不可用，健康模块统计降级为仅本会话:', e)
    }
    cache = next
    loading = null
  })()
  return loading
}

async function flushNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (!cache) return
  try {
    await idbPutKey('nav', CLICKS_KEY, { ...cache })
  } catch (e) {
    console.warn('[health-stats] 落盘失败:', e)
  }
}

function scheduleFlush(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    void flushNow()
  }, FLUSH_DELAY)
}

/** 记一次健康模块访问（key 用 healthMenuCore 的 7 个模块键） */
export async function recordHealthModuleClick(key: HealthMenuKey | string): Promise<void> {
  await ensureLoaded()
  if (!cache) return
  if (!(HEALTH_MENU_KEYS as readonly string[]).includes(key)) return
  cache[key] = Math.min((cache[key] ?? 0) + 1, CLICK_MAX)
  scheduleFlush()
}

/** 立即落盘（pagehide / 卸载时用） */
export function flushHealthStats(): void {
  void flushNow()
}

/** 读出全部点击次数（返回副本，调用方改不到内存态） */
export async function loadHealthModuleClicks(): Promise<Record<string, number>> {
  await ensureLoaded()
  return { ...(cache ?? {}) }
}

/** 清空全部健康模块点击次数（设置页「清空统计」用） */
export async function clearHealthModuleClicks(): Promise<void> {
  await ensureLoaded()
  cache = {}
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  try {
    await idbPutKey('nav', CLICKS_KEY, {})
  } catch (e) {
    console.warn('[health-stats] 清空落盘失败:', e)
  }
}

/** 模块键 → 中文名（菜单自定义名由面板侧覆盖；未登记的原样返回） */
export function healthModuleLabel(key: string): string {
  return HEALTH_MENU_DEFAULT_LABELS[key as HealthMenuKey] ?? key
}
