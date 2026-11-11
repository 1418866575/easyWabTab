/**
 * 导航站「工具箱」入口卡 目视验证
 *
 * 验证点：全部「当前可见」的固定入口卡并入分页（连续置顶、计入总数与页码），
 *         数量随工作台开关动态变化，不再写死前 7 张 / 其余恒显置底 /
 *         第一个固定卡（工具箱）走站内 SPA 跳转、其余入口卡仍新标签打开 /
 *         分类筛选与搜索时分区不变 / 不可拖拽 / 关闭设置里的可见性后消失。
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

const MODULE_ORDER = ['/toolbox', '/blog', '/books', '/teacher', '/workbench', '/business', '/student', '/smart', '/blog/admin']
async function gridUrls() {
  return page.locator('.sites-grid .site-card').evaluateAll(nodes =>
    nodes.map(n => n.getAttribute('data-site-url'))
  )
}
// 入口卡模型：所有「当前可见」的入口卡按 MODULE_SITE_ORDER 连续置顶，全部并入分页池；
// 数量随设置里的工作台开关动态变化，不再有「前 N 并入 / 其余恒显置底」的切分。
// 任何入口卡都不应夹在普通站点中间，也不得出现在页尾。
async function checkModulePartition(label) {
  const urls = await gridUrls()
  const present = urls.filter(u => MODULE_ORDER.includes(u))
  const ranked = [...present].sort((a, b) => MODULE_ORDER.indexOf(a) - MODULE_ORDER.indexOf(b))
  const headOk = ranked.length === 0 || urls.slice(0, ranked.length).join(',') === ranked.join(',')
  const body = urls.slice(ranked.length)
  const bodyOk = body.every(u => !MODULE_ORDER.includes(u))
  check(`${label}：全部可见入口卡连续置顶（原顺序）`, headOk, ranked.join(',') + ' | got ' + urls.slice(0, ranked.length).join(','))
  check(`${label}：入口卡不混入普通站点中间 / 页尾`, bodyOk, body.filter(u => MODULE_ORDER.includes(u)).join(',') || 'ok')
}
await checkModulePartition('默认')

// 回归：此前写死 7 张并入分页，第 8/9 张（智能工作台、博客后台）被挤到恒显段，
// 关掉其它工作台后才「恢复」。现在无论可见入口卡有几张，都应全部出现在首屏入口区。
const defaultModules = (await gridUrls()).filter(u => MODULE_ORDER.includes(u))
check('默认可见 8 张入口卡（个人工作台默认关闭）',
  defaultModules.length === 8 && !defaultModules.includes('/workbench'), `count=${defaultModules.length}`)
check('超过 7 张时 /smart、/blog/admin 仍在首屏入口区（不再恒显置底）',
  defaultModules.includes('/smart') && defaultModules.includes('/blog/admin'), defaultModules.join(','))

// 动态数量回归：正是「关掉其它工作台就恢复」的场景。
// 现在无论可见入口卡是 8 张还是 7 张，都应全部连续置顶、全部计入分页，行为一致。
async function setTeacherVisible(v) {
  await page.evaluate(async (visible) => {
    const m = await import('/src/stores/settings.ts')
    m.useAppSettingsStore().setTeacherPageVisible(visible)
  }, v)
  await page.waitForTimeout(500)
}
await setTeacherVisible(false)
await checkModulePartition('关闭教师工作台后')
const offModules = (await gridUrls()).filter(u => MODULE_ORDER.includes(u))
check('关闭教师工作台后 7 张入口卡仍全部在场（含 /smart、/blog/admin）',
  offModules.length === 7 && !offModules.includes('/teacher') &&
  offModules.includes('/smart') && offModules.includes('/blog/admin'), offModules.join(','))
await setTeacherVisible(true)
await checkModulePartition('重新开启教师工作台后')

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

// 左上角切换器已下线：7 个工作台跳转全部转为列表里的固定入口卡
const triggerCount = await page.locator('[data-testid=ws-trigger]').count()
check('导航站首页已无工作台切换触发器', triggerCount === 0, `找到 ${triggerCount} 个`)
check('个人工作台默认关闭 → 卡片不显示',
  (await page.locator('.site-card[data-site-url="/workbench"]').count()) === 0)
// 所有入口卡（全部并入分页）均不可拖拽
// evaluateAll 回调运行在浏览器上下文，外部常量必须当参数传入（否则 ReferenceError）
check('所有入口卡均不可拖拽', await page.locator('.sites-grid .site-card').evaluateAll((nodes, order) =>
  nodes
    .filter(n => order.includes(n.getAttribute('data-site-url')))
    .every(el => el.getAttribute('draggable') === 'false'),
  MODULE_ORDER
))

// 分类筛选：展开筛选面板 → 选具体分类时入口卡不参与（ad05f86 规则）
const filterToggle = page.locator('[data-testid=nav-filter-toggle]')
if (await filterToggle.count()) {
  await filterToggle.click()
  await page.waitForTimeout(400)
}
const tabSel = '.category-tabs-wrapper .el-radio-button__inner'
const otherTab = page.locator(tabSel).filter({ hasText: '其他' }).first()
if (await otherTab.count()) {
  await otherTab.click()
  await page.waitForTimeout(400)
  await checkModulePartition('切到「其他」分类')
  check('切到「其他」分类后不显示站内入口卡',
    (await gridUrls()).every(u => !MODULE_ORDER.includes(u)))
  // 复位到全部
  const allTab = page.locator(tabSel).filter({ hasText: '全部' }).first()
  if (await allTab.count()) await allTab.click()
  await page.waitForTimeout(300)
} else {
  check('切到「其他」分类后入口卡分区正确', false, '未找到分类 tab')
}

// 搜索：「工具」关键词不命中大部分入口卡；入口卡仍全部连续置顶
const search = page.locator('.nav-site-filter input, input[placeholder*="筛选本站"]').first()
if (await search.count()) {
  await search.fill('工具')
  await page.waitForTimeout(400)
  await checkModulePartition('搜索「工具」')
  await search.fill('')
  await page.waitForTimeout(300)
} else {
  check('搜索「工具」后入口卡分区正确', false, '未找到筛选输入框')
}

// 点击行为分两类：
//  · 第一个固定入口卡（工具箱）→ 站内 SPA 跳转（同标签），原页面跳走到 /toolbox
//  · 其余入口卡（博客前台 / 图书馆 等）→ 新标签打开，原页面停在导航站
const pagesBefore = ctx.pages().length
const tbCard = page.locator('.sites-grid .site-card[data-site-url="/toolbox"]').first()
await tbCard.click()
await page.waitForURL('**/toolbox', { timeout: 10000 }).catch(() => {})
const pagesAfterTb = ctx.pages().length
check('点击工具箱不新开标签页（站内跳转）', pagesAfterTb === pagesBefore, `${pagesBefore} → ${pagesAfterTb}`)
check('点击工具箱后原页面跳到 /toolbox', new URL(page.url()).pathname === '/toolbox', page.url())
await page
  .locator('[data-testid=tb-card-deposit-calc]')
  .first()
  .waitFor({ state: 'attached', timeout: 20000 })
  .catch(() => {})
