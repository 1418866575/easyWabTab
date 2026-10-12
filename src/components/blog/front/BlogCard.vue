<script setup lang="ts">
/**
 * 博客前台文章卡片（首页列表项）
 *
 * 纯展示：标题 / 摘要 / 分类 / 发布时间 / 阅读时长 / 标签 / 置顶标记。
 * 封面按 coverKind 渲染：none 不渲染封面区；gradient/solid 走 token 或稳定色相渐变；
 * image 由图库（BlogData.images）按 coverImageId 解析成 data URL，缺失时回落渐变占位。
 * 整卡点击跳转到 /blog/article/:slug，使用 RouterLink 利于 SEO/前进后退。
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useBlogStore } from '@/stores/blog'
import { coverBackground } from '@/composables/blogFront'
import { autoExcerpt, relativeTime } from '@/composables/blogCore'
import { useBlogFrontPrefs } from '@/composables/blogFrontPrefs'
import type { BlogArticle } from '@/types'

const props = defineProps<{ article: BlogArticle }>()

const store = useBlogStore()
const { favorites, toggleFavorite } = useBlogFrontPrefs()
const isFav = computed(() => favorites.value.includes(props.article.id))
function onToggleFav(): void {
  toggleFavorite(props.article.id)
}

const cover = computed(() => coverBackground(props.article, id => store.imageUrlById.get(id)))
const excerpt = computed(() =>
  props.article.excerpt || autoExcerpt(props.article.contentMarkdown, store.settings.excerptLength)
)
const categoryLabel = computed(() => store.categoryName(props.article.categoryId))
const tagLabels = computed(() => store.tagNames(props.article.tagIds))
const dateLabel = computed(() =>
  props.article.publishedAt ? relativeTime(props.article.publishedAt) : relativeTime(props.article.updatedAt)
)
const to = computed(() => `/blog/article/${props.article.slug}`)
</script>

<template>
  <div class="bf-card-wrap" :data-testid="`blog-card-wrap-${article.id}`">
    <RouterLink :to="to" class="bf-card" :data-testid="`blog-card-${article.id}`">
      <div v-if="cover" class="bf-card-cover" :style="{ background: cover }">
        <span v-if="article.pinned" class="bf-card-pin">置顶</span>
      </div>
      <div class="bf-card-body">
        <h3 class="bf-card-title">{{ article.title || '（无标题）' }}</h3>
        <p class="bf-card-excerpt">{{ excerpt }}</p>
        <div class="bf-card-meta">
          <span class="bf-card-cat">{{ categoryLabel }}</span>
          <span class="bf-card-dot">·</span>
          <span>{{ dateLabel }}</span>
          <span class="bf-card-dot">·</span>
          <span>{{ article.readingMinutes }} 分钟阅读</span>
        </div>
        <div v-if="tagLabels.length" class="bf-card-tags">
          <span v-for="t in tagLabels" :key="t" class="bf-card-tag">#{{ t }}</span>
        </div>
      </div>
    </RouterLink>
    <button
      type="button"
      class="bf-card-star"
      :class="{ 'is-fav': isFav }"
      :title="isFav ? '取消收藏' : '收藏'"
      :aria-label="isFav ? '取消收藏' : '收藏'"
      :data-testid="`blog-card-star-${article.id}`"
      @click="onToggleFav"
    >{{ isFav ? '★' : '☆' }}</button>
  </div>
</template>

<style scoped>
.bf-card-wrap {
  position: relative;
  /* 卡片高度固定：网格项在行高上被拉伸，内层卡片需撑满，避免无封面卡片比有封面卡片矮 */
  height: 100%;
}
.bf-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
  box-shadow: var(--shadow-card, 0 1px 2px rgba(0, 0, 0, 0.06));
  color: inherit;
  text-decoration: none;
  transition: transform var(--motion-duration, 220ms) var(--motion-ease, ease),
    box-shadow var(--motion-duration, 220ms) var(--motion-ease, ease),
    border-color var(--motion-duration, 220ms) var(--motion-ease, ease);
}
.bf-card-wrap:hover .bf-card {
  transform: translateY(-4px);
  box-shadow: var(--shadow-card-hover, 0 8px 20px rgba(0, 0, 0, 0.1));
  border-color: var(--color-primary, #3b82f6);
}

/* 收藏星标：绝对定位于卡片右上角，作为 RouterLink 的兄弟节点（避免 a 内嵌 button 的非法嵌套） */
.bf-card-star {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  color: var(--color-text-muted, #94a3b8);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: color var(--motion-duration, 220ms) var(--motion-ease, ease),
    transform var(--motion-duration, 220ms) var(--motion-ease, ease),
    background-color var(--motion-duration, 220ms) var(--motion-ease, ease);
}
.bf-card-star:hover {
  transform: scale(1.12);
  color: var(--color-warning, #f59e0b);
}
.bf-card-star.is-fav {
  color: var(--color-warning, #f59e0b);
  background: rgba(255, 255, 255, 0.95);
}

.bf-card-cover {
  position: relative;
  height: 140px;
  background-size: cover;
  background-position: center;
}
.bf-card-pin {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 0 8px;
  border-radius: 999px;
  background-color: var(--color-warning, #f59e0b);
  color: #fff;
  font-size: var(--font-size-xs, 11px);
  line-height: 18px;
}

.bf-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  flex: 1 1 auto;
}
.bf-card-title {
  margin: 0;
  font-size: var(--font-size-base, 15px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text, #0f172a);
  line-height: var(--line-height-tight, 1.3);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.bf-card-excerpt {
  margin: 0;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  line-height: var(--line-height-relaxed, 1.6);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}
.bf-card-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
}
.bf-card-cat { color: var(--color-primary, #3b82f6); }
.bf-card-dot { color: var(--color-text-muted, #94a3b8); }
.bf-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: auto;
}
.bf-card-tag {
  padding: 0 6px;
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-size: var(--font-size-xs, 11px);
  line-height: 18px;
}

@media (max-width: 768px) {
  .bf-card-cover { height: 120px; }
}
html.dark .bf-card { box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.35)); }
</style>
