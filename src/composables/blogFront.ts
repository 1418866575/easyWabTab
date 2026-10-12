/**
 * 博客前台列表 composable（useBlogListing）
 *
 * 纯展示、无写入：基于 useBlogStore 的只读数据 + 路由 query 作为单一事实来源，
 * 派生出「已发布文章的筛选 / 排序 / 分页」结果。筛选条件（关键词 / 分类 / 标签 / 排序 / 页码）
 * 全部写回 URL query，因此前进/后退、刷新、分享链接都能还原当前视图。
 *
 * 与后台 BlogPosts 的区别：
 * - 后台用本地 ref 持有筛选态；前台用 URL query（可被收藏 / 分享 / 后退还原）。
 * - 后台含草稿/审核/下架等全部未删除态；前台只取 listPublishedArticles 的已发布子集。
 * - 后台是管理操作；前台只读。
 *
 * 数据层（store.articles / categories / tags / settings）不属于本 composable 职责，
 * 由调用方（View）在 onMounted 时确保 loadBlog() 已装载。
 */
import { computed, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBlogStore } from '@/stores/blog'
import {
  filterArticles,
  listPublishedArticles,
  paginate,
  sortArticles,
  type ArticleQuery
} from '@/composables/blogCore'
import type { BlogArticle, BlogSort } from '@/types'

/** 合法的排序值（用于校验来自 URL 的 sort 参数，非法值回落默认排序） */
const SORT_VALUES: readonly BlogSort[] = [
  'updated-desc',
  'updated-asc',
  'created-desc',
  'published-desc',
  'views-desc',
  'title-asc'
]

/** 把路由 query 里的任意值安全转成字符串（query 可能是 string[]，这里只取第一项） */
function asString(v: unknown): string {
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : ''
  return typeof v === 'string' ? v : ''
}

export interface BlogListing {
  /** 当前关键词（来自 ?q=） */
  keyword: string
  /** 当前分类 id（来自 ?category=） */
  categoryId: string
  /** 当前标签 id（来自 ?tag=） */
  tagId: string
  /** 当前排序（来自 ?sort=，缺省回落 settings.defaultSort） */
  sort: BlogSort
  /** 当前页码（来自 ?page=，已夹到合法范围） */
  page: number
  /** 每页条数（来自 settings.pageSize） */
  pageSize: number
  /** 已发布文章全量（未筛选） */
  published: BlogArticle[]
  /** 筛选 + 排序后的全量结果 */
  filtered: BlogArticle[]
  /** 当前页切片 */
  paged: BlogArticle[]
  /** 结果总数 */
  total: number
  /** 总页数 */
  totalPages: number
  /** 是否存在任意筛选条件 */
  hasFilter: boolean
  /** 设置关键词（重置到第 1 页） */
  setKeyword: (v: string) => void
  /** 选择分类（传空串取消；重置到第 1 页） */
  setCategory: (id: string) => void
  /** 选择标签（传空串取消；重置到第 1 页） */
  setTag: (id: string) => void
  /** 改变排序（重置到第 1 页） */
  setSort: (s: BlogSort) => void
  /** 跳转页码 */
  setPage: (p: number) => void
  /** 清空全部筛选条件（回到第 1 页、清空关键词） */
  clearFilters: () => void
}

