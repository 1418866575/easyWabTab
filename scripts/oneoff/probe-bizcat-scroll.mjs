// 销售记账「设置 → 支出产品管理」滚动实测：逐层量高度/溢出，定位是谁把内容裁掉
// 用法： node scripts/probe-bizcat-scroll.mjs [baseURL]
import { chromium, devices } from 'playwright'
import fs from 'node:fs/promises'

const BASE = process.argv[2] || 'http://localhost:41892'
const OUT = 'scripts/.probe-bizcat-scroll.json'
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

/** 逐层量：从面板到滚动容器，谁在裁内容 */
const LAYERS = () => {
  const sels = ['.bd-panel', '.bd-body', '.manager-body', '.settings-content', '.settings-scroll', '.wb-menu-config', '.bizcat-body']
  const out = sels.map((s) => {
    const el = document.querySelector(s)
    if (!el) return { sel: s, found: false }
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      sel: s,
      found: true,
      clientH: el.clientHeight,
      scrollH: el.scrollHeight,
      rectH: Math.round(r.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      overflowY: cs.overflowY,
      flex: cs.flex,
      minHeight: cs.minHeight,
      maxHeight: cs.maxHeight,
      paddingBottom: cs.paddingBottom,
      // 是否可滚动（内容超出可视高度）
      scrollable: el.scrollHeight > el.clientHeight + 1,
      maxScroll: el.scrollHeight - el.clientHeight,
    }
  })
  const scroller = document.querySelector('.settings-scroll')
  let bottomGap = null
  if (scroller) {
    scroller.scrollTop = scroller.scrollHeight // 用 JS 滚到底，看能到哪
    const max = scroller.scrollHeight - scroller.clientHeight
    bottomGap = { maxScroll: max, reached: Math.round(scroller.scrollTop) }
    // 最后一个产品项 / 新增行：滚到底后是否完整落在滚动容器可视区内
    const last = [...document.querySelectorAll('.bizcat-item')].pop() || document.querySelector('.bizcat-add')
    if (last) {
      const lr = last.getBoundingClientRect()
      const sr = scroller.getBoundingClientRect()
      bottomGap.lastItem = {
        tag: last.className.slice(0, 30),
        itemBottom: Math.round(lr.bottom),
        scrollerBottom: Math.round(sr.bottom),
        // >0 表示最后一项底部仍被裁在可视区之外
        clippedPx: Math.round(lr.bottom - sr.bottom),
      }
    }
  }
  return { layers: out, bottomGap, viewportH: window.innerHeight }
}

/** 从 .bizcat-body 往上追祖先链：谁把高度掐住了（含 display/position/height/overflow） */
const CHAIN = () => {
  let el = document.querySelector('.bizcat-body')
  if (!el) return { found: false }
  const chain = []
  while (el && chain.length < 12) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    chain.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 34),
      display: cs.display,
      position: cs.position,
      height: cs.height,
      maxHeight: cs.maxHeight,
      overflowY: cs.overflowY,
      clientH: el.clientHeight,
      scrollH: el.scrollHeight,
      rectH: Math.round(r.height),
      rectBottom: Math.round(r.bottom),
    })
    el = el.parentElement
  }
  return { found: true, chain }
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

  await step('打开设置', async () => { await page.click('[data-testid="bs-settings"]'); await page.waitForTimeout(1200) })
  await step('切到「支出产品管理」', async () => {
    const item = page.locator('button.rail-item', { hasText: '支出产品管理' })
    await item.first().click()
    await page.waitForTimeout(900)
  })

  const result = await page.evaluate(LAYERS)
  const chain = await page.evaluate(CHAIN)
  await page.screenshot({ path: 'scripts/.snap-bizcat-scroll.png' })

  // 真实手指触摸：从屏幕中下部向上滑，看 scrollTop 能推进多少
  let touch = null
  try {
    const cdp = await ctx.newCDPSession(page)
    const box = await page.locator('.settings-scroll').boundingBox()
    if (box) {
      const x = Math.round(box.x + box.width / 2)
      const y0 = Math.round(box.y + box.height * 0.75)
      const y1 = Math.round(box.y + box.height * 0.25)
      await page.evaluate(() => { document.querySelector('.settings-scroll').scrollTop = 0 })
      await page.waitForTimeout(200)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
      for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: Math.round(y0 + ((y1 - y0) * i) / 12) }],
        })
        await page.waitForTimeout(16)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(500)
      touch = await page.evaluate(() => {
        const s = document.querySelector('.settings-scroll')
        return { scrollTop: Math.round(s.scrollTop), maxScroll: s.scrollHeight - s.clientHeight }
      })
    }
  } catch (e) { touch = { err: String(e?.message || e).split('\n')[0] } }

  // 滚到底后的视觉确认：最后一项与「新增」行是否完整可见
  await page.evaluate(() => {
    const s = document.querySelector('.settings-scroll')
    if (s) s.scrollTop = s.scrollHeight
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'scripts/.snap-bizcat-scroll-bottom.png' })

  const out = { viewport: { w: 390, h: 664 }, ...result, chain, touch, errors: errors.slice(0, 5) }
  await fs.writeFile(OUT, JSON.stringify(out, null, 2), 'utf8')
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
}

run().catch((e) => { console.error('PROBE_FAIL', e?.message || e); process.exit(1) })
