<script setup lang="ts">
/**
 * 工具卡片：图标 / 名称 / 描述 / 标签 / 形态与状态徽标 / 收藏按钮。
 * - 收藏点击不冒泡，避免误触发打开
 * - 名称与描述按关键字高亮（片段渲染，不用 v-html）
 */
import { computed } from 'vue'
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
</script>

<template>
  <button
    type="button"
    class="tb-card"
    :class="{ 'is-disabled': disabled }"
    :data-testid="'tb-card-' + meta.id"
    :aria-label="ariaLabel"
    :aria-disabled="disabled ? 'true' : undefined"
    @click="emit('open')"
  >
    <span class="tb-card-top">
      <span class="tb-card-icon" aria-hidden="true">{{ meta.icon }}</span>
      <span class="tb-card-name">
        <mark v-for="(p, i) in nameParts" :key="'n' + i" :class="{ 'is-hit': p.hit }">{{ p.text }}</mark>
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

    <span class="tb-card-desc">
      <mark v-for="(p, i) in descParts" :key="'d' + i" :class="{ 'is-hit': p.hit }">{{ p.text }}</mark>
    </span>

    <span class="tb-card-meta">
      <span v-for="t in meta.tags.slice(0, 3)" :key="t" class="tb-tag">{{ t }}</span>
      <span v-if="hits" class="tb-hits" :title="`已使用 ${hits} 次`">🔥 {{ hits }}</span>
      <span v-if="disabled" class="tb-badge" :class="meta.status">{{ statusLabel }}</span>
      <span v-else class="tb-badge internal">{{ meta.kind === 'module' ? '站内模块' : '站内自建' }}</span>
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
.tb-card-top { display: flex; align-items: center; gap: 10px; min-width: 0; }
.tb-card-icon {
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 19px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.tb-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tb-card.is-disabled .tb-card-name { color: var(--color-text-secondary); }
/* 未命中片段用透明 mark，保证结构一致且不产生视觉差异 */
.tb-card-name mark,
.tb-card-desc mark {
  background: transparent;
  color: inherit;
  padding: 0;
}
.tb-card-name mark.is-hit,
.tb-card-desc mark.is-hit {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border-radius: 3px;
  padding: 0 1px;
}
.tb-card-fav {
  margin-left: auto;
  flex: none;
  border: none;
  background: transparent;
  font-size: 15px;
  line-height: 1;
  padding: 6px;
  border-radius: 6px;
  min-width: 30px;
  min-height: 30px;
  color: var(--color-text-muted);
  transition: color var(--motion-duration) var(--motion-ease),
    background-color var(--motion-duration) var(--motion-ease);
}
.tb-card-fav:hover { background: var(--color-bg-hover); color: var(--color-warning); }
.tb-card-fav[aria-pressed="true"] { color: var(--color-warning); }
.tb-card-desc {
  font-size: 12.5px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.9em;
}
.tb-card-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: auto; }
.tb-tag {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}
.tb-hits {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-weight: 600;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border: 1px solid transparent;
}
.tb-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-weight: 600;
  border: 1px solid transparent;
}
.tb-badge.maintenance { background: var(--color-warning-soft); color: var(--color-warning); }
.tb-badge.coming { background: var(--color-bg-hover); color: var(--color-text-secondary); }
.tb-badge.internal { background: var(--color-success-soft); color: var(--color-success); }
</style>
