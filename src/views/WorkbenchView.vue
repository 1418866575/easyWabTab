<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { useCountdownsStore } from '@/stores/countdowns'
import { usePasswordsStore } from '@/stores/passwords'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { useWorkbenchLedgerStore } from '@/stores/workbenchLedger'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useWorkbenchPomodoroStore } from '@/stores/workbenchPomodoro'
import { useWorkbenchDiaryStore } from '@/stores/workbenchDiary'
import { useGenealogyStore } from '@/stores/genealogy'
import { useAppSettingsStore } from '@/stores/settings'
import WorkbenchSwitcher from '@/components/WorkbenchSwitcher.vue'
import { HEALTH_TABS, type HealthModule } from '@/types'
import Icon from '@/components/Icon.vue'
import SkeletonBlock from '@/components/SkeletonBlock.vue'
import type { SpotlightAction } from '@/components/SpotlightOverlay.vue'
import type { SpotlightData } from '@/composables/spotlightCore'
import { useWorkbenchShortcuts } from '@/composables/useWorkbenchShortcuts'
import { MENU_DEFAULT_LABELS, MENU_DESCRIPTIONS } from '@/composables/workbenchMenuCore'
import { captureSnapshot } from '@/composables/useSnapshots'
import { useSitesStore } from '@/stores/sites'
import { useCloudSync } from '@/composables/useCloudSync'
import type { SyncStatus } from '@/composables/useCloudSync'

// ===== 面板懒加载 =====
// 改造前：12 个面板 + 全局搜索浮层 + 设置弹窗全部静态 import，任一时刻只显示其中一个（v-else-if），
// 却要一次性下载全部代码（WorkbenchView chunk 曾达 200kB+，设置弹窗另占 320kB）。
// 改造后：内容区面板走 defineAsyncComponent 按需拉取，切到哪个面板才下哪个 chunk。
//   - delay 用 Vue 默认 200ms：加载快于 200ms 不显示骨架，避免快速切换时闪一下；
//   - loadingComponent 复用首屏同一个 SkeletonBlock，视觉上与初始化骨架连续，不跳版；
//   - timeout 20s 与 ToolboxToolPanel 的既有约定一致。
// ⚠️ 必须配合 prefetchPanel()：模板里 initializing 期间面板分支为 false（不渲染），
//    若不预先 import，chunk 下载会串行排在骨架屏之后，首屏反而变慢。
//    预取只是触发 import，重复调用命中模块缓存，不会重复下载。
// 数据加载不受影响：所有 store 的 load* 都仍在下方 onMounted 的 Promise.all 里，
// 与面板 chunk 的下载并行进行，面板挂载时数据已就绪（不会出现「先空后填」）。
const panelLoaders: Record<string, () => Promise<unknown>> = {}

function lazyPanel(key: string, loader: () => Promise<unknown>) {
  panelLoaders[key] = loader
  return defineAsyncComponent({
    loader: loader as () => Promise<Component>,
    delay: 200,
    timeout: 20000,
    loadingComponent: SkeletonBlock,
    // 本视图未使用 <Suspense>，显式关闭以免异步组件行为随上层变化
    suspensible: false
  })
}

/** 触发某个面板的 chunk 下载（幂等：动态 import 自带模块缓存）。 */
function prefetchPanel(key: string): void {
  void panelLoaders[key]?.()
}

const WorkbenchHome = lazyPanel('home', () => import('@/components/workbench/WorkbenchHome.vue'))
const WorkbenchTodo = lazyPanel('todos', () => import('@/components/workbench/WorkbenchTodo.vue'))
const WorkbenchNotes = lazyPanel('notes', () => import('@/components/workbench/WorkbenchNotes.vue'))
const WorkbenchCountdown = lazyPanel('countdowns', () => import('@/components/workbench/WorkbenchCountdown.vue'))
const WorkbenchPomodoro = lazyPanel('pomodoro', () => import('@/components/workbench/WorkbenchPomodoro.vue'))
const WorkbenchHabits = lazyPanel('habits', () => import('@/components/workbench/WorkbenchHabits.vue'))
const WorkbenchPassword = lazyPanel('passwords', () => import('@/components/workbench/WorkbenchPassword.vue'))
const WorkbenchHealth = lazyPanel('health', () => import('@/components/workbench/WorkbenchHealth.vue'))
const WorkbenchLedger = lazyPanel('ledger', () => import('@/components/workbench/WorkbenchLedger.vue'))
const WorkbenchDiary = lazyPanel('diary', () => import('@/components/workbench/WorkbenchDiary.vue'))
const WorkbenchGenealogy = lazyPanel('genealogy', () => import('@/components/workbench/WorkbenchGenealogy.vue'))
const WorkbenchTrash = lazyPanel('trash', () => import('@/components/workbench/WorkbenchTrash.vue'))

