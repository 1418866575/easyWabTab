/**
 * 博客图片压缩（公众号 / 图库共用）。
 *
 * 为什么需要：正文图片原先由 FileReader 直读原图存 base64，一张 5MB 手机照 ≈ 6.7MB 字符串，
 * 既撑大 IndexedDB，也会随 blog.json 云同步信封整体上传（其它信封已因 base64 吃过大亏）。
 * 这里在上传前统一压到「最长边 ≤ maxEdge + JPEG 质量 quality」，并用 dataUrlBytes 给出真实体积，
 * 供界面提示与超大图拦截。
 *
 * 仅浏览器侧（依赖 Image / canvas）；已在允许体积内的小图原样返回，不做无意义重编码。
 */

export interface CompressResult {
  dataUrl: string
  /** 压缩后 base64 解码的真实字节数 */
  bytes: number
  /** 是否真的重编码过 */
  compressed: boolean
}

export interface CompressOptions {
  /** 最长边上限（px），默认 1600（公众号正文宽度下足够清晰） */
  maxEdge?: number
  /** JPEG 质量 0-1，默认 0.85 */
  quality?: number
  /** 体积小于该值且尺寸不超标时跳过压缩，默认 400KB */
  skipUnderBytes?: number
}

const DEFAULT_MAX_EDGE = 1600
const DEFAULT_QUALITY = 0.85
const DEFAULT_SKIP_UNDER_BYTES = 400 * 1024

/** data URL 的原始字节数（base64 的 3/4 修正 + 去掉 padding） */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  const b64 = dataUrl.slice(comma + 1)
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding)
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = dataUrl
  })
}

/**
 * 压缩图片 data URL。
 * - PNG/JPEG/WebP 一律输出 JPEG（体积最优）；原图带透明通道时先用白底填充，避免黑底
 * - 已经够小（尺寸不超标且体积 < skipUnderBytes）→ 原样返回，compressed=false
 * - 解码失败 → 抛错，由调用方按「跳过该图」处理
 */
export async function compressImageDataUrl(dataUrl: string, opts: CompressOptions = {}): Promise<CompressResult> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE
  const quality = opts.quality ?? DEFAULT_QUALITY
  const skipUnderBytes = opts.skipUnderBytes ?? DEFAULT_SKIP_UNDER_BYTES
  const originalBytes = dataUrlBytes(dataUrl)
  const img = await loadImage(dataUrl)
  const longest = Math.max(img.naturalWidth, img.naturalHeight)

  if (longest <= maxEdge && originalBytes <= skipUnderBytes) {
    return { dataUrl, bytes: originalBytes, compressed: false }
  }

  const scale = longest > maxEdge ? maxEdge / longest : 1
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 canvas 上下文')
  // 统一白底：JPEG 不支持透明，透明 PNG 直接转会变黑底
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  const out = canvas.toDataURL('image/jpeg', quality)
  const outBytes = dataUrlBytes(out)

  // 极端情况：重编码反而更大（如本就高度优化的 JPEG）→ 保留原图
  if (outBytes >= originalBytes && longest <= maxEdge) {
    return { dataUrl, bytes: originalBytes, compressed: false }
  }
  return { dataUrl: out, bytes: outBytes, compressed: true }
}

/** 人类可读体积：1.2 MB / 380 KB */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
