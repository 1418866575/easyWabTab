/**
 * 站点图标「本地路径化」纯函数（零 vue/pinia 依赖，可被 node --experimental-strip-types 直测）
 *
 * 背景：站点引用的自定义图标在 IndexedDB 中以 base64（data URL）存储，直接写进导出的
 * Markdown 会产生极长、不可读的文本。这里在**导出**时把 base64 还原为真实图片文件
 * （与 Markdown 一起打成 ZIP，Markdown 内只留相对路径 `icons/xxx.png`），
 * 在**导入**时再把相对路径还原回 base64，使站点数据仍以 data URL 形式正常入库。
 *
 * 兼容性：
 * - 旧的 base64 导出文件仍可导入（检测到 data: 前缀直接透传）；
 * - 预置图标本身就是 `/icons/name.ext` 路径，原样保留、不进 ZIP；
 * - http(s)/其它绝对地址同样原样保留。
 */

/** data URL 判定 */
export function isDataUrl(v: unknown): v is string {
  return typeof v === 'string' && /^data:image\//i.test(v.trim())
}

/** 是否为需要「本地化」的图标：data URL（http(s)/绝对路径/相对路径不需要） */
export function needLocalize(v: unknown): boolean {
  return isDataUrl(v)
}

/** data URL → { mime, base64 } */
export function parseDataUrl(v: string): { mime: string; base64: string } | null {
  const m = v.trim().match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s)
  if (!m) return null
  return { mime: m[1], base64: m[2] }
}

/** mime → 扩展名 */
export function extOfMime(mime: string): string {
  const t = mime.toLowerCase()
  if (t.includes('svg+xml')) return 'svg'
  if (t.includes('png')) return 'png'
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg'
  if (t.includes('gif')) return 'gif'
  if (t.includes('webp')) return 'webp'
  if (t.includes('ico')) return 'ico'
  if (t.includes('bmp')) return 'bmp'
  return 'png'
}

/** 生成为文件取名的安全 slug：保留字母数字与中文，其余转下划线 */
export function safeSlug(input: string, fallback: string): string {
  const s = (input || '')
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/[^\w一-龥.-]/g, '')
    .slice(0, 40)
  return s || fallback
}

/**
 * 图标文件名登记表：为 data URL 分配稳定唯一的相对路径（形如 `icons/站点名.png`）。
 * 用普通对象 + Map 而非 class，便于与项目其它 core 风格一致并直接 node 直测。
 */
export interface IconNameTable {
  /** data URL → 相对路径 */
  byDataUrl: Map<string, string>
  /** 已占用的文件名（含扩展名） */
  used: Set<string>
}

export function createIconNameTable(): IconNameTable {
  return { byDataUrl: new Map(), used: new Set() }
}

/** 为 data URL 分配一个稳定且唯一的相对路径；同一 data URL 复用同一路径（天然去重） */
export function registerIconPath(table: IconNameTable, dataUrl: string, siteName: string, index: number): string {
  // 非 data URL（预置图标路径 / http(s) 地址）不参与本地化，原样返回
  if (!isDataUrl(dataUrl)) return dataUrl
  const hit = table.byDataUrl.get(dataUrl)
  if (hit) return hit
  const parsed = parseDataUrl(dataUrl)
  const ext = parsed ? extOfMime(parsed.mime) : 'png'
  const base = safeSlug(siteName, `icon_${index + 1}`)
  let name = `${base}.${ext}`
  let n = 1
  while (table.used.has(name)) {
    n += 1
    name = `${base}_${n}.${ext}`
  }
  table.used.add(name)
  const rel = `icons/${name}`
  table.byDataUrl.set(dataUrl, rel)
  return rel
}

/** 导出用：表内全部 data URL → 相对路径 */
export function iconPathEntries(table: IconNameTable): Array<{ dataUrl: string; path: string }> {
  return [...table.byDataUrl.entries()].map(([dataUrl, path]) => ({ dataUrl, path }))
}
