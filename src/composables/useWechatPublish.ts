// 微信公众号发布（草稿箱）composable（仅浏览器侧，依赖 DOMParser / canvas / fetch）
//
// 流程：
//   1. 读取本地 store 凭证（AppID / AppSecret 随 blog.json 云同步；不再依赖服务端全局配置）
//   2. 正文 Markdown → 还原图片短引用为 data URL → markdown-it 渲染为 HTML
//   3. 用 DOMParser 给每个标签注入内联 style（微信公众号只认内联 style，禁外部 CSS/JS/class/id）
//   4. webp/avif/bmp 走 canvas 转码为 jpeg（微信图床仅稳收 jpg/png）
//   5. 封面：coverImageId → upload-cover 拿 thumb_media_id；无封面但有正文图则拿第一张兜底
//   6. 正文图逐张 upload-img 拿到微信图床 URL，替换 <img src>
//   7. 组装微信文章 → POST /api/wechat/draft 创建草稿，返回 media_id
//
// 安全：凭证由前端随每次请求发给无状态代理（代理不落盘、按 AppID 缓存 token、互不串号）；
//      图片以 data URL 形式从前端提交给同源后端代理，由后端上传微信。

import { ref } from 'vue'
import { resolveImageRefs } from '@/composables/blogImages'
import { renderMarkdown } from '@/composables/noteMarkdown'
import { useBlogStore } from '@/stores/blog'

const API_BASE = '/api/wechat'

export class WechatPublishError extends Error {
  code?: string
  notConfigured?: boolean
  constructor(message: string, opts: { code?: string; notConfigured?: boolean } = {}) {
    super(message)
    this.name = 'WechatPublishError'
    this.code = opts.code
    this.notConfigured = opts.notConfigured
  }
}

// ---------------------------------------------------------------------------
// 图片转码：webp / avif / bmp 浏览器原生可解码，但微信图床仅稳收 jpg/png，故转码为 jpeg
// ---------------------------------------------------------------------------
function transcodeImage(dataUrl: string): Promise<string> {
  const m = /^data:([^;]+);base64,/.exec(dataUrl)
  const mime = m?.[1]?.toLowerCase()
  if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg') {
    return Promise.resolve(dataUrl)
  }
  return new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new WechatPublishError('图片转码失败：当前环境无法创建 canvas'))
          return
        }
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/jpeg', 0.92))
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    img.onerror = () =>
      reject(new WechatPublishError('图片解码失败（可能是浏览器不支持的格式，建议转换为 jpg/png 后重试）'))
    img.src = dataUrl
  })
}

async function uploadContentImage(dataUrl: string, appId: string, appSecret: string): Promise<string> {
  const res = await fetch(`${API_BASE}/upload-img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, appId, appSecret })
  })
  const data = await res.json()
  if (!data.ok || !data.url) {
    throw new WechatPublishError(data.error || '正文图片上传失败', { code: data.code })
  }
  return data.url
}

async function uploadCoverImage(dataUrl: string, appId: string, appSecret: string): Promise<string> {
  const res = await fetch(`${API_BASE}/upload-cover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, appId, appSecret })
  })
  const data = await res.json()
  if (!data.ok || !data.mediaId) {
    throw new WechatPublishError(data.error || '封面上传失败', { code: data.code })
  }
  return data.mediaId
}

