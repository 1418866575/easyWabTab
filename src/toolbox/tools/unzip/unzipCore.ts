/**
 * 在线解压 ZIP · 纯逻辑
 *
 * 说明：
 * - 解析交给 fflate（组件里调用），这里只做展示层的清洗与判定
 * - 不处理加密 ZIP：fflate 不支持 ZipCrypto / AES 加密，组件的 catch 会给出明确提示
 */

export interface ZipEntryView {
  name: string
  size: number
  dir: boolean
  /** 顶层文件名（用于目录聚合展示） */
  depth: number
}

const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'json', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'xml', 'html', 'htm', 'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue',
  'py', 'java', 'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'rb', 'sh', 'bat', 'sql',
  'csv', 'tsv', 'log', 'properties', 'gitignore', 'env'
])

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  txt: 'text/plain;charset=utf-8',
  json: 'application/json',
  xml: 'application/xml'
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  if (i < 0) return ''
  return name.slice(i + 1).toLowerCase()
}

export function isTextEntry(name: string): boolean {
  const base = name.split('/').pop() ?? name
  if (base.startsWith('.') && TEXT_EXT.has(base.slice(1))) return true
  return TEXT_EXT.has(extOf(base))
}

export function mimeOf(name: string): string {
  return MIME_MAP[extOf(name)] ?? 'application/octet-stream'
}

/** 展示上限：条目过多时只渲染前 N 条，避免列表卡死 */
export const MAX_ENTRIES = 2000
/** 文本预览上限 */
export const MAX_PREVIEW = 200 * 1024

export function listEntries(files: Record<string, Uint8Array>): ZipEntryView[] {
  return Object.keys(files)
    .map((raw) => {
      const name = raw.replace(/\\/g, '/')
      return {
        name,
        size: files[raw].length,
        dir: name.endsWith('/'),
        depth: name.replace(/\/$/, '').split('/').length - 1
      }
    })
    .filter((e) => e.name !== '' && !e.dir)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`
}

/** 按输入框关键字过滤（不区分大小写，匹配路径任意位置） */
export function filterEntries(list: ZipEntryView[], keyword: string): ZipEntryView[] {
  const k = keyword.trim().toLowerCase()
  if (!k) return list
  return list.filter((e) => e.name.toLowerCase().includes(k))
}
