<script setup lang="ts">
/**
 * 博客前台文章详情（路由 /blog/article/:slug）
 *
 * - 通过 slug 在 store.articles 中查找；找不到 / 非已发布 / 已软删除 → 404 回落（不泄露草稿内容）。
 * - 正文经 renderMarkdown（markdown-it，html:false + 链接安全校验）渲染后注入 .md-body。
 * - 相关文章：同分类优先，不足再用其它已发布文章补齐到 4 篇。
 * - 数据装载与后台一致：onMounted 确保 loadBlog。
 *
 * 关于阅读量：本视图只读展示 store.viewCount，不做自增写盘（避免每次打开都重写整包 blog 数据，
 * 写放大；如需真实统计应走分片计数，属后续优化）。
 */
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useBlogStore } from '@/stores/blog'
import { coverBackground } from '@/composables/blogFront'
import { listPublishedArticles, formatDateTime, relativeTime } from '@/composables/blogCore'
import { renderMarkdown } from '@/composables/noteMarkdown'
import type { BlogArticle } from '@/types'
import '@/styles/blog-front.css'
import '@/styles/markdown.css'

const route = useRoute()
const store = useBlogStore()

const slug = computed(() => String(route.params.slug ?? ''))
const article = computed<BlogArticle | undefined>(() => (slug.value ? store.findBySlug(slug.value) : undefined))
/** 仅已发布且未进入回收站才对外可见 */
const visible = computed(
  () => !!article.value && article.value.status === 'published' && !article.value.deletedAt
)

const html = computed(() => (visible.value && article.value ? renderMarkdown(article.value.contentMarkdown) : ''))
const cover = computed(() => (visible.value && article.value ? coverBackground(article.value) : null))
const categoryLabel = computed(() => (article.value ? store.categoryName(article.value.categoryId) : ''))
const tagLabels = computed(() => (article.value ? store.tagNames(article.value.tagIds) : []))
const dateLabel = computed(() => {
  const a = article.value
  if (!a) return ''
  const iso = a.publishedAt ?? a.updatedAt
  return `${relativeTime(iso)}（${formatDateTime(iso)}）`
})

const related = computed<BlogArticle[]>(() => {
  const cur = article.value
  if (!cur) return []
  const published = listPublishedArticles(store.articles)
  const sameCat = published.filter((a) => a.id !== cur.id && a.categoryId === cur.categoryId)
  const others = published.filter((a) => a.id !== cur.id && a.categoryId !== cur.categoryId)
  return [...sameCat, ...others].slice(0, 4)
})

onMounted(async () => {
  if (!store.loaded) await store.loadBlog()
})
</script>

<template>
  <main class="bf-shell">
    <template v-if="visible && article">
      <RouterLink to="/blog" class="bf-back" data-testid="blog-post-back">
        <span aria-hidden="true">←</span> 返回文章列表
      </RouterLink>

      <article class="bf-post">
        <div v-if="cover" class="bf-post-hero" :style="{ background: cover }" />

        <header>
          <h1 class="bf-post-title">{{ article.title || '（无标题）' }}</h1>
          <p v-if="article.subtitle" class="bf-post-sub">{{ article.subtitle }}</p>
          <div class="bf-post-meta">
            <span class="bf-post-cat">{{ categoryLabel }}</span>
            <span class="bf-dot">·</span>
            <span>{{ dateLabel }}</span>
            <span class="bf-dot">·</span>
            <span>{{ article.readingMinutes }} 分钟阅读</span>
            <span class="bf-dot">·</span>
            <span>{{ article.viewCount }} 次阅读</span>
            <span v-if="article.pinned" class="bf-dot">·</span>
            <span v-if="article.pinned">置顶</span>
          </div>
        </header>

        <!-- 正文：markdown-it 渲染（html:false，链接已做安全校验），统一走 .md-body 排版 -->
        <div class="bf-post-body md-body" data-testid="blog-post-body" v-html="html" />

        <div v-if="tagLabels.length" class="bf-post-tags">
          <span v-for="t in tagLabels" :key="t" class="bf-post-tag">#{{ t }}</span>
        </div>
      </article>

      <section v-if="related.length" class="bf-related">
        <h2 class="bf-related-title">相关文章</h2>
        <div class="bf-related-grid">
          <RouterLink
            v-for="r in related"
            :key="r.id"
            :to="`/blog/article/${r.slug}`"
            class="bf-related-item"
          >
            <div class="bf-related-item-title">{{ r.title || '（无标题）' }}</div>
            <div class="bf-related-item-meta">
              {{ store.categoryName(r.categoryId) }} · {{ r.readingMinutes }} 分钟
            </div>
          </RouterLink>
        </div>
      </section>
    </template>

    <div v-else class="bf-404" data-testid="blog-post-404">
      <p class="bf-404-title">文章不存在或尚未发布</p>
      <p class="bf-404-text">它可能还在草稿箱、已被下架，或链接有误。</p>
      <RouterLink to="/blog" class="bf-admin-link">返回文章列表</RouterLink>
    </div>

    <footer v-if="store.settings.footer" class="bf-footer">{{ store.settings.footer }}</footer>
  </main>
</template>
