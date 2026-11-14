<script setup lang="ts">
// 销售记账独立页面（摆摊进销存）：布局与个人工作台一致（无顶栏，左菜单三段 + 右内容；移动端左侧抽屉）
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { useAppSettingsStore } from '@/stores/settings'
import WorkbenchSwitcher from '@/components/WorkbenchSwitcher.vue'
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

/** 移动端左侧抽屉：默认收起，由内容区页头按钮唤出（与个人 / 健康 / 智能工作台同款） */
const mobileMenuOpen = ref(false)
function closeMobileMenu(): void {
  mobileMenuOpen.value = false
}

const activeSection = ref<SectionKey>((settingsStore.businessActiveSection as SectionKey) || 'home')

// P1-3：跨模块联动过滤状态
const productFilter = ref<string | undefined>(undefined)
const purchaseFilter = ref<string | undefined>(undefined)

// 手动切菜单时清空联动过滤（navigateTo 带过滤跳转时不���；否则从首页带过滤进入后
// 手动切走再回来仍被过滤，且无清除入口 → 用户误以为数据丢了，见 docs/optimization 销售记账优化方案 M-11）
function selectSection(key: SectionKey): void {
  activeSection.value = key
  closeMobileMenu()
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

// ===== 移动端左侧抽屉（与个人 / 健康 / 智能工作台同款）=====
// 桌面左树与移动端抽屉共用同一份 SECTIONS；切页后抽屉自动收起（见 selectSection）。
const contentRef = ref<HTMLElement | null>(null)

onMounted(() => {
  // Esc 监听放 document 捕获阶段：useWorkbenchShortcuts 在 window 冒泡监听 Esc，
  // 冒泡会先到 window；捕获阶段 + stopPropagation 可避免「关浮层」同时触发其它 Esc 行为
  document.addEventListener('keydown', handleEsc, true)
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleEsc, true)
})

/** 切面板后把内容区滚回顶部（否则从长列表切到短面板会停在中段） */
watch(activeSection, async () => {
  await nextTick()
  if (contentRef.value) contentRef.value.scrollTop = 0
})

/** 侧栏/底栏实际渲染的菜单项：移动端与桌面均为全部 8 项（2026-10-08 去掉「更多」） */
const visibleMenuItems = computed(() => [...SECTIONS])

/** 当前面板的元数据（label/hint）：面板页头直接用，文案与左树/搜索浮层同源，不另写一份 */
const activeMeta = computed(() => SECTIONS.find((s) => s.key === activeSection.value))
/** 首页不显示页头（首页自带账本概览 hero，再加标题会重复） */
const showPageHead = computed(() => activeSection.value !== 'home' && !!activeMeta.value?.hint)

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

