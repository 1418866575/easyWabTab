/**
 * 连通性检测纯函数（零 Vue 依赖，可被 node --experimental-strip-types 直测）
 *
 * ⚠️ 能力边界（务必在 UI 注明）：
 * 浏览器出于安全限制**无法发送 ICMP 报文**，因此本页不是系统级 ping，
 * 而是用「DNS 解析耗时 + HTTP(S) 握手耗时」近似判断目标是否可达。
 * - 目标为域名/主机名：可反映 DNS 解析与 HTTP 握手是否成功；
 * - 目标为 IP：跳过 DNS，直接测 HTTP 握手；
 * - 浏览器 fetch 受同源策略约束，非简单请求可能因 CORS 被浏览器拦截，
 *   此时会得到「拒绝」但服务器其实在线——这属于浏览器限制而非目标不可达。
 */

/** 单个目标的检测结果 */
export interface ProbeResult {
  /** 原始输入 */
  input: string
  /** 归一化后的探测 URL */
  url: string
  /** 展示用主机（不含协议） */
  host: string
  /** 是否通过 */
  ok: boolean
  /** 文字状态：通过 → 「通过」，未通过 → 「拒绝」 */
  status: '通过' | '拒绝'
  /** 耗时（ms），失败为 undefined */
  ms?: number
  /** HTTP 状态码（如有） */
  statusCode?: number
  /** 失败/说明信息 */
  message: string
}

/** 逗号（中英文）分隔目标 */
export function splitTargets(input: string): string[] {
  return (input || '')
    .split(/[,，\n]/)
    .map(s => s.trim())
    .filter(Boolean)
}

/** 是否为 IPv4 / IPv6 粗判（用于决定是否跳过 DNS 说明） */
export function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^[0-9a-fA-F:]+$/.test(host) && host.includes(':')
}

/**
 * 归一化用户输入 → 探测 URL
 * - 无协议：按 http:// 尝试（探测连通性，够用且不受 https 证书影响）
 * - 支持 host:port
 * - 去掉末尾斜杠与路径
 */
export function normalizeTarget(input: string): { url: string; host: string } {
  let raw = (input || '').trim()
  if (!raw) return { url: '', host: '' }
  if (!/^https?:\/\//i.test(raw)) raw = 'http://' + raw
  // 去掉尾部斜杠
  raw = raw.replace(/\/+$/, '')
  const m = raw.match(/^https?:\/\/([^/?#]+)/i)
  const host = m ? m[1] : raw.replace(/^https?:\/\//i, '')
  return { url: raw, host }
}

/** 超时包装的 fetch 探测：返回耗时与状态 */
export async function probeOnce(
  url: string,
  timeoutMs = 5000
): Promise<{ ok: boolean; ms?: number; statusCode?: number; message: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  try {
    // no-cors 下拿不到状态码，但能判定「网络层是否可达」；同源则走 cors 拿状态码
    const res = await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
    const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
    clearTimeout(timer)
    return { ok: true, ms, message: '网络层可达' }
  } catch (err) {
    const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
    clearTimeout(timer)
    const name = (err as Error)?.name
    if (name === 'AbortError') return { ok: false, ms, message: `超时（>${timeoutMs}ms）` }
    // TypeError 多为 DNS 失败 / 连接被拒 / 混合内容拦截
    return { ok: false, ms, message: (err as Error)?.message || '连接失败' }
  }
}

/** 汇总统计 */
export function summarize(list: ProbeResult[]): { total: number; pass: number; fail: number } {
  const pass = list.filter(r => r.ok).length
  return { total: list.length, pass, fail: list.length - pass }
}
