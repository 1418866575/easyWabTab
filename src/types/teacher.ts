// 教师工作台类型定义（数据存 IndexedDB store 'teacher_workbench' 单对象）
// 层级：教师(1) → 学期(N) → 班级(N) → { 学生 / 班级级数据 / 课程级数据 }
// 教师↔班级↔课程 的多对多由 TeachingAssignment 枢纽表达。
// 学生一律以 studentId 为主键（姓名仅作展示），规避重名学生静默错配。

import type { StudentTimetableData, StudentTimetableSchedule } from '@/types'

// 教师课程表复用学生课程表富模型，重新导出以便其他模块从 @/types/teacher 统一引入
export type { StudentTimetableData, StudentTimetableSchedule }

export type TeacherRole = 'head' | 'subject' // 本班身份：班主任 / 非班主任（科任）

export type TeacherStage = '幼儿园' | '小学' | '初中' | '高中' | '大学'
export type TeacherTerm = '上半年' | '下半年'

/** 学段下拉选项（新增 / 编辑弹框用） */
export const STAGE_OPTIONS: TeacherStage[] = ['幼儿园', '小学', '初中', '高中', '大学']
/** 学期下拉选项（仅上半年 / 下半年） */
export const TERM_OPTIONS: TeacherTerm[] = ['上半年', '下半年']
/** 班级下拉：按学段区分的年级范围（幼儿园 大班/中班/小班 ~ 大四） */
export const CLASS_LEVELS_BY_STAGE: Record<TeacherStage, string[]> = {
  '幼儿园': ['大班', '中班', '小班'],
  '小学': ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'],
  '初中': ['初一', '初二', '初三'],
  '高中': ['高一', '高二', '高三'],
  '大学': ['大一', '大二', '大三', '大四']
}

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
  stage: TeacherStage // 学段：幼儿园 / 小学 / 初中 / 高中 / 大学
  grade: string // 如 "三年级" / "大一"（按学段区分的年级）
  name: string // 班级后缀（如 "1班"），无则留空，仅作展示
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
  /** 职务（如 班长；由班委信息自动同步，多职务用「、」连接）；学生信息侧可反向编辑回写班委 */
  post: string
  /** 家庭地址（明细表可编辑；随导入模板 / 导出 Excel 流转） */
  address: string
  /** 是否住校（下拉选项：是 / 否；随导入 / 导出 Excel 流转） */
  boarding: boolean
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

/** 班委候选职务（下拉候选；支持输入自定义新增） */
export const COMMITTEE_ROLES: string[] = [
  '班长', '副班长', '学习委员', '纪律委员', '体育委员', '文艺委员',
  '劳动委员', '生活委员', '宣传委员', '组织委员', '团支书', '心理委员'
]

export interface CommitteeMember {
  /** 关联学生主键（studentId）；学号/姓名由该学生反查得到，保证数据一致 */
  studentId: string
  /** 职务（如 班长；允许输入自定义新增） */
  role: string
  /** 职责说明 */
  duty: string
}

export interface DutyData {
  days: DutyDay[]
}

/**
 * 课程表：复用学生课程表富模型（按班级隔离，落在 ClassBucket.timetable）。
 * schedule: Record<`${dayOfWeek}_${period}`, StudentTimetableCell>，day 1-7（周一~周日）、period 1-12。
 * 旧极简模型（{ periods, grid }）在 teacherCore.normalizeBucket 中自动迁移为 schedule。
 */
export type TeacherTimetable = StudentTimetableData

/** 奖励记录条目（页面「奖励记录」，原学生成长档案；沿用 growth 桶字段名不变） */
export interface GrowthRecord {
  id: string
  date: string
  title: string
  content: string
  photos: string[] // base64 dataURL
}

// ---------- 请假信息（页面「请假信息」，班主任专属；leaves 桶） ----------

/** 请假类型 */
export type LeaveType = '事假' | '病假' | '公假' | '丧假' | '其他'
/** 请假状态：待审批 → 已批准 / 未批准；已批准 → 已销假 */
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'closed'

export interface LeaveRecord {
  id: string
  studentId: string // 关联 Student.id（学号复合 id，勿用姓名匹配）
  type: LeaveType
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  days: number // 请假天数（默认结束日 - 开始日 + 1，可手动覆盖）
  reason: string // 请假事由
  applicant: string // 申请人（家长 / 学生本人）
  approver: string // 审批人（默认班主任姓名）
  status: LeaveStatus
  remark: string // 备注（销假情况等）
  createdAt: string // 登记时间 YYYY-MM-DD
}

