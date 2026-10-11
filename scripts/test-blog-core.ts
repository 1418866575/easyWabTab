/**
 * 博客模块纯函数测试（blogCore + blogSyncCore）
 *
 * 与项目其它 test-*.ts 同构：无测试框架，自写 mini-runner + node:assert/strict。
 * 运行：npm run test:blog
 */
import assert from 'node:assert/strict'
import {
  ARTICLE_STATUS_LABELS,
  autoExcerpt,
  canTransitionArticle,
  collectPublishErrors,
  collectSettingsErrors,
  estimateReadingMinutes,
  filterArticles,
  formatDateTime,
  isReservedSlug,
  makeUniqueSlug,
  defaultSlug,
  nextStatus,
  normalizeBlogData,
  paginate,
  plainTextOfMarkdown,
  relativeTime,
  slugify,
  sortArticles,
  listPublishedArticles,
  listActiveArticles,
  emptyBlogSettings
} from '../src/composables/blogCore.ts'
import { mergeBlogEnvelope } from '../src/composables/blogSyncCore.ts'
import { buildBlogPublic } from '../src/composables/blogStaticExport.ts'
import { applyMarkdown, isAllowedDataImage } from '../src/composables/blogEditorMd.ts'
import type { ArticleStatus, BlogArticle, BlogData, BlogSyncData } from '../src/types/index.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// 断言计数器：Proxy 包装 node:assert/strict，每次断言调用 +1（输出 assertion 总数）
let assertCount = 0
const a: typeof assert = new Proxy(assert, {
  get(t, prop) {
    const v = Reflect.get(t, prop)
    if (typeof v === 'function') {
      return (...args: unknown[]) => {
        assertCount++
        return (v as (...x: unknown[]) => unknown).apply(t, args)
      }
    }
    return v
  }
}) as typeof assert

/** 构造文章（只覆盖关心的字段，其余给稳定默认值） */
function mkArticle(partial: Partial<BlogArticle> & { id: string }): BlogArticle {
  return {
    slug: partial.slug ?? `slug-${partial.id}`,
    title: partial.title ?? '默认标题',
    excerpt: partial.excerpt ?? '',
    coverKind: 'none',
    contentMarkdown: partial.contentMarkdown ?? '正文',
    status: partial.status ?? 'draft',
    tagIds: partial.tagIds ?? [],
    pinned: partial.pinned ?? false,
    viewCount: partial.viewCount ?? 0,
    commentCount: 0,
    readingMinutes: partial.readingMinutes ?? 1,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    ...partial
  }
}

/** 构造信封 */
function mkEnvelope(blog: Partial<BlogData>, updatedAt = '2026-01-01T00:00:00.000Z'): BlogSyncData {
  return {
    version: 1,
    exportedAt: updatedAt,
    blog: {
      version: 1,
      updatedAt,
      settings: blog.settings ?? emptyBlogSettings(),
      categories: blog.categories ?? [],
      tags: blog.tags ?? [],
      articles: blog.articles ?? []
    }
  }
}

// ==================== Slug ====================

test('slugify：保留中文与字母数字，其余符号折叠为连字符', () => {
  a.equal(slugify('Hello World'), 'hello-world')
  a.equal(slugify('中文 标题！'), '中文-标题')
  a.equal(slugify('  --多  个---连字符-- '), '多-个-连字符')
  a.equal(slugify('!!!'), '')
})

test('defaultSlug：年月日时分秒(14位) + 4 位随机小写字母', () => {
  const s = defaultSlug()
  a.match(s, /^\d{14}[a-z]{4}$/)
  // 带随机后缀，两次调用应不同
  a.notEqual(defaultSlug(), defaultSlug())
})

test('isReservedSlug：系统保留字大小写不敏感', () => {
  a.equal(isReservedSlug('admin'), true)
  a.equal(isReservedSlug('Admin'), true)
  a.equal(isReservedSlug('my-post'), false)
})

