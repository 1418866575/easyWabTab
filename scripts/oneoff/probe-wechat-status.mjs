/**
 * 只读核验：打开某篇文章的编辑器，读出「发送公众号草稿箱」按钮的当前状态，
 * 判断这篇到底发没发出去。绝不点发送按钮。
 *
 * 用法：node scripts/probe-wechat-status.mjs "<文章标题>"
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
const out = {}
try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('input[type=file][accept*=".md"]').first().waitFor({ state: 'attached', timeout: 40000 })
  await page.waitForTimeout(2000)
  await page.getByText(TITLE, { exact: true }).first().click()
  await page.locator('[data-testid="blog-editor-title"]').first().waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(2500)
  for (const id of ['blog-editor-wechat-ok', 'blog-editor-wechat-error', 'blog-editor-publish-wechat-top']) {
    const el = page.locator(`[data-testid="${id}"]`).first()
    out[id] = {
      exists: (await el.count()) > 0,
      visible: await el.isVisible().catch(() => false),
      text: ((await el.textContent().catch(() => '')) || '').trim().slice(0, 160)
    }
  }
  out.toolbarText = ((await page.locator('.editor-toolbar, .be-toolbar, header').first().textContent().catch(() => '')) || '')
    .replace(/\s+/g, ' ')
    .slice(0, 400)
} catch (e) {
  out.error = String(e.message || e).slice(0, 300)
}
console.log(JSON.stringify(out, null, 2))
await browser.close()