export const LEAVE_TYPES: LeaveType[] = ['事假', '病假', '公假', '丧假', '其他']

/** 状态展示元数据（label / 语义色 class），渲染与统计共用 */
export const LEAVE_STATUS_META: { key: LeaveStatus; label: string; tone: string }[] = [
  { key: 'pending', label: '待审批', tone: 'warn' },
  { key: 'approved', label: '已批准', tone: 'info' },
  { key: 'rejected', label: '未批准', tone: 'danger' },
  { key: 'closed', label: '已销假', tone: 'ok' }
]

export interface RandomState {
  history: string[] // studentId[]
  mode: 'all' | 'once'
}

// ---------- 班级小组（页面「班级小组」；随学期×班级隔离；groups[] 数组而非 Record） ----------
export type GroupMode =
  | 'random' // 纯随机
  | 'gender' // 按性别（配合 genderSplit 各自独立）
  | 'score_homo' // 按成绩同质（水平相当同组）
  | 'score_hetero' // 按成绩异质（蛇形，高低均衡）
  | 'order' // 按学号顺序（切块 / 蛇形）
  | 'hetero' // 异质均衡（性别 + 成绩综合）
  | 'boarding' // 按住校/走读分桶

export type RemainderMode = 'rotate' | 'min' | 'random'
// rotate=轮转补位（每组轮流+1）；min=多余的人进人数最少组；random=随机补位

/** 小组内角色（组长/记录员/汇报人为预设，其余可自定义） */
export type GroupRole = string
export const GROUP_ROLES: string[] = ['组长', '记录员', '汇报人']

export interface GroupingStrategy {
  mode: GroupMode
  /** 二选一：指定组数 */
  groupCount?: number
  /** 二选一：每组人数（优先级低于 groupCount，UI 二选一） */
  perGroup?: number
  /** 男女各自独立分组（gender/hetero 时生效） */
  genderSplit?: boolean
  /** 人数不能整除时的余数处理，默认 'rotate' */
  remainder?: RemainderMode
  /** 必须同组的 studentId 组合 */
  lockTogether?: string[][]
  /** 不能同组的 studentId 组合 */
  separate?: string[][]
}

export interface GroupMember {
  studentId: string
  role?: GroupRole
}

export interface StudentGroup {
  id: string
  name: string
  type: 'fixed' | 'temp' // 固定 / 临时
  description?: string
  members: GroupMember[] // 成员（只存 studentId）
  createdAt: string
  updatedAt: string
  fromSnapshot?: string // 若由快照应用而来，记快照 id
}

/** 一次分组结果（用于预览/保存） */
export interface GroupingResult {
  groupName: string
  memberIds: string[]
}

/** 分组快照（保存某次分组结果，日后复用） */
export interface GroupingSnapshot {
  id: string
  name: string
  createdAt: string
  strategy?: GroupingStrategy // 生成该快照所用的策略（可空，手改后保存）
  results: GroupingResult[]
}

/** 班级级 + 课程级数据桶，挂在 (semesterId, classId) 下 */
export interface ClassBucket {
  students: Student[]
  parents: Record<string, ParentInfo> // studentId -> 家长
  exams: Exam[]
  papers: Paper[]
  seats: SeatData
  duty: DutyData
  /** 班委信息（从值日生模块迁出，按班级隔离）；studentId 关联 Student，post 自动同步 */
  committee: CommitteeMember[]
  timetable: TeacherTimetable
  growth: Record<string, GrowthRecord[]> // studentId -> 记录
  random: RandomState
  /** 请假记录流水（班级维度，按开始日期倒序展示；随学期×班级隔离） */
  leaves: LeaveRecord[]
  /** 作业记录（页面「作业记录」；每次作业为每位同学生成一条提交记录），随学期×班级隔离 */
  homeworks: TeacherHomework[]
  /** 家校谈话记录（班主任专属；页面「家校谈话」；随学期×班级隔离） */
  talks: HomeSchoolTalkRecord[]
  /** 班级小组（页面「班级小组」；含固定组与临时组；随学期×班级隔离） */
  groups: StudentGroup[]
  /** 分组快照（保存某次随机/手动分组结果，可日后「应用为临时组」复用；随学期×班级隔离） */
  snapshots: GroupingSnapshot[]
}

