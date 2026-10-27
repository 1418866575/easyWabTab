/**
 * 智能工作台 · 云同步守卫（本地退化拦截）的共享状态
 * ------------------------------------------------------------------
 * 为什么单独一个模块：store 与 useCloudSync 需要共享这两样东西，但
 * `stores/smart.ts` 已经从 useCloudSync 里 import 了 markDirty，若 useCloudSync 再
 * 反向静态引用 store 就会形成循环依赖。本模块**零依赖**，两边都只引用它。
 *
 * 两件事：
 *   1. 显式删除标志：用户主动删空技能库是他认可的状态，云端退化拦截不该拦他；
 *   2. 计数基线：记录上次成功推送时各库「活记录」条数，下次推送时据此判断本机是否被清空。
 */

/** 本地退化基线（localStorage）：{ skills, prompts, workflows, at } */
const BASELINE_KEY = 'ewt-smart-count-baseline'

export interface SmartCountBaseline {
  skills: number
  prompts: number
  workflows: number
  /** 写入时间（ms） */
  at: number
}

let explicitDelete = false

/** 本次会话内发生过用户显式删除（deleteSkill / deletePrompt / deleteWorkflow） */
export function markSmartExplicitDelete(): void {
  explicitDelete = true
}

/** 供守卫判断：用户显式删除过 → 不再用历史基线拦他 */
export function hasSmartExplicitDelete(): boolean {
  return explicitDelete
}

export function readSmartCountBaseline(): SmartCountBaseline | null {
  try {
    const raw = localStorage.getItem(BASELINE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<SmartCountBaseline>
    const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
    return { skills: n(o.skills), prompts: n(o.prompts), workflows: n(o.workflows), at: n(o.at) }
  } catch {
    return null
  }
}

export function writeSmartCountBaseline(counts: Omit<SmartCountBaseline, 'at'>): void {
  try {
    localStorage.setItem(BASELINE_KEY, JSON.stringify({ ...counts, at: Date.now() }))
  } catch {
    /* localStorage 不可用（隐私模式/配额）时静默跳过，只是失去退化保护 */
  }
}
