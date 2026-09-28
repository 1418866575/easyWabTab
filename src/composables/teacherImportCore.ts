// 教师工作台 · 表格导入解析（纯函数为主，文件读取走动态 import('xlsx') 避免进主包）
// 支持 .xlsx / .xls / .csv：
//   学生名单：表头须含「姓名」「性别」，学号列可选
//   成绩表  ：第一列为姓名，其余数值列各作为一场考试
//   家长表  ：表头须含「姓名」「家长」「电话」，按姓名匹配学生
// 表头匹配统一归一化（去空白、去 * 号），与课程表导入行为一致。

import type { Exam, ParentInfo, Student } from '@/types/teacher'
import { makeStudentId } from './teacherCore'
import type { StudentTimetableData, StudentTimetableSchedule } from '@/types'
import { cellKey, computePeriodTime, emptyTiming, emptyTimetableData } from '@/composables/studentTimetableCore'

/** 表头归一化：去空白 + 去 * / ＊ */
export function normalizeHeader(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : String(v ?? '').trim()
  return Array.from(s)
    .filter((ch) => ch !== '*' && ch !== '＊' && !/\s/.test(ch))
    .join('')
}

/** 简易 CSV 解析（支持引号包裹与转义换行） */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuote = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuote) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuote = false
      } else cell += ch
      continue
    }
    if (ch === '"') {
      inQuote = true
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    if (ch === '\r') continue
    cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export interface HeaderMap {
  name: number
  gender: number
  no: number
  address: number
  parent: number
  phone: number
  relation: number
}

/** 在表头行里定位各字段列（-1 表示缺失） */
export function mapHeaders(headerRow: string[]): HeaderMap {
  const cells = headerRow.map(normalizeHeader)
  const find = (...keys: string[]) => cells.findIndex((c) => keys.includes(c))
  return {
    name: find('姓名', '学生姓名', '名字'),
    gender: find('性别'),
    no: find('学号', '编号'),
    address: find('家庭地址', '地址', '住址', '家庭住址'),
    parent: find('家长', '家长姓名', '监护人'),
    phone: find('电话', '联系电话', '手机号', '家长电话'),
    relation: find('关系', '与学生关系')
  }
}

export interface StudentParseResult {
  students: Student[]
  errors: string[]
  warnings: string[]
}

/**
 * 学生名单行 → Student[]。
 * 表头缺「姓名」或「性别」直接报错且不产出（避免在错误数据上写库）。
 */
export function rowsToStudents(rows: string[][], semesterId: string, classId: string): StudentParseResult {
  const errors: string[] = []
  const warnings: string[] = []
  const students: Student[] = []
  if (!rows.length) return { students, errors: ['表格为空'], warnings }

  const map = mapHeaders(rows[0])
  if (map.name < 0) return { students, errors: ['缺少「姓名」列'], warnings }
  if (map.gender < 0) return { students, errors: ['缺少「性别」列'], warnings }

  const seen = new Set<string>()
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = (r[map.name] ?? '').trim()
    if (!name) continue
    const genderRaw = (r[map.gender] ?? '').trim()
    const gender: '男' | '女' = genderRaw === '男' ? '男' : '女'
    if (genderRaw !== '男' && genderRaw !== '女') {
      warnings.push(`第 ${i + 1} 行「${name}」性别为空或异常，已按「女」处理`)
    }
    const no = map.no >= 0 ? (r[map.no] ?? '').trim() : String(i)
    const id = makeStudentId(semesterId, classId, no, name)
    if (seen.has(id)) {
      warnings.push(`第 ${i + 1} 行「${name}」学号重复，已跳过`)
      continue
    }
    seen.add(id)
    students.push({
      id,
      no,
      name,
      gender,
      special: false,
      post: '',
      address: map.address >= 0 ? (r[map.address] ?? '').trim() : '',
      health: { allergy: '', disease: '', notes: '', emergencyPhone: '' }
    })
  }
  if (!students.length) errors.push('未解析到任何学生行')
  return { students, errors, warnings }
}

export interface ExamParseResult {
  exams: { name: string; subject: string; scores: Record<string, number> }[]
  errors: string[]
  warnings: string[]
}

/**
 * 成绩表行 → 多场考试（第一列姓名，其余数值列各成一场考试）。
 * 姓名→studentId 匹配：命中唯一学生才写入；重名时记为歧义告警，不静默错配。
 */
export function rowsToExams(rows: string[][], students: Student[], defaultSubject = ''): ExamParseResult {
  const errors: string[] = []
  const warnings: string[] = []
  if (!rows.length) return { exams: [], errors: ['表格为空'], warnings }
  const nameIdx = mapHeaders(rows[0]).name
  if (nameIdx < 0) return { exams: [], errors: ['缺少「姓名」列'], warnings }

  const byName = new Map<string, Student[]>()
  for (const s of students) {
    const list = byName.get(s.name) ?? []
    list.push(s)
    byName.set(s.name, list)
  }

  // 找出数值列（列名非空且该列存在可解析数字）
  const header = rows[0]
  const body = rows.slice(1)
  const numericCols: number[] = []
  for (let c = 0; c < header.length; c++) {
    if (c === nameIdx) continue
    const hit = body.some((r) => {
      const v = (r[c] ?? '').trim()
      return v !== '' && Number.isFinite(Number(v))
    })
    if (hit) numericCols.push(c)
  }
  if (!numericCols.length) return { exams: [], errors: ['未找到任何数值成绩列'], warnings }

  const exams = numericCols.map((c) => ({
    name: (header[c] ?? '').trim() || `第${c + 1}列`,
    subject: defaultSubject,
    scores: {} as Record<string, number>
  }))

  for (let i = 0; i < body.length; i++) {
    const r = body[i]
    const name = (r[nameIdx] ?? '').trim()
    if (!name) continue
    const matched = byName.get(name) ?? []
    if (!matched.length) {
      warnings.push(`第 ${i + 2} 行「${name}」不在学生名单中，已跳过`)
      continue
    }
    if (matched.length > 1) {
      warnings.push(`第 ${i + 2} 行「${name}」存在 ${matched.length} 位同名学生，未写入以免错配`)
      continue
    }
    const sid = matched[0].id
    numericCols.forEach((c, k) => {
      const raw = (r[c] ?? '').trim()
      if (raw === '') return
      const v = Number(raw)
      if (Number.isFinite(v)) exams[k].scores[sid] = v
    })
  }

  const usable = exams.filter((e) => Object.keys(e.scores).length > 0)
  if (!usable.length) errors.push('未匹配到任何有效成绩')
  return { exams: usable, errors, warnings }
}

