/**
 * 号码生成器纯函数（零依赖）
 * 覆盖：身份证号 / 组织机构代码 / 统一社会信用代码 / 银行卡号 / 手机号 / 邮箱 / IP 地址
 * 每类同时提供「生成」与「校验」，校验结果含人类可读说明，便于 UI 直接展示。
 */

import { ID_CARD_AREAS, ID_CARD_REGIONS } from './idAreas.ts'

/** 号码类型 id */
export type NumberTypeId =
  | 'idcard'
  | 'orgcode'
  | 'creditcode'
  | 'bankcard'
  | 'phone'
  | 'email'
  | 'ip'

export interface NumberTypeMeta {
  id: NumberTypeId
  name: string
  desc: string
  /** 示例输出（用于占位/说明） */
  sample: string
}

/** 号码类型清单（UI 顺序即此顺序） */
export const NUMBER_TYPES: NumberTypeMeta[] = [
  { id: 'idcard', name: '身份证号', desc: '18 位，含地区码 + 出生日期 + 顺序码 + ISO 7064 校验码', sample: '110101199003071234' },
  { id: 'orgcode', name: '组织机构代码', desc: 'GB/T 11714，8 位主体 + 1 位校验码（可选连字符）', sample: '70281846-8' },
  { id: 'creditcode', name: '统一社会信用代码', desc: 'GB 32100-2015，18 位，ISO 7064 Mod 31,31 校验', sample: '91310000702818468A' },
  { id: 'bankcard', name: '银行卡号', desc: '常见发卡行前缀 + 随机账号 + Luhn 校验位', sample: '6222021234567890123' },
  { id: 'phone', name: '手机号', desc: '11 位，使用在用的运营商号段', sample: '13800138000' },
  { id: 'email', name: '邮箱', desc: '常见邮箱域名，QQ/狐狸邮箱为纯数字账号', sample: '1008611@qq.com' },
  { id: 'ip', name: 'IP 地址', desc: '默认随机私网地址，可指定前缀（如 10.5）', sample: '192.168.1.23' }
]

/* ==================== 通用工具 ==================== */

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** [min, max] 闭区间随机整数 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomDigits(len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) s += String(randomInt(0, 9))
  return s
}

function randomAlnum(len: number): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
  let s = ''
  for (let i = 0; i < len; i++) s += randomFrom(chars.split(''))
  return s
}

/** 数量归一：非数字/越界时收敛到 [1, 1000] */
export function normalizeCount(count: unknown, max = 1000): number {
  const n = Math.floor(Number(count))
  if (!Number.isFinite(n)) return 1
  return Math.min(Math.max(n, 1), max)
}

/* ==================== 字符集常量 ==================== */

/** GB 32100-2015 / GB/T 11714 字符集（排除 I、O、S、V、Z） */
const CODE_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY'

/** 字符 → 数值映射（供校验码计算） */
const CHAR_VALUE: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17,
  J: 18, K: 19, L: 20, M: 21, N: 22,
  P: 23, Q: 24, R: 25, T: 26, U: 27,
  W: 28, X: 29, Y: 30
}

/** ISO 7064 Mod 31,31 校验码字符集 */
const MOD31_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY'

/** 统一社会信用代码登记管理部门代码（含第 1 号修改单新增 A/N/Y） */
const REG_ADMIN_CODES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'N', 'Y']

/** 常见银行卡发卡行标识 */
export const BANK_CARD_PREFIXES = [
  '622202', '622848', '622998', '622309', '621700',
  '622260', '622588', '621098', '621483', '621771'
]

/** 在用手机号段（移动 / 联通 / 电信） */
export const PHONE_PREFIXES = [
  '134', '135', '136', '137', '138', '139',
  '147', '150', '151', '152', '157', '158', '159',
  '172', '178', '188', '195',
  '130', '131', '132', '145', '155', '156', '166', '175', '176', '185', '186',
  '133', '149', '153', '173', '177', '180', '181', '189', '191', '193', '199'
]

/** 常见邮箱域名 */
export const EMAIL_DOMAINS = [
  'qq.com', '163.com', '126.com', 'gmail.com', 'outlook.com',
  'hotmail.com', 'sina.com', 'sohu.com', 'yahoo.com', 'foxmail.com',
  'aliyun.com', '139.com', '189.cn', 'wo.cn'
]

