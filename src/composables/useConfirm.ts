import { shallowRef, readonly } from 'vue'

/**
 * 统一确认弹框单例（替代 ElMessageBox，与自研 Toast 同源）。
 *
 * 背景：此前 `showConfirm` 走 Element Plus 的 ElMessageBox，而 `toastAlert` 走自研 Toast，
 * 形成"两套反馈 UI"双轨道（外观/圆角/间距/暗色/accent 都不一致）。
 * 现改为与 Toast 相同的单例 + 宿主组件模式，底层统一走 `BaseDialog`。
 *
 * 契约（保持不变，60+ 调用点零改动）：
 *   showConfirm(message, title?) => Promise<boolean>   取消/关闭均 resolve(false)
 *
 * 需在 App.vue 挂载一次宿主：`<ConfirmHost />`。
 */
export interface ConfirmRequest {
  message: string
  title: string
  resolve: (value: boolean) => void
}

// 模块级单例状态，全局共享
const current = shallowRef<ConfirmRequest | null>(null)

export function useConfirm() {
  /**
   * 弹出一个确认框，返回用户选择。
   * 同一时刻只允许一个确认框：若已有未决确认，新的请求会把旧的按「取消」结算，
   * 避免旧 Promise 永远悬挂（调用方 await 卡死）。
   */
  function showConfirm(message: string, title = '操作确认'): Promise<boolean> {
    current.value?.resolve(false)
    return new Promise<boolean>((resolve) => {
      current.value = { message, title, resolve }
    })
  }

  /** 结算当前确认框并关闭；无待处理确认时为空操作。 */
  function settle(result: boolean): void {
    const req = current.value
    if (!req) return
    current.value = null
    req.resolve(result)
  }

  return {
    current: readonly(current),
    showConfirm,
    settle
  }
}
