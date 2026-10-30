/**
 * QA：智能工作台（/smart）的四页切换与 KeepAlive 缓存
 *
 * 背景：SmartView 的右侧内容区曾把四个页面写成 <KeepAlive> 下的四条并列 v-if 分支，
 *      Vue 模板编译直接报 "<KeepAlive> expects exactly one child component"，
 *      整条 /smart 路由 500 白屏（且构建同样会失败）。现已收敛为单个 <component :is>。
 *      本脚本守住三件事：
 *      ① 路由能渲染（不再 500）；② 四页都能切换且内容非空；
 *      ③ KeepAlive 真的还在工作 —— 技能页的搜索词切走再切回必须保留；
 *      ④ 概览统计卡的 goto 事件没有因为改成动态组件而丢。
 *
 * 用法：node scripts/qa-smart-keepalive.mjs
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

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

const MENU = [
  { key: 'overview', label: '概览', marker: '.ov-wrap' },
  { key: 'skills', label: '技能', marker: '[data-testid="smart-skill-search"]' },
  { key: 'prompts', label: '提示词', marker: '.sv-content :is(input, .pm-wrap)' },
  { key: 'workflows', label: '工作流', marker: '.sv-content :is(button, .wm-wrap)' }
]

const browser = await chromium.launch({ executablePath: findChromium() })
let serverStarted = false
try {
  const base = await ensureDevServer()
  serverStarted = !!server
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)))

  // ---------- S1 路由能渲染（不再是 500 白屏） ----------
  const resp = await page.goto(base + '/smart', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.sv-shell', { timeout: 60000 })
  check('S1 /smart 渲染出 .sv-shell', await page.locator('.sv-shell').count() > 0)
  check('S1 HTTP 200（不是编译 500）', (resp?.status() ?? 0) < 400, String(resp?.status()))
  check('S1 右侧内容区有子节点', await page.locator('.sv-content > *').count() > 0)

  // ---------- S2 四个菜单页都能切 ----------
  for (const m of MENU) {
    await page.click(`.sv-nav-item:has-text("${m.label}")`)
    await page.waitForTimeout(500)
    const n = await page.locator('.sv-content > *').count()
    check(`S2 切到「${m.label}」有渲染内容`, n > 0, `children=${n}`)
  }

  // ---------- S3 KeepAlive：搜索词切走再切回必须保留 ----------
  await page.click('.sv-nav-item:has-text("技能")')
  await page.waitForTimeout(400)
  const kw = 'KeepAlive-探针'
  await page.fill('[data-testid="smart-skill-search"] input, input[data-testid="smart-skill-search"]', kw).catch(async () => {
    await page.locator('[data-testid="smart-skill-search"]').first().fill(kw)
  })
  await page.waitForTimeout(300)
  await page.click('.sv-nav-item:has-text("提示词")')
  await page.waitForTimeout(400)
  await page.click('.sv-nav-item:has-text("技能")')
  await page.waitForTimeout(500)
  const kept = await page.locator('[data-testid="smart-skill-search"] input, input[data-testid="smart-skill-search"]').first().inputValue().catch(() => '')
  check('S3 切走再切回，搜索词仍在（KeepAlive 生效）', kept === kw, `"${kept}"`)

  // ---------- S4 概览统计卡的 goto 事件没丢 ----------
  await page.click('.sv-nav-item:has-text("概览")')
  await page.waitForTimeout(400)
  const stat = page.locator('[data-testid="smart-stat-skills"]')
  check('S4 概览有「技能」统计卡', await stat.count() > 0)
  if (await stat.count()) {
    await stat.first().click()
    await page.waitForTimeout(500)
    const onSkills = await page.locator('[data-testid="smart-skill-search"]').count() > 0
    check('S4 点统计卡能跳到技能页', onSkills)
  } else {
    check('S4 点统计卡能跳到技能页', false)
  }

  // ---------- S5 无 JS 异常 ----------
  check('S5 无页面 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] ${results.length - failed.length}/${results.length} passed`)
  if (failed.length) process.exitCode = 1
} finally {
  await browser.close()
  if (serverStarted && server) server.kill()
}
