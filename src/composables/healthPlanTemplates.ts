// 健康「方案模板」纯数据与纯函数模块。
//
// 内容来源：用户提供的训练/饮食海报（原图 422×1920，表格逐格仅约 20px）。
// 关键转录约定：
//   1. 训练动作、组数、休息时长、进阶/退阶、区域说明 —— 已按原图逐条核对；
//   2. 30 天减脂餐单 —— 由用户在微信里 OCR 后提供，逐格顺序存在串行风险，
//      故每日条目挂 trust 标记（high/mid/low），UI 必须如实展示，不得当作已确认数据；
//   3. 海报没有给出的数值（每餐热量）一律不编造，留空由使用者自己填。
//
// 运行时依赖仅 '../types/index.ts' 的类型（全部 type-only，编译后擦除），
// 因此 node --experimental-strip-types 可直接跑本模块做单元测试。

import type { HealthWeeklyPlanItem } from '../types'
import type {
  DietPlanTemplate,
  DietPlanWeek,
  ExercisePlanDay,
  ExercisePlanTemplate
} from '../types'

/** 生成周计划条目 id（与各面板内联生成的格式保持一致） */
function planItemId(): string {
  return `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ==================== 跟练方案：俯卧撑板 · 一周循环 ====================

/** 部位色键 → 面板里的 chip 类名 */
export type PlanPartTone = 'back' | 'arm' | 'shoulder' | 'chest'

const PUSHUP_PLAN: ExercisePlanTemplate = {
  id: 'pushup-cycle',
  kind: 'exercise',
  name: '俯卧撑板 · 一周循环跟练',
  desc: '力量薄弱、做不了标准俯卧撑，也能从跪姿开始练',
  goal: '胸 · 肩 · 背 · 手臂 · 核心',
  minutes: '12–18 分钟 / 次',
  mode: '练 1 休 1 循环，新手可降次数，每组做到力竭前 2–3 次',
  advance:
    '当动作可以轻松完成每组上限次数，就增加每组次数，比如宽距俯卧撑做到 15 次／组；或放慢下放速度（3 秒下放、1 秒推起）。',
  regress: '力量不足时，膝盖跪地做俯卧撑变体；折刀俯卧撑力量不够直接用横握俯卧撑替代。',
  zones: [
    { tone: 'back', label: '背部 / 倒三角', color: '#ef4444' },
    { tone: 'arm', label: '手臂 / 三头肌', color: '#f59e0b' },
    { tone: 'shoulder', label: '肩部', color: '#10b981' },
    { tone: 'chest', label: '胸大肌 / 腹部', color: '#3b82f6' }
  ],
  caution: '如有不适立即停止；组间休息严格参照表格；休息日做简单拉伸。',
  days: [
    {
      day: 1,
      role: '完整主训练日',
      isRest: false,
      restText: '组间休息 60s',
      foot: '训练后：胸、肩、手臂拉伸 5–8 分钟',
      moves: [
        { name: '宽距斜握俯卧撑', part: '背', partTone: 'back', sets: 2, dose: '2 组 × 6–8 次' },
        { name: '钻石俯卧撑', part: '手臂', partTone: 'arm', sets: 2, dose: '2 组 × 3–4 次' },
        { name: '宽距俯卧撑', part: '胸', partTone: 'chest', sets: 3, dose: '3 组 × 6–8 次' },
        { name: '折刀俯卧撑', part: '肩', partTone: 'shoulder', sets: 2, dose: '2 组 × 4–6 次' },
        { name: '登山跑', part: '腹部', partTone: 'chest', sets: 2, dose: '2 组 × 20 秒' }
      ]
    },
    { day: 2, role: '休息日', isRest: true, foot: '休息日做简单拉伸', moves: [] },
    {
      day: 3,
      role: '轻量巩固训练',
      isRest: false,
      restText: '组间休息 60s',
      foot: '减负：不做反手俯卧撑、横握俯卧撑',
      moves: [
        { name: '宽距斜握俯卧撑', part: '背', partTone: 'back', sets: 2, dose: '2 组 × 6–8 次' },
        { name: '钻石俯卧撑', part: '手臂', partTone: 'arm', sets: 2, dose: '2 组 × 3–4 次' },
        { name: '宽距俯卧撑', part: '胸', partTone: 'chest', sets: 3, dose: '3 组 × 6–8 次' },
        { name: '折刀俯卧撑', part: '肩', partTone: 'shoulder', sets: 2, dose: '2 组 × 4–6 次' }
      ]
    },
    { day: 4, role: '休息日', isRest: true, foot: '休息日做简单拉伸', moves: [] },
    {
      day: 5,
      role: '分化侧重训练日',
      isRest: false,
      restText: '组间休息 45s',
      foot: '减量：每个俯卧撑各做 2 组',
      moves: [
        { name: '钻石俯卧撑', part: '手臂', partTone: 'arm', sets: 2, dose: '2 组 × 3–4 次' },
        { name: '横握俯卧撑', part: '肩前束', partTone: 'shoulder', sets: 2, dose: '2 组 × 6–8 次' },
        { name: '折刀俯卧撑', part: '肩', partTone: 'shoulder', sets: 2, dose: '2 组 × 4–6 次' },
        { name: '登山跑', part: '腹部', partTone: 'chest', sets: 2, dose: '2 组 × 20 秒' }
      ]
    },
    { day: 6, role: '休息日', isRest: true, foot: '休息日做简单拉伸', moves: [] },
    {
      day: 7,
      role: '轻量激活训练日',
      isRest: false,
      restText: '组间休息 60s',
      foot: '训练后：胸、肩、手臂拉伸 5–8 分钟',
      moves: [
        { name: '宽距斜握俯卧撑', part: '背', partTone: 'back', sets: 2, dose: '2 组 × 6–8 次' },
        { name: '钻石俯卧撑', part: '手臂', partTone: 'arm', sets: 2, dose: '2 组 × 3–4 次' },
        { name: '宽距俯卧撑', part: '胸', partTone: 'chest', sets: 3, dose: '3 组 × 6–8 次' },
        { name: '登山跑', part: '腹部', partTone: 'chest', sets: 2, dose: '2 组 × 20 秒' }
      ]
    }
  ]
}

export const EXERCISE_PLAN_TEMPLATES: ExercisePlanTemplate[] = [PUSHUP_PLAN]

// ==================== 食谱方案 A：小基数 4 周少食多餐增肌 ====================

const GAIN_WEEKS: DietPlanWeek[] = [
  {
    week: 1,
    title: '适应期',
    desc: '肠胃过渡，建立进食节奏',
    goal: '固定进食节奏，肠胃适应多餐模式，不强行加大食量',
    meals: [
      { key: 'breakfast', label: '早餐', time: '07:00', items: ['全麦面包 2 片', '鸡蛋 2 个（1 全蛋 1 蛋白）', '纯牛奶 250ml', '小番茄 6 颗'] },
      { key: 'am', label: '上午加餐', time: '10:00', items: ['香蕉 1 根', '乳清蛋白 1 勺（可选）／水煮蛋 2 个'] },
      { key: 'lunch', label: '午餐', time: '12:30', items: ['糙米／杂粮饭 100g（熟重）', '香煎鸡胸肉 120g', '清炒西兰花 200g'] },
      { key: 'pm', label: '下午加餐', time: '16:00', items: ['苹果 1 个', '即食鸡胸肉 80g'] },
      { key: 'dinner', label: '晚餐', time: '18:30', items: ['清蒸鱼 120g', '红薯 100g', '凉拌菠菜 200g'] }
    ]
  },
  {
    week: 2,
    title: '提升期',
    desc: '缓慢提总热量，增加蛋白质',
    goal: '碳水、蛋白小幅上涨，配合力量训练，启动肌肉合成',
    meals: [
      { key: 'breakfast', label: '早餐', time: '07:00', items: ['干燕麦 50g（牛奶冲泡）', '全蛋 2 个', '蓝莓一小把'] },
      { key: 'am', label: '上午加餐', time: '10:00', items: ['全麦小馒头 1 个', '低脂奶酪 30g'] },
      { key: 'lunch', label: '午餐', time: '12:30', items: ['杂粮饭 120g（熟重）', '瘦牛肉 130g', '彩椒菌菇 200g'] },
      { key: 'pm', label: '下午加餐', time: '16:00', items: ['苹果 1 个', '即食鸡胸肉 80g'] },
      { key: 'dinner', label: '晚餐', time: '18:30', items: ['虾仁 130g', '玉米 1 根', '油麦菜 200g'] }
    ]
  },
  {
    week: 3,
    title: '强化期',
    desc: '拉高蛋白质，充足碳水供训练',
    goal: '达到增肌所需热量，坚持力量训练，每日睡眠 ≥ 7 小时',
    meals: [
      { key: 'breakfast', label: '早餐', time: '07:00', items: ['荞麦包子 2 个', '鸡蛋 2 个', '豆浆 300ml'] },
      { key: 'am', label: '上午加餐', time: '10:00', items: ['希腊酸奶 180g', '燕麦片 20g'] },
      { key: 'lunch', label: '午餐', time: '12:30', items: ['藜麦米饭 130g（熟重）', '去皮鸡腿肉 140g', '娃娃菜 200g'] },
      { key: 'pm', label: '下午加餐', time: '16:00', items: ['橙子 1 个', '水煮蛋白 3 个'] },
      { key: 'dinner', label: '晚餐', time: '18:30', items: ['瘦猪里脊 130g', '山药 150g', '凉拌黄瓜木耳 200g'] }
    ]
  },
  {
    week: 4,
    title: '巩固期',
    desc: '固化增肌饮食模式，可循环复用',
    goal: '饮食模式养成，结束后循环 3–4 周食谱持续增肌',
    meals: [
      { key: 'breakfast', label: '早餐', time: '07:00', items: ['全麦卷饼 1 张', '鸡蛋 2 个', '生菜', '纯牛奶 250ml'] },
      { key: 'am', label: '上午加餐', time: '10:00', items: ['梨 1 个', '原味坚果 12g'] },
      { key: 'lunch', label: '午餐', time: '12:30', items: ['杂粮饭 130g（熟重）', '巴沙鱼 140g', '西兰花胡萝卜 220g'] },
      { key: 'pm', label: '下午加餐', time: '16:00', items: ['无糖酸奶', '全麦面包 1 小片'] },
      { key: 'dinner', label: '晚餐', time: '18:30', items: ['豆腐 200g + 牛肉 100g 炖菜', '紫薯 120g', '绿叶菜 200g'] }
    ]
  }
]

// ==================== 食谱方案 B：大基数 30 天塑形减脂 ====================
//
// trust 说明（必须如实呈现，见文件头第 2 条）：
//   high — OCR 里「早/午/晚」三列连续成句，已与原图对照
//   mid  — OCR 文本与第 1 段几乎逐字重合，可能两段共用菜单，也可能串行
//   low  — OCR 里三列被打散，单格内容可靠但归属天数有错位风险

const LOSS_STAGES: DietPlanStageData[] = [
  {
    range: '第 1–10 天',
    name: '适应消水肿阶段',
    trust: 'high',
    days: [
      { day: 1, breakfast: '燕麦粥 + 鸡蛋', lunch: '杂粮饭 + 炒瘦肉 + 青菜', dinner: '清蒸鱼 + 黄瓜' },
      { day: 2, breakfast: '玉米 + 鸡蛋 + 豆浆', lunch: '红薯 + 白灼虾 + 油麦菜', dinner: '清蒸鱼 + 黄瓜' },
      { day: 3, breakfast: '全麦馒头 + 鸡蛋', lunch: '半碗饭 + 青椒牛肉 + 冬瓜汤', dinner: '豆腐炒蛋 + 海带丝' },
      { day: 4, breakfast: '小米粥 + 鸡蛋', lunch: '玉米 + 红烧鱼 + 西兰花', dinner: '水煮蛋 + 生菜' },
      { day: 5, breakfast: '红薯 + 鸡蛋', lunch: '玉米 + 红烧鱼', dinner: '虾仁蒸蛋 + 生菜' },
      { day: 6, breakfast: '红薯 + 鸡蛋 + 牛奶', lunch: '杂粮饭 + 芹菜瘦肉 + 紫菜汤', dinner: '瘦肉 + 娃娃菜' },
      { day: 7, breakfast: '少油鸡蛋饼 + 豆浆', lunch: '半碗饭 + 番茄炒蛋 + 豆角', dinner: '蒸鱼 + 黄瓜' },
      { day: 8, breakfast: '燕麦 + 鸡蛋 + 苹果', lunch: '红薯 + 小炒牛肉 + 生菜', dinner: '豆腐汤 + 青菜' },
      { day: 9, breakfast: '玉米 + 鸡蛋', lunch: '杂粮饭 + 炒虾仁 + 西葫芦', dinner: '瘦肉冬瓜汤 + 木耳' },
      { day: 10, breakfast: '小米粥 + 鸡蛋', lunch: '半碗饭 + 红烧鲜鱼 + 青菜', dinner: '鸡蛋豆腐 + 生菜' }
    ]
  },
  {
    range: '第 11–20 天',
    name: '燃脂塑形阶段',
    trust: 'mid',
    days: [
      { day: 11, breakfast: '燕麦粥 + 鸡蛋', lunch: '杂粮饭 + 炒瘦肉 + 青菜', dinner: '清蒸鱼 + 黄瓜' },
      { day: 12, breakfast: '玉米 + 鸡蛋 + 豆浆', lunch: '红薯 + 白灼虾 + 油麦菜', dinner: '清蒸鱼 + 黄瓜' },
      { day: 13, breakfast: '全麦馒头 + 鸡蛋', lunch: '半碗饭 + 青椒牛肉 + 冬瓜汤', dinner: '豆腐炒蛋 + 海带丝' },
      { day: 14, breakfast: '小米粥 + 鸡蛋', lunch: '玉米 + 红烧鱼 + 西兰花', dinner: '水煮蛋 + 生菜' },
      { day: 15, breakfast: '红薯 + 鸡蛋', lunch: '玉米 + 红烧鱼', dinner: '虾仁蒸蛋 + 生菜' },
      { day: 16, breakfast: '红薯 + 鸡蛋 + 牛奶', lunch: '杂粮饭 + 芹菜瘦肉 + 紫菜汤', dinner: '瘦肉 + 娃娃菜' },
      { day: 17, breakfast: '少油鸡蛋饼 + 豆浆', lunch: '半碗饭 + 番茄炒蛋 + 豆角', dinner: '蒸鱼 + 黄瓜' },
      { day: 18, breakfast: '燕麦 + 鸡蛋 + 苹果', lunch: '红薯 + 小炒牛肉 + 生菜', dinner: '豆腐汤 + 青菜' },
      { day: 19, breakfast: '玉米 + 鸡蛋', lunch: '杂粮饭 + 炒虾仁 + 西葫芦', dinner: '瘦肉冬瓜汤 + 木耳' },
      { day: 20, breakfast: '小米粥 + 鸡蛋', lunch: '半碗饭 + 红烧鲜鱼 + 青菜', dinner: '鸡蛋豆腐 + 生菜' }
    ]
  },
  {
    range: '第 21–30 天',
    name: '线条巩固阶段',
    trust: 'low',
    days: [
      { day: 21, breakfast: '红薯 + 小炒肉 + 青菜', lunch: '杂粮饭 + 清蒸鱼 + 冬瓜', dinner: '瘦肉蘑菇 + 生菜' },
      { day: 22, breakfast: '燕麦 + 鸡蛋', lunch: '半碗饭 + 青椒牛肉 + 番茄', dinner: '蒸鱼 + 菠菜' },
      { day: 23, breakfast: '玉米 + 鸡蛋 + 豆浆', lunch: '玉米 + 芹菜炒虾 + 油麦菜', dinner: '红薯 + 鸡蛋 + 苹果' },
      { day: 24, breakfast: '小米粥 + 鸡蛋', lunch: '豆腐汤 + 鸡蛋', dinner: '蒸蛋 + 黄瓜' },
      { day: 25, breakfast: '鸡蛋 + 牛奶 + 馒头', lunch: '杂粮饭 + 番茄炒蛋 + 豆角', dinner: '半碗饭 + 红烧鱼块 + 西兰花' },
      { day: 26, breakfast: '红薯 + 鸡蛋', lunch: '燕麦 + 鸡蛋 + 橙子', dinner: '瘦肉 + 生菜' },
      { day: 27, breakfast: '鸡蛋 + 牛奶 + 面包', lunch: '红薯 + 小炒牛肉 + 青菜', dinner: '虾仁黄瓜 + 生菜' },
      { day: 28, breakfast: '小米粥 + 鸡蛋 + 苹果', lunch: '杂粮饭 + 瘦肉芹菜', dinner: '紫菜汤' },
      { day: 29, breakfast: '玉米 + 鸡蛋 + 豆浆', lunch: '玉米 + 白灼虾 + 冬瓜', dinner: '豆腐青菜 + 鸡蛋' },
      { day: 30, breakfast: '全麦面包 + 鸡蛋 + 牛奶', lunch: '杂粮饭 + 青椒炒肉', dinner: '番茄汤 + 鱼 + 西兰花' }
    ]
  }
]

interface DietPlanStageData {
  range: string
  name: string
  trust: 'high' | 'mid' | 'low'
  days: { day: number; breakfast: string; lunch: string; dinner: string }[]
}

const GAIN_PLAN: DietPlanTemplate = {
  id: 'gain-4w',
  kind: 'diet',
  name: '小基数 · 4 周少食多餐增肌食谱',
  desc: '一日 5 餐 · 居家易做 · 普通大众适用',
  meta: ['热量参考：女生 1800–2000 · 男生 2200–2400 大卡', '蛋白质 1.6–2.0 g／kg 体重'],
  rules: [
    '一日 5 餐，少食多餐，禁止暴饮暴食',
    '每餐优先摄入蛋白质，碳水选复合碳水，蔬菜足量',
    '每日饮水 2–2.5L；训练日可适当增加主食',
    '每周安排 1 次放松餐，切忌暴食；支持同类食材互换'
  ],
  weeks: GAIN_WEEKS,
  swaps: [
    { title: '蛋白类互换', text: '鸡胸肉、鱼虾、瘦牛肉、瘦猪肉、鸡蛋、豆腐；乳清蛋白／希腊酸奶' },
    { title: '碳水互换', text: '糙米、杂粮饭、红薯、紫薯、玉米、山药、燕麦、全麦制品' },
    { title: '蔬菜互换', text: '各类绿叶菜、菌菇、彩椒、番茄、黄瓜' }
  ],
  footer: '食材可同类互换；配合力量训练效果更好；个体存在差异，食谱仅供参考。'
}

const LOSS_PLAN: DietPlanTemplate = {
  id: 'loss-30d',
  kind: 'diet',
  name: '大基数 · 4 周塑形减脂饮食计划',
  desc: '一分练，三分吃 — 吃对三餐，比盲目训练更重要',
  meta: [],
  rules: [
    '早：粗粮主食 + 鸡蛋 + 奶／豆浆',
    '午：半碗粗粮饭 + 手掌大肉／鱼／虾 + 大量蔬菜',
    '晚：蛋白质 + 蔬菜，主食尽量不吃',
    '每天喝够 1500–2000ml 温水，不喝奶茶饮料'
  ],
  targets: ['腰围明显变小', '体脂率下降', '体能和运动习惯稳定', '帮助肌肉修复，背更薄、腰更细、臀腿更紧致'],
  prePost: ['练前 30 分钟：一根香蕉／几片饼干', '练后 30 分钟：一杯牛奶／两个鸡蛋'],
  stages: LOSS_STAGES,
  footer: '餐单中第 2、3 段由原图 OCR 转录，逐日对应关系仍需核对。'
}

export const DIET_PLAN_TEMPLATES: DietPlanTemplate[] = [GAIN_PLAN, LOSS_PLAN]

// ==================== 纯函数 ====================

/** 方案里某个训练日的总组数 */
export function planDayTotalSets(day: ExercisePlanDay): number {
  return day.moves.reduce((sum, m) => sum + m.sets, 0)
}

/** 勾选进度的稳定键：同一方案的同一天同一动作同一组 */
export function progressKey(templateId: string, moveIndex: number, setIndex: number): string {
  return `${templateId}:${moveIndex}:${setIndex}`
}

/** 已勾选组数 */
export function planDayDoneSets(day: ExercisePlanDay, tplId: string, checked: readonly string[]): number {
  if (day.isRest) return 0
  let n = 0
  day.moves.forEach((m, mi) => {
    for (let si = 0; si < m.sets; si++) {
      if (checked.includes(progressKey(tplId, mi, si))) n++
    }
  })
  return n
}

/**
 * 把跟练方案展开成本周运动周计划条目。
 * - 早晨行：训练日写方案名 + 「N 项 · M 组」；休息日写「休息」
 * - 傍晚行：仅当脚注提到「拉伸」才写，避免把「减负/减量」硬套成拉伸时长
 */
export function buildExerciseWeekItems(tpl: ExercisePlanTemplate): HealthWeeklyPlanItem[] {
  const items: HealthWeeklyPlanItem[] = []
  for (const d of tpl.days) {
    if (d.isRest) {
      items.push({ id: planItemId(), day: d.day, rowKey: 'morning', name: '休息', value: '拉伸', done: false })
      continue
    }
    items.push({
      id: planItemId(),
      day: d.day,
      rowKey: 'morning',
      name: tpl.name,
      value: `${d.moves.length} 项 · ${planDayTotalSets(d)} 组`,
      done: false
    })
    if (d.foot && d.foot.includes('拉伸')) {
      items.push({ id: planItemId(), day: d.day, rowKey: 'evening', name: '拉伸放松', value: '5–8 分钟', done: false })
    }
  }
  return items
}

/**
 * 把食谱方案某一周展开成本周饮食周计划条目（早/午/晚三行 × 7 天）。
 * 加餐没有对应行，合并进上一餐的 value 里展示，不丢信息。
 */
export function buildDietWeekItems(tpl: DietPlanTemplate, weekIndex: number): HealthWeeklyPlanItem[] {
  const weeks = tpl.weeks ?? []
  const w = weeks[weekIndex]
  if (!w) return []
  const pick = (key: string): string =>
    (w.meals.find(m => m.key === key)?.items ?? []).join(' · ')
  const items: HealthWeeklyPlanItem[] = []
  for (let day = 1; day <= 7; day++) {
    for (const rowKey of ['breakfast', 'lunch', 'dinner'] as const) {
      const text = pick(rowKey)
      if (!text) continue
      items.push({ id: planItemId(), day, rowKey, name: text, done: false })
    }
  }
  return items
}

/** 找出今天应该执行第几周（按方案启用日期起算，7 天一周，循环到 4 周封顶） */
export function activeGainWeekIndex(startDateKey: string, todayKey: string, weekCount: number): number {
  const start = Date.parse(`${startDateKey}T00:00:00`)
  const today = Date.parse(`${todayKey}T00:00:00`)
  if (!Number.isFinite(start) || !Number.isFinite(today) || today < start) return 0
  const days = Math.floor((today - start) / 86400000)
  return Math.min(Math.floor(days / 7), Math.max(weekCount - 1, 0))
}

export const PLAN_TRUST_LABEL: Record<'high' | 'mid' | 'low', string> = {
  high: '已核',
  mid: '待核',
  low: '待核'
}

export const PLAN_TRUST_NOTE: Record<'high' | 'mid' | 'low', string> = {
  high: '本段餐单在 OCR 里三列连续成句，已与原图对照，可直接使用。',
  mid: '本段 OCR 文本与第 1 段几乎逐字重合（可能是原图两段共用同一套菜单，也可能串行），请核对后使用。',
  low: '本段 OCR 里早/午/晚三列被打散，单格内容可靠但「哪一格属于哪一天」有错位风险，请按原图核对。'
}
