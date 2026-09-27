// 教师工作台 Excel 导出（写入，与 teacherImportCore 共用 xlsx 依赖，动态 import 不进主包）。
// 浏览器环境 XLSX.writeFile 会直接触发文件下载；filename 自动补 .xlsx。

import type { TeacherHomework } from '@/types/teacher'

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

/** 作业未交名单 sheet：仅含未交（pending）同学，便于发群催交。五列：学号/姓名/状态/补交时间/备注 */
export function buildMissesSheet(homework: TeacherHomework): ExcelSheet {
  const pending = homework.misses.filter((m) => m.status === 'pending')
  return {
    name: '未交名单',
    headers: ['学号', '姓名', '状态', '补交时间', '备注'],
    rows: pending.map((m) => [m.studentNo ?? '', m.studentName, '未交', m.madeUpAt ?? '', m.note ?? ''])
  }
}

/** 导出某次作业的未交名单为 .xlsx 并触发下载 */
export async function exportHomeworkMissesExcel(homework: TeacherHomework, classTitle: string): Promise<void> {
  const safeTitle = (homework.title || '作业').replace(/[\\/:*?"<>|]/g, '_')
  const filename = excelFileName(`未交名单_${safeTitle}`, classTitle)
  await exportExcel(filename, [buildMissesSheet(homework)])
}
