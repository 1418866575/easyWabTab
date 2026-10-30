/**
 * AI 平台入口纯逻辑（零 vue / 零 pinia / 零 DOM，node --experimental-strip-types 可测）
 * ------------------------------------------------------------------
 * 只处理「平台记录」本身：归一化、默认集、URL 校验、排序分组、弹窗几何。
 * 不含任何网络请求，也不调用模型 API —— 本功能只保存链接与标识。
 * 所有函数不改入参，返回新值；非法输入一律降级而非抛错。
 */
import type { AiPlatform } from '../types'

// ==================== 常量 ====================

export const PLATFORM_NAME_MAX = 30
export const PLATFORM_URL_MAX = 2048
export const PLATFORM_ACCOUNT_MAX = 40
export const PLATFORM_PLAN_MAX = 20
export const PLATFORM_NOTE_MAX = 200
export const PLATFORM_GROUP_MAX = 20

/** 未分组兜底名 */
export const PLATFORM_UNGROUPED = '未分组'
/** 预置分组（顺序即药丸展示顺序） */
export const PLATFORM_GROUPS_DEFAULT = ['通用对话', '搜索研究', '创作生成']

/**
 * 预置播种戳：固定极小值。
 * compareSmartStamp 先比 ver 再比 updatedAt，因此「新设备播种的默认值」在合并时
 * 永远输给云端真实记录，不会把用户改过的名字/备注冲掉。
 */
export const PLATFORM_SEED_AT = 1

/** 独立窗口尺寸（像素）；实际打开前会按 screen.avail* 压缩并居中 */
export const PLATFORM_WINDOW = { defaultW: 1180, defaultH: 820, minW: 720, minH: 520 }

/** 危险协议黑名单（大小写不敏感） */
const BAD_PROTOCOLS = ['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:']

export interface PlatformIssue {
  field: string
  message: string
}

export type UrlCheck = { ok: true; url: string } | { ok: false; url: string; error: string }

export type PlatformSort = 'manual' | 'recent' | 'usage' | 'name'

export interface PlatformGroup {
  group: string
  items: AiPlatform[]
  count: number
}

// ==================== 小工具 ====================

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** 按 code point 截断，避免中文/emoji 被切断 */
function truncate(text: string, max: number): string {
  const chars = [...text]
  return chars.length > max ? chars.slice(0, max).join('') : text
}

/** 归一化函数内保留墓碑与版本戳（对应 smartCore.keepSmartStamp）。
 *  漏了这一步，下一次推送会把删除记录复活。 */
function keepPlatformStamp(target: AiPlatform, src: unknown): AiPlatform {
  const s = (src ?? {}) as Partial<AiPlatform>
  if (typeof s.deletedAt === 'string' && s.deletedAt) target.deletedAt = s.deletedAt
  if (typeof s.ver === 'number') target.ver = s.ver
  if (typeof s.clientId === 'string' && s.clientId) target.clientId = s.clientId
  return target
}

/** 版本比较：ver → updatedAt → clientId；>0 表示 a 更新（与 smartCore.compareSmartStamp 同规则） */
function compareStamp(a: AiPlatform, b: AiPlatform): number {
  const va = a.ver ?? 0
  const vb = b.ver ?? 0
  if (va !== vb) return va > vb ? 1 : -1
  const ua = Number(a.updatedAt) || 0
  const ub = Number(b.updatedAt) || 0
  if (ua !== ub) return ua > ub ? 1 : -1
  const ca = a.clientId ?? ''
  const cb = b.clientId ?? ''
  if (ca !== cb) return ca > cb ? 1 : -1
  return 0
}

// ==================== URL ====================

/**
 * 校验平台网址：仅 https、拒危险协议与内嵌凭据。
 * 无协议的输入自动补 https://（用户友好），但 **http:// 明确拒绝**。
 */
