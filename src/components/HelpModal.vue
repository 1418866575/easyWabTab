<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { toastAlert } from '@/utils/dialog'
import Icon from './Icon.vue'
import BaseDialog from './common/BaseDialog.vue'
import { useAppSettingsStore } from '@/stores/settings'
import { incrementHelpAckCount } from '../composables/useHelpModal'
const settingsStore = useAppSettingsStore()
const emit = defineEmits<{
  close: []
}>()

// 「知道了」：累计点击次数 +1 并持久化（nav.json 偏好），再关闭。
// 注意：右上角 × 与遮罩点击走 emit('close')，不计数，未点「知道了」时下次访问仍会自动弹出。
function acknowledgeHelp(): void {
  incrementHelpAckCount()
  emit('close')
}

async function downloadExample() {
  try {
    const resp = await fetch('/data/sites.zip')
    if (!resp.ok) throw new Error('下载失败')
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sites.zip'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    toastAlert('示例数据包下载失败，请稍后重试')
  }
}

async function downloadIcons() {
  try {
    const resp = await fetch('/icons/icons.json')
    if (!resp.ok) throw new Error('下载失败')
    const text = await resp.text()
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'icons.json'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    toastAlert('图标文件下载失败，请稍后重试')
  }
}

async function downloadSkill() {
  try {
    const resp = await fetch('/skills/easy-webtab-backup-editor.zip')
    if (!resp.ok) throw new Error('下载失败')
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'easy-webtab-backup-editor.zip'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    toastAlert('技能文件下载失败，请稍后重试')
  }
}

const copied = ref('')
async function copyText(text: string, field: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = field
    setTimeout(() => { if (copied.value === field) copied.value = '' }, 1500)
  } catch {
    toastAlert('复制失败，请手动复制')
  }
}

const shortcuts = [
  { key: 'Ctrl + D', action: '切换暗色模式' },
  { key: 'Alt + W', action: '唤起工作台切换面板（全站通用）' },
  { key: 'Alt + R', action: '唤起工具箱最近使用条（工具箱页）' },
  { key: 'ESC', action: '关闭弹窗 / 浮层' }
]

const features = [
  {
    icon: 'link',
    title: '网址管理',
    desc: '添加、编辑、删除网址。自动抓取标题、描述和图标，输入已存在的网址会提示重复。'
  },
  {
    icon: 'folder',
    title: '分类管理',
    desc: '内置分类，可自定义增删改。历史分类自动迁移，不会丢失数据。'
  },
  {
    icon: 'bookmark',
    title: '标签筛选',
    desc: '每个网址可打多个标签，标签按当前分类动态展示，方便精准筛选。'
  },
  {
    icon: 'link',
    title: '断链检测',
    desc: '批量校验所有网址可用性，失效链接显示警告标记，悬停可手动取消失效标记。'
  },
  {
    icon: 'search',
    title: '双搜索',
    desc: '顶部搜索框走外部搜索引擎（可切换引擎）；分类栏右侧的筛选框只过滤本站卡片，输入即筛。'
  },
  {
    icon: 'refresh',
    title: '拖拽排序',
    desc: '拖拽卡片交换位置，排序结果自动保存。'
  },
  {
    icon: 'trending-up',
    title: '点击频率排序',
    desc: '按点击次数自动排序，常用网址置顶，也支持切换为自定义顺序。'
  },
  {
    icon: 'download',
    title: '导入 / 导出',
    desc: '导出为 Markdown 备份（可按分类 / 搜索引擎 / 网址排序），上传 .md 批量导入并按 URL 去重。'
  },
  {
    icon: 'save',
    title: '本地版本历史',
    desc: '导航数据环形保留最近 10 个版本，可一键回滚到任意历史版本。'
  },
  {
    icon: 'grid',
    title: '视图模式',
    desc: '「经典」= 卡片网格铺满；「侧边栏」= 左侧分类导航 + 右侧内容。入口在 设置 → 导航设置 → 显示控制，选择随刷新保留。'
  },
  {
    icon: 'lightbulb',
    title: '工作台切换面板',
    desc: '左上角一个入口统管 7 个工作台：导航站 / 教师台 / 个人工作台 / 销售记账 / 学生台 / 智能工作台 / 博客后台。支持搜索、就近跳转、新标签页打开，Alt+W 随时唤起。'
  },
  {
    icon: 'grid',
    title: '站内入口卡',
    desc: '工具箱、博客前台、个人图书馆以「站内入口卡」固定排在网址列表最前（工具箱恒居第一位），名称 / 图标 / 显隐可在显示控制里改。'
  },
  {
    icon: 'weather-night',
    title: '暗色模式',
    desc: '点击右上角月亮图标或 Ctrl+D 切换深色主题，适合夜间使用。图片背景模式下自动隐藏。'
  },
  {
    icon: 'image',
    title: '背景图片',
    desc: '内置 30 张壁纸，也可上传本地图片作为背景，支持模糊与遮罩调节。'
  },
  {
    icon: 'tag',
    title: '图标本地化',
    desc: '网站图标自动缓存到本地（IndexedDB），无网络也能正常显示；支持上传自定义图标与选用预设图标库。'
  },
  {
    icon: 'search',
    title: '搜索引擎管理',
    desc: '添加 / 删除自定义搜索引擎，支持设置默认，可在搜索栏快速切换，提供恢复默认按钮。'
  },
  {
    icon: 'cloud',
    title: '云同步',
    desc: '可选 WebDAV（坚果云 / Nextcloud / 自建）多设备同步，共 11 份独立信封，避免一份数据坏掉拖垮全部。'
  },
  {
    icon: 'lock',
    title: '密码库',
    desc: 'AES-CBC + PBKDF2 加密存储账号密码（位于「个人工作台」），主密码解锁后查看，支持一键复制与按网站名搜索。'
  }
]

// ===== 标签页 =====
const TABS = [
  { key: 'nav', icon: 'link', label: '网址导航' },
  { key: 'workbench', icon: 'toolbox', label: '个人工作台' },
  { key: 'business', icon: 'store', label: '销售记账台' },
  { key: 'student', icon: 'notes', label: '学生工作台' },
  { key: 'teacher', icon: 'teacher', label: '教师工作台' },
  { key: 'toolbox', icon: 'grid', label: '工具箱' },
  { key: 'smart', icon: 'lightbulb', label: '智能工作台' },
  { key: 'blog', icon: 'document', label: '博客与图书馆' },
  { key: 'data', icon: 'keyboard', label: '快捷键与数据' }
] as const
type TabKey = (typeof TABS)[number]['key']
const activeTab = ref<TabKey>('nav')

// 标签页可见性：工作台/销售记账/学生工作台开关关闭时对应标签页隐藏
const visibleTabs = computed(() => TABS.filter(t => {
  if (t.key === 'workbench') return settingsStore.workbenchPageVisible !== false
  if (t.key === 'business') return settingsStore.businessPageVisible !== false
  if (t.key === 'student') return settingsStore.studentPageVisible !== false
  if (t.key === 'teacher') return settingsStore.teacherPageVisible !== false
  if (t.key === 'toolbox') return settingsStore.toolboxButtonVisible !== false
  if (t.key === 'smart') return settingsStore.smartPageVisible !== false
  // 博客与图书馆任一入口可见即保留该标签页
  if (t.key === 'blog') {
    return settingsStore.blogAdminPageVisible !== false
      || settingsStore.blogFrontPageVisible !== false
      || settingsStore.booksPageVisible !== false
  }
  return true
}))

// 确保当前激活标签页可见，开关关闭后自动回退到首项
const visibleActiveTab = computed(() => {
  const keys = visibleTabs.value.map(t => t.key)
  return keys.includes(activeTab.value) ? activeTab.value : keys[0]
})
watch(visibleActiveTab, (v) => { if (v && v !== activeTab.value) activeTab.value = v })

