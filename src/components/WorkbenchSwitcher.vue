<script setup lang="ts">
// 左上角「工作台切换」下拉菜单。
// 导航站首页的工作台跳转已迁到卡片列表；其余 8 个页面（教师/个人/销售/学生/智能/
// 工具箱/图书馆/博客后台）复用本组件，点击触发器或 Alt+W 在按钮下方展开下拉。
// 面板只列 7 个工作台入口（图标 + 名称 + 当前徽章），无搜索框、无全屏遮罩；
// 键盘能力保留：Alt+W 唤起 / Alt+1..9 直达 / ↑↓ Home End 选择 / Enter 进入 / Esc 关闭。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { useAppSettingsStore } from '../stores/settings'

// 允许各工作台页面复用本组件：通过 props 自定义触发器图标（站点图标）/ 文字 / 强制显示，
// 从而与导航站「工作台管理」保持同一套面板与切换交互，仅触发器外观不同。
const props = withDefaults(defineProps<{
  /** 触发器自定义图标（图标库路径 / dataUrl）；空串回退到 triggerBuiltin */
  triggerIcon?: string
  /** 触发器内置图标名（无自定义图标时显示） */
  triggerBuiltin?: string
  /** 触发器文字；空串回退到 store.workbenchManageDisplayName */
  triggerLabel?: string
  /** 强制显示触发器（绕过「工作台管理」全局可见性开关），用于各工作台页面左上角 */
  forceShow?: boolean
}>(), {
  triggerIcon: '',
  triggerBuiltin: '',
  triggerLabel: '',
  forceShow: false
})

const router = useRouter()
const route = useRoute()
const store = useAppSettingsStore()

interface Entry {
  key: string
  path: string
  name: string
  /** 自定义图标（图标库路径 / dataUrl）；空串表示回退内置图标 */
  icon: string
  builtin: string
  visible: boolean
  /**
   * 「当前所在页」判定（缺省用 path 精确匹配 + 子路径前缀匹配）。
   * 某工作台下有多个子路由且需要排除某些子路径时，由该项显式提供。
   */
  isCurrentPath?: (p: string) => boolean
  /**
   * 是否在新浏览器标签打开（而非站内路由跳转）。
   * 作为独立阅读面存在的工作台（如博客前台）需要开新标签时使用。
   */
  openInNewTab?: boolean
}

// 顺序：导航站 → 教师台 → 个人工作台 → 销售记账 → 学生台 → 智能工作台 → 博客后台。
// 博客后台名称/图标/可见性走 blogAdminPage* 三件套（设置入口在「个性化 → 主题」）。
// 「工具箱 / 博客前台 / 个人图书馆」均已迁到导航站列表的站内入口卡片，不再出现在本面板
// （工具箱固定在列表第一位，见 stores/sites.ts 的 TOOLBOX_URL）。
const allEntries = computed<Entry[]>(() => [
  {
    key: 'nav',
    path: '/',
    name: '导航站',
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
  },
  {
    key: 'smart',
    path: '/smart',
    name: store.smartPageDisplayName,
    icon: store.smartPageIcon,
    builtin: 'lightbulb',
    visible: store.smartPageVisible !== false
  },
  {
    key: 'health',
    path: '/health',
    name: store.healthPageDisplayName,
    icon: store.healthPageIcon,
    builtin: 'health',
    visible: store.healthPageVisible !== false
  },
  {
    // 博客后台：数据走独立的 blog.json 云同步信封。
    // 名称/图标/可见性由「设置 → 个性化 → 主题（工具箱下方）」控制（blogAdminPage* 三件套），
    // 与其它工作台字段同构，一并进 workbench.json 信封跨设备云同步。
    key: 'blog',
    path: '/blog/admin',
    name: store.blogAdminPageDisplayName,
    icon: store.blogAdminPageIcon,
    builtin: 'notes',
    visible: store.blogAdminPageVisible !== false
  }
  // 注意：「博客前台（/blog）」与「个人图书馆（/books）」已迁出本面板，
  // 改为导航站列表里的站内入口卡片（见 stores/sites.ts 的 refreshModuleEntries）。
  // 名称/图标/可见性仍由设置里的 blogFrontPage* / booksPage* 控制，迁移后表现一致。
])

const visibleEntries = computed<Entry[]>(() => allEntries.value.filter((e) => e.visible))

/** 当前所在工作台（用于"当前"徽章；不再隐藏，避免列表数量跳变） */
const currentKey = computed<string>(() => {
  const p = route.path
  const hit = visibleEntries.value.find((e) =>
    e.isCurrentPath
      ? e.isCurrentPath(p)
      : e.path === p || (e.path !== '/' && p.startsWith(`${e.path}/`))
  )
  return hit ? hit.key : ''
})

const open = ref(false)
const activeIndex = ref(0)
const triggerRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
/** fixed 定位坐标：某些工作台顶栏左容器 overflow:hidden，absolute 会被裁掉 */
const panelStyle = ref<Record<string, string>>({})

