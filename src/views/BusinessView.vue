<script setup lang="ts">
// 销售记账独立页面（摆摊进销存）：布局复刻 WorkbenchView（左树 + 右内容，桌面一屏钉满、移动端横排菜单）
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { useAppSettingsStore } from '@/stores/settings'
import WorkbenchManagePanel from '@/components/WorkbenchManagePanel.vue'
import BusinessHome from '@/components/business/BusinessHome.vue'
import BusinessProducts from '@/components/business/BusinessProducts.vue'
import BusinessPurchases from '@/components/business/BusinessPurchases.vue'
import BusinessDaily from '@/components/business/BusinessDaily.vue'
import BusinessExpenses from '@/components/business/BusinessExpenses.vue'
import BusinessInventory from '@/components/business/BusinessInventory.vue'
import BusinessStats from '@/components/business/BusinessStats.vue'
import BusinessReconcile from '@/components/business/BusinessReconcile.vue'
import BusinessLedgerSwitcher from '@/components/business/BusinessLedgerSwitcher.vue'
import BusinessSpotlightOverlay from '@/components/business/BusinessSpotlightOverlay.vue'
import AppSettingsDialog from '@/components/AppSettingsDialog.vue'
import Icon from '@/components/Icon.vue'
import SkeletonBlock from '@/components/SkeletonBlock.vue'
import { useCloudSync } from '@/composables/useCloudSync'
import type { SyncStatus } from '@/composables/useCloudSync'
import { useWorkbenchShortcuts } from '@/composables/useWorkbenchShortcuts'
import { calcTodayStats, currentYear, formatYuanOf, ledgerDefaultName, localDateKey } from '@/composables/businessCore'
import { BIZ_QUICK_ACTIONS, BIZ_SECTIONS, MOBILE_TAB_KEYS, mobileMoreSections, mobileSwipeTarget } from '@/composables/businessSpotlightCore'
import type { BizSpotlightAction, BizSpotlightData } from '@/composables/businessSpotlightCore'

const router = useRouter()
const store = useWorkbenchBusinessStore()
const settingsStore = useAppSettingsStore()

// 左树 8 项：定义在 businessSpotlightCore.BIZ_SECTIONS（桌面左树 / 移动端 Tab / Alt+K 搜索浮层共用同一份，避免文案漂移）
// 文案口径（2026-10-06 对齐）：expenses = 支出（摊位费/燃气费等开销记账）、purchases = 进货（商品入库流水）
// key 自诞生起未变，改 key 会波及 settingsStore.businessActiveSection 持久化值与历史用户书签
const SECTIONS = BIZ_SECTIONS
type SectionKey = (typeof SECTIONS)[number]['key']

// 侧栏折叠态：undefined（未设置）视为展开；持久化经 settingsStore（IDB store 'settings'）
const sidebarCollapsed = computed(() => settingsStore.businessSidebarCollapsed ?? false)

function toggleSidebar(): void {
  settingsStore.setBusinessSidebarCollapsed(!sidebarCollapsed.value)
}

const activeSection = ref<SectionKey>((settingsStore.businessActiveSection as SectionKey) || 'home')

// P1-3：跨模块联动过滤状态
const productFilter = ref<string | undefined>(undefined)
const purchaseFilter = ref<string | undefined>(undefined)

// 手动切菜单时清空联动过滤（navigateTo 带过滤跳转时不���；否则从首页带过滤进入后
// 手动切走再回来仍被过滤，且无清除入口 → 用户误以为数据丢了，见 docs/optimization 销售记账优化方案 M-11）
function selectSection(key: SectionKey): void {
  activeSection.value = key
  // P0-2：持久化当前模块，刷新后保持所在页
  settingsStore.setBusinessActiveSection(key)
  productFilter.value = undefined
  purchaseFilter.value = undefined
}

function navigateTo(section: string, filter?: string): void {
  if ((SECTIONS as readonly { key: string }[]).some(s => s.key === section)) {
    // 复用 selectSection 的清空逻辑后，再按需写入本次跳转的过滤值
    selectSection(section as SectionKey)
    if (section === 'purchases') {
      purchaseFilter.value = filter
    } else if (section === 'products') {
      productFilter.value = filter
    }
  }
}

// ===== 快速记一笔（Alt+K 快捷动作 / 悬浮按钮共用）=====
// 两段式：先切到目标面板并置 autoOpenAdd → 面板挂载时onMounted 调startAdd → 复位标志
// 标志复位晚于面板挂载，故同一次挂载只会触发一次 startAdd
const quickAddSection = ref<string | null>(null)

async function quickAdd(section: string): Promise<void> {
  if (!(SECTIONS as readonly { key: string }[]).some(s => s.key === section)) return
  quickAddSection.value = section
  await nextTick()
  await nextTick()
  quickAddSection.value = null
}

// ===== 移动端底部 Tab 收敛为 5 项 + 「更多」（M-06，2026-10-06）=====
// 原实现 8 项全塞进底栏（.bs-menu overflow-x:auto），需横向滚动且用户难判断「当前在哪一屏」。
// 现在移动端只渲染 MOBILE_TAB_KEYS（首页/销售/进货/支出/商品，按日频次），
// 库存预警/统计/对账 3 个低频分析页收进「更多」弹层，两步内可达。
// 桌面端左树保持完整 8 项（桌面有空间，折叠态 56px 也够）。
const MOBILE_MEDIA = '(max-width: 768px)'
const isMobileNav = ref(false)
const moreOpen = ref(false)
let mobileMql: MediaQueryList | null = null
function syncMobileNav(e: { matches: boolean } | MediaQueryList): void {
  isMobileNav.value = e.matches
  if (!e.matches) moreOpen.value = false
}

onMounted(() => {
  mobileMql = window.matchMedia(MOBILE_MEDIA)
  isMobileNav.value = mobileMql.matches
  mobileMql.addEventListener('change', syncMobileNav)
  // Esc 监听放document 捕获阶段：useWorkbenchShortcuts 在 window 冒泡监听 Esc，
  // 冒泡会先到 window；捕获阶段 + stopPropagation 可避免「关更多」同时触发其它 Esc 行为
  document.addEventListener('keydown', handleEsc, true)
})
onUnmounted(() => {
  mobileMql?.removeEventListener('change', syncMobileNav)
  mobileMql = null
  document.removeEventListener('keydown', handleEsc, true)
})

// ===== M-20（2026-10-07）移动端专用布局：固定头部 + 固定底栏 + 中间独立滚动 =====
// 桌面端沿用原有「左树 + 右内容」布局，此处新增的逻辑全部由 isMobileNav 门控，
// 桌面渲染结果与改动前完全一致。

