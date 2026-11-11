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

/** 每个指标面板固定的描述与组件（与顺序/改名无关，仅按 key 映射） */
const PANELS: Record<HealthModule, { desc: string; panel: Component }> = {
  exercise: { desc: '记录运动时长与消耗，查看周目标与跟练进度。', panel: WorkbenchExercise },
  diet: { desc: '按餐次记录饮食与热量，查看日目标与食谱方案。', panel: WorkbenchDiet },
  sleep: { desc: '记录入睡与起床时间，查看睡眠时长与质量。', panel: WorkbenchSleep },
  weight: { desc: '记录体重变化，查看 BMI 分级与趋势折线。', panel: WorkbenchWeight }
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
const MENU = computed(() =>
  menuSource.value.map((m) => ({
    key: m.key as HealthModule,
    label: m.label,
    icon: m.icon,
    desc: PANELS[m.key as HealthModule].desc,
    panel: PANELS[m.key as HealthModule].panel
  }))
)

const activeTab = ref<HealthModule>(
  (HEALTH_TABS as readonly string[]).includes(route.query.tab as string)
    ? (route.query.tab as HealthModule)
    : 'exercise'
)
const current = computed(() => MENU.value.find((m) => m.key === activeTab.value) ?? MENU.value[0])
const activePanel = computed<Component>(() => current.value.panel)

function setTab(tab: HealthModule): void {
  activeTab.value = tab
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
      <nav class="wb-menu" aria-label="健康指标导航">
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
            @click="showSettingsDialog = true"
          >
            <span class="wb-side-btn-ic" aria-hidden="true"><Icon name="cog" :size="15" /></span>
            <span class="wb-side-btn-text">设置</span>
          </button>
        </div>
      </nav>

      <main class="wb-content panel-scope">
        <div class="panel-page-head" data-testid="hv-page-head">
          <h2 class="panel-page-title" data-testid="hv-page-title">{{ current.label }}</h2>
          <p class="panel-page-sub" data-testid="hv-page-sub">{{ current.desc }}</p>
        </div>
        <p v-if="initializing" class="hv-loading">正在加载健康数据…</p>
        <div v-else class="wb-health">
          <KeepAlive :max="4">
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

@media (min-width: 769px) {
  .wb-health { display: flex; flex-direction: column; }
}
@media (max-width: 768px) {
  .wb-menu { width: 60px; }
  .wb-menu-label, .wb-side-btn-text { display: none; }
  .wb-menu-item { justify-content: center; padding: 9px 0; }
  .wb-side-btn-ic { display: inline-flex; }
}
html.dark .wb-shell { background-color: var(--color-bg, #111827); }
html.dark .wb-side-foot { border-color: var(--color-border, #374151); }
</style>
