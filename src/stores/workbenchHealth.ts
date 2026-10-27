import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import type { HealthData, HealthModule, HealthPlan, HealthPlans, HealthRecord, HealthWeeklyPlanItem, HealthWeeklyPlans } from '@/types'
import { shiftDateKey } from '@/composables/healthCore'
import {
  copyWeeklyPlanWeek,
  normalizeDietRecord,
  normalizeExerciseRecord,
  normalizeHealthData,
  normalizeSleepRecord,
  normalizeWeightRecord
} from '@/composables/healthCore'
import { idbGet, idbPut } from '../composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'

// 各模块记录 id 前缀
const RECORD_PREFIX: Record<HealthModule, string> = {
  exercise: 'ex_',
  diet: 'dt_',
  sleep: 'sl_',
  weight: 'wt_'
}

// 各模块记录 normalize 函数映射（addRecord 按 module 分发）。
// sleep 缺省 durationHours 时 normalizeSleepRecord 内部按 sleepTime/wakeTime 补算（healthCore fallback 分支）。
const NORMALIZERS: Record<HealthModule, (raw: any) => HealthRecord> = {
  exercise: normalizeExerciseRecord,
  diet: normalizeDietRecord,
  sleep: normalizeSleepRecord,
  weight: normalizeWeightRecord
}

