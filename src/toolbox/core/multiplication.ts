/**
 * 乘法表构建纯函数（零依赖，可被 node --experimental-strip-types 直测）
 *
 * 术语约定（勿混用，各地区叫法有差异，本工具取通行的一套）：
 * - **大九九**：19×19 的完整方阵，共 361 个算式，1×1 直到 19×19
 *   （即江南、安徽一带传统「十九乘十九表」，范围最大的一张）。
 * - **小九九**：9×9 下三角（含主对角线），共 45 个算式，
 *   即目前小学实际背诵与默写的范围（口诀「一九得九」到「九九八十一」）。
 *
 * 两层背景含义在本表中并存：
 * - `isSmallCell` —— 小九九 45 格，底色一档（背诵范围）；
 * - 主对角线 19 格（1×1…19×19），底色再深一档（平方列）。
 *
 * 布局约定：行 = row（被乘数），列 = col（乘数）；小九九区取下三角（col <= row），
 * 与口诀「二四得八」的背诵顺序（从小数到大数）一致。
 * 注意「口诀」只在小九九范围内成立，>9 的因子没有对应口诀。
 */

/** 大九九表边长：19×19 = 361 个算式 */
export const MULT_MAX = 19

/** 小九九表边长：9×9 下三角 = 45 个算式（口诀范围） */
export const SMALL_MAX = 9

export interface MulCell {
  /** 行因子（被乘数） */
  row: number
  /** 列因子（乘数） */
  col: number
  /** 乘积 */
  value: number
  /** 是否落在小九九区（1–9 的下三角，45 格） */
  small: boolean
  /** 是否为主对角线（row === col） */
  diag: boolean
}

/** 把任意输入收敛为合法的表边长：1–max，且非正数回落 SMALL_MAX */
function clampMax(max: number): number {
  if (!Number.isFinite(max)) return MULT_MAX
  const v = Math.floor(max)
  if (v < 1) return SMALL_MAX
  return Math.min(MULT_MAX, v)
}

/**
 * 是否属于小九九区域：row <= 9 且 col <= row。
 * 判定对称 —— (row, col) 与 (col, row) 归为同一格，小九九共 45 格。
 */
export function isSmallCell(row: number, col: number): boolean {
  return row <= SMALL_MAX && col <= row
}

/** 是否为主对角线（平方列） */
export function isDiagCell(row: number, col: number): boolean {
  return row === col
}

/** 构建 N×N 乘法表（大九九方阵）。max 非法时收敛到 [1, MULT_MAX] */
export function buildMulTable(max: number = MULT_MAX): MulCell[][] {
  const n = clampMax(max)
  const rows: MulCell[][] = []
  for (let r = 1; r <= n; r++) {
    const cells: MulCell[] = []
    for (let c = 1; c <= n; c++) {
      cells.push({
        row: r,
        col: c,
        value: r * c,
        small: isSmallCell(r, c),
        diag: isDiagCell(r, c)
      })
    }
    rows.push(cells)
  }
  return rows
}

/** 统计小九九格数：固定 45（与表边长无关，口诀范围恒为 1–9） */
export function countSmall(max: number = SMALL_MAX): number {
  const n = Math.min(SMALL_MAX, Math.max(1, Math.floor(max) || SMALL_MAX))
  return (n * (n + 1)) / 2
}

/** 统计大九九总格数：n² */
export function countAll(max: number = MULT_MAX): number {
  return clampMax(max) ** 2
}

/** 是否存在对应口诀：两个因子都 ≤ 9 */
export function hasChant(row: number, col: number): boolean {
  return row <= SMALL_MAX && col <= SMALL_MAX
}

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/**
 * 阿拉伯数字转中文读法（0–99，口诀范围内够用；超出返回原数字串）。
 * 10–19 读「十X」而非「一十X」，20+ 读「X十Y」，整十不读出尾零。
 */
export function toChinese(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 99) return String(Math.floor(n))
  const v = Math.floor(n)
  if (v < 10) return CN_DIGITS[v]
  if (v === 10) return '十'
  const tens = Math.floor(v / 10)
  const ones = v % 10
  const head = tens === 1 ? '' : CN_DIGITS[tens]
  return `${head}十${ones === 0 ? '' : CN_DIGITS[ones]}`
}

/** 算式文本，如 "13×17=221" */
export function mulFormula(row: number, col: number): string {
  return `${row}×${col}=${row * col}`
}

/** 积文本，如 "221" */
export function mulValue(row: number, col: number): string {
  return String(row * col)
}

