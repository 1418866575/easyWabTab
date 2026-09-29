/**
 * BMI / 基础代谢 / 每日热量计算纯函数（零依赖）
 * BMR 使用 Mifflin-St Jeor 公式；标准支持 WHO 与亚太两套。
 */

export type Sex = 'male' | 'female'
export type ActivityLevel = 1 | 2 | 3 | 4 | 5

export const ACTIVITY_LEVELS: { id: ActivityLevel; name: string; factor: number }[] = [
  { id: 1, name: '久坐（几乎不运动）', factor: 1.2 },
  { id: 2, name: '轻度活动（每周 1-3 次）', factor: 1.375 },
  { id: 3, name: '中度活动（每周 3-5 次）', factor: 1.55 },
  { id: 4, name: '高度活动（每周 6-7 次）', factor: 1.725 },
  { id: 5, name: '极高强度（体力劳动/专业训练）', factor: 1.9 }
]

export interface BmiInput {
  height: number
  weight: number
  age: number
  sex: Sex
  activity: ActivityLevel
  standard?: 'who' | 'asia'
  macroRatio?: { protein: number; fat: number; carb: number }
}

export interface BmiResult {
  ok: boolean
  error?: string
  bmi: number
  bmiLevel: string
  bmr: number
  tdee: number
  idealRange: { min: number; max: number }
  target: { cut: number; maintain: number; bulk: number }
  macros: { protein: number; fat: number; carb: number }
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** BMI 与分级 */
export function bmiLevel(bmi: number, standard: 'who' | 'asia' = 'who'): string {
  const over = standard === 'asia' ? 23 : 25
  const obese = standard === 'asia' ? 25 : 30
  if (bmi < 18.5) return '偏瘦'
  if (bmi < over) return '正常'
  if (bmi < obese) return '超重'
  if (bmi < (standard === 'asia' ? 30 : 35)) return '肥胖 I 度'
  if (bmi < 40) return '肥胖 II 度'
  return '肥胖 III 度'
}

/** 基础代谢 BMR（Mifflin-St Jeor） */
export function bmr(sex: Sex, weight: number, height: number, age: number): number {
  const base = 10 * weight + 6.25 * height - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

/** 每日总消耗 TDEE */
export function tdee(bmrValue: number, activity: ActivityLevel): number {
  const lv = ACTIVITY_LEVELS.find(a => a.id === activity) || ACTIVITY_LEVELS[0]
  return bmrValue * lv.factor
}

/** 理想体重区间 */
export function idealWeight(height: number, standard: 'who' | 'asia' = 'who'): { min: number; max: number } {
  const h = height / 100
  const over = standard === 'asia' ? 23 : 24.9
  return { min: r1(18.5 * h * h), max: r1(over * h * h) }
}

/** 三大营养素（克） */
export function macros(calories: number, ratio = { protein: 30, fat: 25, carb: 45 }): { protein: number; fat: number; carb: number } {
  return {
    protein: Math.round((calories * ratio.protein) / 100 / 4),
    fat: Math.round((calories * ratio.fat) / 100 / 9),
    carb: Math.round((calories * ratio.carb) / 100 / 4)
  }
}

/** 综合计算 */
export function calcBmi(input: BmiInput): BmiResult {
  const { height, weight, age, sex } = input
  if (!Number.isFinite(height) || height < 50 || height > 250) return fail('身高需在 50–250 cm 之间')
  if (!Number.isFinite(weight) || weight < 20 || weight > 300) return fail('体重需在 20–300 kg 之间')
  if (!Number.isFinite(age) || age < 12 || age > 100) return fail('年龄需在 12–100 岁之间')
  const standard = input.standard || 'who'
  const ratio = input.macroRatio || { protein: 30, fat: 25, carb: 45 }
  const sum = ratio.protein + ratio.fat + ratio.carb
  if (Math.abs(sum - 100) > 0.01) return fail('三大营养素比例之和需为 100%')
  const h = height / 100
  const bmiValue = r1(weight / (h * h))
  const bmrValue = r1(bmr(sex, weight, height, age))
  const tdeeValue = r1(tdee(bmrValue, input.activity))
  return {
    ok: true,
    bmi: bmiValue,
    bmiLevel: bmiLevel(bmiValue, standard),
    bmr: bmrValue,
    tdee: tdeeValue,
    idealRange: idealWeight(height, standard),
    target: { cut: Math.round(tdeeValue - 500), maintain: Math.round(tdeeValue), bulk: Math.round(tdeeValue + 500) },
    macros: macros(tdeeValue, ratio)
  }
}

function fail(error: string): BmiResult {
  return { ok: false, error, bmi: 0, bmiLevel: '', bmr: 0, tdee: 0, idealRange: { min: 0, max: 0 }, target: { cut: 0, maintain: 0, bulk: 0 }, macros: { protein: 0, fat: 0, carb: 0 } }
}