/** 移动端头部聚焦的日期（默认今天）。与销售记录面板的录入日期各自独立，互不干扰。 */
const mobileDate = ref(localDateKey())
/** 日期切换是否被用户改过（用于头部出现「回到今天」快捷按钮） */
const mobileDateDirty = computed(() => mobileDate.value !== localDateKey())

/** 当前日期的经营快照：营业额 / 毛利 / 支出 / 净额，用于头部汇总条 */
const mobileDayStats = computed(() => {
  const data = {
    productCategories: store.productCategories,
    expenseCategories: store.expenseCategories,
    products: store.products,
    purchases: store.purchases,
    dailyRecords: store.dailyRecords,
    expenseDailies: store.expenseDailies,
    settings: store.settings
  }
  return calcTodayStats(data, mobileDate.value)
})

/** 日期步进：前后各一天，限制在当前账本年份内（与弹框录入日期同口径，跨年需切账本） */
function shiftMobileDate(delta: number): void {
  const [y, m, d] = mobileDate.value.split('-').map(Number)
  if (!y || !m || !d) return
  const next = new Date(y, m - 1, d + delta)
  // 跨年直接钳在账本年首尾，避免出现「上一年」的日期（账本不存该年数据）
  const year = store.currentLedgerYear
  if (next.getFullYear() < year) next.setFullYear(year, 0, 1)
  if (next.getFullYear() > year) next.setFullYear(year, 11, 31)
  mobileDate.value = localDateKey(next)
}
function goToday(): void {
  mobileDate.value = localDateKey()
}

/** 头部日期标签：10月06日 周一（当年省略；跨年时补年份，避免跨年记录张冠李戴） */
const mobileDateLabel = computed(() => {
  const [y, m, d] = mobileDate.value.split('-').map(Number)
  if (!y || !m || !d) return mobileDate.value
  const dt = new Date(y, m - 1, d)
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()]
  const md = `${String(m).padStart(2, '0')}月${String(d).padStart(2, '0')}日`
  return y === store.currentLedgerYear ? `${md} ${week}` : `${y}年${md} ${week}`
})

/** 头部日期步进已把范围钳在当前账本年内，无需日期选择器（移动端弹出式日历易溢出屏幕） */

/** 头部汇总条是否显示「有数据」标记（该日没有任何流水 → 引导去记账） */
const mobileDayEmpty = computed(
  () => !mobileDayStats.value.hasDaily && mobileDayStats.value.expense === 0
)

/**
 * 移动端面板左右滑动手势：在底部菜单顺序上移动一格。
 *
 * 判定要点（都是踩过的坑）：
 * 1. 必须**横向位移显著大于纵向**才判定为切页 —— 中间列表本身要能上下滚，
 *    纵向位移占比高时若也切页，滚动列表会疯狂横跳。
 * 2. 阈值 56px：低于此值多为误触/手指微动；高于 56px 是明确意图。
 * 3. 底部菜单项内部有横向滚动条时不应触发切页，故跳过落在底栏上的手势。
 */
const swipeStart = ref<{ x: number; y: number } | null>(null)
/** 横向手势阈值（px） */
const SWIPE_THRESHOLD = 56
/** 纵向位移容忍比：|dx| > |dy| * 1.5 才算横向意图 */
const SWIPE_AXIS_RATIO = 1.5

function onSwipeStart(e: TouchEvent): void {
  if (!isMobileNav.value) return
  const t = e.touches[0]
  if (!t) return
  swipeStart.value = { x: t.clientX, y: t.clientY }
}

function onSwipeEnd(e: TouchEvent): void {
  const start = swipeStart.value
  swipeStart.value = null
  if (!start || !isMobileNav.value) return
  const t = e.changedTouches[0]
  if (!t) return
  const dx = t.clientX - start.x
  const dy = t.clientY - start.y
  if (Math.abs(dx) < SWIPE_THRESHOLD) return
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return
  // 向左滑（dx<0）= 看下一个面板；向右滑 = 看上一个
  const target = mobileSwipeTarget(activeSection.value, dx < 0 ? 'next' : 'prev')
  if (target !== activeSection.value) selectSection(target as SectionKey)
}

// ===== 中间内容区高度：JS 兜底 + CSS 100dvh 双保险 =====
// 为什么两者都要：
// - 100dvh 覆盖绝大多数现代浏览器（含 iOS Safari 16+ 的动态工具栏适配）；
// - 但旧 WebView / 部分国产浏览器内核 dvh 视作非法值会回退到 auto，
//   此时 flex:1 会失效（内容溢出、底栏被顶出屏幕），故用 JS 实测写入 --bs-content-h 兜底。
const contentRef = ref<HTMLElement | null>(null)
/** 实测高度写入 CSS 变量（px）；0 表示交给 CSS 处理 */
const contentHeight = ref(0)

function measureContent(): void {
  if (!isMobileNav.value) {
    contentHeight.value = 0
    return
  }
  const h = contentRef.value?.clientHeight ?? 0
  // 变化超过 1px 才写，避免无谓的重排抖动
  if (h > 0 && Math.abs(h - contentHeight.value) > 1) contentHeight.value = h
}

let contentResizeObserver: ResizeObserver | null = null
let visualViewportHandler: (() => void) | null = null

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && contentRef.value) {
    contentResizeObserver = new ResizeObserver(() => measureContent())
    contentResizeObserver.observe(contentRef.value)
  }
  // 移动端地址栏收放会改变可视高度，但不触发 window.resize（只在 visualViewport 上派发）。
  // 不监听会导致「下拉地址栏后内容区仍按旧高度计算」，底栏与列表之间出现空隙/遮挡。
  if (window.visualViewport) {
    visualViewportHandler = () => measureContent()
    window.visualViewport.addEventListener('resize', visualViewportHandler)
  }
  window.addEventListener('orientationchange', measureContent)
  measureContent()
})

onUnmounted(() => {
  contentResizeObserver?.disconnect()
  contentResizeObserver = null
  if (window.visualViewport && visualViewportHandler) {
    window.visualViewport.removeEventListener('resize', visualViewportHandler)
  }
  visualViewportHandler = null
  window.removeEventListener('orientationchange', measureContent)
})

/** 切面板后把中间内容区滚回顶部（否则从长列表切到短面板会停在中段） */
watch(activeSection, async () => {
  await nextTick()
  if (contentRef.value) contentRef.value.scrollTop = 0
  measureContent()
})

