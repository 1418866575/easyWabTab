/**
 * 随机与抽签纯函数（零依赖，随机源 crypto.getRandomValues）
 */

import { randomBelow } from './ids.ts'

/** [min, max] 闭区间随机整数 */
export function randomInt(min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max))
  const hi = Math.floor(Math.max(min, max))
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return 0
  return lo + randomBelow(hi - lo + 1)
}

/** Fisher-Yates 洗牌（不修改原数组） */
export function shuffle<T>(items: T[]): T[] {
  const arr = items.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** 抽取 n 项 */
export function pick<T>(items: T[], n = 1, repeat = false): T[] {
  const list = (items || []).filter(x => String(x).trim() !== '')
  if (!list.length) return []
  if (repeat) {
    const out: T[] = []
    for (let i = 0; i < Math.max(1, n); i++) out.push(list[randomBelow(list.length)])
    return out
  }
  const count = Math.max(1, Math.min(n, list.length))
  return shuffle(list).slice(0, count)
}

/** 抛硬币 */
export function coin(): string {
  return randomBelow(2) === 0 ? '正面' : '反面'
}

/** 掷骰子（默认 6 面） */
export function dice(faces = 6): number {
  return randomInt(1, Math.max(2, faces))
}

/**
 * 转盘：给定候选项（可带权重）随机落点
 * @returns 中奖索引与落点角度（顺时针，度）
 */
export function spinWheel(items: string[], weights?: number[]): { index: number; angle: number; item: string } {
  const n = items.length
  if (!n) return { index: -1, angle: 0, item: '' }
  const w = weights && weights.length === n ? weights : items.map(() => 1)
  const total = w.reduce((s, x) => s + Math.max(0, x), 0)
  let r = total > 0 ? randomBelow(Math.floor(total * 1000)) / 1000 : 0
  let index = 0
  for (let i = 0; i < n; i++) {
    r -= Math.max(0, w[i])
    if (r <= 0) {
      index = i
      break
    }
  }
  const seg = 360 / n
  // 扇区中心角 + 随机抖动，最终旋转到顶部（12 点方向）
  const center = index * seg + seg / 2 + (randomBelow(100) / 100 - 0.5) * (seg * 0.7)
  const angle = (360 - center) % 360
  return { index, angle, item: items[index] }
}
