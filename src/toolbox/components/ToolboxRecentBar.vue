<script setup lang="ts">
/**
 * 工具箱顶栏常驻快捷条：「最近使用」+「最近上线」（方案 A+D）
 *
 * - A：挂在顶栏（.tb-topbar 为 sticky，滚动时始终吸顶），折叠为胶囊 / 展开为横条
 * - D：Alt+R 唤起最近使用下拉面板，↑/↓ 选择、Enter 打开、Esc 关闭（复用 SpotlightOverlay 键盘范式）
 * - 「最近上线」：按工具 addedAt 降序取前 10 个（含分类与日期），点击直接打开
 * - 两个面板互斥展开；移动端（≤768px）：折叠为单图标，点击从底部弹出抽屉（bottom sheet）
 * - 数据源：最近使用复用 useToolboxPrefs().recent（单例响应式 + localStorage），本组件只读；
 *   最近上线来自工具注册表静态元数据，无需持久化
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import type { ToolboxToolMeta } from '../types'
import { relativeTime } from '../core/recent'
import { useToolboxPrefs } from '../prefs/useToolboxPrefs'
import { getToolMeta, TOOLBOX_TOOLS } from '../registry'
import { categoryName } from '../config/categories'

/** 最近上线展示条数 */
const NEW_LIMIT = 10

const props = defineProps<{
  /** 打开工具（由父级注入，复用其 openTool 逻辑：状态校验 + 记录点击 + 打开） */
  onOpen: (meta: ToolboxToolMeta) => void
}>()

const { recent, clickCount, clearRecent } = useToolboxPrefs()

/** 当前展开的面板：'' 为全部收起 */
const openKind = ref<'' | 'recent' | 'new'>('')
/** 键盘选中下标（-1 为无选中） */
const activeIndex = ref(-1)
/** 触发按钮，用于关闭后回焦 */
const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const itemRefs = ref<HTMLElement[]>([])

/** 面板行统一结构：tool 为打开目标，time 为右侧说明文字，hits 为使用次数（仅最近使用有） */
interface BarItem {
  tool: ToolboxToolMeta
  time: string
  hits: number
  cat: string
}

/** 最近使用（元数据有效者），时间倒序（recent 已由 core 去重截断） */
const recentItems = computed<BarItem[]>(() =>
  recent.value
    .map(r => ({ ts: r.ts, tool: getToolMeta(r.id) }))
    .filter((x): x is { ts: number; tool: ToolboxToolMeta } => !!x.tool)
    .map(x => ({ tool: x.tool, time: relativeTime(x.ts), hits: clickCount(x.tool.id), cat: categoryName(x.tool.category) }))
)

/** 最近上线：addedAt 降序取前 NEW_LIMIT 个（只含可用工具） */
const newItems = computed<BarItem[]>(() =>
  TOOLBOX_TOOLS
    .filter(t => t.status === 'active' && t.addedAt)
    .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))
    .slice(0, NEW_LIMIT)
    .map(t => ({ tool: t, time: (t.addedAt || '').slice(5) + ' 上线', hits: 0, cat: categoryName(t.category) }))
)

const hasRecent = computed(() => recentItems.value.length > 0)
const hasNew = computed(() => newItems.value.length > 0)
const hasAny = computed(() => hasRecent.value || hasNew.value)

/** 当前展开面板对应的列表（键盘导航用） */
const activeItems = computed<BarItem[]>(() => (openKind.value === 'recent' ? recentItems.value : newItems.value))

function onSelect(meta: ToolboxToolMeta) {
  close()
  props.onOpen(meta)
}

function toggle(kind: 'recent' | 'new') {
  if (openKind.value === kind) close()
  else openPanel(kind)
}

function openPanel(kind: 'recent' | 'new') {
  openKind.value = kind
  activeIndex.value = 0
  itemRefs.value = [] // 切换面板时清掉上一个面板的节点引用
  nextTick(() => {
    // 移动端打开底部抽屉时锁背景滚动
    if (isMobile.value) document.body.style.overflow = 'hidden'
  })
}

function close() {
  if (!openKind.value) return
  openKind.value = ''
  activeIndex.value = -1
  document.body.style.overflow = ''
  triggerRef.value?.focus()
}

const isMobile = ref(false)
function updateViewport() {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches
}

function onKeydown(e: KeyboardEvent) {
  // Alt+R（或 Ctrl+R 已被浏览器刷新占用，故仅 Alt）唤起/关闭最近使用
  if (e.altKey && (e.key === 'r' || e.key === 'R')) {
    e.preventDefault()
    if (openKind.value === 'recent') close()
    else openPanel('recent')
    return
  }
  if (!openKind.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = activeItems.value.length
    if (!n) return
    const delta = e.key === 'ArrowDown' ? 1 : -1
    activeIndex.value = (activeIndex.value + delta + n) % n
    nextTick(() => itemRefs.value[activeIndex.value]?.scrollIntoView({ block: 'nearest' }))
  } else if (e.key === 'Enter' && activeIndex.value >= 0) {
    e.preventDefault()
    const it = activeItems.value[activeIndex.value]
    if (it) onSelect(it.tool)
  }
}

