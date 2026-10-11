/**
 * 博客发布持久化实证复现测试。
 *
 * 目的：在 Node 下用真实 Vue ref + 真实 normalizeBlogData + structuredClone（模拟 IDB 结构化克隆）
 * 复刻 store 的「草稿 → updateArticle(publish) → saveBlog 序列化 → idbGet → normalizeBlogData(loadBlog)」
 * 全链路，验证发布状态是否真的落盘、加载后是否保留。
 */
import { ref, toRaw } from 'vue'
import { normalizeBlogData, nowIso } from '../src/composables/blogCore.ts'
import type { BlogArticle } from '../src/types'

let passed = 0
let failed = 0
function assert(cond: boolean, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.error(`  ✗ ${msg}`) }
}

function draftArticle(id: string): BlogArticle {
  return {
    id,
    slug: `post-${id}`,
    title: `文章 ${id}`,
    subtitle: undefined,
    excerpt: '',
    coverImageId: undefined,
    coverKind: 'none',
    coverToken: undefined,
    contentMarkdown: '正文',
    status: 'draft',
    authorId: undefined,
    categoryId: undefined,
    tagIds: [],
    pinned: false,
    viewCount: 0,
    commentCount: 0,
    readingMinutes: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    publishedAt: undefined,
    offlineAt: undefined,
    deletedAt: undefined,
    seoTitle: undefined,
    seoDescription: undefined,
    auditRemark: undefined,
    revision: 1
  }
}

// 复刻 store 的 articles ref + updateArticle 的「发布」写入
const articles = ref<BlogArticle[]>([draftArticle('a1')])

function publish(id: string): void {
  const index = articles.value.findIndex(a => a.id === id)
  const prev = articles.value[index]
  const merged: BlogArticle = {
    ...prev,
    status: 'published',
    publishedAt: nowIso(),
    updatedAt: nowIso(),
    revision: prev.revision + 1
  }
  articles.value[index] = merged
}

// 复刻 store.saveBlog 的序列化（FIXED 实现：JSON 往返彻底剥离响应式代理）
function saveBlogSerialize(): unknown {
  return {
    version: 1,
    updatedAt: nowIso(),
    settings: {},
    categories: [],
    tags: [],
    articles: JSON.parse(JSON.stringify(articles.value))
  }
}

// 模拟 IDB：使用 structuredClone（与浏览器 IDB 同一套结构化克隆算法）验证 Proxy 元素不再报错
function idbPutThenGet(value: unknown): unknown {
  return structuredClone(value)
}

console.log('— 场景 A：本地发布 → saveBlog → loadBlog 往返 —')
publish('a1')
const saved = idbPutThenGet(saveBlogSerialize())
const loaded = normalizeBlogData(saved)
const got = loaded.articles.find(a => a.id === 'a1')
assert(got?.status === 'published', '发布状态经 save/load 往返后仍为 published')
assert(got?.publishedAt !== undefined, 'publishedAt 经 save/load 往返后保留')
assert(got?.revision === 2, 'revision 经 save/load 往返后自增为 2')

console.log('— 场景 B：reactive proxy 元素是否被结构化克隆正确捕获（toRaw 仅解外层）—')
// 直接断言 saved 里拿到的文章是 published 的（若 proxy 元素克隆出问题，这里会是 draft）
const savedArticle = (saved as { articles: BlogArticle[] }).articles.find(a => a.id === 'a1')
assert(savedArticle?.status === 'published', 'idbPut 拿到的 articles 已含 published 状态（proxy 元素未被静默丢弃）')

console.log(`\n结果：${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