/** 切换日期后头部汇总变化，重算内容区高度（汇总条高度会随数字位数变化） */
watch(mobileDate, () => { void nextTick(measureContent) })

/** 底部菜单当前项的 DOM，用于切页后把该项滚动进可视区（窄屏 5 项可能溢出） */
const menuEl = ref<HTMLElement | null>(null)
/** 用 style 绑定高度变量：0 时不输出，让 CSS 的 100dvh 生效 */
const contentStyle = computed(() =>
  contentHeight.value > 0 ? { height: `${contentHeight.value}px` } : {}
)

/** 当前激活项对应的 DOM 节点（data-testid=bs-menu-<key>，含「更多」） */
function scrollActiveIntoView(): void {
  const root = menuEl.value
  if (!root) return
  const key = activeInMore.value ? 'more' : activeSection.value
  const el = root.querySelector<HTMLElement>(`[data-testid="bs-menu-${key}"]`)
  // scrollIntoView 会连带滚动祖先（含中间内容区），故用 scrollLeft 手算，只平移底栏自身
  if (el && root.scrollWidth > root.clientWidth) {
    const target = el.offsetLeft - (root.clientWidth - el.offsetWidth) / 2
    root.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }
}

watch(activeSection, () => { void nextTick(scrollActiveIntoView) })

/** 侧栏/底栏实际渲染的菜单项：移动端 5 项，桌面 8 项 */
const visibleMenuItems = computed(() =>
  isMobileNav.value
    ? MOBILE_TAB_KEYS.map(k => SECTIONS.find(s => s.key === k)).filter((s): s is NonNullable<typeof s> => !!s)
    : [...SECTIONS]
)
/** 「更多」弹层里的低频面板 */
const moreSections = computed(() => mobileMoreSections())
/** 当前激活项是否在「更多」里（用于「更多」按钮显示激活态） */
const activeInMore = computed(() => moreSections.value.some(s => s.key === activeSection.value))

function selectFromMore(key: SectionKey): void {
  moreOpen.value = false
  selectSection(key)
}

/** Esc 关闭浮层：优先「更多」，其次「快速记一笔」；两者都没开则让事件继续传给弹框自身 */
function handleEsc(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  if (moreOpen.value) {
    moreOpen.value = false
    e.stopPropagation()
  } else if (quickAddOpen.value) {
    closeQuickAdd()
    e.stopPropagation()
  }
}

// ===== 快速记一笔（M-12，2026-10-06）=====
// 悬浮按钮 → 展开三项动作 →复用已建好的 quickAdd() 两段式机制（见上）。
// 结账高峰时单手可达，把「点菜单→找到面板→点新增」3 步压到 1 步。
const quickAddOpen = ref(false)
const quickAddActions = BIZ_QUICK_ACTIONS.filter(a => a.action.kind === 'quickAdd')

function closeQuickAdd(): void {
  quickAddOpen.value = false
}
async function runQuickAdd(section: string): Promise<void> {
  closeQuickAdd()
  await quickAdd(section)
}

const showSettingsDialog = ref(false)

// ===== 全局搜索（Alt+K / 右上角按钮打开）=====
// 2026-10-06：此前本视图把 spotlightOpen 传给 useWorkbenchShortcuts 却不渲染浮层，
// 导致 Alt+K 置true 后界面无任何反应（静默失效，比没有快捷键更糟）。现接入销售台专用浮层
// BusinessSpotlightOverlay（搜索域：商品 / 支出分类 / 8 个面板 / 5 个快捷动作）。
const spotlightOpen = ref(false)

// 搜索数据源：仅商品与支出分类两类，面板与快捷动作是 core 内的常量
const spotlightData = computed<BizSpotlightData>(() => ({
  products: store.products,
  productCategories: store.productCategories,
  expenseCategories: store.expenseCategories
}))

function handleSpotlightSelect(action: BizSpotlightAction): void {
  spotlightOpen.value = false
  if (action.kind === 'quickAdd') {
    void quickAdd(action.section)
    return
  }
  // 商品命中带 productId：跳商品面板时高亮定位（顺带修复旧实现只描边、不翻页导致高亮不可见的坑）
  navigateTo(action.section, action.productId)
}

// 快捷键：复用工作台通用快捷键（Alt+K 全局搜索、g 切换个人/销售工作台、[ ] 模块间循环；
// Ctrl+Alt+1..8 跳菜单第 1..8 项）
useWorkbenchShortcuts({
  spotlightOpen,
  getMenuKeys: () => SECTIONS.map((s) => s.key),
  getCurrentSection: () => activeSection.value,
  onNavigate: (key) => selectSection(key as SectionKey),
  isSectionEnabled: () => true,
  router
})

// ===== 右上角云同步按钮（与工作台复用同一套开关：cloudSyncEnabled 时在设置按钮左边显示） =====
const cloudSync = useCloudSync()
const syncBusy = ref(false)
const cloudEnabled = computed(() => !!settingsStore.cloudSyncEnabled)
function bizPad2(n: number): string { return String(n).padStart(2, '0') }
function bizFmt(d: Date): string {
  return `${d.getFullYear()}-${bizPad2(d.getMonth()+1)}-${bizPad2(d.getDate())} ${bizPad2(d.getHours())}:${bizPad2(d.getMinutes())}:${bizPad2(d.getSeconds())}`
}
const syncStatusClass = computed(
  (): Record<string, boolean> => ({
    'wb-sync-btn-pending': cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing',
    'wb-sync-btn-conflict': cloudSync.status.value === 'conflict',
    'wb-sync-btn-error': cloudSync.status.value === 'error'
  })
)
const syncLabel = computed((): string => {
  switch (cloudSync.status.value as SyncStatus) {
    case 'pulling': return '拉取中…'
    case 'pushing': return '推送中…'
    case 'conflict': return '处理冲突'
    case 'error': return '同步失败'
    default: return '云同步'
  }
})
const syncTip = computed((): string => {
  const t = cloudSync.lastSyncAt.value
  if (!t) return '未同步过；点击立即同步'
  return `上次同步：${bizFmt(new Date(t))}；点击立即同步`
})
async function handleSyncNowClick(): Promise<void> {
  if (syncBusy.value) return
  syncBusy.value = true
  await cloudSync.syncNow()
  syncBusy.value = false
}

