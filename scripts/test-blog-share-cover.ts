/**
 * 博客共享发布「封面同步」回归测试。
 * 运行：node --experimental-strip-types --experimental-loader ./scripts/resolve-extensionless.mjs scripts/test-blog-share-cover.ts
 *
 * 链路：buildSharedPost 内联封面 → 服务端落 covers/ 静态文件并回写 URL
 *      → sharedEntryToArticle / sharedPostToArticle 还原 → coverBackground 出图。
 */
import assert from 'node:assert/strict'
import {
  resolveCoverImageUrl,
  buildSharedPost,
  buildBlogPublic
} from '../src/composables/blogStaticExport.ts'
import { sharedEntryToArticle, sharedPostToArticle } from '../src/composables/blogShared.ts'
import { coverBackground } from '../src/composables/blogFront.ts'

let passed = 0
let failed = 0
function check(name: string, fn: () => void): void {
  try {
    fn()
    passed += 1
  } catch (e) {
    failed += 1
    console.error(`✗ ${name}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

const COVER = 'data:image/jpeg;base64,/9j/COVER'
const BODY_IMG = 'data:image/png;base64,iVBOR/BODY'
const article = {
  id: 'ba_cover1',
  slug: 'cover-1',
  title: '封面测试',
  excerpt: '摘要',
  coverKind: 'image',
  coverImageId: 'bi_cover',
  contentMarkdown: '正文 ![插图](img:bi_body)',
  status: 'published',
  tagIds: ['bt_1'],
  categoryId: 'bc_1',
  pinned: false,
  viewCount: 3,
  commentCount: 0,
  readingMinutes: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  publishedAt: '2026-01-02T00:00:00.000Z',
  revision: 1
}
const blog = {
  settings: { blogName: '测试博客', blogDescription: 'd', footer: 'f', pageSize: 10, defaultSort: 'newest' },
  categories: [{ id: 'bc_1', name: '分类', slug: 'cat' }],
  tags: [{ id: 'bt_1', name: '标签', slug: 'tag' }],
  articles: [article],
  images: [
    { id: 'bi_cover', dataUrl: COVER },
    { id: 'bi_body', dataUrl: BODY_IMG }
  ],
  imageCategories: []
}
const imageMap = new Map(blog.images.map((i) => [i.id, i.dataUrl]))
const renderHtml = (md: string) => `<p>${md}</p>`
const post = buildSharedPost(blog as never, article as never, renderHtml, '管理员')

check('resolveCoverImageUrl: 图片封面解析出图库 data URL', () => {
  assert.equal(resolveCoverImageUrl(article as never, imageMap), COVER)
})
check('resolveCoverImageUrl: 非 image 封面不解析', () => {
  assert.equal(resolveCoverImageUrl({ ...article, coverKind: 'gradient' } as never, imageMap), undefined)
})
check('resolveCoverImageUrl: 图库缺图返回 undefined', () => {
  assert.equal(resolveCoverImageUrl({ ...article, coverImageId: 'bi_missing' } as never, imageMap), undefined)
})
check('buildSharedPost: 带 coverImageId 与内联封面', () => {
  assert.equal(post.coverImageId, 'bi_cover')
  assert.equal(post.coverImageUrl, COVER)
})
check('buildSharedPost: 正文插图仍照旧内联', () => {
  assert.match(post.contentMarkdown, /!\[插图\]\(data:image\/png;base64,iVBOR\/BODY\)/)
})
check('buildBlogPublic: 静态导出同样带上封面', () => {
  const pub = buildBlogPublic(blog as never, renderHtml)
  assert.equal(pub.posts.length, 1)
  assert.equal(pub.posts[0].coverImageUrl, COVER)
})
check('sharedPostToArticle: 还原封面 id 与 URL（含服务端改写后的路径）', () => {
  const a = sharedPostToArticle({ ...post, coverImageUrl: '/blog-share/covers/ba_cover1.jpg' })
  assert.equal(a.coverImageId, 'bi_cover')
  assert.equal(a.coverImageUrl, '/blog-share/covers/ba_cover1.jpg')
  assert.equal(a.coverKind, 'image')
})
check('sharedEntryToArticle: 清单条目带封面字段', () => {
  const a = sharedEntryToArticle({
    id: 'ba_cover1', slug: 'cover-1', title: '封面测试', excerpt: '摘要',
    authorName: '管理员', categoryId: 'bc_1', categoryName: '分类',
    tagIds: ['bt_1'], tagNames: ['标签'], updatedAt: '2026-01-02T00:00:00.000Z', size: 123,
    coverKind: 'image', coverImageUrl: '/blog-share/covers/ba_cover1.jpg'
  })
  assert.equal(a.coverKind, 'image')
  assert.equal(a.coverImageUrl, '/blog-share/covers/ba_cover1.jpg')
})
check('sharedEntryToArticle: 旧版清单无封面字段时回落 none', () => {
  const a = sharedEntryToArticle({
    id: 'ba_old', slug: 'old', title: '旧', excerpt: '', authorName: '',
    categoryId: '', categoryName: '', tagIds: [], tagNames: [],
    updatedAt: '2026-01-01T00:00:00.000Z', size: 1
  })
  assert.equal(a.coverKind, 'none')
  assert.equal(a.coverImageUrl, undefined)
})
check('coverBackground: 共享副本用内联 URL，无需本机图库', () => {
  const css = coverBackground({ ...article, coverImageUrl: '/blog-share/covers/ba_cover1.jpg' } as never)
  assert.match(String(css), /url\("\/blog-share\/covers\/ba_cover1\.jpg"\)/)
})
check('coverBackground: 内联 URL 优先于图库解析', () => {
  const css = coverBackground({ ...article, coverImageUrl: COVER } as never, () => BODY_IMG)
  assert.match(String(css), /9j\/COVER/)
})
check('coverBackground: 本地文章仍走 coverImageId + 图库', () => {
  const css = coverBackground(article as never, (id) => imageMap.get(id))
  assert.match(String(css), /9j\/COVER/)
})
check('coverBackground: none 不渲染封面区', () => {
  assert.equal(coverBackground({ ...article, coverKind: 'none' } as never), null)
})
check('coverBackground: 图库缺图回落渐变占位', () => {
  const css = String(coverBackground(article as never, () => undefined))
  assert.match(css, /linear-gradient/)
})

console.log(`\n[test-blog-share-cover] ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
