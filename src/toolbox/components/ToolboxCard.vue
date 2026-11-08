<script setup lang="ts">
/**
 * 工具卡片：图标 / 名称 / 标签 / 形态与状态徽标 / 收藏按钮 + 悬停说明浮层。
 * - 说明文字默认隐藏，悬停满 1s 浮出、移出即收起（计时器按卡片实例独立）
 * - 收藏点击不冒泡，避免误触发打开
 * - 名称与说明按关键字高亮（片段渲染，不用 v-html）
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { splitHighlight } from '../core/highlight'
import type { ToolboxToolMeta } from '../types'

const props = withDefaults(
  defineProps<{
    meta: ToolboxToolMeta
    favorite: boolean
    keyword?: string
    /** 点击次数（0 表示未使用过，不展示） */
    clicks?: number
  }>(),
  { keyword: '', clicks: 0 }
)

const emit = defineEmits<{
  (e: 'open'): void
  (e: 'toggle-fav'): void
}>()

const disabled = computed(() => props.meta.status !== 'active')
const statusLabel = computed(
  () => ({ active: '可用', maintenance: '维护中', coming: '即将上线' })[props.meta.status] || '未知'
)
const nameParts = computed(() => splitHighlight(props.meta.name, props.keyword))
const descParts = computed(() => splitHighlight(props.meta.description, props.keyword))
const hits = computed(() => {
  const n = Math.floor(Number(props.clicks))
  return Number.isFinite(n) && n > 0 ? n : 0
})
const ariaLabel = computed(
  () =>
    '打开 ' +
    props.meta.name +
    (hits.value ? `（已使用 ${hits.value} 次）` : '') +
    (disabled.value ? '（' + statusLabel.value + '，暂不可用）' : '')
)

/**
 * 说明浮层：悬停满 1s 才显示，移出立即收起。
 * 计时器与开关都是本组件实例自己的，卡片之间互不影响。
 */
const showDesc = ref(false)
let hoverTimer: ReturnType<typeof setTimeout> | null = null
function onCardEnter(): void {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => {
    showDesc.value = true
    hoverTimer = null
  }, 1000)
}
function onCardLeave(): void {
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  showDesc.value = false
}
onBeforeUnmount(() => {
  if (hoverTimer) clearTimeout(hoverTimer)
})
</script>

<template>
  <button
    type="button"
    class="tb-card"
    :class="{ 'is-disabled': disabled }"
    :data-testid="'tb-card-' + meta.id"
    :aria-label="ariaLabel"
    :aria-disabled="disabled ? 'true' : undefined"
    @mouseenter="onCardEnter"
    @mouseleave="onCardLeave"
    @click="emit('open')"
  >
    <!-- 图标在上、名称在下的上下结构；收藏星标脱离文档流，固定右上角 -->
    <span class="tb-card-top">
      <span class="tb-card-icon" aria-hidden="true">{{ meta.icon }}</span>
      <span class="tb-card-name">
        <mark v-for="(p, i) in nameParts" :key="'n' + i" :class="{ 'is-hit': p.hit }">{{ p.text }}</mark>
      </span>
    </span>
    <span
      class="tb-card-fav"
      role="button"
      tabindex="0"
      :data-testid="'tb-fav-' + meta.id"
      :aria-pressed="favorite"
      :aria-label="(favorite ? '取消收藏 ' : '收藏 ') + meta.name"
      @click.stop="emit('toggle-fav')"
      @keydown.enter.stop.prevent="emit('toggle-fav')"
      @keydown.space.stop.prevent="emit('toggle-fav')"
    >{{ favorite ? '★' : '☆' }}</span>

    <!-- 说明默认隐藏；悬停满 1s 在卡片上方浮出小气泡，移出即收起。不吃鼠标事件，不影响相邻卡片 hover -->
    <span v-if="showDesc" class="tb-card-popover" role="tooltip">
      <mark v-for="(p, i) in descParts" :key="'d' + i" :class="{ 'is-hit': p.hit }">{{ p.text }}</mark>
    </span>

    <span class="tb-card-meta">
      <span v-for="t in meta.tags.slice(0, 3)" :key="t" class="tb-tag">{{ t }}</span>
      <span v-if="hits" class="tb-hits" :title="`已使用 ${hits} 次`">🔥 {{ hits }}</span>
      <span v-if="disabled" class="tb-badge" :class="meta.status">{{ statusLabel }}</span>
      <span v-else-if="meta.kind === 'module'" class="tb-badge internal">站内模块</span>
    </span>
  </button>