function updatePanelPosition(): void {
  const el = triggerRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const width = 240
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
  panelStyle.value = { top: `${Math.round(r.bottom + 8)}px`, left: `${Math.round(left)}px` }
}

/** 当前选中项（越界时返回 null，供 aria-activedescendant 与 Enter 使用） */
const activeEntry = computed<Entry | null>(() => visibleEntries.value[activeIndex.value] ?? null)

function isCurrent(entry: Entry): boolean {
  return entry.key === currentKey.value
}

/** 输入类元素判定：焦点在其中时不劫持快捷键，避免打断打字 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function openPalette(): void {
  if (open.value) return
  activeIndex.value = 0
  updatePanelPosition()
  open.value = true
  // 刻意不把焦点挪进下拉：聚焦面板会让某些工作台（如博客后台）的内部滚动容器
  // 自动滚到焦点处，把顶栏触发器顶出视口。键盘事件挂在 window 上，不依赖焦点位置。
}

function closePalette(): void {
  if (!open.value) return
  open.value = false
  triggerRef.value?.focus()
}

function togglePalette(): void {
  if (open.value) closePalette()
  else openPalette()
}

// 个人工作台移除全局顶栏后，触发器收进视觉隐藏容器；设置弹窗里的「切换工作台」
// 通过父组件 ref 调用本方法唤起同一个下拉（键盘 Alt+W 走原生监听，行为不变）。
defineExpose({ openPalette, togglePalette })

function openExternal(path: string): void {
  const url = path.startsWith('/') ? `${window.location.origin}${path}` : path
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function go(entry: Entry): void {
  open.value = false
  if (entry.openInNewTab) {
    openExternal(entry.path)
  } else if (entry.path !== route.path) {
    // 已在目标页时不再跳转（旧版直接隐藏该项，这里保留可见 + 徽章，点了也无副作用）
    void router.push(entry.path)
  }
  triggerRef.value?.focus()
}

function scrollActiveIntoView(): void {
  listRef.value?.querySelector<HTMLElement>(`[data-idx="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' })
}

function move(dir: number): void {
  const n = visibleEntries.value.length
  if (n === 0) return
  activeIndex.value = (activeIndex.value + dir + n) % n
  scrollActiveIntoView()
}

function selectActive(): void {
  if (activeEntry.value) go(activeEntry.value)
}

// 点外部关闭：面板 Teleport 到 body，需同时排除触发器与面板本身
function onClickOutside(event: MouseEvent): void {
  if (!open.value) return
  const target = event.target as Node
  if (panelRef.value?.contains(target) || triggerRef.value?.contains(target)) return
  closePalette()
}

function handleKeydown(event: KeyboardEvent): void {
  const plainAlt = event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey

  // Alt+W：唤起 / 关闭命令面板（与 Alt+K 全局搜索、Alt+R 最近使用同族，互不冲突）
  if (plainAlt && event.key.toLowerCase() === 'w') {
    event.preventDefault()
    if (open.value) closePalette()
    else if (!isTypingTarget(event.target)) openPalette()
    return
  }

  // Alt+1..9：直达第 N 个工作台（下拉已打开时不响应，避免与 ↑↓ 选择混淆）
  if (plainAlt && !open.value && /^[1-9]$/.test(event.key)) {
    if (isTypingTarget(event.target)) return
    const entry = visibleEntries.value[Number(event.key) - 1]
    if (entry) {
      event.preventDefault()
      go(entry)
    }
    return
  }

  if (!open.value) return

  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      closePalette()
      break
    case 'ArrowDown':
      event.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      move(-1)
      break
    case 'Home':
      event.preventDefault()
      activeIndex.value = 0
      scrollActiveIntoView()
      break
    case 'End':
      event.preventDefault()
      activeIndex.value = Math.max(0, visibleEntries.value.length - 1)
      scrollActiveIntoView()
      break
    case 'Enter':
      event.preventDefault()
      selectActive()
      break
    default:
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', onClickOutside)
  window.addEventListener('resize', updatePanelPosition)
  // capture=true：页面内部滚动容器滚动时也要跟随触发器重新定位
  window.addEventListener('scroll', updatePanelPosition, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', onClickOutside)
  window.removeEventListener('resize', updatePanelPosition)
  window.removeEventListener('scroll', updatePanelPosition, true)
})

const triggerText = computed(() => props.triggerLabel || store.workbenchManageDisplayName)
const triggerTitle = computed(() => `${triggerText.value} · 点击或 Alt+W 切换工作台`)
</script>

<template>
  <div class="ws-root">
    <button
      v-if="props.forceShow || store.workbenchManageVisible !== false"
      ref="triggerRef"
      type="button"
      class="ws-trigger"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :title="triggerTitle"
      :aria-label="triggerTitle"
      data-testid="ws-trigger"
      @click="togglePalette"
    >
      <img v-if="props.triggerIcon" :src="props.triggerIcon" alt="" class="ws-trigger-img" data-testid="ws-trigger-icon" />
      <Icon v-else-if="props.triggerBuiltin" :name="props.triggerBuiltin" :size="16" class="ws-trigger-svg" />
      <img v-else-if="store.workbenchManageIcon" :src="store.workbenchManageIcon" alt="" class="ws-trigger-img" data-testid="ws-trigger-icon" />
      <span class="ws-trigger-label">{{ triggerText }}</span>
      <Icon name="chevron-down" :size="14" class="ws-trigger-caret" />
    </button>

    <Teleport to="body">
      <Transition name="ws-fade">
        <div
          v-if="open"
          ref="panelRef"
          class="ws-panel"
          :style="panelStyle"
          role="dialog"
          aria-label="切换工作台"
          data-testid="ws-panel"
        >
          <div
            id="ws-listbox"
            ref="listRef"
            class="ws-list"
            role="listbox"
            tabindex="-1"
            aria-label="工作台列表"
            :aria-activedescendant="activeEntry ? `ws-opt-${activeEntry.key}` : undefined"
          >
            <button
              v-for="(entry, i) in visibleEntries"
              :id="`ws-opt-${entry.key}`"
              :key="entry.key"
              type="button"
              class="ws-item"
              :class="{ active: i === activeIndex, current: isCurrent(entry) }"
              :data-idx="i"
              :data-testid="`ws-item-${entry.key}`"
              role="option"
              :aria-selected="i === activeIndex"
              @click="go(entry)"
              @mouseenter="activeIndex = i"
            >
              <span class="ws-item-icon">
                <img v-if="entry.icon" :src="entry.icon" :alt="entry.name" class="ws-item-img" />
                <Icon v-else :name="entry.builtin" :size="20" class="ws-item-svg" />
              </span>
              <span class="ws-item-name">{{ entry.name }}</span>
              <span v-if="entry.openInNewTab" class="ws-item-newtab" title="在新标签打开">↗</span>
              <span v-if="isCurrent(entry)" class="ws-item-cur">当前</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ws-root {
  position: relative;
  display: inline-flex;
  align-items: center;
  /* 顶栏空间紧张时不被压缩（与 BusinessView 的原 :deep(.wmp-root){flex-shrink:0} 同意图，
     这里在组件内统一保证，各页面无需再单独覆盖） */
  flex: none;
}

