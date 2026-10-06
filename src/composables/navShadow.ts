/**
 * 导航关键键的 localStorage 影子副本（nav shadow）
 *
 * ## 为什么要影子
 * v18 把导航偏好从 localStorage 迁到 IndexedDB 的 `nav` store，解决了 localStorage 容量与频繁写入的问题，
 * 但代价是：nav store 成了**唯一副本**。一旦它失联，user-sites 会「静默变成空」：
 *   - iOS Safari 对长时间无交互的站点会驱逐 IndexedDB；
 *   - 隐私模式 / 磁盘配额 / 多标签页触发版本升级被阻塞（onblocked）/ STRICT 策略下 IDB 直接不可用；
 * 而应用会把这份空态当成「用户清空了」继续跑，随后写回并推送上云，连锁清空其它设备。
 *
 * ## 影子做什么
 * 用**另一种存储介质**（localStorage）给关键键留一份只读冗余：
 *   - 写：随 nav 正式写入同步更新（`writeShadow`），任何异常都吞掉，绝不打断主流程；
 *   - 读：IDB 侧为空而影子非空 → 判定「存储丢失」，由 useNavPrefs 用影子回填并把数据重新写回 IDB。
 *
 * ## 有意不做影子的键
 * - `icon-cache` / `site-click-counts`：可再生成、非用户资产，且体积大；
 * - `user-background` / `site-favicon`：多为几百 KB 的 dataURL 图片，会把 localStorage 5MB 配额挤爆，
 *   连带影响真正重要的 user-sites。
 * 每个值超过 SHADOW_MAX_VALUE_LEN 也会被跳过（宁可少影一个键，也不让 localStorage 抛 QuotaExceededError）。
 */

/** 影子写 localStorage 的键前缀，避免与历史迁移前的同名键混淆（`ewt-nav-shadow::user-sites`） */
export const SHADOW_PREFIX = 'ewt-nav-shadow::'
/** 单个值超过此长度就不影子（默认 512KB，给 localStorage 留出余量） */
export const SHADOW_MAX_VALUE_LEN = 512 * 1024
/** 影子最后写入时间（ISO 串），仅用于排障日志 */
export const SHADOW_STAMP_KEY = `${SHADOW_PREFIX}__at`

/**
 * 参与影子的导航键：全部为「丢了不可重建」的用户配置类小数据。
 * 与 useIdb.NAV_STORE_KEYS 的交集，不含图片/缓存类。
 */
export const NAV_SHADOW_KEYS = [
  'user-sites',
  'user-categories',
  'user-deleted-legacy-ids',
  'user-search-engines',
  'user-deleted-engine-ids',
  'user-disabled-engine-ids',
  'built-in-engine-overrides',
  'built-in-engine-default',
  'user-theme',
  'site-title'
] as const

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/** 读取影子（本地无影子返回空对象） */
export function readShadow(): Record<string, string> {
  const s = safeStorage()
  if (!s) return {}
  const out: Record<string, string> = {}
  try {
    for (const k of NAV_SHADOW_KEYS) {
      const v = s.getItem(SHADOW_PREFIX + k)
      if (v !== null && v !== '') out[k] = v
    }
  } catch {
    return {}
  }
  return out
}

/** 影子最后写入时间戳（毫秒；无影子返回 0） */
export function shadowStamp(): number {
  const s = safeStorage()
  if (!s) return 0
  try {
    const raw = s.getItem(SHADOW_STAMP_KEY)
    if (!raw) return 0
    const ms = Date.parse(raw)
    return Number.isFinite(ms) ? ms : 0
  } catch {
    return 0
  }
}

/**
 * 按当前 nav 记录刷新影子。
 * @param record 完整的 nav 记录（可以包含影子不关心的键，只挑 NAV_SHADOW_KEYS）
 * @returns 实际影子的键数量（0 = 一个都没影上）
 */
export function writeShadow(record: Record<string, string>): number {
  const s = safeStorage()
  if (!s) return 0
  let written = 0
  for (const k of NAV_SHADOW_KEYS) {
    const v = record[k]
    const key = SHADOW_PREFIX + k
    try {
      if (typeof v !== 'string' || v === '') {
        s.removeItem(key)
        continue
      }
      if (v.length > SHADOW_MAX_VALUE_LEN) {
        // 超大值（多为 dataURL）不进影子：它会挤爆 localStorage 配额
        s.removeItem(key)
        continue
      }
      // 值没变就跳过写入：localStorage 的 setItem 是同步且会触发磁盘写，
      // 而 getPref/setPref 每 400ms 就可能落盘一次，避免无谓开销
      const prev = s.getItem(key)
      if (prev === v) {
        written++
        continue
      }
      s.setItem(key, v)
      written++
    } catch {
      // 配额不足等问题：丢弃这一个键的影子，继续处理其它键，绝不向上抛
      try { s.removeItem(key) } catch { /* 忽略 */ }
    }
  }
  if (written > 0) {
    try {
      s.setItem(SHADOW_STAMP_KEY, new Date().toISOString())
    } catch {
      // 时间戳写不进去不影响数据影子本身
    }
  }
  return written
}

/** 清空全部影子（显式「恢复出厂/清空导航数据」时用，避免影子把旧数据又喂回来） */
export function clearShadow(): void {
  const s = safeStorage()
  if (!s) return
  try {
    for (const k of NAV_SHADOW_KEYS) s.removeItem(SHADOW_PREFIX + k)
    s.removeItem(SHADOW_STAMP_KEY)
  } catch {
    // 忽略
  }
}