// 两个浮层/弹窗都是 v-if 挂载（点开才渲染），也一并按需加载。
// 它们自带遮罩外壳，加载期不塞骨架（骨架会出现在错误位置），直接短暂空等即可。
const SpotlightOverlay = defineAsyncComponent(() => import('@/components/SpotlightOverlay.vue'))
const AppSettingsDialog = defineAsyncComponent(() => import('@/components/AppSettingsDialog.vue'))

const router = useRouter()
const toast = useToast()
const todosStore = useWorkbenchTodosStore()
const notesStore = useWorkbenchNotesStore()
const countdownsStore = useCountdownsStore()
const passwordsStore = usePasswordsStore()
const healthStore = useWorkbenchHealthStore()
const ledgerStore = useWorkbenchLedgerStore()
const habitsStore = useWorkbenchHabitsStore()
const pomodoroStore = useWorkbenchPomodoroStore()
const diaryStore = useWorkbenchDiaryStore()
const genealogyStore = useGenealogyStore()
const settingsStore = useAppSettingsStore()
const sitesStore = useSitesStore()

// 移动端菜单导航 ref（用于自动滚动到激活项）
const menuNavRef = ref<HTMLElement | null>(null)

// 左侧菜单导航白名单（12 项；菜单项顺序/名称/图标由 workbenchMenuCore 经设置 store 驱动）
// ⚠️ 新增菜单键时必须同步这里：navigateTo 用本白名单收窄，漏了会导致菜单点击无反应。
const SECTION_KEYS = [
  'home',
  'todos',
  'notes',
  'diary',
  'countdowns',
  'pomodoro',
  'habits',
  'passwords',
  'health',
  'ledger',
  'genealogy',
  'trash'
] as const
type SectionKey = (typeof SECTION_KEYS)[number]

// 当前面板写入 URL query：此前 activeSection 只是组件内局部状态，
// 跳到导航站再回来必然回落「首页」，分页/筛选/滚动位置一起丢失，
// 移动端返回体验很差。写入 query 后，刷新、返回、分享链接都停在同一面板。
const route = useRoute()
const activeSection = ref<SectionKey>(
  (SECTION_KEYS as readonly string[]).includes(route.query.section as string)
    ? (route.query.section as SectionKey)
    : 'home'
)
watch(activeSection, (v) => {
  router.replace({ query: { ...route.query, section: v } }).catch(() => {})
})

// 健康管理面板当前激活 tab（点击菜单「健康」不传 tab → 保留上次激活）
const activeHealthTab = ref<HealthModule>('exercise')

// WorkbenchHome 通过 @navigate 请求跳转（emits 声明为 string，这里做白名单收窄）。
// 菜单开关关闭的功能不可进入（白名单 + 开关双重守卫）。
function navigateTo(section: string, tab?: string) {
  if ((SECTION_KEYS as readonly string[]).includes(section) && settingsStore.isWorkbenchMenuEnabled(section)) {
    activeSection.value = section as SectionKey
    if (section === 'health' && tab !== undefined && (HEALTH_TABS as readonly string[]).includes(tab)) {
      activeHealthTab.value = tab as HealthModule
    }
  }
}

// 菜单渲染项：顺序/名称/图标一律来自设置 store（workbenchMenuItems 由 core 解析，home 恒居首）
// 视图禁止内联重算排序/标签（顺序与改名经设置弹窗调整后在此直接生效）
const menuItems = computed(() => settingsStore.workbenchMenuItems)

// 面板页头：教师工作台每个面板都是「18px 标题 + 13px 一行说明」，
// 个人工作台此前没有标题层，进入面板后只剩一排搜索框，层级断掉。
// 标题取菜单名（用户可在设置里改名，改了就跟着变），说明取固定文案（见 MENU_DESCRIPTIONS）。
// 首页不渲染：首页自带问候卡，再加标题会重复。
const activePageTitle = computed(() => {
  const hit = menuItems.value.find((item) => item.key === activeSection.value)
  return hit?.label ?? MENU_DEFAULT_LABELS[activeSection.value] ?? ''
})
const activePageDesc = computed(() => MENU_DESCRIPTIONS[activeSection.value] ?? '')
const showPageHead = computed(() => activeSection.value !== 'home' && activePageDesc.value !== '')