// ===== 账本（最外层数据容器：按自然年创建，同一年份可有多本，编号 = 年份-序号） =====
// 每本账本只记录其所属年份的数据：录入日期跨年会被拦截，需切换到对应年份的账本。
// 进入流程：加载完成后若「一个账本都没有」→ 阻断式引导，必须先创建当年账本才能进入业务模块；
// 若已有账本但当前年缺失（跨年首次进入）→ 顶部提示条一键创建，不阻断（避免锁死历史账本数据）。
const thisYear = currentYear()
const gateVisible = computed(() => store.loaded && !store.hasLedgers)
const crossYearBannerVisible = computed(() => store.loaded && store.hasLedgers && store.needsCurrentYearLedger)

const gateYear = ref<number>(thisYear)
const gateName = ref('')
const gateError = ref('')

function onCreateFromGate(): void {
  const year = Number(gateYear.value)
  const r = store.createLedger(year, gateName.value)
  if (!r.ok) {
    gateError.value = r.reason === 'invalid-year' ? '请输入有效年份（1970 - 9999）' : '账本名称不能为空'
    return
  }
  gateError.value = ''
  gateName.value = ''
  gateYear.value = thisYear
}

function onCreateCurrentYear(): void {
  const r = store.ensureCurrentYearLedger()
  if (!r.ok) store.switchLedgerByYear(thisYear)
}

// 首屏初始化占位：数据加载完成前内容区全空且无反馈（加载逻辑本身不变）
const initializing = ref(true)

onMounted(async () => {
  try {
    await store.loadBusiness()
  } catch {
    // 保持原先 fire-and-forget 的静默行为，仅确保骨架屏一定收起
  } finally {
    initializing.value = false
  }
})
</script>

