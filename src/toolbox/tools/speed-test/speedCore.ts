/**
 * 网络测速纯逻辑
 *
 * 口径：
 * - 带宽 = 字节数 × 8 / 耗时，单位 Mbps（1 Mbps = 1e6 bit/s）
 * - 延迟取样本中位数（抗单次抖动），抖动 = 样本平均绝对偏差
 */

export interface SpeedSample {
  bytes: number
  ms: number
}

export function calcSpeedMbps(bytes: number, ms: number): number {
  if (!Number.isFinite(bytes) || !Number.isFinite(ms) || bytes <= 0 || ms <= 0) return 0
  return (bytes * 8) / (ms / 1000) / 1e6
}

export function median(values: number[]): number {
  const list = values.filter((v) => Number.isFinite(v) && v > 0).slice().sort((a, b) => a - b)
  if (!list.length) return 0
  const mid = Math.floor(list.length / 2)
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2
}

/** p 分位（0~1），线性插值 */
export function percentile(values: number[], p: number): number {
  const list = values.filter((v) => Number.isFinite(v) && v > 0).slice().sort((a, b) => a - b)
  if (!list.length) return 0
  const idx = Math.min(list.length - 1, Math.max(0, (list.length - 1) * Math.min(1, Math.max(0, p))))
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return lo === hi ? list[lo] : list[lo] + (list[hi] - list[lo]) * (idx - lo)
}

export function jitter(values: number[]): number {
  const m = median(values)
  if (!m || !values.length) return 0
  const dev = values.map((v) => Math.abs(v - m))
  return median(dev)
}

export interface SpeedResult {
  /** 下行带宽 Mbps */
  mbps: number
  /** 延迟中位数 ms */
  latency: number
  /** 抖动 ms */
  jitterMs: number
  /** 总下载字节 */
  bytes: number
  /** 有效样本数 */
  samples: number
}

export function summarize(downloads: SpeedSample[], pings: number[]): SpeedResult {
  const bytes = downloads.reduce((s, d) => s + (d.bytes > 0 ? d.bytes : 0), 0)
  const speeds = downloads.map((d) => calcSpeedMbps(d.bytes, d.ms)).filter((v) => v > 0)
  // 取 75 分位：剔除首样本慢启动与异常中断的低值
  const mbps = speeds.length ? percentile(speeds, 0.75) : 0
  return {
    mbps,
    latency: median(pings),
    jitterMs: jitter(pings),
    bytes,
    samples: speeds.length
  }
}

/** 速度档位描述（用于结果一句话解读） */
export function speedLabel(mbps: number): string {
  if (mbps <= 0) return '—'
  if (mbps < 5) return '较慢（仅够网页浏览）'
  if (mbps < 20) return '一般（可流畅看 1080P）'
  if (mbps < 100) return '良好（可看 4K）'
  return '优秀（多人共享无压力）'
}

/** 测速用静态资源（同源 backgrounds，≥100KB 才有测量意义） */
export const SPEED_ASSETS = ['bg0.jpg', 'bg1.jpg', 'bg2.jpg', 'bg3.jpg', 'bg4.jpg', 'bg5.jpg']
export const CONCURRENCY = 4
export const SINGLE_TIMEOUT_MS = 10_000