// ===== 侧栏底部云同步按钮（恒定显示；未开启时点击打开设置，与个人 / 健康工作台一致） =====
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
  // 未开启时这枚按钮就是「去设置」的入口
  if (!cloudEnabled.value) {
    showSettingsDialog.value = true
    closeMobileMenu()
    return
  }
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

    <!-- 主体：左树 + 右内容区 -->
    <div class="bs-body">
      <nav
        class="bs-menu"
        :class="{ collapsed: sidebarCollapsed, open: mobileMenuOpen }"
        data-testid="bs-menu"
      >
        <!-- 侧栏顶部：工作台切换 + 账本切换（收起按钮上方）+ 摊位名 -->
        <div class="bs-side-top">
          <div class="bs-side-switch" data-testid="bs-page-switcher">
            <WorkbenchSwitcher
              :trigger-icon="settingsStore.businessPageIcon"
              trigger-builtin="store"
              :trigger-label="settingsStore.businessPageDisplayName"
              force-show
            />
          </div>
          <div v-if="store.hasLedgers" class="bs-side-ledger">
            <BusinessLedgerSwitcher />
          </div>
          <span v-if="store.settings.stallName" class="bs-stall-name">{{ store.settings.stallName }}</span>
        </div>

        <div v-if="!gateVisible" class="bs-side-nav">
          <button
            class="tw-btn tw-btn-sm bs-sidebar-toggle"
            data-testid="bs-sidebar-toggle"
            :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
            :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
            @click="toggleSidebar"
          >
            <span class="bs-menu-icon">
              <Icon :name="sidebarCollapsed ? 'chevron-right' : 'chevron-left'" :size="14" />
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
        </div>

        <!-- 侧栏底部恒定两枚按钮：与个人 / 健康工作台同规格 -->
        <div class="bs-side-foot" data-testid="bs-side-foot">
          <button
            class="bs-side-btn wb-sync-btn ui-btn--pill"
            :class="syncStatusClass"
            :title="syncTip"
            :aria-label="syncLabel"
            data-testid="bs-sync-now"
            :disabled="syncBusy || cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing'"
            @click="handleSyncNowClick"
          >
            <span class="bs-side-btn-ic" aria-hidden="true"><Icon name="cloud" :size="14" /></span>
            <span class="bs-side-btn-text">{{ syncLabel }}</span>
          </button>
          <button
            class="bs-side-btn ui-btn--pill"
            title="设置"
            aria-label="设置"
            data-testid="bs-settings"
            @click="showSettingsDialog = true; closeMobileMenu()"
          >
            <span class="bs-side-btn-ic" aria-hidden="true"><Icon name="cog" :size="15" /></span>
            <span class="bs-side-btn-text">设置</span>
          </button>
        </div>
      </nav>

      <!-- 移动端抽屉遮罩：层级低于抽屉（46）、高于内容区 -->
      <div v-if="mobileMenuOpen" class="bs-scrim" data-testid="bs-menu-scrim" @click="closeMobileMenu"></div>

      <!-- 中间内容区（M-20）：移动端为唯一滚动容器 —— 独立 overflow-y:auto，
           overscroll-behavior:contain 阻断滚动到底后的橡皮筋穿透到头部/底栏。
           2026-10-08：已移除左右滑动切面板手势，面板切换统一由底部菜单栏负责 -->
      <main
        ref="contentRef"
        class="bs-content panel-scope"
        data-testid="bs-content"
      >
        <!-- 移动端抽屉入口（桌面隐藏） -->
        <button class="bs-menu-trigger" data-testid="bs-menu-trigger" title="全部菜单" aria-label="打开全部菜单" @click="mobileMenuOpen = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
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
          <!-- 面板页头（与个人工作台 styles/workbench.css 的 .panel-page-head 同一套取值）：
               标题/说明直接取 BIZ_SECTIONS 的 label/hint，不另写文案，避免两处漂移。
               首页不渲染（首页自带账本概览）。 -->
          <div v-if="showPageHead" class="panel-page-head" data-testid="bs-page-head">
            <h2 class="panel-page-title" data-testid="bs-page-title">{{ activeMeta?.label }}</h2>
            <p class="panel-page-sub" data-testid="bs-page-sub">{{ activeMeta?.hint }}</p>
          </div>
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
         桌面端放右下角常驻圆钮；移动端隐藏（抽屉菜单已能直达各面板）。 -->
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
  color: var(--color-text);
}

/* ---------- 侧栏顶部：工作台切换 / 账本切换 / 摊位名 ---------- */
.bs-side-top { flex: none; padding: 10px 8px 2px; }
.bs-side-switch { margin-bottom: 6px; }
.bs-side-switch :deep(.ws-root) { display: flex; width: 100%; }
.bs-side-switch :deep(.ws-trigger) {
  width: 100%; height: 34px; gap: 8px; padding: 0 8px 0 10px;
  border-color: transparent; border-radius: var(--radius-md);
  background-color: var(--color-bg-hover); color: var(--color-text-secondary);
  font-size: var(--fs-caption);
}
.bs-side-switch :deep(.ws-trigger:hover) {
  background-color: var(--color-bg-card); border-color: var(--color-primary); color: var(--color-text);
}
.bs-side-switch :deep(.ws-trigger-label) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.bs-side-ledger { margin-bottom: 6px; }
.bs-side-ledger :deep(.bls-wrap) { width: 100%; }
.bs-side-ledger :deep(.bls-trigger) { width: 100%; max-width: 100%; justify-content: flex-start; }
.bs-stall-name {
  display: block; margin: 0 0 4px; padding: 2px 8px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--fs-caption, 12px); color: var(--color-text-secondary);
}

/* .bs-btn 视觉已统一到全局 .ui-btn（次按钮）；全局类跨组件生效，无需 :deep 透传 */

.bs-body {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
}

