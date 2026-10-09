/**
 * 图标缓存服务
 *
 * v21 起存**独立** IndexedDB store `iconcache`，不再与 nav 的用户资产混在一起。
 *
 * 为什么要独立：图标缓存可达 MB 级，而 v20 及更早它与 user-sites 等
 * 同住 nav 的**一条记录**里，任何一次落盘都要把整包（含数 MB 图标）重新序列化 ——
 * 写放大严重，移动端页面隐藏/卸载时的 IDB 事务更容易被浏览器中止。
 * 独立后，nav 侧只剩 KB 级用户资产，图标缓存的频繁更新不再牵动站点数据。
 */

import { idbGet, idbPut, ICON_CACHE_KEY } from '@/composables/useIdb'
import { getPref, deletePref } from '@/composables/useNavPrefs'

const CACHE_EXPIRY_DAYS = 30

interface CacheEntry {
  dataUrl: string
  timestamp: number
}

type IconCache = Record<string, CacheEntry>

/**
 * 内存缓存：原先每次 getCache() 都要同步 localStorage.getItem + JSON.parse
 * 整份 base64 图标缓存（可达 MB 级），而每张站点卡片渲染都会调用一次，
 * 首页渲染与滚动时被反复解析，造成明显的主线程阻塞。
 * 改为进程内保留一份，只在首次读取或写入时才真正解析 / 落盘。
 */
let memoryCache: IconCache | null = null
let loadPromise: Promise<void> | null = null

/**
 * 启动时从独立 store 装载（幂等）。
 *
 * v20 及更早图标缓存存在 nav 里，这里顺带完成迁移：
 * 读到旧值就搬到 `iconcache` store，并从 nav 删除，
 * 让 nav 彻底摆脱 MB 级数据（详见 IDB_ICONCACHE_STORES 注释）。
 */
export function ensureIconCacheLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const stored = await idbGet<IconCache>('iconcache')
        if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
          memoryCache = memoryCache ? { ...stored, ...memoryCache } : stored
          return
        }
      } catch {
        // 读取失败 → 走到下面的回退分支
      }
      // 回退：v20 及更早的值可能还留在 nav 里
      try {
        const legacy = getPref(ICON_CACHE_KEY)
        if (legacy) {
          const parsed = JSON.parse(legacy) as IconCache
          memoryCache = memoryCache ? { ...parsed, ...memoryCache } : parsed
          await idbPut('iconcache', memoryCache)
          // 迁走成功后才从 nav 删除：删除失败只是留一份冗余副本，不影响正确性
          await deletePref(ICON_CACHE_KEY)
          return
        }
      } catch {
        // 无旧值或解析失败 → 空缓存起步（图标可重建，不影响功能）
      }
      if (!memoryCache) memoryCache = {}
    })()
  }
  return loadPromise
}

/**
 * 从缓存获取完整数据（优先走内存）。
 *
 * 保持**同步**：getIconUrl 在组件渲染路径上被调用（SiteCard 等），不能改成 async。
 * 装载尚未完成时返回空缓存起步，图标会自动重新抓取，不会阻塞渲染。
 */
function getCache(): IconCache {
  if (memoryCache) return memoryCache
  memoryCache = {}
  return memoryCache
}

/** 落盘到独立 store；容量不足时清掉过期项重试一次 */
async function persist(cache: IconCache, retried: boolean): Promise<void> {
  try {
    await idbPut('iconcache', cache)
  } catch (e) {
    if (retried) {
      console.warn('[icon-cache] 持久化失败，本次缓存仅在内存中生效', e)
      return
    }
    const filtered = dropExpired(cache)
    memoryCache = filtered
    await persist(filtered, true)
  }
}

/** 剔除过期项（纯函数） */
function dropExpired(cache: IconCache): IconCache {
  const now = Date.now()
  const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  const filtered: IconCache = {}
  for (const [key, entry] of Object.entries(cache)) {
    if (now - entry.timestamp < expiryMs) filtered[key] = entry
  }
  return filtered
}

/**
 * 获取域名的缓存图标
 */
export function getCachedIcon(domain: string): string | null {
  const cache = getCache()
  return cache[domain]?.dataUrl ?? null
}

/**
 * 缓存图标（将 dataUrl 存入 localStorage）
 */
export function cacheIcon(domain: string, dataUrl: string): void {
  const cache = getCache()
  cache[domain] = {
    dataUrl,
    timestamp: Date.now()
  }
  void persist(cache, false)
}

/**
 * 从 URL 下载图标并转为 dataUrl
 */
async function fetchIconAsDataUrl(iconUrl: string): Promise<string | null> {
  try {
    const response = await fetch(iconUrl, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * 获取图标的最佳 URL
 * 优先：本地缓存 → Google Favicon API
 */
export function getIconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    const cached = getCachedIcon(domain)
    if (cached) return cached
    // 异步缓存（不阻塞返回）
    cacheIconAsync(domain, url)
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  } catch {
    return ''
  }
}

/**
 * 异步缓存图标（background fetch）
 * 从网页 HTML 中提取真实 icon URL，下载并缓存
 */
export async function cacheIconAsync(domain: string, pageUrl: string): Promise<void> {
  try {
    // 尝试从 allorigins 获取网页，提取 icon
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`
    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return
    const html = await response.text()

    // 提取 <link rel="icon"> 或 <link rel="shortcut icon">
    const iconMatch =
      html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i) ||
      html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon)["']/i)

    if (!iconMatch) return

    let iconHref = iconMatch[1]
    // 相对路径转绝对路径
    if (!iconHref.startsWith('http')) {
      const origin = new URL(pageUrl).origin
      iconHref = iconHref.startsWith('/')
        ? origin + iconHref
        : origin + '/' + iconHref
    }

    // 过滤非图片 URL
    if (!iconHref.match(/\.(ico|png|jpg|jpeg|svg|gif|webp)(\?|$)/i)) return

    const dataUrl = await fetchIconAsDataUrl(iconHref)
    if (dataUrl) {
      cacheIcon(domain, dataUrl)
    }
  } catch {
    // 完全静默失败，不影响正常流程
  }
}

/**
 * 获取用于 <img> src 的图标 URL
 * 优先级：site.icon（用户自定义）→ 本地缓存 → Google API → 默认图标
 */
export function getFaviconImgSrc(siteUrl: string, customIcon?: string): string {
  if (customIcon) return customIcon
  return getIconUrl(siteUrl)
}
