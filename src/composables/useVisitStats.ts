/**
 * 本机访问记录（访问统计 · 本地部分）
 *
 * 只记「这台设备的这个人访问了站内哪个模块」，一天一条记录，全部留在 IndexedDB 的 nav store。
 * 不上传、不进云同步信封、不发任何网络请求 —— 「我的使用习惯」这层信息没有离开设备的理由。
 *
 * ## 为什么复用 nav store 而不新建 object store
 * 新建 store 要把 `DB_VERSION` 23 → 24 并写升级分支，而这次只是几条按 key 的记录，
 * nav 自 v21 起本就是「按 key 多记录」的通用容器（smart / books / blog 的偏好都这么放），
 * 零迁移成本。导出的 nav 备份只挑 `SMART_PREFS_KEYS` 等白名单键，这里的数据天然不会外泄。
 *
 * ## 写入策略
 * 内存聚合 + 1s 防抖落盘：路由切换可能连着发生（点开 → 跳转 → 重定向），
 * 每次导航都写一次盘既慢又费 IO。pagehide 时补一次强制落盘，避免防抖窗口内丢数据。
 *
 * 多标签页并发：同一天同一 key，后写覆盖先写，会有少量计数丢失 ——
 * 这份数据是给自己看的趋势，不值得为它引入跨页锁或合并协议。
 */
import type { Router } from 'vue-router'
import { idbDeleteKey, idbGetAllEntries, idbPutKey } from './useIdb.ts'
import {
  addVisit,
  dayKey,
  emptyDay,
  normalizeDay,
  STATS_KEEP_DAYS,
  trimKeys,
  type VisitDay
} from './statsCore.ts'

/** 每天一条：stats:day:YYYY-MM-DD */
const DAY_PREFIX = 'stats:day:'
/** 元信息（首条记录时间），单独一条，便于判断"从哪天开始统计" */
const META_KEY = 'stats:meta'
/** 落盘防抖窗口 */
const FLUSH_DELAY = 1000

/** 内存态：dayKey → VisitDay */
let cache: Record<string, VisitDay> | null = null
/** 有改动但还没落盘的 dayKey */
const dirty = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
/** 并发调用共用同一次装载 */
let loading: Promise<void> | null = null

/** 从 nav store 里挑出访问记录的键值对 */
function pickDayRecords(all: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(DAY_PREFIX)) continue
    if (typeof v === 'string') out.push([k.slice(DAY_PREFIX.length), v])
  }
  return out
}

/**
 * 首次读取：把全部日记录装进内存，并顺手裁掉超期数据。
 * 裁剪只在装载时做一次 —— 每天开页面都会跑，够用且不必在写路径上反复算。
 */
async function ensureLoaded(): Promise<void> {
  if (cache) return
  if (loading) return loading
  loading = (async () => {
    const next: Record<string, VisitDay> = {}
    try {
      const all = (await idbGetAllEntries('nav')) ?? {}
      for (const [key, raw] of pickDayRecords(all)) {
        try {
          next[key] = normalizeDay(JSON.parse(raw))
        } catch {
          // 单条坏数据不该拖垮整份统计
          next[key] = emptyDay()
        }
      }
      // 超期/非法键直接删，别留垃圾
      const drop = trimKeys(Object.keys(next))
      for (const k of drop) {
        delete next[k]
        void idbDeleteKey('nav', DAY_PREFIX + k).catch(() => {})
      }
    } catch (e) {
      // IndexedDB 不可用（隐私模式 / 配额满）→ 降级为内存态，面板显示空趋势，不影响其它功能
      console.warn('[visit-stats] IndexedDB 不可用，访问统计降级为仅本会话:', e)
    }
    cache = next
    loading = null
  })()
  return loading
}

/** 真正写盘：只写脏掉的那几天 */
async function flushNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (!cache || dirty.size === 0) return
  const keys = Array.from(dirty)
  dirty.clear()
  for (const k of keys) {
    const day = cache[k]
    if (!day) continue
    try {
      await idbPutKey('nav', DAY_PREFIX + k, JSON.stringify(day))
    } catch (e) {
      // 写失败把 key 放回脏集合，下次还能补上（配额释放后可能就成功了）
      dirty.add(k)
      console.warn('[visit-stats] 落盘失败:', e)
      break
    }
  }
  try {
    await idbPutKey('nav', META_KEY, JSON.stringify({ version: 1, updatedAt: Date.now() }))
  } catch {
    /* 元信息写失败无伤大雅 */
  }
}

function scheduleFlush(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    void flushNow()
  }, FLUSH_DELAY)
}

/** 记一次页面访问（pageKey 建议传路由 name，见 statsCore.PAGE_LABELS） */
export async function recordVisit(pageKey: string, at: Date = new Date()): Promise<void> {
  await ensureLoaded()
  if (!cache) return
  const key = dayKey(at)
  cache[key] = addVisit(cache[key] ?? emptyDay(), pageKey, at.getHours())
  dirty.add(key)
  scheduleFlush()
}

/** 立即落盘（页面隐藏 / 卸载、以及清空后确认时用） */
export function flushVisitStats(): void {
  void flushNow()
}

/** 读出全部日记录（供面板聚合；返回副本，调用方改不到内存态） */
export async function loadVisitDays(): Promise<Record<string, VisitDay>> {
  await ensureLoaded()
  const out: Record<string, VisitDay> = {}
  for (const [k, v] of Object.entries(cache ?? {})) out[k] = v
  return out
}

/** 清空全部访问记录（设置页「清空统计」用） */
export async function clearVisitStats(): Promise<void> {
  await ensureLoaded()
  const keys = Object.keys(cache ?? {})
  cache = {}
  dirty.clear()
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  for (const k of keys) {
    try {
      await idbDeleteKey('nav', DAY_PREFIX + k)
    } catch {
      /* 单条删失败不影响整体清空 */
    }
  }
}

/** 保留天数（面板文案要用，避免两处写死不一致） */
export const VISIT_STATS_KEEP_DAYS = STATS_KEEP_DAYS

/**
 * 安装路由钩子。
 *
 * 用 afterEach 而不是 beforeEach：只有真的进入页面才算一次访问，
 * 被守卫拦截或重定向掉的导航不该计数。afterEach 在首次导航后同样会触发，
 * 所以首屏那一次也能记上。
 */
export function initVisitStats(router: Router): void {
  router.afterEach((to) => {
    // 路由 name 缺省时退回 path，保证任何导航都有个可聚合的 key
    const key = typeof to.name === 'string' && to.name ? to.name : to.path || 'unknown'
    void recordVisit(key)
  })
}
