import { useToast } from './useToast'

/**
 * store 各类写操作返回结果的通用形状（`ok` + 可选的 `reason` / `message`）。
 * 销售记账里 LedgerWriteResult / CategoryOpResult 等都符合此形状。
 */
export interface BizResultLike {
  ok: boolean
  reason?: string
  message?: string
}

export interface BizReportOptions {
  /** 成功提示文案；留空则成功不提示 */
  successMsg?: string
  /** reason → 文案映射。未命中时依次回退 result.message、fallback */
  messages?: Record<string, string>
  /** 兜底失败文案 */
  fallback?: string
}

/**
 * 统一处理「store 返回结果 + 提示」：
 * - 成功：提示 successMsg；
 * - 失败：优先用 messages[reason]（可带业务上下文，如「同名分类已存在」），
 *         其次用 result.message，最后用 fallback。
 *
 * 抽取自 BusinessCategoryManager 的 handleResult —— 它是模块内最早形成、
 * 也是唯一做到「成功/失败都有反馈」的写法，现提到公共层供各弹框复用，
 * 避免每个弹框各写一套 toast 分支（易出现漏提示或重复提示）。
 *
 * @returns 操作是否成功，便于调用方决定是否关闭弹框 / 刷新列表
 */
export function reportBizResult(r: BizResultLike, opts: BizReportOptions = {}): boolean {
  if (r.ok) {
    if (opts.successMsg) useToast().success(opts.successMsg)
    return true
  }
  const mapped = r.reason ? opts.messages?.[r.reason] : undefined
  useToast().error(mapped ?? r.message ?? opts.fallback ?? '操作失败')
  return false
}
