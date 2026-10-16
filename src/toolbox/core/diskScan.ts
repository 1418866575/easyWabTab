/**
 * 磁盘清理：纯逻辑（类型分类 / 目录过滤 / 大小格式化）
 *
 * 零 Vue、零浏览器 API 依赖，可被 node 直测。
 */

export type FileKind = 'video' | 'audio' | 'image' | 'archive' | 'installer' | 'doc' | 'other'

export interface KindOption {
  id: FileKind
  name: string
  /** 归属扩展名（小写、无点）；空数组表示「兜底分类」 */
  exts: string[]
}

export const FILE_KINDS: KindOption[] = [
  {
    id: 'video',
    name: '视频',
    exts: ['mp4', 'mkv', 'avi', 'mov', 'rmvb', 'rm', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg', '3gp', 'ts', 'webm', 'vob']
  },
  { id: 'audio', name: '音频', exts: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma', 'ape', 'opus', 'aiff'] },
  {
    id: 'image',
    name: '图片',
    exts: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'heif', 'tif', 'tiff', 'ico', 'raw', 'psd']
  },
  { id: 'archive', name: '压缩包', exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'cab', 'iso', 'lz', 'lzma'] },
  { id: 'installer', name: '安装包', exts: ['exe', 'msi', 'dmg', 'pkg', 'apk', 'deb', 'rpm', 'appimage', 'ipa', 'msix'] },
  {
    id: 'doc',
    name: '文档',
    exts: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'epub', 'mobi', 'csv', 'rtf']
  },
  { id: 'other', name: '其他', exts: [] }
]

/** 默认选中类型（不含「其他」，避免扫出大量零散小文件） */
export const DEFAULT_KINDS: FileKind[] = ['video', 'archive', 'installer', 'image', 'audio']

/** 结果上限：防止大分区扫出海量条目拖垮页面 */
export const MAX_RESULTS = 5000

/**
 * 跳过目录：系统目录 / 软件安装目录 / 依赖与构建产物。
 * 扫描它们既慢（文件数百万级）又危险（误删会导致系统或工程不可用）。
 */
const SKIP_DIR_SET = new Set([
  'windows', 'program files', 'program files (x86)', 'programdata', '$recycle.bin',
  'system volume information', 'recovery', 'winsxs', 'perflogs', 'appdata',
  'node_modules', '.git', '.svn', '.idea', '.vscode', '.gradle', '.m2', '.terraform',
  '__pycache__', 'venv', '.venv', 'dist', 'build', 'coverage', '.next', '.nuxt', '.cache'
])

/** 取扩展名（小写、无点）；无扩展名或隐藏文件返回空串 */
export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i <= 0 ? '' : name.slice(i + 1).toLowerCase()
}

/** 扩展名 → 文件类型；未知归为 other */
export function kindOfExt(ext: string): FileKind {
  if (!ext) return 'other'
  for (const k of FILE_KINDS) {
    if (k.exts.length && k.exts.includes(ext)) return k.id
  }
  return 'other'
}

/** 类型 id → 中文名 */
export function kindName(id: FileKind): string {
  const k = FILE_KINDS.find(x => x.id === id)
  return k ? k.name : '其他'
}

/** 是否跳过该目录 */
export function shouldSkipDir(dirName: string): boolean {
  return SKIP_DIR_SET.has(dirName.trim().toLowerCase())
}

/** 命中判断：扩展名属于选中类型之一则返回该类型，否则 null */
export function matchKind(ext: string, kinds: FileKind[]): FileKind | null {
  if (!kinds.length) return null
  const k = kindOfExt(ext)
  return kinds.includes(k) ? k : null
}

/** 字节 → 人类可读（B/KB/MB/GB/TB） */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`
}

/** 拼接相对路径 */
export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}
