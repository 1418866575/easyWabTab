/**
 * 贷款计算扩展 —— 纯函数（零依赖，除同目录 loan.ts）
 *
 * 覆盖「贷款计算」分类下除基础房贷外的全部算法：
 *   1. 组合贷（商贷 + 公积金双利率合并）
 *   2. 提前还贷（部分 / 全部，缩期限 / 降月供）
 *   3. 利率变动（变动前后对比）
 *   4. 贷款反算（由月供反推本金或利率）
 *   5. 购房税费（契税 / 增值税 / 个税 / 印花税 / 维修基金）
 *   6. 购房能力评估（资金 + 月供双约束反推可购总价）
 *   7. 利率速查静态数据（LPR / 旧基准 / 公积金 / 最低首付）
 *
 * 说明：税费与利率均为**通用规则 + 静态数据**，各地政策存在差异，
 *      结果需在 UI 层标注「以当地政策为准 / 数据更新日期」。
 */

import { calcLoan, monthlyPayment, type RepayMethod, type ScheduleRow } from './loan'

/** 还款方式沿用 core/loan 的定义，此处转出便于工具组件单点引用 */
export type { RepayMethod, ScheduleRow }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
/** 万元格式化用：四舍五入到 2 位小数（展示层再用 toLocaleString） */
export const yuan = (n: number) => round2(Number.isFinite(n) ? n : 0)

// ==================== 1. 组合贷 ====================

export interface ComboPart {
  principal: number
  annualRate: number
}

export interface ComboInput {
  /** 商业贷款部分 */
  commercial: ComboPart
  /** 公积金贷款部分 */
  provident: ComboPart
  months: number
  method?: RepayMethod
}

export interface ComboRow {
  period: number
  commercial: number
  provident: number
  payment: number
  principal: number
  interest: number
  balance: number
}

export interface ComboResult {
  ok: boolean
  error?: string
  /** 商贷首月 */
  commercialMonthly: number
  /** 公积金首月 */
  providentMonthly: number
  /** 合并首月月供 */
  firstPayment: number
  /** 合并末月月供 */
  lastPayment: number
  totalPrincipal: number
  totalInterest: number
  totalPayment: number
  months: number
  rows: ComboRow[]
}

/**
 * 组合贷：两笔贷款各自按自己的利率生成还款计划，再逐期相加。
 * 两笔期限相同，故合并后的期数 = 原期限（其中一笔为 0 时退化为单笔）。
 */
export function calcCombo(input: ComboInput): ComboResult {
  const months = Math.floor(Number(input.months))
  const cp = Number(input.commercial?.principal) || 0
  const pp = Number(input.provident?.principal) || 0
  if (cp < 0 || pp < 0) return comboFail('请输入正确的贷款金额')
  if (cp + pp <= 0) return comboFail('商贷金额与公积金金额不能同时为 0')
  if (!Number.isInteger(months) || months < 1 || months > 600) return comboFail('贷款期数需为 1–600 的整数')

  const method: RepayMethod = input.method || 'equalPayment'
  const c = cp > 0 ? calcLoan({ principal: cp, annualRate: input.commercial.annualRate, months, method }) : null
  const p = pp > 0 ? calcLoan({ principal: pp, annualRate: input.provident.annualRate, months, method }) : null
  if (c && !c.ok) return comboFail(c.error || '商贷参数有误')
  if (p && !p.ok) return comboFail(p.error || '公积金参数有误')

  const len = Math.max(c?.rows.length ?? 0, p?.rows.length ?? 0)
  const rows: ComboRow[] = []
  for (let i = 0; i < len; i++) {
    const cr = c?.rows[i]
    const pr = p?.rows[i]
    rows.push({
      period: i + 1,
      commercial: cr ? cr.payment : 0,
      provident: pr ? pr.payment : 0,
      payment: round2((cr?.payment ?? 0) + (pr?.payment ?? 0)),
      principal: round2((cr?.principal ?? 0) + (pr?.principal ?? 0)),
      interest: round2((cr?.interest ?? 0) + (pr?.interest ?? 0)),
      balance: round2((cr?.balance ?? 0) + (pr?.balance ?? 0))
    })
  }
  const totalInterest = round2((c?.totalInterest ?? 0) + (p?.totalInterest ?? 0))
  const totalPayment = round2((c?.totalPayment ?? 0) + (p?.totalPayment ?? 0))
  return {
    ok: true,
    commercialMonthly: round2(c?.rows[0]?.payment ?? 0),
    providentMonthly: round2(p?.rows[0]?.payment ?? 0),
    firstPayment: round2(rows[0]?.payment ?? 0),
    lastPayment: round2(rows[rows.length - 1]?.payment ?? 0),
    totalPrincipal: round2(cp + pp),
    totalInterest,
    totalPayment,
    months: rows.length,
    rows
  }
}

