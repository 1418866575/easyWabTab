/**
 * HTML 净化（白名单清洗，零依赖）
 * 用于 Markdown 预览等需要渲染 HTML 的场景：严禁脚本执行与外链自动加载。
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'del', 's', 'blockquote', 'code', 'pre',
  'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'span', 'div', 'input', 'sup', 'sub'
])

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  input: new Set(['type', 'checked', 'disabled']),
  code: new Set(['class']),
  pre: new Set(['class']),
  span: new Set(['class']),
  div: new Set(['class']),
  th: new Set(['align', 'colspan', 'rowspan']),
  td: new Set(['align', 'colspan', 'rowspan'])
}

/** 判断是否安全 URL（禁止 javascript: / data:text/html 等） */
export function isSafeUrl(url: string): boolean {
  const s = (url || '').trim().toLowerCase()
  if (!s) return true
  if (s.startsWith('#') || s.startsWith('/') || s.startsWith('./') || s.startsWith('../')) return true
  return /^(https?:|mailto:|tel:)/.test(s)
}

/**
 * 清洗 HTML：移除不在白名单的标签、危险属性与事件处理器。
 * 说明：这是"尽力而为"的清洗，工具只渲染用户本地输入的 Markdown，不接收外部内容。
 */
export function sanitizeHtml(html: string): string {
  let out = html || ''
  // 1. 移除整块的危险内容
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta|form|svg|math)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta|form|svg|math)[^>]*>/gi, '')
  // 2. 移除注释与条件注释
  out = out.replace(/<!--[\s\S]*?-->/g, '')
  // 3. 移除 on* 事件属性与 javascript: 协议
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  out = out.replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=""')
  // 4. 白名单标签与属性
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^>]*)?)\/?>/g, (match, tagRaw: string, attrsRaw: string) => {
    const tag = tagRaw.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return ''
    const closing = match.startsWith('</')
    if (closing) return `</${tag}>`
    const allow = ALLOWED_ATTRS[tag]
    const attrs = (attrsRaw || '')
      .match(/[a-zA-Z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g) || []
    const kept = attrs.filter(a => {
      const name = (a.split('=')[0] || '').trim().toLowerCase()
      if (!allow || !allow.has(name)) return false
      const value = (a.split('=').slice(1).join('=') || '').trim().replace(/^["']|["']$/g, '')
      if (name === 'href' || name === 'src') return isSafeUrl(value)
      return true
    })
    // a 标签强制 rel=noopener（不允许跳转到第三方是产品约束，此处仅防安全漏洞）
    if (tag === 'a' && kept.some(a => a.startsWith('href'))) kept.push('rel="noopener noreferrer"')
    return `<${tag}${kept.length ? ' ' + kept.join(' ') : ''}>`
  })
  return out
}

/** 转义为纯文本（用于"查看 HTML 源码"展示） */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
