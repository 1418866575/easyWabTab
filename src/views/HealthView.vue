<script setup lang="ts">
/**
 * 健康工作台：从个人工作台独立出来的单一功能工作台。
 * - 布局与个人工作台一致：左侧菜单 + 右侧 .wb-content.panel-scope 内容区
 * - 四个指标菜单直接渲染原有子面板，类名沿用 .wb-*，让全局 .wb-content .stat-* 规则生效
 * - 数据仍复用 useWorkbenchHealthStore（IDB store 'health'），不新建第二份数据
 * - 当前指标写进 URL query，刷新/分享后仍停在同一面板
 */
import { computed, defineAsyncComponent, onMounted, ref, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCloudSync } from '@/composables/useCloudSync'
import type { SyncStatus } from '@/composables/useCloudSync'
import { HEALTH_TABS, type HealthModule } from '@/types'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { useCountdownsStore } from '@/stores/countdowns'
import { useAppSettingsStore } from '@/stores/settings'
import {
  HEALTH_MENU_KEYS,
  HEALTH_MENU_DEFAULT_LABELS,
  HEALTH_MENU_ICONS
} from '@/composables/healthMenuCore'
import WorkbenchExercise from '@/components/workbench/WorkbenchExercise.vue'
import WorkbenchDiet from '@/components/workbench/WorkbenchDiet.vue'
import WorkbenchSleep from '@/components/workbench/WorkbenchSleep.vue'
import WorkbenchWeight from '@/components/workbench/WorkbenchWeight.vue'
import HealthRecipes from '@/components/health/HealthRecipes.vue'
import WorkbenchSwitcher from '@/components/WorkbenchSwitcher.vue'
import Icon from '@/components/Icon.vue'

const route = useRoute()
const router = useRouter()
const healthStore = useWorkbenchHealthStore()
const countdownsStore = useCountdownsStore()
const settings = useAppSettingsStore()
const HealthSettingsDialog = defineAsyncComponent(() => import('@/components/health/HealthSettingsDialog.vue'))
const initializing = ref(true)
const showSettingsDialog = ref(false)
/** 移动端左侧抽屉：默认收起，由页头菜单按钮唤出（与个人工作台同款，不再用 60px 常驻图标条） */
const mobileMenuOpen = ref(false)
function closeMobileMenu(): void {
  mobileMenuOpen.value = false
}