export interface ParentParseResult {
  parents: Record<string, ParentInfo>
  errors: string[]
  warnings: string[]
}

/** 家长表行 → { studentId: ParentInfo }，按姓名精确匹配 */
export function rowsToParents(rows: string[][], students: Student[]): ParentParseResult {
  const errors: string[] = []
  const warnings: string[] = []
  const parents: Record<string, ParentInfo> = {}
  if (!rows.length) return { parents, errors: ['表格为空'], warnings }

  const map = mapHeaders(rows[0])
  if (map.name < 0) return { parents, errors: ['缺少「姓名」列'], warnings }
  if (map.parent < 0) return { parents, errors: ['缺少「家长」列'], warnings }
  if (map.phone < 0) return { parents, errors: ['缺少「电话」列'], warnings }

  const byName = new Map<string, Student[]>()
  for (const s of students) {
    const list = byName.get(s.name) ?? []
    list.push(s)
    byName.set(s.name, list)
  }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = (r[map.name] ?? '').trim()
    if (!name) continue
    const matched = byName.get(name) ?? []
    if (!matched.length) {
      warnings.push(`第 ${i + 1} 行「${name}」不在学生名单中`)
      continue
    }
    if (matched.length > 1) {
      warnings.push(`第 ${i + 1} 行「${name}」存在同名学生，未写入以免错配`)
      continue
    }
    parents[matched[0].id] = {
      parentName: (r[map.parent] ?? '').trim(),
      relation: map.relation >= 0 ? (r[map.relation] ?? '').trim() : '',
      phone: (r[map.phone] ?? '').trim()
    }
  }
  if (!Object.keys(parents).length) warnings.push('未匹配到任何家长信息')
  return { parents, errors, warnings }
}

export interface TimetableParseResult {
  data: StudentTimetableData
  errors: string[]
  warnings: string[]
}

/** 课程表导入固定 7 天（周一~周日），与教师课程表富模型一致 */
const TIMETABLE_DAY_COUNT = 7

/**
 * 课程表行 → StudentTimetableData（富模型，7 天 + schedule）。
 * 约定：首列为节次名称（仅占位，读取时忽略）；其后每列按位置对应 周一~周日（最多取 7 列）。
 * 每个非空单元格写入 schedule[`${day}_${period}`]，起止时间由 computePeriodTime 按默认节次配置推算。
 * 首列与当日均为空的整行视为空行跳过。表头行（第 0 行）仅作展示、不参与解析。
 */
export function rowsToTimetable(rows: string[][]): TimetableParseResult {
  const errors: string[] = []
  const warnings: string[] = []
  if (!rows.length) return { data: emptyTimetableData(), errors: ['表格为空'], warnings }

  const schedule: StudentTimetableSchedule = {}
  const timing = emptyTiming()
  let period = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const label = (row[0] ?? '').trim()
    let anySubject = false
    const periodIdx = period + 1
    for (let d = 0; d < TIMETABLE_DAY_COUNT; d++) {
      const raw = (row[d + 1] ?? '').trim()
      if (!raw) continue
      anySubject = true
      const { startHHMM, endHHMM } = computePeriodTime(periodIdx, timing)
      schedule[cellKey(d + 1, periodIdx)] = { subject: raw, startHHMM, endHHMM }
    }
    if (!label && !anySubject) continue // 空行跳过
    period = periodIdx
  }

  if (!period) errors.push('未解析到任何课程（每行首列应为节次名称）')

  const data: StudentTimetableData = {
    ...emptyTimetableData(),
    periodsPerDay: period,
    schedule
  }
  return { data, errors, warnings }
}

/** 按扩展名选择解析方式；xlsx 走动态 import，避免打进主包 */
export async function fileToRows(file: File): Promise<string[][]> {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = await readTextAuto(file)
    return parseCsvText(text)
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) return []
    return (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false, defval: '' }) as string[][]).map((r) =>
      (r ?? []).map((c) => String(c ?? ''))
    )
  }
  throw new Error('仅支持 .xlsx / .xls / .csv 文件')
}

/** 文本读取：优先 UTF-8，出现乱码特征则回退 GBK 解码 */
async function readTextAuto(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buf)
  if (!utf8.includes('\uFFFD')) return utf8
  try {
    return new TextDecoder('gbk').decode(buf)
  } catch {
    return utf8
  }
}

/** 导出备份文件名 */
export function backupFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `教师工作台备份_${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}.json`
}

/** 成绩列 → 考试对象（供 store 落库） */
export function buildExam(parsed: { name: string; subject: string; scores: Record<string, number> }, id: string, date: string): Exam {
  return { id, subject: parsed.subject, name: parsed.name, date, scores: { ...parsed.scores } }
}
