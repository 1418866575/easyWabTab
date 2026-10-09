/**
 * 贷款计算扩展纯逻辑测试
 * 运行：npm run test:loan-extra
 *
 * 覆盖：组合贷 / 提前还贷 / 利率变动 / 贷款反算 / 购房税费 / 购房能力评估 / 利率数据
 */
import assert from "node:assert/strict"
import {
  calcCombo,
  comboToCsv,
  calcPrepay,
  calcRateChange,
  solveReverse,
  calcHouseTax,
  calcAfford,
  isOrdinaryByArea,
  MAINTENANCE_DEFAULT,
  LPR_INFO,
  GJJ_RATE_INFO,
  DOWN_PAYMENT_INFO
} from "../src/toolbox/core/loanExtra.ts"
import { calcLoan, monthlyPayment } from "../src/toolbox/core/loan.ts"

let passed = 0
function ok(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ✔ ${name}`)
}
/** 浮点比较：金额类允许 0.01 元误差，比率类允许 1e-4 */
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol

console.log("贷款计算扩展 core 测试\n")

// ---------- 基准：等额本息月供 ----------
console.log("[基准]")
ok("100万 / 3.5% / 30年 月供 ≈ 4490.45", () => {
  const m = monthlyPayment(1000000, 0.035 / 12, 360)
  assert.ok(near(m, 4490.45, 0.5), `月供 ${m} 偏离预期`)
})
ok("零利率退化为均分本金", () => {
  assert.equal(monthlyPayment(120000, 0, 120), 1000)
})

// ---------- 1. 组合贷 ----------
console.log("\n[组合贷]")
const combo = calcCombo({
  commercial: { principal: 700000, annualRate: 3.5 },
  provident: { principal: 300000, annualRate: 2.6 },
  months: 360,
  method: "equalPayment"
})
ok("基本结果 ok 且本金合计 = 100万", () => {
  assert.equal(combo.ok, true)
  assert.equal(combo.totalPrincipal, 1000000)
  assert.equal(combo.months, 360)
})
ok("合并首月 = 商贷首月 + 公积金首月", () => {
  assert.ok(near(combo.firstPayment, combo.commercialMonthly + combo.providentMonthly))
})
ok("合并总利息 = 两笔之和", () => {
  const a = calcLoan({ principal: 700000, annualRate: 3.5, months: 360 }).totalInterest
  const b = calcLoan({ principal: 300000, annualRate: 2.6, months: 360 }).totalInterest
  assert.ok(near(combo.totalInterest, a + b))
})
// 还款合计是 360 期逐期 round2 后的累加，与「本金 + 利息」会有不到 1 元的累积舍入差，容差取 2
ok("本息合计 ≈ 本金 + 利息（容差 2 元）", () => {
  assert.ok(near(combo.totalPayment, combo.totalPrincipal + combo.totalInterest, 2),
    `合计 ${combo.totalPayment} vs ${combo.totalPrincipal + combo.totalInterest}`)
})
ok("等额本金下首月 > 末月", () => {
  const r = calcCombo({
    commercial: { principal: 700000, annualRate: 3.5 },
    provident: { principal: 300000, annualRate: 2.6 },
    months: 360,
    method: "equalPrincipal"
  })
  assert.ok(r.firstPayment > r.lastPayment, `${r.firstPayment} vs ${r.lastPayment}`)
})
ok("公积金为 0 时退化为纯商贷", () => {
  const r = calcCombo({
    commercial: { principal: 700000, annualRate: 3.5 },
    provident: { principal: 0, annualRate: 2.6 },
    months: 360
  })
  assert.equal(r.ok, true)
  assert.equal(r.providentMonthly, 0)
  assert.ok(near(r.firstPayment, calcLoan({ principal: 700000, annualRate: 3.5, months: 360 }).firstPayment))
})
ok("CSV 导出含表头与 360 行", () => {
  const csv = comboToCsv(combo.rows)
  assert.ok(csv.startsWith("期数,商贷月供,公积金月供"))
  assert.equal(csv.split("\n").length, 361)
})
ok("两笔都为 0 时报错", () => {
  const r = calcCombo({ commercial: { principal: 0, annualRate: 3.5 }, provident: { principal: 0, annualRate: 2.6 }, months: 360 })
  assert.equal(r.ok, false)
})

// ---------- 2. 提前还贷 ----------
console.log("\n[提前还贷]")
const base360 = calcLoan({ principal: 1000000, annualRate: 3.5, months: 360, method: "equalPayment" })
ok("原合同基准：360 期、月供约 4490", () => {
  assert.equal(base360.rows.length, 360)
  assert.ok(near(base360.monthly, 4490.45, 0.5))
})

const prepayKeepTerm = calcPrepay({
  principal: 1000000, annualRate: 3.5, months: 360, method: "equalPayment",
  paidMonths: 12, amount: 200000, payAll: false, mode: "keepTerm"
})
ok("期限不变：剩余期数 = 348、月供下降", () => {
  assert.equal(prepayKeepTerm.ok, true)
  assert.equal(prepayKeepTerm.newMonths, 348)
  assert.ok(prepayKeepTerm.newMonthly < base360.monthly, `新月供 ${prepayKeepTerm.newMonthly} 应低于 ${base360.monthly}`)
})
ok("期限不变：节省利息为正", () => {
  assert.ok(prepayKeepTerm.savedInterest > 0)
  assert.ok(near(prepayKeepTerm.savedInterest, prepayKeepTerm.oldRemainInterest - prepayKeepTerm.newRemainInterest))
})
ok("期限不变：已还本息 = 前 12 期之和", () => {
  const done = base360.rows.slice(0, 12)
  const pi = done.reduce((s, r) => s + r.interest, 0)
  assert.ok(near(prepayKeepTerm.paidInterest, pi, 0.5))
})
ok("期限不变：剩余本金 = 第 12 期期末余额", () => {
  assert.ok(near(prepayKeepTerm.remainPrincipal, base360.rows[11].balance))
})

const prepayKeepPay = calcPrepay({
  principal: 1000000, annualRate: 3.5, months: 360, method: "equalPayment",
  paidMonths: 12, amount: 200000, payAll: false, mode: "keepPayment"
})
ok("月供不变：月供接近原月供、期限缩短", () => {
  assert.equal(prepayKeepPay.ok, true)
  assert.ok(near(prepayKeepPay.newMonthly, base360.monthly, 1), `新月供 ${prepayKeepPay.newMonthly} 应接近原月供 ${base360.monthly}`)
  assert.ok(prepayKeepPay.newMonths < 348, `新期数 ${prepayKeepPay.newMonths} 应 < 348`)
})
ok("月供不变比期限不变省更多利息", () => {
  assert.ok(prepayKeepPay.savedInterest > prepayKeepTerm.savedInterest)
})

const prepayAll = calcPrepay({
  principal: 1000000, annualRate: 3.5, months: 360, method: "equalPayment",
  paidMonths: 12, amount: 0, payAll: true, mode: "keepTerm"
})
ok("全部还清：新本金 0、节省 = 原剩余利息", () => {
  assert.equal(prepayAll.ok, true)
  assert.equal(prepayAll.newPrincipal, 0)
  assert.equal(prepayAll.newMonths, 0)
  assert.ok(near(prepayAll.savedInterest, prepayAll.oldRemainInterest))
})
ok("已还期数越界报错", () => {
  const r = calcPrepay({ principal: 1000000, annualRate: 3.5, months: 360, paidMonths: 360, amount: 10000, payAll: false, mode: "keepTerm" })
  assert.equal(r.ok, false)
})
ok("还款金额为 0 且非全部还清时报错", () => {
  const r = calcPrepay({ principal: 1000000, annualRate: 3.5, months: 360, paidMonths: 12, amount: 0, payAll: false, mode: "keepTerm" })
  assert.equal(r.ok, false)
})
ok("等额本金也可提前还款", () => {
  const r = calcPrepay({
    principal: 1000000, annualRate: 3.5, months: 360, method: "equalPrincipal",
    paidMonths: 24, amount: 300000, payAll: false, mode: "keepTerm"
  })
  assert.equal(r.ok, true)
  assert.equal(r.newMonths, 336)
  assert.ok(r.savedInterest > 0)
})

// ---------- 3. 利率变动 ----------
console.log("\n[利率变动]")
const rcDown = calcRateChange({
  principal: 1000000, annualRate: 3.5, months: 360, method: "equalPayment",
  paidMonths: 60, newRate: 3.0
})
ok("降息：利息减少、新月供下降", () => {
  assert.equal(rcDown.ok, true)
  assert.ok(rcDown.interestDelta < 0, `利息变动 ${rcDown.interestDelta} 应为负`)
  assert.ok(rcDown.newMonthly < base360.monthly)
})
ok("降息：剩余本金 = 第 60 期期末余额、剩余期数 300", () => {
  assert.ok(near(rcDown.remainPrincipal, base360.rows[59].balance))
  assert.equal(rcDown.remainMonths, 300)
})
const rcUp = calcRateChange({
  principal: 1000000, annualRate: 3.5, months: 360, method: "equalPayment",
  paidMonths: 60, newRate: 4.0
})
ok("加息：利息增加", () => {
  assert.ok(rcUp.interestDelta > 0)
  assert.ok(rcUp.newMonthly > base360.monthly)
})
ok("利率不变时变动额为 0", () => {
  const r = calcRateChange({ principal: 1000000, annualRate: 3.5, months: 360, paidMonths: 60, newRate: 3.5 })
  assert.ok(near(Math.abs(r.interestDelta), 0, 1))
})
ok("已还期数为 0 时剩余本金 = 贷款本金", () => {
  const r = calcRateChange({ principal: 1000000, annualRate: 3.5, months: 360, paidMonths: 0, newRate: 3.0 })
  assert.equal(r.remainPrincipal, 1000000)
})

// ---------- 4. 贷款反算 ----------
console.log("\n[贷款反算]")
ok("反算本金：由月供 4490.45 还原 100万", () => {
  const r = solveReverse({ target: "principal", method: "equalPayment", monthly: 4490.45, months: 360, annualRate: 3.5 })
  assert.equal(r.ok, true)
  assert.ok(near(r.principal ?? 0, 1000000, 50), `反算本金 ${r.principal}`)
})
ok("反算本金：零利率下 = 月供 × 期数", () => {
  const r = solveReverse({ target: "principal", monthly: 1000, months: 120, annualRate: 0 })
  assert.equal(r.ok, true)
  assert.ok(near(r.principal ?? 0, 120000, 1))
})
ok("反算利率：由 100万与月供 4490.45 还原 3.5%", () => {
  const r = solveReverse({ target: "rate", method: "equalPayment", monthly: 4490.45, months: 360, principal: 1000000 })
  assert.equal(r.ok, true)
  assert.ok(near(r.annualRate ?? 0, 3.5, 0.01), `反算利率 ${r.annualRate}`)
})
ok("反算利率：正算校验月供与输入一致", () => {
  const r = solveReverse({ target: "rate", monthly: 5000, months: 240, principal: 800000 })
  assert.equal(r.ok, true)
  assert.ok(near(r.checkMonthly ?? 0, 5000, 0.5), `校验月供 ${r.checkMonthly}`)
})
ok("反算本金（等额本金，首月还款）", () => {
  // 100万 / 3.5% / 360 期 等额本金：首月 = 1000000/360 + 1000000*0.035/12
  const first = 1000000 / 360 + (1000000 * 0.035) / 12
  const r = solveReverse({ target: "principal", method: "equalPrincipal", monthly: first, months: 360, annualRate: 3.5 })
  assert.equal(r.ok, true)
  assert.ok(near(r.principal ?? 0, 1000000, 50), `反算本金 ${r.principal}`)
})
ok("反算利率（等额本金）还原 3.5%", () => {
  const first = 1000000 / 360 + (1000000 * 0.035) / 12
  const r = solveReverse({ target: "rate", method: "equalPrincipal", monthly: first, months: 360, principal: 1000000 })
  assert.equal(r.ok, true)
  assert.ok(near(r.annualRate ?? 0, 3.5, 0.01), `反算利率 ${r.annualRate}`)
})
ok("月供为 0 / 负数报错", () => {
  assert.equal(solveReverse({ target: "principal", monthly: 0, months: 360, annualRate: 3.5 }).ok, false)
  assert.equal(solveReverse({ target: "principal", monthly: -1, months: 360, annualRate: 3.5 }).ok, false)
})
ok("反算利率但缺本金时报错", () => {
  assert.equal(solveReverse({ target: "rate", monthly: 5000, months: 360 }).ok, false)
})

// ---------- 5. 购房税费 ----------
console.log("\n[购房税费]")
ok("新房首套 90㎡ 500万：契税 1% = 5万", () => {
  const r = calcHouseTax({
    nature: "new", familyOrder: 1, area: 90, totalPrice: 5000000,
    ordinary: true, sellerUnique: true, holdYears: 0, taxMode: "total",
    originalPrice: 0, houseType: "high"
  })
  assert.equal(r.ok, true)
  const deed = r.items.find(i => i.key === "deed")
  assert.ok(deed && near(deed.amount, 50000), `契税 ${deed?.amount}`)
})
ok("新房首套 100㎡：契税 1.5% = 7.5万", () => {
  const r = calcHouseTax({
    nature: "new", familyOrder: 1, area: 100, totalPrice: 5000000,
    ordinary: true, sellerUnique: true, holdYears: 0, taxMode: "total",
    originalPrice: 0, houseType: "high"
  })
  const deed = r.items.find(i => i.key === "deed")
  assert.ok(deed && near(deed.amount, 75000), `契税 ${deed?.amount}`)
})
ok("二套 >90㎡：契税 2% = 10万", () => {
  const r = calcHouseTax({
    nature: "new", familyOrder: 2, area: 100, totalPrice: 5000000,
    ordinary: true, sellerUnique: true, holdYears: 0, taxMode: "total",
    originalPrice: 0, houseType: "high"
  })
  const deed = r.items.find(i => i.key === "deed")
  assert.ok(deed && near(deed.amount, 100000), `契税 ${deed?.amount}`)
})
ok("三套及以上：契税 3% = 15万", () => {
  const r = calcHouseTax({
    nature: "new", familyOrder: 3, area: 60, totalPrice: 5000000,
    ordinary: true, sellerUnique: true, holdYears: 0, taxMode: "total",
    originalPrice: 0, houseType: "high"
  })
  const deed = r.items.find(i => i.key === "deed")
  assert.ok(deed && near(deed.amount, 150000), `契税 ${deed?.amount}`)
})
ok("新房缴维修基金：100㎡ 高层 = 1万", () => {
  const r = calcHouseTax({
    nature: "new", familyOrder: 1, area: 100, totalPrice: 5000000,
    ordinary: true, sellerUnique: true, holdYears: 0, taxMode: "total",
    originalPrice: 0, houseType: "high"
  })
  const m = r.items.find(i => i.key === "maintenance")
  assert.ok(m && near(m.amount, 10000), `维修基金 ${m?.amount}`)
  assert.equal(MAINTENANCE_DEFAULT.high, 100)
})
ok("新房无增值税与个税", () => {
  const r = calcHouseTax({
    nature: "new", familyOrder: 1, area: 90, totalPrice: 5000000,
    ordinary: true, sellerUnique: true, holdYears: 0, taxMode: "total",
    originalPrice: 0, houseType: "multi"
  })
  assert.equal(r.items.some(i => i.key === "vat"), false)
  assert.equal(r.items.some(i => i.key === "iit"), false)
})
ok("二手房不满 2 年：增值税按全额 5%", () => {
  const r = calcHouseTax({
    nature: "second", familyOrder: 1, area: 90, totalPrice: 5000000,
    ordinary: true, sellerUnique: false, holdYears: 1, taxMode: "total",
    originalPrice: 3000000, houseType: "high"
  })
  const vat = r.items.find(i => i.key === "vat")
  assert.ok(vat && near(vat.amount, (5000000 / 1.05) * 0.05), `增值税 ${vat?.amount}`)
})
ok("二手房满 2 年普通住宅：增值税免征", () => {
  const r = calcHouseTax({
    nature: "second", familyOrder: 1, area: 90, totalPrice: 5000000,
    ordinary: true, sellerUnique: false, holdYears: 3, taxMode: "total",
    originalPrice: 3000000, houseType: "high"
  })
  const vat = r.items.find(i => i.key === "vat")
  assert.ok(vat && vat.amount === 0)
})
ok("二手房满五唯一：个税免征", () => {
  const r = calcHouseTax({
    nature: "second", familyOrder: 1, area: 90, totalPrice: 5000000,
    ordinary: true, sellerUnique: true, holdYears: 5, taxMode: "total",
    originalPrice: 3000000, houseType: "high"
  })
  const iit = r.items.find(i => i.key === "iit")
  assert.ok(iit && iit.amount === 0)
})
ok("个税按总价 1%", () => {
  const r = calcHouseTax({
    nature: "second", familyOrder: 1, area: 90, totalPrice: 5000000,
    ordinary: true, sellerUnique: false, holdYears: 3, taxMode: "total",
    originalPrice: 3000000, houseType: "high"
  })
  const iit = r.items.find(i => i.key === "iit")
  assert.ok(iit && near(iit.amount, 50000), `个税 ${iit?.amount}`)
})
ok("个税按差额 20%", () => {
  const r = calcHouseTax({
    nature: "second", familyOrder: 1, area: 90, totalPrice: 5000000,
    ordinary: true, sellerUnique: false, holdYears: 3, taxMode: "diff",
    originalPrice: 3000000, houseType: "high"
  })
  const iit = r.items.find(i => i.key === "iit")
  assert.ok(iit && near(iit.amount, 400000), `个税 ${iit?.amount}`)
})
ok("印花税为 0（个人住房暂免）", () => {
  const r = calcHouseTax({
    nature: "new", familyOrder: 1, area: 90, totalPrice: 5000000,
    ordinary: true, sellerUnique: true, holdYears: 0, taxMode: "total",
    originalPrice: 0, houseType: "high"
  })
  const s = r.items.find(i => i.key === "stamp")
  assert.ok(s && s.amount === 0)
})
ok("买方/卖方合计 = 总计", () => {
  const r = calcHouseTax({
    nature: "second", familyOrder: 2, area: 120, totalPrice: 8000000,
    ordinary: false, sellerUnique: false, holdYears: 3, taxMode: "diff",
    originalPrice: 5000000, houseType: "high"
  })
  assert.ok(near(r.total, r.buyerTotal + r.sellerTotal))
  assert.ok(r.buyerTotal > 0 && r.sellerTotal > 0)
})
ok("面积为 0 报错", () => {
  const r = calcHouseTax({
    nature: "new", familyOrder: 1, area: 0, totalPrice: 5000000,
    ordinary: true, sellerUnique: true, holdYears: 0, taxMode: "total",
    originalPrice: 0, houseType: "high"
  })
  assert.equal(r.ok, false)
})
ok("普通住宅默认判定：≤144㎡ 为普通", () => {
  assert.equal(isOrdinaryByArea(120), true)
  assert.equal(isOrdinaryByArea(144), true)
  assert.equal(isOrdinaryByArea(160), false)
})

// ---------- 6. 购房能力评估 ----------
console.log("\n[购房能力评估]")
const afford = calcAfford({
  cash: 1000000, monthlyBudget: 10000, months: 360,
  area: 100, annualRate: 3.5, downRatio: 30
})
ok("基本结果 ok", () => {
  assert.equal(afford.ok, true)
  assert.ok(afford.totalPrice > 0)
})
ok("总价 = 首付 + 贷款", () => {
  assert.ok(near(afford.totalPrice, afford.downPayment + afford.loanAmount, 1))
})
ok("月供不超过预算", () => {
  assert.ok(afford.monthly <= 10000 + 0.01, `月供 ${afford.monthly} 超出预算`)
})
ok("单价 = 总价 / 面积", () => {
  assert.ok(near(afford.unitPrice, afford.totalPrice / 100, 0.01))
})
ok("取月供与现金约束的较小值", () => {
  assert.ok(near(afford.totalPrice, Math.min(afford.totalByLoan, afford.totalByCash), 0.01))
  assert.equal(afford.bottleneck, afford.totalByLoan <= afford.totalByCash ? "loan" : "cash")
})
ok("现金极充裕时瓶颈为月供", () => {
  const r = calcAfford({ cash: 1e9, monthlyBudget: 5000, months: 360, area: 100, annualRate: 3.5, downRatio: 30 })
  assert.equal(r.bottleneck, "loan")
})
ok("月供极高时瓶颈为首付现金", () => {
  const r = calcAfford({ cash: 300000, monthlyBudget: 100000, months: 360, area: 100, annualRate: 3.5, downRatio: 30 })
  assert.equal(r.bottleneck, "cash")
})
ok("首付比例越界报错", () => {
  assert.equal(calcAfford({ cash: 1e6, monthlyBudget: 10000, months: 360, area: 100, annualRate: 3.5, downRatio: 0 }).ok, false)
  assert.equal(calcAfford({ cash: 1e6, monthlyBudget: 10000, months: 360, area: 100, annualRate: 3.5, downRatio: 100 }).ok, false)
})
ok("税费 = 契税 + 维修基金", () => {
  assert.ok(near(afford.tax, afford.deedTax + afford.maintenance, 0.01))
})

// ---------- 7. 利率数据 ----------
console.log("\n[利率数据]")
ok("LPR 数据存在且为两档", () => {
  assert.equal(LPR_INFO.rows.length, 2)
  assert.ok(LPR_INFO.updatedAt.length > 0)
  assert.equal(LPR_INFO.rows[1].rate, 3.5)
})
ok("公积金利率：首套 5 年以上 2.6%、二套 3.075%", () => {
  const row = GJJ_RATE_INFO.rows.find(r => r.term.includes("5 年以上"))
  assert.ok(row)
  assert.equal(row?.rate, 2.6)
  assert.equal(row?.rate2, 3.075)
})
ok("最低首付比例有值", () => {
  assert.equal(DOWN_PAYMENT_INFO.first, 15)
  assert.equal(DOWN_PAYMENT_INFO.second, 15)
})

console.log(`\n全部通过：${passed} 项`)
