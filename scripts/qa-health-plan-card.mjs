/**
 * QA：健康管理「跟练方案卡（运动）/ 食谱方案卡（饮食）」
 *
 * 断言：
 *  S1 运动面板：方案卡位置（目标卡之后、周计划板之前）、七天条、训练日/休息日区分
 *  S2 动作清单：默认日动作数、组数格子总数、勾选后进度与 store 落库
 *  S3 持久化：刷新页面后勾选仍在
 *  S4 休息日：切到周二只显示休息提示，不出动作行
 *  S5 套用到本周：周计划早晨行 4 个训练日 + 3 个休息日，按钮转禁用态
 *  S6 饮食面板：方案卡存在、默认增肌 4 周 + 5 餐
 *  S7 记入记录：弹框预填餐次与内容，且**不写入假热量**
 *  S8 减脂方案：30 天表 10 行、段切换、OCR 可信度提示如实显示
 *  S9 响应式：1280 / 390 无横向溢出
 *  S10 全过程无页面级 JS 异常
 *
 * 用法：node scripts/qa-health-plan-card.mjs
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
  for (let p = 16718; p <= 16728; p++) if (await isViteDevAt(p)) return 'http://localhost:' + p
  for (let p = 16718; p <= 16728; p++) {
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

/** 定位元素相对视口顶部的偏移，用于判断卡片前后顺序 */
async function topOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null
  }, selector)
}

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-health"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }
  await page.click('[data-testid="wb-menu-health"]')
  await page.waitForSelector('[data-testid="ex-plan-card"]', { timeout: 60000 })

  // ================= S1 方案卡位置与一周条 =================
  const cardTop = await topOf(page, '[data-testid="ex-plan-card"]')
  const statTop = await topOf(page, '.wb-exercise .stat-card')
  const boardTop = await topOf(page, '[data-testid="ex-plan-board"]')
  check('S1-1 方案卡排在目标卡之后', cardTop !== null && statTop !== null && cardTop > statTop, `card=${cardTop} stat=${statTop}`)
  check('S1-2 方案卡排在周计划板之前', boardTop !== null && cardTop < boardTop, `card=${cardTop} board=${boardTop}`)

  const dayChips = await page.locator('[data-testid="ex-plan-strip"] button').count()
  check('S1-3 一周条 7 天', dayChips === 7, `n=${dayChips}`)
  const restCount = await page.locator('[data-testid="ex-plan-strip"] button.is-rest').count()
  check('S1-4 3 个休息日（周二/四/六）', restCount === 3, `rest=${restCount}`)
  const day2Rest = await page.locator('[data-testid="ex-plan-day-2"].is-rest').count()
  check('S1-5 周二标记为休息日', day2Rest === 1)
  const weekGroups = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('[data-testid="ex-plan-strip"] button')].map(b => b.innerText.replace(/\s+/g, ' ').trim())
    return labels
  })
  check('S1-6 训练日显示动作数而非「0 个动作」', !weekGroups.some(t => t.includes('0 个动作')), weekGroups.join(' | '))

  // ================= S2 动作清单与勾选 =================
  // 默认展开「今天」；若是休息日则先点周一
  if ((await page.locator('[data-testid="ex-plan-rest"]').count()) > 0) {
    await page.click('[data-testid="ex-plan-day-1"]')
    await page.waitForTimeout(200)
  }
  const moveRows = await page.locator('[data-testid="ex-plan-detail"] .xp-move').count()
  const pips = await page.locator('[data-testid="ex-plan-detail"] .xp-pip').count()
  check('S2-1 训练日动作行渲染', moveRows >= 4, `rows=${moveRows}`)
  check('S2-2 组数格子总数 = 该日总组数', pips === 11 || pips === 9 || pips === 8, `pips=${pips}`)

  await page.click('[data-testid="ex-plan-pip-0-0"]')
  await page.click('[data-testid="ex-plan-pip-0-1"]')
  await page.click('[data-testid="ex-plan-pip-1-0"]')
  await page.waitForTimeout(400)
  const progText = (await page.locator('[data-testid="ex-plan-progress"]').innerText()).replace(/\s+/g, '')
  check('S2-3 勾选 3 组后进度显示 3/x', progText.includes('3/'), progText)
  const stored = await page.evaluate(async () => {
    const m = await import('/src/stores/workbenchHealth.ts')
    const s = m.useWorkbenchHealthStore()
    const map = s.planProgress ?? {}
    const dates = Object.keys(map)
    return { dates: dates.length, count: dates.length ? map[dates[0]].length : 0 }
  })
  check('S2-4 store 落库 planProgress', stored.dates >= 1 && stored.count === 3, JSON.stringify(stored))

  // ================= S3 刷新后持久化 =================
  await page.reload({ waitUntil: 'commit' })
  await page.waitForSelector('[data-testid="ex-plan-card"]', { timeout: 60000 })
  if ((await page.locator('[data-testid="ex-plan-rest"]').count()) > 0) {
    await page.click('[data-testid="ex-plan-day-1"]')
    await page.waitForTimeout(200)
  }
  const progAfterReload = (await page.locator('[data-testid="ex-plan-progress"]').innerText()).replace(/\s+/g, '')
  check('S3-1 刷新后勾选进度保留', progAfterReload.includes('3/'), progAfterReload)

  // ================= S4 休息日 =================
  await page.click('[data-testid="ex-plan-day-2"]')
  await page.waitForTimeout(250)
  const restHint = await page.locator('[data-testid="ex-plan-rest"]').count()
  const restMoves = await page.locator('[data-testid="ex-plan-detail"] .xp-move').count()
  const nextBtn = await page.locator('[data-testid="ex-plan-next"]').count()
  check('S4-1 休息日显示休息提示', restHint === 1)
  check('S4-2 休息日不出动作行', restMoves === 0, `rows=${restMoves}`)
  check('S4-3 休息日提供「去看下一个训练日」跳板', nextBtn === 1)
  if (nextBtn === 1) {
    await page.click('[data-testid="ex-plan-next"]')
    await page.waitForTimeout(250)
    const jumped = await page.locator('[data-testid="ex-plan-detail"] .xp-move').count()
    check('S4-4 跳板能切到训练日并显示动作', jumped > 0, `rows=${jumped}`)
  }

  // ================= S5 套用到本周 =================
  await page.click('[data-testid="ex-plan-apply"]')
  await page.waitForTimeout(900)
  const boardCells = await page.evaluate(() => {
    const pick = (day) => {
      const el = document.querySelector(`[data-testid="wp-cell-morning-${day}"]`)
      return el ? el.innerText.replace(/\s+/g, '') : ''
    }
    return {
      mon: pick(1), tue: pick(2), wed: pick(3), thu: pick(4), fri: pick(5), sat: pick(6), sun: pick(7),
      eveningMon: (document.querySelector('[data-testid="wp-cell-evening-1"]')?.innerText || '').replace(/\s+/g, ''),
      eveningWed: (document.querySelector('[data-testid="wp-cell-evening-3"]')?.innerText || '').replace(/\s+/g, '')
    }
  })
  const trainFilled = [boardCells.mon, boardCells.wed, boardCells.fri, boardCells.sun].every(t => t.includes('5项') || t.includes('4项') || t.includes('组'))
  const restFilled = [boardCells.tue, boardCells.thu, boardCells.sat].every(t => t.includes('休息'))
  check('S5-1 四个训练日写进早晨行', trainFilled, JSON.stringify(boardCells))
  check('S5-2 三个休息日写成「休息」', restFilled)
  check('S5-3 周一傍晚写入拉伸', boardCells.eveningMon.includes('拉伸'), boardCells.eveningMon)
  check('S5-4 周三（减负）不硬套拉伸时长', !boardCells.eveningWed.includes('拉伸'), boardCells.eveningWed)
  const applyBtn = page.locator('[data-testid="ex-plan-apply"]')
  const applyText = (await applyBtn.innerText()).replace(/\s+/g, '')
  const applyDisabled = await applyBtn.isDisabled()
  check('S5-5 套用后按钮转禁用态', applyText.includes('已套用') && applyDisabled, `${applyText} disabled=${applyDisabled}`)

  // ================= S6 饮食方案卡 =================
  await page.click('[data-testid="hd-tab-diet"]')
  await page.waitForSelector('[data-testid="dt-plan-card"]', { timeout: 60000 })
  const dietCardTop = await topOf(page, '[data-testid="dt-plan-card"]')
  const dietStatTop = await topOf(page, '.wb-diet .stat-card')
  check('S6-1 饮食方案卡排在目标卡之后', dietCardTop > dietStatTop, `card=${dietCardTop} stat=${dietStatTop}`)

  const weekBtns = await page.locator('[data-testid="dt-plan-weeks"] button').count()
  const mealCards = await page.locator('[data-testid="dt-plan-meals"] article').count()
  check('S6-2 增肌方案 4 周切换', weekBtns === 4, `n=${weekBtns}`)
  check('S6-3 每周 5 餐', mealCards === 5, `n=${mealCards}`)

  await page.click('[data-testid="dt-plan-week-2"]')
  await page.waitForTimeout(200)
  const goalText = await page.locator('[data-testid="dt-plan-goal"]').innerText()
  check('S6-4 切到 W2 显示提升期目标', goalText.includes('提升期') || goalText.includes('W2'), goalText.replace(/\s+/g, ' '))

  // ================= S7 记入记录（不写假热量） =================
  await page.click('[data-testid="dt-plan-log-breakfast"]')
  await page.waitForSelector('[data-testid="dt-form-content"]', { timeout: 15000 })
  const filledContent = await page.locator('[data-testid="dt-form-content"] input, input[data-testid="dt-form-content"]').first().inputValue()
  // el-input-number 的 data-testid 落在外层 wrapper 上，不是原生 input
  const filledCal = await page.locator('[data-testid="dt-form-calories"] input, input[data-testid="dt-form-calories"]').first().inputValue()
  check('S7-1 记入预填餐次内容', filledContent.includes('燕麦') || filledContent.includes('全麦'), filledContent.slice(0, 40))
  check('S7-2 热量不被编造（保持 0 由用户填）', filledCal === '0', `cal=${filledCal}`)
  await page.click('[data-testid="dt-cancel-record"]')
  await page.waitForTimeout(300)

  // ================= S8 减脂方案 30 天表 =================
  await page.click('[data-testid="dt-plan-switch-loss-30d"]')
  await page.waitForTimeout(400)
  const rows30 = await page.locator('[data-testid="dt-plan-30d"] tbody tr').count()
  check('S8-1 30 天表按段渲染 10 行', rows30 === 10, `rows=${rows30}`)
  const firstDayText = (await page.locator('[data-testid="dt-plan-30d"] tbody tr').first().innerText()).replace(/\s+/g, ' ')
  check('S8-2 首行是第 1 天', firstDayText.includes('第 1 天'), firstDayText)
  await page.click('[data-testid="dt-plan-stage-2"]')
  await page.waitForTimeout(300)
  const firstDay3 = (await page.locator('[data-testid="dt-plan-30d"] tbody tr').first().innerText()).replace(/\s+/g, ' ')
  check('S8-3 切第 3 段首行变第 21 天', firstDay3.includes('第 21 天'), firstDay3)
  const trustNote = await page.locator('[data-testid="dt-plan-trust-note"]').innerText()
  check('S8-4 OCR 可信度如实提示', trustNote.includes('OCR') && (trustNote.includes('错位') || trustNote.includes('核对')), trustNote.replace(/\s+/g, ' ').slice(0, 60))

  // ================= S9 响应式 =================
  const overflowDesktop = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check('S9-1 桌面无横向溢出', overflowDesktop <= 0, `overflow=${overflowDesktop}`)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  const overflowMobileDiet = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  await page.click('[data-testid="hd-tab-exercise"]')
  await page.waitForTimeout(400)
  const overflowMobileEx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check('S9-2 窄屏无横向溢出（饮食/运动）', overflowMobileDiet <= 0 && overflowMobileEx <= 0, `diet=${overflowMobileDiet} ex=${overflowMobileEx}`)

  // ================= S10 无异常 =================
  check('S10 全过程无页面级 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '))
} finally {
  await browser.close()
  if (startedByUs && server) server.kill()
}

const failed = results.filter(r => !r.ok)
console.log(`\n[qa] ${results.length - failed.length}/${results.length} passed`)
if (failed.length > 0) {
  console.log('失败项：')
  for (const f of failed) console.log('  - ' + f.name)
  process.exitCode = 1
}
