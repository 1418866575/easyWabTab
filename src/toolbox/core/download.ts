/**
 * 下载相关纯函数（依赖 DOM，供工具组件调用；node 直测不涉及）
 * 统一走 Blob + createObjectURL，用完立即释放，避免内存泄漏。
 */

/** 下载文本 */
export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(filename, new Blob([text], { type: mime }))
}

/** 下载 Blob */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** DataURL / Blob → 下载 */
export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** 带 BOM 的文本（Excel 打开 CSV 不乱码） */
export function csvBlob(text: string): Blob {
  return new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' })
}

/** 文件大小的人类可读表示 */
export function humanSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  const s = n >= 100 || i === 0 ? String(Math.round(n)) : n.toFixed(1)
  return `${s.replace(/\.0$/, '')} ${units[i]}`
}
