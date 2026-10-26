/**
 * QA：记账「新增记录」保存链路（回归）
 *
 * 背景 bug：保存按钮写成 `<el-button type="submit">`。el-button 的 `type` 只作用于样式，
 * 原生提交类型要走 `native-type` —— 实际渲染成 `type="button"`，又没绑 @click，
 * 导致点「保存」什么都不发生（弹框不关、记录不入库、也没有任何报错）。
 *
 * 断言：
 *  S1 金额为空时保存按钮禁用；填合法金额后可用；按钮为原生 submit
 *  S2 点保存 → 弹框关闭
 *  S3 store.entries +1，金额/日期/分组正确
 *  S4 页面列表出现该金额
 *  S5 刷新页面后记录仍在（确实落库）
 *
 * 用法：node scripts/qa-workbench-ledger-save.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const AMOUNT = '123.45'

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
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })
  await page.addInitScript(() => {
    window.__rej = []
    window.addEventListener('unhandledrejection', (ev) => { window.__rej.push(String(ev.reason && ev.reason.message ? ev.reason.message : ev.reason)) })
  })

  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-ledger"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }
  await page.click('[data-testid="wb-menu-ledger"]')
  await page.waitForSelector('[data-testid="ld-add"]', { timeout: 30000 })

  const before = await page.evaluate(async () => {
    const m = await import('/src/stores/workbenchLedger.ts')
    return m.useWorkbenchLedgerStore().entries.length
  })

  await page.click('[data-testid="ld-add"]')
  await page.waitForSelector('[data-testid="ld-save"]', { timeout: 30000 })

  check('S1 金额为空时保存按钮禁用', await page.locator('[data-testid="ld-save"]').isDisabled())

  await page.locator('[data-testid="ld-form-amount"] input').fill(AMOUNT)
  await page.waitForTimeout(300)
  check('S1 填合法金额后保存按钮可用', !(await page.locator('[data-testid="ld-save"]').isDisabled()))

  const btnType = await page.locator('[data-testid="ld-save"]').evaluate((n) => n.getAttribute('type'))
  check('S1 保存按钮为原生 submit（点击/回车都能提交）', btnType === 'submit', `type=${btnType}`)

  await page.click('[data-testid="ld-save"]')
  await page.waitForTimeout(1500)

  // 弹框是 BaseDialog + Transition（隐藏时 DOM 仍可能在），因此判可见性而不是节点数
  const saveBtnVisible = await page.locator('[data-testid="ld-save"]').isVisible()
  check('S2 保存后弹框关闭', !saveBtnVisible)

  const after = await page.evaluate(async () => {
    const m = await import('/src/stores/workbenchLedger.ts')
    const s = m.useWorkbenchLedgerStore()
    const last = s.entries[s.entries.length - 1] || null
    return { count: s.entries.length, last: last ? { amount: last.amount, date: last.date, categoryId: last.categoryId } : null }
  })
  console.log('[qa] 保存后:', JSON.stringify(after))
  check('S3 记录数 +1', after.count === before + 1, `${before} → ${after.count}`)
  check('S3 金额写入正确', after.last?.amount === Number(AMOUNT), String(after.last?.amount))
  check('S3 分组已写入', !!after.last?.categoryId, String(after.last?.categoryId))
  check('S3 日期已写入', /^\d{4}-\d{2}-\d{2}$/.test(after.last?.date || ''), String(after.last?.date))

  // 列表金额默认是掩码（****），先点「显示金额」再断言，避免误判
  await page.click('[data-testid="ld-toggle-amounts"]')
  await page.waitForTimeout(400)
  const listText = await page.locator('.wb-ledger').innerText().catch(() => '')
  check('S4 列表显示该金额', listText.includes(AMOUNT), listText.replace(/\s+/g, ' ').slice(0, 100))

  // ---- S5 刷新后仍在 ----
  await page.reload({ waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-ledger"]', { timeout: 120000 })
  await page.click('[data-testid="wb-menu-ledger"]')
  await page.waitForSelector('[data-testid="ld-add"]', { timeout: 30000 })
  await page.waitForTimeout(900)
  const persisted = await page.evaluate(async () => {
    const m = await import('/src/stores/workbenchLedger.ts')
    const s = m.useWorkbenchLedgerStore()
    return s.entries.some((e) => e.amount === 123.45)
  })
  check('S5 刷新后记录仍在（已落库）', persisted)

  check('无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
