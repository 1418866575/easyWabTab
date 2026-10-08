import { useConfirm } from '@/composables/useConfirm'
import { useToast, type ToastType } from '@/composables/useToast'

/**
 * 统一确认弹框（替代原生 confirm）。
 * - 底层已由 ElMessageBox 迁移为自研单例 + `BaseDialog`（与 Toast 同源，消除双轨道）；
 *   需在 App.vue 挂载一次 `<ConfirmHost />`。
 * - 视觉与其它弹框一致（统一圆角/间距/主色），暗色与 accent 主题自动跟随。
 * - 行为：点遮罩不关闭（防误触），ESC 关闭等同「取消」；移动端按钮 ≥44px 由 BaseDialog 适配。
 * - 返回 Promise<boolean>，调用方需用 await；取消/关闭均返回 false。
 */
export function showConfirm(message: string, title = '操作确认'): Promise<boolean> {
  return useConfirm().showConfirm(message, title)
}

/**
 * 统一提示（替代原生 alert），复用项目自研 toast 单例，非阻塞、移动端友好。
 */
export function toastAlert(message: string, type: ToastType = 'info'): void {
  useToast()[type](message)
}
