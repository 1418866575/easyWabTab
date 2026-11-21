// 复现「滑一点就回弹」：模拟移动端浏览器工具栏收放导致视口高度变化，
// 验证滚动位置是否被夹紧/回退（这正是 Edge 手机版有工具栏、微信全屏无工具栏的差异所在）
// 用法： node scripts/probe-products-bounce.mjs [baseURL] [商品数量]
import { chromium, devices } from 'playwright'
import fs from 'node:fs/promises'

const BASE = process.argv[2] || 'http://localhost:41890'
const OUT = 'scripts/.probe-products-bounce.json'
const COUNT = Number(process.argv[3] || 8)
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const readTop = page =>
  page.evaluate(() => {
    const c = document.querySelector('[data-testid="bs-content"]')
    const shell = document.querySelector('.bs-shell')
    return {
      scrollTop: c ? c.scrollTop : null,
      clientH: c ? c.clientHeight : null,
      maxScroll: c ? c.scrollHeight - c.clientHeight : null,
      shellH: shell ? Math.round(shell.getBoundingClientRect().height) : null,
      shellComputedH: shell ? getComputedStyle(shell).height : null,
    }
  })

const run = async () => {
  const browser = await chromium.launch({ executablePath: EXE })
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)

  const fillByTestId = async (tid, val) => {
    const root = await page.$(`[data-testid="${tid}"]`)
    if (!root) return false
    const inner = await root.$('input')
    await (inner || root).fill(val)
    return true
  }
  const touchSwipe = async (x, y0, y1, steps = 12) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }],
      })
      await new Promise(r => setTimeout(r, 16))
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(700)
  }

  await page.goto(BASE + '/business', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  if (await page.$('[data-testid="bs-ledger-gate"]')) {
    await fillByTestId('bs-gate-year', '2026')
    await fillByTestId('bs-gate-name', 'probe')
    await page.click('[data-testid="bs-gate-submit"]')
    await page.waitForTimeout(2200)
  }
  const tab = await page.$('[data-testid="bs-menu-products"]')
  if (tab) { await tab.click(); await page.waitForTimeout(1500) }

  for (let i = 0; i < COUNT; i++) {
    const addBtn = await page.$('[data-testid="bizprod-add"]')
    if (!addBtn) break
    await addBtn.click()
    await page.waitForTimeout(700)
    if (!(await fillByTestId('bizprod-form-name', `商品${i + 1}`))) break
    await fillByTestId('bizprod-form-selling', '15')
    await page.waitForTimeout(300)
    const saveBtn = await page.$('[data-testid="bizprod-save"]')
    if (saveBtn) { await saveBtn.click(); await page.waitForTimeout(800) }
    else {
      const ok = await page.$('.el-message-box__btns .el-button--primary')
      if (ok) { await ok.click(); await page.waitForTimeout(800) }
    }
  }
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(600)

  const box = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="bs-content"]')
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { x: r.x + r.width / 2, top: r.top, bottom: r.bottom }
  })

  const steps = []
  steps.push({ phase: '初始', ...(await readTop(page)) })

  // ① 手指上滑，滚到中间位置
  await touchSwipe(box.x, Math.round(box.top + (box.bottom - box.top) * 0.75), Math.round(box.top + (box.bottom - box.top) * 0.3))
  steps.push({ phase: '首次滑动后', ...(await readTop(page)) })

  // ② 再滑一次，看能否继续往下（累加）还是被拉回
  await touchSwipe(box.x, Math.round(box.top + (box.bottom - box.top) * 0.75), Math.round(box.top + (box.bottom - box.top) * 0.3))
  steps.push({ phase: '第二次滑动后', ...(await readTop(page)) })

  // ③ 模拟浏览器工具栏收起（视口变高）→ 看滚动位置是否被改回去
  await ctx.close()
  const ctx2 = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 730 } })
  const page2 = await ctx2.newPage()
  await page2.goto(BASE + '/business', { waitUntil: 'domcontentloaded' })
  await page2.waitForTimeout(2500)
  await page2.evaluate(() => {
    const c = document.querySelector('[data-testid="bs-content"]')
    if (c) c.scrollTop = 300
  })
  await page2.waitForTimeout(400)
  const beforeResize = await page2.evaluate(() => {
    const c = document.querySelector('[data-testid="bs-content"]')
    const s = document.querySelector('.bs-shell')
    return { scrollTop: c?.scrollTop, clientH: c?.clientHeight, shellH: s ? Math.round(s.getBoundingClientRect().height) : null }
  })
  await page2.setViewportSize({ width: 390, height: 664 })
  await page2.waitForTimeout(900)
  const afterResize = await page2.evaluate(() => {
    const c = document.querySelector('[data-testid="bs-content"]')
    const s = document.querySelector('.bs-shell')
    return { scrollTop: c?.scrollTop, clientH: c?.clientHeight, shellH: s ? Math.round(s.getBoundingClientRect().height) : null }
  })

  const result = {
    steps,
    toolbarSimulation: { beforeResize, afterResize },
    verdict: afterResize.scrollTop < beforeResize.scrollTop
      ? `视口变化时滚动位置被回退 ${beforeResize.scrollTop} → ${afterResize.scrollTop}（复现“回弹”）`
      : `视口变化时滚动位置保持 ${beforeResize.scrollTop} → ${afterResize.scrollTop}（未复现）`,
  }
  await fs.writeFile(OUT, JSON.stringify(result, null, 2), 'utf8')
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}

run().catch(e => { console.error('PROBE_FAIL', e?.message || e); process.exit(1) })
