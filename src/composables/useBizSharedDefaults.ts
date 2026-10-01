/**
 * 业务弹框「公用信息」记忆（纯 TS，无框架依赖，便于纳入 npm run test:business）
 * ------------------------------------------------------------------
 * 进货弹框的「订货电话 / 订货地址 / 业务员备注」属于低频变动的稳定信息
 * （供应商电话、收货地址基本固定），每次「新增进货」都重打一遍是纯重复劳动。
 *
 * 设计取舍：
 * - 按**账本维度**记忆（不同账本往往是不同门店/供应商，不应互相污染）。
 * - **不记忆标题**：标题通常随每笔进货变化（日期 / 供应商 / 批次），自动带入反而容易误存。
 * - 只在**新增保存成功后**写入记忆，取消或编辑不写入，避免误操作污染默认值。
 * - 这是界面便利层，不是业务数据，因此不进业务账本、不进云同步信封，直接 localStorage。
 *   读写全部 try/catch 兜底：隐私模式 / 存储禁用时静默降级为「不记忆」，绝不影响主流程。
 */

/** 被记忆的公用信息字段（与进货弹框的 formOrderPhone / formOrderAddress / formSalesmanNote 一一对应） */
export interface BizSharedDefaults {
  orderPhone: string
  orderAddress: string
  salesmanNote: string
}

const KEY_PREFIX = 'ewt:biz-shared-defaults:'

/** 空记忆：读不到 / 解析失败时的兜底值 */
export function emptyBizSharedDefaults(): BizSharedDefaults {
  return { orderPhone: '', orderAddress: '', salesmanNote: '' }
}

export function bizSharedDefaultsKeyOf(ledgerId: string): string {
  return `${KEY_PREFIX}${ledgerId || 'default'}`
}

/** 只保留字符串字段，防止异常 JSON（数组 / 数字 / null / 嵌套对象）污染表单 */
export function normalizeBizSharedDefaults(raw: unknown): BizSharedDefaults {
  const base = emptyBizSharedDefaults()
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Record<string, unknown>
  for (const k of Object.keys(base) as (keyof BizSharedDefaults)[]) {
    if (typeof obj[k] === 'string') base[k] = obj[k] as string
  }
  return base
}

/** 读取某账本记忆的公用信息（无记录 / 存储不可用时返回空值，不抛错） */
export function loadBizSharedDefaults(ledgerId: string): BizSharedDefaults {
  try {
    const raw = localStorage.getItem(bizSharedDefaultsKeyOf(ledgerId))
    if (!raw) return emptyBizSharedDefaults()
    return normalizeBizSharedDefaults(JSON.parse(raw))
  } catch {
    return emptyBizSharedDefaults()
  }
}

/** 写入某账本的公用信息记忆（失败静默忽略） */
export function saveBizSharedDefaults(ledgerId: string, value: BizSharedDefaults): void {
  try {
    localStorage.setItem(bizSharedDefaultsKeyOf(ledgerId), JSON.stringify(normalizeBizSharedDefaults(value)))
  } catch {
    /* 存储不可用时静默降级：记忆功能失效，但进货主流程不受影响 */
  }
}

/**
 * 进货弹框公用信息记忆的门面：绑定当前账本，弹框打开时 load()、新增成功后 remember()。
 * 刻意不使用响应式：值只在「打开弹框」这一刻读取一次，无需订阅。
 */
export function useBizSharedDefaults(getLedgerId: () => string) {
  function load(): BizSharedDefaults {
    return loadBizSharedDefaults(getLedgerId())
  }

  function remember(value: BizSharedDefaults): void {
    saveBizSharedDefaults(getLedgerId(), value)
  }

  return { load, remember }
}
