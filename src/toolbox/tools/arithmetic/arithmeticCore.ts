/**
 * 算术题生成器纯逻辑：口算题与答案生成（可复现）
 */

export type ArithOp = 'add' | 'sub' | 'mul' | 'div'

export interface ArithOpts {
  /** 启用的运算（至少一项） */
  ops: ArithOp[]
  /** 数值上限（加 / 减 / 乘法因子的上界） */
  max: number
  /** 减法允许负数 */
  allowNegative: boolean
  /** 加 / 减法要求进位或退位 */
  requireCarry: boolean
}

export interface ArithQuestion {
  op: ArithOp
  a: number
  b: number
  answer: number
  text: string
}

export const OP_META: { id: ArithOp; name: string; symbol: string }[] = [
  { id: 'add', name: '加法', symbol: '+' },
  { id: 'sub', name: '减法', symbol: '−' },
  { id: 'mul', name: '乘法', symbol: '×' },
  { id: 'div', name: '除法', symbol: '÷' }
]

export const MAX_QUESTIONS = 200

export function symbolOf(op: ArithOp): string {
  return OP_META.find((o) => o.id === op)?.symbol ?? '+'
}

/** 是否进位（加）或退位（减） */
function hasCarry(a: number, b: number, op: 'add' | 'sub'): boolean {
  if (op === 'add') {
    let x = a
    let y = b
    while (x > 0 && y > 0) {
      if ((x % 10) + (y % 10) >= 10) return true
      x = Math.floor(x / 10)
      y = Math.floor(y / 10)
    }
    return false
  }
  let x = a
  let y = b
  while (x > 0 && y > 0) {
    if ((x % 10) < (y % 10)) return true
    x = Math.floor(x / 10)
    y = Math.floor(y / 10)
  }
  return false
}

export function genQuestion(opts: ArithOpts, rand: () => number): ArithQuestion | null {
  const pool = opts.ops.length ? opts.ops : (['add'] as ArithOp[])
  const op = pool[Math.floor(rand() * pool.length)]
  const max = Math.max(2, Math.min(9999, Math.trunc(opts.max) || 100))
  const ri = (n: number) => 1 + Math.floor(rand() * n)

  let a = 0
  let b = 0
  let answer = 0
  for (let attempt = 0; attempt < 40; attempt++) {
    if (op === 'add') {
      a = ri(max)
      b = ri(max)
      if (opts.requireCarry && !hasCarry(a, b, 'add')) continue
      answer = a + b
    } else if (op === 'sub') {
      a = ri(max)
      b = ri(max)
      if (!opts.allowNegative && b > a) [a, b] = [b, a]
      if (opts.requireCarry && !hasCarry(a, b, 'sub')) continue
      answer = a - b
    } else if (op === 'mul') {
      const cap = Math.max(2, Math.floor(Math.sqrt(max * 9)))
      a = ri(Math.min(max, cap))
      b = ri(Math.min(max, 9))
      answer = a * b
    } else {
      b = ri(Math.min(max, 9))
      answer = ri(Math.min(max, 12))
      a = b * answer
    }
    return { op, a, b, answer, text: `${a} ${symbolOf(op)} ${b} =` }
  }
  // 40 次未满足进退位约束时放宽约束兜底
  a = ri(max)
  b = ri(max)
  if (op === 'sub' && !opts.allowNegative && b > a) [a, b] = [b, a]
  answer = op === 'add' ? a + b : op === 'sub' ? a - b : op === 'mul' ? a * b : a
  return { op, a, b, answer, text: `${a} ${symbolOf(op)} ${b} =` }
}

export function genPaper(opts: ArithOpts, count: number, seed?: number): ArithQuestion[] {
  const n = Math.max(1, Math.min(MAX_QUESTIONS, Math.trunc(count) || 20))
  let s = (typeof seed === 'number' && Number.isFinite(seed) ? Math.trunc(seed) : Date.now()) >>> 0
  if (!s) s = 1
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
  const out: ArithQuestion[] = []
  const seen = new Set<string>()
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const q = genQuestion(opts, rand)
    if (!q) continue
    if (seen.has(q.text)) continue
    seen.add(q.text)
    out.push(q)
  }
  return out
}

export function formatAnswer(q: ArithQuestion): string {
  return `${q.text} ${q.answer}`
}

/** 分栏排版：把题目切到 N 栏 */
export function splitColumns<T>(list: T[], cols: number): T[][] {
  const c = Math.max(1, Math.min(4, Math.trunc(cols) || 2))
  const per = Math.ceil(list.length / c)
  const out: T[][] = []
  for (let i = 0; i < list.length; i += per) out.push(list.slice(i, i + per))
  return out
}
