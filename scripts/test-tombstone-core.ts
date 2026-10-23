/**
 * 云同步墓碑 + Lamport 逻辑时钟 纯逻辑测试
 * 运行：npm run test:tombstone
 *
 * 覆盖：墓碑判定/过滤 · Lamport 比较 · 墓碑感知合并（删除不复活）· 打标/恢复 · 7 天 GC
 */
import assert from 'node:assert/strict'
import {
  TOMBSTONE_TTL_DAYS,
  isDeleted,
  activeOnly,
  compareStamp,
  mergeTombstonedById,
  bumpStamp,
  markDeleted,
  clearDeleted,
  softDeleteById,
  restoreById,
  isTombstoneExpired,
  gcTombstones,
  trashedItems,
  keepStamp
} from '../src/composables/tombstoneCore.ts'
import type { SyncStamp } from '../src/types'

let passed = 0
function ok(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ✔ ${name}`)
}

function item(patch: Partial<SyncStamp> & { id: string }): SyncStamp {
  return {
    name: patch.id,
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...patch
  } as SyncStamp
}

console.log('云同步墓碑 core 测试\n')

// ---------- 判定 / 过滤 ----------
console.log('[判定/过滤]')
ok('无 deletedAt → 视为未删除（老数据兼容）', () => {
  assert.equal(isDeleted(item({ id: 'a' })), false)
  assert.equal(isDeleted(item({ id: 'a', deletedAt: null })), false)
})
ok('有 deletedAt → 墓碑', () => {
  assert.equal(isDeleted(item({ id: 'a', deletedAt: '2026-05-01T00:00:00.000Z' })), true)
})
ok('activeOnly 剔除墓碑', () => {
  const list = [
    item({ id: 'a' }),
    item({ id: 'b', deletedAt: '2026-05-01T00:00:00.000Z' }),
    item({ id: 'c' })
  ]
  assert.equal(activeOnly(list).length, 2)
  assert.ok(activeOnly(list).every((i) => !isDeleted(i)))
})

// ---------- Lamport 比较 ----------
console.log('[Lamport 比较]')
ok('ver 大者胜（优先于时间戳）', () => {
  const a = item({ id: 'a', ver: 5, updatedAt: '2026-01-01T00:00:00.000Z' })
  const b = item({ id: 'b', ver: 3, updatedAt: '2026-09-01T00:00:00.000Z' })
  assert.ok(compareStamp(a, b) > 0, 'ver 5 应胜出，尽管 updatedAt 更早')
})
ok('ver 相同 → 比 updatedAt', () => {
  const a = item({ id: 'a', ver: 2, updatedAt: '2026-06-01T00:00:00.000Z' })
  const b = item({ id: 'b', ver: 2, updatedAt: '2026-05-01T00:00:00.000Z' })
  assert.ok(compareStamp(a, b) > 0)
})
ok('老数据无 ver → 回落到 updatedAt 比较', () => {
  const a = item({ id: 'a', updatedAt: '2026-06-01T00:00:00.000Z' })
  const b = item({ id: 'b', updatedAt: '2026-05-01T00:00:00.000Z' })
  assert.ok(compareStamp(a, b) > 0)
})
ok('可指定 tsKey（如 createdAt 键的条目）', () => {
  const a = { id: 'a', createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } as SyncStamp
  const b = { id: 'b', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' } as SyncStamp
  assert.ok(compareStamp(a, b, 'createdAt') > 0, '按 createdAt 比较应 a 胜')
  assert.ok(compareStamp(a, b) < 0, '按 updatedAt 比较应 b 胜')
})
ok('全相同 → clientId 稳定 tie-break，不抖动', () => {
  const a = item({ id: 'a', ver: 1, updatedAt: '2026-01-01T00:00:00.000Z', clientId: 'cid-b' })
  const b = item({ id: 'b', ver: 1, updatedAt: '2026-01-01T00:00:00.000Z', clientId: 'cid-a' })
  assert.ok(compareStamp(a, b) > 0)
  assert.equal(compareStamp(a, { ...a, id: 'c' } as SyncStamp), 0)
})

// ---------- 墓碑感知合并（核心：删除不复活）----------
console.log('[墓碑感知合并]')
ok('本端删除 + 云端仍是活记录 → 保持删除（旧逻辑会复活）', () => {
  const local = [item({ id: 'x', ver: 5, deletedAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' })]
  const remote = [item({ id: 'x', ver: 3, updatedAt: '2026-05-01T00:00:00.000Z' })]
  const merged = mergeTombstonedById(local, remote)
  assert.equal(merged.length, 1)
  assert.equal(isDeleted(merged[0]), true, '墓碑应保留')
  assert.equal(activeOnly(merged).length, 0, '展示层应看不到')
})
ok('他端删除 + 本端还在编辑 → 墓碑胜，本端也删除', () => {
  const local = [item({ id: 'x', ver: 4, updatedAt: '2026-07-01T00:00:00.000Z' })]
  const remote = [item({ id: 'x', ver: 6, deletedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' })]
  const merged = mergeTombstonedById(local, remote)
  assert.equal(isDeleted(merged[0]), true)
})
ok('本端缺席 + 云端活记录 → 补入（接收他端新增）', () => {
  const merged = mergeTombstonedById([], [item({ id: 'new1', ver: 1 })])
  assert.equal(merged.length, 1)
  assert.equal(isDeleted(merged[0]), false)
})
ok('本端缺席 + 云端墓碑 → 墓碑传播到本端', () => {
  const merged = mergeTombstonedById([], [item({ id: 'x', ver: 2, deletedAt: '2026-06-01T00:00:00.000Z' })])
  assert.equal(isDeleted(merged[0]), true)
})
ok('旧时间戳语义：老数据无 ver，本端墓碑 updatedAt 更新 → 保持删除', () => {
  const local = [item({ id: 'x', deletedAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' })]
  const remote = [item({ id: 'x', updatedAt: '2026-05-01T00:00:00.000Z' })]
  assert.equal(isDeleted(mergeTombstonedById(local, remote)[0]), true)
})
ok('双向新增互不丢失', () => {
  const merged = mergeTombstonedById(
    [item({ id: 'a', ver: 1 })],
    [item({ id: 'b', ver: 1 })]
  )
  assert.equal(merged.length, 2)
})
ok('合并保留墓碑不先行过滤（墓碑须参与后续推送）', () => {
  const local = [item({ id: 'x', ver: 5, deletedAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' })]
  assert.equal(mergeTombstonedById(local, []).length, 1, '合并结果必须仍含墓碑')
})

// ---------- 打标 / 恢复 ----------
console.log('[打标/恢复]')
ok('markDeleted：写墓碑 + ver+1 + updatedAt 前进（不移除记录）', () => {
  const before = item({ id: 'x', ver: 3, updatedAt: '2026-01-01T00:00:00.000Z' })
  const after = markDeleted(before, { now: '2026-06-01T00:00:00.000Z', clientId: 'cid-1' })
  assert.equal(after.ver, 4)
  assert.equal(after.deletedAt, '2026-06-01T00:00:00.000Z')
  assert.equal(after.updatedAt, '2026-06-01T00:00:00.000Z')
  assert.equal(after.clientId, 'cid-1')
  assert.equal(after.id, 'x', '记录必须仍在')
})
ok('bumpStamp：普通更新也推进 ver', () => {
  const after = bumpStamp(item({ id: 'x', ver: 7 }), { now: '2026-06-01T00:00:00.000Z' })
  assert.equal(after.ver, 8)
  assert.equal(isDeleted(after), false)
})
ok('clearDeleted 恢复：清墓碑且 ver 前进', () => {
  const t = markDeleted(item({ id: 'x', ver: 2 }), { now: '2026-06-01T00:00:00.000Z' })
  const restored = clearDeleted(t, { now: '2026-07-01T00:00:00.000Z' })
  assert.equal(isDeleted(restored), false)
  assert.equal(restored.ver, 4)
})
ok('softDeleteById / restoreById 数组级操作', () => {
  const list = [item({ id: 'a' }), item({ id: 'b' })]
  const trashed = softDeleteById(list, 'a', { now: '2026-06-01T00:00:00.000Z' })
  assert.equal(trashed.length, 2, '仍保留 2 条（含墓碑）')
  assert.equal(activeOnly(trashed).length, 1)
  assert.equal(restoreById(trashed, 'a', { now: '2026-07-01T00:00:00.000Z' }).length, 2)
  assert.equal(activeOnly(restoreById(trashed, 'a', { now: '2026-07-01T00:00:00.000Z' })).length, 2)
})

// ---------- GC ----------
console.log('[墓碑 GC]')
ok('保留期常量 = 7 天（用户决策）', () => {
  assert.equal(TOMBSTONE_TTL_DAYS, 7)
})
ok('未满 7 天的墓碑不清除（3 天）', () => {
  const t = item({ id: 'x', deletedAt: '2026-06-05T00:00:00.000Z' })
  assert.equal(isTombstoneExpired(t, new Date('2026-06-08T00:00:00.000Z')), false)
})
ok('满 7 天的墓碑清除', () => {
  const t = item({ id: 'x', deletedAt: '2026-06-01T00:00:00.000Z' })
  assert.equal(isTombstoneExpired(t, new Date('2026-06-08T00:00:00.000Z')), true)
})
ok('活记录永不过期；非法 deletedAt 保守不清除', () => {
  const now = new Date('2026-06-08T00:00:00.000Z')
  assert.equal(isTombstoneExpired(item({ id: 'x' }), now), false)
  assert.equal(isTombstoneExpired(item({ id: 'x', deletedAt: 'garbage' }), now), false)
})
ok('gcTombstones 物理清除并返回清除数', () => {
  const now = new Date('2026-06-20T00:00:00.000Z')
  const list = [
    item({ id: 'old', deletedAt: '2026-06-01T00:00:00.000Z' }),   // 19 天 → 清除
    item({ id: 'fresh', deletedAt: '2026-06-18T00:00:00.000Z' }), // 2 天 → 保留
    item({ id: 'live' })
  ]
  const { kept, purged } = gcTombstones(list, now)
  assert.equal(purged, 1)
  assert.equal(kept.length, 2)
  assert.ok(kept.some((i) => i.id === 'live'))
  assert.ok(kept.some((i) => i.id === 'fresh'))
})
ok('trashedItems 按删除时间倒序', () => {
  const list = [
    item({ id: 'a', deletedAt: '2026-06-01T00:00:00.000Z' }),
    item({ id: 'b', deletedAt: '2026-06-10T00:00:00.000Z' }),
    item({ id: 'live' })
  ]
  const trashed = trashedItems(list)
  assert.equal(trashed.length, 2)
  assert.equal(trashed[0].id, 'b')
})

// ---------- 归一化保留戳 ----------
console.log('\n[归一化保留戳]')
ok('keepStamp 把墓碑与版本戳搬到重建后的对象上', () => {
  // 模拟各模块 normalizeXxx「重建对象只拷已知字段」的形态
  const rebuilt: SyncStamp = { id: 'a', createdAt: 't0', updatedAt: 't1' }
  const raw = { id: 'a', deletedAt: '2026-06-01T00:00:00.000Z', ver: 7, clientId: 'c1' }
  const out = keepStamp(rebuilt, raw)
  assert.equal(out.deletedAt, '2026-06-01T00:00:00.000Z')
  assert.equal(out.ver, 7)
  assert.equal(out.clientId, 'c1')
})
ok('keepStamp 缺失/脏字段不写入（不产生 undefined 脏键）', () => {
  const out = keepStamp({ id: 'a' } as SyncStamp, { id: 'a', deletedAt: '', ver: 'x', clientId: 3 })
  assert.equal(out.deletedAt, undefined)
  assert.equal(out.ver, undefined)
  assert.equal(out.clientId, undefined)
})
ok('keepStamp 容忍 null/undefined 源（不抛错）', () => {
  const out = keepStamp({ id: 'a' } as SyncStamp, null)
  assert.equal(out.id, 'a')
  assert.equal(out.deletedAt, undefined)
  assert.equal(keepStamp({ id: 'b' } as SyncStamp, undefined).id, 'b')
})
ok('keepStamp 后的墓碑仍能被合并保留（端到端：归一化不丢删除）', () => {
  // 本端墓碑 → 归一化重建 → 仍应压过云端活记录
  const tomb = keepStamp(
    { id: 'x', updatedAt: '2026-06-01T00:00:00.000Z', ver: 5 } as SyncStamp,
    { id: 'x', deletedAt: '2026-06-01T00:00:00.000Z', ver: 5, clientId: 'c1' }
  )
  const remoteLive: SyncStamp = { id: 'x', updatedAt: '2026-05-01T00:00:00.000Z', ver: 3 } as SyncStamp
  const merged = mergeTombstonedById([tomb], [remoteLive])
  assert.equal(merged.length, 1)
  assert.equal(isDeleted(merged[0]), true)
  assert.equal(activeOnly(merged).length, 0)
})

console.log(`\n全部 ${passed} 项测试通过 ✅`)