// 菜单开关变化（设置弹窗切换）→ 当前激活区被关闭时回退到首个可见菜单项（home 恒可见）
watch(
  () => menuItems.value.map(item => item.key),
  (keys) => {
    if (keys.length === 0) return
    if (!keys.includes(activeSection.value)) {
      activeSection.value = keys[0] as SectionKey
    }
  }
)

// 移动端菜单：切换激活项时自动滚动到可视区域（横排 overflow-x:auto 容器）
watch(activeSection, async () => {
  await nextTick()
  const nav = menuNavRef.value
  if (!nav) return
  // 仅移动端（横排滚动态）生效；桌面端菜单不滚动
  if (nav.scrollWidth <= nav.clientWidth) return
  const active = nav.querySelector('.wb-menu-item.active') as HTMLElement | null
  if (active) {
    active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }
})

// 侧栏折叠态：undefined（未设置）视为展开；持久化经 settingsStore（IDB store 'settings'）
const sidebarCollapsed = computed(() => settingsStore.workbenchSidebarCollapsed ?? false)

function toggleSidebar() {
  settingsStore.setWorkbenchSidebarCollapsed(!sidebarCollapsed.value)
}

// ===== 全局搜索（右上角按钮 / Alt+K 打开）=====
const spotlightOpen = ref(false)
const showSettingsDialog = ref(false)

// 9 类数据源：密码不解密内容，仅 siteName/url 由 spotlightCore 匹配（core 契约）
const spotlightData = computed<SpotlightData>(() => ({
  // 墓碑不入全局搜索：已删条目被搜到并点开会是空壳
  todos: todosStore.activeTodos,
  notes: notesStore.activeNotes,
  countdowns: countdownsStore.countdowns,
  ledgerEntries: ledgerStore.entries,
  ledgerCategories: ledgerStore.categories,
  passwords: passwordsStore.passwords,
  sites: sitesStore.sites,
  // 新增 3 类同样只喂活跃数据（日记走 activeEntries、家谱走 activeMembers/activeNames，均按墓碑过滤）
  diary: diaryStore.activeEntries,
  habits: habitsStore.habits,
  familyMembers: genealogyStore.activeMembers,
  familyNames: genealogyStore.activeNames
}))

function handleSpotlightSelect(action: SpotlightAction) {
  spotlightOpen.value = false
  if (action.kind === 'navigate') {
    navigateTo(action.section)
  } else if (action.kind === 'password') {
    if (passwordsStore.isUnlocked) {
      navigateTo('passwords')
    } else {
      toast.warning('请先在密码面板解锁密码库')
    }
  } else if (action.kind === 'site') {
    window.open(action.url, '_blank')
  }
}

// 工作台快捷键：Alt+K 打开全局搜索（输入框内跳过）、Ctrl+Alt+1..9 跳转菜单（按设置 store 当前顺序）、
// Esc 关闭全局搜索（幂等）；g 切换个人/销售工作台，[ / ] 在模块间循环切换
useWorkbenchShortcuts({
  spotlightOpen,
  getMenuKeys: () => menuItems.value.map((item) => item.key),
  getCurrentSection: () => activeSection.value,
  onNavigate: (key) => navigateTo(key as SectionKey),
  isSectionEnabled: (key) => settingsStore.isWorkbenchMenuEnabled(key),
  router
})

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// 首屏初始化占位：onMounted 需并发加载 10 个 store，期间内容区全空、用户无从判断是否在加载。
// 骨架屏让「在忙」可见，加载完成后切换为真实面板（加载逻辑本身不变）。
const initializing = ref(true)

onMounted(async () => {
  // 首屏面板的 chunk 立刻开始下载，与下方 store 加载并行（面板要等 initializing=false 才渲染，
  // 不在这里预取就会串行排队，首屏反而比静态 import 更慢）
  prefetchPanel(activeSection.value)
  try {
    await Promise.all([
      todosStore.loadTodos(),
      notesStore.loadNotes(),
      diaryStore.loadDiary(),
      countdownsStore.loadCountdowns(),
      healthStore.loadHealth(),
      ledgerStore.loadLedger(),
      sitesStore.loadSites(),
      pomodoroStore.loadPomodoro(),
      genealogyStore.load()
    ])
    // 习惯面板自管理数据加载（不接入上方 Promise.all，仿 WorkbenchPomodoro onMounted 自加载）
    await habitsStore.loadHabits()
  } finally {
    // 即使某个 store 加载失败也要收起骨架屏，避免卡在占位状态
    initializing.value = false
  }
  // 进入工作台自动快照（fire-and-forget：非阻塞、静默失败，绝不阻塞渲染；同日去重由 captureSnapshot 处理）
  captureSnapshot().catch(() => {})
})

