/**
 * 博客前台「阅读器正文字号」偏好（模块级单例）。
 *
 * 设计取舍：
 * - 只作用于文章正文（覆盖 --t-font-size），不影响标题、元信息、筛选条等 UI 控件。
 *   文章单篇排版主题定的字号属于「作者偏好」，读者自己调的字号优先级更高——这是阅读器常识。
 * - **设备级偏好，不进云同步**：手机想大、桌面想小，跟 UI 美化（§1.8）同口径，
 *   因此用 localStorage 而不是 blog-prefs.json 信封。
 * - 容错：隐私模式 / 存储被禁用时读写都退化为内存态，不阻断阅读。
 */
import { ref } from 'vue'

export const BLOG_READER_FONT_KEY = 'blog-reader-font-size'
/** 下限 15px：再小就回到用户反馈的「看不清」；上限 22px：再大在 780px 阅读栏里一行太短 */
export const BLOG_READER_FONT_MIN = 15
export const BLOG_READER_FONT_MAX = 22
/** 默认 18px：比主题基础值 16px 大一档，长文阅读的舒适区 */
export const BLOG_READER_FONT_DEFAULT = 18

/** 把任意输入收敛到合法档位（非法/越界一律回落默认值或边界）。
 *  只认 number 与非空数字字符串：Number(null)/Number('')/Number([]) 都是 0，
 *  直接 Number() 会把「没存过」误判成「用户选了最小字号」。 */
export function clampReaderFontSize(value: unknown): number {
  let n: number
  if (typeof value === 'number') {
    n = value
  } else if (typeof value === 'string' && value.trim() !== '') {
    n = Number(value)
  } else {
    return BLOG_READER_FONT_DEFAULT
  }
  if (!Number.isFinite(n)) return BLOG_READER_FONT_DEFAULT
  return Math.min(BLOG_READER_FONT_MAX, Math.max(BLOG_READER_FONT_MIN, Math.round(n)))
}

export const readerFontSize = ref<number>(BLOG_READER_FONT_DEFAULT)
let didInit = false

/** 页面挂载时读一次本机偏好（仅首次，避免后续挂载用旧快照覆盖刚调整的值） */
export function initBlogReaderFont(): void {
  if (didInit) return
  didInit = true
  try {
    const raw = localStorage.getItem(BLOG_READER_FONT_KEY)
    if (raw !== null) readerFontSize.value = clampReaderFontSize(raw)
  } catch {
    // 隐私模式 / 存储被禁：保持默认值
  }
}

/** 按步长调整并落盘；返回调整后的值，便于调用方断言 */
export function changeReaderFontSize(delta: number): number {
  const next = clampReaderFontSize(readerFontSize.value + (Number.isFinite(delta) ? delta : 0))
  readerFontSize.value = next
  try {
    localStorage.setItem(BLOG_READER_FONT_KEY, String(next))
  } catch {
    // 写失败只影响「下次打开仍是这个字号」，当前会话照常生效
  }
  return next
}
