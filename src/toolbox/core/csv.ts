/**
 * CSV 与 JSON 互转的纯函数（站内实现）
 */

/** 解析单行 CSV：支持引号包裹与 "" 转义 */
export function parseCsvLine(line: string, delimiter: string): string[] {
  const res: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = !inQuotes
    } else if (c === delimiter && !inQuotes) {
      res.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  res.push(cur)
  return res
}

/** CSV 文本 → 对象数组（首行为表头） */
export function csvToJson(text: string, delimiter: string): Record<string, string>[] {
  const lines = (text || '').replace(/\r/g, '').split('\n').filter(l => l.length)
  if (!lines.length) return []
  const header = parseCsvLine(lines[0], delimiter)
  return lines.slice(1).map(line => {
    const cells = parseCsvLine(line, delimiter)
    const row: Record<string, string> = {}
    header.forEach((key, i) => { row[key] = cells[i] !== undefined ? cells[i] : '' })
    return row
  })
}

/** JSON 数组文本 → CSV 文本 */
export function jsonToCsv(text: string, delimiter: string): string {
  const arr = JSON.parse(text) as unknown
  if (!Array.isArray(arr) || !arr.length) {
    throw new Error('请输入非空的 JSON 数组（对象数组）')
  }
  const first = arr[0] as Record<string, unknown>
  const keys = Object.keys(first)
  const quote = (v: unknown) => {
    const s = String(v == null ? '' : v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return [keys.join(delimiter)]
    .concat(arr.map(item => keys.map(k => quote((item as Record<string, unknown>)[k])).join(delimiter)))
    .join('\n')
}
