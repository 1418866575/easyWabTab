// 「下载导入模板」统一公共能力：收敛原先分散在多个组件 / 页面里的重复模板构建逻辑。
// 设计目标（用户已确认）：
//   ① 课程表两套模板都保留（教师数据管理里的简单 8 列 + 两个 Config 的富 3-sheet），仅把构建逻辑抽到此处。
//   ② 未选班级时统一拦截提示，而不是静默回退到「班级」字样。
// 各模块仍保留各自的薄包装（toast / notify 反馈由调用方决定），调用方式与返回结果不变。
//
// 统一文件名规范：<班级>_<模块前缀>_<YYYY-MM-DD>.xlsx（除历史遗留的富课程表模板原本无班级日期，本次补齐）。

import { exportExcel, buildStudentTemplateSheet, type ExcelSheet } from './teacherExcelCore'
import {
  TEMPLATE_HEADERS,
  TEMPLATE_INSTRUCTIONS,
  TEMPLATE_SAMPLE_ROWS,
  REQUIRED_HEADERS
} from './studentTimetableImportCore'

/** 模板种类。student/exam/parent/teacherTimetable 为班级绑定型；studentTimetable 为课程表富模板（班级可选） */
export type TemplateKind = 'student' | 'exam' | 'parent' | 'teacherTimetable' | 'studentTimetable'

/** 各模块的文件名前缀（与导入解析表头保持语义一致） */
const KIND_PREFIX: Record<TemplateKind, string> = {
  student: '学生名单模板',
  exam: '成绩模板',
  parent: '家长信息模板',
  teacherTimetable: '课程表模板',
  studentTimetable: '课程表导入模板'
}

/** 文件名非法字符清洗（与 teacherExcelCore.excelFileName 一致） */
function sanitizeClass(title: string): string {
  return (title || '').replace(/[\\/:*?"<>|]/g, '_')
}

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 统一模板文件名：<班级>_<模块前缀>_<YYYY-MM-DD>.xlsx */
export function templateFileName(kind: TemplateKind, classTitle: string): string {
  const cls = sanitizeClass(classTitle) || '班级'
  return `${cls}_${KIND_PREFIX[kind]}_${todayStr()}.xlsx`
}

/** 班级绑定型模板（student/exam/parent/teacherTimetable）的工作表定义，与原各页面内联实现逐列对齐 */
export function buildTemplateSheets(
  kind: 'student' | 'exam' | 'parent' | 'teacherTimetable'
): ExcelSheet[] {
  switch (kind) {
    case 'student':
      // 与学生信息页共用同一份模板（含家庭地址），避免两处表头不一致
      return [buildStudentTemplateSheet()]
    case 'exam':
      return [
        {
          name: '成绩',
          headers: ['姓名', '期中成绩', '期末成绩'],
          rows: [['张三', 90, 85]]
        }
      ]
    case 'parent':
      return [
        {
          name: '家长信息',
          headers: ['姓名', '家长', '电话', '关系'],
          rows: [['张三', '张父', '13800000000', '父亲']]
        }
      ]
    case 'teacherTimetable':
      return [
        {
          name: '课程表',
          headers: ['节次', '周一', '周二', '周三', '周四', '周五', '周六', '周日'],
          rows: [
            ['第1节', '语文', '数学', '英语', '语文', '数学', '自习', '兴趣'],
            ['第2节', '数学', '英语', '语文', '体育', '美术', '音乐', '兴趣'],
            ['第3节', '英语', '语文', '数学', '科学', '书法', '班会', '兴趣']
          ]
        }
      ]
  }
}

/**
 * 课程表富模板（3-sheet：填写说明 / 示例数据 / 课程表模板），复刻两个 Config 内联的原生 XLSX 构建。
 * 保留必填列加 * 标记与列宽（!cols）等原细节，仅收敛代码、统一出口。
 */
async function exportStudentTimetableTemplate(classTitle: string): Promise<void> {
  const XLSX = (await import('xlsx')) as unknown as {
    utils: {
      book_new: () => unknown
      aoa_to_sheet: (data: unknown[][]) => unknown & { '!cols'?: unknown }
      book_append_sheet: (wb: unknown, ws: unknown, name: string) => void
    }
    writeFile: (wb: unknown, name: string) => void
  }
  const wb = XLSX.utils.book_new()

  // 1) 填写说明（单列：标题 + 空行 + 10 条说明）
  const instrAoa: (string | number)[][] = [
    ['课程表导入模板 · 填写说明'],
    [],
    ...TEMPLATE_INSTRUCTIONS.map((t) => [t])
  ]
  const wsInstr = XLSX.utils.aoa_to_sheet(instrAoa)
  wsInstr['!cols'] = [{ wch: 90 }]

  // 2) 示例数据（表头 + 5 行示例）
  const sampleAoa: (string | number)[][] = [
    TEMPLATE_HEADERS.slice(),
    ...TEMPLATE_SAMPLE_ROWS.map((r) => r.slice())
  ]
  const wsSample = XLSX.utils.aoa_to_sheet(sampleAoa)
  wsSample['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 14 }))

  // 3) 空白模板（必填列加 * 标记）
  const marked = TEMPLATE_HEADERS.map((h) =>
    REQUIRED_HEADERS.includes(h) ? `${h}*` : h
  )
  const wsBlank = XLSX.utils.aoa_to_sheet([marked])
  wsBlank['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 14 }))

  XLSX.utils.book_append_sheet(wb, wsInstr, '填写说明')
  XLSX.utils.book_append_sheet(wb, wsSample, '示例数据')
  XLSX.utils.book_append_sheet(wb, wsBlank, '课程表模板')

  XLSX.writeFile(wb, templateFileName('studentTimetable', classTitle))
}

export interface DownloadTemplateOptions {
  /** 班级标题；未选班级时传空串或留空 */
  classTitle?: string
  /**
   * 是否需要班级（默认：除 studentTimetable 外都需要）。
   * studentTimetable 的「教室 / 班级」为选填，且历史行为从不校验，故默认不拦截。
   */
  requireClass?: boolean
  /** 未选班级时回调（由调用方决定提示文案与方式：toast.warning / notify 等） */
  onRequireClass?: () => void
  /** 下载成功回调（参数为实际文件名） */
  onSuccess?: (filename: string) => void
  /** 失败回调（参数为中文错误原因） */
  onError?: (message: string) => void
}

/**
 * 统一下载入口：处理班级校验 → 构建 → 导出 → 回调。
 * 各模块按自身 kind 调用，成功 / 失败 / 缺班级的反馈完全由调用方控制，保持原有交互不变。
 */
export async function downloadTemplate(
  kind: TemplateKind,
  opts: DownloadTemplateOptions = {}
): Promise<void> {
  const {
    classTitle = '',
    requireClass = kind !== 'studentTimetable',
    onRequireClass,
    onSuccess,
    onError
  } = opts
  try {
    if (requireClass && !classTitle.trim()) {
      onRequireClass?.()
      return
    }
    let filename: string
    if (kind === 'studentTimetable') {
      await exportStudentTimetableTemplate(classTitle)
      filename = templateFileName('studentTimetable', classTitle)
    } else {
      const sheets = buildTemplateSheets(kind)
      filename = templateFileName(kind, classTitle)
      await exportExcel(filename, sheets)
    }
    onSuccess?.(filename)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    onError?.(`模板下载失败：${msg}`)
  }
}
