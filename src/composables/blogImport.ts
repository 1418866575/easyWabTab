/**
 * 博客 Markdown 导入（浏览器侧 composable）
 *
 * 场景：把本地写好的 `.md`（含正文图片）批量导入博客后台，落到指定分类，
 * 生成「草稿」文章，随后即可用现有「预览公众号 / 发送公众号草稿箱」流程。
 *
 * 关键约定（与博客数据层对齐）：
 * - 正文图片不是普通 URL，而是短引用 `![alt](img:<id>)`，图片本体 base64 存 `BlogData.images`；
 *   封面单独走文章 `coverImageId`。因此导入时必须把 md 里的本地图片路径
 *   （如 `images/01-主页总览.png`）转成图片库条目并改写引用。
 * - 图片来源：同一次选择里的图片文件（多选 / 文件夹 / ZIP 解包），按相对路径优先、
 *   文件名兜底匹配；入库前统一压缩，单次导入内同一文件只入库一次。
 * - 首张图片同时设为封面并保留在正文（正文插图不应被吞掉）。
 * - 分类按「名称」查找，缺失自动创建；文章以 `draft` 状态落库。
 * - 同标题（未删除）已存在则跳过，避免重复导入。
 *
 * 纯浏览器 API（File / FileReader），不依赖服务端；与站点部署位置无关。
 */
import { useBlogStore } from '@/stores/blog'
import { compressImageDataUrl } from './blogImageCompress'

export interface ImportResult {
  /** 成功导入篇数 */
  imported: number
  /** 跳过篇数（已存在 / 空文件 / 读取失败） */
  skipped: number
  /** 错误明细（逐文件） */
  errors: string[]
  /** 成功导入的文章标题 */
  titles: string[]
  /** 本次导入上传进图库的不重复图片数 */
  imagesUploaded: number
  /** md 里引用了本地图片、但没随文件一起提供的引用数 */
  missingImages: number
}

/** 新建一份空结果（供各导入通道复用） */
export function emptyImportResult(errors: string[] = []): ImportResult {
  return { imported: 0, skipped: 0, errors, titles: [], imagesUploaded: 0, missingImages: 0 }
}

/** Markdown 图片语法：![alt](src) —— src 不含右括号（文件名不含括号，够用） */
const IMG_MD_SOURCE = '!\\[([^\\]]*)\\]\\(([^)]+)\\)'
const IMG_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i

/** 图片路径归一化：解码 URL 转义、统一斜杠、去 ./ 与 query/hash、转小写 */
function normalizeImgPath(p: string): string {
  let s = (p || '').trim()
  try { s = decodeURIComponent(s) } catch { /* 非法 % 编码按原样处理 */ }
  return s.split('?')[0].split('#')[0].replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
}

/** 取路径最后一段文件名 */
function basename(p: string): string {
  return p.split('/').pop() || p
}

/** File → data URL（图片用） */
function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : '')
    fr.onerror = () => reject(fr.error ?? new Error('读取图片失败'))
    fr.readAsDataURL(file)
  })
}

