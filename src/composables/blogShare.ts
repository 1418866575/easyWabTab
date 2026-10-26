/**
 * 博客「共享发布」—— 后台写入端 composable。
 *
 * 单篇同步：把一篇文章 POST 到同源 /api/blog-share（由服务端 Node 写入部署机本地目录），
 * 或 DELETE 取消共享。写令牌（若有）走请求头 X-Blog-Share-Token，来自构建期注入的
 * VITE_BLOG_SHARE_TOKEN——它是「仅能写博客共享目录」的发布令牌，不是服务器账号密码。
 *
 * 成功后才把 article.sharedAt 写回本地（仅前端展示「已共享」状态），失败不污染本地状态。
 */
import { ref } from 'vue'
import { useBlogStore } from '@/stores/blog'
import { buildSharedPost } from '@/composables/blogStaticExport'
import { renderMarkdown } from '@/composables/noteMarkdown'
import type { BlogArticle } from '@/types'

const TOKEN = (import.meta.env.VITE_BLOG_SHARE_TOKEN as string | undefined) || ''
const sharingId = ref<string | null>(null)

async function share(article: BlogArticle): Promise<{ ok: boolean; error?: string }> {
  const store = useBlogStore()
  const now = new Date().toISOString()
  const blog = {
    version: 1,
    updatedAt: now,
    settings: store.settings,
    categories: store.categories,
    tags: store.tags,
    articles: [article],
    images: store.images,
    imageCategories: store.imageCategories
  }
  const post = buildSharedPost(blog as never, article, renderMarkdown, store.settings.blogName || '管理员')
  sharingId.value = article.id
  try {
    const res = await fetch('/api/blog-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(TOKEN ? { 'X-Blog-Share-Token': TOKEN } : {}) },
      body: JSON.stringify(post)
    })
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: j.error || `HTTP ${res.status}` }
    }
    // 落盘 + 触发云同步：sharedAt 跨设备保留「已共享」展示态
    await store.updateArticle(article.id, { sharedAt: now })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) }
  } finally {
    if (sharingId.value === article.id) sharingId.value = null
  }
}

async function unshare(article: BlogArticle): Promise<{ ok: boolean; error?: string }> {
  const store = useBlogStore()
  sharingId.value = article.id
  try {
    const res = await fetch(`/api/blog-share/${encodeURIComponent(article.id)}`, {
      method: 'DELETE',
      headers: TOKEN ? { 'X-Blog-Share-Token': TOKEN } : {}
    })
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: j.error || `HTTP ${res.status}` }
    }
    await store.updateArticle(article.id, { sharedAt: undefined })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) }
  } finally {
    if (sharingId.value === article.id) sharingId.value = null
  }
}

export function useBlogShare() {
  return { share, unshare, sharingId }
}