test('makeUniqueSlug：冲突追加序号，纯符号标题回落时间戳', () => {
  a.equal(makeUniqueSlug('Hello World', []), 'hello-world')
  a.equal(makeUniqueSlug('Hello World', ['hello-world']), 'hello-world-2')
  a.equal(makeUniqueSlug('Hello World', ['hello-world', 'hello-world-2']), 'hello-world-3')
  a.match(makeUniqueSlug('！！！', []), /^post-\d+$/)
})

// ==================== 派生内容 ====================

test('plainTextOfMarkdown：剥离代码块 / 行内代码 / 图片 / 链接 / 强调语法', () => {
  // 代码块与行内代码都会被替换成空格再折叠，因此原文里的「代码」字样不会留在结果中
  a.equal(plainTextOfMarkdown('# 标题\n\n**粗体** 与 `代码`'), '标题 粗体 与')
  // 图片的 alt 文案同样不算正文（图片整段被替换为空格）
  a.equal(plainTextOfMarkdown('![图](x.png)\n见 [链接](https://a.b)'), '见 链接')
  a.equal(plainTextOfMarkdown('```\n不该被计入\n```'), '')
  a.equal(plainTextOfMarkdown('> 引用\n- 列表项'), '引用 列表项')
})

test('estimateReadingMinutes：按 400 字/分钟向上取整，最少 1 分钟', () => {
  a.equal(estimateReadingMinutes(''), 1)
  a.equal(estimateReadingMinutes('字'.repeat(1)), 1)
  a.equal(estimateReadingMinutes('字'.repeat(401)), 2)
  a.equal(estimateReadingMinutes('字'.repeat(800)), 2)
})

test('autoExcerpt：超长截断加省略号，未超长原样返回', () => {
  const text = '字'.repeat(200)
  const excerpt = autoExcerpt(text, 120)
  a.equal(excerpt.length, 121)
  a.equal(excerpt.endsWith('…'), true)
  a.equal(autoExcerpt('短', 120), '短')
})

// ==================== 归一化 ====================

test('normalizeBlogData：非法输入不抛错，产出结构完整', () => {
  const norm = normalizeBlogData(undefined)
  a.equal(norm.version, 1)
  a.deepEqual(norm.articles, [])
  a.deepEqual(norm.categories, [])
  a.deepEqual(norm.tags, [])
  a.equal(typeof norm.settings.blogName, 'string')
})

test('normalizeBlogData：非法状态回落草稿、重复 id 去重、缺失时间戳补齐', () => {
  const norm = normalizeBlogData({
    articles: [
      { id: 'a1', title: 'A', status: 'unknown-status' },
      { id: 'a1', title: 'A 重复', status: 'published' },
      { id: 'a2', status: 'published', title: 'B' }
    ]
  } as unknown as BlogData)
  a.equal(norm.articles.length, 2)
  const first = norm.articles.find(x => x.id === 'a1')
  a.equal(first?.status, 'draft')
  a.ok(first?.createdAt)
  a.ok(first?.updatedAt)
  a.equal(norm.articles.find(x => x.id === 'a2')?.status, 'published')
})

// ==================== 查询 / 排序 / 分页 ====================

test('filterArticles：按关键词 / 状态 / 分类 / 标签组合过滤', () => {
  const list = [
    mkArticle({ id: '1', title: 'Vue 笔记', status: 'draft', categoryId: 'c1', tagIds: ['t1'], contentMarkdown: '正文含关键字 alpha' }),
    mkArticle({ id: '2', title: '其它', status: 'published', categoryId: 'c2', tagIds: ['t2'] })
  ]
  a.equal(filterArticles(list, {}).length, 2)
  a.equal(filterArticles(list, { keyword: 'alpha' }).length, 1)
  a.equal(filterArticles(list, { status: 'draft' }).length, 1)
  // 'active' = 尚未上线：除 published 之外的所有状态（草稿 / 待审 / 定时 / 下架 / 未通过）
  a.equal(filterArticles(list, { status: 'active' }).length, 1)
  a.equal(filterArticles(list, { categoryId: 'c2' })[0].id, '2')
  a.equal(filterArticles(list, { tagId: 't1' })[0].id, '1')
  a.equal(filterArticles(list, { keyword: 'vue', status: 'draft' }).length, 1)
})