</template>

<style scoped>
.tb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 14px;
  text-align: left;
  font-family: var(--font-family);
  min-height: 44px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  transition: transform var(--motion-duration) var(--motion-ease),
    box-shadow var(--motion-duration) var(--motion-ease),
    border-color var(--motion-duration) var(--motion-ease);
}
.tb-card:hover {
  /* 浮层要盖住相邻卡片；hover 卡片本身提升层叠，避免被后面的卡片挡住 */
  z-index: 2;
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover);
  border-color: var(--color-primary);
}
.tb-card.is-disabled { opacity: .62; cursor: not-allowed; }
.tb-card.is-disabled:hover {
  transform: none;
  box-shadow: var(--shadow-card);
  border-color: var(--color-border);
}
/* 图标 / 名称上下居中排列 */
.tb-card-top { display: flex; flex-direction: column; align-items: center; gap: 10px; min-width: 0; text-align: center; }
.tb-card-icon {
  width: 46px;
  height: 46px;
  flex: none;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-size: calc(var(--fs-lg) + 8px);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.tb-card-name {
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.tb-card.is-disabled .tb-card-name { color: var(--color-text-secondary); }
/* 未命中片段用透明 mark，保证结构一致且不产生视觉差异 */
.tb-card-name mark,
.tb-card-popover mark {
  background: transparent;
  color: inherit;
  padding: 0;
}
.tb-card-name mark.is-hit,
.tb-card-popover mark.is-hit {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  border-radius: 3px;
  padding: 0 1px;
}
.tb-card-fav {
  position: absolute;
  top: 10px;
  right: 10px;
  border: none;
  background: transparent;
  font-size: var(--fs-md);
  line-height: 1;
  padding: 6px;
  border-radius: 6px;
  min-width: 30px;
  min-height: 30px;
  color: var(--color-text-muted);
  transition: color var(--motion-duration) var(--motion-ease),
    background-color var(--motion-duration) var(--motion-ease);
}
.tb-card-fav:hover { background: var(--color-bg-hover); color: var(--color-warning-text); }
.tb-card-fav[aria-pressed="true"] { color: var(--color-warning-text); }
/* 说明浮层：卡片上方的小气泡，带指向卡片的尖角；不遮挡本卡片信息 */
.tb-card-popover {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  z-index: 20;
  width: max-content;
  max-width: min(260px, calc(100vw - 32px));
  padding: 8px 12px;
  font-size: var(--fs-caption);
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-left: 2px solid var(--color-primary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card-hover);
  pointer-events: none;
  text-align: left;
  white-space: normal;
  transform: translateX(-50%);
  animation: tb-pop-in var(--motion-duration, 220ms) var(--motion-ease, ease) both;
}
/* 尖角与浮层同底色同边框，指向下方卡片 */
.tb-card-popover::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 50%;
  width: 8px;
  height: 8px;
  background: var(--color-bg-card);
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  border-bottom-right-radius: 2px;
  transform: translateX(-50%) rotate(45deg);
}
@keyframes tb-pop-in {
  from { opacity: 0; translate: 0 5px; }
  to { opacity: 1; translate: 0 0; }
}
@media (prefers-reduced-motion: reduce) {
  .tb-card-popover { animation: none; }
}
.tb-card-meta { display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; margin-top: auto; }
.tb-tag {
  font-size: var(--fs-caption);
  padding: 1px 7px;
  border-radius: var(--radius-full);
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}
.tb-hits {
  font-size: var(--fs-caption);
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-weight: 600;
  color: var(--color-primary-text);
  background: var(--color-primary-soft);
  border: 1px solid transparent;
}
.tb-badge {
  font-size: var(--fs-caption);
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-weight: 600;
  border: 1px solid transparent;
}
.tb-badge.maintenance { background: var(--color-warning-soft); color: var(--color-warning-text); }
.tb-badge.coming { background: var(--color-bg-hover); color: var(--color-text-secondary); }
.tb-badge.internal { background: var(--color-success-soft); color: var(--color-success-text); }
</style>