// 工作台健康管理 store（数据存 IndexedDB store 'health'，key 'items'）
export const useWorkbenchHealthStore = defineStore('workbenchHealth', () => {
  const height = ref<number | undefined>(undefined)
  const plans = ref<HealthPlans>({})
  const records = ref<HealthData['records']>({ exercise: [], diet: [], sleep: [], weight: [] })
  // 周计划（运动/饮食）：键 = 周一日期键；整体 LWW 同步（plansUpdatedAt）
  const weeklyPlans = ref<HealthWeeklyPlans>({})

  async function loadHealth(): Promise<void> {
    try {
      // IDB 存量旧结构/脏数据经 normalizeHealthData 幂等归一
      const data = normalizeHealthData(await idbGet<HealthData>('health'))
      height.value = data.height
      plans.value = data.plans
      weeklyPlans.value = data.weeklyPlans ?? {}
      records.value = data.records
    } catch (e) {
      // 加载失败降级为空态（保持默认值），不向上抛
      console.error('[workbenchHealth] loadHealth', e)
    }
  }

  async function saveHealth(): Promise<void> {
    try {
      // ref 的 .value 是 reactive Proxy，toRaw 只解开最外层一层——整包 toRaw({...}) 解不掉
      // 内层 proxy（实测 structuredClone 抛 DataCloneError），必须对每个字段逐个 toRaw，
      // 组装成纯对象后再写入 IDB
      await idbPut('health', {
        height: height.value,
        plans: toRaw(plans.value),
        // weeklyPlans 的嵌套数组/条目在「读取 → 展开 → 回写」链路里会残留 reactive Proxy
        // （toRaw 只解最外层，内层 Proxy 会让 structuredClone 抛 DataCloneError → 保存静默失败）。
        // 条目全是原始值，直接 JSON 深拷贝成纯对象再落库。
        weeklyPlans: JSON.parse(JSON.stringify(weeklyPlans.value ?? {})),
        records: toRaw(records.value)
      })
      markDirty()
    } catch (e) {
      console.error('[workbenchHealth] saveHealth', e)
    }
  }

  /**
   * 覆盖某周的运动/饮食周计划条目（整组替换，items 由面板侧组装）。
   * 每次写入推进 plansUpdatedAt：同步时 weeklyPlans 整体取较新一侧（LWW），
   * 避免条目级并集把「删掉的计划项」复活。
   */
  async function setWeeklyPlanItems(
    weekKey: string,
    kind: 'exercise' | 'diet',
    items: HealthWeeklyPlanItem[]
  ): Promise<void> {
    const prev = weeklyPlans.value[weekKey] ?? { exercise: [], diet: [], updatedAt: '' }
    weeklyPlans.value = {
      ...weeklyPlans.value,
      [weekKey]: { ...prev, [kind]: items, updatedAt: new Date().toISOString() }
    }
    await saveHealth()
  }

  /**
   * 确保某周计划已初始化（自动复制上周）：
   * - 该周**从未编辑过**（weeklyPlans 里无记录）且上周有内容 → 复制上周整周计划（done 重置未完成）
   * - 该周已有记录（哪怕被用户清空）→ 不再复制（幂等；「清空」也是一次明确编辑）
   * - 上周无内容 → 不动作
   * 在面板切换/进入某周时调用（watch planWeekStart），与记账「每月自动复制」同一模式。
   */
  async function ensureWeeklyPlanCopied(weekStart: string): Promise<void> {
    if (weeklyPlans.value[weekStart]) return
    const prev = weeklyPlans.value[shiftDateKey(weekStart, -7)]
    if (!prev || (prev.exercise.length === 0 && prev.diet.length === 0)) return
    const copied = copyWeeklyPlanWeek(prev, () => `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
    weeklyPlans.value = {
      ...JSON.parse(JSON.stringify(weeklyPlans.value)),
      [weekStart]: { ...copied, updatedAt: new Date().toISOString() }
    }
    await saveHealth()
  }

  async function setHeight(cm: number): Promise<void> {
    if (!(Number.isInteger(cm) && cm >= 100 && cm <= 250)) {
      console.warn('[workbenchHealth] setHeight 非法值已忽略（需 100-250 整数）', cm)
      return
    }
    height.value = cm
    await saveHealth()
  }

  async function setPlan(
    module: 'exercise' | 'diet' | 'sleep',
    plan: Omit<HealthPlan, 'module' | 'updatedAt'> | null
  ): Promise<void> {
    if (plan === null) {
      // delete 在 reactive 对象上响应式生效且不残留 undefined 键（避免 {...plans, [k]: undefined} 陷阱）
      delete plans.value[module]
    } else {
      plans.value[module] = { ...plan, module, updatedAt: new Date().toISOString() }
    }
    await saveHealth()
  }

  async function addRecord(module: HealthModule, input: Record<string, unknown>): Promise<void> {
    const now = new Date().toISOString()
    const rec = NORMALIZERS[module]({
      module,
      ...input,
      id: typeof input.id === 'string' && input.id ? input.id : `${RECORD_PREFIX[module]}${Date.now()}`,
      createdAt: now,
      updatedAt: now
    })
    // 联合数组上直接 push 会把入参退化为 never（TS 对联合方法调用取交集），
    // 上抛为 HealthRecord[] 是合法宽化断言（各模块数组元素均为 HealthRecord 成员）
    ;(records.value[module] as HealthRecord[]).push(rec)
    await saveHealth()
  }

  async function updateRecord(module: HealthModule, id: string, patch: Record<string, unknown>): Promise<void> {
    const index = records.value[module].findIndex(r => r.id === id)
    if (index === -1) {
      console.warn('[workbenchHealth] updateRecord 未找到记录', { module, id })
      return
    }
    const old = records.value[module][index]
    // id/module 锁定不可改；patch 覆盖其余字段。Object.assign 保持联合数组元素类型可赋回
    records.value[module][index] = Object.assign({}, old, patch, {
      id: old.id,
      module: old.module,
      updatedAt: new Date().toISOString()
    })
    await saveHealth()
  }

  async function deleteRecord(module: HealthModule, id: string): Promise<void> {
    // 在 toRaw 的原始数组上 filter：reactive 代理上直接 filter 会得到 Proxy 元素（L1 变体）。
    // 展开也必须取 toRaw 的原始对象——直接展开 records.value 会让其余模块数组以 reactive
    // Proxy 残留（实测 structuredClone 抛 DataCloneError），saveHealth 的 toRaw 兜不住内层。
    const raw = toRaw(records.value[module]) as HealthRecord[]
    records.value = {
      ...toRaw(records.value),
      [module]: raw.filter(r => r.id !== id)
    } as HealthData['records']
    await saveHealth()
  }

  return {
    height,
    plans,
    weeklyPlans,
    records,
    loadHealth,
    saveHealth,
    setHeight,
    setPlan,
    setWeeklyPlanItems,
    ensureWeeklyPlanCopied,
    addRecord,
    updateRecord,
    deleteRecord
  }
})
