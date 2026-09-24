import { ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message-box/style/css'
import { useToast, type ToastType } from '@/composables/useToast'

/**
 * 统一确认弹框（替代原生 confirm）。
 * - 移动端在 mobile.css 中通过 .el-message-box / .ewt-confirm 适配为大块弹框、按钮 ≥44px
 * - 返回 Promise<boolean>，调用方需用 await；取消/关闭均返回 false
 */
export async function showConfirm(
  message: string,
  title = '操作确认'
): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      showClose: true,
      closeOnClickModal: false,
      closeOnPressEscape: true,
      customClass: 'ewt-confirm',
      autofocus: false
    })
    return true
  } catch {
    return false
  }
}

/**
 * 统一提示（替代原生 alert），复用项目自研 toast 单例，非阻塞、移动端友好。
 */
export function toastAlert(message: string, type: ToastType = 'info'): void {
  useToast()[type](message)
}
