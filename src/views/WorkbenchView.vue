<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { useCountdownsStore } from '@/stores/countdowns'
import { usePasswordsStore } from '@/stores/passwords'
import { useWorkbenchLedgerStore } from '@/stores/workbenchLedger'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useWorkbenchPomodoroStore } from '@/stores/workbenchPomodoro'
import { useWorkbenchDiaryStore } from '@/stores/workbenchDiary'
import { useWorkbenchMessagesStore } from '@/stores/workbenchMessages'
import { useGenealogyStore } from '@/stores/genealogy'
import { useAppSettingsStore } from '@/stores/settings'
import WorkbenchSwitcher from '@/components/WorkbenchSwitcher.vue'
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
const WorkbenchLedger = lazyPanel('ledger', () => import('@/components/workbench/WorkbenchLedger.vue'))
const WorkbenchDiary = lazyPanel('diary', () => import('@/components/workbench/WorkbenchDiary.vue'))
const WorkbenchMessages = lazyPanel('messages', () => import('@/components/workbench/WorkbenchMessages.vue'))
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
const ledgerStore = useWorkbenchLedgerStore()
const habitsStore = useWorkbenchHabitsStore()
const pomodoroStore = useWorkbenchPomodoroStore()
const diaryStore = useWorkbenchDiaryStore()
const messagesStore = useWorkbenchMessagesStore()
const genealogyStore = useGenealogyStore()
const settingsStore = useAppSettingsStore()
const sitesStore = useSitesStore()

// 移动端菜单导航 ref（用于自动滚动到激活项）
const menuNavRef = ref<HTMLElement | null>(null)

