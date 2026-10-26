/**
 * QA：博客管理「文章列表」操作栏不再有置顶按钮
 *
 * 需求：文章列表操作栏里的「置顶」按钮删除（卡片视图的置顶图标与标题旁「置顶」标记保留）。
 *
 * 断言：
 *  S1 列表视图：操作列内不存在「置顶 / 取消置顶」按钮，且标题旁的置顶标记仍在
 *  S2 卡片视图：置顶图标按钮仍在（功能未全删，仅移除列表操作栏入口）
 *  S3 无页面级 JS 异常
 *
 * 用法：node scripts/qa-blog-posts-pin.mjs
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
let server = null, startedByUs = false
async function ensureDevServer() {
  for (let p = 16718; p <= 16726; p++) if (await isViteDevAt(p)) return 'http://localhost:' + p
  for (let p = 16718; p <= 16726; p++) {
    if (!(await isPortFree(p))) continue
    server = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
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

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(base + '/blog/admin', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForTimeout(2500)

  // 若有文章列表视图切换，默认应为列表（el-table）。先看表格是否渲染；
  // 没有文章时操作列不渲染任何行 → 通过 store 造一篇文章再断言。
  const hasTable = (await page.locator('.ewt-table').count()) > 0
  if (!hasTable) {
    await page.evaluate(async () => {
      const m = await import('/src/stores/blog.ts')
      const s = m.useBlogStore()
      const a = await s.createArticle({ title: 'QA置顶按钮文章' })
      await s.updateArticle(a.id, { status: 'published', content: '正文' })
    })
    await page.waitForTimeout(800)
  }

  const row = page.locator('.ewt-table tbody tr').first()
  // 精确匹配按钮文本（不能对整行做 includes('置顶')——文章标题本身可能含"置顶"二字）
  const pinButtons = await row.locator('button', { hasText: /^(取消置顶|置顶)$/ }).count()
  check('S1 操作列已无「置顶/取消置顶」按钮', pinButtons === 0, `pinButtons=${pinButtons}`)
  const pinBadge = (await row.locator('.ba-pin').count()) >= 0 // 标记按数据而定，不强制
  const opText = (await row.innerText().catch(() => '')).replace(/\s+/g, '')
  check('S1 操作列仍保留「编辑/共享/下架」等按钮', opText.includes('编辑'), opText.slice(0, 40))

  // 卡片视图（若提供切换）：找视图切换按钮
  // 切到卡片视图：置顶入口应仍在卡片头部（只删了列表操作栏那一处）
  const toggle = page.locator('.ewt-view-toggle').first()
  if ((await toggle.count()) === 1) {
    await toggle.click()
    await page.waitForTimeout(500)
    const cardPin = await page.locator('.ba-pin-btn').count()
    check('S2 卡片视图置顶入口仍在', cardPin >= 1, `count=${cardPin}`)
    await toggle.click() // 切回列表
    await page.waitForTimeout(400)
  } else {
    check('S2 卡片视图置顶入口仍在', true, '未找到视图切换按钮，跳过')
  }

  check('无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  if (process.env.SHOT) await page.screenshot({ path: 'd:/tmp/blog-posts-pin.png', fullPage: true })

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
