/**
 * 探针：销售台（/business）视觉抽查
 *
 * 用途：把销售台 8 个面板逐个截图，确认与教师/个人工作台同一套卡片、按钮、表格语言；
 *      并采样关键计算样式（卡片圆角/阴影、表头、按钮圆角）便于量化比对。
 * 截图落在系统临时目录（不进仓库）。
 *
 * 用法：node scripts/probe-biz-style.mjs
 *      SHOT_DIR=d:/tmp/bizshot node scripts/probe-biz-style.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.env.SHOT_DIR || join(os.tmpdir(), 'biz-style')
fs.mkdirSync(OUT, { recursive: true })

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
let server = null
async function ensureDevServer() {
  for (let p = 16718; p <= 16726; p++) if (await isViteDevAt(p)) return 'http://localhost:' + p
  for (let p = 16718; p <= 16726; p++) {
    if (!(await isPortFree(p))) continue
    server = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    server.stdout.on('data', () => {})
    server.stderr.on('data', () => {})
    if (await waitForServer('http://localhost:' + p)) if (await isViteDevAt(p)) return 'http://localhost:' + p
    server.kill(); server = null
  }
  throw new Error('no free port')
}

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[probe] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')))

  await page.goto(base + '/business', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="bs-content"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }
  await page.waitForTimeout(1200)

  // 首次进入是「还没有账本」的阻断式引导：先建当年账本
  if (await page.locator('[data-testid="bs-gate-submit"]').count()) {
    await page.click('[data-testid="bs-gate-submit"]')
    await page.waitForTimeout(1500)
  }

  // 造数：空面板不渲染表格/图表，看不出样式（会得到假阴性截图）
  // SKIP_SEED=1 用于排查「面板本身的渲染问题是否与造数有关」（空库跑一遍最干净）
  const seeded = process.env.SKIP_SEED
    ? { skipped: true }
    : await page.evaluate(async () => {
    const out = {}
    const dayStr = (offset) => {
      const d = new Date()
      d.setDate(d.getDate() + offset)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    try {
      const m = await import('/src/stores/workbenchBusiness.ts')
      const s = m.useWorkbenchBusinessStore()
      await s.loadBusiness()
      if (!s.hasLedgers) s.createLedger(new Date().getFullYear())
      // 商品分类：面板的分类徽标按 categoryId 渲染，缺分类只会显示「未分类」（不影响样式判定）。
      // 注意默认分类已含「水果」，再 addProductCategory('水果') 会因 duplicate 失败 → 直接取已有分类。
      const productCatId = s.productCategories[0]?.id
      const names = [['红富士苹果', '斤', 3.2, 5.5], ['本地草莓', '盒', 8, 15], ['赣南脐橙', '斤', 2.8, 4.8]]
      for (const [name, unit, purchasePrice, sellingPrice] of names) {
        await s.addProduct({ name, categoryId: productCatId, unit, purchasePrice, sellingPrice })
      }
      const ids = s.products.slice(-3).map((p) => p.id)
      await s.addPurchase({ productId: ids[0], quantity: 60, unitPrice: 3.2, date: dayStr(-3), note: '早市进货' })
      await s.addPurchase({ productId: ids[1], quantity: 30, unitPrice: 8, date: dayStr(-2) })
      for (let i = 1; i <= 5; i++) {
        await s.upsertDailyRecord({
          date: dayStr(-i),
          items: [
            { productId: ids[0], broughtOut: 20, remaining: 20 - i * 2, loss: i === 1 ? 1 : 0 },
            { productId: ids[1], broughtOut: 8, remaining: 8 - i, loss: 0 }
          ],
          transactionCount: 6 + i
        })
      }
      const cat = s.expenseCategories[0]?.id
      if (cat) await s.addExpense({ date: dayStr(-1), categoryId: cat, amount: 30, title: '摊位费' })
      out.ledgers = s.ledgers.length
      out.products = s.products.length
      out.purchases = s.purchases.length
      out.daily = s.dailyRecords.length
    } catch (e) { out.err = String(e).slice(0, 200) }
    return out
  })
  console.log('[probe] seed:', JSON.stringify(seeded))

  const panels = [
    ['home', '首页'],
    ['products', '商品'],
    ['expenses', '进货'],
    ['purchases', '库存'],
    ['daily', '销售'],
    ['inventory', '库存预警'],
    ['stats', '统计'],
    ['reconcile', '对账']
  ]
  // 各面板的分区卡片类名不统一，逐个面板采样一遍（圆角/阴影应统一为 12px + 极轻阴影）
  const SECTION_CARD_SELECTORS = ['.bizhome-hero-card', '.bizhome-today', '.bizhome-card', '.bizprod-card', '.bizstats-card', '.bizrec-card', '.bizinv-card', '.bizinv-low-card', '.ewt-card']
  const sectionCards = {}
  for (const [key, label] of panels) {
    const btn = page.locator(`[data-testid="bs-menu-${key}"]`)
    if (!(await btn.count())) { console.log('[probe] 无菜单:', key); continue }
    await btn.click()
    await page.waitForTimeout(1100)
    await page.screenshot({ path: join(OUT, `31-biz-${key}.png`) })
    sectionCards[key] = await page.evaluate((sels) => sels.map((sel) => {
      const el = document.querySelector('.bs-content ' + sel)
      if (!el) return null
      const s = getComputedStyle(el)
      return { sel, radius: s.borderRadius, shadow: s.boxShadow === 'none' ? 'none' : 'yes' }
    }).filter(Boolean), SECTION_CARD_SELECTORS)
    console.log('[probe] biz panel ok:', label)
  }

  // 采样关键样式：卡片圆角/阴影、表头、按钮
  const style = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const s = getComputedStyle(el)
      return { sel, fontSize: s.fontSize, fontWeight: s.fontWeight, color: s.color, background: s.backgroundColor, borderRadius: s.borderRadius, padding: s.padding, boxShadow: s.boxShadow }
    }
    return {
      content: pick('.bs-content'),
      head: pick('.panel-page-head'),
      title: pick('.panel-page-title'),
      card: pick('.bs-content .bizhome-card, .bs-content .stat-card, .bs-content [class*="card"]'),
      btn: pick('.bs-content .el-button'),
      th: pick('.bs-content .ewt-table .el-table__header th, .bs-content .el-table__header th')
    }
  })
  console.log('[probe] biz styles:', JSON.stringify(style, null, 2))
  console.log('[probe] section cards:', JSON.stringify(sectionCards, null, 2))

  // 暗色 + 移动端抽查
  await page.click('[data-testid="bs-menu-products"]')
  await page.waitForTimeout(700)
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, '41-biz-products-dark.png') })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(900)
  await page.screenshot({ path: join(OUT, '42-biz-products-mobile.png') })
  const mobile = await page.evaluate(() => {
    const c = document.querySelector('.bs-content')
    return { pad: c ? getComputedStyle(c).padding : '', overflowX: c ? c.scrollWidth - c.clientWidth : -1 }
  })
  console.log('[probe] mobile:', JSON.stringify(mobile))

  if (errs.length) console.log('[probe] pageerror:', errs.slice(0, 5))
  console.log('[probe] 截图目录 =', OUT)
} finally {
  await browser.close()
  if (server) server.kill()
}
