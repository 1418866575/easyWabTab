<script setup lang="ts">
/**
 * 健康工作台 · 菜谱列表页
 * 结构与工具箱 ToolboxView 对齐：搜索框 → 分类页签 → 卡片网格 → 点击弹框。
 * 页面滚动交给 HealthView 的 .wb-content（唯一滚动容器），本组件不自建滚动区。
 */
import { computed, ref } from 'vue'
import BaseTabs from '@/components/common/BaseTabs.vue'
import Icon from '@/components/Icon.vue'
import RecipeCard from './RecipeCard.vue'
import RecipeDialog from './RecipeDialog.vue'
import { RECIPES, type Recipe } from './recipeData'

const keyword = ref('')
const category = ref('')
const activeRecipe = ref<Recipe | null>(null)

/** 最后一个页签是安全筛选而非分类：汇总生品有毒 / 处理不当会产生毒素的菜 */
const RISK_TAB = 'risk'

const tabs = computed(() => [
  { value: '', label: '全部', emoji: '📋', badge: RECIPES.length, testid: 'recipe-tab-all' },
  {
    value: '家常荤菜', label: '家常荤菜', emoji: '🍖',
    badge: RECIPES.filter((r) => r.category === '家常荤菜').length, testid: 'recipe-tab-meat'
  },
  {
    value: '羊肉做法', label: '羊肉做法', emoji: '🐑',
    badge: RECIPES.filter((r) => r.category === '羊肉做法').length, testid: 'recipe-tab-lamb'
  },
  {
    value: '下饭小炒', label: '下饭小炒', emoji: '🥘',
    badge: RECIPES.filter((r) => r.category === '下饭小炒').length, testid: 'recipe-tab-stir'
  },
  {
    value: '白菜做法', label: '白菜做法', emoji: '🥬',
    badge: RECIPES.filter((r) => r.category === '白菜做法').length, testid: 'recipe-tab-cabbage'
  },
  {
    value: '鱼类做法', label: '鱼类做法', emoji: '🐟',
    badge: RECIPES.filter((r) => r.category === '鱼类做法').length, testid: 'recipe-tab-fish'
  },
  {
    value: '虾类做法', label: '虾类做法', emoji: '🦐',
    badge: RECIPES.filter((r) => r.category === '虾类做法').length, testid: 'recipe-tab-shrimp'
  },
  {
    value: '其他海鲜', label: '其他海鲜', emoji: '🦀',
    badge: RECIPES.filter((r) => r.category === '其他海鲜').length, testid: 'recipe-tab-otherseafood'
  },
  {
    value: '豆腐做法', label: '豆腐做法', emoji: '🍲',
    badge: RECIPES.filter((r) => r.category === '豆腐做法').length, testid: 'recipe-tab-tofu'
  },
  {
    value: '家常素菜', label: '家常素菜', emoji: '🥬',
    badge: RECIPES.filter((r) => r.category === '家常素菜').length, testid: 'recipe-tab-veggie'
  },
  {
    value: '凉菜主食', label: '凉菜主食', emoji: '🍜',
    badge: RECIPES.filter((r) => r.category === '凉菜主食').length, testid: 'recipe-tab-coldstaple'
  },
  {
    value: RISK_TAB, label: '食品安全', emoji: '⚠️',
    badge: RECIPES.filter((r) => r.safety.level === 'danger').length, testid: 'recipe-tab-risk'
  }
])

/** 搜索覆盖菜名、食材、做法、毒理提示与过敏原，便于直接搜「四季豆」「有毒」 */
const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return RECIPES.filter((r) => {
    if (category.value === RISK_TAB && r.safety.level !== 'danger') return false
    if (category.value && category.value !== RISK_TAB && r.category !== category.value) return false
    if (!q) return true
    return [
      r.name, r.intro, r.category, r.safety.toxicity,
      ...r.ingredients, ...r.seasonings, ...r.steps, ...r.tips,
      ...r.safety.hazards, ...r.allergens
    ].join(' ').toLowerCase().includes(q)
  })
})
</script>

<template>
  <div class="recipe-page">
    <div class="ui-search recipe-search" role="search">
      <Icon name="search" :size="14" />
      <input
        v-model="keyword"
        class="ui-search-input"
        type="text"
        placeholder="搜菜名 / 食材 / 做法，如：番茄、四季豆"
        data-testid="recipe-search"
      />
    </div>

    <BaseTabs v-model="category" :items="tabs" testid="recipe-tab" />

    <p class="recipe-count">共 {{ filtered.length }} 道菜 · 点击卡片查看成品图、食材、做法与注意事项</p>

    <div class="recipe-grid" data-testid="recipe-grid">
      <RecipeCard
        v-for="recipe in filtered"
        :key="recipe.id"
        :recipe="recipe"
        @open="activeRecipe = recipe"
      />
    </div>
    <p v-if="!filtered.length" class="empty-state recipe-empty">没有找到匹配的菜谱，换个关键词或页签试试。</p>

    <RecipeDialog
      v-if="activeRecipe"
      :recipe="activeRecipe"
      @close="activeRecipe = null"
    />
  </div>
</template>

<style scoped>
.recipe-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
}
.recipe-search { max-width: 480px; }
.recipe-count {
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--color-text-muted);
}
.recipe-grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
}
.recipe-empty { margin: var(--space-4) 0; }

@media (max-width: 768px) {
  .recipe-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
}
@media (max-width: 359px) {
  .recipe-grid { grid-template-columns: 1fr; }
}
</style>