/** 点击组件外部收起 */
function onDocPointerDown(e: PointerEvent) {
  if (!openKind.value) return
  const root = panelRef.value
  const trigger = triggerRef.value
  const t = e.target as Node
  if (root?.contains(t) || trigger?.contains(t)) return
  close()
}

function onClear() {
  clearRecent()
  close()
}

onMounted(() => {
  updateViewport()
  window.addEventListener('resize', updateViewport)
  document.addEventListener('pointerdown', onDocPointerDown)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.body.style.overflow = ''
})

// 打开状态下把 active 项同步进 DOM
watch(activeIndex, v => {
  if (v >= 0) nextTick(() => itemRefs.value[v] && (itemRefs.value[v].dataset.active = 'true'))
})
</script>

<template>
  <div v-if="hasAny" class="tb-recent-bar" ref="panelRef">
    <!-- 触发区：桌面折叠胶囊 / 移动端单图标 -->
    <button
      v-if="hasRecent"
      ref="triggerRef"
      type="button"
      class="tb-recent-trigger"
      :class="{ 'is-open': openKind === 'recent' }"
      data-testid="tb-recent-trigger"
      :aria-expanded="openKind === 'recent'"
      aria-haspopup="menu"
      :title="`最近使用（${recentItems.length}）· 快捷键 Alt+R`"
      @click="toggle('recent')"
    >
      <span aria-hidden="true">🕘</span>
      <span class="tb-recent-trigger-label">最近使用</span>
      <span class="tb-recent-count">{{ recentItems.length }}</span>
    </button>

    <button
      v-if="hasNew"
      type="button"
      class="tb-recent-trigger"
      :class="{ 'is-open': openKind === 'new' }"
      data-testid="tb-new-trigger"
      :aria-expanded="openKind === 'new'"
      aria-haspopup="menu"
      :title="`最近上线（${newItems.length}）`"
      @click="toggle('new')"
    >
      <span aria-hidden="true">🆕</span>
      <span class="tb-recent-trigger-label">最近上线</span>
      <span class="tb-recent-count">{{ newItems.length }}</span>
    </button>

    <!-- 下拉面板（桌面）：最近使用 -->
    <Transition name="tb-rec-fade">
      <div
        v-if="openKind === 'recent' && !isMobile"
        class="tb-recent-panel"
        role="menu"
        :aria-label="'最近使用的工具'"
      >
        <header class="tb-recent-panel-head">
          <span class="tb-recent-panel-title">最近使用</span>
          <button type="button" class="tb-recent-clear" @click="onClear">清空</button>
        </header>
        <ul class="tb-recent-panel-list">
          <li
            v-for="(it, i) in recentItems"
            :key="it.tool.id"
            ref="itemRefs"
            :data-active="i === activeIndex"
            class="tb-recent-panel-item"
            role="menuitem"
            @click="onSelect(it.tool)"
            @mouseenter="activeIndex = i"
          >
            <span class="tb-recent-panel-icon" aria-hidden="true">{{ it.tool.icon }}</span>
            <span class="tb-recent-panel-name" :title="it.tool.name">{{ it.tool.name }}</span>
            <span class="tb-recent-panel-time">{{ it.time }}</span>
            <span v-if="it.hits" class="tb-recent-panel-hits">{{ it.hits }} 次</span>
          </li>
        </ul>
        <p class="tb-recent-panel-hint">↑/↓ 选择 · Enter 打开 · Esc 关闭 · Alt+R 唤起</p>
      </div>
    </Transition>

    <!-- 下拉面板（桌面）：最近上线 -->
    <Transition name="tb-rec-fade">
      <div
        v-if="openKind === 'new' && !isMobile"
        class="tb-recent-panel"
        role="menu"
        :aria-label="'最近上线的工具'"
      >
        <header class="tb-recent-panel-head">
          <span class="tb-recent-panel-title">最近上线</span>
        </header>
        <ul class="tb-recent-panel-list">
          <li
            v-for="(it, i) in newItems"
            :key="it.tool.id"
            ref="itemRefs"
            :data-active="i === activeIndex"
            class="tb-recent-panel-item"
            role="menuitem"
            :title="it.tool.description"
            @click="onSelect(it.tool)"
            @mouseenter="activeIndex = i"
          >
            <span class="tb-recent-panel-icon" aria-hidden="true">{{ it.tool.icon }}</span>
            <span class="tb-recent-panel-name" :title="it.tool.name">{{ it.tool.name }}</span>
            <span class="tb-recent-panel-cat">{{ it.cat }}</span>
            <span class="tb-recent-panel-time">{{ it.time }}</span>
          </li>
        </ul>
        <p class="tb-recent-panel-hint">↑/↓ 选择 · Enter 打开 · Esc 关闭</p>
      </div>
    </Transition>

    <!-- 底部抽屉（移动端）：内容随展开面板切换 -->
    <Transition name="tb-rec-sheet">
      <div v-if="openKind && isMobile" class="tb-recent-sheet-mask" @click="close">
        <div class="tb-recent-sheet" role="menu" :aria-label="openKind === 'recent' ? '最近使用的工具' : '最近上线的工具'" @click.stop>
          <div class="tb-recent-sheet-bar" aria-hidden="true"></div>
          <header class="tb-recent-panel-head">
            <span class="tb-recent-panel-title">{{ openKind === 'recent' ? '最近使用' : '最近上线' }}</span>
            <button v-if="openKind === 'recent'" type="button" class="tb-recent-clear" @click="onClear">清空</button>
          </header>
          <ul class="tb-recent-panel-list">
            <li
              v-for="it in activeItems"
              :key="it.tool.id"
              class="tb-recent-panel-item"
              role="menuitem"
              @click="onSelect(it.tool)"
            >
              <span class="tb-recent-panel-icon" aria-hidden="true">{{ it.tool.icon }}</span>
              <span class="tb-recent-panel-name">{{ it.tool.name }}</span>
              <span v-if="openKind === 'new'" class="tb-recent-panel-cat">{{ it.cat }}</span>
              <span class="tb-recent-panel-time">{{ it.time }}</span>
              <span v-if="it.hits" class="tb-recent-panel-hits">{{ it.hits }} 次</span>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 顶栏容器：靠右，不占满；两个触发胶囊并排 */
