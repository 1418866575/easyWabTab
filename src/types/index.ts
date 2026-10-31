
export interface Site {
  name: string
  url: string
  description?: string
  category: string
  tags: string[]
  icon?: string
  sort?: number
  createdAt?: string
  updatedAt?: string
  isValid?: boolean  // 断链检测结果，undefined=未检测
}

export interface SitesData {
  sites: Site[]
  lastUpdated?: string
}

// 分类接口
export interface Category {
  id: string
  name: string
  icon: string
  isBuiltIn: boolean
  sort?: number
}

// 预定义分类 (不可删除) - 仅保留 video
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'video', name: '视频音乐', icon: '🎬', isBuiltIn: true, sort: 1 },
  { id: 'other', name: '其他', icon: '📁', isBuiltIn: true, sort: 999 }
]

// 向后兼容
export const CATEGORIES = DEFAULT_CATEGORIES

// 密码管理接口
export interface PasswordEntry {
  id: string
  siteName: string
  url: string
  username: string
  password: string // 加密存储 (base64)
  createdAt: string
  updatedAt: string
  categoryId?: string // 密码分类（undefined/'' = 未分类）
}

/** 密码分类（镜像 NoteCategory：id + 名称 + 排序权重 + 标签页显隐） */
export interface PasswordCategory {
  id: string
  name: string
  sort?: number
  showInTabs?: boolean
}

/**
 * 密码库明文结构（加密后整体写入 IDB store 'passwords'）。
 * v1 = 裸数组 PasswordEntry[]（历史数据）；v2 = { categories, entries }。
 * 加载时按形状自动识别，v1 → v2 升级（空分类表），保证旧库可正常解密。
 */
export interface PasswordVault {
  categories: PasswordCategory[]
  entries: PasswordEntry[]
}

// 倒计时提醒分类：内置 6 类（COUNTDOWN_CATEGORIES）+ 用户自定义分类名（string，分类管理新增）
export const COUNTDOWN_CATEGORIES = ['work', 'life', 'study', 'exercise', 'diet', 'sleep'] as const
export type CountdownCategory = string

// 倒计时卡片自定义颜色：默认蓝 + 8 预设（与便签 NOTE_COLORS 同源色值）
export const DEFAULT_COUNTDOWN_COLOR = '#3b82f6'
export const COUNTDOWN_COLOR_PRESETS = [
  '#ef4444', // 红
  '#f97316', // 橙
  '#eab308', // 黄
  '#22c55e', // 绿
  '#06b6d4', // 青
  '#3b82f6', // 蓝
  '#a855f7', // 紫
  '#ec4899'  // 粉
] as const

// 倒计时重复规则对象（替代旧 repeat: 'yearly' | null）
// once 规范存储为 null（parseRepeat 归一）；weekly daysOfWeek: 1=周一 .. 7=周日
export type CountdownRepeat =
  | { type: 'once' }
  | { type: 'daily' }
  | { type: 'weekly'; daysOfWeek: number[] }
  | { type: 'monthly'; dayOfMonth: number } // 1-31，越界按当月天数钳制
  | { type: 'yearly' }
  | { type: 'interval'; intervalMinutes: number } // 距 endDateTime 起每 N 分钟

// 倒计时接口
export interface Countdown {
  id: string
  name: string
  endDateTime: string // 'YYYY-MM-DDTHH:mm' LOCAL time, no timezone suffix, e.g. '2026-12-31T23:59'
  repeat?: CountdownRepeat | null // 重复规则对象；null/absent = 一次性；旧字符串 'yearly' 由 normalize 迁移为 { type: 'yearly' }
  category?: CountdownCategory    // 提醒分类；undefined = 'work'（工作）
  lastRemindedAt?: string         // 上次提醒时刻（'YYYY-MM-DD HH:mm'），防重复提醒
  createdAt: string
  updatedAt: string
  sortOrder?: number        // NEW: manual sort position (1..n); undefined = last
  showOnDisplay?: boolean   // NEW: front-page visibility; undefined = true
  emailReminder?: boolean   // 发送邮件提醒开关；undefined/缺省 = 不发邮件
  color?: string            // 卡片自定义颜色（'#RRGGBB' 或 '#RGB' hex）；undefined = 默认蓝
}

export interface CountdownRemaining {
  days: number
  hours: number
  minutes: number
  label: string
  status: 'normal' | 'urgent' | 'critical' | 'expired'
  nextTime: string
  isExpired: boolean
}

export type CountdownItem = Countdown & { remaining: CountdownRemaining }

// 工作台待办任务
export type TodoPriority = 'low' | 'medium' | 'high'

/**
 * 待办工作流状态：未完成 / 进行中 / 已完成。
 * 「已归档」不是工作流状态，仍由 WorkbenchTodo.archived 布尔独立承载（归档只作用于已完成项）。
 * 可选字段：存量数据没有 status 时，由 completed 推导（见 todoCore.todoStatus），不影响既有数据展示。
 */
export type TodoStatus = 'pending' | 'in_progress' | 'completed'

// ===== 工作台水印类型（仅工作台生效，导航站排除）=====
/** 文字水印 / 图片水印 */
export type WatermarkType = 'text' | 'image'
/** 平铺（网格覆盖整页）/ 居中（单条居中） */
export type WatermarkMode = 'tile' | 'center'

/** 水印默认值（默认值与参数范围集中于此，store 与设置页共用，避免两处漂移） */
export const WATERMARK_DEFAULTS = {
  enabled: false,// 默认关闭：升级后页面无任何水印元素
  type: 'text' as WatermarkType,
  text: '',            // 文字内容留空，由管理员自定义
  image: '',           // 图片水印的 data URL（空 = 未选择）
  mode: 'tile' as WatermarkMode,
  opacity: 0.12,       // 不透明度（0.05~0.5）
  fontSize: 14,        // 字号 px（10~40）
  rotate: -22,         // 倾斜角（-90~0）
  gapX: 160,           // 平铺横向间距 px（80~320）
  gapY: 120// 平铺纵向间距 px（60~240）
} as const

/** 水印参数范围（设置页滑块与 store 归一化共用） */
export const WATERMARK_LIMITS = {
  opacity: { min: 0.05, max: 0.5, step: 0.01 },
  fontSize: { min: 10, max: 40, step: 1 },
  rotate: { min: -90, max: 0, step: 1 },
  gapX: { min: 80, max: 320, step: 10 },
  gapY: { min: 60, max: 240, step: 10 }
} as const

// 待办卡片自定义颜色：默认蓝 + 8 预设（与倒计时 COUNTDOWN_COLOR_PRESETS / 便签 NOTE_COLORS 同源色值）
export const DEFAULT_TODO_COLOR = '#3b82f6'
export const TODO_COLOR_PRESETS = [
  '#ef4444', // 红
  '#f97316', // 橙
  '#eab308', // 黄
  '#22c55e', // 绿
  '#06b6d4', // 青
  '#3b82f6', // 蓝
  '#a855f7', // 紫
  '#ec4899'  // 粉
] as const

export interface WorkbenchTodo extends SyncStamp {
  id: string
  title: string
  description?: string
  priority: TodoPriority
  dueDate?: string
  completed: boolean
  /** 工作流状态（可选）：缺失时按 completed 推导。与 completed 保持同步：completed === (status === 'completed')。 */
  status?: TodoStatus
  createdAt: string
  updatedAt: string
  color?: string // 卡片自定义颜色（'#RRGGBB' 或 '#RGB' hex）；undefined = 默认蓝
  categoryId?: string // 待办分类（undefined/'' = 未分类）
  checkedIn?: boolean // 是否已打卡（一次性：打卡后恒为 true，不自动重置）
  checkedInAt?: string // 打卡时间 ISO（仅展示用，绝不参与排序）
  completedAt?: string // 完成时间 ISO（自动归档的判定基准；旧数据缺失时回退 updatedAt）
  archived?: boolean // 已归档（已完成且超过归档期限自动置为 true；归档项排在列表最后）
}

// 工作台便签
export const NOTE_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const

export type NoteColor = (typeof NOTE_COLORS)[number]

// 便签类型：normal=普通便签，timeline=时光轴便签
export type NoteType = 'normal' | 'timeline'

// 便签类型筛选：'all' = 全部类型（不过滤），普通/时光轴 = 精确匹配
export type NoteTypeFilter = NoteType | 'all'

// 便签处理状态：pending=处理中，done=已处理；overdue=逾期为**派生状态**
// （不落库，由 dueDate 与当前日期比较得出，避免「昨天逾期、今天恢复」后状态滞留）
export const NOTE_STATUSES = ['pending', 'done'] as const
export type NoteStatus = (typeof NOTE_STATUSES)[number]
/** 展示用状态（含派生逾期），供 UI 直接渲染 */
export type NoteStatusView = NoteStatus | 'overdue'
export const NOTE_STATUS_LABELS: Record<NoteStatusView, string> = {
  pending: '处理中',
  done: '已处理',
  overdue: '逾期'
}

// 便签分类（工作台便签专属，独立于网址 Category）
export interface NoteCategory {
  id: string
  name: string
  sort?: number // 排序权重，数字越小越靠前；undefined = 追加末尾
  showInTabs?: boolean // 是否显示在便签分类标签页；undefined/true = 显示（默认），false = 隐藏
}

// 时光轴条目（仅 timeline 类型便签使用）
export interface TimelineEntry {
  id: string
  datetime: string // 'YYYY-MM-DD HH:mm' 本地时间
  content: string
  createdAt: string
}

export interface WorkbenchNote extends SyncStamp {
  id: string
  title?: string
  content: string
  color: NoteColor
  pinned: boolean
  createdAt: string
  updatedAt: string
  type?: NoteType           // 便签类型；undefined = normal（普通便签）
  categoryId?: string       // 所属便签分类 id；undefined = 未分类
  entries?: TimelineEntry[] // 时光轴条目（仅 type='timeline' 使用，normal 不写入）
  dueDate?: string          // 截止日期 'YYYY-MM-DD'；undefined = 未设置（历史数据缺省）
  status?: NoteStatus       // 处理中 / 已处理；undefined = 缺省按「处理中」显示（历史数据兼容）
  /** 状态最后一次变更时间（ISO）：合并时按此做**字段级**取舍，避免整条记录被对端旧状态覆盖 */
  statusUpdatedAt?: string
}

// 工作台便签数据（分类 + 便签列表）
export interface NoteData {
  categories: NoteCategory[]
  notes: WorkbenchNote[]
}

// 工作台日记本：多日志本（journalId 归属某个日志本）；每天每条目唯一（date 本地 'YYYY-MM-DD' 唯一，upsert 语义）
export interface WorkbenchJournal extends SyncStamp {
  id: string // 'jb_' 前缀
  name: string
  icon?: string // 可选 emoji 图标
  createdAt: string
  order: number // 排序（越小越靠前）
}

