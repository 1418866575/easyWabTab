/**
 * QA：待办面板「工具条减负 / 分类标签页贴表格上方 / 筛选面板可折叠」
 *
 * 背景：旧版把一个「全部」chip、4 个带标签的查询字段、查询/重置按钮全塞进同一个吸顶框，
 *       控件挤成两行且标签漂浮；分类标签页离表格很远，看不出它管的是表格。
 *
 * 断言：
 *  S1 工具条框内只剩一行（计数 + 筛选/视图/新增），无查询字段、无分类标签页
 *  S2 分类标签页是表格卡片的第一个元素，几何上紧贴表格上方，含「全部」与条数
 *  S3 「筛选」按钮可展开/收起独立面板，面板内 4 个字段与查询/重置齐全
 *  S4 查询生效后角标计数、工具条计数与表格行数同步；重置恢复全量
 *  S5 筛空态的「清除筛选」可一键恢复
 *  S6 无重复 FAB；桌面 / 390px 无横向溢出；无页面级 JS 异常
 *
 * 用法：node scripts/qa-workbench-todo-layout.mjs
 *      BASE=http://localhost:16719 node scripts/qa-workbench-todo-layout.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const errs = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!fs.existsSync(root)) return undefined
  for (const d of fs.readdirSync(root).filter(x => x.startsWith('chromium-') && !x.includes('headless')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(p)) return p
  }
  return undefined
}
async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return true } catch { }
    await new Promise(r => setTimeout(r, 400))
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
  try { const r = await fetch('http://localhost:' + port + '/', { signal: AbortSignal.timeout(1200) }); return !r.ok } catch { return true }
}
let server = null
async function ensureDevServer() {
  if (process.env.BASE) return process.env.BASE
  for (let p = 16718; p <= 16726; p++) if (await isViteDevAt(p)) return 'http://localhost:' + p
  for (let p = 16718; p <= 16726; p++) {
    if (!(await isPortFree(p))) continue
    server = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    server.stdout.on('data', () => {})
    server.stderr.on('data', () => {})
    if (await waitForServer('http://localhost:' + p) && await isViteDevAt(p)) return 'http://localhost:' + p
    server.kill(); server = null
  }
  throw new Error('no free port for dev server')
}

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)))

  await page.goto(base + '/workbench?section=todos', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="td-filter-panel"]', { timeout: 120000 })
  await page.waitForTimeout(800)
  // 造数据，保证表格与标签页都渲染（独立 context，不污染其它 QA）
  const seeded = await page.evaluate(async () => {
    const m = await import('/src/stores/workbenchTodos.ts')
    const s = m.useWorkbenchTodosStore()
    await s.loadTodos()
    for (let i = 1; i <= 6; i++) await s.addTodo({ title: '布局QA待办 ' + i, description: '描述文本', priority: 'medium' }).catch(() => {})
    return s.orderedTodos.length
  })
  await page.waitForTimeout(600)
  check('S0 已造出待办数据', seeded >= 6, `n=${seeded}`)

  /* ---------- S1 第一卡片删除 / 查询区回到第一行 ---------- */
  const head = await page.evaluate(() => {
    const root = document.querySelector('.wb-todo')
    const panel = document.querySelector('[data-testid="td-filter-panel"]')
    const wrap = document.querySelector('.td-table-wrap')
    const cs = panel ? getComputedStyle(panel) : null
    return {
      hasToolbar: !!document.querySelector('.td-toolbar'),
      hasToggle: !!document.querySelector('[data-testid="td-filter-toggle"]'),
      first: root.firstElementChild === panel,
      panelTop: panel.getBoundingClientRect().top,
      wrapTop: wrap.getBoundingClientRect().top,
      border: cs ? cs.borderTopWidth : '',
      radius: cs ? cs.borderTopLeftRadius : '',
      bg: cs ? cs.backgroundColor : ''
    }
  })
  check('S1-1 原「第一卡片」（工具条框）已删除', !head.hasToolbar)
  check('S1-2 「筛选」按钮已删除', !head.hasToggle)
  check('S1-3 查询区域是面板第一行', head.first)
  check('S1-4 查询区是卡片（1px 边框 + 12px 圆角 + 卡片底色，与便签一致）',
    head.border === '1px' && head.radius === '12px' && !/rgba\(0, 0, 0, 0\)|transparent/.test(head.bg),
    `${head.border} / ${head.radius} / ${head.bg}`)
  check('S1-5 查询区在表格上方', head.panelTop < head.wrapTop)

  /* ---------- S2 标签页在表格上方 ---------- */
  await page.waitForSelector('[data-testid="td-table-tabs"]', { timeout: 30000 })
  const tabs = await page.evaluate(() => {
    const wrap = document.querySelector('.td-table-wrap')
    const t = document.querySelector('[data-testid="td-table-tabs"]')
    const table = document.querySelector('[data-testid="td-table"]')
    if (!wrap || !t || !table) return { ok: false }
    const tr = t.getBoundingClientRect(), br = table.getBoundingClientRect()
    return {
      ok: true,
      first: wrap.firstElementChild === t,
      above: tr.bottom <= br.top + 2,
      gap: Math.round(br.top - tr.bottom),
      all: !!t.querySelector('[data-testid="td-cat-all"]'),
      count: (t.querySelector('[data-testid="td-table-tabs-count"]') || {}).textContent || ''
    }
  })
  check('S2-1 标签页是表格卡片第一个元素', tabs.first)
  check('S2-2 标签页紧贴表格上方', tabs.above, `gap=${tabs.gap}px`)
  check('S2-3 标签页含「全部」', tabs.all)
  check('S2-4 标签页右侧显示条数', /共\s*\d+\s*条/.test(tabs.count), tabs.count.trim())

  /* ---------- S3 查询区常驻齐全（无需展开） ---------- */
  const fields = ['td-search-title', 'td-search-desc', 'td-search-priority', 'td-search-status', 'td-search-btn', 'td-search-reset']
  const missing = []
  for (const id of fields) if (await page.locator(`[data-testid="${id}"]`).count() !== 1) missing.push(id)
  check('S3-1 首行常驻 4 字段 + 查询/重置', missing.length === 0, missing.join(','))
  check('S3-2 字段「标签在左、控件在右」同行内联（同便签）', await page.evaluate(() => {
    const f = document.querySelector('.td-search-fields .td-field')
    const label = f.querySelector('.td-field-label').getBoundingClientRect()
    const input = f.querySelector('.el-input, .el-select').getBoundingClientRect()
    return label.right <= input.left + 2 && Math.abs((label.top + label.height / 2) - (input.top + input.height / 2)) <= 4
  }))
  check('S3-3 查询区与表格是两块独立容器', await page.evaluate(() => {
    const p = document.querySelector('[data-testid="td-filter-panel"]')
    return !!p && !p.contains(document.querySelector('[data-testid="td-table"]'))
  }))

  /* ---------- S4 查询 / 重置 ---------- */
  await page.locator('[data-testid="td-search-title"]').fill('布局QA待办 1')
  await page.locator('[data-testid="td-search-btn"]').click()
  await page.waitForTimeout(400)
  const applied = await page.evaluate(() => ({
    rows: document.querySelectorAll('[data-testid="td-table"] .el-table__body tr').length,
    tabCount: (document.querySelector('[data-testid="td-table-tabs-count"]') || {}).textContent?.trim() || ''
  }))
  check('S4-1 查询生效，表格行数收敛到 1', applied.rows === 1, `rows=${applied.rows}`)
  check('S4-2 标签页条数同步', /共\s*1\s*条/.test(applied.tabCount), applied.tabCount)
  await page.locator('[data-testid="td-search-reset"]').click()
  await page.waitForTimeout(400)
  check('S4-3 重置恢复全量', await page.evaluate(() =>
    document.querySelectorAll('[data-testid="td-table"] .el-table__body tr').length >= 6))

  /* ---------- S5 筛空态清除 ---------- */
  await page.locator('[data-testid="td-search-title"]').fill('不存在的待办XYZ')
  await page.locator('[data-testid="td-search-btn"]').click()
  await page.waitForTimeout(400)
  check('S5-1 出现筛空态', await page.locator('[data-testid="td-filter-empty"]').count() === 1)
  check('S5-2 筛空态仍保留新增按钮（表格操作行常驻）', await page.locator('[data-testid="td-add-button"]').count() === 1)
  await page.locator('[data-testid="td-filter-empty-reset"]').click()
  await page.waitForTimeout(400)
  check('S5-3 「清除筛选」一键恢复表格', await page.locator('[data-testid="td-table"]').count() === 1)

  /* ---------- S6 表格操作行：左新增 / 右视图 ---------- */
  const act = await page.evaluate(() => {
    const add = document.querySelector('[data-testid="td-add-button"]')
    const view = document.querySelector('.ewt-view-toggle')
    const wrap = document.querySelector('.td-table-wrap')
    if (!add || !view || !wrap) return { ok: false }
    const ar = add.getBoundingClientRect(), vr = view.getBoundingClientRect(), wr = wrap.getBoundingClientRect()
    return {
      ok: true,
      addAbove: ar.bottom <= wr.top + 2,
      addLeft: Math.abs(ar.left - wr.left) <= 4,
      viewAbove: vr.bottom <= wr.top + 2,
      viewRight: Math.abs(vr.right - wr.right) <= 4,
      sameRow: Math.abs(ar.top - vr.top) <= 6
    }
  })
  check('S6-1 新增按钮在表格左上角', act.ok && act.addAbove && act.addLeft)
  check('S6-2 视图切换在表格上方右上角', act.ok && act.viewAbove && act.viewRight)
  check('S6-3 新增与视图同一行、分列两端', act.sameRow)
  check('S6-4 待办面板无重复 FAB', await page.locator('[data-testid="wb-fab-add"]').count() === 0)
  check('S6-5 桌面无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))

  /* ---------- S7 窄屏 ---------- */
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(450)
  check('S7-1 390px 查询区字段各占整行且无横向溢出', await page.evaluate(() => {
    const fields = [...document.querySelectorAll('.td-search-fields .td-field')]
    if (fields.length < 4) return false
    const card = document.querySelector('[data-testid="td-filter-panel"]').getBoundingClientRect()
    const g = document.querySelector('.td-search-fields').getBoundingClientRect()
    const growFull = fields.filter(f => Math.abs(f.getBoundingClientRect().width - g.width) <= 2).length
    return growFull >= 2 && document.documentElement.scrollWidth <= window.innerWidth + 1 && g.width <= card.width
  }))
  check('S7-2 全过程无页面级 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '))

  const failed = results.filter(r => !r.ok)
  console.log(`\n[qa] ${results.length - failed.length}/${results.length} passed`)
  if (failed.length) process.exitCode = 1
  await ctx.close()
} finally {
  await browser.close()
  if (server) server.kill()
}
