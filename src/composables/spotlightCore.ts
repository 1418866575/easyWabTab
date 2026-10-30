// 工作台全局搜索纯逻辑模块：searchAll 跨 9 类数据过滤分组 → rankResults 排序截断。
// 纯函数硬约束：禁止 import vue/pinia（node --experimental-strip-types 测试运行器无法执行）；
// 匹配逻辑复用既有 filter 纯函数（filterTodos/filterNotes/filterCountdowns），密码类仅按 siteName/url 匹配（不解密内容）；
// 其余类型全部 type-only（Habit 的接口定义在 habitCore，同为纯逻辑模块，type-only 引入无运行时依赖）。
import { filterTodos } from './todoCore.ts'
import { filterNotes } from './noteCore.ts'
import { filterCountdowns } from './countdownCore.ts'
import type { Habit } from './habitCore.ts'
import type {
  Countdown,
  FamilyMember,
  FamilyNameRecord,
  LedgerCategory,
  LedgerEntry,
  PasswordEntry,
  Site,
  WorkbenchDiary,
  WorkbenchNote,
  WorkbenchTodo
} from '../types'

/** 每类搜索结果上限。 */
export const MAX_RESULTS = 5

/**
 * 搜索入参：9 类数据源。
 * todos/notes/countdowns/ledger（分类+记录）/passwords/sites 为原有 6 类；
 * diary/habits/family（成员+取名记录）为「跨面板搜索增强」新增 3 类。
 */
export interface SpotlightData {
  todos: WorkbenchTodo[]
  notes: WorkbenchNote[]
  countdowns: Countdown[]
  ledgerEntries: LedgerEntry[]
  ledgerCategories: LedgerCategory[]
  passwords: PasswordEntry[]
  sites: Site[]
  diary: WorkbenchDiary[]
  habits: Habit[]
  familyMembers: FamilyMember[]
  familyNames: FamilyNameRecord[]
}

/** 记账分组命中：分类命中或记录命中（kind 判别供渲染分支）。 */
export type SpotlightLedgerHit =
  | { kind: 'category'; category: LedgerCategory }
  | { kind: 'entry'; entry: LedgerEntry }

/**
 * 家谱分组命中：家庭成员命中或取名记录命中（kind 判别供渲染分支，仿 SpotlightLedgerHit）。
 * 取名记录的载荷刻意命名为 record 而非 name —— 若叫 name，读写处会退化成 `hit.name.name`，语义含糊。
 */
export type SpotlightGenealogyHit =
  | { kind: 'member'; member: FamilyMember }
  | { kind: 'name'; record: FamilyNameRecord }

/** 全局搜索结果分组（每类 ≤ MAX_RESULTS 条）。 */
export interface SpotlightGroups {
  todos: WorkbenchTodo[]
  notes: WorkbenchNote[]
  countdowns: Countdown[]
  ledger: SpotlightLedgerHit[]
  passwords: PasswordEntry[]
  sites: Site[]
  diary: WorkbenchDiary[]
  habits: Habit[]
  genealogy: SpotlightGenealogyHit[]
}

/** 归一化 query：undefined/null/纯空白 → 空串；统一小写（与 filterTodos 等大小写不敏感一致）。 */
function normalizeQuery(query: string | undefined): string {
  return (query ?? '').trim().toLowerCase()
}

/** 大小写不敏感子串匹配；undefined 字段视为空串。 */
function has(text: string | undefined, q: string): boolean {
  return (text ?? '').toLowerCase().includes(q)
}

/** 空 query → 全空分组（不抛错）。 */
function emptyGroups(): SpotlightGroups {
  return {
    todos: [],
    notes: [],
    countdowns: [],
    ledger: [],
    passwords: [],
    sites: [],
    diary: [],
    habits: [],
    genealogy: []
  }
}

// ==================== 各类过滤（复用既有 filter 纯函数 / 子串匹配） ====================

/** 待办：标题 OR 描述命中（filterTodos 单条件为 AND，故标题/描述各查一次取并集，复用其大小写不敏感逻辑）。 */
function matchTodos(q: string, todos: WorkbenchTodo[]): WorkbenchTodo[] {
  const byTitle = filterTodos(todos, { title: q })
  const seen = new Set(byTitle.map(t => t.id))
  return [...byTitle, ...filterTodos(todos, { description: q }).filter(t => !seen.has(t.id))]
}

