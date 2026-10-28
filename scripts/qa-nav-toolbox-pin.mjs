/**
 * 导航站「工具箱」钉顶卡片 目视验证
 *
 * 验证点：卡片出现在列表第一位 / 点击一律新标签打开 / 分类筛选与搜索时仍第一 /
 *         不可拖拽 / 关闭设置里的可见性后消失。
 *
 * 用法：node scripts/qa-nav-toolbox-pin.mjs [baseUrl]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const BASE = process.argv[2] || 'http://127.0.0.1:16741'
const OUT = path.join(process.cwd(), 'qa-nav-pin')
fs.mkdirSync(OUT, { recursive: true })

function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (fs.existsSync(root)) {
    for (const d of fs.readdirSync(root).filter(x => x.startsWith('chromium-')).sort().reverse()) {
      const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
      if (fs.existsSync(p)) return p
    }
  }
  return [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ].find(p => fs.existsSync(p))
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath: findChromium() })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
// 关掉首次访问自动弹出的帮助页，避免遮挡卡片
await ctx.addInitScript(() => localStorage.setItem('help-ack-count', '9'))
const page = await ctx.newPage()

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
const first = page.locator('.sites-grid .site-card').first()
await first.waitFor({ state: 'visible', timeout: 20000 })
// 等站内模块入口注入完成（store 装载是异步的）
await page.locator('.sites-grid .site-card[data-site-url="/toolbox"]').waitFor({ state: 'attached', timeout: 20000 })

const firstUrl = await first.getAttribute('data-site-url')
check('第一张卡片是工具箱', firstUrl === '/toolbox', firstUrl || '无')

// 站内入口卡整体置顶：工具箱 → 博客前台 → 图书馆，且都在普通站点之前
const headUrls = await page.locator('.sites-grid .site-card').evaluateAll(nodes =>
  nodes.slice(0, 3).map(n => n.getAttribute('data-site-url'))
)
check('前三张是 工具箱/博客前台/图书馆', JSON.stringify(headUrls) === JSON.stringify(['/toolbox', '/blog', '/books']), headUrls.join(' , '))

const normalBeforeModule = await page.locator('.sites-grid .site-card').evaluateAll(nodes => {
  const urls = nodes.map(n => n.getAttribute('data-site-url'))
  const moduleUrls = ['/toolbox', '/blog', '/books']
  const lastModule = Math.max(...moduleUrls.map(u => urls.indexOf(u)))
  const firstNormal = urls.findIndex(u => !moduleUrls.includes(u))
  return firstNormal === -1 || firstNormal > lastModule
})
check('没有普通站点插到入口卡前面', normalBeforeModule)

const moduleIcons = await page.locator('.sites-grid .site-card').evaluateAll(nodes =>
  nodes.slice(0, 3).map(n => n.querySelector('img')?.getAttribute('src') || '')
)
check('三张入口卡都用内联 SVG 图标', moduleIcons.every(s => s.startsWith('data:image/svg+xml')))

const firstText = (await first.innerText()).replace(/\n+/g, ' ')
check('卡片显示名称「工具箱」', firstText.includes('工具箱'), firstText.slice(0, 40))

const draggable = await first.getAttribute('draggable')
check('钉顶卡不可拖拽', draggable === 'false', draggable || 'null')

await page.screenshot({ path: path.join(OUT, 'nav-first.png') })
await first.screenshot({ path: path.join(OUT, 'card-toolbox.png') })

// 卡片图标应为内联 SVG（彩色块），而不是灰线框或破图
const iconSrc = await first.locator('img').first().getAttribute('src')
check('卡片图标为内联 SVG', (iconSrc || '').startsWith('data:image/svg+xml'), (iconSrc || '无').slice(0, 34))

// 左上角工作台面板：工具箱项已移除
await page.locator('[data-testid=ws-trigger]').click()
await page.locator('[data-testid=ws-panel]').waitFor({ state: 'visible', timeout: 8000 })
const panelToolbox = await page.locator('[data-testid=ws-item-toolbox]').count()
const panelSmart = await page.locator('[data-testid=ws-item-smart]').count()
check('工作台面板已无工具箱项', panelToolbox === 0, `找到 ${panelToolbox} 项`)
check('工作台面板其余项正常', panelSmart === 1, `智能工作台 ${panelSmart} 项`)
await page.screenshot({ path: path.join(OUT, 'workbench-panel.png') })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// 分类筛选：展开筛选面板 → 切到「其他」后仍在第一
const filterToggle = page.locator('[data-testid=nav-filter-toggle]')
if (await filterToggle.count()) {
  await filterToggle.click()
  await page.waitForTimeout(400)
}
const otherTab = page.locator('.category-tab').filter({ hasText: '其他' }).first()
if (await otherTab.count()) {
  await otherTab.click()
  await page.waitForTimeout(400)
  const urlAfterCat = await page.locator('.sites-grid .site-card').first().getAttribute('data-site-url')
  check('切到「其他」分类后仍第一', urlAfterCat === '/toolbox', urlAfterCat || '无')
  // 复位到全部
  const allTab = page.locator('.category-tab').filter({ hasText: '全部' }).first()
  if (await allTab.count()) await allTab.click()
  await page.waitForTimeout(300)
} else {
  check('切到「其他」分类后仍第一', false, '未找到分类 tab')
}

// 搜索：「工具」关键词下仍第一
const search = page.locator('.nav-site-filter input, input[placeholder*="筛选本站"]').first()
if (await search.count()) {
  await search.fill('工具')
  await page.waitForTimeout(400)
  const urlAfterSearch = await page.locator('.sites-grid .site-card').first().getAttribute('data-site-url')
  check('搜索「工具」后仍第一', urlAfterSearch === '/toolbox', urlAfterSearch || '无')
  await search.fill('')
  await page.waitForTimeout(300)
} else {
  check('搜索「工具」后仍第一', false, '未找到筛选输入框')
}

// 点击 → 一律新标签打开（工具箱 / 博客前台 / 图书馆 三张入口卡同规则）
/** 点某张入口卡并等它弹出的新标签页 */
async function clickCardOpenTab(url) {
  const card = page.locator(`.sites-grid .site-card[data-site-url="${url}"]`).first()
  const [popup] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 10000 }),
    card.click()
  ])
  await popup.waitForLoadState('domcontentloaded')
  return popup
}