/**
 * 小九九口诀，如 "三四十二"、"一一得一"。
 * 规则与教材一致：积为一位数用「得」，两位数直接连读（不含「得」）。
 * 仅当两因子都 ≤ 9 时有口诀，超出返回空串（调用方需用 hasChant 先行判断）。
 */
export function mulChant(row: number, col: number): string {
  if (!hasChant(row, col)) return ''
  const a = Math.min(row, col)
  const b = Math.max(row, col)
  const p = a * b
  return `${CN_DIGITS[a]}${CN_DIGITS[b]}${p < 10 ? '得' : ''}${toChinese(p)}`
}

/** 单元格显示模式：value=只显示积 / formula=算式 / chant=口诀（无口诀时回落为积） */
export type MulView = 'value' | 'formula' | 'chant'

/** 单元格显示文本 */
export function cellText(row: number, col: number, view: MulView = 'formula'): string {
  if (view === 'chant') return mulChant(row, col) || mulValue(row, col)
  if (view === 'value') return mulValue(row, col)
  return mulFormula(row, col)
}

/** 表头（因子 1..max），表格渲染用 */
export function tableHeader(max: number = MULT_MAX): number[] {
  const n = clampMax(max)
  return Array.from({ length: n }, (_, i) => i + 1)
}

/**
 * 导出 TSV：首行为列因子，每行以行因子开头。
 * showResult=false 时只出算式不出结果，便于打印成练习卷。
 */
export function tableTsv(max: number = MULT_MAX, showResult = true): string {
  const head = tableHeader(max)
  const lines: string[] = [ ['×', ...head].join('\t') ]
  for (const r of head) {
    const row = [String(r)]
    for (const c of head) row.push(showResult ? `${r * c}` : `${r}×${c}=`)
    lines.push(row.join('\t'))
  }
  return lines.join('\n')
}

/**
 * 小九九口诀全文（背诵用），逐行按 row 升序，范围恒为 1–9。
 * 第 r 行有 r 条，第 9 行 9 条。
 */
export function chantText(max: number = SMALL_MAX): string {
  const n = Math.min(SMALL_MAX, Math.max(1, Math.floor(max) || SMALL_MAX))
  const lines: string[] = []
  for (let r = 1; r <= n; r++) {
    const row: string[] = []
    for (let c = 1; c <= r; c++) row.push(mulChant(r, c))
    lines.push(row.join('　'))
  }
  return lines.join('\n')
}

/* ============================ 练习卷 / Excel / 打印 ============================ */

/**
 * 练习卷 / 导出的统一入参。
 * - max        边长（默认大九九 19）
 * - onlySmall  只取小九九范围（1–9 下三角，45 题）
 * - withResult 是否带结果（false 则结果处留空，供手写）
 * - shuffle    是否打乱题序；配 seed 可保证同seed 同序（重印同一份卷时顺序稳定）
 */
export interface ExerciseOptions {
  max?: number
  onlySmall?: boolean
  withResult?: boolean
  shuffle?: boolean
  /** 随机种子；给定时按 seed 确定性洗牌 */
  seed?: number
}

export interface ExerciseItem {
  /** 题号，从 1 开始 */
  no: number
  row: number
  col: number
  value: number
  /** 展示文本：带结果为「3×4=12」，不带为「3×4=」 */
  text: string
}

/** 线性同余伪随机（确定性，不用 Math.random，保证同 seed 出同一份卷） */
function lcg(seed: number): () => number {
  let s = Math.floor(seed) % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Fisher–Yates 洗牌（原地并返回同一数组） */
function shuffleInPlace<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

/**
 * 生成口算练习题列表，默认按行序（与表格行序一致，便于对照检查）。
 * onlySmall 时只取 1–9 下三角共 45 题。
 */
export function buildExercises(options: ExerciseOptions = {}): ExerciseItem[] {
  const max = clampMax(options.max ?? MULT_MAX)
  const onlySmall = !!options.onlySmall
  const limit = onlySmall ? Math.min(SMALL_MAX, max) : max
  const items: ExerciseItem[] = []
  for (let r = 1; r <= limit; r++) {
    for (let c = 1; c <= (onlySmall ? r : limit); c++) {
      items.push({
        no: 0,
        row: r,
        col: c,
        value: r * c,
        text: options.withResult === false ? `${r}×${c}=` : `${r}×${c}=${r * c}`
      })
    }
  }
  if (options.shuffle) shuffleInPlace(items, lcg(options.seed ?? 20260101))
  items.forEach((it, i) => (it.no = i + 1))
  return items
}

/** HTML 转义（题面虽为受控数据，拼 HTML 前仍统一转义） */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 练习卷题目纯文本（带题号，制表符分隔） */
export function exerciseText(options: ExerciseOptions = {}): string {
  return buildExercises(options)
    .map(it => `${it.no}.\t${it.text}`)
    .join('\n')
}

/**
 * 生成练习卷的二维表数据（供 Excel 导出：表头 + 数据行）。
 * 首列表头为「乘数」，每行首格为「被乘数」，与表格视觉一致。
 */
export function exerciseSheet(
  options: ExerciseOptions = {}
): { headers: Array<string | number>; rows: Array<Array<string | number>> } {
  const max = clampMax(options.max ?? MULT_MAX)
  const onlySmall = !!options.onlySmall
  const withResult = options.withResult !== false
  const limit = onlySmall ? Math.min(SMALL_MAX, max) : max
  const headers: Array<string | number> = ['×', ...rangeOne(limit)]
  const rows: Array<Array<string | number>> = []
  for (let r = 1; r <= limit; r++) {
    const row: Array<string | number> = [r]
    for (let c = 1; c <= limit; c++) {
      row.push(withResult ? r * c : '')
    }
    rows.push(row)
  }
  return { headers, rows }
}

/** 1..n 数组 */
function rangeOne(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1)
}

