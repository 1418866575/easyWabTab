<script setup lang="ts">
/**
 * 博客前台文章卡片（首页列表项）
 *
 * 纯展示：标题 / 摘要 / 分类 / 发布时间 / 阅读时长 / 标签 / 置顶标记。
 * 封面按 coverKind 渲染：none 不渲染封面区；gradient/solid/image 走 coverBackground
 * （image 暂无 blog_images 存储可解析，回落到渐变占位，见 blogFront.ts）。
 * 整卡点击跳转到 /blog/article/:slug，使用 RouterLink 利于 SEO/前进后退。
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useBlogStore } from '@/stores/blog'
import { coverBackground } from '@/composables/blogFront'
import { autoExcerpt, relativeTime } from '@/composables/blogCore'
import type { BlogArticle } from '@/types'

const props = defineProps<{ article: BlogArticle }>()

const store = useBlogStore()

const cover = computed(() => coverBackground(props.article))
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
</template>

<style scoped>
.bf-card {
  display: flex;
  flex-direction: column;
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
.bf-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-card-hover, 0 8px 20px rgba(0, 0, 0, 0.1));
  border-color: var(--color-primary, #3b82f6);
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
