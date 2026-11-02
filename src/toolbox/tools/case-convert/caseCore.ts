/**
 * 大小写与命名格式转换纯逻辑
 *
 * 分词规则（splitWords）：
 * - 下划线 / 连字符 / 空白 视为分隔符
 * - 小写转大写的边界视为分隔符（fooBar → foo / Bar）
 * - 「大写串 + 大写 + 小写」时把最后一个大写归到下一词（HTTPServer → HTTP / Server）
 * - 数字紧跟字母时不切分（utf8 → utf8）
 * - 中文等非 ASCII 字符原样保留为独立词
 */

export type CaseKind =
  | 'upper'
  | 'lower'
  | 'title'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab'
  | 'screaming'

export const CASE_KINDS: { id: CaseKind; name: string }[] = [
  { id: 'camel', name: 'camelCase 小驼峰' },
  { id: 'pascal', name: 'PascalCase 大驼峰' },
  { id: 'snake', name: 'snake_case 蛇形' },
  { id: 'kebab', name: 'kebab-case 短横线' },
  { id: 'screaming', name: 'SCREAMING_SNAKE 常量' },
  { id: 'upper', name: '全大写' },
  { id: 'lower', name: '全小写' },
  { id: 'title', name: '首字母大写' }
]

export function splitWords(input: string): string[] {
  const src = typeof input === 'string' ? input : ''
  if (!src.trim()) return []
  // 先按分隔符切，再对每段做 camelCase 边界切分
  return src
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .flatMap((seg) => splitCamel(seg))
}

function splitCamel(seg: string): string[] {
  const out: string[] = []
  let buf = ''
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i]
    const prev = i > 0 ? seg[i - 1] : ''
    const next = i + 1 < seg.length ? seg[i + 1] : ''
    const isUpper = ch >= 'A' && ch <= 'Z'
    const isLower = ch >= 'a' && ch <= 'z'
    const isDigit = ch >= '0' && ch <= '9'
    // 非 ASCII（中文等）单独成词，避免与英文粘连
    if (!isUpper && !isLower && !isDigit) {
      if (buf) out.push(buf)
      buf = ''
      out.push(ch)
      continue
    }
    const boundary =
      isUpper &&
      buf !== '' &&
      !((prev >= 'A' && prev <= 'Z') && !(next >= 'a' && next <= 'z'))
    if (boundary) {
      out.push(buf)
      buf = ''
    }
    buf += ch
  }
  if (buf) out.push(buf)
  return out
}

function cap(w: string): string {
  if (!w) return w
  return w[0].toUpperCase() + w.slice(1).toLowerCase()
}

export function toCamel(words: string[]): string {
  return words.map((w, i) => (i === 0 ? w.toLowerCase() : cap(w))).join('')
}

export function toPascal(words: string[]): string {
  return words.map(cap).join('')
}

export function toSnake(words: string[]): string {
  return words.map((w) => w.toLowerCase()).join('_')
}

export function toKebab(words: string[]): string {
  return words.map((w) => w.toLowerCase()).join('-')
}

export function toUpper(words: string[]): string {
  return words.join(' ').toUpperCase()
}

export function toLower(words: string[]): string {
  return words.join(' ').toLowerCase()
}

export function toTitle(words: string[]): string {
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function toScreaming(words: string[]): string {
  return words.map((w) => w.toUpperCase()).join('_')
}

export type CaseResult = Record<CaseKind, string>

/** 一次性算出全部 8 种格式（均为同一次分词结果，保证互相一致） */
export function convertAll(input: string): CaseResult {
  const words = splitWords(input)
  return {
    upper: toUpper(words),
    lower: toLower(words),
    title: toTitle(words),
    camel: toCamel(words),
    pascal: toPascal(words),
    snake: toSnake(words),
    kebab: toKebab(words),
    screaming: toScreaming(words)
  }
}
