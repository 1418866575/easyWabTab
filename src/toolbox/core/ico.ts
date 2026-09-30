/**
 * ICO 容器封装纯函数（零依赖）
 * ICO 结构：ICONDIR(6B) + ICONDIRENTRY(16B×n) + 各尺寸图片数据（PNG 可直接嵌入）
 */

export interface IcoImage {
  size: number
  png: Uint8Array
}

function u16(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff]
}

function u32(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]
}

/** 组装 ICO 字节流 */
export function buildIco(images: IcoImage[]): Uint8Array {
  const list = images.filter(i => i.size > 0 && i.png && i.png.length)
  const header = [...u16(0), ...u16(1), ...u16(list.length)]
  const entries: number[] = []
  let offset = 6 + 16 * list.length
  list.forEach(img => {
    const dim = img.size >= 256 ? 0 : img.size
    entries.push(dim, dim, 0, 0, ...u16(1), ...u16(32), ...u32(img.png.length), ...u32(offset))
    offset += img.png.length
  })
  const total = 6 + 16 * list.length + list.reduce((s, i) => s + i.png.length, 0)
  const out = new Uint8Array(total)
  let p = 0
  header.forEach(b => (out[p++] = b))
  entries.forEach(b => (out[p++] = b))
  list.forEach(img => {
    out.set(img.png, p)
    p += img.png.length
  })
  return out
}

/** 生成 manifest.json 文本 */
export function buildManifest(appName: string, icons: { src: string; sizes: string; type: string }[]): string {
  return JSON.stringify(
    {
      name: appName || 'My App',
      short_name: appName || 'App',
      icons: icons.map(i => ({ src: i.src, sizes: i.sizes, type: i.type })),
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone'
    },
    null,
    2
  )
}

/** 生成 HTML <link> 片段 */
export function buildHtmlLinks(prefix = '/', sizes = [16, 32, 180, 192, 512]): string {
  const lines = sizes.map(s => {
    const rel = s === 180 ? 'apple-touch-icon' : 'icon'
    return `<link rel="${rel}" sizes="${s}x${s}" href="${prefix}favicon-${s}.png">`
  })
  lines.push(`<link rel="icon" type="image/x-icon" href="${prefix}favicon.ico">`)
  lines.push(`<link rel="manifest" href="${prefix}manifest.json">`)
  return lines.join('\n')
}

/** 常用 Favicon 尺寸集 */
export const FAVICON_SIZES = [16, 32, 48, 64, 128, 180, 192, 512]
