/**
 * 抽检：工具箱「贷款计算」分类下 10 个工具能否正常打开并产出结果
 * 用法：node scripts/probe-loan-tools.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:41892'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const TOOLS = [
  'loan-calc',
  'loan-gjj',
  'loan-combo',
  'loan-decor',
  'loan-prepay',
  'loan-rate-change',
  'loan-reverse',
  'house-tax',
  'house-afford',
  'loan-lpr'
]

const errors = []
const report = []

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 200)}`)
})
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e).slice(0, 200)}`))

await page.goto(`${BASE}/toolbox`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="tb-cat-loan"]', { timeout: 15000 })
await page.click('[data-testid="tb-cat-loan"]')
await page.waitForTimeout(400)

const cards = await page.$$eval('[data-testid^="tb-card-"]', (els) =>
  els.map((e) => e.getAttribute('data-testid').replace('tb-card-', ''))
)
console.log('分类下卡片:', cards.join(', '))
const missing = TOOLS.filter((t) => !cards.includes(t))
if (missing.length) errors.push(`分类缺少工具: ${missing.join(', ')}`)

for (const id of TOOLS) {
  const sel = `[data-testid="tb-card-${id}"]`
  await page.click(sel)
  try {
    await page.waitForSelector('[data-testid="tb-modal"]', { timeout: 8000 })
  } catch {
    errors.push(`${id}: 弹框未打开`)
    continue
  }
  await page.waitForTimeout(600)
  const errBox = await page.$('[data-testid="tb-modal-error"]')
  const body = (await page.$eval('[data-testid="tb-modal"]', (e) => e.innerText)).replace(/\s+/g, ' ').trim()
  const hasNumber = /\d/.test(body)
  if (!hasNumber) errors.push(`${id}: 结果区无数字输出`)
  await page.screenshot({ path: `scripts/.probe-loan-${id}.png` })
  report.push({ id, ok: !errBox && hasNumber, snippet: body.slice(0, 110) })
  await page.click('[data-testid="tb-modal-close"]')
  await page.waitForTimeout(400)
}

await browser.close()

console.log('\n| 工具 | 状态 | 结果片段 |')
console.log('| --- | --- | --- |')
for (const r of report) console.log(`| ${r.id} | ${r.ok ? '✔' : '✖'} | ${r.snippet} |`)
console.log(`\n控制台错误 ${errors.length} 条`)
for (const e of errors) console.log('  ✖ ' + e)
process.exit(errors.length ? 1 : 0)
