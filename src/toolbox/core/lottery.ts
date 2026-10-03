/**
 * 抽奖核心纯函数（零 Vue / 零 IO 依赖，可被 node --experimental-strip-types 直测）
 *
 * - 名单解析：按行切分，去空、去重（同名去重，保留首次出现）
 * - 奖项定义：默认 7 个奖项，按awards 顺序
 * - 抽签：Fisher–Yates 洗牌后取首位（无偏、可注入随机源便于测试）；
 *   抽中者从候选池移除，天然保证「同一人不会进入下一次抽奖」
 * - 记录：每次抽中写入一条中奖记录（含奖项、时间戳、序号）
 */

export interface LotteryPerson {
  /** 唯一 id（同 name 去重后稳定生成） */
  id: string
  /** 姓名 */
  name: string
  /** 可选备注，如部门 */
  dept?: string
}

export interface LotteryAward {
  id: string
  name: string
  /** 该奖项抽取人数 */
  count: number
}

export interface LotteryWin {
  /** 中奖记录 id */
  id: string
  personId: string
  name: string
  dept?: string
  awardId: string
  awardName: string
  /** 第几位（该奖项内序号，从 1 起） */
  seq: number
  /** 中奖时间戳（ms） */
  ts: number
}

export interface LotteryData {
  people: LotteryPerson[]
  wins: LotteryWin[]
}

/** 默认奖项（年会常见配置；可在界面调整人数） */
export const DEFAULT_AWARDS: LotteryAward[] = [
  { id: 'special', name: '特等奖', count: 1 },
  { id: 'first', name: '一等奖', count: 1 },
  { id: 'second', name: '二等奖', count: 2 },
  { id: 'third', name: '三等奖', count: 3 },
  { id: 'excellent', name: '优秀员工奖', count: 5 },
  { id: 'perfect', name: '全勤奖', count: 5 },
  { id: 'progress', name: '进步奖', count: 5 }
]

/** 稳定 id：同名同姓用序号区分，避免重复 */
function makeId(name: string, used: Set<string>): string {
  let n = 1
  let id = name
  while (used.has(id)) id = `${name}#${++n}`
  used.add(id)
  return id
}

/**
 * 解析名单文本 → 人员数组
 * 规则：按行切分；每行支持「姓名」或「姓名,部门」/「姓名 部门」；
 * 去空行、去重（同名只保留首次），返回带稳定 id 的人员列表
 */
export function parsePeople(text: string): LotteryPerson[] {
  const seen = new Map<string, LotteryPerson>()
  const usedIds = new Set<string>()
  const lines = (text || '').split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    // 兼容「姓名,部门」「姓名，部门」「姓名 部门」；取首个分隔符后的部分作部门
    const m = line.match(/^([^,，\t]+)[\s,，\t]+(.+)$/)
    const name = (m ? m[1] : line).trim()
    const dept = m ? m[2].trim() : ''
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue // 同名去重
    const p: LotteryPerson = { id: makeId(name, usedIds), name }
    if (dept) p.dept = dept
    seen.set(key, p)
  }
  return [...seen.values()]
}

/** 候选池：排除已中奖者（不进入下一次抽奖） */
export function candidatesOf(people: LotteryPerson[], wins: LotteryWin[]): LotteryPerson[] {
  const won = new Set(wins.map(w => w.personId))
  return people.filter(p => !won.has(p.id))
}

/**
 * 抽一名获奖者：Fisher–Yates 洗牌取首位（无偏）
 * @param pool 候选池（调用方需保证非空）
 * @param rnd 随机源（0–1），默认 Math.random
 */
export function drawOne(pool: LotteryPerson[], rnd: () => number = Math.random): LotteryPerson {
  const arr = pool.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr[0]
}

/** 构造中奖记录 */
export function makeWin(
  person: LotteryPerson,
  award: LotteryAward,
  seq: number,
  ts: number,
  idSuffix = ''
): LotteryWin {
  const win: LotteryWin = {
    id: `${person.id}-${award.id}-${ts}${idSuffix}`,
    personId: person.id,
    name: person.name,
    awardId: award.id,
    awardName: award.name,
    seq,
    ts
  }
  if (person.dept) win.dept = person.dept
  return win
}

/** 按奖项分组中奖记录（保持中奖先后顺序） */
export function groupWinsByAward(wins: LotteryWin[]): Map<string, LotteryWin[]> {
  const map = new Map<string, LotteryWin[]>()
  for (const w of wins) {
    const arr = map.get(w.awardId)
    if (arr) arr.push(w)
    else map.set(w.awardId, [w])
  }
  return map
}

/** 归一化持久化数据（脏数据兜底） */
export function normalizeLotteryData(raw: unknown): LotteryData {
  const empty: LotteryData = { people: [], wins: [] }
  if (!raw || typeof raw !== 'object') return empty
  const d = raw as Partial<LotteryData>
  const people = Array.isArray(d.people)
    ? d.people
        .filter((p): p is LotteryPerson => !!p && typeof p.id === 'string' && typeof p.name === 'string')
        .map(p => (p.dept ? { id: p.id, name: p.name, dept: String(p.dept) } : { id: p.id, name: p.name }))
    : []
  const wins = Array.isArray(d.wins)
    ? d.wins.filter(
        (w): w is LotteryWin =>
          !!w && typeof w.id === 'string' && typeof w.personId === 'string' && typeof w.name === 'string'
      )
    : []
  return { people, wins }
}