/* 触发器：自包含基础样式，导航站与各工作台页面一致；chevron 暗示"可展开" */
.ws-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: var(--space-2) var(--space-3);
  background-color: transparent;
  color: var(--color-text-secondary);
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: var(--fs-sm, 13px);
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease;
}
.ws-trigger:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary-text);
  border-color: var(--color-border, #e2e8f0);
}
.ws-trigger-svg,
.ws-trigger-caret {
  color: currentColor;
  flex: none;
}
.ws-trigger-caret {
  opacity: 0.7;
}
.ws-trigger-label {
  white-space: nowrap;
}
.ws-trigger-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex: none;
  border-radius: 3px;
}

/* 下拉面板：Teleport 到 body + fixed 定位（坐标由触发器 rect 计算）。
   不少工作台顶栏左容器有 overflow:hidden，放在组件内 absolute 会被裁掉。 */
.ws-panel {
  position: fixed;
  z-index: var(--z-dropdown, 100);
  width: 240px;
  max-width: calc(100vw - 24px);
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  box-shadow: var(--shadow-dropdown, 0 4px 16px rgba(0, 0, 0, 0.12));
}

.ws-list {
  overflow-y: auto;
  padding: 6px;
  outline: none;
}
.ws-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s;
}
.ws-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
}
.ws-item.active {
  background-color: var(--color-primary-light, #eff6ff);
}
.ws-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 8px;
  background-color: var(--color-bg-hover, #f8fafc);
  overflow: hidden;
}
.ws-item-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.ws-item-svg {
  color: var(--color-primary, #3b82f6);
}
.ws-item-name {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-body, 14px);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ws-item.current .ws-item-name {
  color: var(--color-primary-text);
  font-weight: 500;
}
.ws-item-cur {
  flex: none;
  font-size: var(--fs-caption, 12px);
  line-height: 1;
  padding: 3px 7px;
  border-radius: 999px;
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--color-primary-text);
}
.ws-item-newtab {
  flex: none;
  font-size: var(--fs-sm, 13px);
  color: var(--color-text-secondary);
}
.ws-fade-enter-active,
.ws-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.ws-fade-enter-from,
.ws-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 窄屏 / 触屏：下拉加高、触控目标 ≥44px */
@media (max-width: 768px), (pointer: coarse) {
  .ws-panel {
    max-height: 70vh;
  }
  .ws-item {
    min-height: 44px;
  }
}

/* 暗色模式（沿用组件原有变量口径） */
html.dark .ws-panel {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
}
html.dark .ws-item:hover {
  background-color: var(--color-bg-hover, #374151);
}
html.dark .ws-item.active {
  background-color: var(--dark-accent-surface);
}
html.dark .ws-item-name {
  color: var(--color-text);
}
html.dark .ws-item.current .ws-item-name,
html.dark .ws-item-svg {
  color: var(--dark-accent-text);
}
html.dark .ws-item-cur {
  background-color: var(--dark-accent-surface);
  color: var(--dark-accent-text);
}
</style>
