<script setup lang="ts">
/**
 * 设置 → 导航设置 → 访问统计（面板）
 *
 * 两块数据，来源与口径完全不同，界面上也分开放：
 *
 * 1. **全网访问**：自家服务端的匿名采集（`/api/stats/*`，见 scripts/statsService.cjs），
 *    统计公网所有访客的今日 / 区间 PV·UV、按天趋势、模块排行、来源构成。
 *    接口没就绪（后端未部署 / 未重启）时显示明确的原因与部署提示，不静默留空。
 *    同一区块底部附 Vercount 第三方累计数做交叉校验 —— 它是外部计数器，
 *    只有「使用人数 / 总访问」两个累计值（无时间维度、无来源、无排行），
 *    编号锚点在 BeianFooter 里，本面板只读不重复埋点。
 *
 * 2. **我的使用**：本机 IndexedDB 的按天访问记录（useVisitStats）+ 三个已有计数：
 *    - 导航站点点击：sites.ts 早在写 `site-click-counts`，此前全项目没有任何地方展示，属于纯死数据
 *    - 工具点击：useToolboxPrefs 的 clicks（列表按它排序用）
 *    - 页面访问：本次新增的路由埋点（唯一新增记录）
 *    全部只留本机，不上传、不进云同步信封。
 */
import { computed, onMounted, ref } from 'vue'
import { useToast } from '@/composables/useToast'
import { showConfirm } from '@/utils/dialog'
import { getPref } from '@/composables/useNavPrefs'
import { useSitesStore } from '@/stores/sites'
import {
  barScale,
  buildTrend,
  busiestHours,
  dayKey,
  hourLabel,
  mergePages,
  pageLabel,
  recentDayKeys,
  shortDateLabel,
  STATS_TREND_DAYS,
  sumPv,
  topEntries,
  type VisitDay
} from '@/composables/statsCore'
import {
  clearVisitStats,
  loadVisitDays,
  VISIT_STATS_KEEP_DAYS
} from '@/composables/useVisitStats'
import {
  fetchSiteSummary,
  SITE_STATS_MAX_DAYS,
  type SiteSummary,
  type SiteSummaryFailure
} from '@/composables/useSiteStats'

const toast = useToast()

/** ---------- 全网访问（自家服务端聚合） ---------- */
/** 可查区间：服务端上限 90 天，再长也只会被截断，不如不给 */
const RANGE_OPTIONS = [7, 30, SITE_STATS_MAX_DAYS]

const netDays = ref(30)
const netLoading = ref(true)
const netData = ref<SiteSummary | null>(null)
const netFailure = ref<SiteSummaryFailure | null>(null)
const netError = ref('')
/** 请求序号：快速连点区间时丢弃过期响应，避免慢请求覆盖新结果 */
let netSeq = 0

async function loadNet(days: number = netDays.value): Promise<void> {
  netDays.value = days
  const seq = ++netSeq
  netLoading.value = true
  const res = await fetchSiteSummary(days)
  if (seq !== netSeq) return
  netLoading.value = false
  if (res.ok) {
    netData.value = res.data
    netFailure.value = null
    netError.value = ''
  } else {
    netData.value = null
    netFailure.value = res.failure
    netError.value = res.message
  }
}

const netReady = computed(() => netData.value !== null)
const netEmpty = computed(() => (netData.value?.range.pv ?? 0) === 0)
const netSeries = computed(() => netData.value?.series ?? [])
const netScale = computed(() => barScale(netSeries.value.map((p) => p.pv)))
const netMax = computed(() => netSeries.value.reduce((m, p) => (p.pv > m ? p.pv : m), 0))
const netRangeText = computed(() => {
  const s = netSeries.value
  if (!s.length) return ''
  return `${shortDateLabel(s[0].date)} — ${shortDateLabel(s[s.length - 1].date)}`
})
const netPaths = computed(() => netData.value?.paths ?? [])
const netPathMax = computed(() => netPaths.value.reduce((m, e) => (e.count > m ? e.count : m), 0))
const netRefs = computed(() => netData.value?.refs ?? [])
const netRefMax = computed(() => netRefs.value.reduce((m, e) => (e.count > m ? e.count : m), 0))
/** 每次访问恰好落进一个来源桶，所以占比的分母就是区间 PV */
const netRefTotal = computed(() => netData.value?.range.pv ?? 0)
const netSince = computed(() => netData.value?.since ?? '')
const netKeepDays = computed(() => netData.value?.keepDays ?? 0)
const netFailureText = computed(() => {
  switch (netFailure.value) {
    case 'offline':
      return `连不上服务端（${netError.value}）`
    case 'unavailable':
      return `接口还没有就绪（${netError.value}）`
    case 'bad-response':
      return `返回的数据无法识别（${netError.value}）`
    default:
      return ''
  }
})

