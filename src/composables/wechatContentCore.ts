/**
 * 微信公众号「新增草稿」(draft/add) 的入参硬约束 —— 提交前自检，纯逻辑、零 DOM / 零 Vue 依赖。
 *
 * 官方文档 api_draft_add.html：
 *   - title ≤ 32 字、author ≤ 16 字、digest ≤ 120 字（不要用 \uXXXX 转义，直接传真实字符）
 *   - content 支持 HTML，必须「少于 2 万字符、小于 1MB」；微信会去除 JS
 *   - 正文里的图片 URL 必须来自「上传图文消息内的图片获取 URL」接口（uploadimg），
 *     外部图片 URL 会被过滤
 *   - news 类型下 thumb_media_id 必填，且必须是永久 MediaID
 *
 * 违规时微信只回一句 "invalid content hint: [...] rid: ..."，完全不带线索。
 * 所以在本地把这几条逐项测出来，给出带实测数值的中文提示，别让用户对着英文干瞪眼。
 */

export const WX_TITLE_MAX = 32
export const WX_AUTHOR_MAX = 16
export const WX_DIGEST_MAX = 120
export const WX_CONTENT_MAX_CHARS = 20000
export const WX_CONTENT_MAX_BYTES = 1024 * 1024

/** uploadimg 返回的图片 URL 域名（http / https 都可能） */
const WX_IMAGE_HOSTS = ['mmbiz.qpic.cn', 'mmbiz.qlogo.cn', 'res.wx.qq.com']

export interface WechatArticleLike {
  title?: string
  author?: string
  digest?: string
  content?: string
}

export interface WechatContentIssue {
  field: string
  message: string
}

/** 按 Unicode 码点计「字」，避免 emoji / 生僻字被算成两个字 */
function charCount(s: string): number {
  return Array.from(s).length
}

/** 提取正文里所有 <img> 的 src（诊断用轻量扫描，不做完整 HTML 解析；不匹配 data-src） */
export function collectImageSources(content: string): string[] {
  const out: string[] = []
  const re = /<img\b[^>]*?\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}

/** 是否为微信图床地址（uploadimg 的返回值）。data: / 相对路径 / 外链一律 false */
export function isWxImageUrl(src: string): boolean {
  try {
    const host = new URL(src).hostname.toLowerCase()
    return WX_IMAGE_HOSTS.some((h) => host === h || host.endsWith('.' + h))
  } catch {
    return false
  }
}

function shortSrc(src: string): string {
  if (!src) return '(空 src)'
  return src.length > 72 ? `${src.slice(0, 60)}…` : src
}

export function validateWechatArticle(article: WechatArticleLike): WechatContentIssue[] {
  const issues: WechatContentIssue[] = []
  const title = String(article.title ?? '')
  const author = String(article.author ?? '')
  const digest = String(article.digest ?? '')
  const content = String(article.content ?? '')

  if (!title.trim()) {
    issues.push({ field: 'title', message: '标题为空' })
  } else if (charCount(title) > WX_TITLE_MAX) {
    issues.push({ field: 'title', message: `标题 ${charCount(title)} 字，超过微信上限 ${WX_TITLE_MAX} 字，请精简标题` })
  }
  if (charCount(author) > WX_AUTHOR_MAX) {
    issues.push({ field: 'author', message: `作者 ${charCount(author)} 字，超过微信上限 ${WX_AUTHOR_MAX} 字` })
  }
  if (charCount(digest) > WX_DIGEST_MAX) {
    issues.push({ field: 'digest', message: `摘要 ${charCount(digest)} 字，超过微信上限 ${WX_DIGEST_MAX} 字` })
  }
  if (!content.trim()) {
    issues.push({ field: 'content', message: '正文内容为空' })
    return issues
  }

  const chars = charCount(content)
  const bytes = new TextEncoder().encode(content).length
  if (chars >= WX_CONTENT_MAX_CHARS || bytes >= WX_CONTENT_MAX_BYTES) {
    issues.push({
      field: 'content',
      message: `正文 HTML ${chars} 字符 / ${(bytes / 1024).toFixed(0)} KB，已达微信上限（2 万字符、1MB）。逐标签内联样式会把原文放大数倍，建议精简文章或减少插图后重试`
    })
  }

  const bad = collectImageSources(content).filter((s) => !isWxImageUrl(s))
  if (bad.length > 0) {
    const sample = bad.slice(0, 3).map(shortSrc).join('、')
    issues.push({
      field: 'content',
      message: `正文有 ${bad.length} 张图片不是微信图床地址（${sample}），微信会过滤外部图片并拒绝草稿。请把这些外链图下载后在编辑器里重新插入`
    })
  }

  if (/<script\b|javascript\s*:|\son[a-z]+\s*=/i.test(content)) {
    issues.push({
      field: 'content',
      message: '正文里含 script / javascript: / 事件属性，微信会去除 JS 并可能判定内容非法'
    })
  }
  return issues
}

/**
 * 公众号外链降级：算出需要「明文补显示」的地址（纯逻辑，零 DOM / 零 Vue，便于 node 单测）。
 *
 * 微信 draft/add 落库时会整体删掉 href 属性，把站外 <a> 剥成纯文字；指向不存在文章的
 * 站内链接甚至会让整篇草稿 45166 拒收。所以正文里不能留 <a>，得把地址以可复制的明文
 * 写在锚文字后面（读者长按复制到浏览器打开）—— 这是公众号生态里唯一稳定的外链表达。
 *
 * 典型例子：`| 仓库 | [meta/astryx](https://github.com/meta/astryx) |`
 * 原先发出去只剩「meta/astryx」，现在补全为「meta/astryx（https://github.com/meta/astryx）」。
 *
 * 返回值为需要追加的 URL；返回 '' 表示不追加（无有效地址，或锚文字已经把地址写全了）。
 * 只放行 http/https 与 mailto：#页内锚点（微信会删 id，跳不了）、相对路径、javascript:
 * 之类一律不输出，避免把无效/危险字符串塞进正文。
 */
export function wechatVisibleLinkUrl(href: string, label: string): string {
  const raw = String(href ?? '').trim()
  const text = String(label ?? '').trim()
  let visible = ''
  if (/^https?:\/\//i.test(raw)) visible = raw
  else if (/^mailto:/i.test(raw)) visible = raw.slice(7).trim()
  else return ''
  if (!visible) return ''
  // linkify 自动链接 / [url](url) / 锚文字里本来就写了完整地址 → 别重复输出两遍。
  // 顺带按「去掉末尾斜杠」再比一次：[https://x.com](https://x.com/) 也视为已可见。
  const bare = visible.replace(/\/+$/, '')
  if (text.includes(visible) || (bare && text.includes(bare))) return ''
  return visible
}

/** 组装成可直接展示在编辑器错误区的中文文案 */
export function formatWechatContentIssues(issues: WechatContentIssue[]): string {
  if (!issues.length) return ''
  return '正文未通过微信公众号草稿箱自检：' + issues.map((it, i) => `\n${i + 1}. ${it.message}`).join('')
}
