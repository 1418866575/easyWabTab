<script setup lang="ts">
// 销售记账独立页面（摆摊进销存）：布局复刻 WorkbenchView（左树 + 右内容，桌面一屏钉满、移动端横排菜单）
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { useAppSettingsStore } from '@/stores/settings'
import BusinessHome from '@/components/business/BusinessHome.vue'
import BusinessProducts from '@/components/business/BusinessProducts.vue'
import BusinessPurchases from '@/components/business/BusinessPurchases.vue'
import BusinessDaily from '@/components/business/BusinessDaily.vue'
import BusinessExpenses from '@/components/business/BusinessExpenses.vue'
import BusinessInventory from '@/components/business/BusinessInventory.vue'
import BusinessStats from '@/components/business/BusinessStats.vue'
import BusinessReconcile from '@/components/business/BusinessReconcile.vue'
import BusinessLedgerSwitcher from '@/components/business/BusinessLedgerSwitcher.vue'
import AppSettingsDialog from '@/components/AppSettingsDialog.vue'
import PageSwitcher from '@/components/PageSwitcher.vue'
import Icon from '@/components/Icon.vue'
import SkeletonBlock from '@/components/SkeletonBlock.vue'
import { useCloudSync } from '@/composables/useCloudSync'
import type { SyncStatus } from '@/composables/useCloudSync'
import { useWorkbenchShortcuts } from '@/composables/useWorkbenchShortcuts'
import { currentYear, ledgerDefaultName } from '@/composables/businessCore'

const router = useRouter()
const store = useWorkbenchBusinessStore()
const settingsStore = useAppSettingsStore()

// 左树 8 项（固定顺序，SVG 图标经 Icon 组件渲染，不接工作台菜单开关系统）
// 菜单文案：purchases = 库存（进货/入库记录）、inventory = 库存预警（低库存/滞销/久存预警）
const SECTIONS = [
  { key: 'home', icon: 'home', label: '首页' },
  { key: 'products', icon: 'products', label: '商品' },
  { key: 'expenses', icon: 'expenses', label: '支出' },
  { key: 'purchases', icon: 'purchases', label: '库存' },
  { key: 'daily', icon: 'daily', label: '销售' },
  { key: 'inventory', icon: 'inventory', label: '库存预警' },
  { key: 'stats', icon: 'stats', label: '统计' },
  { key: 'reconcile', icon: 'ledger', label: '对账' }
] as const
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

function selectSection(key: SectionKey): void {
  activeSection.value = key
  // P0-2：持久化当前模块，刷新后保持所在页
  settingsStore.setBusinessActiveSection(key)
}

function navigateTo(section: string, filter?: string): void {
  if ((SECTIONS as readonly { key: string }[]).some(s => s.key === section)) {
    selectSection(section as SectionKey)
    // 设置过滤状态
    if (section === 'purchases') {
      purchaseFilter.value = filter
    } else if (section === 'products') {
      productFilter.value = filter
    }
  }
}

const showSettingsDialog = ref(false)

// 快捷键：复用工作台通用快捷键（g 切换个人/销售工作台、[ ] 模块间循环；销售台无全局搜索，spotlight 恒 false）
const spotlightOpen = ref(false)
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
  if (!r.ok && r.reason === 'duplicate') store.switchLedgerByYear(thisYear)
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
    <header class="bs-header">
      <div class="bs-header-left">
        <PageSwitcher current="business" />
        <span v-if="store.settings.stallName" class="bs-stall-name">{{ store.settings.stallName }}</span>
      </div>
      <div class="bs-header-right">
        <!-- 账本切换（常驻入口）：有账本时才展示，无账本时由引导页承接 -->
        <BusinessLedgerSwitcher v-if="store.hasLedgers" />
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
      <nav v-if="!gateVisible" class="bs-menu" :class="{ collapsed: sidebarCollapsed }">
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
          v-for="item in SECTIONS"
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

      <main class="bs-content">
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
          <BusinessHome v-if="activeSection === 'home'" @navigate="navigateTo" />
          <BusinessProducts v-else-if="activeSection === 'products'" :highlight-id="productFilter" @navigate="navigateTo" />
          <BusinessPurchases v-else-if="activeSection === 'purchases'" :product-filter="purchaseFilter" @navigate="navigateTo" />
          <BusinessDaily v-else-if="activeSection === 'daily'" @navigate="navigateTo" />
          <BusinessExpenses
            v-else-if="activeSection === 'expenses'"
          />
          <BusinessInventory v-else-if="activeSection === 'inventory'" @navigate="navigateTo" />
          <BusinessStats v-else-if="activeSection === 'stats'" />
          <BusinessReconcile v-else-if="activeSection === 'reconcile'" />
        </template>
      </main>
    </div>

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
  .bs-content {
    overflow-y: auto;
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

/* 移动端底部 Tab Bar 暗色兜底：边框改顶部 + 加深阴影（与 WorkbenchView 一致） */
@media (max-width: 768px) {
  html.dark .bs-menu {
    border-top-color: var(--color-border, #374151);
    box-shadow: 0 -2px 12px var(--color-shadow, rgba(0, 0, 0, 0.4));
  }
}

/* 桌面一屏契约：面板根钉满内容区（复刻 WorkbenchView T3 shell） */
@media (min-width: 769px) {
  .bs-content {
    overflow: hidden;
  }

  .bs-content > * {
    flex: 1;
    min-height: 0;
  }
}

/* ===== 右上角云同步按钮（头部设置按钮左侧）状态视觉 ===== */
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