// ===== 右上角云同步按钮（开关显示：cloudSyncEnabled 时在设置按钮左边新增）=====
const cloudSync = useCloudSync()
const syncBusy = ref(false)
const cloudEnabled = computed(() => !!settingsStore.cloudSyncEnabled)
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
  const d = new Date(t)
  return `上次同步：${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}；点击立即同步`
})
async function handleSyncNowClick(): Promise<void> {
  if (syncBusy.value) return
  syncBusy.value = true
  await cloudSync.syncNow()
  syncBusy.value = false
}
</script>

<template>
  <div class="wb-shell">
    <!-- 头部：左 = 返回 + 标题；右 = 全局搜索 + 云同步（开关显示）+ 设置 -->
    <header class="wb-header">
      <div class="wb-header-left">
        <!-- 左上角「工作台切换」命令面板入口：站点图标 + 点击弹出切换面板（Alt+W 唤起，与导航站一致） -->
        <WorkbenchSwitcher
          :trigger-icon="settingsStore.workbenchPageIcon"
          trigger-builtin="toolbox"
          :trigger-label="settingsStore.workbenchPageDisplayName"
          force-show
        />
      </div>
      <div class="wb-header-right">
        <button class="wb-btn" data-testid="wb-spotlight-open" title="全局搜索 (Alt+K)" @click="spotlightOpen = true"><Icon name="search" /> 全局搜索</button>
        <button
          v-if="cloudEnabled"
          class="wb-btn wb-sync-btn"
          :class="syncStatusClass"
          :title="syncTip"
          data-testid="wb-sync-now"
          :disabled="syncBusy || cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing'"
          @click="handleSyncNowClick"
        ><Icon name="cloud" :size="14" /> {{ syncLabel }}</button>
        <button class="wb-btn" title="设置" data-testid="wb-settings" @click="showSettingsDialog = true"><Icon name="cog" :size="15" /> 设置</button>
      </div>
    </header>

    <!-- 主体：左菜单 + 右内容区 -->
    <div class="wb-body">
      <nav ref="menuNavRef" class="wb-menu" :class="{ collapsed: sidebarCollapsed }">
        <button
          class="wb-sidebar-toggle"
          data-testid="wb-sidebar-toggle"
          :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          @click="toggleSidebar"
        >
          <span class="wb-menu-icon">
            <Icon :name="sidebarCollapsed ? 'chevron-right' : 'chevron-left'" />
          </span>
          <span class="wb-menu-label">{{ sidebarCollapsed ? '展开' : '收起' }}</span>
        </button>
        <button
          v-for="item in menuItems"
          :key="item.key"
          class="wb-menu-item"
          :class="{ active: activeSection === item.key }"
          :title="item.label"
          :aria-label="item.label"
          :data-testid="`wb-menu-${item.key}`"
          @mouseenter="prefetchPanel(item.key)"
          @click="navigateTo(item.key)"
        >
          <span class="wb-menu-icon"><Icon :name="item.icon" /></span>
          <span class="wb-menu-label">{{ item.label }}</span>
        </button>
      </nav>

      <main class="wb-content">
        <SkeletonBlock v-if="initializing" :rows="5" label="正在加载工作台数据" />
        <template v-else>
          <!-- 面板页头（对齐教师工作台 .tw-head）：标题 + 一行说明，样式在 styles/workbench.css -->
          <div v-if="showPageHead" class="wb-page-head" data-testid="wb-page-head">
            <h2 class="wb-page-title" data-testid="wb-page-title">{{ activePageTitle }}</h2>
            <p class="wb-page-sub" data-testid="wb-page-sub">{{ activePageDesc }}</p>
          </div>
          <WorkbenchHome v-if="activeSection === 'home'" @navigate="navigateTo" />
          <WorkbenchTodo v-else-if="activeSection === 'todos'" />
          <WorkbenchNotes v-else-if="activeSection === 'notes'" />
          <WorkbenchDiary v-else-if="activeSection === 'diary'" />
          <WorkbenchCountdown v-else-if="activeSection === 'countdowns'" />
          <WorkbenchPomodoro v-else-if="activeSection === 'pomodoro'" />
          <WorkbenchHabits v-else-if="activeSection === 'habits'" />
          <WorkbenchPassword v-else-if="activeSection === 'passwords'" />
          <WorkbenchHealth v-else-if="activeSection === 'health'" :active-tab="activeHealthTab" @change="activeHealthTab = $event" />
          <WorkbenchLedger v-else-if="activeSection === 'ledger'" />
          <WorkbenchGenealogy v-else-if="activeSection === 'genealogy'" />
          <WorkbenchTrash v-else-if="activeSection === 'trash'" />
        </template>
      </main>
    </div>

    <SpotlightOverlay
      v-if="spotlightOpen"
      :data="spotlightData"
      @select="handleSpotlightSelect"
      @close="spotlightOpen = false"
    />
    <AppSettingsDialog
      v-if="showSettingsDialog"
      source="workbench"
      @close="showSettingsDialog = false"
    />
  </div>
