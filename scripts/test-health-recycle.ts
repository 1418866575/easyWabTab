/**
 * 健康回收站回归测试：归一化保留墓碑 + 云同步合并不复活已删记录
 * 运行：node --experimental-strip-types scripts/test-health-recycle.ts
 */
import assert from 'node:assert/strict'
import { normalizeWeightRecord, normalizeHeightRecord } from '../src/composables/healthCore.ts'
import {
  clearDeleted,
  isDeleted,
  markDeleted,
  mergeTombstonedById
} from '../src/composables/tombstoneCore.ts'
import type { WeightRecord } from '../src/types'

function weight(id: string, updatedAt: string, patch: Partial<WeightRecord> = {}): WeightRecord {
  return normalizeWeightRecord({
    id,
    module: 'weight',
    date: '2026-11-20',
    weightKg: 68,
    personId: 'p1',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt,
    ...patch
  })
}

// 1) 归一化必须透传墓碑戳，否则加载后记录「复活」
const tomb = markDeleted(weight('wt_1', '2026-11-19T10:00:00.000Z'), {
  now: '2026-11-19T12:00:00.000Z',
  clientId: 'dev-a'
})
const normalized = normalizeWeightRecord(tomb)
assert.equal(isDeleted(normalized), true)
assert.equal(normalized.deletedAt, tomb.deletedAt)
assert.equal(normalized.ver, tomb.ver)
assert.equal(normalized.clientId, 'dev-a')
assert.equal(normalizeHeightRecord({ id: 'hg_1', deletedAt: 'x', ver: 3, clientId: 'dev-b' }).deletedAt, 'x')

// 2) 本地墓碑 vs 云端旧活记录 → 墓碑胜（删除不会被同步恢复）
const remoteOld = weight('wt_2', '2026-11-18T00:00:00.000Z')
const localDeleted = markDeleted(weight('wt_2', '2026-11-19T00:00:00.000Z'), {
  now: '2026-11-19T09:00:00.000Z',
  clientId: 'dev-a'
})
const merged1 = mergeTombstonedById([localDeleted], [remoteOld])
assert.equal(merged1.length, 1)
assert.equal(isDeleted(merged1[0]), true, '本地墓碑必须压过云端活记录')

// 3) 云端墓碑 vs 本地活记录 → 云端墓碑胜（别的设备删了也要同步删）
const remoteDeleted = markDeleted(weight('wt_3', '2026-11-19T08:00:00.000Z'), {
  now: '2026-11-19T10:00:00.000Z',
  clientId: 'dev-b'
})
const localActive = weight('wt_3', '2026-11-19T07:00:00.000Z')
const merged2 = mergeTombstonedById([localActive], [remoteDeleted])
assert.equal(merged2.length, 1)
assert.equal(isDeleted(merged2[0]), true, '远端墓碑必须压过本地旧活记录')

// 4) 还原（clearDeleted 推进 ver）后本地活记录胜，不会又被旧墓碑压回去
const restored = clearDeleted(remoteDeleted, { now: '2026-11-20T01:00:00.000Z', clientId: 'dev-a' })
const merged3 = mergeTombstonedById([restored], [remoteDeleted])
assert.equal(isDeleted(merged3[0]), false, '还原推进版本后应击败旧墓碑')

// 5) 远端独有记录仍要补入（并集语义不能丢）
const merged4 = mergeTombstonedById([weight('wt_4', '2026-11-01T00:00:00.000Z')], [weight('wt_5', '2026-11-02T00:00:00.000Z')])
assert.deepEqual(merged4.map(r => r.id).sort(), ['wt_4', 'wt_5'])

console.log('✓ 健康记录墓碑保留 + 合并不复活测试通过')
