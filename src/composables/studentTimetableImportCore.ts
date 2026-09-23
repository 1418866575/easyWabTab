// 课程表 Excel 导入纯逻辑模块：表头映射 / 行校验 / 冲突检测 / 结果汇总。
// 零 vue/pinia/DOM 依赖，可在 node 下单测（scripts/test-student-timetable-import-core.ts）。
// 只负责「校验 + 产出归一化后的 cell」，实际写库由 store、xlsx 解析由组件完成。

import type { StudentTimetableCell, StudentTimetableTiming } from '@/types'
import { cellKey, computePeriodTime, weekdayLabel } from './studentTimetableCore'
import { buildCsv } from './csvExport'

/** 模板表头（顺序即模板列顺序） */
export const TEMPLATE_HEADERS: readonly string[] = [
  '课程名称',
  '授课教师',
  '上课星期',
  '节次',
  '起始周',
  '结束周',
  '教室',
  '班级'
]

/** 必填列（缺失则整个文件无法导入） */
export const REQUIRED_HEADERS: readonly string[] = ['课程名称', '上课星期', '节次']

/** 选填列（缺失时该字段留空，不报错） */
export const OPTIONAL_HEADERS: readonly string[] = ['授课教师', '起始周', '结束周', '教室', '班级']

/** 单字段最大长度（与 normalizeCell 的 teacher/room 20 字符上限保持一致） */
export const TEXT_MAX_LEN = 20

/** 模板「填写说明」内容 */
export const TEMPLATE_INSTRUCTIONS: readonly string[] = [
  '1. 请在「课程表模板」工作表中填写，一行 = 一节课。带 * 的列必填（导入时会自动忽略列名上的 * 号，带或不带都能识别）。',
  '2. 课程名称*：如 语文 / 数学 / 绘本阅读；最长 20 字。',
  '3. 上课星期*：填 1-7（1=周一 … 7=周日），也可写「周一」「星期三」。',
  '4. 节次*：填第几节（1 起）。不能超过「课程表配置」里的每日节数。',
  '5. 起始周 / 结束周：选填，默认 1 到总学周数；必须是 1-总学周数 的整数，且起始周 ≤ 结束周。',
  '6. 授课教师 / 教室：选填，最长 20 字。',
  '7. 班级：选填，仅作备注（课程表的班级以「课程表配置」里的设置为准）。',
  '8. 上课时间无需填写：导入时按「课程表配置」的节次时间自动推算。',
  '9. 同一「星期 + 节次」只能有一行（星期写「周一」或「1」等价），重复的行导入失败并提示首次出现的行号。',
  '10. 导入时已有课程默认被覆盖；失败的行的行号与原因会生成错误明细，可下载修正后重新导入。'
]

/** 模板「示例数据」内容（含表头） */
export const TEMPLATE_SAMPLE_ROWS: readonly (readonly (string | number)[])[] = [
  ['语文', '王老师', '周一', 1, 1, 20, '301', '三年级二班'],
  ['数学', '李老师', '周一', 2, 1, 20, '301', '三年级二班'],
  ['英语', '张老师', 3, 3, 1, 20, '302', ''],
  ['体育', '', '周五', 6, 1, 20, '操场', ''],
  ['绘本阅读', '赵老师', '周三', 5, 1, 10, '图书角', '']
]

/** 表头映射结果 */
export interface HeaderMap {
  /** 列名 → 列下标（0-based） */
  index: Record<string, number>
  /** 缺失的必填列名 */
  missing: string[]
  /** 无法识别的列（忽略） */
  unknown: string[]
}

/**
 * 表头名归一化：去空白 + 去必填标记。
 * 模板下载的必填列带 `*`（如「课程名称*」），用户手改时也可能带空格，导入时统一忽略这些装饰字符。
 */
export function normalizeHeaderName(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : String(v ?? '').trim()
  return Array.from(s)
    .filter(ch => ch !== '*' && ch !== '＊' && !/\s/.test(ch))
    .join('')
}