function refPct(count: number): string {
  return pct(netRefTotal.value > 0 ? count / netRefTotal.value : 0)
}

/** ---------- Vercount 第三方计数（交叉校验，只读） ---------- */
const vercountUv = ref('—')
const vercountPv = ref('—')

function readVercountAnchor(id: string): string | null {
  const text = document.getElementById(id)?.textContent?.trim()
  // 初始占位符 '-' 或空串视为脚本尚未填充
  return text && text !== '-' ? text : null
}

async function syncVercount(): Promise<void> {
  const uv = readVercountAnchor('vercount_value_site_uv')
  const pv = readVercountAnchor('vercount_value_site_pv')
  if (uv) vercountUv.value = uv
  if (pv) vercountPv.value = pv
  if (uv && pv) return
  // 兜底：直接查 vercount 只读接口（与脚本同源数据，GET 不计数）
  try {
    const res = await fetch(
      `https://events.vercount.one/api/v1/log?url=${encodeURIComponent(window.location.href)}`
    )
    const data = await res.json()
    if (data && data.site_uv != null) vercountUv.value = String(data.site_uv)
    if (data && data.site_pv != null) vercountPv.value = String(data.site_pv)
  } catch {
    /* 网络异常保留现值，不打断设置页 */
  }
}

function onRefresh(): void {
  void syncVercount()
  void loadNet()
}

/** ---------- 我的使用（本机） ---------- */
const days = ref<Record<string, VisitDay>>({})
const ready = ref(false)
const siteClicks = ref<Record<string, number>>({})
const toolClicks = ref<Record<string, number>>({})
const toolNames = ref<Map<string, string>>(new Map())
const sitesStore = useSitesStore()

/** url → 站点名（读现有站点数据，不另存一份名字） */
const siteNames = computed(() => {
  const m = new Map<string, string>()
  for (const s of sitesStore.sites) m.set(s.url, s.name)
  return m
})

const today = dayKey()
const last7 = recentDayKeys(7)
const last30 = recentDayKeys(STATS_TREND_DAYS)

const todayPv = computed(() => days.value[today]?.pv ?? 0)
const weekPv = computed(() => sumPv(days.value, last7))
const monthPv = computed(() => sumPv(days.value, last30))
const totalPv = computed(() =>
  Object.values(days.value).reduce((s, d) => s + (d?.pv ?? 0), 0)
)
const activeDays = computed(() => Object.keys(days.value).length)
const hasData = computed(() => totalPv.value > 0)

/** 近 30 天每日访问，缺的天补 0 */
const trend = computed(() => buildTrend(days.value, STATS_TREND_DAYS))
const trendText = computed(() =>
  trend.value.length
    ? `${trend.value[0].label} — ${trend.value[trend.value.length - 1].label}`
    : ''
)
const trendScale = computed(() => barScale(trend.value.map((t) => t.pv)))
const trendMax = computed(() => trend.value.reduce((m, t) => (t.pv > m ? t.pv : m), 0))

/** 近 30 天各模块访问分布 */
const pageDist = computed(() => topEntries(mergePages(days.value, last30), 6))
const pageMax = computed(() => pageDist.value.reduce((m, e) => (e.count > m ? e.count : m), 0))
const pageScale = computed(() =>
  pageDist.value.map((e) => (pageMax.value > 0 ? Math.max(0.04, e.count / pageMax.value) : 0))
)

/** 近 30 天的小时分布（活跃时段） */
const hourBuckets = computed(() => {
  const h = new Array(24).fill(0)
  for (const k of last30) {
    const d = days.value[k]
    if (!d) continue
    for (let i = 0; i < 24; i++) h[i] += d.hours[i] ?? 0
  }
  return h
})
const hourScale = computed(() => barScale(hourBuckets.value))
const peakHours = computed(() => busiestHours(hourBuckets.value, 3))

