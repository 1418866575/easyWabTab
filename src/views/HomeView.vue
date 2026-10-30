<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, watchEffect, defineAsyncComponent } from 'vue'
import { showConfirm } from '@/utils/dialog'
import { useRouter, useRoute } from 'vue-router'
import type { Site } from '../types'
import SiteCard from '../components/SiteCard.vue'
import GlobalSearch from '../components/GlobalSearch.vue'
import CategoryTabs from '../components/CategoryTabs.vue'
import TagFilter from '../components/TagFilter.vue'
import Pagination from '../components/Pagination.vue'
import Icon from '../components/Icon.vue'
// 工作台切换命令面板常驻渲染在顶栏（不在 v-if 内），保持静态导入：体量很小，异步反而让按钮延迟出现。
// 原「工作台管理」下拉面板（WorkbenchManagePanel）已升级为命令面板（WorkbenchSwitcher）：
// 独立「工具箱」按钮已合并进面板，左上角只保留这一个入口。
import WorkbenchSwitcher from '../components/WorkbenchSwitcher.vue'
// 弹框 / 管理器改为按需异步加载：这些组件体量大（AppSettingsDialog 近 4000 行、
// HelpModal 1400+ 行），但都位于 v-if 中、只有用户点开才渲染。原先静态 import 会让它们
// 全部进入首屏依赖图 —— 首屏必须把这些代码下载并解析完才能渲染，移动端 TTI 被明显拖长。
// 改为 defineAsyncComponent 后各自独立成 chunk，点开时才拉取，首屏需要下载的代码量下降。
// 前提：这几个弹框没有被父组件通过 ref 调用实例方法（已确认），异步化不会取到 null。
const SiteModal = defineAsyncComponent(() => import('../components/SiteModal.vue'))
const BackgroundManager = defineAsyncComponent(() => import('../components/BackgroundManager.vue'))
const CategoryManager = defineAsyncComponent(() => import('../components/CategoryManager.vue'))
const BackupManager = defineAsyncComponent(() => import('../components/BackupManager.vue'))
const IconManager = defineAsyncComponent(() => import('../components/IconManager.vue'))
const SearchEngineManager = defineAsyncComponent(() => import('../components/SearchEngineManager.vue'))
const HelpModal = defineAsyncComponent(() => import('../components/HelpModal.vue'))
const CountdownModal = defineAsyncComponent(() => import('@/components/CountdownModal.vue'))
const AppSettingsDialog = defineAsyncComponent(() => import('../components/AppSettingsDialog.vue'))
import { useSitesStore, isModuleSite } from '../stores/sites'
import { useCategoriesStore } from '../stores/categories'
import { useThemeStore } from '../stores/theme'
import { useAppSettingsStore } from '../stores/settings'
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts'
import { useHelpModal } from '../composables/useHelpModal'
import { useCloudSync } from '../composables/useCloudSync'
import { isImageIcon } from '../composables/categoryIcon'
import type { SyncStatus } from '../composables/useCloudSync'

const store = useSitesStore()
const categoriesStore = useCategoriesStore()
const themeStore = useThemeStore()
const settingsStore = useAppSettingsStore()
const { showHelp, openHelp, closeHelp, maybeAutoOpenHelp } = useHelpModal()
const router = useRouter()
const route = useRoute()
const showModal = ref(false)
const showEngineManager = ref(false)
const showBackgroundManager = ref(false)
const showCategoryManager = ref(false)
const showBackupManager = ref(false)
const showIconManager = ref(false)
const showSettingsDialog = ref(false)
const showCountdownModal = ref(false)
const editingSite = ref<Site | null>(null)

// ===== 视图模式：经典网格 / 侧边栏导航（默认经典，零改动） =====
type ViewMode = 'classic' | 'sidebar'
const viewMode = computed<ViewMode>({
  get: () => settingsStore.viewMode,
  set: (v) => settingsStore.setViewMode(v)
})
const sidebarOpen = ref(false) // 仅移动端抽屉用
function toggleSidebar(): void {
  sidebarOpen.value = !sidebarOpen.value
}
// 侧边栏分类导航（复用 store 分类与筛选，与顶部分类标签共享同一筛选态）
const sidebarCategories = computed(() => categoriesStore.allCategories)
const countByCategory = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const site of store.visibleSites) {
    counts[site.category] = (counts[site.category] ?? 0) + 1
  }
  return counts
})
const totalCount = computed(() => store.visibleSites.length)
function selectCategory(id: string): void {
  if (store.selectedCategory === id) {
    store.setCategory('')
  } else {
    store.setCategory(id)
  }
  sidebarOpen.value = false // 移动端选中后自动收起抽屉
}

