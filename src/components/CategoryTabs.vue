<script setup lang="ts">
import { computed } from 'vue'
import { useSitesStore } from '../stores/sites'
import { useCategoriesStore } from '../stores/categories'
import { isImageIcon } from '../composables/categoryIcon'
import BaseTabs from './common/BaseTabs.vue'

const store = useSitesStore()
const categoriesStore = useCategoriesStore()

const props = withDefaults(defineProps<{
  hideEmpty?: boolean
}>(), {
  hideEmpty: false
})

const categories = computed(() => {
  const all = categoriesStore.allCategories
  if (!props.hideEmpty) return all
  return all.filter(cat => store.sites.some(site => site.category === cat.id))
})

// 每个分类的网站数量（统计全部站点，不受搜索/标签过滤影响）
const countByCategory = computed(() => {
  const counts: Record<string, number> = {}
  for (const site of store.sites) {
    counts[site.category] = (counts[site.category] ?? 0) + 1
  }
  return counts
})

// 全部站点数量
const totalCount = computed(() => store.sites.length)

/** 分类页签：全部 + 各分类（图标可能是图片 URL，也可能是 emoji） */
const tabItems = computed(() => [
  { value: '', label: '全部', badge: totalCount.value },
  ...categories.value.map((cat) => ({
    value: cat.id,
    label: cat.name,
    image: isImageIcon(cat.icon) ? cat.icon : '',
    emoji: isImageIcon(cat.icon) ? '' : cat.icon,
    badge: countByCategory.value[cat.id] ?? 0
  }))
])
</script>

<template>
  <div class="category-tabs-wrapper">
    <BaseTabs
      :model-value="store.selectedCategory"
      :items="tabItems"
      deselectable
      @update:model-value="store.setCategory($event)"
    />
  </div>
</template>

<style scoped>
/* 外壳留白由这里负责；页签皮肤见 common/BaseTabs.vue（不要再写 .category-tab） */
.category-tabs-wrapper {
  margin-bottom: 20px;
  padding: 12px;
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

/* ============================================================
 * 导航站分类标签：结构/交互走 BaseTabs，视觉单独定制——
 * 胶囊 + 1px --ds-line 边框，选中态实心主色白字。
 * 原因：首页是卡片网格，实心胶囊与站点头像/卡片语言一致；
 * 块状浅底页签放在这里会与整页观感脱节。
 * 覆盖带 .ui-tabs 前缀以提升特异性，压过 BaseTabs 的 scoped 规则。
 * ============================================================ */
.category-tabs-wrapper :deep(.ui-tabs .el-radio-button__inner) {padding: 0 12px;
  border: 1px solid var(--ds-line, var(--color-border, #e2e8f0));
  border-radius: var(--radius-full, 9999px);
  background-color: #ffffff;
  color: var(--ds-text-2, var(--color-text-secondary, #475569));
  /* 2026-11 导航站优化：分类名增大一号（12→13px） */
  font-size: 13px;
  height: 36px;}

.category-tabs-wrapper :deep(.ui-tabs .el-radio-button__inner:hover) {
  border-color: var(--ds-primary, var(--color-primary, #3b82f6));
  color: var(--ds-primary, var(--color-primary, #3b82f6));
  background-color: #ffffff;
}

.category-tabs-wrapper :deep(.ui-tabs .el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: var(--ds-primary, var(--color-primary, #3b82f6));
  border-color: var(--ds-primary, var(--color-primary, #3b82f6));
  color: #ffffff;
  font-weight: 500;
}

/* 数量与文字同色（选中态随白字） */
.category-tabs-wrapper :deep(.ui-tab-badge) {
  color: inherit;
  font-size: 12px;
  opacity: 0.72;
}

/* 暗色：边框/底色跟随深色 token，选中态同样实心 */
html.dark .category-tabs-wrapper :deep(.ui-tabs .el-radio-button__inner) {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--ds-line, var(--color-border, #374151));
  color: var(--ds-text-2, #d1d5db);
}

html.dark .category-tabs-wrapper :deep(.ui-tabs .el-radio-button__inner:hover) {
  border-color: var(--ds-primary, #60a5fa);
  color: var(--ds-primary, #60a5fa);
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .category-tabs-wrapper :deep(.ui-tabs .el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: var(--ds-primary, #2563eb);
  border-color: var(--ds-primary, #2563eb);
  color: #ffffff;
}
</style>