function comboFail(error: string): ComboResult {
  return {
    ok: false, error, commercialMonthly: 0, providentMonthly: 0,
    firstPayment: 0, lastPayment: 0, totalPrincipal: 0,
    totalInterest: 0, totalPayment: 0, months: 0, rows: []
  }
}

/** 组合贷明细 → CSV */
export function comboToCsv(rows: ComboRow[]): string {
  const head = '期数,商贷月供,公积金月供,合计月供,本金,利息,剩余本金'
  const body = rows.map(r => [r.period, r.commercial, r.provident, r.payment, r.principal, r.interest, r.balance].join(','))
  return [head, ...body].join('\n')
}

/** 组合贷明细 → 纯文本（复制用；默认只取前 limit 期，避免复制出超长文本） */
export function comboRowsToText(rows: ComboRow[], limit = 60): string {
  if (!rows || !rows.length) return ''
  const head = '期数\t商贷月供\t公积金月供\t合计月供\t本金\t利息\t剩余本金'
  const body = rows.slice(0, limit).map(r =>
    [r.period, r.commercial, r.provident, r.payment, r.principal, r.interest, r.balance].join('\t')
  )
  const tail = rows.length > limit ? `\n…… 仅显示前 ${limit} 期（共 ${rows.length} 期，完整明细请下载 CSV）` : ''
  return [head, ...body].join('\n') + tail
}

// ==================== 2. 提前还贷 ====================

/** 调整方案：keepPayment = 月供基本不变（缩短期限）；keepTerm = 还款期限不变（降低月供） */
export type PrepayMode = 'keepPayment' | 'keepTerm'

export interface PrepayInput {
  principal: number
  annualRate: number
  months: number
  method?: RepayMethod
  /** 已还期数（在第 paidMonths 期期末办理提前还款） */
  paidMonths: number
  /** 提前还款金额（payAll 为 true 时忽略，按剩余本金全额还清） */
  amount: number
  /** 是否一次性全部还清 */
  payAll: boolean
  mode: PrepayMode
}

export interface PrepayResult {
  ok: boolean
  error?: string
  /** 已还部分 */
  paidPrincipal: number
  paidInterest: number
  paidTotal: number
  /** 办理时点的剩余本金 */
  remainPrincipal: number
  /** 本次实际提前还款金额 */
  payAmount: number
  /** 新合同 */
  newPrincipal: number
  newMonths: number
  newMonthly: number
  newFirstPayment: number
  newLastPayment: number
  /** 新合同剩余利息 / 剩余还款额 */
  newRemainInterest: number
  newRemainPayment: number
  /** 原合同剩余利息（不提前还款的话） */
  oldRemainInterest: number
  /** 节省利息 = 原剩余利息 − 新剩余利息 */
  savedInterest: number
  newRows: ScheduleRow[]
}