test('sortArticles：置顶恒在最前，其余按指定规则', () => {
  const list = [
    mkArticle({ id: 'a', title: 'A', updatedAt: '2026-02-01T00:00:00.000Z' }),
    mkArticle({ id: 'b', title: 'B', updatedAt: '2026-03-01T00:00:00.000Z', pinned: true }),
    mkArticle({ id: 'c', title: 'C', updatedAt: '2026-01-01T00:00:00.000Z' })
  ]
  a.deepEqual(sortArticles(list, 'updated-desc').map(x => x.id), ['b', 'a', 'c'])
  a.deepEqual(sortArticles(list, 'updated-asc').map(x => x.id), ['b', 'c', 'a'])
  a.deepEqual(sortArticles(list, 'title-asc').map(x => x.id), ['b', 'a', 'c'])
})

test('paginate：越界页码与页大小被兜底，不返回空数组', () => {
  const items = Array.from({ length: 25 }, (_, i) => i)
  a.deepEqual(paginate(items, 1, 10), items.slice(0, 10))
  a.deepEqual(paginate(items, 3, 10), items.slice(20, 25))
  a.deepEqual(paginate(items, 0, 10), items.slice(0, 10))
  a.deepEqual(paginate(items, 1, 0).length, 1) // pageSize 最小为 1
  a.deepEqual(paginate(items, 99, 10), [])
})

test('listPublishedArticles：仅保留已发布且未进回收站的条目', () => {
  const list = [
    mkArticle({ id: 'p1', status: 'published' }),
    mkArticle({ id: 'd1', status: 'draft' }),
    mkArticle({ id: 'r1', status: 'reviewing' }),
    mkArticle({ id: 'o1', status: 'offline' }),
    mkArticle({ id: 's1', status: 'offline' }),
    mkArticle({ id: 'p2', status: 'published', deletedAt: '2026-05-05T00:00:00.000Z' })
  ]
  const published = listPublishedArticles(list)
  a.deepEqual(published.map(x => x.id), ['p1'])
  // 与 listActiveArticles 区分：后者把草稿/离线/待审都算「未删除」而放行
  a.equal(listActiveArticles(list).length, 5)
})

test('listPublishedArticles：空数组与全非发布态返回空', () => {
  a.deepEqual(listPublishedArticles([]), [])
  a.deepEqual(listPublishedArticles([mkArticle({ id: 'x', status: 'draft' })]), [])
})

// ==================== 状态机 ====================

test('nextStatus：合法转移返回目标状态，非法转移返回 null', () => {
  a.equal(nextStatus('draft', 'publish'), 'published')
  a.equal(nextStatus('draft', 'submit'), 'reviewing')
  a.equal(nextStatus('reviewing', 'approve'), 'published')
  a.equal(nextStatus('reviewing', 'reject'), 'rejected')
  a.equal(nextStatus('reviewing', 'withdraw'), 'draft')
  a.equal(nextStatus('rejected', 'submit'), 'reviewing')
  a.equal(nextStatus('published', 'offline'), 'offline')
  a.equal(nextStatus('offline', 'publish'), 'published')
  // 非法：草稿不能直接通过/驳回，已发布不能撤回
  a.equal(nextStatus('draft', 'approve'), null)
  a.equal(nextStatus('draft', 'reject'), null)
  a.equal(nextStatus('published', 'withdraw'), null)
  a.equal(nextStatus('published', 'publish'), null)
})

test('canTransitionArticle：与 nextStatus 判定一致', () => {
  a.equal(canTransitionArticle('draft', 'publish'), true)
  a.equal(canTransitionArticle('published', 'offline'), true)
  a.equal(canTransitionArticle('offline', 'submit'), false)
})

