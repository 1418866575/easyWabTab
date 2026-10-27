/**
 * QA：博客编辑器增强（保存状态 / Ctrl+S / 离开守卫 / 公众号预览 / 图片压缩）
 *
 * 断言：
 *  S1 顶栏保存状态：初始「已保存」→ 输入后「未保存」
 *  S2 有未保存改动时 beforeunload 被拦截（defaultPrevented=true）
 *  S3 Ctrl+S 触发保存：store 正文更新 + 状态回到「已保存」
 *  S4 公众号预览：弹框渲染、无 ul/li、含圆点与表格卡片（#fafbfc）
 *  S5 图片压缩：2400px 宽大图 → 最长边 ≤1600 且体积明显变小
 *  S6 无页面级 JS 异常
 *
 * 用法：node scripts/qa-blog-editor-pro.mjs
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

const TITLE = 'QA编辑器增强文章'
const MD = '## 技术选型\n\n以本项目为例，技术选型是：\n\n- **框架**\n  ：Vue 3（`<script setup>`）\n\n- **状态**\n  ：Pinia 3\n\n| 方案 | 优点 |\n| --- | --- |\n| Vue 3 | 组合式 API |\n'

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(base + '/blog/admin', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForTimeout(2000)
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }

  // 造一篇文章（含列表 + 表格），再进编辑器
  const articleId = await page.evaluate(async ({ title, md }) => {
    const m = await import('/src/stores/blog.ts')
    const s = m.useBlogStore()
    if (!s.loaded) await s.loadBlog()
    const a = await s.createArticle({ title })
    await s.updateArticle(a.id, { contentMarkdown: md })
    return a.id
  }, { title: TITLE, md: MD })

  await page.reload({ waitUntil: 'commit', timeout: 120000 })
  await page.waitForTimeout(1800)
  const row = page.locator('tr', { hasText: TITLE }).first()
  await row.locator('.ba-link').first().click()
  await page.waitForSelector('[data-testid="blog-editor-content"]', { timeout: 30000 })
  await page.waitForTimeout(600)

  // ---- S1 保存状态 ----
  const stateText0 = (await page.locator('[data-testid="blog-editor-save-state"]').innerText()).trim()
  check('S1 初始状态显示「已保存」', stateText0.includes('已保存'), stateText0)

  const ta = page.locator('[data-testid="blog-editor-content"]')
  await ta.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\n\n补充一句测试。')
  await page.waitForTimeout(400)
  const stateText1 = (await page.locator('[data-testid="blog-editor-save-state"]').innerText()).trim()
  check('S1 输入后变为「未保存」', stateText1.includes('未保存'), stateText1)

  // ---- S2 离开守卫 ----
  const prevented = await page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(e)
    return e.defaultPrevented
  })
  check('S2 有未保存改动时 beforeunload 被拦截', prevented === true, String(prevented))

  // ---- S3 Ctrl+S 保存 ----
  await page.keyboard.press('Control+s')
  await page.waitForTimeout(1200)
  const saved = await page.evaluate(async (id) => {
    const m = await import('/src/stores/blog.ts')
    const s = m.useBlogStore()
    const a = s.articles.find((x) => x.id === id)
    return a ? a.contentMarkdown.includes('补充一句测试。') : false
  }, articleId)
  const stateText2 = (await page.locator('[data-testid="blog-editor-save-state"]').innerText()).trim()
  check('S3 Ctrl+S 已落库', saved, String(saved))
  check('S3 保存后状态回到「已保存」', stateText2.includes('已保存'), stateText2)

  // ---- S4 公众号预览 ----
  await page.click('[data-testid="blog-editor-wechat-preview-top"]')
  await page.waitForSelector('[data-testid="blog-editor-wechat-preview-dialog"]', { timeout: 15000 })
  const body = page.locator('[data-testid="blog-editor-wechat-preview-body"]')
  const bodyText = (await body.innerText()).replace(/\s+/g, '')
  const bodyHtml = await body.innerHTML()
  check('S4 预览渲染列表（圆点 + 内容同行）', bodyText.includes('•') && /框架\s*：Vue3/.test(bodyText), bodyText.slice(0, 60))
  check('S4 预览已无 ul/li 标签', !/<ul|<li/i.test(bodyHtml), `hasUl=${/<ul|<li/i.test(bodyHtml)}`)
  check('S4 预览表格已卡片化', bodyHtml.includes('#fafbfc'), String(bodyHtml.includes('#fafbfc')))
  check('S4 预览列表项内无 <br>（不会被劈成两行）', !/<br\s*\/?>/i.test(bodyHtml), /<br\s*\/?>/i.test(bodyHtml) ? 'has-br' : 'ok')
  await page.click('[data-testid="blog-editor-wechat-preview-dialog"] .bd-close, [data-testid="blog-editor-wechat-preview-dialog"] .close-btn').catch(() => {})
  await page.waitForTimeout(300)

  // ---- S5 图片压缩 ----
  const compress = await page.evaluate(async () => {
    const mod = await import('/src/composables/blogImageCompress.ts')
    const canvas = document.createElement('canvas')
    canvas.width = 2400
    canvas.height = 1600
    const ctx = canvas.getContext('2d')
    // 造「照片型」素材：加噪点，否则纯色块 PNG 本来就很小，测不出压缩收益
    for (let i = 0; i < 2400 * 1600 / 60; i++) {
      const x = Math.random() * 2400
      const y = Math.random() * 1600
      ctx.fillStyle = `rgba(${Math.random() * 255 | 0},${Math.random() * 255 | 0},${Math.random() * 255 | 0},0.9)`
      ctx.fillRect(x, y, 6, 6)
    }
    const big = canvas.toDataURL('image/png')
    const before = mod.dataUrlBytes(big)
    const r = await mod.compressImageDataUrl(big)
    const img = new Image()
    await new Promise((res) => { img.onload = res; img.src = r.dataUrl })
    return { before, after: r.bytes, longest: Math.max(img.naturalWidth, img.naturalHeight), compressed: r.compressed }
  })
  check('S5 大图已压缩且最长边 ≤1600', compress.compressed && compress.longest <= 1600, JSON.stringify(compress))
  check('S5 体积明显变小（< 原图 50%）', compress.after < compress.before * 0.5, `${compress.before} → ${compress.after}`)

  check('无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  if (process.env.SHOT) {
    await page.click('[data-testid="blog-editor-wechat-preview-top"]')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'd:/tmp/blog-editor-preview.png', fullPage: false })
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
