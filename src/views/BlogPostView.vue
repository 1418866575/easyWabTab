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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useBlogStore } from '@/stores/blog'
import { listPublishedArticles, formatDateTime, relativeTime } from '@/composables/blogCore'
import { resolveImageRefs } from '@/composables/blogImages'
import { renderMarkdown } from '@/composables/noteMarkdown'
import { buildBlogToc, type BlogTocItem } from '@/composables/blogToc'
import { useBlogShared, sharedPostToArticle, mergeTaxonomy } from '@/composables/blogShared'
import { useBlogFrontPrefs } from '@/composables/blogFrontPrefs'
import { resolveTypo, typoHrStyle, typoVars } from '@/composables/blogTypoCore'
import {
  BLOG_READER_FONT_MAX,
  BLOG_READER_FONT_MIN,
  changeReaderFontSize,
  initBlogReaderFont,
  readerFontSize
} from '@/composables/blogReaderFont'
import { decorateTypoHtml } from '@/composables/blogTypoDecor'
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

// 正文渲染 + 大纲（同一次 HTML 遍历注入标题 id 与收集项，严格一一对应）
const body = computed(() => {
  if (!visible.value || !displayArticle.value) return { html: '', toc: [] as BlogTocItem[] }
  // 正文用 img:<id> 短引用指向图片库，渲染前还原为 data URL（与编辑器预览同源）；
  // 共享文章的正文在同步时已内联 dataURL，此处 resolveImageRefs 为无操作透传。
  const md = resolveImageRefs(displayArticle.value.contentMarkdown, (id) => store.imageUrlById.get(id))
  // 找Tab 主题装饰（亮色画布设计）只在不暗色时应用；暗色降级为纯 --t-* token
  const decorated = decorateTypoHtml(renderMarkdown(md), isDark.value ? null : typoTheme.value)
  return buildBlogToc(decorated)
})
const html = computed(() => body.value.html)
const toc = computed(() => body.value.toc)
const hasToc = computed(() => toc.value.length > 0)

