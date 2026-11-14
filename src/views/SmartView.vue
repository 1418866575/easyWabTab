<script setup lang="ts">
/**
 * 智能工作台主视图（路由 /smart）
 * 布局与个人工作台一致：无顶栏，左菜单三段 = 顶部工作台切换（WorkbenchSwitcher，Alt+W）
 * + 中部功能导航 + 底部固定「云同步 / 设置」，右侧为内容区；移动端菜单为左侧抽屉。
 * 菜单项来自设置（概览 / 智能网页端 / 技能 / 提示词 / 工作流 / 前端提示词）；
 * 导航站入口统一收进顶部的工作台切换面板（与其它工作台页面同款）。
 */
import { computed, ref, watch } from 'vue'
import Icon from '@/components/Icon.vue'
import WorkbenchSwitcher from '@/components/WorkbenchSwitcher.vue'
import SmartOverview from '@/components/smart/SmartOverview.vue'
import AiPlatformManager from '@/components/smart/AiPlatformManager.vue'
import SkillManager from '@/components/smart/SkillManager.vue'
import PromptManager from '@/components/smart/PromptManager.vue'
import WorkflowManager from '@/components/smart/WorkflowManager.vue'
import FrontendPromptManager from '@/components/smart/FrontendPromptManager.vue'
import SmartSettingsDialog from '@/components/smart/SmartSettingsDialog.vue'
import { useAppSettingsStore } from '@/stores/settings'
import { useSmartStore } from '@/stores/smart'
import { useCloudSync, type SyncStatus } from '@/composables/useCloudSync'
import { useToast } from '@/composables/useToast'
import { FRONTEND_PROMPTS } from '@/composables/frontendPromptsCore'

type PageKey = 'overview' | 'platforms' | 'skills' | 'prompts' | 'workflows' | 'frontend'

const settingsStore = useAppSettingsStore()
const store = useSmartStore()

const activePage = ref<PageKey>('overview')
const sidebarCollapsed = ref(false)
/** 侧栏底部「设置」入口：左侧菜单配置 + 技能分类管理 */
const showSettings = ref(false)
/** 移动端左侧抽屉：默认收起，由内容区页头按钮唤出（与个人 / 健康工作台同款） */
const mobileMenuOpen = ref(false)
function closeMobileMenu(): void {
  mobileMenuOpen.value = false
}

interface MenuItem {
  key: PageKey
  label: string
  icon: string
  /** 菜单右侧计数徽标（概览不显示） */
  count?: number
}

/** 菜单取自 store 的可见项：已应用改名、隐藏与拖拽后的顺序 */
const menuItems = computed<MenuItem[]>(() =>
  store.visibleMenuItems.map(i => ({
    key: i.key as PageKey,
    label: i.label.replace(/管理/g, ''),
    icon: i.icon,
    ...(i.key === 'platforms' ? { count: store.platforms.length } : {}),
    ...(i.key === 'skills' ? { count: store.skills.length } : {}),
    ...(i.key === 'prompts' ? { count: store.prompts.length } : {}),
    ...(i.key === 'workflows' ? { count: store.workflows.length } : {}),
    ...(i.key === 'frontend' ? { count: FRONTEND_PROMPTS.length } : {})
  }))
)

// 当前页被隐藏时自动回落到第一个可见项，避免停留在看不见的页面上
watch(
  () => menuItems.value.map(i => i.key),
  keys => {
    if (keys.length && !keys.includes(activePage.value)) {
      activePage.value = keys[0]
    }
  },
  { immediate: true }
)

function selectPage(key: PageKey): void {
  activePage.value = key
  closeMobileMenu()
}

/** 当前页对应的组件：交给 <KeepAlive> 下的单个 <component :is> 渲染。
 *  KeepAlive 只接受一个子节点，不能再并列写 v-if 分支（会编译失败）。 */
const activePageComponent = computed(() => {
  switch (activePage.value) {
    case 'platforms': return AiPlatformManager
    case 'skills': return SkillManager
    case 'prompts': return PromptManager
    case 'workflows': return WorkflowManager
    case 'frontend': return FrontendPromptManager
    default: return SmartOverview
  }
})