// ---------- 作业记录（页面「作业记录」；作业与提交名单） ----------

/** 作业状态（作业维度）：当前仅用到「已布置」，其余预留便于后续扩展 */
export type HomeworkStatus = 'assigned'
export const HOMEWORK_STATUS_LABEL: Record<HomeworkStatus, string> = {
  assigned: '已布置'
}

/** 提交状态（学生维度）：未交 / 已交 / 已补交 */
export type HomeworkMissStatus = 'pending' | 'submitted' | 'madeup'
// pending = 未交；submitted = 已交（按时提交）；madeup = 已补交（逾期后补交，人工标记）

/** 提交状态展示元数据（label / 语义色 class），渲染与统计共用 */
export const HOMEWORK_MISS_STATUS_META: { key: HomeworkMissStatus; label: string; tone: string }[] = [
  { key: 'pending', label: '未交', tone: 'danger' },
  { key: 'submitted', label: '已交', tone: 'ok' },
  { key: 'madeup', label: '已补交', tone: 'info' }
]

/** 单次作业的提交记录（每位同学一条，独立） */
export interface TeacherHomeworkMiss {
  id: string // 前缀 thwm_
  studentId: string // 关联 Student.id（主键，杜绝重名错配）
  studentName: string // 姓名冗余副本（名册变动后仍可读）
  studentNo?: string // 学号（冗余副本，便于导出/核对）
  status: HomeworkMissStatus
  madeUpAt?: string // 补交时间（人工填写，可选，留空手填）
  note?: string // 备注
}

/** 作业（元数据 + 提交名单） */
export interface TeacherHomework {
  id: string // 前缀 thw_
  subject: string // 学科
  title: string // 标题，必填
  content?: string // 作业要求 / 描述
  assignDate: string // 布置日期 'YYYY-MM-DD'，必填
  dueDate: string // 截止日期 'YYYY-MM-DD'，必填
  status: HomeworkStatus // 作业状态，新建时默认为「已布置」
  createdAt: string
  updatedAt: string
  misses: TeacherHomeworkMiss[] // 每位同学一条提交记录
}

// ---------- 家校谈话记录（班主任专属；页面「家校谈话」） ----------

/** 沟通方式预设（下拉 + 可自定义，复用 el-select filterable allow-create default-first-option） */
export const TALK_MODES: string[] = ['电话', '微信', 'QQ', '面谈', '家访', '其他']

/** 谈话对象身份预设（下拉 + 可自定义） */
export const TALK_COUNTERPARTS: string[] = ['父亲', '母亲', '祖父母', '监护人', '学生本人', '其他']

/** 谈话主题分类预设（下拉） */
export const TALK_CATEGORIES: string[] = [
  '学业', '行为纪律', '心理情绪', '家庭情况', '出勤请假', '安全', '政策资助', '其他'
]

/** 单条家校谈话记录（关联单名学生；班主任专属，随学期×班级隔离） */
export interface HomeSchoolTalkRecord {
  id: string // 前缀 talk_
  studentId: string // 关联 Student.id（主键，杜绝重名错配）
  studentName: string // 姓名冗余副本（名册变动后仍可读）
  studentNo?: string // 学号冗余副本（便于导出/核对）
  date: string // 谈话日期 'YYYY-MM-DD'，必填
  time?: string // 具体时间 'HH:MM'，选填
  mode: string // 沟通方式（TALK_MODES 预设 + 可自定义）
  counterpart: string // 谈话对象身份（TALK_COUNTERPARTS 预设 + 可自定义）
  counterpartName?: string // 对方姓名（选填，counterpart 为「其他」时填写）
  category: string // 主题分类（TALK_CATEGORIES 预设）
  content: string // 谈话内容摘要，必填
  result?: string // 达成的共识 / 处理结论（选填）
  needFollowUp: boolean // 是否需后续跟进
  followUpNote?: string // 跟进事项 / 下次计划（needFollowUp 为真时填写）
  createdAt: number // 创建时间戳
  updatedAt: number // 更新时间戳
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
  /**
   * 默认进入的「学期 + 班级」组合：进入工作台时自动进入该组合（无需每次重选）。
   * 只存 id 对，学年 / 年级等信息一律从 semesters / classes 实时读出，避免冗余副本不一致。
   * 组合失效（学期或班级被删）时自动忽略，回落既有解析逻辑。随云同步。
   */
  defaultSelection?: { sem: string; cls: string }
  /** 左侧菜单自定义顺序（仅含可定制的功能页键，缺省按 TEACHER_PAGES 顺序）；随云同步 */
  menuOrder?: string[]
  /** 左侧菜单自定义显示名：key -> 名称，缺省用 TEACHER_PAGES 的 label；随云同步 */
  menuLabels?: Record<string, string>
  /**
   * 删除标记（tombstone）：云同步合并是「按 id 并集、只增不删」，本地删除的学期/班级
   * 会被远端旧数据「复活」。故把被删 id 记入此处，合并双方各自剔除命中项，
   * 让删除也能通过云同步传播。重建同名学期会生成全新 uid，不会误命中。随云同步；缺失视为空。
   */
  tombstones?: { semesters?: string[]; classes?: string[] }
}

