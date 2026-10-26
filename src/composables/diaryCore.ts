// 工作台日记本纯逻辑模块：normalizeDiaryData 归一化 → sortDiaryEntries/findDiaryByDate 展示层。
// 纯函数硬约束：禁止 import vue/pinia（node --experimental-strip-types 测试运行器无法执行）；
// 类型全部 type-only（与 noteCore 同模式）。
import type { DiaryData, WorkbenchDiary, WorkbenchJournal } from '../types/index.ts'
import { keepStamp } from './tombstoneCore.ts'

/** 默认日志本（旧数据/外部导入无 journalId 时归入此本）。 */
export const DEFAULT_JOURNAL_ID = 'jb_default'
export const DEFAULT_JOURNAL_NAME = '默认日志本'

/** 日记心情预设（存 key，展示 emoji + label）。 */
export interface DiaryMood {
  key: string
  emoji: string
  label: string
}

export const DIARY_MOODS: DiaryMood[] = [
  { key: 'happy', emoji: '😊', label: '开心' },
  { key: 'calm', emoji: '😐', label: '平淡' },
  { key: 'sad', emoji: '😢', label: '低落' },
  { key: 'angry', emoji: '😡', label: '烦躁' },
  { key: 'tired', emoji: '😴', label: '疲惫' },
  { key: 'think', emoji: '🤔', label: '思考' },
  { key: 'warm', emoji: '🥰', label: '温馨' },
  { key: 'full', emoji: '💪', label: '充实' }
]

/** 由 mood key 取心情定义（非法 key → undefined）。 */
export function diaryMoodOf(key?: string): DiaryMood | undefined {
  return key ? DIARY_MOODS.find(m => m.key === key) : undefined
}

/** 空日记数据：无日志本、无条目（返回全新结构，不共享任何引用）。 */
export function emptyDiaryData(): DiaryData {
  return { journals: [], entries: [] }
}

/** 构造默认日志本（旧数据/外部导入无 journals 时兜底）。 */
export function defaultJournal(): WorkbenchJournal {
  return {
    id: DEFAULT_JOURNAL_ID,
    name: DEFAULT_JOURNAL_NAME,
    createdAt: new Date().toISOString(),
    order: 0
  }
}

/** 本地日期键正则：结构 ^\d{4}-\d{2}-\d{2}$（不含时间部分）。 */
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 日期键校验：正则 + 范围检查（月 1-12 / 日 1-31），镜像便签 datetime 校验语义
 * （纯正则无法拒绝 '2026-13-99'；同日仅 1-31 范围、不校验当月天数 → '2026-02-30' 通过）。
 */
export function isValidDateKey(key: string): boolean {
  if (typeof key !== 'string' || !DATE_KEY_RE.test(key)) return false
  const [, m, d] = key.split('-').map(Number)
  return m >= 1 && m <= 12 && d >= 1 && d <= 31
}

/** 本地日期 → 'YYYY-MM-DD'（不能用 toISOString，那是 UTC 会偏一天；与 todoCore.localToday 同源防偏移）。 */
export function dateKeyOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 中文星期标签（getDay() 0=周日 .. 6=周六）。 */
const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

/**
 * 日期标签：'YYYY-MM-DD' → 'YYYY-MM-DD 周X'（含中文星期）。
 * 非法日期键原样返回（不吞不抛）。
 */
export function diaryDateLabel(dateKey: string): string {
  if (!isValidDateKey(dateKey)) return dateKey
  const [y, m, d] = dateKey.split('-').map(Number)
  return `${dateKey} ${WEEKDAY_CN[new Date(y, m - 1, d).getDay()]}`
}

/** 从 markdown 正文提取第一张内联图片（data:image/... base64）的 URL；无图 → ''。 */
const FIRST_IMAGE_RE = /!\[[^\]]*\]\((data:image\/[^)\s]+)\)/
export function extractFirstImage(content: string): string {
  if (typeof content !== 'string') return ''
  const m = FIRST_IMAGE_RE.exec(content)
  return m ? m[1] : ''
}

/**
 * 单条日记归一化（幂等，脏数据吞掉不抛错）：
 * - 非对象 → null（剔除，不生成兜底条目）
 * - date 缺失/非法（isValidDateKey 拒绝）→ null（剔除）
 * - id 缺失/非字符串 → 回退 `dy_<date>`（与 store.upsertEntry 的 dy_ 前缀一致）
 * - content 非字符串 → ''（字符串原样保留，不 trim——正文空格属用户内容）
 * - title 非字符串 → ''（trim + 截断 100，可选字段）
 * - createdAt/updatedAt 非法/缺失 → 当前 ISO 字符串
 */
