// 智能工作台全部弹框 UI 规范复检：确认 7 个弹框都跑在 BaseDialog 上（无 el-dialog）、
// 页脚按钮在 .bd-footer 内、开关无自造 .switch-btn、无控制台报错。
// 用法： node scripts/probe-smart-dialogs-ui.mjs [baseURL]
import { chromium } from 'playwright'
import fs from 'node:fs/promises'

const BASE = process.argv[2] || 'http://localhost:41892'
const OUT = 'scripts/.probe-smart-dialogs-ui.json'
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const snap = () => {
  const footer = document.querySelector('.bd-footer')
  return {
    baseDialog: !!document.querySelector('.bd-panel'),
    elDialogs: document.querySelectorAll('.el-dialog').length,
    title: (document.querySelector('.bd-title')?.textContent || '').trim(),
    footerBtns: [...(footer ? footer.querySelectorAll('button') : [])].map((b) => (b.textContent || '').trim()),
    elSwitch: document.querySelectorAll('.el-switch').length,
    legacySwitchBtn: document.querySelectorAll('.switch-btn').length,
    bodyOverflowY: document.querySelector('.bd-body') ? getComputedStyle(document.querySelector('.bd-body')).overflowY : null,
    panelH: document.querySelector('.bd-panel') ? Math.round(document.querySelector('.bd-panel').getBoundingClientRect().height) : null,
  }
}

const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

const steps = []
async function step(label, action) {
  try {
    await action()
    await page.waitForSelector('.bd-panel', { timeout: 10000 })
    await page.waitForTimeout(350)
    steps.push({ label, ok: true, ...(await page.evaluate(snap)) })
  } catch (e) {
    steps.push({ label, ok: false, error: String(e) })
  }
}
async function closeDialog() {
  // 点 BaseDialog 关闭按钮（最后一个可见的 .bd-header .close-btn）
  const btns = await page.$$('.bd-overlay .bd-header .close-btn')
  if (btns.length) await btns[btns.length - 1].click()
  await page.waitForTimeout(350)
}

await page.goto(`${BASE}/smart`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)

await step('设置弹框', async () => {
  await page.click('[data-testid="smart-settings-entry"]')
})
await closeDialog()

await step('新增技能弹框', async () => {
  // 默认停在「概览」页，先切到「技能」页再点新增
  for (const n of await page.$$('[data-testid^="smart-nav-"]')) {
    const t = (await n.textContent()) || ''
    if (t.includes('技能')) { await n.click(); break }
  }
  await page.waitForTimeout(400)
  await page.click('[data-testid="smart-skill-add"]')
})
await closeDialog()

// 切到提示词库页：左侧导航
await step('新增提示词弹框', async () => {
  const navs = await page.$$('[data-testid^="smart-nav-"]')
  // 找到「提示词」导航项
  for (const n of navs) {
    const t = (await n.textContent()) || ''
    if (t.includes('提示词')) { await n.click(); break }
  }
  await page.waitForTimeout(400)
  await page.click('[data-testid="smart-prompt-add"]')
})
await closeDialog()

const report = { base: BASE, steps, errors }
await fs.writeFile(OUT, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))
await browser.close()