/** 拆出首个一级标题作为文章标题，正文去掉该行 */
function splitTitle(md: string): { title: string; body: string } {
  const lines = md.split(/\r?\n/)
  const idx = lines.findIndex((l) => /^#\s+\S/.test(l))
  if (idx >= 0) {
    const title = lines[idx].replace(/^#\s+/, '').trim()
    const body = lines.slice(0, idx).concat(lines.slice(idx + 1)).join('\n')
    return { title, body }
  }
  const first = lines.find((l) => l.trim()) ?? ''
  return { title: first.trim(), body: md }
}

interface ImageRef { whole: string; alt: string; src: string }
interface Draft { title: string; content: string; refs: ImageRef[] }

/**
 * 导入一组文件（多选 / 文件夹 / ZIP 解包皆可，只要图片在同一批里）。
 * @param files 文件夹选择或 ZIP 解包得到的全部文件（含 .md 与 images/*.png）
 * @param opts.categoryName 目标分类名，默认「信贷晨读」
 * @param opts.pathOf 文件在包内的相对路径（ZIP 用；文件夹选择走 File.webkitRelativePath）
 */
export async function importMarkdownFolder(
  files: File[],
  opts: { categoryName?: string; pathOf?: (f: File) => string } = {}
): Promise<ImportResult> {
  const store = useBlogStore()
  const result = emptyImportResult()
  const relOf = (f: File): string => normalizeImgPath(opts.pathOf?.(f) || f.webkitRelativePath || f.name)

  // ---------- 1. 目标分类（按名称查找，缺失则创建） ----------
  const categoryName = (opts.categoryName || '信贷晨读').trim()
  let category = store.categories.find((c) => c.name.trim() === categoryName)
  if (!category) {
    const r = await store.addCategory(categoryName)
    if (!r.ok) result.errors.push(`创建分类「${categoryName}」失败：${r.reason ?? '未知原因'}`)
    category = store.categories.find((c) => c.name.trim() === categoryName)
  }
  const categoryId = category?.id

  // ---------- 2. 图片索引：完整相对路径 → File，文件名 → File（兜底） ----------
  // 忽略 _wm_backup（带水印备份）以免误配；images/ 目录下的同名文件优先。
  const byPath = new Map<string, File>()
  const byName = new Map<string, File>()
  for (const f of files) {
    const rel = relOf(f)
    if (rel.includes('_wm_backup')) continue
    if (!IMG_EXT_RE.test(f.name)) continue
    const fromImages = /(?:^|\/)images\//.test(rel)
    if (!byPath.has(rel) || fromImages) byPath.set(rel, f)
    const bn = basename(rel)
    if (!byName.has(bn) || fromImages) byName.set(bn, f)
  }
  /** md 引用 → 本地图片文件：先按完整相对路径，再按文件名 */
  const findImage = (src: string): File | undefined => {
    const p = normalizeImgPath(src)
    return byPath.get(p) ?? byName.get(basename(p))
  }
  const fileKey = relOf

  // ---------- 3. 仅处理根层（相对深度 ≤ 2）的 .md ----------
  const mdFiles = files.filter((f) => {
    const depth = relOf(f).split('/').filter(Boolean).length
    return /\.md$/i.test(f.name) && depth <= 2
  })

  // 阶段 A：解析所有 md，收集待上传图片（跨文章去重），不写库
  const drafts: Draft[] = []
  const pending = new Map<string, File>()
  const seenTitles = new Set(store.articles.filter((a) => !a.deletedAt).map((a) => a.title.trim()))
  for (const mdFile of mdFiles) {
    try {
      const raw = await mdFile.text()
      if (!raw.trim()) { result.skipped++; continue }
      const { title, body } = splitTitle(raw)
      const finalTitle = (title || mdFile.name.replace(/\.md$/i, '')).trim()
      if (!finalTitle) { result.skipped++; continue }
      if (seenTitles.has(finalTitle)) { result.skipped++; continue }
      seenTitles.add(finalTitle)

      const refs: ImageRef[] = []
      const re = new RegExp(IMG_MD_SOURCE, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(body)) !== null) {
        refs.push({ whole: m[0], alt: m[1] || '', src: (m[2] || '').trim() })
      }
      for (const item of refs) {
        if (item.src.startsWith('img:') || item.src.startsWith('data:') || /^https?:\/\//i.test(item.src)) continue
        const file = findImage(item.src)
        if (!file) { result.missingImages++; continue }
        const key = fileKey(file)
        if (!pending.has(key)) pending.set(key, file)
      }
      drafts.push({ title: finalTitle, content: body, refs })
    } catch (e) {
      result.errors.push(`${mdFile.name}：${e instanceof Error ? e.message : String(e)}`)
      result.skipped++
    }
  }

  // 阶段 B：读图 + 压缩 + 一次批量入库（避免 N 次全量序列化 blog.json）
  const okKeys: string[] = []
  const images: Array<{ name: string; dataUrl: string; size?: number }> = []
  for (const [key, file] of pending) {
    try {
      const rawUrl = await readAsDataURL(file)
      if (!rawUrl.startsWith('data:image/')) continue
      let dataUrl = rawUrl
      let size = file.size
      try {
        const compressed = await compressImageDataUrl(rawUrl)
        dataUrl = compressed.dataUrl
        size = compressed.bytes
      } catch { /* 解码失败按原图入库 */ }
      images.push({ name: file.name, dataUrl, size })
      okKeys.push(key)
    } catch (e) {
      result.errors.push(`${file.name}：${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const created = await store.addImages(images)
  const idByKey = new Map<string, string>()
  created.forEach((img, i) => { if (okKeys[i]) idByKey.set(okKeys[i], img.id) })
  result.imagesUploaded = created.length

  // 阶段 C：改写引用 + 落库
  for (const d of drafts) {
    let content = d.content
    let coverImageId: string | undefined
    for (const item of d.refs) {
      if (item.src.startsWith('img:') || item.src.startsWith('data:')) continue
      const file = findImage(item.src)
      if (!file) {
        // 本地相对路径但没匹配到图片：移除引用，避免预览/草稿箱里出现碎图。外链原样保留。
        if (!/^https?:\/\//i.test(item.src)) content = content.replace(item.whole, '')
        continue
      }
      const id = idByKey.get(fileKey(file))
      if (!id) { content = content.replace(item.whole, ''); continue }
      // 首图设为封面，同时保留在正文原位置
      if (coverImageId === undefined) coverImageId = id
      content = content.replace(item.whole, `![${item.alt}](img:${id})`)
    }
    content = content.replace(/^\s*\n+/, '').trimEnd()
    try {
      await store.createArticle({
        title: d.title,
        contentMarkdown: content,
        categoryId,
        coverKind: coverImageId ? 'image' : 'none',
        coverImageId
      })
      result.imported++
      result.titles.push(d.title)
    } catch (e) {
      result.errors.push(`${d.title}：${e instanceof Error ? e.message : String(e)}`)
      result.skipped++
    }
  }

  return result
}