// ---------------------------------------------------------------------------
// 内联样式：微信公众号正文只认行内 style，外链 CSS / class / id / JS 全部被过滤
// ---------------------------------------------------------------------------
function styleFor(tag: string, el: HTMLElement): string {
  const isCodeInPre = tag === 'code' && el.parentElement?.tagName.toLowerCase() === 'pre'
  switch (tag) {
    case 'p':
      return 'margin:1.2em 0;padding:0;'
    case 'h1':
      return 'font-size:22px;font-weight:bold;margin:1.4em 0 0.8em;line-height:1.4;color:#1f1f1f;'
    case 'h2':
      return 'font-size:20px;font-weight:bold;margin:1.4em 0 0.8em;line-height:1.4;color:#1f1f1f;'
    case 'h3':
      return 'font-size:18px;font-weight:bold;margin:1.2em 0 0.6em;line-height:1.4;color:#1f1f1f;'
    case 'h4':
    case 'h5':
    case 'h6':
      return 'font-size:16px;font-weight:bold;margin:1.1em 0 0.5em;color:#1f1f1f;'
    case 'img':
      return 'max-width:100%;height:auto;display:block;margin:0.8em auto;border-radius:4px;'
    case 'a':
      return 'color:#576b95;text-decoration:none;word-break:break-all;'
    case 'strong':
    case 'b':
      return 'font-weight:bold;'
    case 'em':
    case 'i':
      return 'font-style:italic;'
    case 'code':
      if (isCodeInPre) return 'background:none;padding:0;color:#333;font-family:Consolas,Menlo,monospace;font-size:14px;'
      return 'background-color:#f6f8fa;color:#c7254e;padding:2px 6px;border-radius:3px;font-family:Consolas,Menlo,monospace;font-size:14px;word-break:break-all;'
    case 'pre':
      // 公众号会丢掉 overflow-x，长代码行会被直接裁掉 → 用 pre-wrap 自动折行（缩进仍保留）
      return 'background-color:#f6f8fa;padding:12px 16px;border-radius:6px;margin:1em 0;font-size:13px;line-height:1.65;white-space:pre-wrap;word-wrap:break-word;word-break:break-all;tab-size:2;'
    case 'blockquote':
      return 'margin:1em 0;padding:8px 12px;border-left:4px solid #d9d9d9;background-color:#f8f8f8;color:#888;'
    case 'ul':
    case 'ol':
      return 'padding-left:1.8em;margin:1em 0;'
    case 'li':
      return 'margin:0.4em 0;'
    case 'hr':
      return 'border:none;border-top:1px solid #eee;margin:1.5em 0;'
    case 'table':
      return 'border-collapse:collapse;width:100%;margin:1em 0;font-size:14px;'
    case 'th':
      return 'border:1px solid #e0e0e0;padding:6px 10px;text-align:left;background-color:#f6f8fa;font-weight:bold;'
    case 'td':
      return 'border:1px solid #e0e0e0;padding:6px 10px;text-align:left;'
    default:
      return ''
  }
}

/**
 * 列表安全化：把 <ul>/<ol>/<li> 摊平成带手写符号的 <section>。
 *
 * 为什么必须做（真实线上现象）：公众号草稿箱**不认列表标签**，`<li>` 里只要出现块级子节点
 * （markdown-it 遇到列表项内空行会生成 `<li><p>…</p></li>` 的松散列表），就会被拆成
 * 「空的项目符号 + 独立一行内容」；再叠加 markdown-it 的 breaks:true（项内单换行 → <br>），
 * 一条 `- **框架**
  ：Vue 3 …` 就变成「空圆点 / 圆点+框架 / 缩进的：Vue 3」三段。
 *
 * 处理规则：
 * - 一个 li → 一个 section（`padding-left` + 负 `text-indent` 做悬挂缩进，换行自动对齐）
 * - 项内块级子节点（p/div/section）合并为同一行，块间保留 <br>
 * - 项内换行/首尾空白折叠，避免「：内容」被顶到下一行
 * - 空项剔除；嵌套列表按层级追加在父项之后、缩进加深
 * - 有序列表保留 1. 2. 3. 编号
 */