export function validatePlatformUrl(raw: string): UrlCheck {
  const input = String(raw ?? '').trim()
  if (!input) return { ok: false, url: '', error: '请输入网址' }
  if (input.length > PLATFORM_URL_MAX) return { ok: false, url: input, error: `网址不能超过 ${PLATFORM_URL_MAX} 个字符` }
  if (/\s/.test(input)) return { ok: false, url: input, error: '网址不能包含空格' }

  const lower = input.toLowerCase()
  for (const p of BAD_PROTOCOLS) {
    if (lower.startsWith(p)) return { ok: false, url: input, error: '不允许的协议' }
  }

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`
  let u: URL
  try {
    u = new URL(candidate)
  } catch {
    return { ok: false, url: input, error: '网址格式不正确' }
  }
  if (u.protocol !== 'https:') return { ok: false, url: input, error: '仅支持 https 链接' }
  if (!u.hostname || !u.hostname.includes('.')) return { ok: false, url: input, error: '缺少有效域名' }
  if (u.username || u.password) return { ok: false, url: input, error: '链接中不能包含账号密码' }
  return { ok: true, url: candidate }
}

/** 比较用归一化：host 小写、去尾斜杠、去 hash */
export function normalizeUrlForCompare(url: string): string {
  try {
    const u = new URL(String(url ?? '').trim())
    const path = u.pathname.replace(/\/+$/, '')
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.port ? ':' + u.port : ''}${path}${u.search}`
  } catch {
    return String(url ?? '').trim().replace(/\/+$/, '').toLowerCase()
  }
}

// ==================== 默认集 ====================

interface BuiltinSeed {
  builtinKey: string
  name: string
  url: string
  group: string
}

/** 预置 10 家（网页版入口；登录态由浏览器各自保持，这里只存链接） */
const BUILTIN_SEEDS: BuiltinSeed[] = [
  { builtinKey: 'qianwen', name: '通义千问', url: 'https://www.qianwen.com/chat', group: '通用对话' },
  { builtinKey: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/', group: '通用对话' },
  { builtinKey: 'kimi', name: 'Kimi', url: 'https://www.kimi.com/', group: '通用对话' },
  { builtinKey: 'doubao', name: '豆包', url: 'https://www.doubao.com/chat/', group: '通用对话' },
  { builtinKey: 'yuanbao', name: '腾讯元宝', url: 'https://yuanbao.tencent.com/', group: '通用对话' },
  { builtinKey: 'ernie', name: '文心一言', url: 'https://yiyan.baidu.com/', group: '通用对话' },
  { builtinKey: 'chatglm', name: '智谱清言', url: 'https://chatglm.cn/', group: '通用对话' },
  { builtinKey: 'spark', name: '讯飞星火', url: 'https://xinghuo.xfyun.cn/', group: '通用对话' },
  { builtinKey: 'metaso', name: '秘塔搜索', url: 'https://metaso.cn/', group: '搜索研究' },
  { builtinKey: 'minimax', name: 'MiniMax', url: 'https://hailuoai.com/', group: '创作生成' }
]

/** 预置平台 id：固定，保证多设备独立播种时能按 id 对齐 */
export function builtinPlatformId(builtinKey: string): string {
  return `ai_builtin_${builtinKey}`
}

export function defaultAiPlatforms(): AiPlatform[] {
  return BUILTIN_SEEDS.map((seed, i) => ({
    id: builtinPlatformId(seed.builtinKey),
    name: seed.name,
    url: seed.url,
    group: seed.group,
    icon: '',
    accountLabel: '',
    plan: '',
    note: '',
    pinned: false,
    isFavorite: false,
    order: i,
    usageCount: 0,
    lastOpenedAt: null,
    isBuiltIn: true,
    builtinKey: seed.builtinKey,
    createdAt: PLATFORM_SEED_AT,
    updatedAt: PLATFORM_SEED_AT
  }))
}

/**
 * 补齐缺失的预置平台（「恢复预置」）。
 * - 不复活墓碑：某 builtinKey 已有记录（含 deletedAt）时跳过
 * - 幂等、不改入参
 */
export function mergeDefaultPlatforms(list: AiPlatform[]): AiPlatform[] {
  const have = new Set(list.map(p => p.builtinKey).filter(Boolean) as string[])
  const next = [...list]
  let order = list.reduce((m, p) => Math.max(m, p.order), -1) + 1
  for (const item of defaultAiPlatforms()) {
    if (have.has(item.builtinKey as string)) continue
    next.push({ ...item, order: order++ })
  }
  return next
}

// ==================== 归一化 ====================

export function normalizePlatform(raw: unknown): AiPlatform | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  const id = str(o.id).trim()
  if (!id) return null

  const name = truncate(str(o.name).trim(), PLATFORM_NAME_MAX)
  const rawUrl = str(o.url).trim()
  const check = validatePlatformUrl(rawUrl)
  // 危险协议：保留记录但清空 url → 卡片显示「链接无效」，不丢用户数据
  const url = check.ok ? check.url : ''

  if (!name && !url) return null

  const order = num(o.order)
  const usage = num(o.usageCount)
  const last = o.lastOpenedAt === null || o.lastOpenedAt === undefined ? null : num(o.lastOpenedAt)

  const item: AiPlatform = {
    id,
    name: name || '未命名网页',
    url,
    group: truncate(str(o.group).trim(), PLATFORM_GROUP_MAX) || PLATFORM_UNGROUPED,
    icon: str(o.icon).trim(),
    accountLabel: truncate(str(o.accountLabel).trim(), PLATFORM_ACCOUNT_MAX),
    plan: truncate(str(o.plan).trim(), PLATFORM_PLAN_MAX),
    note: truncate(str(o.note).trim(), PLATFORM_NOTE_MAX),
    pinned: o.pinned === true,
    isFavorite: o.isFavorite === true,
    order: order === null ? 0 : order,
    usageCount: usage === null ? 0 : Math.max(0, Math.floor(usage)),
    lastOpenedAt: last,
    createdAt: num(o.createdAt) ?? Date.now(),
    updatedAt: num(o.updatedAt) ?? Date.now()
  }
  if (o.isBuiltIn === true) item.isBuiltIn = true
  const bk = str(o.builtinKey).trim()
  if (bk) item.builtinKey = bk
  return keepPlatformStamp(item, o)
}