export interface WorkbenchDiary extends SyncStamp {
  id: string // 'dy_' 前缀
  journalId: string // 所属日志本 id（'jb_default' 为默认）
  date: string // 'YYYY-MM-DD' 本地日期，唯一（每天一条）
  title?: string // 标题（可选，≤100；列表首列展示，空则显示「（无标题）」）
  content: string // Markdown 正文
  createdAt: string
  updatedAt: string
  kind?: 'diary' | 'idea' // 类型：日记（默认）/ 灵感一句话短记
  category?: string // 日记专属分类 id（''=未分类），引用 useDiaryCategoriesStore
  mood?: string // 心情 key（DIARY_MOODS），如 'happy'
  pinned?: boolean // 是否置顶（默认 false）
  deleted?: boolean // 逻辑删除（软删除）标记；true 时默认列表隐藏，可从『已删除』筛选恢复
  coverImage?: string // 置顶图片/封面图 data URL（为空则用正文首图），随日记云同步
}

// 工作台日记本数据（日志本列表 + 条目列表）
export interface DiaryData {
  journals: WorkbenchJournal[]
  entries: WorkbenchDiary[]
}

// 工作台主页单张卡片的自定义布局（三项均可选：缺失 = 用组件默认）
export interface HomeCardLayout {
  w?: number // 列跨度（1 = 占 1 列；上限由所属网格列数决定）
  h?: number // 最小高度（px；内容更高时自动撑开）
  o?: number // 同容器内排序值（越小越靠前；默认按内置初始顺序）
}

// 工作台应用设置（备份 v4 新增）：弹窗尺寸 + 按钮/背景透明度 + 工作台菜单顺序/名称/开关 + 工作台城市/侧栏折叠态 + 导航筛选栏展开态
/** 云同步渠道类型（新增）：第三方云平台 / 自建服务 / 飞书表格 */
export type SyncChannel = 'thirdPartyCloud' | 'selfHosted' | 'feishu'

export interface AppSettingsData {
  dialogSizes: Record<string, { width: number; height: number }>
  buttonOpacity: number
  bgOpacity: number
  workbenchMenuOrder?: string[]
  workbenchMenuLabels?: Record<string, string>
  workbenchMenuVisibility?: Record<string, boolean> // 工作台菜单开关（false = 隐藏菜单项/面板/主页对应统计；缺失 = 显示）
  workbenchCity?: string // 天气卡城市（trim 后非空；空串/undefined/null = 未配置）
  workbenchSidebarCollapsed?: boolean // 工作台侧栏折叠态（非法/缺失 = 未配置即展开）
  businessSidebarCollapsed?: boolean // 销售记账工作台侧栏折叠态（非法/缺失 = 未配置即展开）
  navFiltersExpanded?: boolean // 导航站分类/标签栏展开态（默认 false = 收起）
  desktopNotifyEnabled?: boolean // 定时提醒桌面通知总开关（默认 false = 关闭）
  countdownPopupEnabled?: boolean // 倒计时到期/9:00 摘要的**页面弹框**开关（默认 true = 弹框；关闭后仅桌面通知/邮件，不影响它们）

  // ===== 工作台水印（仅工作台页面生效，导航站不显示）=====
  watermarkEnabled?: boolean // 水印总开关（默认 false = 关闭，页面无任何水印元素）
  watermarkType?: WatermarkType // 文字水印 / 图片水印（默认 'text'）
  watermarkText?: string // 文字水印内容（默认空串，由管理员自定义）
  watermarkImage?: string // 图片水印图片（data URL，取自图标库；空串 = 未选）
  watermarkMode?: WatermarkMode // 平铺 / 居中（默认 'tile'）
  watermarkOpacity?: number // 不透明度 0.05~0.5（存 0.05~0.5 的小数；默认 0.12）
  watermarkFontSize?: number // 字号 px 10~40（默认 14）
  watermarkRotate?: number // 倾斜角 -90~0 度（默认 -22）
  watermarkGapX?: number // 平铺横向间距 px 80~320（默认 160）
  watermarkGapY?: number // 平铺纵向间距 px 60~240（默认 120）
  reminderEmailEnabled?: boolean // 定时提醒邮件总开关（默认 false = 关闭）
  reminderEmailTo?: string // EmailJS 收件邮箱（空串 = 未配置）
  reminderEmailServiceId?: string // EmailJS Service ID
  reminderEmailTemplateId?: string // EmailJS Template ID
  reminderEmailPublicKey?: string // EmailJS Public Key
  workbenchPageName?: string           // 工作台页面自定义名称（默认 '工作台'）
  workbenchPageVisible?: boolean       // 工作台页面可见性开关（默认 false：用户在设置 → 个性化 → 工作台设置 主动打开后才显示）
  businessPageName?: string            // 销售记账页面自定义名称（默认 '销售记账'）
  businessPageVisible?: boolean        // 销售记账页面可见性开关（默认 true）
  businessActiveSection?: string       // 销售记账工作台当前模块（home/products/purchases/daily/expenses/inventory/stats；缺失 = 首页）
  studentPageName?: string             // 学生工作台页面自定义名称（默认 '学生工作台'）
  studentPageVisible?: boolean         // 学生工作台页面可见性开关（默认 true；缺失 = 显示）
  teacherPageName?: string             // 教师工作台页面自定义名称（默认 '教师工作台'）
  teacherPageVisible?: boolean         // 教师工作台页面可见性开关（默认 true；缺失 = 显示）
  workbenchPageIcon?: string           // 工作台入口自定义图标（图标库路径 / dataUrl；空串或缺失 = 用内置默认图标）
  businessPageIcon?: string            // 销售记账入口自定义图标（空串或缺失 = 内置默认）
  studentPageIcon?: string             // 学生工作台入口自定义图标（空串或缺失 = 内置默认）
  teacherPageIcon?: string             // 教师工作台入口自定义图标（空串或缺失 = 内置默认）
  smartPageName?: string               // 智能工作台（/smart 技能库+提示词库）自定义名称（默认 '智能工作台'）
  smartPageVisible?: boolean           // 智能工作台页面可见性开关（默认 true；缺失 = 显示）
  smartPageIcon?: string               // 智能工作台入口自定义图标（图标库路径 / dataUrl；空串或缺失 = 内置默认）
  workbenchManageName?: string         // 导航站右上角「工作台管理」按钮自定义名称（默认 '工作台管理'）
  workbenchManageVisible?: boolean     // 「工作台管理」按钮可见性开关（默认 true；缺失 = 显示）
  workbenchManageIcon?: string         // 「工作台管理」按钮自定义图标（图标库路径 / dataUrl；空串或缺失 = 用内置默认图标）
  countdownButtonName?: string         // 导航站右上角「倒计时」按钮自定义名称（默认 '倒计时'）
  countdownButtonVisible?: boolean     // 「倒计时」按钮可见性开关（默认 true；缺失 = 显示）
  helpButtonName?: string              // 导航站右上角「帮助」按钮自定义名称（默认 '帮助'）
  helpButtonVisible?: boolean          // 「帮助」按钮可见性开关（默认 true；缺失 = 显示）
  toolboxButtonName?: string           // 「工具箱」入口自定义名称（默认 '工具箱'）
  toolboxButtonIcon?: string           // 「工具箱」入口自定义图标（图标库路径 / dataUrl；空串或缺失 = 用内置 🧰）
  toolboxButtonVisible?: boolean       // 「工具箱」入口可见性开关（默认 true；缺失 = 显示）
  blogAdminPageName?: string           // 博客后台（/blog/admin）自定义名称（默认 '博客后台'）
  blogAdminPageVisible?: boolean       // 博客后台可见性开关（默认 true；缺失 = 显示）
  blogAdminPageIcon?: string           // 博客后台入口自定义图标（图标库路径 / dataUrl；空串或缺失 = 内置默认）
  blogFrontPageName?: string           // 博客前台（/blog）自定义名称（默认 '博客前台'）
  blogFrontPageVisible?: boolean       // 博客前台可见性开关（默认 true；缺失 = 显示）
  blogFrontPageIcon?: string           // 博客前台入口自定义图标（图标库路径 / dataUrl；空串或缺失 = 内置默认）
  booksPageName?: string              // 个人图书馆（/books）自定义名称（默认 '图书馆'）
  booksPageVisible?: boolean          // 个人图书馆可见性开关（默认 true；缺失 = 显示）
  booksPageIcon?: string              // 个人图书馆入口自定义图标（图标库路径 / dataUrl；空串或缺失 = 内置默认）
  cloudSyncEnabled?: boolean           // 云同步总开关（默认 false）
  cloudSyncUrl?: string                // WebDAV URL（空串 = 未配置）
  cloudSyncUsername?: string           // WebDAV 用户名（空串 = 未配置）
  cloudSyncPassword?: string           // WebDAV 应用密码（空串 = 未配置，存 IDB 非 localStorage）
  cloudSyncInterval?: number           // 后台定时同步间隔（0 = 仅触发式，>0 = 分钟数）
  cloudSyncSilentThreshold?: number    // 静默合并阈值（本地与云端差异字符数 < 此值时后台静默合并，0=永不静默，默认 1000）
  cloudSyncAutoPush?: boolean          // 保存后立即上云（本地覆盖云端，防抖 1.5s，只推内容有变化的信封，默认 false）
  cloudSyncChannel?: SyncChannel       // 同步渠道类型（第三方云平台 / 自建服务 / 飞书表格），缺省按原 WebDAV 行为
  cloudSyncFeishuAppId?: string        // 飞书自建应用 App ID（仅本机存储）
  cloudSyncFeishuAppSecret?: string    // 飞书自建应用 App Secret（仅本机，绝不进入任何同步数据流 / 提交）
  cloudSyncFeishuDatasourceUrl?: string // 飞书多维表格数据源地址（wiki 链接，含 domain + nodeToken + tableId，按链接解析）
  homeCardLayout?: Record<string, HomeCardLayout> // 工作台主页卡片布局（卡片 id → 列跨度/最小高度/排序）
  viewMode?: 'classic' | 'sidebar' // 导航站视图模式（经典网格 / 侧边栏导航；默认 'classic'，随 workbench 信封云同步）
  scrollbarMode?: 'auto' | 'ghost' | 'hidden' // 滚动条显示模式（auto = 浏览器默认；ghost = 隐形但保留槽位与拖动、悬停/聚焦显形；hidden = 常隐；默认 'auto'）
  navSortMode?: 'clicks' | 'custom' // 导航站排序方式：clicks = 点击频率自动置顶（默认）；custom = 以拖拽/新增顺序为准，点击只计数不改顺序
}

export function emptyAppSettingsData(): AppSettingsData {
  return { dialogSizes: {}, buttonOpacity: 1, bgOpacity: 1 }
}

