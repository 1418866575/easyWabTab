<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { useAppSettingsStore } from '../stores/settings'

// 导航站右上角「工作台管理」按钮 + 按钮正下方的下拉面板。
// 面板以卡片形式列出各工作台，卡片视觉对齐导航站网站卡片（SiteCard）。
// 只列出开关已开启的工作台；卡片点击跳转对应路由；点外部 / ESC / 窗口尺寸变化即关闭。
// 面板用 Teleport 挂到 body + fixed 定位：app-bar 有 backdrop-filter 会成为 fixed 包含块，
// 且移动端 .app-bar-right 是 overflow-x:auto，直接 absolute 会被裁切。
const router = useRouter()
const store = useAppSettingsStore()

// 允许各工作台页面复用本组件：通过 props 自定义触发器图标（站点图标）/ 文字 / 强制显示，
// 从而与导航站「工作台管理」保持同一套面板与卡片交互，仅触发器外观不同。
const props = withDefaults(defineProps<{
  /** 触发器自定义图标（图标库路径 / dataUrl）；空串回退到 triggerBuiltin */
  triggerIcon?: string
  /** 触发器内置图标名（无自定义图标时显示） */
  triggerBuiltin?: string
  /** 触发器文字；空串回退到 store.workbenchManageDisplayName */
  triggerLabel?: string
  /** 强制显示触发器（绕过「工作台管理」全局可见性开关），用于各工作台页面右上角 */
  forceShow?: boolean
}>(), {
  triggerIcon: '',
  triggerBuiltin: '',
  triggerLabel: '',
  forceShow: false
})

interface Entry {
  key: string
  path: string
  name: string
  /** 自定义图标（图标库路径 / dataUrl）；空串表示回退内置图标 */
  icon: string
  builtin: string
  visible: boolean
}

// 顺序：导航站（首页）置首，其后与左上角入口按钮保持一致：教师台 → 工作台 → 销售记账 → 学生台
const entries = computed<Entry[]>(() => [
  {
    key: 'nav',
    path: '/',
    name: '导航站',
    // 站点图标取「导航设置 → 站点图标」（store.siteFavicon）；未设置时回退内置 home 图标
    icon: store.siteFavicon || '',
    builtin: 'home',
    visible: true
  },
  {
    key: 'teacher',
    path: '/teacher',
    name: store.teacherPageDisplayName,
    icon: store.teacherPageIcon,
    builtin: 'teacher',
    visible: store.teacherPageVisible !== false
  },
  {
    key: 'workbench',
    path: '/workbench',
    name: store.workbenchPageDisplayName,
    icon: store.workbenchPageIcon,
    builtin: 'toolbox',
    visible: store.workbenchPageVisible !== false
  },
  {
    key: 'business',
    path: '/business',
    name: store.businessPageDisplayName,
    icon: store.businessPageIcon,
    builtin: 'store',
    visible: store.businessPageVisible !== false
  },
  {
    key: 'student',
    path: '/student',
    name: store.studentPageDisplayName,
    icon: store.studentPageIcon,
    builtin: 'notes',
    visible: store.studentPageVisible !== false
  }
])

const visibleEntries = computed<Entry[]>(() => entries.value.filter((e) => e.visible))

const open = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

/** 面板最大宽度（与 CSS 的 min(440px, 100vw-24px) 保持一致，便于边界收拢计算） */
const PANEL_MAX_WIDTH = 440
/** 面板与视口左右边缘的最小留白 */
const EDGE_GAP = 12

function toggle(): void {
  if (open.value) {
    open.value = false
    return
  }
  const el = triggerRef.value
  if (el) {
    const r = el.getBoundingClientRect()
    const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - EDGE_GAP * 2)
    // 默认左缘对齐按钮左缘、向右展开；右侧空间不足时整体左移；最后夹到视口内，
    // 保证按钮在左上角时面板不会溢出屏幕左侧（此前用 right 定位，按钮靠左就会超屏）。
    let left = r.left
    const maxLeft = window.innerWidth - width - EDGE_GAP
    if (left > maxLeft) left = maxLeft
    if (left < EDGE_GAP) left = EDGE_GAP
    panelStyle.value = {
      top: `${Math.round(r.bottom + 8)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`
    }
  }
  open.value = true
}

function go(entry: Entry): void {
  open.value = false
  void router.push(entry.path)
}

function handleOutsideClick(event: MouseEvent): void {
  if (!open.value) return
  const t = event.target as Node
  if (triggerRef.value?.contains(t)) return
  if (panelRef.value?.contains(t)) return
  open.value = false
}

function handleKeydown(event: KeyboardEvent): void {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.stopPropagation()
    open.value = false
  }
}

