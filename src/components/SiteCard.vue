<script lang="ts">
/**
 * 模块级共享状态（普通 <script>，整份模块只执行一次）。
 *
 * 为什么不能放 <script setup>：后者按**实例**执行，一屏 N 张卡就会各自注册一份
 * document 监听（滚到底上千个，每次点击都要全页遍历）；这里改为全页共用一份监听，
 * 并用 openMenuUrl 保证同一时刻只展开一个卡片菜单（与用户对「更多操作」的预期一致）。
 * 注：`ref` 由下方 <script setup> 的 import 提供（ESM import 会被提升到模块顶部，
 * 两个块共享同一模块作用域，重复 import 反而会报 Duplicate identifier）。
 */
/** 当前展开菜单的卡片 url（null = 全部收起） */
const openMenuUrl = ref<string | null>(null)

let docListenersBound = false

function onDocClickCapture(event: MouseEvent): void {
  if (!openMenuUrl.value) return
  const target = event.target as HTMLElement | null
  const card = target?.closest ? (target.closest('.site-card') as HTMLElement | null) : null
  // 点在当前展开的这张卡内（含 ⋯ 按钮与菜单项）→ 交给卡片自己的 handler 处理
  if (card && card.dataset.siteUrl === openMenuUrl.value) return
  openMenuUrl.value = null
}

function onDocKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && openMenuUrl.value) openMenuUrl.value = null
}

/** 幂等：第一次挂载时注册，之后各实例都直接返回 */
function bindCardDocListeners(): void {
  if (docListenersBound || typeof document === 'undefined') return
  document.addEventListener('click', onDocClickCapture, true)
  document.addEventListener('keydown', onDocKeydown)
  docListenersBound = true
}
</script>

<script setup lang="ts">
import Icon from './Icon.vue'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import type { Site } from '../types'
import { getFaviconImgSrc, getIconUrl, ensureIconCached } from '../composables/useIconCache'
import { useSitesStore } from '../stores/sites'

const props = defineProps<{
  site: Site
  readonly?: boolean
  isDragOver?: boolean
  isDragging?: boolean
}>()

const emit = defineEmits<{
  edit: [site: Site]
  delete: [url: string]
  unmark: [url: string]
}>()

const sitesStore = useSitesStore()

// ========================================
// 描述弹框：hover 3s 打开 / 2s 自动关 / 鼠标在弹框中不关 / 点叉即关
// ========================================
const showDescPopup = ref(false)
// hover 定时器：卡片进入 ≥ 3s 未离开 → 开弹框
let hoverTimer: ReturnType<typeof setTimeout> | null = null
// 自动关闭定时器：弹框显示后 2s 自动关（鼠标进入弹框时暂停、离开时重新计时）
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null

function clearHoverTimer() {
  if (hoverTimer !== null) { clearTimeout(hoverTimer); hoverTimer = null }
}
function clearAutoCloseTimer() {
  if (autoCloseTimer !== null) { clearTimeout(autoCloseTimer); autoCloseTimer = null }
}

/** 描述文本是否非空 */
function hasDescription(): boolean {
  return !!props.site.description?.trim()
}

/** (重新)启动 2s 自动关闭倒计时 */
function restartAutoClose() {
  clearAutoCloseTimer()
  autoCloseTimer = setTimeout(() => {
    showDescPopup.value = false
    autoCloseTimer = null
  }, 2000)
}

/** 立即关闭弹框（点叉或外部需要） */
function closeDescPopup() {
  clearAutoCloseTimer()
  showDescPopup.value = false
}

// 卡片事件：进入 -> 启动 3s 打开；离开 -> 取消打开 / 已开则开始 2s 自动关
function handleCardMouseEnter() {
  if (!hasDescription()) return
  clearHoverTimer()
  hoverTimer = setTimeout(() => {
    showDescPopup.value = true
    restartAutoClose()
    hoverTimer = null
  }, 3000)
}

