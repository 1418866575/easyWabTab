/**
 * 博客「共享发布」—— 前台读取端 composable。
 *
 * 前台（访客/作者）从同源 /blog-share/manifest.json 拉清单，再按需拉 posts/<id>.json。
 * 与本地 IndexedDB 文章按 id 合并去重：同 id 取 updatedAt 较新者，相等则本地优先。
 * 模块级单例缓存：多视图（列表/详情）共享一次拉取。
 *
 * 安全：只读公开子集，目录本身不暴露任何草稿/信封凭证；清单 no-cache 保证取消共享后尽快消失。
 */
import { ref, computed } from 'vue'
import type { BlogArticle, BlogCategory, BlogTag, BlogShareManifest, BlogShareManifestEntry, BlogSharePost } from '@/types'

const BASE = '/blog-share'
let loadPromise: Promise<void> | null = null
let loaded = false

const manifest = ref<BlogShareManifest | null>(null)
const loading = ref(false)
const error = ref(false)

async function load(): Promise<void> {
  if (loaded || loading.value) return loadPromise ?? Promise.resolve()
  loading.value = true
  loadPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/manifest.json`, { cache: 'no-cache' })
      if (!res.ok) {
        error.value = true
        manifest.value = null
        return
      }
      manifest.value = (await res.json()) as BlogShareManifest
    } catch {
      error.value = true
      manifest.value = null
    } finally {
      loading.value = false
      loaded = true
    }
  })()
  return loadPromise
}

async function getPost(id: string): Promise<BlogSharePost | null> {
  try {
    const res = await fetch(`${BASE}/posts/${encodeURIComponent(id)}.json`, { cache: 'no-cache' })
    if (!res.ok) return null
    return (await res.json()) as BlogSharePost
  } catch {
    return null
  }
}

async function getPostBySlug(slug: string): Promise<BlogSharePost | null> {
  const entry = manifest.value?.posts.find((p) => p.slug === slug)
  if (!entry) return null
  return getPost(entry.id)
}

/** 清单条目 → BlogArticle（列表展示用，无正文；status 恒为 published） */
export function sharedEntryToArticle(e: BlogShareManifestEntry): BlogArticle {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    excerpt: e.excerpt,
    coverKind: e.coverKind ?? 'none',
    coverToken: e.coverToken,
    coverImageUrl: e.coverImageUrl,
    contentMarkdown: '',
    status: 'published',
    // 清单条目本来就带 categoryId，之前漏了 → 共享文章在前台全被归到「未分类」，分类筛选失效
    categoryId: e.categoryId || undefined,
    tagIds: e.tagIds || [],
    pinned: false,
    viewCount: 0,
    commentCount: 0,
    readingMinutes: 0,
    createdAt: e.updatedAt,
    updatedAt: e.updatedAt,
    publishedAt: e.updatedAt,
    authorName: e.authorName || undefined,
    revision: 0
  }
}

/** 完整文章 → BlogArticle（详情展示用，含正文） */
export function sharedPostToArticle(p: BlogSharePost): BlogArticle {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    excerpt: p.excerpt,
    coverKind: p.coverKind,
    coverToken: p.coverToken,
    coverImageId: p.coverImageId,
    coverImageUrl: p.coverImageUrl,
    contentMarkdown: p.contentMarkdown,
    status: 'published',
    categoryId: p.categoryId || undefined,
    tagIds: p.tagIds || [],
    pinned: p.pinned,
    viewCount: p.viewCount,
    commentCount: 0,
    readingMinutes: p.readingMinutes,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    publishedAt: p.publishedAt,
    authorName: p.authorName,
    typo: p.typo ? { ...p.typo } : undefined,
    revision: 0
  }
}

/**
 * 合并本地文章与共享清单条目：按 id 去重。
 * 同 id：取 updatedAt 较新者；相等则保留本地（作者本机为权威）。
 * 返回的仍是 BlogArticle[]，可直接喂给现有列表筛选/排序/卡片组件。
 */
export function mergeArticlesForListing(
  local: BlogArticle[],
  entries: BlogShareManifestEntry[]
): BlogArticle[] {
  const map = new Map<string, BlogArticle>()
  for (const a of local) map.set(a.id, a)
  for (const e of entries) {
    const ex = map.get(e.id)
    if (!ex || e.updatedAt > ex.updatedAt) map.set(e.id, sharedEntryToArticle(e))
  }
  return [...map.values()]
}

// ---------------------------------------------------------------------------
// 共享分类 / 标签表
//
// 后台「共享」时已把整张分类表推送到 manifest 顶层（含排序、图标、空分类）。
// 老版清单没有这两个字段，就从文章条目里已有的 categoryId/categoryName/tagIds/tagNames 反推，
// 保证即使不重新共享，访客端也能看到并筛选分类。
// ---------------------------------------------------------------------------

/** 从老版清单条目反推最小分类/标签表（只包含被文章引用过的项，与筛选条隐藏空分类的口径一致） */
export function deriveTaxonomy(posts: BlogShareManifestEntry[]): { categories: BlogCategory[]; tags: BlogTag[] } {
  const cats = new Map<string, BlogCategory>()
  const tags = new Map<string, BlogTag>()
  let order = 0
  for (const e of posts ?? []) {
    const cid = String(e.categoryId || '')
    if (cid && !cats.has(cid)) {
      cats.set(cid, {
        id: cid,
        name: String(e.categoryName || '未分类'),
        slug: cid,
        order: order++,
        createdAt: e.updatedAt,
        updatedAt: e.updatedAt
      })
    }
    const ids = e.tagIds || []
    const names = e.tagNames || []
    ids.forEach((raw, i) => {
      const tid = String(raw)
      if (tid && !tags.has(tid)) {
        tags.set(tid, { id: tid, name: String(names[i] || tid), slug: tid, createdAt: e.updatedAt })
      }
    })
  }
  return { categories: [...cats.values()], tags: [...tags.values()] }
}

/** 共享站点可用的分类/标签：优先后台推送的整表，老清单则反推 */
const taxonomy = computed(() => {
  const m = manifest.value
  if (!m) return { categories: [] as BlogCategory[], tags: [] as BlogTag[] }
  if (Array.isArray(m.categories) || Array.isArray(m.tags)) {
    return { categories: m.categories ?? [], tags: m.tags ?? [] }
  }
  return deriveTaxonomy(m.posts ?? [])
})

/** 合并本地 + 共享分类/标签，按 id 去重，本地优先（作者本机为权威） */
export function mergeTaxonomy<T extends { id: string }>(local: T[], shared: T[]): T[] {
  const map = new Map<string, T>()
  for (const x of local ?? []) map.set(x.id, x)
  for (const x of shared ?? []) if (!map.has(x.id)) map.set(x.id, x)
  return [...map.values()]
}

export function useBlogShared() {
  return { manifest, loading, error, load, getPost, getPostBySlug, sharedPostToArticle, taxonomy }
}