/** 归一化平台数组：过滤非法项、按 id 去重（冲突时按 ver → updatedAt → clientId 取新） */
export function normalizeAiPlatforms(raw: unknown): AiPlatform[] {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []

  const map = new Map<string, AiPlatform>()
  for (const entry of arr) {
    const p = normalizePlatform(entry)
    if (!p) continue
    const prev = map.get(p.id)
    if (!prev || compareStamp(p, prev) > 0) map.set(p.id, p)
  }
  return [...map.values()]
}

// ==================== 排序 / 分组 ====================

/** 排序（不改入参）：置顶恒在最前，末位用 id 兜底保证稳定 */
export function sortPlatforms(list: AiPlatform[], sort: PlatformSort = 'manual'): AiPlatform[] {
  const arr = [...list]
  arr.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (sort === 'recent') {
      const la = a.lastOpenedAt
      const lb = b.lastOpenedAt
      if (la === null && lb !== null) return 1
      if (la !== null && lb === null) return -1
      if (la !== null && lb !== null && la !== lb) return lb - la
    } else if (sort === 'usage') {
      if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount
    } else if (sort === 'name') {
      const c = a.name.localeCompare(b.name, 'zh-Hans-CN')
      if (c !== 0) return c
    }
    if (a.order !== b.order) return a.order - b.order
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return arr
}

/**
 * 分组（不改入参）：显式分组优先（即使为空也保留，供设置页管理），
 * 其次按平台里额外出现的分组（按最小 order），最后是「未分组」。
 */
export function groupPlatforms(list: AiPlatform[], groups: string[] = []): PlatformGroup[] {
  const buckets = new Map<string, AiPlatform[]>()
  for (const p of list) {
    const g = p.group || PLATFORM_UNGROUPED
    if (!buckets.has(g)) buckets.set(g, [])
    buckets.get(g)!.push(p)
  }

  const result: PlatformGroup[] = []
  const used = new Set<string>()

  const push = (g: string) => {
    if (used.has(g)) return
    const items = buckets.get(g) ?? []
    if (g !== PLATFORM_UNGROUPED && items.length === 0 && !groups.includes(g)) return
    used.add(g)
    result.push({ group: g, items: sortPlatforms(items, 'manual'), count: items.length })
  }

  for (const g of groups) if (g && g !== PLATFORM_UNGROUPED) push(g)

  const extra = [...buckets.keys()]
    .filter(g => g !== PLATFORM_UNGROUPED && !used.has(g))
    .sort((a, b) => {
      const oa = Math.min(...(buckets.get(a) ?? [{ order: 0 }]).map(p => p.order))
      const ob = Math.min(...(buckets.get(b) ?? [{ order: 0 }]).map(p => p.order))
      return oa - ob
    })
  for (const g of extra) push(g)

  // 「未分组」只在真有归属其中（或被显式要求）时出现，避免空列表给出一个空组
  if (buckets.has(PLATFORM_UNGROUPED) || groups.includes(PLATFORM_UNGROUPED)) push(PLATFORM_UNGROUPED)
  return result
}