export function calcPrepay(input: PrepayInput): PrepayResult {
  const p = Number(input.principal)
  const rate = Number(input.annualRate) / 100 / 12
  const months = Math.floor(Number(input.months))
  const paid = Math.floor(Number(input.paidMonths))
  if (!Number.isFinite(p) || p <= 0) return prepayFail('请输入正确的贷款金额')
  if (!Number.isFinite(rate) || rate < 0) return prepayFail('请输入正确的年利率')
  if (!Number.isInteger(months) || months < 1 || months > 600) return prepayFail('贷款期数需为 1–600 的整数')
  if (!Number.isInteger(paid) || paid < 0 || paid >= months) return prepayFail('已还期数需为 0 至 总期数−1 之间的整数')

  const method: RepayMethod = input.method || 'equalPayment'
  const base = calcLoan({ principal: p, annualRate: input.annualRate, months, method })
  if (!base.ok) return prepayFail(base.error || '原合同参数有误')

  // 已还部分：前 paid 期
  const done = base.rows.slice(0, paid)
  const paidInterest = round2(done.reduce((s, r) => s + r.interest, 0))
  const paidPrincipal = round2(done.reduce((s, r) => s + r.principal, 0))
  const remainPrincipal = paid > 0 ? base.rows[paid - 1].balance : p
  // 原合同剩余利息
  const oldRemainInterest = round2(base.rows.slice(paid).reduce((s, r) => s + r.interest, 0))

  // 全部提前还清
  if (input.payAll) {
    return {
      ok: true,
      paidPrincipal,
      paidInterest,
      paidTotal: round2(paidPrincipal + paidInterest),
      remainPrincipal: round2(remainPrincipal),
      payAmount: round2(remainPrincipal),
      newPrincipal: 0,
      newMonths: 0,
      newMonthly: 0,
      newFirstPayment: 0,
      newLastPayment: 0,
      newRemainInterest: 0,
      newRemainPayment: 0,
      oldRemainInterest,
      savedInterest: oldRemainInterest,
      newRows: []
    }
  }

  const want = Number(input.amount)
  if (!Number.isFinite(want) || want <= 0) return prepayFail('请输入正确的提前还款金额')
  // 至少留一点本金，避免出现「还完但又不算全部还清」的歧义
  const payAmount = Math.min(want, Math.max(remainPrincipal - 1, 0))
  if (payAmount <= 0) return prepayFail('剩余本金过少，请直接选择「全部提前还清」')

  const newPrincipal = round2(remainPrincipal - payAmount)
  const restMonths = months - paid

  let newMonths = restMonths
  if (input.mode === 'keepPayment') {
    // 月供基本不变 → 反解剩余期数
    const solved = solveMonthsKeepPayment(newPrincipal, rate, method === 'equalPayment' ? base.rows[0].payment : base.rows[paid]?.payment ?? base.rows[0].payment, method)
    if (solved !== null) newMonths = Math.min(Math.max(solved, 1), restMonths)
    // 解不出（月供不足以覆盖利息）时退化为「期限不变」
  }
  const next = calcLoan({ principal: newPrincipal, annualRate: input.annualRate, months: newMonths, method })
  if (!next.ok) return prepayFail(next.error || '新合同参数有误')

  const newRemainInterest = next.totalInterest
  return {
    ok: true,
    paidPrincipal,
    paidInterest,
    paidTotal: round2(paidPrincipal + paidInterest),
    remainPrincipal: round2(remainPrincipal),
    payAmount: round2(payAmount),
    newPrincipal,
    newMonths: next.rows.length,
    newMonthly: round2(next.monthly),
    newFirstPayment: round2(next.firstPayment),
    newLastPayment: round2(next.lastPayment),
    newRemainInterest: round2(newRemainInterest),
    newRemainPayment: round2(next.totalPayment),
    oldRemainInterest,
    savedInterest: round2(oldRemainInterest - newRemainInterest),
    newRows: next.rows
  }
}

/**
 * 已知本金与「原月供」，求保持该月供所需的剩余期数。
 * - 等额本息：M = P·i·(1+i)^n / ((1+i)^n − 1) → (1+i)^n = M / (M − P·i)
 * - 等额本金：首月 M₁ = P/n + P·i → n = P / (M₁ − P·i)
 * 无解（月供 ≤ 当期利息）时返回 null，调用方退化为「期限不变」。
 */
function solveMonthsKeepPayment(p: number, monthlyRate: number, oldPayment: number, method: RepayMethod): number | null {
  if (p <= 0 || oldPayment <= 0) return null
  if (method === 'equalPrincipal') {
    const denom = oldPayment - p * monthlyRate
    if (denom <= 0) return null
    return Math.ceil(p / denom)
  }
  if (monthlyRate === 0) return Math.ceil(p / oldPayment)
  const denom = oldPayment - p * monthlyRate
  if (denom <= 0) return null
  const x = oldPayment / denom
  if (x <= 1) return null
  return Math.ceil(Math.log(x) / Math.log(1 + monthlyRate))
}