</template>

<style scoped>
/* 亮色基础样式（沿用 --color-* 全局 token） */
.wb-shell {
  height: 100dvh;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg, #f8fafc);
  color: var(--color-text, #1e293b);
}

.wb-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  /* 左右留白对齐教师顶栏 .tv-topbar（12px 16px），避免顶部与内容区的对齐线错开 */
  padding: 12px 16px;
  background-color: var(--color-bg-card, #ffffff);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.wb-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.wb-header-left h1 {
  font-size: var(--font-size-2xl, 20px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text, #1e293b);
  white-space: nowrap;
}

.wb-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* .wb-btn 视觉已统一到全局 .ui-btn（次按钮） */

.wb-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.wb-menu {
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

/* 侧栏折叠：56px 仅图标（label 隐藏、图标居中），展开宽度 200px 平滑过渡 */
.wb-menu.collapsed {
  width: 56px;
}

.wb-sidebar-toggle {
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

.wb-sidebar-toggle:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
}

.wb-menu.collapsed .wb-sidebar-toggle {
  justify-content: center;
  padding: 10px 0;
}

.wb-menu.collapsed .wb-menu-label {
  display: none;
}

.wb-menu.collapsed .wb-menu-item {
  justify-content: center;
  padding: 10px 0;
}

/* 侧栏项取值对齐教师工作台 .tv-nav-item（13px / --radius-sm / 主色软底选中 / hover 只变底色）：
   此前是 14px + 8px 圆角 + hover 变主色文字，两个工作台并排看像两套导航。 */
.wb-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 4px);
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-duration, 220ms) var(--motion-ease, ease),
    color var(--motion-duration, 220ms) var(--motion-ease, ease);
}

/* 统一微交互：按压缩放（菜单项不做抬升，避免侧栏/底部 Tab 割裂） */
.wb-menu-item:active {
  transform: var(--motion-press, scale(0.97));
}

.wb-menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 溢出省略作用于内部 label span（对按钮本身设 ellipsis 不会截断子 span 文本）：
   min-width:0 允许 flex 项收缩，配合 overflow/text-overflow/nowrap 生效 */
.wb-menu-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* hover 只变底色（教师 .tv-nav-item:hover 不变文字色），选中态才上主色 */
.wb-menu-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
}

.wb-menu-item.active {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-weight: var(--font-weight-medium, 500);
}