/** 下一个排序值 */
export function nextOrder(list: AiPlatform[]): number {
  return list.reduce((m, p) => Math.max(m, p.order), -1) + 1
}

// ==================== 表单校验 ====================

export function isPlatformNameTaken(existing: AiPlatform[], name: string, editingId?: string | null): boolean {
  const target = String(name ?? '').trim().toLowerCase()
  if (!target) return false
  return existing.some(p => !p.deletedAt && p.id !== editingId && p.name.trim().toLowerCase() === target)
}

export function validatePlatform(
  input: Partial<AiPlatform>,
  existing: AiPlatform[],
  editingId?: string | null
): PlatformIssue[] {
  const issues: PlatformIssue[] = []

  const name = String(input.name ?? '').trim()
  if (!name) issues.push({ field: 'name', message: '请填写网页名称' })
  else if ([...name].length > PLATFORM_NAME_MAX) issues.push({ field: 'name', message: `名称不能超过 ${PLATFORM_NAME_MAX} 个字` })
  else if (isPlatformNameTaken(existing, name, editingId)) issues.push({ field: 'name', message: `已存在同名网页「${name}」` })

  const url = String(input.url ?? '').trim()
  if (!url) issues.push({ field: 'url', message: '请填写网址' })
  else {
    const check = validatePlatformUrl(url)
    if (!check.ok) issues.push({ field: 'url', message: check.error })
  }

  const group = String(input.group ?? '').trim()
  if ([...group].length > PLATFORM_GROUP_MAX) issues.push({ field: 'group', message: `分组名不能超过 ${PLATFORM_GROUP_MAX} 个字` })

  const account = String(input.accountLabel ?? '').trim()
  if ([...account].length > PLATFORM_ACCOUNT_MAX) issues.push({ field: 'accountLabel', message: `账号标识不能超过 ${PLATFORM_ACCOUNT_MAX} 个字` })

  const plan = String(input.plan ?? '').trim()
  if ([...plan].length > PLATFORM_PLAN_MAX) issues.push({ field: 'plan', message: `套餐不能超过 ${PLATFORM_PLAN_MAX} 个字` })

  const note = String(input.note ?? '').trim()
  if ([...note].length > PLATFORM_NOTE_MAX) issues.push({ field: 'note', message: `备注不能超过 ${PLATFORM_NOTE_MAX} 个字` })

  return issues
}

// ==================== 窗口几何 ====================

/**
 * 计算独立窗口的位置与尺寸：先把请求尺寸压到可用区域，再居中。
 * （跨源 popup 无法读回真实尺寸，这里只保证"不会开到屏幕外"）
 */
export function computePopupRect(
  availW: number,
  availH: number,
  wantW: number,
  wantH: number
): { width: number; height: number; left: number; top: number } {
  const maxW = Math.max(320, Math.floor(availW || PLATFORM_WINDOW.defaultW))
  const maxH = Math.max(320, Math.floor(availH || PLATFORM_WINDOW.defaultH))

  let width = Math.min(Math.max(wantW || PLATFORM_WINDOW.defaultW, PLATFORM_WINDOW.minW), maxW)
  let height = Math.min(Math.max(wantH || PLATFORM_WINDOW.defaultH, PLATFORM_WINDOW.minH), maxH)

  // 可用区域比最小尺寸还小时，以可用区域为准
  width = Math.min(width, maxW)
  height = Math.min(height, maxH)

  const left = Math.max(0, Math.floor((maxW - width) / 2))
  const top = Math.max(0, Math.floor((maxH - height) / 2))
  return { width, height, left, top }
}
