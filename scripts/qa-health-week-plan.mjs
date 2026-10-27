/**
 * QA：健康管理「运动周计划 / 饮食周计划」
 *
 * 断言：
 *  S1 运动面板：周计划看板渲染（早晨/傍晚行 + 7 天列）
 *  S2 点单元格 → 弹框填「晨跑 / 3 km」保存 → 单元格回显、store 落库
 *  S3 再点同格回填 → 勾选已完成保存 → ✓ 状态生效
 *  S4 饮食面板：点早餐格 → 填「燕麦+鸡蛋 / 380」→ 单元格与合计行正确
 *  S5 刷新后两边持久化（读 IDB 后的 store 断言）
 *  S6 无页面级 JS 异常
 *
 * 用法：node scripts/qa-health-week-plan.mjs
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

// el-input 会把 data-testid 透传到原生 input 上（而非外层 div），双形态选择器兜底
async function fillField(page, testid, value) {
  const loc = page.locator(`[data-testid="${testid}"] input, input[data-testid="${testid}"]`).first()
  await loc.fill(value)
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
  page.on('console', (m) => { if (m.text().includes('[dbg]')) console.log('[page] ' + m.text().slice(0, 600)) })

  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-health"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }
  await page.click('[data-testid="wb-menu-health"]')
  await page.waitForSelector('[data-testid="ex-plan-board"]', { timeout: 60000 })

  // ---- S1 看板渲染 ----
  const morningCells = await page.locator('[data-testid="wp-cell-morning-1"]').count()
  const eveningCells = await page.locator('[data-testid="wp-cell-evening-7"]').count()
  check('S1 运动周计划看板渲染（早晨/傍晚行 × 7 天）', morningCells === 1 && eveningCells === 1, `morning=${morningCells} evening=${eveningCells}`)

  // ---- S2 添加早晨计划（周二格） ----
  await page.click('[data-testid="wp-cell-morning-2"]')
  await page.waitForSelector('[data-testid="ex-plan-dialog"]', { timeout: 15000 })
  await fillField(page, 'ex-plan-name', '晨跑')
  await fillField(page, 'ex-plan-value', '3 km')
  await page.click('[data-testid="ex-plan-save"]')
  await page.waitForTimeout(700)
  const cellText = (await page.locator('[data-testid="wp-cell-morning-2"]').innerText()).replace(/\s+/g, '')
  check('S2 保存后单元格回显「晨跑 3 km」', cellText.includes('晨跑') && cellText.includes('3km'), cellText)
  const saved = await page.evaluate(async () => {
    const m = await import('/src/stores/workbenchHealth.ts')
    const s = m.useWorkbenchHealthStore()
    const weeks = s.weeklyPlans ?? {}
    const key = Object.keys(weeks)[0]
    const it = weeks[key]?.exercise.find((x) => x.rowKey === 'morning' && x.day === 2)
    return it ? { name: it.name, value: it.value, done: !!it.done } : null
  })
  check('S2 store 落库（名称/强度）', saved?.name === '晨跑' && saved?.value === '3 km', JSON.stringify(saved))

  // ---- S3 勾选已完成 ----
  await page.click('[data-testid="wp-cell-morning-2"]')
  await page.waitForSelector('[data-testid="ex-plan-dialog"]', { timeout: 15000 })
  const backfill = await page.locator('[data-testid="ex-plan-name"] input, input[data-testid="ex-plan-name"]').first().inputValue()
  check('S3 再次点开表单回填名称', backfill === '晨跑', backfill)
  await page.locator('[data-testid="ex-plan-done"]').click()
  await page.click('[data-testid="ex-plan-save"]')
  await page.waitForTimeout(700)
  const cellText2 = (await page.locator('[data-testid="wp-cell-morning-2"]').innerText()).replace(/\s+/g, '')
  check('S3 已完成后显示 ✓', cellText2.includes('✓'), cellText2)

  if (process.env.SHOT) await page.screenshot({ path: 'd:/tmp/exercise-plan.png', fullPage: true })

  // ---- S4 饮食周计划 ----
  await page.click('[data-testid="hd-tab-diet"]')
  await page.waitForTimeout(700)
  await page.click('[data-testid="wp-cell-breakfast-1"]')
  await page.waitForSelector('[data-testid="dt-plan-dialog"]', { timeout: 15000 })
  await fillField(page, 'dt-plan-name', '燕麦+鸡蛋')
  await fillField(page, 'dt-plan-kcal', '380')
  await page.click('[data-testid="dt-plan-save"]')
  await page.waitForTimeout(700)
  const dietCell = (await page.locator('[data-testid="wp-cell-breakfast-1"]').innerText()).replace(/\s+/g, '')
  check('S4 早餐格回显「燕麦+鸡蛋 380kcal」', dietCell.includes('燕麦+鸡蛋') && dietCell.includes('380'), dietCell)
  const totalCell = (await page.locator('[data-testid="wp-cell-total-1"]').innerText()).replace(/\s+/g, '')
  check('S4 合计行自动求和 380', totalCell.includes('380'), totalCell)

  if (process.env.SHOT) await page.screenshot({ path: 'd:/tmp/diet-plan.png', fullPage: true })

  // ---- S5 刷新持久化 ----
  await page.reload({ waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-health"]', { timeout: 120000 })
  await page.click('[data-testid="wb-menu-health"]')
  await page.waitForSelector('[data-testid="ex-plan-board"]', { timeout: 60000 })
  await page.waitForTimeout(600)
  const persisted = await page.evaluate(async () => {
    const m = await import('/src/stores/workbenchHealth.ts')
    const s = m.useWorkbenchHealthStore()
    const weeks = s.weeklyPlans ?? {}
    const key = Object.keys(weeks)[0]
    if (!key) return null
    const ex = weeks[key].exercise.find((x) => x.rowKey === 'morning' && x.day === 2) || null
    const dt = weeks[key].diet.find((x) => x.rowKey === 'breakfast' && x.day === 1) || null
    return { exName: ex?.name ?? null, exDone: ex?.done ?? false, dtName: dt?.name ?? null, dtKcal: dt?.kcal ?? null }
  })
  check('S5 刷新后运动计划仍在（含已完成态）', persisted?.exName === '晨跑' && persisted?.exDone === true, JSON.stringify(persisted))
  check('S5 刷新后饮食计划仍在', persisted?.dtName === '燕麦+鸡蛋' && persisted?.dtKcal === 380, JSON.stringify(persisted?.dtName))

  check('无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
