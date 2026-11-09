/**
 * QA：个人工作台「留言板」面板
 *
 * 断言：
 *  S1 侧栏「日常」分组里留言板紧跟日记；切换入口在搜索上方
 *  S2 新增留言 → 卡片出现（标题 / 正文 / 色调）
 *  S3 编辑 → 内容更新；置顶 → 排在首位且带徽标
 *  S4 刷新后仍在（IDB 持久化）；关键词筛选生效
 *  S5 删除 → 卡片消失、墓碑进入统一回收站、可还原
 *  S6 亮/暗色 + 移动端 375px 无横向溢出、无页面级 JS 异常
 *
 * 用法：node scripts/qa-workbench-messages.mjs
 *      BASE=http://localhost:16719 node scripts/qa-workbench-messages.mjs
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

/** 清空留言板（含墓碑），保证每次运行从同一空态开始 */
async function resetMessages(page) {
  await page.evaluate(async () => {
    const { useWorkbenchMessagesStore } = await import('/src/stores/workbenchMessages.ts')
    const s = useWorkbenchMessagesStore()
    await s.loadMessages()
    for (const m of [...s.messages]) await s.purgeMessage(m.id)
  })
}

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)))

  await page.goto(base + '/workbench?section=messages', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="mb-panel"]', { timeout: 120000 })
  await resetMessages(page)
  await page.reload({ waitUntil: 'commit' })
  await page.waitForSelector('[data-testid="mb-panel"]', { timeout: 120000 })

  /* ---------- S1 菜单位置 + 切换入口 ---------- */
  const nav = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.wb-side-nav .wb-menu-item')].map(e => e.getAttribute('data-testid'))
    const top = [...(document.querySelector('.wb-side-top')?.children ?? [])].map(e => e.getAttribute('data-testid'))
    return { items, top }
  })
  check('S1-1 留言板紧跟日记且在「日常」分组',
    nav.items.indexOf('wb-menu-messages') === nav.items.indexOf('wb-menu-diary') + 1,
    `diary=${nav.items.indexOf('wb-menu-diary')} messages=${nav.items.indexOf('wb-menu-messages')}`)
  check('S1-2 切换入口在搜索上方',
    nav.top[0] === 'wb-page-switcher' && nav.top[1] === 'wb-spotlight-open', JSON.stringify(nav.top))

  /* ---------- S2 新增 ---------- */
  await page.locator('[data-testid="mb-add-button"]').click()
  await page.waitForSelector('[data-testid="mb-dialog"]', { timeout: 10000 })
  await page.locator('[data-testid="mb-form-title"]').fill('周末提醒')
  await page.locator('[data-testid="mb-form-content"]').fill('记得给自己放个假\n别一直盯着屏幕')
  check('S2-0 色调控件已换为取色器（固定色板已移除）',
    await page.locator('[data-testid="mb-form-color-picker"]').count() === 1 &&
    await page.locator('[data-testid="mb-color-primary"]').count() === 0)
  // 不碰取色器直接保存 → 应得到预置的随机色
  const initialColor = (await page.locator('.message-color-hint').innerText()).trim()
  check('S2-0b 未选色时已预置随机色（取色器 modelValue 合法）',
    /^#[0-9a-f]{6}/i.test(initialColor), initialColor)
  await page.locator('[data-testid="mb-form-color-random"]').click()
  check('S2-0c 「随机一个」按钮可用',
    /^#[0-9a-f]{6}/i.test((await page.locator('.message-color-hint').innerText()).trim()))
  await page.locator('[data-testid="mb-form-save"]').click()
  await page.waitForSelector('[data-testid^="mb-card-"]', { timeout: 10000 })
  const card = page.locator('[data-testid^="mb-card-"]').first()
  const cardId = (await card.getAttribute('data-testid')).replace('mb-card-', '')
  check('S2-1 新增后卡片出现且为 1 张', await page.locator('[data-testid^="mb-card-"]').count() === 1)
  check('S2-2 标题与正文正确',
    (await page.locator(`[data-testid="mb-title-${cardId}"]`).innerText()).trim() === '周末提醒' &&
    (await page.locator(`[data-testid="mb-content-${cardId}"]`).innerText()).includes('别一直盯着屏幕'))
  const tone = await card.evaluate(el => ({ cls: el.className, custom: (el.style.getPropertyValue('--mb-custom') || '').trim() }))
  check('S2-3 未选颜色时自动随机一个自定义色',
    tone.cls.includes('is-custom') && /^#[0-9a-f]{6}$/i.test(tone.custom), JSON.stringify(tone))
  const sameColor = await page.evaluate((id) => {
    const c = document.querySelector(`[data-testid="mb-card-${id}"]`)
    const b = document.querySelector(`[data-testid="mb-marquee-item-${id}"]`)
    if (!c || !b) return null
    return { card: getComputedStyle(c).backgroundColor, bubble: getComputedStyle(b).backgroundColor }
  }, cardId)
  check('S2-4 弹幕胶囊背景与对应卡片颜色一致',
    !!sameColor && sameColor.card === sameColor.bubble, JSON.stringify(sameColor))
  const withDate = await page.evaluate((id) => {
    const b = document.querySelector(`[data-testid="mb-marquee-item-${id}"]`)
    return b?.querySelector('.message-marquee-date')?.textContent?.trim() ?? ''
  }, cardId)
  check('S2-5 弹幕标题前带年月日', /^\d{4}-\d{2}-\d{2}$/.test(withDate), withDate)

  /* ---------- S3 卡片点击详情 + 编辑 + 置顶 ---------- */
  check('S3-0 卡片上已无置顶/编辑/删除按钮',
    await page.locator('.message-card [data-testid^="mb-edit-"]').count() === 0 &&
    await page.locator('.message-card [data-testid^="mb-pin-"]').count() === 0 &&
    await page.locator('.message-card [data-testid^="mb-delete-"]').count() === 0)
  await page.locator(`[data-testid="mb-card-${cardId}"]`).click()
  await page.waitForSelector('[data-testid="mb-detail-dialog"]', { timeout: 10000 })
  check('S3-0b 点击整张卡片可打开详情弹框',
    (await page.locator('[data-testid="mb-detail-content"]').innerText()).includes('别一直盯着屏幕'))
  await page.locator(`[data-testid="mb-edit-${cardId}"]`).click()
  await page.locator('[data-testid="mb-form-content"]').fill('改成：先去散步')
  // 取色器必须真能选色：点面板里的预设色块，保存后卡片应使用这个颜色
  await page.locator('[data-testid="mb-form-color-picker"]').click()
  await page.locator('.el-color-predefine__color-selector > div').first().click()
  await page.waitForTimeout(250)
  const pickedHex = (await page.locator('.message-color-hint').innerText()).trim().slice(0, 7).toUpperCase()
  await page.locator('[data-testid="mb-form-save"]').click()
  await page.waitForFunction((id) => document.querySelector(`[data-testid="mb-content-${id}"]`)?.textContent?.includes('先去散步'), cardId, { timeout: 10000 })
  check('S3-1 从详情编辑后正文更新', (await page.locator(`[data-testid="mb-content-${cardId}"]`).innerText()).includes('先去散步'))
  const savedColor = (await card.evaluate(el => el.style.getPropertyValue('--mb-custom').trim())).toUpperCase()
  check('S3-1b 取色器选色已生效到卡片', /^#[0-9A-F]{6}$/.test(pickedHex) && savedColor === pickedHex,
    `picked=${pickedHex} saved=${savedColor}`)

  await page.locator('[data-testid="mb-add-button"]').click()
  await page.locator('[data-testid="mb-form-content"]').fill('第二条留言')
  await page.locator('[data-testid="mb-form-save"]').click()
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="mb-card-"]').length === 2, null, { timeout: 10000 })
  await page.locator(`[data-testid="mb-card-${cardId}"]`).click()
  await page.waitForSelector('[data-testid="mb-detail-dialog"]', { timeout: 10000 })
  await page.locator(`[data-testid="mb-pin-${cardId}"]`).click()
  await page.locator('[data-testid="mb-detail-close"]').click()
  await page.waitForSelector('[data-testid="mb-pin-badge"]', { timeout: 10000 })
  const firstId = (await page.locator('[data-testid^="mb-card-"]').first().getAttribute('data-testid')).replace('mb-card-', '')
  check('S3-2 详情内置顶后该卡排在首位且有徽标', firstId === cardId && await page.locator('[data-testid="mb-pin-badge"]').count() === 1)

  /* ---------- S4 持久化 + 筛选 ---------- */
  await page.reload({ waitUntil: 'commit' })
  await page.waitForSelector('[data-testid="mb-panel"]', { timeout: 120000 })
  check('S4-1 刷新后两张卡与置顶状态仍在',
    await page.locator('[data-testid^="mb-card-"]').count() === 2 &&
    (await page.locator('[data-testid^="mb-card-"]').first().getAttribute('data-testid')).includes(cardId))
  await page.locator('[data-testid="mb-search-input"]').fill('散步')
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="mb-card-"]').length === 1, null, { timeout: 10000 })
  check('S4-2 关键词筛选命中正文', await page.locator('[data-testid^="mb-card-"]').count() === 1)
  await page.locator('[data-testid="mb-search-input"]').fill('')

  /* ---------- S5 删除（详情弹框内）→ 回收站 → 还原 ---------- */
  await page.locator(`[data-testid="mb-card-${cardId}"]`).click()
  await page.waitForSelector('[data-testid="mb-detail-dialog"]', { timeout: 10000 })
  await page.locator(`[data-testid="mb-delete-${cardId}"]`).click()
  await page.waitForSelector('.bd-overlay .btn-submit', { timeout: 10000 })
  await page.locator('.bd-overlay .btn-submit').last().click()
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="mb-card-"]').length === 1, null, { timeout: 10000 })
  check('S5-1 删除后卡片消失', await page.locator('[data-testid^="mb-card-"]').count() === 1)
  await page.locator('[data-testid="wb-menu-trash"]').click()
  await page.waitForSelector('[data-testid="trash-section-messages"]', { timeout: 30000 })
  check('S5-2 统一回收站出现留言板分区', await page.locator('[data-testid="trash-section-messages"]').count() === 1)
  const restoreBtn = page.locator('[data-testid="trash-section-messages"] .rt-ops button').first()
  if (await restoreBtn.count()) {
    await restoreBtn.click()
    await page.waitForTimeout(400)
  }
  await page.locator('[data-testid="wb-menu-messages"]').click()
  await page.waitForSelector('[data-testid="mb-panel"]', { timeout: 30000 })
  check('S5-3 回收站还原后卡片回到留言板',
    await page.locator('[data-testid^="mb-card-"]').count() === 2)

  /* ---------- S6 暗色 / 移动端 ---------- */
  const dark = await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    const c = document.querySelector('.message-card')
    const s = getComputedStyle(c)
    return { bg: s.backgroundColor, border: s.borderLeftColor, color: s.color }
  })
  // 自定义色走 color-mix，计算值可能是 rgb() 也可能是 color(srgb r g b)（0~1 浮点）
  const rgbOf = (bg) => {
    const a = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (a) return [Number(a[1]), Number(a[2]), Number(a[3])]
    const b = bg.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
    if (b) return [Number(b[1]), Number(b[2]), Number(b[3])].map(v => v * 255)
    return null
  }
  const darkRgb = rgbOf(dark.bg)
  check('S6-1 暗色下卡面取深色 token（不是浅色补丁）',
    !!darkRgb && darkRgb.reduce((s, v) => s + v, 0) < 420, JSON.stringify(dark))
  await page.evaluate(() => document.documentElement.classList.remove('dark'))

  const mobCtx = await browser.newContext({ viewport: { width: 375, height: 760 }, storageState: { cookies: [], origins: [] } })
  const mob = await mobCtx.newPage()
  mob.on('pageerror', e => errs.push('[mobile] ' + String(e.message).slice(0, 140)))
  await mob.goto(base + '/workbench?section=messages', { waitUntil: 'commit', timeout: 120000 })
  await mob.waitForSelector('[data-testid="mb-panel"]', { timeout: 120000 })
  // 移动端是独立浏览器上下文（IDB 为空），先灌一条留言让卡片网格真正渲染出来
  await mob.evaluate(async () => {
    const { useWorkbenchMessagesStore } = await import('/src/stores/workbenchMessages.ts')
    const s = useWorkbenchMessagesStore()
    await s.loadMessages()
    await s.addMessage({ title: '移动端检查', content: '检查窄屏是否单列、无横向溢出' })
  })
  await mob.waitForSelector('[data-testid="mb-grid"]', { timeout: 10000 })
  const overflow = await mob.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    gridCols: getComputedStyle(document.querySelector('.message-grid')).gridTemplateColumns.split(' ').length
  }))
  check('S6-2 移动端无横向溢出且卡片单列', overflow.doc <= 1 && overflow.gridCols === 1, JSON.stringify(overflow))
  await mobCtx.close()

  check('S6-3 全过程无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))
  await ctx.close()

  const failed = results.filter(r => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server) server.kill()
}
