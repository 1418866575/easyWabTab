<script setup lang="ts">
/**
 * 智能工作台主视图（路由 /smart）
 * 布局与 TeacherView 一致：顶部工作台切换入口（WorkbenchManagePanel）+ 左菜单 + 右内容。
 * 三个菜单项：概览 / 技能管理 / 提示词管理；不再单独放「返回导航站」按钮，
 * 导航站入口统一收进左上角的工作台切换面板（与其它工作台页面同款）。
 */
import { computed, ref, watch } from 'vue'
import Icon from '@/components/Icon.vue'
import WorkbenchManagePanel from '@/components/WorkbenchManagePanel.vue'
import SmartOverview from '@/components/smart/SmartOverview.vue'
import SkillManager from '@/components/smart/SkillManager.vue'
import PromptManager from '@/components/smart/PromptManager.vue'
import SmartSettingsDialog from '@/components/smart/SmartSettingsDialog.vue'
import { useAppSettingsStore } from '@/stores/settings'
import { useSmartStore } from '@/stores/smart'
import { useCloudSync, type SyncStatus } from '@/composables/useCloudSync'
import { useToast } from '@/composables/useToast'

type PageKey = 'overview' | 'skills' | 'prompts'

const settingsStore = useAppSettingsStore()
const store = useSmartStore()

const activePage = ref<PageKey>('overview')
const sidebarCollapsed = ref(false)
/** 右上角「设置」入口：左侧菜单配置 + 技能分类管理 */
const showSettings = ref(false)

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
    label: i.label,
    icon: i.icon,
    ...(i.key === 'skills' ? { count: store.skills.length } : {}),
    ...(i.key === 'prompts' ? { count: store.prompts.length } : {})
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
}

// ---------- 右上角云同步（共享 useCloudSync 单例；智能工作台数据走独立的 smart.json 信封） ----------
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
    <!-- 顶部：工作台切换入口 + 标题 -->
    <header class="sv-topbar">
      <div class="sv-topbar-left">
        <!-- 左上角「工作台管理」同款入口：点击弹出工作台切换面板（与教师/销售/学生工作台一致） -->
        <WorkbenchManagePanel
          :trigger-icon="settingsStore.smartPageIcon"
          trigger-builtin="lightbulb"
          :trigger-label="settingsStore.smartPageDisplayName"
          force-show
        />
        <div class="sv-heading">
          <h1 class="sv-title">{{ settingsStore.smartPageDisplayName }}</h1>
          <p class="sv-sub">把反复重写的 AI 技能与提示词，沉淀成可检索、可复用、可搬运的资产库</p>
        </div>
      </div>
      <div class="sv-topbar-actions">
        <!-- 云同步：智能工作台数据走独立的 smart.json 信封 -->
        <button
          type="button"
          class="sv-btn sv-btn-sm sv-sync-btn"
          :class="syncStatusClass"
          :title="syncTip"
          data-testid="smart-sync-now"
          :disabled="syncBusy"
          @click="handleSyncNowClick"
        >
          <Icon name="cloud" :size="14" />
          <span class="sv-sync-text">{{ syncLabel }}</span>
        </button>
        <!-- 最右侧固定「设置」：左侧菜单（改名 / 显隐 / 排序）+ 技能分类 -->
        <button
          type="button"
          class="sv-btn sv-btn-sm sv-settings-btn"
          title="左侧菜单 / 技能分类"
          data-testid="smart-settings-entry"
          @click="showSettings = true"
        >
          <Icon name="cog" :size="15" />
          <span class="sv-settings-text">设置</span>
        </button>
      </div>
    </header>

    <!-- 主体：左菜单 + 右内容 -->
    <div class="sv-body">
      <aside class="sv-sidebar" aria-label="智能工作台功能导航">
        <nav class="sv-nav">
          <!-- 收起 / 展开：位于左侧菜单顶部，与菜单项同宽左对齐 -->
          <button
            type="button"
            class="sv-nav-collapse"
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
      </aside>

      <main class="sv-content">
        <!-- 概览的统计卡 / 最近使用会 emit goto 跳到对应菜单；另两页无该事件 -->
        <SmartOverview v-if="activePage === 'overview'" @goto="selectPage" />
        <SkillManager v-else-if="activePage === 'skills'" />
        <PromptManager v-else />
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
  color: var(--color-text, #0f172a);
}

/* ---------- 顶栏 ---------- */
.sv-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  /* 不换行：右侧操作区（含最右的「设置」）始终固定在同一行最右端 */
  flex-wrap: nowrap;
  padding: 12px 16px;
  background-color: var(--color-bg-card, #ffffff);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.sv-topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  /* 左侧可压缩（标题过长时省略），保证右侧按钮组不被挤出可视区 */
  flex: 0 1 auto;
  overflow: hidden;
}

.sv-heading { display: flex; flex-direction: column; gap: 2px; min-width: 0; }

