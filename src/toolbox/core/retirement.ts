/**
 * 渐进式延迟法定退休年龄计算（纯函数，零依赖）
 *
 * 政策依据：
 * - 全国人大常委会 2024-09-13《关于实施渐进式延迟法定退休年龄的决定》
 * - 国务院《关于渐进式延迟法定退休年龄的办法》
 * - 自 2025 年 1 月 1 日起施行，用 15 年时间逐步延迟。
 *
 * 规则（按出生年月确定，不是「退休年份」）：
 * - 男职工：60 → 63 岁，每 4 个月出生延迟 1 个月（起点 1965-01）。
 * - 女职工（原法定 55 岁，干部/管理技术岗）：55 → 58 岁，每 4 个月延迟 1 个月（起点 1970-01）。
 * - 女职工（原法定 50 岁，工人岗）：50 → 55 岁，每 2 个月延迟 1 个月（起点 1975-01）。
 *
 * 弹性退休：可在法定退休年龄前后最多 3 年内自主选择；
 *   提前不得低于原法定退休年龄，且需满足当年最低缴费年限；延迟需与单位协商一致。
 *
 * 最低缴费年限：2029 年及以前 15 年；2030—2039 年每年提高 6 个月，至 2039 年 20 年；其后 20 年。
 */

export type RetireCategory = 'male' | 'female-cadre' | 'female-worker'

export interface RetireCategoryConfig {
  id: RetireCategory
  /** 完整名称（下拉/说明用） */
  name: string
  /** 简短名称（按钮用） */
  shortName: string
  /** 原法定退休年龄（岁） */
  baseAgeYears: number
  /** 延迟封顶年龄（岁） */
  capAgeYears: number
  /** 延迟起点（年） */
  startYear: number
  /** 延迟起点（月） */
  startMonth: number
  /** 每 N 个月出生延迟 1 个月 */
  stepMonths: number
}

export const RETIRE_CATEGORIES: RetireCategoryConfig[] = [
  {
    id: 'male',
    name: '男职工（原法定 60 岁）',
    shortName: '男职工',
    baseAgeYears: 60,
    capAgeYears: 63,
    startYear: 1965,
    startMonth: 1,
    stepMonths: 4
  },
  {
    id: 'female-cadre',
    name: '女职工 · 干部/管理技术岗（原法定 55 岁）',
    shortName: '女·干部',
    baseAgeYears: 55,
    capAgeYears: 58,
    startYear: 1970,
    startMonth: 1,
    stepMonths: 4
  },
  {
    id: 'female-worker',
    name: '女职工 · 工人岗（原法定 50 岁）',
    shortName: '女·工人',
    baseAgeYears: 50,
    capAgeYears: 55,
    startYear: 1975,
    startMonth: 1,
    stepMonths: 2
  }
]

export interface RetirementInput {
  category: RetireCategory
  /** 出生年（公历） */
  birthYear: number
  /** 出生月 1-12 */
  birthMonth: number
  /** 参考「今天」，缺省取系统当前日期（便于测试注入） */
  today?: Date
}

export interface RetirementResult {
  ok: boolean
  error?: string
  categoryName: string
  /** 法定退休年龄（总月数） */
  legalAgeMonths: number
  legalAgeText: string
  /** 原法定退休年龄（总月数） */
  baseAgeMonths: number
  baseAgeText: string
  /** 是否已到延迟封顶年龄 */
  capped: boolean
  /** 是否未进入延迟区间（出生早于起点） */
  noDelay: boolean
  /** 预计退休年月 */
  retireYear: number
  retireMonth: number
  retireText: string
  /** 距退休月数（可为负） */
  remainingMonths: number
  remainingText: string
  isRetired: boolean
  /** 弹性区间（最早/最晚，总月数） */
  flexEarliestMonths: number
  flexEarliestText: string
  flexEarliestDate: string
  flexLatestMonths: number
  flexLatestText: string
  flexLatestDate: string
  /** 最低缴费年限（按预计退休年份） */
  minContribYears: number
  minContribText: string
  /** 政策说明 */
  notes: string[]
}