/** 点击大纲项：滚动到对应标题（纯 DOM 锚点，不改路由 hash，避免污染前进后退） */
function jumpToHeading(item: BlogTocItem): void {
  activeTocId.value = item.id
  const el = document.getElementById(item.id)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
const activeTocId = ref('')
/** 大纲面板展开态：桌面默认展开，窄屏默认收起（由 CSS 控制显隐，这里只管状态） */
const tocOpen = ref(true)
// 分类/标签名合并共享站点推送的表：访客本机查不到时也能显示真名，而不是一律「未分类」
const allCategories = computed(() => mergeTaxonomy(store.categories, shared.taxonomy.value.categories))
const allTags = computed(() => mergeTaxonomy(store.tags, shared.taxonomy.value.tags))
const categoryNameOf = (id?: string): string => allCategories.value.find((c) => c.id === id)?.name ?? '未分类'
const categoryLabel = computed(() => (displayArticle.value ? categoryNameOf(displayArticle.value.categoryId) : ''))
const tagLabels = computed(() => {
  if (!displayArticle.value) return []
  const map = new Map(allTags.value.map((t) => [t.id, t.name]))
  return displayArticle.value.tagIds.map((id) => map.get(id)).filter((n): n is string => !!n)
})
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

// ---------- 排版主题：跟随当前系统明暗取主题的亮/暗 token ----------
const isDark = ref(false)
let darkObserver: MutationObserver | null = null

/**
 * 正文字号：读者在本机调的字号优先于文章排版主题（作者偏好），只注入到 .md-body，
 * 因此标题 / 元信息 / 工具条按钮都不受影响。
 */
const typoVarStyle = computed(() => ({
  ...typoVars(displayArticle.value?.typo, store.settings.defaultTypoId, isDark.value),
  '--t-font-size': `${readerFontSize.value}px`
}))
const canDecFont = computed(() => readerFontSize.value > BLOG_READER_FONT_MIN)
const canIncFont = computed(() => readerFontSize.value < BLOG_READER_FONT_MAX)
const typoHr = computed(() => typoHrStyle(displayArticle.value?.typo, store.settings.defaultTypoId))
/** 生效主题对象（供找Tab 主题的结构样式作用域 data-typo 与装饰） */
const typoTheme = computed(() => resolveTypo(displayArticle.value?.typo, store.settings.defaultTypoId))

onMounted(() => {
  initBlogReaderFont() // 设备级偏好，仅首次挂载读取
  isDark.value = document.documentElement.classList.contains('dark')
  darkObserver = new MutationObserver(() => {
    isDark.value = document.documentElement.classList.contains('dark')
  })
  darkObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
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

/**
 * 大纲滚动高亮：监听所有注入了 id 的标题，取当前滚动位置上方最近的一个作为 active。
 * 用 scroll + rAF 节流而非 IntersectionObserver —— 后者在「标题恰好滚出视口顶部」
 * 的时刻判定不稳定，且需要同时跟踪进入/离开方向；scroll 判定更直观。
 */
let tocScrollRaf = 0
function updateActiveToc(): void {
  if (!toc.value.length) return
  const threshold = 140 // 视口顶部往下 140px 内的标题视为「当前阅读位置」
  let current = toc.value[0].id
  for (const item of toc.value) {
    const el = document.getElementById(item.id)
    if (el && el.getBoundingClientRect().top <= threshold) current = item.id
    else break
  }
  activeTocId.value = current
}
function onTocScroll(): void {
  if (tocScrollRaf) return
  tocScrollRaf = window.requestAnimationFrame(() => {
    tocScrollRaf = 0
    updateActiveToc()
  })
}

// 正文 DOM 在 html computed 变化后由 v-html 注入；用 watch 等渲染完成后挂滚动监听
watch(html, async () => {
  window.removeEventListener('scroll', onTocScroll)
  if (tocScrollRaf) window.cancelAnimationFrame(tocScrollRaf)
  tocScrollRaf = 0
  await nextTick()
  if (toc.value.length) {
    window.addEventListener('scroll', onTocScroll, { passive: true })
    updateActiveToc()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  darkObserver?.disconnect()
  window.removeEventListener('scroll', onTocScroll)
  if (tocScrollRaf) window.cancelAnimationFrame(tocScrollRaf)
})
</script>

<template>
  <main class="bf-shell">
    <template v-if="visible && displayArticle">
      <!-- 返回 + 正文字号：同一行，字号控件靠右（按钮沿用全局 .ui-btn 体系） -->
      <div class="bf-post-toolbar" data-testid="blog-post-toolbar">
        <RouterLink to="/blog" class="bf-back" data-testid="blog-post-back">
          <span aria-hidden="true">←</span> 返回文章列表
        </RouterLink>

        <!-- 中间档位数不显示，控件只留两颗按钮；当前字号移到悬停提示与 aria-label，信息不丢 -->
        <div
          class="bf-font-size"
          role="group"
          aria-label="正文字号"
          :title="`当前正文字号 ${readerFontSize}px`"
        >
          <button
            type="button"
            class="ui-btn ui-btn--sm bf-font-btn"
            data-testid="blog-post-font-dec"
            :disabled="!canDecFont"
            :aria-label="`减小正文字号，当前 ${readerFontSize}px`"
            @click="changeReaderFontSize(-1)"
          >A−</button>
          <button
            type="button"
            class="ui-btn ui-btn--sm bf-font-btn"
            data-testid="blog-post-font-inc"
            :disabled="!canIncFont"
            :aria-label="`增大正文字号，当前 ${readerFontSize}px`"
            @click="changeReaderFontSize(1)"
          >A+</button>
        </div>
      </div>

      <!-- 文章大纲：右上角浮动卡片，桌面常驻、窄屏折叠为按钮，点击项平滑滚动到对应标题 -->
      <aside
        v-if="hasToc"
        class="bf-toc"
        :class="{ 'is-open': tocOpen }"
        data-testid="blog-post-toc"
      >
        <button
          type="button"
          class="bf-toc-toggle"
          :aria-expanded="tocOpen"
          aria-controls="bf-toc-list"
          data-testid="blog-post-toc-toggle"
          @click="tocOpen = !tocOpen"
        >
          <span aria-hidden="true">☰</span>
          <span>文章大纲</span>
          <span class="bf-toc-chevron" aria-hidden="true">{{ tocOpen ? '▾' : '▸' }}</span>
        </button>
        <nav
          v-show="tocOpen"
          id="bf-toc-list"
          class="bf-toc-list"
          aria-label="文章大纲"
        >
          <button
            v-for="item in toc"
            :key="item.id"
            type="button"
            class="bf-toc-item"
            :class="['bf-toc-lv-' + item.level, { 'is-active': activeTocId === item.id }]"
            :data-testid="'blog-post-toc-' + item.id"
            @click="jumpToHeading(item)"
          >{{ item.text }}</button>
        </nav>
      </aside>

      <article class="bf-post">
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
        <div
          class="bf-post-body md-body"
          :style="typoVarStyle"
          :data-hr="typoHr || undefined"
          :data-typo="isDark ? undefined : typoTheme.id"
          data-testid="blog-post-body"
          v-html="html"
        />

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
              {{ categoryNameOf(r.categoryId) }} · {{ r.readingMinutes }} 分钟
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
