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

/** 拷贝文本到剪贴板（带 execCommand 降级） */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
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

/** PDF 的 MIME 类型 */
export const PDF_MIME = 'application/pdf'

/**
 * 二进制字节 → Blob。
 *
 * pdf-lib 的 `doc.save()` 返回 `Promise<Uint8Array>`，而 TS 5.7 起 Uint8Array 的
 * 泛型参数 `ArrayBufferLike`（含 SharedArrayBuffer）与 `BlobPart` 要求的
 * `ArrayBufferView<ArrayBuffer>` 不兼容，直接 `new Blob([bytes])` 会报 TS2322
 * （6 个 PDF 工具同时踩这个坑）。
 *
 * 统一在此处收口：`bytes.buffer` 已是 `ArrayBufferLike`，直接断言成 ArrayBuffer
 * 是安全的——pdf-lib 内部用的是 `new Uint8Array(len)` 这类普通 ArrayBuffer，
 * 不会分配 SharedArrayBuffer。
 */
export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as unknown as BlobPart], { type: PDF_MIME })
}
