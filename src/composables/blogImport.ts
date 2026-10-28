/**
 * 博客 Markdown 导入（浏览器侧 composable）
 *
 * 场景：把本地写好的 `.md`（含同名封面图）批量导入博客后台，落到指定分类，
 * 生成「草稿」文章，随后即可用现有「预览公众号 / 发送公众号草稿箱」流程。
 *
 * 关键约定（与博客数据层对齐）：
 * - 正文图片不是普通 URL，而是短引用 `![alt](img:<id>)`，图片本体 base64 存 `BlogData.images`；
 *   封面单独走文章 `coverImageId`。因此导入时必须把 md 里的本地图片路径
 *   （如 `images/2026-10-28-cover.png`）转成图片库条目并改写引用。
 * - 第一张图片视为「封面」，从正文移除并写入 `coverImageId`；其余图片改写为 `img:<id>` 内联。
 * - 分类按「名称」查找，缺失自动创建；文章以 `draft` 状态落库。
 * - 同标题（未删除）已存在则跳过，避免重复导入。
 *
 * 纯浏览器 API（File / FileReader），不依赖服务端；与站点部署位置无关。
 */
import { useBlogStore } from '@/stores/blog'

export interface ImportResult {
  /** 成功导入篇数 */
  imported: number
  /** 跳过篇数（已存在 / 空文件 / 读取失败） */
  skipped: number
  /** 错误明细（逐文件） */
  errors: string[]
  /** 成功导入的文章标题 */
  titles: string[]
}

/** Markdown 图片语法：![alt](src) —— src 不含右括号（文件名不含括号，够用） */
const IMG_MD_SOURCE = '!\\[([^\\]]*)\\]\\(([^)]+)\\)'
const IMG_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i

/** 取路径最后一段文件名（去 query/hash，兼容正反斜杠） */
function basename(p: string): string {
  const clean = (p || '').split('?')[0].split('#')[0]
  const seg = clean.split(/[\\/]/).pop() || clean
  return seg
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

/**
 * 导入一组文件（建议用 webkitdirectory 选择整个文章目录）。
 * @param files 文件夹选择得到的全部文件（含 .md 与 images/*.png）
 * @param opts.categoryName 目标分类名，默认「信贷晨读」
 */
export async function importMarkdownFolder(
  files: File[],
  opts: { categoryName?: string } = {}
): Promise<ImportResult> {
  const store = useBlogStore()
  const result: ImportResult = { imported: 0, skipped: 0, errors: [], titles: [] }

  // ---------- 1. 目标分类（按名称查找，缺失则创建） ----------
  const categoryName = (opts.categoryName || '信贷晨读').trim()
  let category = store.categories.find((c) => c.name.trim() === categoryName)
  if (!category) {
    const r = await store.addCategory(categoryName)
    if (!r.ok) result.errors.push(`创建分类「${categoryName}」失败：${r.reason ?? '未知原因'}`)
    category = store.categories.find((c) => c.name.trim() === categoryName)
  }
  const categoryId = category?.id

  // ---------- 2. 图片索引：文件名(小写) → File ----------
  // 优先 images/ 目录；忽略 _wm_backup（带水印备份）以免误配。
  const imageMap = new Map<string, File>()
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name
    if (rel.includes('_wm_backup')) continue
    if (!IMG_EXT_RE.test(f.name)) continue
    const key = f.name.toLowerCase()
    if (!imageMap.has(key) || /[\\/]images[\\/]/i.test(rel)) imageMap.set(key, f)
  }

  // ---------- 3. 仅处理根层（相对深度 ≤ 2）的 .md ----------
  const mdFiles = files.filter((f) => {
    const rel = f.webkitRelativePath || f.name
    const depth = rel.split(/[\\/]/).filter(Boolean).length
    return /\.md$/i.test(f.name) && depth <= 2
  })

  for (const mdFile of mdFiles) {
    try {
      const raw = await mdFile.text()
      if (!raw.trim()) {
        result.skipped++
        continue
      }

      const { title, body } = splitTitle(raw)
      const finalTitle = (title || mdFile.name.replace(/\.md$/i, '')).trim()
      if (!finalTitle) {
        result.skipped++
        continue
      }

      // 同标题已存在 → 跳过
      if (store.articles.some((a) => !a.deletedAt && a.title.trim() === finalTitle)) {
        result.skipped++
        continue
      }

      // 逐个解析正文图片引用
      let content = body
      let coverImageId: string | undefined
      const re = new RegExp(IMG_MD_SOURCE, 'g')
      let m: RegExpExecArray | null
      const refs: Array<{ whole: string; alt: string; src: string }> = []
      while ((m = re.exec(body)) !== null) {
        refs.push({ whole: m[0], alt: m[1] || '', src: (m[2] || '').trim() })
      }

      for (const item of refs) {
        if (item.src.startsWith('img:') || item.src.startsWith('data:')) continue
        const file = imageMap.get(basename(item.src).toLowerCase())
        if (!file) {
          // 本地相对路径但没匹配到图片（常见于「只选了 md 文件」）：
          // 移除该图片引用，避免预览/草稿箱里出现碎图。外部 http(s) 链接原样保留。
          if (!/^https?:\/\//i.test(item.src)) content = content.replace(item.whole, '')
          continue
        }
        const dataUrl = await readAsDataURL(file)
        if (!dataUrl.startsWith('data:image/')) continue
        const img = await store.addImage(file.name, dataUrl, file.size)

        if (coverImageId === undefined) {
          // 第一张图 = 封面：从正文移除该行
          coverImageId = img.id
          content = content.replace(item.whole, '')
        } else {
          content = content.replace(item.whole, `![${item.alt}](img:${img.id})`)
        }
      }

      // 清理移除封面后顶部多余空行
      content = content.replace(/^\s*\n+/, '').trimEnd()

      await store.createArticle({
        title: finalTitle,
        contentMarkdown: content,
        categoryId,
        coverKind: coverImageId ? 'image' : 'none',
        coverImageId
      })

      result.imported++
      result.titles.push(finalTitle)
    } catch (e) {
      result.errors.push(`${mdFile.name}：${e instanceof Error ? e.message : String(e)}`)
      result.skipped++
    }
  }

  return result
}