// 工作台数据导出/导入格式
export const WORKBENCH_DATA_VERSION = 9

export interface WorkbenchData {
  version: number
  exportedAt: string
  todos: WorkbenchTodo[]
  notes: NoteData
  diary: DiaryData
  countdowns: Countdown[]
  passwords: string // 整库加密 blob 字符串（useCrypto 现有格式）
  health: HealthData
  // 记账多账本：与 business 同款升级——旧备份为扁平 LedgerData，新结构为账本容器 LedgerStoreData，
  // 由 normalizeLedgerStore() 在导入/加载时统一迁移（旧数据迁入「当前年账本」），二者在信封层兼容共存
  ledger: LedgerData | LedgerStoreData
  settings: AppSettingsData
  pomodoro?: unknown // v5 新增：番茄钟数据（后续 Todo 定义具体类型后收紧）
  habits?: unknown // v5 新增：习惯打卡数据（后续 Todo 定义具体类型后收紧）
  // v7 新增：摆摊进销存（v1-v6 导入补空、v7 原样透传）
  // v9 起业务侧升级为「账本容器」BusinessStoreData；旧备份仍是扁平 BusinessData，
  // 由 normalizeBusinessStore() 在导入时统一迁移为当年账本，二者在信封层兼容共存
  business?: BusinessData | BusinessStoreData
  passwordsSalt?: string // v8 新增：密码库 PBKDF2 盐 hex（内嵌自 localStorage password-salt-v2；与 passwordVerification 成对出现才有效）
  passwordVerification?: string // v8 新增：主密码验证串密文（内嵌自 localStorage password-verification-v2 原样）
  clientId?: string          // v9 新增：推送设备标识（首次同步时生成 uuid，存 localStorage）
  pushedAt?: number          // v9 新增：远端推送时间戳（ms）；idbExportAll 不主动输出此字段，仅云端往返携带
  prefs?: Record<string, string>  // v9 新增：localStorage 偏好打包（导航 + 主题 + 工作台偏好；不含图标、不含加密身份键）
  family: GenealogyData            // 家庭家谱（并入 workbench 阶层，明文同步，不加密）
}

// ==================== 家庭家谱（并入 workbench 阶层，不加密、明文同步） ====================

/** 家庭成员：成员为中心 + 最小边模型（仅挂 parents/spouses 两条边，子女/兄弟姐妹/祖孙全部运行时派生，不单独建关系表） */
export interface FamilyMember extends SyncStamp {
  id: string            // 'fm_' 前缀，uuid
  name: string          // 必填，≤50
  gender?: 'male' | 'female' | '' | null   // 可选，UI 提供「男/女/不详」
  birthDate?: string    // 'YYYY-MM-DD' 可选
  deathDate?: string    // 可选（在世可空）
  idCard?: string       // 身份证号（可选；18 位或 15 位，仅本地/自有云同步保存，用于推导性别与出生日期）
  phone?: string        // 可选
  note?: string         // 可选备注
  avatar?: string       // 头像 base64 data URL（上传后压缩存储，可选）
  parents: string[]     // 父/母 id（不区分亲生/继/养）
  spouses: string[]     // 配偶 id（UI 仅一对一，模型允许多）
  createdAt: string
  updatedAt: string
}

/** 家谱 · 取名记录（家谱模块第三个标签页，记录为子孙新取的名字及其寓意/出处/性别/日期） */
export interface FamilyNameRecord extends SyncStamp {
  /** id（'nm_' 前缀）由继承的 SyncStamp 提供 */
  name: string               // 名字，必填，≤50
  gender: 'male' | 'female' | ''  // 适用性别；'' = 通用/不限
  meaning?: string           // 寓意/出处，≤500（选填）
  namingDate?: string | null // 取名日期 'YYYY-MM-DD'；null = 未记日期（选填）
  memberId?: string | null   // 关联成员 FamilyMember.id；null = 未关联（选填）
  note?: string              // 备注，≤500（选填）
  createdAt: string          // ISO 时间戳
  updatedAt: string          // ISO 时间戳
}

/**
 * 参与云同步的条目统一具备的「墓碑 + Lamport 逻辑时钟」字段（全部可选，便于渐进接入）。
 * 见 docs/云同步-删除失效-问题分析与方案.md 与 composables/tombstoneCore.ts：
 *   - 删除 = 写 deletedAt 墓碑（保留记录），而非物理移除，否则会被并集合并当成"远端新增"复活；
 *   - ver 为 Lamport 逻辑时钟，任何变更（含删除）+1，用于多端取新；
 *   - 全部可选：老数据无这些字段时降级为「未删除 + ver=0」，比较回落到 updatedAt。
 */
export interface SyncStamp {
  id: string
  updatedAt?: string
  createdAt?: string
  /** Lamport 逻辑时钟：任何变更（含删除）递增；缺省 0 */
  ver?: number
  /** 产生该版本的客户端 id（版本完全相同时的稳定 tie-break） */
  clientId?: string
  /** 墓碑：非空 = 已删除；undefined/null = 未删除 */
  deletedAt?: string | null
}

/** 家谱数据集（IDB store 'family' 单对象；随 workbench.json 明文同步） */
export interface GenealogyData {
  members: FamilyMember[]
  rootId: string | null  // 主根（标记家族起点；可空 → 未标记时树视图显示森林/提示选主根）
  /** 取名记录（家谱模块「取名记录」标签页数据；与成员同库同步，独立信封导入导出） */
  names: FamilyNameRecord[]
}

// ==================== 健康管理 ====================

export type HealthModule = 'exercise' | 'diet' | 'sleep' | 'weight'

// 健康管理面板 tab 键（WorkbenchHealth 容器 + 导航白名单共用单一来源）
export const HEALTH_TABS = ['exercise', 'diet', 'sleep', 'weight'] as const

export const EXERCISE_TYPES = ['跑步', '游泳', '力量', '骑行', '瑜伽', '其他'] as const

export const MEAL_TYPES = ['早餐', '午餐', '晚餐', '加餐'] as const

export type MealType = (typeof MEAL_TYPES)[number]

export type HealthPlanMetric = 'times' | 'minutes' | 'calories' | 'duration'

export type HealthPlanPeriod = 'daily' | 'weekly'

export interface HealthPlan {
  module: 'exercise' | 'diet' | 'sleep'
  metric: HealthPlanMetric
  period: HealthPlanPeriod
  target: number
  updatedAt: string
}

export interface ExerciseRecord {
  id: string
  module: 'exercise'
  date: string
  exerciseType: string
  duration: number
  calories: number
  distanceKm?: number
  note?: string
  createdAt: string
  updatedAt: string
}

export interface DietRecord {
  id: string
  module: 'diet'
  date: string
  mealType: MealType
  content: string
  calories: number
  note?: string
  createdAt: string
  updatedAt: string
}

export interface SleepRecord {
  id: string
  module: 'sleep'
  date: string
  sleepTime: string
  wakeTime: string
  durationHours: number
  quality: number
  note?: string
  createdAt: string
  updatedAt: string
}

export interface WeightRecord {
  id: string
  module: 'weight'
  date: string
  weightKg: number
  note?: string
  createdAt: string
  updatedAt: string
}

/** 身高记录（学生工作台「健康管理」第 5 个标签页专属；成年端健康管理不使用） */
export interface HeightRecord {
  id: string
  module: 'height'
  date: string
  heightCm: number
  note?: string
  createdAt: string
  updatedAt: string
}

export type HealthRecord = ExerciseRecord | DietRecord | SleepRecord | WeightRecord

/** 学生健康管理记录联合（成人 4 模块 + 身高） */
export type StudentHealthRecord = HealthRecord | HeightRecord

/** 学生健康管理模块键（health store records 的子键集合） */
export type StudentHealthModule = HealthModule | 'height'

/** 学生健康管理 Tabs 键（顺序即渲染顺序：成人 4 项 + 身高） */
export const STUDENT_HEALTH_TABS = ['exercise', 'diet', 'sleep', 'weight', 'height'] as const

/** 学生健康数据形状：与 HealthData 同源，records 额外含 height（严格隔离于成人 'health' store） */
export interface StudentHealthData {
  height?: number
  plans: HealthPlans
  records: {
    exercise: ExerciseRecord[]
    diet: DietRecord[]
    sleep: SleepRecord[]
    weight: WeightRecord[]
    height: HeightRecord[]
  }
}

export interface HealthPlans {
  exercise?: HealthPlan
  diet?: HealthPlan
  sleep?: HealthPlan
}

export interface HealthData {
  height?: number
  plans: HealthPlans
  records: {
    exercise: ExerciseRecord[]
    diet: DietRecord[]
    sleep: SleepRecord[]
    weight: WeightRecord[]
  }
  /** 周计划（运动/饮食）：键 = 该周周一日期 'YYYY-MM-DD'。整体按 plansUpdatedAt LWW 同步。 */
  weeklyPlans?: HealthWeeklyPlans
  /** weeklyPlans 最后一次修改时间（合并时整体取较新一侧的依据） */
  plansUpdatedAt?: string
}

/** 周计划条目：运动（value=强度、done=已完成）与饮食（value=展示、kcal=求和用）共用同一形态 */
export interface HealthWeeklyPlanItem {
  id: string
  day: number              // 1=周一 … 7=周日
  rowKey: string           // 运动行：morning/evening；饮食行：breakfast/lunch/dinner
  name: string
  value?: string           // 展示文本：'45 min' / '380 kcal'
  kcal?: number            // 饮食专用：热量数值（全天合计按此求和）
  done?: boolean           // 运动专用：已完成
}

export interface HealthWeeklyPlanWeek {
  exercise: HealthWeeklyPlanItem[]
  diet: HealthWeeklyPlanItem[]
  updatedAt: string
}

export type HealthWeeklyPlans = Record<string, HealthWeeklyPlanWeek>

// ==================== 记账本 ====================

export interface LedgerCategory {
  id: string
  name: string
  type: 'income' | 'expense'
  isBuiltIn: boolean
}

// 预定义记账分类（不可删除）
export const DEFAULT_LEDGER_CATEGORIES: LedgerCategory[] = [
  { id: 'salary', name: '工资', type: 'income', isBuiltIn: true },
  { id: 'mortgage', name: '房贷', type: 'expense', isBuiltIn: true },
  { id: 'carloan', name: '车贷', type: 'expense', isBuiltIn: true },
  { id: 'breakfast', name: '早餐', type: 'expense', isBuiltIn: true },
  { id: 'lunch', name: '午餐', type: 'expense', isBuiltIn: true },
  { id: 'dinner', name: '晚餐', type: 'expense', isBuiltIn: true },
  { id: 'commute', name: '通勤', type: 'expense', isBuiltIn: true },
  { id: 'daily', name: '日常', type: 'expense', isBuiltIn: true }
]

