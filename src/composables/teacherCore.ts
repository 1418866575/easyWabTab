// 教师工作台核心计算（纯函数，零 vue/pinia 运行时依赖，node 可直接单测）
// 职责：数据归一化 / 学期×班级分组 / 角色可见性 / 成绩统计 / 排座 / 值日轮排 / 级联清理。
// store 只做「读档 + 调这里 + 存档」，禁止内联重算。

import {
  type ClassBucket,
  type ClassGroup,
  type CommitteeMember,
  type DutyData,
  type Exam,
  type SeatData,
  type Semester,
  type Student,
  type LeaveRecord,
  type LeaveStatus,
  type LeaveType,
  type TeacherHomework,
  type TeacherHomeworkMiss,
  type HomeworkMissStatus,
  type TeacherData,
  type TeacherPageKey,
  type TeacherPageMeta,
  type TeacherRole,
  type TeacherStage,
  type TeacherTerm,
  type StudentTimetableData,
  type StudentTimetableSchedule,
  STAGE_OPTIONS,
  TERM_OPTIONS,
  TEACHER_GROUPS,
  TEACHER_HEAD_ONLY_PAGES,
  TEACHER_PAGES,
  SCORE_BANDS,
  LEAVE_TYPES,
  LEAVE_STATUS_META,
  WEEK_DAYS
} from '@/types/teacher'
import { normalizeTeacherMenu } from '@/composables/teacherMenuCore'
import {
  emptyTimetableData,
  normalizeTimetableData,
  cellKey,
  computePeriodTime,
  emptyTiming
} from '@/composables/studentTimetableCore'

/** 学段兜底：非法值回落幼儿园（首个选项），保证下拉可用 */
export function normalizeStage(v: unknown): TeacherStage {
  return STAGE_OPTIONS.includes(v as TeacherStage) ? (v as TeacherStage) : STAGE_OPTIONS[0]
}

/** 学期兜底：旧值「上学期/下学期」等映射到「上半年/下半年」；其余保留原值（兼容自定义学期名） */
export function normalizeTerm(v: unknown): string {
  const s = str(v)
  const alias: Record<string, TeacherTerm> = {
    '上学期': '上半年',
    '下学期': '下半年',
    '上半学年': '上半年',
    '下半学年': '下半年',
    '春季': '上半年',
    '秋季': '下半年'
  }
  if (alias[s]) return alias[s]
  return TERM_OPTIONS.includes(s as TeacherTerm) ? s : s
}

export const TEACHER_SCHEMA_VER = 1

/** 生成唯一 id（时间前缀保证字典序≈创建序） */
export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 生成稳定学生主键：学号+班级+学期复合。
 * 姓名仅作展示，任何时候都不要用姓名做匹配（重名会静默错配数据）。
 */
export function makeStudentId(semesterId: string, classId: string, no: string, name: string): string {
  return `s_${semesterId}_${classId}_${no || name}`
}

// ---------- 空数据 / 归一化 ----------

export function emptySeats(): SeatData {
  return { rows: 6, cols: 8, grid: Array.from({ length: 48 }, () => null) }
}

export function emptyDuty(): DutyData {
  return {
    days: WEEK_DAYS.slice(0, 5).map((day) => ({ day, members: [], leader: '' }))
  }
}

export function emptyBucket(): ClassBucket {
  return {
    students: [],
    parents: {},
    exams: [],
    papers: [],
    seats: emptySeats(),
    duty: emptyDuty(),
    committee: [],
    timetable: emptyTimetableData(),
    growth: {},
    random: { history: [], mode: 'all' },
    leaves: [],
    homeworks: []
  }
}

export function emptyTeacherData(): TeacherData {
  return {
    schemaVer: TEACHER_SCHEMA_VER,
    teacher: { id: 'teacher_1', name: '王老师', subjects: ['语文'] },
    semesters: [],
    classes: [],
    assignments: [],
    current: { sem: '', cls: '' },
    defaultSelection: { sem: '', cls: '' },
    groups: {},
    tombstones: { semesters: [], classes: [] }
  }
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function bool(v: unknown): boolean {
  return v === true
}

/** 把任意来源字段归一为字符串数组（用于 tombstones 等）；非数组 / 非字符串一律丢弃 */
function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => str(x)).filter(Boolean)
}

// ---------- 请假信息（leaves 桶） ----------

