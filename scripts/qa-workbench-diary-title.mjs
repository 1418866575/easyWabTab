/**
 * QA：日记「标题」字段
 *
 * 需求：内容编辑区上方新增标题输入框；列表把标题作为第一列，其余信息在后。
 *
 * 断言：
 *  S1 标题输入框存在，且位于正文编辑区上方（几何位置比较）
 *  S2 填标题+正文保存 → store 里该日期条目 title / content 均正确
 *  S3 列表表头：第一列「标题」、第二列「内容」，原有列（日期/分类/心情/字数/置顶/操作）仍在
 *  S4 列表首行标题单元格显示的就是刚才输入的标题（输入框与列表字段一致）
 *  S5 刷新后标题仍在（落库 + 回填输入框）
 *  S6 没有标题的条目在列表里显示「（无标题）」
 *
 * 用法：node scripts/qa-workbench-diary-title.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TITLE = 'QA标题-晨间随笔'
const CONTENT = '今天写了一段测试正文，用来验证标题字段链路。'

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

  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-diary"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }
  await page.click('[data-testid="wb-menu-diary"]')
  await page.waitForSelector('[data-testid="dj-title-input"]', { timeout: 60000 })

  // ---- S1 位置：标题框在正文编辑区上方 ----
  const titleBox = await page.locator('[data-testid="dj-title-input"]').boundingBox()
  const contentBox = await page.locator('[data-testid="dj-content-input"]').boundingBox()
  check('S1 标题输入框存在', !!titleBox)
  check(
    'S1 标题框位于正文编辑区上方',
    !!titleBox && !!contentBox && titleBox.y + titleBox.height <= contentBox.y,
    `titleBottom=${Math.round((titleBox?.y ?? 0) + (titleBox?.height ?? 0))} contentTop=${Math.round(contentBox?.y ?? 0)}`
  )

  // ---- S2 保存 ----
  await page.locator('[data-testid="dj-title-input"]').fill(TITLE)
  await page.locator('[data-testid="dj-content-input"]').fill(CONTENT)
  await page.waitForTimeout(200)
  await page.click('[data-testid="dj-save-btn"]')
  await page.waitForTimeout(900)

  const saved = await page.evaluate(async () => {
    const m = await import('/src/stores/workbenchDiary.ts')
    const s = m.useWorkbenchDiaryStore()
    const today = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const key = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const e = s.entries.find((x) => x.date === key)
    return e ? { title: e.title || '', content: e.content } : null
  })
  console.log('[qa] 落库:', JSON.stringify(saved))
  check('S2 条目已保存', !!saved)
  check('S2 标题已写入', saved?.title === TITLE, String(saved?.title))
  check('S2 正文已写入', saved?.content === CONTENT, String(saved?.content).slice(0, 20))

  // ---- S3 表头顺序 ----
  const heads = (await page.locator('[data-testid="dj-table"] .el-table__header th').allInnerTexts())
    .map((t) => t.replace(/\s+/g, ''))
    .filter(Boolean)
  console.log('[qa] 表头:', JSON.stringify(heads))
  check('S3 第一列为「标题」', heads[0] === '标题', heads[0] || '(空)')
  check('S3 第二列为「内容」', heads[1] === '内容', heads[1] || '(空)')
  check(
    'S3 原有列仍在（日期/分类/心情/字数/置顶/操作）',
    ['日期', '分类', '心情', '字数', '置顶', '操作'].every((h) => heads.includes(h)),
    heads.join('|')
  )

  // ---- S4 首行标题与输入一致 ----
  const firstRowTitle = (await page.locator('[data-testid="dj-table"] .el-table__body tr').first().locator('td').first().innerText()).trim()
  check('S4 列表首行标题与输入框一致', firstRowTitle === TITLE, firstRowTitle)
  if (process.env.SHOT) await page.screenshot({ path: 'd:/tmp/diary-title.png', fullPage: true })

  // ---- S5 刷新后仍在 ----
  await page.reload({ waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-diary"]', { timeout: 120000 })
  await page.click('[data-testid="wb-menu-diary"]')
  await page.waitForSelector('[data-testid="dj-title-input"]', { timeout: 60000 })
  await page.waitForTimeout(900)
  const rowAfter = (await page.locator('[data-testid="dj-table"] .el-table__body tr').first().locator('td').first().innerText()).trim()
  check('S5 刷新后列表仍显示标题', rowAfter === TITLE, rowAfter)

  const autoTitle = await page.locator('[data-testid="dj-title-input"]').inputValue()
  check('S5 刷新后标题自动回填（今天已有日记）', autoTitle === TITLE, autoTitle)

  // 同一行再点一次也要能重新载入（此前 selectDate 同日期早退 → 点不动）
  await page.locator('[data-testid="dj-table"] .el-table__body tr').first().click()
  await page.waitForTimeout(700)
  const inputAfter = await page.locator('[data-testid="dj-title-input"]').inputValue()
  const contentAfter = await page.locator('[data-testid="dj-content-input"]').inputValue()
  check('S5 点开条目后标题回填输入框', inputAfter === TITLE, inputAfter)
  check('S5 点开条目后正文回填', contentAfter === CONTENT, contentAfter.slice(0, 20))

  // ---- S6 无标题兜底 ----
  await page.evaluate(async () => {
    const m = await import('/src/stores/workbenchDiary.ts')
    const s = m.useWorkbenchDiaryStore()
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const pad = (n) => String(n).padStart(2, '0')
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    await s.upsertEntry(key, '昨天没写标题的一篇', {})
  })
  await page.waitForTimeout(800)
  const bodyText = await page.locator('[data-testid="dj-table"] .el-table__body').innerText()
  check('S6 无标题条目显示「（无标题）」', bodyText.includes('（无标题）'), bodyText.replace(/\s+/g, ' ').slice(0, 80))

  check('无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
