/**
 * 博客静态发布「数据导出」预留
 *
 * 本期架构是「本机阅读器 + 预留静态发布」：前台数据来自 IndexedDB，但导出一份
 * 自包含的 JSON（站点信息 + 分类/标签 + 已发布文章的 Markdown 与渲染后 HTML），
 * 供未来的静态站点生成器（或外部工具）消费，无需改动数据层。
 *
 * 设计要点：
 * - buildBlogPublic 为**纯函数**（不碰 DOM / store / 副作用、不引入 markdown-it 等重依赖），
 *   仅依赖传入的 BlogData 与一个 HTML 渲染器，因此可直接在 scripts/test-blog-core.ts 中断言。
 * - 只导出 **已发布且未进回收站** 的文章（listPublishedArticles），草稿/下架/审核中永不外泄。
 * - downloadBlogPublic 才是浏览器侧入口：懒加载 store 与 markdown-it，组装并触发下载。
 */
import { listPublishedArticles } from '@/composables/blogCore'
import type { BlogArticle, BlogData } from '@/types'

export interface BlogPublicPost {
  slug: string
  title: string
  subtitle?: string
  excerpt: string
  categoryId?: string
  categoryName: string
  tagIds: string[]
  tagNames: string[]
  coverKind: BlogArticle['coverKind']
  coverToken?: string
  pinned: boolean
  readingMinutes: number
  viewCount: number
  createdAt: string
  updatedAt: string
  publishedAt?: string
  contentMarkdown: string
  /** 渲染后的 HTML 正文（与详情页 v-html 同源，供静态站点直接内联） */
  contentHtml: string
}

export interface BlogPublic {
  site: {
    name: string
    description: string
    footer: string
    pageSize: number
    defaultSort: string
    generatedAt: string
  }
  categories: Array<{ id: string; name: string; slug: string }>
  tags: Array<{ id: string; name: string; slug: string }>
  posts: BlogPublicPost[]
}

/**
 * 由 BlogData 生成静态发布载荷（纯函数）。
 * @param blog 完整 BlogData（含草稿等全部文章，本函数内部只取已发布子集）
 * @param renderHtml Markdown→HTML 渲染器（由调用方注入，便于测试桩；浏览器侧传 markdown-it）
 */
export function buildBlogPublic(
  blog: BlogData,
  renderHtml: (md: string) => string
): BlogPublic {
  const categoryMap = new Map(blog.categories.map((c) => [c.id, c]))
  const tagMap = new Map(blog.tags.map((t) => [t.id, t]))
  const published = listPublishedArticles(blog.articles)

  const posts: BlogPublicPost[] = published.map((a) => ({
    slug: a.slug,
    title: a.title,
    subtitle: a.subtitle,
    excerpt: a.excerpt,
    categoryId: a.categoryId,
    categoryName: a.categoryId ? (categoryMap.get(a.categoryId)?.name ?? '未分类') : '未分类',
    tagIds: a.tagIds,
    tagNames: a.tagIds.map((id) => tagMap.get(id)?.name ?? '').filter(Boolean),
    coverKind: a.coverKind,
    coverToken: a.coverToken,
    pinned: a.pinned,
    readingMinutes: a.readingMinutes,
    viewCount: a.viewCount,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    publishedAt: a.publishedAt,
    contentMarkdown: a.contentMarkdown,
    contentHtml: renderHtml(a.contentMarkdown)
  }))

  return {
    site: {
      name: blog.settings.blogName,
      description: blog.settings.blogDescription,
      footer: blog.settings.footer,
      pageSize: blog.settings.pageSize,
      defaultSort: blog.settings.defaultSort,
      generatedAt: new Date().toISOString()
    },
    categories: blog.categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    tags: blog.tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
    posts
  }
}

/** 浏览器端：把已构建的 BlogPublic 触发为文件下载（JSON） */
function triggerDownload(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 浏览器端：基于当前 store 组装并下载静态发布数据。
 * 必须在已 loadBlog 的浏览器环境调用（懒加载 store 与 markdown-it，避免拖累模块加载）。
 */
export async function downloadBlogPublic(): Promise<void> {
  const { useBlogStore } = await import('@/stores/blog')
  const { renderMarkdown } = await import('@/composables/noteMarkdown')
  const store = useBlogStore()
  const data = buildBlogPublic(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      settings: store.settings,
      categories: store.categories,
      tags: store.tags,
      articles: store.articles
    },
    renderMarkdown
  )
  const name = `blog-public-${new Date().toISOString().slice(0, 10)}.json`
  triggerDownload(name, JSON.stringify(data, null, 2), 'application/json;charset=utf-8')
}