.bs-menu {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  background-color: var(--color-bg-card, #ffffff);
  border-right: 1px solid var(--color-border, #e2e8f0);
  transition: width 0.2s ease;
}

/* 中部：菜单可滚动，底部两枚按钮不随菜单滚走 */
.bs-side-nav {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: 2px 8px 8px;
}

/* 侧栏底部恒定两枚：皮肤交全局 .ui-btn--pill，本地只定布局 */
.bs-side-foot {
  flex: none;
  display: flex;
  gap: 6px;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--color-border, #e2e8f0);
}
.bs-side-btn {
  flex: 1 1 0;
  min-width: 0;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.bs-side-btn-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.bs-side-btn-ic { display: none; flex: none; color: var(--color-primary); }

/* 桌面不渲染移动端抽屉的两个入口（窄端媒体查询放在其后，后声明胜出） */
.bs-scrim, .bs-menu-trigger { display: none; }

/* .bs-btn-primary 视觉已统一到全局 .ui-btn--primary */

/* ===== 无账本引导（阻断式） ===== */
.bs-gate {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  overflow-y: auto;
}

.bs-gate-card {
  width: 100%;
  max-width: 460px;
  padding: var(--space-6);
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

.bs-gate-title {
  margin: 0 0 var(--space-2);
  font-size: var(--fs-title, 18px);
  font-weight: 600;
  color: var(--color-text);
}

.bs-gate-desc {
  margin: 0 0 var(--space-4);
  font-size: var(--fs-sm, 13px);
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.bs-gate-form {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 10px;
  margin-bottom: 10px;
}

.bs-gate-field {
  display: grid;
  gap: var(--space-1);
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-secondary);
}

/* 账本创建门的年份/名称输入已改用 el-input（自带边框、聚焦环、暗色），
   .bs-gate-field 为 grid 容器，el-input 作为 grid item 会自动撑满列宽，
   故原先 .bs-gate-input 的视觉样式随之移除。 */

.bs-gate-error {
  margin: 0 0 10px;
  font-size: var(--fs-caption, 12px);
  color: var(--color-error-text);
}

/* ===== 跨年提示条（不阻断） ===== */
.bs-year-banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
  padding: 10px 14px;
  background-color: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  font-size: var(--fs-sm, 13px);
  color: #92400e;
}

/* 侧栏折叠：56px 仅图标；顶部切换 / 账本与底部按钮同步图标化 */
.bs-menu.collapsed { width: 56px; }
.bs-menu.collapsed .bs-side-top { padding: 10px 6px 2px; }
.bs-menu.collapsed .bs-side-switch { margin-bottom: 4px; }
.bs-menu.collapsed .bs-side-switch :deep(.ws-trigger) { height: 32px; padding: 0; justify-content: center; }
.bs-menu.collapsed .bs-side-switch :deep(.ws-trigger-label),
.bs-menu.collapsed .bs-side-switch :deep(.ws-trigger-caret) { display: none; }
.bs-menu.collapsed .bs-side-ledger :deep(.bls-code),
.bs-menu.collapsed .bs-side-ledger :deep(.bls-name) { display: none; }
.bs-menu.collapsed .bs-side-ledger :deep(.bls-trigger) { justify-content: center; padding: 0; }
.bs-menu.collapsed .bs-stall-name { display: none; }
.bs-menu.collapsed .bs-side-nav { padding: 2px 6px 8px; }

/* 收起 / 展开：外观复用教师台 `.tw-btn .tw-btn-sm`，本类只留布局 */
.bs-sidebar-toggle {
  display: flex;
  width: 100%;
  flex-shrink: 0;
  justify-content: flex-start;
  margin-bottom: var(--space-1);
}
.bs-menu.collapsed .bs-sidebar-toggle { justify-content: center; padding: 0; }
.bs-menu.collapsed .bs-menu-label { display: none; }
.bs-menu.collapsed .bs-menu-item { justify-content: center; padding: 10px 0; }
.bs-menu.collapsed .bs-side-foot { padding: 8px 6px 10px; }
.bs-menu.collapsed .bs-side-btn-text { display: none; }
.bs-menu.collapsed .bs-side-btn-ic { display: inline-flex; }

/* 侧栏项取值对齐教师 .tv-nav-item / 个人工作台 .wb-menu-item（13px / --radius-sm /
   主色软底选中 / hover 只变底色），三个工作台的导航观感保持一致 */
.bs-menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 4px);
  background-color: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm, 13px);
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.bs-menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  font-size: var(--fs-md, 15px);
}

.bs-menu-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bs-menu-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
}

.bs-menu-item.active {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary-text);
  font-weight: var(--font-weight-medium, 500);
}

