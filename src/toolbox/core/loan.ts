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
      let pp = Math.min(principalPart, balance)
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

/** 明细 → CSV（导出用） */
export function scheduleToCsv(rows: ScheduleRow[]): string {
  const head = '期数,月供,本金,利息,剩余本金,提前还款'
  const body = rows.map(r => [r.period, r.payment, r.principal, r.interest, r.balance, r.prepaid ?? ''].join(','))
  return [head, ...body].join('\n')
}
