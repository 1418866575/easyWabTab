<script setup lang="ts">
/**
 * 分类筛选：「全部」+ 各分类，带工具数量；aria-pressed 表达选中态。
 */
import { computed } from 'vue'
import { TOOLBOX_CATEGORIES } from '../config/categories'
import { countByCategory } from '../core/search'
import { MODULE_CATEGORY_ID } from '../core/category'
import type { ToolboxToolMeta } from '../types'

const props = defineProps<{
  modelValue: string
  tools: ToolboxToolMeta[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

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
  <div class="tb-cats" role="group" aria-label="工具分类筛选">
    <button
      v-for="t in tabs"
      :key="t.id"
      type="button"
      class="tb-cat"
      :class="{ 'is-on': props.modelValue === t.id }"
      :data-testid="'tb-cat-' + (t.id || 'all')"
      :aria-pressed="props.modelValue === t.id"
      :title="t.module ? '站内已有模块的直达入口（不会跳转第三方）' : undefined"
      @click="emit('update:modelValue', t.id)"
    >
      <span aria-hidden="true">{{ t.icon }}</span>
      <span>{{ t.name }}</span>
      <span class="tb-cat-cnt">{{ t.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.tb-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}
.tb-cat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 7px 14px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  font-weight: 500;
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  transition: color var(--motion-duration) var(--motion-ease),
    border-color var(--motion-duration) var(--motion-ease),
    background-color var(--motion-duration) var(--motion-ease);
}
.tb-cat:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.tb-cat.is-on {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
.tb-cat-cnt { font-size: var(--font-size-xs); opacity: .78; }
</style>