.bs-content {
  flex: 1;
  /* 与教师工作台内容区（.tv-content 16px）、个人工作台（.wb-content 16px）一致；
     移动端由下方 @media 覆盖为 12px + 底栏留白。
     具体值由界面美化「内容区边距」调节（--ui-content-pad，默认 16px）。 */
  padding: var(--ui-content-pad);
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


html.dark .bs-menu {
  background-color: var(--color-bg-card, #1f2937);
  border-right-color: var(--color-border, #374151);
}

/* 收起按钮的暗色由 .tw-btn 的 token 自动翻转，这里不再单独覆盖
   （旧的自写暗色会把文字压成 secondary、hover 改色，与教师台不一致） */
html.dark .bs-menu-item {
  color: var(--color-text-secondary);
}

html.dark .bs-menu-item:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text);
}

html.dark .bs-menu-item.active {
  background-color: var(--dark-accent-surface);
  color: var(--dark-accent-text);
}

html.dark .bs-content {
  background-color: var(--color-bg, #111827);
}

html.dark .bs-stall-name { color: var(--color-text-secondary); }
html.dark .bs-side-foot { border-top-color: var(--color-border, #374151); }

/* ---------- 移动端：与个人 / 健康 / 智能工作台一致的左侧抽屉 ---------- */
@media (max-width: 768px) {
  .bs-shell {
    height: 100vh;
    height: 100dvh;
    height: 100svh;
    min-height: 0;
    overflow: hidden;
  }
  .bs-body { flex: 1; min-height: 0; flex-direction: column; }
  .bs-content {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    padding: 12px 12px calc(24px + env(safe-area-inset-bottom, 0px));
  }
  .bs-content > * { flex: none; }

  .bs-menu {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 46;
    width: min(264px, 82%);
    transform: translateX(-102%);
    transition: transform 220ms ease;
    border-right: 1px solid var(--color-border, #e2e8f0);
    box-shadow: 2px 0 12px var(--color-shadow, rgba(0, 0, 0, 0.12));
  }
  .bs-menu.open { transform: none; }
  .bs-menu.collapsed { width: min(264px, 82%); }

  /* 抽屉内一律展开文字，不沿用桌面折叠态 */
  .bs-side-top, .bs-menu.collapsed .bs-side-top { padding: 10px 8px 2px; }
  .bs-menu.collapsed .bs-side-switch :deep(.ws-trigger) { height: 34px; padding: 0 8px 0 10px; justify-content: flex-start; }
  .bs-menu.collapsed .bs-side-switch :deep(.ws-trigger-label),
  .bs-menu.collapsed .bs-side-switch :deep(.ws-trigger-caret) { display: inline; }
  .bs-menu.collapsed .bs-side-ledger :deep(.bls-code),
  .bs-menu.collapsed .bs-side-ledger :deep(.bls-name) { display: inline; }
  .bs-menu.collapsed .bs-side-ledger :deep(.bls-trigger) { justify-content: flex-start; padding: 0 8px; }
  .bs-menu.collapsed .bs-stall-name { display: block; }
  .bs-side-nav, .bs-menu.collapsed .bs-side-nav { padding: 2px 8px 8px; }
  .bs-sidebar-toggle { display: none; }
  .bs-menu-item, .bs-menu.collapsed .bs-menu-item { min-height: 44px; min-width: 44px; justify-content: flex-start; padding: 9px 10px; }
  .bs-menu.collapsed .bs-menu-label { display: inline; }
  .bs-side-foot, .bs-menu.collapsed .bs-side-foot { padding: 8px 10px 10px; gap: 6px; }
  .bs-side-btn, .bs-menu.collapsed .bs-side-btn { height: 40px; min-height: 40px; padding: 0 6px; gap: 6px; }
  .bs-side-btn-text, .bs-menu.collapsed .bs-side-btn-text { display: inline; }
  .bs-side-btn-ic, .bs-menu.collapsed .bs-side-btn-ic { display: none; }

  .bs-scrim {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 45;
    background: rgba(15, 23, 42, .32);
  }
  .bs-menu-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex: none;
    position: sticky;
    top: 0;
    z-index: 20;
    margin-bottom: 8px;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: var(--radius-sm, 4px);
    background-color: var(--color-bg-card, #fff);
    color: var(--color-text-secondary);
  }
  html.dark .bs-menu {
    border-right-color: var(--color-border, #374151);
    box-shadow: 2px 0 16px var(--color-shadow, rgba(0, 0, 0, 0.4));
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
  gap: var(--space-2);
}
.bs-fab-action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 40px;
  padding: 8px 14px;
  font-size: var(--fs-sm, 13px);
  font-weight: 500;
  color: var(--color-text);
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
  color: var(--color-text);
  background: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

/* 移动端隐藏 FAB（抽屉菜单已能直达各面板，FAB 会遮挡内容） */
@media (max-width: 768px) {
  /* 移动端隐藏「快速记一笔」悬浮按钮（FAB）：抽屉菜单已能直接进入各面板，
     FAB 既遮挡内容又争抢右下角空间。桌面端保持不变。
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
  background-color: var(--ds-warning);
  color: #fff;
  border-color: var(--ds-warning);
}
.wb-sync-btn.wb-sync-btn-error {
  background-color: var(--color-error, #ef4444);
  color: #fff;
  border-color: var(--color-error, #ef4444);
}
</style>