function handleCardMouseLeave() {
  // 还没到 3s 就离开 → 取消打开（鼠标进入 popup 不会触发 card leave，因为 popup 是 card 子元素）
  clearHoverTimer()
  // 已打开 → 启动 2s 自动关倒计时（离开卡片但没进 popup 时 2s 关；进了 popup 会被 enterPopup 暂停）
  if (showDescPopup.value) {
    restartAutoClose()
  }
}

// 弹框事件：进入 → 暂停自动关；离开 → 重新开始 2s 倒计时
function handlePopupMouseEnter() {
  clearAutoCloseTimer()
}
function handlePopupMouseLeave() {
  restartAutoClose()
}

// ========================================
// 卡片操作菜单：常驻 ⋯ 触发（触屏无 hover，不能依赖悬停才出现）
// 展开状态由模块级 openMenuUrl 持有（见文件顶部普通 <script>）
// ========================================
const menuOpen = computed(() => openMenuUrl.value === props.site.url)
const cardRef = ref<HTMLElement | null>(null)

function closeMenu(): void {
  if (openMenuUrl.value === props.site.url) openMenuUrl.value = null
}

function toggleMenu(): void {
  // 点自己已展开的菜单 → 收起；点别的卡 → 展开自己（模块级状态天然做到互斥）
  openMenuUrl.value = menuOpen.value ? null : props.site.url
}

function handleEdit(): void {
  closeMenu()
  emit('edit', props.site)
}

function handleUnmark(): void {
  closeMenu()
  emit('unmark', props.site.url)
}

function handleRemove(): void {
  closeMenu()
  emit('delete', props.site.url)
}

// ===== 图标：只在卡片进入视口附近时才去抓真实 icon（见下方 IntersectionObserver）=====
const iconObserver = ref<IntersectionObserver | null>(null)

/**
 * 图标懒抓取：卡片进入视口（含 200px 预取边距）才去 allorigins 提取真实 icon。
 * 以前是模板里调 getFaviconImgSrc → getIconUrl 顺手发请求（渲染期副作用），
 * 首屏几十张卡会同时打几十个跨域代理请求，且同域名在缓存落地前每次重渲染都重发。
 */
function startIconObserver(): void {
  // 有自定义图标（base64）就不需要抓；没有元素引用也没法观察
  if (props.site.icon) return
  const el = cardRef.value
  if (!el) return
  if (typeof IntersectionObserver === 'undefined') {
    ensureIconCached(props.site.url)
    return
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      ensureIconCached(props.site.url)
      // 只抓一次，抓到就断开，不占滚动时的观察开销
      io.disconnect()
      iconObserver.value = null
    },
    { rootMargin: '200px 0px' }
  )
  io.observe(el)
  iconObserver.value = io
}

onMounted(() => {
  // 文档级监听全页只注册一份（幂等），不再是每张卡各注册一个
  bindCardDocListeners()
  startIconObserver()
})

onBeforeUnmount(() => {
  clearHoverTimer()
  clearAutoCloseTimer()
  iconObserver.value?.disconnect()
  iconObserver.value = null
})

// 四层降级：自定义 icon → 本地缓存 → Google Favicon → 默认 SVG
const handleIconError = (event: Event) => {
  const img = event.target as HTMLImageElement
  const siteUrl = (img.closest('.site-card') as HTMLElement)?.dataset.siteUrl || ''
  const googleUrl = getIconUrl(siteUrl)

  if (img.src !== googleUrl && img.src !== '/default-icon.svg') {
    img.src = googleUrl
  } else if (img.src !== '/default-icon.svg') {
    img.src = '/default-icon.svg'
  }
}