// ---------- 页面与可见性 ----------

export type TeacherPageKey =
  | 'data'
  | 'students'
  | 'committee'
  | 'seats'
  | 'exams'
  | 'papers'
  | 'duty'
  | 'parents'
  | 'random'
  | 'timetable'
  | 'special'
  | 'growth'
  | 'leave'
  | 'homework'
  | 'talks'
  | 'groups'
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
 * 班务类（座位表/值日生表/联系家长）与隐私信息（原特异体质学生）按角色隐藏。
 *
 * 注意：左侧导航不再渲染分组标题（「基础功能」「特色功能」文字已移除），
 * group 字段仅用于排序约束（菜单设置里移动限制在同组内部）。
 */
export const TEACHER_PAGES: TeacherPageMeta[] = [
  { key: 'timetable', label: '课程表', icon: 'calendar', group: '基础功能' },
  { key: 'random', label: '点名', icon: 'dice', group: '基础功能' },
  { key: 'students', label: '学生信息', icon: 'notes', group: '基础功能' },
  { key: 'committee', label: '班委信息', icon: 'teacher', group: '基础功能' },
  { key: 'seats', label: '座位表', icon: 'grid', group: '基础功能' },
  { key: 'exams', label: '成绩信息', icon: 'chart', group: '基础功能' },
  { key: 'papers', label: '试卷分析', icon: 'target', group: '基础功能' },
  { key: 'duty', label: '值日生表', icon: 'check', group: '基础功能' },
  { key: 'parents', label: '联系家长', icon: 'phone', group: '基础功能' },
  { key: 'growth', label: '奖励记录', icon: 'star', group: '基础功能' },
  { key: 'leave', label: '请假信息', icon: 'clipboard', group: '基础功能' },
  { key: 'homework', label: '作业记录', icon: 'document', group: '基础功能' },
  { key: 'talks', label: '家校谈话', icon: 'email', group: '特色功能' },
  { key: 'groups', label: '班级小组', icon: 'account-multiple', group: '基础功能' },
  { key: 'special', label: '隐私信息', icon: 'heart', group: '特色功能' },
  { key: 'data', label: '数据管理', icon: 'database', group: '工作台' },
  { key: 'help', label: '使用说明', icon: 'help', group: '工作台' }
]

/** 仅班主任可见的班务模块（选「非班主任」时隐藏：导航移除 + 直达拦截） */
export const TEACHER_HEAD_ONLY_PAGES: TeacherPageKey[] = ['seats', 'duty', 'parents', 'special', 'leave', 'talks']

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
export type TeacherDataSectionKey = 'all' | 'semester' | 'class' | 'import' | 'backup'

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
    sub: '以班级为单位管理「学年 × 学段 × 学期 × 班级」组合；每行可编辑、设为默认或删除，设为默认后进入工作台自动进入该组合。'
  },
  {
    key: 'class',
    label: '班级信息',
    sub: '随当前所选学期与班级自动读出，不可手动修改；影响侧栏班级标题与各页「打印 / 导出 Excel」的班级页眉。如需更正，请到「学期与班级」编辑或删除后重建。'
  },
  {
    key: 'import',
    label: '导入数据',
    sub: '支持 .xlsx / .xls / .csv。学生名单需含「姓名」「性别」（学号、家庭地址列可选，列名带 * 也能识别）；成绩表第一列为姓名、其余数值列各生成一场考试；家长表需含「姓名」「家长」「电话」。'
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
