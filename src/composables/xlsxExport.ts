// 通用 Excel（.xlsx）导出工具
// 与 csvExport 共用「表头 + 二维行」的入参结构，仅更换落盘格式，调用方改动量最小。
// xlsx 一律走函数内 `await import('xlsx')`（与 teacherImportCore / StudentTimetableConfig 一致），
// 不进主包；文件名 / 工作表名 / 列宽为纯函数，零 DOM 依赖，可被 node --experimental-strip-types 直测
// （scripts/test-xlsx-export.ts，npm run test:xlsx）。

/** 单元格取值：与 buildCsv 入参类型一致（字符串原样写入，不做数值推断，避免 12.00 变成 12） */
export type XlsxCell = string | number | boolean | null | undefined
/** 一行（表头或数据行） */
export type XlsxRow = readonly XlsxCell[]

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/** Excel 工作表名上限（字符数） */
const SHEET_NAME_MAX = 31
/** 列宽钳制区间（中文按 2 计） */
const COL_MIN_WIDTH = 8
const COL_MAX_WIDTH = 30

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 生成带日期的文件名：prefix_YYYY-MM-DD.xlsx */
export function xlsxFileName(prefix: string): string {
  const d = new Date()
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  return `${prefix}_${date}.xlsx`
}

/**
 * 工作表名清洗：去非法字符（: \ / ? * [ ]）、截 31 字符、空串回退。
 * Excel 表名不允许这些字符且最长 31 字符，超长/非法会让 book_append_sheet 抛错。
 */
export function safeSheetName(name: string, fallback = 'Sheet1'): string {
  const cleaned = (name ?? '').replace(/[\\/?*[\]:]/g, '').trim()
  if (cleaned === '') return fallback
  return cleaned.slice(0, SHEET_NAME_MAX)
}

/** CJK / 全角字符区间：列宽按 2 个字符计 */
const WIDE_CHAR = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/

/** 单元格显示宽度：中文等全角字符按 2 计，保证列宽不挤字 */
export function displayWidth(value: XlsxCell): number {
  if (value === null || value === undefined) return 0
  const s = String(value)
  let w = 0
  for (const ch of s) {
    w += WIDE_CHAR.test(ch) ? 2 : 1
  }
  return w
}

/**
 * 逐列自适应列宽（表头 + 数据取最大显示宽度，钳制 8~30）。
 * 纯函数便于单测；仅影响列宽，不改变任何单元格内容。
 */
export function colWidths(headers: XlsxRow, rows: readonly XlsxRow[]): number[] {
  const widths = headers.map(h => displayWidth(h))
  for (const row of rows) {
    for (let i = 0; i < widths.length; i++) {
      const w = displayWidth(row[i])
      if (w > widths[i]) widths[i] = w
    }
  }
  return widths.map(w => Math.min(COL_MAX_WIDTH, Math.max(COL_MIN_WIDTH, w + 2)))
}

/** Blob 落盘（与 downloadCsv 同款 a[download] 触发方式） */
function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 导出 Excel（.xlsx）：表头 + 二维行 → 单 sheet 工作簿 → 浏览器下载。
 * 字段、列顺序、表头命名、数据筛选与排序全部由调用方决定，本函数只负责格式与落盘。
 * @param prefix 文件名前缀（自动补 _YYYY-MM-DD.xlsx）
 * @param headers 表头行
 * @param rows 数据行
 * @param sheetName 工作表名（默认取 prefix，自动清洗非法字符与 31 字符上限）
 */
export async function exportXlsx(
  prefix: string,
  headers: XlsxRow,
  rows: readonly XlsxRow[],
  sheetName: string = prefix
): Promise<void> {
  const XLSX = await import('xlsx')
  const aoa: XlsxCell[][] = [[...headers], ...rows.map(r => [...r])].map(r => r.map(v => v ?? ''))
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = colWidths(headers, rows).map(wch => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheetName))
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  downloadBlob(xlsxFileName(prefix), new Blob([buf], { type: XLSX_MIME }))
}
