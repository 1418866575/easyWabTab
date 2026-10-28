/**
 * 存款利息计算纯函数（零依赖）
 *
 * 建模前提（界面上需要同步展示，避免把口径当常识）：
 * 1. 定期整存整取按**单利**计息：利息 = 本金 × 年利率 × 存期，到期一次还本付息。
 *    这也是国内银行的实际算法，单期内不存在复利。
 * 2. 复利只来自**续存**：到期后把本息一起再存（本息续存）才会利滚利；
 *    到期把利息取走、只续本金则是单利滚动。二者差异只在跨期时体现。
 * 3. 不同期限不能直接比「总利息」——5 年本来就是 5 倍时间。跨期限比较统一折算到
 *    同一时间口径（本模块用 5 年期末），否则结论一定是"期限越长利息越多"，没有信息量。
 * 4. 不考虑利息税（2008 年起储蓄存款利息免征个人所得税）、不考虑通胀与利率变动。
 */

export type DepositTerm = 1 | 3 | 5

/** 三档年利率（百分数，如 1.25 表示 1.25%） */
export interface DepositRates {
  y1: number
  y3: number
  y5: number
}

export interface DepositInput {
  /** 本金（元） */
  principal: number
  rates: DepositRates
  /** 续存方式：true = 本息续存（利滚利）；false = 只续本金（利息取出） */
  compound: boolean
  /** 活期年利率（%），仅用于提示提前支取损失 */
  demandRate: number
  /** 5 年内希望保有的流动资金占比（%），决定 1 年档比例 */
  liquidityPct: number
}

/** 单个期限、全额存入的结果 */
export interface TermResult {
  term: DepositTerm
  rate: number
  /** 期内利息（单利） */
  interest: number
  /** 到期本息 */
  maturity: number
  /** 复利等效年化（跨期限可比），% */
  annualized: number
}

/** 某种滚动策略在同一时间口径下的结果 */
export interface StrategyResult {
  key: string
  label: string
  /** 分步说明，如「3 年 → 1 年 → 1 年」 */
  steps: string
  /** 期末本息（含已取出的利息） */
  total: number
  /** 总利息收益（含已取出部分） */
  interest: number
  /** 期末仍在计息的本金 */
  principal: number
}

/** 阶梯配置中的一档 */
export interface LadderLeg {
  term: DepositTerm
  amount: number
  pct: number
  rate: number
  /** 该笔在自己期限内的利息（用户直觉上的「存 3 年得多少利息」） */
  termInterest: number
  /** 该笔在 5 年期末的本息（1/3 年档到期后按 1 年期续存到第 5 年） */
  finalAt5: number
  /** 该笔 5 年累计利息 */
  interestAt5: number
}

/** 阶梯方案在某一年末的可支取情况 */
export interface TimelineRow {
  year: number
  /** 该年到期的档位，如「1 年档 + 3 年档」 */
  matured: string
  /** 该年到期可支取金额（按续存假设推算） */
  amount: number
}

/** 一次阶梯配置的完整结果 */
export interface LadderResult {
  liquidityPct: number
  legs: LadderLeg[]
  /** 5 年期末本息合计 */
  total: number
  /** 5 年累计利息 */
  interestAt5: number
  /** 加权复利等效年化，% */
  annualized: number
  /** 全额存 5 年的利息（纯收益上限） */
  pureInterest: number
  /** 为流动性放弃的利息 = 纯收益上限 - 阶梯收益 */
  liquidityCost: number
  /** 长期档（3/5 年）若中途提前支取、按活期计息的利息损失 */
  earlyLoss: number
  timeline: TimelineRow[]
}

/** 不同本金档位的横向对比（本金规模带来的差异） */
export interface ScaleRow {
  principal: number
  /** 阶梯方案 5 年利息 */
  ladderInterest: number
  /** 与全额存 5 年的差额 */
  gapToPure: number
  /** 存款保险 50 万/家 → 需要分散的银行家数 */
  banks: number
  /** 是否为当前本金所在档 */
  current: boolean
}

