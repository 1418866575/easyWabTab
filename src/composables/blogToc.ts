/**
 * 博客前台文章大纲（TOC）纯逻辑
 *
 * 单一职责，零依赖纯函数（可 node --experimental-strip-types 直测）：
 * buildBlogToc(html) 从 renderMarkdown + decorateTypoHtml 产出的 HTML 中解析标题，
 * 在**同一次遍历**里给标题注入 id 并收集大纲项 —— 保证锚点与大纲严格一一对应。
 *
 * 为什么解析 HTML 而非 markdown 源码：
 * - markdown 里有 setext 标题（Title\n====）、标题内嵌行内标记等，二次计数易错位；
 * - 从最终 HTML 取标题，渲染出来什么就是什么，id 与可见标题天然对齐。
 * - html:false 配置下正文里的原始 `<h1>` 文本被转义为 `&lt;h1&gt;`，
 *   因此正则匹配到的 `<h1>` 一定是真实标题标签，不会误伤代码块文本。
 */
export interface BlogTocItem {
  id: string
  text: string
  level: number
}

export interface BlogTocResult {
  html: string
  toc: BlogTocItem[]
}

/** 去掉标题文本里的 HTML 标签与实体，得到大纲可读文本 */
function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '') // 去标签（强调 span、装饰 em 等）
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildBlogToc(html: string): BlogTocResult {
  if (!html) return { html, toc: [] }
  const toc: BlogTocItem[] = []
  // 匹配 <h1..6 ...>内容</h1..6>，闭合标签用反向引用保证层级一致
  const out = html.replace(/<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi, (full, level: string, attrs: string, inner: string) => {
    const text = stripHtml(inner)
    if (!text) return full // 空标题不进大纲
    const id = `bf-toc-${toc.length}`
    toc.push({ id, text, level: Number(level) })
    // 已带 id 则保留（幂等），否则注入序号 id
    if (/\bid\s*=/.test(attrs)) return full
    return `<h${level} id="${id}"${attrs}>${inner}</h${level}>`
  })
  return { html: out, toc }
}
