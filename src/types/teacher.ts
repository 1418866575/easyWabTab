// 教师工作台类型定义（数据存 IndexedDB store 'teacher_workbench' 单对象）
// 层级：教师(1) → 学期(N) → 班级(N) → { 学生 / 班级级数据 / 课程级数据 }
// 教师↔班级↔课程 的多对多由 TeachingAssignment 枢纽表达。
// 学生一律以 studentId 为主键（姓名仅作展示），规避重名学生静默错配。

export type TeacherRole = 'head' | 'subject' // 本班身份：班主任 / 非班主任（科任）

export interface TeacherInfo {
  id: string
  name: string
  subjects: string[]
}

export interface Semester {
  id: string
  year: string // 如 "2026"
  term: string // 如 "上学期"
  createdAt: number
}

export interface ClassGroup {
  id: string
  semesterId: string
  grade: string // 如 "三年级"
  name: string // 如 "1班"
  role: TeacherRole
  subject: string // 本班由该教师任教的科目
}

/** 教师↔班级↔课程 M:N 枢纽 */
export interface TeachingAssignment {
  id: string
  teacherId: string
  semesterId: string
  classId: string
  subject: string
}

/** 特异体质健康档案 */
export interface StudentHealth {
  allergy: string
  disease: string
  notes: string
  emergencyPhone: string
}

export interface Student {
  id: string // 稳定主键（学号+班级+学期复合生成）
  no: string // 学号（展示/排序用）
  name: string
  gender: '男' | '女'
  special: boolean // 特异体质
  health: StudentHealth
}

export interface ParentInfo {
  parentName: string
  relation: string
  phone: string
}

export interface Exam {
  id: string
  subject: string
  name: string
  date: string // 如 "2026-04"
  scores: Record<string, number> // studentId -> 分数
}

export interface PaperQuestion {
  no: number
  type: string
  point: string
  wrongCount: number
}

export interface Paper {
  id: string
  examId: string
  title: string
  questions: PaperQuestion[]
}

/** 座位：grid 长度 = rows*cols，按行序，元素为 studentId 或 null（空位） */
export interface SeatData {
  rows: number
  cols: number
  grid: (string | null)[]
}

export interface DutyDay {
  day: string
  members: string[] // studentId[]
  leader: string // studentId
}

export interface CommitteeMember {
  role: string
  name: string // studentId
  duty: string
}

export interface DutyData {
  days: DutyDay[]
  committee: CommitteeMember[]
}

export interface TimetablePeriod {
  label: string
  time: string
}

/** 课程表：grid[节次][星期]，值为科目名或 null */
export interface TimetableData {
  periods: TimetablePeriod[]
  grid: (string | null)[][]
}

/** 奖励记录条目（页面「奖励记录」，原学生成长档案；沿用 growth 桶字段名不变） */
export interface GrowthRecord {
  id: string
  date: string
  title: string
  content: string
  photos: string[] // base64 dataURL
}

export interface RandomState {
  history: string[] // studentId[]
  mode: 'all' | 'once'
}

/** 班级级 + 课程级数据桶，挂在 (semesterId, classId) 下 */
export interface ClassBucket {
  students: Student[]
  parents: Record<string, ParentInfo> // studentId -> 家长
  exams: Exam[]
  papers: Paper[]
  seats: SeatData
  duty: DutyData
  timetable: TimetableData
  growth: Record<string, GrowthRecord[]> // studentId -> 记录
  random: RandomState
}

export interface TeacherCurrent {
  sem: string
  cls: string
}

export interface TeacherData {
  schemaVer: number
  teacher: TeacherInfo
  semesters: Semester[]
  classes: ClassGroup[]
  assignments: TeachingAssignment[]
  current: TeacherCurrent
  /** groups[semesterId][classId] = 该班本学期的数据桶 */
  groups: Record<string, Record<string, ClassBucket>>
  /** 左侧菜单自定义顺序（仅含可定制的功能页键，缺省按 TEACHER_PAGES 顺序）；随云同步 */
  menuOrder?: string[]
  /** 左侧菜单自定义显示名：key -> 名称，缺省用 TEACHER_PAGES 的 label；随云同步 */
  menuLabels?: Record<string, string>
}

// ---------- 页面与可见性 ----------

export type TeacherPageKey =
  | 'data'
  | 'students'
  | 'seats'
  | 'exams'
  | 'papers'
  | 'duty'
  | 'parents'
  | 'random'
  | 'timetable'
  | 'special'
  | 'growth'
  | 'help'

export interface TeacherPageMeta {
  key: TeacherPageKey
  label: string
  icon: string
  group: '基础功能' | '特色功能' | '工作台'
}