// ===== 个人工作台：10 个面板 =====
interface PanelDoc {
  icon: string
  name: string
  desc: string
  tips: string
}

const wbPanels: PanelDoc[] = [
  {
    icon: 'home',
    name: '主页',
    desc: '工作台总览：待办 / 便签快捷添加，今日数据速览，即将到期的提醒。',
    tips: '内嵌天气卡与日历锚点（发薪日、生日纪念日倒计时）。'
  },
  {
    icon: 'todos',
    name: '待办',
    desc: '自定义分类管理待办，支持分类筛选、优先级标记与完成状态。',
    tips: '分类被引用时禁止删除；重命名会自动同步历史条目的分类。'
  },
  {
    icon: 'notes',
    name: '便签',
    desc: '便签 + 时光轴双形态：普通便签随手记，时光轴按时间线留存重要节点。',
    tips: '便签分类删除后，其下便签自动归入「未分类」，不会丢失。'
  },
  {
    icon: 'diary',
    name: '日记',
    desc: '每日一篇，按本地日期唯一存储，同一天再次保存即为更新。',
    tips: '日期键按本地时区计算，不会因 UTC 偏移串到前一天。'
  },
  {
    icon: 'countdowns',
    name: '提醒',
    desc: '6 种重复规则（一次 / 每天 / 每周 / 每月 / 每年 / 自定义间隔），6 类默认分类可自定义扩展。',
    tips: '三通道提醒：弹框 + 桌面通知 + 邮件（需单独开启）；每天 9:00 发送当日摘要，摘要永不发邮件。'
  },
  {
    icon: 'pomodoro',
    name: '番茄钟',
    desc: '专注计时器，工作与休息交替，帮助保持节奏。',
    tips: '配合「提醒」的倒计时分类，可统一管理专注时段。'
  },
  {
    icon: 'habits',
    name: '打卡',
    desc: '建立习惯清单，按天打卡，连续天数与完成率一目了然。',
    tips: '适合配合每日固定时间的倒计时提醒，形成稳定节奏。'
  },
  {
    icon: 'passwords',
    name: '密码',
    desc: 'AES-CBC 加密存储账号密码，主密码解锁后才能查看，支持一键复制与按网站名搜索。',
    tips: '安全策略：5 分钟无操作自动锁定；云同步采用「云端覆盖本地」，增删改后立即推送。'
  },
  {
    icon: 'health',
    name: '健康',
    desc: '四个子面板：运动、饮食、睡眠、体重，含目标计划与按天记录。',
    tips: 'BMI 按国标 WS/T 428-2013 分级；面板顶部「提醒」区块按倒计时分类 1:1 映射，只读展示。'
  },
  {
    icon: 'ledger',
    name: '记账',
    desc: '六指标统计（收入 / 支出 / 结余 / 存款 / 笔数 / 支出比），近 6 个月收支趋势柱图与支出分类环形图。',
    tips: '支持分组管理与金额一键掩码；图表区可折叠，防止挤压记录列表。'
  }
]

// ===== 销售记账台：7 个模块 =====
const bsModules: PanelDoc[] = [
  {
    icon: 'home',
    name: '首页',
    desc: '经营总览：营业额与利润总额主指标，成本 / 支出 / 毛利率统计卡。',
    tips: '含低库存预警清单（默认阈值 20）与分类销售排行树状图，可直接跳转对应模块。'
  },
  {
    icon: 'products',
    name: '商品',
    desc: '商品档案：名称、分类、进货价、售价，自动计算加价率，可标记停售。',
    tips: '商品分类支持自定义、排序与显隐；停售商品不参与低库存预警。'
  },
  {
    icon: 'purchases',
    name: '库存',
    desc: '记录每次进货（入库）的商品、数量与金额，是库存的唯一增加来源。',
    tips: '进货价变动会同步影响成本与利润计算，务必如实填写。'
  },
  {
    icon: 'daily',
    name: '销售',
    desc: '每日销售登记：每件商品带出多少、剩余多少、损耗多少，自动算出当日营业额。',
    tips: '核心数据入口，营业额与成本全部由这里的三条数量推导。'
  },
  {
    icon: 'expenses',
    name: '支出',
    desc: '记录摊位费、交通等经营支出，按分类归集，可查看支出占比与趋势。',
    tips: '内置 8 个分类不可删除；支出独立统计，不计入商品成本。'
  },
  {
    icon: 'inventory',
    name: '库存预警',
    desc: '低库存预警与库存总览：库存由进货与销售记录自动推导，低于阈值、长期未售出或批次久存时提醒。',
    tips: '可查看每个商品的库存构成来源（进货、带出、剩余明细）。'
  },
  {
    icon: 'stats',
    name: '统计',
    desc: '近 N 天经营趋势（每日一柱）、支出占比、营业占比，支持切换天数。',
    tips: '趋势图支持分段查看，长按或悬停可看具体数值。'
  }
]

// ===== 销售记账核心公式 =====
const bsFormulas = [
  { label: '售出数量', expr: '带出 - 剩余 - 损耗' },
  { label: '当前库存', expr: '累计进货 - 累计售出 - 累计损耗' },
  { label: '营业额', expr: '累计（售出数量 × 售价）' },
  { label: '成本 COGS', expr: '累计（售出数量 × 进货价）' },
  { label: '利润', expr: '营业额 - 成本' },
  { label: '毛利率', expr: '利润 ÷ 营业额' }
]

// ===== 销售记账推荐流程 =====
const bsFlow = [
  { step: '1', text: '建商品档案：先录入商品与进货价、售价' },
  { step: '2', text: '记进货：每次进货登记数量，库存随之增加' },
  { step: '3', text: '每日销售：填带出、剩余、损耗，当日营业额自动生成' },
  { step: '4', text: '记支出：登记摊位费等经营支出' },
  { step: '5', text: '看统计：在统计页查看趋势、占比与排行' }
]

