/**
 * 个人工作台「留言板」纯逻辑核心（归一化 / 排序 / 筛选 / 云同步合并）
 *
 * 零 vue / 零 pinia / 零 DOM 运行时依赖，可直接被 `node --experimental-strip-types` 单测。
 * 删除走墓碑（SyncStamp），故归一化必须保留 deletedAt / ver / clientId —— 否则删除状态会在
 * 读取这一步被抹掉，远端下一次合并又把留言当「新增」补回来（见 tombstoneCore.ts 的注释）。
 */
import type { MessageBoardData, MessageBoardMessage, MessageColor } from '../types'
import { keepStamp, mergeTombstonedById } from './tombstoneCore.ts'

/** 色调选项（值即 MessageColor，文案用于表单与无障碍标签） */
export const MESSAGE_COLOR_OPTIONS: readonly { value: MessageColor; label: string }[] = [
  { value: 'default', label: '素色' },
  { value: 'primary', label: '主色' },
  { value: 'success', label: '清新' },
  { value: 'warning', label: '暖阳' },
  { value: 'danger', label: '醒目' }
]

const COLOR_KEYS: ReadonlySet<string> = new Set(MESSAGE_COLOR_OPTIONS.map((c) => c.value))

/** 旧语义键在取色器里的代表色（编辑历史留言时回填，保证 picker 拿到合法 hex） */
export const MESSAGE_PRESET_HEX: Readonly<Record<string, string>> = {
  default: '#94a3b8',
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444'
}

/** 未选颜色时随机取的柔和色板：避开过亮/过暗，亮暗主题下都有足够对比度 */
export const MESSAGE_RANDOM_COLORS: readonly string[] = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
]

/** 是否为取色器写入的自定义色（归一化后一律 #rrggbb） */
export function isCustomMessageColor(value: unknown): boolean {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/.test(value)
}

/** 随机挑一个柔和色；缺省/未选择时用，避免所有新留言都是同一个素色 */
export function randomMessageColor(): string {
  return MESSAGE_RANDOM_COLORS[Math.floor(Math.random() * MESSAGE_RANDOM_COLORS.length)]
}

/** 把 hex 归一成 #rrggbb（支持 #abc 简写）；非法返回空串 */
function normalizeHex(value: string): string {
  const v = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  return ''
}

/** 取色器回填值：语义键 → 代表色，hex → 规范化，其余 → 素色代表色 */
export function toPickerColor(value: unknown): string {
  if (typeof value === 'string' && COLOR_KEYS.has(value)) return MESSAGE_PRESET_HEX[value]
  return (typeof value === 'string' && normalizeHex(value)) || MESSAGE_PRESET_HEX.default
}

/** 标题上限（按 code point 计，emoji 不会被拆对） */
export const MESSAGE_TITLE_MAX = 40
/** 正文上限：留言是「一句话」，不做长文编辑器；超出直接截断，避免单条撑爆同步信封 */
export const MESSAGE_CONTENT_MAX = 2000

export function emptyMessageData(): MessageBoardData {
  return { messages: [] }
}

export function normalizeMessageColor(value: unknown): MessageColor {
  if (typeof value !== 'string') return 'default'
  if (COLOR_KEYS.has(value)) return value
  return normalizeHex(value) || 'default'
}

/** 截断到 n 个 code point（Array.from 不会拆开 emoji 代理对） */
function truncate(value: string, n: number): string {
  return Array.from(value).slice(0, n).join('')
}

/**
 * 幂等归一化：兼容 `{ messages: [...] }` 与旧裸数组两种形态；
 * 非法条目（无 id / content 非字符串）直接丢弃；墓碑与版本戳一律保留。
 */
export function normalizeMessageData(raw: unknown): MessageBoardData {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : (raw !== null && typeof raw === 'object' && Array.isArray((raw as { messages?: unknown }).messages)
      ? (raw as { messages: unknown[] }).messages
      : [])
  const out: MessageBoardMessage[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const src = item as Record<string, unknown>
    if (typeof src.id !== 'string' || !src.id || typeof src.content !== 'string') continue
    const now = typeof src.createdAt === 'string' && src.createdAt ? src.createdAt : new Date().toISOString()
    const next: MessageBoardMessage = {
      id: src.id,
      title: typeof src.title === 'string' ? truncate(src.title.trim(), MESSAGE_TITLE_MAX) : '',
      content: truncate(src.content.trim(), MESSAGE_CONTENT_MAX),
      color: normalizeMessageColor(src.color),
      pinned: src.pinned === true,
      createdAt: now,
      updatedAt: typeof src.updatedAt === 'string' && src.updatedAt ? src.updatedAt : now
    }
    out.push(keepStamp(next, src))
  }
  return { messages: out }
}

/** 展示排序：置顶优先 → 创建时间倒序 → id 稳定兜底（同毫秒新建也不抖动） */
export function sortMessages(items: MessageBoardMessage[]): MessageBoardMessage[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    const t = String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
    return t !== 0 ? t : a.id.localeCompare(b.id)
  })
}

/** 关键词筛选：标题 / 正文，大小写不敏感；空关键词返回原数组（不改引用） */
export function filterMessages(items: MessageBoardMessage[], keyword: string): MessageBoardMessage[] {
  const q = (keyword ?? '').trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (m) => (m.title ?? '').toLowerCase().includes(q) || m.content.toLowerCase().includes(q)
  )
}

/** 云端合并：按 id 取并集 + 墓碑感知的版本取新（与便签 / 日记同一套语义） */
export function mergeMessages(
  local: MessageBoardData | undefined,
  remote: MessageBoardData | undefined
): MessageBoardData {
  if (!local && !remote) return emptyMessageData()
  return {
    messages: mergeTombstonedById(
      normalizeMessageData(local).messages,
      normalizeMessageData(remote).messages
    )
  }
}

/** 回收站标签：标题优先，否则取正文首行摘要 */
export function messageLabel(m: MessageBoardMessage): string {
  const text = (m.content || '').replace(/\s+/g, ' ').trim()
  const snippet = text.length > 24 ? `${text.slice(0, 24)}…` : text
  if (m.title) return `${m.title}${snippet ? ` · ${snippet}` : ''}`
  return snippet || '（空留言）'
}