const siteTop = computed(() =>
  topEntries(siteClicks.value, 5).map((e) => ({
    label: siteNames.value.get(e.key) ?? hostOf(e.key),
    count: e.count
  }))
)
const siteMax = computed(() => siteTop.value.reduce((m, e) => (e.count > m ? e.count : m), 0))
const toolTop = computed(() =>
  topEntries(toolClicks.value, 5).map((e) => ({
    label: toolNames.value.get(e.key) ?? e.key,
    count: e.count
  }))
)
const toolMax = computed(() => toolTop.value.reduce((m, e) => (e.count > m ? e.count : m), 0))

/** 取域名当站点名兜底（站点已被删掉但点击记录还在时） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function pct(ratio: number): string {
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`
}

async function loadLocal(): Promise<void> {
  days.value = await loadVisitDays()

  // 站点点击：读既有偏好（sites.ts 一直在写，此前没有任何展示入口）
  try {
    const raw = getPref('site-click-counts')
    if (raw) siteClicks.value = JSON.parse(raw) as Record<string, number>
  } catch {
    siteClicks.value = {}
  }

  // 工具点击 + 工具名：registry 只装元数据（组件本身是懒加载），且改成动态 import，
  // 不进设置弹框的主 chunk —— 不打开这个面板就不下载这 129 条元数据
  try {
    const prefs = (await import('@/toolbox/prefs/useToolboxPrefs')).useToolboxPrefs()
    toolClicks.value = { ...prefs.clicks.value }
    const reg = await import('@/toolbox/registry')
    toolNames.value = new Map(reg.TOOLBOX_TOOLS.map((t) => [t.id, t.name]))
  } catch (e) {
    console.warn('[nav-stats] 工具点击统计读取失败:', e)
  }

  ready.value = true
}

async function onClear(): Promise<void> {
  const ok = await showConfirm(
    `清空本机访问记录？将删除最近 ${VISIT_STATS_KEEP_DAYS} 天内的页面访问数据，无法恢复。` +
      '（站点的点击次数、工具的点击次数属于各自功能的数据，不受影响。）',
    '清空访问统计'
  )
  if (!ok) return
  await clearVisitStats()
  days.value = {}
  toast.success('已清空访问统计')
}

onMounted(() => {
  void loadLocal()
  void loadNet()
  void syncVercount()
  // Vercount 脚本异步填充锚点，补两次重试（与原先设置页的节奏一致）
  setTimeout(() => void syncVercount(), 1000)
  setTimeout(() => void syncVercount(), 2500)
})
</script>

<template>
  <div class="ns-panel">
    <!-- ===== 全网访问 ===== -->
    <section class="ns-sec">
      <header class="ns-sec-head">
        <h3 class="ns-title">全网访问</h3>
        <span class="ns-badge">所有访客</span>
        <div class="ns-range" role="group" aria-label="统计区间">
          <button
            v-for="d in RANGE_OPTIONS"
            :key="d"
            type="button"
            class="ns-range-btn"
            :class="{ 'is-active': netDays === d }"
            :data-testid="`ns-range-${d}`"
            @click="loadNet(d)"
          >
            {{ d }} 天
          </button>
        </div>
        <button
          type="button"
          class="ns-mini-btn"
          data-testid="ns-refresh"
          :disabled="netLoading"
          @click="onRefresh"
        >
          {{ netLoading ? '读取中…' : '刷新' }}
        </button>
      </header>

      <!-- 首次读取 -->
      <div v-if="netLoading && !netReady" class="ns-empty">正在读取服务端统计…</div>

      <!-- 接口没就绪：说清原因与怎么开，而不是留一个空框 -->
      <div v-else-if="!netReady" class="ns-notice" data-testid="ns-net-unavailable">
        <b class="ns-notice-title">服务端统计未接入</b>
        <p class="ns-notice-body">
          全网数据来自自家服务端，当前没取到：{{ netFailureText }}。
        </p>
        <p class="ns-notice-body">
          本地 <code>npm run serve</code> 已内置该接口；线上需要常驻
          <code>node scripts/stats-only.cjs</code>（建议
          <code>pm2 start scripts/stats-only.cjs --name easy-web-stats</code>），
          并让 nginx 把 <code>/api/stats/</code> 反代到 <code>127.0.0.1:16723</code>。
          下方 Vercount 数字仍可作为参考。
        </p>
      </div>

      <!-- 接口通但还没有访客 -->
      <div v-else-if="netEmpty" class="ns-empty" data-testid="ns-net-empty">
        近 {{ netDays }} 天还没有公网访客记录。分享链接给朋友后再回来看看。
      </div>

      <template v-else>
        <div class="ns-kpis">
          <div class="ns-kpi">
            <span class="ns-kpi-label">今日访问</span>
            <b class="ns-kpi-value" data-testid="ns-net-pv-today">{{ netData?.today.pv ?? 0 }}</b>
          </div>
          <div class="ns-kpi">
            <span class="ns-kpi-label">今日访客</span>
            <b class="ns-kpi-value" data-testid="ns-net-uv-today">{{ netData?.today.uv ?? 0 }}</b>
          </div>
          <div class="ns-kpi">
            <span class="ns-kpi-label">近 {{ netDays }} 天访问</span>
            <b class="ns-kpi-value" data-testid="ns-net-pv-range">{{ netData?.range.pv ?? 0 }}</b>
          </div>
          <div class="ns-kpi">
            <span class="ns-kpi-label">近 {{ netDays }} 天访客</span>
            <b class="ns-kpi-value" data-testid="ns-net-uv-range">{{ netData?.range.uv ?? 0 }}</b>
          </div>
        </div>

        <!-- 趋势 -->
        <div class="ns-block">
          <div class="ns-block-head">
            <span class="ns-block-title">近 {{ netDays }} 天访问</span>
            <span class="ns-block-sub">{{ netRangeText }} · 单日最高 {{ netMax }}</span>
          </div>
          <div class="ns-bars" data-testid="ns-net-trend">
            <div
              v-for="(p, i) in netSeries"
              :key="p.date"
              class="ns-bar-col"
              :title="`${p.date}：${p.pv} 次访问 / ${p.uv} 位访客`"
            >
              <div
                class="ns-bar"
                :class="{ 'is-zero': p.pv === 0 }"
                :style="{ height: pct(netScale[i]) }"
              ></div>
            </div>
          </div>
        </div>

        <!-- 页面排行 + 来源构成 -->
        <div class="ns-grid2">
          <div class="ns-block">
            <div class="ns-block-head">
              <span class="ns-block-title">访问最多的页面</span>
              <span class="ns-block-sub">近 {{ netDays }} 天</span>
            </div>
            <ul class="ns-ranks" data-testid="ns-net-pages">
              <li v-for="e in netPaths" :key="e.key" class="ns-rank">
                <div class="ns-rank-line">
                  <span class="ns-rank-name" :title="e.key">{{ pageLabel(e.key) }}</span>
                  <span class="ns-rank-count">{{ e.count }}</span>
                </div>
                <div class="ns-rank-track">
                  <div
                    class="ns-rank-fill"
                    :style="{ width: pct(netPathMax > 0 ? Math.max(0.04, e.count / netPathMax) : 0) }"
                  ></div>
                </div>
              </li>
            </ul>
          </div>

          <div class="ns-block">
            <div class="ns-block-head">
              <span class="ns-block-title">访客从哪来</span>
              <span class="ns-block-sub">占区间访问</span>
            </div>
            <ul class="ns-ranks" data-testid="ns-net-refs">
              <li v-for="e in netRefs" :key="e.key" class="ns-rank">
                <div class="ns-rank-line">
                  <span class="ns-rank-name" :title="e.key">{{ e.key }}</span>
                  <span class="ns-rank-count">{{ e.count }} · {{ refPct(e.count) }}</span>
                </div>
                <div class="ns-rank-track">
                  <div
                    class="ns-rank-fill is-alt"
                    :style="{ width: pct(netRefMax > 0 ? Math.max(0.04, e.count / netRefMax) : 0) }"
                  ></div>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <p class="ns-hint">
          只记录路由名与来源分类，不记 IP 明文（UV 是「加盐哈希 + 当日」去重），不设 cookie；
          数据保留 {{ netKeepDays || 180 }} 天<template v-if="netSince">，自 {{ netSince }} 起</template>。
          同一个人换设备或换浏览器会算作新的访客。
        </p>
      </template>

      <!-- Vercount 交叉校验 -->
      <p class="ns-cross">
        第三方计数（Vercount）：使用人数
        <b data-testid="ns-public-uv">{{ vercountUv }}</b>
        · 总访问
        <b data-testid="ns-public-pv">{{ vercountPv }}</b>
        <span class="ns-cross-note">需通过公网域名访问才会计数</span>
      </p>
    </section>

    <!-- ===== 我的使用 ===== -->
    <section class="ns-sec">
      <header class="ns-sec-head">
        <h3 class="ns-title">我的使用</h3>
        <span class="ns-badge">仅本机</span>
      </header>

      <div class="ns-kpis">
        <div class="ns-kpi">
          <span class="ns-kpi-label">今日访问</span>
          <b class="ns-kpi-value" data-testid="ns-pv-today">{{ todayPv }}</b>
        </div>
        <div class="ns-kpi">
          <span class="ns-kpi-label">近 7 天</span>
          <b class="ns-kpi-value">{{ weekPv }}</b>
        </div>
        <div class="ns-kpi">
          <span class="ns-kpi-label">近 30 天</span>
          <b class="ns-kpi-value">{{ monthPv }}</b>
        </div>
        <div class="ns-kpi">
          <span class="ns-kpi-label">累计（{{ activeDays }} 天有记录）</span>
          <b class="ns-kpi-value">{{ totalPv }}</b>
        </div>
      </div>

      <div v-if="!ready" class="ns-empty">正在读取本机记录…</div>
      <div v-else-if="!hasData" class="ns-empty" data-testid="ns-empty">
        还没有记录到访问。逛几个页面再回来，这里就会长出趋势。
      </div>

      <template v-else>
        <!-- 近 30 天趋势 -->
        <div class="ns-block">
          <div class="ns-block-head">
            <span class="ns-block-title">近 {{ STATS_TREND_DAYS }} 天访问</span>
            <span class="ns-block-sub">{{ trendText }} · 单日最高 {{ trendMax }}</span>
          </div>
          <div class="ns-bars" data-testid="ns-trend">
            <div
              v-for="(p, i) in trend"
              :key="p.key"
              class="ns-bar-col"
              :title="`${p.key}：${p.pv} 次`"
            >
              <div
                class="ns-bar"
                :class="{ 'is-zero': p.pv === 0 }"
                :style="{ height: pct(trendScale[i]) }"
              ></div>
            </div>
          </div>
        </div>

        <!-- 活跃时段 -->
        <div class="ns-block">
          <div class="ns-block-head">
            <span class="ns-block-title">活跃时段</span>
            <span class="ns-block-sub" data-testid="ns-peak">
              <template v-if="peakHours.length">
                最常在 {{ peakHours.map((h) => hourLabel(h)).join(' / ') }}
              </template>
              <template v-else>暂无</template>
            </span>
          </div>
          <div class="ns-hours" data-testid="ns-hours">
            <div
              v-for="h in 24"
              :key="h"
              class="ns-hour-col"
              :title="`${hourLabel(h - 1)}：${hourBuckets[h - 1] ?? 0} 次`"
            >
              <div class="ns-hour-track">
                <div
                  class="ns-hour-fill"
                  :class="{ 'is-peak': peakHours.includes(h - 1) }"
                  :style="{ height: pct(hourScale[h - 1] ?? 0) }"
                ></div>
              </div>
              <span v-if="h - 1 === 0 || (h - 1) % 6 === 0" class="ns-hour-label">{{ h - 1 }}</span>
              <span v-else class="ns-hour-label is-blank">·</span>
            </div>
          </div>
        </div>

        <!-- 模块分布 + 站点/工具 Top -->
        <div class="ns-grid2">
          <div class="ns-block">
            <div class="ns-block-head">
              <span class="ns-block-title">模块分布</span>
              <span class="ns-block-sub">近 {{ STATS_TREND_DAYS }} 天</span>
            </div>
            <ul class="ns-ranks" data-testid="ns-pages">
              <li v-for="(e, i) in pageDist" :key="e.key" class="ns-rank">
                <div class="ns-rank-line">
                  <span class="ns-rank-name">{{ pageLabel(e.key) }}</span>
                  <span class="ns-rank-count">{{ e.count }}</span>
                </div>
                <div class="ns-rank-track">
                  <div class="ns-rank-fill" :style="{ width: pct(pageScale[i]) }"></div>
                </div>
              </li>
            </ul>
          </div>

          <div class="ns-block">
            <div class="ns-block-head">
              <span class="ns-block-title">最常访问的站点</span>
            </div>
            <ul v-if="siteTop.length" class="ns-ranks" data-testid="ns-sites">
              <li v-for="e in siteTop" :key="e.label" class="ns-rank">
                <div class="ns-rank-line">
                  <span class="ns-rank-name" :title="e.label">{{ e.label }}</span>
                  <span class="ns-rank-count">{{ e.count }}</span>
                </div>
                <div class="ns-rank-track">
                  <div
                    class="ns-rank-fill is-alt"
                    :style="{ width: pct(siteMax > 0 ? Math.max(0.04, e.count / siteMax) : 0) }"
                  ></div>
                </div>
              </li>
            </ul>
            <p v-else class="ns-empty-inline">还没有点开过任何站点。</p>
          </div>
        </div>

        <div class="ns-grid2">
          <div class="ns-block">
            <div class="ns-block-head">
              <span class="ns-block-title">最常用的工具</span>
            </div>
            <ul v-if="toolTop.length" class="ns-ranks" data-testid="ns-tools">
              <li v-for="e in toolTop" :key="e.label" class="ns-rank">
                <div class="ns-rank-line">
                  <span class="ns-rank-name" :title="e.label">{{ e.label }}</span>
                  <span class="ns-rank-count">{{ e.count }}</span>
                </div>
                <div class="ns-rank-track">
                  <div
                    class="ns-rank-fill is-alt"
                    :style="{ width: pct(toolMax > 0 ? Math.max(0.04, e.count / toolMax) : 0) }"
                  ></div>
                </div>
              </li>
            </ul>
            <p v-else class="ns-empty-inline">还没有用过工具箱里的工具。</p>
          </div>

          <div class="ns-block ns-block--note">
            <div class="ns-block-head">
              <span class="ns-block-title">说明</span>
            </div>
            <p class="ns-hint">
              这些记录只存在当前设备的浏览器里，不上传服务器、不进云同步信封；换设备或清缓存即归零。
              页面访问保留最近 {{ VISIT_STATS_KEEP_DAYS }} 天，超期自动清理。
            </p>
            <button type="button" class="ns-danger-btn" data-testid="ns-clear" @click="onClear">
              清空本机访问记录
            </button>
          </div>
        </div>
      </template>

      <!-- 无数据时也要能清空（可能残留半条脏记录） -->
      <div v-if="ready && !hasData" class="ns-block ns-block--note">
        <button type="button" class="ns-danger-btn" data-testid="ns-clear" @click="onClear">
          清空本机访问记录
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ns-panel {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

/* ---------- 分区 ---------- */
.ns-sec {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ns-sec + .ns-sec {
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}
.ns-sec-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ns-title {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-base, 15px);
  font-weight: var(--font-weight-semibold, 600);
}
.ns-badge {
  padding: 0 6px;
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: var(--font-size-xs, 11px);
  line-height: 18px;
}
/* 小尺寸按钮：与全局 .ui-btn--sm 同规格（30px 高 / 12px 字 / 8px 圆角） */
.ns-mini-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 var(--space-3, 12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
  transition:
    border-color var(--motion-duration, 220ms) var(--motion-ease, ease),
    color var(--motion-duration, 220ms) var(--motion-ease, ease),
    background-color var(--motion-duration, 220ms) var(--motion-ease, ease);
}
.ns-mini-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background-color: var(--color-primary-soft);
}
.ns-mini-btn:disabled {
  cursor: default;
  opacity: 0.5;
}