/** 把 Excel 首行（表头行）映射为列名 → 下标 */
export function mapHeaders(headerRow: readonly unknown[]): HeaderMap {
  const index: Record<string, number> = {}
  const unknown: string[] = []
  const known = new Set<string>([...TEMPLATE_HEADERS])

  headerRow.forEach((raw, i) => {
    const name = normalizeHeaderName(raw)
    if (!name) return
    const hit = [...TEMPLATE_HEADERS].find(h => h === name)
    if (hit) {
      // 重复列以第一次出现的为准
      if (index[hit] === undefined) index[hit] = i
    } else if (!known.has(name)) {
      unknown.push(name)
    }
  })

  const missing = REQUIRED_HEADERS.filter(h => index[h] === undefined)
  return { index, missing: [...missing], unknown }
}

/** 星期解析：1-7 / 周一…周日 / 星期一…星期日 / 一…日 → 1-7；非法返回 0 */
export function parseWeekday(v: unknown): number {
  if (typeof v === 'number' && Number.isInteger(v)) return v >= 1 && v <= 7 ? v : 0
  if (typeof v !== 'string') return 0
  const s = v.trim()
  if (!s) return 0
  if (/^[1-7]$/.test(s)) return Number(s)
  const cnNum: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }
  const m = /^(?:星期|周|礼拜)?([一二三四五六日天])$/.exec(s)
  if (m) return cnNum[m[1]] ?? 0
  return 0
}

/** 节次解析：正整数 1-12；非法返回 0 */
export function parsePeriod(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.trim()) : NaN
  if (!Number.isFinite(n)) return 0
  const i = Math.floor(n)
  return i >= 1 && i <= 12 ? i : 0
}

/** 周次解析：空 → 缺省值；非法返回 null */
function parseWeek(v: unknown, fallback: number, weeks: number): number | null {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return fallback
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  if (i < 1 || i > weeks) return null
  return i
}

/** 周次范围归一化：缺省 1..weeks；非法或 start>end 返回 null */
export function normalizeWeekRange(
  start: unknown,
  end: unknown,
  weeks: number
): { startWeek: number; endWeek: number } | null {
  const s = parseWeek(start, 1, weeks)
  const e = parseWeek(end, weeks, weeks)
  if (s === null || e === null) return null
  if (s > e) return null
  return { startWeek: s, endWeek: e }
}

/** 文本字段裁剪（与 normalizeCell 一致：去空白 + 截断 20 字） */
function clipText(v: unknown): string {
  if (typeof v !== 'string') return ''
  return Array.from(v.trim()).slice(0, TEXT_MAX_LEN).join('')
}

/** 导入上下文（来自当前课程表配置） */
export interface ImportContext {
  /** 当前每日节数（节次超过则报错） */
  periodsPerDay: number
  /** 总学周数（周次范围上界） */
  weeks: number
  /** 节次时间配置（用于推算起止时间，缺省走默认） */
  timing?: Partial<StudentTimetableTiming>
  /** 已有课程（key = `${day}_${period}`），用于判断新增 / 覆盖 */
  existing?: Record<string, StudentTimetableCell>
}

/** 单行错误明细 */
export interface ImportRowError {
  /** Excel 行号（1-based，含表头行，便于用户在原文件里定位） */
  row: number
  /** 出错行的课程名称（可能为空） */
  subject: string
  /** 中文失败原因 */
  reason: string
}

/** 导入结果 */
export interface ImportResult {
  /** 解析到的数据行总数（不含表头） */
  total: number
  /** 成功条数 */
  success: number
  /** 其中新增条数 */
  created: number
  /** 其中覆盖条数 */
  updated: number
  /** 失败条数 */
  failed: number
  /** 成功行产出的 cell（key = `${day}_${period}`），导入时整体写入 */
  cells: Record<string, StudentTimetableCell>
  /** 失败明细 */
  errors: ImportRowError[]
}

/** 待校验的一行（row 为 Excel 行号） */
export interface ImportRawRow {
  row: number
  values: readonly unknown[]
}