export function useBlogListing(): BlogListing {
  const store = useBlogStore()
  const route = useRoute()
  const router = useRouter()

  const keyword = computed(() => asString(route.query.q).trim())
  const categoryId = computed(() => asString(route.query.category))
  const tagId = computed(() => asString(route.query.tag))
  const sort = computed<BlogSort>(() => {
    const s = asString(route.query.sort)
    return (SORT_VALUES as readonly string[]).includes(s) ? (s as BlogSort) : store.settings.defaultSort
  })
  const rawPage = computed(() => {
    const n = Number(asString(route.query.page))
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
  })

  /** 已发布子集（前台唯一可见范围） */
  const published = computed(() => listPublishedArticles(store.articles))

  /** 筛选 + 排序（置顶恒最前，由 sortArticles 内部保证） */
  const filtered = computed(() =>
    sortArticles(
      filterArticles(published.value, {
        keyword: keyword.value,
        categoryId: categoryId.value || undefined,
        tagId: tagId.value || undefined
      } satisfies ArticleQuery),
      sort.value
    )
  )

  const pageSize = computed(() => Math.max(1, store.settings.pageSize))
  const total = computed(() => filtered.value.length)
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
  /** 页码夹到 [1, totalPages]，避免筛选后越界出现空页 */
  const page = computed(() => Math.min(rawPage.value, totalPages.value))
  const paged = computed(() => paginate(filtered.value, page.value, pageSize.value))

  const hasFilter = computed(
    () => keyword.value !== '' || categoryId.value !== '' || tagId.value !== ''
  )

  /** 把变更合并写回 URL query（replace 避免污染历史栈；空值即从 query 移除） */
  function patchQuery(patch: Record<string, string>): void {
    const next: Record<string, string> = {}
    for (const [k, v] of Object.entries(route.query)) {
      const s = asString(v)
      if (s !== '') next[k] = s
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v === '') delete next[k]
      else next[k] = v
    }
    void router.replace({ query: next }).catch(() => {})
  }

  function setKeyword(v: string): void {
    patchQuery({ q: v.trim(), page: '1' })
  }
  function setCategory(id: string): void {
    patchQuery({ category: id, page: '1' })
  }
  function setTag(id: string): void {
    patchQuery({ tag: id, page: '1' })
  }
  function setSort(s: BlogSort): void {
    patchQuery({ sort: s, page: '1' })
  }
  function setPage(p: number): void {
    patchQuery({ page: String(Math.max(1, Math.floor(p))) })
  }
  function clearFilters(): void {
    patchQuery({ q: '', category: '', tag: '', page: '1' })
  }

  // reactive 包裹：模板访问 listing.keyword 时自动解包嵌套 ref，且返回类型与 BlogListing 对齐
  return reactive({
    keyword,
    categoryId,
    tagId,
    sort,
    page,
    pageSize,
    published,
    filtered,
    paged,
    total,
    totalPages,
    hasFilter,
    setKeyword,
    setCategory,
    setTag,
    setSort,
    setPage,
    clearFilters
  })
}

/**
 * 封面背景（CSS background 值）。
 *
 * - `none` → 返回 null（调用方不渲染封面区）。
 * - `gradient` / `solid` → 优先用 coverToken 指向的语义色 token（primary/success/warning/error）；
 *   若 token 不可识别则按 id 取一个稳定的色相，保证视觉效果一致且不随刷新跳变。
 * - `image` → 本仓库尚未落地 `blog_images` 存储（coverImageId 仅为预留字段），无法解析真实图片，
 *   故回落到与 gradient 同款的渐变占位，避免破图。
 *
 * 返回的是 CSS 字符串而非内联对象，便于 `:style` 直接绑定。
 */
const COVER_TOKEN_VARS: Record<string, { base: string; soft: string }> = {
  primary: { base: 'var(--color-primary, #3b82f6)', soft: 'var(--color-primary-soft, #eff6ff)' },
  success: { base: 'var(--color-success, #22c55e)', soft: 'var(--color-success-soft, #dcfce7)' },
  warning: { base: 'var(--color-warning, #f59e0b)', soft: 'var(--color-warning-soft, #fef3c7)' },
  error: { base: 'var(--color-error, #ef4444)', soft: 'var(--color-error-soft, #fee2e2)' },
  info: { base: 'var(--color-primary, #3b82f6)', soft: 'var(--color-primary-soft, #eff6ff)' }
}

function hashHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 360
  }
  return h
}

export function coverBackground(
  article: BlogArticle,
  resolveImage?: (id: string) => string | undefined
): string | null {
  if (article.coverKind === 'none') return null
  // 图片封面：由图库解析出 data URL；图片缺失（未同步/已删）时回落到渐变占位，避免破图
  if (article.coverKind === 'image') {
    const url = article.coverImageId && resolveImage ? resolveImage(article.coverImageId) : undefined
    if (url) return `url("${url}") center/cover no-repeat`
  }
  const token = article.coverToken ?? ''
  const pal = COVER_TOKEN_VARS[token]
  const hue = hashHue(article.id + token)
  const base = pal ? pal.base : `hsl(${hue} 62% 55%)`
  const soft = pal ? pal.soft : `hsl(${hue} 75% 92%)`
  if (article.coverKind === 'solid') return base
  // gradient / image 均用渐变占位（image 暂无 blog_images 存储可解析，回落占位）
  return `linear-gradient(135deg, ${base}, ${soft})`
}