/* ---------- 区间切换 ---------- */
.ns-range {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  height: 30px;
  padding: 2px;
  border-radius: var(--radius-full, 9999px);
  background-color: var(--color-bg-hover);
}
.ns-range-btn {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 var(--space-2, 8px);
  border: none;
  border-radius: var(--radius-full, 9999px);
  background-color: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs, 12px);
  line-height: 1;
  cursor: pointer;
}
.ns-range-btn:hover {
  color: var(--color-primary);
}
.ns-range-btn.is-active {
  background-color: var(--color-bg-card);
  color: var(--color-primary);
  font-weight: var(--font-weight-medium, 500);
}

/* ---------- 未接入提示 ---------- */
.ns-notice {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-hover);
}
.ns-notice-title {
  color: var(--color-text);
  font-size: var(--font-size-sm, 13px);
}
.ns-notice-body {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs, 12px);
  line-height: var(--line-height-relaxed, 1.6);
}
.ns-notice-body code {
  padding: 0 4px;
  border-radius: 4px;
  background-color: var(--color-bg-card);
  color: var(--color-text);
  font-size: 11px;
}

/* ---------- Vercount 交叉校验 ---------- */
.ns-cross {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs, 12px);
  line-height: var(--line-height-relaxed, 1.6);
}
.ns-cross b {
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}
.ns-cross-note::before {
  content: '·';
  margin: 0 4px;
}