// ===== 学生工作台模块 =====
const studentModules: PanelDoc[] = [
  {
    icon: 'home',
    name: '主页',
    desc: '问候条 + 三屏轮播（行动台 / 数据概览 / 工具栏），6 秒自动轮播，鼠标悬停暂停。',
    tips: '学段徽标显示在问候条右侧，点行动台卡片直接进入对应面板。'
  },
  {
    icon: 'habits',
    name: '习惯打卡',
    desc: '按学段播种默认习惯（K 7 项 / P 6 项 / J 5 项），连续天数与完成率可视。',
    tips: 'K 段家长主导，J 段默认隐藏（自主学习）。'
  },
  {
    icon: 'todos',
    name: '作业管理',
    desc: '按学科录入作业，含截止日期、完成状态、附件图片；K 段改为游戏化任务卡片。',
    tips: 'P / J 段专属，K 段默认隐藏。'
  },
  {
    icon: 'countdowns',
    name: '课程表',
    desc: '周视图 + 当日课时高亮，支持节次配置与调课；K 段改为每日活动安排。',
    tips: 'P / J 段专属，K 段默认隐藏。'
  },
  {
    icon: 'notes',
    name: '学习计划',
    desc: '周计划 + 单元计划，自动联动作业 / 复习 / 错题。',
    tips: 'P / J 段专属，K 段默认隐藏。'
  },
  {
    icon: 'diary',
    name: '复习计划',
    desc: '按艾宾浩斯遗忘曲线排期，按学科 + 错题关联。',
    tips: 'P / J 段专属，K 段默认隐藏。'
  },
  {
    icon: 'passwords',
    name: '错题本',
    desc: '拍照录入 + 学科分类 + 复习关联，图片单独存 Blob。',
    tips: 'P / J 段专属，K 段默认隐藏。'
  },
  {
    icon: 'notes',
    name: '阅读记录',
    desc: '书目 + 阅读时长 + 笔记摘录。',
    tips: '全学段开放。'
  },
  {
    icon: 'countdowns',
    name: '考试倒计时',
    desc: '复用倒计时引擎，按学科 + 考试类型分类，含到期提醒。',
    tips: 'J 段默认显示，K / P 段默认隐藏。'
  },
  {
    icon: 'ledger',
    name: '成绩记录',
    desc: '按考试 / 学科录入成绩，含统计与趋势。',
    tips: 'P / J 段主要使用，可手动开启。'
  },
  {
    icon: 'target',
    name: '学习目标',
    desc: '设定阶段性目标并跟踪完成度。',
    tips: '与计划 / 复习联动，目标到期会在主页行动台提示。'
  },
  {
    icon: 'diary',
    name: '教育经历',
    desc: '记录就读学校、学段、起止时间等学习历程。',
    tips: '数据独立存储，可导出随学生备份迁移。'
  },
  {
    icon: 'health',
    name: '健康管理',
    desc: '复刻成人健康面板：运动 / 饮食 / 睡眠 / 体重 + 身高成长记录。',
    tips: 'BMI 按国标 WS/T 428-2013 分级，身高单独留成长曲线。'
  },
  {
    icon: 'habits',
    name: '成就勋章',
    desc: '完成作业 / 习惯 / 阅读 / 番茄自动颁发勋章。',
    tips: 'K / P 段专属，J 段隐藏（无激励引导）。'
  },
  {
    icon: 'ledger',
    name: '奖励积分',
    desc: '完成动作自动攒积分，家长可兑换奖励。',
    tips: 'K / P 段专属，J 段隐藏。'
  },
  {
    icon: 'health',
    name: '家长协同',
    desc: 'PIN 解锁后查看学习概况、完成情况、奖励兑换，可发每日任务与手动加 / 扣分。',
    tips: '6 个 tab（统计 / 每日任务 / 孩子报告 / 手动加分 / 发放勋章 / 配置奖励），K / P 段专属。'
  }
]

// ===== 学生工作台使用流程 =====
const studentFlow = [
  { step: '1', text: '选择学段：首次进入弹出学段引导，K/P/J 三段菜单自动适配' },
  { step: '2', text: '设学生信息：昵称、学号、学校、年级（选填）' },
  { step: '3', text: '管学科清单：K 段无学科，P 段 3 科，J 段 9 科，可自定义增删' },
  { step: '4', text: '调菜单开关：根据学段默认隐藏的菜单可手动开启' },
  { step: '5', text: '开始使用：进入各面板录入数据（M2 起逐步上线各模块）' }
]

// ===== 工作台快捷键 =====
const wbShortcuts = [
  { key: 'Alt + K', action: '打开全局搜索浮层' },
  { key: 'Alt + W', action: '打开工作台切换面板（随时换台）' },
  { key: 'Alt + R', action: '工具箱：唤起最近使用条' },
  { key: 'Ctrl + Alt + 1~9', action: '跳转左侧菜单第 N 项' },
  { key: 'g', action: '个人工作台与销售记账台互相切换' },
  { key: '[ / ]', action: '切换到上一个 / 下一个模块' },
  { key: 'Ctrl + S', action: '博客 / 日记编辑器中保存' },
  { key: 'ESC', action: '关闭搜索浮层 / 弹框' }
]

// ===== 云同步要点 =====
const syncNotes = [
  '基于 WebDAV 协议，坚果云、Nextcloud 等任意 WebDAV 服务均可，在「设置 → 云同步」中配置。',
  '配置好之后右上角同步按钮会显示状态：拉取中 / 推送中 / 处理冲突 / 同步失败；失败时点一下就能看到具体错误。',
  '共 11 份独立信封：nav / icons / workbench / business / student / teacher / toolbox / smart / blog / blog-prefs / books。每份单独合并，一份坏掉不会拖垮全部。',
  '记录型数据（网址、待办、便签、文章等）采用「并集 + 墓碑」合并：两端都保留，删除写墓碑而非物理移除，所以不会一同步就复活。',
  '密码库采用「云端覆盖本地」策略：拉取时以云端为准，避免本地旧密文覆盖新数据；密码增删改后会立即主动推送。',
  '两端主密码不一致时，密码面板会锁定并要求输入来源设备的主密码解锁。',
  '云同步凭据（地址 / 账号 / 密码）不进任何信封，永远只留本机。',
  '配置好云同步后，可直接用智能体（技能）以自然语言新增网站与工作台内容，不必手动导出导入。'
]

// ===== 教师工作台：15 个功能页（数据管理 / 使用说明已迁入右上角设置） =====
const teacherModules: PanelDoc[] = [
  {
    icon: 'calendar',
    name: '课程表',
    desc: '七列周课表：顶部工具条（周次 / 导出 / 清空）、今日速览、学科图例，首列与表头吸顶。',
    tips: '按「学期 × 班级」隔离；学科下拉按小学 / 初中 / 高中 / 大学分组，支持自定义。'
  },
  {
    icon: 'dice',
    name: '点名',
    desc: '随机点名：名字快速轮换并逐渐减速落定，落定后写入历史。',
    tips: '「只点一遍」模式自动排除已点过的学生，可随时重置记录。'
  },
  {
    icon: 'notes',
    name: '学生信息',
    desc: '统计卡 + 花名册（男蓝 / 女粉、特异体质红色「!」角标）+ 可编辑明细表，含家庭地址。',
    tips: '明细表改动即存；「导入学生信息 / 下载模板」与数据管理页共用同一份名单模板。'
  },
  {
    icon: 'teacher',
    name: '班委信息',
    desc: '班委名单：学号 / 姓名（可搜索）/ 职务（可搜索，支持自定义）/ 职责。',
    tips: '与学生信息里的「职务」双向联动，改任一处另一处同步。'
  },
  {
    icon: 'grid',
    name: '座位表',
    desc: '行列布局设置 + 按名单 / 随机排座 + 拖拽互换（移动端点选两块互换）。',
    tips: '空位显示斜纹占位与座位号；特异体质学生右上角带红色「!」。仅班主任可见。'
  },
  {
    icon: 'chart',
    name: '成绩信息',
    desc: '选考试 → 七项统计卡 + 分段柱状图 + 排名走势折线图 + 可编辑成绩表。',
    tips: '图表为内联 SVG 手写（项目约定不用 echarts），多人同时录入建议先导出备份。'
  },
  {
    icon: 'target',
    name: '试卷分析',
    desc: '按试卷录入题目（题号 / 题型 / 知识点 / 我班错误人数），自动算错误率，并汇总「易错知识点排行」。',
    tips: '讲评前先看排行榜，把错误率高的知识点排进下一节课。'
  },
  {
    icon: 'check',
    name: '值日生表',
    desc: '周一至周五值日安排（名单按顿号「、」编辑）+ 班委名单与职责。',
    tips: '名单存学生 id、界面显示姓名，姓名对不上会提示且不写入。仅班主任可见。'
  },
  {
    icon: 'phone',
    name: '联系家长',
    desc: '按学生 / 家长 / 电话搜索，支持导入表格与导出纸质版。',
    tips: '电话以文本展示，不提供一键拨号（避免误拨）。仅班主任可见。'
  },
  {
    icon: 'star',
    name: '奖励记录',
    desc: '左侧选学生（搜索 + 记录数徽标），右侧时间线记奖励 / 扣分，可附图片。',
    tips: '图片经 canvas 压缩（宽 800px、JPEG 0.8）后存储，单条最多 9 张。'
  },
  {
    icon: 'clipboard',
    name: '请假信息',
    desc: '登记 → 审批 → 销假 → 统计 → 导出，全流程闭环。',
    tips: '按「学期 × 班级」隔离，跨学期数据互不干扰。仅班主任可见。'
  },
  {
    icon: 'document',
    name: '作业记录',
    desc: '新建作业后按名册为每位同学生成未交记录；补交后标记「已补交」（可填补交时间 / 备注）。',
    tips: '支持一键导出未交名单 Excel。班主任与科任都可用。'
  },
  {
    icon: 'email',
    name: '家校谈话',
    desc: '按谈话方式 / 分类记录沟通内容，列表 + 卡片双视图，含筛选、统计与导出。',
    tips: '仅班主任可见；导出前可在统计里核对次数分布。'
  },
  {
    icon: 'notes',
    name: '班级小组',
    desc: '长期固定分组 + 活动临时分组 + 随机分组 + 分组快照。',
    tips: '快照可回看某次分组名单，适合课后复盘；班主任与科任都能用。'
  },
  {
    icon: 'heart',
    name: '隐私信息',
    desc: '过敏原 / 慢性疾病 / 注意事项 / 家长紧急电话逐人建档。',
    tips: '只有班主任可见；special 标记会同步到花名册和座位表的红色「!」角标。'
  }
]