const handleClick = () => {
  // 记录点击次数（使用频率排序）
  sitesStore.incrementClick(props.site.url)
  // 一律新标签打开：站内入口卡（/toolbox /blog /books）同样开新标签，
  // 保留当前导航站页面的筛选与滚动位置，不需要用户回退。
  // noopener：不让新标签通过 window.opener 反向操作本页（tabnabbing）；noreferrer 顺带不泄露来源。
  window.open(props.site.url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div
    ref="cardRef"
    class="site-card"
    :class="{ 'is-drag-over': props.isDragOver, 'is-dragging': props.isDragging, 'is-menu-open': menuOpen }"
    :data-site-url="site.url"
    @mouseenter="handleCardMouseEnter"
    @mouseleave="handleCardMouseLeave"
    @click="handleClick"
  >
    <div v-if="!props.readonly" class="card-actions">
      <button
        type="button"
        class="menu-trigger"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        title="更多操作"
        aria-label="更多操作"
        data-testid="site-card-menu"
        @click.stop="toggleMenu"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="12" cy="19" r="1.9" />
        </svg>
      </button>
      <Transition name="card-menu-fade">
        <div v-if="menuOpen" class="card-menu" role="menu" @click.stop>
          <button type="button" class="card-menu-item" role="menuitem" @click.stop="handleEdit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span>编辑</span>
          </button>
          <button v-if="site.isValid === false" type="button" class="card-menu-item" role="menuitem" @click.stop="handleUnmark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            <span>取消失效标记</span>
          </button>
          <button type="button" class="card-menu-item is-danger" role="menuitem" @click.stop="handleRemove">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
            <span>删除</span>
          </button>
        </div>
      </Transition>
    </div>
    <div class="card-header">
      <div class="favicon-wrapper">
        <img
          :src="getFaviconImgSrc(site.url, site.icon)"
          :alt="site.name"
          class="favicon"
          width="48"
          height="48"
          loading="lazy"
          decoding="async"
          @error="handleIconError"
        />
      </div>
      <div v-if="site.isValid === false" class="invalid-badge" title="链接已失效">
        <Icon name="alert" />
      </div>
    </div>
    <h3 class="site-name">{{ site.name }}</h3>

    <!-- 描述弹框：显示在卡片正上方（底部距卡片顶部 10px），Transition 淡入淡出 -->
    <Transition name="desc-popup-fade">
      <div
        v-if="showDescPopup && hasDescription()"
        class="desc-popup"
        role="tooltip"
        @mouseenter="handlePopupMouseEnter"
        @mouseleave="handlePopupMouseLeave"
      >
        <button
          type="button"
          class="desc-popup-close"
          aria-label="关闭网站描述弹框"
          @click.stop="closeDescPopup"
        >×</button>
        <p class="desc-popup-text">{{ site.description }}</p>
        <!-- 指向卡片的小三角（双层做边框颜色） -->
        <div class="desc-popup-arrow" aria-hidden="true"></div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.site-card {
  background-color: var(--color-bg-card, #ffffff);
  border-radius: 10px;
  padding: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  position: relative;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.25s ease,
              border-color 0.25s ease,
              opacity 0.15s ease;
}

.site-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  border-color: var(--color-border, #e2e8f0);
}

.site-card.is-dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.site-card.is-drag-over {
  border-color: var(--color-primary, #3b82f6);
  border-style: dashed;
  transform: scale(1.02);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.site-card.is-menu-open {
  z-index: 60;
}

.card-header {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 10px;
  position: relative;
}

.favicon-wrapper {
  position: relative;
  display: inline-flex;
}

.favicon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
  background-color: var(--color-bg, #f8fafc);
  transition: transform 0.2s ease;
}

.site-card:hover .favicon {
  transform: scale(1.08);
}

.invalid-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  font-size: 14px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.card-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
}

.menu-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease, background-color 0.15s ease;
}

.site-card:hover .menu-trigger,
.site-card:focus-within .menu-trigger {
  opacity: 1;
}

.menu-trigger:hover {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.1));
  color: var(--color-primary, #3b82f6);
}

.menu-trigger:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 2px;
  opacity: 1;
}

.card-menu {
  position: absolute;
  top: 30px;
  right: 0;
  min-width: 148px;
  padding: 6px;
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 1600;
  text-align: left;
}

.card-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #334155;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.card-menu-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
}

