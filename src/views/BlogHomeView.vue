<script setup lang="ts">
/**
 * 博客前台首页（路由 /blog）
 *
 * 结构：站点头部 → 筛选条（搜索 / 分类 / 标签 / 排序）→ 结果计数 → 文章卡片网格 → 分页 → 页脚。
 * 数据：复用 useBlogStore 只读数据 + useBlogListing（筛选态落在 URL query）。
 * 进入时确保 store 已装载（loadBlog），并补跑到点定时发布（runDueSchedules），
 * 与后台 BlogAdminView 的装载时机保持一致。
 */
import { ref, watch, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useBlogStore } from '@/stores/blog'
import { useBlogListing } from '@/composables/blogFront'
import BlogFilterBar from '@/components/blog/front/BlogFilterBar.vue'
import BlogCard from '@/components/blog/front/BlogCard.vue'
import type { BlogSort } from '@/types'
import '@/styles/blog-front.css'

const store = useBlogStore()
const listing = useBlogListing()

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
  await store.runDueSchedules()
})
</script>

<template>
  <main class="bf-shell">
    <header class="bf-header">
      <div>
        <h1 class="bf-site-title">{{ store.settings.blogName }}</h1>
        <p v-if="store.settings.blogDescription" class="bf-site-desc">{{ store.settings.blogDescription }}</p>
      </div>
      <RouterLink to="/blog/admin" class="bf-admin-link" data-testid="blog-front-admin">
        管理后台
      </RouterLink>
    </header>

    <BlogFilterBar
      :keyword="kw"
      :active-category="listing.categoryId"
      :active-tag="listing.tagId"
      :sort="listing.sort"
      :categories="store.categories"
      :tags="store.tags"
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