/** 便签：filterNotes keyword 已覆盖 title+content。 */
function matchNotes(q: string, notes: WorkbenchNote[]): WorkbenchNote[] {
  return filterNotes(notes, { keyword: q })
}

/** 倒计时：filterCountdowns name 模糊。 */
function matchCountdowns(q: string, countdowns: Countdown[]): Countdown[] {
  return filterCountdowns(countdowns, { name: q })
}

/** 记账：分类按 name 命中；记录按 note 命中。 */
function matchLedger(q: string, data: SpotlightData): SpotlightLedgerHit[] {
  const hits: SpotlightLedgerHit[] = []
  for (const c of data.ledgerCategories) {
    if (has(c.name, q)) hits.push({ kind: 'category', category: c })
  }
  for (const e of data.ledgerEntries) {
    if (has(e.note, q)) hits.push({ kind: 'entry', entry: e })
  }
  return hits
}

/** 密码：仅 siteName/url 命中（绝不匹配加密的 password 内容，无解密）。 */
function matchPasswords(q: string, passwords: PasswordEntry[]): PasswordEntry[] {
  return passwords.filter(p => has(p.siteName, q) || has(p.url, q))
}

/** 网址：name/url 命中。 */
function matchSites(q: string, sites: Site[]): Site[] {
  return sites.filter(s => has(s.name, q) || has(s.url, q))
}

/** 日记：标题 OR 正文命中（标题可选，空则只看正文）。 */
function matchDiary(q: string, diary: WorkbenchDiary[]): WorkbenchDiary[] {
  return diary.filter(d => has(d.title, q) || has(d.content, q))
}

/** 习惯：仅按 name 命中（习惯无备注/描述字段）。 */
function matchHabits(q: string, habits: Habit[]): Habit[] {
  return habits.filter(h => has(h.name, q))
}

/** 家谱：成员按 name/note 命中；取名记录按 name/meaning 命中。 */
function matchGenealogy(q: string, data: SpotlightData): SpotlightGenealogyHit[] {
  const hits: SpotlightGenealogyHit[] = []
  for (const m of data.familyMembers) {
    if (has(m.name, q) || has(m.note, q)) hits.push({ kind: 'member', member: m })
  }
  for (const n of data.familyNames) {
    if (has(n.name, q) || has(n.meaning, q)) hits.push({ kind: 'name', record: n })
  }
  return hits
}

// ==================== 排序 ====================

/** 打分条目：score 越高越靠前（标题命中 = 2，次要字段命中 = 1，未命中 = 0）；updatedAt 用于同分平局。 */
interface Scored<T> {
  item: T
  score: number
  updatedAt: string
}

function tsOf(iso: string): number {
  const t = new Date(iso).getTime()
  return isNaN(t) ? 0 : t
}

/** 稳定排序：匹配度降序（标题命中优先）→ updatedAt 降序（新的在前）→ 原序保持（Array.sort 稳定）。 */
function rankScored<T>(scored: Scored<T>[]): T[] {
  return [...scored]
    .sort((a, b) => b.score - a.score || tsOf(b.updatedAt) - tsOf(a.updatedAt))
    .map(s => s.item)
}

function scoreTodos(q: string, items: WorkbenchTodo[]): Scored<WorkbenchTodo>[] {
  return items.map(t => ({
    item: t,
    score: has(t.title, q) ? 2 : has(t.description, q) ? 1 : 0,
    updatedAt: t.updatedAt
  }))
}

function scoreNotes(q: string, items: WorkbenchNote[]): Scored<WorkbenchNote>[] {
  return items.map(n => ({
    item: n,
    score: has(n.title, q) ? 2 : has(n.content, q) ? 1 : 0,
    updatedAt: n.updatedAt
  }))
}

function scoreCountdowns(q: string, items: Countdown[]): Scored<Countdown>[] {
  return items.map(c => ({ item: c, score: has(c.name, q) ? 2 : 0, updatedAt: c.updatedAt }))
}

function scoreLedger(q: string, hits: SpotlightLedgerHit[]): Scored<SpotlightLedgerHit>[] {
  return hits.map(h =>
    h.kind === 'category'
      ? { item: h, score: has(h.category.name, q) ? 2 : 0, updatedAt: '' }
      : { item: h, score: has(h.entry.note, q) ? 1 : 0, updatedAt: h.entry.updatedAt }
  )
}

