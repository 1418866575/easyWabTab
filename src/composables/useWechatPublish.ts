// 微信公众号发布（草稿箱）composable（仅浏览器侧，依赖 DOMParser / canvas / fetch）
//
// 流程：
//   1. 校验后端是否已配置凭证（GET /api/wechat/config）
//   2. 正文 Markdown → 还原图片短引用为 data URL → markdown-it 渲染为 HTML
//   3. 用 DOMParser 给每个标签注入内联 style（微信公众号只认内联 style，禁外部 CSS/JS/class/id）
//   4. webp/avif/bmp 走 canvas 转码为 jpeg（微信图床仅稳收 jpg/png）
//   5. 封面：coverImageId → upload-cover 拿 thumb_media_id；无封面但有正文图则拿第一张兜底
//   6. 正文图逐张 upload-img 拿到微信图床 URL，替换 <img src>
//   7. 组装微信文章 → POST /api/wechat/draft 创建草稿，返回 media_id
//
// 安全：图片以 data URL 形式从前端提交给同源后端代理，由后端上传微信；AppSecret 永不进前端。

import { ref } from 'vue'
import { resolveImageRefs } from '@/composables/blogImages'
import { renderMarkdown } from '@/composables/noteMarkdown'

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

async function uploadContentImage(dataUrl: string): Promise<string> {
  const res = await fetch(`${API_BASE}/upload-img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl })
  })
  const data = await res.json()
  if (!data.ok || !data.url) {
    throw new WechatPublishError(data.error || '正文图片上传失败', { code: data.code })
  }
  return data.url
}

async function uploadCoverImage(dataUrl: string): Promise<string> {
  const res = await fetch(`${API_BASE}/upload-cover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl })
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
      return 'background-color:#f6f8fa;padding:12px 16px;border-radius:6px;overflow-x:auto;margin:1em 0;font-size:14px;line-height:1.6;'
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
      // 1. 配置检查
      const cfgRes = await fetch(`${API_BASE}/config`, { headers: { Accept: 'application/json' } })
      const cfg = await cfgRes.json()
      if (!cfg.configured) {
        notConfigured.value = true
        error.value = '尚未配置微信公众号凭证，请先到「设置 → 微信公众号」填写 AppID / AppSecret'
        return false
      }

      // 2. 渲染 + 内联样式
      progressMsg.value = '正在转换正文…'
      const resolved = resolveImageRefs(opts.contentMarkdown, opts.resolveImage)
      const html = renderMarkdown(resolved)
      if (!html.trim()) {
        throw new WechatPublishError('正文内容为空，无法发布')
      }
      const doc = new DOMParser().parseFromString(`<section>${html}</section>`, 'text/html')
      const root = (doc.body.firstElementChild as HTMLElement) ?? doc.body
      applyInlineStyles(root)
      const imgs = Array.from(root.querySelectorAll('img'))

      // 3. 封面（coverImageId → 兜底第一张正文图）
      let thumbMediaId: string | undefined
      const coverUrl = opts.coverImageId ? opts.resolveImage(opts.coverImageId) : undefined
      progressTotal.value = imgs.length + 1
      if (coverUrl) {
        progressMsg.value = '上传封面…'
        progressStep.value = 0
        thumbMediaId = await uploadCoverImage(await transcodeImage(coverUrl))
      }
      if (!thumbMediaId && imgs.length > 0) {
        const firstSrc = imgs[0].getAttribute('src') || ''
        if (firstSrc.startsWith('data:')) {
          thumbMediaId = await uploadCoverImage(await transcodeImage(firstSrc))
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
        const url = await uploadContentImage(await transcodeImage(src))
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
          thumbMediaId
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
