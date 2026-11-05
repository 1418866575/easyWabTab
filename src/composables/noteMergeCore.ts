import type { WorkbenchNote } from '@/types'

/**
 * 便签状态（status）的字段级合并。
 *
 * mergeById 是记录级 LWW：整条记录一起换。对端只改了标题/置顶，或远端 ver 更高时，
 * 本端刚改的「已处理」会被它带来的旧 status 一起覆盖，表现为「改完状态一同步又变回去」。
 * 这里把 status 单独按「状态变更时间」取新，与记录级胜负解耦。
 *
 * 旧数据 / 旧版 addNote 可能没有 statusUpdatedAt：
 * - 只有一端有 → 该端是唯一明确改过状态的，直接取它（不要拿对端的 updatedAt 比，
 *   对端可能只是改了标题，时间戳更晚但 status 是旧的）；
 * - 两端都没有 → 退回 updatedAt 比较；仍无时间戳则维持记录级结果。
 */
export function mergeNoteStatus(
  local: WorkbenchNote,
  remote: WorkbenchNote,
  winner: WorkbenchNote
): WorkbenchNote {
  if (local.status === remote.status) return winner

  const lt = local.statusUpdatedAt || ''
  const rt = remote.statusUpdatedAt || ''
  let takeLocal: boolean
  if (lt && !rt) takeLocal = true
  else if (!lt && rt) takeLocal = false
  else {
    const lTime = lt || local.updatedAt || ''
    const rTime = rt || remote.updatedAt || ''
    if (!lTime || !rTime || lTime === rTime) return winner
    takeLocal = lTime > rTime
  }

  return {
    ...winner,
    status: takeLocal ? local.status : remote.status,
    statusUpdatedAt: takeLocal ? lt || local.updatedAt : rt || remote.updatedAt
  }
}