// ===== 右上角云同步快捷按钮（开关开启时显示；共享 useCloudSync 单例，与设置弹窗互相同步状态） =====
const cloudSync = useCloudSync()
const cloudEnabled = computed((): boolean => settingsStore.cloudSyncEnabled === true)
const syncBusy = computed(
  (): boolean => cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing'
)
const syncStatusClass = computed(
  (): Record<string, boolean> => ({
    'wb-sync-btn-pending': cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing',
    'wb-sync-btn-conflict': cloudSync.status.value === 'conflict',
    'wb-sync-btn-error': cloudSync.status.value === 'error'
  })
)
function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n
}
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
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
  await cloudSync.syncNow()
}

// 拖拽排序状态
const dragSourceUrl = ref<string | null>(null)
const dragOverUrl = ref<string | null>(null)

/** 站内入口卡（工具箱 / 博客前台 / 图书馆）固定在列表最前：既不发起拖拽，也不作为落点 */
const isPinnedSite = (site: Site) => isModuleSite(site)

const handleDragStart = (site: Site) => {
  if (isPinnedSite(site)) return
  dragSourceUrl.value = site.url
}

const handleDragOver = (site: Site, event: DragEvent) => {
  event.preventDefault()
  if (isPinnedSite(site)) return
  if (dragSourceUrl.value && dragSourceUrl.value !== site.url) {
    dragOverUrl.value = site.url
  }
}

const handleDragLeave = () => {
  dragOverUrl.value = null
}

const handleDrop = (site: Site) => {
  if (!isPinnedSite(site) && dragSourceUrl.value && dragSourceUrl.value !== site.url) {
    store.swapSort(dragSourceUrl.value, site.url)
  }
  dragSourceUrl.value = null
  dragOverUrl.value = null
}

const handleDragEnd = () => {
  dragSourceUrl.value = null
  dragOverUrl.value = null
}

onMounted(() => {
  store.loadSites()
  // 网站加载时：helpAckCount 为 0（首次 / 尚未点过「知道了」）自动弹出帮助页；>0 不再弹
  maybeAutoOpenHelp()
})

// 同步 URL query 参数与弹框状态（Ctrl+N / 直接访问 URL 均可打开弹框）
watchEffect(() => {
  const modal = route.query.modal as string | undefined

  if (modal === 'add') {
    editingSite.value = null
    showModal.value = true
    showEngineManager.value = false
    closeHelp()
  } else if (modal === 'edit') {
    const url = route.query.url as string | undefined
    if (url) {
      const site = store.sites.find(s => s.url === decodeURIComponent(url))
      if (site) {
        editingSite.value = { ...site }
        showModal.value = true
        showEngineManager.value = false
        closeHelp()
      }
    } else {
      // 有 modal=edit 但无 url → 关闭
      showModal.value = false
      editingSite.value = null
    }
  } else if (modal === 'engines') {
    showEngineManager.value = true
    showModal.value = false
    closeHelp()
  } else if (modal === 'help') {
    openHelp()
    showModal.value = false
    showEngineManager.value = false
  } else if (modal === 'background') {
    showBackgroundManager.value = true
    showModal.value = false
    showEngineManager.value = false
    closeHelp()
  } else if (modal === 'category') {
    showCategoryManager.value = true
    showModal.value = false
    showEngineManager.value = false
    closeHelp()
  } else if (modal === 'backup') {
    showBackupManager.value = true
    showModal.value = false
    showEngineManager.value = false
    closeHelp()
  } else if (modal === 'icons') {
    showIconManager.value = true
    showModal.value = false
    showEngineManager.value = false
    closeHelp()
  } else {
    // 无 modal query → 关闭所有弹框（URL 清除时）
    showModal.value = false
    showEngineManager.value = false
    showBackgroundManager.value = false
    showCategoryManager.value = false
    showBackupManager.value = false
    showIconManager.value = false
    closeHelp()
    editingSite.value = null
  }
})

const filteredSites = computed(() => store.paginatedSites)