export interface LedgerEntry extends SyncStamp {
  id: string
  date: string
  categoryId: string
  amount: number
  note?: string
  createdAt: string
  updatedAt: string
}

export interface LedgerData {
  categories: LedgerCategory[]
  entries: LedgerEntry[]
}

// ==================== 记账多账本（按自然年，同一年可多本） ====================

/**
 * 单个记账账本（最外层数据容器）：
 * - 归属一个**自然年**（year），一本账本只记录该年份的数据；
 * - 同一年允许存在多本，靠**年内序号 seq**（从 1 起，唯一）区分，编号读作 `YYYY-NN`；
 * - 数据（分类 + 流水）挂在 data 下，账本之间**完全隔离**，切换账本即整体切换数据集。
 */
export interface PersonalLedger {
  id: string
  /** 账本归属的自然年 */
  year: number
  /** 同一年内的序号（从 1 起，唯一）；与 year 一起构成可读编号 `YYYY-NN` */
  seq: number
  /** 用户可见名称（可改；留空时用默认名 `YYYY年账本` / `YYYY年账本（NN）`） */
  name: string
  /** 该账本的全部数据：分类 + 流水 */
  data: LedgerData
  createdAt: string
  updatedAt: string
}

/** 记账多账本容器（IndexedDB store 'ledger' 的存储结构）；旧版单账本扁平结构会自动迁入「当前年账本」 */
export interface LedgerStoreData {
  schemaVer: number
  ledgers: PersonalLedger[]
  currentLedgerId: string
}

// ==================== 摆摊进销存（销售记账，备份 v7 新增） ====================

/** 支出产品（原「支出分类」改名）：内置 5（isBuiltIn 不可删）+ 自定义；visible 控制支出 Tab 栏显示；unit/unitPrice 为产品默认单位与单价，新增支出选该产品时自动回填 */
export interface BusinessExpenseCategory {
  id: string // bec_ 前缀；内置 id 目前仅 expense-stall（gas/seasoning/transport/other 已下线，见 businessCore.RETIRED_EXPENSE_CATEGORY_IDS）
  name: string
  sortOrder: number
  visible: boolean
  isBuiltIn: boolean
  /** 单位（如「件」「包」「根」）；可选，新增支出选该产品时自动回填到支出单位 */
  unit?: string
  /** 单价（元）；可选，新增支出选该产品时自动回填到支出单价（金额 = 数量 × 单价） */
  unitPrice?: number
  /** 商品数量（一件/一份内所含个数）；可选，用于由「单价 ÷ 商品数量」推算商品单价；旧数据缺省为 undefined */
  productQuantity?: number
  /** 关联商品（bp_ 前缀，指向 BusinessProduct.id）；可选，用于将支出产品与具体商品绑定（如库存关联支出时选择关联到某商品）；旧数据缺省为 undefined */
  productId?: string
}

/** 商品分类：内置 5 种子可删（删除后商品归未分类）；visible 控制商品页标签页显示 */
export interface BusinessProductCategory {
  id: string // bpc_ 前缀；内置 id 固定 product-snack/drink/fruit/daily/clothing
  name: string
  sortOrder: number
  visible: boolean
}

/** 商品 */
export interface BusinessProduct {
  id: string // bp_ 前缀
  name: string
  categoryId?: string // undefined = 未分类
  unit: string
  purchasePrice: number // 进货单价
  sellingPrice: number // 售价
  /** 会员价（可选；仅作记录与展示，不参与营业额自动合计）。0/undefined/null = 未设置 */
  memberPrice?: number | null
  active: boolean // 在售/停售（停售不出现在销售带出选择）
  createdAt: string
}

/** 进货记录 */
export interface BusinessPurchase {
  id: string // bpr_ 前缀
  productId: string
  quantity: number
  unitPrice: number
  total: number // quantity × unitPrice；关联了支出时 = 已关联支出金额之和
  date: string // YYYY-MM-DD
  /** 关联的支出记录 id（进货优化：一笔进货可同时关联多条支出，合计金额自动汇总） */
  expenseIds?: string[]
  note?: string
  createdAt: string
}

/** 销售日记录条目：sold = broughtOut - remaining - loss（core 计算，不存储） */
export interface DailyRecordItem {
  productId: string
  broughtOut: number
  remaining: number
  loss: number
}

/** 销售日记录：date 唯一（upsert 语义）；totalRevenue 由 core 按 items×售价 算好落库 */
export interface BusinessDailyRecord {
  id: string // bd_ 前缀
  date: string // YYYY-MM-DD 本地日期
  items: DailyRecordItem[]
  totalRevenue: number
  transactionCount?: number // 当日交易笔数（顾客买单次数）；新增字段，旧数据缺省按 0 处理
  note?: string
  createdAt: string
  updatedAt: string
}

/**
 * 支出明细行（一天一笔支出中的「一件产品」）。
 * 与销售 BusinessDailyRecord.items 对应：日期挂在日容器 BusinessExpenseDaily 上，明细本身无 date。
 * id 即唯一标识，亦作为库存关联 purchase.expenseIds 的指向（精确到「某天的某产品」）。
 */
export interface BusinessExpense {
  id: string // be_ 前缀
  categoryId: string
  amount: number
  /** 简短标题（可选，≤20 字；缺省按分类名补齐） */
  title?: string
  note?: string
  /** 数量（与 unitPrice 相乘得 amount）；新增字段，旧数据缺省为 undefined */
  quantity?: number
  /** 单价（与 quantity 相乘得 amount）；新增字段，旧数据缺省为 undefined */
  unitPrice?: number
  /** 单位（如「件」「包」「根」）；下拉预设可选，也支持自定义；可选，旧数据缺省为空 */
  unit?: string
  /** 订货电话；可选，旧数据缺省为空 */
  orderPhone?: string
  /** 订货地址；可选，旧数据缺省为空 */
  orderAddress?: string
  /** 业务员信息；可选，旧数据缺省为空 */
  salesman?: string
  /** 支付方式（现金/微信/支付宝/银行卡/其他，或自定义）；可选，旧数据缺省为空 */
  paymentMethod?: string
}

/** 支出日记账：一天一笔支出，含多件产品明细（与销售 BusinessDailyRecord 同构） */
export interface BusinessExpenseDaily {
  id: string // bed_ 前缀
  date: string // YYYY-MM-DD 本地日期
  items: BusinessExpense[]
  note?: string
  createdAt: string
  updatedAt: string
}

/** 销售记账设置 */
export interface BusinessSettings {
  stallName: string // 摊位名称（仅展示）
  lowStockThreshold: number // 低库存预警阈值，默认 20
  monthlyRevenueTarget: number // 本月营业额目标（0 = 未设定，不显示进度环）
  /** 滞销预警：在售商品超过该天数没有售出即预警，默认 30 */
  slowMovingDays?: number
  /** 久存（临期）批次预警：进货批次入库超过该天数仍未售完即预警，默认 60 */
  agingBatchDays?: number
}

/** 销售记账数据（单个账本内的业务数据；IndexedDB store 'business' 的账本 data 字段） */
export interface BusinessData {
  productCategories: BusinessProductCategory[]
  expenseCategories: BusinessExpenseCategory[]
  products: BusinessProduct[]
  purchases: BusinessPurchase[]
  dailyRecords: BusinessDailyRecord[]
  expenseDailies: BusinessExpenseDaily[]
  settings: BusinessSettings
}

/**
 * 账本：销售记账的最外层数据容器，按自然年创建，同一年份可创建多个账本。
 * 每个账本在所属年份内分配唯一序号 seq（从 1 开始），与 year 一起构成可读的账本编号「YYYY-NN」（如 2026-02）。
 * 所有业务数据（商品 / 进货 / 销售 / 支出 / 分类 / 设置）都挂在 data 下，以账本 id 隔离；
 * 且只允许记录该账本所属年份的数据（跨年写入会被拦截），不同年份的数据不会混入同一账本。
 */
export interface BusinessLedger {
  id: string
  year: number // 自然年，如 2026
  /** 年内序号（从 1 开始，同一年份内唯一）；与 year 构成账本编号 YYYY-NN */
  seq: number
  name: string // 账本名称，默认「YYYY年账本」（同年第 2 本起为「YYYY年账本（02）」）
  createdAt: string // ISO 字符串
  updatedAt: string // ISO 字符串
  data: BusinessData
}

/** 销售记账在 IndexedDB 中的存储结构（store 'business'，键 'items'） */
export interface BusinessStoreData {
  schemaVer: number
  ledgers: BusinessLedger[]
  /** 当前选中的账本（刷新后记住上次选择）；为空表示尚无账本 */
  currentLedgerId: string
}

/**
 * 内置支出分类（不可删，可改名/排序/标签页显隐）
 * ⚠️ 2026-10-09 用户要求：内置只保留「摊位费」，其余（燃气费/调料包装/交通费/其他）已下线。
 * 下线 id 见 businessCore.RETIRED_EXPENSE_CATEGORY_IDS —— 存量数据由
 * normalizeExpenseCategories 清理（未被支出引用的直接删，被保留引用的降级为自定义可删），
 * **不要**再把它们加回来。
 */
export const DEFAULT_BUSINESS_EXPENSE_CATEGORIES: BusinessExpenseCategory[] = [
  { id: 'expense-stall', name: '摊位费', sortOrder: 1, visible: true, isBuiltIn: true }
]

/** 内置商品分类（种子可删：删除后该分类商品归未分类） */
export const DEFAULT_BUSINESS_PRODUCT_CATEGORIES: BusinessProductCategory[] = [
  { id: 'product-snack', name: '小吃', sortOrder: 1, visible: true },
  { id: 'product-drink', name: '饮品', sortOrder: 2, visible: true },
  { id: 'product-fruit', name: '水果', sortOrder: 3, visible: true },
  { id: 'product-daily', name: '日用品', sortOrder: 4, visible: true },
  { id: 'product-clothing', name: '服饰', sortOrder: 5, visible: true }
]

// ==================== 学生工作台 ====================

/** 学段：K=幼儿园 / P=小学 / J=初中 / H=高中 / U=大学 */
export type StudentStage = 'K' | 'P' | 'J' | 'H' | 'U'

/** 教育经历条目 */
export interface EducationEntry {
  id: string
  schoolName: string
  degree: string
  major?: string
  startDate: string
  endDate?: string
  isActive: boolean
  classTeacher?: string
  courseTeacher?: string
  phone?: string
  note?: string
  createdAt: string
  updatedAt: string
}

/** 教育经历数据（IDB store 'student_education' 单对象 { entries }） */
export interface EducationData {
  entries: EducationEntry[]
}

/** 学历/学段选项（教育经历下拉） */
export const DEGREE_OPTIONS = ['幼儿园', '小学', '初中', '高中', '中职', '专科', '本科', '硕士', '博士'] as const
export type EducationDegree = typeof DEGREE_OPTIONS[number]