// ===== 教师工作台使用流程 =====
const teacherFlow = [
  { step: '1', text: '首次进入选学期、年级、班级与身份（班主任 / 非班主任·科任）' },
  { step: '2', text: '导入学生名单：学生信息页「下载模板」→ 填好后「导入表格」' },
  { step: '3', text: '排好课程表与座位表，值日表按周排班' },
  { step: '4', text: '日常录入：点名、作业、请假、奖励、家校谈话' },
  { step: '5', text: '考试后录成绩、做试卷分析，学期末在设置里导出备份' }
]

// ===== 工具箱：19 个分类（站点自建，不跳第三方） =====
const toolboxCategories = [
  { icon: '🛠', name: '开发工具', desc: 'JSON / XML 格式化、正则测试、JWT 解码、cURL 转代码、Cron 构建器、WebSocket 测试' },
  { icon: '🔐', name: '编码解码', desc: 'Base64、URL 编解码、Hash、字符转义' },
  { icon: '🔄', name: '数据转换', desc: 'CSV ↔ JSON、JSON ↔ XML、Excel 匹配、HTML ↔ Markdown' },
  { icon: '📝', name: '文本处理', desc: '文本对比、字幕工具、Markdown 编辑器、引用格式化' },
  { icon: '🖼️', name: '图片处理', desc: '压缩 / 裁剪 / 拼接 / 水印 / 抠图 / 证件照换底色 / 切片 / EXIF 查看' },
  { icon: '🎨', name: '颜色设计', desc: '取色器、对比度检测、配色板、图表配色' },
  { icon: '🕒', name: '时间计算', desc: '时间戳、世界时钟、日历、年龄计算、番茄计时' },
  { icon: '🧮', name: '计算换算', desc: '单位换算、科学计算器、BMI、存款利息、个税' },
  { icon: '🎲', name: '生成与随机', desc: 'UUID、二维码、密码、随机抽取、卡号 / 号码生成（仅测试用）' },
  { icon: '⚡', name: '效率工具', desc: '数据看板、抽奖、番茄钟、桌面清理清单' },
  { icon: '📄', name: 'PDF 工具', desc: '合并 / 拆分 / 压缩 / 加密 / 解锁 / 旋转 / 水印 / 提取 / 转 Markdown / 转 Office / 比较' },
  { icon: '🔏', name: '证书与安全', desc: 'RSA 密钥、CSR 生成与解析、X.509 解析、PEM ↔ JWK' },
  { icon: '📑', name: '文档处理', desc: 'docx 预览、docx 提图、文档属性编辑、合同生成' },
  { icon: '📐', name: '设备与测量', desc: '量角器、屏幕标尺、噪音计、指南针、摄像头拍照' },
  { icon: '🎬', name: '媒体播放', desc: '媒体播放器、格式转换、语音转文字 / 文字转语音' },
  { icon: '🏦', name: '贷款计算', desc: '等额本息 / 本金、组合贷、公积金、LPR、提前还款、利率变更、反推' },
  { icon: '🔬', name: '科学', desc: '元素周期表、中国地图、科学计算' },
  { icon: '🧭', name: '站内模块', desc: '工作台 / 博客 / 图书馆 / 小游戏等站内入口，一处直达' },
  { icon: '📁', name: '其他', desc: '不符合以上分类的杂项工具' }
]

// ===== 智能工作台 =====
const smartModules: PanelDoc[] = [
  {
    icon: 'chart',
    name: '概览',
    desc: '统计卡 + 分类分布 + 最近使用 Top5，点击可直接跳到对应条目。',
    tips: '概览只看不改，增删改都在各自的管理页。'
  },
  {
    icon: 'toolbox',
    name: '技能库',
    desc: '一个技能 = 一个目录：skill.md 的 frontmatter + 正文 + 附属资源，可导入文件夹或 zip。',
    tips: '导入先出预览（新增 N / 更新 M / 跳过 K），确认后才落库，避免盲改。'
  },
  {
    icon: 'notes',
    name: '提示词库',
    desc: '列表 + 分类 / 标签 / 收藏筛选，支持变量填充：左填变量、右实时预览。',
    tips: '未填的变量会保留原 {{占位}} 并计数提示，不会静默清空。'
  },
  {
    icon: 'refresh',
    name: '工作流库',
    desc: '自由文本定义工作流，支持多选批量导出 / 删除与导入导出。',
    tips: '详情弹框先转义再保留换行，长文可滚动查看。'
  }
]

// ===== 博客 =====
const blogModules: PanelDoc[] = [
  {
    icon: 'notes',
    name: '文章',
    desc: 'Markdown 编辑器（工具栏 + 实时预览），含分类、标签、封面、摘要自动截取、阅读时长估算。',
    tips: '保存带乐观锁：另一设备已改过会提示冲突，由你决定覆盖还是放弃。'
  },
  {
    icon: 'image',
    name: '图库',
    desc: '上传（可多选）、分类筛选、批量归类、搜索排序分页；图片以 ID 形式嵌在正文里。',
    tips: '被文章正文或封面引用的图片禁止删除，鼠标悬停会列出引用它的文章。'
  },
  {
    icon: 'trash',
    name: '回收站',
    desc: '删除的文章先进回收站，可还原或彻底删除。',
    tips: '彻底删除写的是墓碑，7 天后才真正清理，期间云同步不会把它「复活」。'
  },
  {
    icon: 'email',
    name: '公众号草稿箱',
    desc: '在博客设置里填 AppID / Secret 后，可把文章一键推到公众号草稿箱再排版发布。',
    tips: '凭证随 blog.json 加密前的明文存储，仅在你自己配置的 WebDAV 里流转。'
  },
  {
    icon: 'document',
    name: '博客前台',
    desc: '路由 /blog 为列表首页，/blog/article/:slug 为文章详情，支持分类 / 标签筛选与收藏。',
    tips: '前台偏好（收藏 / 最近阅读）走独立信封，不会覆盖后台数据。'
  }
]

