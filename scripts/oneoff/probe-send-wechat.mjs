/**
 * 诊断：点一次「发布到公众号」，把网络请求/响应、toast、弹窗内容全打出来，
 * 搞清为什么 await 标记一直不出现（发不出去 / 发出去但 UI 不更新）。
 * 用法：node scripts/probe-send-wechat.mjs "<文章标题>"
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { chromium } from 'playwright'

const TITLE = process.argv[2]
const PROFILE = path.join(os.homedir(), 'AppData', 'Local', 'ewt-blog-agent-profile')
const SITE = 'https://www.codehelp.com.cn/blog/admin'

function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!fs.existsSync(root)) return undefined
  for (const d of fs.readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(p)) return p
  }
  return undefined
}

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: findChromium(),
  headless: true,
  viewport: { width: 1440, height: 950 }
})
const page = browser.pages()[0] || (await browser.newPage())
const net = []
page.on('response', async (r) => {
  const u = r.url()
  if (!/wechat|weixin|cgi-bin|draft|cover/i.test(u)) return
  let body = ''
  try {
    body = (await r.text()).slice(0, 300)
  } catch {
    body = '(no body)'
  }
  net.push({ status: r.status(), url: u.slice(0, 160), body: body.replace(/\s+/g, ' ') })
})
page.on('requestfailed', (r) => {
  if (/wechat|weixin|cgi-bin/i.test(r.url())) net.push({ failed: r.url().slice(0, 160), err: r.failure()?.errorText })
})

const out = {}
try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('input[type=file][accept*=".md"]').first().waitFor({ state: 'attached', timeout: 40000 })
  await page.waitForTimeout(2000)
  await page.getByText(TITLE, { exact: true }).first().click()
  await page.locator('[data-testid="blog-editor-title"]').first().waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.locator('[data-testid="blog-editor-publish-wechat-top"]').first().click()

  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000)
    const ok = await page.locator('[data-testid="blog-editor-wechat-ok"]').first().isVisible().catch(() => false)
    if (ok) {
      out.marker = 'ok'
      out.markerText = ((await page.locator('[data-testid="blog-editor-wechat-ok"]').first().textContent()) || '').trim()
      break
    }
    const err = page.locator('[data-testid="blog-editor-wechat-error"]').first()
    if (await err.isVisible().catch(() => false)) {
      out.marker = 'error'
      out.markerText = ((await err.textContent()) || '').trim()
      break
    }
    const box = page.locator('.el-message-box').first()
    if (await box.isVisible().catch(() => false)) {
      out.dialog = ((await box.textContent()) || '').replace(/\s+/g, ' ').slice(0, 300)
      const btn = page.locator('.el-message-box__btns .el-button--primary').first()
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {})
        out.dialogClicked = true
      }
    }
  }
  out.toasts = await page
    .evaluate(() => Array.from(document.querySelectorAll('.toast-container .toast')).map((n) => n.textContent.trim()))
    .catch(() => [])
  out.button = ((await page.locator('[data-testid="blog-editor-publish-wechat-top"]').first().textContent()) || '').trim()
} catch (e) {
  out.error = String(e.message || e).slice(0, 300)
}
out.net = net.slice(-12)
console.log(JSON.stringify(out, null, 2))
await browser.close()