export interface DepositResult {
  ok: boolean
  error?: string
  terms: TermResult[]
  /** 3 年口径下的滚动策略对比 */
  strategies3: StrategyResult[]
  /** 5 年口径下的滚动策略对比（「最高收益」结论来自这里） */
  strategies5: StrategyResult[]
  /** 5 年口径最优策略 */
  bestStrategy: StrategyResult | null
  ladder: LadderResult
  scaleTable: ScaleRow[]
  warnings: string[]
}

/** 本金允许区间（元） */
export const PRINCIPAL_MIN = 100000
export const PRINCIPAL_MAX = 3000000
/** 存款保险赔付上限（每家银行每名存款人） */
export const DEPOSIT_INSURANCE_LIMIT = 500000
/** 分配取整单位（元）：按千元取整，兼顾可执行性与比例精度（万元取整会让 10 万档明显偏离推荐比例） */
const LADDER_STEP = 1000
/** 利率倒挂判定容差（百分点） */
const RATE_INVERT_EPS = 0.001

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100
const roundStep = (n: number, step: number): number => Math.round(n / step) * step

/** 单期定期存款利息（单利） */
export function termInterest(principal: number, ratePct: number, years: number): number {
  return principal * (ratePct / 100) * years
}

/** 复利等效年化（%），用于跨期限比较 */
export function effectiveAnnual(total: number, principal: number, years: number): number {
  if (principal <= 0 || years <= 0 || total <= 0) return 0
  return (Math.pow(total / principal, 1 / years) - 1) * 100
}

interface PlanStep {
  years: number
  rate: number
}

/**
 * 按给定步骤滚动存款。
 * 每步都是单利；本息续存时利息并在本金里继续生息，否则利息取出、本金不动。
 */
export function runPlan(
  principal: number,
  steps: PlanStep[],
  compound: boolean
): { total: number; interest: number; principal: number } {
  let base = principal
  let withdrawn = 0
  for (const s of steps) {
    const interest = termInterest(base, s.rate, s.years)
    if (compound) base += interest
    else withdrawn += interest
  }
  return { total: round2(base + withdrawn), interest: round2(withdrawn + (base - principal)), principal: round2(base) }
}

const planLabel = (steps: PlanStep[]): string =>
  steps.map(s => `${s.years} 年`).join(' → ')

function makeStrategy(key: string, steps: PlanStep[], principal: number, compound: boolean): StrategyResult {
  const r = runPlan(principal, steps, compound)
  return {
    key,
    label: steps.length === 1 ? `一次存 ${steps[0].years} 年` : `${steps.length} 次续存`,
    steps: planLabel(steps),
    total: r.total,
    interest: r.interest,
    principal: r.principal
  }
}

/** 3 年口径的滚动策略 */
function buildStrategies3(p: number, rates: DepositRates, compound: boolean): StrategyResult[] {
  return [
    makeStrategy('s3-3', [{ years: 3, rate: rates.y3 }], p, compound),
    makeStrategy('s3-1x3', [{ years: 1, rate: rates.y1 }, { years: 1, rate: rates.y1 }, { years: 1, rate: rates.y1 }], p, compound)
  ]
}

/** 5 年口径的滚动策略（含阶梯式中途换期） */
function buildStrategies5(p: number, rates: DepositRates, compound: boolean): StrategyResult[] {
  const { y1, y3, y5 } = rates
  return [
    makeStrategy('s5-5', [{ years: 5, rate: y5 }], p, compound),
    makeStrategy('s5-1x5', [{ years: 1, rate: y1 }, { years: 1, rate: y1 }, { years: 1, rate: y1 }, { years: 1, rate: y1 }, { years: 1, rate: y1 }], p, compound),
    makeStrategy('s5-3-1-1', [{ years: 3, rate: y3 }, { years: 1, rate: y1 }, { years: 1, rate: y1 }], p, compound),
    makeStrategy('s5-1-3-1', [{ years: 1, rate: y1 }, { years: 3, rate: y3 }, { years: 1, rate: y1 }], p, compound)
  ]
}

