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
  // 非标准 base64 data URL（如 `data:image/svg+xml;utf8,<svg…>`、百分号编码的 data URL）
  // 解不出可写入文件的字节。若仍登记为相对路径，downloadMarkdown 会因 parseDataUrl 为 null
  // 跳过写文件 → ZIP 里没有对应图标 → 导入时路径无法还原，图标永久丢失。
  // 因此这类图标保持内联原样（Markdown 里直接写 data URL），确保至少不丢。
  if (!parsed) return dataUrl
  const ext = extOfMime(parsed.mime)
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

/* ------------------------------------------------------------------ */
/* 导入侧：把 ZIP 里的图标文件还原回 data URL（结构化还原，不靠文本替换）   */
/* ------------------------------------------------------------------ */

/** ZIP 内读出的图标文件：mime + 纯 base64（不含 data: 前缀） */
export interface IconFileEntry {
  mime: string
  base64: string
}

/**
 * 归一化图标路径为匹配键：统一分隔符、去掉 `./` 前缀、丢弃 `icons/` 之前的任意层级目录。
 *
 * 兼容场景：
 * - `icons/a.svg` 与 `./icons/a.svg`
 * - 被第三方工具重新打包成 `sites/icons/a.svg`（多一层目录）
 * - Windows 风格反斜杠 `icons\a.svg`
 * - 大小写差异
 *
 * 只保留 `icons/` 之后的文件名（小写），因此「Markdown 中的引用」与「ZIP 条目名」能对上。
 */
export function normalizeIconKey(p: string): string {
  let s = (p || '').trim().replace(/\\/g, '/')
  s = s.replace(/^\.\//, '')
  const i = s.toLowerCase().lastIndexOf('icons/')
  if (i >= 0) s = s.slice(i + 'icons/'.length)
  return s.toLowerCase()
}

/**
 * 判断某个 icon 值是否为「需要从 ZIP 还原的相对文件路径」。
 *
 * 只有这类值才尝试还原；以下一律原样保留：
 * - 空串 / 超长（base64 通常很长）
 * - `data:` 内联
 * - `http(s)://` 等带 scheme 的外链、协议相对 `//`
 * - 站内绝对路径 `/icons/xxx`（预置图标本身就是这种，属于 public 资源，不该被还原）
 * - emoji 等非路径文本（没有 `icons/` 也不带图片扩展名）
 */
export function isRelativeIconPath(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const s = v.trim()
  if (!s || s.length > 512) return false
  if (/^data:/i.test(s)) return false
  if (/^\/\//.test(s)) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return false
  if (s.startsWith('/')) return false
  if (/icons\//i.test(s)) return true
  return /\.(svg|png|jpe?g|gif|webp|ico|bmp)$/i.test(s)
}

/**
 * 把已解析数据里的「相对图标路径」就地还原为 data URL。
 *
 * 相比「在 Markdown 文本上做字符串替换」，结构化还原不受引号风格（`'x'` / `"x"` / 裸值）、
 * 换行符、目录层级、替换顺序影响，只要 ZIP 里存在对应文件就一定能换上。
 *
 * @returns restored：成功还原的图标数；missing：找不到对应文件的相对路径清单（去重）
 */
export function resolveIconFilesInParsed(
  parsed: { sites?: Array<{ icon?: string }>; categories?: Array<{ icon?: string }> },
  iconFiles: Record<string, IconFileEntry>
): { restored: number; missing: string[] } {
  const keyMap = new Map<string, IconFileEntry>()
  for (const [path, entry] of Object.entries(iconFiles)) keyMap.set(normalizeIconKey(path), entry)

  const missing: string[] = []
  const missingSet = new Set<string>()
  let restored = 0

  const convert = (target: { icon?: string }) => {
    const v = target.icon
    if (!isRelativeIconPath(v)) return
    const hit = keyMap.get(normalizeIconKey(v))
    if (hit) {
      target.icon = `data:${hit.mime};base64,${hit.base64}`
      restored += 1
      return
    }
    if (!missingSet.has(v)) {
      missingSet.add(v)
      missing.push(v)
    }
  }

  for (const s of parsed.sites || []) convert(s)
  for (const c of parsed.categories || []) convert(c)
  return { restored, missing }
}

/**
 * 判断「已存在记录」的图标是否应该被本次导入的图标补齐/修复。
 *
 * 背景：导入按 URL / id 去重，已存在的一律「跳过」。但用户很常见的场景是
 * **之前导入过同一份数据、当时图标没还原成功**（icon 为空，或残留 `icons/xxx` 相对路径），
 * 现在带着图标的 ZIP 再导一次 —— 若「跳过」时不补齐图标，还原结果就被整包丢掉了。
 *
 * 规则（只补不覆盖）：
 * - incoming 必须是**可用图标**：非空、且不是相对路径（相对路径说明文件也没还原成功）；
 * - existing 为空 → 补；
 * - existing 是相对路径（坏图）→ 修；
 * - existing 已是 data URL / emoji / 站内预置路径 / http 外链 → 保留不动。
 */
export function shouldFillIcon(existingIcon: unknown, incomingIcon: unknown): boolean {
  const inc = typeof incomingIcon === 'string' ? incomingIcon.trim() : ''
  if (!inc || isRelativeIconPath(inc)) return false
  const cur = typeof existingIcon === 'string' ? existingIcon.trim() : ''
  if (!cur) return true
  return isRelativeIconPath(cur)
}

