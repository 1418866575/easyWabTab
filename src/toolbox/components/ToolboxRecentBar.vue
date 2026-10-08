<script setup lang="ts">
/**
 * 工具箱「最近使用」常驻快捷条（方案 A+D）
 *
 * - A：挂在顶栏（.tb-topbar 为 sticky，滚动时始终吸顶），折叠为胶囊 / 展开为横条
 * - D：Alt+R 唤起下拉面板，↑/↓ 选择、Enter 打开、Esc 关闭（复用 SpotlightOverlay 键盘范式）
 * - 移动端（≤768px）：折叠为单图标，点击从底部弹出抽屉（bottom sheet）
 * - 数据源：直接复用 useToolboxPrefs().recent（单例响应式 + localStorage），本组件只读
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import type { ToolboxToolMeta } from '../types'
import { relativeTime } from '../core/recent'
import { useToolboxPrefs } from '../prefs/useToolboxPrefs'
import { getToolMeta } from '../registry'

const props = defineProps<{
  /** 打开工具（由父级注入，复用其 openTool 逻辑：状态校验 + 记录点击 + 打开） */
  onOpen: (meta: ToolboxToolMeta) => void
}>()

const { recent, clickCount, clearRecent } = useToolboxPrefs()

/** 面板/抽屉是否展开 */
const open = ref(false)
/** 键盘选中下标（-1 为无选中） */
const activeIndex = ref(-1)
/** 触发按钮，用于关闭后回焦 */
const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const itemRefs = ref<HTMLElement[]>([])

/** 最近使用（元数据有效者），时间倒序（recent 已由 core 去重截断） */
const items = computed(() =>
  recent.value
    .map(r => ({ ts: r.ts, tool: getToolMeta(r.id) }))
    .filter((x): x is { ts: number; tool: ToolboxToolMeta } => !!x.tool)
)

const hasItems = computed(() => items.value.length > 0)


function onSelect(meta: ToolboxToolMeta) {
  close()
  props.onOpen(meta)
}

function toggle() {
  if (!hasItems.value) return
  if (open.value) close()
  else openPanel()
}

function openPanel() {
  open.value = true
  activeIndex.value = items.value.length ? 0 : -1
  nextTick(() => {
    // 移动端打开底部抽屉时锁背景滚动
    if (isMobile.value) document.body.style.overflow = 'hidden'
  })
}

function close() {
  if (!open.value) return
  open.value = false
  activeIndex.value = -1
  document.body.style.overflow = ''
  triggerRef.value?.focus()
}

const isMobile = ref(false)
function updateViewport() {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches
}

function onKeydown(e: KeyboardEvent) {
  // Alt+R（或 Ctrl+R 已被浏览器刷新占用，故仅 Alt）唤起/关闭
  if (e.altKey && (e.key === 'r' || e.key === 'R')) {
    e.preventDefault()
    if (open.value) close()
    else openPanel()
    return
  }
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = items.value.length
    if (!n) return
    const delta = e.key === 'ArrowDown' ? 1 : -1
    activeIndex.value = (activeIndex.value + delta + n) % n
    nextTick(() => itemRefs.value[activeIndex.value]?.scrollIntoView({ block: 'nearest' }))
  } else if (e.key === 'Enter' && activeIndex.value >= 0) {
    e.preventDefault()
    const it = items.value[activeIndex.value]
    if (it) onSelect(it.tool)
  }
}

/** 点击组件外部收起 */
function onDocPointerDown(e: PointerEvent) {
  if (!open.value) return
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
  document.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})

// 抽屉打开时按 Esc 关闭由 onKeydown 处理；打开状态下把 active 项同步进 DOM
watch(activeIndex, v => {
  if (v >= 0) nextTick(() => itemRefs.value[v] && (itemRefs.value[v].dataset.active = 'true'))
})
</script>

<template>
  <div v-if="hasItems" class="tb-recent-bar" ref="panelRef">
    <!-- 触发区：桌面折叠胶囊 / 移动端单图标 -->
    <button
      ref="triggerRef"
      type="button"
      class="tb-recent-trigger"
      :class="{ 'is-open': open }"
      data-testid="tb-recent-trigger"
      :aria-expanded="open"
      aria-haspopup="menu"
      :title="`最近使用（${items.length}）· 快捷键 Alt+R`"
      @click="toggle"
    >
      <span aria-hidden="true">🕘</span>
      <span class="tb-recent-trigger-label">最近使用</span>
      <span class="tb-recent-count">{{ items.length }}</span>
    </button>

    <!-- 下拉面板（桌面） -->
    <Transition name="tb-rec-fade">
      <div
        v-if="open && !isMobile"
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
            v-for="(it, i) in items"
            :key="it.tool.id"
            ref="itemRefs"
            :data-active="i === activeIndex"
            class="tb-recent-panel-item"
            role="menuitem"
            @click="onSelect(it.tool)"
            @mouseenter="activeIndex = i"
          >
            <span class="tb-recent-panel-icon" aria-hidden="true">{{ it.tool.icon }}</span>
            <span class="tb-recent-panel-name">{{ it.tool.name }}</span>
            <span class="tb-recent-panel-time">{{ relativeTime(it.ts) }}</span>
            <span v-if="clickCount(it.tool.id)" class="tb-recent-panel-hits">{{ clickCount(it.tool.id) }} 次</span>
          </li>
        </ul>
        <p class="tb-recent-panel-hint">↑/↓ 选择 · Enter 打开 · Esc 关闭 · Alt+R 唤起</p>
      </div>
    </Transition>

    <!-- 底部抽屉（移动端） -->
    <Transition name="tb-rec-sheet">
      <div v-if="open && isMobile" class="tb-recent-sheet-mask" @click="close">
        <div class="tb-recent-sheet" role="menu" aria-label="最近使用的工具" @click.stop>
          <div class="tb-recent-sheet-bar" aria-hidden="true"></div>
          <header class="tb-recent-panel-head">
            <span class="tb-recent-panel-title">最近使用</span>
            <button type="button" class="tb-recent-clear" @click="onClear">清空</button>
          </header>
          <ul class="tb-recent-panel-list">
            <li
              v-for="it in items"
              :key="it.tool.id"
              class="tb-recent-panel-item"
              role="menuitem"
              @click="onSelect(it.tool)"
            >
              <span class="tb-recent-panel-icon" aria-hidden="true">{{ it.tool.icon }}</span>
              <span class="tb-recent-panel-name">{{ it.tool.name }}</span>
              <span class="tb-recent-panel-time">{{ relativeTime(it.ts) }}</span>
              <span v-if="clickCount(it.tool.id)" class="tb-recent-panel-hits">{{ clickCount(it.tool.id) }} 次</span>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 顶栏容器：靠右，不占满 */
.tb-recent-bar { position: relative; margin-left: auto; }

/* 触发按钮：折叠胶囊 */
.tb-recent-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 10px;
  font-size: 13px;
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
.tb-recent-panel-title { font-size: 12px; color: var(--color-text-muted); }
.tb-recent-clear {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
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
  font-size: 13px;
}
.tb-recent-panel-item:hover,
.tb-recent-panel-item[data-active='true'] { background: var(--color-primary-soft); }
.tb-recent-panel-icon { flex: none; }
.tb-recent-panel-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
