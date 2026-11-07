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
  /* 网格项被行高拉伸，内层卡片需撑满，避免无封面卡片比有封面卡片矮 */
  height: 100%;
}
.bf-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--bf-line);
  border-radius: var(--bf-radius);
  background-color: var(--bf-card);
  color: inherit;
  text-decoration: none;
  transition: border-color var(--motion-duration) var(--motion-ease),
    transform var(--motion-duration) var(--motion-ease);
}
/* 编辑式卡片：层级靠发丝线与留白，hover 只换描边 + 1px 上浮，不加投影 */
.bf-card-wrap:hover .bf-card {
  border-color: var(--bf-accent-line);
  transform: var(--motion-hover-rise);
}
.bf-card:focus-visible {
  outline: 2px solid var(--bf-accent-line);
  outline-offset: 2px;
}

/* 收藏星标：RouterLink 的兄弟节点（避免 a 内嵌 button 的非法嵌套） */
.bf-card-star {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  z-index: 2;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--bf-line);
  border-radius: 999px;
  background: var(--bf-card);
  color: var(--bf-ink-2);
  font-size: var(--fs-caption);
  line-height: 1;
  cursor: pointer;
  transition: color var(--motion-duration), border-color var(--motion-duration),
    transform var(--motion-duration);
}
.bf-card-star:hover {
  transform: scale(1.08);
  color: var(--bf-accent);
  border-color: var(--bf-accent-line);
}
.bf-card-star.is-fav {
  color: var(--bf-accent);
  border-color: var(--bf-accent-line);
}
.bf-card-star:focus-visible {
  outline: 2px solid var(--bf-accent-line);
  outline-offset: 2px;
}

.bf-card-cover {
  position: relative;
  height: 200px;
  background-size: cover;
  background-position: center;
}
.bf-card-pin {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  padding: 0 var(--space-2);
  border-radius: 999px;
  background-color: var(--color-warning);
  color: var(--bf-on-accent);
  font-size: var(--fs-caption);
  line-height: 20px;
}

.bf-card-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-5);
  flex: 1 1 auto;
}
.bf-card-title {
  margin: 0;
  font-family: var(--bf-serif);
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--bf-ink);
  line-height: var(--line-height-tight);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
/* 无封面时收藏星标浮在卡片右上角，标题右侧让出空间避免被压住 */
.bf-card-body:first-child .bf-card-title {
  padding-right: var(--space-8);
}
.bf-card-excerpt {
  margin: 0;
  color: var(--bf-ink-2);
  font-size: var(--fs-sm);
  line-height: var(--line-height-relaxed);
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
  color: var(--bf-ink-2);
  font-size: var(--fs-caption);
}
.bf-card-cat { color: var(--bf-accent); }
.bf-card-dot { color: var(--bf-ink-3); }
.bf-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: auto;
}
.bf-card-tag {
  padding: 0 var(--space-2);
  border: 1px solid var(--bf-line);
  border-radius: var(--bf-radius);
  background-color: var(--bf-accent-soft);
  color: var(--bf-accent);
  font-size: var(--fs-caption);
  line-height: 20px;
}

@media (max-width: 768px) {
  .bf-card-cover { height: 180px; }
  .bf-card-body { padding: var(--space-4); }
}
</style>
