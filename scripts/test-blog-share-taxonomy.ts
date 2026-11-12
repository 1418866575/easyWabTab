/**
 * 博客共享发布「分类 / 标签推送」回归测试。
 * 运行：node --experimental-strip-types --experimental-loader ./scripts/resolve-extensionless.mjs scripts/test-blog-share-taxonomy.ts
 *
 * 覆盖：老清单反推、整表优先、本地/共享合并去重、sharedEntryToArticle 不再丢 categoryId。
 */
import assert from 'node:assert/strict'
import {
  deriveTaxonomy,
  mergeTaxonomy,
  sharedEntryToArticle,
  mergeArticlesForListing,
  useBlogShared
} from '../src/composables/blogShared.ts'

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

const entries = [
  {
    id: 'ba_1', slug: 'a', title: 'A', excerpt: '', authorName: '',
    categoryId: 'bc_1', categoryName: '技术',
    tagIds: ['bt_1', 'bt_2'], tagNames: ['Vue', 'TS'],
    updatedAt: '2026-01-02T00:00:00.000Z', size: 1
  },
  {
    id: 'ba_2', slug: 'b', title: 'B', excerpt: '', authorName: '',
    categoryId: 'bc_2', categoryName: '生活',
    tagIds: ['bt_1'], tagNames: ['Vue'],
    updatedAt: '2026-01-03T00:00:00.000Z', size: 1
  }
]

check('deriveTaxonomy: 老清单能反推出分类表与正确名称', () => {
  const { categories } = deriveTaxonomy(entries)
  assert.equal(categories.length, 2)
  assert.deepEqual(categories.map((c) => c.name), ['技术', '生活'])
  assert.deepEqual(categories.map((c) => c.order), [0, 1])
})
check('deriveTaxonomy: 标签按 id 去重且名称正确', () => {
  const { tags } = deriveTaxonomy(entries)
  assert.equal(tags.length, 2)
  assert.deepEqual(tags.map((t) => t.name), ['Vue', 'TS'])
})
check('deriveTaxonomy: 空清单返回空表', () => {
  assert.deepEqual(deriveTaxonomy([]), { categories: [], tags: [] })
})
check('deriveTaxonomy: 未分类条目不生成分类，但生成标签', () => {
  const t = deriveTaxonomy([{ ...entries[0], categoryId: '', categoryName: '未分类' }])
  assert.equal(t.categories.length, 0)
  assert.equal(t.tags.length, 2)
})
check('sharedEntryToArticle: 不再丢失 categoryId（分类筛选回归）', () => {
  const a = sharedEntryToArticle(entries[0])
  assert.equal(a.categoryId, 'bc_1')
  assert.deepEqual(a.tagIds, ['bt_1', 'bt_2'])
})
check('mergeTaxonomy: 本地优先，同 id 不被共享表覆盖', () => {
  const merged = mergeTaxonomy(
    [{ id: 'bc_1', name: '本地技术' }],
    [{ id: 'bc_1', name: '共享技术' }, { id: 'bc_9', name: '共享独有' }]
  )
  assert.deepEqual(merged.map((x) => x.name), ['本地技术', '共享独有'])
})
check('mergeTaxonomy: 空本地表时完整采用共享表', () => {
  const merged = mergeTaxonomy([], [{ id: 'bt_1', name: 'Vue' }])
  assert.deepEqual(merged, [{ id: 'bt_1', name: 'Vue' }])
})
check('mergeArticlesForListing: 合并后的共享文章仍带分类 id', () => {
  const merged = mergeArticlesForListing([], entries)
  assert.equal(merged.length, 2)
  assert.equal(merged.find((a) => a.id === 'ba_1')?.categoryId, 'bc_1')
  assert.equal(merged.find((a) => a.id === 'ba_2')?.categoryId, 'bc_2')
})
check('useBlogShared: taxonomy 初始为空且可用', () => {
  const t = useBlogShared().taxonomy.value
  assert.deepEqual(t.categories, [])
  assert.deepEqual(t.tags, [])
})

console.log(`\n[test-blog-share-taxonomy] ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