// 侧栏底部「云同步 / 设置」：与个人工作台同款两枚按钮
const cloudSync = useCloudSync()
const syncBusy = ref(false)
const cloudEnabled = computed(() => !!settings.cloudSyncEnabled)
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
/** 侧栏按钮主文案：随同步状态变化显示 拉取中 / 推送中 / 已同步 / 同步失败 / 未开启 */
const syncButtonText = computed((): string => {
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
  if (!cloudEnabled.value) return '云同步未开启；点击打开设置'
  const t = cloudSync.lastSyncAt.value
  return t ? `上次同步：${new Date(t).toLocaleString()}；点击立即同步` : '未同步过；点击立即同步'
})
async function handleSyncNowClick(): Promise<void> {
  // 未开启时这枚按钮就是「去设置」的入口
  if (!cloudEnabled.value) {
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

/** 菜谱是内容页，不属于 4 个健康指标；单独扩一个视图 tab，避免污染被学生端复用的 HealthModule */
type HealthViewTab = HealthModule | 'recipes'

/** 每个面板固定的描述与组件（与顺序/改名无关，仅按 key 映射） */
const PANELS: Record<HealthViewTab, { desc: string; panel: Component }> = {
  exercise: { desc: '记录运动时长与消耗，查看周目标与跟练进度。', panel: WorkbenchExercise },
  diet: { desc: '按餐次记录饮食与热量，查看日目标与食谱方案。', panel: WorkbenchDiet },
  sleep: { desc: '记录入睡与起床时间，查看睡眠时长与质量。', panel: WorkbenchSleep },
  weight: { desc: '记录体重变化，查看 BMI 分级与趋势折线。', panel: WorkbenchWeight },
  recipes: { desc: '按卡片浏览家常菜谱，查看成品图、食材、做法与食品安全注意事项。', panel: HealthRecipes }
}
/** 左侧菜单：顺序 / 改名 / 显隐来自 settings.healthMenuItems（在设置弹窗里调整即时生效）。
 *  store 初始化完成前 healthMenuItems 可能短暂为空，这里回退到 4 个默认项，避免首帧崩溃。 */
const menuSource = computed(() => {
  const items = settings.healthMenuItems
  return items.length
    ? items
    : HEALTH_MENU_KEYS.map((k) => ({
        key: k,
        label: HEALTH_MENU_DEFAULT_LABELS[k],
        icon: HEALTH_MENU_ICONS[k]
      }))
})
const MENU = computed(() => [
  ...menuSource.value.map((m) => ({
    key: m.key as HealthModule,
    label: m.label,
    icon: m.icon,
    desc: PANELS[m.key as HealthModule].desc,
    panel: PANELS[m.key as HealthModule].panel
  })),
  // 菜谱不纳入 settings 的排序 / 改名 / 显隐配置，固定追加在菜单末尾
  {
    key: 'recipes' as HealthViewTab,
    label: '菜谱',
    icon: 'recipe',
    desc: PANELS.recipes.desc,
    panel: PANELS.recipes.panel
  }
])

const VIEW_TABS: readonly string[] = [...HEALTH_TABS, 'recipes']
const activeTab = ref<HealthViewTab>(
  VIEW_TABS.includes(route.query.tab as string)
    ? (route.query.tab as HealthViewTab)
    : 'exercise'
)
const current = computed(() => MENU.value.find((m) => m.key === activeTab.value) ?? MENU.value[0])
const activePanel = computed<Component>(() => current.value.panel)

function setTab(tab: HealthViewTab): void {
  activeTab.value = tab
  // 抽屉里点菜单后自动收起，否则选中项被遮罩挡着看不到
  closeMobileMenu()
  void router.replace({ query: { ...route.query, tab } })
}

onMounted(async () => {
  try {
    // 提醒区块只读 countdowns store（category = exercise/diet/sleep），需一并加载
    await Promise.all([healthStore.loadHealth(), countdownsStore.loadCountdowns()])
  } finally {
    initializing.value = false
  }
})
</script>

<template>
  <div class="wb-shell wb-scope">
    <div class="wb-body">
      <nav class="wb-menu" :class="{ open: mobileMenuOpen }" aria-label="健康指标导航">
        <div class="wb-side-top">
          <div class="wb-side-switch">
            <WorkbenchSwitcher :trigger-label="settings.healthPageDisplayName" force-show />
          </div>
        </div>

        <div class="wb-side-nav">
          <button
            v-for="item in MENU"
            :key="item.key"
            type="button"
            class="wb-menu-item"
            :class="{ active: activeTab === item.key }"
            :title="item.label"
            :aria-label="item.label"
            :data-testid="`hv-menu-${item.key}`"
            @click="setTab(item.key)"
          >
            <span class="wb-menu-icon"><Icon :name="item.icon" /></span>
            <span class="wb-menu-label">{{ item.label }}</span>
          </button>
        </div>

        <div class="wb-side-foot" data-testid="hv-side-foot">
          <button
            type="button"
            class="wb-side-btn wb-sync-btn"
            :class="syncStatusClass"
            :title="syncTip"
            :aria-label="syncLabel"
            data-testid="hv-sync-now"
            :disabled="cloudEnabled && (syncBusy || cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing')"
            @click="handleSyncNowClick"
          >
            <span class="wb-side-btn-ic" aria-hidden="true"><Icon name="cloud" :size="14" /></span>
            <span class="wb-side-btn-text">{{ syncButtonText }}</span>
          </button>
          <button
            type="button"
            class="wb-side-btn"
            title="设置"
            aria-label="设置"
            data-testid="hv-settings"
            @click="showSettingsDialog = true; closeMobileMenu()"
          >
            <span class="wb-side-btn-ic" aria-hidden="true"><Icon name="cog" :size="15" /></span>
            <span class="wb-side-btn-text">设置</span>
          </button>
        </div>
      </nav>

      <!-- 移动端抽屉遮罩：层级低于抽屉（46）、高于内容区 -->
      <div v-if="mobileMenuOpen" class="wb-scrim" data-testid="hv-menu-scrim" @click="closeMobileMenu"></div>

      <main class="wb-content panel-scope">
        <button class="wb-menu-trigger" data-testid="hv-menu-trigger" title="全部菜单" aria-label="打开全部菜单" @click="mobileMenuOpen = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <div class="panel-page-head" data-testid="hv-page-head">
          <h2 class="panel-page-title" data-testid="hv-page-title">{{ current.label }}</h2>
          <p class="panel-page-sub" data-testid="hv-page-sub">{{ current.desc }}</p>
        </div>
        <p v-if="initializing" class="hv-loading">正在加载健康数据…</p>
        <div v-else class="wb-health">
          <KeepAlive :max="5">
            <component :is="activePanel" :key="activeTab" />
          </KeepAlive>
        </div>
      </main>
    </div>
    <HealthSettingsDialog
      v-if="showSettingsDialog"
      @close="showSettingsDialog = false"
    />
  </div>
</template>

<style scoped>
/* 布局与个人工作台 WorkbenchView 同源：同类名、同 token 取值，不另造一套尺寸。
   内容区用 .wb-content.panel-scope，使全局 .wb-content .stat-* 规则对四个健康子面板生效。 */
.wb-shell {
  height: 100dvh;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg, #f8fafc);
  color: var(--color-text);
}
.wb-scope {
  --wb-sidebar-w: 200px;
  --wb-content-pad: var(--ui-content-pad, 16px);
  --wb-card-min: 180px;
}
.wb-body { flex: 1; display: flex; min-height: 0; position: relative; }
.wb-menu {
  width: var(--wb-sidebar-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background-color: var(--color-bg-card, #ffffff);
  border-right: 1px solid var(--color-border, #e2e8f0);
}
.wb-side-top { flex: none; padding: 10px 8px 2px; }
.wb-side-switch { margin-bottom: 6px; }
.wb-side-switch :deep(.ws-root) { display: flex; width: 100%; }
.wb-side-switch :deep(.ws-trigger) {
  width: 100%; height: 34px; gap: 8px; padding: 0 8px 0 10px;
  border-color: transparent; border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-hover); color: var(--color-text-secondary);
  font-size: var(--fs-caption);
}
.wb-side-switch :deep(.ws-trigger-label) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.wb-side-nav {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 2px; padding: 2px 8px 8px;
}
.wb-menu-item {
  display: flex; align-items: center; gap: var(--space-2);
  padding: 9px 10px; border: 1px solid transparent; border-radius: var(--radius-sm, 4px);
  background-color: transparent; color: var(--color-text-secondary);
  font-size: var(--font-size-sm, 13px); text-align: left; cursor: pointer;
  transition: background-color var(--motion-duration, 220ms) var(--motion-ease, ease),
    color var(--motion-duration, 220ms) var(--motion-ease, ease);
}
.wb-menu-item:hover { background-color: var(--color-bg-hover, #f1f5f9); }
.wb-menu-item.active {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary-text);
  font-weight: var(--font-weight-medium, 500);
}
.wb-menu-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.wb-menu-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-side-foot { flex: none; display: flex; gap: 6px; padding: 8px 10px 10px; border-top: 1px solid var(--color-border, #e2e8f0); }
.wb-side-btn {
  flex: 1 1 0; min-width: 0; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--color-border, #e2e8f0); border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-hover, #f8fafc); color: var(--color-text-secondary);
  font-size: var(--fs-caption); white-space: nowrap; cursor: pointer;
}
.wb-side-btn:hover { background-color: var(--color-bg-hover, #f1f5f9); color: var(--color-text); }
.wb-side-btn-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.wb-side-btn-ic { display: none; flex: none; color: var(--color-primary); }
.wb-sync-btn { transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease, opacity 120ms ease; }
.wb-content {
  flex: 1; padding: var(--ui-content-pad); overflow-y: auto;
  display: flex; flex-direction: column;
  background-color: var(--color-bg, #f8fafc);
  font-variant-numeric: tabular-nums;
}
.wb-health { width: 100%; --wb-dialog-z: 300; }
.hv-loading { font-size: var(--fs-caption); color: var(--color-text-muted); }

/* 桌面一屏契约：与个人工作台一致 —— 内容区是唯一滚动容器，面板随内容自然撑开 */
@media (min-width: 769px) {
  .wb-content { overflow-x: hidden; overflow-y: auto; }
  .wb-content > * { flex: 0 0 auto; }
  .wb-health { display: flex; flex-direction: column; }
}

/* 桌面不渲染移动端抽屉的两个入口（窄端媒体查询放在其后，后声明胜出） */
.wb-scrim, .wb-menu-trigger { display: none; }

/* 移动端：对齐个人工作台的左侧抽屉 —— 默认收起、页头按钮唤出、遮罩点击关闭。
   旧实现是把侧栏压成 60px 常驻图标条：菜单文字与底部按钮文案全被隐藏，
   且没有遮罩与关闭手势，拇指区也够不到。 */
@media (max-width: 768px) {
  .wb-content { overflow-y: auto; }
  .wb-content > * { flex: none; }

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

  /* 抽屉里恢复完整文字菜单与底部两枚纯文字按钮；触控目标对齐个人工作台 */
  .wb-menu-item { justify-content: flex-start; padding: 9px 10px; min-height: 44px; min-width: 44px; }
  .wb-menu-label { display: inline; overflow: visible; text-overflow: clip; white-space: nowrap; }
  .wb-side-foot { padding: 8px 10px 10px; gap: 6px; }
  .wb-side-btn { height: 40px; min-height: 40px; padding: 0 6px; gap: 6px; }
  .wb-side-btn-text { display: inline; }
  .wb-side-btn-ic { display: none; }

  /* 遮罩低于抽屉（46）、高于内容区 */
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

  /* 健康工作台四个面板都没有悬浮 FAB（FAB 只在便签 / 密码 / 打卡 / 家谱），
     故不照搬个人工作台的 120px 底部留白：只留常规呼吸空间 + 系统手势安全区。 */
  .wb-content {
    padding: 12px 12px calc(24px + env(safe-area-inset-bottom, 0px));
  }

  html.dark .wb-menu {
    border-right-color: var(--color-border, #374151);
    box-shadow: 2px 0 16px var(--color-shadow, rgba(0, 0, 0, 0.4));
  }
}
html.dark .wb-shell { background-color: var(--color-bg, #111827); }
html.dark .wb-side-foot { border-color: var(--color-border, #374151); }
</style>
