/**
 * QA：销售台「库存」（进货记录按天分组表格）
 *
 * 背景：库存表用 el-table 原生 tree 表达「一天一个父行 + 同日明细子行」。
 * 父行只带 id/date/dayTotal/dayCount/children，没有 productId/unitPrice/total，
 * 明细列若不加行类型判断就会 formatYuanOf(undefined) → TypeError → 整页 patch 中断
 * （表现为后续面板出现残留 DOM，报错栈还指向下一次渲染，极难定位）。
 *
 * 断言：
 *  S1 面板渲染零 pageerror（核心回归点）
 *  S2 组行数 = 有进货的天数，明细行数 = 进货笔数（默认展开）
 *  S3 组行只显示「日期 + N 笔 + 当天合计」，商品/分类/进价/合计等明细列为空
 *  S4 全表不出现「（已删除商品）」「未分类」「undefined」「NaN」等父行兜底文本
 *  S5 明细行商品名/分类/进价/合计/售价取值正确
 *  S6 序号列为页内连续 1..N（父行不占号）
 *  S7 组行不出现编辑/复制/删除按钮（父行 id 是 day-xxx，误点会写坏数据）
 *  S8 移动端切卡片视图：一天一卡
 *
 * 用法：node scripts/qa-biz-purchases-tree.mjs
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
let server = null
async function ensureDevServer() {
  for (let p = 16718; p <= 16726; p++) if (await isViteDevAt(p)) return 'http://localhost:' + p
  for (let p = 16718; p <= 16726; p++) {
    if (!(await isPortFree(p))) continue
    server = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
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

/** 表格行快照：每行取各单元格文本 + 是否组行 + 是否有操作按钮 */
const READ_ROWS = () => {
  const table = document.querySelector('[data-testid="bizpur-table"]')
  if (!table) return null
  return [...table.querySelectorAll('.el-table__body tr.el-table__row')].map((tr) => {
    const tds = [...tr.querySelectorAll('td')]
    return {
      group: !!tr.querySelector('.bizpur-day-cell'),
      level: tr.className.includes('level-1') ? 1 : 0,
      cells: tds.map((td) => (td.innerText || '').trim()),
      hasActions: !!tr.querySelector('.bizpur-actions'),
      hasTotalText: !!tr.querySelector('.bizpur-total-text')
    }
  })
}

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.stack || e.message).split('\n').slice(0, 3).join(' | ')))

  await page.goto(base + '/business', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="bs-content"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }
  await page.waitForTimeout(1000)
  if (await page.locator('[data-testid="bs-gate-submit"]').count()) {
    await page.click('[data-testid="bs-gate-submit"]')
    await page.waitForTimeout(1500)
  }

  // 造数：2 天 / 3 笔，其中一天 2 笔（验证同日分组与页内连续序号）
  const seeded = await page.evaluate(async () => {
    const dayStr = (offset) => {
      const d = new Date()
      d.setDate(d.getDate() + offset)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const m = await import('/src/stores/workbenchBusiness.ts')
    const s = m.useWorkbenchBusinessStore()
    await s.loadBusiness()
    if (!s.hasLedgers) s.createLedger(new Date().getFullYear())
    const catId = s.productCategories[0]?.id
    const names = [['QA苹果', '斤', 3.2, 5.5], ['QA草莓', '盒', 8, 15]]
    for (const [name, unit, purchasePrice, sellingPrice] of names) {
      await s.addProduct({ name, categoryId: catId, unit, purchasePrice, sellingPrice })
    }
    const ps = s.products.filter((p) => p.name.startsWith('QA'))
    const d1 = dayStr(-1)
    const d2 = dayStr(-2)
    await s.addPurchase({ productId: ps[0].id, quantity: 60, unitPrice: 3.2, date: d1, note: 'QA早市' })
    await s.addPurchase({ productId: ps[1].id, quantity: 30, unitPrice: 8, date: d1 })
    await s.addPurchase({ productId: ps[0].id, quantity: 20, unitPrice: 3.2, date: d2 })
    return { d1, d2, products: ps.length, purchases: s.purchases.length }
  })
  console.log('[qa] seed:', JSON.stringify(seeded))

  await page.waitForTimeout(600)
  await page.click('[data-testid="bs-menu-purchases"]')
  await page.waitForSelector('[data-testid="bizpur-table"]', { timeout: 30000 })
  await page.waitForTimeout(1200)

  // S1 零 pageerror
  check('S1 面板渲染零 pageerror', errs.length === 0, errs.length ? errs[0] : '')

  const rows = await page.evaluate(READ_ROWS)
  const groups = rows.filter((r) => r.group)
  const details = rows.filter((r) => !r.group)

  // S2 分组结构
  check('S2 组行 = 2 天', groups.length === 2, `实际 ${groups.length}`)
  check('S2 明细行 = 3 笔', details.length === 3, `实际 ${details.length}`)

  // S3 组行只显示日期/笔数/合计
  // 列序：0序号 1日期 2商品 3分类 4入库数量 5进价 6合计 7售价 8加价率 9剩余状态 10备注 11操作
  const groupDetailCells = groups.flatMap((g) => [g.cells[2], g.cells[3], g.cells[4], g.cells[5], g.cells[7], g.cells[8], g.cells[9], g.cells[10]]).filter(Boolean)
  check('S3 组行明细列全空', groupDetailCells.length === 0, groupDetailCells.join('|'))
  check('S3 组行日期列含「笔」与合计', groups.every((g) => g.cells[1].includes('笔') && /\d+\.\d{2}/.test(g.cells[1])), groups.map((g) => g.cells[1]).join(' | '))

  // S4 无兜底文本
  const flat = rows.flatMap((r) => r.cells).join(' ')
  const bad = ['（已删除商品）', '未分类', 'undefined', 'NaN'].filter((t) => flat.includes(t))
  check('S4 无兜底/异常文本', bad.length === 0, bad.join(','))

  // S5 明细行取值
  const names = details.map((r) => r.cells[2])
  check('S5 明细行商品名正确', names.includes('QA苹果') && names.includes('QA草莓'), names.join(','))
  check('S5 明细行进价格式 @x.xx', details.every((r) => /^@\d+\.\d{2}$/.test(r.cells[5])), details.map((r) => r.cells[5]).join(','))
  check('S5 明细行合计为金额', details.every((r) => /^\d+\.\d{2}/.test(r.cells[6])), details.map((r) => r.cells[6]).join(','))
  check('S5 明细行分类已填', details.every((r) => r.cells[3] && r.cells[3] !== '未分类'), details.map((r) => r.cells[3]).join(','))

  // S6 序号连续
  const seqs = details.map((r) => r.cells[0])
  check('S6 序号页内连续 1..N', seqs.join(',') === '1,2,3', seqs.join(','))

  // S7 组行无操作按钮
  check('S7 组行无编辑/复制/删除', groups.every((g) => !g.hasActions))
  check('S7 明细行有操作按钮', details.every((d) => d.hasActions))

  // S8 移动端卡片视图
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(1000)
  // 卡片根节点 testid 为 bizpur-card-<YYYY-MM-DD>；卡片内部的 date/count/edit/del 也以 bizpur-card- 开头，
  // 故只认「后面紧跟 4 位年份」的那些，避免把卡片内部元素一起数进去
  const cards = await page.evaluate(() => {
    const cardEls = [...document.querySelectorAll('[data-testid^="bizpur-card-"]')].filter((el) => /^bizpur-card-\d{4}-/.test(el.dataset.testid || ''))
    return { cards: cardEls.length, table: document.querySelectorAll('[data-testid="bizpur-table"]').length }
  })
  check('S8 移动端一天一卡且无表格', cards.cards === 2 && cards.table === 0, JSON.stringify(cards))
  check('S8 移动端零 pageerror', errs.length === 0, errs.length ? errs[0] : '')

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] ${results.length - failed.length}/${results.length} passed`)
  if (failed.length) process.exitCode = 1
} finally {
  await browser.close()
  if (server) server.kill()
}
