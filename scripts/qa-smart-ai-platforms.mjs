/**
 * 智能工作台 · AI 平台入口页 QA
 * ------------------------------------------------------------------
 * 来源：src/views/SmartView.vue「AI 平台」页签（组件 src/components/smart/AiPlatform*）。
 * 覆盖：页签与预置卡、新增与持久化、URL 校验、置顶排序、删除墓碑、
 *      独立窗口复用与 opener=null、移动端当前标签打开、弹窗被拦降级。
 *
 * 前置：先起开发服务 `npm run dev`（默认 16718），或用 QA_BASE 指定其它地址。
 * 运行：`npm run qa:smart-ai`
 */
import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const BASE = process.env.QA_BASE || 'http://localhost:16718'
/** 该页签在左侧菜单里的 testid */
const NAV = '[data-testid="smart-nav-platforms"]'

async function closeHelp(page) {
  const k = page.getByRole('button', { name: '知道了' })
  await k.first().waitFor({ state: 'visible', timeout: 2500 }).catch(() => {})
  if (await k.count()) { await k.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(280) }
  if (await page.locator('.help-dialog').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(220) }
}

async function gotoPlatforms(page) {
  await page.goto(BASE + '/smart', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
  await closeHelp(page)
  await page.locator(NAV).click({ force: true })
  await page.waitForTimeout(700)
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  // ---------- 1. 页签与卡片 ----------
  await gotoPlatforms(page)
  assert.equal(await page.locator('.ap-card').count(), 10, '默认应有 10 张预置卡')
  const nav = await page.locator(NAV).innerText()
  assert.match(nav.replace(/\s+/g, ' '), /智能网页端 10/, '菜单计数应为 10')
  console.log('✓ 页签与 10 张预置卡')

  // ---------- 2. 新增 + 持久化 ----------
  await page.click('[data-testid="ai-platform-add"]')
  await page.waitForTimeout(500)
  // 弹框内容不溢出：面板底边应包住最后一个控件
  const fit = await page.evaluate(() => {
    const panel = document.querySelector('.bd-panel') || document.querySelector('[class*="bd-"]')
    const last = document.querySelector('.apf-icon-row')
    if (!panel || !last) return { ok: false }
    return { ok: last.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom + 1 }
  })
  assert.ok(fit.ok, '弹框应完整容纳最后一个控件')

  await page.fill('[data-testid="ai-platform-editor-name"]', '测试网页 A')
  await page.fill('[data-testid="ai-platform-editor-url"]', 'example.com/chat')
  await page.fill('[data-testid="ai-platform-editor-account"]', '尾号 8899')
  await page.click('[data-testid="ai-platform-editor-save"]')
  await page.waitForTimeout(600)
  assert.equal(await page.locator('.ap-card').count(), 11, '保存后应 11 张卡')
  assert.equal(await page.locator('[data-testid="ai-platform-editor-name"]').count(), 0, '保存后弹框应关闭')
  console.log('✓ 新增网页并关闭弹框')

  await gotoPlatforms(page)
  assert.equal(await page.locator('.ap-card').count(), 11, '刷新后仍 11 张（已落 IDB）')
  const saved = await page.locator('.ap-card', { hasText: '测试网页 A' }).count()
  assert.equal(saved, 1, '新平台应持久化')
  console.log('✓ 刷新后仍存在（持久化生效）')

  // ---------- 3. URL 校验 ----------
  await page.click('[data-testid="ai-platform-add"]')
  await page.waitForTimeout(400)
  await page.fill('[data-testid="ai-platform-editor-name"]', '坏链接网页')
  await page.fill('[data-testid="ai-platform-editor-url"]', 'javascript:alert(1)')
  await page.locator('[data-testid="ai-platform-editor-url"]').blur()
  await page.waitForTimeout(250)
  const hint = await page.locator('.apf-hint').first().innerText()
  assert.match(hint, /不允许的协议/, '危险协议应被拦')
  await page.click('[data-testid="ai-platform-editor-save"]')
  await page.waitForTimeout(400)
  assert.equal(await page.locator('.ap-card').count(), 11, '校验失败不应新增')
  // 编辑弹框刻意禁用 ESC / 点遮罩关闭，这里必须点底部「取消」
  await page.locator('.bd-footer button', { hasText: '取消' }).first().click({ force: true })
  await page.waitForTimeout(300)
  console.log('✓ URL 校验拦截 javascript:')

  // ---------- 4. 置顶 ----------
  const firstBefore = await page.locator('.ap-card').first().innerText()
  const target = page.locator('.ap-card', { hasText: 'Kimi' }).first()
  await target.locator('.ap-flag').first().click()
  await page.waitForTimeout(500)
  const firstAfter = await page.locator('.ap-card').first().innerText()
  assert.match(firstAfter, /Kimi/, `置顶后 Kimi 应在首位（原首位：${firstBefore.split('\n')[0]}）`)
  assert.equal(await page.locator('.ap-card.is-pinned').count(), 1, '应有 1 张置顶卡')
  console.log('✓ 置顶排序生效')

  // ---------- 5. 独立窗口复用 + opener ----------
  const kimi = page.locator('.ap-card', { hasText: 'Kimi' }).first()
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }), kimi.locator('.ap-btn, .ui-btn--primary').first().click()])
  await popup.waitForLoadState('domcontentloaded').catch(() => {})
  assert.match(popup.url(), /^https:\/\//, '应打开 https 页面')
  const openerVal = await popup.evaluate(() => window.opener)
  assert.equal(openerVal, null, 'opener 应被置 null')
  const pagesBefore = ctx.pages().length
  await kimi.locator('.ui-btn--primary').first().click()
  await page.waitForTimeout(900)
  assert.equal(ctx.pages().length, pagesBefore, '命名窗口应复用，不应新增页面')
  console.log('✓ 独立窗口：opener=null 且二次点击复用')

  // ---------- 6. 删除（墓碑） ----------
  await kimi.locator('.ui-btn--danger').first().click()
  await page.waitForTimeout(600)
  await page.locator('.confirm-panel .btn-submit, button.btn-submit').last().click()
  await page.waitForTimeout(600)
  assert.equal(await page.locator('.ap-card', { hasText: 'Kimi' }).count(), 0, '删除后卡片消失')
  const tomb = await page.evaluate(async () => {
    const raw = localStorage.getItem('ewt-nav-prefs:smart-ai-platforms')
    return raw || null
  })
  console.log('✓ 删除后卡片消失（墓碑落库，localStorage 影子可见：' + (tomb ? 'yes' : 'no') + '）')

  // ---------- 7. 移动端当前标签打开 ----------
  const mobile = await ctx.newPage()
  await mobile.setViewportSize({ width: 375, height: 780 })
  await mobile.goto(BASE + '/smart', { waitUntil: 'domcontentloaded' })
  await mobile.waitForTimeout(2200)
  const mk = mobile.getByRole('button', { name: '知道了' })
  if (await mk.count()) { await mk.first().click({ force: true }).catch(() => {}); await mobile.waitForTimeout(250) }
  await mobile.locator(NAV).click({ force: true })
  await mobile.waitForTimeout(700)
  const beforePages = ctx.pages().length
  await mobile.locator('.ap-card .ui-btn--primary').first().click()
  await mobile.waitForTimeout(1500)
  assert.equal(ctx.pages().length, beforePages, '移动端不应新开页面')
  assert.ok(!mobile.url().includes('/smart'), `移动端应跳转到平台页，当前：${mobile.url()}`)
  console.log('✓ 移动端 375px：当前标签跳转')

  // ---------- 8. 弹窗被拦降级 ----------
  const blocked = await ctx.newPage()
  await blocked.addInitScript(() => { window.open = () => null })
  await blocked.goto(BASE + '/smart', { waitUntil: 'domcontentloaded' })
  await blocked.waitForTimeout(2200)
  const bk = blocked.getByRole('button', { name: '知道了' })
  if (await bk.count()) { await bk.first().click({ force: true }).catch(() => {}); await blocked.waitForTimeout(250) }
  await blocked.locator(NAV).click({ force: true })
  await blocked.waitForTimeout(700)
  const [tab] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 8000 }),
    blocked.locator('.ap-card .ui-btn--primary').first().click()
  ])
  assert.match(tab.url(), /^https:\/\//, 'window.open 被拦时应降级为 <a> 新标签')
  console.log('✓ window.open 被拦 → <a> 新标签兜底')

  // ---------- 9. 控制台错误 ----------
  assert.deepEqual(errors, [], `不应有页面异常：${errors.join(' | ')}`)
  console.log('✓ 无页面异常')

  await browser.close()
  console.log('\nALL PASS')
})().catch((e) => {
  console.error('✗ FAIL:', e.message)
  process.exit(2)
})