function flattenLists(root: HTMLElement): void {
  const doc = root.ownerDocument

  const isPunctStart = (t: string): boolean => /^[：:，,。.、；;！!？?）)】」』]/.test(t)

  /** 折叠空白 + 去掉首尾换行 */
  const collapse = (html: string): string =>
    html
      .replace(/\s*\n\s*/g, ' ')
      .replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')
      .replace(/^(\s|<br\s*\/?>)+/i, '')
      .replace(/(\s|<br\s*\/?>)+$/i, '')
      .trim()

  /**
   * 行内软换行归一：
   * markdown-it 的 breaks:true 会把「列表项内单换行」渲染成 <br>（如 `- **框架**\n  ：Vue 3`），
   * 这在公众号里就是一条被劈成两行的列表项。列表内容本该是一段，
   * 故把 <br> 折叠为「空格」；下一段以中文标点开头时直接连写（框架：Vue 3）。
   */
  const normalizeInline = (html: string): string => {
    const segs = collapse(html)
      .split(/<br\s*\/?>/i)
      .map((x) => x.trim())
      .filter(Boolean)
    let out = ''
    for (const seg of segs) out = out ? (isPunctStart(seg) ? out + seg : `${out} ${seg}`) : seg
    return out
  }

  /** 把一层列表展开成若干 section，追加到 out；嵌套列表递归加深缩进 */
  const walk = (list: HTMLElement, level: number, out: HTMLElement[]): void => {
    const ordered = list.tagName.toLowerCase() === 'ol'
    const items = Array.from(list.children).filter((c): c is HTMLElement => c.tagName?.toLowerCase() === 'li')
    let index = 0
    for (const li of items) {
      index += 1
      // 先把嵌套列表摘出来（它们的内容不能混进父项文本）
      const nested = Array.from(li.children).filter((c): c is HTMLElement => {
        const t = c.tagName?.toLowerCase()
        return t === 'ul' || t === 'ol'
      })
      nested.forEach((n) => n.remove())

      // 逐个子节点拼装：连续的文字/段落块/行内标签合并成「一行」，只有 pre/blockquote/table
      // 这类真·块级结构才另起一行。注意 <strong>/<em>/<a>/<code> 是**行内**元素，
      // 若当成块处理会被 <br> 隔开（紧凑列表里 markdown 的 **加粗** 就是这么被劈成两行的）。
      const isTextBlock = (t: string): boolean => t === 'p' || t === 'div' || t === 'section'
      const INLINE_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 's', 'del', 'code', 'a', 'span', 'mark', 'sub', 'sup', 'img'])
      const parts: string[] = []
      let run = ''
      const flush = () => {
        if (run) {
          parts.push(run)
          run = ''
        }
      }
      /** run 收尾：去掉中文标点前的多余空格（"框架 ：Vue" → "框架：Vue"） */
      const tidyRun = (t: string): string => t.replace(/\s+([：:，,。.、；;！!？?）)】」』])/g, '$1')
      for (const child of Array.from(li.childNodes)) {
        if (child.nodeType === 3) {
          const t = normalizeInline(child.textContent || '')
          if (!t) continue
          run = run ? (isPunctStart(t) ? run + t : `${run} ${t}`) : t
          continue
        }
        if (child.nodeType !== 1) continue
        const el = child as HTMLElement
        const tag = el.tagName.toLowerCase()
        if (tag === 'br') {
          // 项内软换行（breaks:true 的产物）→ 折叠为空格
          run += ' '
        } else if (INLINE_TAGS.has(tag)) {
          run += el.outerHTML
        } else if (isTextBlock(tag)) {
          const t = normalizeInline(el.innerHTML)
          if (!t) continue
          run = run ? (isPunctStart(t) ? run + t : `${run} ${t}`) : t
        } else {
          flush()
          parts.push(el.outerHTML)
        }
      }
      flush()
      const inner = collapse(parts.map(tidyRun).join('<br>'))

      if (!inner) {
        // 空项目符号（原文写了空列表项 / 只剩嵌套列表）→ 不生成符号，只处理嵌套
        nested.forEach((n) => walk(n, level + 1, out))
        continue
      }

      const marker = ordered ? `${index}.` : '•'
      const indent = (1.4 + level * 1.2).toFixed(1) // 避免 2.5999999 这类浮点尾巴进 CSS
      const section = doc.createElement('section')
      section.setAttribute(
        'style',
        `margin:0.45em 0;padding-left:${indent}em;text-indent:-1.4em;line-height:1.75;`
      )
      section.innerHTML = `${marker}&nbsp;${inner}`
      out.push(section)

      nested.forEach((n) => walk(n, level + 1, out))
    }
  }

  // 只从最外层列表开始（嵌套的由 walk 递归处理）
  const outerLists = Array.from(root.querySelectorAll('ul, ol')).filter(
    (l) => !l.parentElement?.closest('ul, ol')
  ) as HTMLElement[]

  for (const list of outerLists) {
    const out: HTMLElement[] = []
    walk(list, 0, out)
    const container = doc.createElement('section')
    container.setAttribute('style', 'margin:1em 0;')
    out.forEach((el) => container.appendChild(el))
    list.replaceWith(container)
  }
}

