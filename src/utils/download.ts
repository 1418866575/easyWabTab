/**
 * 下载与剪贴板小工具（智能工作台导入导出 / 一键复制复用）
 * 两处能力项目内已有零散实现（HelpModal / WorkbenchPassword / toolbox useToolActions），
 * 这里统一为带降级与结果反馈的版本，避免每个页面各写一份。
 */
import { useToast } from '@/composables/useToast'

/** 触发浏览器下载：给定 Blob（zip 等二进制导出用） */
export function downloadBlob(filename: string, blob: Blob): boolean {
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return true
  } catch (e) {
    console.error('[download] 下载失败', e)
    useToast().error('下载失败，请稍后重试')
    return false
  }
}

/** 触发浏览器下载：文本 → Blob → a[download] 点击 */
export function downloadText(filename: string, text: string, mime = 'application/json;charset=utf-8'): boolean {
  try {
    return downloadBlob(filename, new Blob([text], { type: mime }))
  } catch (e) {
    console.error('[download] 下载失败', e)
    useToast().error('下载失败，请稍后重试')
    return false
  }
}

/** 文本导入的默认体积上限：提示词可能内嵌 dataURL 参考图，10MB 足够且不会读爆内存 */
export const PICK_TEXT_MAX_BYTES = 10 * 1024 * 1024

/**
 * 读取用户选择的文件为文本；未选择文件返回 null（用户取消不算错误）。
 * @param accept   input 的 accept 值
 * @param maxBytes 体积上限，超出直接拒绝并提示（避免 readAsText 把大文件整读进内存）
 */
export function pickFileText(accept: string, maxBytes = PICK_TEXT_MAX_BYTES): Promise<{ name: string; text: string } | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    // 取消选择时 change 不触发：用 cancel 事件兜底（现代浏览器支持），避免 Promise 悬挂
    input.addEventListener('cancel', () => resolve(null))
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      if (file.size > maxBytes) {
        const mb = (n: number) => (n / 1024 / 1024).toFixed(1)
        useToast().error(`文件过大（${mb(file.size)}MB），上限 ${mb(maxBytes)}MB`)
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve({ name: file.name, text: String(reader.result ?? '') })
      reader.onerror = () => {
        useToast().error('文件读取失败')
        resolve(null)
      }
      reader.readAsText(file)
    })
    input.click()
  })
}

/**
 * 复制文本到剪贴板。
 * 非安全上下文（http 旧浏览器）下 navigator.clipboard 不可用 → 降级为「选中 + 提示手动复制」，
 * 而不是静默失败让用户以为已复制。
 */
export async function copyText(text: string, successMsg = '已复制到剪贴板'): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      useToast().success(successMsg)
      return true
    }
    // 降级：textarea + execCommand（部分旧内核仍可用）
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) {
      useToast().success(successMsg)
      return true
    }
    useToast().warning('当前环境无法自动复制，请手动选中后复制')
    return false
  } catch (e) {
    console.error('[clipboard] 复制失败', e)
    useToast().warning('复制失败，请手动选中后复制')
    return false
  }
}

/** `YYYYMMDD` 日期串，用于导出文件名 */
export function dateStamp(d = new Date()): string {
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}
