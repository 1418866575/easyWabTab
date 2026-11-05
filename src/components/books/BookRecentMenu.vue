<script setup lang="ts">
/**
 * 图书馆顶栏「最近阅读」下拉菜单（右上角，2026-11 用户要求）
 *
 * 为什么从页面分区搬到顶栏：
 *   最近阅读的用途是「接着上次没读完的那本看」，属于随时要用的快捷入口，
 *   不该占掉书架第一屏；形态上对齐工具箱顶栏的「最近使用」，两个模块肌肉记忆一致。
 *
 * 数据：直接读 useBooksPrefs 单例（recent / bookmarks 都是模块级 ref），
 *      父级只把合并后的书目（静态书 + 本机上传）传进来，不重复算最近列表。
 * 动作：**点条目 = 站内阅读** —— 只有站内阅读会记录阅读位置，
 *      「新标签打开」留在书架卡片的「打开」按钮上；一行只放一个热区，避免误点。
 * 上限：最多 BOOKS_RECENT_MENU_LIMIT（10）条，截断逻辑在 booksCore.recentBooksOf 里（可单测）。
 *
 * 交互：点外部 / Esc 关闭；条目是真按钮，Tab 可达、Enter/Space 触发，Esc 关闭后焦点回触发按钮。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  BOOKS_RECENT_MENU_LIMIT,
  bookHue,
  formatProgress,
  formatRelative,
  recentBooksOf,
  type BookItem
} from '@/composables/booksCore'
import { useBooksPrefs } from '@/composables/useBooksPrefs'

const LIMIT = BOOKS_RECENT_MENU_LIMIT

const props = defineProps<{
  /** 全量书目（静态书 + 本机上传），用于把 recent 的时间戳表映射成可展示的条目 */
  books: BookItem[]
}>()

const emit = defineEmits<{
  /** 站内继续阅读（父级负责 markOpened + 路由跳转） */
  (e: 'read', book: BookItem): void
}>()

const { recent, bookmarks } = useBooksPrefs()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
/** 窄屏用 position:fixed 铺满左右边距，top 取触发按钮的下沿 —— 逐次计算，不依赖顶栏高度 */
const isMobile = ref(false)
const panelTop = ref(0)

interface MenuItem {
  book: BookItem
  time: string
  progress: string
}

/** 最近阅读条目（时间倒序、跳过已删除书目、截断到 LIMIT） */
const items = computed<MenuItem[]>(() =>
  recentBooksOf(props.books, recent.value, LIMIT).map(({ book, ts }) => {
    const mark = bookmarks.value[book.id]
    return {
      book,
      time: formatRelative(ts),
      progress: mark ? formatProgress(mark.ratio) : ''
    }
  })
)

function initialOf(book: BookItem): string {
  return (book.title || '书').slice(0, 1)
}

/** 无封面时的占位色：与书架卡片同款（按 id 派生稳定色相，见 booksCore.bookHue） */
function thumbStyle(book: BookItem): Record<string, string> {
  return book.cover
    ? { backgroundImage: `url(${book.cover})` }
    : { background: `hsl(${bookHue(book.id)}deg 52% 62%)` }
}

function toggle(): void {
  if (open.value) return close()
  openPanel()
}

/**
 * 打开面板。
 * 窄屏下触发按钮不在屏幕最右侧（右边还有云同步/上传），若按 right:0 绝对定位，
 * 320px 宽的面板会从左侧溢出屏幕 —— 故窄屏改 fixed + 左右 8px，top 现算。
 */
function openPanel(): void {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches
  if (isMobile.value) {
    const rect = triggerRef.value?.getBoundingClientRect()
    panelTop.value = rect ? Math.round(rect.bottom + 8) : 64
  }
  open.value = true
}

/** refocus 仅在 Esc 关闭时为 true —— 点外部关闭不该把焦点抢回按钮 */
function close(refocus = false): void {
  if (!open.value) return
  open.value = false
  if (refocus) triggerRef.value?.focus()
}

function onEsc(): void {
  close(true)
}

function onSelect(book: BookItem): void {
  close()
  emit('read', book)
}

/** 点击组件外部收起（pointerdown 比 click 更早，能挡住"点外部按钮先触发两次"的错觉） */
function onDocPointerDown(e: PointerEvent): void {
  if (!open.value) return
  const t = e.target as Node | null
  if (t && rootRef.value?.contains(t)) return
  close()
}

/** 窄屏面板是 fixed 定位，页面一滚就会和触发按钮脱开 —— 滚动即收起（面板自身滚动除外） */
function onScroll(e: Event): void {
  if (!open.value || !isMobile.value) return
  const t = e.target as Node | null
  if (t && t.nodeType === 1 && rootRef.value?.contains(t)) return
  close()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  window.addEventListener('scroll', onScroll, { capture: true, passive: true })
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener('scroll', onScroll, { capture: true })
})
</script>

