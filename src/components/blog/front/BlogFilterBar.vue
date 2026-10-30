<script setup lang="ts">
/**
 * 博客前台筛选条
 *
 * 受控组件：所有状态由父级（BlogHomeView via useBlogListing）持有，本组件只渲染 + 回传事件。
 * 提供：搜索框、分类 chips、标签 chips、排序下拉、清空筛选。
 *
 * 视觉对齐工具箱（ToolboxView）：搜索框单行居中（最大 720px）+ 分类 pill 自动换行 +
 * 选中实心主色；排序/清空作为右对齐的次级操作行，不打断「搜索 → 分类」的竖排节奏。
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
    <!-- 搜索框：单行居中，最大 720px（对齐工具箱 .tb-search-wrap） -->
    <div class="bf-search-wrap">
      <div class="bf-search" role="search">
        <Icon name="search" :size="18" class="bf-search-icon" />
        <input
          class="bf-search-input"
          type="search"
          :value="keyword"
          placeholder="搜索标题 / 正文 / 摘要"
          data-testid="blog-front-search"
          @input="emit('update:keyword', ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="keyword"
          type="button"
          class="bf-search-clear"
          data-testid="blog-front-search-clear"
          title="清空搜索"
          aria-label="清空搜索"
          @click="emit('update:keyword', '')"
        >✕</button>
      </div>
    </div>

    <!-- 分类 chips：自动换行（对齐工具箱 .tb-cats，不再横向滚动） -->
    <div v-if="visibleCategories.length" class="bf-chips" role="group" aria-label="按分类筛选">
      <button
        type="button"
        class="bf-chip"
        :class="{ 'is-active': activeCategory === '' }"
        data-testid="blog-front-cat-all"
        @click="emit('select-category', '')"
      >
        <span class="bf-chip-ico" aria-hidden="true">🗂️</span>
        <span class="bf-chip-name">全部分类</span>
        <span class="bf-chip-cnt">{{ totalCount }}</span>
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
        <span class="bf-chip-ico" aria-hidden="true">{{ c.icon || '📁' }}</span>
        <span class="bf-chip-name">{{ c.name }}</span>
        <span class="bf-chip-cnt">{{ categoryCounts[c.id] }}</span>
      </button>
    </div>

    <!-- 标签 chips -->
    <div v-if="visibleTags.length" class="bf-chips" role="group" aria-label="按标签筛选">
      <button
        type="button"
        class="bf-chip bf-chip--tag"
        :class="{ 'is-active': activeTag === '' }"
        data-testid="blog-front-tag-all"
        @click="emit('select-tag', '')"
      >
        <span class="bf-chip-ico" aria-hidden="true">🏷️</span>
        <span class="bf-chip-name">全部标签</span>
        <span class="bf-chip-cnt">{{ visibleTags.length }}</span>
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
        <span class="bf-chip-ico" aria-hidden="true">#</span>
        <span class="bf-chip-name">{{ t.name }}</span>
        <span class="bf-chip-cnt">{{ tagCounts[t.id] }}</span>
      </button>
    </div>

    <!-- 排序 / 清空筛选：右对齐的次级操作行 -->
    <div class="bf-filter-meta">
      <span class="bf-meta-label">排序</span>
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
  </div>
</template>

<style scoped>
/* 外层不再自绘卡片：搜索框 / 分类 pill 直接落在页面底色上（对齐工具箱首页观感） */
.bf-filter {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 搜索行：水平居中 + 上限宽，宽屏不铺满、窄屏自适应 */
.bf-search-wrap {
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
}

/* 搜索框：对齐工具箱 .tb-search —— 圆角卡片 + 聚焦主色描边 + 外发光，输入框无边框 */
.bf-search {
  gap: 10px;
  width: 100%;
}

.bf-search-icon {
  flex: none;
  color: var(--color-text-muted, #94a3b8);
  pointer-events: none;
}
.bf-search-input {
  flex: 1;
  min-width: 0;
}
.bf-search-input::placeholder { color: var(--color-text-muted, #94a3b8); }
.bf-search-clear {
  flex: none;
  border: none;
  background: transparent;
  color: var(--color-text-muted, #94a3b8);
  font-size: 16px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 6px;
  min-height: 28px;
  cursor: pointer;
  transition: color var(--motion-duration, 220ms), background-color var(--motion-duration, 220ms);
}
.bf-search-clear:hover {
  color: var(--color-primary, #3b82f6);
  background: var(--color-bg-hover, rgba(0, 0, 0, 0.04));
}

/* 分类 / 标签 chips：自动换行（对齐工具箱 .tb-cats） */
.bf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* pill：对齐工具箱 .tb-cat —— 图标 + 名称 + 数量徽标，选中为实心主色填充 */
.bf-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 7px 14px;
  border-radius: var(--radius-full, 999px);
  border: 1px solid var(--color-border, #e2e8f0);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--motion-duration, 220ms), border-color var(--motion-duration, 220ms),
    background-color var(--motion-duration, 220ms);
}
.bf-chip:hover {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}
/* 选中态：对齐工具箱分类 pill —— 实心主色填充 + 白字 */
.bf-chip.is-active {
  background-color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  color: #fff;
}
.bf-chip.is-active:hover { color: #fff; }
/* 分类 emoji / 标签 # 前缀：间距交给父级 gap，不再单独加 margin */
.bf-chip-ico { line-height: 1; }
/* 数量徽标：对齐工具箱 .tb-cat-cnt */
.bf-chip-cnt { font-size: var(--font-size-xs, 12px); opacity: 0.78; }

/* 排序 / 清空筛选：右对齐次级操作行 */
.bf-filter-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
.bf-meta-label {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-muted, #94a3b8);
}
/* 视觉统一到全局 .ui-input（别名已含 .bf-select） */
.bf-clear {
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  font-family: inherit;
  cursor: pointer;
}
.bf-clear:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }

@media (max-width: 768px) {
  .bf-filter-meta { justify-content: flex-start; }
  .bf-chip { min-height: 32px; padding: 6px 12px; }
}
</style>
