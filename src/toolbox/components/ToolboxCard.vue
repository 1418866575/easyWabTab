<script setup lang="ts">
/**
 * 工具卡片
 *
 * 信息层级（自上而下）：
 *   分类色点 + 分类名（弱化）      ☆ 收藏
 *   图标 + 名称（主视觉）
 *   描述 2 行（次视觉，超长省略，悬停出全文气泡）
 *   使用次数（仅 >0 时展示，避免 153 张卡各挂一句「使用 0 次」）
 *
 * - 说明默认内联展示，不再依赖「悬停 1s」才发现（原实现把唯一的解释性信息藏了起来）
 * - 仅当描述被截断时才需要气泡；悬停 450ms 出全文，移出即收
 * - 收藏点击不冒泡，避免误触发打开
 * - 名称与描述按关键字高亮（片段渲染，不用 v-html）
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { categoryName } from '../config/categories'
import { splitHighlight } from '../core/highlight'
import type { ToolboxToolMeta } from '../types'

const props = withDefaults(
  defineProps<{
    meta: ToolboxToolMeta
    favorite: boolean
    keyword?: string
    /** 点击次数（0 时不展示） */
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
const categoryLabel = computed(() => categoryName(props.meta.category))
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
    (props.meta.description ? '：' + props.meta.description : '') +
    (hits.value ? `（已使用 ${hits.value} 次）` : '') +
    (disabled.value ? '（' + statusLabel.value + '，暂不可用）' : '')
)

/**
 * 全文气泡：仅当描述真的被 2 行截断时才需要。
 * 悬停 450ms 后测量 scrollHeight，超过可视高才显示。
 */
const descEl = ref<HTMLElement | null>(null)
const showDesc = ref(false)
let hoverTimer: ReturnType<typeof setTimeout> | null = null

function onCardEnter(): void {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => {
    hoverTimer = null
    const el = descEl.value
    if (el && el.scrollHeight > el.clientHeight + 1) showDesc.value = true
  }, 450)
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
    :class="{ 'is-disabled': disabled, 'is-fav': favorite }"
    :data-testid="'tb-card-' + meta.id"
    :aria-label="ariaLabel"
    :aria-disabled="disabled ? 'true' : undefined"
    @mouseenter="onCardEnter"
    @mouseleave="onCardLeave"
    @click="emit('open')"
  >
    <!-- 顶行：分类（色点 + 名称，弱化）+ 收藏星标 -->
    <span class="tb-card-head">
      <span class="tb-card-cat">
        <span class="tb-card-cat-dot" aria-hidden="true" />
        <span class="tb-card-cat-text">{{ categoryLabel }}</span>
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
    </span>

    <!-- 主视觉：图标 + 名称 -->
    <span class="tb-card-main">
      <span class="tb-card-icon" aria-hidden="true">{{ meta.icon }}</span>
      <span class="tb-card-name">
        <mark v-for="(p, i) in nameParts" :key="'n' + i" :class="{ 'is-hit': p.hit }">{{ p.text }}</mark>
      </span>
    </span>

    <!-- 次视觉：描述（2 行截断，把原本藏在悬停里的信息放出来） -->
    <span ref="descEl" class="tb-card-desc">
      <mark v-for="(p, i) in descParts" :key="'d' + i" :class="{ 'is-hit': p.hit }">{{ p.text }}</mark>
    </span>

    <!-- 底行：使用次数 >0 或非可用状态时才渲染（否则会留下一条 16px 空行） -->
    <span v-if="hits || disabled" class="tb-card-foot">
      <span v-if="hits" class="tb-card-uses">使用 {{ hits }} 次</span>
      <span v-if="disabled" class="tb-card-status" :class="'is-' + meta.status">{{ statusLabel }}</span>
    </span>

    <!-- 描述被截断时的全文气泡 -->
    <span v-if="showDesc" class="tb-card-popover" role="tooltip">
      <mark v-for="(p, i) in descParts" :key="'p' + i" :class="{ 'is-hit': p.hit }">{{ p.text }}</mark>
    </span>
  </button>
</template>