/** 学生工作台菜单键集合（16 项；home 恒居首位，开关锁定不可关） */
export const STUDENT_MENU_KEYS: readonly string[] = [
  'home',
  'habits',
  'homework',
  'timetable',
  'plan',
  'review',
  'mistakes',
  'reading',
  'exam',
  'grades',
  'goal',
  'education',
  'health',
  'achievements',
  'rewards',
  'parent'
]

/** 默认菜单顺序（home 首位，与键集合一致） */
export const STUDENT_MENU_DEFAULT_ORDER: readonly string[] = [...STUDENT_MENU_KEYS]

/** 学生菜单默认名称（逐字一致，load-bearing） */
export const STUDENT_MENU_DEFAULT_LABELS: Record<string, string> = {
  home: '主页',
  habits: '习惯打卡',
  homework: '作业管理',
  timetable: '课程表',
  plan: '学习计划',
  review: '复习计划',
  mistakes: '错题本',
  reading: '阅读记录',
  exam: '考试倒计时',
  grades: '成绩记录',
  goal: '学习目标',
  education: '教育经历',
  health: '健康管理',
  achievements: '成就勋章',
  rewards: '奖励积分',
  parent: '家长协同'
}

/** 学生菜单图标映射（Icon.vue 查表键名） */
export const STUDENT_MENU_ICONS: Record<string, string> = {
  home: 'home',
  habits: 'habits',
  homework: 'todos',
  timetable: 'countdowns',
  plan: 'notes',
  review: 'diary',
  mistakes: 'passwords',
  reading: 'notes',
  exam: 'countdowns',
  grades: 'ledger',
  goal: 'target',
  education: 'diary',
  health: 'health',
  achievements: 'habits',
  rewards: 'ledger',
  parent: 'health'
}

/** 学段-菜单可见性矩阵：true=默认显示 / false=默认隐藏（用户可在设置内单独开启） */
export const STAGE_MENU_VISIBILITY: Record<StudentStage, Record<string, boolean>> = {
  K: {
    home: true, habits: true, homework: true, timetable: true, plan: false,
    review: false, mistakes: false, reading: true, exam: false, education: true,
    health: true, achievements: true, rewards: true, parent: true,
    grades: false, goal: false
  },
  P: {
    home: true, habits: true, homework: true, timetable: true, plan: false,
    review: false, mistakes: false, reading: true, exam: false, education: true,
    health: true, achievements: true, rewards: true, parent: true,
    grades: true, goal: false
  },
  J: {
    home: true, habits: false, homework: true, timetable: true, plan: true,
    review: true, mistakes: true, reading: true, exam: true, education: true,
    health: true, achievements: false, rewards: false, parent: false,
    grades: true, goal: false
  },
  H: {
    home: true, habits: false, homework: true, timetable: true, plan: true,
    review: true, mistakes: true, reading: true, exam: true, education: true,
    health: true, achievements: false, rewards: false, parent: false,
    grades: true, goal: false
  },
  U: {
    home: true, habits: false, homework: false, timetable: true, plan: true,
    review: true, mistakes: false, reading: true, exam: true, education: true,
    health: true, achievements: false, rewards: false, parent: false,
    grades: true, goal: false
  }
}

/** 学段默认学科清单（K 6 项幼儿活动 / 小学 3 科 / 初中·高中 9 科 / 大学 3 类） */
export const STAGE_DEFAULT_SUBJECTS: Record<StudentStage, string[]> = {
  K: ['游戏活动', '绘本阅读', '手工', '音乐', '户外', '午睡'],
  P: ['语文', '数学', '英语'],
  J: ['语文', '数学', '英语', '政治', '历史', '地理', '生物', '物理', '化学'],
  H: ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'],
  U: ['专业课', '公共课', '选修课']
}

/** 学段默认习惯种子（K 7 项 / P 6 项 / J 5 项） */
export const STAGE_DEFAULT_HABITS: Record<StudentStage, { name: string; category: string }[]> = {
  K: [
    { name: '刷牙', category: 'life' },
    { name: '洗脸', category: 'life' },
    { name: '收拾玩具', category: 'life' },
    { name: '阅读绘本', category: 'study' },
    { name: '早睡早起', category: 'life' },
    { name: '运动', category: 'exercise' },
    { name: '家务', category: 'life' }
  ],
  P: [
    { name: '写作业', category: 'study' },
    { name: '复习', category: 'study' },
    { name: '阅读', category: 'study' },
    { name: '运动', category: 'exercise' },
    { name: '家务', category: 'life' },
    { name: '早睡早起', category: 'life' }
  ],
  J: [
    { name: '自主学习', category: 'study' },
    { name: '复习错题', category: 'study' },
    { name: '运动', category: 'exercise' },
    { name: '阅读', category: 'study' },
    { name: '早睡', category: 'life' }
  ],
  H: [
    { name: '自主学习', category: 'study' },
    { name: '复习错题', category: 'study' },
    { name: '运动', category: 'exercise' },
    { name: '阅读', category: 'study' },
    { name: '早睡', category: 'life' }
  ],
  U: [
    { name: '自主学习', category: 'study' },
    { name: '阅读', category: 'study' },
    { name: '运动', category: 'exercise' },
    { name: '早睡', category: 'life' }
  ]
}

/** 学段徽标配置 */
export const STAGE_BADGE: Record<StudentStage, { label: string; color: string }> = {
  K: { label: 'K', color: '#f59e0b' },
  P: { label: 'P', color: '#3b82f6' },
  J: { label: 'J', color: '#a855f7' },
  H: { label: 'H', color: '#ef4444' },
  U: { label: 'U', color: '#10b981' }
}

/** 学生工作台设置（IDB store 'student_settings' 单对象） */
export interface StudentSettings {
  stage: StudentStage          // 当前学段
  nickname?: string            // 学生昵称（1-12 code point；缺失回退「同学」）
  studentNo?: string           // 学号（选填）
  school?: string              // 学校名（选填）
  grade?: string               // 年级（选填；取值见 GRADE_STAGE_GROUPS 中对应学段的 grades）
  className?: string          // 班级名称（选填，自由填写，如「3 年级 2 班」）
  birthday?: string            // 出生日期 YYYY-MM-DD（选填；主页顶部据此计算年龄）
  /** 菜单顺序（home 恒 index 0；归一化保证恒 15 项） */
  menuOrder?: string[]
  /** 菜单改名（key → 自定义名） */
  menuLabels?: Record<string, string>
  /** 菜单可见性（key → 显示开关；缺失=显示） */
  menuVisibility?: Record<string, boolean>
  /** 学段默认值播种标记：值 !== stage 时触发默认学科/习惯播种 */
  stageSeeded?: StudentStage
  /** 学科清单（自定义增删；学段切换自动播种默认学科） */
  subjects?: string[]
  /** 家长 PIN（PBKDF2 派生密钥 hex；K/P 段使用，J 段隐藏家长入口） */
  parentPinSalt?: string
  parentPinVerification?: string
  /** 家长模式锁定截止时间戳（PIN 连续输错 5 次后 5 分钟锁定） */
  parentLockedUntil?: number
  /** 连续 PIN 输错次数（验证成功或锁定到期后清零） */
  parentPinFailedAttempts?: number
}

/** 学生设置空数据工厂 */
export function emptyStudentSettings(): StudentSettings {
  return { stage: 'P' }
}

/** 学生工作台数据导出/导入格式（独立信封，与 WorkbenchData 隔离） */
export const STUDENT_DATA_VERSION = 1

export interface StudentBackupData {
  type: 'student-backup'
  version: number
  exportedAt: string
  stage: StudentStage
  studentSettings: StudentSettings
  // M2-M4 各模块数据（强类型，归一化后读写）
  homework?: StudentHomeworkData
  timetable?: StudentTimetableData
  plans?: StudentPlanData
  review?: StudentReviewData
  mistakes?: StudentMistakesData
  reading?: StudentReadingData
  achievements?: StudentAchievementsData
  rewards?: StudentRewardsData
  goals?: StudentGoalData,
  // 共享 store 独立副本（严格隔离）
  studentHabits?: StudentHabitsData
  studentCountdowns?: { countdowns: Countdown[]; customCategories?: string[]; sortRule?: string }
  clientId?: string
  pushedAt?: number
  prefs?: Record<string, string>
}

// ==================== 学生模块数据接口（M2-M4） ====================

/** 习惯内置分类：life/study/exercise；用户可增删自定义（string 类型） */
export const STUDENT_HABIT_BUILTIN_CATEGORIES = ['life', 'study', 'exercise'] as const
export type StudentHabitCategory = string

/** 学生习惯：扩展成人 Habit 加 category 字段（学段默认播种用） */
export interface StudentHabit {
  id: string               // 前缀 shb_
  name: string             // 1-15 code point，同分类内唯一
  category: StudentHabitCategory  // life/study/exercise/自定义；空串=未分类
  frequency: number        // 每周目标打卡次数 1-7
  color?: string
  createdAt: string
}

/** 学生习惯打卡记录（与成人 HabitRecord 同构，前缀 shr_） */
export interface StudentHabitRecord {
  id: string
  habitId: string
  date: string             // 'YYYY-MM-DD' 本地日期
  parentMarked?: boolean   // 家长代打卡标记
  /** 本次打卡积分（0-100 整数；缺省/非法回退 DEFAULT_HABIT_POINTS = POINTS_HABIT = 5） */
  points?: number
  createdAt: string
}

/** 学生习惯数据模型（双数组，IDB store 'student_habits'） */
export interface StudentHabitsData {
  habits: StudentHabit[]
  records: StudentHabitRecord[]
}

/** 作业状态：pending 待办 / doing 进行中 / done 已完成 / overdue 逾期 */
export type StudentHomeworkStatus = 'pending' | 'doing' | 'done' | 'overdue'

/** 作业优先级 */
export type StudentHomeworkPriority = 'low' | 'normal' | 'high'

/** 学生作业（IDB store 'student_homework'，数组，前缀 hw_） */
export interface StudentHomework {
  id: string
  subject: string          // 学科，来自 student_settings.subjects
  title: string            // 1-50 字符，必填
  content?: string         // 详细描述
  images?: string[]        // 作业附件图片（base64 dataURL，最多 6 张）
  dueDate: string          // 'YYYY-MM-DD' 本地日期，必填
  status: StudentHomeworkStatus
  priority: StudentHomeworkPriority
  source?: 'self' | 'parent'  // 来源标记（家长代为新增）
  completedAt?: string
  createdAt: string
  updatedAt: string
}

/** 学生作业数据（数组模型，IDB 单对象 { entries }） */
export interface StudentHomeworkData {
  entries: StudentHomework[]
}