.wb-content {
  flex: 1;
  /* 与教师工作台内容区（.tv-content，16px）一致；此前 20px 使得同样的卡片在两处
     留白不同，切换工作台时疏密感不一致。 */
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg, #f8fafc);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}

/* 暗色模式覆盖（模式参考 dark.css:4-44） */
html.dark .wb-shell {
  background-color: var(--color-bg, #111827);
}

html.dark .wb-header {
  background-color: var(--color-bg-card, #1f2937);
  border-bottom-color: var(--color-border, #374151);
}

html.dark .wb-header-left h1 {
  color: var(--color-text, #f9fafb);
}

html.dark .wb-btn {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .wb-btn:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

html.dark .wb-menu {
  background-color: var(--color-bg-card, #1f2937);
  border-right-color: var(--color-border, #374151);
}

html.dark .wb-sidebar-toggle {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .wb-sidebar-toggle:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #f9fafb);
}

html.dark .wb-menu-item {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .wb-menu-item:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #f9fafb);
}

html.dark .wb-menu-item.active {
  background-color: #1e3a5f;
  color: #60a5fa;
}

html.dark .wb-content {
  background-color: var(--color-bg, #111827);
}

/* 移动端底部 Tab Bar 顶边框（原为侧栏右/底边框），暗色下需覆盖 */
@media (max-width: 768px) {
  html.dark .wb-menu {
    border-top-color: var(--color-border, #374151);
  }

  html.dark .wb-menu {
    box-shadow: 0 -2px 12px var(--color-shadow, rgba(0, 0, 0, 0.4));
  }
}

/* 桌面一屏契约：面板根钉满内容区（flex-stretch，不用百分比高度）。
   溢出兜底：用 overflow-x:hidden; overflow-y:auto 取代原 overflow:hidden——面板若正确自管理
   内部滚动则恰好填满内容区、不会溢出，此规则不生效；若某面板内部滚动链（缺 min-height:0 /
   无 scroll 容器）失效，内容超出部分改为由内容区整体垂直滚动兜底，避免被裁切而「无法下滑查看」
   （R9）。横向仍裁剪，避免 overflow-y:auto 触发 overflow-x 计算为 auto 而意外出现横向滚动条。 */
@media (min-width: 769px) {
  /* 页面级滚动：.wb-content 是唯一滚动容器，横向裁剪、纵向由内容区统一滚动 */
  .wb-content { overflow-x: hidden; overflow-y: auto; }
  /* 面板随内容自然撑开（原 flex:1 把面板钉满一屏，迫使各面板自建内部滚动条） */
  .wb-content > * { flex: 0 0 auto; }
}

@media (max-width: 768px) {
  .wb-content { overflow-y: auto; }
  .wb-content > * { flex: none; }

  .wb-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .wb-body {
    flex-direction: column;
  }

  /* 侧栏降级为底部固定 Tab Bar：脱离文档流、常驻拇指区，保留全部菜单项横向滚动 */
  .wb-menu {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    width: 100%;
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

  /* 移动端横排布局：忽略折叠态（始终全宽 + 显示 label），隐藏折叠按钮 */
  .wb-menu.collapsed {
    width: 100%;
  }

  .wb-menu.collapsed .wb-menu-label {
    display: inline;
  }

  .wb-menu.collapsed .wb-menu-item {
    justify-content: flex-start;
    padding: 10px 12px;
  }

  .wb-sidebar-toggle {
    display: none;
  }

  .wb-menu-item {
    flex: 0 0 auto; /* 不收缩：名称完整显示，超出由底部 Tab Bar 横向滚动 */
    white-space: nowrap;
    scroll-snap-align: start;
  }

  /* 移动端取消 label 省略号截断，确保菜单名称完整呈现（仿学生工作台图标+文字） */
  .wb-menu-label {
    overflow: visible;
    text-overflow: clip;
    white-space: nowrap;
  }

  /* 移动端触控目标 ≥44px（侧栏菜单项 / 头部按钮）：
     原为 40px，低于 iOS/Android 44px 触控下限，误触率偏高 */
  .wb-menu-item {
    min-height: 44px;
    min-width: 44px;
  }

  .wb-btn {
    min-height: 44px;
  }

  /* 窄屏间距压缩：内容区内边距收窄；底部留白需同时避让两样固定元素：
   *   ① 底部 Tab Bar（.wb-menu，移动端降级为 fixed bottom:0，约 56px + 安全区）
   *   ② 悬浮新增 FAB（移动端 bottom:64px、高 48px → 顶端距视口底 112px）
   * 原值只算了 ①（64px），实测习惯面板的日历日期格会被 FAB 压住、点不动
   * （qa-workbench-mobile-overlap.mjs S2）。按 ② 的 112px + 8px 间隔取 120px。
   * 无 FAB 的面板（首页/日记/番茄钟/回收站）只是滚到底多一段空白，不影响操作。 */
  .wb-content {
    padding: 12px 12px calc(120px + env(safe-area-inset-bottom, 0px));
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
  background-color: var(--color-warning, #f59e0b);
  color: #fff;
  border-color: var(--color-warning, #f59e0b);
}
.wb-sync-btn.wb-sync-btn-error {
  background-color: var(--color-error, #ef4444);
  color: #fff;
  border-color: var(--color-error, #ef4444);
}
</style>