// 左侧菜单导航白名单（12 项；健康已独立为 /health 工作台）
// ⚠️ 新增菜单键时必须同步这里：navigateTo 用本白名单收窄，漏了会导致菜单点击无反应。
const SECTION_KEYS = [
  'home',
  'todos',
  'notes',
  'diary',
  'messages',
  'countdowns',
  'pomodoro',
  'habits',
  'passwords',
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
// 健康已独立为 /health 工作台：旧书签 ?section=health&tab=... 保持可用
if (route.query.section === 'health') {
  void router.replace({ path: '/health', query: { tab: route.query.tab } })
}

// 当前面板写入 URL，刷新/分享后仍停在同一面板。
watch(activeSection, (sec) => {
  router.replace({ query: { ...route.query, section: sec } }).catch(() => {})
})

// ===== 分组菜单（原型：日常 / 专注 / 资产；顺序与改名仍由设置 store 驱动）=====
// 分组只做归类，不改变设置里配置的相对顺序；未在分组表里的新菜单项落到「其它」，
// 这样以后新增面板忘了登记分组也不会从侧栏消失。
const MENU_GROUP_DEFS = [
  { label: '日常', keys: ['home', 'todos', 'notes', 'diary', 'messages', 'countdowns'] },
  { label: '专注', keys: ['pomodoro', 'habits'] },
  { label: '资产', keys: ['passwords', 'ledger', 'genealogy', 'trash'] }
] as const
const menuGroups = computed(() => {
  const groups: { label: string; items: typeof menuItems.value }[] = MENU_GROUP_DEFS.map(g => ({
    label: g.label,
    items: menuItems.value.filter(i => (g.keys as readonly string[]).includes(i.key))
  }))
  const grouped = new Set<string>(MENU_GROUP_DEFS.flatMap(g => g.keys as readonly string[]))
  const rest = menuItems.value.filter(i => !grouped.has(i.key))
  if (rest.length) groups.push({ label: '其它', items: rest })
  return groups.filter(g => g.items.length > 0)
})

// 移动端左侧抽屉（原型：不退回底部 Tab Bar，页头菜单按钮唤出完整 12 项菜单）
const mobileMenuOpen = ref(false)
function closeMobileMenu(): void { mobileMenuOpen.value = false }

// WorkbenchHome 通过 @navigate 请求跳转（emits 声明为 string，这里做白名单收窄）。
// 菜单开关关闭的功能不可进入（白名单 + 开关双重守卫）。
function navigateTo(section: string, _tab?: string) {
  if ((SECTION_KEYS as readonly string[]).includes(section) && settingsStore.isWorkbenchMenuEnabled(section)) {
    activeSection.value = section as SectionKey
    // 抽屉里点菜单后自动收起，否则选中项被遮罩挡着看不到
    closeMobileMenu()
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

// 面板切换改 KeepAlive + 单节点 <component :is>：切走再回来保留筛选 / 分页 / 滚动 / 子 tab 状态。
// ⚠️ KeepAlive 只接受单个子节点，模板里不能放并列 v-if 分支，也不能在它内部写注释（注释也算一个子节点）。
const PANEL_BY_KEY: Record<SectionKey, Component> = {
  home: WorkbenchHome,
  todos: WorkbenchTodo,
  notes: WorkbenchNotes,
  diary: WorkbenchDiary,
  messages: WorkbenchMessages,
  countdowns: WorkbenchCountdown,
  pomodoro: WorkbenchPomodoro,
  habits: WorkbenchHabits,
  passwords: WorkbenchPassword,
  ledger: WorkbenchLedger,
  genealogy: WorkbenchGenealogy,
  trash: WorkbenchTrash
}
const activePanel = computed<Component>(() => PANEL_BY_KEY[activeSection.value])
// 只给真正声明了该 emit 的面板挂监听：若把 @change 无差别透传给其它面板，
// 它会作为原生 change 事件落在根 DOM 上，输入框一改就把 tab 写成 Event 对象。
const activePanelBindings = computed<Record<string, unknown>>(() => ({
  ...(activeSection.value === 'home' ? { onNavigate: navigateTo } : {})
}))

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

// 侧栏折叠态：undefined（未设置）视为展开；持久化经 settingsStore（IDB store 'settings'）。
// 两个入口共用同一份状态：「日常」分组标题右端的侧边栏按钮，以及设置弹窗里的折叠开关。
const sidebarCollapsed = computed(() => settingsStore.workbenchSidebarCollapsed ?? false)
function toggleSidebar(): void {
  settingsStore.setWorkbenchSidebarCollapsed(!sidebarCollapsed.value)
}

// ===== 全局搜索（侧栏顶部搜索框 / Alt+K 打开）=====
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

// 首屏初始化占位：onMounted 需并发加载 11 个 store，期间内容区全空、用户无从判断是否在加载。
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
      messagesStore.loadMessages(),
      countdownsStore.loadCountdowns(),
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
  if (!cloudEnabled.value) return '云同步未开启'
  switch (cloudSync.status.value as SyncStatus) {
    case 'pulling': return '拉取中…'
    case 'pushing': return '推送中…'
    case 'conflict': return '处理冲突'
    case 'error': return '同步失败'
    default: return '云同步 · 已同步'
  }
})
// 底部按钮只显示「云同步 / 设置」纯文字，状态不再占副行：
// 同步态改由 :title（完整时刻）+ syncStatusClass 的底色 + :aria-label（syncLabel）承载。
const syncTip = computed((): string => {
  if (!cloudEnabled.value) return '云同步未开启；点击打开设置'
  const t = cloudSync.lastSyncAt.value
  if (!t) return '未同步过；点击立即同步'
  const d = new Date(t)
  return `上次同步：${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}；点击立即同步`
})
async function handleSyncNowClick(): Promise<void> {
  // 未开启时这枚按钮就是「去设置」的入口，保证侧栏底部恒定只有两枚按钮
  if (!cloudEnabled.value) {
    closeMobileMenu()
    showSettingsDialog.value = true
    return
  }
  if (syncBusy.value) return
  syncBusy.value = true
  try {
    await cloudSync.syncNow()
  } finally {
    syncBusy.value = false
  }
}

// ===== 工作台切换入口 =====
// 入口已移到左侧栏 `.wb-side-top` 搜索框上方（参考销售记账左上角按钮），
// Alt+W 键盘监听仍在 WorkbenchSwitcher 内部；下拉由组件 Teleport 到 body，不受侧栏裁剪。
</script>

<template>
  <div class="wb-shell wb-scope">
    <!-- 主体：左 = 全量菜单（页面切换 / 搜索 / 分组导航 / 底部两枚按钮），右 = 内容区。无全局顶栏。 -->
    <div class="wb-body">
      <nav ref="menuNavRef" class="wb-menu" :class="{ collapsed: sidebarCollapsed, open: mobileMenuOpen }">
        <div class="wb-side-top">
          <!-- 侧栏第一项：切换其它页面。与销售记账左上角同款 WorkbenchSwitcher，
               点击或 Alt+W 唤起下拉；组件自带全局键盘监听，必须保持挂载。 -->
          <div class="wb-side-switch" data-testid="wb-page-switcher">
            <WorkbenchSwitcher
              :trigger-icon="settingsStore.workbenchPageIcon"
              trigger-builtin="toolbox"
              :trigger-label="settingsStore.workbenchPageDisplayName"
              force-show
            />
          </div>
          <button class="wb-search" data-testid="wb-spotlight-open" title="全局搜索 (Alt+K)" @click="spotlightOpen = true; closeMobileMenu()">
            <span class="wb-search-ic"><Icon name="search" :size="14" /></span>
            <span class="wb-search-text">搜索全部…</span>
            <kbd class="wb-search-kbd">Alt+K</kbd>
          </button>
        </div>

        <div class="wb-side-nav">
          <template v-for="group in menuGroups" :key="group.label">
            <div class="wb-group-label" :class="{ 'is-first': group.label === '日常' }">
              <span class="wb-group-label-text">{{ group.label }}</span>
              <!-- 「日常」分组右上角：侧边栏收起/展开按钮。放这里既不占搜索行，
                   也不破坏底部「云同步 + 设置」两枚按钮的约定；折叠态仍保留为纯图标入口。 -->
              <button
                v-if="group.label === '日常'"
                class="wb-group-collapse"
                data-testid="wb-sidebar-toggle"
                :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
                :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
                @click="toggleSidebar"
              >
                <Icon :name="sidebarCollapsed ? 'chevron-right' : 'chevron-left'" :size="14" />
              </button>
            </div>
            <button
              v-for="item in group.items"
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
          </template>
        </div>

        <!-- 侧栏底部恒定两枚按钮，同一行各占一半，只显示「云同步」「设置」纯文字。
             图标仅在 60px 折叠态出现（那时文字放不下），状态靠 title / aria-label / 底色表达。 -->
        <div class="wb-side-foot" data-testid="wb-side-foot">
          <button
            class="wb-side-btn wb-sync-btn ui-btn--pill"
            :class="syncStatusClass"
            :title="syncTip"
            :aria-label="syncLabel"
            data-testid="wb-sync-now"
            :disabled="cloudEnabled && (syncBusy || cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing')"
            @click="handleSyncNowClick"
          >
            <span class="wb-side-btn-ic" aria-hidden="true"><Icon name="cloud" :size="14" /></span>
            <span class="wb-side-btn-text">云同步</span>
          </button>
          <button
            class="wb-side-btn ui-btn--pill"
            title="设置"
            aria-label="设置"
            data-testid="wb-settings"
            @click="showSettingsDialog = true; closeMobileMenu()"
          >
            <span class="wb-side-btn-ic" aria-hidden="true"><Icon name="cog" :size="15" /></span>
            <span class="wb-side-btn-text">设置</span>
          </button>
        </div>
      </nav>

      <!-- 移动端抽屉遮罩：层级低于侧栏、高于内容区 -->
      <div v-if="mobileMenuOpen" class="wb-scrim" data-testid="wb-menu-scrim" @click="closeMobileMenu"></div>

      <main class="wb-content panel-scope">
        <button class="wb-menu-trigger" data-testid="wb-menu-trigger" title="全部菜单" aria-label="打开全部菜单" @click="mobileMenuOpen = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <SkeletonBlock v-if="initializing" :rows="5" label="正在加载工作台数据" />
        <template v-else>
          <!-- 面板页头：样式在共享 styles/workbench.css。panel-scope 个人台与销售台共用，
               本视图只在 .wb-scope 下覆写变量，绝不改共享层。 -->
          <div v-if="showPageHead" class="panel-page-head" data-testid="wb-page-head">
            <h2 class="panel-page-title" data-testid="wb-page-title">{{ activePageTitle }}</h2>
            <p class="panel-page-sub" data-testid="wb-page-sub">{{ activePageDesc }}</p>
          </div>
          <KeepAlive :max="12">
            <component :is="activePanel" v-bind="activePanelBindings" />
          </KeepAlive>
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
  color: var(--color-text);
}