/** 按占比拆本金，按「万元」取整保证三档之和恰等于本金 */
export function splitPrincipal(principal: number, liquidityPct: number, step = LADDER_STEP): [number, number, number] {
  const y1 = Math.min(principal, Math.max(0, roundStep((principal * liquidityPct) / 100, step)))
  const rest = principal - y1
  const y3 = Math.min(rest, Math.max(0, roundStep(rest / 2, step)))
  const y5 = rest - y3
  return [y1, y3, y5]
}

/**
 * 1 年期逐年滚存 n 年后的价值。
 * 必须逐年计息：本息续存是「每年到期后连本带息再存」，等价于 (1+r)^n；
 * 用单期公式 principal*(1+r*n) 会把 5 次 1 年期误当成一次 5 年期，与主表对不上。
 */
function roll1y(principal: number, ratePct: number, years: number, compound: boolean): number {
  const r = ratePct / 100
  let value = principal
  let withdrawn = 0
  for (let i = 0; i < years; i++) {
    const interest = value * r
    if (compound) value += interest
    else withdrawn += interest
  }
  return round2(value + withdrawn)
}

/** 构建阶梯方案 */
export function buildLadder(
  principal: number,
  rates: DepositRates,
  compound: boolean,
  liquidityPct: number,
  demandRate = 0.05
): LadderResult {
  const [a1, a3, a5] = splitPrincipal(principal, liquidityPct)
  const { y1, y3, y5 } = rates

  // 1 年档：逐年续存到第 5 年
  const leg1 = runPlan(a1, [{ years: 1, rate: y1 }, { years: 1, rate: y1 }, { years: 1, rate: y1 }, { years: 1, rate: y1 }, { years: 1, rate: y1 }], compound)
  // 3 年档：3 年到期后剩 2 年按 1 年期续存
  const leg3 = runPlan(a3, [{ years: 3, rate: y3 }, { years: 1, rate: y1 }, { years: 1, rate: y1 }], compound)
  // 5 年档：一次存满
  const leg5 = runPlan(a5, [{ years: 5, rate: y5 }], compound)

  const legs: LadderLeg[] = [
    { term: 1, amount: a1, pct: principal > 0 ? (a1 / principal) * 100 : 0, rate: y1, termInterest: round2(termInterest(a1, y1, 1)), finalAt5: leg1.total, interestAt5: round2(leg1.total - a1) },
    { term: 3, amount: a3, pct: principal > 0 ? (a3 / principal) * 100 : 0, rate: y3, termInterest: round2(termInterest(a3, y3, 3)), finalAt5: leg3.total, interestAt5: round2(leg3.total - a3) },
    { term: 5, amount: a5, pct: principal > 0 ? (a5 / principal) * 100 : 0, rate: y5, termInterest: round2(termInterest(a5, y5, 5)), finalAt5: leg5.total, interestAt5: round2(leg5.total - a5) }
  ]

  const total = round2(leg1.total + leg3.total + leg5.total)
  const interestAt5 = round2(total - principal)
  const pureInterest = round2(termInterest(principal, y5, 5))

  // 提前支取损失：3 / 5 年档若在到期前取出，整笔按活期计息
  const earlyLoss = round2(
    legs
      .filter(l => l.term > 1)
      .reduce((sum, l) => sum + Math.max(0, l.termInterest - termInterest(l.amount, demandRate, l.term)), 0)
  )

  // 各年末可支取：1 年档每年到期；3 年档第 3 年；5 年档第 5 年
  const m1 = roll1y(a1, y1, 1, compound)
  const m3 = round2(a3 * (1 + (y3 / 100) * 3))
  const m5 = round2(a5 * (1 + (y5 / 100) * 5))
  const timeline: TimelineRow[] = [
    { year: 1, matured: '1 年档', amount: m1 },
    { year: 2, matured: '1 年档', amount: roll1y(a1, y1, 2, compound) },
    { year: 3, matured: '1 年档 + 3 年档', amount: round2(roll1y(a1, y1, 3, compound) + m3) },
    { year: 4, matured: '1 年档', amount: roll1y(a1, y1, 4, compound) },
    { year: 5, matured: '1 年档 + 5 年档', amount: round2(roll1y(a1, y1, 5, compound) + m5) }
  ]

  return {
    liquidityPct,
    legs,
    total,
    interestAt5,
    annualized: round2(effectiveAnnual(total, principal, 5)),
    pureInterest,
    liquidityCost: round2(Math.max(0, pureInterest - interestAt5)),
    earlyLoss,
    timeline
  }
}