/** 本地日期 YYYY-MM-DD（不依赖 toISOString，避免时区偏移） */
export function todayStr(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 请假类型兜底：非法值回落「事假」 */
export function normalizeLeaveType(v: unknown): LeaveType {
  return LEAVE_TYPES.includes(v as LeaveType) ? (v as LeaveType) : '事假'
}

/** 请假状态兜底：非法值回落「待审批」 */
export function normalizeLeaveStatus(v: unknown): LeaveStatus {
  return LEAVE_STATUS_META.some((s) => s.key === v) ? (v as LeaveStatus) : 'pending'
}

/** 含首尾的天数差（同日 = 1 天）；日期非法返回 0 */
export function diffDays(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00`)
  const b = Date.parse(`${end}T00:00:00`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86400000) + 1)
}

/** 列表排序：开始日期倒序（同日按登记时间倒序） */
export function sortedLeaves(leaves: LeaveRecord[]): LeaveRecord[] {
  return [...leaves].sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? 1 : -1
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
  })
}

export interface LeaveStats {
  /** 正在请假：已批准且今天落在起止区间内 */
  ongoing: number
  /** 本月（按起止日期任一落入本月计）人次 */
  monthCount: number
  /** 本月累计天数 */
  monthDays: number
  /** 待审批条数 */
  pending: number
  /** 各类型人次（全量，顺序固定） */
  byType: { type: LeaveType; count: number }[]
}

/** 请假统计（纯函数，today 可注入便于单测） */
export function leaveStats(leaves: LeaveRecord[], today = todayStr()): LeaveStats {
  const month = today.slice(0, 7)
  let ongoing = 0
  let monthCount = 0
  let monthDays = 0
  let pending = 0
  const typeMap = new Map<LeaveType, number>()
  for (const l of leaves) {
    if (l.status === 'pending') pending++
    if (l.status === 'approved' && l.startDate <= today && today <= l.endDate) ongoing++
    if ((l.startDate || '').slice(0, 7) === month || (l.endDate || '').slice(0, 7) === month) {
      monthCount++
      monthDays += l.days || 0
    }
    typeMap.set(l.type, (typeMap.get(l.type) ?? 0) + 1)
  }
  return {
    ongoing,
    monthCount,
    monthDays,
    pending,
    byType: LEAVE_TYPES.map((type) => ({ type, count: typeMap.get(type) ?? 0 }))
  }
}

/** 把任意来源的数组统一成「对象数组」再逐字段兜底。
 * 先转 unknown[] 再过滤，避免对已具名类型的数组做 Record 断言（TS2677）。
 */
function asRecords(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return []
  return (v as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
}

// ---------- 作业记录（homeworks 桶） ----------

/** 未交状态兜底：非法值回落 pending（未交） */
export function normalizeHomeworkMissStatus(v: unknown): HomeworkMissStatus {
  if (v === 'submitted') return 'submitted'
  if (v === 'madeup') return 'madeup'
  return 'pending'
}

/** 归一化单条未交记录，缺失字段兜底 */
export function normalizeHomeworkMiss(raw: unknown): TeacherHomeworkMiss {
  const m = (raw ?? {}) as Record<string, unknown>
  return {
    id: str(m.id) || uid('thwm'),
    studentId: str(m.studentId),
    studentName: str(m.studentName),
    studentNo: str(m.studentNo) || undefined,
    status: normalizeHomeworkMissStatus(m.status),
    madeUpAt: str(m.madeUpAt) || undefined,
    note: str(m.note) || undefined
  }
}

/** 归一化单条作业记录 */
export function normalizeHomework(raw: unknown): TeacherHomework {
  const h = (raw ?? {}) as Record<string, unknown>
  const now = todayStr()
  const assign = str(h.assignDate)
  const due = str(h.dueDate) || assign
  return {
    id: str(h.id) || uid('thw'),
    subject: str(h.subject),
    title: str(h.title),
    content: str(h.content) || undefined,
    assignDate: assign,
    dueDate: due,
    status: h.status === 'assigned' ? 'assigned' : 'assigned',
    createdAt: str(h.createdAt) || now,
    updatedAt: str(h.updatedAt) || now,
    misses: asRecords(h.misses).map((x) => normalizeHomeworkMiss(x))
  }
}

/** 按当前名册为每位在册同学生成一条 pending 未交记录（冗余姓名/学号） */
export function initMissesFromRoster(students: Student[]): TeacherHomeworkMiss[] {
  return students.map((s) => ({
    id: uid('thwm'),
    studentId: s.id,
    studentName: s.name,
    studentNo: s.no || undefined,
    status: 'pending'
  }))
}

/** 统计各提交状态人数（不持久化的派生）：未交 / 已交 / 已补交 */
export function countMisses(misses: TeacherHomeworkMiss[]): { pending: number; submitted: number; madeup: number } {
  let pending = 0
  let submitted = 0
  let madeup = 0
  for (const m of misses) {
    if (m.status === 'madeup') madeup++
    else if (m.status === 'submitted') submitted++
    else pending++
  }
  return { pending, submitted, madeup }
}

/** 归一化任意来源（IndexedDB / 备份导入）的数据，缺失字段一律兜底，绝不抛错 */
export function normalizeTeacherData(raw: unknown): TeacherData {
  const base = emptyTeacherData()
  if (!raw || typeof raw !== 'object') return base
  const d = raw as Partial<TeacherData> & Record<string, unknown>

  // 删除标记：被删的学期/班级 id 集合，合并双方各自剔除命中项（避免云同步复活）
  const tombRaw = (d.tombstones ?? {}) as Record<string, unknown>
  const tomb = {
    semesters: new Set(strArray(tombRaw.semesters)),
    classes: new Set(strArray(tombRaw.classes))
  }

  const teacherRaw = (d.teacher ?? {}) as Record<string, unknown>
  const teacher = {
    id: str(teacherRaw.id, base.teacher.id),
    name: str(teacherRaw.name, base.teacher.name),
    subjects: Array.isArray(teacherRaw.subjects) ? teacherRaw.subjects.map((s) => str(s)).filter(Boolean) : base.teacher.subjects
  }

  const semesters: Semester[] = asRecords(d.semesters)
    .map((s) => ({
      id: str(s.id) || uid('sem'),
      year: str(s.year),
      term: normalizeTerm(s.term),
      createdAt: num(s.createdAt, Date.now())
    }))
    .filter((s) => !tomb.semesters.has(s.id))

  const classes: ClassGroup[] = asRecords(d.classes)
    .map((c) => ({
      id: str(c.id) || uid('cls'),
      semesterId: str(c.semesterId),
      stage: normalizeStage(c.stage),
      grade: str(c.grade),
      name: str(c.name),
      role: (c.role === 'head' ? 'head' : 'subject') as TeacherRole,
      subject: str(c.subject)
    }))
    .filter((c) => !!c.semesterId && !tomb.classes.has(c.id))

  const assignments = asRecords(d.assignments)
    .map((a) => ({
      id: str(a.id) || uid('asg'),
      teacherId: str(a.teacherId, teacher.id),
      semesterId: str(a.semesterId),
      classId: str(a.classId),
      subject: str(a.subject)
    }))
    .filter(
      (a) => !!a.semesterId && !!a.classId && !tomb.semesters.has(a.semesterId) && !tomb.classes.has(a.classId)
    )

  // groups：逐桶归一化，保证每个存在的班级都有桶；被删学期/班级整桶跳过
  const groups: Record<string, Record<string, ClassBucket>> = {}
  const groupsRaw = (d.groups ?? {}) as Record<string, unknown>
  for (const semId of Object.keys(groupsRaw)) {
    if (tomb.semesters.has(semId)) continue
    const inner = groupsRaw[semId]
    if (!inner || typeof inner !== 'object') continue
    groups[semId] = {}
    for (const clsId of Object.keys(inner as Record<string, unknown>)) {
      if (tomb.classes.has(clsId)) continue
      groups[semId][clsId] = normalizeBucket((inner as Record<string, unknown>)[clsId])
    }
  }
  // 补齐：班级存在但无桶 → 建空桶
  for (const c of classes) {
    if (!groups[c.semesterId]) groups[c.semesterId] = {}
    if (!groups[c.semesterId][c.id]) groups[c.semesterId][c.id] = emptyBucket()
  }

  // 默认组合：只保留「学期存在 + 班级属于该学期」的有效组合，失效（被删）一律清空
  const defRaw = (d.defaultSelection ?? {}) as Record<string, unknown>
  const defaultSelection = normalizeDefaultSelection(
    { sem: str(defRaw.sem), cls: str(defRaw.cls) },
    semesters,
    classes
  )

  // 进入工作台：默认组合优先（命中即直接用，忽略上次的临时切换）；否则走既有解析逻辑
  const curRaw = (d.current ?? {}) as Record<string, unknown>
  let current = { sem: str(curRaw.sem), cls: str(curRaw.cls) }
  const byDefault = resolveDefaultSelection({ semesters, classes, defaultSelection })
  current =
    byDefault ?? resolveCurrent({ semesters, classes, groups, current, defaultSelection } as TeacherData)

  // 左侧菜单自定义（顺序 / 名称）：缺省按 TEACHER_PAGES 派生，随云同步一起走 teacher.json
  const menu = normalizeTeacherMenu(d.menuOrder, d.menuLabels)

  return {
    schemaVer: TEACHER_SCHEMA_VER,
    teacher,
    semesters,
    classes,
    assignments,
    current,
    defaultSelection,
    groups,
    menuOrder: menu.order,
    menuLabels: menu.labels,
    tombstones: { semesters: [...tomb.semesters], classes: [...tomb.classes] }
  }
}

/**
 * 归一化默认组合：学期或班级不存在（被删除 / 跨设备数据不同步）时清空为空串，
 * 避免留下指向已不存在实体的悬空 id。
 */
export function normalizeDefaultSelection(
  raw: { sem: string; cls: string },
  semesters: Semester[],
  classes: ClassGroup[]
): { sem: string; cls: string } {
  const sem = raw.sem && semesters.some((s) => s.id === raw.sem) ? raw.sem : ''
  if (!sem) return { sem: '', cls: '' }
  const cls = raw.cls && classes.some((c) => c.id === raw.cls && c.semesterId === sem) ? raw.cls : ''
  return { sem, cls: cls ? cls : '' }
}

/** 默认组合有效则返回它，否则返回 null（调用方据此回落到常规解析） */
export function resolveDefaultSelection(
  data: Pick<TeacherData, 'semesters' | 'classes' | 'defaultSelection'>
): { sem: string; cls: string } | null {
  const d = data.defaultSelection
  if (!d || !d.sem || !d.cls) return null
  if (!data.semesters.some((s) => s.id === d.sem)) return null
  if (!data.classes.some((c) => c.id === d.cls && c.semesterId === d.sem)) return null
  return { sem: d.sem, cls: d.cls }
}

export function normalizeBucket(raw: unknown): ClassBucket {
  const base = emptyBucket()
  if (!raw || typeof raw !== 'object') return base
  const b = raw as Partial<ClassBucket> & Record<string, unknown>

  const students: Student[] = asRecords(b.students)
    .map((s): Student => {
      const healthRaw = (s.health ?? {}) as unknown as Record<string, unknown>
      return {
        id: str(s.id) || uid('stu'),
        no: str(s.no),
        name: str(s.name),
        gender: s.gender === '男' ? '男' : '女',
        special: bool(s.special),
        post: str(s.post),
        health: {
          allergy: str(healthRaw.allergy),
          disease: str(healthRaw.disease),
          notes: str(healthRaw.notes),
          emergencyPhone: str(healthRaw.emergencyPhone)
        }
      }
    })
    .filter((s) => !!s.name)

  const parents: Record<string, { parentName: string; relation: string; phone: string }> = {}
  const parentsRaw = (b.parents ?? {}) as Record<string, unknown>
  for (const k of Object.keys(parentsRaw)) {
    const p = parentsRaw[k] as Record<string, unknown> | undefined
    if (!p || typeof p !== 'object') continue
    parents[k] = { parentName: str(p.parentName), relation: str(p.relation), phone: str(p.phone) }
  }

  const exams: Exam[] = asRecords(b.exams).map((e) => {
    const scoresRaw = (e.scores ?? {}) as Record<string, unknown>
    const scores: Record<string, number> = {}
    for (const sid of Object.keys(scoresRaw)) {
      const v = Number(scoresRaw[sid])
      if (Number.isFinite(v)) scores[sid] = v
    }
    return { id: str(e.id) || uid('exam'), subject: str(e.subject), name: str(e.name), date: str(e.date), scores }
  })

  const papers = asRecords(b.papers).map((p) => ({
    id: str(p.id) || uid('paper'),
    examId: str(p.examId),
    title: str(p.title),
    questions: asRecords(p.questions).map((q) => ({
      no: num(q.no, 0),
      type: str(q.type),
      point: str(q.point),
      wrongCount: num(q.wrongCount, 0)
    }))
  }))

  const seatsRaw = (b.seats ?? {}) as Record<string, unknown>
  const rows = Math.max(1, Math.min(12, Math.floor(num(seatsRaw.rows, base.seats.rows))))
  const cols = Math.max(1, Math.min(12, Math.floor(num(seatsRaw.cols, base.seats.cols))))
  const gridIn = Array.isArray(seatsRaw.grid) ? seatsRaw.grid : []
  const grid: (string | null)[] = Array.from({ length: rows * cols }, (_, i) => {
    const v = gridIn[i]
    return typeof v === 'string' && v ? v : null
  })

  const dutyRaw = (b.duty ?? {}) as Record<string, unknown>
  const daysIn = Array.isArray(dutyRaw.days) ? dutyRaw.days : []
  const days = WEEK_DAYS.slice(0, 5).map((day) => {
    const found = daysIn.find((x): x is Record<string, unknown> => !!x && typeof x === 'object' && x.day === day)
    return {
      day,
      members: Array.isArray(found?.members) ? found!.members.map((m) => str(m)).filter(Boolean) : [],
      leader: str(found?.leader)
    }
  })
  // 班委信息：优先取顶层 b.committee（新结构），兼容旧数据落在 duty.committee 的情况；
  // 旧字段为 name（实为 studentId），新结构为 studentId，统一归一化为 studentId。
  const rawCommittee = Array.isArray((b as Record<string, unknown>).committee)
    ? ((b as Record<string, unknown>).committee as unknown[])
    : Array.isArray(dutyRaw.committee)
      ? dutyRaw.committee
      : []
  const committee: CommitteeMember[] = rawCommittee
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      studentId: str(c.studentId) || str(c.name),
      role: str(c.role),
      duty: str(c.duty)
    }))

  const ttRaw = (b.timetable ?? {}) as Record<string, unknown>
  // 旧极简模型 { periods: TimetablePeriod[], grid: (string|null)[][]（grid[节次][星期 0..5=周一..周六]）}
  // 自动迁移为富模型：逐格转成 schedule[`${day}_${period}`]，时间按节次配置推算，老师/教室留空。
  let timetable: StudentTimetableData
  if (Array.isArray(ttRaw.grid) && !ttRaw.schedule) {
    const srcGrid = ttRaw.grid as (string | null)[][]
    const timing = emptyTiming()
    const schedule: StudentTimetableSchedule = {}
    for (let pi = 0; pi < srcGrid.length; pi++) {
      const row = Array.isArray(srcGrid[pi]) ? srcGrid[pi] : []
      for (let di = 0; di < row.length; di++) {
        const subject = typeof row[di] === 'string' ? (row[di] as string).trim() : ''
        if (!subject) continue
        const day = di + 1 // 旧列 0..5 → 新 day 1..6（周一..周六）
        const period = pi + 1
        if (day < 1 || day > 7 || period < 1 || period > 12) continue
        const { startHHMM, endHHMM } = computePeriodTime(period, timing)
        schedule[cellKey(day, period)] = { subject, startHHMM, endHHMM }
      }
    }
    timetable = { ...emptyTimetableData(), schedule }
  } else {
    timetable = normalizeTimetableData(ttRaw)
  }

  const growth: Record<string, { id: string; date: string; title: string; content: string; photos: string[] }[]> = {}
  const growthRaw = (b.growth ?? {}) as Record<string, unknown>
  for (const k of Object.keys(growthRaw)) {
    const list = growthRaw[k]
    if (!Array.isArray(list)) continue
    growth[k] = list
      .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
      .map((g) => ({
        id: str(g.id) || uid('grow'),
        date: str(g.date),
        title: str(g.title),
        content: str(g.content),
        photos: Array.isArray(g.photos) ? g.photos.map((p) => str(p)).filter(Boolean) : []
      }))
  }

  // 请假记录（leaves 桶）：班级维度流水，逐字段兜底；缺失视为空数组
  const leaves: LeaveRecord[] = asRecords(b.leaves).map((l) => {
    const start = str(l.startDate)
    const end = str(l.endDate)
    return {
      id: str(l.id) || uid('leave'),
      studentId: str(l.studentId),
      type: normalizeLeaveType(l.type),
      startDate: start,
      endDate: end || start,
      days: Math.max(0, Math.round(num(l.days, diffDays(start, end)))),
      reason: str(l.reason),
      applicant: str(l.applicant),
      approver: str(l.approver),
      status: normalizeLeaveStatus(l.status),
      remark: str(l.remark),
      createdAt: str(l.createdAt)
    }
  })

  // 作业记录（homeworks 桶）：班级维度流水，逐字段兜底；缺失视为空数组
  const homeworks: TeacherHomework[] = asRecords(b.homeworks).map((h) => normalizeHomework(h))

  const randomRaw = (b.random ?? {}) as Record<string, unknown>
  const random = {
    history: Array.isArray(randomRaw.history) ? randomRaw.history.map((h) => str(h)).filter(Boolean) : [],
    mode: randomRaw.mode === 'once' ? 'once' : 'all'
  } as const

  return { students, parents, exams, papers, seats: { rows, cols, grid }, duty: { days }, committee, timetable, growth, random: { ...random }, leaves, homeworks }
}

// ---------- 当前分组解析 ----------

/**
 * 解析当前激活分组：
 * - 无学期 → 空（引导建学期）
 * - 有学期无班级 → 优先该学期的「默认班级」，其次班主任班级，最后首个班级
 * - 指针失效 → 回落到最新学期 + 其班级（同样按 默认班 → 班主任班 → 首个班 选取）
 *
 * 切换学期时班级随之联动：给定学期后 current.cls 若无效，就用默认组合里的班级（若属于该学期）。
 * 注：进入工作台（normalizeTeacherData）走的是「默认组合优先」，与此处的会话内切换语义不同。
 */
export function resolveCurrent(
  data: Pick<TeacherData, 'semesters' | 'classes' | 'groups' | 'current' | 'defaultSelection'>
): {
  sem: string
  cls: string
} {
  const { semesters, classes } = data
  if (!semesters.length) return { sem: '', cls: '' }

  const semExists = (id: string) => semesters.some((s) => s.id === id)
  const clsOfSem = (semId: string) => classes.filter((c) => c.semesterId === semId)

  let sem = data.current?.sem && semExists(data.current.sem) ? data.current.sem : ''
  if (!sem) {
    // 默认最新学期（createdAt 大者优先）
    const sorted = [...semesters].sort((a, b) => b.createdAt - a.createdAt)
    sem = sorted[0]?.id ?? ''
  }
  if (!sem) return { sem: '', cls: '' }

  const list = clsOfSem(sem)
  if (!list.length) return { sem, cls: '' }

  let cls = data.current?.cls && list.some((c) => c.id === data.current.cls) ? data.current.cls : ''
  if (!cls) {
    // 默认班级（若属于当前学期）
    const defCls = data.defaultSelection?.cls
    if (defCls && list.some((c) => c.id === defCls)) cls = defCls
  }
  if (!cls) {
    // 其次该教师班主任班级，否则首个班级
    const head = list.find((c) => c.role === 'head')
    cls = (head ?? list[0]).id
  }
  return { sem, cls }
}

/** 取当前分组的数据桶（只读出口；不存在返回 null） */
export function currentBucket(data: TeacherData): ClassBucket | null {
  const { sem, cls } = data.current
  if (!sem || !cls) return null
  return data.groups?.[sem]?.[cls] ?? null
}

export function currentClass(data: TeacherData): ClassGroup | null {
  const { sem, cls } = data.current
  if (!sem || !cls) return null
  return data.classes.find((c) => c.id === cls && c.semesterId === sem) ?? null
}

/** 本班身份：班主任 / 科任 */
export function currentRole(data: TeacherData): TeacherRole {
  return currentClass(data)?.role ?? 'head'
}

// ---------- 角色可见性 ----------

/** 某页在当前身份下是否可见 */
export function isTeacherPageVisible(page: TeacherPageKey, role: TeacherRole): boolean {
  if (role === 'head') return true
  return !TEACHER_HEAD_ONLY_PAGES.includes(page)
}

/** 当前身份下可见的页面（保持 TEACHER_PAGES 顺序） */
export function visibleTeacherPages(role: TeacherRole): TeacherPageMeta[] {
  return TEACHER_PAGES.filter((p) => isTeacherPageVisible(p.key, role))
}

/** 可见页面按分组聚合；整组为空则该组不返回（分组标题一并隐藏） */
export function visibleTeacherGroups(role: TeacherRole): { group: string; pages: TeacherPageMeta[] }[] {
  return TEACHER_GROUPS.map((group) => ({
    group,
    pages: TEACHER_PAGES.filter((p) => p.group === group && isTeacherPageVisible(p.key, role))
  })).filter((g) => g.pages.length > 0)
}

/** 当前页被隐藏时的回落页（学生名单始终可见） */
export function fallbackPage(role: TeacherRole): TeacherPageKey {
  return isTeacherPageVisible('students', role) ? 'students' : (visibleTeacherPages(role)[0]?.key ?? 'data')
}

/** 若目标页不可见，返回回落页 */
export function guardPage(page: TeacherPageKey, role: TeacherRole): TeacherPageKey {
  return isTeacherPageVisible(page, role) ? page : fallbackPage(role)
}

// ---------- 成绩统计 ----------

export interface ExamStats {
  count: number
  max: number
  min: number
  avg: number
  passRate: number // ≥60
  poorRate: number // <40
  excellentRate: number // ≥90
}

/** 统计一场考试；除数为「有成绩的人数」 */
export function examStats(scores: Record<string, number>): ExamStats {
  const vals = Object.values(scores ?? {}).filter((v) => Number.isFinite(v))
  const count = vals.length
  if (!count) return { count: 0, max: 0, min: 0, avg: 0, passRate: 0, poorRate: 0, excellentRate: 0 }
  const max = Math.max(...vals)
  const min = Math.min(...vals)
  const avg = vals.reduce((a, b) => a + b, 0) / count
  const rate = (fn: (v: number) => boolean) => Math.round((vals.filter(fn).length / count) * 1000) / 10
  return {
    count,
    max,
    min,
    avg: Math.round(avg * 10) / 10,
    passRate: rate((v) => v >= 60),
    poorRate: rate((v) => v < 40),
    excellentRate: rate((v) => v >= 90)
  }
}

/** 七段分布计数（与 SCORE_BANDS 顺序一致） */
export function bandCounts(scores: Record<string, number>): number[] {
  const vals = Object.values(scores ?? {}).filter((v) => Number.isFinite(v))
  return SCORE_BANDS.map((b) => vals.filter((v) => v >= b.min && v <= b.max).length)
}

export interface RankRow {
  studentId: string
  name: string
  no: string
  gender: '男' | '女'
  score: number
  rank: number
  comment: string
}

export function scoreComment(score: number): string {
  if (score >= 90) return '优秀'
  if (score >= 80) return '良好'
  if (score >= 60) return '合格'
  return '待努力'
}

/** 成绩排名表（降序；同分并列同名次） */
export function rankRows(exam: Exam, students: Student[]): RankRow[] {
  const map = new Map(students.map((s) => [s.id, s]))
  const rows = Object.entries(exam.scores ?? {})
    .filter(([sid]) => map.has(sid))
    .map(([sid, score]) => {
      const s = map.get(sid)!
      return { studentId: sid, name: s.name, no: s.no, gender: s.gender, score, rank: 0, comment: scoreComment(score) }
    })
    .sort((a, b) => b.score - a.score)
  let prev = Number.NaN
  let rank = 0
  rows.forEach((r, i) => {
    if (r.score !== prev) {
      rank = i + 1
      prev = r.score
    }
    r.rank = rank
  })
  return rows
}

/** 折线图用：按排名顺序的学生分数序列 */
export function trendSeries(exam: Exam, students: Student[]): { name: string; score: number }[] {
  return rankRows(exam, students).map((r) => ({ name: r.name, score: r.score }))
}

// ---------- 座位表 ----------

/** 调整行列后重排：已有学生按原顺序填入新网格，多余截断、不足留空 */
export function resizeSeats(seats: SeatData, rows: number, cols: number): SeatData {
  const r = Math.max(1, Math.min(12, Math.floor(rows) || 1))
  const c = Math.max(1, Math.min(12, Math.floor(cols) || 1))
  const existing = seats.grid.filter((v): v is string => !!v)
  const grid: (string | null)[] = Array.from({ length: r * c }, (_, i) => existing[i] ?? null)
  return { rows: r, cols: c, grid }
}

/** 按名单排座：按学号升序依次填入前 N 格 */
export function arrangeByRoster(students: Student[], rows: number, cols: number): SeatData {
  const sorted = [...students].sort((a, b) => cmpNo(a.no, b.no))
  const grid: (string | null)[] = Array.from({ length: rows * cols }, (_, i) => sorted[i]?.id ?? null)
  return { rows, cols, grid }
}

/** 随机排座：洗牌后填入 */
export function arrangeRandom(students: Student[], rows: number, cols: number): SeatData {
  const arr = [...students]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arrangeByRoster(arr, rows, cols)
}

/** 交换两个座位；任一为空位则视为「移动到该空位」 */
export function swapSeats(grid: (string | null)[], i: number, j: number): (string | null)[] {
  if (i === j || i < 0 || j < 0 || i >= grid.length || j >= grid.length) return grid
  const next = [...grid]
  const a = next[i]
  const b = next[j]
  if (a && !b) {
    // 移动到空位
    next[j] = a
    next[i] = null
  } else if (!a && b) {
    next[i] = b
    next[j] = null
  } else {
    next[i] = b
    next[j] = a
  }
  return next
}

/** 学号比较（数字优先，其次字典序） */
export function cmpNo(a: string, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return String(a).localeCompare(String(b), 'zh-Hans-CN')
}

// ---------- 值日 / 班委 ----------

/** 按名单自动轮排：学号升序循环分配到周一~周五，组长=组内学号最靠前者 */
export function autoArrangeDuty(students: Student[], groupSize = 8): DutyData {
  const sorted = [...students].sort((a, b) => cmpNo(a.no, b.no))
  const days = WEEK_DAYS.slice(0, 5).map((day) => ({ day, members: [] as string[], leader: '' }))
  if (!sorted.length) return { days }
  const size = Math.max(1, Math.floor(groupSize) || 1)
  let idx = 0
  for (const d of days) {
    const members: string[] = []
    for (; idx < sorted.length && members.length < size; idx++) members.push(sorted[idx].id)
    d.members = members
    d.leader = members[0] ?? ''
  }
  // 剩余学生继续回填（保证不漏人）
  let di = 0
  for (; idx < sorted.length; idx++) {
    days[di % days.length].members.push(sorted[idx].id)
    di++
  }
  return { days }
}

// ---------- 级联清理 ----------

/**
 * 删除学生：级联清理 parents / 成绩 / 座位 / 值日 / 点名历史。
 * 奖励记录（growth 桶）保留（历史记录不因学生离班而消失），由调用方提示用户。
 */
export function removeStudentCascade(bucket: ClassBucket, studentId: string): ClassBucket {
  return {
    ...bucket,
    students: bucket.students.filter((s) => s.id !== studentId),
    parents: omitKey(bucket.parents, studentId),
    exams: bucket.exams.map((e) => ({ ...e, scores: omitKey(e.scores, studentId) })),
    seats: { ...bucket.seats, grid: bucket.seats.grid.map((v) => (v === studentId ? null : v)) },
    duty: {
      ...bucket.duty,
      days: bucket.duty.days.map((d) => ({
        ...d,
        members: d.members.filter((m) => m !== studentId),
        leader: d.leader === studentId ? '' : d.leader
      }))
    },
    committee: bucket.committee.filter((c) => c.studentId !== studentId),
    random: { ...bucket.random, history: bucket.random.history.filter((h) => h !== studentId) },
    leaves: bucket.leaves.filter((l) => l.studentId !== studentId)
  }
}

function omitKey<T>(obj: Record<string, T>, key: string): Record<string, T> {
  if (!(key in obj)) return obj
  const next = { ...obj }
  delete next[key]
  return next
}

/** 学生名册排序（学号升序） */
export function sortedStudents(students: Student[]): Student[] {
  return [...students].sort((a, b) => cmpNo(a.no, b.no))
}

/** 供展示的班级标题，如「示例小学 三年级1班 · 王老师」 */
export function classTitle(cls: ClassGroup | null, teacherName: string, school = ''): string {
  if (!cls) return '教师工作台'
  return [school, `${cls.grade}${cls.name}`, teacherName].filter(Boolean).join(' · ')
}