/* ==================== 行政区划 ==================== */

/** 省份选项（供下拉使用） */
export function listProvinces(): { code: string; name: string }[] {
  return Object.keys(ID_CARD_REGIONS).map(code => ({ code, name: ID_CARD_REGIONS[code].name }))
}

/** 指定省份下的市/地区选项 */
export function listCities(provinceCode: string): { code: string; name: string }[] {
  const r = ID_CARD_REGIONS[provinceCode]
  if (!r) return []
  return Object.keys(r.cities).map(code => ({ code, name: r.cities[code] }))
}

/** 取一个合法的 6 位地区码：优先用给定值，其次按省/市筛选，最后全表随机 */
export function pickAreaCode(opts: { area?: string; province?: string; city?: string } = {}): string {
  const area = (opts.area || '').trim()
  if (/^\d{6}$/.test(area) && ID_CARD_AREAS.includes(area)) return area
  const province = (opts.province || '').trim()
  if (province) {
    const city = (opts.city || '').trim()
    const prefix = province + (city || '')
    const matched = ID_CARD_AREAS.filter(a => a.startsWith(prefix))
    if (matched.length) return randomFrom(matched)
    if (ID_CARD_AREAS.some(a => a.startsWith(province))) {
      const pool = ID_CARD_AREAS.filter(a => a.startsWith(province))
      return randomFrom(pool)
    }
  }
  return randomFrom(ID_CARD_AREAS)
}

/** 地区码 → 中文地区名（查不到时返回原码） */
export function areaName(code: string): string {
  if (!/^\d{6}$/.test(code)) return code || '—'
  const province = ID_CARD_REGIONS[code.slice(0, 2)]
  if (!province) return code
  const city = province.cities[code.slice(2, 4)]
  return city ? `${province.name} ${city}` : province.name
}

/* ==================== 身份证号 ==================== */

/** ISO 7064 Mod 11,2 校验码（身份证第 18 位） */
export function idCardCheckCode(body17: string): string {
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const codes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']
  let sum = 0
  for (let i = 0; i < 17; i++) {
    const d = Number(body17[i])
    if (!Number.isFinite(d)) return ''
    sum += d * weights[i]
  }
  return codes[sum % 11]
}

export type GenderOption = 'any' | 'male' | 'female'
export type AgeRange = '' | '18-25' | '26-35' | '36-45' | '46-55' | '56-65' | '65+'

export const AGE_RANGES: { value: AgeRange; label: string }[] = [
  { value: '', label: '随机（18-70 岁）' },
  { value: '18-25', label: '18-25 岁' },
  { value: '26-35', label: '26-35 岁' },
  { value: '36-45', label: '36-45 岁' },
  { value: '46-55', label: '46-55 岁' },
  { value: '56-65', label: '56-65 岁' },
  { value: '65+', label: '65 岁以上' }
]

