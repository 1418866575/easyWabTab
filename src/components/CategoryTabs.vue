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
</style>