.card-menu-item:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: -2px;
}

.card-menu-item.is-danger {
  color: var(--color-error, #ef4444);
}

.card-menu-item.is-danger:hover {
  background-color: #fef2f2;
  color: var(--color-error, #ef4444);
}

.card-menu-fade-enter-active,
.card-menu-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.card-menu-fade-enter-from,
.card-menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.site-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  margin: 0;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ================================
   描述弹框：卡片正上方显示
   ================================ */
.desc-popup {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%);
  background: var(--color-bg-card, #ffffff);
  color: var(--color-text, #1e293b);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 12px 14px;
  width: 240px;
  max-width: 80vw;
  z-index: 1500;
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
  cursor: default;
}

.desc-popup-close {
  position: absolute;
  top: 4px;
  right: 6px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  color: var(--color-text-muted, #94a3b8);
  padding: 2px 6px;
  border-radius: 6px;
  transition: color 0.15s, background-color 0.15s;
}
.desc-popup-close:hover {
  color: var(--color-text, #1e293b);
  background-color: var(--color-bg-hover, #f1f5f9);
}

.desc-popup-text {
  margin: 0;
  padding-right: 18px;
  word-break: break-word;
  white-space: pre-wrap;
  color: var(--color-text, #1e293b);
}

.desc-popup-arrow {
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid var(--color-border, #e2e8f0);
}
.desc-popup-arrow::after {
  content: '';
  position: absolute;
  left: 50%;
  top: -9px;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 7px solid var(--color-bg-card, #ffffff);
}

/* Transition：淡入淡出 + 轻微上下位移，保持 translateX(-50%) 居中 */
.desc-popup-fade-enter-active,
.desc-popup-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.desc-popup-fade-enter-from,
.desc-popup-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
}

/* ===== 触屏 / 窄屏：放大菜单触发区（44px 触控目标下限） ===== */
@media (max-width: 768px), (pointer: coarse) {
  .menu-trigger {
    width: 44px;
    height: 44px;
    opacity: 0.85;
    background: var(--color-bg-hover, #f1f5f9);
  }
  .card-menu {
    /* 触发区放大到 44px 后，菜单相应下移避免与之重叠 */
    top: 48px;
    min-width: 160px;
  }
  .card-menu-item {
    min-height: 44px;
  }
}

/* ================ 暗色主题 ================ */
:global(.dark) .menu-trigger {
  background: transparent;
  color: var(--color-text-muted, #94a3b8);
}
:global(.dark) .menu-trigger:hover {
  background: var(--color-primary-soft, rgba(96, 165, 250, 0.18));
}

:global(.dark) .card-menu {
  background: var(--color-bg-card, #1e293b);
  border-color: #334155;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

:global(.dark) .card-menu-item {
  color: #cbd5e1;
}

:global(.dark) .card-menu-item:hover {
  background-color: #334155;
  color: var(--color-primary, #60a5fa);
}

:global(.dark) .card-menu-item.is-danger {
  color: #f87171;
}

:global(.dark) .card-menu-item.is-danger:hover {
  background-color: rgba(248, 113, 113, 0.16);
  color: #f87171;
}

:global(.dark) .desc-popup {
  background: var(--color-bg-card, #1e293b);
  color: var(--color-text, #e2e8f0);
  border-color: #334155;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
:global(.dark) .desc-popup-close {
  color: var(--color-text-muted, #64748b);
}
:global(.dark) .desc-popup-close:hover {
  color: var(--color-text, #f8fafc);
  background-color: #334155;
}
:global(.dark) .desc-popup-text {
  color: var(--color-text, #e2e8f0);
}
:global(.dark) .desc-popup-arrow {
  border-top-color: #334155;
}
:global(.dark) .desc-popup-arrow::after {
  border-top-color: var(--color-bg-card, #1e293b);
}
</style>