<template>
  <!-- 没有最近阅读时不渲染按钮：空的入口比没有入口更让人困惑（与工具箱「最近使用」一致） -->
  <div v-if="items.length" ref="rootRef" class="bk-rm" @keydown.esc="onEsc">
    <button
      ref="triggerRef"
      type="button"
      class="ui-btn ui-btn--sm bk-rm-trigger"
      :class="{ 'is-open': open }"
      data-testid="bk-recent-trigger"
      aria-haspopup="menu"
      :aria-expanded="open"
      :title="`最近阅读（${items.length} 本）· 点开继续阅读`"
      @click="toggle"
    >
      <span class="bk-top-btn-icon" aria-hidden="true">🕘</span>
      <span class="bk-rm-trigger-label">最近阅读</span>
      <span class="bk-top-btn-badge">{{ items.length }}</span>
    </button>

    <Transition name="bk-rm-fade">
      <div
        v-if="open"
        class="bk-rm-panel"
        role="menu"
        aria-label="最近阅读的书籍"
        :style="isMobile ? { top: `${panelTop}px` } : undefined"
      >
        <header class="bk-rm-head">
          <span class="bk-rm-head-title">最近阅读</span>
          <span class="bk-rm-head-sub">最多 {{ LIMIT }} 本</span>
        </header>

        <ul class="bk-rm-list">
          <li v-for="it in items" :key="it.book.id" role="none">
            <button
              type="button"
              role="menuitem"
              class="bk-rm-item"
              :data-testid="`bk-recent-item-${it.book.id}`"
              :title="`继续阅读《${it.book.title}》`"
              @click="onSelect(it.book)"
            >
              <span class="bk-rm-thumb" :style="thumbStyle(it.book)" aria-hidden="true">
                <span v-if="!it.book.cover" class="bk-rm-thumb-initial">{{ initialOf(it.book) }}</span>
              </span>
              <span class="bk-rm-main">
                <span class="bk-rm-title">{{ it.book.title }}</span>
                <span class="bk-rm-meta">
                  <span class="bk-rm-cat">{{ it.book.category }}</span>
                  <span class="bk-rm-dot" aria-hidden="true">·</span>
                  <span class="bk-rm-time">{{ it.time }}</span>
                  <template v-if="it.progress">
                    <span class="bk-rm-dot" aria-hidden="true">·</span>
                    <span class="bk-rm-progress">{{ it.progress }}</span>
                  </template>
                </span>
              </span>
            </button>
          </li>
        </ul>

        <p class="bk-rm-hint">点条目进站内阅读，会记录阅读进度</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.bk-rm {
  position: relative;
  display: inline-flex;
}

/* 展开态用主色描边提示"面板从这里出来"（不动画位移，避免顶栏抖动） */
.bk-rm-trigger.is-open {
  color: var(--color-primary-text);
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.bk-rm-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 120;
  width: min(320px, calc(100vw - 40px));
  max-height: 60vh;
  overflow-y: auto;
  padding: 6px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-dropdown);
}

.bk-rm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 6px 8px 4px;
}
.bk-rm-head-title {
  font-size: var(--fs-caption);
  color: var(--color-text-muted);
}
.bk-rm-head-sub {
  font-size: var(--fs-caption);
  color: var(--color-text-muted);
}

.bk-rm-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* 每行是一个按钮：整行可点、可 Tab、可 Enter —— 不用 li+role=menuitem 再自己接键盘 */
.bk-rm-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-family);
  text-align: left;
  cursor: pointer;
}
.bk-rm-item:hover,
.bk-rm-item:focus-visible {
  background: var(--color-primary-soft);
  outline: none;
}

.bk-rm-thumb {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 32px;
  border-radius: 4px;
  background-size: cover;
  background-position: center;
  overflow: hidden;
}
.bk-rm-thumb-initial {
  /* 缩略图底色是 hsl 派生色（不随主题），压字恒用 on-accent 白 */
  color: var(--color-on-accent);
  font-size: var(--fs-caption);
  font-weight: var(--font-weight-semibold, 600);
  line-height: 1;
}

.bk-rm-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.bk-rm-title {
  font-size: var(--fs-sm);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bk-rm-meta {
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
  font-size: var(--fs-caption);
  color: var(--color-text-muted);
  overflow: hidden;
  white-space: nowrap;
}
.bk-rm-cat {
  flex: none;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
}
.bk-rm-dot {
  flex: none;
}
.bk-rm-time {
  flex: none;
}
.bk-rm-progress {
  flex: none;
  color: var(--color-primary-text);
}

.bk-rm-hint {
  margin: 4px 8px 2px;
  font-size: var(--fs-caption);
  color: var(--color-text-muted);
}

/* 淡入淡出：只做透明度 + 轻微位移，与工具箱下拉一致 */
.bk-rm-fade-enter-active,
.bk-rm-fade-leave-active {
  transition: opacity var(--motion-duration) var(--motion-ease),
    transform var(--motion-duration) var(--motion-ease);
}
.bk-rm-fade-enter-from,
.bk-rm-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 768px) {
  /* 窄屏顶栏已有 4 个按钮，这里只留图标 + 数量，靠 title 说明 */
  .bk-rm-trigger-label {
    display: none;
  }
  /* 面板改为贴视口：左右各留 8px，避免从按钮 right:0 展开时左边溢出屏幕 */
  .bk-rm-panel {
    position: fixed;
    left: 8px;
    right: 8px;
    width: auto;
    max-height: 70vh;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bk-rm-fade-enter-active,
  .bk-rm-fade-leave-active {
    transition: none;
  }
}
</style>