test('ARTICLE_STATUS_LABELS 覆盖全部状态', () => {
  const statuses: ArticleStatus[] = ['draft', 'reviewing', 'published', 'offline', 'rejected']
  for (const s of statuses) {
    a.equal(typeof ARTICLE_STATUS_LABELS[s], 'string')
    a.ok(ARTICLE_STATUS_LABELS[s].length > 0)
  }
})

// ==================== 校验 ====================

test('collectPublishErrors：必填项与占用冲突全部报出', () => {
  const base = mkArticle({ id: 'x', title: '标题', slug: 'ok-slug', contentMarkdown: '正文' })
  const clean = collectPublishErrors(base, { takenSlugs: [], knownCategoryIds: [], knownTagIds: [] })
  a.deepEqual(clean, [])

  const empty = collectPublishErrors(
    { ...base, title: '', contentMarkdown: '', slug: '' },
    { takenSlugs: [], knownCategoryIds: [], knownTagIds: [] }
  )
  a.ok(empty.includes('标题不可为空'))
  a.ok(empty.includes('正文不可为空'))
  a.ok(empty.includes('slug 不可为空'))

  const reserved = collectPublishErrors({ ...base, slug: 'admin' }, { takenSlugs: [], knownCategoryIds: [], knownTagIds: [] })
  a.ok(reserved.some(e => e.includes('系统保留字')))

  const dup = collectPublishErrors({ ...base, slug: 'taken' }, { takenSlugs: ['taken'], knownCategoryIds: [], knownTagIds: [] })
  a.ok(dup.some(e => e.includes('已被占用')))

  const longTitle = collectPublishErrors({ ...base, title: '标'.repeat(101) }, { takenSlugs: [], knownCategoryIds: [], knownTagIds: [] })
  a.ok(longTitle.some(e => e.includes('100 个字符')))

  const badCat = collectPublishErrors(
    { ...base, categoryId: 'gone' },
    { takenSlugs: [], knownCategoryIds: ['c1'], knownTagIds: [] }
  )
  a.ok(badCat.some(e => e.includes('分类已不存在')))
})

test('collectSettingsErrors：名称必填与数值区间', () => {
  const s = emptyBlogSettings()
  a.deepEqual(collectSettingsErrors(s), [])

  a.ok(collectSettingsErrors({ ...s, blogName: '' }).some(e => e.includes('博客名称不可为空')))
  a.ok(collectSettingsErrors({ ...s, blogName: '名'.repeat(51) }).some(e => e.includes('50 个字符')))
  a.ok(collectSettingsErrors({ ...s, blogDescription: '简'.repeat(201) }).some(e => e.includes('200 个字符')))
  a.ok(collectSettingsErrors({ ...s, pageSize: 0 }).some(e => e.includes('每页文章数')))
  a.ok(collectSettingsErrors({ ...s, pageSize: 101 }).some(e => e.includes('每页文章数')))
  a.ok(collectSettingsErrors({ ...s, pinLimit: 21 }).some(e => e.includes('置顶上限')))
  a.ok(collectSettingsErrors({ ...s, excerptLength: 19 }).some(e => e.includes('自动摘要长度')))
  a.ok(collectSettingsErrors({ ...s, autoSaveSeconds: 0 }).some(e => e.includes('自动保存间隔')))
  a.ok(collectSettingsErrors({ ...s, sessionTimeoutMin: 4 }).some(e => e.includes('本地会话超时')))
})

// ==================== 展示格式化 ====================

test('formatDateTime：非法输入回落横杠，可关闭时间部分', () => {
  a.equal(formatDateTime(undefined), '-')
  a.equal(formatDateTime('not-a-date'), '-')
  const v = formatDateTime('2026-03-05T14:09:00.000Z')
  a.match(v, /^2026-03-05 \d{2}:\d{2}$/)
  a.match(formatDateTime('2026-03-05T14:09:00.000Z', false), /^2026-03-05$/)
})

