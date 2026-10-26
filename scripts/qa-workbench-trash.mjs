/**
 * QA：个人工作台「统一回收站」
 *
 * 断言：
 *  S1 左侧菜单出现「回收站」入口（且可进入）
 *  S2 空态：未删除任何东西时显示全局空态 + 共 0 项
 *  S3 软删一条待办后，回收站出现「待办」分区，含该条目标题，总数 +1（体现所属模块）
 *  S4 点「恢复」→ 分区消失、记录回到待办列表
 *  S5 再次删除后点「彻底删除」并确认 → 记录被物理清除
 *  S6 各模块内部原有「回收站」按钮已移除（待办/便签/记账/家谱）
 *
 * 用法：node scripts/qa-workbench-trash.mjs
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
  for (const d of fs.readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(p)) return p
  }
  return undefined
}
async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return true } catch { }
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
    server = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
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

const TITLE = '回收站QA-待办'

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-trash"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }

  const trashBtnText = (await page.locator('[data-testid="wb-menu-trash"]').innerText()).trim()
  check('S1 菜单出现「回收站」入口', trashBtnText.includes('回收站'), trashBtnText)

  await page.click('[data-testid="wb-menu-trash"]')
  try {
    await page.waitForSelector('[data-testid="wb-trash"]', { timeout: 15000 })
  } catch (e) {
    const main = await page.locator('.wb-content').innerText().catch(() => '(no main)')
    console.log('[qa] 面板未出现。页面主区文本：', main.replace(/\s+/g, ' ').slice(0, 300))
    console.log('[qa] 页面异常：', errs.join(' | ').slice(0, 400))
    throw e
  }
  const totalText0 = (await page.locator('[data-testid="trash-total"]').innerText()).trim()
  check('S2 空态显示全局空态', (await page.locator('[data-testid="trash-global-empty"]').count()) === 1)
  check('S2 空态总数为 0', totalText0.includes('0'), totalText0)

  // ---- S3 软删一条待办 ----
  await page.evaluate(async (title) => {
    const m = await import('/src/stores/workbenchTodos.ts')
    const s = m.useWorkbenchTodosStore()
    await s.addTodo({ title, priority: 'medium' })
    const t = s.todos.find((x) => x.title === title)
    if (t) await s.deleteTodo(t.id)
  }, TITLE)
  await page.waitForTimeout(600)

  const sec = page.locator('[data-testid="trash-section-todos"]')
  check('S3 出现「待办」分区', (await sec.count()) === 1)
  const secTitle = (await sec.locator('.tr-sec-title').innerText().catch(() => '')).trim()
  check('S3 分区标题为所属模块「待办」', secTitle === '待办', secTitle)
  const secText = (await sec.innerText().catch(() => ''))
  check('S3 分区内列出被删条目', secText.includes(TITLE), secText.replace(/\s+/g, ' ').slice(0, 60))
  const totalText1 = (await page.locator('[data-testid="trash-total"]').innerText()).trim()
  check('S3 总数变为 1', totalText1.includes('1'), totalText1)
  check('S3 分区内有「清空回收站」按钮', (await sec.locator('[data-testid="record-trash-empty"]').count()) === 1)

  // 视觉留档（SHOT=1 时输出截图，便于人工核对样式）
  if (process.env.SHOT) await page.screenshot({ path: 'd:/tmp/trash.png', fullPage: true })

  // ---- S4 恢复 ----
  await sec.locator('button:has-text("恢复")').first().click()
  await page.waitForTimeout(700)
  check('S4 恢复后分区消失', (await page.locator('[data-testid="trash-section-todos"]').count()) === 0)
  const backActive = await page.evaluate(async (title) => {
    const m = await import('/src/stores/workbenchTodos.ts')
    return m.useWorkbenchTodosStore().activeTodos.some((t) => t.title === title)
  }, TITLE)
  check('S4 记录已回到待办列表', backActive)

  // ---- S5 彻底删除 ----
  await page.evaluate(async (title) => {
    const m = await import('/src/stores/workbenchTodos.ts')
    const s = m.useWorkbenchTodosStore()
    const t = s.activeTodos.find((x) => x.title === title)
    if (t) await s.deleteTodo(t.id)
  }, TITLE)
  await page.waitForTimeout(600)
  await page.locator('[data-testid="trash-section-todos"] button:has-text("彻底删除")').first().click()
  await page.waitForSelector('.btn-submit', { timeout: 15000 })
  await page.click('.btn-submit')
  await page.waitForTimeout(700)
  const stillThere = await page.evaluate(async (title) => {
    const m = await import('/src/stores/workbenchTodos.ts')
    const s = m.useWorkbenchTodosStore()
    return s.todos.some((t) => t.title === title)
  }, TITLE)
  check('S5 彻底删除后记录不存在', !stillThere)
  check('S5 分区已清空', (await page.locator('[data-testid="trash-section-todos"]').count()) === 0)

  // ---- S6 各模块内不再有回收站入口 ----
  const moduleChecks = [
    ['wb-menu-todos', 'td-trash-button', '待办'],
    ['wb-menu-notes', 'nt-trash-button', '便签'],
    ['wb-menu-ledger', 'ld-trash-button', '记账'],
    ['wb-menu-genealogy', 'fg-trash-button', '家谱']
  ]
  for (const [menu, testid, label] of moduleChecks) {
    await page.click(`[data-testid="${menu}"]`)
    await page.waitForTimeout(500)
    const n = await page.locator(`[data-testid="${testid}"]`).count()
    check(`S6 ${label}面板内已无回收站按钮`, n === 0, `count=${n}`)
  }

  check('无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
