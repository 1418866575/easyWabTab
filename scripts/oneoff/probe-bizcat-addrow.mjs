// 进货商品管理「新增行」移动端布局探测：验证是否一行一列（每个字段独占一行、控件占满整行）
// 用法： CHROME_EXE=<chrome.exe> node scripts/probe-bizcat-addrow.mjs [baseURL]
import { chromium, devices } from 'playwright'
import fs from 'node:fs/promises'

const BASE = process.argv[2] || 'http://localhost:41892'
const EXE = process.env.CHROME_EXE || 'C:/Users/Lucky/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const OUT_PNG = 'scripts/.snap-bizcat-addrow.png'
const OUT_JSON = 'scripts/.probe-bizcat-addrow.json'

const MEASURE = () => {
  const row = document.querySelector('.bizcat-add-row')
  const pick = (el) => {
    if (!el) return null
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      cls: (el.className || '').toString().slice(0, 40),
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
      display: cs.display,
      flexDirection: cs.flexDirection,
      alignItems: cs.alignItems,
    }
  }
  const fields = [...document.querySelectorAll('.bizcat-add-field')].map(pick)
  const ctrls = [...document.querySelectorAll('.bizcat-add-row .el-input, .bizcat-add-row .el-select, .bizcat-add-row .el-input-number')].map((el) => {
    const r = el.getBoundingClientRect()
    return { cls: el.className.toString().slice(0, 30), width: Math.round(r.width), height: Math.round(r.height) }
  })
  const btn = pick(document.querySelector('.bizcat-add-btn'))
  // 是否单列堆叠：所有字段同一 left 且 top 互不相同（纵向排开）
  const lefts = new Set(fields.map((f) => f && f.left))
  const tops = fields.map((f) => f && f.top)
  const stacked = lefts.size === 1 && new Set(tops).size === fields.length
  return { row: pick(row), fields, ctrls, btn, stacked, fieldCount: fields.length }
}

let BROWSER = null
const run = async () => {
  const browser = await chromium.launch({ executablePath: EXE })
  BROWSER = browser
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  const fill = async (tid, val) => {
    const el = await page.$(`[data-testid="${tid}"]`)
    if (!el) return false
    const input = await el.$('input')
    await (input || el).fill(val)
    return true
  }
  const step = async (name, fn) => {
    process.stdout.write(`  -> ${name} ... `)
    try { await fn(); console.log('ok') } catch (e) { console.log('FAIL: ' + String(e?.message || e).split('\n')[0]); throw e }
  }

  await page.goto(BASE + '/business', { waitUntil: 'domcontentloaded' })
  // 首屏（含冷启动 dev server 编译）可能较慢，先等设置按钮出现
  await page.waitForSelector('[data-testid="bs-settings"]', { timeout: 60000 })
  await page.waitForTimeout(1500)
  if (await page.$('[data-testid="bs-ledger-gate"]')) {
    await fill('bs-gate-year', '2026')
    await fill('bs-gate-name', 'probe')
    await page.click('[data-testid="bs-gate-submit"]')
    await page.waitForTimeout(2200)
  }

  await step('打开设置', async () => { await page.click('[data-testid="bs-settings"]'); await page.waitForTimeout(1200) })
  await step('切到进货商品管理', async () => {
    let item = page.locator('button.rail-item', { hasText: '进货商品管理' })
    if (!(await item.count())) item = page.locator('.rail-item', { hasText: '进货商品管理' })
    if (!(await item.count())) item = page.locator('button.rail-item', { hasText: '支出产品管理' })
    await item.first().click()
    await page.waitForTimeout(900)
  })
  await step('等待新增行', async () => { await page.waitForSelector('.bizcat-add-row', { timeout: 5000 }) })

  const m = await page.evaluate(MEASURE)
  await page.locator('.bizcat-add-row').scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(300)
  await page.screenshot({ path: OUT_PNG })
  await page.locator('.bizcat-add-row').screenshot({ path: 'scripts/.snap-bizcat-addrow-only.png' }).catch(() => {})

  const out = { viewport: { w: 390, h: 664 }, ...m, errors: errors.slice(0, 5) }
  await fs.writeFile(OUT_JSON, JSON.stringify(out, null, 2), 'utf8')
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
  console.log('STACKED=' + m.stacked)
}

run().then(() => process.exit(0)).catch(async (e) => {
  console.error('PROBE_FAIL', e?.message || e)
  if (BROWSER) await BROWSER.close().catch(() => {})
  process.exit(1)
})
