// 进货「新增/编辑」弹框实测：红色校验提示是否已彻底移除、保存按钮是否仍受校验控制
// 用法： node scripts/probe-bizpur-dialog-hints.mjs [baseURL]
import { chromium, devices } from 'playwright'
import fs from 'node:fs/promises'

const BASE = process.argv[2] || 'http://localhost:41892'
const OUT = 'scripts/.probe-bizpur-dialog-hints.json'
// 本地 playwright 自带 Chromium 缺 chrome.dll（启动即崩），改用系统 Edge
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

/** 扫描弹框内所有可见文本元素，挑出「红色系」文字（r 明显高、g/b 明显低） */
const SCAN_RED = () => {
  const dlg = document.querySelector('.el-dialog')
  if (!dlg) return { found: false }
  const parse = (c) => (c || '').match(/\d+/g)?.map(Number) ?? []
  const isRed = (rgb) => rgb.length >= 3 && rgb[0] >= 140 && rgb[1] <= 110 && rgb[2] <= 110
  const reds = []
  for (const el of dlg.querySelectorAll('*')) {
    if (el.children.length > 0) continue // 只取叶子节点，避免父级重复计数
    const txt = (el.textContent ?? '').trim()
    if (!txt) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    const rgb = parse(cs.color)
    if (isRed(rgb)) reds.push({ text: txt.slice(0, 60), color: cs.color })
  }
  const dlgText = dlg.innerText.replace(/\s+/g, ' ')
  return {
    found: true,
    redTextCount: reds.length,
    redTexts: reds.slice(0, 8),
    // 旧实现残留检查：这些类若还在 DOM 里，说明没删干净
    legacyIssueNodes: dlg.querySelectorAll('[class*="bizpur-row-issue"], [class*="bizpur-issue"]').length,
    // 底部汇总列表 / 行内提示行是否还在
    legacySelectors: {
      '.bizpur-issues': dlg.querySelectorAll('.bizpur-issues').length,
      '.bizpur-issue': dlg.querySelectorAll('.bizpur-issue').length,
      '.bizpur-row-issue-row': dlg.querySelectorAll('.bizpur-row-issue-row').length,
    },
    hint: (() => {
      const h = dlg.querySelector('[data-testid="bizpur-form-hint"]')
      if (!h) return { present: false }
      const cs = getComputedStyle(h)
      return { present: true, text: h.textContent.trim(), color: cs.color }
    })(),
    save: (() => {
      const b = dlg.querySelector('[data-testid="bizpur-save"]')
      return b ? { disabled: b.disabled || b.classList.contains('is-disabled') } : null
    })(),
    dialogText: dlgText.slice(0, 400),
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

  await page.goto(BASE + '/business', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  if (await page.$('[data-testid="bs-ledger-gate"]')) {
    await fill('bs-gate-year', '2026')
    await fill('bs-gate-name', 'probe')
    await page.click('[data-testid="bs-gate-submit"]')
    await page.waitForTimeout(2200)
  }

  const step = async (name, fn) => {
    process.stdout.write(`  → ${name} ... `)
    try { await fn(); console.log('ok') }
    catch (e) { console.log('FAIL: ' + String(e?.message || e).split('\n')[0]); throw e }
  }

  // 1) 建 1 个商品（进货行要选商品）
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

  // 2) 打开进货「新增」弹框：此时预置行未填数量/进价，正是旧版满屏红字的场景
  await step('打开进货面板', async () => { await page.click('[data-testid="bs-menu-purchases"]'); await page.waitForTimeout(1200) })
  await step('点新增进货', async () => { await page.click('[data-testid="bizpur-add"]'); await page.waitForTimeout(900) })
  const invalid = await page.evaluate(SCAN_RED)
  await page.screenshot({ path: 'scripts/.snap-bizpur-dialog-invalid.png' })

  // 3) 填完整 → 灰字提示应消失、保存按钮应解除禁用
  await fill('bizpur-row-qty-0', '10')
  await fill('bizpur-row-price-0', '5')
  await page.waitForTimeout(600)
  const valid = await page.evaluate(SCAN_RED)
  await page.screenshot({ path: 'scripts/.snap-bizpur-dialog-valid.png' })

  // 4) 保存是否真能写入（校验逻辑未被误删的证据）
  let saved = null
  try {
    await page.click('[data-testid="bizpur-save"]')
    await page.waitForTimeout(1200)
    saved = { clicked: true, dialogClosed: !(await page.$('.el-dialog .bizpur-form')) }
  } catch (e) { saved = { clicked: false, err: String(e?.message || e).split('\n')[0] } }

  const result = { viewport: { w: 390, h: 664 }, invalid, valid, saved, errors: errors.slice(0, 5) }
  await fs.writeFile(OUT, JSON.stringify(result, null, 2), 'utf8')
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}

run().catch(e => { console.error('PROBE_FAIL', e?.message || e); process.exit(1) })
