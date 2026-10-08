// 移动端「商品页中间内容区」滚动能力实测 —— 区分「程序设 scrollTop」「鼠标滚轮」「真实手指触摸」三条路径
// 用法： node scripts/probe-products-touch.mjs [baseURL] [商品数量]
// 目的：前几轮只测了前两条（都能滚），本脚本补第三条 —— 滚轮能滚但手指滑不动是可能且最隐蔽的根因。
import { chromium, webkit, devices } from 'playwright'
import fs from 'node:fs/promises'

const BASE = process.argv[2] || 'http://localhost:41890'
const OUT = 'scripts/.probe-products-touch.json'
const COUNT = Number(process.argv[3] || 8)
// 本地 playwright 自带 Chromium 缺 chrome.dll（启动即崩），改用系统 Edge
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
// 引擎：默认 Edge(Chromium)；传 webkit 可复现 iOS Safari 行为 —— 商品页滚动问题
// 在 Chromium 下测不出，必须换内核验证。
const ENGINE = process.argv[4] || 'chromium'

/** 逐层几何：谁被钉死、谁没滚动条，一眼看出 */
const PROBE = () => {
  const layer = (name, el) => {
    if (!el) return { name, found: false }
    const cs = getComputedStyle(el)
    return {
      name,
      found: true,
      clientH: el.clientHeight,
      scrollH: el.scrollHeight,
      canScrollPx: el.scrollHeight - el.clientHeight,
      overflowY: cs.overflowY,
      touchAction: cs.touchAction,
      height: cs.height,
      minHeight: cs.minHeight,
      flex: cs.flex,
      paddingBottom: cs.paddingBottom,
    }
  }
  const content = document.querySelector('[data-testid="bs-content"]')
  const before = content ? content.scrollTop : 0
  if (content) content.scrollTop = 99999
  const jsProbe = content
    ? { before, after: content.scrollTop, movedPx: content.scrollTop - before }
    : null
  if (content) content.scrollTop = before
  return {
    viewport: { w: innerWidth, h: innerHeight },
    docScrollablePx: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    cardCount: document.querySelectorAll('.bizprod-card').length,
    layers: [
      layer('.bs-shell', document.querySelector('.bs-shell')),
      layer('.bs-body', document.querySelector('.bs-body')),
      layer('.bs-content', content),
      layer('.bizprod', document.querySelector('.bizprod')),
      layer('.bizprod-list', document.querySelector('.bizprod-list')),
      layer('.bizprod-grid', document.querySelector('.bizprod-grid')),
    ],
    jsProbe,
  }
}

/** 真实手指垂直滑动：touchStart → 多步 touchMove → touchEnd（走浏览器输入管线，含惯性） */
async function touchSwipe(cdp, x, y0, y1, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: y0 }],
  })
  for (let i = 1; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y }],
    })
    await new Promise(r => setTimeout(r, 16))
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

const readScrollTop = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('[data-testid="bs-content"]')
    return { content: c ? c.scrollTop : null, doc: document.documentElement.scrollTop }
  })

const run = async () => {
  const driver = ENGINE === 'webkit' ? webkit : chromium
  const browser = await driver.launch(ENGINE === 'webkit' ? {} : { executablePath: EXE })
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  // CDP 仅 Chromium 可用；WebKit 走不了触摸管线，降级为「只量几何」
  let cdp = null
  try { cdp = await ctx.newCDPSession(page) } catch { cdp = null }

  const fillByTestId = async (tid, val) => {
    const root = await page.$(`[data-testid="${tid}"]`)
    if (!root) return false
    const inner = await root.$('input')
    await (inner || root).fill(val)
    return true
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

  let created = 0
  for (let i = 0; i < COUNT; i++) {
    const addBtn = await page.$('[data-testid="bizprod-add"]')
    if (!addBtn) break
    await addBtn.click()
    await page.waitForTimeout(700)
    const ok = await fillByTestId('bizprod-form-name', `商品${i + 1}`)
    if (!ok) break
    await fillByTestId('bizprod-form-selling', '15')
    await page.waitForTimeout(300)
    const saveBtn = await page.$('[data-testid="bizprod-save"]')
    if (saveBtn) { await saveBtn.click(); await page.waitForTimeout(900) }
    else {
      const confirm = await page.$('.el-message-box__btns .el-button--primary')
      if (confirm) { await confirm.click(); await page.waitForTimeout(900) }
    }
    created++
  }
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(600)

  const result = await page.evaluate(PROBE)
  result.created = created

  // ===== 三条滚动路径对比 =====
  const box = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="bs-content"]')
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { x: r.x + r.width / 2, top: r.top, bottom: r.bottom }
  })

  if (box && cdp) {
    const startY = Math.round(box.top + (box.bottom - box.top) * 0.7)
    const endY = Math.round(box.top + (box.bottom - box.top) * 0.25)

    // ① 真实手指触摸上滑（内容向上走 = 看下面的内容）
    await readScrollTop(page)
    await touchSwipe(cdp, box.x, startY, endY)
    await page.waitForTimeout(900)
    const afterTouch = await readScrollTop(page)

    // ② 鼠标滚轮
    await page.evaluate(() => { const c = document.querySelector('[data-testid="bs-content"]'); if (c) c.scrollTop = 0 })
    await page.mouse.move(box.x, (box.top + box.bottom) / 2)
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(900)
    const afterWheel = await readScrollTop(page)

    result.scrollPaths = {
      touch: afterTouch,
      wheel: afterWheel,
      verdict:
        afterTouch.content > 0 && afterWheel.content > 0
          ? 'BOTH_OK'
          : afterWheel.content > 0 && afterTouch.content === 0
            ? 'WHEEL_ONLY_手指滑不动'
            : afterTouch.content > 0 && afterWheel.content === 0
              ? 'TOUCH_ONLY'
              : 'NEITHER_完全不能滚',
    }
  }

  if (box && !cdp) result.scrollPaths = { note: 'SKIPPED（WebKit 无 CDP，仅保留几何测量）' }
  result.engineUsed = ENGINE
  await fs.writeFile(OUT, JSON.stringify(result, null, 2), 'utf8')
  console.log(JSON.stringify(result, null, 2))
  await page.screenshot({ path: 'scripts/.snap-products-touch.png' })
  await browser.close()
}

run().catch(e => { console.error('PROBE_FAIL', e?.message || e); process.exit(1) })