/* ===== 布局隔离出口 =====
   个人台只覆写这些变量；共享 styles/workbench.css 的 .panel-scope 规则一字未改，
   销售台（.bs-content.panel-scope）计算样式不受本视图影响。 */
.wb-scope {
  --wb-sidebar-w: 200px;
  --wb-sidebar-w-collapsed: 60px;
  --wb-content-pad: var(--ui-content-pad, 16px);
  --wb-card-min: 180px;
  --wb-bottom-safe: 0px;
}

/* 侧栏第一项「切换其它页面」：复用 WorkbenchSwitcher（与销售记账左上角同一组件），
   这里只在 .wb-side-switch 作用域内把它压成与搜索行同宽、同槽位的内嵌行，
   不写第二套触发器外观；下拉仍由组件 Teleport 到 body。 */
.wb-side-switch { margin-bottom: 6px; }
.wb-side-switch :deep(.ws-root) { display: flex; width: 100%; }
.wb-side-switch :deep(.ws-trigger) {
  width: 100%;
  height: 34px;
  gap: 8px;
  padding: 0 8px 0 10px;
  border-color: transparent;
  border-radius: var(--radius-md);
  background-color: var(--color-bg-hover);
  color: var(--color-text-secondary);
  font-size: var(--fs-caption);
}
.wb-side-switch :deep(.ws-trigger:hover) {
  background-color: var(--color-bg-card);
  border-color: var(--color-primary);
  color: var(--color-text);
}
.wb-side-switch :deep(.ws-trigger-label) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wb-body {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
}

