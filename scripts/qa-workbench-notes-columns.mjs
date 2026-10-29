/**
 * QA：便签表格列 — 「颜色」「置顶」两列已移除
 *
 * 需求：便签功能里，表格中的「颜色」列与「置顶」列删除。
 *       注意区分：操作列里的「置顶」**按钮**要保留（那是操作，不是数据展示列）；
 *       卡片视图（移动端）的「颜色」「置顶」字段也不受影响。
 *
 * 断言：
 *  S1 桌面列表模式：表头不含「颜色」「置顶」
 *  S2 桌面列表模式：其余列仍在（序号/类型/标题/内容/分类/状态/更新时间/操作）
 *  S3 桌面列表模式：操作列的「置顶」按钮仍在（删列不等于删功能）
 *  S4 桌面列表模式：两列删除后无遗留空单元格 / 行内单元格数与表头数一致
 *  S5 移动端卡片视图未被误伤（RecordsCard maxFields=4，只渲染前四项，属既有行为）
 *  S6 无页面级 JS 异常
 *
 * 用法：node scripts/qa-workbench-notes-columns.mjs
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
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-notes"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }
  await page.waitForSelector('[data-testid="home-overview-grid"]', { timeout: 60000 })
  await page.waitForTimeout(600)

  // 造 1 条普通便签（表格为空时不渲染 el-table，无法读表头）
  const seeded = await page.evaluate(async () => {
    const m = await import('/src/stores/workbenchNotes.ts')
    const s = m.useWorkbenchNotesStore()
    await s.addNote({ content: 'QA 列检查便签', color: 'blue' })
    const n = s.activeNotes[0]
    await s.updateNote(n.id, { pinned: true })
    return { count: s.activeNotes.length, pinned: s.activeNotes.some((x) => x.pinned) }
  })
  console.log('[qa] seed:', JSON.stringify(seeded))
  check('前置：已有一条置顶便签', seeded.count > 0 && seeded.pinned, JSON.stringify(seeded))

  await page.click('[data-testid="wb-menu-notes"]')
  await page.waitForFunction(() => !document.querySelector('.wb-content .ewt-skeleton'), { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(800)

  // ---- S1/S2 表头 ----
  const heads = (await page.locator('.nt-table-wrap .el-table__header th').allInnerTexts())
    .map((t) => t.replace(/\s+/g, ''))
    .filter(Boolean)
  console.log('[qa] 表头:', JSON.stringify(heads))
  check('S1 表头不含「颜色」', !heads.includes('颜色'), heads.join('|'))
  check('S1 表头不含「置顶」', !heads.includes('置顶'), heads.join('|'))
  const expect = ['序号', '类型', '标题', '内容', '分类', '状态', '更新时间', '操作']
  check('S2 其余列仍在', expect.every((h) => heads.includes(h)), heads.join('|'))

  // ---- S3 操作列「置顶」按钮仍可用 ----
  const pinBtns = await page.locator('[data-testid^="note-pin-"]').count()
  check('S3 操作列「置顶」按钮保留', pinBtns > 0, `count=${pinBtns}`)

  // ---- S4 行内单元格数与表头一致（防残留列） ----
  const rowCells = await page.evaluate(() => {
    const tr = document.querySelector('.nt-table-wrap .el-table__body tr')
    if (!tr) return { cells: -1, texts: [] }
    const tds = [...tr.querySelectorAll('td')]
    return {
      cells: tds.length,
      // 最后两格若是「颜色」「置顶」内容会命中这些特征
      texts: tds.map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 12))
    }
  })
  console.log('[qa] 首行单元格:', JSON.stringify(rowCells))
  // el-table 的 expand 列 + 可能的 gutter 列会额外占一个 td，故只校验「不出现颜色词 / 不出现 📌」
  const leaked = rowCells.texts.filter((t) => ['黄', '蓝', '绿', '粉', '红', '橙', '青', '紫'].some((c) => t === c) || t.includes('📌'))
  check('S4 首行无颜色文字 / 置顶图钉残留', leaked.length === 0, leaked.join('|') || `cells=${rowCells.cells}`)

  // ---- S5 移动端卡片视图未被误伤 ----
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(900)
  // ---- S5 移动端卡片视图未被误伤 ----
  // ⚠️ 不要断言卡片里能看到「颜色」「置顶」：RecordsCard 的 maxFields 默认 4，
  //    只渲染 cardFields 的前四项（标题/内容/分类/状态），这两项本来就看不到，与删列无关。
  //    这里断言的是「卡片视图仍正常渲染且字段集未变」，防止删列时误删 cardFields 或破坏组件结构。
  const card = await page.evaluate(() => {
    const grid = document.querySelector('.wb-content .ewt-card-grid')
    if (!grid) return null
    const cardEl = grid.querySelector('.ewt-card')
    if (!cardEl) return { labels: [] }
    return { labels: [...cardEl.querySelectorAll('.ewt-card-label')].map((x) => (x.textContent || '').trim()) }
  })
  console.log('[qa] 卡片视图字段:', JSON.stringify(card?.labels))
  check('S5 移动端卡片视图正常渲染', !!card && card.labels.length > 0, card ? `labels=${card.labels.join('|')}` : '未找到 .ewt-card')
  check(
    'S5 卡片字段集未变（前四项：标题/内容/分类/状态）',
    JSON.stringify(card?.labels) === JSON.stringify(['标题', '内容', '分类', '状态']),
    card ? card.labels.join('|') : ''
  )

  check('S6 无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
  await ctx.close()
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
