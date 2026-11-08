/**
 * 博客 ZIP 导入：把「文章.md + images/」压缩包解成 File[]，复用 Markdown 导入链路。
 *
 * 为什么需要：只选一个 .md 时浏览器拿不到同目录的图片文件，导入后图片会缺失。
 * ZIP 让用户一次选择就把 md 与图片一起交进来；解包后附带「包内相对路径」映射，
 * 图片匹配与落库逻辑与「导入文件夹」完全一致。
 */
import JSZip from 'jszip'
import { emptyImportResult, importMarkdownFolder } from './blogImport'
import type { ImportResult } from './blogImport'

const ZIP_EXT_RE = /\.zip$/i
// ZIP 条目不带 MIME，解包后必须显式补上：否则 FileReader 产出 data:application/octet-stream，
// 导入层会按「非图片」跳过，图片就静默丢了。
const IMG_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif'
}

/**
 * 导入一组 ZIP（可多选），包内可含多篇文章与各自的 images/ 目录。
 * @param opts.categoryName 目标分类名，透传给 Markdown 导入
 */
export async function importZipFiles(
  files: File[],
  opts: { categoryName?: string } = {}
): Promise<ImportResult> {
  const zips = files.filter((f) => ZIP_EXT_RE.test(f.name))
  if (zips.length === 0) return emptyImportResult(['没有可导入的 ZIP 文件'])

  const errors: string[] = []
  const out: File[] = []
  const relByFile = new WeakMap<File, string>()
  for (const z of zips) {
    try {
      const zip = await JSZip.loadAsync(await z.arrayBuffer())
      const entries = Object.values(zip.files).filter(
        (e) => !e.dir && !e.name.split('/').includes('__MACOSX')
      )
      const paths = entries.map((e) => e.name.split('/').filter(Boolean))
      // macOS 右键压缩常带单一顶层目录；剥掉它，避免 md 被判成第 3 层而漏导入
      const top = paths.length > 0 && paths.every((p) => p.length > 1 && p[0] === paths[0][0])
        ? paths[0][0]
        : ''
      for (let i = 0; i < entries.length; i++) {
        const parts = paths[i]
        if (!parts.length || parts.some((s) => s.startsWith('._'))) continue
        const rel = (top ? parts.slice(1) : parts).join('/')
        if (!rel) continue
        const blob = await entries[i].async('blob')
        const name = parts[parts.length - 1] || ''
        const ext = name.split('.').pop()?.toLowerCase() ?? ''
        const file = new File([blob], name, { type: IMG_MIME[ext] ?? '' })
        relByFile.set(file, rel)
        out.push(file)
      }
    } catch (e) {
      errors.push(`${z.name}：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (out.length === 0) return emptyImportResult([...errors, 'ZIP 内没有可导入的文件'])

  const res = await importMarkdownFolder(out, { ...opts, pathOf: (f) => relByFile.get(f) ?? '' })
  return { ...res, errors: [...errors, ...res.errors] }
}