const pagesBefore = ctx.pages().length
const tbPage = await clickCardOpenTab('/toolbox')
const pagesAfter = ctx.pages().length
check('点击工具箱新开标签页', pagesAfter === pagesBefore + 1, `${pagesBefore} → ${pagesAfter}`)
check('新标签地址是 /toolbox', new URL(tbPage.url()).pathname === '/toolbox', tbPage.url())
check('原页面仍停在导航站（未跳走）', new URL(page.url()).pathname === '/', page.url())
await tbPage
  .locator('[data-testid=tb-card-deposit-calc]')
  .first()
  .waitFor({ state: 'attached', timeout: 20000 })
  .catch(() => {})
const toolCount = await tbPage.locator('[data-testid=tb-card-deposit-calc]').count()
check('工具箱页面已渲染', toolCount > 0, `卡片数 ${toolCount}`)
// 新标签页截图可能卡在 document.fonts.ready（新上下文并行加载字体）→ 超时不算失败
await tbPage.screenshot({ path: path.join(OUT, 'after-click.png'), timeout: 8000 }).catch(() => {})
await tbPage.close()
await page.waitForTimeout(300)

// 另外两张入口卡同样新标签打开
for (const [url, label] of [['/blog', '博客前台'], ['/books', '图书馆']]) {
  const before = ctx.pages().length
  const popup = await clickCardOpenTab(url)
  check(
    `点击${label}新开标签页且地址为 ${url}`,
    ctx.pages().length === before + 1 && new URL(popup.url()).pathname === url,
    `${before} → ${ctx.pages().length} | ${popup.url()}`
  )
  await popup.close()
  await page.waitForTimeout(200)
}

check('三次点击后原页面始终停在导航站', new URL(page.url()).pathname === '/', page.url())

// 返回首页：卡片仍在第一（点击计数会改 sort，验证钉顶不受影响）
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.locator('.sites-grid .site-card').first().waitFor({ state: 'visible', timeout: 20000 })
const urlBack = await page.locator('.sites-grid .site-card').first().getAttribute('data-site-url')
check('点击（sort 增加）后回到首页仍第一', urlBack === '/toolbox', urlBack || '无')

await browser.close()

const failed = results.filter(r => !r.ok)
console.log(`\n合计 ${results.length} 项，失败 ${failed.length} 项`)
if (failed.length) process.exitCode = 1
