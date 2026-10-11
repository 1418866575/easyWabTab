/**
 * 博客正文内联图片的「短引用」解析（纯函数，无 Vue / DOM / 副作用，可单测）
 *
 * 为什么要短引用：图片 base64 直接内联进 Markdown 后，编辑区（textarea）只能显示
 * 那一长串 base64，无法显示成图片。于是把 base64 存进图片库（BlogData.images），
 * 正文只写短引用 `![alt](img:<id>)`；渲染前再用 resolveImageRefs 还原成 data URL，
 * 交给 noteMarkdown（markdown-it）渲染 —— 编辑区只看到短引用，预览/前台看到图片。
 */

/** 图片 id 前缀（与 newId('bi') 生成的一致），用于收紧引用匹配、避免误伤普通 URL */
export const BLOG_IMAGE_ID_PREFIX = 'bi_'

/** 匹配「正文里指向图片库的 Markdown 图片」：![alt](img:bi_xxx) */
const IMAGE_REF_SOURCE = `!\\[([^\\]]*)\\]\\(img:(${BLOG_IMAGE_ID_PREFIX}[A-Za-z0-9_-]+)\\)`

/** 由图片 id 生成正文引用地址（作为 Markdown 图片的 URL 部分） */
export function imageRef(id: string): string {
  return `img:${id}`
}

/** 提取正文中引用的图片 id（去重，保持出现顺序） */
export function parseImageRefs(markdown: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const re = new RegExp(IMAGE_REF_SOURCE, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) {
    const id = m[2]
    if (!seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

/**
 * 把正文里的短引用还原为真实 data URL 后再交给渲染器。
 * resolve 返回空/undefined（图片缺失，如未同步到本机）时**原样保留引用**，
 * 以免产生空 src 的碎图；此时正文会显示 `![alt](img:bi_xxx)` 便于定位问题。
 */
export function resolveImageRefs(
  markdown: string,
  resolve: (id: string) => string | undefined
): string {
  return markdown.replace(new RegExp(IMAGE_REF_SOURCE, 'g'), (whole: string, alt: string, id: string) => {
    const url = resolve(id)
    return url ? `![${alt}](${url})` : whole
  })
}

/**
 * 从正文移除某张图片的全部引用（含其后紧随的一个换行，避免留下空行）。
 * 供编辑器「移除」按钮调用：先清正文引用、保存，再由 store 决定是否回收图片库条目。
 */
export function removeImageRefs(markdown: string, id: string): string {
  const safeId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`!\\[[^\\]]*\\]\\(img:${safeId}\\)[ \\t]*\\n?`, 'g')
  return markdown.replace(re, '')
}

/**
 * 图片 data URL 白名单：必须是位图 base64（png/jpeg/gif/webp/bmp/avif…），
 * 禁止 svg（markdown-it 渲染侧亦禁 svg+xml，避免脚本注入）。与渲染侧口径一致。
 */
export function isAllowedDataImage(url: string): boolean {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(url)
  if (!m) return false
  return !m[1].toLowerCase().includes('svg')
}