const toolCount = await page.locator('[data-testid=tb-card-deposit-calc]').count()
check('工具箱页面已渲染', toolCount > 0, `卡片数 ${toolCount}`)
await page.screenshot({ path: path.join(OUT, 'after-click.png'), timeout: 8000 }).catch(() => {})

// 返回导航站，再验证其余入口卡仍新标签打开
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.locator('.sites-grid .site-card').first().waitFor({ state: 'visible', timeout: 20000 })
await page.locator('.sites-grid .site-card[data-site-url="/toolbox"]').waitFor({ state: 'attached', timeout: 20000 })

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

check('其余入口卡点击后原页面仍停在导航站', new URL(page.url()).pathname === '/', page.url())

// 返回首页：卡片仍在第一（点击计数会改 sort，验证钉顶不受影响）
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.locator('.sites-grid .site-card').first().waitFor({ state: 'visible', timeout: 20000 })
const urlBack = await page.locator('.sites-grid .site-card').first().getAttribute('data-site-url')
check('点击（sort 增加）后回到首页仍第一', urlBack === '/toolbox', urlBack || '无')

await browser.close()

const failed = results.filter(r => !r.ok)
console.log(`\n合计 ${results.length} 项，失败 ${failed.length} 项`)
if (failed.length) process.exitCode = 1
