/**
 * 分类图标的取值与渲染约定。
 *
 * 历史上分类图标直接存 emoji 文本（如 📂）；改为从「图标管理/图标库」选择后，
 * 存的是图片地址（/icons/<name>.<ext>、dataUrl 或 http(s) 外链）。
 * 两类值需要长期共存：旧分类仍是 emoji，新选的是图片地址，
 * 因此各渲染处统一用 isImageIcon() 判断，图片走 <img>，否则按文本（emoji）原样显示。
 */

/** 是否为图片类图标地址（图标库图标 / 自定义图标 dataUrl / 外链图片） */
export function isImageIcon(icon: string | undefined | null): boolean {
  if (!icon) return false
  return /^data:image\//i.test(icon) || icon.startsWith('/') || /^https?:\/\//i.test(icon)
}
