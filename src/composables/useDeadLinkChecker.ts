/**
 * 断链检测服务
 *
 * ## 为什么是三种结果，而不是"有效/无效"两种
 * 浏览器对**跨域**请求只能发 no-cors 请求，响应是 opaque 的 —— 拿得到「请求成功返回」这个事实，
 * 但读不到状态码。旧实现把 opaque 一律判为「有效」，于是 404/500 的站点也显示正常，
 * 检测结论等于不可信（比不检测更糟：用户会据此删掉真正能用的站，或留下已经挂掉的站）。
 *
 * 现在按浏览器**实际能证明的东西**分三态：
 *   - `ok`        ：读到 2xx/3xx（同源，或对方站点允许 CORS）→ 明确可用
 *   - `reachable` ：收到响应但状态不可读（跨域 opaque）→ 域名可达，状态未知
 *   - `fail`      ：请求本身失败（DNS 解析失败 / 连接被拒 / 超时）→ 明确不可用
 * 对应 `isValid`：`ok → true`、`fail → false`、`reachable → undefined`（未判定，不计入无效数）。
 *
 * ## 并发
 * 原来是串行 + 每个 URL 后 sleep 500ms，100 个站点要跑近 1 分钟。改为 6 路并发、不额外 sleep：
 * 单个主机仍受浏览器同域并发限制，整体请求量不变。
 */

/** 单次请求超时 */
const REQUEST_TIMEOUT = 8000
/** 并发探测数（再高对单机浏览器没意义，同域连接本就有上限） */
const CONCURRENCY = 6

export type LinkStatus = 'ok' | 'reachable' | 'fail'

export interface CheckResult {
  url: string
  /** true = 明确可达；false = 明确失败；undefined = 收到响应但跨域读不到状态 */
  isValid: boolean | undefined
  status: LinkStatus
  statusCode?: number
}

export interface CheckProgress {
  total: number
  current: number
  /** 明确失效数 */
  invalidCount: number
  /** 无法判定数（跨域 opaque） */
  unknownCount: number
}

interface ProbeOutcome {
  isValid: boolean | undefined
  status: LinkStatus
  statusCode?: number
}

/**
 * 单次探测。返回 null 表示请求本身失败（网络层），由调用方决定下一步。
 * `mode: 'no-cors'` 是刻意的：用默认 CORS 模式时对方没开 CORS 会直接 reject，
 * 与「域名挂了」无法区分，反而会把能用的站判成失效。
 */
async function probe(url: string, method: 'HEAD' | 'GET'): Promise<ProbeOutcome | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      mode: 'no-cors',
      cache: 'no-store'
    })
    if (response.type === 'opaque') {
      // DNS/TCP/TLS/HTTP 全通了才可能拿到 opaque 响应，但状态码被浏览器隐藏
      return { isValid: undefined, status: 'reachable', statusCode: 0 }
    }
    const ok = response.status >= 200 && response.status < 400
    return { isValid: ok, status: ok ? 'ok' : 'fail', statusCode: response.status }
  } catch {
    return null
  } finally {
    // 必须放 finally：原先只在成功路径 clearTimeout，fetch 抛错时定时器泄漏
    clearTimeout(timeout)
  }
}

/**
 * 检测单个 URL。先 HEAD（轻量），HEAD 被拒或网络失败再降级 GET。
 * HEAD 返回 405/501 不代表站点失效（很多服务器不支持 HEAD），必须换 GET 复核。
 */
async function checkUrl(url: string): Promise<CheckResult> {
  const head = await probe(url, 'HEAD')
  if (head && head.statusCode !== 405 && head.statusCode !== 501) {
    return { url, ...head }
  }
  const get = await probe(url, 'GET')
  if (get) return { url, ...get }
  return { url, isValid: false, status: 'fail' }
}

/**
 * 批量检测断链（并发池）。
 * @param urls 要检测的 URL 列表
 * @param onProgress 进度回调（每个结果回调一次，调用方可只更新进度、最后统一提交）
 * @param abortSignal 可选中断信号：已发出的请求会跑完，未开始的直接不再发起
 */
export async function checkDeadLinks(
  urls: string[],
  onProgress: (progress: CheckProgress, result: CheckResult) => void,
  abortSignal?: AbortSignal
): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  let cursor = 0
  let current = 0
  let invalidCount = 0
  let unknownCount = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      if (abortSignal?.aborted) return
      const index = cursor++
      if (index >= urls.length) return

      const result = await checkUrl(urls[index])
      results.push(result)
      current++
      if (result.isValid === false) invalidCount++
      else if (result.isValid === undefined) unknownCount++
      onProgress({ total: urls.length, current, invalidCount, unknownCount }, result)
    }
  }

  const workerCount = Math.max(1, Math.min(CONCURRENCY, urls.length))
  await Promise.all(Array.from({ length: workerCount }, worker))
  return results
}

/**
 * 保存检测结果到 localStorage。
 * 只存有明确结论的（ok/fail）：`reachable` 存成 true 就又会把「无法判定」伪装成「有效」。
 */
export function saveCheckResults(results: Array<Pick<CheckResult, 'url' | 'isValid'>>): void {
  const map: Record<string, boolean> = {}
  for (const r of results) {
    if (typeof r.isValid === 'boolean') map[r.url] = r.isValid
  }
  try {
    localStorage.setItem('link-check-results', JSON.stringify(map))
  } catch {
    /* 存储不可用时仅本次会话有效 */
  }
}

/**
 * 从 localStorage 加载检测结果
 */
export function loadCheckResults(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('link-check-results')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * 清除所有检测结果
 */
export function clearCheckResults(): void {
  localStorage.removeItem('link-check-results')
}
