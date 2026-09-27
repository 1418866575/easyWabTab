// 临时冒烟：销售记账首页（去成本卡/去设目标/公式展示/按账本维度/毛利率口径）
const { chromium } = require('playwright')

const URL = 'http://localhost:16718/business'
const results = []
function ok(name, cond, extra) {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : ''))
}

async function dismissOnboarding(page) {
  for (let i = 0; i < 12; i++) {
    const btns = await page.$$('.modal-overlay button')
    let clicked = false
    for (const b of btns) {
      const t = (await b.innerText()).trim()
      if (/知道了|开始使用|关闭|跳过|立即体验/.test(t)) {
        await b.click().catch(() => {})
        clicked = true
        await page.waitForTimeout(300)
        break
      }
    }
    if (!clicked) break
  }
}

async function openLedgerPanel(page) {
  // 若遮罩已存在（面板已打开）先点遮罩关闭，再点触发器，避免 pointer 被遮罩拦截
  if (await page.$('.bls-mask')) {
    await page.click('.bls-mask').catch(() => {})
    await page.waitForTimeout(300)
  }
  await page.click('[data-testid="bs-ledger-switcher"]')
  await page.waitForTimeout(450)
}

async function goMenu(page, key) {
  await page.click(`[data-testid="bs-menu-${key}"]`)
  await page.waitForTimeout(500)
}