/** 存款保险口径下需要的银行家数 */
export function bankCount(principal: number): number {
  return Math.max(1, Math.ceil(principal / DEPOSIT_INSURANCE_LIMIT))
}

/** 主计算入口 */
export function calcDeposit(input: DepositInput): DepositResult {
  const principal = Number(input.principal)
  const { y1, y3, y5 } = input.rates
  const compound = input.compound
  const liquidityPct = Math.min(100, Math.max(0, Number(input.liquidityPct)))
  const demandRate = Number.isFinite(input.demandRate) && input.demandRate >= 0 ? Number(input.demandRate) : 0.05

  const empty: DepositResult = {
    ok: false,
    terms: [],
    strategies3: [],
    strategies5: [],
    bestStrategy: null,
    ladder: buildLadder(0, { y1: 0, y3: 0, y5: 0 }, compound, liquidityPct),
    scaleTable: [],
    warnings: []
  }

  if (!Number.isFinite(principal) || principal <= 0) return { ...empty, error: '请输入正确的本金金额' }
  if (![y1, y3, y5].every(r => Number.isFinite(r) && r > 0)) return { ...empty, error: '三档年利率都需大于 0' }

  const warnings: string[] = []
  if (principal < PRINCIPAL_MIN) warnings.push(`本金低于 ${PRINCIPAL_MIN / 10000} 万，实际起存金额以银行规定为准`)
  if (principal > PRINCIPAL_MAX) warnings.push(`本金高于 ${PRINCIPAL_MAX / 10000} 万，大额资金建议改用大额存单或分笔询价`)
  if (y3 < y1 - RATE_INVERT_EPS) warnings.push('3 年期利率低于 1 年期（利率倒挂），此时续存短期更划算，请核对利率')
  if (y5 < y3 - RATE_INVERT_EPS) warnings.push('5 年期利率低于 3 年期（利率倒挂），长期锁定反而不划算，请核对利率')
  if (!compound) warnings.push('当前为「只续本金、利息取出」，利息不再生息，长期收益会低于本息续存')
  if (bankCount(principal) > 1) {
    warnings.push(`本息合计超过 ${DEPOSIT_INSURANCE_LIMIT / 10000} 万存款保险上限，建议分存 ${bankCount(principal)} 家银行`)
  }

  const terms: TermResult[] = ([1, 3, 5] as DepositTerm[]).map(term => {
    const rate = term === 1 ? y1 : term === 3 ? y3 : y5
    const interest = round2(termInterest(principal, rate, term))
    const maturity = round2(principal + interest)
    return { term, rate, interest, maturity, annualized: round2(effectiveAnnual(maturity, principal, term)) }
  })

  const strategies3 = buildStrategies3(principal, { y1, y3, y5 }, compound)
  const strategies5 = buildStrategies5(principal, { y1, y3, y5 }, compound)
  const bestStrategy = strategies5.reduce((a, b) => (b.interest > a.interest ? b : a), strategies5[0])

  const ladder = buildLadder(principal, { y1, y3, y5 }, compound, liquidityPct, demandRate)

  const scales = [100000, 500000, 1000000, 3000000]
  const scaleTable: ScaleRow[] = scales.map(p => {
    const l = buildLadder(p, { y1, y3, y5 }, compound, liquidityPct, demandRate)
    return {
      principal: p,
      ladderInterest: l.interestAt5,
      gapToPure: l.liquidityCost,
      banks: bankCount(p),
      current: principal >= p && (scales[scales.indexOf(p) + 1] === undefined || principal < scales[scales.indexOf(p) + 1])
    }
  })

  return { ok: true, terms, strategies3, strategies5, bestStrategy, ladder, scaleTable, warnings }
}
