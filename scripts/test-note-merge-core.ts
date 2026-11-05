/**
 * 便签状态字段级合并回归用例（纯逻辑，node --experimental-strip-types 直跑）。
 * 覆盖「改完状态一同步又变回去」的几条漏网路径：缺 statusUpdatedAt、远端 ver 更高。
 */
import assert from 'node:assert/strict'
import { mergeNoteStatus } from '../src/composables/noteMergeCore.ts'
import type { WorkbenchNote } from '../src/types/index.ts'

const note = (patch: Partial<WorkbenchNote> = {}): WorkbenchNote => ({
  id: 'n1',
  content: '',
  color: 'blue',
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  status: 'pending',
  ...patch
})

const T1 = '2026-01-01T00:00:00.000Z'
const T2 = '2026-01-02T00:00:00.000Z'
const T3 = '2026-01-03T00:00:00.000Z'

// 1. 状态一致 → 不改写记录级结果
{
  const winner = note({ status: 'pending' })
  assert.strictEqual(mergeNoteStatus(note(), note(), winner), winner)
}

// 2. 两端都有状态变更时间 → 取新的
{
  const local = note({ status: 'done', statusUpdatedAt: T2 })
  const remote = note({ status: 'pending', statusUpdatedAt: T1 })
  assert.equal(mergeNoteStatus(local, remote, remote).status, 'done')
}
{
  const local = note({ status: 'done', statusUpdatedAt: T1 })
  const remote = note({ status: 'pending', statusUpdatedAt: T2 })
  assert.equal(mergeNoteStatus(local, remote, local).status, 'pending')
}

// 3. 只有本端有 statusUpdatedAt（远端是旧数据 / 旧版 addNote）→ 保住本端状态。
//    远端可能只改过标题，updatedAt 更晚，不能拿它当状态时间比。
{
  const local = note({ status: 'done', statusUpdatedAt: T2 })
  const remote = note({ status: 'pending', updatedAt: T3, ver: 9 })
  const merged = mergeNoteStatus(local, remote, remote)
  assert.equal(merged.status, 'done')
  assert.equal(merged.statusUpdatedAt, T2)
}

// 4. 只有远端有 → 取远端
{
  const local = note({ status: 'done', updatedAt: T3 })
  const remote = note({ status: 'pending', statusUpdatedAt: T2 })
  assert.equal(mergeNoteStatus(local, remote, local).status, 'pending')
}

// 5. 两端都缺（纯历史数据）→ 退回 updatedAt；相等则维持记录级结果
{
  const local = note({ status: 'done', updatedAt: T2 })
  const remote = note({ status: 'pending', updatedAt: T1 })
  assert.equal(mergeNoteStatus(local, remote, remote).status, 'done')
}
{
  const winner = note({ status: 'pending', updatedAt: T2 })
  assert.strictEqual(
    mergeNoteStatus(note({ status: 'done', updatedAt: T2 }), note({ status: 'pending', updatedAt: T2 }), winner),
    winner
  )
}

// 6. 完全无时间戳 → 不臆造，维持记录级结果
{
  const winner = note({ status: 'pending', updatedAt: undefined })
  assert.strictEqual(
    mergeNoteStatus(note({ status: 'done', updatedAt: undefined }), winner, winner),
    winner
  )
}

console.log('便签状态合并：7 组用例全部通过')
