// 教师工作台 Excel 导出（写入，与 teacherImportCore 共用 xlsx 依赖，动态 import 不进主包）。
// 浏览器环境 XLSX.writeFile 会直接触发文件下载；filename 自动补 .xlsx。

export interface ExcelSheet {
  /** 工作表名（自动截断到 31 字符，Excel 限制） */
  name: string
  headers: string[]
  /** 单元格可为字符串 / 数字 / null（null 导出为空单元格） */
  rows: Array<Array<string | number | null>>
}

function ensureExt(name: string): string {
  return /\.xlsx$/i.test(name) ? name : `${name}.xlsx`
}

/**
 * 导出为 .xlsx 文件并触发下载。
 * @param filename 文件名（不含或含 .xlsx 均可）
 * @param sheets   一个或多个工作表
 */
export async function exportExcel(filename: string, sheets: ExcelSheet[]): Promise<void> {
  const XLSX = (await import('xlsx')) as unknown as {
    utils: {
      book_new: () => unknown
      aoa_to_sheet: (data: unknown[][]) => unknown
      book_append_sheet: (wb: unknown, ws: unknown, name: string) => void
    }
    writeFile: (wb: unknown, name: string) => void
  }
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const aoa: unknown[][] = [s.headers, ...s.rows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  XLSX.writeFile(wb, ensureExt(filename))
}

/** 生成带班级名与当日日期的文件名前缀，形如「三年级1班_学生名单_2026-09-23」 */
export function excelFileName(prefix: string, classTitle: string): string {
  const d = new Date()
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  const cls = (classTitle || '班级').replace(/[\\/:*?"<>|]/g, '_')
  return `${cls}_${prefix}_${date}`
}
