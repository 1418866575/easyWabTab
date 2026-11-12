/**
 * QA：健康工作台（/health）移动端布局
 *
 * 守住「参考个人工作台」的改造结果：
 *   ① 桌面侧栏 200px 常驻、菜单文字可见、不渲染抽屉入口；
 *   ② 窄屏侧栏默认收起，页头按钮唤出抽屉 + 遮罩，抽屉内 4 项文字菜单与底部两枚纯文字按钮；
 *   ③ 点菜单 / 点遮罩都能收起，切换指标同步写 URL；
 *   ④ 无横向溢出、底部留白不照搬个人台的 120px（健康面板没有悬浮 FAB）、无页面异常。
 *
 * 用法：node scripts/qa-health-view-mobile.mjs [--shots=<目录>]
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

  // ---------- S1 桌面：侧栏常驻 ----------
  await page.goto(base + '/health', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.wb-shell', { timeout: 60000 })
  await page.waitForSelector('[data-testid="hv-page-head"]', { timeout: 30000 })
  const desk = await page.evaluate(() => {
    const menu = document.querySelector('.wb-menu')
    const label = document.querySelector('.wb-menu-label')
    const trigger = document.querySelector('[data-testid="hv-menu-trigger"]')
    return {
      w: Math.round(menu?.getBoundingClientRect().width ?? 0),
      labelShown: !!label && getComputedStyle(label).display !== 'none',
      triggerShown: !!trigger && getComputedStyle(trigger).display !== 'none',
      scrim: document.querySelectorAll('[data-testid="hv-menu-scrim"]').length
    }
  })
  check('S1 桌面侧栏约 200px 常驻', desk.w >= 180 && desk.w <= 220, `w=${desk.w}`)
  check('S1 桌面菜单文字可见', desk.labelShown)
  check('S1 桌面不显示抽屉入口与遮罩', !desk.triggerShown && desk.scrim === 0)

  // ---------- S2/S3 窄屏抽屉 ----------
  for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    const tag = `${vp.width}px`
    await page.setViewportSize(vp)
    await page.waitForTimeout(300)

    const closed = await page.evaluate(() => {
      const nav = document.querySelector('.wb-menu')
      const r = nav?.getBoundingClientRect()
      return { right: Math.round(r?.right ?? 999), open: nav?.classList.contains('open') }
    })
    check(`S2 ${tag} 抽屉默认收起`, closed.right <= 0 && !closed.open, `right=${closed.right}`)
    check(`S2 ${tag} 页头菜单按钮可见`, await page.locator('[data-testid="hv-menu-trigger"]').isVisible())

    await page.click('[data-testid="hv-menu-trigger"]')
    await page.waitForTimeout(300)
    const opened = await page.evaluate(() => {
      const nav = document.querySelector('.wb-menu')
      const footBtns = [...document.querySelectorAll('.wb-side-btn')].map(b => b.getAttribute('data-testid'))
      const labels = [...document.querySelectorAll('.wb-menu-label')]
      return {
        open: nav?.classList.contains('open') ?? false,
        left: Math.round(nav?.getBoundingClientRect().left ?? -1),
        scrim: document.querySelectorAll('[data-testid="hv-menu-scrim"]').length,
        // 只数抽屉内的指标项：hv-menu-trigger / hv-menu-scrim 也以 hv-menu- 开头，不能混进来
        items: document.querySelectorAll('.wb-menu [data-testid^="hv-menu-"]').length,
        labelsShown: labels.length === 4 && labels.every(l => getComputedStyle(l).display !== 'none'),
        foot: footBtns.join(','),
        footTextShown: [...document.querySelectorAll('.wb-side-btn-text')].every(t => getComputedStyle(t).display !== 'none')
      }
    })
    check(`S3 ${tag} 抽屉可唤出且贴左`, opened.open && opened.left === 0, `left=${opened.left}`)
    check(`S3 ${tag} 遮罩出现`, opened.scrim === 1)
    check(`S3 ${tag} 4 项菜单文字完整`, opened.items === 4 && opened.labelsShown, `items=${opened.items}`)
    check(`S3 ${tag} 底部两枚纯文字按钮`, opened.foot === 'hv-sync-now,hv-settings' && opened.footTextShown, opened.foot)
    if (SHOTS && vp.width === 390) {
      fs.mkdirSync(SHOTS, { recursive: true })
      await page.screenshot({ path: join(SHOTS, 'health-drawer-light.png') })
    }

    // 点菜单项：收起抽屉 + 切换指标 + 写 URL
    await page.click('[data-testid="hv-menu-diet"]')
    await page.waitForTimeout(300)
    const afterPick = await page.evaluate(() => ({
      open: document.querySelector('.wb-menu')?.classList.contains('open') ?? false,
      title: (document.querySelector('[data-testid="hv-page-title"]')?.textContent || '').trim(),
      tab: new URL(location.href).searchParams.get('tab')
    }))
    check(`S3 ${tag} 点菜单后抽屉收起`, !afterPick.open)
    check(`S3 ${tag} 指标切换并写入 URL`, afterPick.title === '饮食' && afterPick.tab === 'diet', `${afterPick.title}/${afterPick.tab}`)

    // 点遮罩（避开 264px 抽屉区域）也能收起
    await page.click('[data-testid="hv-menu-trigger"]')
    await page.waitForTimeout(250)
    await page.locator('[data-testid="hv-menu-scrim"]').click({ position: { x: vp.width - 40, y: 300 } })
    await page.waitForTimeout(250)
    check(`S3 ${tag} 点遮罩可关闭抽屉`,
      !(await page.evaluate(() => document.querySelector('.wb-menu')?.classList.contains('open') ?? false)))

    // 布局与留白口径
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      padBottom: parseFloat(getComputedStyle(document.querySelector('.wb-content')).paddingBottom)
    }))
    check(`S4 ${tag} 无横向溢出`, layout.overflow <= 1, `overflow=${layout.overflow}`)
    check(`S4 ${tag} 底部留白按无 FAB 收窄（<60px）`, layout.padBottom < 60, `pad=${layout.padBottom}`)
  }

  // ---------- S5 暗色 + 异常 ----------
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.click('[data-testid="hv-menu-trigger"]')
  await page.waitForTimeout(300)
  const darkShadow = await page.evaluate(() => getComputedStyle(document.querySelector('.wb-menu')).boxShadow)
  check('S5 暗色抽屉带侧向投影', darkShadow !== 'none', darkShadow.slice(0, 50))
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'health-drawer-dark.png') })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  check('S5 无页面 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '))

  const failed = results.filter(r => !r.ok)
  console.log(`\n[qa] ${results.length - failed.length}/${results.length} passed`)
  if (failed.length) process.exitCode = 1
} finally {
  await browser.close()
  if (serverStarted && server) server.kill()
}
