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
import { currentYear, ledgerDefaultName } from '@/composables/businessCore'
import { BIZ_QUICK_ACTIONS, BIZ_SECTIONS } from '@/composables/businessSpotlightCore'
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

// ===== 移动端底部 Tab 展示全部面板（2026-10-08）=====
// 演进：原 8 项全塞进底栏（.bs-menu overflow-x:auto）→ 2026-10-06 收敛为 5 项
// +「更多」弹层（MOBILE_TAB_KEYS 收纳库存预警/统计/对账 3 个低频分析页）→
// 2026-10-08 按需求去掉「更多」，底栏直接展示全部 8 项（横向滚动）。
// 桌面端左树同样保持完整 8 项。
const MOBILE_MEDIA = '(max-width: 768px)'
const isMobileNav = ref(false)
let mobileMql: MediaQueryList | null = null
function syncMobileNav(e: { matches: boolean } | MediaQueryList): void {
  isMobileNav.value = e.matches
}

onMounted(() => {
  mobileMql = window.matchMedia(MOBILE_MEDIA)
  isMobileNav.value = mobileMql.matches
  mobileMql.addEventListener('change', syncMobileNav)
  // Esc 监听放document 捕获阶段：useWorkbenchShortcuts 在 window 冒泡监听 Esc，
  // 冒泡会先到 window；捕获阶段 + stopPropagation 可避免「关浮层」同时触发其它 Esc 行为
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
//
// 2026-10-07 调整：原固定头部里的「日期切换 + 当日汇总」已移除 ——
// 汇总数据属于「首页」的职责，放在固定头部每个面板都常驻 4 个数字，
// 既挤占小屏内容高度，又与首页的今日卡片重复。固定头部只保留标题与操作按钮。

// 2026-10-08 调整：移除了内容区左右滑动切换面板的手势（原 onSwipeStart/onSwipeEnd）。
// 原因：滑动切页与列表横向滚动/表格横滑冲突（易误触横跳），且底部菜单已能直接
// 切换，移动端不需要手势。切换入口统一收敛到底部菜单栏。

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

/** 底部菜单当前项的 DOM，用于切页后把该项滚动进可视区（窄屏 5 项可能溢出） */
const menuEl = ref<HTMLElement | null>(null)
/** 用 style 绑定高度变量：0 时不输出，让 CSS 的 100dvh 生效 */
const contentStyle = computed(() =>
  contentHeight.value > 0 ? { height: `${contentHeight.value}px` } : {}
)

/** 当前激活项对应的 DOM 节点（data-testid=bs-menu-<key>） */
function scrollActiveIntoView(): void {
  const root = menuEl.value
  if (!root) return
  const el = root.querySelector<HTMLElement>(`[data-testid="bs-menu-${activeSection.value}"]`)
  // scrollIntoView 会连带滚动祖先（含中间内容区），故用 scrollLeft 手算，只平移底栏自身
  if (!el || root.scrollWidth <= root.clientWidth) return
  // scroll-snap-align:center 与此居中公式对应：滚动停止时该项落在视口中央
  const target = el.offsetLeft - (root.clientWidth - el.offsetWidth) / 2
  const max = root.scrollWidth - root.clientWidth
  root.scrollTo({ left: Math.min(Math.max(0, target), max), behavior: 'smooth' })
}

watch(activeSection, () => { void nextTick(scrollActiveIntoView) })

/** 侧栏/底栏实际渲染的菜单项：移动端与桌面均为全部 8 项（2026-10-08 去掉「更多」） */
const visibleMenuItems = computed(() => [...SECTIONS])

/** Esc 关闭浮层：仅剩「快速记一笔」；未开则让事件继续传给弹框自身 */
function handleEsc(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  if (quickAddOpen.value) {
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
    <!-- 头部：左 = 工作台入口 + 账本信息；右 = 云同步（开关显示）+ 设置。
         M-22（移动端）：账本信息提到第一行 —— 账本是全局数据上下文（按年隔离、跨账本不可见），
         需要常驻可见；原先它与搜索/云同步/设置挤在第二行，375px 屏上按钮被压缩得只剩编号、名称几乎读不出来。
         菜单名（页面标题）已按需求移除：底栏当前项已有主色指示条 + 高亮，标题属重复信息。 -->
    <header class="bs-header" :class="{ 'is-mobile': isMobileNav }">
      <div class="bs-header-left">
        <!-- 左上角「工作台管理」同款入口：站点图标 + 点击弹出工作台切换面板（替换原 PageSwitcher 下拉，与导航站行为一致） -->
        <WorkbenchManagePanel
          :trigger-icon="settingsStore.businessPageIcon"
          trigger-builtin="store"
          :trigger-label="settingsStore.businessPageDisplayName"
          force-show
        />
        <!-- 账本切换（移动端在第一行，桌面端在右侧按钮区，见下方 bs-header-right） -->
        <BusinessLedgerSwitcher v-if="isMobileNav && store.hasLedgers" class="bs-mobile-ledger" />
        <span v-if="store.settings.stallName" class="bs-stall-name">{{ store.settings.stallName }}</span>
      </div>
      <div class="bs-header-right">
        <!-- 账本切换（桌面端常驻入口）：有账本时才展示，无账本时由引导页承接 -->
        <BusinessLedgerSwitcher v-if="!isMobileNav && store.hasLedgers" />
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
      </nav>

      <!-- 中间内容区（M-20）：移动端为唯一滚动容器 —— 独立 overflow-y:auto，
           overscroll-behavior:contain 阻断滚动到底后的橡皮筋穿透到头部/底栏。
           2026-10-08：已移除左右滑动切面板手势，面板切换统一由底部菜单栏负责 -->
      <main
        ref="contentRef"
        class="bs-content"
        :class="{ 'is-mobile': isMobileNav }"
        :style="contentStyle"
        data-testid="bs-content"
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
                <el-input
                  v-model.number="gateYear"
                  type="number"
                  min="1970"
                  max="9999"
                  data-testid="bs-gate-year"
                />
              </label>
              <label class="bs-gate-field">
                名称
                <el-input
                  v-model="gateName"
                  type="text"
                  maxlength="30"
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

/* .bs-btn 视觉已统一到全局 .ui-btn（次按钮）；全局类跨组件生效，无需 :deep 透传 */

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

/* .bs-btn-primary 视觉已统一到全局 .ui-btn--primary */

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

/* 账本创建门的年份/名称输入已改用 el-input（自带边框、聚焦环、暗色），
   .bs-gate-field 为 grid 容器，el-input 作为 grid item 会自动撑满列宽，
   故原先 .bs-gate-input 的视觉样式随之移除。 */

.bs-gate-error {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--color-error, #ef4444);
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
    /* min-height:0 是 flex 子项能收缩的前提，缺它时本元素按内容高度撑开，
       外层 .bs-shell 又是 overflow:hidden —— 内容超出屏幕且被裁掉，
       overflow-y:auto 因容器没有被压缩而不产生滚动条（商品页「无法下滑」即此因）。
       .bs-body 移动端为 flex-direction:column，本元素是其子项，故必须显式归零。 */
    min-height: 0;
    overflow-y: auto;
    /* 滚动到底后不把橡皮筋传递给外层文档（否则头部/底栏会跟着一起晃） */
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }

  .bs-content > * {
    flex: none;
  }

  /* 移动端头部：两行 —— 第1 行 = 工作台图标 + 账本信息，第 2 行 = 搜索/云同步/设置。
     align-items:stretch + first 行 width:100% 让账本切换器能真正占满第一行宽度；
     若保持 flex-start，账本按钮会按内容宽度收缩，长名称被 max-width 提前截断。 */
  .bs-header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .bs-header-left {
    width: 100%;
  }

  /* 工作台图标是固定尺寸的入口，不参与压缩 —— 否则长账本名会把它压扁。
     子组件根元素能继承父组件 scoped 样式，故直接用合并选择器。 */
  .bs-header-left :deep(.wmp-root) {
    flex-shrink: 0;
  }

  /* 摊位名是次要信息，长名不该把账本挤扁：可压缩 + 截断 */
  .bs-header-left .bs-stall-name {
    flex-shrink: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 第 2 行按钮区：搜索/云同步/设置靠右，不占满（避免被误读成第二个导航条） */
  .bs-header-right {
    width: 100%;
    justify-content: flex-end;
  }

  .bs-body {
    flex-direction: column;
    /* 内容区外的剩余空间全部让给内容区 */
    flex: 1;
    min-height: 0;
  }

  /* 菜单降级为底部固定 Tab Bar（与「个人工作台」一致）：常驻拇指区。
     M-21 起底栏改为「固定项宽 + 横向滚动」：5 个 Tab 各 78px + 「更多」66px
     = 456px，375px 屏放不下整条，故保留 overflow-x:auto；
     scroll-snap 让滑动停在整项上（不是停在半个字上）。
     「更多」sticky right 钉在右缘，横向滑动时始终够得着。 */
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
    overflow-y: hidden;
    scroll-snap-type: x proximity;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    /* 横向可滚动的容器不应把橡皮筋传给纵向页面 */
    overscroll-behavior-x: contain;
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
    scroll-snap-align: center;
    position: relative;
  }

  /* 激活项：顶部 2px 主色条 + 主色文字 + 浅底三重视觉，拇指区不看字也能判断当前位置。
     指示条用 top:0（不是负值）：父级 .bs-menu 是 overflow-x:auto，
     计算上 overflow-y 也变成 auto，负偏移的指示条会被裁掉。 */
  .bs-menu-item.active {
    color: var(--color-primary, #3b82f6);
    background-color: var(--color-primary-light, #eff6ff);
  }

  .bs-menu-item.active::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 22px;
    height: 2px;
    border-radius: 0 0 2px 2px;
    background-color: var(--color-primary, #3b82f6);
  }

  /* ===== 底栏加宽 + 消除重叠（2026-10-07 建立，2026-10-08 随「更多」移除同步调整）=====
     原先 5 个 Tab 用 flex:1 1 0 均分，375px 屏每项只剩 ~62px；
     而图标(20px) + gap(8px) + 二字标签(≈28px) + 左右 padding(12px) 实际需要 ~72px，
     装不下时文字溢出到相邻项上 —— 表现为「底部菜单有部分重叠」。
     改为固定最小宽度 + 整条横向滚动：每项都完整显示、永不重叠。
     2026-10-08：底栏改为展示全部 8 项后，仍沿用该策略（横向滚动 + 不重叠），
     原 `.bs-menu-item:not(.bs-menu-more)` 的排除选择器已无必要，去掉 `:not()`。 */
  .bs-menu-item {
    flex: 0 0 auto;
    min-width: 78px;
    justify-content: center;
    padding: 10px 8px;
  }

  /* 标签不溢出：这是「重叠」的第二根因 —— 原为 visible/clip，
     文字超出按钮宽度后会直接压在下一项上。改为省略号截断兜底。 */
  .bs-menu-label {
    overflow: hidden;
    text-overflow: ellipsis;
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

  /* 窄屏间距压缩：内容区内边距收窄、首页卡片间距收紧；底部留白避让固定 Tab Bar。
     实测（iPhone13 390×664）底栏实际高 57px，原 64px 留白扣除后只剩 7px 间距，
     分页器/末条内容紧贴菜单栏，视觉上像「点不到」→ 提到 76px，留出约 19px 呼吸位。 */
  .bs-content {
    padding: 12px 12px calc(76px + env(safe-area-inset-bottom, 0px));
  }
}

/* ===== M-22 移动端头部：账本信息提到第一行 =====
   原先 .bs-mobile-title（菜单名）已按需求移除 —— 底栏当前项已有主色指示条 + 文字高亮，
   标题是重复信息，且在小屏上白占一行高度。
   现在第一行放账本切换器：账本是全局数据上下文（按年隔离），必须常驻可见。
   宽度策略：flex:1 占满剩余空间 + min-width:0，让 .bls-name 真正参与 ellipsis 截断
   （原先按内容宽度收缩，名称一长就把「摊位名」和右侧按钮挤出可视区）。 */
.bs-mobile-ledger {
  flex: 1;
  min-width: 0;
}

.bs-mobile-ledger :deep(.bls-trigger) {
  /* 移动端第一行可用宽度 ≈ 375 - 20(padding) - 40(工作台图标) - 8(gap) ≈ 307px，
     子组件默认 max-width:220px 会让长名称提前截断，这里放开 */
  max-width: 100%;
  width: 100%;
  justify-content: flex-start;
}

.bs-mobile-ledger :deep(.bls-code) {
  font-size: 11px;
  padding: 1px 5px;
}

/* 移动端暗色兜底 */
@media (max-width: 768px) {
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
  /* 2026-10-08：移动端隐藏「快速记一笔」悬浮按钮（FAB）。
     原因：移动端底部菜单栏已能直接进入各面板（且菜单已改为展开全部功能），
     FAB 既遮挡内容又与底栏争抢右下角空间。桌面端保持不变。
     隐藏整个 wrapper 即可（.bs-fab-wrap 为 position:fixed 容器，内含 FAB 与展开项）。 */
  .bs-fab-wrap {
    display: none;
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
  background-color: var(--color-error, #ef4444);
  color: #fff;
  border-color: var(--color-error, #ef4444);
}
</style>