// ===== 移动端长列表分批渲染 =====
// 问题：移动端 pageSize=99999 会一次性渲染全部站点，每张卡片 10+ 个节点，
// 站点多时单页可达数千 DOM，首页渲染与滚动明显掉帧。
// 改法：数据层保持全量（保留「移动端不分页、无需翻页」的手感），
// 仅在渲染层按批输出，滚动接近底部时自动追加下一批。
const MOBILE_BATCH = 40
const mobileRenderLimit = ref(MOBILE_BATCH)
const isMobilePaging = ref(false)
const visibleSites = computed(() => {
  if (!isMobilePaging.value) return filteredSites.value
  return filteredSites.value.slice(0, mobileRenderLimit.value)
})
function maybeLoadMore(): void {
  if (!isMobilePaging.value) return
  const doc = document.documentElement
  const nearBottom = doc.scrollHeight - window.scrollY - window.innerHeight < 600
  if (nearBottom && mobileRenderLimit.value < filteredSites.value.length) {
    mobileRenderLimit.value += MOBILE_BATCH
  }
}
// 只在「筛选条件」真的变了才回到第一批。
// 这里不能监听 filteredSites 本身：点击站点会给 sort +1（点击频率排序）→ 列表重排 → 已加载的批次
// 被收回 40 条。滚到第 200 条时点开一个卡再回来，列表瞬间坍缩，是手机端最明显的体验断层。
watch(
  () => [
    store.selectedCategory,
    store.selectedTags.join(','),
    store.searchQuery,
    store.showOnlyInvalid,
    isMobilePaging.value
  ],
  () => {
    mobileRenderLimit.value = MOBILE_BATCH
  }
)

// ===== 本站筛选：独立输入框，只过滤下方卡片列表；顶部 GlobalSearch 仍走外部搜索引擎 =====
const siteFilter = ref(store.searchQuery)
// 输入防抖：原先每敲一个字符都立即写入 store，触发一次全量 filter + sort（并重置分页、
// 整列表重渲染），移动端连续输入会逐字掉帧。改为停止输入 250ms 后再落库。
// 两处细节：
//   1) 清空操作即时生效 —— 清空是明确意图，不应有 250ms 延迟感；
//   2) 回调内读取 siteFilter.value 而不是捕获的 v —— 否则与 clearAllFilters 存在竞态：
//      清空后残留的定时器会把旧关键词重新写回 store，导致筛选「复活」。
let siteFilterTimer: number | undefined
watch(siteFilter, (v) => {
  if (siteFilterTimer !== undefined) {
    clearTimeout(siteFilterTimer)
    siteFilterTimer = undefined
  }
  if (v === '') {
    store.setSearchQuery('')
    return
  }
  siteFilterTimer = window.setTimeout(() => {
    siteFilterTimer = undefined
    store.setSearchQuery(siteFilter.value)
  }, 250)
})
// 外部改了 store（清空筛选 / 分类联动）时回写输入框，保持双向一致
watch(
  () => store.searchQuery,
  (v) => {
    if (v !== siteFilter.value) siteFilter.value = v
  }
)

const hasAnyFilter = computed(
  () =>
    store.searchQuery.trim() !== '' ||
    store.selectedCategory !== '' ||
    store.selectedTags.length > 0 ||
    store.showOnlyInvalid
)

const filterCountText = computed(() => {
  const total = store.visibleSites.length
  const shown = store.filteredSites.length
  return hasAnyFilter.value ? `筛选出 ${shown} / ${total} 个` : `共 ${total} 个`
})

function clearAllFilters(): void {
  store.clearFilters()
  store.showOnlyInvalid = false
  siteFilter.value = ''
}

// 关闭所有弹框并清除 URL query
const closeAllModals = () => {
  showModal.value = false
  showEngineManager.value = false
  showBackgroundManager.value = false
  showCategoryManager.value = false
  showBackupManager.value = false
  showIconManager.value = false
  showSettingsDialog.value = false
  closeHelp()
  editingSite.value = null
  // 清除 URL query 参数（如果存在的话）
  if (route.query.modal) {
    router.push({ query: {} })
  }
}

// 注册键盘快捷键
useKeyboardShortcuts({
  onCloseModal: closeAllModals,
  onToggleTheme: async () => themeStore.toggleTheme()
})

const handleEdit = (site: Site) => {
  editingSite.value = { ...site }
  router.push({ query: { modal: 'edit', url: encodeURIComponent(site.url) } })
}

const handleDelete = async (url: string) => {
  if (await showConfirm('确定要删除这个网站吗？')) {
    store.deleteSite(url)
  }
}

const handleUnmark = async (url: string) => {
  if (await showConfirm('确定要取消失效标记吗？')) {
    store.unmarkInvalid(url)
  }
}

const handleAdd = () => {
  editingSite.value = null
  router.push({ query: { modal: 'add' } })
}

