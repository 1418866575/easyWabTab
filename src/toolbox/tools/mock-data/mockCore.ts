/**
 * 随机数据生成器纯逻辑
 *
 * 用法：写一个含占位符的 JSON 模板，例如
 *   { "name": "@name", "age": "@int(18,60)", "vip": "@bool", "tag": "@pick(A,B,C)" }
 * 占位符列表见 PLACEHOLDERS；支持固定 seed 复现同一批数据。
 */

export type Rng = () => number

/** 线性同余生成器（可复现） */
export function makeRng(seed?: number): Rng {
  let s = (typeof seed === 'number' && Number.isFinite(seed) ? Math.trunc(seed) : Date.now()) >>> 0
  if (s === 0) s = 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

export const MAX_COUNT = 500

const SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高郑梁谢宋唐许韩冯邓曹彭曾肖田董潘袁蔡蒋余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'.split('')
const GIVEN = '伟芳娜秀英敏静丽强磊军洋勇艳杰娟涛明超霞平刚桂英华玉兰春梅晓东建国志文心怡浩然子轩雨桐思远梦琪皓轩'.split('')
const CITIES = '北京市上海市广州市深圳市杭州市成都市武汉市西安市南京市重庆市苏州市天津市长沙市郑州市青岛市合肥市福州市厦门市昆明市大连市'.split('')
const DISTRICTS = '朝阳区海淀区高新区解放路文化路人民路中山路建设路和平路幸福路望江路滨江路'.split('')
const ROADS = ['路', '街', '大道', '巷']
const DOMAINS = ['example.com', 'test.com', 'mail.com', 'demo.cn', 'corp.net']
const WORDS = '数据 系统 平台 服务 接口 模块 用户 订单 商品 支付 物流 消息 配置 权限 日志 缓存 队列 调度 监控 告警'.split('')

function pick<T>(arr: T[], rand: Rng): T {
  return arr[Math.floor(rand() * arr.length)]
}

export function randomInt(rand: Rng, min: number, max: number): number {
  const a = Math.ceil(Math.min(min, max))
  const b = Math.floor(Math.max(min, max))
  return a + Math.floor(rand() * (b - a + 1))
}

export function randomFloat(rand: Rng, min: number, max: number, dec = 2): number {
  const v = min + rand() * (max - min)
  const p = Math.max(0, Math.min(8, Math.trunc(dec)))
  return Number(v.toFixed(p))
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

function randomDate(rand: Rng): string {
  const y = randomInt(rand, 2015, 2026)
  const m = randomInt(rand, 1, 12)
  const d = randomInt(rand, 1, new Date(Date.UTC(y, m, 0)).getUTCDate())
  return `${y}-${pad(m)}-${pad(d)}`
}

function randomName(rand: Rng): string {
  return pick(SURNAMES, rand) + pick(GIVEN, rand)
}

function randomPhone(rand: Rng): string {
  const segs = ['130', '131', '135', '136', '137', '138', '139', '150', '151', '152', '155', '158', '166', '170', '176', '177', '178', '180', '181', '185', '186', '187', '188', '189', '191', '198', '199']
  return pick(segs, rand) + String(randomInt(rand, 0, 99999999)).padStart(8, '0')
}

function randomAddress(rand: Rng): string {
  return `${pick(CITIES, rand)}${pick(DISTRICTS, rand)}${randomInt(rand, 1, 999)}号${pick(ROADS, rand)}${randomInt(rand, 1, 30)}栋${randomInt(rand, 101, 2404)}室`
}

function randomUuid(rand: Rng): string {
  const hex = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < 32; i++) out += hex[Math.floor(rand() * 16)]
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`
}

export const PLACEHOLDERS: { token: string; desc: string; sample: string }[] = [
  { token: '@name', desc: '中文姓名', sample: '@name' },
  { token: '@email', desc: '邮箱地址', sample: '@email' },
  { token: '@phone', desc: '手机号', sample: '@phone' },
  { token: '@address', desc: '省市区地址', sample: '@address' },
  { token: '@uuid', desc: 'UUID v4 样式', sample: '@uuid' },
  { token: '@date', desc: '日期 YYYY-MM-DD', sample: '@date' },
  { token: '@int(min,max)', desc: '整数区间', sample: '@int(18,60)' },
  { token: '@float(min,max,dec)', desc: '小数区间', sample: '@float(0,100,2)' },
  { token: '@bool', desc: '布尔值', sample: '@bool' },
  { token: '@pick(a,b,c)', desc: '枚举随机', sample: '@pick(待发货,已发货,已完成)' },
  { token: '@word', desc: '随机词', sample: '@word' },
  { token: '@paragraph', desc: '随机短段落', sample: '@paragraph' }
]

const PURE_RE = /^@(name|email|phone|address|uuid|date|bool|word|paragraph|int|float|pick)(?:\(([^)]*)\))?$/

/** 纯占位符 → 类型化值；非占位符返回 null */
export function fillPure(raw: string, rand: Rng): unknown {
  const m = PURE_RE.exec(raw.trim())
  if (!m) return null
  const [, name, args] = m
  const nums = (args ?? '').split(',').map((x) => Number(x.trim()))
  switch (name) {
    case 'name':
      return randomName(rand)
    case 'email':
      return `${randomName(rand)}${randomInt(rand, 1, 999)}@${pick(DOMAINS, rand)}`
    case 'phone':
      return randomPhone(rand)
    case 'address':
      return randomAddress(rand)
    case 'uuid':
      return randomUuid(rand)
    case 'date':
      return randomDate(rand)
    case 'bool':
      return rand() < 0.5
    case 'word':
      return pick(WORDS, rand)
    case 'paragraph': {
      const n = randomInt(rand, 3, 6)
      return Array.from({ length: n }, () => `${pick(WORDS, rand)}${pick(WORDS, rand)}${randomInt(rand, 10, 99)}%`).join('，') + '。'
    }
    case 'int':
      return randomInt(rand, Number.isFinite(nums[0]) ? nums[0] : 0, Number.isFinite(nums[1]) ? nums[1] : 100)
    case 'float':
      return randomFloat(rand, Number.isFinite(nums[0]) ? nums[0] : 0, Number.isFinite(nums[1]) ? nums[1] : 100, Number.isFinite(nums[2]) ? nums[2] : 2)
    case 'pick': {
      const opts = (args ?? '').split(',').map((x) => x.trim()).filter(Boolean)
      return opts.length ? pick(opts, rand) : ''
    }
    default:
      return null
  }
}

/** 混合文本中的占位符替换（如 "用户-@name-@int(1,99)"） */
export function fillInline(raw: string, rand: Rng): string {
  return raw.replace(/@(name|email|phone|address|uuid|date|word|paragraph|int|float|pick)(?:\(([^)]*)\))?/g, (m) => {
    const v = fillPure(m, rand)
    return v === null ? m : String(v)
  })
}

export function fillSchema(node: unknown, rand: Rng): unknown {
  if (typeof node === 'string') {
    const pure = fillPure(node, rand)
    return pure !== null ? pure : fillInline(node, rand)
  }
  if (Array.isArray(node)) return node.map((x) => fillSchema(x, rand))
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = fillSchema(v, rand)
    return out
  }
  return node
}

/** 解析 JSON 模板；非法模板抛出带位置信息的错误 */
export function parseSchema(schema: string): unknown {
  const s = (schema ?? '').trim()
  if (!s) throw new Error('模板为空')
  try {
    return JSON.parse(s)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`JSON 模板解析失败：${msg}（请检查引号与逗号）`)
  }
}

export function generate(schema: string, count: number, seed?: number): unknown[] {
  const node = parseSchema(schema)
  const n = Math.max(1, Math.min(MAX_COUNT, Math.trunc(count) || 1))
  const rand = makeRng(seed)
  return Array.from({ length: n }, () => fillSchema(node, rand))
}

export const SCHEMA_SAMPLE = `{
  "id": "@uuid",
  "name": "@name",
  "age": "@int(18,60)",
  "vip": "@bool",
  "balance": "@float(0,10000,2)",
  "level": "@pick(青铜,白银,黄金,钻石)",
  "email": "@email",
  "phone": "@phone",
  "address": "@address",
  "createdAt": "@date",
  "remark": "用户-@word-@int(1,99)"
}`
