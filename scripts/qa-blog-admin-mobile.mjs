/**
 * QA：博客后台（/blog/admin）导航布局
 *
 * 对齐个人工作台的改造结果：
 *   ① 无全局顶栏；工作台切换入口在侧栏顶部，云同步 / 设置两枚按钮在侧栏底部同一行；
 *   ② 桌面侧栏 200px 常驻、可折叠为 56px 图标条；
 *   ③ 窄屏侧栏收进左侧抽屉（页头按钮唤出 + 遮罩），不再有顶部横滚标签栏；
 *   ④ 点菜单 / 点遮罩 / 打开设置都能收起抽屉；无横向溢出、无页面异常。
 *
 * 用法：node scripts/qa-blog-admin-mobile.mjs [--shots=<目录>]
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const shotsArg = process.argv.find(a => a.startsWith('--shots='))
const SHOTS = shotsArg ? path.resolve(ROOT, shotsArg.slice('--shots='.length)) : ''

function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!fs.existsSync(root)) return undefined
  for (const d of fs.readdirSync(root).filter(x => x.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(p)) return p
  }
  return undefined
}
async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return true } catch { }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}
async function isViteDevAt(port) {
  try {
    const res = await fetch('http://localhost:' + port + '/src/composables/useIdb.ts')
    if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) return false
    return (await res.text()).includes('idbExportAll')
  } catch { return false }
}
async function isPortFree(port) {
  try { const r = await fetch('http://localhost:' + port + '/', { signal: AbortSignal.timeout(1500) }); return !r.ok } catch { return true }
}
let server = null
async function ensureDevServer() {
  for (let p = 16718; p <= 16726; p++) if (await isViteDevAt(p)) return 'http://localhost:' + p
  for (let p = 16718; p <= 16726; p++) {
    if (!(await isPortFree(p))) continue
    server = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    server.stdout.on('data', () => {})
    server.stderr.on('data', () => {})
    if (await waitForServer('http://localhost:' + p)) if (await isViteDevAt(p)) return 'http://localhost:' + p
    server.kill(); server = null
  }
  throw new Error('no free port')
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

const browser = await chromium.launch({ executablePath: findChromium() })
let serverStarted = false
try {
  const base = await ensureDevServer()
  serverStarted = !!server
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 140)))

  await page.goto(base + '/blog/admin', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.ba-shell', { timeout: 60000 })
  await page.waitForSelector('[data-testid="blog-page-head"]', { timeout: 30000 })

  // ---------- S1 桌面：无顶栏，入口与两枚按钮都在侧栏 ----------
  const desk = await page.evaluate(() => {
    const side = document.querySelector('.ba-sidebar')
    const foot = document.querySelector('[data-testid="ba-side-foot"]')
    const btns = [...(foot?.querySelectorAll('button') ?? [])]
    const textShown = [...document.querySelectorAll('.ba-side-btn-text')].every(t => getComputedStyle(t).display !== 'none')
    const iconHidden = [...document.querySelectorAll('.ba-side-btn-ic')].every(t => getComputedStyle(t).display === 'none')
    const trigger = document.querySelector('[data-testid="ba-menu-trigger"]')
    return {
      topbar: document.querySelectorAll('.ba-topbar').length,
      sideW: Math.round(side?.getBoundingClientRect().width ?? 0),
      switchInSide: !!document.querySelector('.ba-side-top .ws-trigger'),
      footInSide: !!side && !!foot && side.contains(foot),
      btns: btns.map(b => b.getAttribute('data-testid')).join(','),
      textShown, iconHidden,
      triggerShown: !!trigger && getComputedStyle(trigger).display !== 'none',
      scrim: document.querySelectorAll('[data-testid="ba-menu-scrim"]').length
    }
  })
  check('S1 已无全局顶栏', desk.topbar === 0)
  check('S1 桌面侧栏约 200px 常驻', desk.sideW >= 180 && desk.sideW <= 220, `w=${desk.sideW}`)
  check('S1 工作台切换入口在侧栏顶部', desk.switchInSide)
  check('S1 云同步 / 设置在侧栏底部同一行', desk.footInSide && desk.btns === 'blog-sync-now,blog-open-settings', desk.btns)
  check('S1 底部两枚为纯文字（图标留给折叠态）', desk.textShown && desk.iconHidden)
  check('S1 桌面不显示抽屉入口与遮罩', !desk.triggerShown && desk.scrim === 0)

  // 折叠态兼容 probe-sidebar-collapse.mjs
  await page.click('[data-testid="blog-collapse-sidebar"]')
  await page.waitForTimeout(300)
  const collapsedW = await page.evaluate(() => Math.round(document.querySelector('.ba-sidebar').getBoundingClientRect().width))
  check('S1 折叠按钮仍可用（200 → 56）', collapsedW >= 50 && collapsedW <= 64, `w=${collapsedW}`)
  await page.click('[data-testid="blog-collapse-sidebar"]')
  await page.waitForTimeout(300)

  // ---------- S2/S3 窄屏抽屉 ----------
  for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    const tag = `${vp.width}px`
    await page.setViewportSize(vp)
    await page.waitForTimeout(300)

    const closed = await page.evaluate(() => {
      const side = document.querySelector('.ba-sidebar')
      return {
        right: Math.round(side?.getBoundingClientRect().right ?? 999),
        open: side?.classList.contains('open') ?? false,
        position: side ? getComputedStyle(side).position : '',
        navDir: getComputedStyle(document.querySelector('.ba-nav')).flexDirection
      }
    })
    check(`S2 ${tag} 抽屉默认收起`, closed.right <= 0 && !closed.open, `right=${closed.right}`)
    check(`S2 ${tag} 无顶部标签栏（侧栏是绝对定位抽屉、菜单竖排）`,
      closed.position === 'absolute' && closed.navDir === 'column', `${closed.position}/${closed.navDir}`)
    check(`S2 ${tag} 页头菜单按钮可见`, await page.locator('[data-testid="ba-menu-trigger"]').isVisible())

    await page.click('[data-testid="ba-menu-trigger"]')
    await page.waitForTimeout(300)
    const opened = await page.evaluate(() => {
      const side = document.querySelector('.ba-sidebar')
      const footBtns = [...document.querySelectorAll('.ba-side-btn')].map(b => b.getAttribute('data-testid'))
      const labels = [...document.querySelectorAll('.ba-nav-label')]
      return {
        open: side?.classList.contains('open') ?? false,
        left: Math.round(side?.getBoundingClientRect().left ?? -1),
        scrim: document.querySelectorAll('[data-testid="ba-menu-scrim"]').length,
        items: document.querySelectorAll('.ba-nav [data-testid^="blog-nav-"]').length,
        labelsShown: labels.length === 3 && labels.every(l => getComputedStyle(l).display !== 'none'),
        foot: footBtns.join(','),
        footText: [...document.querySelectorAll('.ba-side-btn-text')].every(t => getComputedStyle(t).display !== 'none'),
        collapseHidden: getComputedStyle(document.querySelector('.ba-nav-collapse')).display === 'none'
      }
    })
    check(`S3 ${tag} 抽屉可唤出且贴左`, opened.open && opened.left === 0, `left=${opened.left}`)
    check(`S3 ${tag} 遮罩出现`, opened.scrim === 1)
    check(`S3 ${tag} 3 项菜单文字完整`, opened.items === 3 && opened.labelsShown, `items=${opened.items}`)
    check(`S3 ${tag} 底部两枚纯文字、折叠按钮隐藏`,
      opened.foot === 'blog-sync-now,blog-open-settings' && opened.footText && opened.collapseHidden, opened.foot)
    if (SHOTS && vp.width === 390) {
      fs.mkdirSync(SHOTS, { recursive: true })
      await page.screenshot({ path: join(SHOTS, 'blog-admin-drawer-light.png') })
    }

    // 点菜单项：切页 + 收抽屉
    await page.click('[data-testid="blog-nav-gallery"]')
    await page.waitForTimeout(350)
    const afterPick = await page.evaluate(() => ({
      open: document.querySelector('.ba-sidebar')?.classList.contains('open') ?? false,
      title: (document.querySelector('.ba-page-title')?.textContent || '').trim()
    }))
    check(`S3 ${tag} 点菜单后抽屉收起并切页`, !afterPick.open && afterPick.title === '图库', `${afterPick.title}/${afterPick.open}`)

    // 点遮罩（避开 264px 抽屉）也能收起
    await page.click('[data-testid="ba-menu-trigger"]')
    await page.waitForTimeout(250)
    await page.locator('[data-testid="ba-menu-scrim"]').click({ position: { x: vp.width - 40, y: 300 } })
    await page.waitForTimeout(250)
    check(`S3 ${tag} 点遮罩可关闭抽屉`,
      !(await page.evaluate(() => document.querySelector('.ba-sidebar')?.classList.contains('open') ?? false)))

    // 设置入口：打开弹框并收起抽屉
    await page.click('[data-testid="ba-menu-trigger"]')
    await page.waitForTimeout(250)
    await page.click('[data-testid="blog-open-settings"]')
    await page.waitForTimeout(400)
    const settings = await page.evaluate(() => ({
      dialog: document.querySelectorAll('.bd-panel, .bsd-dialog').length,
      open: document.querySelector('.ba-sidebar')?.classList.contains('open') ?? false
    }))
    check(`S3 ${tag} 设置可从侧栏打开且自动收起抽屉`, settings.dialog > 0 && !settings.open, `dialog=${settings.dialog}`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)

    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      padBottom: parseFloat(getComputedStyle(document.querySelector('.ba-content')).paddingBottom)
    }))
    check(`S4 ${tag} 无横向溢出`, layout.overflow <= 1, `overflow=${layout.overflow}`)
    check(`S4 ${tag} 底部留白按无 FAB 收窄（<60px）`, layout.padBottom < 60, `pad=${layout.padBottom}`)
  }

  // ---------- S5 暗色 + 异常 ----------
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.click('[data-testid="ba-menu-trigger"]')
  await page.waitForTimeout(300)
  const darkShadow = await page.evaluate(() => getComputedStyle(document.querySelector('.ba-sidebar')).boxShadow)
  check('S5 暗色抽屉带侧向投影', darkShadow !== 'none', darkShadow.slice(0, 50))
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'blog-admin-drawer-dark.png') })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  check('S5 无页面 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '))

  const failed = results.filter(r => !r.ok)
  console.log(`\n[qa] ${results.length - failed.length}/${results.length} passed`)
  if (failed.length) process.exitCode = 1
} finally {
  await browser.close()
  if (serverStarted && server) server.kill()
}
