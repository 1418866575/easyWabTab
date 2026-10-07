/**
 * 移动端弹框背景滚动锁定
 *
 * 背景：弹框打开后背景页面仍可滚动，滑到尽头会带动背景一起动（滚动穿透 / 橡皮筋），
 * 移动端手感很差。Element Plus 自带 lock-scroll，但项目内大量**手写弹框**
 * （.dialog-overlay / .manager-overlay / .modal-overlay …）没有这层保护。
 *
 * 方案：全局兜底 —— 检测到任意遮罩层存在即锁定 body 滚动，遮罩全部消失后恢复。
 * 用 MutationObserver + rAF 节流，避免频繁 DOM 变动时重复查询。
 */

const OVERLAY_SELECTOR = [
  '.el-overlay',
  '.dialog-overlay',
  '.manager-overlay',
  '.modal-overlay',
  '.pwd-modal-overlay',
  '.note-overlay',
  '.reminder-overlay',
  '.sp-overlay',
  '.biz-dialog-overlay',
  '.bizcat-overlay',
  // 统一弹框基类 common/BaseDialog.vue 的遮罩（迁移后的组件走这一类名）
  '.bd-overlay'
].join(',')

let scheduled = false

function sync() {
  const hasOverlay = !!document.querySelector(OVERLAY_SELECTOR)
  const next = hasOverlay ? 'hidden' : ''
  if (document.body.style.overflow !== next) {
    document.body.style.overflow = next
  }
}

function schedule() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    sync()
  })
}

/** 在应用入口调用一次即可 */
export function initScrollLock() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return
  const mo = new MutationObserver(schedule)
  mo.observe(document.body, { childList: true, subtree: true })
  sync()
}