/**
 * 12 个页面，数组顺序即左侧导航顺序。
 * 基础功能前两位为「课程表 / 点名」（高频日常入口，全员可见）；
 * 奖励记录（原学生成长档案）归入基础功能，全员可见。
 * 班务类（座位表/值日生表/家长联系方式）与隐私信息（原特异体质学生）按角色隐藏。
 *
 * 注意：左侧导航不再渲染分组标题（「基础功能」「特色功能」文字已移除），
 * group 字段仅用于排序约束（菜单设置里移动限制在同组内部）。
 */
export const TEACHER_PAGES: TeacherPageMeta[] = [
  { key: 'timetable', label: '课程表', icon: 'calendar', group: '基础功能' },
  { key: 'random', label: '点名', icon: 'dice', group: '基础功能' },
  { key: 'students', label: '学生信息', icon: 'notes', group: '基础功能' },
  { key: 'seats', label: '座位表', icon: 'grid', group: '基础功能' },
  { key: 'exams', label: '成绩信息', icon: 'chart', group: '基础功能' },
  { key: 'papers', label: '试卷分析', icon: 'target', group: '基础功能' },
  { key: 'duty', label: '值日生表', icon: 'check', group: '基础功能' },
  { key: 'parents', label: '家长联系方式', icon: 'phone', group: '基础功能' },
  { key: 'growth', label: '奖励记录', icon: 'star', group: '基础功能' },
  { key: 'special', label: '隐私信息', icon: 'heart', group: '特色功能' },
  { key: 'data', label: '数据管理', icon: 'database', group: '工作台' },
  { key: 'help', label: '使用说明', icon: 'help', group: '工作台' }
]

/** 仅班主任可见的班务模块（选「非班主任」时隐藏：导航移除 + 直达拦截） */
export const TEACHER_HEAD_ONLY_PAGES: TeacherPageKey[] = ['seats', 'duty', 'parents', 'special']

/**
 * 已迁入「设置页」的功能（数据管理 / 使用说明）：不再是左侧菜单项，
 * 入口改为顶部右上角「设置」按钮 → 设置弹窗的对应子 tab。
 * 页面组件仍保留（设置页直接复用），故 TeacherPageKey 不变。
 */
export const TEACHER_SETTINGS_ONLY_PAGES: TeacherPageKey[] = ['data', 'help']

/**
 * 「数据管理」页拆分后的区块键。
 * 'all' = 整页（教师工作台内嵌用）；其余 5 项在设置页里各占一个独立菜单项。
 * 拆分只改菜单层级与展示顺序，页面内容 / 交互 / 数据一律不变（同一组件按 section 显隐区块）。
 */
export type TeacherDataSectionKey = 'all' | 'semester' | 'class' | 'import' | 'import-edit' | 'backup'

export interface TeacherDataSectionMeta {
  key: Exclude<TeacherDataSectionKey, 'all'>
  label: string
  /** 该区块独立成页时的副标题 */
  sub: string
}

/** 设置页「数据管理」拆分后的独立菜单项，数组顺序即菜单顺序（学期与班级必须第一） */
export const TEACHER_DATA_SECTIONS: TeacherDataSectionMeta[] = [
  {
    key: 'semester',
    label: '学期与班级',
    sub: '顶层分组为「学期 × 班级」。切换只改指针，不搬动记录；新建班级为独立数据桶。'
  },
  {
    key: 'class',
    label: '班级信息',
    sub: '修改后立即生效，影响侧栏班级标题与各页「打印 / 导出 Excel」的班级页眉。'
  },
  {
    key: 'import',
    label: '导入表格',
    sub: '支持 .xlsx / .xls / .csv。学生名单需含「姓名」「性别」（学号列可选，列名带 * 也能识别）；成绩表第一列为姓名、其余数值列各生成一场考试；家长表需含「姓名」「家长」「电话」。'
  },
  {
    key: 'import-edit',
    label: '导入表格修改导入信息',
    sub: '导入会按学号 / 姓名覆盖同名记录。导入后如需逐条修正，请到「学生信息 / 成绩信息 / 家长联系方式」页直接编辑表格，修改自动保存。'
  },
  {
    key: 'backup',
    label: '备份与恢复',
    sub: '数据保存在本机浏览器，可随时备份带走；恢复会整体覆盖当前数据，建议先备份一次。'
  }
]

export const TEACHER_GROUPS: ('基础功能' | '特色功能' | '工作台')[] = ['基础功能', '特色功能', '工作台']

/** 成绩分段（0-39 / 40-49 / ... / 90-100）共 7 段 */
export const SCORE_BANDS: { label: string; min: number; max: number }[] = [
  { label: '0-39', min: 0, max: 39 },
  { label: '40-49', min: 40, max: 49 },
  { label: '50-59', min: 50, max: 59 },
  { label: '60-69', min: 60, max: 69 },
  { label: '70-79', min: 70, max: 79 },
  { label: '80-89', min: 80, max: 89 },
  { label: '90-100', min: 90, max: 100 }
]

export const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六'] as const
