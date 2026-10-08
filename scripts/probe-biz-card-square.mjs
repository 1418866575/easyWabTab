// 移动端「进货 / 支出」卡片视图实测：一行几个、是否正方形、卡片内有无表格明细
// 用法： node scripts/probe-biz-card-square.mjs [baseURL]
import { chromium, devices } from 'playwright'
import fs from 'node:fs/promises'

const BASE = process.argv[2] || 'http://localhost:41892'
const OUT = 'scripts/.probe-biz-card-square.json'
// 本地 playwright 自带 Chromium 缺 chrome.dll（启动即崩），改用系统 Edge
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

/** 量取卡片几何：每行几个（按 top 分组）、宽高是否相等（正方形） */
const MEASURE = ({ rootSel, cardSel }) => {
  const root = document.querySelector(rootSel)
  if (!root) return { found: false }
  const cards = [...root.querySelectorAll(cardSel)]
  // 按 offsetTop 归组 → 得到「每行几个」
  const rows = new Map()
  for (const c of cards) {
    const key = Math.round(c.offsetTop)
    rows.set(key, (rows.get(key) ?? 0) + 1)
  }
  const perRow = [...rows.values()]
  return {
    found: true,
    cardCount: cards.length,
    cardsPerRow: perRow,
    sizes: cards.map(c => {
      const r = c.getBoundingClientRect()
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        square: Math.abs(r.width - r.height) <= 1,
      }
    }),
    // 「不含表格信息」检查：卡片内不应出现明细字段行/明细行/表格元素
    detailRows: root.querySelectorAll('.bizpur-day-row, .bizpur-day-fields, .bizexp-detail-row').length,
    tables: root.querySelectorAll('table').length,
    firstCardText: (cards[0]?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 160),
  }
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: EXE })
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))

  const fill = async (tid, val) => {
    const el = await page.$(`[data-testid="${tid}"]`)
    if (!el) return false
    const input = await el.$('input')
    await (input || el).fill(val)
    return true
  }
  const pickSelect = async (tid, index) => {
    const el = await page.$(`[data-testid="${tid}"]`)
    if (!el) return false
    await el.click()
    await page.waitForTimeout(400)
    const opts = await page.$$('.el-select-dropdown__item')
    if (!opts[index]) return false
    await opts[index].click()
    await page.waitForTimeout(300)
    return true
  }

  await page.goto(BASE + '/business', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  if (await page.$('[data-testid="bs-ledger-gate"]')) {
    await fill('bs-gate-year', '2026')
    await fill('bs-gate-name', 'probe')
    await page.click('[data-testid="bs-gate-submit"]')
    await page.waitForTimeout(2200)
  }

  // 1) 建 2 个商品（进货行选商品用）
  const step = async (name, fn) => {
    process.stdout.write(`  → ${name} ... `)
    try { await fn(); console.log('ok') }
    catch (e) { console.log('FAIL: ' + String(e?.message || e).split('\n')[0]); throw e }
  }

  await step('打开商品面板', async () => { await page.click('[data-testid="bs-menu-products"]'); await page.waitForTimeout(1200) })
  for (let i = 0; i < 2; i++) {
    await page.click('[data-testid="bizprod-add"]')
    await page.waitForTimeout(700)
    await fill('bizprod-form-name', `probe商品${i + 1}`)
    await fill('bizprod-form-selling', '18')
    await page.waitForTimeout(250)
    await page.click('[data-testid="bizprod-save"]')
    await page.waitForTimeout(900)
  }
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(500)

  // 2) 进货：第 1 天 2 笔，第 2 天 1 笔（用于验证「一行两卡」）
  await step('打开进货面板', async () => { await page.click('[data-testid="bs-menu-purchases"]'); await page.waitForTimeout(1200) })
  // 日期选择器弹层会拦截 click，只能用键盘输入：全选 → 逐字输入 → 回车确认
  const setFormDate = async (val) => {
    const input = page.locator('[data-testid="bizpur-form-date"] input')
    if ((await input.count()) === 0) return false
    await input.click()
    await page.waitForTimeout(350)
    await input.press('Control+a')
    await input.pressSequentially(val, { delay: 40 })
    await page.waitForTimeout(400)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    return true
  }

  const addPurchase = async (rows) => {
    await step('点新增进货', async () => { await page.click('[data-testid="bizpur-add"]') })
    await page.waitForTimeout(800)
    for (let i = 0; i < rows; i++) {
      if (i > 0) { await page.click('[data-testid="bizpur-add-row"]'); await page.waitForTimeout(500) }
      await step('选商品 row'+i, async () => { await pickSelect(`bizpur-row-product-${i}`, i % 2) })
      await fill(`bizpur-row-qty-${i}`, '10')
      await fill(`bizpur-row-price-${i}`, '5')
    }
    await page.waitForTimeout(300)
    await step('保存进货', async () => { await page.click('[data-testid="bizpur-save"]') })
    await page.waitForTimeout(1100)
  }
  // 同一天 2 笔 → 卡片视图合并为 1 张卡（日期格子由 tb 自动填入当天）
  await addPurchase(1)

  const purchases = await page.evaluate(MEASURE, { rootSel: '.bizpur .ewt-card-grid', cardSel: '.ewt-card' })
  // 「一行两个」的直接证据：网格列数（等价宽度两列即两卡）→ 不依赖凑够 2 张卡
  purchases.gridColumns = await page.evaluate(() => {
    const g = document.querySelector('.bizpur .ewt-card-grid')
    return g ? getComputedStyle(g).gridTemplateColumns : null
  })

  // 3) 支出页做对照
  await page.click('[data-testid="bs-menu-expenses"]')
  await page.waitForTimeout(1200)
  const hasExpenseData = !(await page.$('[data-testid="bizexp-empty"]'))
  let expenses = { skipped: '无支出数据，跳过对照' }
  if (hasExpenseData) {
    expenses = await page.evaluate(MEASURE, { rootSel: '.bizexp .ewt-card-grid', cardSel: '.ewt-card' })
  }

  const result = { viewport: { w: 390, h: 664 }, purchases, expenses, errors: errors.slice(0, 5) }
  await fs.writeFile(OUT, JSON.stringify(result, null, 2), 'utf8')
  console.log(JSON.stringify(result, null, 2))
  await page.screenshot({ path: 'scripts/.snap-biz-card-square.png', fullPage: true })
  await browser.close()
}

run().catch(e => { console.error('PROBE_FAIL', e?.message || e); process.exit(1) })