function prepayFail(error: string): PrepayResult {
  return {
    ok: false, error, paidPrincipal: 0, paidInterest: 0, paidTotal: 0,
    remainPrincipal: 0, payAmount: 0, newPrincipal: 0, newMonths: 0,
    newMonthly: 0, newFirstPayment: 0, newLastPayment: 0,
    newRemainInterest: 0, newRemainPayment: 0, oldRemainInterest: 0,
    savedInterest: 0, newRows: []
  }
}

// ==================== 3. 利率变动 ====================

export interface RateChangeInput {
  principal: number
  annualRate: number
  months: number
  method?: RepayMethod
  /** 已按原利率还了多少期 */
  paidMonths: number
  /** 变动后的年利率 */
  newRate: number
}

export interface RateChangeResult {
  ok: boolean
  error?: string
  paidPrincipal: number
  paidInterest: number
  paidTotal: number
  /** 变动时点的剩余本金 */
  remainPrincipal: number
  /** 剩余期数 */
  remainMonths: number
  newMonthly: number
  newFirstPayment: number
  newLastPayment: number
  /** 变动后剩余利息 / 剩余还款额 */
  newRemainInterest: number
  newRemainPayment: number
  /** 若利率不变，剩余利息是多少 */
  oldRemainInterest: number
  /** 利息增减：正 = 变动后多付，负 = 少付 */
  interestDelta: number
  newRows: ScheduleRow[]
}

export function calcRateChange(input: RateChangeInput): RateChangeResult {
  const p = Number(input.principal)
  const months = Math.floor(Number(input.months))
  const paid = Math.floor(Number(input.paidMonths))
  const newRate = Number(input.newRate)
  if (!Number.isFinite(p) || p <= 0) return rateFail('请输入正确的贷款金额')
  if (!Number.isFinite(input.annualRate) || input.annualRate < 0) return rateFail('请输入正确的原年利率')
  if (!Number.isFinite(newRate) || newRate < 0) return rateFail('请输入正确的变动后年利率')
  if (!Number.isInteger(months) || months < 1 || months > 600) return rateFail('贷款期数需为 1–600 的整数')
  if (!Number.isInteger(paid) || paid < 0 || paid >= months) return rateFail('已还期数需为 0 至 总期数−1 之间的整数')

  const method: RepayMethod = input.method || 'equalPayment'
  const base = calcLoan({ principal: p, annualRate: input.annualRate, months, method })
  if (!base.ok) return rateFail(base.error || '原合同参数有误')

  const done = base.rows.slice(0, paid)
  const paidInterest = round2(done.reduce((s, r) => s + r.interest, 0))
  const paidPrincipal = round2(done.reduce((s, r) => s + r.principal, 0))
  const remainPrincipal = paid > 0 ? base.rows[paid - 1].balance : p
  const remainMonths = months - paid
  const oldRemainInterest = round2(base.rows.slice(paid).reduce((s, r) => s + r.interest, 0))

  const next = calcLoan({ principal: remainPrincipal, annualRate: newRate, months: remainMonths, method })
  if (!next.ok) return rateFail(next.error || '新利率下参数有误')

  return {
    ok: true,
    paidPrincipal,
    paidInterest,
    paidTotal: round2(paidPrincipal + paidInterest),
    remainPrincipal: round2(remainPrincipal),
    remainMonths,
    newMonthly: round2(next.monthly),
    newFirstPayment: round2(next.firstPayment),
    newLastPayment: round2(next.lastPayment),
    newRemainInterest: round2(next.totalInterest),
    newRemainPayment: round2(next.totalPayment),
    oldRemainInterest,
    interestDelta: round2(next.totalInterest - oldRemainInterest),
    newRows: next.rows
  }
}

