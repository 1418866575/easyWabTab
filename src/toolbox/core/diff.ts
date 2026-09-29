/**
 * 行级文本差异对比（LCS 最长公共子序列）
 * - 常规规模用动态规划求最优解
 * - 超长文本（任一侧 > 600 行）退化为逐行对比，避免内存与耗时失控
 */

export interface DiffRow {
  type: 'same' | 'add' | 'del'
  text: string
}

const MAX_LINES = 600

export function diffLines(a: string[], b: string[]): DiffRow[] {
  const n = a.length
  const m = b.length
  const rows: DiffRow[] = []

  if (n > MAX_LINES || m > MAX_LINES) {
    for (let i = 0; i < Math.max(n, m); i++) {
      if (i >= n) rows.push({ type: 'add', text: b[i] })
      else if (i >= m) rows.push({ type: 'del', text: a[i] })
      else rows.push(a[i] === b[i] ? { type: 'same', text: a[i] } : { type: 'add', text: b[i] })
    }
    return rows
  }

  const dp: Uint16Array[] = []
  for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { rows.push({ type: 'same', text: a[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { rows.push({ type: 'del', text: a[i] }); i++ }
    else { rows.push({ type: 'add', text: b[j] }); j++ }
  }
  while (i < n) rows.push({ type: 'del', text: a[i++] })
  while (j < m) rows.push({ type: 'add', text: b[j++] })
  return rows
}

/* ==================== 扩展：字符级差异与对比选项 ==================== */

export interface DiffPart {
  type: 'same' | 'add' | 'del'
  text: string
}

export interface DiffLine {
  type: 'same' | 'add' | 'del' | 'modify'
  left?: string
  right?: string
  /** 修改行的字符级片段（左侧删除 / 右侧新增） */
  leftParts?: DiffPart[]
  rightParts?: DiffPart[]
  leftNo?: number
  rightNo?: number
}

export interface DiffOptions {
  ignoreWhitespace?: boolean
  ignoreCase?: boolean
  ignoreBlankLines?: boolean
  /** 行级结果之外，对「修改行」再计算字符级差异 */
  charLevel?: boolean
}

export interface DiffResult {
  lines: DiffLine[]
  stats: { same: number; add: number; del: number; modify: number }
}

/** 字符级 LCS 差异 */
export function diffChars(a: string, b: string): DiffPart[] {
  const n = a.length
  const m = b.length
  if (n > 2000 || m > 2000) {
    return a === b ? [{ type: 'same', text: a }] : [{ type: 'del', text: a }, { type: 'add', text: b }]
  }
  const dp: Uint16Array[] = []
  for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffPart[] = []
  const push = (type: DiffPart['type'], text: string) => {
    if (!text) return
    const last = out[out.length - 1]
    if (last && last.type === type) last.text += text
    else out.push({ type, text })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('del', a[i])
      i++
    } else {
      push('add', b[j])
      j++
    }
  }
  while (i < n) push('del', a[i++])
  while (j < m) push('add', b[j++])
  return out
}

function normalize(text: string, opts: DiffOptions): string[] {
  let lines = (text || '').split(/\r?\n/)
  if (opts.ignoreBlankLines) lines = lines.filter(l => l.trim() !== '')
  if (opts.ignoreWhitespace || opts.ignoreCase) {
    lines = lines.map(l => {
      let s = opts.ignoreWhitespace ? l.replace(/\s+/g, '') : l
      if (opts.ignoreCase) s = s.toLowerCase()
      return s
    })
  }
  return lines
}

/** 两段文本对比：行级 + 可选字符级 */
export function diffTexts(left: string, right: string, opts: DiffOptions = {}): DiffResult {
  const rawLeft = (left || '').split(/\r?\n/)
  const rawRight = (right || '').split(/\r?\n/)
  const normLeft = normalize(left, opts)
  const normRight = normalize(right, opts)
  const rows = diffLines(normLeft, normRight)
  const lines: DiffLine[] = []
  const stats = { same: 0, add: 0, del: 0, modify: 0 }
  let li = 0
  let ri = 0
  for (const r of rows) {
    if (r.type === 'same') {
      lines.push({ type: 'same', left: normLeft[li] ?? '', right: normRight[ri] ?? '', leftNo: ++li, rightNo: ++ri })
      stats.same++
    } else if (r.type === 'del') {
      lines.push({ type: 'del', left: normLeft[li] ?? '', leftNo: ++li })
      stats.del++
    } else {
      lines.push({ type: 'add', right: normRight[ri] ?? '', rightNo: ++ri })
      stats.add++
    }
  }
  // 配对的 del/add 合并为 modify（展示更直观）
  const merged: DiffLine[] = []
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i]
    const next = lines[i + 1]
    if (cur.type === 'del' && next && next.type === 'add') {
      const l = cur.left ?? ''
      const rr = next.right ?? ''
      const entry: DiffLine = { type: 'modify', left: l, right: rr, leftNo: cur.leftNo, rightNo: next.rightNo }
      if (opts.charLevel !== false) {
        const parts = diffChars(l, rr)
        entry.leftParts = parts.filter(p => p.type !== 'add')
        entry.rightParts = parts.filter(p => p.type !== 'del')
      }
      merged.push(entry)
      stats.modify++
      stats.del--
      stats.add--
      i++
    } else {
      merged.push(cur)
    }
  }
  // 未做归一化时行号与原文一致；归一化时保留原始文本供展示
  if (opts.ignoreBlankLines || opts.ignoreWhitespace || opts.ignoreCase) {
    merged.forEach(l => {
      if (l.left !== undefined && l.leftNo) l.left = rawLeft[l.leftNo - 1] ?? l.left
      if (l.right !== undefined && l.rightNo) l.right = rawRight[l.rightNo - 1] ?? l.right
    })
  }
  return { lines: merged, stats }
}
