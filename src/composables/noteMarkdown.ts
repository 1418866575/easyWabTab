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
