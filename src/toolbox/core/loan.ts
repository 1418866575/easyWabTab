/**
 * 贷款 / 房贷计算纯函数（零依赖）
 * 支持等额本息、等额本金、提前还款（减少月供 / 缩短期限），输出完整还款计划。
 */

export type RepayMethod = 'equalPayment' | 'equalPrincipal'

export interface LoanInput {
  principal: number
  annualRate: number
  months: number
  method?: RepayMethod
  /** 提前还款：第 atMonth 期期末一次性还 amount */
  prepay?: { amount: number; atMonth: number; mode?: 'reducePayment' | 'shortenTerm' }
}

export interface ScheduleRow {
  period: number
  payment: number
  principal: number
  interest: number
  balance: number
  /** 本期是否发生提前还款 */
  prepaid?: number
}

export interface LoanResult {
  ok: boolean
  error?: string
  monthly: number
  firstPayment: number
  lastPayment: number
  totalInterest: number
  totalPayment: number
  savedInterest: number
  months: number
  rows: ScheduleRow[]
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** 等额本息月供 */
export function monthlyPayment(principal: number, monthlyRate: number, months: number): number {
  if (months <= 0) return 0
  if (monthlyRate === 0) return principal / months
  const pow = Math.pow(1 + monthlyRate, months)
  return (principal * monthlyRate * pow) / (pow - 1)
}

/** 计算还款计划 */
export function calcLoan(input: LoanInput): LoanResult {
  const p = Number(input.principal)
  const rate = Number(input.annualRate) / 100 / 12
  const months = Math.floor(Number(input.months))
  if (!Number.isFinite(p) || p <= 0) return fail('请输入正确的贷款金额')
  if (!Number.isFinite(rate) || rate < 0) return fail('请输入正确的年利率')
  if (!Number.isInteger(months) || months < 1 || months > 600) return fail('贷款期数需为 1–600 的整数')

  const method: RepayMethod = input.method || 'equalPayment'
  const rows: ScheduleRow[] = []
  let balance = p
  let totalInterest = 0

  if (method === 'equalPayment') {
    let payment = monthlyPayment(p, rate, months)
    for (let i = 1; i <= months; i++) {
      const interest = balance * rate
      let principalPart = payment - interest
      let prepaid = 0
      // 提前还款（期末一次性）
      if (input.prepay && input.prepay.atMonth === i && input.prepay.amount > 0) {
        prepaid = Math.min(input.prepay.amount, Math.max(balance - principalPart, 0))
      }
      if (principalPart > balance) principalPart = balance
      balance = Math.max(balance - principalPart - prepaid, 0)
      totalInterest += interest
      rows.push({
        period: i,
        payment: round2(payment + prepaid),
        principal: round2(principalPart),
        interest: round2(interest),
        balance: round2(balance),
        prepaid: prepaid ? round2(prepaid) : undefined
      })
      // 减少月供：重算剩余期数的月供
      if (prepaid > 0 && input.prepay?.mode === 'reducePayment' && balance > 0) {
        payment = monthlyPayment(balance, rate, months - i)
      }
      if (balance <= 0) break
    }
  } else {
    const principalPart = p / months
    for (let i = 1; i <= months; i++) {
      const interest = balance * rate
      const pp = Math.min(principalPart, balance)
      let prepaid = 0
      if (input.prepay && input.prepay.atMonth === i && input.prepay.amount > 0) {
        prepaid = Math.min(input.prepay.amount, Math.max(balance - pp, 0))
      }
      balance = Math.max(balance - pp - prepaid, 0)
      totalInterest += interest
      rows.push({
        period: i,
        payment: round2(pp + interest + prepaid),
        principal: round2(pp),
        interest: round2(interest),
        balance: round2(balance),
        prepaid: prepaid ? round2(prepaid) : undefined
      })
      if (balance <= 0) break
    }
  }

  const totalPayment = rows.reduce((s, r) => s + r.payment, 0)
  const baseline = calcBaseline(p, rate, months, method)
  return {
    ok: true,
    monthly: round2(rows[0]?.payment || 0),
    firstPayment: round2(rows[0]?.payment || 0),
    lastPayment: round2(rows[rows.length - 1]?.payment || 0),
    totalInterest: round2(totalInterest),
    totalPayment: round2(totalPayment),
    savedInterest: round2(baseline - totalInterest),
    months: rows.length,
    rows
  }
}

function calcBaseline(p: number, rate: number, months: number, method: RepayMethod): number {
  let balance = p
  let interest = 0
  if (method === 'equalPayment') {
    const payment = monthlyPayment(p, rate, months)
    for (let i = 0; i < months && balance > 0; i++) {
      const it = balance * rate
      interest += it
      balance = Math.max(balance - (payment - it), 0)
    }
  } else {
    const pp = p / months
    for (let i = 0; i < months && balance > 0; i++) {
      interest += balance * rate
      balance = Math.max(balance - pp, 0)
    }
  }
  return interest
}

function fail(error: string): LoanResult {
  return { ok: false, error, monthly: 0, firstPayment: 0, lastPayment: 0, totalInterest: 0, totalPayment: 0, savedInterest: 0, months: 0, rows: [] }
}

/** 两种方式对比 */
export function compareMethods(input: LoanInput): { equalPayment: LoanResult; equalPrincipal: LoanResult } {
  return {
    equalPayment: calcLoan({ ...input, method: 'equalPayment' }),
    equalPrincipal: calcLoan({ ...input, method: 'equalPrincipal' })
  }
}

export interface YearRow {
  /** 第几年（1 起） */
  year: number
  /** 当年期数区间，如 "第 1–12 期" */
  periodRange: string
  /** 当年实际支付的利息（当年各期利息之和，不累计） */
  yearInterest: number
  /** 截至该年累计已还利息（第 1 至第 N 年各期利息之和） */
  cumInterest: number
  /** 累计已还利息占总利息的百分比（0–100） */
  cumPercent: number
  /** 该年是否部分年度未还清（即非最后一年 / 期末仍有余额） */
  partial: boolean
}

/** 按年份汇总利息统计（累计已还利息 + 当年实际支付利息） */
export function yearlyInterest(rows: ScheduleRow[], totalInterest: number, nominalMonths?: number): YearRow[] {
  const list: YearRow[] = []
  if (!rows || !rows.length) return list
  const total = Number(totalInterest) || 0
  const lastRow = rows[rows.length - 1]
  // 最后一期所在年是否“未覆盖满 12 期”（提前还款缩短期限时会出现）
  const lastYearPartial = !!nominalMonths && lastRow.period % 12 !== 0
  let cum = 0
  for (const r of rows) {
    const year = Math.ceil(r.period / 12)
    let cur = list[list.length - 1]
    if (!cur || cur.year !== year) {
      cur = {
        year,
        periodRange: `${(year - 1) * 12 + 1}–${r.period}`,
        yearInterest: 0,
        cumInterest: 0,
        cumPercent: 0,
        partial: false
      }
      list.push(cur)
    }
    cur.yearInterest = round2(cur.yearInterest + r.interest)
    cur.periodRange = `${(year - 1) * 12 + 1}–${r.period}`
    cum = round2(cum + r.interest)
    cur.cumInterest = cum
  }
  // 累计占比按最终累计值统一计算，避免逐年舍入累积误差
  list.forEach((y) => {
    y.cumPercent = total > 0 ? Math.round((y.cumInterest / total) * 10000) / 100 : 0
  })
  // 标注“部分年度”：非最后一年，或最后一年未还满 12 期（如提前还款缩短期限）
  list.forEach((y, i) => {
    y.partial = i < list.length - 1 || lastYearPartial
  })
  return list
}

/** 明细 → CSV（导出用） */
export function scheduleToCsv(rows: ScheduleRow[]): string {
  const head = '期数,月供,本金,利息,剩余本金,提前还款'
  const body = rows.map(r => [r.period, r.payment, r.principal, r.interest, r.balance, r.prepaid ?? ''].join(','))
  return [head, ...body].join('\n')
}

/** 年度统计 → CSV（导出用） */
export function yearlyToCsv(years: YearRow[]): string {
  const head = '年份,期数区间,当年已还利息,累计已还利息,累计占比(%)'
  const body = years.map(y => [y.year, y.periodRange, y.yearInterest, y.cumInterest, y.cumPercent].join(','))
  return [head, ...body].join('\n')
}
