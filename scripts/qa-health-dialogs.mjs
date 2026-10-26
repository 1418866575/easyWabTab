/**
 * QA：健康模块弹框「打开 → 取消 → 真正卸载」回归
 *
 * 背景：这些弹框原本被 `<Transition name="dialog">` 包着，而 BaseDialog 根节点是 `<Teleport>`，
 * Vue 无法对非元素根做过渡 → 离场钩子不完成 → `v-if` 翻 false 后节点仍留在 DOM 里，
 * 表现为「保存/取消后弹框不动」。8 个弹框已统一去掉那层无效 Transition。
 *
 * 本脚本用 **DOM 节点数**（不是可见性）断言卸载，并额外检查不应再出现该 Vue 警告，
 * 防止以后又被包回 Transition 里。
 *
 * 断言（每个弹框 2 条）：
 *  - 打开：弹框节点数 = 1
 *  - 取消后 800ms：弹框节点数 = 0（真正卸载）
 * 另：全程不得出现 "non-element root node" 警告；无页面级 JS 异常。
 *
 * 用法：node scripts/qa-health-dialogs.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const CASES = [
  { tab: 'diet', name: '饮食·新增', trigger: '[data-testid="dt-add"]', dialog: '[data-testid="dt-dialog"]', cancel: '[data-testid="dt-cancel-record"]' },
  { tab: 'diet', name: '饮食·目标', trigger: '[data-testid="dt-target"], [data-testid="dt-edit-target"]', dialog: '[data-testid="dt-dialog"]', cancel: '[data-testid="dt-cancel"]' },
  { tab: 'exercise', name: '运动·新增', trigger: '[data-testid="ex-add"]', dialog: '[data-testid="ex-dialog"]', cancel: '[data-testid="ex-cancel-record"]' },
  { tab: 'exercise', name: '运动·目标', trigger: '[data-testid="ex-target"], [data-testid="ex-edit-target"]', dialog: '[data-testid="ex-dialog"]', cancel: '[data-testid="ex-cancel"]' },
  { tab: 'sleep', name: '睡眠·新增', trigger: '[data-testid="sl-add"]', dialog: '[data-testid="sl-dialog"]', cancel: '[data-testid="sl-cancel-record"]' },
  { tab: 'sleep', name: '睡眠·目标', trigger: '[data-testid="sl-target"], [data-testid="sl-edit-target"]', dialog: '[data-testid="sl-dialog"]', cancel: '[data-testid="sl-cancel-target"]' },
  { tab: 'weight', name: '体重·新增', trigger: '[data-testid="wt-add"]', dialog: '[data-testid="wt-dialog"]', cancel: '[data-testid="wt-cancel-record"]' },
  { tab: 'weight', name: '体重·身高', trigger: '[data-testid="wt-set-height"]', dialog: '[data-testid="wt-height-dialog"]', cancel: '[data-testid="wt-height-cancel"]' }
]

function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!fs.existsSync(root)) return undefined
  for (const d of fs.readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(p)) return p
  }
  return undefined
}
async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return true } catch { }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}
async function isViteDevAt(port) {
  try {
    const res = await fetch('http://localhost:' + port + '/src/composables/useIdb.ts')
    if (!res.ok) return false
    if ((res.headers.get('content-type') || '').includes('text/html')) return false
    return (await res.text()).includes('idbExportAll')
  } catch { return false }
}
async function isPortFree(port) {
  try { const r = await fetch('http://localhost:' + port + '/', { signal: AbortSignal.timeout(1500) }); return !r.ok } catch { return true }
}
let server = null, startedByUs = false
async function ensureDevServer() {
  for (let p = 16718; p <= 16726; p++) if (await isViteDevAt(p)) return 'http://localhost:' + p
  for (let p = 16718; p <= 16726; p++) {
    if (!(await isPortFree(p))) continue
    server = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    startedByUs = true
    server.stdout.on('data', () => {})
    server.stderr.on('data', () => {})
    if (await waitForServer('http://localhost:' + p)) if (await isViteDevAt(p)) return 'http://localhost:' + p
    server.kill(); server = null; startedByUs = false
  }
  throw new Error('no free port')
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errs = []
  const warns = []
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('console', (m) => {
    const t = m.text()
    if (m.type() === 'error') errs.push('console: ' + t.slice(0, 200))
    if (m.type() === 'warning') warns.push(t.slice(0, 240))
  })

  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-health"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }
  await page.click('[data-testid="wb-menu-health"]')
  await page.waitForSelector('[data-testid="hd-tabs"]', { timeout: 60000 })

  let currentTab = ''
  for (const c of CASES) {
    if (currentTab !== c.tab) {
      await page.click(`[data-testid="hd-tab-${c.tab}"]`)
      await page.waitForTimeout(500)
      currentTab = c.tab
    }
    const trigger = page.locator(c.trigger).first()
    if ((await trigger.count()) === 0) {
      check(`${c.name}：找到触发按钮`, false, c.trigger)
      continue
    }
    await trigger.click()
    await page.waitForTimeout(600)
    const opened = await page.locator(c.dialog).count()
    check(`${c.name}：弹框已打开`, opened === 1, `count=${opened}`)

    const cancelBtn = page.locator(c.cancel).first()
    if ((await cancelBtn.count()) === 0) {
      check(`${c.name}：找到取消按钮`, false, c.cancel)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)
      continue
    }
    await cancelBtn.click()
    await page.waitForTimeout(800)
    const closed = await page.locator(c.dialog).count()
    // 关键回归：必须是 0（真正从 DOM 卸载），不是「隐藏但仍存在」
    check(`${c.name}：取消后弹框已卸载`, closed === 0, `count=${closed}`)
  }

  const transitionWarns = warns.filter((w) => w.includes('non-element root node'))
  check('全程无「Transition 非元素根」警告', transitionWarns.length === 0, transitionWarns[0] || '')
  check('无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