test('relativeTime：分钟 / 小时 / 天 / 未来时间', () => {
  const now = new Date('2026-06-01T12:00:00.000Z').getTime()
  a.equal(relativeTime('2026-06-01T11:59:30.000Z', now), '刚刚')
  a.equal(relativeTime('2026-06-01T11:50:00.000Z', now), '10 分钟前')
  a.equal(relativeTime('2026-06-01T10:00:00.000Z', now), '2 小时前')
  a.equal(relativeTime('2026-05-30T12:00:00.000Z', now), '2 天前')
  a.equal(relativeTime('2026-06-01T13:00:00.000Z', now), '1 小时后')
  a.equal(relativeTime('bad', now), '-')
})

// ==================== 静态发布数据导出 ====================

test('buildBlogPublic：仅导出已发布且未进回收站的文章，并按类别/标签解析名称', () => {
  const stub = (md: string) => `<p>${md}</p>`
  const blog: BlogData = {
    version: 1,
    updatedAt: '2026-05-01T00:00:00.000Z',
    settings: { ...emptyBlogSettings(), blogName: '测试站' },
    categories: [{ id: 'c1', name: '技术', slug: 'tech', order: 1, createdAt: '', updatedAt: '' }],
    tags: [{ id: 't1', name: 'Vue', slug: 'vue', createdAt: '' }],
    articles: [
      mkArticle({ id: 'p1', title: '已发布', status: 'published', categoryId: 'c1', tagIds: ['t1'], contentMarkdown: '正文X' }),
      mkArticle({ id: 'd1', title: '草稿', status: 'draft' }),
      mkArticle({ id: 'p2', title: '已删除', status: 'published', deletedAt: '2026-05-05T00:00:00.000Z' })
    ]
  }
  const out = buildBlogPublic(blog, stub)
  a.equal(out.site.name, '测试站')
  a.equal(out.posts.length, 1)
  a.equal(out.posts[0].slug, 'slug-p1')
  a.equal(out.posts[0].categoryName, '技术')
  a.deepEqual(out.posts[0].tagNames, ['Vue'])
  a.equal(out.posts[0].contentHtml, '<p>正文X</p>')
  // 草稿与已删除均不应外泄
  a.equal(out.posts.some((p) => p.slug === 'slug-d1'), false)
  a.equal(out.posts.some((p) => p.slug === 'slug-p2'), false)
})

test('buildBlogPublic：无分类/标签时回落默认名称，缺失标签名被过滤', () => {
  const blog: BlogData = {
    version: 1,
    updatedAt: '',
    settings: emptyBlogSettings(),
    categories: [],
    tags: [],
    articles: [mkArticle({ id: 'p', status: 'published', tagIds: ['ghost'] })]
  }
  const out = buildBlogPublic(blog, (md) => md)
  a.equal(out.posts[0].categoryName, '未分类')
  a.deepEqual(out.posts[0].tagNames, [])
})

// ==================== 云同步信封合并 ====================

test('mergeBlogEnvelope：同一 id 取 updatedAt 较新的一侧', () => {
  const local = mkEnvelope({
    articles: [mkArticle({ id: 'a', title: '本地新', updatedAt: '2026-05-02T00:00:00.000Z' })]
  }, '2026-05-02T00:00:00.000Z')
  const remote = mkEnvelope({
    articles: [mkArticle({ id: 'a', title: '云端旧', updatedAt: '2026-05-01T00:00:00.000Z' })]
  }, '2026-05-01T00:00:00.000Z')
  const merged = mergeBlogEnvelope(local, remote)
  a.equal(merged.blog?.articles.length, 1)
  a.equal(merged.blog?.articles[0].title, '本地新')
})

