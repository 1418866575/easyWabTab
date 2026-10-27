import MarkdownIt from 'markdown-it'

let md: MarkdownIt | null = null

// 安全白名单：仅放行 base64 编码的位图图片 data URL（富媒体图片内联进 Markdown 正文走云同步）。
// 禁止 svg+xml（SVG 可携带 <script> 构成 XSS 向量），其余 data: 协议仍交给默认校验拦截。
function isSafeImageDataUrl(url: string): boolean {
  return /^data:image\/(?!svg\+xml)([a-zA-Z0-9.+-]+);base64,/.test(url)
}

function getMd(): MarkdownIt {
  if (md) return md
  md = new MarkdownIt({ html: false, linkify: true, breaks: true })
  // 内置 ==高亮== 行内规则（渲染为 <mark>）：项目不引 markdown-it-mark 依赖，
  // 二十行搞定，且与博客/日记/便签共用同一套渲染。
  md.inline.ruler.before('emphasis', 'mark', (state, silent) => {
    const start = state.pos
    if (state.src.charCodeAt(start) !== 0x3d || state.src.charCodeAt(start + 1) !== 0x3d) return false
    const close = state.src.indexOf('==', start + 2)
    if (close < 0) return false
    const content = state.src.slice(start + 2, close)
    if (!content.trim() || content.includes('\n')) return false
    if (!silent) {
      const open = state.push('mark_open', 'mark', 1)
      open.markup = '=='
      const text = state.push('text', '', 0)
      text.content = content
      const shut = state.push('mark_close', 'mark', -1)
      shut.markup = '=='
    }
    state.pos = close + 2
    return true
  })
  // 任务列表：`- [ ] 待办` / `- [x] 已完成` → ☐ / ☑（带色 span）。
  // 不引 markdown-it-task-lists 依赖：公众号不认 <input type="checkbox">，
  // 用文字符号反而跨平台最稳（微信、博客前台、日记都一致）。
  md.core.ruler.after('inline', 'task_list_symbol', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children?.length) continue
      const first = token.children[0]
      if (!first || first.type !== 'text') continue
      const m = /^\[( |x|X)\][ \u00a0]?/.exec(first.content)
      if (!m) continue
      const checked = m[1].toLowerCase() === 'x'
      first.content = first.content.slice(m[0].length)
      const symbol = checked ? '☑' : '☐'
      const color = checked ? '#10b981' : '#94a3b8'
      const sym = new state.Token('html_inline', '', 0)
      sym.content = checked
        ? `<span style="color:${color};font-weight:600;">${symbol}</span>&nbsp;<span style="color:#94a3b8;">`
        : `<span style="color:${color};font-weight:600;">${symbol}</span>&nbsp;`
      token.children.unshift(sym)
      if (checked) {
        const closeTag = new state.Token('html_inline', '', 0)
        closeTag.content = '</span>'
        token.children.push(closeTag)
      }
    }
  })

  const defaultValidateLink = md.validateLink.bind(md)
  // 富媒体前提：base64 图片 data URL 默认被 markdown-it 拦截，此处放行白名单。
  md.validateLink = (url: string): boolean => isSafeImageDataUrl(url) || defaultValidateLink(url)
  const defaultOpen =
    md.renderer.rules.link_open ??
    ((tokens: any[], idx: number, options: any, _env: any, self: any) =>
      self.renderToken(tokens, idx, options))
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const hrefIndex = tokens[idx].attrIndex('href')
    if (hrefIndex >= 0) {
      tokens[idx].attrSet('href', md!.normalizeLink(tokens[idx].attrs![hrefIndex][1]))
      if (!md!.validateLink(tokens[idx].attrs![hrefIndex][1])) return ''
    }
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener nofollow')
    return defaultOpen(tokens, idx, options, env, self)
  }
  return md
}

export function renderMarkdown(content: string): string {
  if (!content) return ''
  return getMd().render(String(content))
}