function rateFail(error: string): RateChangeResult {
  return {
    ok: false, error, paidPrincipal: 0, paidInterest: 0, paidTotal: 0,
    remainPrincipal: 0, remainMonths: 0, newMonthly: 0,
    newFirstPayment: 0, newLastPayment: 0, newRemainInterest: 0,
    newRemainPayment: 0, oldRemainInterest: 0, interestDelta: 0, newRows: []
  }
}

// ==================== 4. 贷款反算 ====================

export type ReverseTarget = 'principal' | 'rate'

export interface ReverseInput {
  /** 反算贷款金额 / 反算贷款利率 */
  target: ReverseTarget
  method?: RepayMethod
  /** 月还款额（等额本金时指首月还款额） */
  monthly: number
  months: number
  /** target = 'rate' 时必填 */
  principal?: number
  /** target = 'principal' 时必填 */
  annualRate?: number
}

export interface ReverseResult {
  ok: boolean
  error?: string
  /** 反算出的贷款金额（元） */
  principal?: number
  /** 反算出的年利率（%） */
  annualRate?: number
  /** 校验用：按反算结果正算回来的月供 */
  checkMonthly?: number
}

/**
 * 贷款反算：已知月供反推本金，或已知本金反推利率。
 * - 反算本金（等额本息）：P = M·((1+i)^n − 1) / (i·(1+i)^n)
 * - 反算本金（等额本金）：M₁ = P/n + P·i → P = M₁ / (1/n + i)
 * - 反算利率（等额本金）：i = M₁/P − 1/n
 * - 反算利率（等额本息）：月供关于 i 单调递增，二分求解
 */
export function solveReverse(input: ReverseInput): ReverseResult {
  const months = Math.floor(Number(input.months))
  const m = Number(input.monthly)
  if (!Number.isFinite(m) || m <= 0) return reverseFail('请输入正确的月还款额')
  if (!Number.isInteger(months) || months < 1 || months > 600) return reverseFail('贷款期数需为 1–600 的整数')
  const method: RepayMethod = input.method || 'equalPayment'

  if (input.target === 'principal') {
    const annualRate = Number(input.annualRate)
    if (!Number.isFinite(annualRate) || annualRate < 0) return reverseFail('请输入正确的年利率')
    const i = annualRate / 100 / 12
    let p: number
    if (method === 'equalPrincipal') {
      p = m / (1 / months + i)
    } else if (i === 0) {
      p = m * months
    } else {
      const pow = Math.pow(1 + i, months)
      p = (m * (pow - 1)) / (i * pow)
    }
    if (!Number.isFinite(p) || p <= 0) return reverseFail('该月供与利率组合下无解，请检查输入')
    const principal = round2(p)
    const check = method === 'equalPrincipal'
      ? round2(principal / months + principal * i)
      : round2(monthlyPayment(principal, i, months))
    return { ok: true, principal, checkMonthly: check }
  }

  const p = Number(input.principal)
  if (!Number.isFinite(p) || p <= 0) return reverseFail('请输入正确的贷款金额')
  if (method === 'equalPrincipal') {
    const i = m / p - 1 / months
    if (i < 0) return reverseFail('月供低于每期应还本金，请检查输入')
    const annualRate = round2(i * 12 * 100)
    return { ok: true, annualRate, checkMonthly: round2(p / months + p * i) }
  }
  // 等额本息：二分法（月供关于月利率单调递增）
  let lo = 0
  let hi = 1 // 月利率上限 100%（对应年利率 1200%，足够覆盖任何现实场景）
  if (monthlyPayment(p, hi, months) < m) return reverseFail('月供超出可解范围，请检查输入')
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2
    const v = monthlyPayment(p, mid, months)
    if (v < m) lo = mid
    else hi = mid
  }
  const i = (lo + hi) / 2
  const annualRate = round2(i * 12 * 100)
  return { ok: true, annualRate, checkMonthly: round2(monthlyPayment(p, i, months)) }
}

function reverseFail(error: string): ReverseResult {
  return { ok: false, error }
}

// ==================== 5. 购房税费 ====================

