<script setup lang="ts">
/**
 * 博客前台首页（路由 /blog）
 *
 * 结构：站点头部 → 筛选条（搜索 / 分类 / 标签 / 排序）→ 结果计数 → 文章卡片网格 → 分页 → 页脚。
 * 数据：复用 useBlogStore 只读数据 + useBlogListing（筛选态落在 URL query）。
 * 进入时确保 store 已装载（loadBlog），
 * 与后台 BlogAdminView 的装载时机保持一致。
 */
import { ref, watch, onMounted, computed } from 'vue'
import { useBlogStore } from '@/stores/blog'
import { listPublishedArticles } from '@/composables/blogCore'
import { useBlogListing } from '@/composables/blogFront'
import { useBlogShared, mergeArticlesForListing } from '@/composables/blogShared'
import { useBlogFrontPrefs } from '@/composables/blogFrontPrefs'
import BlogFilterBar from '@/components/blog/front/BlogFilterBar.vue'
import BlogCard from '@/components/blog/front/BlogCard.vue'
import type { BlogArticle, BlogSort } from '@/types'
import '@/styles/blog-front.css'

const store = useBlogStore()
const shared = useBlogShared()
// 本地 + 共享合并源（按 id 去重）：作者本机不重复，访客自然只剩共享文
const merged = computed(() => mergeArticlesForListing(store.articles, shared.manifest.value?.posts ?? []))
const listing = useBlogListing(merged)
const { favorites, recent, initBlogFrontPrefs } = useBlogFrontPrefs()

// 各分类 / 标签下的已发布文章数（pill 数量徽标；空分类自动隐藏）。统计基准用已发布全集，
// 不随当前关键词/分类选择变化，与工具箱「全部 + 各分类数量」同为固定值。
const publishedArticles = computed(() => listPublishedArticles(merged.value))
const categoryCounts = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {}
  for (const a of publishedArticles.value) {
    const key = a.categoryId ?? ''
    m[key] = (m[key] ?? 0) + 1
  }
  return m
})
const tagCounts = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {}
  for (const a of publishedArticles.value) for (const t of a.tagIds) m[t] = (m[t] ?? 0) + 1
  return m
})

// 收藏 / 最近阅读：仅取已发布文章，保持各自顺序（收藏按收藏顺序，最近阅读按时间倒序）
const favArticles = computed<BlogArticle[]>(() => {
  const byId = new Map(publishedArticles.value.map((a) => [a.id, a]))
  return favorites.value.map((id) => byId.get(id)).filter((a): a is BlogArticle => !!a)
})
const recentArticles = computed<BlogArticle[]>(() => {
  const byId = new Map(publishedArticles.value.map((a) => [a.id, a]))
  return [...recent.value]
    .sort((a, b) => b.ts - a.ts)
    .map((r) => byId.get(r.id))
    .filter((a): a is BlogArticle => !!a)
})

// 搜索框用本地 ref 受控：保留输入中的空格，仅在 URL 层做 trim，避免输入时光标跳动
const kw = ref(listing.keyword)
watch(
  () => listing.keyword,
  (v) => { if (v !== kw.value) kw.value = v }
)

const SORT_OPTIONS: Array<{ value: BlogSort; label: string }> = [
  { value: 'updated-desc', label: '最近更新' },
  { value: 'updated-asc', label: '最早更新' },
  { value: 'created-desc', label: '最新创建' },
  { value: 'published-desc', label: '最近发布' },
  { value: 'views-desc', label: '阅读量' },
  { value: 'title-asc', label: '标题 A→Z' }
]

function onKeyword(value: string): void {
  kw.value = value
  listing.setKeyword(value)
}

onMounted(async () => {
  if (!store.loaded) await store.loadBlog()
  await initBlogFrontPrefs()
  // 拉取共享清单（失败不阻断本地文章展示）；合并源会在 manifest 就绪后自动更新
  void shared.load()
})
</script>

<template>
  <main class="bf-shell">
    <BlogFilterBar
      :keyword="kw"
      :active-category="listing.categoryId"
      :active-tag="listing.tagId"
      :sort="listing.sort"
      :categories="store.categories"
      :tags="store.tags"
      :category-counts="categoryCounts"
      :tag-counts="tagCounts"
      :total-count="publishedArticles.length"
      :has-filter="listing.hasFilter"
      :sort-options="SORT_OPTIONS"
      data-testid="blog-front-filter"
      @update:keyword="onKeyword"
      @select-category="listing.setCategory"
      @select-tag="listing.setTag"
      @update:sort="listing.setSort"
      @clear="listing.clearFilters"
    />

    <p class="bf-count" data-testid="blog-front-count">
      {{ listing.total }} 篇文章<template v-if="listing.hasFilter">（已筛选）</template>
    </p>

    <!-- 收藏 / 最近阅读：列表上方分区，空时自动隐藏（沿用工具箱 section 风格） -->
    <section v-if="favArticles.length" class="bf-section" data-testid="blog-front-favorites">
      <header class="bf-section-head">
        <h2 class="bf-section-title">★ 我的收藏</h2>
        <span class="bf-section-sub">{{ favArticles.length }} 篇</span>
      </header>
      <div class="bf-grid">
        <BlogCard v-for="a in favArticles" :key="a.id" :article="a" />
      </div>
    </section>

    <section v-if="recentArticles.length" class="bf-section" data-testid="blog-front-recent">
      <header class="bf-section-head">
        <h2 class="bf-section-title">🕘 最近阅读</h2>
        <span class="bf-section-sub">{{ recentArticles.length }} 篇</span>
      </header>
      <div class="bf-grid">
        <BlogCard v-for="a in recentArticles" :key="a.id" :article="a" />
      </div>
    </section>

    <div v-if="listing.total === 0" class="bf-empty" data-testid="blog-front-empty">
      {{ listing.hasFilter ? '没有符合条件的文章，试试调整筛选条件或清空筛选。' : '这里还没有已发布的文章。' }}
    </div>

    <template v-else>
      <div class="bf-grid">
        <BlogCard v-for="a in listing.paged" :key="a.id" :article="a" />
      </div>
      <div class="bf-pager">
        <el-pagination
          :current-page="listing.page"
          :page-size="listing.pageSize"
          :total="listing.total"
          layout="total, prev, pager, next, jumper"
          background
          small
          prev-text="上一页"
          next-text="下一页"
          data-testid="blog-front-pagination"
          @current-change="listing.setPage"
        />
      </div>
    </template>

    <footer v-if="store.settings.footer" class="bf-footer">{{ store.settings.footer }}</footer>
  </main>
</template>