<style scoped>
.tb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3) calc(var(--space-3) - 2px);
  text-align: left;
  font-family: var(--font-family);
  min-height: 44px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: transform var(--motion-duration) var(--motion-ease),
    box-shadow var(--motion-duration) var(--motion-ease),
    border-color var(--motion-duration) var(--motion-ease);
}.tb-card:hover {
  /* 气泡要盖住相邻卡片；hover 卡片本身提升层叠，避免被后面的卡片挡住 */
  z-index: 2;
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover);
  border-color: var(--color-primary);
}
.tb-card:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.tb-card.is-disabled { opacity: 0.62; cursor: not-allowed; }
.tb-card.is-disabled:hover {
  transform: none;
  box-shadow: var(--shadow-card);
  border-color: var(--color-border);
}

/* 顶行：分类在左、收藏在右 */
.tb-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: 0;
}
/* 分类：色点 + 灰字。153 张卡里分类会大量重复，
   用主色胶囊会形成「糖果网格」噪声，降级为中性 meta */
.tb-card-cat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: var(--fs-caption);
  line-height: 1.4;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
}
.tb-card-cat-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  opacity: 0.75;
}
.tb-card-cat-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 主视觉：图标 + 名称 */
.tb-card-main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}
.tb-card-icon {
  width: 42px;
  height: 42px;
  flex: none;
  border-radius: var(--radius-lg);
  display: grid;
  place-items: center;
  font-size: calc(var(--fs-lg) + 6px);
  line-height: 1;
  background: var(--color-bg-hover);
  border: 1px solid var(--color-border);
  transition: background-color var(--motion-duration) var(--motion-ease),
    border-color var(--motion-duration) var(--motion-ease);
}
.tb-card:hover .tb-card-icon {
  background: var(--color-primary-soft);
  border-color: transparent;
}
.tb-card-name {
  font-size: var(--fs-md);
  font-weight: 600;
  line-height: 1.35;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.tb-card.is-disabled .tb-card-name { color: var(--color-text-secondary); }

/* 次视觉：描述 2 行 —— 占据剩余高度，避免卡内出现空洞 */
.tb-card-desc {
  flex: 1 1 auto;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  min-height: calc(var(--fs-sm) * 1.6 * 2);
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--color-text-secondary);
  word-break: break-word;
}

/* 底行 */
.tb-card-foot {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 16px;
}
.tb-card-uses {
  font-size: var(--fs-caption);
  color: var(--color-text-muted);
  white-space: nowrap;
}
.tb-card-status {
  margin-left: auto;
  padding: 1px 7px;
  font-size: var(--fs-caption);
  line-height: 1.6;
  border-radius: var(--radius-full);
  white-space: nowrap;
  color: var(--color-warning-text);
  background: var(--color-warning-soft);
}
.tb-card-status.is-coming {
  color: var(--color-primary-text);
  background: var(--color-primary-soft);
}

/* 未命中片段用透明 mark，保证结构一致且不产生视觉差异 */
.tb-card-name mark,
.tb-card-desc mark,
.tb-card-popover mark {
  background: transparent;
  color: inherit;
  padding: 0;
}
.tb-card-name mark.is-hit,
.tb-card-desc mark.is-hit,
.tb-card-popover mark.is-hit {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  border-radius: 3px;
  padding: 0 1px;
}

/* 收藏星标：默认弱化，hover 卡片或已收藏时才显眼 */
.tb-card-fav {
  flex: none;
  border: none;
  background: transparent;
  font-size: var(--fs-md);
  line-height: 1;
  padding: 4px;
  margin: -4px -4px -4px 0;
  border-radius: var(--radius-sm);
  min-width: 26px;
  min-height: 26px;
  color: var(--color-text-soft);
  transition: color var(--motion-duration) var(--motion-ease),
    background-color var(--motion-duration) var(--motion-ease);
}
.tb-card:hover .tb-card-fav { color: var(--color-text-muted); }
.tb-card-fav:hover { background: var(--color-bg-hover); color: var(--color-warning-text); }
.tb-card-fav[aria-pressed="true"] { color: var(--color-warning-text); }

/* 全文气泡：仅描述被截断时出现 */
.tb-card-popover {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  z-index: 20;
  width: max-content;
  max-width: min(300px, calc(100vw - 32px));
  padding: var(--space-2) var(--space-3);
  font-size: var(--fs-caption);
  line-height: 1.65;
  color: var(--color-text);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card-hover);
  pointer-events: none;
  text-align: left;
  white-space: normal;
  transform: translateX(-50%);
  animation: tb-pop-in var(--motion-duration) var(--motion-ease) both;
}
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
  .tb-card { transition: none; }
}
</style>