;(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await dismissOnboarding(page)
  if (await page.$('[data-testid="bs-gate-submit"]')) {
    await page.click('[data-testid="bs-gate-submit"]')
    await page.waitForTimeout(800)
  }

  // 1. 造数据：商品（售价 5）→ 收摊带出 20（营业额自动 100）+ 一笔支出 30 → 毛利率应为 70.0%
  await goMenu(page, 'products')
  await page.click('[data-testid="bizprod-add"]')
  await page.waitForSelector('[data-testid="bizprod-dialog"]')
  await page.fill('[data-testid="bizprod-form-name"]', '冒烟商品')
  await page.fill('[data-testid="bizprod-form-selling"] input', '5')
  await page.fill('[data-testid="bizprod-form-purchase"] input', '2')
  await page.click('[data-testid="bizprod-save"]')
  await page.waitForTimeout(700)

  await goMenu(page, 'daily')
  await page.click('[data-testid="bizday-add"]')
  await page.waitForSelector('[data-testid="bizday-dialog"]')
  await page.click('[data-testid="bizday-row-product"]')
  await page.waitForTimeout(400)
  const dayOpt = await page.$('.el-select-dropdown__item')
  if (dayOpt) { await dayOpt.click(); await page.waitForTimeout(300) }
  // 带出 = 20（第一个数字输入）
  await page.fill('.bizday-row .bizday-nums label:nth-child(1) input', '20')
  await page.waitForTimeout(400)
  await page.click('[data-testid="bizday-save"]')
  await page.waitForTimeout(700)
  if (await page.$('[data-testid="bizday-dialog"]')) {
    await page.click('[data-testid="bizday-dialog"] .biz-dialog-close').catch(() => {})
    await page.waitForTimeout(300)
  }

  await goMenu(page, 'expenses')
  await page.click('[data-testid="bizexp-add"]')
  await page.waitForSelector('[data-testid="bizexp-dialog"]')
  await page.fill('[data-testid="bizexp-form-title"]', '摊位费')
  await page.fill('[data-testid="bizexp-form-amount"] input', '30')
  await page.click('[data-testid="bizexp-save"]')
  await page.waitForTimeout(700)

  // 2. 回首页
  await goMenu(page, 'home')
  await page.waitForTimeout(600)

  // 3. 已删除项
  ok('1 成本卡已移除', !(await page.$('[data-testid="bizhome-cost"]')))
  ok('2 设目标入口已移除', !(await page.$('[data-testid="bizhome-set-target"]')))
  ok('3 按年/按账本切换已移除',
    !(await page.$('[data-testid="bizhome-period-year"]')) && !(await page.$('[data-testid="bizhome-period-ledger"]')))
  ok('4 蓝色统计范围文案已移除', !/统计范围：/.test((await page.textContent('body')) || ''))
  const heroCards = await page.$$eval('.bizhome-hero-card', els => els.length)
  ok('5 主指标为 5 张卡', heroCards === 5, 'cards=' + heroCards)

  // 4. 毛利率 =（营业额 − 支出）/ 营业额
  const revenue = (await page.textContent('[data-testid="bizhome-revenue"]')).trim()
  const expense = (await page.textContent('[data-testid="bizhome-expense"]')).trim()
  const margin = (await page.textContent('[data-testid="bizhome-margin"]')).trim()
  ok('6 营业额 = 100.00', /100\.00/.test(revenue), revenue)
  ok('7 支出 = 30.00', /30\.00/.test(expense), expense)
  ok('8 毛利率 = 70.0%（（100-30）/100）', /70\.0%/.test(margin), margin)

  // 5. 公式与变量说明
  const formula = (await page.textContent('[data-testid="bizhome-margin-formula"]')) || ''
  ok('9 展示毛利率公式', /毛利率\s*=\s*（营业额\s*−\s*支出）\s*\/\s*营业额\s*×\s*100%/.test(formula), formula.replace(/\s+/g, ' ').trim())
  ok('10 公式标明变量含义', /营业额\s*=\s*账本内收摊营业额合计/.test(formula) && /支出\s*=\s*账本内支出合计/.test(formula))

  // 6. 统计维度：按账本 + 年度
  const scope = (await page.textContent('[data-testid="bizhome-scope"]')) || ''
  const year = String(new Date().getFullYear())
  ok('11 范围显示统计年度与账本名', scope.includes(year + ' 年') && /年账本|账本/.test(scope), scope.replace(/\s+/g, ' ').trim().slice(0, 60))
  ok('12 说明「一个账本对应一年，切换账本即切换年度」', /一个账本对应一年的数据/.test(scope) && /切换账本即切换统计年度/.test(scope))

  // 7. 切换账本 → 统计年度随之变化（创建去年账本后切回，验证口径随账本走）
  // 打开设置 → 销售记账 → 基础设置 → 新建 2025 账本
  await page.click('[data-testid="bs-settings"]')
  await page.waitForTimeout(700)
  const bizTab = await page.$('.el-dialog button:has-text("销售记账"), .el-tabs button:has-text("销售记账")')
  if (bizTab) { await bizTab.click(); await page.waitForTimeout(400) }
  let created = false
  if (await page.$('[data-testid="biz-ledger-new-year"]')) {
    await page.fill('[data-testid="biz-ledger-new-year"] input', '2025')
    await page.waitForTimeout(200)
    await page.click('[data-testid="biz-ledger-create"]')
    await page.waitForTimeout(700)
    const err = await page.textContent('[data-testid="biz-ledger-new-error"]').catch(() => '')
    console.log('   新建账本错误提示=' + (err || '(无)'))
    created = true
  }
  // 关闭设置弹窗
  const closeBtn = await page.$('.el-dialog__headerbtn, .wb-dialog-close, [data-testid="bs-settings-dialog-close"]')
  if (closeBtn) await closeBtn.click().catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(500)
  await goMenu(page, 'home')

  const before = (await page.textContent('[data-testid="bizhome-scope-label"]')).trim()
  if (created) {
    await openLedgerPanel(page)
    const allItems = await page.$$eval('[data-testid^="bs-ledger-item-"]', els => els.map(e => e.getAttribute('data-testid')))
    console.log('   账本列表=' + JSON.stringify(allItems))
    const item2025 = await page.$('[data-testid="bs-ledger-item-2025"]')
    if (item2025) { await item2025.click(); await page.waitForTimeout(700) }
    const after = (await page.textContent('[data-testid="bizhome-scope-label"]')).trim()
    ok('13 切换账本 → 统计年度随之变化', /2025 年/.test(after) && after !== before, `${before} → ${after}`)
    const emptyRevenue = (await page.textContent('[data-testid="bizhome-revenue"]')).trim()
    const emptyMargin = (await page.textContent('[data-testid="bizhome-margin"]')).trim()
    ok('13b 2025 账本无数据 → 营业额 0.00、毛利率 0.0%', /^营业额0\.00$/.test(emptyRevenue) && /^毛利率0\.0%$/.test(emptyMargin), emptyRevenue + ' / ' + emptyMargin)
    // 切回当年账本
    await openLedgerPanel(page)
    const itemCur = await page.$(`[data-testid="bs-ledger-item-${year}"]`)
    if (itemCur) { await itemCur.click(); await page.waitForTimeout(700) }
    ok('13c 切回当年账本 → 数据回到 70.0%', /70\.0%/.test((await page.textContent('[data-testid="bizhome-margin"]')).trim()))
  } else {
    console.log('   (未找到新建账本入口，跳过 13)')
  }

  // 8. 其余布局仍在
  ok('14 低库存概览仍在', !!(await page.$('[data-testid="bizhome-lowstock"]')))
  ok('15 销售排行仍在', !!(await page.$('[data-testid="bizhome-rank-tree"]')))
  ok('16 12 个月柱图仍在', !!(await page.$('[data-testid="bizhome-mini-chart"]')))
  ok('17 出摊总天数仍在', !!(await page.$('[data-testid="bizhome-stalldays"]')))
  ok('18 利润总额仍在', !!(await page.$('[data-testid="bizhome-profit"]')))

  // 9. 刷新后持久化
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await dismissOnboarding(page)
  await goMenu(page, 'home')
  await page.waitForTimeout(600)
  ok('19 刷新后毛利率仍为 70.0%', /70\.0%/.test((await page.textContent('[data-testid="bizhome-margin"]')).trim()))
  ok('20 无 JS 运行时错误', errors.length === 0, errors.slice(0, 2).join(' | '))

  await browser.close()
  const fail = results.filter(r => !r.pass)
  console.log('\n' + (results.length - fail.length) + '/' + results.length + ' PASS')
  process.exit(fail.length ? 1 : 0)
})().catch(e => {
  console.error('SMOKE ERROR', e)
  process.exit(1)
})