.wb-menu {
  width: var(--wb-sidebar-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  background-color: var(--color-bg-card, #ffffff);
  border-right: 1px solid var(--color-border, #e2e8f0);
  transition: width 0.2s ease;
}

/* 顶部：第一项是「切换其它页面」，紧随其下是搜索框（无品牌区）。
   两行与下方菜单做成「一个整体」：去掉把两者切开的分隔线，都改成浅底内嵌行
   （无边框、8px 圆角、左右内边距与菜单项对齐同一 8px 槽），不再是浮在栏上方的一颗胶囊。 */
.wb-side-top { flex: none; padding: 10px 8px 2px; }
.wb-search {
  display: flex; align-items: center; gap: 8px; width: 100%; height: 34px;
  padding: 0 8px 0 10px; border: 1px solid transparent;
  border-radius: var(--radius-md, 8px); background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-secondary); font-size: var(--fs-caption); text-align: left; cursor: pointer;
  transition: background-color var(--motion-duration, 220ms) ease, border-color var(--motion-duration, 220ms) ease, color var(--motion-duration, 220ms) ease;
}
.wb-search:hover {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-bg-card, #fff);
  color: var(--color-text);
}
.wb-search-ic { display: inline-flex; flex: none; }
.wb-search-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-search-kbd {
  flex: none; font: 10px/1.6 inherit; padding: 0 4px;
  border: 1px solid var(--color-border, #e2e8f0); border-radius: 5px;
  background-color: var(--color-bg-card, #fff); color: var(--color-text-muted, #94a3b8);
}

/* 中部：分组全量菜单（12 项，顺序/名称仍由设置 store 驱动） */
.wb-side-nav { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; padding: 2px 8px 8px; }
/* 分组标题：字号 11px → 13px、加粗并用正文字色，作为分段的锚点而不是灰色小注脚 */
.wb-group-label {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  min-height: 26px;
  padding: 12px 8px 4px 10px; font-size: var(--fs-sm); font-weight: 600; letter-spacing: .02em;
  color: var(--color-text-secondary, #475569); white-space: nowrap;
}
.wb-group-label-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* 「日常」标题行右端的侧边栏按钮：轻量图标钮，不抢菜单项的视觉权重 */
.wb-group-collapse {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; flex: none;
  padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  transition: background-color var(--motion-duration, 220ms) ease, color var(--motion-duration, 220ms) ease;
}
.wb-group-collapse:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary-text, #1d4ed8);
}
.wb-group-collapse:active { transform: var(--motion-press, scale(0.97)); }

/* 底部：恒定只有「云同步 + 设置」两枚按钮，同一行各占 50%，只显示纯文字。
   状态不占文案：同步态靠 syncStatusClass 底色 + :title + :aria-label 表达。 */
.wb-side-foot {
  flex: none; display: flex; flex-direction: row; gap: 6px;
  padding: 8px 10px 10px; border-top: 1px solid var(--color-border, #e2e8f0);
}
.wb-side-btn {
  flex: 1 1 0; min-width: 0; height: 32px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 0 6px; border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px); background-color: var(--color-bg-hover, #f8fafc);
  color: var(--color-text-secondary); font-size: var(--fs-caption); white-space: nowrap; cursor: pointer;
}
.wb-side-btn:hover { background-color: var(--color-bg-hover, #f1f5f9); color: var(--color-text); }
.wb-side-btn-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* 展开态只显示文字；图标留给 60px 折叠态 */
.wb-side-btn-ic { display: none; flex: none; color: var(--color-primary, #3b82f6); }

/* 折叠态：60px 图标条；搜索收成圆形、分组标签变分隔线、底部按钮只留图标 */
.wb-menu.collapsed { width: var(--wb-sidebar-w-collapsed); }
.wb-menu.collapsed .wb-side-top { padding: 8px; }
.wb-menu.collapsed .wb-side-switch { margin-bottom: 4px; }
.wb-menu.collapsed .wb-side-switch :deep(.ws-trigger) { height: 32px; padding: 0; justify-content: center; }
.wb-menu.collapsed .wb-side-switch :deep(.ws-trigger-label),
.wb-menu.collapsed .wb-side-switch :deep(.ws-trigger-caret) { display: none; }
.wb-menu.collapsed .wb-search { height: 32px; padding: 0; justify-content: center; }
.wb-menu.collapsed .wb-search-text, .wb-menu.collapsed .wb-search-kbd { display: none; }
.wb-menu.collapsed .wb-side-nav { padding: 8px 6px; }
.wb-menu.collapsed .wb-group-label { min-height: 0; font-size: calc(var(--fs-caption) * 0); padding: 6px 0 2px; margin: 4px 3px 0; border-top: 1px solid var(--color-border, #e2e8f0); justify-content: center; }
.wb-menu.collapsed .wb-group-label-text { display: none; }
/* 折叠态：分组标题缩成分隔线，但「日常」这一行仍保留可点的展开图标 */
.wb-menu.collapsed .wb-group-label.is-first { min-height: 30px; }
.wb-menu.collapsed .wb-group-collapse { width: 26px; height: 26px; }
.wb-menu.collapsed .wb-menu-item { justify-content: center; padding: 9px 0; }
.wb-menu.collapsed .wb-menu-label { display: none; }
/* 折叠态 60px：仍是一行两枚，但文字放不下 → 只留图标，两枚各占一半 */
.wb-menu.collapsed .wb-side-foot { padding: 8px; gap: 4px; }
.wb-menu.collapsed .wb-side-btn { padding: 0; gap: 0; }
.wb-menu.collapsed .wb-side-btn-text { display: none; }
.wb-menu.collapsed .wb-side-btn-ic { display: inline-flex; }

/* 移动端抽屉遮罩 / 页头菜单按钮，桌面不渲染 */
.wb-scrim { display: none; }
.wb-menu-trigger { display: none; }

/* 侧栏项取值对齐教师工作台 .tv-nav-item（13px / --radius-sm / 主色软底选中 / hover 只变底色）：
   此前是 14px + 8px 圆角 + hover 变主色文字，两个工作台并排看像两套导航。 */
.wb-menu-item {
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
  color: var(--color-primary-text);
  font-weight: var(--font-weight-medium, 500);
}

.wb-content {
  flex: 1;
  /* 与教师工作台内容区（.tv-content，16px）一致；此前 20px 使得同样的卡片在两处
     留白不同，切换工作台时疏密感不一致。
     具体值由界面美化「内容区边距」调节（--ui-content-pad，默认 16px）。 */
  padding: var(--ui-content-pad);
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

html.dark .wb-side-top, html.dark .wb-side-foot {
  border-color: var(--color-border, #374151);
}
html.dark .wb-search {
  background-color: var(--color-bg-hover, #182233);
  border-color: var(--color-border, #374151);
  color: var(--color-text-secondary);
}
html.dark .wb-search-kbd { background-color: var(--color-bg-card, #1f2937); border-color: var(--color-border, #374151); }
html.dark .wb-side-switch :deep(.ws-trigger) { border-color: var(--color-border); }
html.dark .wb-side-switch :deep(.ws-trigger:hover) { border-color: var(--color-primary); }
html.dark .wb-group-label { color: var(--color-text-muted, #94a3b8); }
html.dark .wb-group-collapse { color: var(--color-text-muted, #94a3b8); }
html.dark .wb-group-collapse:hover { background-color: var(--color-bg-hover, #374151); color: var(--dark-accent-text); }
html.dark .wb-side-btn-ic { color: var(--color-primary, #60a5fa); }

html.dark .wb-menu {
  background-color: var(--color-bg-card, #1f2937);
  border-right-color: var(--color-border, #374151);
}

/* 收起按钮的暗色由 .tw-btn 的 token 自动翻转，这里不再单独覆盖
   （旧的自写暗色会把文字压成 secondary、hover 改色，与教师台不一致） */
html.dark .wb-menu-item {
  color: var(--color-text-secondary);
}

html.dark .wb-menu-item:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text);
}

html.dark .wb-menu-item.active {
  background-color: var(--dark-accent-surface);
  color: var(--dark-accent-text);
}

html.dark .wb-content {
  background-color: var(--color-bg, #111827);
}

/* 移动端左侧抽屉：暗色下补右侧投影，替代原底部 Tab Bar 的顶边阴影 */
@media (max-width: 768px) {
  html.dark .wb-menu {
    border-right-color: var(--color-border, #374151);
    box-shadow: 2px 0 16px var(--color-shadow, rgba(0, 0, 0, 0.4));
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

  /* 原型：移动端不退回底部 Tab Bar，改由页头按钮唤出左侧抽屉，
     抽屉里仍是搜索框 + 12 项分组菜单 + 底部两枚按钮。 */
  .wb-menu {
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
  .wb-menu.open { transform: none; }

  /* 抽屉内忽略桌面折叠态，标签与底部文案完整显示 */
  .wb-menu.collapsed { width: min(264px, 82%); }
  .wb-menu.collapsed .wb-search { height: 34px; padding: 0 8px 0 10px; justify-content: flex-start; }
  .wb-menu.collapsed .wb-search-text, .wb-menu.collapsed .wb-search-kbd { display: inline; }
  /* 抽屉里忽略桌面折叠态：切换入口恢复完整文字行 */
  .wb-menu.collapsed .wb-side-switch :deep(.ws-trigger) { height: 34px; padding: 0 8px 0 10px; justify-content: flex-start; }
  .wb-menu.collapsed .wb-side-switch :deep(.ws-trigger-label),
  .wb-menu.collapsed .wb-side-switch :deep(.ws-trigger-caret) { display: inline; }
  .wb-menu.collapsed .wb-group-label { font-size: calc(var(--fs-caption) - 1px); padding: 8px 10px 2px; margin: 0; border-top: 0; }
  .wb-menu.collapsed .wb-group-label.is-first { min-height: 0; }
  .wb-menu.collapsed .wb-group-label-text { display: inline; }
  /* 抽屉里折叠态不生效，这颗按钮点了也不会有视觉变化 → 隐藏，避免出现死按钮 */
  .wb-group-collapse, .wb-menu.collapsed .wb-group-collapse { display: none; }
  .wb-menu.collapsed .wb-menu-item { justify-content: flex-start; padding: 9px 10px; }
  .wb-menu.collapsed .wb-menu-label { display: inline; }
  /* 抽屉里无论桌面折叠态如何，底部始终一行两枚、显示纯文字 */
  .wb-menu.collapsed .wb-side-foot { padding: 8px 10px 10px; gap: 6px; }
  .wb-menu.collapsed .wb-side-btn { justify-content: center; padding: 0 6px; gap: 6px; }
  .wb-menu.collapsed .wb-side-btn-text { display: inline; }
  .wb-menu.collapsed .wb-side-btn-ic { display: none; }

  /* 遮罩低于抽屉（46）、高于内容区；抽屉（60）仍在其上 */
  .wb-scrim {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 45;
    background: rgba(15, 23, 42, .32);
  }

  .wb-menu-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: flex-start;
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

  .wb-menu-item { min-height: 44px; min-width: 44px; }
  .wb-menu-label { overflow: visible; text-overflow: clip; white-space: nowrap; }
  /* 移动端两枚按钮触控目标 40px，仍保持同一行 */
  .wb-side-btn { height: 40px; min-height: 40px; }

  /* 底部 Tab Bar 已取消，只需避让面板自带的悬浮 FAB
     （移动端 bottom:64px + 48px 高 → 顶端距视口底 112px，再加 8px 间隔取 120px）。
     qa-workbench-mobile-overlap.mjs 的 S2 依赖这段留白。 */
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
