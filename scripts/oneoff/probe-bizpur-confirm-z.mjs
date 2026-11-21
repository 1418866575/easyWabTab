// 进货「编辑弹框内点移除」→ 操作确认框的层级实测：确认框是否盖在编辑弹框之上
// 用法： node scripts/probe-bizpur-confirm-z.mjs [baseURL]
import { chromium, devices } from 'playwright'
import fs from 'node:fs/promises'

const BASE = process.argv[2] || 'http://localhost:41892'
const OUT = 'scripts/.probe-bizpur-confirm-z.json'
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

/** 量所有遮罩层的 z-index，并用 elementFromPoint 判断「谁在最上面」 */
const MEASURE = () => {
  const layers = [...document.querySelectorAll('.bd-overlay, .el-overlay')].map((e) => ({
    cls: (e.className || '').toString().slice(0, 40),
    z: getComputedStyle(e).zIndex,
    // 该层可见（未 display:none）
    visible: e.offsetParent !== null || getComputedStyle(e).position === 'fixed',
  }))
  const panel = document.querySelector('.bd-panel') // 确认框面板
  let topmost = null
  if (panel) {
    const r = panel.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    topmost = {
      hitTag: hit ? hit.tagName + '.' + (hit.className || '').toString().slice(0, 40) : null,
      hitInConfirmPanel: !!(hit && hit.closest('.bd-panel')),
      hitInElDialog: !!(hit && hit.closest('.el-dialog')),
      hitIsElOverlay: !!(hit && hit.classList && hit.classList.contains('el-overlay')),
    }
  }
  return {
    confirmPanelFound: !!panel,
    confirmText: panel ? panel.innerText.replace(/\s+/g, ' ').slice(0, 80) : null,
    layers,
    topmost,
  }
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: EXE })
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
  const step = async (name, fn) => {
    process.stdout.write(`  → ${name} ... `)
    try { await fn(); console.log('ok') }
    catch (e) { console.log('FAIL: ' + String(e?.message || e).split('\n')[0]); throw e }
  }

  await page.goto(BASE + '/business', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  if (await page.$('[data-testid="bs-ledger-gate"]')) {
    await fill('bs-gate-year', '2026')
    await fill('bs-gate-name', 'probe')
    await page.click('[data-testid="bs-gate-submit"]')
    await page.waitForTimeout(2200)
  }

  await step('打开商品面板', async () => { await page.click('[data-testid="bs-menu-products"]'); await page.waitForTimeout(1200) })
  await step('新建商品', async () => {
    await page.click('[data-testid="bizprod-add"]')
    await page.waitForTimeout(700)
    await fill('bizprod-form-name', 'probe商品')
    await fill('bizprod-form-selling', '18')
    await page.waitForTimeout(250)
    await page.click('[data-testid="bizprod-save"]')
    await page.waitForTimeout(900)
  })

  await step('打开进货面板', async () => { await page.click('[data-testid="bs-menu-purchases"]'); await page.waitForTimeout(1200) })
  await step('新增一笔记货', async () => {
    await page.click('[data-testid="bizpur-add"]')
    await page.waitForTimeout(800)
    await pickSelect('bizpur-row-product-0', 0)
    await fill('bizpur-row-qty-0', '10')
    await fill('bizpur-row-price-0', '5')
    await page.waitForTimeout(300)
    await page.click('[data-testid="bizpur-save"]')
    await page.waitForTimeout(1200)
  })

  // 编辑已存在的进货 → 行带 id → 点「移除」会触发 showConfirm
  await step('打开编辑弹框', async () => {
    const edit = await page.$('[data-testid^="bizpur-card-edit-"]')
    if (edit) await edit.click()
    else { await page.click('[data-testid="bizpur-row-edit-0"]').catch(() => {}); }
    await page.waitForTimeout(1000)
  })
  const dialogOpen = { hasDialog: !!(await page.$('.el-dialog')) }
  await step('点「移除」触发确认框', async () => {
    await page.click('[data-testid="bizpur-row-remove-0"]')
    await page.waitForTimeout(900)
  })
  const result = await page.evaluate(MEASURE)
  await page.screenshot({ path: 'scripts/.snap-bizpur-confirm-z.png' })

  const out = { viewport: { w: 390, h: 664 }, dialogOpen, ...result, errors: errors.slice(0, 5) }
  await fs.writeFile(OUT, JSON.stringify(out, null, 2), 'utf8')
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
}

run().catch((e) => { console.error('PROBE_FAIL', e?.message || e); process.exit(1) })
