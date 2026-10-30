/**
 * AI 平台独立窗口打开策略
 * ------------------------------------------------------------------
 * 桌面端用「命名窗口」复用同一窗口（同名 window.open 会聚焦已有窗口并导航）；
 * 移动端没有独立小窗，直接当前标签跳转。
 *
 * 三个必须注意的点：
 * 1. 必须在**用户手势的同步调用栈**里执行 —— 调用前不得 await，否则会被弹窗拦截；
 *    反例见 BooksView.vue（先 await 再 open，部分浏览器会拦）。
 * 2. 命名窗口与 noopener 互斥：带 noopener 时浏览器每次都新建上下文、名字失效，
 *    二次点击无法复用。这里改为开窗后立即 `win.opener = null` 消除泄漏。
 * 3. 被拦时降级为动态 `<a target="_blank">`（仍在同一手势内，绝大多数浏览器放行），
 *    绝不用 `location.href` —— 那会把用户当前的工作台整页顶掉。
 */

/** 移动端断点：与 useViewMode 保持一致 */
const MOBILE_MQ = '(max-width: 768px)'
/** 窗口尺寸档位（设备相关，只存本机，不上云） */
const WIN_KEY = 'ewt-ai-window-size'

export type OpenMode = 'window' | 'tab' | 'mobile' | 'blocked'

export interface OpenResult {
  ok: boolean
  mode: OpenMode
}

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(MOBILE_MQ).matches
}

/** 读取窗口尺寸档位（非法值静默回落默认） */
export function readWindowPreset(): { w: number; h: number } {
  try {
    const raw = localStorage.getItem(WIN_KEY)
    if (raw) {
      const o = JSON.parse(raw) as { w?: unknown; h?: unknown }
      const w = Number(o.w)
      const h = Number(o.h)
      if (Number.isFinite(w) && Number.isFinite(h) && w >= 720 && h >= 520) return { w, h }
    }
  } catch {
    /* 隐私模式 / 配额异常：回落默认 */
  }
  return { w: 1180, h: 820 }
}

export function saveWindowPreset(w: number, h: number): void {
  try {
    localStorage.setItem(WIN_KEY, JSON.stringify({ w, h }))
  } catch {
    /* 存不了就算了，不影响打开 */
  }
}

/** 计算居中且不超出可用屏幕的窗口矩形（与 aiPlatformsCore.computePopupRect 同规则，这里避免循环依赖内联一份） */
function rect(availW: number, availH: number, wantW: number, wantH: number) {
  const maxW = Math.max(320, Math.floor(availW || wantW))
  const maxH = Math.max(320, Math.floor(availH || wantH))
  const width = Math.min(Math.max(wantW, 720), maxW)
  const height = Math.min(Math.max(wantH, 520), maxH)
  return {
    width,
    height,
    left: Math.max(0, Math.floor((maxW - width) / 2)),
    top: Math.max(0, Math.floor((maxH - height) / 2))
  }
}

/** 动态 <a> 打开新标签（不受弹窗拦截，但不复用窗口） */
function openViaAnchor(url: string): boolean {
  try {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
    return true
  } catch {
    return false
  }
}

/**
 * 打开平台网页版。
 * @param url  已经过 validatePlatformUrl 校验的 https 链接
 * @param name 稳定的窗口名（建议 `ai-<platformId>`），同名复用
 */
export function openAiPlatform(url: string, name: string): OpenResult {
  if (typeof window === 'undefined') return { ok: false, mode: 'blocked' }

  if (isMobileViewport()) {
    window.location.href = url
    return { ok: true, mode: 'mobile' }
  }

  const preset = readWindowPreset()
  const r = rect(window.screen?.availWidth ?? 1440, window.screen?.availHeight ?? 900, preset.w, preset.h)
  const features = `popup=yes,width=${r.width},height=${r.height},left=${r.left},top=${r.top},resizable=yes,scrollbars=yes`

  let win: Window | null = null
  try {
    win = window.open(url, name, features)
  } catch {
    win = null
  }

  if (win) {
    try {
      win.opener = null
    } catch {
      /* 跨源下置 null 是允许的；个别浏览器抛错也不影响已打开的窗口 */
    }
    try {
      win.focus()
    } catch {
      /* 聚焦需要用户手势，失败忽略 */
    }
    return { ok: true, mode: 'window' }
  }

  // 被拦截：同一手势内改用 <a> 新开标签
  if (openViaAnchor(url)) return { ok: true, mode: 'tab' }
  return { ok: false, mode: 'blocked' }
}

/** 强制新标签打开（Ctrl/⌘/Shift + 点击时用；不参与窗口复用） */
export function openAiPlatformInTab(url: string): boolean {
  return openViaAnchor(url)
}