.sv-title {
  margin: 0;
  font-size: var(--font-size-2xl, 20px);
  font-weight: var(--font-weight-semibold, 600);
  line-height: var(--line-height-tight, 1.3);
  color: var(--color-text, #0f172a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sv-sub {
  margin: 0;
  font-size: var(--font-size-sm, 12px);
  color: var(--color-text-secondary, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 顶栏操作区：云同步 + 设置（固定最右，尺寸/圆角与个人工作台 .wb-btn 同款） ---------- */
.sv-topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 固定在最右侧：不伸缩、不换行、不被左侧内容挤走 */
  flex: 0 0 auto;
  margin-left: auto;
  white-space: nowrap;
}

.sv-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: background-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    border-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    opacity 120ms ease;
}

.sv-btn:hover { background-color: var(--color-bg-hover, #f1f5f9); }

.sv-btn:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 2px;
}

.sv-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sv-btn-sm {
  min-height: 30px;
  padding: 0 10px;
  font-size: var(--font-size-xs, 12px);
}

/* 云同步按钮：状态色与首页/教师工作台完全一致 */
.sv-sync-btn {
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease, opacity 120ms ease;
}

.sv-sync-btn.sv-sync-btn-pending {
  background-color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  color: #fff;
  opacity: 0.88;
  cursor: progress;
}

/* 冲突态用橙色：走 --color-warning 令牌（规范 §1.5：语义色不写死） */
.sv-sync-btn.sv-sync-btn-conflict {
  background-color: var(--color-warning, #f59e0b);
  border-color: var(--color-warning, #f59e0b);
  color: #fff;
}

.sv-sync-btn.sv-sync-btn-error {
  background-color: var(--color-danger, #ef4444);
  border-color: var(--color-danger, #ef4444);
  color: #fff;
}

/* ---------- 主体 ---------- */
.sv-body {
  display: flex;
  align-items: stretch;
  gap: 0;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.sv-sidebar {
  flex: 0 0 200px;
  width: 200px;
  padding: 12px 10px;
  background-color: var(--color-bg-card, #ffffff);
  border-right: 1px solid var(--color-border, #e2e8f0);
  position: sticky;
  top: 0;
  max-height: calc(100vh - 64px);
  overflow-y: auto;
}

.sv-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sv-nav-collapse {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-start;
  flex-shrink: 0;
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  margin-bottom: 4px;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background-color: transparent;
  color: var(--color-text-muted, #94a3b8);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
  cursor: pointer;
}

.sv-nav-collapse:hover { background-color: var(--color-bg-hover, #f1f5f9); }

.sv-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background-color: transparent;
  color: var(--color-text, #0f172a);
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
  color: var(--color-primary, #3b82f6);
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
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 11px);
}

.sv-content {
  flex: 1 1 auto;
  min-width: 0;
  padding: 16px clamp(12px, 2vw, 24px) 32px;
  overflow-y: auto;
}

/* ---------- 收起态 ---------- */
.sv-shell.is-collapsed .sv-sidebar {
  flex-basis: 56px;
  width: 56px;
  padding-left: 6px;
  padding-right: 6px;
}

.sv-shell.is-collapsed .sv-nav-label,
.sv-shell.is-collapsed .sv-nav-count,
.sv-shell.is-collapsed .sv-collapse-text {
  display: none;
}

.sv-shell.is-collapsed .sv-nav-item,
.sv-shell.is-collapsed .sv-nav-collapse {
  justify-content: center;
  padding: 0;
}

/* ---------- 移动端：菜单转为顶部横向滚动条，内容单列 ---------- */
@media (max-width: 768px) {
  .sv-body { flex-direction: column; }

  .sv-sidebar {
    position: static;
    flex: 0 0 auto;
    width: 100%;
    max-height: none;
    border-right: none;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
    overflow-x: auto;
    overflow-y: hidden;
  }

  .sv-nav { flex-direction: row; gap: 6px; }

  /* 移动端没有「收起」的必要：横向胶囊菜单本身已很省空间 */
  .sv-nav-collapse { display: none; }

  .sv-nav-item {
    flex: 0 0 auto;
    width: auto;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 999px;
  }

  .sv-shell.is-collapsed .sv-sidebar { flex-basis: auto; width: 100%; }
  .sv-shell.is-collapsed .sv-nav-item { padding: 0 14px; }
  .sv-shell.is-collapsed .sv-nav-label { display: block; }
  .sv-shell.is-collapsed .sv-nav-count { display: inline; }
  .sv-sub { display: none; }

  /* 窄屏顶栏只留图标，避免换行 */
  .sv-sync-text,
  .sv-settings-text { display: none; }

  .sv-btn { min-height: 44px; padding: 0 16px; }
  .sv-btn-sm { min-height: 44px; padding: 0 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .sv-nav-item { transition: none; }
}
</style>