/** 课程表单节课（IDB store 'student_timetable' 单对象 schedule 字典） */
export interface StudentTimetableCell {
  subject: string          // 学科
  teacher?: string        // 1-20 字符
  room?: string           // 1-20 字符
  startHHMM: string       // 'HH:MM'（由节次时间配置推算后写入，非用户逐节填写）
  endHHMM: string         // 'HH:MM'，> startHHMM
  /** 起始周次（可选；缺省 1，由 Excel 导入写入，展示层暂不使用） */
  startWeek?: number
  /** 结束周次（可选；缺省 = 总学周数，由 Excel 导入写入，展示层暂不使用） */
  endWeek?: number
}

/** 课程表 schedule：key = `${dayOfWeek}_${period}`（1-7_1-12） */
export type StudentTimetableSchedule = Record<string, StudentTimetableCell>

/**
 * 课程表节次时间配置。
 * 只需设置「第一节开始时间 + 单节课时长 + 课间休息时长」，
 * 后续各节起止时间由 studentTimetableCore.computePeriodTime 统一推算。
 */
export interface StudentTimetableTiming {
  firstStart: string       // 上午第一节开始时间 'HH:MM'
  afternoonStart: string   // 下午第一节开始时间 'HH:MM'（下午各节由此独立起算，不与上午连排）
  lessonMinutes: number    // 单节课时长（分钟）
  breakMinutes: number     // 课间休息时长（分钟）
  morningPeriods: number   // 上午节数（第 1~N 节为上午，其余为下午）
}

/** 学生课程表数据（IDB store 'student_timetable'，单对象） */
export interface StudentTimetableData {
  version: number
  weeks: number           // 学周数
  periodsPerDay: number   // 每日节数 1-12
  classroom?: string      // 学生所在教室/班级（全局，非按课）
  /** 节次时间配置（缺省回落默认：08:00 开始 / 45 分钟 / 休息 10 分钟 / 上午 4 节） */
  timing?: StudentTimetableTiming
  schedule: StudentTimetableSchedule
}

/** 学生计划类型 */
export type StudentPlanType = 'weekly' | 'monthly' | 'term'

/** 计划目标（含进度 0-100） */
export interface StudentPlanGoal {
  id: string              // 前缀 pg_
  content: string         // 1-100 字符
  progress: number        // 0-100 整数，递增不递减
  done: boolean
}

/** 学生计划（IDB store 'student_plans'，数组，前缀 pl_） */
export interface StudentPlan {
  id: string
  type: StudentPlanType
  title: string           // 1-50 字符
  startDate: string      // 'YYYY-MM-DD'
  endDate: string        // 'YYYY-MM-DD'，> startDate
  goals: StudentPlanGoal[]
  review?: string         // 复盘 Markdown，最长 5000 字符
  createdAt: string
  updatedAt: string
}

export interface StudentPlanData {
  entries: StudentPlan[]
}

/** 艾宾浩斯复习阶段间隔（天）：1/2/4/7/15/30 */
export const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30] as const
export const REVIEW_MAX_STAGE = REVIEW_INTERVALS.length

/** 学生复习条目（IDB store 'student_review'，数组，前缀 rv_） */
export interface StudentReviewItem {
  id: string
  subject: string
  knowledge: string       // 1-200 字符
  source?: string         // 来源：教材 P45 / 错题本 等
  learnDate: string       // 初学日期 'YYYY-MM-DD'，≤ today
  stage: number           // 1-6，递增
  nextReviewDate: string  // 自动计算
  mastered: boolean
  createdAt: string
  updatedAt: string
}

export interface StudentReviewData {
  entries: StudentReviewItem[]
}

/** 学习目标类型（结果导向：量化指标 + 截止日期 + 状态） */
export type StudentGoalType = 'score' | 'count' | 'days' | 'custom'

/** 目标状态：active=进行中 / completed=已完成 / abandoned=已放弃（overdue 为渲染时派生，不入库） */
export type StudentGoalStatus = 'active' | 'completed' | 'abandoned'

/** 学生学习目标（IDB store 'student_goals'，数组，前缀 gl_） */
export interface StudentGoal {
  id: string                // 前缀 gl_
  name: string              // 1-50 字符
  subject: string           // 学科（自由文本，缺省 '其他'）
  goalType: StudentGoalType // 分数/数量/天数/自定义
  targetValue: number       // 目标值，>= 0
  currentValue: number      // 当前值，>= 0
  unit: string              // 单位，<= 10 字符，如 分/个/天
  deadline?: string         // 截止日期 'YYYY-MM-DD'（可选）
  note?: string             // 备注，<= 200 字符
  status: StudentGoalStatus // 仅存 active/completed/abandoned
  createdAt: string
  updatedAt: string
}

export interface StudentGoalData {
  entries: StudentGoal[]
}

/** 错题状态 */
export type StudentMistakeStatus = 'new' | 'reviewing' | 'mastered'

/** 学生错题（IDB store 'student_mistakes'，数组，前缀 mk_） */
export interface StudentMistake {
  id: string
  subject: string
  title?: string          // 题目标题
  question: string        // Markdown 题干，必填（或图片必填）
  answer: string          // Markdown 正确答案
  analysis?: string       // Markdown 解析
  tags: string[]          // 0-10 个，每个 1-20 字符
  imageIds: string[]      // 关联 student_images store 的 Blob id
  status: StudentMistakeStatus
  linkedReviewId?: string  // 关联 student_review 条目 id
  createdAt: string
  updatedAt: string
}

export interface StudentMistakesData {
  entries: StudentMistake[]
}

/** 学生阅读记录（IDB store 'student_reading'，数组，前缀 rd_） */
export interface StudentReadingEntry {
  id: string
  bookTitle: string      // 1-50 字符
  pages: number          // 1-999
  durationMin: number    // 1-480 分钟
  impression?: string    // Markdown 感悟，最长 2000 字符
  date: string           // 'YYYY-MM-DD'，≤ today
  parentSigned?: boolean // 家长签字标记（K 段强制 / P 1-3 年级可选）
  signedAt?: string
  createdAt: string
  updatedAt: string
}

export interface StudentReadingData {
  entries: StudentReadingEntry[]
}

/** 勋章分类 */
export type StudentAchievementCategory = 'habit' | 'study' | 'reading'

/** 勋章定义（内置 10 枚，不可编辑） */
export interface StudentAchievementDef {
  id: string              // streak-7/streak-30/.../hw-rate-95
  name: string
  description: string
  emoji: string
  category: StudentAchievementCategory
  /** 进度计算函数标识（store 监听时按 id 路由） */
  metric: string
  target: number
}

/** 学生成就数据（IDB store 'student_achievements'，单对象） */
export interface StudentAchievementsData {
  definitions: StudentAchievementDef[]
  unlocked: Record<string, string>  // id → 解锁时间 ISO
}

/** 奖励项（家长配置） */
export interface StudentRewardItem {
  id: string              // 前缀 rw_
  name: string            // 1-30 字符，唯一
  cost: number            // 1-9999 正整数
  stock?: number          // 0=售罄
  /** 背景图（base64 dataURL，随 student.json 走云同步；仅放行安全位图格式，禁 svg） */
  backgroundImage?: string
}

/** 奖励交易记录 */
export interface StudentRewardTxn {
  id: string              // 前缀 rt_
  type: 'earn' | 'redeem'
  points: number          // earn + / redeem -
  reason: string
  rewardId?: string
  /** autoEarn 幂等去重标识（如 habit:${habitId}:${date}）；手动加分不传 */
  sourceId?: string
  createdAt: string
}

/** 学生奖励数据（IDB store 'student_rewards'，单对象） */
export interface StudentRewardsData {
  totalPoints: number
  history: StudentRewardTxn[]
  rewards: StudentRewardItem[]
}

/** 家长每日任务项（家长协同模式下配置） */
export interface StudentParentTask {
  id: string              // 前缀 pt_
  title: string
  date: string            // 'YYYY-MM-DD'
  done: boolean
  source: 'parent'
}

/** 家长任务数据（IDB store 'student_parent_tasks'，单对象） */
export interface StudentParentTasksData {
  tasks: StudentParentTask[]
}

// ==================== 学生成绩记录 ====================

/** 成绩考试类型（录入下拉预设；用户可自由输入自定义类型） */
export const GRADE_EXAM_TYPES: readonly string[] = ['期中', '期末', '月考', '单元测试', '随堂测验']

/** 考试名称录入预设（下拉候选项；用户可自由输入自定义名称） */
export const EXAM_NAME_PRESETS: readonly string[] = [
  '第一次月考', '第二次月考', '第三次月考',
  '期中考试', '期末考试',
  '单元测试一', '单元测试二', '单元测试三',
  '一模', '二模', '三模', '模拟考',
  '随堂测验一', '随堂测验二'
]

/** 年级分类（标签页顺序）：幼儿园小班/中班/大班 → 小学一年级~六年级 → 初中初一~初三 → 高中高一~高三 → 大学大一~大四 */
export const STUDENT_GRADE_LEVELS: readonly string[] = [
  '小班', '中班', '大班',
  '一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
  '初一', '初二', '初三',
  '高一', '高二', '高三',
  '大一', '大二', '大三', '大四'
]

/** 「全部年级」总览标签（activeLevel 取此值表示不限年级，空串） */
export const GRADE_LEVEL_ALL = ''

/**
 * 成绩年级所属学段分组（仅用于成绩记录 tabs 分组展示，独立于全局 StudentStage 体系）。
 * key 仅作分组标识，不进入 StudentStage 枚举；grades 取自 STUDENT_GRADE_LEVELS 的子集。
 */
export interface GradeStageGroup {
  /** 分组标识：K=幼儿园 / P=小学 / J=初中 / H=高中 / U=大学 */
  key: string
  /** 分组显示名 */
  label: string
  /** 该学段下的年级列表（顺序即 tabs 顺序） */
  grades: string[]
}

