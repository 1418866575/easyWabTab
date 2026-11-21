// 移动端销售记账「商品页无法下滑」实测脚本
// 用法： node scripts/probe-products-scroll.mjs [baseURL]
// 流程：建账本 → 商品页新增 N 个商品（走真实 UI）→ 逐层量高度与滚动能力
import { chromium, devices } from 'playwright'
import fs from 'node:fs/promises'

const BASE = process.argv[2] || 'http://localhost:41890'
const OUT = 'scripts/.probe-products-scroll.json'
const COUNT = Number(process.argv[3] || 8)
// 本地 playwright 自带 Chromium 缺 chrome.dll（启动即崩），改用系统 Edge
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

/** 逐层量几何：谁被钉死、谁没有滚动条，一眼看出 */
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
      height: cs.height,
      minHeight: cs.minHeight,
      flex: cs.flex,
      paddingBottom: cs.paddingBottom,
    }
  }
  const content = document.querySelector('[data-testid="bs-content"]')
  // 真实写入 scrollTop，看能否滚动（比只看 CSS 可靠）
  let scrollProbe = null
  if (content) {
    const before = content.scrollTop
    content.scrollTop = 99999
    scrollProbe = { before, after: content.scrollTop, moved: content.scrollTop > before }
    content.scrollTop = before
  }
  return {
    viewport: { w: innerWidth, h: innerHeight },
    docScrollablePx: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    cardCount: document.querySelectorAll('.bizprod-card').length,
    pagerVisible: !!document.querySelector('.bizprod-pager, .ewt-pager'),
    layers: [
      layer('.bs-shell', document.querySelector('.bs-shell')),
      layer('.bs-body', document.querySelector('.bs-body')),
      layer('.bs-content', content),
      layer('.bizprod', document.querySelector('.bizprod')),
      layer('.bizprod-list', document.querySelector('.bizprod-list')),
      layer('.bizprod-grid', document.querySelector('.bizprod-grid')),
    ],
    scrollProbe,
  }
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: EXE })
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  const fillByTestId = async (tid, val) => {
    const root = await page.$(`[data-testid="${tid}"]`)
    if (!root) return false
    const inner = await root.$('input')
    await (inner || root).fill(val)
    return true
  }

  await page.goto(BASE + '/business', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)

  // 1) 无账本则先建一本
  if (await page.$('[data-testid="bs-ledger-gate"]')) {
    await fillByTestId('bs-gate-year', '2026')
    await fillByTestId('bs-gate-name', 'probe')
    await page.click('[data-testid="bs-gate-submit"]')
    await page.waitForTimeout(2200)
  }

  // 2) 切到商品面板（移动端为底部 Tab）
  const tab = await page.$('[data-testid="bs-menu-products"]')
  if (tab) { await tab.click(); await page.waitForTimeout(1500) }

  // 3) 走真实 UI 新增商品，让分页/卡片结构真实存在
  let created = 0
  for (let i = 0; i < COUNT; i++) {
    const addBtn = await page.$('[data-testid="bizprod-add"]')
    if (!addBtn) break
    await addBtn.click()
    await page.waitForTimeout(700)
    const ok = await fillByTestId('bizprod-form-name', `商品${i + 1}`)
    if (!ok) break
    // 进价框新增时永久 disabled（由均价反显），只需名称 + 售价
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
  // 关掉可能残留的抽屉/弹框
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(600)

  const result = await page.evaluate(PROBE)
  result.created = created
  result.errors = errors.slice(0, 5)

  await fs.writeFile(OUT, JSON.stringify(result, null, 2), 'utf8')
  console.log(JSON.stringify(result, null, 2))
  await page.screenshot({ path: 'scripts/.snap-products.png' })
  await browser.close()
}

run().catch((e) => { console.error('PROBE_FAIL', e?.message || e); process.exit(1) })