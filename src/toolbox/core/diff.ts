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
