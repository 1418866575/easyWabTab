/**
 * QA：密码管理卡片交互改造
 *
 * 需求：
 *  1. 卡片上的「编辑」按钮删除 —— 点击整张卡片即打开编辑弹框
 *  2. 卡片上的「删除」按钮删除 —— 删除入口移到编辑弹框里
 *  3. 卡片上只留三个动作：显示密码 / 复制用户名 / 复制密码，且按钮显示汉字
 *
 * 断言：
 *  S1 卡片内不存在 pwd-edit-* / pwd-delete-* 按钮
 *  S2 卡片内三个动作按钮文案为「显示密码」「复制用户名」「复制密码」（纯文字，非图标）
 *  S3 点击卡片空白处 → 打开弹框，标题「编辑密码」，站点名已回填
 *  S4 编辑弹框内存在「删除」按钮；新增弹框内不存在（新增态无可删对象）
 *  S5 点「复制用户名」不触发编辑弹框（卡片内交互已 stop 冒泡）
 *  S6 点「复制密码」不触发编辑弹框
 *  S7 点「打开网站」链接不触发编辑弹框
 *  S8 「显示密码 / 隐藏密码」文案随可见性切换
 *  S9 弹框内删除 → 确认后条目消失且弹框自动关闭
 *  S10 无页面级 JS 异常
 *
 * 用法：node scripts/qa-workbench-password-card.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MASTER = 'qA!2026#master'

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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } })
  // 复制按钮走 navigator.clipboard，localhost 属安全上下文，显式授权避免权限弹窗
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base }).catch(() => {})
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-passwords"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }
  await page.waitForSelector('[data-testid="home-overview-grid"]', { timeout: 60000 })
  await page.click('[data-testid="wb-menu-passwords"]')
  await page.waitForFunction(() => !document.querySelector('.wb-content .ewt-skeleton'), { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(600)

  // ---- 前置：首次进入设置主密码 ----
  if (await page.locator('[data-testid="pwd-setup-input"]').count()) {
    await page.fill('[data-testid="pwd-setup-input"]', MASTER)
    await page.fill('[data-testid="pwd-setup-confirm"]', MASTER)
    await page.click('[data-testid="pwd-setup-submit"]')
    await page.waitForTimeout(1500)
  }
  const unlocked = await page.locator('[data-testid="pwd-add-btn"]').count()
  check('前置：密码库已解锁', unlocked > 0, `addBtn=${unlocked}`)

  // ---- 前置：新增一条密码 ----
  await page.click('[data-testid="pwd-add-btn"]')
  await page.waitForSelector('[data-testid="pwd-form-modal"]', { timeout: 15000 })
  await page.waitForTimeout(300)
  const addHasDelete = await page.locator('[data-testid="pwd-form-delete"]').count()
  check('S4 新增弹框内没有「删除」按钮', addHasDelete === 0, `count=${addHasDelete}`)

  await page.fill('[data-testid="pwd-form-site"]', 'QA-卡片改造站点')
  await page.fill('[data-testid="pwd-form-url"]', 'https://example.com')
  await page.fill('[data-testid="pwd-form-username"]', 'qa-user@example.com')
  await page.fill('[data-testid="pwd-form-password"]', 'S3cret-Passw0rd')
  await page.click('[data-testid="pwd-save-btn"]')
  await page.waitForTimeout(1200)
  const itemCount = await page.locator('[data-testid="pwd-item"]').count()
  check('前置：卡片已生成', itemCount === 1, `count=${itemCount}`)

  // ---- S1 卡片上不再有编辑/删除按钮 ----
  const editBtns = await page.locator('[data-testid^="pwd-edit-"]').count()
  const delBtns = await page.locator('[data-testid^="pwd-delete-"]').count()
  check('S1 卡片上无「编辑」按钮', editBtns === 0, `count=${editBtns}`)
  check('S1 卡片上无「删除」按钮', delBtns === 0, `count=${delBtns}`)

  // ---- S2 三个动作按钮为汉字 ----
  const toggleText = (await page.locator('[data-testid^="pwd-toggle-"]').first().innerText()).trim()
  const copyUserText = (await page.locator('[data-testid^="pwd-copy-username-"]').first().innerText()).trim()
  const copyPassText = (await page.locator('[data-testid^="pwd-copy-password-"]').first().innerText()).trim()
  console.log('[qa] 按钮文案:', JSON.stringify([toggleText, copyUserText, copyPassText]))
  check('S2 「显示密码」为汉字文案', toggleText === '显示密码', toggleText)
  check('S2 「复制用户名」为汉字文案', copyUserText === '复制用户名', copyUserText)
  check('S2 「复制密码」为汉字文案', copyPassText === '复制密码', copyPassText)
  const actionBtnCount = await page.locator('.pwd-actions button').count()
  check('S2 卡片动作区恰好 3 个按钮', actionBtnCount === 3, `count=${actionBtnCount}`)

  // ---- S5/S6 点复制按钮不打开编辑弹框 ----
  await page.locator('[data-testid^="pwd-copy-username-"]').first().click()
  await page.waitForTimeout(500)
  check('S5 点「复制用户名」未误开编辑弹框', (await page.locator('[data-testid="pwd-form-modal"]').count()) === 0)
  await page.locator('[data-testid^="pwd-copy-password-"]').first().click()
  await page.waitForTimeout(500)
  check('S6 点「复制密码」未误开编辑弹框', (await page.locator('[data-testid="pwd-form-modal"]').count()) === 0)

  // ---- S8 显示/隐藏文案切换 ----
  await page.locator('[data-testid^="pwd-toggle-"]').first().click()
  await page.waitForTimeout(400)
  const afterShow = (await page.locator('[data-testid^="pwd-toggle-"]').first().innerText()).trim()
  check('S8 点一下变「隐藏密码」', afterShow === '隐藏密码', afterShow)
  await page.locator('[data-testid^="pwd-toggle-"]').first().click()
  await page.waitForTimeout(400)
  check('S8 再点回「显示密码」', (await page.locator('[data-testid^="pwd-toggle-"]').first().innerText()).trim() === '显示密码')

  // ---- S7 点「打开网站」不打开编辑弹框 ----
  if (process.env.SHOT) await page.screenshot({ path: 'd:/tmp/pwd-card.png' })
  // 用 evaluate 阻止真实跳转（新窗口打开），只验证冒泡
  await page.evaluate(() => {
    document.querySelectorAll('[data-testid^="pwd-open-"]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()))
  })
  await page.locator('[data-testid^="pwd-open-"]').first().click()
  await page.waitForTimeout(500)
  check('S7 点「打开网站」未误开编辑弹框', (await page.locator('[data-testid="pwd-form-modal"]').count()) === 0)

  // ---- S3 点卡片打开编辑弹框 ----
  await page.locator('[data-testid="pwd-item"]').first().click()
  await page.waitForSelector('[data-testid="pwd-form-modal"]', { timeout: 15000 })
  await page.waitForTimeout(400)
  const dialogTitle = (await page.locator('[data-testid="pwd-form-modal"]').innerText()).split('\n')[0].trim()
  check('S3 点卡片打开编辑弹框', dialogTitle.includes('编辑密码'), dialogTitle)
  const siteVal = await page.locator('[data-testid="pwd-form-site"]').inputValue()
  check('S3 弹框已回填该条目', siteVal === 'QA-卡片改造站点', siteVal)

  // ---- S4 编辑弹框内有删除按钮 ----
  const editHasDelete = await page.locator('[data-testid="pwd-form-delete"]').count()
  check('S4 编辑弹框内有「删除」按钮', editHasDelete === 1, `count=${editHasDelete}`)

  // ---- S9 弹框内删除 ----
  await page.click('[data-testid="pwd-form-delete"]')
  await page.waitForSelector('.btn-submit', { timeout: 10000 })
  await page.click('.btn-submit')
  await page.waitForTimeout(1200)
  check('S9 删除后卡片消失', (await page.locator('[data-testid="pwd-item"]').count()) === 0)
  check('S9 删除后弹框自动关闭', (await page.locator('[data-testid="pwd-form-modal"]').count()) === 0)

  check('S10 无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
  await ctx.close()
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
