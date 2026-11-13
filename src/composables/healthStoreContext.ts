// 健康管理 store 注入上下文：让同一套健康子组件（Exercise/Diet/Sleep/Weight）
// 既能跑在默认 store（useWorkbenchHealthStore），也能由容器注入其它同形状的 store，
// 从而实现「UI 零复制复用、数据严格隔离」。
//
// 用法：
//   容器侧按需 provideHealthStore(...)，子面板不感知具体 store 实现
//   子组件侧：const store = injectHealthStore() ?? useWorkbenchHealthStore()
// 成人端没有 provide 时 inject 返回 undefined → 回退原 store，行为与改造前完全一致。

import { inject, provide, type InjectionKey } from 'vue'
import type { useWorkbenchHealthStore } from '@/stores/workbenchHealth'

/** 子组件实际消费的 store 成员集合（四个健康子组件只用这 10 个成员，见各文件 store.* 调用）。 */
export type HealthStoreLike = Pick<
  ReturnType<typeof useWorkbenchHealthStore>,
  | 'height'
  | 'plans'
  | 'records'
  | 'loadHealth'
  | 'saveHealth'
  | 'setHeight'
  | 'setPlan'
  | 'addRecord'
  | 'updateRecord'
  | 'deleteRecord'
> &
  // 周计划（运动/饮食）为可选能力：成人 store 已实现，学生端 store 暂未实现——
  // 面板侧用 hasWeeklyPlan 守卫，学生端隐藏周计划看板（后续学生端需要时再补齐）
  // 方案模板（跟练/食谱）同为成人端可选能力：学生端不提供时面板隐藏方案卡
  Partial<
    Pick<
      ReturnType<typeof useWorkbenchHealthStore>,
      | 'weeklyPlans'
      | 'setWeeklyPlanItems'
      | 'ensureWeeklyPlanCopied'
      | 'planPrefs'
      | 'planProgress'
      | 'setActivePlan'
      | 'togglePlanProgress'
      | 'resetPlanProgress'
    >
  >

const HEALTH_STORE_KEY = Symbol('healthStore') as InjectionKey<HealthStoreLike>

/** 向子树提供健康 store 实例（学生端传入学生 store 即可读写学生自己的数据）。 */
export function provideHealthStore(store: HealthStoreLike): void {
  provide(HEALTH_STORE_KEY, store)
}

/** 取子树注入的健康 store；未注入时返回 undefined（调用方应回退到成人 store）。 */
export function injectHealthStore(): HealthStoreLike | undefined {
  return inject(HEALTH_STORE_KEY, undefined)
}
