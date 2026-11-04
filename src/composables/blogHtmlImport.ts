/**
 * 博客 HTML 导入：把本地/导出的 `.html` 文件转成 Markdown，再交给 Markdown 导入链路落库。
 *
 * 为什么要转而不是直接存 HTML：博客正文是 Markdown（`contentMarkdown`），
 * 编辑器、预览、公众号草稿都按 Markdown 渲染；直接塞 HTML 会绕过排版与图片引用约定。
 *
 * 复用 `importMarkdownFolder` 的好处是一次拿到全部既有能力：
 * 分类按名称创建、同标题查重、本地图片入图库并改写为 `img:<id>`、首图作封面、以草稿落库。
 * 做法是把转换结果包成「伪 .md 文件」（name 以 .md 结尾、text() 返回 Markdown），
 * 与用户手选 md 的路径完全一致。
 *
 * 图片：`<img src="images/x.png">` 转出 `![](images/x.png)`；若用户在同一次选择里
 * 一并选了这些图片文件（accept 已放开 image/*），会按文件名匹配入图库；只选 HTML 时
 * 相对路径图片会被移除（避免碎图），`http(s)` 外链原样保留。
 */
import TurndownService from 'turndown'
import { importMarkdownFolder } from './blogImport'
import type { ImportResult } from './blogImport'

const HTML_EXT_RE = /\.(html?|xhtml)$/i

/** 从文档里取一个可用的标题：`<title>` 优先，其次第一个 `<h1>` */
function pickTitle(doc: Document): string {
  return (doc.querySelector('title')?.textContent || doc.querySelector('h1')?.textContent || '').trim()
}

/**
 * HTML → Markdown。
 * - 只取 `<body>` 内容，丢掉 head/script/style/svg/noscript 等非正文节点
 * - 标题层级用 ATX（`#`）、代码块用围栏，与项目 markdown-it 渲染约定一致
 * - 正文首行不是一级标题时，用 `<title>` / 文件名补一个，保证导入后的文章标题正确
 */
export function htmlToMarkdown(html: string, fallbackTitle = ''): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const title = pickTitle(doc)

  doc.querySelectorAll('script, style, noscript, iframe, svg, link, meta, base, template').forEach((el) => el.remove())
  doc.querySelectorAll('[hidden], [aria-hidden="true"]').forEach((el) => el.remove())

  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*'
  })
  // turndown 默认会把 <script>/<style> 内容当文本，显式移除
  td.remove(['script', 'style', 'noscript'])

  let md = td.turndown(doc.body?.innerHTML ?? '').trim()
  if (!md) return ''

  // 正文已有一级标题就不重复加
  if (!/^#\s+\S/.test(md)) {
    const t = (title || fallbackTitle).trim()
    if (t) md = `# ${t}\n\n${md}`
  }
  return md
}

/**
 * 导入一组 HTML 文件（可选带同名图片）。
 * @param files 用户选择的文件（HTML 与图片可混合）
 * @param opts.categoryName 目标分类名，透传给 Markdown 导入
 */
export async function importHtmlFiles(
  files: File[],
  opts: { categoryName?: string } = {}
): Promise<ImportResult> {
  const htmlFiles = files.filter((f) => HTML_EXT_RE.test(f.name))
  const imageFiles = files.filter((f) => !HTML_EXT_RE.test(f.name))

  if (htmlFiles.length === 0) {
    return { imported: 0, skipped: 0, errors: ['没有可导入的 HTML 文件'], titles: [] }
  }

  const converted: File[] = []
  const errors: string[] = []

  for (const file of htmlFiles) {
    try {
      const base = file.name.replace(HTML_EXT_RE, '')
      const markdown = htmlToMarkdown(await file.text(), base)
      if (!markdown.trim()) {
        errors.push(`${file.name}：没有可导入的正文`)
        continue
      }
      // 伪 md 文件：importMarkdownFolder 只依赖 name 与 text()
      converted.push(new File([markdown], `${base}.md`, { type: 'text/markdown' }))
    } catch (e) {
      errors.push(`${file.name}：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (converted.length === 0) {
    return { imported: 0, skipped: htmlFiles.length, errors, titles: [] }
  }

  const res = await importMarkdownFolder([...converted, ...imageFiles], opts)
  return { ...res, errors: [...errors, ...res.errors] }
}
