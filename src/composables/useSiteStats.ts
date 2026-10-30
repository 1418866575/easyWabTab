/**
 * 全网访问统计（服务端部分 · 前端接入）
 *
 * 与本机那份（useVisitStats）刻意分成两个模块，因为口径与隐私承诺完全不同：
 *   - useVisitStats：只留本机，**一个网络请求都不发**
 *   - 本模块：把「谁访问了哪个模块」匿名报给自家服务端，用于看全站流量
 *
 * 服务端实现在 scripts/statsService.cjs，挂在 16718 的 `/api/stats/*`（nginx 已反代 /api/）。
 * 后端不存在时（纯 vite dev、或没重启服务）所有失败都在这里吞掉，面板会显示「未接入」，
 * 绝不能让统计这个附属功能影响页面本身。
 *
 * 隐私口径与服务端一致：不设 cookie、不带凭据（credentials: 'omit'）、只发路由名与来源；
 * 服务端也不存明文 IP，只存 sha256(盐+日期+IP+UA) 的前 16 位用于当日 UV 去重。
 */
import type { Router } from 'vue-router'

const ENDPOINT_COLLECT = '/api/stats/collect'
const ENDPOINT_SUMMARY = '/api/stats/summary'

/** 同一路由在该窗口内重复上报视为同一次（重定向链、快速连点都会被合并） */
const DEDUPE_MS = 1500
/** 查询超时：后端没起来时面板不能一直转圈 */
const TIMEOUT_MS = 8000

/** 服务端允许的最大查询区间（与 statsService.MAX_QUERY_DAYS 一致） */
export const SITE_STATS_MAX_DAYS = 90

export interface SiteSummarySeriesPoint {
  date: string
  pv: number
  uv: number
}

export interface SiteSummaryEntry {
  key: string
  count: number
}

export interface SiteSummary {
  today: { date: string; pv: number; uv: number }
  range: { days: number; pv: number; uv: number }
  series: SiteSummarySeriesPoint[]
  /** 路由名 → 次数（已按降序排好，服务端 Top 12） */
  paths: SiteSummaryEntry[]
  /** 来源分类 → 次数（直接访问 / 站内 / 搜索引擎 / 社交分享 / 具体域名） */
  refs: SiteSummaryEntry[]
  keepDays: number
  /** 最早一天有数据的日期；从未采集过为 null */
  since: string | null
}

export type SiteSummaryFailure =
  /** 网络不可达 / 超时 */
  | 'offline'
  /** 接口返回 404 或非 JSON：多半是服务端没重启，`/api/stats/*` 还没挂上 */
  | 'unavailable'
  /** 有响应但结构不认识（版本不匹配） */
  | 'bad-response'

export type SiteSummaryResult =
  | { ok: true; data: SiteSummary }
  | { ok: false; failure: SiteSummaryFailure; message: string }

let lastKey = ''
let lastAt = 0
/** 本次会话是否已经报过（决定要不要继续带上页面级 referrer） */
let reportedAny = false

/**
 * 上报一次页面访问。永不抛错、永不等待 —— 调用方当它是 `void`。
 *
 * 为什么后续导航要带自己的 URL 当 referrer 而不是留空：
 * SPA 切换页面时 `document.referrer` 一直是**首次进入**的外部来源，
 * 若每次都用它，来源统计会把「站内跳转」全算进搜索引擎；
 * 留空则会被算成「直接访问」。带上当前页 URL 让服务端能按同源归到「站内」。
 */
export function reportSiteVisit(pageKey: string): void {
  if (typeof window === 'undefined') return
  const key = pageKey || 'unknown'
  const now = Date.now()
  if (key === lastKey && now - lastAt < DEDUPE_MS) return
  lastKey = key
  lastAt = now

  const referrer = reportedAny ? window.location.href : document.referrer || ''
  reportedAny = true

  try {
    void fetch(ENDPOINT_COLLECT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ n: key, r: referrer }),
      // 用户点开链接立刻关掉标签页时，普通请求会被取消，keepalive 能让它发完
      keepalive: true,
      credentials: 'omit',
      cache: 'no-store'
    }).catch(() => {
      /* 后端未部署 / 离线 / 被拦截：静默忽略 */
    })
  } catch {
    /* fetch 不可用等极端情况 */
  }
}

/** 安装上报钩子（main.ts 里紧跟 app.use(router) 同步注册） */
export function initSiteStats(router: Router): void {
  router.afterEach((to) => {
    const key = typeof to.name === 'string' && to.name ? to.name : to.path || 'unknown'
    reportSiteVisit(key)
  })
}

function toCount(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
}

function toEntries(v: unknown): SiteSummaryEntry[] {
  if (!Array.isArray(v)) return []
  const out: SiteSummaryEntry[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const key = typeof rec.key === 'string' ? rec.key : ''
    const count = toCount(rec.count)
    if (key && count > 0) out.push({ key, count })
  }
  return out
}

/**
 * 校验服务端返回。宁可判失败显示「未接入」，也不要把脏数据画成假的趋势 ——
 * 统计面板一旦显示错数，比不显示更糟。
 */
function normalizeSummary(raw: unknown): SiteSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  if (rec.ok !== true || !Array.isArray(rec.series)) return null

  const series: SiteSummarySeriesPoint[] = []
  for (const item of rec.series) {
    if (!item || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    const date = typeof p.date === 'string' ? p.date : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    series.push({ date, pv: toCount(p.pv), uv: toCount(p.uv) })
  }
  if (!series.length) return null

  const todayRaw = (rec.today && typeof rec.today === 'object' ? rec.today : {}) as Record<string, unknown>
  const rangeRaw = (rec.range && typeof rec.range === 'object' ? rec.range : {}) as Record<string, unknown>
  const last = series[series.length - 1]

  return {
    today: {
      date: typeof todayRaw.date === 'string' ? todayRaw.date : last.date,
      pv: toCount(todayRaw.pv),
      uv: toCount(todayRaw.uv)
    },
    range: {
      days: toCount(rangeRaw.days) || series.length,
      pv: toCount(rangeRaw.pv),
      uv: toCount(rangeRaw.uv)
    },
    series,
    paths: toEntries(rec.paths),
    refs: toEntries(rec.refs),
    keepDays: toCount(rec.keepDays),
    since: typeof rec.since === 'string' ? rec.since : null
  }
}

/** 拉取全站聚合数据；失败不抛错，交给面板显示可读的原因 */
export async function fetchSiteSummary(days = 30): Promise<SiteSummaryResult> {
  const safeDays = Math.min(SITE_STATS_MAX_DAYS, Math.max(1, Math.floor(days)))
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null

  try {
    const res = await fetch(`${ENDPOINT_SUMMARY}?days=${safeDays}`, {
      headers: { Accept: 'application/json' },
      signal: ctrl ? ctrl.signal : undefined,
      credentials: 'omit',
      cache: 'no-store'
    })
    if (!res.ok) {
      return { ok: false, failure: 'unavailable', message: `HTTP ${res.status}` }
    }
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('json')) {
      // vite dev 的 SPA 兜底会把 index.html 返回来：说明这个接口根本没人接
      return { ok: false, failure: 'unavailable', message: '接口返回的不是 JSON' }
    }
    const data = normalizeSummary(await res.json())
    if (!data) return { ok: false, failure: 'bad-response', message: '返回结构无法识别' }
    return { ok: true, data }
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name?: unknown }).name) : ''
    return {
      ok: false,
      failure: 'offline',
      message: name === 'AbortError' ? '请求超时' : '网络不可达'
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