function ageToYearRange(range: AgeRange, now = new Date()): [number, number] {
  const y = now.getFullYear()
  switch (range) {
    case '18-25': return [y - 25, y - 18]
    case '26-35': return [y - 35, y - 26]
    case '36-45': return [y - 45, y - 36]
    case '46-55': return [y - 55, y - 46]
    case '56-65': return [y - 65, y - 56]
    case '65+': return [y - 80, y - 65]
    default: return [y - 70, y - 18]
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * 生成身份证号
 * 结构：6 位地区码 + 8 位出生日期 + 3 位顺序码（末位奇男偶女）+ 1 位校验码
 */
export function generateIdCard(opts: {
  area?: string
  province?: string
  city?: string
  gender?: GenderOption
  ageRange?: AgeRange
  now?: Date
} = {}): string {
  const area = pickAreaCode(opts)
  const [yMin, yMax] = ageToYearRange(opts.ageRange || '', opts.now || new Date())
  const year = randomInt(yMin, yMax)
  const month = randomInt(1, 12)
  const day = randomInt(1, daysInMonth(year, month))
  const birthday = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`

  // 顺序码 000-999：第 17 位（顺序码末位）奇数=男、偶数=女
  let seq: string
  if (opts.gender === 'male') {
    seq = randomDigits(2) + String(randomInt(1, 5) * 2 - 1)
  } else if (opts.gender === 'female') {
    seq = randomDigits(2) + String(randomInt(0, 4) * 2)
  } else {
    seq = randomDigits(3)
  }

  const body17 = area + birthday + seq
  return body17 + idCardCheckCode(body17)
}

/** 解析身份证号中的公开信息 */
export function idCardInfo(id: string): { birthday: string; gender: string; area: string } | null {
  if (!/^\d{17}[\dXx]$/.test(id)) return null
  const y = Number(id.slice(6, 10))
  const m = Number(id.slice(10, 12))
  const d = Number(id.slice(12, 14))
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
  const seqLast = Number(id.charAt(16))
  return {
    birthday: `${id.slice(6, 10)}-${id.slice(10, 12)}-${id.slice(12, 14)}`,
    gender: seqLast % 2 === 1 ? '男' : '女',
    area: areaName(id.slice(0, 6))
  }
}

/** 校验身份证号 */
export function validateIdCard(value: string): ValidateResult {
  const id = (value || '').trim().toUpperCase()
  if (!id) return { valid: false, message: '请输入身份证号' }
  if (id.length !== 18) return { valid: false, message: `身份证号应为 18 位，当前 ${id.length} 位` }
  if (!/^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dX]$/.test(id)) {
    return { valid: false, message: '格式不正确（应为 6 位地区码 + 8 位日期 + 3 位顺序码 + 校验位）' }
  }
  const expect = idCardCheckCode(id.slice(0, 17))
  if (id.charAt(17) !== expect) {
    return { valid: false, message: `校验码错误，应为 ${expect}` }
  }
  const info = idCardInfo(id)
  return {
    valid: true,
    message: info ? `验证通过（${info.area} · ${info.birthday} · ${info.gender}）` : '验证通过'
  }
}

/* ==================== 组织机构代码 ==================== */

/** GB/T 11714 校验码（8 位主体 → 1 位校验码，10 记为 X） */
export function orgCodeCheckCode(body8: string): string {
  const weights = [3, 7, 9, 10, 5, 8, 4, 2]
  let sum = 0
  for (let i = 0; i < 8; i++) {
    const c = (body8[i] || '').toUpperCase()
    sum += (CHAR_VALUE[c] ?? 0) * weights[i]
  }
  const rem = (11 - (sum % 11)) % 11
  return rem === 10 ? 'X' : String(rem)
}

/** 生成组织机构代码（9 位，hyphen 为 true 时输出 XXXXXXXX-X） */
export function generateOrgCode(opts: { hyphen?: boolean } = {}): string {
  let body = ''
  for (let i = 0; i < 8; i++) body += randomFrom(CODE_CHARS.split(''))
  const check = orgCodeCheckCode(body)
  return opts.hyphen ? `${body}-${check}` : body + check
}

/** 校验组织机构代码（支持带/不带连字符） */
export function validateOrgCode(value: string): ValidateResult {
  const raw = (value || '').trim()
  if (!raw) return { valid: false, message: '请输入组织机构代码' }
  const clean = raw.replace(/-/g, '').toUpperCase()
  if (clean.length !== 9) return { valid: false, message: `组织机构代码应为 9 位，当前 ${clean.length} 位` }
  if (!/^[0-9A-HJ-NP-RT-UW-Y]{9}$/.test(clean)) {
    return { valid: false, message: '含非法字符（只能为数字与大写字母，不含 I、O、S、V、Z）' }
  }
  const expect = orgCodeCheckCode(clean.slice(0, 8))
  if (clean.charAt(8) !== expect) return { valid: false, message: `校验码错误，应为 ${expect}` }
  return { valid: true, message: '验证通过' }
}

/* ==================== 统一社会信用代码 ==================== */

/** ISO 7064 Mod 31,31 校验码（GB 32100-2015） */
export function creditCodeCheckCode(body17: string): string {
  const weights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28]
  let sum = 0
  for (let i = 0; i < 17; i++) {
    const c = (body17[i] || '').toUpperCase()
    sum += (CHAR_VALUE[c] ?? 0) * weights[i]
  }
  return MOD31_CHARS[(31 - (sum % 31)) % 31]
}

/**
 * 生成统一社会信用代码
 * 结构：1 位登记管理部门 + 1 位机构类别 + 6 位地区码 + 9 位主体标识（组织机构代码）+ 1 位校验码
 */
export function generateCreditCode(opts: { area?: string; province?: string; city?: string } = {}): string {
  const regAdmin = randomFrom(REG_ADMIN_CODES)
  const orgType = randomFrom(CODE_CHARS.split(''))
  const area = pickAreaCode(opts)
  const mainId = generateOrgCode() // 9 位（8 位主体 + 校验码）
  const body17 = regAdmin + orgType + area + mainId
  return body17 + creditCodeCheckCode(body17)
}

/** 校验统一社会信用代码 */
export function validateCreditCode(value: string): ValidateResult {
  const raw = (value || '').trim().toUpperCase()
  if (!raw) return { valid: false, message: '请输入统一社会信用代码' }
  if (raw.length !== 18) return { valid: false, message: `统一社会信用代码应为 18 位，当前 ${raw.length} 位` }
  if (!/^[0-9ANY][0-9A-HJ-NP-RT-UW-Y][0-9]{6}[0-9A-HJ-NP-RT-UW-Y]{9}[0-9A-HJ-NP-RT-UW-Y]$/.test(raw)) {
    return { valid: false, message: '格式不正确（1 位登记管理部门 + 1 位机构类别 + 6 位地区 + 9 位主体 + 1 位校验）' }
  }
  const expect = creditCodeCheckCode(raw.slice(0, 17))
  if (raw.charAt(17) !== expect) return { valid: false, message: `校验码错误，应为 ${expect}` }
  return { valid: true, message: `验证通过（登记地区：${areaName(raw.slice(2, 8))}）` }
}

/* ==================== 银行卡号 ==================== */

/** Luhn 校验位计算 */
export function luhnCheckDigit(body: string): number {
  let sum = 0
  let even = false
  for (let i = body.length - 1; i >= 0; i--) {
    let d = Number(body[i])
    if (!Number.isFinite(d)) d = 0
    if (even) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    even = !even
  }
  return (10 - (sum % 10)) % 10
}

/** 生成银行卡号（16-19 位，含 Luhn 校验位） */
export function generateBankCard(): string {
  const prefix = randomFrom(BANK_CARD_PREFIXES)
  const length = randomInt(16, 19)
  const body = prefix + randomDigits(Math.max(length - prefix.length - 1, 1))
  return body + String(luhnCheckDigit(body))
}

/** 校验银行卡号（Luhn） */
export function validateBankCard(value: string): ValidateResult {
  const raw = (value || '').trim().replace(/\s+/g, '')
  if (!raw) return { valid: false, message: '请输入银行卡号' }
  if (raw.length < 13 || raw.length > 19) return { valid: false, message: `银行卡号应为 13-19 位，当前 ${raw.length} 位` }
  if (!/^\d+$/.test(raw)) return { valid: false, message: '银行卡号只能包含数字' }
  const expect = luhnCheckDigit(raw.slice(0, -1))
  if (Number(raw.slice(-1)) !== expect) return { valid: false, message: `校验位错误，应为 ${expect}` }
  return { valid: true, message: `验证通过（${raw.length} 位）` }
}

/* ==================== 手机号 ==================== */

/** 生成手机号：3 位号段 + 8 位随机数字 */
export function generatePhone(): string {
  return randomFrom(PHONE_PREFIXES) + randomDigits(8)
}

/** 校验手机号 */
export function validatePhone(value: string): ValidateResult {
  const raw = (value || '').trim().replace(/\s+/g, '')
  if (!raw) return { valid: false, message: '请输入手机号' }
  if (raw.length !== 11) return { valid: false, message: `手机号应为 11 位，当前 ${raw.length} 位` }
  if (!/^1[3-9]\d{9}$/.test(raw)) return { valid: false, message: '格式不正确（应以 1 开头，第二位 3-9）' }
  return { valid: true, message: '验证通过' }
}

/* ==================== 邮箱 ==================== */

/** 生成邮箱；QQ / Foxmail 域名使用纯数字账号 */
export function generateEmail(opts: { domain?: string } = {}): string {
  const want = (opts.domain || '').trim().toLowerCase()
  const domain = EMAIL_DOMAINS.includes(want) ? want : randomFrom(EMAIL_DOMAINS)
  if (domain === 'qq.com' || domain === 'foxmail.com') {
    return `${randomDigits(randomInt(5, 11))}@${domain}`
  }
  return `${randomAlnum(randomInt(6, 12))}@${domain}`
}

/** 校验邮箱 */
export function validateEmail(value: string): ValidateResult {
  const raw = (value || '').trim()
  if (!raw) return { valid: false, message: '请输入邮箱' }
  if (raw.length > 254) return { valid: false, message: '邮箱过长（超过 254 字符）' }
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/.test(raw)) {
    return { valid: false, message: '格式不正确（如 name@example.com）' }
  }
  return { valid: true, message: '验证通过' }
}

/* ==================== IP 地址 ==================== */

/**
 * 生成 IP 地址：默认随机私网地址（10/172.16-31/192.168），
 * 指定前缀时按 1~3 段补全（前缀非法则回退随机私网地址）。
 */
export function generateIP(opts: { prefix?: string } = {}): string {
  const prefix = (opts.prefix || '').trim()
  const parts = prefix ? prefix.split('.').filter(p => p !== '') : []
  const validPrefix =
    parts.length > 0 &&
    parts.length <= 3 &&
    parts.every(p => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255)

  if (!validPrefix) {
    // 随机私网地址
    const range = randomInt(1, 3)
    if (range === 1) return `10.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`
    if (range === 2) return `172.${randomInt(16, 31)}.${randomInt(0, 255)}.${randomInt(1, 254)}`
    return `192.168.${randomInt(0, 255)}.${randomInt(1, 254)}`
  }

  const base = parts.join('.')
  if (parts.length === 1) return `${base}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`
  if (parts.length === 2) return `${base}.${randomInt(0, 255)}.${randomInt(1, 254)}`
  return `${base}.${randomInt(1, 254)}`
}

/** 校验 IPv4 地址 */
export function validateIP(value: string): ValidateResult {
  const raw = (value || '').trim()
  if (!raw) return { valid: false, message: '请输入 IP 地址' }
  if (!/^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(raw)) {
    return { valid: false, message: '格式不正确（应为 4 段 0-255 的数字）' }
  }
  const first = Number(raw.split('.')[0])
  if (first === 0 || first === 127) return { valid: true, message: '格式正确（0 / 127 段为保留地址）' }
  const isPrivate =
    first === 10 ||
    (first === 172 && Number(raw.split('.')[1]) >= 16 && Number(raw.split('.')[1]) <= 31) ||
    (first === 192 && Number(raw.split('.')[1]) === 168)
  return { valid: true, message: isPrivate ? '格式正确（私网地址）' : '格式正确（公网地址）' }
}

/* ==================== 统一入口 ==================== */

export interface ValidateResult {
  valid: boolean
  message: string
}

/** 生成选项（各类型按需取用字段） */
export interface NumberGenOptions {
  count?: number
  area?: string
  province?: string
  city?: string
  gender?: GenderOption
  ageRange?: AgeRange
  hyphen?: boolean
  domain?: string
  ipPrefix?: string
}

/** 生成单个号码（未知类型返回空串） */
export function generateNumber(type: NumberTypeId, opts: NumberGenOptions = {}): string {
  switch (type) {
    case 'idcard':
      return generateIdCard(opts)
    case 'orgcode':
      return generateOrgCode({ hyphen: opts.hyphen })
    case 'creditcode':
      return generateCreditCode(opts)
    case 'bankcard':
      return generateBankCard()
    case 'phone':
      return generatePhone()
    case 'email':
      return generateEmail({ domain: opts.domain })
    case 'ip':
      return generateIP({ prefix: opts.ipPrefix })
    default:
      return ''
  }
}

/** 批量生成（数量自动收敛到 1-1000） */
export function generateNumbers(type: NumberTypeId, opts: NumberGenOptions = {}): string[] {
  const count = normalizeCount(opts.count)
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(generateNumber(type, opts))
  return out
}

/** 按类型校验 */
export function validateNumber(type: NumberTypeId, value: string): ValidateResult {
  switch (type) {
    case 'idcard':
      return validateIdCard(value)
    case 'orgcode':
      return validateOrgCode(value)
    case 'creditcode':
      return validateCreditCode(value)
    case 'bankcard':
      return validateBankCard(value)
    case 'phone':
      return validatePhone(value)
    case 'email':
      return validateEmail(value)
    case 'ip':
      return validateIP(value)
    default:
      return { valid: false, message: '未知号码类型' }
  }
}