test('mergeBlogEnvelope：云端较新时以云端为准（不丢任一侧独有条目）', () => {
  const local = mkEnvelope({
    articles: [mkArticle({ id: 'a', title: 'A', updatedAt: '2026-05-01T00:00:00.000Z' })]
  }, '2026-05-01T00:00:00.000Z')
  const remote = mkEnvelope({
    articles: [
      mkArticle({ id: 'a', title: 'A 云端更新', updatedAt: '2026-05-03T00:00:00.000Z' }),
      mkArticle({ id: 'b', title: 'B 仅云端', updatedAt: '2026-05-03T00:00:00.000Z' })
    ]
  }, '2026-05-03T00:00:00.000Z')
  const merged = mergeBlogEnvelope(local, remote)
  a.equal(merged.blog?.articles.length, 2)
  a.equal(merged.blog?.articles.find(x => x.id === 'a')?.title, 'A 云端更新')
  a.ok(merged.blog?.articles.some(x => x.id === 'b'))
})

test('mergeBlogEnvelope：软删除作 tombstone，编辑较新的一侧保留删除态', () => {
  const deleted = mkArticle({ id: 'a', updatedAt: '2026-05-05T00:00:00.000Z', deletedAt: '2026-05-05T00:00:00.000Z' })
  const local = mkEnvelope({ articles: [deleted] }, '2026-05-05T00:00:00.000Z')
  // 远端仍是更早的编辑版本（无 deletedAt）→ 合并后必须保持已删除，不能复活
  const remote = mkEnvelope({
    articles: [mkArticle({ id: 'a', title: '旧版本', updatedAt: '2026-05-01T00:00:00.000Z' })]
  }, '2026-05-01T00:00:00.000Z')
  const merged = mergeBlogEnvelope(local, remote)
  a.equal(merged.blog?.articles.length, 1)
  a.equal(merged.blog?.articles[0].deletedAt, '2026-05-05T00:00:00.000Z')
})

test('mergeBlogEnvelope：本地已发布且 updatedAt 更新，云端为旧草稿时保留发布状态', () => {
  // 复现用户 bug：点「发布」后本地为 published 且 updatedAt 更新；云端仍是发布前的 draft 旧快照。
  // 合并后必须保留本地已发布状态，否则云拉取的 !dirty 分支会把刚发布的文章冲回草稿。
  const local = mkEnvelope({
    articles: [mkArticle({ id: 'a', title: '我的文章', status: 'published', publishedAt: '2026-05-10T12:00:00.000Z', updatedAt: '2026-05-10T12:00:00.000Z' })]
  }, '2026-05-10T12:00:00.000Z')
  const remote = mkEnvelope({
    articles: [mkArticle({ id: 'a', title: '我的文章', status: 'draft', updatedAt: '2026-05-01T00:00:00.000Z' })]
  }, '2026-05-01T00:00:00.000Z')
  const merged = mergeBlogEnvelope(local, remote)
  const art = merged.blog?.articles.find(x => x.id === 'a')
  a.equal(art?.status, 'published')
  a.equal(art?.publishedAt, '2026-05-10T12:00:00.000Z')
})

test('mergeBlogEnvelope：设置取整包较新的一侧', () => {
  const local = mkEnvelope({ settings: { ...emptyBlogSettings(), blogName: '本地站' } }, '2026-05-01T00:00:00.000Z')
  const remote = mkEnvelope({ settings: { ...emptyBlogSettings(), blogName: '云端站' } }, '2026-05-09T00:00:00.000Z')
  a.equal(mergeBlogEnvelope(local, remote).blog?.settings.blogName, '云端站')
  a.equal(mergeBlogEnvelope(remote, local).blog?.settings.blogName, '云端站')
})

test('mergeBlogEnvelope：分类与标签同样按 id 合并去重', () => {
  const cat = { id: 'c1', name: '分类一', slug: 'c1', order: 1, createdAt: '', updatedAt: '2026-05-01T00:00:00.000Z' }
  const tag = { id: 't1', name: '标签一', slug: 't1', createdAt: '' }
  const local = mkEnvelope({ categories: [cat], tags: [tag] }, '2026-05-01T00:00:00.000Z')
  const remote = mkEnvelope({ categories: [cat], tags: [tag] }, '2026-05-01T00:00:00.000Z')
  const merged = mergeBlogEnvelope(local, remote)
  a.equal(merged.blog?.categories.length, 1)
  a.equal(merged.blog?.tags.length, 1)
})

