/**
 * 博客后台 store（数据存 IndexedDB store 'blog' 单对象 BlogData）
 *
 * 分层与项目其它 store 一致：本 store 只做「薄委托」——
 * 所有规则（归一化 / 排序 / 状态流转 / 发布校验）都在 `composables/blogCore.ts` 的纯函数里。
 * 写盘后统一调用 `markDirty()`，由 CloudSync 决定何时推送 blog.json。
 */
import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { ArticleStatus, BlogArticle, BlogCategory, BlogData, BlogSettings, BlogSort, BlogTag } from '@/types'
import {
  collectPublishErrors,
  collectSettingsErrors,
  emptyBlogData,
  estimateReadingMinutes,
  autoExcerpt,
  listActiveArticles,
  listRecycledArticles,
  normalizeBlogData,
  newId,
  nextStatus,
  nowIso,
  slugify,
  makeUniqueSlug,
  type ArticleAction
} from '../composables/blogCore'
import { idbGet, idbPut } from '../composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'

export const useBlogStore = defineStore('blog', () => {
  const settings = ref<BlogSettings>(emptyBlogData().settings)
  const categories = ref<BlogCategory[]>([])
  const tags = ref<BlogTag[]>([])
  const articles = ref<BlogArticle[]>([])
  const loaded = ref(false)

  // ==================== 持久化 ====================

  async function loadBlog(): Promise<void> {
    try {
      const norm = normalizeBlogData(await idbGet<BlogData>('blog'))
      settings.value = norm.settings
      categories.value = norm.categories
      tags.value = norm.tags
      articles.value = norm.articles
    } catch (e) {
      console.error('[Blog] load failed', e)
      const empty = emptyBlogData()
      settings.value = empty.settings
      categories.value = empty.categories
      tags.value = empty.tags
      articles.value = empty.articles
    } finally {
      loaded.value = true
    }
  }

  async function saveBlog(): Promise<void> {
    try {
      // toRaw：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）。
      // toRaw 只解开最外层代理，故对每个 reactive 数组分别 toRaw 后再放进普通字面量。
      await idbPut('blog', {
        version: 1,
        updatedAt: nowIso(),
        settings: toRaw(settings.value),
        categories: toRaw(categories.value),
        tags: toRaw(tags.value),
        // filter 必须在 toRaw 之后的原始数组上做，否则残留 Proxy 元素会触发 DataCloneError
        articles: toRaw(articles.value)
      })
      markDirty()
    } catch (e) {
      console.error('[Blog] save failed', e)
      throw e
    }
  }

  // ==================== 派生（只读） ====================

  const activeArticles = computed(() => listActiveArticles(articles.value))
  const trashedArticles = computed(() => listRecycledArticles(articles.value))

  const counts = computed(() => {
    const list = activeArticles.value
    const pick = (s: ArticleStatus) => list.filter(a => a.status === s).length
    return {
      all: list.length,
      draft: pick('draft'),
      reviewing: pick('reviewing'),
      scheduled: pick('scheduled'),
      published: pick('published'),
      offline: pick('offline'),
      rejected: pick('rejected'),
      trash: trashedArticles.value.length
    }
  })

  function findArticle(id: string): BlogArticle | undefined {
    return articles.value.find(a => a.id === id)
  }

  function findBySlug(slug: string): BlogArticle | undefined {
    const key = slug.trim()
    return articles.value.find(a => a.slug === key)
  }

  function categoryName(id?: string): string {
    if (!id) return '未分类'
    return categories.value.find(c => c.id === id)?.name ?? '未分类'
  }

  function tagNames(ids: string[]): string[] {
    const map = new Map(tags.value.map(t => [t.id, t.name]))
    return ids.map(id => map.get(id)).filter((n): n is string => !!n)
  }

  /** 已占用的 slug 集合（排除自身，供唯一性校验使用） */
  function takenSlugs(exceptId?: string): string[] {
    return articles.value.filter(a => a.id !== exceptId).map(a => a.slug)
  }

  // ==================== 文章 CRUD ====================

  /** 新建草稿：slug 由标题生成并保证唯一；标题为空时用占位 slug 由 normalize 再兜底 */
  async function createArticle(input?: Partial<BlogArticle>): Promise<BlogArticle> {
    const now = nowIso()
    const title = (input?.title ?? '').trim()
    const markdown = input?.contentMarkdown ?? ''
    const article: BlogArticle = {
      id: newId('ba'),
      slug: makeUniqueSlug(title || '未命名文章', takenSlugs()),
      title,
      subtitle: input?.subtitle,
      excerpt: '',
      coverKind: input?.coverKind ?? 'none',
      coverToken: input?.coverToken,
      coverImageId: input?.coverImageId,
      contentMarkdown: markdown,
      status: 'draft',
      authorId: input?.authorId,
      categoryId: input?.categoryId,
      tagIds: input?.tagIds ?? [],
      pinned: false,
      viewCount: 0,
      commentCount: 0,
      readingMinutes: estimateReadingMinutes(markdown),
      createdAt: now,
      updatedAt: now,
      seoTitle: input?.seoTitle,
      seoDescription: input?.seoDescription,
      revision: 1
    }
    articles.value.push(article)
    await saveBlog()
    return article
  }

  /**
   * 更新文章：每次更新自增 revision（草稿冲突判定依据）。
   * 摘要留空时由正文自动截取补齐；正文变化会重算阅读时长。
   */
  async function updateArticle(id: string, patch: Partial<BlogArticle>): Promise<BlogArticle | null> {
    const index = articles.value.findIndex(a => a.id === id)
    if (index === -1) return null
    const prev = articles.value[index]
    const merged: BlogArticle = { ...prev, ...patch, id: prev.id }

    // slug 去重 / 合法性：标题变了但 slug 没动时不自动跟随（保留用户手改过的 slug）
    const nextSlug = slugify(merged.slug) || slugify(merged.title) || prev.slug
    merged.slug = nextSlug === prev.slug ? prev.slug : makeUniqueSlug(nextSlug, takenSlugs(id))

    if (merged.contentMarkdown !== prev.contentMarkdown) {
      merged.readingMinutes = estimateReadingMinutes(merged.contentMarkdown)
    }
    if (!merged.excerpt.trim()) {
      merged.excerpt = autoExcerpt(merged.contentMarkdown, settings.value.excerptLength)
    }
    merged.updatedAt = nowIso()
    merged.revision = prev.revision + 1
    // 评论本期未落地（需求文档 §2.2 已排除），计数恒为 0，避免被外部手改后出现无来源的数字
    merged.commentCount = 0

    articles.value[index] = merged
    await saveBlog()
    return merged
  }

  /** 软删除：写 deletedAt，从常规列表消失并进入回收站（status 不变） */
  async function softDeleteArticle(id: string): Promise<boolean> {
    const article = findArticle(id)
    if (!article) return false
    articles.value = toRaw(articles.value).map(a => (a.id === id ? { ...a, deletedAt: nowIso() } : a))
    await saveBlog()
    return true
  }

  /** 恢复：清 deletedAt（回到删除时的 status） */
  async function restoreArticle(id: string): Promise<boolean> {
    const article = findArticle(id)
    if (!article || !article.deletedAt) return false
    const next = { ...toRaw(article) }
    delete next.deletedAt
    articles.value = toRaw(articles.value).map(a => (a.id === id ? next : a))
    await saveBlog()
    return true
  }

  /** 彻底删除：物理移除（含封面图引用一并丢弃，图片文件本身保留在 images store 供其它文章复用） */
  async function purgeArticle(id: string): Promise<boolean> {
    if (!findArticle(id)) return false
    articles.value = toRaw(articles.value).filter(a => a.id !== id)
    await saveBlog()
    return true
  }

  async function togglePin(id: string): Promise<{ ok: boolean; reason?: string }> {
    const article = findArticle(id)
    if (!article) return { ok: false, reason: '文章不存在' }
    const next = !article.pinned
    if (next) {
      const pinnedCount = activeArticles.value.filter(a => a.pinned).length
      if (pinnedCount >= settings.value.pinLimit) {
        return { ok: false, reason: `最多只能同时置顶 ${settings.value.pinLimit} 篇` }
      }
    }
    await updateArticle(id, { pinned: next })
    return { ok: true }
  }

  // ==================== 状态流转 ====================

  /** 内部写入：按动作换算目标状态；动作不合法时不改动任何数据并返回原因 */
  async function transit(id: string, action: ArticleAction, extra?: Partial<BlogArticle>): Promise<{ ok: boolean; reason?: string }> {
    const article = findArticle(id)
    if (!article) return { ok: false, reason: '文章不存在' }
    const target = nextStatus(article.status, action)
    if (!target) return { ok: false, reason: `当前状态（${article.status}）不支持该操作` }
    const now = nowIso()
    await updateArticle(id, {
      ...extra,
      status: target,
      ...(target === 'published' ? { publishedAt: article.publishedAt ?? now } : {}),
      ...(target === 'offline' ? { offlineAt: now } : {})
    })
    return { ok: true }
  }

  /**
   * 发布（立即上线）：先跑发布前校验，任一不通过都不改状态。
   * @param opts.requireAudit true 时作者身份需先进入待审核（原型默认 false：作者即站长，直接上线）
   */
  async function publishArticle(id: string, opts?: { requireAudit?: boolean }): Promise<{ ok: boolean; errors?: string[] }> {
    const article = findArticle(id)
    if (!article) return { ok: false, errors: ['文章不存在'] }
    const errors = collectPublishErrors(article, {
      takenSlugs: takenSlugs(id),
      knownCategoryIds: categories.value.map(c => c.id),
      knownTagIds: tags.value.map(t => t.id)
    })
    if (errors.length > 0) return { ok: false, errors }
    return await transit(id, opts?.requireAudit ? 'submit' : 'publish').then(r => ({ ok: r.ok, errors: r.reason ? [r.reason] : undefined }))
  }

  async function submitForReview(id: string): Promise<{ ok: boolean; errors?: string[] }> {
    return await publishArticle(id, { requireAudit: true })
  }

  async function approveArticle(id: string): Promise<{ ok: boolean; reason?: string }> {
    return await transit(id, 'approve')
  }

  async function rejectArticle(id: string, remark: string): Promise<{ ok: boolean; reason?: string }> {
    return await transit(id, 'reject', { auditRemark: remark })
  }

  async function withdrawArticle(id: string): Promise<{ ok: boolean; reason?: string }> {
    return await transit(id, 'withdraw')
  }

  async function offlineArticle(id: string): Promise<{ ok: boolean; reason?: string }> {
    return await transit(id, 'offline')
  }

  async function scheduleArticle(id: string, at: string): Promise<{ ok: boolean; errors?: string[] }> {
    const article = findArticle(id)
    if (!article) return { ok: false, errors: ['文章不存在'] }
    const provisional: BlogArticle = { ...article, scheduledAt: at }
    const errors = collectPublishErrors(provisional, {
      takenSlugs: takenSlugs(id),
      knownCategoryIds: categories.value.map(c => c.id),
      knownTagIds: tags.value.map(t => t.id),
      requireScheduledAt: true
    })
    if (errors.length > 0) return { ok: false, errors }
    return await transit(id, 'schedule', { scheduledAt: at }).then(r => ({ ok: r.ok, errors: r.reason ? [r.reason] : undefined }))
  }

  /** 取消定时：回到草稿（并清掉 scheduledAt） */
  async function cancelSchedule(id: string): Promise<{ ok: boolean; reason?: string }> {
    await updateArticle(id, { scheduledAt: undefined })
    return await transit(id, 'withdraw')
  }

  /**
   * 到点的定时任务 → 正式发布。通常是进入博客模块时执行一次扫描（补发布）。
   * 校验失败不静默丢弃：转 rejected 并记录原因，作者能在列表里看到。
   */
  async function runDueSchedules(): Promise<number> {
    const now = nowIso()
    const due = activeArticles.value.filter(a => a.status === 'scheduled' && !!a.scheduledAt && a.scheduledAt <= now)
    for (const article of due) {
      const res = await publishArticle(article.id)
      if (!res.ok) {
        await transit(article.id, 'publish').catch(() => undefined)
        await updateArticle(article.id, { status: 'rejected', auditRemark: `定时发布失败：${res.errors?.join('；') ?? '未知原因'}` })
      }
    }
    return due.length
  }

  // ==================== 分类 ====================

  async function addCategory(name: string, parentId?: string): Promise<{ ok: boolean; reason?: string }> {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, reason: '分类名称不可为空' }
    if (trimmed.length > 30) return { ok: false, reason: '分类名称不能超过 30 个字符' }
    const lower = trimmed.toLowerCase()
    const siblings = categories.value.filter(c => (c.parentId ?? '') === (parentId ?? ''))
    if (siblings.some(c => c.name.trim().toLowerCase() === lower)) return { ok: false, reason: '同级下已存在同名分类' }
    if (parentId && categories.value.find(c => c.id === parentId)?.parentId) {
      return { ok: false, reason: '分类最多两级，不能在子分类下再建子分类' }
    }
    const now = nowIso()
    const order = categories.value.reduce((max, c) => Math.max(max, c.order), 0) + 1
    categories.value.push({
      id: newId('bc'),
      name: trimmed,
      slug: makeUniqueSlug(trimmed, categories.value.map(c => c.slug)),
      parentId,
      order,
      createdAt: now,
      updatedAt: now
    })
    await saveBlog()
    return { ok: true }
  }

  async function renameCategory(id: string, name: string): Promise<{ ok: boolean; reason?: string }> {
    const index = categories.value.findIndex(c => c.id === id)
    if (index === -1) return { ok: false, reason: '分类不存在' }
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, reason: '分类名称不可为空' }
    const target = categories.value[index]
    if (categories.value.some(c => c.id !== id && (c.parentId ?? '') === (target.parentId ?? '') && c.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, reason: '同级下已存在同名分类' }
    }
    categories.value[index] = { ...target, name: trimmed, updatedAt: nowIso() }
    await saveBlog()
    return { ok: true }
  }

  async function updateCategoryDescription(id: string, description: string): Promise<void> {
    const index = categories.value.findIndex(c => c.id === id)
    if (index === -1) return
    categories.value[index] = { ...categories.value[index], description, updatedAt: nowIso() }
    await saveBlog()
  }

  /**
   * 删除分类：文章**绝不级联删除**，一律转为未分类；
   * 子分类自动提升为顶级（符合需求文档 UC-M-06 E2）。
   */
  async function removeCategory(id: string): Promise<{ ok: boolean; reason?: string; affectedArticles?: number }> {
    const target = categories.value.find(c => c.id === id)
    if (!target) return { ok: false, reason: '分类不存在' }
    const childIds = categories.value.filter(c => c.parentId === id).map(c => c.id)
    categories.value = toRaw(categories.value)
      .filter(c => c.id !== id)
      .map(c => (childIds.includes(c.id) ? { ...c, parentId: undefined, updatedAt: nowIso() } : c))
    const affected = await detachArticlesFromCategory(id)
    await saveBlog()
    return { ok: true, affectedArticles: affected }
  }

  async function detachArticlesFromCategory(id: string): Promise<number> {
    const affected = articles.value.filter(a => a.categoryId === id)
    if (affected.length === 0) return 0
    const ids = new Set(affected.map(a => a.id))
    articles.value = toRaw(articles.value).map(a => (ids.has(a.id) ? { ...a, categoryId: undefined } : a))
    return affected.length
  }

  /**
   * 同级排序：只在「同一父级」的一层内交换 order，避免子分类误跑到顶级序列里。
   * 单纯的 delta 位移在跨层级时会把两个无关分类的位置对调，这里先按父级分桶再交换。
   */
  async function moveCategory(id: string, delta: number): Promise<void> {
    const target = categories.value.find(c => c.id === id)
    if (!target) return
    const parentKey = target.parentId ?? ''
    const siblings = categories.value
      .filter(c => (c.parentId ?? '') === parentKey)
      .sort((a, b) => a.order - b.order)
    const index = siblings.findIndex(c => c.id === id)
    const swap = index + delta
    if (index === -1 || swap < 0 || swap >= siblings.length) return
    const a = siblings[index]
    const b = siblings[swap]
    const orderA = a.order
    const orderB = b.order
    const list = toRaw(categories.value)
    const now = nowIso()
    const next = list.map(c => {
      if (c.id === a.id) return { ...c, order: orderB, updatedAt: now }
      if (c.id === b.id) return { ...c, order: orderA, updatedAt: now }
      return c
    })
    categories.value = next
    await saveBlog()
  }

  // ==================== 标签 ====================

  async function addTag(name: string): Promise<{ ok: boolean; reason?: string }> {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, reason: '标签名称不可为空' }
    if (trimmed.length > 20) return { ok: false, reason: '标签名称不能超过 20 个字符' }
    if (tags.value.some(t => t.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, reason: '已存在同名标签' }
    }
    tags.value.push({
      id: newId('bt'),
      name: trimmed,
      slug: makeUniqueSlug(trimmed, tags.value.map(t => t.slug)),
      createdAt: nowIso()
    })
    await saveBlog()
    return { ok: true }
  }

  async function renameTag(id: string, name: string): Promise<{ ok: boolean; reason?: string }> {
    const index = tags.value.findIndex(t => t.id === id)
    if (index === -1) return { ok: false, reason: '标签不存在' }
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, reason: '标签名称不可为空' }
    if (tags.value.some(t => t.id !== id && t.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, reason: '已存在同名标签' }
    }
    tags.value[index] = { ...tags.value[index], name: trimmed }
    await saveBlog()
    return { ok: true }
  }

  /** 合并：把 sourceId 的引用迁移到 targetId 后删除 source（UC-M-07 主流程 2） */
  async function mergeTags(sourceId: string, targetId: string): Promise<{ ok: boolean; reason?: string; affectedArticles?: number }> {
    if (sourceId === targetId) return { ok: false, reason: '不能合并到自身' }
    if (!tags.value.some(t => t.id === targetId)) return { ok: false, reason: '目标标签不存在' }
    if (!tags.value.some(t => t.id === sourceId)) return { ok: false, reason: '来源标签不存在' }
    let affected = 0
    articles.value = toRaw(articles.value).map(a => {
      if (!a.tagIds.includes(sourceId)) return a
      affected += 1
      const nextIds = Array.from(new Set(a.tagIds.filter(t => t !== sourceId).concat(targetId)))
      return { ...a, tagIds: nextIds }
    })
    tags.value = toRaw(tags.value).filter(t => t.id !== sourceId)
    await saveBlog()
    return { ok: true, affectedArticles: affected }
  }

  /** 删除标签：只移除引用，绝不删文章 */
  async function removeTag(id: string): Promise<{ ok: boolean; reason?: string; affectedArticles?: number }> {
    if (!tags.value.some(t => t.id === id)) return { ok: false, reason: '标签不存在' }
    let affected = 0
    articles.value = toRaw(articles.value).map(a => {
      if (!a.tagIds.includes(id)) return a
      affected += 1
      return { ...a, tagIds: a.tagIds.filter(t => t !== id) }
    })
    tags.value = toRaw(tags.value).filter(t => t.id !== id)
    await saveBlog()
    return { ok: true, affectedArticles: affected }
  }

  // ==================== 设置 ====================

  async function updateSettings(patch: Partial<BlogSettings>): Promise<{ ok: boolean; errors?: string[] }> {
    const errors = collectSettingsErrors({ ...settings.value, ...patch })
    if (errors.length > 0) return { ok: false, errors }
    settings.value = { ...settings.value, ...patch }
    await saveBlog()
    return { ok: true }
  }

  async function resetSettings(): Promise<void> {
    settings.value = emptyBlogData().settings
    await saveBlog()
  }

  return {
    // 状态
    settings,
    categories,
    tags,
    articles,
    loaded,
    // 派生
    activeArticles,
    trashedArticles,
    counts,
    findArticle,
    findBySlug,
    categoryName,
    tagNames,
    takenSlugs,
    // 生命周期
    loadBlog,
    saveBlog,
    // 文章
    createArticle,
    updateArticle,
    softDeleteArticle,
    restoreArticle,
    purgeArticle,
    togglePin,
    publishArticle,
    submitForReview,
    approveArticle,
    rejectArticle,
    withdrawArticle,
    offlineArticle,
    scheduleArticle,
    cancelSchedule,
    runDueSchedules,
    // 分类
    addCategory,
    renameCategory,
    updateCategoryDescription,
    removeCategory,
    moveCategory,
    // 标签
    addTag,
    renameTag,
    mergeTags,
    removeTag,
    // 设置
    updateSettings,
    resetSettings
  }
})

// 默认排序别名导出：便于 UI 与设置表单共用（避免 UI 里再写一份常量）
export type { BlogSort, BlogCategory, BlogTag, BlogArticle, BlogSettings }
