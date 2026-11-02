/**
 * 字数统计纯逻辑（可单测，不触碰 DOM）
 *
 * 口径说明（UI 需同步展示，避免歧义）：
 * - 字符数：全部字符（默认含空白；`countSpace: false` 时剔除空白）
 * - 中文字数：CJK 统一汉字区间（不含中文标点）
 * - 英文单词：连续拉丁字母串
 * - 标点：CJK 标点 + ASCII 标点
 * - 行数：按 \r\n / \r / \n 切分后的行数（空文本为 0）
 * - 阅读时长：中文 300 字/分钟 + 英文 200 词/分钟，向上取整，至少 1 分钟
 */

export interface TopWord {
  word: string
  count: number
}

export interface WordCountResult {
  /** 字符数（按 countSpace 决定是否含空白） */
  chars: number
  /** 去空白字符数 */
  charsNoSpace: number
  /** 中文字数 */
  chinese: number
  /** 英文单词数 */
  englishWords: number
  /** 标点符号数 */
  punctuation: number
  /** 行数 */
  lines: number
  /** 预计阅读分钟数 */
  readMinutes: number
  /** 高频字词（降序） */
  topWords: TopWord[]
}

const RE_CHINESE = /[\u4e00-\u9fa5]/g
const RE_ENGLISH = /[A-Za-z]+/g
/** CJK 标点 + ASCII 标点（空白、字母、数字不算） */
const RE_PUNCT = /[\u3000-\u303f\uff00-\uffef\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e]/g
const RE_SPACE = /\s/g

/** 英文高频停用词：计入词频无意义，直接剔除 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'as', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'am', 'it', 'its', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your', 'his', 'her', 'our', 'their',
  'not', 'no', 'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'can', 'could'
])

function countMatch(text: string, re: RegExp): number {
  const m = text.match(re)
  return m ? m.length : 0
}

/** 中文二字词：对连续汉字串做滑窗切分（「中华人民共和国」→ 中华/华人民… 逐对） */
function chineseBigrams(text: string, bag: Map<string, number>): void {
  const runs = text.match(/[\u4e00-\u9fa5]{2,}/g)
  if (!runs) return
  for (const run of runs) {
    for (let i = 0; i + 1 < run.length; i++) {
      const w = run.slice(i, i + 2)
      bag.set(w, (bag.get(w) ?? 0) + 1)
    }
  }
}

function englishWords(text: string, bag: Map<string, number>): void {
  const list = text.match(RE_ENGLISH)
  if (!list) return
  for (const raw of list) {
    const w = raw.toLowerCase()
    if (w.length < 2 || STOP_WORDS.has(w)) continue
    bag.set(w, (bag.get(w) ?? 0) + 1)
  }
}

export function countText(text: string, opts?: { countSpace?: boolean; topN?: number }): WordCountResult {
  const src = typeof text === 'string' ? text : ''
  const countSpace = opts?.countSpace !== false
  const topN = Math.max(1, Math.min(50, opts?.topN ?? 20))

  const chinese = countMatch(src, RE_CHINESE)
  const englishWordsCount = countMatch(src, RE_ENGLISH)
  const punctuation = countMatch(src, RE_PUNCT)
  const charsNoSpace = src.replace(RE_SPACE, '').length
  const lines = src ? src.split(/\r\n|\r|\n/).length : 0

  const bag = new Map<string, number>()
  chineseBigrams(src, bag)
  englishWords(src, bag)
  // 出现 1 次的词价值低：仅在「无任何重复词」时才兜底展示
  const repeated = [...bag.entries()].filter(([, c]) => c > 1)
  const source = repeated.length ? repeated : [...bag.entries()]
  const topWords = source
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }))

  const minutes = chinese / 300 + englishWordsCount / 200

  return {
    chars: countSpace ? src.length : charsNoSpace,
    charsNoSpace,
    chinese,
    englishWords: englishWordsCount,
    punctuation,
    lines,
    readMinutes: minutes > 0 ? Math.max(1, Math.ceil(minutes)) : 0,
    topWords
  }
}
