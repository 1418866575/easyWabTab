/**
 * IP 查询 · 纯逻辑（地址解析与判定，不发起任何网络请求）
 *
 * 网络请求（公网 IP 回显、DoH 解析）放在组件里，便于这里保持可单测。
 */

export type IpVersion = 4 | 6

/** 地址性质：判定结果用于给用户解释「这个地址能不能在公网路由」 */
export type IpNature =
  | 'public'
  | 'private'
  | 'loopback'
  | 'linklocal'
  | 'multicast'
  | 'reserved'
  | 'cgnat'
  | 'unspecified'
  | 'unknown'

export const NATURE_LABEL: Record<IpNature, string> = {
  public: '公网地址',
  private: '私有地址（内网）',
  loopback: '回环地址',
  linklocal: '链路本地地址',
  multicast: '组播地址',
  reserved: '保留地址',
  cgnat: '运营商级 NAT 地址',
  unspecified: '未指定地址',
  unknown: '无法识别'
}

export function isValidIpv4(ip: string): boolean {
  const s = ip.trim()
  const parts = s.split('.')
  if (parts.length !== 4) return false
  // 拒绝前导零（01.2.3.4 视为非法），0 本身合法
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && (p === '0' || !p.startsWith('0')))
}

export function isValidIpv6(ip: string): boolean {
  const s = ip.trim()
  if (!s || /[^0-9a-fA-F:.%]/.test(s)) return false
  const zone = s.indexOf('%')
  const body = zone >= 0 ? s.slice(0, zone) : s
  if (!body.includes(':')) return false
  if (body.includes(':::')) return false
  const [head, tail] = body.split('::')
  const countGroups = (x: string) => (x ? x.split(':').filter(Boolean) : [])
  const headGroups = countGroups(head ?? '')
  const tailGroups = countGroups(tail ?? '')
  const compressed = body.includes('::')
  const all = compressed ? headGroups.concat(tailGroups) : body.split(':')
  if (!all.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return false
  if (!compressed) return all.length === 8
  return all.length <= 7
}

export function versionOf(ip: string): IpVersion | null {
  if (isValidIpv4(ip)) return 4
  if (isValidIpv6(ip)) return 6
  return null
}

function ipv4ToInt(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, p) => (acc << 8) + Number(p), 0) >>> 0
}

function inCidr(ipInt: number, cidr: string, bits: number): boolean {
  const [base] = cidr.split('/')
  const b = ipv4ToInt(base)
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (ipInt & mask) === (b & mask)
}

export function ipv4Nature(ip: string): IpNature {
  const n = ipv4ToInt(ip)
  if (n === 0) return 'unspecified'
  if (inCidr(n, '127.0.0.0', 8)) return 'loopback'
  if (inCidr(n, '10.0.0.0', 8)) return 'private'
  if (inCidr(n, '172.16.0.0', 12)) return 'private'
  if (inCidr(n, '192.168.0.0', 16)) return 'private'
  if (inCidr(n, '100.64.0.0', 10)) return 'cgnat'
  if (inCidr(n, '169.254.0.0', 16)) return 'linklocal'
  if (inCidr(n, '224.0.0.0', 4)) return 'multicast'
  if (inCidr(n, '240.0.0.0', 4)) return 'reserved'
  if (inCidr(n, '192.0.2.0', 24) || inCidr(n, '198.51.100.0', 24) || inCidr(n, '203.0.113.0', 24)) return 'reserved'
  return 'public'
}

export function ipv6Nature(ip: string): IpNature {
  const s = ip.split('%')[0].toLowerCase()
  if (s === '::') return 'unspecified'
  if (s === '::1') return 'loopback'
  if (/^f[cd]/.test(s)) return 'private'
  if (/^fe[89ab]/.test(s)) return 'linklocal'
  if (/^ff/.test(s)) return 'multicast'
  return 'public'
}

export function natureOf(ip: string): IpNature {
  const v = versionOf(ip)
  if (v === 4) return ipv4Nature(ip.trim())
  if (v === 6) return ipv6Nature(ip.trim())
  return 'unknown'
}

export function isPrivateIp(ip: string): boolean {
  const n = natureOf(ip)
  return n !== 'public' && n !== 'unknown'
}

export function ipv4ToBinary(ip: string): string {
  return ip
    .split('.')
    .map((p) => Number(p).toString(2).padStart(8, '0'))
    .join('.')
}

export function ipv4ToDecimal(ip: string): number {
  return ipv4ToInt(ip.trim())
}

export interface CidrInfo {
  network: string
  broadcast: string
  first: string
  last: string
  usable: number
}

function intToIpv4(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

/** 按前缀长度计算网段信息（仅 IPv4） */
export function cidrInfo(ip: string, prefix: number): CidrInfo | null {
  if (!isValidIpv4(ip)) return null
  const bits = Math.max(0, Math.min(32, Math.trunc(prefix)))
  const n = ipv4ToInt(ip.trim())
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  const net = (n & mask) >>> 0
  const bcast = (net | (~mask >>> 0)) >>> 0
  // /31 与 /32 按点对点/主机路由对待，没有传统意义的广播与可用地址
  const usable = bits >= 31 ? bits === 32 ? 1 : 2 : bcast - net - 1
  return {
    network: `${intToIpv4(net)}/${bits}`,
    broadcast: intToIpv4(bcast),
    first: bits >= 31 ? intToIpv4(net) : intToIpv4(net + 1),
    last: bits >= 31 ? intToIpv4(bcast) : intToIpv4(bcast - 1),
    usable
  }
}

export function validateDomain(d: string): boolean {
  const s = d.trim().replace(/\.$/, '')
  if (!s || s.length > 253) return false
  const labels = s.split('.')
  if (labels.length < 2) return false
  return labels.every((l) => /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(l))
}

/** 公网 IP 回显服务（JSON 优先，其次纯文本）；逐个尝试，全部失败时给用户明确提示 */
export const ECHO_ENDPOINTS: { url: string; kind: 'json' | 'text' }[] = [
  { url: 'https://api.ipify.org?format=json', kind: 'json' },
  { url: 'https://api64.ipify.org?format=json', kind: 'json' },
  { url: 'https://icanhazip.com', kind: 'text' },
  { url: 'https://ifconfig.me/ip', kind: 'text' }
]

/** DoH 服务商（均返回 JSON 的 dns-json 格式） */
export const DOH_PROVIDERS: { id: string; name: string; url: string }[] = [
  { id: 'alidns', name: '阿里 DNS', url: 'https://dns.alidns.com/resolve' },
  { id: 'google', name: 'Google DNS', url: 'https://dns.google/resolve' },
  { id: 'cloudflare', name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' }
]

export interface DnsAnswer {
  type: string
  value: string
  ttl: number
}

/** 归一化 dns-json 响应（不同服务商字段名一致，这里只做防御式清洗） */
export function normalizeDns(json: unknown): DnsAnswer[] {
  const obj = json as { Answer?: { type?: number; data?: string; TTL?: number }[] } | null
  const list = Array.isArray(obj?.Answer) ? obj.Answer : []
  const typeName: Record<number, string> = { 1: 'A', 2: 'NS', 5: 'CNAME', 15: 'MX', 16: 'TXT', 28: 'AAAA' }
  return list
    .filter((a) => typeof a?.data === 'string')
    .map((a) => ({
      type: typeName[Number(a.type)] ?? String(a.type ?? '?'),
      value: String(a.data).replace(/^"|"$/g, ''),
      ttl: Number(a.TTL ?? 0)
    }))
}

export function buildDohUrl(providerUrl: string, name: string, type: string): string {
  return `${providerUrl}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`
}