// ---------- 侧栏底部云同步（共享 useCloudSync 单例；智能工作台数据走独立的 smart.json 信封） ----------
const cloudSync = useCloudSync()
const cloudEnabled = computed((): boolean => settingsStore.cloudSyncEnabled === true)
const syncBusy = computed(
  (): boolean => cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing'
)
const syncStatusClass = computed(
  (): Record<string, boolean> => ({
    'sv-sync-btn-pending': cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing',
    'sv-sync-btn-conflict': cloudSync.status.value === 'conflict',
    'sv-sync-btn-error': cloudSync.status.value === 'error'
  })
)
const syncLabel = computed((): string => {
  if (!cloudEnabled.value) return '云同步'
  switch (cloudSync.status.value as SyncStatus) {
    case 'pulling': return '拉取中…'
    case 'pushing': return '推送中…'
    case 'conflict': return '处理冲突'
    case 'error': return '同步失败'
    default: return '云同步'
  }
})
const syncTip = computed((): string => {
  if (!cloudEnabled.value) return '云同步未开启，请在「设置 → 云同步」中开启后使用'
  const t = cloudSync.lastSyncAt.value
  if (!t) return '未同步过；点击立即同步（智能工作台走 smart.json 信封）'
  const d = new Date(t)
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `上次同步：${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}；点击立即同步`
})
const toast = useToast()
async function handleSyncNowClick(): Promise<void> {
  if (!cloudEnabled.value) {
    // 统一走自研 Toast（规范：禁用原生 alert / ElMessage，消除提示双轨道）
    toast.warning('云同步未开启。请到「设置 → 云同步」填写 WebDAV 地址与账号后开启。')
    return
  }
  await cloudSync.syncNow()
}
</script>

<template>
  <div class="sv-shell" :class="{ 'is-collapsed': sidebarCollapsed }">
    <!-- 主体：左菜单（顶部切换 / 中部导航 / 底部云同步 + 设置）+ 右内容。无全局顶栏，与个人工作台一致。 -->
    <div class="sv-body">
      <aside class="sv-sidebar" :class="{ open: mobileMenuOpen }" aria-label="智能工作台功能导航">
        <!-- 侧栏第一项：切换其它页面，与个人 / 健康工作台同一槽位 -->
        <div class="sv-side-top">
          <div class="sv-side-switch" data-testid="smart-page-switcher">
            <WorkbenchSwitcher
              :trigger-icon="settingsStore.smartPageIcon"
              trigger-builtin="lightbulb"
              :trigger-label="settingsStore.smartPageDisplayName"
              force-show
            />
          </div>
        </div>

        <nav class="sv-nav">
          <!-- 收起 / 展开：位于左侧菜单顶部，与菜单项同宽左对齐 -->
          <button
            type="button"
            class="tw-btn tw-btn-sm sv-nav-collapse"
            :aria-expanded="!sidebarCollapsed"
            :title="sidebarCollapsed ? '展开菜单' : '收起菜单'"
            data-testid="smart-collapse-sidebar"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            <Icon :name="sidebarCollapsed ? 'chevron-right' : 'chevron-left'" :size="14" />
            <span class="sv-collapse-text">{{ sidebarCollapsed ? '展开' : '收起' }}</span>
          </button>

          <button
            v-for="p in menuItems"
            :key="p.key"
            type="button"
            class="sv-nav-item"
            :class="{ active: activePage === p.key }"
            :title="p.label"
            :data-testid="`smart-nav-${p.key}`"
            @click="selectPage(p.key)"
          >
            <span class="sv-nav-icon"><Icon :name="p.icon" :size="16" /></span>
            <span class="sv-nav-label">{{ p.label }}</span>
            <span v-if="p.count !== undefined" class="sv-nav-count">{{ p.count }}</span>
          </button>
        </nav>

        <!-- 侧栏底部恒定两枚按钮：与个人 / 健康工作台同规格（各 50%、纯文字、折叠态仅图标） -->
        <div class="sv-side-foot" data-testid="smart-side-foot">
          <button
            type="button"
            class="sv-side-btn sv-sync-btn ui-btn--pill"
            :class="syncStatusClass"
            :title="syncTip"
            :aria-label="syncLabel"
            data-testid="smart-sync-now"
            :disabled="syncBusy"
            @click="handleSyncNowClick"
          >
            <span class="sv-side-btn-ic" aria-hidden="true"><Icon name="cloud" :size="14" /></span>
            <span class="sv-side-btn-text">{{ syncLabel }}</span>
          </button>
          <button
            type="button"
            class="sv-side-btn ui-btn--pill"
            title="左侧菜单 / 技能分类"
            aria-label="设置"
            data-testid="smart-settings-entry"
            @click="showSettings = true; closeMobileMenu()"
          >
            <span class="sv-side-btn-ic" aria-hidden="true"><Icon name="cog" :size="15" /></span>
            <span class="sv-side-btn-text">设置</span>
          </button>
        </div>
      </aside>

      <!-- 移动端抽屉遮罩：层级低于抽屉（46）、高于内容区 -->
      <div v-if="mobileMenuOpen" class="sv-scrim" data-testid="smart-menu-scrim" @click="closeMobileMenu"></div>

      <main class="sv-content">
        <!-- 移动端抽屉入口（桌面隐藏） -->
        <button class="sv-menu-trigger" data-testid="smart-menu-trigger" title="全部菜单" aria-label="打开全部菜单" @click="mobileMenuOpen = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <!-- KeepAlive：切页不销毁列表组件，保住搜索词 / 分类 / 标签 / 排序 / 页码。
             KeepAlive 只接受「单个」子节点：所有页面必须收敛成一个动态组件。
             概览的统计卡会 emit goto 跳到对应菜单；其它页没有该事件，
             故用条件 v-on 绑定，避免把 onGoto 透传到它们的根元素上。 -->
        <KeepAlive>
          <component
            :is="activePageComponent"
            v-on="activePage === 'overview' ? { goto: selectPage } : {}"
          />
        </KeepAlive>
      </main>
    </div>

    <!-- 设置弹窗：左侧菜单 + 技能分类 -->
    <SmartSettingsDialog v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.sv-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  min-height: 100vh;
  background-color: var(--color-bg, #f8fafc);
  color: var(--color-text);
}