.tb-recent-bar { position: relative; margin-left: auto; display: inline-flex; gap: 8px; }

/* 触发按钮：折叠胶囊 */
.tb-recent-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 10px;
  font-size: var(--fs-sm);
  font-family: var(--font-family);
  color: var(--color-text-secondary);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: color var(--motion-duration) var(--motion-ease),
    background-color var(--motion-duration) var(--motion-ease),
    border-color var(--motion-duration) var(--motion-ease);
}
.tb-recent-trigger:hover,
.tb-recent-trigger.is-open {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.tb-recent-count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

/* 下拉面板：Teleport 不用，这里 topbar sticky 无 backdrop-filter，用 absolute 即可 */
.tb-recent-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 120;
  width: min(320px, calc(100vw - 32px));
  max-height: 60vh;
  overflow-y: auto;
  padding: 6px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-dropdown);
}
.tb-recent-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 4px;
}
.tb-recent-panel-title { font-size: var(--fs-caption); color: var(--color-text-muted); }
.tb-recent-clear {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--fs-caption);
  padding: 2px 6px;
  border-radius: 6px;
}
.tb-recent-clear:hover { color: var(--color-error); background: var(--color-bg-hover); }

.tb-recent-panel-list { list-style: none; margin: 0; padding: 0; }
.tb-recent-panel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-text);
  font-size: var(--fs-sm);
}
.tb-recent-panel-item:hover,
.tb-recent-panel-item[data-active='true'] { background: var(--color-primary-soft); }
.tb-recent-panel-icon { flex: none; }
.tb-recent-panel-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb-recent-panel-cat {
  flex: none;
  color: var(--color-text-muted);
  font-size: 11px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-bg-hover);
}
.tb-recent-panel-time { flex: none; color: var(--color-text-muted); font-size: 11px; }
.tb-recent-panel-hits {
  flex: none;
  color: var(--color-text-muted);
  font-size: 11px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-bg-hover);
}
.tb-recent-panel-hint {
  margin: 4px 8px 2px;
  font-size: 11px;
  color: var(--color-text-muted);
}

/* 移动端底部抽屉 */
.tb-recent-sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
}
.tb-recent-sheet {
  width: 100%;
  max-height: 70vh;
  overflow-y: auto;
  padding: 8px 8px 20px;
  background: var(--color-bg-card);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow-modal);
}
.tb-recent-sheet-bar {
  width: 40px;
  height: 4px;
  margin: 0 auto 8px;
  border-radius: 999px;
  background: var(--color-border);
}

/* 淡入淡出 */
.tb-rec-fade-enter-active, .tb-rec-fade-leave-active { transition: opacity var(--motion-duration) var(--motion-ease), transform var(--motion-duration) var(--motion-ease); }
.tb-rec-fade-enter-from, .tb-rec-fade-leave-to { opacity: 0; transform: translateY(-4px); }
.tb-rec-sheet-enter-active, .tb-rec-sheet-leave-active { transition: opacity var(--motion-duration) var(--motion-ease); }
.tb-rec-sheet-enter-from, .tb-rec-sheet-leave-to { opacity: 0; }

@media (max-width: 768px) {
  /* 移动端折叠为单图标，节省顶栏空间 */
  .tb-recent-trigger-label { display: none; }
  .tb-recent-trigger { padding: 6px 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .tb-recent-trigger,
  .tb-rec-fade-enter-active, .tb-rec-fade-leave-active,
  .tb-rec-sheet-enter-active, .tb-rec-sheet-leave-active { transition: none; }
}
</style>