function normalizeDiaryEntry(raw: unknown): WorkbenchDiary | null {
  if (!raw || typeof raw !== 'object') return null
  const src = raw as Record<string, unknown>
  const date = typeof src.date === 'string' ? src.date : ''
  if (!isValidDateKey(date)) return null
  const nowIso = new Date().toISOString()
  const entry: WorkbenchDiary = {
    id: typeof src.id === 'string' && src.id ? src.id : `dy_${date}`,
    journalId: typeof src.journalId === 'string' && src.journalId ? src.journalId : DEFAULT_JOURNAL_ID,
    date,
    // 标题：可选字段，trim + 截断 100（旧数据没有该字段 → ''）
    title: typeof src.title === 'string' ? src.title.trim().slice(0, 100) : '',
    content: typeof src.content === 'string' ? src.content : '',
    createdAt: typeof src.createdAt === 'string' ? src.createdAt : nowIso,
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : nowIso,
    kind: src.kind === 'idea' ? 'idea' : 'diary',
    // 结构字段：带安全默认值（旧数据缺字段 → 补 ''/''/false，不丢条目）
    category: typeof src.category === 'string' ? src.category : '',
    mood: typeof src.mood === 'string' ? src.mood : '',
    pinned: src.pinned === true,
    deleted: src.deleted === true,
    // 封面图：显式 dataURL 优先；缺省 ''（展示时回退正文首图，见 extractFirstImage）
    coverImage: typeof src.coverImage === 'string' ? src.coverImage : ''
  }
  // 墓碑与版本戳原样保留（详见 tombstoneCore.keepStamp）
  return keepStamp(entry, src)
}

/** 单条日志本归一化（安全默认值，缺字段不抛错）。 */
function normalizeJournal(raw: unknown): WorkbenchJournal | null {
  if (!raw || typeof raw !== 'object') return null
  const src = raw as Record<string, unknown>
  if (typeof src.id !== 'string' || !src.id) return null
  const journal: WorkbenchJournal = {
    id: src.id,
    name: typeof src.name === 'string' && src.name ? src.name : DEFAULT_JOURNAL_NAME,
    icon: typeof src.icon === 'string' ? src.icon : undefined,
    createdAt: typeof src.createdAt === 'string' ? src.createdAt : new Date().toISOString(),
    order: typeof src.order === 'number' ? src.order : 0
  }
  // 墓碑与版本戳原样保留（日志本删除也要能同步出去）
  return keepStamp(journal, src)
}

/**
 * 整库归一化（幂等）：
 * - 非对象入参（null/数字/字符串/数组）→ emptyDiaryData()
 * - 对象含 journals/entries 数组 → 逐条归一（非对象/非法 剔除，缺失 id/字段回退安全默认值）
 * - journals 非数组/缺失 → []（store 加载时保证至少存在默认日志本）
 * - 条目 journalId 缺省 → 归入 DEFAULT_JOURNAL_ID（保证不悬空）
 */
export function normalizeDiaryData(raw: unknown): DiaryData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDiaryData()
  const src = raw as Record<string, unknown>
  const journals = Array.isArray(src.journals)
    ? src.journals.map(normalizeJournal).filter((j): j is WorkbenchJournal => j !== null)
    : []
  const entries = Array.isArray(src.entries)
    ? src.entries.map(normalizeDiaryEntry).filter((e): e is WorkbenchDiary => e !== null)
    : []
  return { journals, entries }
}

/**
 * 连续记录统计：基于日期集合计算「连续天数」（从今天往回数，今天无记录则从昨天起算，仍算连续中）
 * 与「累计篇数」（条目总数）。纯函数，便于单测。
 */
export function computeStreak(entries: WorkbenchDiary[]): { streak: number; total: number } {
  const total = entries.length
  const dates = new Set<string>()
  for (const e of entries) if (isValidDateKey(e.date)) dates.add(e.date)
  if (dates.size === 0) return { streak: 0, total }
  // 从今天起算；今天无记录则从昨天开始（streak 仍"进行中"）
  const cursor = new Date()
  if (!dates.has(dateKeyOf(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  // 防御：最多 3650 天，避免异常数据死循环
  for (let i = 0; i < 3650; i++) {
    const key = dateKeyOf(cursor)
    if (!dates.has(key)) break
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return { streak, total }
}

/**
 * 日记排序：date 降序（最新日期在前）→ 同日期 createdAt 降序（后写的在前）。
 * 返回新数组，不 mutate 入参。
 */
export function sortDiaryEntries(entries: WorkbenchDiary[]): WorkbenchDiary[] {
  return [...entries].sort((a, b) => {
    // 置顶优先（pinned 排前）
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
    return 0
  })
}

/** 按日期查找日记条目：dateKey 精确匹配，未命中 → undefined。 */
export function findDiaryByDate(entries: WorkbenchDiary[], dateKey: string): WorkbenchDiary | undefined {
  return entries.find(e => e.date === dateKey)
}