/** 成绩记录 tabs 的学段分组（与 STUDENT_GRADE_LEVELS 对应） */
export const GRADE_STAGE_GROUPS: readonly GradeStageGroup[] = [
  { key: 'K', label: '幼儿园', grades: ['小班', '中班', '大班'] },
  { key: 'P', label: '小学', grades: ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'] },
  { key: 'J', label: '初中', grades: ['初一', '初二', '初三'] },
  { key: 'H', label: '高中', grades: ['高一', '高二', '高三'] },
  { key: 'U', label: '大学', grades: ['大一', '大二', '大三', '大四'] }
]

/** 单条成绩（某次考试中某一科目的分数） */
export interface StudentGradeSubject {
  /** 学科名（对齐 settings.subjects） */
  subject: string
  /** 得分 */
  score: number
  /** 满分，缺省 100 */
  fullScore?: number
}

/** 一次考试的成绩记录（含多科目分数） */
export interface StudentGradeRecord {
  id: string
  /** 考试名称，如「2026春季期中考试」 */
  examName: string
  /** 考试类型：GRADE_EXAM_TYPES 之一或自定义 */
  examType: string
  /** 年级分类：STUDENT_GRADE_LEVELS 之一，'' 表示未分类/全部 */
  grade: string
  /** 考试日期 'YYYY-MM-DD' */
  date: string
  subjects: StudentGradeSubject[]
  createdAt: string
  updatedAt: string
}

/** 成绩数据信封（IDB store 'student_grades'） */
export interface StudentGradesData {
  grades: StudentGradeRecord[]
}

// ==================== 云同步多文件信封（v10 拆分） ====================

/**
 * AppSettingsData 去除 cloudSync 凭证/开关 4 字段后的类型（WorkbenchSyncData.settings 专用）。
 * 仅剔除必须本机保留的：cloudSyncEnabled / cloudSyncUrl / cloudSyncUsername / cloudSyncPassword，
 * 避免覆盖其他设备的云同步凭证与开关。
 * 注意：cloudSyncInterval（自动同步间隔）与 cloudSyncSilentThreshold（静默合并阈值）属同步偏好，
 * 随 workbench.json 的 settings 字段跨设备同步，不在此剔除。
 */
export type AppSettingsDataNoCloudSync = Omit<
  AppSettingsData,
  'cloudSyncEnabled' | 'cloudSyncUrl' | 'cloudSyncUsername' | 'cloudSyncPassword'
>

/** NavSyncData：导航（localStorage 偏好打包）同步信封 */
export interface NavSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  prefs: Record<string, string>
}

/** IconsSyncData：自定义图标同步信封 */
export interface IconsSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  icons: Array<{
    id: string
    name: string
    label: string
    dataUrl: string
    category: string
    createdAt: string
  }>
}

/** WorkbenchSyncData：工作台数据同步信封（business 独立走 business.json；settings 不含 cloudSync* 5 字段） */
export interface WorkbenchSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  todos: WorkbenchTodo[]
  notes: NoteData
  diary: DiaryData
  countdowns: Countdown[]
  passwords: string
  health: HealthData
  // 记账多账本：与 business 同款升级——旧信封为扁平 LedgerData，新结构为账本容器 LedgerStoreData，
  // 由 normalizeLedgerStore() 在导入/加载时统一迁移（旧数据迁入「当前年账本」），二者在信封层兼容共存
  ledger: LedgerData | LedgerStoreData
  settings: AppSettingsDataNoCloudSync
  pomodoro?: unknown
  habits?: unknown
  passwordsSalt?: string
  passwordVerification?: string
  prefs?: Record<string, string>
  family: GenealogyData            // 家庭家谱（并入 workbench 阶层，明文同步，不加密）
}

/** BusinessSyncData：销售记账独立同步信封 */
export interface BusinessSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  // v1 早期为扁平 BusinessData；账本化后为 BusinessStoreData（多账本容器）。
  // 读取侧一律经 normalizeBusinessStore() 归一，旧信封自动迁入当年账本，不丢数据。
  business: BusinessStoreData | BusinessData
}

/**
 * SmartSyncData：智能工作台独立同步信封（smart.json）。
 * 内容是「键 → JSON 字符串」的偏好集合，与本机 nav store 里的 smart-* 键一一对应：
 *   - smart-skills：技能库
 *   - smart-prompts：提示词库
 *   - smart-menu：左侧菜单顺序 / 改名 / 隐藏
 *   - smart-skill-categories：技能分类（含空分类）
 *   - smart-ai-platforms：AI 平台入口列表（含墓碑，按 id 合并）
 * 值统一存字符串（与 nav.json 的 prefs 同构），解析失败由各 store 自行降级。
 */
export interface SmartSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  prefs?: Record<string, string>
}

/** TeacherSyncData：教师工作台独立同步信封（v17 新增 teacher_workbench 单对象；含 base64 图片故体积偏大） */
export interface TeacherSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  teacher?: unknown
}

/** StudentSyncData：学生工作台独立同步信封（16 store 字段名映射，逐字段透传为 unknown） */
export interface StudentSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  studentSettings?: unknown
  studentHabits?: unknown
  studentCountdowns?: unknown
  homework?: unknown
  timetable?: unknown
  plans?: unknown
  review?: unknown
  mistakes?: unknown
  reading?: unknown
  achievements?: unknown
  rewards?: unknown
  parentTasks?: unknown
  education?: unknown
  health?: unknown
  studentImages?: unknown
  studentGrades?: unknown
  goals?: unknown,
}

// ===== 工具箱云同步 =====
// 信封结构与归一化/合并逻辑的唯一真源在 src/toolbox/core/toolboxSyncCore.ts（纯函数，可直测），
// 此处仅做类型再导出，避免信封形状在两处漂移。
export type { ToolboxSyncData } from '@/toolbox/core/toolboxSyncCore'

// ==================== 智能工作台（/smart）====================
// 技能与提示词两类资产，均落在统一偏好层（IndexedDB nav store），
// 并纳入备份信封与云同步脏标记。详见 docs/smart-workbench-requirements.md。

/** 提示词模板变量：由正文 {{name}} 自动解析，不手工维护 */
export interface SmartPromptVariable {
  name: string
  desc?: string
  defaultValue?: string
}

/**
 * 提示词附属参考图：用户上传后压缩成的 JPEG dataURL，随提示词 JSON 一起入库与云同步。
 * 与正文分离（不内联进 {{变量}} 模板），作为使用时供参考的素材。
 */
export interface SmartPromptImage {
  /** 图片 id（img_ 前缀） */
  id: string
  /** 原文件名（展示用） */
  name: string
  /** data:image/jpeg;base64,... */
  dataUrl: string
  width: number
  height: number
}

/**
 * 技能附属资源（skill.md 同级目录下的脚本 / 模板 / 参考文档等）。
 * 文本类直接存字符串，二进制存 base64 —— 二者都能塞进统一偏好层的 JSON 信封。
 */
export interface SmartSkillResource {
  /** 相对技能根目录的路径，如 `scripts/fetch_data.py` */
  path: string
  /** 字节大小 */
  size: number
  encoding: 'text' | 'base64'
  data: string
}

/**
 * 技能：一个目录 = 一个技能。
 * 核心是 skill.md（YAML frontmatter 元数据 + 正文指令），其余文件为附属资源。
 * 字段与 frontmatter 一一对应，详见 docs/smart-skill-structure.md。
 * 必需字段：name / description / body（三者缺一即非法）。
 */
export interface SmartSkill {
  id: string
  // ---- 以下与 skill.md 的 frontmatter 一一对应 ----
  name: string
  description: string
  version: string
  author: string
  category: string
  tags: string[]
  /** 适用场景 / 触发条件（frontmatter: when_to_use） */
  whenToUse: string
  /** 依赖工具（frontmatter: tools） */
  tools: string[]
  license: string
  /** GitHub 地址（仓库或主页链接，可选，对应 frontmatter: github） */
  github?: string
  /** frontmatter 中未被识别的键，原样保留，导入导出不丢 */
  extra: Record<string, unknown>
  /** skill.md 正文（frontmatter 之后的全部内容） */
  body: string
  // ---- 附属资源 ----
  resources: SmartSkillResource[]
  // ---- 平台侧元数据（不写入 skill.md） ----
  usageCount: number
  lastUsedAt: number | null
  /** 收藏（仅本机/云同步的记录字段，不写入 skill.md）；与提示词、工作流的 ★ 同一语义 */
  isFavorite?: boolean
  /** 墓碑（ISO 时间串）：非空 = 已删除。记录仍留在数组里参与合并与推送，展示层用 activeOnly 过滤 */
  deletedAt?: string | null
  /** Lamport 逻辑时钟：变更 / 删除时 +1，用于多端取新 */
  ver?: number
  /** 产生该版本的客户端 id（版本完全相同时的稳定 tie-break） */
  clientId?: string
  isBuiltIn?: boolean
  createdAt: number
  updatedAt: number
}

/** 提示词：可直接投喂模型的文本模板，支持 {{变量}} 占位 */
export interface SmartPrompt {
  id: string
  title: string
  category: string
  tags: string[]
  model: string
  content: string
  variables: SmartPromptVariable[]
  /** 附属参考图（压缩后的 dataURL），可为空 */
  images?: SmartPromptImage[]
  isFavorite: boolean
  usageCount: number
  lastUsedAt: number | null
  /** 墓碑（ISO 时间串）：非空 = 已删除；记录保留在数组里参与合并与推送 */
  deletedAt?: string | null
  /** Lamport 逻辑时钟：变更 / 删除时 +1 */
  ver?: number
  /** 产生该版本的客户端 id（版本相同时的稳定 tie-break） */
  clientId?: string
  isBuiltIn?: boolean
  createdAt: number
  updatedAt: number
}

/**
 * 工作流：可复用的一套操作步骤 / 流程说明。
 * 与提示词的区别在于它面向「流程」而非「单段可投喂文本」——
 * 核心是 definition（自由文本，可写步骤清单 / Markdown / YAML），其余为元数据。
 * 必需字段：name / definition（缺一即非法）。
 */
export interface SmartWorkflow {
  id: string
  /** 工作流名称 */
  name: string
  /** 一句话说明（可选） */
  description: string
  /** 分类（用于设置页归类与筛选） */
  category: string
  /** 标签 */
  tags: string[]
  /** 作者（可选） */
  author: string
  /** 版本号（可选，默认 1.0.0） */
  version: string
  /** 工作流定义 / 步骤（自由文本，可写编号步骤 / Markdown / YAML） */
  definition: string
  isFavorite: boolean
  usageCount: number
  lastUsedAt: number | null
  /** 墓碑（ISO 时间串）：非空 = 已删除；记录保留在数组里参与合并与推送 */
  deletedAt?: string | null
  /** Lamport 逻辑时钟：变更 / 删除时 +1 */
  ver?: number
  /** 产生该版本的客户端 id（版本相同时的稳定 tie-break） */
  clientId?: string
  isBuiltIn?: boolean
  createdAt: number
  updatedAt: number
}

/**
 * 智能网页端入口（智能工作台 · 「智能网页端」页签）
 * ------------------------------------------------------------------
 * 只记录**链接与标识**：不存密码 / 密钥 / Cookie / 登录态（登录由浏览器各自保持）。
 * 与技能 / 提示词 / 工作流共用墓碑同步语义（deletedAt + ver + clientId），
 * 因此可直接被 mergeSmartListById 按 id 合并。
 *
 * 云同步字段：name/url/group/icon/accountLabel/plan/note/pinned/isFavorite/order
 * 本机使用痕迹：usageCount/lastOpenedAt（不推进 ver/updatedAt，不单独触发云推送）
 */
