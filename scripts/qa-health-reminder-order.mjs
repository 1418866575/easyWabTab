/**
 * QA：健康工作台「提醒」模块的位置（运动 / 饮食）
 *
 * 需求：只挪位置不改样式 —— 提醒紧跟周计划看板、排在方案卡之前，PC 与窄屏同一顺序。
 * 覆盖：1440×900（PC）与 390×844（窄屏），两个指标 tab，DOM 顺序 + 视觉位置 + 样式未变。
 *
 * 用法：node scripts/qa-health-reminder-order.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

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

  await page.goto(base + '/health', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.wb-shell', { timeout: 60000 })
  await page.waitForSelector('[data-testid="hv-page-head"]', { timeout: 30000 })

  // 提醒模块 v-if="reminders.length > 0"，先按运动/饮食分类各注入一条只读倒计时
  await page.evaluate(async () => {
    const m = await import('/src/stores/countdowns.ts')
    const s = m.useCountdownsStore()
    await s.loadCountdowns()
    for (const [name, category, time] of [
      ['QA 运动提醒', 'exercise', '2027-06-30T07:00'],
      ['QA 饮食提醒', 'diet', '2027-06-30T08:00']
    ]) {
      if (!s.countdowns.some(c => c.name === name)) {
        await s.addCountdown({ name, category, endDateTime: time })
      }
    }
  })
  await page.waitForTimeout(600)

  const CASES = [
    { tab: 'exercise', menu: 'hv-menu-exercise', remind: 'exercise-reminders', card: 'ex-plan-card', label: '运动' },
    { tab: 'diet', menu: 'hv-menu-diet', remind: 'diet-reminders', card: 'dt-plan-card', label: '饮食' }
  ]

  for (const vp of [{ width: 1440, height: 900, tag: 'PC' }, { width: 390, height: 844, tag: '窄屏' }]) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.waitForTimeout(250)

    for (const c of CASES) {
      // 窄屏菜单在抽屉里，先唤出再点；PC 直接点侧栏
      if (vp.tag === '窄屏') {
        await page.click('[data-testid="hv-menu-trigger"]')
        await page.waitForTimeout(200)
      }
      await page.click(`[data-testid="${c.menu}"]`)
      await page.waitForTimeout(400)

      const r = await page.evaluate(({ remind, card }) => {
        const board = document.querySelector('.wp-board')
        const rem = document.querySelector(`[data-testid="${remind}"]`)
        const plan = document.querySelector(`[data-testid="${card}"]`)
        if (!board || !rem || !plan) return { missing: `board=${!!board} remind=${!!rem} card=${!!plan}` }
        const FOLLOW = Node.DOCUMENT_POSITION_FOLLOWING
        const top = el => Math.round(el.getBoundingClientRect().top + window.scrollY)
        return {
          domOk: !!(board.compareDocumentPosition(rem) & FOLLOW) && !!(rem.compareDocumentPosition(plan) & FOLLOW),
          tops: [top(board), top(rem), top(plan)],
          isList: !!rem.querySelector('ul.hr-list') && rem.querySelectorAll('li.hr-item').length > 0,
          noTable: !rem.querySelector('table'),
          borderTop: getComputedStyle(rem).borderTopWidth
        }
      }, { remind: c.remind, card: c.card })

      check(`${vp.tag} · ${c.label} 三个模块都在`, !r.missing, r.missing || '')
      check(`${vp.tag} · ${c.label} 顺序：周计划 → 提醒 → 方案卡`, !!r.domOk, JSON.stringify(r.tops || []))
      check(`${vp.tag} · ${c.label} 视觉位置同序`, !!r.tops && r.tops[0] < r.tops[1] && r.tops[1] < r.tops[2], JSON.stringify(r.tops || []))
      check(`${vp.tag} · ${c.label} 提醒仍是原列表小卡（未改样式）`,
        !!r.isList && !!r.noTable && r.borderTop === '2px', `list=${r.isList} table=${!r.noTable} border=${r.borderTop}`)
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(`${vp.tag} 无横向溢出`, overflow <= 1, `overflow=${overflow}`)
  }

  check('无页面 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '))

  const failed = results.filter(r => !r.ok)
  console.log(`\n[qa] ${results.length - failed.length}/${results.length} passed`)
  if (failed.length) process.exitCode = 1
} finally {
  await browser.close()
  if (serverStarted && server) server.kill()
}