// ==================== 博客编辑器 Markdown 变换 ====================
test('applyMarkdown bold wraps selection and toggles off', () => {
  const r1 = applyMarkdown('bold', 'hello', 0, 5)
  a.equal(r1.value, '**hello**')
  a.equal(r1.selStart, 2)
  a.equal(r1.selEnd, 7)
  const r2 = applyMarkdown('bold', r1.value, 2, 7)
  a.equal(r2.value, 'hello')
  a.equal(r2.selStart, 0)
  a.equal(r2.selEnd, 5)
})

test('applyMarkdown bold uses placeholder when nothing selected', () => {
  const r = applyMarkdown('bold', 'abc', 3, 3)
  a.equal(r.value, 'abc**加粗文字**')
  a.equal(r.selStart, 5)
  a.equal(r.selEnd, 9)
})

test('applyMarkdown italic / strike / inline-code wrap', () => {
  a.equal(applyMarkdown('italic', 'x', 0, 1).value, '*x*')
  a.equal(applyMarkdown('strike', 'x', 0, 1).value, '~~x~~')
  a.equal(applyMarkdown('inline-code', 'x', 0, 1).value, '`x`')
})

test('applyMarkdown heading-2 prefixes line and toggles off', () => {
  const r1 = applyMarkdown('heading-2', 'title', 0, 5)
  a.equal(r1.value, '## title')
  const r2 = applyMarkdown('heading-2', r1.value, 0, r1.value.length)
  a.equal(r2.value, 'title')
})

test('applyMarkdown blockquote / ul / ol prefix lines', () => {
  a.equal(applyMarkdown('blockquote', 'quoted', 0, 6).value, '> quoted')
  a.equal(applyMarkdown('ul', 'item', 0, 4).value, '- item')
  a.equal(applyMarkdown('ol', 'a\nb\nc', 0, 5).value, '1. a\n2. b\n3. c')
})

test('applyMarkdown link inserts markdown and selects url', () => {
  const r = applyMarkdown('link', 'easy', 0, 4)
  a.equal(r.value, '[easy](https://)')
  a.equal(r.value.slice(r.selStart, r.selEnd), 'https://')
})

test('applyMarkdown image inserts alt+url with caret at end', () => {
  const r = applyMarkdown('image', '', 0, 0, { alt: 'pic', url: 'data:image/png;base64,AAA' })
  a.equal(r.value, '![pic](data:image/png;base64,AAA)')
  a.equal(r.selStart, r.value.length)
  a.equal(r.selEnd, r.value.length)
})

test('applyMarkdown table / hr insert with blank-line separation', () => {
  const t = applyMarkdown('table', '', 0, 0)
  a.ok(t.value.startsWith('| 列1 | 列2 |'))
  a.ok(t.value.includes('| --- | --- |'))
  a.equal(applyMarkdown('hr', 'ab', 1, 1).value, 'a\n---\nb')
})

test('isAllowedDataImage accepts bitmap base64 and rejects svg/non-data', () => {
  a.equal(isAllowedDataImage('data:image/png;base64,iVBOR'), true)
  a.equal(isAllowedDataImage('data:image/jpeg;base64,/9j/'), true)
  a.equal(isAllowedDataImage('data:image/svg+xml;base64,PHN2'), false)
  a.equal(isAllowedDataImage('https://example.com/a.png'), false)
  a.equal(isAllowedDataImage('data:image/png;utf8,xxx'), false)
})

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    passed++
    console.log(`  ✓ ${t.name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${t.name}`)
    console.error(e)
  }
}
if (failed > 0) {
  console.error(`\n${passed}/${tests.length} passed, ${assertCount} assertions, exit 1`)
  process.exit(1)
}
console.log(`\n${passed}/${tests.length} passed, ${assertCount} assertions, exit 0`)
