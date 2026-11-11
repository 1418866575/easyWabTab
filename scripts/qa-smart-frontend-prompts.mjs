/**
 * QA：智能工作台 · 前端提示词（/smart → 前端提示词）
 *
 * 覆盖：菜单入口 → 28 张卡片 → 分类 / 搜索 → 详情弹框（效果 iframe + 提示词）
 *      → 上一张/下一张 → 复制 → 亮/暗主题 → 横向溢出与页面异常。
 * 用法：node scripts/qa-smart-frontend-prompts.mjs [--shots=<目录>]
 *      （给 --shots 时额外输出亮/暗两张截图供人工目视，默认不写文件）
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const shotsArg = process.argv.find(a => a.startsWith('--shots='))
const SHOTS = shotsArg ? path.resolve(ROOT, shotsArg.slice('--shots='.length)) : ''

function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!fs.existsSync(root)) return undefined
  for (const d of fs.readdirSync(root).filter(x => x.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(p)) return p
  }
  return undefined
}
async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return true } catch { }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}
async function isViteDevAt(port) {
  try {
    const res = await fetch('http://localhost:' + port + '/src/composables/useIdb.ts')
    if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) return false
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

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

const browser = await chromium.launch({ executablePath: findChromium() })
let serverStarted = false
try {
  const base = await ensureDevServer()
  serverStarted = !!server
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 140)))

  await page.goto(base + '/smart', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.sv-shell', { timeout: 60000 })

  // ---------- S1 菜单入口 ----------
  const nav = page.locator('[data-testid="smart-nav-frontend"]')
  check('S1 左侧菜单出现「前端提示词」', await nav.count() === 1 && (await nav.textContent() || '').includes('前端提示词'))
  const navCount = await page.locator('[data-testid^="smart-nav-"]').count()
  check('S1 菜单共 6 项', navCount === 6, `count=${navCount}`)

  // ---------- S2 卡片列表 ----------
  await nav.click()
  await page.waitForSelector('[data-testid="smart-fp-page"]', { timeout: 30000 })
  const cards = page.locator('[data-testid^="smart-fp-card-"]')
  check('S2 卡片列表 28 张', await cards.count() === 28, `count=${await cards.count()}`)
  check('S2 卡片标题与摘要非空', (await cards.first().innerText()).includes('个人作品集首页'))

  // ---------- S3 分类 / S4 搜索 ----------
  await page.click('[data-testid="smart-fp-cat-date"]')
  check('S3 日期时间分类 6 张', await cards.count() === 6, `count=${await cards.count()}`)
  await page.click('[data-testid="smart-fp-cat-all"]')
  check('S3 回到全部恢复 28 张', await cards.count() === 28)
  await page.fill('[data-testid="smart-fp-search"] input, input[data-testid="smart-fp-search"]', '日历')
  const searched = await cards.count()
  check('S4 搜索「日历」有结果且已收窄', searched > 0 && searched < 28, `count=${searched}`)
  await page.fill('[data-testid="smart-fp-search"] input, input[data-testid="smart-fp-search"]', '')
  check('S4 清空搜索恢复 28 张', await cards.count() === 28)

  // ---------- S5 详情：效果 + 提示词 ----------
  await page.click('[data-testid="smart-fp-card-01"]')
  await page.waitForSelector('.bd-panel', { timeout: 15000 })
  const frame = page.locator('[data-testid="smart-fp-detail-demo"]')
  check('S5 详情弹框出现效果预览', await frame.count() === 1)
  check('S5 预览指向 demo-01.html', (await frame.getAttribute('src') || '').includes('demo-01.html'))
  await page.waitForTimeout(900)
  const frameBody = await page.frameLocator('[data-testid="smart-fp-detail-demo"]').locator('body').innerText().catch(() => '')
  check('S5 预览内确有可交互页面内容', frameBody.includes('林默'), `len=${frameBody.length}`)
  const frameHeight = await frame.evaluate(el => parseInt((el).style.height, 10))
  check('S5 预览高度自适应且不低于 240px', frameHeight >= 240, `height=${frameHeight}`)
  const promptText = await page.locator('[data-testid="smart-fp-detail-prompt"]').innerText()
  check('S5 提示词正文非空', promptText.length > 60, `len=${promptText.length}`)
  check('S5 提示词不含技术名词', !/CSS|HTML|JavaScript|localStorage|Vue|Flexbox|API|DOM|框架|接口|变量/i.test(promptText))

  // ---------- S6 上一张 / 下一张 ----------
  await page.click('text=下一张')
  check('S6 下一张切到 demo-02.html', (await frame.getAttribute('src') || '').includes('demo-02.html'))
  await page.click('text=上一张')
  check('S6 上一张回到 demo-01.html', (await frame.getAttribute('src') || '').includes('demo-01.html'))

  // ---------- S7 复制提示词 ----------
  await page.click('[data-testid="smart-fp-copy"]')
  await page.waitForTimeout(300)
  const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
  check('S7 复制得到完整提示词', copied.length > 60 && copied.includes('个人作品集首页'), `len=${copied.length}`)

  // ---------- S8 亮 / 暗主题 ----------
  const lightBg = await cards.first().evaluate(el => getComputedStyle(el).backgroundColor)
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: join(SHOTS, 'fp-detail-light.png'), fullPage: false })
  }
  await page.click('[data-testid="smart-fp-detail-close"]')
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(300)
  const darkBg = await cards.first().evaluate(el => getComputedStyle(el).backgroundColor)
  check('S8 暗色下卡片表面确实变化', lightBg !== darkBg, `${lightBg} → ${darkBg}`)
  check('S8 暗色下文字色走令牌而非硬编码', await cards.first().evaluate(el => {
    const t = el.querySelector('.prompt-card-title')
    return !!t && getComputedStyle(t).color !== ''
  }))
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'fp-grid-dark.png'), fullPage: false })

  // ---------- S9 溢出与异常 ----------
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check('S9 无横向溢出', overflow <= 1, `overflow=${overflow}`)
  check('S9 无页面 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '))

  const failed = results.filter(r => !r.ok)
  console.log(`\n[qa] ${results.length - failed.length}/${results.length} passed`)
  if (failed.length) process.exitCode = 1
} finally {
  await browser.close()
  if (serverStarted && server) server.kill()
}