/* ---------- 主体：左菜单 + 右内容（与个人工作台同构，无顶栏） ---------- */
.sv-body {
  display: flex;
  align-items: stretch;
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
}

.sv-sidebar {
  flex: 0 0 200px;
  width: 200px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  background-color: var(--color-bg-card, #ffffff);
  border-right: 1px solid var(--color-border, #e2e8f0);
}

/* 侧栏第一项「切换其它页面」：与个人 / 健康工作台同槽位、同触发器外观；下拉仍由组件 Teleport 到 body */
.sv-side-top { flex: none; padding: 10px 8px 2px; }
.sv-side-switch { margin-bottom: 6px; }
.sv-side-switch :deep(.ws-root) { display: flex; width: 100%; }
.sv-side-switch :deep(.ws-trigger) {
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
.sv-side-switch :deep(.ws-trigger:hover) {
  background-color: var(--color-bg-card);
  border-color: var(--color-primary);
  color: var(--color-text);
}
.sv-side-switch :deep(.ws-trigger-label) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }

/* 中部：菜单可滚动，底部两枚按钮不随菜单滚走 */
.sv-nav {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 8px 8px;
}

/* 收起 / 展开：外观复用教师台 `.tw-btn .tw-btn-sm`（白底描边胶囊、30px 高、12px/500、
   hover 只变底色），本类只留布局——整行铺满 + 左对齐 + 与菜单项同宽。
   与个人/销售工作台的 .wb-sidebar-toggle / .bs-sidebar-toggle 同一套取值。 */
.sv-nav-collapse {
  display: flex;
  width: 100%;
  flex-shrink: 0;
  justify-content: flex-start;
  margin-bottom: var(--space-1);
}

.sv-nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background-color: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}

.sv-nav-item:hover { background-color: var(--color-bg-hover, #f1f5f9); }

.sv-nav-item.active {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary-text);
  font-weight: var(--font-weight-medium, 500);
}

.sv-nav-item:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: -2px;
}

.sv-nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  color: inherit;
}

.sv-nav-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sv-nav-count {
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 999px;
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs, 11px);
}

/* 侧栏底部恒定两枚按钮：皮肤全部交给全局 .ui-btn--pill，本地只定布局。
   与个人 / 健康 / 博客后台同规格：flex:1 各 50%、桌面 32px、展开纯文字、折叠仅图标。 */
