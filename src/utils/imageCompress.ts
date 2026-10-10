// 原图压缩工具：把用户选中的图片文件转成尺寸受限的 JPEG dataURL。
//
// 用途：习惯打卡附图、日记插图等需要把图片内联进 IndexedDB 并经云同步信封搬运的场景——
// 原图动辄 3~8MB，直接入库会撑爆配额并让每次同步都卡住，故统一「先压缩再存储」。
//
// 硬约束：纯 TS 工具，禁 import vue/pinia；只依赖浏览器 API（Image / canvas / createImageBitmap）。
// 本模块只负责「压 + 转」，字节数估算与数据结构归一化分别由各自的 core 承担，避免重复实现。

/** 压缩参数：maxEdge 长边像素上限；quality JPEG 质量（0-1）。 */
export interface CompressOptions {
  maxEdge?: number
  quality?: number
  mime?: string
}

/** 压缩结果：dataUrl（'data:image/jpeg;base64,...'）+ 压缩后实际像素尺寸。 */
export interface CompressedImage {
  dataUrl: string
  width: number
  height: number
}

/** 默认长边：1280px —— 手机相册缩略图级别，肉眼几乎无损、体积约 200~400KB。 */
export const DEFAULT_IMAGE_MAX_EDGE = 1280
/** 默认 JPEG 质量：0.72 —— 与长边组合后单张普遍落在 300KB 内。 */
export const DEFAULT_IMAGE_QUALITY = 0.72

/** 读取为 dataURL（reject：读取失败/被中断）。 */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('读取结果不是字符串'))
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

/** 解码为可绘制的位图：优先 createImageBitmap（可按 EXIF 修正手机照片方向），不支持或失败则回退 <img>。 */
async function decodeBitmap(file: File, fallbackSrc: string): Promise<{ draw: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // from-image：按图片自带 EXIF 方向旋转，避免竖拍照片在详情页横躺
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { draw: bitmap, width: bitmap.width, height: bitmap.height }
    } catch {
      /* 落到 <img> 分支 */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ draw: img, width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = fallbackSrc
  })
}

/**
 * 压缩单张图片：等比缩放到长边 ≤ maxEdge，重绘为 JPEG（质量 quality）。
 * 透明通道处理：JPEG 无 alpha，先把画布铺白再绘制，否则 PNG 透明区域会被渲染成黑块。
 * 已小于目标尺寸的图同样会被重绘（统一输出格式，避免混存 PNG/WebP 造成体积不可控）。
 * 失败（读取/解码失败）时 reject，由调用方决定提示文案。
 */
export async function compressImageFile(file: File, options: CompressOptions = {}): Promise<CompressedImage> {
  const maxEdge = options.maxEdge ?? DEFAULT_IMAGE_MAX_EDGE
  const quality = options.quality ?? DEFAULT_IMAGE_QUALITY
  const mime = options.mime ?? 'image/jpeg'
  const src = await readAsDataUrl(file)
  const bitmap = await decodeBitmap(file, src)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布上下文')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap.draw, 0, 0, width, height)
  // 部分浏览器 Bitmap 需显式释放，避免大图长时间占用显存
  if ('close' in bitmap.draw && typeof (bitmap.draw as ImageBitmap).close === 'function') {
    (bitmap.draw as ImageBitmap).close()
  }
  return { dataUrl: canvas.toDataURL(mime, quality), width, height }
}
