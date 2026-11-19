/**
 * blog.json 云同步回归测试：签名稳定性 + 并集合并语义
 * 运行：node --experimental-strip-types scripts/test-blog-sync-core.ts
 *
 * 覆盖：
 * 1. 每次同步都会推进的元数据（exportedAt/pushedAt/clientId/blog.updatedAt）不参与内容签名
 * 2. 合并后仅 blog.updatedAt 变化 → 签名仍然一致（根治「没改也反复冲突」）
 * 3. 本地独有条目在并集合并里会保留（解释为什么显式取云端必须走整包覆盖）
 */
import assert from 'node:assert/strict'
import { mergeBlogEnvelope, withoutVolatileBlogMeta } from '../src/composables/blogSyncCore.ts'
import { normalizeBlogData } from '../src/composables/blogCore.ts'
import { stableStringify } from '../src/composables/stableStringify.ts'
import type { BlogSyncData } from '../src/types'

function sig(data: BlogSyncData): string {
  return stableStringify(withoutVolatileBlogMeta(data))
}

function envelope(overrides: {
  exportedAt?: string
  pushedAt?: number
  clientId?: string
  blogUpdatedAt?: string
  articleIds?: string[]
  imageIds?: string[]
} = {}): BlogSyncData {
  return {
    version: 1,
    exportedAt: overrides.exportedAt ?? '2026-11-19T06:52:00.000Z',
    pushedAt: overrides.pushedAt,
    clientId: overrides.clientId,
    blog: normalizeBlogData({
      version: 1,
      updatedAt: overrides.blogUpdatedAt ?? '2026-11-14T05:52:01.210Z',
      settings: {} as BlogSyncData['blog']['settings'],
      categories: [],
      tags: [],
      articles: (overrides.articleIds ?? []).map(id => ({
        id,
        slug: id,
        title: id,
        contentMarkdown: '正文',
        status: 'draft',
        tagIds: [],
        createdAt: '2026-11-08T00:00:00.000Z',
        updatedAt: '2026-11-08T00:00:00.000Z'
      })) as BlogSyncData['blog']['articles'],
      images: (overrides.imageIds ?? []).map(id => ({
        id,
        name: id,
        dataUrl: 'data:image/png;base64,AAAA',
        createdAt: '2026-11-08T00:00:00.000Z'
      })) as BlogSyncData['blog']['images'],
      imageCategories: [],
      wechat: undefined
    })
  } as BlogSyncData
}

// 1) 元数据剔除
const cleaned = withoutVolatileBlogMeta(envelope({ pushedAt: 123, clientId: 'dev-a' }))!
assert.equal('exportedAt' in cleaned, false)
assert.equal('pushedAt' in cleaned, false)
assert.equal('clientId' in cleaned, false)
assert.equal('updatedAt' in (cleaned.blog as Record<string, unknown>), false)
assert.equal((cleaned.blog as { articles: unknown[] }).articles.length, 0)

// 2) 只有易变元数据不同 → 签名一致
const local = envelope({ exportedAt: '2026-11-19T06:52:00.000Z', blogUpdatedAt: '2026-11-14T05:52:01.210Z', articleIds: ['a1'] })
const remote = envelope({
  exportedAt: '2026-11-19T06:48:00.000Z',
  pushedAt: 1763539680000,
  clientId: 'other-device',
  blogUpdatedAt: '2026-11-19T06:48:00.000Z',
  articleIds: ['a1']
})
assert.equal(sig(local), sig(remote), '元数据差异不应造成内容签名不同')

// 2b) 归一化会产生 undefined 字段；云端 JSON 会丢掉它们 → 稳定序列化必须等价处理
const normalized = envelope({ articleIds: ['a1'], imageIds: ['img1'] })
assert.equal(
  sig(normalized),
  sig(JSON.parse(JSON.stringify(normalized)) as BlogSyncData),
  'undefined 字段不应让本地导出与云端 JSON 的签名不同'
)

// 3) mergeBlogEnvelope 会重写 blog.updatedAt，但签名仍然稳定
const merged = mergeBlogEnvelope(local, remote)
assert.notEqual(merged.blog.updatedAt, local.blog.updatedAt)
assert.equal(sig(merged), sig(local), '合并后的 updatedAt 不应造成下一次同步再次冲突')

// 4) 并集合并保留本地独有条目 —— 显式「取云端」必须整包覆盖才能清掉它们
const localWithExtra = envelope({ articleIds: ['a1', 'local-only'], imageIds: ['img-local'] })
const remoteWithout = envelope({ articleIds: ['a1'], imageIds: [] })
const union = mergeBlogEnvelope(localWithExtra, remoteWithout)
assert.ok(union.blog.articles.some(a => a.id === 'local-only'))
assert.ok(union.blog.images.some(i => i.id === 'img-local'))
assert.notEqual(sig(union), sig(remoteWithout), '并集结果与远端不同 → 下次仍会判冲突，故需要 overwrite 路径')

console.log('✓ blog 同步签名稳定 + 并集语义测试通过')