/* ---------- KPI ---------- */
.ns-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.ns-kpi {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card);
}
.ns-kpi-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs, 12px);
}
.ns-kpi-value {
  color: var(--color-text);
  font-size: 20px;
  font-weight: var(--font-weight-semibold, 600);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

/* ---------- 区块 ---------- */
.ns-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ns-block-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.ns-block-title {
  color: var(--color-text);
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
}
.ns-block-sub {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs, 11px);
}

/* ---------- 30 天柱状 ---------- */
/* 基线：数据稀少时（只有今天有柱子）整块区域否则看着像没渲染出来 */
.ns-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 92px;
  padding: 4px 0;
  border-bottom: 1px solid var(--color-border);
}
.ns-bar-col {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: flex-end;
}
.ns-bar {
  width: 100%;
  min-height: 1px;
  border-radius: 2px 2px 0 0;
  background-color: var(--color-primary, #3b82f6);
  transition: height var(--transition-fast, 0.15s ease);
}
.ns-bar.is-zero {
  background-color: var(--color-border);
}

/* ---------- 24 小时 ---------- */
.ns-hours {
  display: flex;
  align-items: flex-end;
  gap: 2px;
}
.ns-hour-col {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.ns-hour-track {
  width: 100%;
  height: 56px;
  display: flex;
  align-items: flex-end;
}
.ns-hour-fill {
  width: 100%;
  min-height: 1px;
  border-radius: 2px 2px 0 0;
  background-color: var(--color-border);
}
.ns-hour-fill.is-peak {
  background-color: var(--color-primary, #3b82f6);
}
.ns-hour-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs, 11px);
  line-height: 1;
}
.ns-hour-label.is-blank {
  color: transparent;
}

/* ---------- 排行 ---------- */
.ns-grid2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.ns-ranks {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ns-rank-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: var(--font-size-xs, 12px);
}
.ns-rank-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}
.ns-rank-count {
  flex: 0 0 auto;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.ns-rank-track {
  height: 4px;
  border-radius: 2px;
  background-color: var(--color-bg-hover);
  overflow: hidden;
}
.ns-rank-fill {
  height: 100%;
  border-radius: 2px;
  background-color: var(--color-primary, #3b82f6);
}
.ns-rank-fill.is-alt {
  background-color: var(--color-text-muted);
  opacity: 0.55;
}

/* ---------- 说明 / 空态 ---------- */
.ns-block--note {
  gap: 10px;
  align-items: flex-start;
}
.ns-hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs, 12px);
  line-height: var(--line-height-relaxed, 1.6);
}
.ns-empty {
  padding: 24px 12px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md, 8px);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm, 13px);
  text-align: center;
}
.ns-empty-inline {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs, 12px);
}
.ns-danger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 var(--space-3, 12px);
  border: 1px solid var(--color-error, #ef4444);
  border-radius: var(--radius-md, 8px);
  background-color: transparent;
  color: var(--color-error, #ef4444);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
  transition:
    background-color var(--motion-duration, 220ms) var(--motion-ease, ease),
    border-color var(--motion-duration, 220ms) var(--motion-ease, ease);
}
.ns-danger-btn:hover {
  background-color: var(--color-error-soft, #fef2f2);
}

/* 窄屏：KPI 两列，两栏排行并一栏 */
@media (max-width: 768px) {
  .ns-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ns-grid2 {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  .ns-sec-head {
    flex-wrap: wrap;
  }
  .ns-range {
    margin-left: 0;
  }
  /* 换行后的刷新按钮靠右，别单独缩在行首 */
  .ns-mini-btn {
    margin-left: auto;
  }
}
</style>
