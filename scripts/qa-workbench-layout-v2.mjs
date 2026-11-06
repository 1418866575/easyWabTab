/**
 * QA：个人工作台「无顶栏 / 左侧全量菜单 / 搜索置顶 / 底部两枚按钮 / 首页首行 50-50」布局守卫
 *
 * 对应 2026-11-06 的布局改版原型（D:/workbuddyWorkSpace/个人工作台-布局优化原型-v2.html）。
 * 与 qa-workbench-mobile-overlap.mjs 分工：那边管 FAB / 移动端抽屉遮挡，这边管结构与状态。
 *
 * 断言：
 *  S1 无全局顶栏；.wb-scope 作用域挂载；搜索框是侧栏第一个元素
 *  S2 12 项菜单 + 日常/专注/资产三组；底部恒定只有云同步 + 设置两枚按钮
 *  S3 搜索入口、设置弹窗只留侧栏折叠入口（无切换工作台/说明文案）、侧栏折叠可用
 *  S4 首页首行：日期 / 天气同一行各 50%，时间在前、天气在后，天气为 compact 卡
 *  S5 KeepAlive：切走再回来不重建面板 DOM；健康子 tab 与 section 一起写进 URL
 *  S6 桌面 / 移动 / 亮暗无横向溢出、无页面级 JS 异常
 *
 * 用法：node scripts/qa-workbench-layout-v2.mjs
 *      BASE=http://localhost:16719 node scripts/qa-workbench-layout-v2.mjs
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

  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-home"]', { timeout: 120000 })
  await page.waitForSelector('[data-testid="home-greeting"]', { timeout: 120000 })
  await page.waitForTimeout(900)

  /* ---------- S1 整体结构 ---------- */
  check('S1-1 无全局顶栏 .wb-header', await page.locator('.wb-header').count() === 0)
  check('S1-2 .wb-scope 作用域已挂载', await page.locator('.wb-shell.wb-scope').count() === 1)
  const top = await page.evaluate(() => {
    const t = document.querySelector('.wb-side-top')
    const c = t && t.firstElementChild
    return { first: c ? c.getAttribute('data-testid') : '', brand: !!document.querySelector('.side-brand') }
  })
  check('S1-3 搜索框是侧栏第一个元素', top.first === 'wb-spotlight-open', JSON.stringify(top))
  check('S1-4 无品牌区', !top.brand)
  check('S1-5 左右两栏几何正确', await page.evaluate(() => {
    const s = document.querySelector('.wb-menu').getBoundingClientRect()
    const c = document.querySelector('.wb-content').getBoundingClientRect()
    return c.left >= s.right - 1 && c.width > 600
  }))
  /* 搜索行与菜单视为「一个整体」：无分隔线、同一 8px 槽、平时无边框 */
  const bond = await page.evaluate(() => {
    const top = document.querySelector('.wb-side-top')
    const search = document.querySelector('.wb-search')
    const item = document.querySelector('.wb-menu-item')
    const ts = getComputedStyle(top), ss = getComputedStyle(search)
    const sr = search.getBoundingClientRect(), ir = item.getBoundingClientRect()
    return {
      divider: ts.borderBottomWidth,
      border: ss.borderTopWidth + '|' + ss.borderTopColor,
      radius: ss.borderRadius,
      sameGutter: Math.abs(sr.left - ir.left) <= 1 && Math.abs(sr.right - ir.right) <= 1
    }
  })
  check('S1-6 搜索行与菜单之间无分隔线', bond.divider === '0px', bond.divider)
  check('S1-7 搜索框平时无描边（不再像独立胶囊）',
    bond.border.startsWith('0px') || /rgba\(0, 0, 0, 0\)|transparent/.test(bond.border), bond.border)
  check('S1-8 搜索框与菜单项同一条内边距槽', bond.sameGutter)
  check('S1-9 搜索框是 8px 圆角的内嵌行（不再 999px 胶囊）', bond.radius === '8px', bond.radius)

  /* ---------- S2 分组菜单 + 底部两枚按钮 ---------- */
  check('S2-1 侧栏 12 项全量菜单', await page.locator('.wb-menu .wb-menu-item').count() === 12)
  const groups = await page.evaluate(() => [...document.querySelectorAll('.wb-group-label')].map(e => e.textContent.trim()).join(','))
  check('S2-2 三组标签 日常/专注/资产', groups === '日常,专注,资产', groups)
  const labelStyle = await page.evaluate(() => {
    const g = document.querySelector('.wb-group-label')
    const item = document.querySelector('.wb-menu-item')
    const gs = getComputedStyle(g), is = getComputedStyle(item)
    return { group: parseFloat(gs.fontSize), weight: Number(gs.fontWeight), item: parseFloat(is.fontSize) }
  })
  check('S2-2b 分组字号已增大到 13px 且加粗',
    labelStyle.group >= 13 && labelStyle.weight >= 600, `${labelStyle.group}px/${labelStyle.weight}`)
  check('S2-2c 分组字号与菜单项同级（13px），靠字重区分层级',
    labelStyle.group >= labelStyle.item * 0.92, `${labelStyle.group} vs ${labelStyle.item}`)
  const foot = await page.evaluate(() => [...document.querySelectorAll('[data-testid="wb-side-foot"] button')].map(b => b.getAttribute('data-testid')).join(','))
  check('S2-3 底部恰好两枚按钮', foot.split(',').length === 2, foot)
  check('S2-4 两枚为云同步 + 设置', foot === 'wb-sync-now,wb-settings', foot)
  check('S2-5 底部无亮暗/设备/折叠/清单等控件', await page.evaluate(() => {
    const f = document.querySelector('[data-testid="wb-side-foot"]')
    return !/亮暗|移动端|优化清单|切换工作台|收起侧栏|展开侧栏/.test(f.innerText)
  }))
  const footGeo = await page.evaluate(() => {
    const f = document.querySelector('[data-testid="wb-side-foot"]')
    const bs = [...f.querySelectorAll('button')]
    const r = x => x.getBoundingClientRect()
    return {
      n: bs.length,
      sameRow: Math.abs(r(bs[0]).top - r(bs[1]).top) <= 1,
      eqWidth: Math.abs(r(bs[0]).width - r(bs[1]).width) <= 1,
      fills: Math.abs(r(bs[0]).width + r(bs[1]).width + 6 - (r(f).width - 20)) <= 3,
      texts: bs.map(b => b.innerText.trim()),
      iconsHidden: bs.every(b => getComputedStyle(b.querySelector('.wb-side-btn-ic')).display === 'none'),
      footH: Math.round(r(f).height)
    }
  })
  check('S2-6 两枚按钮同一行', footGeo.sameRow)
  check('S2-7 两枚等宽各占约 50%', footGeo.eqWidth && footGeo.fills,
    JSON.stringify(footGeo))
  check('S2-8 只显示「云同步」「设置」纯文字',
    footGeo.texts.join(',') === '云同步,设置' && footGeo.iconsHidden, footGeo.texts.join(','))
  check('S2-9 底部工具区已压到 60px 以内', footGeo.footH <= 60, `h=${footGeo.footH}`)
  const dailyBadge = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.wb-group-label')]
    const daily = labels.find(l => l.textContent.trim().startsWith('日常'))
    const btn = daily?.querySelector('[data-testid="wb-sidebar-toggle"]')
    if (!daily || !btn) return null
    const r = x => x.getBoundingClientRect()
    const firstItem = document.querySelector('.wb-side-nav .wb-menu-item')
    return {
      inDaily: true,
      count: document.querySelectorAll('[data-testid="wb-sidebar-toggle"]').length,
      // 标题行自身有 8px 右内边距，按钮贴着这条内边距即算右对齐
      rightAligned: (r(daily).right - r(btn).right) <= 12
        && r(btn).left > r(daily).left + r(daily).width / 2,
      aboveMenu: r(daily).bottom <= r(firstItem).top + 1,
      visible: getComputedStyle(btn).display !== 'none',
      label: btn.getAttribute('aria-label')
    }
  })
  check('S2-10 「日常」标题右端有且仅有一个侧边栏按钮',
    !!dailyBadge && dailyBadge.inDaily && dailyBadge.count === 1, JSON.stringify(dailyBadge))
  check('S2-11 按钮右对齐且在菜单项上方、默认可点',
    !!dailyBadge && dailyBadge.rightAligned && dailyBadge.aboveMenu && dailyBadge.visible && dailyBadge.label === '收起侧栏',
    JSON.stringify(dailyBadge))

  /* ---------- S3 入口可用性 ---------- */
  await page.locator('[data-testid="wb-spotlight-open"]').click()
  // SpotlightOverlay / AppSettingsDialog 都是 defineAsyncComponent + v-if，需等 chunk 落地
  const spOpened = await page.waitForSelector('[data-testid="sp-overlay"]', { timeout: 30000 }).then(() => true).catch(() => false)
  check('S3-1 搜索框打开全局搜索浮层', spOpened)
  await page.locator('[data-testid="sp-close"]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-testid="wb-settings"]').click()
  await page.waitForSelector('.settings-dialog', { timeout: 30000 })
  await page.waitForTimeout(600)
  const settingsSidebarBits = await page.evaluate(() => {
    const dlg = document.querySelector('.settings-dialog')
    const txt = dlg.innerText.replace(/\s+/g, ' ')
    return {
      box: !!document.querySelector('[data-testid="settings-workbench-shortcuts"]'),
      toggle: !!document.querySelector('[data-testid="settings-toggle-sidebar"]'),
      switcher: !!document.querySelector('[data-testid="settings-open-switcher"]'),
      legacy: /收起侧栏|展开侧栏|Alt\+W|Alt\+K|顶栏已移除/.test(txt)
    }
  })
  check('S3-2 设置弹窗底部已无「侧栏」行', !settingsSidebarBits.box && !settingsSidebarBits.toggle,
    JSON.stringify(settingsSidebarBits))
  check('S3-2b 设置里也不再出现切换工作台 / 快捷键说明',
    !settingsSidebarBits.switcher && !settingsSidebarBits.legacy, JSON.stringify(settingsSidebarBits))
  // 关闭设置：本弹窗 :close-on-escape="false" 且自写分层 ESC（全屏先退出、再按才关），
  // 头部那颗 .close-btn 是「全屏切换」，不是关闭按钮，别点它。
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  await page.keyboard.press('Escape')
  await page.waitForSelector('.settings-dialog', { state: 'detached', timeout: 10000 }).catch(() => {})

  // 侧栏折叠现在只有一个入口：「日常」标题右端那颗按钮
  const sidebarBtn = page.locator('[data-testid="wb-sidebar-toggle"]')
  const beforeW = await page.evaluate(() => document.querySelector('.wb-menu').getBoundingClientRect().width)
  await sidebarBtn.click()
  await page.waitForTimeout(320)
  const w1 = await page.evaluate(() => document.querySelector('.wb-menu').getBoundingClientRect().width)
  const collapsedBtnLabel = await sidebarBtn.getAttribute('aria-label')
  check('S3-3 侧栏按钮可折叠（200 → 60）且折叠态仍在',
    beforeW > 150 && w1 <= 62 && await sidebarBtn.isVisible() && collapsedBtnLabel === '展开侧栏',
    `${Math.round(beforeW)} → ${Math.round(w1)} label=${collapsedBtnLabel}`)
  // 折叠态 60px 放不下文字，降级为一行两枚纯图标按钮（仍是两个入口）
  const collapsedFoot = await page.evaluate(() => {
    const f = document.querySelector('[data-testid="wb-side-foot"]')
    const bs = [...f.querySelectorAll('button')]
    const r = x => x.getBoundingClientRect()
    return {
      sameRow: Math.abs(r(bs[0]).top - r(bs[1]).top) <= 1,
      icons: bs.every(b => getComputedStyle(b.querySelector('.wb-side-btn-ic')).display !== 'none'),
      noText: bs.every(b => b.innerText.trim() === '')
    }
  })
  check('S3-4 折叠态仍一行两枚，降级为纯图标',
    collapsedFoot.sameRow && collapsedFoot.icons && collapsedFoot.noText, JSON.stringify(collapsedFoot))
  await sidebarBtn.click()
  await page.waitForTimeout(320)
  const w2 = await page.evaluate(() => document.querySelector('.wb-menu').getBoundingClientRect().width)
  check('S3-5 再点一次可展开侧栏', w2 > 150, `w=${Math.round(w2)}`)

  /* ---------- S4 首行信息带 + 卡片默认顺序 ---------- */
  await page.locator('[data-testid="wb-menu-home"]').click()
  await page.waitForSelector('[data-testid="home-greeting-row"]', { timeout: 30000 })
  const hero = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="home-greeting-row"]')
    const time = document.querySelector('.greeting-time')
    const date = document.querySelector('[data-testid="home-greeting-date"]')
    const week = document.querySelector('[data-testid="home-greeting-week"]')
    const tr = time.getBoundingClientRect()
    const dr = date.getBoundingClientRect()
    const wr = week.getBoundingClientRect()
    const greetingBox = document.querySelector('[data-testid="home-greeting"]')
    return {
      text: row.innerText.replace(/\s+/g, ' ').trim(),
      dateText: date.innerText.trim(),
      weekText: week.innerText.trim(),
      timeBeforeDate: tr.right <= dr.left + 2,
      weekAfterDate: wr.left >= dr.right - 2,
      sameLine: Math.abs(wr.top + wr.height / 2 - (dr.top + dr.height / 2)) <= 3,
      weatherInHeader: greetingBox.querySelectorAll('.weather-card').length
    }
  })
  check('S4-1 首行不再有时段问候语', !/早上好|下午好|晚上好|欢迎回来/.test(hero.text), hero.text)
  check('S4-2 时间在日期之前', hero.timeBeforeDate, hero.text)
  check('S4-3 日期含年与星期', /\d{4}年/.test(hero.dateText) && /星期|周[一二三四五六日]/.test(hero.dateText), hero.dateText)
  check('S4-4 周序号紧跟在日期之后', /第\s*\d+\s*周/.test(hero.weekText) && hero.weekAfterDate && hero.sameLine, hero.weekText)
  check('S4-5 首行不再重复天气卡', hero.weatherInHeader === 0)

  const order = await page.evaluate(() => {
    const wraps = [...document.querySelectorAll('.home-overview-grid > .bento-card-wrap')]
    const ranked = wraps
      .map(w => ({ id: w.getAttribute('data-card-id'), o: Number(getComputedStyle(w).order) }))
      .sort((a, b) => a.o - b.o)
    const rects = wraps.map(w => ({ id: w.getAttribute('data-card-id'), r: w.getBoundingClientRect() }))
    // 末行按 top 判定：栅格是 align-items:start，同行卡片底边不一定齐
    const maxTop = Math.max(...rects.map(x => x.r.top))
    const lastRow = rects.filter(x => Math.abs(x.r.top - maxTop) <= 6).sort((a, b) => a.r.left - b.r.left)
    return {
      ids: ranked.map(r => r.id),
      lastByOrder: (ranked[ranked.length - 1] || {}).id,
      lastByGeometry: (lastRow[lastRow.length - 1] || {}).id
    }
  })
  // 默认真实顺序（未渲染的卡会被 store 有无数据过滤掉，故按「子序列」校验）
  const EXPECT_ORDER = [
    'quick-add-todo', 'quick-add-note', 'countdowns', 'ledger',
    'habits', 'notes', 'todo-stats', 'todos',
    'exercise', 'diet', 'sleep', 'weight', 'passwords',
    'pending-todos', 'upcoming', 'calendar-anchor', 'weather'
  ]
  let cursor = 0
  const subsequence = order.ids.every(id => {
    const at = EXPECT_ORDER.indexOf(id, cursor)
    if (at < 0) return false
    cursor = at + 1
    return true
  })
  check('S4-6 默认顺序与纸面稿一致（输入带 → 数字带 → 列表带）', subsequence, order.ids.join(','))
  check('S4-7 天气卡固定收尾（顺序末位）', order.lastByOrder === 'weather', order.lastByOrder)
  check('S4-8 天气卡视觉上在末行最右', order.lastByGeometry === 'weather', order.lastByGeometry)

  /* ---------- S5 状态保留 ---------- */
  await page.locator('[data-testid="wb-menu-todos"]').click()
  await page.waitForFunction(() => !document.querySelector('.wb-content .ewt-skeleton'), { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(400)
  const marked = await page.evaluate(() => {
    const c = document.querySelector('.wb-content')
    const panel = [...c.children].find(el => !el.hasAttribute('data-testid') || el.getAttribute('data-testid') !== 'wb-page-head')
    if (!panel) return false
    panel.setAttribute('data-qa-keepalive', '1')
    return true
  })
  await page.locator('[data-testid="wb-menu-notes"]').click()
  await page.waitForTimeout(350)
  await page.locator('[data-testid="wb-menu-todos"]').click()
  await page.waitForTimeout(350)
  check('S5-1 KeepAlive：切走再回来面板 DOM 未重建', marked && await page.locator('[data-qa-keepalive="1"]').count() === 1)
  await page.locator('[data-testid="wb-menu-health"]').click()
  await page.waitForSelector('[data-testid="hd-tabs"]', { timeout: 30000 })
  const url1 = await page.evaluate(() => location.search)
  check('S5-2 健康 section + 子 tab 写入 URL', /section=health/.test(url1) && /tab=/.test(url1), url1)
  const sleepTab = page.locator('[data-testid="hd-tab-sleep"]')
  if (await sleepTab.count()) {
    await sleepTab.first().click()
    await page.waitForTimeout(250)
    check('S5-3 切换子 tab 后 URL 同步', /tab=sleep/.test(await page.evaluate(() => location.search)), await page.evaluate(() => location.search))
  } else {
    check('S5-3 切换子 tab 后 URL 同步', false, '未找到 hd-tab-sleep')
  }

  /* ---------- S6 溢出 / 亮暗 / 移动 / JS 异常 ---------- */
  check('S6-1 桌面无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(200)
  check('S6-2 暗色下底部两枚按钮仍可见', await page.evaluate(() => {
    const f = document.querySelector('[data-testid="wb-side-foot"]').getBoundingClientRect()
    return f.bottom <= window.innerHeight + 1 && f.height > 20
  }))
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  check('S6-3 窄屏无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  check('S6-4 窄屏侧栏默认收起、页头按钮可见', await page.evaluate(() => {
    const s = document.querySelector('.wb-menu').getBoundingClientRect()
    const app = document.querySelector('.wb-body').getBoundingClientRect()
    const t = document.querySelector('[data-testid="wb-menu-trigger"]')
    return s.right <= app.left + 1 && !!t && getComputedStyle(t).display !== 'none'
  }))
  // 窄屏抽屉打开后，底部仍是一行两枚纯文字按钮（折叠态的图标降级要在抽屉里还原）
  await page.locator('[data-testid="wb-menu-trigger"]').click()
  await page.waitForTimeout(300)
  const mobileFoot = await page.evaluate(() => {
    const f = document.querySelector('[data-testid="wb-side-foot"]')
    const bs = [...f.querySelectorAll('button')]
    const r = x => x.getBoundingClientRect()
    return {
      sameRow: Math.abs(r(bs[0]).top - r(bs[1]).top) <= 1,
      texts: bs.map(b => b.innerText.trim()).join(','),
      iconsHidden: bs.every(b => getComputedStyle(b.querySelector('.wb-side-btn-ic')).display === 'none')
    }
  })
  check('S6-5 窄屏抽屉底部仍一行两枚纯文字按钮',
    mobileFoot.sameRow && mobileFoot.texts === '云同步,设置' && mobileFoot.iconsHidden, JSON.stringify(mobileFoot))
  check('S6-6 窄屏抽屉隐藏侧边栏折叠按钮（避免出现死按钮）', await page.evaluate(() => {
    const b = document.querySelector('[data-testid="wb-sidebar-toggle"]')
    return !!b && getComputedStyle(b).display === 'none'
  }))
  check('S6-7 全过程无页面级 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '))

  const failed = results.filter(r => !r.ok)
  console.log(`\n[qa] ${results.length - failed.length}/${results.length} passed`)
  if (failed.length) process.exitCode = 1
  await ctx.close()
} finally {
  await browser.close()
  if (server) server.kill()
}
