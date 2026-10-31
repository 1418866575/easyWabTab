/**
 * 找Tab 主题装饰管线（浏览器端；blogTypoCore 保持零 DOM 以便 node 测试）
 * ------------------------------------------------------------------
 * 把主题 decor（h1/h2/h3 包装、hr 替换、引用首部装饰）落到 markdown-it 渲染出的
 * HTML 字符串上，前台正文 / 编辑器预览 / 弹框迷你样张共用。
 * 暗色传 null（装饰是亮色画布设计），调用方自行降级为纯 --t-* token 渲染。
 */
import type { TypoTheme } from './blogTypoCore'

export function decorateTypoHtml(html: string, theme: TypoTheme | null | undefined): string {
  const decor = theme?.decor
  if (!decor || !html) return html
  const doc = new DOMParser().parseFromString(`<section>${html}</section>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement | null
  if (!root) return html

  const h1 = decor.h1
  if (h1) {
    let n = 0
    root.querySelectorAll('h1').forEach((el) => {
      n += 1
      el.innerHTML = h1(el.innerHTML, n)
    })
  }
  const h2 = decor.h2
  if (h2) {
    let n = 0
    root.querySelectorAll('h2').forEach((el) => {
      n += 1
      el.innerHTML = h2(el.innerHTML, n)
    })
  }
  const h3 = decor.h3
  if (h3) {
    root.querySelectorAll('h3').forEach((el) => {
      el.innerHTML = h3(el.innerHTML, 0)
    })
  }
  const hrHtml = decor.hr
  if (hrHtml) {
    root.querySelectorAll('hr').forEach((el) => {
      const tpl = doc.createElement('template')
      tpl.innerHTML = hrHtml
      el.replaceWith(tpl.content.firstElementChild ?? doc.createElement('section'))
    })
  }
  const quoteMark = decor.quoteMark
  if (quoteMark) {
    root.querySelectorAll('blockquote').forEach((el) => {
      const tpl = doc.createElement('template')
      tpl.innerHTML = quoteMark
      const first = tpl.content.firstElementChild
      if (first) el.insertBefore(first, el.firstChild)
    })
  }
  return root.innerHTML
}