/**
 * 表格安全化：把 <table> 摊平成「一行一张卡片」。
 *
 * 公众号对 table 的支持同样不可靠（列宽被压、合并单元格塌、宽表在手机上溢出裁切），
 * 与其赌它渲染正确，不如转成移动端天然可读的卡片：
 * - 每张卡片 = 一行；首列作为卡片标题（加粗）
 * - 其余列按表头标注「表头：值」逐行展示，窄屏也不会挤
 * - 保留单元格内部 HTML（行内 code / strong 等样式不丢）
 * Markdown 表格必有表头行，故默认第一行为表头；无 thead 时用第一行当表头。
 */
function flattenTables(root: HTMLElement): void {
  const doc = root.ownerDocument
  const tables = Array.from(root.querySelectorAll('table'))

  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll('tr')) as HTMLElement[]
    if (rows.length === 0) {
      table.remove()
      continue
    }
    const headRow = (table.querySelector('thead tr') as HTMLElement | null) ?? rows[0]
    const headCells = Array.from(headRow.children) as HTMLElement[]
    const labels = headCells.map((c) => (c.textContent || '').trim())
    const bodyRows = rows.filter((r) => r !== headRow)

    const container = doc.createElement('section')
    container.setAttribute('style', 'margin:1em 0;')

    for (const row of bodyRows) {
      const cells = Array.from(row.children) as HTMLElement[]
      if (cells.length === 0) continue
      const card = doc.createElement('section')
      card.setAttribute(
        'style',
        'border:1px solid #eceff3;border-radius:6px;padding:10px 12px;margin:0.6em 0;background-color:#fafbfc;'
      )
      // 首列 = 卡片标题
      const title = doc.createElement('section')
      title.setAttribute('style', 'font-size:15px;font-weight:bold;color:#1f1f1f;line-height:1.5;margin-bottom:4px;')
      title.innerHTML = (cells[0].innerHTML || '').trim() || '&nbsp;'
      card.appendChild(title)
      // 其余列 = 「表头：值」
      for (let i = 1; i < cells.length; i++) {
        const val = (cells[i].innerHTML || '').trim()
        if (!val) continue
        const label = labels[i] ?? ''
        const line = doc.createElement('section')
        line.setAttribute('style', 'font-size:14px;color:#3f3f3f;line-height:1.75;')
        line.innerHTML = label
          ? `<span style="color:#8a8f99;">${label}：</span>${val}`
          : val
        card.appendChild(line)
      }
      container.appendChild(card)
    }

    table.replaceWith(container)
  }
}

/** 微信正文统一处理入口：列表摊平 + 表格卡片化 + 全标签内联样式（导出便于回归测试） */
export function normalizeWechatBody(root: HTMLElement): void {
  // 顺序有讲究：先摊平列表（表格若在列表项里会被提到顶层），再卡片化表格，最后统一内联样式
  flattenLists(root)
  flattenTables(root)
  applyInlineStyles(root)
}

/** Markdown → 可直接提交给草稿箱的正文 HTML（导出便于回归测试） */
export function buildWechatContentHtml(
  contentMarkdown: string,
  resolveImage: (id: string) => string | undefined
): string {
  const html = renderMarkdown(resolveImageRefs(contentMarkdown, resolveImage))
  const doc = new DOMParser().parseFromString(`<section>${html}</section>`, 'text/html')
  const root = (doc.body.firstElementChild as HTMLElement) ?? doc.body
  normalizeWechatBody(root)
  return root.outerHTML
}

function applyInlineStyles(root: HTMLElement): void {
  const base = 'font-size:16px;color:#3f3f3f;line-height:1.75;word-wrap:break-word;word-break:break-word;padding:0 4px;'
  root.setAttribute('style', base)
  root.querySelectorAll('*').forEach((node) => {
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    el.removeAttribute('class')
    el.removeAttribute('id')
    const s = styleFor(tag, el)
    if (s) el.setAttribute('style', s)
  })
}

