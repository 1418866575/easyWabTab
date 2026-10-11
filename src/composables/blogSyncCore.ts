/**
 * 博客信封（blog.json）的云端 ↔ 本地合并策略
 *
 * 与其它信封一致放进 core 是为了可以单测。
 * 合并粒度：文章 / 分类 / 标签**按 id 逐项取 updatedAt 较新者**，设置取 `BlogData.updatedAt` 较新的一侧整体。
 * 软删除（ deletedAt ）作为 tombstone 参与比较 —— 哪一侧的更新时间更晚就以哪一侧为准，
 * 因此「在 A 设备删了、B 设备还在编辑」不会把已删的文章复活。
 */
import type { BlogArticle, BlogCategory, BlogData, BlogImage, BlogSyncData, BlogTag } from '../types'
import { normalizeBlogData, normalizeCategory, normalizeTag, normalizeArticle, nowIso } from './blogCore'

/** 条目时间戳：用于新旧比较（缺失时回落到 createdAt） */
function stampOf(item: { updatedAt?: string; createdAt?: string }): string {
  return item.updatedAt || item.createdAt || ''
}

function mergeById<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  local: T[],
  remote: T[]
): T[] {
  const map = new Map<string, T>()
  for (const item of [...local, ...remote]) {
    const prev = map.get(item.id)
    if (!prev || stampOf(item) >= stampOf(prev)) map.set(item.id, item)
  }
  return Array.from(map.values())
}

export function mergeBlogEnvelope(local: BlogSyncData, remote: BlogSyncData): BlogSyncData {
  const l: BlogData = normalizeBlogData(local?.blog)
  const r: BlogData = normalizeBlogData(remote?.blog)

  const localArticles = l.articles.map(a => (a as BlogArticle))
  const remoteArticles = r.articles.map(a => (a as BlogArticle))
  const localCats = l.categories.map(c => normalizeCategory(c))
  const remoteCats = r.categories.map(c => normalizeCategory(c))
  const localTags = l.tags.map(t => normalizeTag(t))
  const remoteTags = r.tags.map(t => normalizeTag(t))

  // 设置：取「整包更新时间」较新的一侧（blog.updatedAt），避免半套半紊的值混在一起
  const remoteNewer = (r.updatedAt || '') > (l.updatedAt || '')

  const articles = mergeById<BlogArticle>(localArticles, remoteArticles).map(a => normalizeArticle(a))
  const categories = mergeById<BlogCategory>(localCats, remoteCats)
  const tags = mergeById<BlogTag>(localTags, remoteTags)
  // 图片按 id 取较新（图片不可变，createdAt 即时间戳）；两侧都有的保留一侧，各有各的则并集
  const images = mergeById<BlogImage>(l.images, r.images)

  return {
    version: 1,
    exportedAt: nowIso(),
    blog: {
      version: l.version,
      updatedAt: nowIso(),
      settings: remoteNewer ? r.settings : l.settings,
      categories,
      tags,
      articles,
      images
    }
  }
}