/** 新房 / 二手房 */
export type HouseNature = 'new' | 'second'
/** 多层 / 小高层 / 高层（决定公共维修基金单价） */
export type HouseType = 'multi' | 'midHigh' | 'high'
/** 个税计征方式：按总价 1% / 按差额 20% */
export type TaxMode = 'total' | 'diff'

export interface HouseTaxInput {
  nature: HouseNature
  /** 买房家庭套数：1 首套 / 2 二套 / 3 三套及以上 */
  familyOrder: 1 | 2 | 3
  area: number
  totalPrice: number
  /** 是否普通住宅（影响增值税） */
  ordinary: boolean
  /** 卖方家庭是否唯一住房（满五唯一免个税） */
  sellerUnique: boolean
  /** 房产持有年限 */
  holdYears: number
  /** 个税计征方式 */
  taxMode: TaxMode
  /** 房屋原价（差额计征用） */
  originalPrice: number
  houseType: HouseType
  /** 公共维修基金单价（元/㎡），缺省按房屋类型取默认值 */
  maintenancePerSqm?: number
}

export interface HouseTaxItem {
  key: string
  name: string
  payer: 'buyer' | 'seller'
  amount: number
  /** 税率/依据说明 */
  note: string
}

export interface HouseTaxResult {
  ok: boolean
  error?: string
  items: HouseTaxItem[]
  buyerTotal: number
  sellerTotal: number
  total: number
}

/** 公共维修基金默认单价（元/㎡）：多层 / 小高层 / 高层 */
export const MAINTENANCE_DEFAULT: Record<HouseType, number> = { multi: 50, midHigh: 80, high: 100 }

/**
 * 购房税费（通用规则估算）
 *
 * - 契税（买方）：首套 ≤90㎡ 1%、>90㎡ 1.5%；二套 ≤90㎡ 1%、>90㎡ 2%；三套及以上 3%
 * - 增值税（卖方，仅二手房）：不满 2 年按全额 5%；满 2 年普通住宅免征、非普通住宅按差额 5%
 * - 个人所得税（卖方，仅二手房）：满五唯一免征；否则按总价 1% 或差额 20%
 * - 印花税：个人住房买卖暂免征收（保留条目，金额 0）
 * - 公共维修基金（买方，仅新房）：面积 × 单价
 *
 * ⚠ 各地普通住宅标准、契税优惠、维修基金单价存在差异，结果仅供估算。
 */
export function calcHouseTax(input: HouseTaxInput): HouseTaxResult {
  const area = Number(input.area)
  const total = Number(input.totalPrice)
  if (!Number.isFinite(area) || area <= 0) return taxFail('请输入正确的房屋面积')
  if (!Number.isFinite(total) || total <= 0) return taxFail('请输入正确的房屋总价')

  const items: HouseTaxItem[] = []
  const order = input.familyOrder

  // ---- 契税（买方）----
  let deedRate = 0.03
  if (order === 1) deedRate = area <= 90 ? 0.01 : 0.015
  else if (order === 2) deedRate = area <= 90 ? 0.01 : 0.02
  const deedTax = round2(total * deedRate)
  items.push({
    key: 'deed',
    name: '契税',
    payer: 'buyer',
    amount: deedTax,
    note: `${order === 3 ? '三套及以上' : order === 1 ? '首套' : '二套'} · ${area <= 90 ? '≤90㎡' : '>90㎡'} · 税率 ${(deedRate * 100).toFixed(2).replace(/\.00$/, '')}%`
  })

  // ---- 增值税（卖方，仅二手房）----
  if (input.nature === 'second') {
    const hold = Number(input.holdYears) || 0
    let vat = 0
    let note = ''
    if (hold < 2) {
      vat = round2((total / 1.05) * 0.05)
      note = '不满 2 年 · 全额 5%'
    } else if (!input.ordinary) {
      const diff = Math.max(total - (Number(input.originalPrice) || 0), 0)
      vat = round2((diff / 1.05) * 0.05)
      note = '满 2 年非普通住宅 · 差额 5%'
    } else {
      note = '满 2 年普通住宅 · 免征'
    }
    items.push({ key: 'vat', name: '增值税', payer: 'seller', amount: vat, note })
  }

  // ---- 个人所得税（卖方，仅二手房）----
  if (input.nature === 'second') {
    const hold = Number(input.holdYears) || 0
    const free = hold >= 5 && input.sellerUnique
    let iit = 0
    let note = '满五唯一 · 免征'
    if (!free) {
      if (input.taxMode === 'diff') {
        const diff = Math.max(total - (Number(input.originalPrice) || 0), 0)
        iit = round2(diff * 0.2)
        note = '差额 20%'
      } else {
        iit = round2(total * 0.01)
        note = '总价 1%'
      }
    }
    items.push({ key: 'iit', name: '个人所得税', payer: 'seller', amount: iit, note })
  }

  // ---- 印花税：个人住房买卖暂免 ----
  items.push({ key: 'stamp', name: '印花税', payer: 'buyer', amount: 0, note: '个人住房买卖暂免征收' })

  // ---- 公共维修基金（买方，仅新房）----
  if (input.nature === 'new') {
    const unit = Number.isFinite(Number(input.maintenancePerSqm)) && Number(input.maintenancePerSqm) > 0
      ? Number(input.maintenancePerSqm)
      : MAINTENANCE_DEFAULT[input.houseType]
    const fund = round2(area * unit)
    items.push({
      key: 'maintenance',
      name: '公共维修基金',
      payer: 'buyer',
      amount: fund,
      note: `${area}㎡ × ${unit} 元/㎡`
    })
  }

  const buyerTotal = round2(items.filter(i => i.payer === 'buyer').reduce((s, i) => s + i.amount, 0))
  const sellerTotal = round2(items.filter(i => i.payer === 'seller').reduce((s, i) => s + i.amount, 0))
  return { ok: true, items, buyerTotal, sellerTotal, total: round2(buyerTotal + sellerTotal) }
}