export interface AiPlatform {
  /** 稳定 id：预置为 `ai_builtin_<builtinKey>`（跨设备一致），用户新增为 `ai_<ts>_<rand>` */
  id: string
  /** 展示名 */
  name: string
  /** 网页版地址，仅 https；非法协议归一化时置空（卡片降级为「链接无效」） */
  url: string
  /** 分组名（空值回落「未分组」） */
  group: string
  /** 图标：'' = 自动推断；'builtin:<name>' = 内联 SVG；其余按图片 URL 处理 */
  icon: string
  /** 账号标识（手机尾号 / 邮箱前缀 / 昵称），仅用于辨认 */
  accountLabel: string
  /** 套餐 / 订阅档位 */
  plan: string
  /** 备注 */
  note: string
  /** 置顶（置顶块恒在最前，内部再按 order） */
  pinned: boolean
  /** 收藏（与技能/提示词/工作流 ★ 同语义） */
  isFavorite?: boolean
  /** 排序值，单调递增；重排时整体重编号 0..n-1 */
  order: number
  /** 本机使用痕迹：累计打开次数 */
  usageCount: number
  /** 本机使用痕迹：最近一次打开时间（ms），null = 从未打开 */
  lastOpenedAt: number | null
  /** 预置标记（用于「恢复预置网页」与卡片角标） */
  isBuiltIn?: boolean
  /** 预置稳定键（qianwen / deepseek / kimi …），补种与去重依据 */
  builtinKey?: string
  createdAt: number
  updatedAt: number
  /** 墓碑（ISO）：非空 = 已删除；记录保留在数组里参与合并与推送 */
  deletedAt?: string | null
  /** Lamport 逻辑时钟 */
  ver?: number
  /** 版本相同者的稳定 tie-break */
  clientId?: string
}

/** 导入导出信封：单条与集合包同构，kind 区分资产类型 */
export interface SmartEnvelope<T> {
  kind: 'smart-prompts' | 'smart-workflows'
  version: number
  exportedAt: number
  items: T[]
}

/** 导入预览统计 */
export interface SmartImportPreview<T> {
  /** 库内不存在同名 → 新增 */
  added: T[]
  /** id 或名称已存在 → 更新（按 updatedAt 新者胜） */
  updated: T[]
  /** 非法条目 → 跳过 */
  skipped: number
}

// ==================== 博客（前台 + 管理后台） ====================
// 本期（2026-10-11）只落地「管理后台」，前台与评论未实现；
// 评论相关实体与 settings 按需求文档标注「延后」，故本期类型不包含 BlogComment。

/** 文章状态；非法值一律由 normalizeBlogData 兜底为 draft */
export const ARTICLE_STATUSES = ['draft', 'reviewing', 'published', 'offline', 'rejected'] as const
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]

/** 后台列表默认排序 */
export const BLOG_SORTS = ['updated-desc', 'updated-asc', 'created-desc', 'published-desc', 'views-desc', 'title-asc'] as const
export type BlogSort = (typeof BLOG_SORTS)[number]

/** 封面占位类型：none 无封面 / image 图片 / gradient 渐变 / solid 纯色 */
export type BlogCoverKind = 'none' | 'image' | 'gradient' | 'solid'

export interface BlogArticle {
  id: string                // 'ba_' 前缀
  slug: string              // URL 友好标识，全站唯一
  title: string
  subtitle?: string
  excerpt: string           // 摘要；空串时由正文截断生成（见 autoExcerpt）
  coverImageId?: string     // 封面图 id（指向 blog_images store）
  coverKind: BlogCoverKind
  coverToken?: string       // 纯色/渐变占位所用的主题 Token 名
  contentMarkdown: string
  status: ArticleStatus
  authorId?: string
  categoryId?: string
  tagIds: string[]
  pinned: boolean
  viewCount: number
  commentCount: number      // 恒为 0（评论延后）；保留字段避免后续启用时改结构
  readingMinutes: number    // 派生：由正文字数估算
  createdAt: string
  updatedAt: string
  publishedAt?: string
  offlineAt?: string
  deletedAt?: string        // 软删除时间戳；非空即进入回收站
  purgedAt?: string         // 彻底删除时间戳：回收站不再展示，墓碑保留随信封上云，7 天后 GC 物理清除
  seoTitle?: string
  seoDescription?: string
  auditRemark?: string      // 最近一次审核意见
  revision: number          // 保存即自增，用于草稿冲突判定
  authorName?: string       // 共享发布时写入的展示作者名（多作者预留；缺省回落站点名）
  sharedAt?: string         // 最近一次成功「共享」到服务器的本地时间戳（仅前端展示用）
}

/** 单篇共享文章文件（posts/<id>.json）—— 只含公开子集，绝不携带草稿/回收站/信封凭证 */
export interface BlogSharePost {
  id: string                // 与 BlogArticle.id 同键 → 前台去重依据
  slug: string
  title: string
  subtitle?: string
  excerpt: string
  categoryId?: string
  categoryName: string      // 已解析，访客库无分类表也能显示
  tagIds: string[]
  tagNames: string[]        // 已解析
  coverKind: BlogCoverKind
  coverToken?: string
  pinned: boolean
  readingMinutes: number
  viewCount: number
  createdAt: string
  updatedAt: string
  publishedAt?: string
  contentMarkdown: string   // 图片已内联 dataURL，自包含
  contentHtml: string       // 详情页直接 v-html
  authorName: string
}

/** 共享清单条目（manifest.json）—— 列表展示所需的最小字段，避免逐篇拉取 */
export interface BlogShareManifestEntry {
  id: string
  slug: string
  title: string
  excerpt: string
  authorName: string
  categoryId: string
  categoryName: string
  tagIds: string[]
  tagNames: string[]
  updatedAt: string
  size: number
}

export interface BlogShareManifest {
  generatedAt: string
  count: number
  posts: BlogShareManifestEntry[]
}

export interface BlogCategory {
  id: string                // 'bc_' 前缀
  name: string
  slug: string
  parentId?: string         // 最多两级
  description?: string
  icon?: string             // 可选 emoji 图标（前台分类 pill 展示；缺省回落默认图标）
  order: number
  createdAt: string
  updatedAt: string
}

export interface BlogTag {
  id: string                // 'bt_' 前缀
  name: string
  slug: string
  colorToken?: string
  createdAt: string
}

/**
 * 博客图片库条目（正文内联图片）：
 * base64 数据存在此条目里，正文 Markdown 只保留短引用 `![alt](img:<id>)`，
 * 渲染前由 resolveImageRefs 还原为 data URL —— 这样编辑区看不到超长 base64 串。
 */
export interface BlogImage {
  id: string                // 'bi_' 前缀
  name: string              // 原始文件名（作 Markdown alt 缺省）
  dataUrl: string           // data:image/...;base64,...
  size?: number             // 原始文件字节数（上传时记录，仅供图库展示）
  categoryId?: string       // 图库分类 id（BlogImageCategory）；缺省 = 未分类
  createdAt: string
  /**
   * 最后修改时间（改名 / 换分类时推进）。
   * blog.json 合并按 id 取 updatedAt 较新者，且平局时远端胜 —— 不推进会在
   * 「本地改完还没推送就拉取」时被云端旧记录覆盖（分类调整无声回滚）。
   */
  updatedAt?: string
}

/**
 * 图库分类（后台「博客设置 → 图库设置」维护，**扁平一级**）：
 * 只用于图库内的筛选与批量归类，**不参与前台展示**（前台文章分类是 BlogCategory）。
 * order 控制列表顺序；删除分类时其下图片的 categoryId 会被置空，回落到「未分类」。
 */
export interface BlogImageCategory {
  id: string                // 'bic_' 前缀
  name: string
  order: number
  createdAt: string
  updatedAt: string
}

/** 单张图片的被引用情况（图库删除限制与提示文案的数据源） */
export interface BlogImageUsage {
  /** 引用它的文章数（去重；正文或封面任一命中即计 1） */
  count: number
  /** 引用它的文章 id 列表（按文章标题升序前的原始顺序，供 UI 取标题） */
  articleIds: string[]
  /** 其中「作为封面」被引用的文章数 */
  coverCount: number
}

/** 图库列表排序方式 */
export const BLOG_IMAGE_SORTS = ['created-desc', 'created-asc', 'name-asc'] as const
export type BlogImageSort = (typeof BLOG_IMAGE_SORTS)[number]

/** 图库「分类筛选」的保留 key（与真实分类 id 'bic_' 前缀天然不冲突） */
export const BLOG_IMAGE_CATEGORY_ALL = 'all'
export const BLOG_IMAGE_CATEGORY_NONE = 'uncategorized'

export interface BlogSettings {
  blogName: string
  blogDescription: string
  pageSize: number
  defaultSort: BlogSort
  /** 同时置顶上限，默认 3 */
  pinLimit: number
  /** 自动保存防抖秒数，默认 3 */
  autoSaveSeconds: number
  /** 摘要自动截断字数，默认 120 */
  excerptLength: number
  /** 本地作者身份过期分钟数，默认 120 */
  sessionTimeoutMin: number
  footer: string
}

export interface BlogWechatConfig {
  appId: string
  appSecret: string
}

export interface BlogData {
  version: number
  updatedAt: string         // 信封合并比较基准
  settings: BlogSettings
  categories: BlogCategory[]
  tags: BlogTag[]
  articles: BlogArticle[]
  images: BlogImage[]       // 正文内联图片库（正文用 img:<id> 引用；随 blog.json 同步）
  imageCategories: BlogImageCategory[] // 图库分类（扁平一级；随 blog.json 同步）
  /** 微信公众号凭证（明文随 blog.json 同步，存于用户自己的 WebDAV/飞书；多租户隔离靠前端按 AppID 调用） */
  wechat?: BlogWechatConfig
}

/** 博客独立同步信封（blog.json），形态对齐 TeacherSyncData */
export interface BlogSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  blog?: BlogData
}

/** 博客前台「最近阅读」条目（阅读者本机浏览轨迹） */
export interface BlogRecentItem {
  id: string   // 文章 id（'ba_' 前缀）
  ts: number   // 最近一次阅读时间戳（ms）
}

/** 博客前台本机偏好：收藏 + 最近阅读（走独立信封 blog-prefs.json 云同步） */
export interface BlogFrontPrefs {
  favorites: string[]        // 已收藏文章 id（去重，顺序即收藏顺序）
  recent: BlogRecentItem[]   // 最近阅读（按时间倒序，上限见 BLOG_RECENT_LIMIT）
}

/** 博客前台偏好同步信封（blog-prefs.json），形态对齐 BlogSyncData */
export interface BlogFrontSyncData {
  version: 1
  exportedAt: string
  clientId?: string
  pushedAt?: number
  prefs?: BlogFrontPrefs
}

/** 博客前台「最近阅读」保留上限（超出截断，仅保留最近 N 篇） */
export const BLOG_RECENT_LIMIT = 20