/** 年-月 → 绝对月序号（1970-01 = 23640），用于加减与比较 */
function ymIndex(year: number, month: number): number {
  return year * 12 + (month - 1)
}

/** 绝对月序号 → 年-月 */
function fromIndex(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** 月份总数 → 「X岁Y个月」 */
export function ageMonthsText(totalMonths: number): string {
  const y = Math.floor(totalMonths / 12)
  const m = totalMonths % 12
  return m === 0 ? `${y}岁` : `${y}岁${m}个月`
}

/** 月份差额 → 「X年Y个月」 */
export function durationText(totalMonths: number): string {
  const y = Math.floor(totalMonths / 12)
  const m = totalMonths % 12
  if (y > 0 && m > 0) return `${y}年${m}个月`
  if (y > 0) return `${y}年`
  return `${m}个月`
}

/** 年-月 → 「YYYY年M月」 */
function ymText(year: number, month: number): string {
  return `${year}年${month}月`
}

/** 退休年份 → 最低缴费年限（年，可为 15.5 等） */
export function minContributionYears(retireYear: number): number {
  if (retireYear <= 2029) return 15
  if (retireYear >= 2039) return 20
  return 15 + (retireYear - 2029) * 0.5
}

/** 退休年份 → 最低缴费年限文案（如「15年6个月」） */
export function minContributionText(retireYear: number): string {
  const years = minContributionYears(retireYear)
  const whole = Math.floor(years)
  const months = Math.round((years - whole) * 12)
  return months > 0 ? `${whole}年${months}个月` : `${whole}年`
}

const EMPTY_RESULT: RetirementResult = {
  ok: false,
  error: '',
  categoryName: '',
  legalAgeMonths: 0,
  legalAgeText: '',
  baseAgeMonths: 0,
  baseAgeText: '',
  capped: false,
  noDelay: false,
  retireYear: 0,
  retireMonth: 0,
  retireText: '',
  remainingMonths: 0,
  remainingText: '',
  isRetired: false,
  flexEarliestMonths: 0,
  flexEarliestText: '',
  flexEarliestDate: '',
  flexLatestMonths: 0,
  flexLatestText: '',
  flexLatestDate: '',
  minContribYears: 0,
  minContribText: '',
  notes: []
}

/**
 * 按出生年月与人员类别，计算法定退休年龄、预计退休时间、剩余年限、弹性区间与最低缴费年限。
 */
export function calcRetirement(input: RetirementInput): RetirementResult {
  const cfg = RETIRE_CATEGORIES.find(c => c.id === input.category)
  if (!cfg) return { ...EMPTY_RESULT, error: '请选择人员类别' }

  const { birthYear, birthMonth } = input
  if (
    !Number.isInteger(birthYear) ||
    birthYear < 1900 ||
    birthYear > 2100 ||
    !Number.isInteger(birthMonth) ||
    birthMonth < 1 ||
    birthMonth > 12
  ) {
    return { ...EMPTY_RESULT, categoryName: cfg.name, error: '请填写有效的出生年月' }
  }

  const baseAgeMonths = cfg.baseAgeYears * 12
  const capAgeMonths = cfg.capAgeYears * 12
  const startIndex = ymIndex(cfg.startYear, cfg.startMonth)
  const birthIndex = ymIndex(birthYear, birthMonth)

  let legalAgeMonths: number
  let noDelay = false
  let capped = false

  if (birthIndex < startIndex) {
    // 出生早于延迟起点：仍按原法定年龄
    legalAgeMonths = baseAgeMonths
    noDelay = true
  } else {
    const diff = birthIndex - startIndex
    const delay = Math.floor(diff / cfg.stepMonths) + 1
    const raw = baseAgeMonths + delay
    legalAgeMonths = Math.min(raw, capAgeMonths)
    capped = raw >= capAgeMonths
  }

  // 预计退休年月 = 出生年月 + 法定退休年龄
  const retire = fromIndex(ymIndex(birthYear, birthMonth) + legalAgeMonths)

  // 距退休（相对今天所在月）
  const today = input.today ?? new Date()
  const todayIndex = ymIndex(today.getFullYear(), today.getMonth() + 1)
  const retireIndex = ymIndex(retire.year, retire.month)
  const remainingMonths = retireIndex - todayIndex
  const isRetired = remainingMonths <= 0
  const remainingText =
    remainingMonths > 0
      ? `还剩 ${durationText(remainingMonths)}`
      : remainingMonths === 0
        ? '本月达到法定退休年龄'
        : '已达法定退休年龄'

  // 弹性区间：提前最多 3 年（不低于原法定年龄），延后最多 3 年
  const flexEarliestMonths = Math.max(baseAgeMonths, legalAgeMonths - 36)
  const flexLatestMonths = legalAgeMonths + 36
  const flexEarliest = fromIndex(ymIndex(birthYear, birthMonth) + flexEarliestMonths)
  const flexLatest = fromIndex(ymIndex(birthYear, birthMonth) + flexLatestMonths)

  const minYears = minContributionYears(retire.year)

  const notes: string[] = []
  notes.push(
    '依据 2024-09-13 全国人大常委会决定及国务院办法，自 2025 年 1 月 1 日起实施渐进式延迟法定退休年龄。'
  )
  if (noDelay) {
    notes.push(
      `你出生在原法定退休年龄阶段（早于 ${cfg.startYear} 年 ${cfg.startMonth} 月），法定退休年龄仍为 ${cfg.baseAgeYears} 岁。`
    )
  } else if (capped) {
    notes.push(
      `你出生在延迟封顶区间，法定退休年龄已达 ${cfg.capAgeYears} 岁上限。`
    )
  } else {
    notes.push(
      `按「每 ${cfg.stepMonths} 个月出生延迟 1 个月」的规则，你的法定退休年龄由 ${cfg.baseAgeYears} 岁延迟为 ${ageMonthsText(legalAgeMonths)}。`
    )
  }
  notes.push(
    `弹性退休：可在法定退休年龄前后最多 3 年内自主选择。提前退休不得低于原法定退休年龄（${cfg.baseAgeYears} 岁），且需满足当年最低缴费年限；延迟退休需由单位与职工协商一致。`
  )
  notes.push(
    `最低缴费年限：按预计退休年份（${retire.year} 年），约为 ${minContributionText(retire.year)}。2030 年起由 15 年逐步提高到 20 年，每年增加 6 个月。`
  )
  notes.push(
    '特殊工种（井下、高空、高温、特别繁重体力劳动等）人员，可按国家规定申请提前退休，具体以人社部门认定为准。'
  )
  notes.push('养老金一般自退休次月起领取。本结果依据国家现行政策测算，仅供参考，最终以人社部门核定为准。')

  return {
    ok: true,
    categoryName: cfg.name,
    legalAgeMonths,
    legalAgeText: ageMonthsText(legalAgeMonths),
    baseAgeMonths,
    baseAgeText: ageMonthsText(baseAgeMonths),
    capped,
    noDelay,
    retireYear: retire.year,
    retireMonth: retire.month,
    retireText: ymText(retire.year, retire.month),
    remainingMonths,
    remainingText,
    isRetired,
    flexEarliestMonths,
    flexEarliestText: ageMonthsText(flexEarliestMonths),
    flexEarliestDate: ymText(flexEarliest.year, flexEarliest.month),
    flexLatestMonths,
    flexLatestText: ageMonthsText(flexLatestMonths),
    flexLatestDate: ymText(flexLatest.year, flexLatest.month),
    minContribYears: minYears,
    minContribText: minContributionText(retire.year),
    notes
  }
}