<template>
  <div class="bs-shell">
    <!-- 头部：左 = 返回 + 标题；右 = 云同步（开关显示）+ 设置 -->
    <header class="bs-header" :class="{ 'is-mobile': isMobileNav }">
      <div class="bs-header-left">
        <!-- 左上角「工作台管理」同款入口：站点图标 + 点击弹出工作台切换面板（替换原 PageSwitcher 下拉，与导航站行为一致） -->
        <WorkbenchManagePanel
          :trigger-icon="settingsStore.businessPageIcon"
          trigger-builtin="store"
          :trigger-label="settingsStore.businessPageDisplayName"
          force-show
        />
        <span v-if="store.settings.stallName" class="bs-stall-name">{{ store.settings.stallName }}</span>
        <!-- M-20 移动端：当前页面标题（桌面端左树已标明所在面板，无需重复） -->
        <h1 v-if="isMobileNav" class="bs-mobile-title" data-testid="bs-mobile-title">
          {{ SECTIONS.find(s => s.key === activeSection)?.label ?? '销售记账' }}
        </h1>
      </div>
      <div class="bs-header-right">
        <!-- 账本切换（常驻入口）：有账本时才展示，无账本时由引导页承接 -->
        <BusinessLedgerSwitcher v-if="store.hasLedgers" />
        <button
          class="bs-btn"
          title="全局搜索 (Alt+K)：搜商品/支出分类，或直接搜「卖」「进货」「开销」快速记账"
          data-testid="bs-spotlight-open"
          @click="spotlightOpen = true"
        ><Icon name="search" :size="14" /> 搜索</button>
        <button
          v-if="cloudEnabled"
          class="bs-btn wb-sync-btn"
          :class="syncStatusClass"
          :title="syncTip"
          data-testid="bs-sync-now"
          :disabled="syncBusy || cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing'"
          @click="handleSyncNowClick"
        ><Icon name="cloud" :size="14" /> {{ syncLabel }}</button>
        <button class="bs-btn" title="设置" data-testid="bs-settings" @click="showSettingsDialog = true"><Icon name="cog" :size="15" /> 设置</button>
      </div>

      <!-- ===== M-20 移动端汇总条（固定在头部内，不随中间列表滚动） =====
           日期切换 + 当日营业额/毛利/支出/净额。摆摊结账时最关心的就是「今天卖了多少、赚了多少」，
           放在头部常驻，翻任何面板都不用先回首页。 -->
      <div v-if="isMobileNav && !gateVisible" class="bs-mobile-sum" data-testid="bs-mobile-summary">
        <div class="bs-mobile-daterow">
          <button
            type="button"
            class="bs-mobile-dbtn"
            title="前一天"
            aria-label="前一天"
            data-testid="bs-mobile-date-prev"
            @click="shiftMobileDate(-1)"
          ><Icon name="chevron-left" :size="16" /></button>
          <span class="bs-mobile-dlabel" data-testid="bs-mobile-date-label">{{ mobileDateLabel }}</span>
          <button
            type="button"
            class="bs-mobile-dbtn"
            title="后一天"
            aria-label="后一天"
            data-testid="bs-mobile-date-next"
            @click="shiftMobileDate(1)"
          ><Icon name="chevron-right" :size="16" /></button>
          <button
            v-if="mobileDateDirty"
            type="button"
            class="bs-mobile-dtoday"
            data-testid="bs-mobile-date-today"
            @click="goToday"
          >今天</button>
        </div>
        <div class="bs-mobile-sumgrid">
          <div class="bs-mobile-sumcell">
            <span class="bs-mobile-sumlabel">营业额</span>
            <span class="bs-mobile-sumval is-revenue" data-testid="bs-mobile-sum-revenue">{{ formatYuanOf(mobileDayStats.revenue) }}</span>
          </div>
          <div class="bs-mobile-sumcell">
            <span class="bs-mobile-sumlabel">毛利</span>
            <span class="bs-mobile-sumval is-profit" data-testid="bs-mobile-sum-profit">{{ formatYuanOf(mobileDayStats.profit) }}</span>
          </div>
          <div class="bs-mobile-sumcell">
            <span class="bs-mobile-sumlabel">支出</span>
            <span class="bs-mobile-sumval is-expense" data-testid="bs-mobile-sum-expense">{{ formatYuanOf(mobileDayStats.expense) }}</span>
          </div>
          <div class="bs-mobile-sumcell">
            <span class="bs-mobile-sumlabel">净额</span>
            <span class="bs-mobile-sumval is-net" :class="mobileDayStats.net < 0 ? 'is-negative' : ''" data-testid="bs-mobile-sum-net">{{ formatYuanOf(mobileDayStats.net) }}</span>
          </div>
        </div>
        <p v-if="mobileDayEmpty" class="bs-mobile-sumhint" data-testid="bs-mobile-sum-empty">当日还没有记账</p>
      </div>
    </header>

    <!-- 主体：左树 + 右内容区 -->
    <div class="bs-body">
      <nav
        v-if="!gateVisible"
        ref="menuEl"
        class="bs-menu"
        :class="{ collapsed: sidebarCollapsed }"
        data-testid="bs-menu"
      >
        <button
          class="bs-sidebar-toggle"
          data-testid="bs-sidebar-toggle"
          :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          @click="toggleSidebar"
        >
          <span class="bs-menu-icon">
            <Icon :name="sidebarCollapsed ? 'chevron-right' : 'chevron-left'" />
          </span>
          <span class="bs-menu-label">{{ sidebarCollapsed ? '展开' : '收起' }}</span>
        </button>
        <button
          v-for="item in visibleMenuItems"
          :key="item.key"
          class="bs-menu-item"
          :class="{ active: activeSection === item.key }"
          :title="item.label"
          :aria-label="item.label"
          :data-testid="`bs-menu-${item.key}`"
          @click="selectSection(item.key)"
        >
          <span class="bs-menu-icon"><Icon :name="item.icon" /></span>
          <span class="bs-menu-label">{{ item.label }}</span>
        </button>
        <!-- 「更多」（仅移动端渲染）：收纳库存预警/统计/对账3 个低频分析页 -->
        <button
          v-if="isMobileNav"
          class="bs-menu-item bs-menu-more"
          :class="{ active: activeInMore }"
          title="更多面板"
          aria-label="更多面板"
          data-testid="bs-menu-more"
          @click="moreOpen = !moreOpen"
        >
          <span class="bs-menu-icon"><Icon name="grid" /></span>
          <span class="bs-menu-label">更多</span>
        </button>
      </nav>

      <!-- 「更多」弹层：移动端专用。用 Teleport+fixed（.bs-header 有 backdrop-filter 会成为
           absolute 定位包含块；移动端 .bs-menu 是 overflow-x:auto，absolute 会被裁切） -->
      <Teleport to="body">
        <div v-if="moreOpen" class="bs-more-mask" data-testid="bs-more-mask" @click="moreOpen = false"></div>
        <div v-if="moreOpen" class="bs-more-panel" data-testid="bs-more-panel" role="dialog" aria-label="更多面板">
          <p class="bs-more-title">全部面板</p>
          <button
            v-for="s in moreSections"
            :key="s.key"
            class="bs-more-item"
            :class="{ active: activeSection === s.key }"
            :data-testid="`bs-more-${s.key}`"
            @click="selectFromMore(s.key as SectionKey)"
          >
            <span class="bs-more-icon"><Icon :name="s.icon" :size="18" /></span>
            <span class="bs-more-body">
              <span class="bs-more-label">{{ s.label }}</span>
              <span class="bs-more-hint">{{ s.hint }}</span>
            </span>
            <span v-if="activeSection === s.key" class="bs-more-active">当前</span>
          </button>
        </div>
      </Teleport>

      <!-- 中间内容区（M-20）：移动端为唯一滚动容器 —— 独立 overflow-y:auto，
           overscroll-behavior:contain 阻断滚动到底后的橡皮筋穿透到头部/底栏；
           touch 手势用于左右滑切换面板（纵向滚动不受影响，见 onSwipeEnd 的轴向判定） -->
      <main
        ref="contentRef"
        class="bs-content"
        :class="{ 'is-mobile': isMobileNav }"
        :style="contentStyle"
        data-testid="bs-content"
        @touchstart.passive="onSwipeStart"
        @touchend.passive="onSwipeEnd"
      >
        <SkeletonBlock v-if="initializing" :rows="5" label="正在加载销售记账数据" />

        <!-- 无账本：阻断式引导，必须先创建当年账本才能进入 -->
        <div v-else-if="gateVisible" class="bs-gate" data-testid="bs-ledger-gate">
          <div class="bs-gate-card">
            <h2 class="bs-gate-title">还没有账本</h2>
            <p class="bs-gate-desc">
              账本是销售记账的最外层容器，按自然年创建，同一年份可以创建多本（自动编号「年份-序号」，如 {{ thisYear }}-01）。
              每本账本只记录其所属年份的数据，跨年数据不会混入同一账本。所有商品、进货、销售、支出都会记在账本下。
              请先创建 {{ thisYear }} 年账本，再开始记账。
            </p>
            <div class="bs-gate-form">
              <label class="bs-gate-field">
                年份
                <input v-model.number="gateYear" type="number" min="1970" max="9999" class="bs-gate-input" data-testid="bs-gate-year" />
              </label>
              <label class="bs-gate-field">
                名称
                <input
                  v-model="gateName"
                  type="text"
                  maxlength="30"
                  class="bs-gate-input"
                  :placeholder="ledgerDefaultName(Number(gateYear) || thisYear)"
                  data-testid="bs-gate-name"
                />
              </label>
            </div>
            <p v-if="gateError" class="bs-gate-error" data-testid="bs-gate-error">{{ gateError }}</p>
            <button type="button" class="bs-btn bs-btn-primary" data-testid="bs-gate-submit" @click="onCreateFromGate">
              创建并进入
            </button>
          </div>
        </div>

        <template v-else>
          <!-- 跨年首次进入：当前年还没有账本，提示一键创建（不阻断历史账本查看） -->
          <div v-if="crossYearBannerVisible" class="bs-year-banner" data-testid="bs-cross-year-banner">
            <span>{{ thisYear }} 年还没有账本，创建后才能记录今年的收支。</span>
            <button type="button" class="bs-btn bs-btn-primary" data-testid="bs-cross-year-create" @click="onCreateCurrentYear">
              创建 {{ thisYear }} 年账本
            </button>
          </div>
          <!-- autoOpenAdd：Alt+K 快捷动作命中「记一笔…」时，视图先置标志再挂载本面板，面板 onMounted 打开新增弹框 -->
          <BusinessHome v-if="activeSection === 'home'" @navigate="navigateTo" />
          <BusinessProducts
            v-else-if="activeSection === 'products'"
            :highlight-id="productFilter"
            :auto-open-add="quickAddSection === 'products'"
            @navigate="navigateTo"
          />
          <BusinessPurchases
            v-else-if="activeSection === 'purchases'"
            :product-filter="purchaseFilter"
            :auto-open-add="quickAddSection === 'purchases'"
            @navigate="navigateTo"
            @clear-filter="purchaseFilter = undefined"
          />
          <BusinessDaily
            v-else-if="activeSection === 'daily'"
            :auto-open-add="quickAddSection === 'daily'"
            @navigate="navigateTo"
          />
          <!-- M-13：补@navigate 绑定（此前 expenses/stats/reconcile 三面板未绑，出度为 0，
           发现「支出没关联进货」也无法一键直达对账页） -->
          <BusinessExpenses
            v-else-if="activeSection === 'expenses'"
            :auto-open-add="quickAddSection === 'expenses'"
            @navigate="navigateTo"
          />
          <BusinessInventory v-else-if="activeSection === 'inventory'" @navigate="navigateTo" />
          <BusinessStats v-else-if="activeSection === 'stats'" @navigate="navigateTo" />
          <BusinessReconcile v-else-if="activeSection === 'reconcile'" @navigate="navigateTo" />
        </template>
      </main>
    </div>

    <!-- ===== M-12 全局「快速记一笔」悬浮按钮 =====
         桌面端放右下角常驻圆钮；移动端为拇指热区，避开底部 Tab Bar。 -->
    <div v-if="!gateVisible" class="bs-fab-wrap" data-testid="bs-quickadd">
      <div v-if="quickAddOpen" class="bs-fab-actions">
        <button
          v-for="a in quickAddActions"
          :key="a.id"
          type="button"
          class="bs-fab-action"
          :data-testid="`bs-quickadd-${a.id}`"
          @click="runQuickAdd((a.action as { section: string }).section)"
        >
          <Icon :name="a.icon" :size="16" />
          <span>{{ a.label }}</span>
        </button>
      </div>
      <button
        type="button"
        class="bs-fab"
        :class="{ open: quickAddOpen }"
        :title="quickAddOpen ? '收起' : '快速记一笔'"
        :aria-label="quickAddOpen ? '收起快速记一笔' : '快速记一笔'"
        data-testid="bs-quickadd-toggle"
        @click="quickAddOpen = !quickAddOpen"
      >
        <Icon :name="quickAddOpen ? 'close' : 'plus'" :size="22" />
      </button>
    </div>

    <!-- 全局搜索浮层：Alt+K 或点右上角「搜索」打开 -->
    <BusinessSpotlightOverlay
      v-if="spotlightOpen"
      :data="spotlightData"
      @select="handleSpotlightSelect"
      @close="spotlightOpen = false"
    />
    <AppSettingsDialog v-if="showSettingsDialog" source="business" @close="showSettingsDialog = false" />
  </div>