function taxFail(error: string): HouseTaxResult {
  return { ok: false, error, items: [], buyerTotal: 0, sellerTotal: 0, total: 0 }
}

// ==================== 6. 购房能力评估 ====================

export interface AffordInput {
  /** 现有购房资金（首付 + 税费） */
  cash: number
  /** 每月可承受的购房支出（月供） */
  monthlyBudget: number
  months: number
  /** 计划购房面积 */
  area: number
  annualRate: number
  /** 首付比例（%） */
  downRatio: number
  /** 维修基金单价（元/㎡），缺省 100 */
  maintenancePerSqm?: number
}

export interface AffordResult {
  ok: boolean
  error?: string
  /** 由月供推出的可贷金额 */
  maxLoan: number
  /** 月供约束下的可购总价 */
  totalByLoan: number
  /** 现金约束下的可购总价 */
  totalByCash: number
  /** 可购房总价（两者取小） */
  totalPrice: number
  /** 可购房单价（元/㎡） */
  unitPrice: number
  downPayment: number
  loanAmount: number
  monthly: number
  /** 税费估算（契税 + 维修基金） */
  tax: number
  deedTax: number
  maintenance: number
  /** 约束瓶颈：月供不够 / 首付现金不够 */
  bottleneck: 'loan' | 'cash'
}

/**
 * 购房能力评估：月供与现金双约束。
 * - 月供约束：maxLoan = 由月供反推的本金 → totalByLoan = maxLoan / (1 − 首付比例)
 * - 现金约束：cash ≈ 总价×首付比例 + 契税(约 1.5%) + 维修基金 → 解出 totalByCash
 * 取两者较小值，并给出瓶颈来源。
 */
