import { shallowRef, readonly } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: number
  type: ToastType
  message: string
  duration: number
}

/**
 * 各类型默认停留时长（ms）。
 * - error：3000（需留出阅读与复制的时间；鼠标移入可暂停，移出后重新计时）
 * - 其余沿用 2500
 * - 显式传 duration <= 0 表示「不自动关闭」，只能点关闭按钮
 */
export const TOAST_DEFAULT_DURATION: Record<ToastType, number> = {
  success: 2500,
  error: 3000,
  warning: 2500,
  info: 2500
}

// Singleton state - shared across all components
const toasts = shallowRef<ToastItem[]>([])
let nextId = 1

/** 每条 toast 的倒计时状态：handle 为 0 表示已暂停或常驻（未挂定时器） */
interface ToastTimer {
  handle: number
  startedAt: number
  remaining: number
}
const timers = new Map<number, ToastTimer>()

function clearTimer(id: number): void {
  const t = timers.get(id)
  if (!t) return
  if (t.handle) window.clearTimeout(t.handle)
  timers.delete(id)
}

/** 移除条目并清掉它的定时器（模块级：armTimer 的到期回调也要能用） */
function removeToast(id: number): void {
  clearTimer(id)
  const next = toasts.value.filter((t) => t.id !== id)
  if (next.length !== toasts.value.length) toasts.value = next
}

/** 起/重启倒计时；ms <= 0 时只登记「常驻」，不挂定时器 */
function armTimer(id: number, ms: number): void {
  const remaining = Math.max(0, ms)
  if (remaining === 0) {
    timers.set(id, { handle: 0, startedAt: 0, remaining: 0 })
    return
  }
  const startedAt = Date.now()
  const handle = window.setTimeout(() => {
    timers.delete(id)
    removeToast(id)
  }, remaining)
  timers.set(id, { handle, startedAt, remaining })
}

export function useToast() {
  const showToast = (type: ToastType, message: string, duration?: number) => {
    const id = nextId++
    const ms = duration ?? TOAST_DEFAULT_DURATION[type]
    toasts.value = [...toasts.value, { id, type, message, duration: ms }]
    armTimer(id, ms)
    return id
  }

  /** 暂停倒计时（鼠标移入）：清掉定时器并记下剩余时长，条目保留不消失 */
  const pauseToast = (id: number) => {
    const t = timers.get(id)
    if (!t || !t.handle) return
    window.clearTimeout(t.handle)
    const elapsed = Date.now() - t.startedAt
    timers.set(id, { handle: 0, startedAt: 0, remaining: Math.max(0, t.remaining - elapsed) })
  }

  /** 恢复倒计时（鼠标移出）：按剩余时长重新计时，而不是从头计时 */
  const resumeToast = (id: number) => {
    const t = timers.get(id)
    if (!t || t.handle || t.remaining <= 0) return
    armTimer(id, t.remaining)
  }

  const success = (message: string, duration?: number) => showToast('success', message, duration)
  const error = (message: string, duration?: number) => showToast('error', message, duration)
  const warning = (message: string, duration?: number) => showToast('warning', message, duration)
  const info = (message: string, duration?: number) => showToast('info', message, duration)

  return {
    toasts: readonly(toasts),
    showToast,
    removeToast,
    pauseToast,
    resumeToast,
    success,
    error,
    warning,
    info
  }
}