function scorePasswords(q: string, items: PasswordEntry[]): Scored<PasswordEntry>[] {
  return items.map(p => ({
    item: p,
    score: has(p.siteName, q) ? 2 : has(p.url, q) ? 1 : 0,
    updatedAt: p.updatedAt
  }))
}

function scoreSites(q: string, items: Site[]): Scored<Site>[] {
  return items.map(s => ({
    item: s,
    score: has(s.name, q) ? 2 : has(s.url, q) ? 1 : 0,
    updatedAt: s.updatedAt ?? s.createdAt ?? ''
  }))
}

function scoreDiary(q: string, items: WorkbenchDiary[]): Scored<WorkbenchDiary>[] {
  return items.map(d => ({
    item: d,
    score: has(d.title, q) ? 2 : has(d.content, q) ? 1 : 0,
    updatedAt: d.updatedAt
  }))
}

/** 习惯无 updatedAt（接口只有 createdAt），平局时间戳回落到创建时间。 */
function scoreHabits(q: string, items: Habit[]): Scored<Habit>[] {
  return items.map(h => ({ item: h, score: has(h.name, q) ? 2 : 0, updatedAt: h.createdAt }))
}

function scoreGenealogy(q: string, hits: SpotlightGenealogyHit[]): Scored<SpotlightGenealogyHit>[] {
  return hits.map(h =>
    h.kind === 'member'
      ? {
          item: h,
          score: has(h.member.name, q) ? 2 : has(h.member.note, q) ? 1 : 0,
          updatedAt: h.member.updatedAt
        }
      : {
          item: h,
          score: has(h.record.name, q) ? 2 : has(h.record.meaning, q) ? 1 : 0,
          updatedAt: h.record.updatedAt
        }
  )
}

/**
 * 对已过滤分组重新排序：标题命中优先 → 匹配度 → updatedAt 降序。
 * 返回新分组对象，不修改入参；空 query 原样返回。
 */
export function rankResults(groups: SpotlightGroups, query: string | undefined): SpotlightGroups {
  const q = normalizeQuery(query)
  if (q === '') return groups
  return {
    todos: rankScored(scoreTodos(q, groups.todos)),
    notes: rankScored(scoreNotes(q, groups.notes)),
    countdowns: rankScored(scoreCountdowns(q, groups.countdowns)),
    ledger: rankScored(scoreLedger(q, groups.ledger)),
    passwords: rankScored(scorePasswords(q, groups.passwords)),
    sites: rankScored(scoreSites(q, groups.sites)),
    diary: rankScored(scoreDiary(q, groups.diary)),
    habits: rankScored(scoreHabits(q, groups.habits)),
    genealogy: rankScored(scoreGenealogy(q, groups.genealogy))
  }
}

/** 每类截断到 MAX_RESULTS。 */
function capGroups(groups: SpotlightGroups): SpotlightGroups {
  return {
    todos: groups.todos.slice(0, MAX_RESULTS),
    notes: groups.notes.slice(0, MAX_RESULTS),
    countdowns: groups.countdowns.slice(0, MAX_RESULTS),
    ledger: groups.ledger.slice(0, MAX_RESULTS),
    passwords: groups.passwords.slice(0, MAX_RESULTS),
    sites: groups.sites.slice(0, MAX_RESULTS),
    diary: groups.diary.slice(0, MAX_RESULTS),
    habits: groups.habits.slice(0, MAX_RESULTS),
    genealogy: groups.genealogy.slice(0, MAX_RESULTS)
  }
}

/**
 * 全局搜索：跨 9 类数据按 query 过滤、排序、每类截断 MAX_RESULTS 条。
 * 空/纯空白 query → 全空分组（不抛错）；大小写不敏感；密码仅按 siteName/url 匹配。
 */
export function searchAll(query: string | undefined, data: SpotlightData): SpotlightGroups {
  const q = normalizeQuery(query)
  if (q === '') return emptyGroups()
  return capGroups(
    rankResults(
      {
        todos: matchTodos(q, data.todos),
        notes: matchNotes(q, data.notes),
        countdowns: matchCountdowns(q, data.countdowns),
        ledger: matchLedger(q, data),
        passwords: matchPasswords(q, data.passwords),
        sites: matchSites(q, data.sites),
        diary: matchDiary(q, data.diary),
        habits: matchHabits(q, data.habits),
        genealogy: matchGenealogy(q, data)
      },
      q
    )
  )
}