export function useWechatPublish() {
  const publishing = ref(false)
  const progressMsg = ref('')
  const progressStep = ref(0)
  const progressTotal = ref(0)
  const error = ref('')
  const result = ref<{ mediaId: string } | null>(null)
  const notConfigured = ref(false)

  async function publish(opts: {
    title: string
    author?: string
    digest?: string
    contentMarkdown: string
    coverImageId?: string
    resolveImage: (id: string) => string | undefined
  }): Promise<boolean> {
    error.value = ''
    notConfigured.value = false
    result.value = null
    publishing.value = true
    try {
      // 1. 配置检查（读取本地 store 凭证；AppID / AppSecret 随 blog.json 云同步，不再依赖服务端全局配置）
      const store = useBlogStore()
      const creds = store.wechat
      if (!creds?.appId || !creds?.appSecret) {
        notConfigured.value = true
        error.value = '尚未配置微信公众号凭证，请先到「博客设置 → 微信公众号」填写 AppID / AppSecret'
        return false
      }
      const appId = creds.appId
      const appSecret = creds.appSecret

      // 2. 渲染 + 内联样式
      progressMsg.value = '正在转换正文…'
      const resolved = resolveImageRefs(opts.contentMarkdown, opts.resolveImage)
      const html = renderMarkdown(resolved)
      if (!html.trim()) {
        throw new WechatPublishError('正文内容为空，无法发布')
      }
      const doc = new DOMParser().parseFromString(`<section>${html}</section>`, 'text/html')
      const root = (doc.body.firstElementChild as HTMLElement) ?? doc.body
      // 列表必须先摊平（公众号不认 ul/li），再整体内联样式
      normalizeWechatBody(root)
      const imgs = Array.from(root.querySelectorAll('img'))

      // 3. 封面（coverImageId → 兜底第一张正文图）
      let thumbMediaId: string | undefined
      const coverUrl = opts.coverImageId ? opts.resolveImage(opts.coverImageId) : undefined
      progressTotal.value = imgs.length + 1
      if (coverUrl) {
        progressMsg.value = '上传封面…'
        progressStep.value = 0
        thumbMediaId = await uploadCoverImage(await transcodeImage(coverUrl), appId, appSecret)
      }
      if (!thumbMediaId && imgs.length > 0) {
        const firstSrc = imgs[0].getAttribute('src') || ''
        if (firstSrc.startsWith('data:')) {
          thumbMediaId = await uploadCoverImage(await transcodeImage(firstSrc), appId, appSecret)
        }
      }
      if (!thumbMediaId) {
        throw new WechatPublishError('缺少封面图：请先设置封面，或在正文中至少插入一张图片')
      }
      progressStep.value = 1

      // 4. 正文图片逐张上传并替换 src
      for (let i = 0; i < imgs.length; i++) {
        const src = imgs[i].getAttribute('src') || ''
        if (!src.startsWith('data:')) continue // 已是微信图床 URL（理论不会走到）
        progressStep.value = i + 2
        progressMsg.value = `上传图片 ${i + 1}/${imgs.length}…`
        const url = await uploadContentImage(await transcodeImage(src), appId, appSecret)
        imgs[i].setAttribute('src', url)
      }

      // 5. 组装并创建草稿
      progressMsg.value = '创建草稿…'
      const content = root.outerHTML
      const draftRes = await fetch(`${API_BASE}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          title: opts.title,
          author: opts.author || '',
          digest: opts.digest || '',
          content,
          thumbMediaId,
          appId,
          appSecret
        })
      })
      const draft = await draftRes.json()
      if (!draft.ok || !draft.mediaId) {
        throw new WechatPublishError(draft.error || '草稿创建失败', { code: draft.code })
      }
      result.value = { mediaId: draft.mediaId }
      progressMsg.value = '已发布到公众号草稿箱'
      return true
    } catch (e) {
      if (e instanceof WechatPublishError) {
        error.value = e.message
      } else if (e instanceof Error) {
        error.value = '发布失败：' + e.message
      } else {
        error.value = '发布失败：未知错误'
      }
      return false
    } finally {
      publishing.value = false
    }
  }

  return {
    publishing,
    progressMsg,
    progressStep,
    progressTotal,
    error,
    result,
    notConfigured,
    publish
  }
}