// ===== 个人图书馆 =====
const bookModules: PanelDoc[] = [
  {
    icon: 'grid',
    name: '书架',
    desc: '静态书（随站点构建，全体可见）与本机上传的 HTML 书合并展示，支持搜索、分类、标签、排序；上传书的卡片上另有「编辑」「删除」两个按钮。',
    tips: '上传的书只存在当前设备，不进云同步信封；书名 / 分类 / 简介 / 标签随时可改，删了就找不回来。'
  },
  {
    icon: 'bookmark',
    name: '收藏与书签',
    desc: '星标收藏、最近阅读、书内书签三件套。',
    tips: '收藏与书签随 books.json 跨设备同步；阅读进度和打开次数属设备级数据，不外传。'
  },
  {
    icon: 'document',
    name: '阅读页',
    desc: '/books/read?id=xxx 用 iframe 承载原书 HTML，保留原书排版与脚本。',
    tips: '阅读位置自动记忆，下次打开从上次位置继续。'
  }
]

// ===== 用智能体（技能）新增 / 修改数据 =====
const skillName = 'easy-webtab-backup-editor'

// 提示词示例：直接对智能体说出即可触发技能
const skillPrompts = [
  { scenario: '新增网站', text: '帮我在导航里加一个网站：淘宝，链接 https://www.taobao.com，标签 购物' },
  { scenario: '记一笔消费', text: '记一笔消费：今天早餐 16.5 元，备注两杯豆浆一个馅饼' },
  { scenario: '新增商品', text: '新增商品 烤冷面，进货价 3 元，售价 8 元' },
  { scenario: '记销售记录', text: '记今天销售：烤冷面带出 30 份、剩余 5 份、损耗 1 份' },
  { scenario: '加一条待办', text: '加一条待办：周五前写完周报，优先级高' },
  { scenario: '写便签', text: '写个便签：购物清单，内容 牛奶、面包、鸡蛋' }
]

// 技能安装步骤
const skillInstall = [
  { step: '1', text: '打开 WorkBuddy「专家 / 技能」中心，搜索并进入 easy-webtab-backup-editor 技能页。' },
  { step: '2', text: '点击「安装」，技能会写入用户级目录 ~/.workbuddy/skills/，无需手动配置路径即可生效。' },
  { step: '3', text: '安装后，直接用自然语言对智能体说出新增需求（如“加一个网站 / 记一笔消费”），智能体自动触发该技能。' },
  { step: '4', text: '技能把数据写入云端备份文件 backup.json，随云同步在任意设备自动生效；修改或删除请在管理界面操作。' }
]
</script>

