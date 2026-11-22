<script setup lang="ts">
/**
 * 分类筛选
 *
 * 两种形态（prop layout）：
 * - 'rail'（默认）：左侧竖排常驻栏。153 个工具要滚动 6000+px，
 *   横排分类栏会占掉首屏 118px/3 行，且滚下去就找不到了。
 * - 'bar'：横排胶囊，移动端 / 无法容纳侧栏时使用。
 *
 * aria-pressed 表达选中态；数量为 0 的分类自动隐藏。
 */
import { computed } from 'vue'
import { TOOLBOX_CATEGORIES } from '../config/categories'
import { countByCategory } from '../core/search'
import { MODULE_CATEGORY_ID } from '../core/category'
import type { ToolboxToolMeta } from '../types'

const props = withDefaults(
  defineProps<{
    modelValue: string
    tools: ToolboxToolMeta[]
    layout?: 'rail' | 'bar'
  }>(),
  { layout: 'rail' }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

/**
 * data-testid：桌面侧栏用默认前缀 tb-cat-，移动端横排用 tb-barcat-。
 * 两套 DOM 同时存在（靠 CSS 显隐），若都用 tb-cat- 会出现同 testid 两个节点，
 * Playwright strict mode 直接报错（既有 QA 脚本正是按 tb-cat-<id> 点击的）。
 */
const testidPrefix = computed(() => (props.layout === 'bar' ? 'tb-barcat-' : 'tb-cat-'))

/**
 * 页签：「全部」+ 有工具的分类（数量为 0 的分类自动隐藏，避免空页签干扰）。
 * 站内模块专属分类单独成一项，方便直达站内既有功能。
 */
const tabs = computed(() => [
  { id: '', name: '全部', icon: '🗂️', count: props.tools.length, module: false },
  ...TOOLBOX_CATEGORIES.map(c => ({
    ...c,
    count: countByCategory(props.tools, c.id),
    module: c.id === MODULE_CATEGORY_ID
  })).filter(c => c.count > 0)
])
</script>

<template>
  <div class="tb-cats" :class="'is-' + props.layout" role="group" aria-label="工具分类筛选">
    <button
      v-for="t in tabs"
      :key="t.id"
      type="button"
      class="tb-cat"
      :class="{ 'is-on': props.modelValue === t.id }"
      :data-testid="testidPrefix + (t.id || 'all')"
      :aria-pressed="props.modelValue === t.id"
      :title="t.module ? '站内已有模块的直达入口（不会跳转第三方）' : t.name"
      @click="emit('update:modelValue', t.id)"
    >
      <span class="tb-cat-icon" aria-hidden="true">{{ t.icon }}</span>
      <span class="tb-cat-name">{{ t.name }}</span>
      <span class="tb-cat-cnt">{{ t.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.tb-cats {
  display: flex;
  gap: var(--space-1);
}

/* ── 左侧竖排栏 ───────────────────────────────────────── */
.tb-cats.is-rail {
  flex-direction: column;
  position: sticky;
  /* 与顶栏下沿对齐；实际可用高度由父级 --tb-rail-top 传入 */
  top: 77px;
  align-self: flex-start;
  /* 关键：用「视口高 - 侧栏真实起始偏移 - 底部缓冲」。
     只减顶栏时，1024×800 下侧栏从 123px 起、705px 高 → 828 > 800，最后一项被切掉。
     --tb-rail-top 由 ToolboxView 实测写入（含顶栏 + 搜索框），resize 时更新。 */
  max-height: calc(100vh - var(--tb-rail-top, 131px) - 16px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--space-2);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  scrollbar-width: thin;
}
/* 分类行紧凑化：19 项要在一屏内放得下，每项 30px 而非 34px */
.tb-cats.is-rail .tb-cat {
  justify-content: flex-start;
  width: 100%;
  min-height: 30px;
  padding: 5px 8px;
  border-radius: var(--radius-md);
  border-color: transparent;
  text-align: left;
  font-size: var(--fs-sm);
}
.tb-cats.is-rail .tb-cat-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tb-cats.is-rail .tb-cat.is-on {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  border-color: transparent;
  font-weight: 600;
}
.tb-cats.is-rail .tb-cat.is-on .tb-cat-cnt {
  background: var(--color-primary);
  color: var(--color-bg-card);
}

/* ── 横排胶囊（移动端）────────────────────────────────── */
.tb-cats.is-bar {
  flex-wrap: wrap;
  flex-direction: row;
  gap: var(--space-2);
}
.tb-cats.is-bar .tb-cat {
  padding: 7px 14px;
  border-radius: var(--radius-full);
  border-color: var(--color-border);
  background: var(--color-bg-card);
}
.tb-cats.is-bar .tb-cat.is-on {
  background: var(--color-primary);
  color: var(--color-bg-card);
  border-color: var(--color-primary);
}

/* ── 共用 ─────────────────────────────────────────────── */
.tb-cat {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: color var(--motion-duration) var(--motion-ease),
    border-color var(--motion-duration) var(--motion-ease),
    background-color var(--motion-duration) var(--motion-ease);
}
.tb-cat:hover {
  color: var(--color-primary-text);
  background: var(--color-bg-hover);
}
.tb-cat:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}
.tb-cat-icon {
  flex: none;
  font-size: var(--fs-md);
  line-height: 1;
}
.tb-cat-cnt {
  flex: none;
  min-width: 20px;
  padding: 0 6px;
  font-size: var(--fs-caption);
  line-height: 1.7;
  text-align: center;
  color: var(--color-text-muted);
  background: var(--color-bg-hover);
  border-radius: var(--radius-full);
  transition: color var(--motion-duration) var(--motion-ease),
    background-color var(--motion-duration) var(--motion-ease);
}
.tb-cats.is-bar .tb-cat-cnt { background: transparent; color: inherit; opacity: 0.78; }
</style>