</template>

<style scoped>
/* 亮色基础样式（沿用 --color-* 全局 token，复刻 WorkbenchView .wb-*） */
.bs-shell {
  height: 100dvh;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg, #f8fafc);
  color: var(--color-text, #1e293b);
}

.bs-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  background-color: var(--color-bg-card, #ffffff);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.bs-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.bs-header-left h1 {
  font-size: var(--font-size-2xl, 20px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text, #1e293b);
  white-space: nowrap;
}

.bs-stall-name {
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: 999px;
  padding: 2px 10px;
  white-space: nowrap;
}

.bs-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 头部按钮基础样式：经 :deep 透传给子组件（账本切换器按钮与「云同步」共用同一份配色/字号/间距/圆角） */
.bs-btn,
.bs-header-right :deep(.bs-btn) {
  padding: 8px 12px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.bs-btn:hover,
.bs-header-right :deep(.bs-btn:hover) {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.bs-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.bs-menu {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 8px;
  background-color: var(--color-bg-card, #ffffff);
  border-right: 1px solid var(--color-border, #e2e8f0);
  transition: width 0.2s ease;
}

/* ===== 主色按钮（账本引导 / 跨年提示复用） ===== */
.bs-btn-primary {
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
  border-color: var(--color-primary, #3b82f6);
}

.bs-btn-primary:hover {
  background-color: var(--color-primary-hover, #2563eb);
  color: #fff;
  border-color: var(--color-primary-hover, #2563eb);
}

/* ===== 无账本引导（阻断式） ===== */
.bs-gate {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow-y: auto;
}

.bs-gate-card {
  width: 100%;
  max-width: 460px;
  padding: 24px;
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

.bs-gate-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.bs-gate-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-secondary, #64748b);
}

.bs-gate-form {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 10px;
  margin-bottom: 10px;
}

.bs-gate-field {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

.bs-gate-input {
  padding: 8px 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text, #1e293b);
  background-color: var(--color-bg-card, #ffffff);
}

.bs-gate-input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
}

.bs-gate-error {
  margin: 0 0 10px;
  font-size: 12px;
  color: #ef4444;
}

/* ===== 跨年提示条（不阻断） ===== */
.bs-year-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 10px 14px;
  background-color: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  font-size: 13px;
  color: #92400e;
}

/* 侧栏折叠：56px 仅图标（label 隐藏、图标居中），展开宽度 200px 平滑过渡 */
.bs-menu.collapsed {
  width: 56px;
}

.bs-sidebar-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.bs-sidebar-toggle:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
}

.bs-menu.collapsed .bs-sidebar-toggle {
  justify-content: center;
  padding: 10px 0;
}

.bs-menu.collapsed .bs-menu-label {
  display: none;
}

.bs-menu.collapsed .bs-menu-item {
  justify-content: center;
  padding: 10px 0;
}

.bs-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.bs-menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  font-size: 15px;
}

.bs-menu-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bs-menu-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
}

.bs-menu-item.active {
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}

.bs-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg, #f8fafc);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}

/* 暗色模式覆盖（模式参考 WorkbenchView） */
html.dark .bs-shell {
  background-color: var(--color-bg, #111827);
}

html.dark .bs-header {
  background-color: var(--color-bg-card, #1f2937);
  border-bottom-color: var(--color-border, #374151);
}

html.dark .bs-header-left h1 {
  color: var(--color-text, #f9fafb);
}

html.dark .bs-btn,
html.dark .bs-header-right :deep(.bs-btn) {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .bs-btn:hover,
html.dark .bs-header-right :deep(.bs-btn:hover) {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

html.dark .bs-menu {
  background-color: var(--color-bg-card, #1f2937);
  border-right-color: var(--color-border, #374151);
}

html.dark .bs-sidebar-toggle {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .bs-sidebar-toggle:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #f9fafb);
}

html.dark .bs-menu-item {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .bs-menu-item:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #f9fafb);
}

html.dark .bs-menu-item.active {
  background-color: #1e3a5f;
  color: #60a5fa;
}

html.dark .bs-content {
  background-color: var(--color-bg, #111827);
}

html.dark .bs-stall-name {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

/* 移动端：左树横排、页面滚动恢复（复刻 WorkbenchView 断点） */
@media (max-width: 768px) {
  /* ===== M-20 移动端三段式布局：固定头部 / 独立滚动内容 / 固定底栏 =====
     结构上做到「外壳不滚、内容单独滚」：
       .bs-shell  100dvh + overflow:hidden（外壳本身永不滚动）
       .bs-header flex:none（内容多高就多高，始终占住顶部，不被内容顶走）
       .bs-content flex:1 + min-height:0 + overflow-y:auto（唯一滚动容器）
       .bs-menu   position:fixed（脱离文档流，不占内容高度、不被内容遮挡）
     min-height:0 是 flex 子项能真正收缩的前提：缺它时内容区按内容高度撑开，
     底栏会被顶到屏幕外 —— 这是「底栏不见了」最常见的根因。 */
  .bs-shell {
    /* dvh 随移动端地址栏收放变化；vh 作为不支持 dvh 的旧内核回退 */
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  .bs-header {
    flex: none;
    /* 刘海屏/挖孔屏：顶部内边距补安全区，否则标题被状态栏压住 */
    padding-top: calc(10px + env(safe-area-inset-top, 0px));
  }

  .bs-content {
    overflow-y: auto;
    /* 滚动到底后不把橡皮筋传递给外层文档（否则头部/底栏会跟着一起晃） */
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }

  .bs-content > * {
    flex: none;
  }

  .bs-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .bs-body {
    flex-direction: column;
    /* 内容区外的剩余空间全部让给内容区 */
    flex: 1;
    min-height: 0;
  }

  /* 菜单降级为底部固定 Tab Bar（与「个人工作台」一致）：常驻拇指区，
     图标+名称常显，菜单项过多时整条横向滚动 */
  .bs-menu {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    width: 100%;
    flex: 0 0 auto;
    flex-direction: row;
    gap: 4px;
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    border-right: none;
    border-top: 1px solid var(--color-border, #e2e8f0);
    border-bottom: none;
    background-color: var(--color-bg-card, #ffffff);
    box-shadow: 0 -2px 12px var(--color-shadow, rgba(0, 0, 0, 0.08));
  }

  /* 移动端忽略折叠态（始终全宽 + 显示 label），隐藏折叠按钮 */
  .bs-menu.collapsed {
    width: 100%;
  }

  .bs-menu.collapsed .bs-menu-label {
    display: inline;
  }

  .bs-menu.collapsed .bs-menu-item {
    justify-content: flex-start;
    padding: 10px 12px;
  }

  .bs-sidebar-toggle {
    display: none;
  }

  /* 不收缩：图标+名称完整显示，超出由底部栏横向滚动 */
  .bs-menu-item {
    flex: 0 0 auto;
    white-space: nowrap;
    scroll-snap-align: start;
    /* 激活项顶部指示条（position:relative 已在基础样式外补，见下方 .bs-menu-item 定位） */
    position: relative;
  }

  /* 激活项：顶部 2px 主色条 + 主色文字 + 浅底三重视觉，拇指区不看字也能判断当前位置 */
  .bs-menu-item.active {
    color: var(--color-primary, #3b82f6);
    background-color: var(--color-primary-light, #eff6ff);
  }

  .bs-menu-item.active::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 22px;
    height: 2px;
    border-radius: 0 0 2px 2px;
    background-color: var(--color-primary, #3b82f6);
  }

  /* M-06：5 个高频 Tab 铺满一行（flex:1 均分），「更多」固定贴右不参与横滑
     —— 6 项各~62px 在 375px 屏刚好放得下，仍保留 overflow-x:auto 作极窄屏兜底 */
  .bs-menu-item:not(.bs-menu-more) {
    flex: 1 1 0;
    min-width: 0;
    justify-content: center;
    padding: 10px 6px;
  }

  .bs-menu-more {
    flex: 0 0 auto;
    margin-left: auto;
    padding: 10px 14px;
  }

  .bs-menu-label {
    overflow: visible;
    text-overflow: clip;
  }

  /* 移动端触控目标 ≥44px（侧栏菜单项 / 头部按钮）：
     原为 40px，低于 iOS/Android 44px 触控下限，误触率偏高 */
  .bs-menu-item {
    min-height: 44px;
    min-width: 44px;
  }

  .bs-btn {
    min-height: 44px;
  }

  /* 窄屏间距压缩：内容区内边距收窄、首页卡片间距收紧；底部留白避让固定 Tab Bar（44px 触控 + 内边距 + 安全区） */
  .bs-content {
    padding: 12px 12px calc(64px + env(safe-area-inset-bottom, 0px));
  }
}

/* ===== M-20 移动端固定头部：页面标题 =====
   桌面端左树已标明所在面板，标题冗余；移动端底栏在屏幕最下方，
   抬头看不到「我在哪个页面」，故移动端补一行标题。 */
.bs-mobile-title {
  margin: 0;
  min-width: 0;
  font-size: var(--font-size-xl, 18px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== M-20 移动端头部汇总条（日期切换 + 当日金额） =====
   固定在头部内，随头部一起固定；内容区滚动不经过它，故永不遮挡。 */
.bs-mobile-sum {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 8px 0 2px;
}

.bs-mobile-daterow {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bs-mobile-dbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 触控目标 ≥36px：日期步进是高频操作，比 44px 标准略低以省头部高度 */
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  padding: 0;
  color: var(--color-text-secondary, #64748b);
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  cursor: pointer;
}
.bs-mobile-dbtn:active {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.bs-mobile-dlabel {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.bs-mobile-dtoday {
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
  color: #fff;
  background-color: var(--color-primary, #3b82f6);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
}

/* 4 格汇总：营业额 / 毛利 / 支出 / 净额。
   用 auto-fit + minmax(0,1fr) 而非固定 4 列：320px 小屏也不会挤成两行。 */
.bs-mobile-sumgrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.bs-mobile-sumcell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 7px 8px;
  background-color: var(--color-bg, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
}

.bs-mobile-sumlabel {
  font-size: 11px;
  line-height: 1.3;
  color: var(--color-text-secondary, #64748b);
  white-space: nowrap;
}

/* 金额默认 nowrap + 省略：4 位数以上的大额不换行把卡片撑破 */
.bs-mobile-sumval {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--color-text, #1e293b);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bs-mobile-sumval.is-revenue { color: var(--color-success, #16a34a); }
.bs-mobile-sumval.is-profit { color: var(--color-text, #1e293b); }
.bs-mobile-sumval.is-expense { color: var(--color-warning, #d97706); }
/* 净额为负：标红（摆摊语境下「今天亏了」必须一眼可见） */
.bs-mobile-sumval.is-net { color: var(--color-primary, #3b82f6); }
.bs-mobile-sumval.is-negative { color: var(--color-error, #dc2626); }

.bs-mobile-sumhint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

/* 极窄屏（≤360px，如 iPhone SE / 小屏安卓）：汇总格改 2×2，
   否则 4 列各约 78px 装不下「¥1234.00」，金额被省略号吃掉 */
@media (max-width: 360px) {
  .bs-mobile-sumgrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .bs-mobile-sumval {
    font-size: 16px;
  }
}

/* 小屏高度（横屏手机 / 分屏）：头部过高会把内容区挤没。
   此时压缩内边距与汇总格高度，优先保证中间列表有可用高度。 */
@media (max-width: 768px) and (max-height: 560px) {
  .bs-mobile-sum {
    gap: 6px;
    padding: 6px 0 0;
  }
  .bs-mobile-sumcell {
    padding: 5px 8px;
  }
  .bs-mobile-dbtn {
    width: 32px;
    height: 32px;
  }
  .bs-mobile-dlabel {
    font-size: 14px;
  }
}

/* 移动端暗色兜底（Teleport 的「更多」弹层用非 scoped 类名，故组合书写） */
@media (max-width: 768px) {
  html.dark .bs-mobile-title,
  html.dark .bs-mobile-dlabel {
    color: var(--color-text, #f9fafb);
  }
  html.dark .bs-mobile-dbtn {
    background-color: var(--color-bg-card, #1f2937);
    color: var(--color-text-secondary, #d1d5db);
    border-color: var(--color-border, #374151);
  }
  html.dark .bs-mobile-sumcell {
    background-color: rgba(255, 255, 255, 0.04);
    border-color: var(--color-border, #374151);
  }
  html.dark .bs-mobile-sumlabel,
  html.dark .bs-mobile-sumhint {
    color: var(--color-text-secondary, #d1d5db);
  }
  html.dark .bs-mobile-sumval {
    color: var(--color-text, #f9fafb);
  }
  html.dark .bs-mobile-sumval.is-revenue { color: #4ade80; }
  html.dark .bs-mobile-sumval.is-expense { color: #fbbf24; }
  html.dark .bs-mobile-sumval.is-net { color: #60a5fa; }
  html.dark .bs-mobile-sumval.is-negative { color: #f87171; }

  /* 底部激活项：加一条顶部高亮条 + 图标着色，与未激活项拉开辨识度。
     移动端底栏是最重要的导航，仅靠浅蓝底色在低亮度阳光下不够醒目。 */
  html.dark .bs-menu-item.active {
    background: #1e3a5f;
  }
}

/* 移动端底部 Tab Bar 暗色兜底：边框改顶部 + 加深阴影（与 WorkbenchView 一致） */
@media (max-width: 768px) {
  html.dark .bs-menu {
    border-top-color: var(--color-border, #374151);
    box-shadow: 0 -2px 12px var(--color-shadow, rgba(0, 0, 0, 0.4));
  }
}

/* 桌面页面级滚动：内容区为唯一滚动容器，面板随内容自然撑开
   （原「一屏契约」把面板根钉满内容区，迫使各面板自建内部滚动条） */
@media (min-width: 769px) {
  .bs-content {
    overflow-x: hidden;
    overflow-y: auto;
  }

  .bs-content > * {
    flex: 0 0 auto;
  }
}

/* ===== M-06「更多」弹层（移动端专用，Teleport 到 body 故用非 scoped 定位策略的元素名） ===== */
.bs-more-mask {
  position: fixed;
  inset: 0;
  z-index: 240;
  background: rgba(15, 23, 42, 0.35);
}
.bs-more-panel {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  z-index: 241;
  padding: 12px;
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(2, 6, 23, 0.28);
}
.bs-more-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
}
.bs-more-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s;
}
.bs-more-item:hover {
  background: var(--color-bg-hover, #f1f5f9);
}
.bs-more-item.active {
  background: var(--color-primary-light, #eff6ff);
}
.bs-more-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
  border-radius: 9px;
}
.bs-more-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.bs-more-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}
.bs-more-hint {
  font-size: 11px;
  color: var(--color-text-secondary, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bs-more-active {
  flex-shrink: 0;
  padding: 2px 8px;
  font-size: 11px;
  color: #fff;
  background: var(--color-primary, #3b82f6);
  border-radius: 999px;
}

html.dark .bs-more-mask {
  background: rgba(2, 6, 23, 0.55);
}
html.dark .bs-more-panel {
  background: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}
html.dark .bs-more-item:hover {
  background: var(--color-bg-hover, #374151);
}
html.dark .bs-more-item.active {
  background: #1e3a5f;
}
html.dark .bs-more-icon {
  color: #60a5fa;
  background: #1e3a5f;
}
html.dark .bs-more-label {
  color: var(--color-text, #f9fafb);
}

/* ===== M-12 快速记一笔悬浮按钮 ===== */
.bs-fab-wrap {
  position: fixed;
  right: 20px;
  bottom: 24px;
  z-index: 230;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}
.bs-fab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  color: #fff;
  background: var(--color-primary, #3b82f6);
  border: none;
  border-radius: 50%;
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
  cursor: pointer;
  transition: transform 0.15s, background-color 0.15s;
}
.bs-fab:hover {
  background: var(--color-primary-hover, #2563eb);
}
.bs-fab.open {
  transform: rotate(90deg);
}
.bs-fab-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.bs-fab-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text, #1e293b);
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  box-shadow: 0 4px 14px rgba(2, 6, 23, 0.16);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.14s;
}
.bs-fab-action:hover {
  color: #fff;
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}
html.dark .bs-fab-action {
  color: var(--color-text, #f9fafb);
  background: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

/* 移动端：FAB 上移避让底部 Tab Bar；展开动作条改为向上堆叠（column-reverse 更贴近拇指） */
@media (max-width: 768px) {
  .bs-fab-wrap {
    right: 16px;
    bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  }
  .bs-fab {
    width: 50px;
    height: 50px;
  }
  .bs-fab-actions {
    align-items: stretch;
  }
  .bs-fab-action {
    min-height: 44px;
    justify-content: flex-start;
  }
}

/* 右上角云同步按钮（头部设置按钮左侧）状态视觉 */
.wb-sync-btn {
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease, opacity 120ms ease;
}
.wb-sync-btn.wb-sync-btn-pending {
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
  border-color: var(--color-primary, #3b82f6);
  opacity: 0.88;
  cursor: progress !important;
}
.wb-sync-btn.wb-sync-btn-conflict {
  background-color: #f59e0b;
  color: #fff;
  border-color: #f59e0b;
}
.wb-sync-btn.wb-sync-btn-error {
  background-color: #ef4444;
  color: #fff;
  border-color: #ef4444;
}
</style>