/**
 * 生成独立打印文档（完整 <html>，样式全部内联）。
 *
 * 为什么自带内联样式而非用页面 CSS：
 * - 打印走「新窗口 + window.print()」，宿主页的 scoped 样式与设计令牌不在新文档里；
 * - 内联保证任何浏览器/电脑上排版一致，也不受宿主页深色主题影响。
 */
export function printDocument(
  options: ExerciseOptions & { title?: string; subtitle?: string } = {}
): string {
  const withResult = options.withResult !== false
  const onlySmall = !!options.onlySmall
  const max = clampMax(options.max ?? MULT_MAX)
  const head = tableHeader(max)
  const limit = onlySmall ? Math.min(SMALL_MAX, max) : max
  const items = buildExercises(options)

  const gridRows: string[] = []
  for (const r of rangeOne(limit)) {
    const tds: string[] = []
    for (const c of rangeOne(limit)) {
      if (onlySmall && c > r) {
        tds.push('<td class="void"></td>')
        continue
      }
      const cls = [isSmallCell(r, c) ? 'small' : '', isDiagCell(r, c) ? 'diag' : ''].filter(Boolean).join(' ')
      tds.push(`<td class="${cls}">${withResult ? r * c : ''}</td>`)
    }
    gridRows.push(`<tr><th class="rh">${r}</th>${tds.join('')}</tr>`)
  }

  const listItems = items
    .map(it => `<li><span class="no">${it.no}</span>${esc(it.text)}</li>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${esc(options.title || '乘法口算练习卷')}</title>
<style>
  @page { size: A4 ${onlySmall ? 'portrait' : 'landscape'}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #111; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { font-size: 12px; color: #555; margin-bottom: 12px; }
  h2 { font-size: 14px; margin: 16px 0 6px; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th, td { border: 1px solid #999; text-align: center; font-size: 11px; padding: 3px 2px; }
  th { background: #eee; font-weight: 600; }
  td.small { background: #f2f7ff; }
  td.diag { background: #cfe2ff; font-weight: 600; }
  td.void { border-color: #ddd; }
  ol { list-style: none; padding: 0; margin: 0; columns: ${onlySmall ? 3 : 5}; column-gap: 14px; }
  ol li { break-inside: avoid; font-size: 12px; padding: 3px 0; border-bottom: 1px dotted #ccc; }
  .no { display: inline-block; width: 22px; color: #888; font-size: 11px; }
  .legend { font-size: 11px; color: #666; margin-top: 10px; }
  .footer { margin-top: 14px; font-size: 11px; color: #666; border-top: 1px solid #ccc; padding-top: 6px; }
</style>
</head>
<body>
<h1>${esc(options.title || '乘法口算练习卷')}</h1>
<div class="sub">${esc(options.subtitle || `${onlySmall ? '小九九' : '大九九'} · 共 ${items.length} 题 · ${withResult ? '含答案' : '答案留空'}`)}</div>
<h2>${onlySmall ? `小九九表（1–${limit}）` : `大九九表（1–${limit}）`}</h2>
<table>
  <thead><tr><th>×</th>${head.slice(0, limit).map(h => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${gridRows.join('')}</tbody>
</table>
<h2>口算题</h2>
<ol>${listItems}</ol>
<div class="legend">浅蓝底 = 小九九背诵范围（1–9），深蓝底 = 主对角线（平方）</div>
<div class="footer">姓名：____________　日期：____________　用时：______ 分钟　得分：________</div>
</body>
</html>`
}