const handleSave = async (site: Site) => {
  if (editingSite.value) {
    // 编辑模式 - 直接更新
    store.updateSite(editingSite.value.url, site)
    closeAllModals()
    return
  }

  // 添加模式 - 检查重复
  const existing = store.sites.find(s => s.url === site.url)
  if (existing) {
    const action = await showConfirm(`该网址已存在：${existing.name}\n\n确定更新？取消则跳过。`)
    if (action) {
      store.updateSite(site.url, site)
    }
    closeAllModals()
    return
  }

  // 无重复 - 正常添加
  store.addSite(site)
  closeAllModals()
}

// 分页切换时只滚动网站区域
const sitesGridRef = ref<HTMLElement | null>(null)
const handlePageChange = () => {
  const grid = sitesGridRef.value
  if (grid) {
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// ===== 移动端分页：≤768px 默认显示全部、隐藏底部分页条 =====
// 桌面断点与 usePanelPaging 保持一致：(min-width: 769px) 为桌面；≤768px 视为移动端。
// 移动端把 pageSize 设为 99999（Pagination 的「全部」模式），页码按钮随 isAllMode 自动隐藏，列表渲染全量；
// 桌面端恢复此前桌面每页条数，避免覆盖用户在设置里选过的每页条数。
const pagingMql = window.matchMedia('(min-width: 769px)')
let desktopPageSize = 18
function syncMobilePaging(): void {
  if (pagingMql.matches) {
    isMobilePaging.value = false
    store.setPageSize(desktopPageSize)
  } else {
    isMobilePaging.value = true
    if (store.pageSize !== 99999) desktopPageSize = store.pageSize
    store.setPageSize(99999)
    store.setPage(1)
  }
}
onMounted(() => {
  syncMobilePaging()
  pagingMql.addEventListener('change', syncMobilePaging)
  // 移动端分批渲染：滚动接近底部时追加下一批（passive 避免影响滚动性能）
  window.addEventListener('scroll', maybeLoadMore, { passive: true })
})
onUnmounted(() => {
  pagingMql.removeEventListener('change', syncMobilePaging)
  window.removeEventListener('scroll', maybeLoadMore)
  // 清理搜索防抖定时器，避免组件卸载后回调仍写入 store
  if (siteFilterTimer !== undefined) {
    clearTimeout(siteFilterTimer)
    siteFilterTimer = undefined
  }
})

// ===== App Bar 高度测量（移动端专用）=====
// 移动端 App Bar 会换行成两排，高度不再固定 56px；侧边栏抽屉顶部需对齐真实高度，
// 否则抽屉头部会被 App Bar 盖住 → 菜单项点不到。这里实时测量并写入 --app-h 供移动端 CSS 使用。
// 桌面端 CSS 不使用 --app-h（仍走 56px），因此不影响 PC 显示。
const appBarRef = ref<HTMLElement | null>(null)
const appBarHeight = ref(56)
let appBarResizeObserver: ResizeObserver | null = null
function measureAppBar(): void {
  const el = appBarRef.value
  if (el) appBarHeight.value = el.offsetHeight || 56
}
onMounted(() => {
  measureAppBar()
  window.addEventListener('resize', measureAppBar)
  if (typeof ResizeObserver !== 'undefined' && appBarRef.value) {
    appBarResizeObserver = new ResizeObserver(measureAppBar)
    appBarResizeObserver.observe(appBarRef.value)
  }
})
onUnmounted(() => {
  window.removeEventListener('resize', measureAppBar)
  appBarResizeObserver?.disconnect()
  appBarResizeObserver = null
})
</script>

<template>
  <!-- 顶部统一 App Bar：左=教师台/工作台/销售台/学生台入口（教师台居首），右=同步/设置/帮助/倒计时；主题与经典侧边栏已迁入 设置→导航设置→显示控制 -->
  <div ref="appBarRef" class="app-bar">
    <div class="app-bar-left">
      <!-- 工作台切换（命令面板）：触发器 + 居中浮层，Alt+W 唤起；可在 设置 → 个性化 → 工作台设置 中关闭 / 改名。
           工具箱入口已合并进该面板（不再单独占一个按钮），名称/图标/开关仍在 设置 → 个性化 → 显示控制 -->
      <WorkbenchSwitcher />
      <!-- 智能工作台不在此处单放入口：与其它工作台一致，统一走工作台切换面板 -->
    </div>
    <div class="app-bar-right">
      <button
        v-if="cloudEnabled"
        class="btn-help wb-sync-btn"
        :class="syncStatusClass"
        :title="syncTip"
        data-testid="home-sync-now"
        :disabled="syncBusy || cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing'"
        @click="handleSyncNowClick"
      >{{ syncLabel }}</button>
      <button class="btn-help" @click="showSettingsDialog = true" title="设置" aria-label="设置">设置</button>
      <!-- 帮助按钮：可在 设置 → 个性化 → 主题 中关闭 / 改名 -->
      <button
        v-if="settingsStore.helpButtonVisible !== false"
        class="btn-help"
        data-testid="home-help-btn"
        @click="openHelp"
        :title="settingsStore.helpButtonDisplayName"
        :aria-label="settingsStore.helpButtonDisplayName"
      >{{ settingsStore.helpButtonDisplayName }}</button>
      <!-- 倒计时按钮：可在 设置 → 个性化 → 主题 中关闭 / 改名 -->
      <button
        v-if="settingsStore.countdownButtonVisible !== false"
        class="btn-help"
        data-testid="home-countdown-btn"
        @click="showCountdownModal = true"
        :title="settingsStore.countdownButtonDisplayName"
        :aria-label="settingsStore.countdownButtonDisplayName"
      >{{ settingsStore.countdownButtonDisplayName }}</button>

    </div>
  </div>

  <!-- 视图外壳：侧边栏模式下挂左侧菜单；经典模式无额外包裹，布局完全不变 -->
  <div
    class="home-shell"
    :class="{ 'is-sidebar': viewMode === 'sidebar' }"
    :style="{ '--app-h': appBarHeight + 'px' }"
  >
    <aside
      v-if="viewMode === 'sidebar'"
      class="nav-sidebar"
      :class="{ open: sidebarOpen }"
      aria-label="分类导航"
    >
      <div class="nav-sidebar-scroll">
        <nav class="nav-sidebar-menu">
          <button
            type="button"
            class="nav-menu-item"
            :class="{ active: store.selectedCategory === '' }"
            @click="selectCategory('')"
          >
            <span class="nav-menu-icon">🗂️</span>
            <span class="nav-menu-label">全部</span>
            <span class="nav-menu-count">{{ totalCount }}</span>
          </button>
          <button
            v-for="cat in sidebarCategories"
            :key="cat.id"
            type="button"
            class="nav-menu-item"
            :class="{ active: store.selectedCategory === cat.id }"
            @click="selectCategory(cat.id)"
          >
            <span class="nav-menu-icon">
              <img v-if="isImageIcon(cat.icon)" :src="cat.icon" class="nav-menu-icon-img" alt="" />
              <template v-else>{{ cat.icon }}</template>
            </span>
            <span class="nav-menu-label">{{ cat.name }}</span>
            <span class="nav-menu-count">{{ countByCategory[cat.id] ?? 0 }}</span>
          </button>
        </nav>
        <div class="nav-sidebar-divider"></div>
        <div class="nav-sidebar-section-title">标签</div>
        <TagFilter />
      </div>
    </aside>

    <!-- 移动端抽屉遮罩 -->
    <div
      v-if="viewMode === 'sidebar' && sidebarOpen"
      class="nav-sidebar-backdrop"
      @click="sidebarOpen = false"
    ></div>

    <div class="container" :class="{ 'container-sidebar': viewMode === 'sidebar' }">
      <header class="header">
        <div class="header-top">
          <div class="search-section">
            <GlobalSearch class="global-search-bar" />
          </div>
          <button
            v-if="viewMode === 'sidebar'"
            type="button"
            class="view-hamburger"
            @click="toggleSidebar"
            aria-label="打开/关闭分类菜单"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v2H3V6m0 5h18v2H3v-2m0 5h18v2H3v-2z" /></svg>
          </button>
        </div>
      </header>

      <!-- 工具条：左侧「分类 · 标签」折叠开关（默认收起，可在设置 → 导航设置 → 导航筛选栏切换模式；侧边栏模式下由左侧菜单接管），右侧「筛选本站」只过滤下方卡片，与顶部外链搜索互不干扰 -->
      <div class="nav-toolbar">
        <button
          v-if="viewMode === 'classic'"
          class="nav-filter-toggle"
          data-testid="nav-filter-toggle"
          :aria-expanded="settingsStore.navFiltersExpanded"
          @click="settingsStore.setNavFiltersExpanded(!settingsStore.navFiltersExpanded)"
        >
          <span class="nav-filter-chevron" :class="{ open: settingsStore.navFiltersExpanded }">▸</span>
          <span>分类 · 标签</span>
          <span v-if="!settingsStore.navFiltersExpanded && (store.selectedCategory !== '' || store.selectedTags.length > 0 || store.showOnlyInvalid)" class="nav-filter-hint">
            有筛选
          </span>
        </button>

        <span class="nav-filter-count">{{ filterCountText }}</span>

        <div class="nav-site-filter">
          <svg class="nsf-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>
          <input
            v-model="siteFilter"
            type="text"
            class="nsf-input"
            data-testid="nav-site-filter"
            placeholder="筛选本站…"
            aria-label="按名称、描述或标签筛选本站"
          />
          <button v-if="siteFilter" type="button" class="nsf-clear" aria-label="清除关键词" @click="siteFilter = ''">×</button>
        </div>

        <button type="button" class="nav-add-site" data-testid="nav-add-site" @click="handleAdd">
          <span class="nas-plus" aria-hidden="true">＋</span>添加网站
        </button>

        <button v-if="hasAnyFilter" type="button" class="nav-filter-clear" @click="clearAllFilters">清空筛选</button>
      </div>

      <div v-if="viewMode === 'classic' && settingsStore.navFiltersExpanded" class="nav-filter-panel" data-testid="nav-filter-panel">
        <CategoryTabs />

        <TagFilter />
      </div>

      <main ref="sitesGridRef" class="sites-grid">
        <SiteCard
          v-for="site in visibleSites"
          :key="site.url"
          :site="site"
          :readonly="false"
          :is-drag-over="dragOverUrl === site.url"
          :is-dragging="dragSourceUrl === site.url"
          :draggable="!isPinnedSite(site)"
          @edit="handleEdit"
          @delete="handleDelete"
          @unmark="handleUnmark"
          @dragstart="handleDragStart(site)"
          @dragover="handleDragOver(site, $event)"
          @dragleave="handleDragLeave"
          @drop="handleDrop(site)"
          @dragend="handleDragEnd"
        />
      </main>

      <Pagination @pageChange="handlePageChange" />

      <div v-if="store.filteredSites.length === 0" class="empty-state">
        <p v-if="store.showOnlyInvalid">没有检测到无效链接 <Icon name="check" /></p>
        <p v-else>没有找到匹配的网站</p>
      </div>

      <SiteModal
        v-if="showModal"
        :site="editingSite"
        @save="handleSave"
        @close="closeAllModals"
      />

      <SearchEngineManager
        v-if="showEngineManager"
        @close="closeAllModals"
      />

      <HelpModal
        v-if="showHelp"
        @close="closeAllModals"
      />

      <AppSettingsDialog
        v-if="showSettingsDialog"
        source="nav"
        @close="showSettingsDialog = false"
      />

      <BackgroundManager v-if="showBackgroundManager" @close="closeAllModals" />

      <CategoryManager v-if="showCategoryManager" @close="closeAllModals" />

      <BackupManager v-if="showBackupManager" @close="closeAllModals" />

      <IconManager v-if="showIconManager" @close="closeAllModals" />

      <CountdownModal
        v-if="showCountdownModal"
        @close="showCountdownModal = false"
      />
    </div>
  </div>
</template>

<style scoped>
/* 顶部统一 App Bar */
.app-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background-color: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  box-shadow: 0 1px 2px var(--color-shadow, rgba(0, 0, 0, 0.08));
}

.app-bar-left,
.app-bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* 工作台切换触发器（WorkbenchSwitcher）的样式自包含在子组件内（.ws-trigger），
   导航站与各工作台页面外观一致；此处不再 :deep 透传覆盖。
   原「工具箱」独立按钮已合并进切换面板，.home-toolbox-btn-icon 样式一并移除。 */

/* ===== 侧边栏导航布局 ===== */
.home-shell {
  min-height: 100vh;
}
.nav-sidebar {
  position: fixed;
  top: 56px;
  left: 0;
  bottom: 0;
  width: 240px;
  z-index: 90;
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface, #fff);
  border-right: 1px solid var(--color-border, #e2e8f0);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.04);
  transform: translateX(-100%);
  transition: transform 0.25s var(--motion-ease, ease);
  overflow: hidden;
}
.nav-sidebar.open {
  transform: translateX(0);
}
.nav-sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.nav-sidebar-section-title {
  font-size: 12px;
  color: var(--color-text-secondary, #94a3b8);
  padding: 8px 8px 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.nav-sidebar-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  transition: background-color 0.15s, color 0.15s;
}
.nav-menu-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text, #1e293b);
}
.nav-menu-item.active {
  background-color: rgba(59, 130, 246, 0.14);
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}
.nav-menu-item:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 1px;
}
.nav-menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: none;
  text-align: center;
  font-size: 15px;
  overflow: hidden;
}
/* 分类图标来自图标管理时为图片地址，按图片渲染（旧的 emoji 仍走文本） */
.nav-menu-icon-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.nav-menu-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-menu-count {
  font-size: 12px;
  color: var(--color-text-secondary, #94a3b8);
  background: var(--color-bg-hover, #f1f5f9);
  border-radius: 999px;
  padding: 1px 8px;
}
.nav-menu-item.active .nav-menu-count {
  background: rgba(59, 130, 246, 0.2);
  color: var(--color-primary, #3b82f6);
}
.nav-sidebar-divider {
  height: 1px;
  background: var(--color-border, #e2e8f0);
  margin: 12px 4px;
}
.nav-sidebar-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 85;
}

/* 侧边栏模式下容器让出左侧 240px（桌面端常驻显示） */
.container.container-sidebar {
  max-width: none;
  margin: 0;
  padding-left: 264px;
}

/* 移动端侧边栏汉堡按钮（仅侧边栏模式显示） */
.view-hamburger {
  display: none;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
}
.view-hamburger svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
}
.header-top {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-top .search-section {
  flex: 1;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  padding-top: 84px; /* 为顶部统一 App Bar 留出空间 */
  padding-bottom: 32px;
}

.header {
  margin-bottom: 24px;
}

.search-section {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.global-search-bar {
  max-width: 750px;
  width: 100%;
}

.sites-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

/* 分类 · 标签筛选栏折叠开关（默认收起；设置 → 导航设置 → 导航筛选栏可切换模式） */
.nav-filter-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 8px 16px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-filter-toggle:hover {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.nav-filter-chevron {
  display: inline-block;
  transition: transform 0.2s ease;
}

.nav-filter-chevron.open {
  transform: rotate(90deg);
}

.nav-filter-panel {
  display: flex;
  flex-direction: column;
}

/* 工具条：分类·标签开关 + 结果计数 + 本站筛选 + 清空（右侧对齐） */
.nav-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.nav-toolbar .nav-filter-toggle {
  margin-top: 0;
}

.nav-filter-count {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  white-space: nowrap;
}

.nav-site-filter {
  gap: 6px;
  margin-left: auto;
  min-width: 200px;
}



.nsf-icon {
  flex: none;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--color-text-muted, #94a3b8);
  stroke-width: 2;
  stroke-linecap: round;
}

.nsf-input {
  flex: 1;
  min-width: 0;
}

.nsf-input::placeholder {
  color: var(--color-text-muted, #94a3b8);
}

.nsf-clear {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.nsf-clear:hover {
  background: var(--color-border, #e2e8f0);
  color: var(--color-error, #ef4444);
}

.nav-filter-clear {
  flex: none;
  padding: 7px 12px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  background: transparent;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 18px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}

.nav-filter-clear:hover {
  color: var(--color-error, #ef4444);
  border-color: var(--color-error, #ef4444);
}

/* .nav-add-site 视觉已统一到全局 .ui-btn--primary（8px 圆角）；保留 flex 布局 */
.nav-add-site {
  flex: none;
}

/* .nav-add-site:hover 视觉已统一到全局 .ui-btn--primary:hover（style.css）：蓝色主操作 hover + 抬升 + 阴影 */

.nas-plus {
  font-size: 14px;
  line-height: 1;
}

.nav-filter-hint {
  font-size: 12px;
  color: #b45309;
  background: #fef3c7;
  border-radius: 999px;
  padding: 1px 8px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-secondary, #64748b);
  font-size: 16px;
}

/* 暗色模式 */
html.dark .app-bar {
  background-color: rgba(31, 41, 55, 0.82);
  border-bottom-color: var(--color-border, #374151);
}

/* 顶栏按钮暗色（工作台切换触发器 .ws-trigger 的暗色样式自包含在子组件内） */
html.dark .app-bar .btn-help {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .app-bar .btn-help:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-border, #374151);
}

/* 暗色模式下的侧边栏 */
html.dark .nav-sidebar {
  background-color: var(--color-surface, #1f2937);
  border-right-color: var(--color-border, #374151);
}
html.dark .nav-menu-item {
  color: var(--color-text-secondary, #d1d5db);
}
html.dark .nav-menu-item:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #e5e7eb);
}
html.dark .nav-menu-item.active {
  background-color: rgba(59, 130, 246, 0.22);
  color: var(--color-primary, #60a5fa);
}
html.dark .nav-menu-count {
  background: var(--color-bg-hover, #374151);
  color: var(--color-text-secondary, #9ca3af);
}
html.dark .nav-menu-item.active .nav-menu-count {
  background: rgba(59, 130, 246, 0.32);
  color: var(--color-primary, #60a5fa);
}
html.dark .nav-sidebar-divider {
  background: var(--color-border, #374151);
}
html.dark .view-hamburger {
  border-color: var(--color-border, #374151);
  color: var(--color-text-secondary, #d1d5db);
}
html.dark .nav-site-filter {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}
html.dark .nsf-input {
  color: var(--color-text, #e5e7eb);
}
html.dark .nsf-clear {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text-secondary, #d1d5db);
}
html.dark .nav-filter-clear {
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .nav-add-site {
  color: #fff;
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

/* .nav-add-site:hover 暗色态已统一到全局 .ui-btn--primary:hover（style.css） */

@media (max-width: 768px) {
  .app-bar {
    padding: 8px 10px;
    gap: 8px;
    flex-wrap: wrap;
  }

  .app-bar-left,
  .app-bar-right {
    gap: 4px;
    flex: 1 1 100%;
  }

  /* 窄屏左入口（图标+名称）与右侧按钮各占一行，名称常显，避免互相挤压溢出 */
  .app-bar-left {
    overflow-x: auto;
    scrollbar-width: none;
  }
  .app-bar-left::-webkit-scrollbar {
    display: none;
  }
  .app-bar-right {
    justify-content: flex-start;
    /* 按钮放不下时内部横向滚动，避免溢出后被裁掉够不着 */
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .app-bar-right::-webkit-scrollbar {
    display: none;
  }

  .btn-help,
  :deep(.ws-trigger) {
    padding: 8px 10px;
  }

  .container {
    padding-top: 112px;
    /* 左右内边距收窄，给卡片网格让出宽度 */
    padding-left: 12px;
    padding-right: 12px;
    /* 分页已回归文档流，底部仅保留安全区与少量留白 */
    padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  }

  /* 站点网格：小屏降为 150px 最小列宽，360px 屏可排两列，一屏看到更多站点 */
  .sites-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }

  .nav-toolbar {
    margin-top: 12px;
    gap: 8px;
  }

  /* 窄屏：筛选框独占一行，避免和折叠开关互相挤压 */
  .nav-site-filter {
    margin-left: 0;
    flex: 1 1 100%;
    min-width: 0;
    height: 40px;
  }

  .empty-state {
    padding: 40px 16px;
    font-size: 15px;
  }

  /* 移动端侧边栏：改为抽屉（默认移出视口，open 时滑入）
     ① top 对齐真实 App Bar 高度（--app-h 由脚本实时测量），避免抽屉被顶部栏压住导致菜单点不到；
     ② 宽度收窄到合适尺寸，减少对右侧内容的遮挡 */
  .nav-sidebar {
    top: var(--app-h, 56px);
    transform: translateX(-100%);
    width: min(72vw, 232px);
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.25);
  }
  .nav-sidebar.open {
    transform: translateX(0);
  }
  /* 抽屉内容底部留出安全区（iPhone 底部横条），避免最后一项被遮挡 */
  .nav-sidebar-scroll {
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }
  /* 遮罩同样从 App Bar 下方开始，避免半透明顶栏被压暗 */
  .nav-sidebar-backdrop {
    top: var(--app-h, 56px);
  }
  .view-hamburger {
    display: inline-flex;
  }
  /* 移动端侧边栏模式下容器不预留左侧空间（抽屉覆盖） */
  .container.container-sidebar {
    padding-left: 12px;
  }
}

/* 桌面端侧边栏常驻显示（覆盖移动端抽屉态） */
@media (min-width: 769px) {
  .nav-sidebar {
    transform: translateX(0) !important;
  }
  /* 桌面端不需要汉堡按钮与遮罩 */
  .view-hamburger {
    display: none !important;
  }
  .nav-sidebar-backdrop {
    display: none !important;
  }
}

/* ===== 右上角云同步按钮（设置按钮左侧）状态视觉 ===== */
.wb-sync-btn {
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease, opacity 120ms ease;
}
.wb-sync-btn.wb-sync-btn-pending {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
  opacity: 0.88;
  cursor: progress !important;
}
.wb-sync-btn.wb-sync-btn-conflict {
  background-color: #f59e0b !important;
  color: #fff !important;
  border-color: #f59e0b !important;
}
.wb-sync-btn.wb-sync-btn-error {
  background-color: var(--color-error, #ef4444) !important;
  color: #fff !important;
  border-color: var(--color-error, #ef4444) !important;
}
</style>