function handleResize(): void {
  if (open.value) open.value = false
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick, true)
  document.addEventListener('keydown', handleKeydown, true)
  window.addEventListener('resize', handleResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick, true)
  document.removeEventListener('keydown', handleKeydown, true)
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="wmp-root">
    <button
      v-if="props.forceShow || store.workbenchManageVisible !== false"
      ref="triggerRef"
      type="button"
      class="wmp-trigger"
      :aria-expanded="open"
      :title="triggerLabel || store.workbenchManageDisplayName"
      :aria-label="triggerLabel || store.workbenchManageDisplayName"
      data-testid="wmp-trigger"
      @click="toggle"
    >
      <img v-if="props.triggerIcon" :src="props.triggerIcon" alt="" class="wmp-trigger-img" data-testid="wmp-trigger-icon" />
      <Icon v-else-if="props.triggerBuiltin" :name="props.triggerBuiltin" :size="16" class="wmp-trigger-svg" />
      <img v-else-if="store.workbenchManageIcon" :src="store.workbenchManageIcon" alt="" class="wmp-trigger-img" data-testid="wmp-trigger-icon" />
      {{ triggerLabel || store.workbenchManageDisplayName }}
    </button>

    <Teleport to="body">
      <Transition name="wmp-fade">
        <div
          v-if="open"
          ref="panelRef"
          class="wmp-panel"
          :style="panelStyle"
          data-testid="wmp-panel"
          role="menu"
          :aria-label="store.workbenchManageDisplayName"
        >
          <div v-if="visibleEntries.length > 0" class="wmp-grid">
            <button
              v-for="entry in visibleEntries"
              :key="entry.key"
              type="button"
              class="wmp-card"
              role="menuitem"
              :data-testid="`wmp-card-${entry.key}`"
              :title="entry.name"
              @click="go(entry)"
            >
              <span class="wmp-card-icon">
                <img v-if="entry.icon" :src="entry.icon" :alt="entry.name" class="wmp-card-img" />
                <Icon v-else :name="entry.builtin" :size="26" class="wmp-card-svg" />
              </span>
              <span class="wmp-card-name">{{ entry.name }}</span>
            </button>
          </div>
          <p v-else class="wmp-empty">
            暂无已启用的工作台，可在「设置 → 个性化 → 工作台设置」中开启。
          </p>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.wmp-root {
  display: inline-flex;
  align-items: center;
}

/* 触发器按钮：自包含基础样式，导航站与各工作台页面一致；inline-flex + gap 让图标与文字同排，
   视觉对齐导航站 .btn-help */
.wmp-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease;
}
.wmp-trigger:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-border, #e2e8f0);
}
/* 内置图标（无自定义站点图标时）：16px、跟随按钮文字色 */
.wmp-trigger-svg {
  color: currentColor;
}

/* 自定义图标（设置 → 个性化 → 工作台设置 → 工作台管理 选择，或各工作台页面传入的站点图标）：
   16px 与按钮文字同排；未设置时回退到内置图标（props.triggerBuiltin）或纯文字 */
.wmp-trigger-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex: none;
}

/* 面板：fixed 定位（脚本按按钮实际位置计算 top/right），层级高于 app-bar(100)、低于弹窗(300) */
.wmp-panel {
  position: fixed;
  z-index: 250;
  width: min(440px, calc(100vw - 24px));
  padding: 12px;
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

/* 固定 5 列：导航站（首页）置首 + 4 个工作台，等宽等高同尺寸（不再 auto-fill，避免列数随宽度变化） */
.wmp-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

/* 卡片视觉对齐导航站网站卡片（SiteCard）：白底、圆角 10px、padding 14px、轻阴影、hover 上浮 */
.wmp-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.25s ease,
              border-color 0.25s ease;
}

.wmp-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  border-color: var(--color-primary, #3b82f6);
}

.wmp-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--color-bg-hover, #f8fafc);
  overflow: hidden;
}

.wmp-card-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.wmp-card-svg {
  color: var(--color-primary, #3b82f6);
}

.wmp-card-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  text-align: center;
}

.wmp-empty {
  margin: 6px 2px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-muted, #94a3b8);
}

.wmp-fade-enter-active,
.wmp-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.wmp-fade-enter-from,
.wmp-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 768px), (pointer: coarse) {
  /* 窄屏仍保持一行 4 个，只压缩卡片内部间距与图标尺寸 */
  .wmp-grid {
    gap: 6px;
  }
  .wmp-card {
    gap: 6px;
    padding: 10px 4px;
  }
  .wmp-card-icon {
    width: 34px;
    height: 34px;
  }
  .wmp-card-name {
    font-size: 12px;
  }
}

html.dark .wmp-panel {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
html.dark .wmp-card {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
html.dark .wmp-card:hover {
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
}
</style>