/**
 * 校验并转换导入数据。
 * 规则：必填校验 → 类型校验 → 范围校验 → 文件内重复校验（同一星期+节次只能一行）。
 * 成功行的起止时间一律由节次配置推算（不采信文件里的时间），与课程表展示保持一致。
 */
export function validateImportRows(
  rows: readonly ImportRawRow[],
  headers: HeaderMap,
  ctx: ImportContext
): ImportResult {
  const errors: ImportRowError[] = []
  const cells: Record<string, StudentTimetableCell> = {}
  /** 已占用的格子：key → 首次出现的行号 */
  const occupied = new Map<string, number>()

  let created = 0
  let updated = 0

  const periodsPerDay = Math.max(1, Math.floor(ctx.periodsPerDay) || 1)
  const weeks = Math.max(1, Math.floor(ctx.weeks) || 1)
  const existing = ctx.existing ?? {}

  for (const item of rows) {
    const { row, values } = item
    const pick = (name: string): unknown => {
      const i = headers.index[name]
      return i === undefined ? undefined : values[i]
    }

    const subject = clipText(pick('课程名称'))
    const subjectRaw = typeof pick('课程名称') === 'string' ? String(pick('课程名称')).trim() : ''

    if (!subjectRaw) {
      errors.push({ row, subject: '', reason: '课程名称为空（必填）' })
      continue
    }

    const day = parseWeekday(pick('上课星期'))
    if (!day) {
      errors.push({ row, subject: subjectRaw, reason: '上课星期无效（需为 1-7 或 周一…周日）' })
      continue
    }

    const period = parsePeriod(pick('节次'))
    if (!period) {
      errors.push({ row, subject: subjectRaw, reason: '节次无效（需为 1-12 的整数）' })
      continue
    }
    if (period > periodsPerDay) {
      errors.push({
        row,
        subject: subjectRaw,
        reason: `节次 ${period} 超出当前每日节数 ${periodsPerDay}，请先在「课程表配置」中增加每日节数`
      })
      continue
    }

    const range = normalizeWeekRange(pick('起始周'), pick('结束周'), weeks)
    if (!range) {
      errors.push({
        row,
        subject: subjectRaw,
        reason: `周次范围无效（需在 1-${weeks} 之间，且起始周 ≤ 结束周）`
      })
      continue
    }

    const key = cellKey(day, period)
    const dupRow = occupied.get(key)
    if (dupRow !== undefined) {
      errors.push({
        row,
        subject: subjectRaw,
        reason: `与第 ${dupRow} 行重复：${weekdayLabel(day)} 第 ${period} 节已有课程`
      })
      continue
    }

    const teacher = clipText(pick('授课教师'))
    const room = clipText(pick('教室'))
    const time = computePeriodTime(period, ctx.timing)

    const cell: StudentTimetableCell = {
      subject,
      startHHMM: time.startHHMM,
      endHHMM: time.endHHMM,
      startWeek: range.startWeek,
      endWeek: range.endWeek
    }
    if (teacher) cell.teacher = teacher
    if (room) cell.room = room

    occupied.set(key, row)
    cells[key] = cell
    if (existing[key]) updated++
    else created++
  }

  const success = created + updated
  return {
    total: rows.length,
    success,
    created,
    updated,
    failed: errors.length,
    cells,
    errors
  }
}

/** 把失败明细转成 CSV 文本（行号 + 课程 + 原因），供用户下载修正 */
export function buildImportErrorCsv(errors: readonly ImportRowError[]): string {
  return buildCsv(
    ['Excel 行号', '课程名称', '失败原因'],
    errors.map(e => [e.row, e.subject, e.reason])
  )
}

/** 导入结果的一句话摘要（用于 toast / 结果区展示） */
export function importSummaryText(result: ImportResult): string {
  if (result.total === 0) return '未解析到数据行'
  if (result.failed === 0) {
    return result.updated > 0
      ? `导入完成：新增 ${result.created} 条，覆盖 ${result.updated} 条`
      : `导入完成：新增 ${result.created} 条`
  }
  return `导入完成：成功 ${result.success} 条（新增 ${result.created} / 覆盖 ${result.updated}），失败 ${result.failed} 条`
}
