/**
 * 存款利息计算 纯逻辑测试
 * 运行：npm run test:deposit
 *
 * 覆盖：单利口径 · 本息续存/只续本金的差异 · 阶梯拆分守恒 · 流动性成本 ·
 *       存款保险分散家数 · 利率倒挂告警 · 非法输入
 */
import assert from 'node:assert/strict'
import {
  bankCount,
  buildLadder,
  calcDeposit,
  effectiveAnnual,
  runPlan,
  splitPrincipal,
  termInterest,
  PRINCIPAL_MAX
} from '../src/toolbox/core/deposit.ts'

let passed = 0
function ok(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ✔ ${name}`)
}

const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol

const RATES = { y1: 0.95, y3: 1.25, y5: 1.3 }
const base = { principal: 1000000, rates: RATES, compound: true, demandRate: 0.05, liquidityPct: 30 }

ok('单期内按单利：100 万 × 1.25% × 3 年 = 37500', () => {
  assert.equal(termInterest(1000000, 1.25, 3), 37500)
})

ok('复利等效年化：5 年 6.5% 单利 → 约 1.268% 年化', () => {
  const a = effectiveAnnual(1065000, 1000000, 5)
  assert.ok(near(a, 1.268, 0.01), `实际 ${a}`)
})

ok('本息续存 > 只续本金（3 次 1 年期）', () => {
  const c = runPlan(1000000, [{ years: 1, rate: 0.95 }, { years: 1, rate: 0.95 }, { years: 1, rate: 0.95 }], true)
  const s = runPlan(1000000, [{ years: 1, rate: 0.95 }, { years: 1, rate: 0.95 }, { years: 1, rate: 0.95 }], false)
  assert.ok(c.total > s.total, `${c.total} vs ${s.total}`)
  // 只续本金时本金不变，利息三次累加
  assert.equal(s.principal, 1000000)
  assert.ok(near(s.interest, 9500 * 3), `实际 ${s.interest}`)
})

ok('主计算：同期限利息与到期本息', () => {
  const r = calcDeposit(base)
  assert.ok(r.ok)
  assert.equal(r.terms.length, 3)
  assert.deepEqual(r.terms.map(t => t.term), [1, 3, 5])
  assert.equal(r.terms[0].interest, 9500)
  assert.equal(r.terms[1].interest, 37500)
  assert.equal(r.terms[2].interest, 65000)
  assert.equal(r.terms[2].maturity, 1065000)
})

ok('5 年口径最优策略 = 一次存 5 年（利率曲线正常时）', () => {
  const r = calcDeposit(base)
  assert.ok(r.bestStrategy)
  assert.equal(r.bestStrategy!.steps, '5 年')
  assert.equal(r.bestStrategy!.interest, 65000)
  // 3+1+1 应低于一次存 5 年
  const s311 = r.strategies5.find(s => s.key === 's5-3-1-1')!
  assert.ok(s311.interest < 65000, `实际 ${s311.interest}`)
})

ok('阶梯拆分守恒：三档之和恰等于本金，且按千元取整', () => {
  const [a1, a3, a5] = splitPrincipal(1234567, 30)
  assert.equal(a1 + a3 + a5, 1234567)
  assert.equal(a1 % 1000, 0)
  assert.equal(a3 % 1000, 0)
  assert.equal(a1, 370000)
})

ok('阶梯：30% 流动 → 1 年档 30 万、3/5 年各 35 万（10 万档也不失真）', () => {
  const [b1, b3, b5] = splitPrincipal(100000, 30)
  assert.deepEqual([b1, b3, b5], [30000, 35000, 35000])
})

ok('主计算：阶梯三档金额与占比', () => {
  const r = calcDeposit(base)
  const legs = r.ladder.legs
  assert.equal(legs[0].amount, 300000)
  assert.equal(legs[1].amount, 350000)
  assert.equal(legs[2].amount, 350000)
  assert.ok(near(legs[0].pct, 30, 0.01))
})

ok('流动性成本 = 全额 5 年利息 - 阶梯 5 年利息', () => {
  const r = calcDeposit(base)
  const pure = termInterest(1000000, RATES.y5, 5)
  assert.ok(near(r.ladder.pureInterest, pure))
  assert.ok(near(r.ladder.liquidityCost, pure - r.ladder.interestAt5))
  assert.ok(r.ladder.liquidityCost > 0, '利率曲线正常时阶梯必然少赚')
})

ok('阶梯 5 年末总额 = 本金 + 累计利息', () => {
  const r = calcDeposit(base)
  assert.ok(near(r.ladder.total, 1000000 + r.ladder.interestAt5))
})

ok('时间轴：第 5 年末可支取 = 1 年档 5 年值 + 5 年档到期值', () => {
  const l = buildLadder(1000000, RATES, true, 30)
  const y5 = l.timeline.find(t => t.year === 5)!
  const expect1y = 300000 * Math.pow(1.0095, 5)
  const expect5y = 350000 * (1 + 0.013 * 5)
  assert.ok(near(y5.amount, expect1y + expect5y, 0.05), `实际 ${y5.amount}`)
})

ok('存款保险：10 万 1 家，300 万 6 家', () => {
  assert.equal(bankCount(100000), 1)
  assert.equal(bankCount(500000), 1)
  assert.equal(bankCount(500001), 2)
  assert.equal(bankCount(PRINCIPAL_MAX), 6)
})

ok('只续本金会拉低 5 年滚动收益', () => {
  const c = calcDeposit(base)
  const s = calcDeposit({ ...base, compound: false })
  const c1x5 = c.strategies5.find(x => x.key === 's5-1x5')!.interest
  const s1x5 = s.strategies5.find(x => x.key === 's5-1x5')!.interest
  assert.ok(s1x5 < c1x5, `${s1x5} vs ${c1x5}`)
  assert.ok(s.warnings.some(w => w.includes('只续本金')))
})

ok('利率倒挂（5 年 < 3 年）给出告警', () => {
  const r = calcDeposit({ ...base, rates: { y1: 0.95, y3: 1.4, y5: 1.2 } })
  assert.ok(r.warnings.some(w => w.includes('倒挂')))
})

ok('本金非法 → ok=false 且有错误文案', () => {
  const r = calcDeposit({ ...base, principal: 0 })
  assert.equal(r.ok, false)
  assert.ok(r.error)
})

ok('超额本金给出分散银行提示', () => {
  const r = calcDeposit({ ...base, principal: 3000000 })
  assert.ok(r.warnings.some(w => w.includes('存款保险')))
})

ok('不同本金档位表标记当前档', () => {
  const r = calcDeposit({ ...base, principal: 600000 })
  const cur = r.scaleTable.filter(s => s.current)
  assert.equal(cur.length, 1)
  assert.equal(cur[0].principal, 500000)
})

console.log(`\n存款利息计算：${passed} 项全部通过`)
