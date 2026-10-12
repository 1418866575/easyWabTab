<script setup lang="ts">
/**
 * 博客前台筛选条
 *
 * 受控组件：所有状态由父级（BlogHomeView via useBlogListing）持有，本组件只渲染 + 回传事件。
 * 提供：搜索框、分类 chips、标签 chips、排序下拉、清空筛选。
 * 分类/标签可能较多 → chips 容器横向滚动，不挤压布局。
 */
import { computed } from 'vue'
import Icon from '@/components/Icon.vue'
import type { BlogCategory, BlogSort, BlogTag } from '@/types'

const props = defineProps<{
  keyword: string
  activeCategory: string
  activeTag: string
  sort: BlogSort
  categories: BlogCategory[]
  tags: BlogTag[]
  /** 各分类下的已发布文章数（用于 pill 上的数量徽标；空分类自动隐藏） */
  categoryCounts: Record<string, number>
  /** 各标签下的已发布文章数 */
  tagCounts: Record<string, number>
  /** 「全部分类」徽标：已发布文章总数 */
  totalCount: number
  hasFilter: boolean
  /** 排序可选项（与 BlogSettingsPanel 的 SORT_OPTIONS 保持一致） */
  sortOptions: Array<{ value: BlogSort; label: string }>
}>()

const emit = defineEmits<{
  'update:keyword': [value: string]
  'select-category': [id: string]
  'select-tag': [id: string]
  'update:sort': [value: BlogSort]
  clear: []
}>()

// 仅展示有文章的分类 / 标签（对齐工具箱：空项自动隐藏，避免空页签干扰）
const visibleCategories = computed(() =>
  (props.categories as BlogCategory[]).filter(c => (props.categoryCounts[c.id] ?? 0) > 0)
)
const visibleTags = computed(() =>
  (props.tags as BlogTag[]).filter(t => (props.tagCounts[t.id] ?? 0) > 0)
)
</script>

<template>
  <div class="bf-filter">
    <div class="bf-filter-top">
      <div class="bf-search">
        <Icon name="search" :size="14" class="bf-search-icon" />
        <input
          class="bf-search-input"
          type="search"
          :value="keyword"
          placeholder="搜索标题 / 正文 / 摘要"
          data-testid="blog-front-search"
          @input="emit('update:keyword', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <select
        class="bf-select"
        :value="sort"
        aria-label="排序方式"
        data-testid="blog-front-sort"
        @change="emit('update:sort', ($event.target as HTMLSelectElement).value as BlogSort)"
      >
        <option v-for="o in sortOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <button
        v-if="hasFilter"
        type="button"
        class="bf-clear"
        data-testid="blog-front-clear"
        @click="emit('clear')"
      >
        清空筛选
      </button>
    </div>

    <div v-if="visibleCategories.length" class="bf-chips" role="group" aria-label="按分类筛选">
      <button
        type="button"
        class="bf-chip"
        :class="{ 'is-active': activeCategory === '' }"
        data-testid="blog-front-cat-all"
        @click="emit('select-category', '')"
      >
        全部分类<span class="bf-chip-cnt">{{ totalCount }}</span>
      </button>
      <button
        v-for="c in visibleCategories"
        :key="c.id"
        type="button"
        class="bf-chip"
        :class="{ 'is-active': activeCategory === c.id }"
        :data-testid="`blog-front-cat-${c.id}`"
        @click="emit('select-category', c.id)"
      >
        {{ c.name }}<span class="bf-chip-cnt">{{ categoryCounts[c.id] }}</span>
      </button>
    </div>

    <div v-if="visibleTags.length" class="bf-chips" role="group" aria-label="按标签筛选">
      <button
        type="button"
        class="bf-chip bf-chip--tag"
        :class="{ 'is-active': activeTag === '' }"
        data-testid="blog-front-tag-all"
        @click="emit('select-tag', '')"
      >
        全部标签<span class="bf-chip-cnt">{{ visibleTags.length }}</span>
      </button>
      <button
        v-for="t in visibleTags"
        :key="t.id"
        type="button"
        class="bf-chip bf-chip--tag"
        :class="{ 'is-active': activeTag === t.id }"
        :data-testid="`blog-front-tag-${t.id}`"
        @click="emit('select-tag', t.id)"
      >
        #{{ t.name }}<span class="bf-chip-cnt">{{ tagCounts[t.id] }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.bf-filter {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
}

.bf-filter-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bf-search {
  position: relative;
  flex: 1 1 240px;
  min-width: 180px;
}
.bf-search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted, #94a3b8);
  pointer-events: none;
}
.bf-search-input {
  width: 100%;
  height: 34px;
  padding: 0 10px 0 32px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-input, #ffffff);
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-sm, 13px);
}
.bf-search-input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
}

.bf-select {
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-input, #ffffff);
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-sm, 13px);
}

.bf-clear {
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  cursor: pointer;
}
.bf-clear:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }

.bf-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: thin;
}
.bf-chip {
  flex: 0 0 auto;
  padding: 4px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  white-space: nowrap;
  cursor: pointer;
  transition: border-color var(--motion-duration, 220ms), color var(--motion-duration, 220ms),
    background-color var(--motion-duration, 220ms);
}
.bf-chip:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
/* 选中态：对齐工具箱分类 pill——实心主色填充 + 白字（原为浅色 soft 填充） */
.bf-chip.is-active {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
  font-weight: var(--font-weight-medium, 500);
}
.bf-chip.is-active:hover {
  border-color: var(--color-primary, #3b82f6);
  color: #fff;
}
/* 数量徽标：对齐工具箱 .tb-cat-cnt */
.bf-chip-cnt {
  font-size: var(--font-size-xs, 11px);
  opacity: 0.78;
  margin-left: 2px;
}

@media (max-width: 768px) {
  .bf-search { flex: 1 1 100%; }
  .bf-select, .bf-clear { flex: 1 1 auto; }
}
</style>