.sv-side-foot {
  flex: none;
  display: flex;
  gap: 6px;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--color-border, #e2e8f0);
}
.sv-side-btn {
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
.sv-side-btn-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.sv-side-btn-ic { display: none; flex: none; color: var(--color-primary); }
.sv-sync-btn { transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease, opacity 120ms ease; }

.sv-content {
  flex: 1 1 auto;
  min-width: 0;
  padding: 16px clamp(12px, 2vw, 24px) 32px;
  overflow-y: auto;
  background-color: var(--color-bg, #f8fafc);
  font-variant-numeric: tabular-nums;
}

/* ---------- 收起态：56px 侧栏，切换控件与菜单项图标化 ---------- */
.sv-shell.is-collapsed .sv-sidebar { flex-basis: 56px; width: 56px; }
.sv-shell.is-collapsed .sv-side-top { padding: 10px 6px 2px; }
.sv-shell.is-collapsed .sv-side-switch :deep(.ws-trigger) { height: 32px; padding: 0; justify-content: center; }
.sv-shell.is-collapsed .sv-side-switch :deep(.ws-trigger-label),
.sv-shell.is-collapsed .sv-side-switch :deep(.ws-trigger-caret) { display: none; }
.sv-shell.is-collapsed .sv-nav { padding: 2px 6px 8px; }
.sv-shell.is-collapsed .sv-nav-label,
.sv-shell.is-collapsed .sv-nav-count,
.sv-shell.is-collapsed .sv-collapse-text { display: none; }
.sv-shell.is-collapsed .sv-nav-item,
.sv-shell.is-collapsed .sv-nav-collapse { justify-content: center; padding: 0; }
.sv-shell.is-collapsed .sv-side-foot { padding: 8px 6px 10px; }
.sv-shell.is-collapsed .sv-side-btn-text { display: none; }
.sv-shell.is-collapsed .sv-side-btn-ic { display: inline-flex; }

/* 桌面不渲染移动端抽屉的两个入口（窄端媒体查询放在其后，后声明胜出） */
.sv-scrim, .sv-menu-trigger { display: none; }

/* ---------- 移动端：与个人 / 健康工作台一致的左侧抽屉 ---------- */
@media (max-width: 768px) {
  .sv-sidebar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 46;
    width: min(264px, 82%);
    flex-basis: auto;
    transform: translateX(-102%);
    transition: transform 220ms ease;
    box-shadow: 2px 0 12px var(--color-shadow, rgba(0, 0, 0, 0.12));
  }
  .sv-sidebar.open { transform: none; }

  /* 抽屉里恢复完整文字菜单与底部两枚纯文字按钮；触控目标对齐个人工作台 */
  .sv-nav { flex-direction: column; gap: 2px; overflow-x: hidden; padding: 2px 8px 8px; }
  .sv-nav-collapse { display: none; }
  .sv-nav-item {
    flex: 0 0 auto;
    width: 100%;
    min-height: 44px;
    min-width: 44px;
    padding: 9px 10px;
    border: 1px solid transparent;
  }
  .sv-side-foot { padding: 8px 10px 10px; gap: 6px; }
  .sv-side-btn { height: 40px; min-height: 40px; padding: 0 6px; gap: 6px; }
  .sv-side-btn-text { display: inline; }
  .sv-side-btn-ic { display: none; }

  /* 抽屉内不沿用桌面折叠态：一律展开显示文字 */
  .sv-shell.is-collapsed .sv-sidebar { width: min(264px, 82%); }
  .sv-shell.is-collapsed .sv-side-top { padding: 10px 8px 2px; }
  .sv-shell.is-collapsed .sv-side-switch :deep(.ws-trigger) { height: 34px; padding: 0 8px 0 10px; justify-content: flex-start; }
  .sv-shell.is-collapsed .sv-side-switch :deep(.ws-trigger-label),
  .sv-shell.is-collapsed .sv-side-switch :deep(.ws-trigger-caret) { display: inline; }
  .sv-shell.is-collapsed .sv-nav { padding: 2px 8px 8px; }
  .sv-shell.is-collapsed .sv-nav-label { display: inline; }
  .sv-shell.is-collapsed .sv-nav-count { display: inline; }
  .sv-shell.is-collapsed .sv-nav-item,
  .sv-shell.is-collapsed .sv-nav-collapse { justify-content: flex-start; padding: 9px 10px; }
  .sv-shell.is-collapsed .sv-side-foot { padding: 8px 10px 10px; }
  .sv-shell.is-collapsed .sv-side-btn-text { display: inline; }
  .sv-shell.is-collapsed .sv-side-btn-ic { display: none; }

  .sv-scrim {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 45;
    background: rgba(15, 23, 42, .32);
  }
  .sv-menu-trigger {
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
  .sv-content { padding: 12px 12px calc(24px + env(safe-area-inset-bottom, 0px)); }
  html.dark .sv-sidebar {
    border-right-color: var(--color-border, #374151);
    box-shadow: 2px 0 16px var(--color-shadow, rgba(0, 0, 0, 0.4));
  }
}

@media (prefers-reduced-motion: reduce) {
  .sv-nav-item, .sv-sidebar { transition: none; }
}
</style>
