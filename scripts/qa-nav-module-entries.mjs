/**
 * QA：博客前台 / 图书馆 从「左上角工作台弹框」迁移到「导航站列表」
 *
 * 断言：
 *  S1 导航列表里出现 /blog 与 /books 两张卡片，且各只有 1 张（无重复）
 *  S2 卡片图标已设置且是图片（不是空 src / 破图）
 *  S3 工作台弹框里不再残留这两个入口（ws-item-blog-front / ws-item-books 不存在），
 *     但「博客后台」仍在（ws-item-blog 存在）
 *  S4 点击卡片能真正打开对应站内路由（新标签页 URL 正确且页面有内容）
 *  S5 设置里改名称 → 卡片名称跟随；关闭可见性 → 卡片移除（再打开恢复）
 *
 * 用法：node scripts/qa-nav-module-entries.mjs
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
  const dirs = fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()
  for (const d of dirs) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(p)) return p
  }
  return undefined
}
async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { const res = await fetch(url); if (res.ok) return true } catch { }
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
  try { const res = await fetch('http://localhost:' + port + '/', { signal: AbortSignal.timeout(1500) }); return !res.ok } catch { return true }
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

const exe = findChromium()
const browser = await chromium.launch(exe ? { executablePath: exe } : { channel: 'msedge' })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(base + '/', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.site-card', { timeout: 120000 })

  // 首次进入会弹「帮助」弹框（遮罩会拦截点击），先关掉
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }

  // 入口卡只在「全部」分类出现（ad05f86 起）：具体分类会把站内入口卡过滤掉。
  // 全部入口卡都并入分页池、数量不超过 pageSize，首屏即可看全，不受分页影响。
  await page.evaluate(async () => {
    const m = await import('/src/stores/sites.ts')
    m.useSitesStore().setCategory('')
  })
  await page.waitForTimeout(400)

  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('.site-card')].map((el) => {
      const img = el.querySelector('img.favicon')
      return {
        url: el.getAttribute('data-site-url') || '',
        name: (el.querySelector('.site-name')?.textContent || el.getAttribute('aria-label') || '').trim(),
        icon: img ? img.getAttribute('src') || '' : ''
      }
    })
  )
  const blog = cards.filter((c) => c.url === '/blog')
  const books = cards.filter((c) => c.url === '/books')
  console.log('[qa] 全部分类卡片:', JSON.stringify(cards.map((c) => c.url)))

  check('S1 /blog 卡片存在且唯一', blog.length === 1, `count=${blog.length}`)
  check('S1 /books 卡片存在且唯一', books.length === 1, `count=${books.length}`)
  check('S2 /blog 图标是图片', /^data:image\//.test(blog[0]?.icon || ''), (blog[0]?.icon || '').slice(0, 40))
  check('S2 /books 图标是图片', /^data:image\//.test(books[0]?.icon || ''), (books[0]?.icon || '').slice(0, 40))
  check('S5 默认名称正确', blog[0]?.name === '博客前台' && books[0]?.name === '图书馆', `${blog[0]?.name} / ${books[0]?.name}`)

  // 现行规则的反向守卫：选具体分类时站内入口卡不显示（旧版脚本曾在这里找 /blog、/books）
  await page.evaluate(async () => {
    const m = await import('/src/stores/sites.ts')
    m.useSitesStore().setCategory('other')
  })
  await page.waitForTimeout(400)
  const otherModuleCount = await page.locator('.site-card[data-site-url="/blog"], .site-card[data-site-url="/books"], .site-card[data-site-url="/blog/admin"]').count()
  check('选具体分类时站内入口卡不显示', otherModuleCount === 0, `count=${otherModuleCount}`)
  await page.evaluate(async () => {
    const m = await import('/src/stores/sites.ts')
    m.useSitesStore().setCategory('')
  })
  await page.waitForTimeout(400)

  // 导航站首页已无切换器；工作台跳转与站内模块一起固定在卡片列表
  const triggerCount = await page.locator('[data-testid="ws-trigger"]').count()
  check('S3 首页已无工作台切换器', triggerCount === 0, `count=${triggerCount}`)
  const pinnedCount = await page.locator('.site-card[data-site-url="/teacher"], .site-card[data-site-url="/business"], .site-card[data-site-url="/blog/admin"]').count()
  check('S3 工作台固定入口卡存在', pinnedCount === 3, `count=${pinnedCount}`)
  check('S3 不再有「导航站」自身入口卡',
    (await page.locator('.site-card[data-site-url="/"]').count()) === 0)

  // S4 点击卡片能真正打开站内路由
  for (const [url, label] of [['/blog', '博客前台'], ['/books', '图书馆']]) {
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 15000 }),
      page.click(`.site-card[data-site-url="${url}"]`)
    ])
    await popup.waitForLoadState('commit', { timeout: 60000 })
    const pu = popup.url()
    const okUrl = new URL(pu).pathname === url
    // 页面有实际内容（SPA 挂载后 body 不为空）
    await popup.waitForTimeout(800)
    const bodyLen = await popup.evaluate(() => (document.body?.innerText || '').trim().length).catch(() => 0)
    check(`S4 ${label} 点击打开 ${url}`, okUrl, pu)
    check(`S4 ${label} 页面有内容（非白屏/404）`, bodyLen > 0, `textLen=${bodyLen}`)
    await popup.close()
  }

  // S5 设置改名 + 关闭可见性
  await page.evaluate(async () => {
    const m = await import('/src/stores/settings.ts')
    m.useAppSettingsStore().setBlogFrontPageName('阅读站')
  })
  await page.waitForTimeout(400)
  const renamed = await page.evaluate(() =>
    [...document.querySelectorAll('.site-card[data-site-url="/blog"] .site-name')].map((e) => (e.textContent || '').trim())
  )
  check('S5 改名称后卡片跟随', renamed[0] === '阅读站', JSON.stringify(renamed))

  await page.evaluate(async () => {
    const m = await import('/src/stores/settings.ts')
    m.useAppSettingsStore().setBlogFrontPageVisible(false)
  })
  await page.waitForTimeout(400)
  const gone = await page.locator('.site-card[data-site-url="/blog"]').count()
  check('S5 关闭可见性后卡片移除', gone === 0, `count=${gone}`)

  await page.evaluate(async () => {
    const m = await import('/src/stores/settings.ts')
    const s = m.useAppSettingsStore()
    s.setBlogFrontPageVisible(true)
    s.setBlogFrontPageName('')
  })
  await page.waitForTimeout(400)
  const back = await page.locator('.site-card[data-site-url="/blog"]').count()
  check('S5 重新开启后卡片恢复且仍唯一', back === 1, `count=${back}`)

  check('无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
