// 智能工作台「设置」弹框 UI 规范复检：
//   ① 弹框是否走 BaseDialog（.bd-overlay / .bd-panel / .bd-footer），而非 el-dialog
//   ② 左 rail + 右内容双栏布局是否撑满、内容区能否滚到底（基底 .bd-body 改为 flex 列）
//   ③ 菜单显隐开关是否为 el-switch（不再自造 .switch-btn）
//   ④ 是否残留红色校验/自造开关等不规范痕迹
// 用法： node scripts/probe-smart-settings-ui.mjs [baseURL]
import { chromium, devices } from 'playwright'
import fs from 'node:fs/promises'

const BASE = process.argv[2] || 'http://localhost:41892'
const OUT = 'scripts/.probe-smart-settings-ui.json'
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const report = { base: BASE, steps: [] }

async function openSettings(page) {
  await page.goto(`${BASE}/smart`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.waitForSelector('[data-testid="smart-settings-entry"]', { timeout: 15000 })
  await page.click('[data-testid="smart-settings-entry"]')
  await page.waitForSelector('.bd-panel', { timeout: 15000 })
  await page.waitForTimeout(400)
}

const probe = () => {
  const q = (s) => document.querySelector(s)
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }
  }
  const overlay = q('.bd-overlay')
  const elOverlay = q('.el-overlay')
  const panel = q('.bd-panel')
  const body = q('.bd-body')
  const footer = q('.bd-footer')
  const layout = q('.ss-layout')
  const rail = q('.ss-rail')
  const scroll = q('.ss-scroll')
  const cs = (el) => (el ? getComputedStyle(el) : null)

  // 内容区滚到底能力
  let scroller = null
  if (scroll) {
    const before = scroll.scrollTop
    scroll.scrollTop = scroll.scrollHeight
    scroller = {
      clientH: scroll.clientHeight,
      scrollH: scroll.scrollHeight,
      maxScroll: scroll.scrollHeight - scroll.clientHeight,
      reached: Math.round(scroll.scrollTop),
      before: Math.round(before),
    }
  }

  // 菜单显隐开关：el-switch 是否存在
  const switches = document.querySelectorAll('.el-switch').length
  const legacySwitches = document.querySelectorAll('.switch-btn').length

  // 是否残留 el-dialog
  const elDialogs = document.querySelectorAll('.el-dialog').length

  // 红色文字启发式（r≥140 且 g/b≤110）
  const redTexts = []
  document.querySelectorAll('.bd-panel *').forEach((el) => {
    if (el.children.length > 0) return
    const t = (el.textContent || '').trim()
    if (!t) return
    const c = getComputedStyle(el).color
    const m = c.match(/\d+/g)
    if (!m) return
    const [r, g, b] = m.map(Number)
    if (r >= 140 && g <= 110 && b <= 110) redTexts.push({ text: t.slice(0, 40), color: c })
  })

  const bdBodyCs = cs(body)
  return {
    baseDialog: {
      hasOverlay: !!overlay,
      hasPanel: !!panel,
      hasFooter: !!footer,
      elDialogs,
      elOverlayPresent: !!elOverlay,
    },
    boxes: {
      panel: box(panel),
      body: box(body),
      layout: box(layout),
      rail: box(rail),
      scroll: box(scroll),
    },
    bodyStyle: bdBodyCs
      ? { padding: bdBodyCs.padding, overflowY: bdBodyCs.overflowY, display: bdBodyCs.display, flexDirection: bdBodyCs.flexDirection }
      : null,
    scroller,
    switches: { elSwitch: switches, legacySwitchBtn: legacySwitches },
    redTexts,
    footerBtns: [...(footer ? footer.querySelectorAll('button') : [])].map((b) => (b.textContent || '').trim()),
  }
}

async function run(label, opts) {
  const browser = await chromium.launch({ executablePath: EXE })
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  try {
    await openSettings(page)
    const r = await page.evaluate(probe)
    report.steps.push({ label, ok: true, ...r, errors })
  } catch (e) {
    report.steps.push({ label, ok: false, error: String(e), errors })
  } finally {
    await browser.close()
  }
}

await run('desktop-1280x800', { viewport: { width: 1280, height: 800 } })
await run('mobile-iphone13', { ...devices['iPhone 13'] })

await fs.writeFile(OUT, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))
