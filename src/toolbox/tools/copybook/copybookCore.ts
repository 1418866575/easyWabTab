/**
 * 字帖生成纯逻辑：排版计算（页面 / 行 / 列）
 */

export type GridKind = 'tian' | 'mi' | 'fang' | 'sixian'

export interface CopybookOpts {
  grid: GridKind
  /** 每页列数（5~12） */
  cols: number
  /** 每页行数（3~10） */
  rows: number
  /** 描红浓度：0 无 / 1 浅 / 2 中 */
  trace: 0 | 1 | 2
  showPinyin: boolean
}

export interface CopybookCell {
  ch: string
  pinyin: string
}

export interface CopybookPage {
  cells: (CopybookCell | null)[]
}

export const GRID_KINDS: { id: GridKind; name: string }[] = [
  { id: 'tian', name: '田字格' },
  { id: 'mi', name: '米字格' },
  { id: 'fang', name: '方格' },
  { id: 'sixian', name: '四线格' }
]

export const TRACE_LEVELS: { id: 0 | 1 | 2; name: string; alpha: string }[] = [
  { id: 0, name: '仅示例', alpha: '0' },
  { id: 1, name: '浅描红', alpha: '0.25' },
  { id: 2, name: '深描红', alpha: '0.5' }
]

export function clampCols(n: number): number {
  return Math.max(5, Math.min(12, Math.trunc(n) || 10))
}

export function clampRows(n: number): number {
  return Math.max(3, Math.min(10, Math.trunc(n) || 8))
}

/** 把汉字序列排成 N 页（不足的格子为 null） */
export function layoutChars(
  chars: string[],
  opts: CopybookOpts,
  pinyinOf: (ch: string) => string
): CopybookPage[] {
  const cols = clampCols(opts.cols)
  const rows = clampRows(opts.rows)
  const perPage = cols * rows
  const list = chars.filter((c) => c.trim())
  const pages: CopybookPage[] = []
  for (let i = 0; i < list.length; i += perPage) {
    const slice = list.slice(i, i + perPage)
    const cells = Array.from({ length: perPage }, (_, k) => {
      const ch = slice[k]
      return ch ? { ch, pinyin: pinyinOf(ch) } : null
    })
    pages.push({ cells })
  }
  return pages.length ? pages : [{ cells: Array.from({ length: perPage }, () => null) }]
}

/** 描红透明度 */
export function traceAlpha(level: 0 | 1 | 2): string {
  return TRACE_LEVELS.find((t) => t.id === level)?.alpha ?? '0'
}