<template>
  <BaseDialog class="help-dialog" width="1000px" max-height="85vh" @close="emit('close')">
    <template #title><Icon name="lightbulb" /> 使用帮助</template>

    <!-- 标签页导航 -->
    <div class="help-tabs" role="tablist">
      <button
        v-for="tab in visibleTabs"
        :key="tab.key"
        class="help-tab"
        :class="{ active: activeTab === tab.key }"
        :aria-selected="activeTab === tab.key"
        :data-testid="`help-tab-${tab.key}`"
        role="tab"
        @click="activeTab = tab.key"
      >
        <span class="help-tab-icon"><Icon :name="tab.icon" :size="16" /></span>
        <span class="help-tab-label">{{ tab.label }}</span>
      </button>
    </div>

    <!-- 各标签页正文：外壳滚动/内边距由 BaseDialog 的 .bd-body 提供，
         这里只保留正文自身的纵向排布（原 .modal-body 的 flex + gap） -->
    <div class="help-content">
    <!-- ===== 标签 1：网址导航 ===== -->
    <template v-if="activeTab === 'nav'">
        <!-- 云同步体验账号 -->
        <section class="help-section">
          <div class="download-card">
            <div class="download-info">
              <span class="download-icon"><Icon name="cloud" /></span>
              <div>
                <h4>云同步 · 体验账号</h4>
                <p>想先体验云同步、又不想自己搭服务器？可用下面的公共体验账号（WebDAV 直连，与本站同源，无需额外配置）：</p>
                <ul class="sync-account">
                  <li>
                    <span class="sync-label">同步地址</span>
                    <code>https://www.codehelp.com.cn/dav/</code>
                    <button class="btn-copy" @click="copyText('https://www.codehelp.com.cn/dav/', 'url')">{{ copied === 'url' ? '已复制' : '复制' }}</button>
                  </li>
                  <li>
                    <span class="sync-label">用户名</span>
                    <code>public</code>
                    <button class="btn-copy" @click="copyText('public', 'user')">{{ copied === 'user' ? '已复制' : '复制' }}</button>
                  </li>
                  <li>
                    <span class="sync-label">密码</span>
                    <code>public</code>
                    <button class="btn-copy" @click="copyText('public', 'pass')">{{ copied === 'pass' ? '已复制' : '复制' }}</button>
                  </li>
                </ul>
                <p class="sync-note"><Icon name="info" :size="13" />
                  在「设置 → 云同步」中填入以上三项后点「测试连接」即可。
                  该账号为 <strong>公共共享账号</strong>，<strong>每晚凌晨 2 点自动恢复初始数据</strong>，
                  请勿存放重要或私密信息，也不要期待数据长期保留。
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- 示例数据下载 -->
        <section class="help-section download-section">
          <div class="download-card">
            <div class="download-info">
              <span class="download-icon"><Icon name="package" /></span>
              <div>
                <h4>下载示例数据</h4>
                <p>下载示例数据包 <code>sites.zip</code>：内含 <code>sites.md</code>（分类与网址）与 <code>icons/</code> 图标目录。在管理后台「导入」处直接上传该 zip，网址、分类与图标会一并恢复，图标同时登记进「图标管理」；也可解压后单独上传 <code>sites.md</code>。下方 <code>icons.json</code> 是预设图标库，可在图标管理中导入。</p>
              </div>
            </div>
            <div class="download-actions">
              <button class="btn-download" @click="downloadExample">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                下载示例包
              </button>
              <button class="btn-download" @click="downloadIcons">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                下载图标
              </button>
            </div>
          </div>
        </section>

        <!-- 功能介绍 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="target" /> 功能介绍</h3>
          <div class="features-grid">
            <div
              v-for="feature in features"
              :key="feature.title"
              class="feature-item"
            >
              <span class="feature-icon"><Icon :name="feature.icon" /></span>
              <div class="feature-content">
                <h4>{{ feature.title }}</h4>
                <p>{{ feature.desc }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 视图模式 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="grid" /> 视图模式</h3>
          <div class="mode-info">
            <div class="mode-item">
              <span class="mode-badge mode-admin">经典</span>
              <p>路由 <code>/</code>，卡片网格铺满整屏，适合宽屏浏览与快速点开。</p>
            </div>
            <div class="mode-item">
              <span class="mode-badge mode-admin">侧边栏</span>
              <p>左侧固定分类导航 + 右侧内容区，分类多时更省滚动；移动端侧栏自动收成抽屉。</p>
            </div>
          </div>
          <p class="formula-note">切换入口：设置 → 导航设置 → 显示控制；选择随刷新保留。</p>
        </section>

        </template>

        <!-- ===== 标签 2：个人工作台 ===== -->
        <template v-if="activeTab === 'workbench'">
          <section class="help-section">
            <h3 class="section-title"><Icon name="toolbox" /> 个人工作台</h3>
            <div class="panel-intro">
              <p>路由 <code>/workbench</code>。10 个面板覆盖日常事务管理，菜单顺序、名称与显隐可在「设置 - 工作台」中调整，不用的面板可以关掉。</p>
            </div>
            <div class="panels-grid">
              <div v-for="p in wbPanels" :key="p.name" class="panel-item">
                <div class="panel-head">
                  <span class="panel-icon"><Icon :name="p.icon" :size="18" /></span>
                  <h4>{{ p.name }}</h4>
                </div>
                <p class="panel-desc">{{ p.desc }}</p>
                <p class="panel-tips"><Icon name="lightbulb" :size="13" /> {{ p.tips }}</p>
              </div>
            </div>
          </section>
        </template>

        <!-- ===== 标签 3：销售记账台 ===== -->
        <template v-if="activeTab === 'business'">
          <section class="help-section">
            <h3 class="section-title"><Icon name="store" /> 销售记账台</h3>
            <div class="panel-intro">
              <p>路由 <code>/business</code>。面向摆摊与小微零售的进销存闭环：只需录入进货、销售、支出三类动作，库存与利润全部自动推导。</p>
            </div>
            <div class="panels-grid">
              <div v-for="m in bsModules" :key="m.name" class="panel-item">
                <div class="panel-head">
                  <span class="panel-icon"><Icon :name="m.icon" :size="18" /></span>
                  <h4>{{ m.name }}</h4>
                </div>
                <p class="panel-desc">{{ m.desc }}</p>
                <p class="panel-tips"><Icon name="lightbulb" :size="13" /> {{ m.tips }}</p>
              </div>
            </div>
          </section>

          <section class="help-section">
            <h3 class="section-title"><Icon name="trending-up" /> 核心计算公式</h3>
            <div class="formula-list">
              <div v-for="f in bsFormulas" :key="f.label" class="formula-item">
                <span class="formula-label">{{ f.label }}</span>
                <code class="formula-expr">{{ f.expr }}</code>
              </div>
            </div>
            <p class="formula-note">支出为独立统计项，不计入成本，因此「利润」是毛利口径；算净利请用利润减去支出。</p>
          </section>

          <section class="help-section">
            <h3 class="section-title"><Icon name="target" /> 推荐使用流程</h3>
            <ol class="flow-list">
              <li v-for="s in bsFlow" :key="s.step">
                <span class="flow-step">{{ s.step }}</span>
                <span class="flow-text">{{ s.text }}</span>
              </li>
            </ol>
          </section>
        </template>

        <!-- ===== 标签 4：学生工作台 ===== -->
        <template v-if="activeTab === 'student'">
          <section class="help-section">
            <h3 class="section-title"><Icon name="notes" /> 学生工作台</h3>
            <div class="panel-intro">
              <p>路由 <code>/student</code>。面向幼儿园、小学、初中学生的学习成长工作台：复用成人工作台架构，按学段差异化加载面板与默认数据，K/P/J 三段菜单与默认习惯/学科清单自动适配。</p>
            </div>
            <div class="panels-grid">
              <div v-for="m in studentModules" :key="m.name" class="panel-item">
                <div class="panel-head">
                  <span class="panel-icon"><Icon :name="m.icon" :size="18" /></span>
                  <h4>{{ m.name }}</h4>
                </div>
                <p class="panel-desc">{{ m.desc }}</p>
                <p class="panel-tips"><Icon name="lightbulb" :size="13" /> {{ m.tips }}</p>
              </div>
            </div>
          </section>

          <section class="help-section">
            <h3 class="section-title"><Icon name="target" /> 学段差异</h3>
            <ul class="storage-list">
              <li><strong>幼儿园（K）</strong>：游戏化任务卡片、家长主导、图标化界面；含课程表（6 项幼儿活动：游戏活动/绘本阅读/手工/音乐/户外/午睡，可继续自定义）；7 项默认习惯种子（刷牙/洗脸/收拾玩具/阅读绘本等）。</li>
              <li><strong>小学（P）</strong>：作业管理 + 课程表 + 习惯养成 + 阅读记录；3 科默认学科（语数英）；6 项默认习惯种子。</li>
              <li><strong>初中（J）</strong>：学科管理 + 复习计划 + 错题本 + 考试倒计时；9 科默认学科；5 项默认习惯种子；家长入口隐藏。</li>
            </ul>
          </section>

          <section class="help-section">
            <h3 class="section-title"><Icon name="lightbulb" /> 使用流程</h3>
            <ol class="flow-list">
              <li v-for="s in studentFlow" :key="s.step">
                <span class="flow-step">{{ s.step }}</span>
                <span class="flow-text">{{ s.text }}</span>
              </li>
            </ol>
            <p class="formula-note">学段切换将应用该学段默认菜单可见性与默认学科清单，已有自定义学科保留。</p>
          </section>
        </template>

        <!-- ===== 标签 5：教师工作台 ===== -->
        <template v-if="activeTab === 'teacher'">
          <section class="help-section">
            <h3 class="section-title"><Icon name="teacher" /> 教师工作台</h3>
            <div class="panel-intro">
              <p>路由 <code>/teacher</code>。按「学期 × 班级」隔离数据的班务工作台：顶栏选学期 / 班级 / 身份 / 学科，左侧 15 个功能页。首次进入先走引导，录入学年、学期、年级、班级与身份。</p>
            </div>
            <div class="panels-grid">
              <div v-for="m in teacherModules" :key="m.name" class="panel-item">
                <div class="panel-head">
                  <span class="panel-icon"><Icon :name="m.icon" :size="18" /></span>
                  <h4>{{ m.name }}</h4>
                </div>
                <p class="panel-desc">{{ m.desc }}</p>
                <p class="panel-tips"><Icon name="lightbulb" :size="13" /> {{ m.tips }}</p>
              </div>
            </div>
          </section>

          <section class="help-section">
            <h3 class="section-title"><Icon name="lock" /> 身份与可见性</h3>
            <ul class="storage-list">
              <li><strong>班主任</strong>：15 个功能页全部可见。</li>
              <li><strong>非班主任 · 科任</strong>：隐藏座位表、值日生表、联系家长、请假信息、家校谈话、隐私信息 6 个班务 / 隐私页。</li>
              <li><strong>右上角设置</strong>：数据管理（学期与班级 / 班级信息 / 导入表格 / 备份与恢复）、使用说明、菜单设置。</li>
              <li><strong>数据隔离</strong>：所有记录挂在「学期 × 班级」桶里，切换学期或班级互不干扰，数据随 <code>teacher.json</code> 信封云同步。</li>
            </ul>
          </section>

          <section class="help-section">
            <h3 class="section-title"><Icon name="target" /> 推荐使用流程</h3>
            <ol class="flow-list">
              <li v-for="s in teacherFlow" :key="s.step">
                <span class="flow-step">{{ s.step }}</span>
                <span class="flow-text">{{ s.text }}</span>
              </li>
            </ol>
          </section>
        </template>

        <!-- ===== 标签 6：工具箱 ===== -->
        <template v-if="activeTab === 'toolbox'">
          <section class="help-section">
            <h3 class="section-title"><Icon name="grid" /> 工具箱</h3>
            <div class="panel-intro">
              <p>路由 <code>/toolbox</code>。129 个<strong>站内自建</strong>工具，覆盖开发、图片、PDF、证书、贷款、科学计算等场景，全部在浏览器本地运行，不跳转第三方站点、不上传文件到服务器。</p>
            </div>
            <div class="features-grid">
              <div v-for="c in toolboxCategories" :key="c.name" class="feature-item">
                <span class="feature-icon">{{ c.icon }}</span>
                <div class="feature-content">
                  <h4>{{ c.name }}</h4>
                  <p>{{ c.desc }}</p>
                </div>
              </div>
            </div>
          </section>

          <section class="help-section">
            <h3 class="section-title"><Icon name="lightbulb" /> 使用要点</h3>
            <ul class="storage-list">
              <li><strong>搜索</strong>：顶部搜索框支持建议与历史记录，输入工具名片段即可命中。</li>
              <li><strong>收藏</strong>：卡片右上角 ☆ 收藏后进入顶部「常用工具」区，常用工具置顶。</li>
              <li><strong>最近使用</strong>：顶栏常驻快捷条，按 <kbd>Alt + R</kbd> 唤起，找回刚用过的工具。</li>
              <li><strong>使用统计</strong>：按点击次数排序，可一键「重置统计」回到默认顺序。</li>
              <li><strong>云同步</strong>：收藏 / 最近使用 / 点击次数 / 搜索历史走独立的 <code>toolbox.json</code> 信封。</li>
              <li><strong>隐私</strong>：图片压缩、PDF 处理、哈希、加解密等都在本机浏览器完成，文件不出设备。</li>
            </ul>
          </section>
        </template>

        <!-- ===== 标签 7：智能工作台 ===== -->
        <template v-if="activeTab === 'smart'">
          <section class="help-section">
            <h3 class="section-title"><Icon name="lightbulb" /> 智能工作台</h3>
            <div class="panel-intro">
              <p>路由 <code>/smart</code>。管理你的技能库、提示词库与工作流库，数据走独立的 <code>smart.json</code> 信封，与其它工作台互不影响。</p>
            </div>
            <div class="panels-grid">
              <div v-for="m in smartModules" :key="m.name" class="panel-item">
                <div class="panel-head">
                  <span class="panel-icon"><Icon :name="m.icon" :size="18" /></span>
                  <h4>{{ m.name }}</h4>
                </div>
                <p class="panel-desc">{{ m.desc }}</p>
                <p class="panel-tips"><Icon name="lightbulb" :size="13" /> {{ m.tips }}</p>
              </div>
            </div>
          </section>

          <section class="help-section">
            <h3 class="section-title"><Icon name="cog" /> 使用要点</h3>
            <ul class="storage-list">
              <li><strong>菜单自定义</strong>：右上角设置里可改名、隐藏、拖拽排序，改动即时生效并随云同步。</li>
              <li><strong>技能分类</strong>：同一处设置里维护分类，技能列表按分类筛选。</li>
              <li><strong>导入预览</strong>：技能 / 提示词导入前先列出「新增 N / 更新 M / 跳过 K」与逐条名称，确认后才落库。</li>
              <li><strong>安全渲染</strong>：正文经 Markdown 渲染时关闭 HTML 注入（<code>html:false</code>），不会执行脚本。</li>
            </ul>
          </section>
        </template>

        <!-- ===== 标签 8：博客与图书馆 ===== -->
        <template v-if="activeTab === 'blog'">
          <section class="help-section">
            <h3 class="section-title"><Icon name="document" /> 博客</h3>
            <div class="panel-intro">
              <p>后台 <code>/blog/admin</code>（写作与管理），前台 <code>/blog</code> 与 <code>/blog/article/:slug</code>（阅读）。数据走独立的 <code>blog.json</code> 信封。</p>
            </div>
            <div class="panels-grid">
              <div v-for="m in blogModules" :key="m.name" class="panel-item">
                <div class="panel-head">
                  <span class="panel-icon"><Icon :name="m.icon" :size="18" /></span>
                  <h4>{{ m.name }}</h4>
                </div>
                <p class="panel-desc">{{ m.desc }}</p>
                <p class="panel-tips"><Icon name="lightbulb" :size="13" /> {{ m.tips }}</p>
              </div>
            </div>
          </section>

          <section class="help-section">
            <h3 class="section-title"><Icon name="bookmark" /> 个人图书馆</h3>
            <div class="panel-intro">
              <p>路由 <code>/books</code>，阅读页 <code>/books/read?id=xxx</code>。用来收纳随站点构建的静态书，以及你自己上传的 HTML 书。</p>
            </div>
            <div class="panels-grid">
              <div v-for="m in bookModules" :key="m.name" class="panel-item">
                <div class="panel-head">
                  <span class="panel-icon"><Icon :name="m.icon" :size="18" /></span>
                  <h4>{{ m.name }}</h4>
                </div>
                <p class="panel-desc">{{ m.desc }}</p>
                <p class="panel-tips"><Icon name="lightbulb" :size="13" /> {{ m.tips }}</p>
              </div>
            </div>
          </section>
        </template>

        <!-- ===== 标签 9：快捷键与数据 ===== -->
        <template v-if="activeTab === 'data'">
        <!-- 数据存储 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="save" /> 数据存储</h3>
          <ul class="storage-list">
            <li><strong>内置数据</strong>：构建进包（默认网址、示例数据、壁纸、预设图标、静态书、小游戏），不可动态修改</li>
            <li><strong>导航数据</strong>：存于 <code>IndexedDB</code> 的 <code>nav</code> store（网址 / 分类 / 搜索引擎 / 各类偏好），图标缓存独立存 <code>iconcache</code></li>
            <li><strong>各工作台数据</strong>：个人 / 销售 / 学生 / 教师 / 工具箱 / 智能台 / 博客各自独立 store，同在一个 <code>IndexedDB</code>（当前库版本 <code>23</code>）</li>
            <li><strong>密码数据</strong>：AES-CBC + PBKDF2 加密后存储，需主密码解锁才能查看</li>
            <li><strong>断链检测结果</strong>：存于 <code>localStorage</code>，关闭页面后保留</li>
            <li><strong>本机上传的书</strong>：只存当前设备的 <code>books</code> store，不参与云同步，也不进任何备份信封</li>
          </ul>
        </section>

        <!-- 网址导航快捷键 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="keyboard" /> 网址导航快捷键</h3>
          <div class="shortcuts-list">
            <div v-for="shortcut in shortcuts" :key="shortcut.key" class="shortcut-item">
              <kbd class="shortcut-key">{{ shortcut.key }}</kbd>
              <span class="shortcut-action">{{ shortcut.action }}</span>
            </div>
          </div>
        </section>

        <!-- 工作台快捷键 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="keyboard" /> 工作台快捷键</h3>
          <p class="panel-intro">以下快捷键在个人工作台与销售记账台中均生效。焦点位于输入框时，单键快捷键（g / [ / ]）不会触发，避免打断打字。</p>
          <div class="shortcuts-list">
            <div v-for="s in wbShortcuts" :key="s.key" class="shortcut-item">
              <kbd class="shortcut-key">{{ s.key }}</kbd>
              <span class="shortcut-action">{{ s.action }}</span>
            </div>
          </div>
        </section>

        <!-- 云同步 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="cloud" /> 云同步</h3>
          <ul class="storage-list">
            <li v-for="(note, i) in syncNotes" :key="i">{{ note }}</li>
          </ul>
        </section>

        <!-- 用智能体（技能）新增与修改数据 -->
        <section class="help-section">
          <h3 class="section-title"><Icon name="cog" /> 用智能体（技能）管理数据</h3>
          <p class="panel-intro">
            你的所有数据都会写成 <code>backup.json</code> 并随云同步落地到坚果云等 WebDAV 服务。
            配置好云同步后，无需手动导出导入——直接向 WorkBuddy 智能体说出需求，它会调用
            <code>{{ skillName }}</code> 技能，把网站与工作台内容写入云端备份文件，并在任意设备自动生效。
          </p>

          <div class="download-card">
            <div class="download-info">
              <span class="download-icon"><Icon name="package" /></span>
              <div>
                <h4>下载技能</h4>
                <p>技能含 <code>SKILL.md</code> 与 <code>add_entry.py</code>，解压到 <code>~/.workbuddy/skills/</code> 即可使用。</p>
              </div>
            </div>
            <div class="download-actions">
              <button class="btn-download" @click="downloadSkill">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                下载技能
              </button>
            </div>
          </div>

          <h4 class="sub-title">提示词示例</h4>
          <p class="sub-desc">以下说法都会触发技能，直接对智能体说即可（替换为你自己的内容）：</p>
          <div class="skill-prompts">
            <div v-for="p in skillPrompts" :key="p.scenario" class="skill-prompt">
              <span class="skill-prompt-label">{{ p.scenario }}</span>
              <pre class="code-block">{{ p.text }}</pre>
            </div>
          </div>

          <p class="skill-note"><Icon name="info" :size="13" /> 技能当前支持「新增 / 记录」网站与工作台内容；修改或删除已有条目请在对应管理界面操作。</p>

          <h4 class="sub-title">技能安装</h4>
          <ol class="flow-list">
            <li v-for="s in skillInstall" :key="s.step">
              <span class="flow-step">{{ s.step }}</span>
              <span class="flow-text">{{ s.text }}</span>
            </li>
          </ol>
        </section>
        </template>
    </div>

    <template #footer>
      <button class="btn-primary" @click="acknowledgeHelp">知道了</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
/* 弹框外壳（遮罩/面板/头部/关闭/主体/滚动/移动端适配）已统一到 common/BaseDialog.vue，
   本组件仅保留标签栏、各标签页正文与底部按钮等内容样式 */

/* 各标签页正文容器：只保留原 .modal-body 的纵向排布（外壳 padding/滚动已由基类接管） */
.help-content {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.help-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-primary, #3b82f6);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

/* 功能网格 */
.features-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  background-color: var(--color-bg, #f8fafc);
  border-radius: 10px;
  border: 1px solid var(--color-border, #e2e8f0);
}

.feature-icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.feature-content h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.feature-content p {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  line-height: 1.5;
}

/* 快捷键列表 */
.shortcuts-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background-color: var(--color-bg, #f8fafc);
  border-radius: 8px;
}

.shortcut-key {
  background-color: var(--color-bg-active, #e2e8f0);
  color: var(--color-primary, #3b82f6);
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  white-space: nowrap;
}

.shortcut-action {
  font-size: 13px;
  color: #475569;
}

/* 页面模式 */
.mode-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mode-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background-color: var(--color-bg, #f8fafc);
  border-radius: 10px;
}

.mode-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.mode-admin {
  background-color: #eff6ff;
  color: var(--color-primary, #3b82f6);
}

.mode-item p {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
  line-height: 1.5;
}

.mode-item code {
  background-color: var(--color-bg-active, #e2e8f0);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-primary, #3b82f6);
}

/* 数据存储 */
.storage-list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.storage-list li {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}

.storage-list strong {
  color: var(--color-text, #1e293b);
}

.storage-list code {
  background-color: var(--color-bg-active, #e2e8f0);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-primary, #3b82f6);
}

/* 底部 */
/* 底部：原为居中单按钮，基类 .bd-footer 默认右对齐，这里局部改回居中 */
.help-dialog :deep(.bd-footer) {
  justify-content: center;
}

.btn-primary {
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

.btn-primary:hover {
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

/* 示例数据下载 */
.download-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
  border-radius: 12px;
  border: 1px solid #bfdbfe;
}

.download-info {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.download-icon {
  font-size: 28px;
  flex-shrink: 0;
  margin-top: 2px;
}

.download-info h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.download-info p {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  line-height: 1.5;
}

.download-info code {
  background-color: var(--color-bg-active, #e2e8f0);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-primary, #3b82f6);
}

.sync-account {
  list-style: none;
  padding: 0;
  margin: 8px 0;
  display: grid;
  gap: 6px;
}

.sync-account li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  flex-wrap: wrap;
}

.sync-label {
  flex-shrink: 0;
  width: 56px;
  color: var(--color-text-secondary, #64748b);
}

.btn-copy {
  padding: 2px 10px;
  font-size: 12px;
  border: 1px solid #cbd5e1;
  background: var(--color-bg-card, #ffffff);
  color: #475569;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-copy:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}

.download-info .sync-note {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-top: 8px;
  line-height: 1.6;
}

.btn-download {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background-color: var(--color-primary, #3b82f6);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background-color 0.2s;
}

.btn-download:hover {
  background-color: var(--color-primary-hover, #2563eb);
}

.download-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

/* 标签页导航：原为头部与正文之间的整宽条，现落在 .bd-body 内，
   用负外边距抵消基类正文 padding 保持通栏观感 */
.help-tabs {
  display: flex;
  /* 9 个标签在窄屏下换行而不是横向滚出可视区（曾致首个标签被滚走、用户以为功能缺失） */
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 16px;
  margin: 0 calc(-1 * var(--space-6, 24px)) 20px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  flex-shrink: 0;
}

.help-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s, border-color 0.2s;
}

.help-tab:hover {
  color: var(--color-primary, #3b82f6);
}

.help-tab.active {
  color: var(--color-primary, #3b82f6);
  border-bottom-color: var(--color-primary, #3b82f6);
}

.help-tab-icon {
  display: inline-flex;
  align-items: center;
}

/* 模块说明 */
.panel-intro {
  margin: 0;
  padding: 12px 14px;
  background-color: var(--color-bg, #f8fafc);
  border-radius: 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}

.panel-intro code {
  background-color: var(--color-bg-active, #e2e8f0);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-primary, #3b82f6);
}

.panels-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.panel-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  background-color: var(--color-bg, #f8fafc);
  border-radius: 10px;
  border: 1px solid var(--color-border, #e2e8f0);
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-primary, #3b82f6);
  flex-shrink: 0;
}

.panel-head h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.panel-desc {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  line-height: 1.6;
}

.panel-tips {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: 0;
  padding-top: 6px;
  border-top: 1px dashed var(--color-border, #e2e8f0);
  font-size: 11px;
  color: var(--color-text-muted, #94a3b8);
  line-height: 1.5;
}

.panel-tips :deep(svg) {
  margin-top: 2px;
  flex-shrink: 0;
}

/* 公式列表 */
.formula-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.formula-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  background-color: var(--color-bg, #f8fafc);
  border-radius: 8px;
  border: 1px solid var(--color-border, #e2e8f0);
}

.formula-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  white-space: nowrap;
}

.formula-expr {
  font-size: 12px;
  color: var(--color-primary, #3b82f6);
  background-color: #eff6ff;
  padding: 3px 8px;
  border-radius: 6px;
  white-space: nowrap;
}

.formula-note {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  line-height: 1.6;
}

/* 流程列表 */
.flow-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.flow-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background-color: var(--color-bg, #f8fafc);
  border-radius: 8px;
  border: 1px solid var(--color-border, #e2e8f0);
}

.flow-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--color-primary, #3b82f6);
  color: white;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.flow-text {
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
}

/* 响应式 */
@media (max-width: 600px) {
  .features-grid {
    grid-template-columns: 1fr;
  }

  .shortcuts-list {
    grid-template-columns: 1fr;
  }

  .panels-grid,
  .formula-list {
    grid-template-columns: 1fr;
  }

  .formula-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .help-tab {
    padding: 10px;
    font-size: 12px;
  }

  .download-card {
    flex-direction: column;
    align-items: stretch;
  }

  .btn-download {
    justify-content: center;
  }
}

/* 技能说明 */
.sub-title {
  margin: 4px 0 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.sub-desc {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  line-height: 1.5;
}

.skill-prompts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skill-prompt {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  background-color: var(--color-bg, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
}

.skill-prompt-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary, #3b82f6);
}

.code-block {
  margin: 0;
  padding: 8px 10px;
  background-color: #0f172a;
  color: #e2e8f0;
  border-radius: 8px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.skill-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 4px 0 0 0;
  padding: 10px 12px;
  background-color: #eff6ff;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  font-size: 12px;
  color: #475569;
  line-height: 1.5;
}

.skill-note :deep(svg) {
  margin-top: 2px;
  flex-shrink: 0;
  color: var(--color-primary, #3b82f6);
}
</style>