export function calcAfford(input: AffordInput): AffordResult {
  const cash = Number(input.cash)
  const budget = Number(input.monthlyBudget)
  const months = Math.floor(Number(input.months))
  const area = Number(input.area)
  const rate = Number(input.annualRate)
  const down = Number(input.downRatio)
  if (!Number.isFinite(cash) || cash < 0) return affordFail('请输入正确的现有购房资金')
  if (!Number.isFinite(budget) || budget <= 0) return affordFail('请输入正确的每月购房支出')
  if (!Number.isInteger(months) || months < 1 || months > 600) return affordFail('贷款期数需为 1–600 的整数')
  if (!Number.isFinite(area) || area <= 0) return affordFail('请输入正确的计划购房面积')
  if (!Number.isFinite(rate) || rate < 0) return affordFail('请输入正确的年利率')
  if (!Number.isFinite(down) || down <= 0 || down >= 100) return affordFail('首付比例需在 0–100 之间')

  const maintenanceUnit = Number.isFinite(Number(input.maintenancePerSqm)) && Number(input.maintenancePerSqm) > 0
    ? Number(input.maintenancePerSqm)
    : 100
  const maintenance = round2(area * maintenanceUnit)

  // 月供约束
  const rev = solveReverse({ target: 'principal', method: 'equalPayment', monthly: budget, months, annualRate: rate })
  if (!rev.ok || !rev.principal) return affordFail(rev.error || '月供反算失败')
  const maxLoan = rev.principal
  const totalByLoan = round2(maxLoan / (1 - down / 100))

  // 现金约束：cash = total×(down/100 + 契税率 1.5%) + 维修基金
  const deedRate = 0.015
  const denom = down / 100 + deedRate
  const totalByCash = round2(Math.max((cash - maintenance) / denom, 0))

  const totalPrice = round2(Math.min(totalByLoan, totalByCash))
  const downPayment = round2(totalPrice * (down / 100))
  const loanAmount = round2(totalPrice - downPayment)
  const monthly = round2(monthlyPayment(loanAmount, rate / 100 / 12, months))
  const deedTax = round2(totalPrice * deedRate)
  const unitPrice = round2(totalPrice / area)

  return {
    ok: true,
    maxLoan,
    totalByLoan,
    totalByCash,
    totalPrice,
    unitPrice,
    downPayment,
    loanAmount,
    monthly,
    tax: round2(deedTax + maintenance),
    deedTax,
    maintenance,
    bottleneck: totalByLoan <= totalByCash ? 'loan' : 'cash'
  }
}

function affordFail(error: string): AffordResult {
  return {
    ok: false, error, maxLoan: 0, totalByLoan: 0, totalByCash: 0,
    totalPrice: 0, unitPrice: 0, downPayment: 0, loanAmount: 0,
    monthly: 0, tax: 0, deedTax: 0, maintenance: 0, bottleneck: 'loan'
  }
}

// ==================== 7. 利率速查（静态数据） ====================

export interface RateRow {
  /** 期限描述 */
  term: string
  /** 利率（%） */
  rate: number
  /** 第二列（公积金首套/二套对照时用） */
  rate2?: number
}

/** LPR 报价（数据来源：全国银行间同业拆借中心，每月 20 日公布） */
export const LPR_INFO = {
  updatedAt: '2026-09-20',
  rows: [
    { term: '1 年期', rate: 3.0 },
    { term: '5 年期以上', rate: 3.5 }
  ] as RateRow[]
}

/** 商业贷款基准利率（2019 年以前，存量浮动利率贷款的定价基准） */
export const BASE_RATE_INFO = {
  updatedAt: '2019 年以前（已停更，仅供存量贷款参考）',
  rows: [
    { term: '1 年以内（含 1 年）', rate: 4.35 },
    { term: '1 年至 5 年（含 5 年）', rate: 4.75 },
    { term: '5 年以上', rate: 4.9 }
  ] as RateRow[]
}

/** 住房公积金个人住房贷款利率 */
export const GJJ_RATE_INFO = {
  updatedAt: '2025-05-07',
  columns: ['首套住房', '二套住房'],
  rows: [
    { term: '5 年以下（含 5 年）', rate: 2.1, rate2: 2.525 },
    { term: '5 年以上', rate: 2.6, rate2: 3.075 }
  ] as RateRow[]
}

/** 商业住房贷款最低首付款比例 */
export const DOWN_PAYMENT_INFO = {
  updatedAt: '2024-09-24',
  first: 15,
  second: 15
}

/** 由「面积是否 ≤144㎡」判定普通住宅（各地标准不同，仅作默认值） */
export function isOrdinaryByArea(area: number): boolean {
  const a = Number(area)
  if (!Number.isFinite(a) || a <= 0) return true
  return a <= 144
}
