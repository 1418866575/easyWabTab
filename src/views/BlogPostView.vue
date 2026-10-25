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
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useBlogStore } from '@/stores/blog'
import { coverBackground } from '@/composables/blogFront'
import { listPublishedArticles, formatDateTime, relativeTime } from '@/composables/blogCore'
import { resolveImageRefs } from '@/composables/blogImages'
import { renderMarkdown } from '@/composables/noteMarkdown'
import { useBlogShared, sharedPostToArticle } from '@/composables/blogShared'
import { useBlogFrontPrefs } from '@/composables/blogFrontPrefs'
import type { BlogArticle } from '@/types'
import '@/styles/blog-front.css'
import '@/styles/markdown.css'

const route = useRoute()
const store = useBlogStore()
const shared = useBlogShared()
const { pushRecent, initBlogFrontPrefs } = useBlogFrontPrefs()

const slug = computed(() => String(route.params.slug ?? ''))
const article = computed<BlogArticle | undefined>(() => (slug.value ? store.findBySlug(slug.value) : undefined))
/** 本地已发布且未进回收站才直接可见 */
const localVisible = computed(
  () => !!article.value && article.value.status === 'published' && !article.value.deletedAt
)
/** 共享文章（访客本机无此文时，由 /blog-share 兜底加载） */
const sharedArticle = ref<BlogArticle | undefined>(undefined)
/** 真正用于展示的文章：本地可见优先，否则取共享副本 */
const displayArticle = computed<BlogArticle | undefined>(() =>
  localVisible.value ? article.value : sharedArticle.value
)
const visible = computed(
  () => !!displayArticle.value && displayArticle.value.status === 'published' && !displayArticle.value.deletedAt
)

const html = computed(() => {
  if (!visible.value || !displayArticle.value) return ''
  // 正文用 img:<id> 短引用指向图片库，渲染前还原为 data URL（与编辑器预览同源）；
  // 共享文章的正文在同步时已内联 dataURL，此处 resolveImageRefs 为无操作透传。
  const md = resolveImageRefs(displayArticle.value.contentMarkdown, (id) => store.imageUrlById.get(id))
  return renderMarkdown(md)
})
const cover = computed(() =>
  visible.value && displayArticle.value
    ? coverBackground(displayArticle.value, (id) => store.imageUrlById.get(id))
    : null
)
const categoryLabel = computed(() => (displayArticle.value ? store.categoryName(displayArticle.value.categoryId) : ''))
const tagLabels = computed(() => (displayArticle.value ? store.tagNames(displayArticle.value.tagIds) : []))
const dateLabel = computed(() => {
  const a = displayArticle.value
  if (!a) return ''
  const iso = a.publishedAt ?? a.updatedAt
  return `${relativeTime(iso)}（${formatDateTime(iso)}）`
})

const related = computed<BlogArticle[]>(() => {
  const cur = displayArticle.value
  if (!cur) return []
  const published = listPublishedArticles(store.articles)
  const sameCat = published.filter((a) => a.id !== cur.id && a.categoryId === cur.categoryId)
  const others = published.filter((a) => a.id !== cur.id && a.categoryId !== cur.categoryId)
  return [...sameCat, ...others].slice(0, 4)
})

onMounted(async () => {
  if (!store.loaded) await store.loadBlog()
  await initBlogFrontPrefs()
  await shared.load()
  // 本地不可见（访客本机无此文 / 非已发布）→ 尝试从共享目录按 slug 取回
  if (!localVisible.value && slug.value) {
    const post = await shared.getPostBySlug(slug.value)
    sharedArticle.value = post ? sharedPostToArticle(post) : undefined
  }
  // 进入已发布文章详情即记为一次「最近阅读」（失焦/卸载时由 flushBlogFrontPrefs 兜底落盘）
  if (visible.value && displayArticle.value) pushRecent(displayArticle.value.id)
})
</script>

<template>
  <main class="bf-shell">
    <template v-if="visible && displayArticle">
      <RouterLink to="/blog" class="bf-back" data-testid="blog-post-back">
        <span aria-hidden="true">←</span> 返回文章列表
      </RouterLink>

      <article class="bf-post">
        <div v-if="cover" class="bf-post-hero" :style="{ background: cover }" />

        <header>
          <h1 class="bf-post-title">{{ displayArticle.title || '（无标题）' }}</h1>
          <p v-if="displayArticle.subtitle" class="bf-post-sub">{{ displayArticle.subtitle }}</p>
          <div class="bf-post-meta">
            <span class="bf-post-cat">{{ categoryLabel }}</span>
            <span class="bf-dot">·</span>
            <span>{{ dateLabel }}</span>
            <span class="bf-dot">·</span>
            <span>{{ displayArticle.readingMinutes }} 分钟阅读</span>
            <span class="bf-dot">·</span>
            <span>{{ displayArticle.viewCount }} 次阅读</span>
            <span v-if="displayArticle.pinned" class="bf-dot">·</span>
            <span v-if="displayArticle.pinned">置顶</span>
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
