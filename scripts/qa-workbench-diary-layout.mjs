/**
 * QA：日记面板「记录列表位于编辑器下方、通栏贴底」
 *
 * 背景：≥1100px 的媒体查询原本想做左右两栏，却漏写 flex-direction，
 *       又叠加 align-items:flex-start + 子元素 flex:1 按高度均分：
 *       编辑器被压到 267px（内部 min-height:360px 直接溢出），
 *       记录列表缩成一张窄卡片，视觉上既不在底部也没铺满。
 *
 * 断言（1440 / 1100 / 900 / 390 四种宽度）：
 *  S1 记录列表是 .dj-main 最后一个块，且位于编辑器下方、不与编辑器重叠
 *  S2 编辑器与记录列表都通栏铺满 .dj-main
 *  S3 编辑器内容不被压缩（高度 ≥ .dj-editor-wrap 的 min-height）
 *  S4 无横向溢出、无页面级 JS 异常
 *
 * 用法：node scripts/qa-workbench-diary-layout.mjs
 *      BASE=http://localhost:16719 node scripts/qa-workbench-diary-layout.mjs
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
  await page.goto(base + '/workbench?section=diary', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="dj-table-section"]', { timeout: 120000 })
  await page.waitForTimeout(800)
  // 造数据让表格有行，验证列表本体也完整渲染
  await page.evaluate(async () => {
    const m = await import('/src/stores/workbenchDiary.ts')
    const s = m.useWorkbenchDiaryStore()
    await s.loadDiary()
    const d = new Date(); const pad = n => String(n).padStart(2, '0')
    for (let i = 0; i < 3; i++) {
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i)
      const key = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
      await s.upsertEntry(key, '布局回归用正文', { title: '布局回归日记 ' + (i + 1) }).catch(() => {})
    }
  })
  await page.waitForTimeout(600)

  for (const w of [1440, 1100, 900, 390]) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 })
    await page.waitForTimeout(300)
    const g = await page.evaluate(() => {
      const main = document.querySelector('.dj-main')
      const editor = document.querySelector('.dj-editor')
      const table = document.querySelector('[data-testid="dj-table-section"]')
      const wrap = document.querySelector('.dj-editor-wrap')
      if (!main || !editor || !table) return null
      const r = x => x.getBoundingClientRect()
      return {
        last: main.lastElementChild === table,
        below: r(table).top >= r(editor).bottom - 1,
        gap: Math.round(r(table).top - r(editor).bottom),
        mainW: Math.round(r(main).width),
        editorW: Math.round(r(editor).width),
        tableW: Math.round(r(table).width),
        editorH: Math.round(r(editor).height),
        wrapH: Math.round(wrap ? r(wrap).height : 0),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        rows: document.querySelectorAll('[data-testid="dj-table"] .el-table__body tr').length
      }
    })
    if (!g) { check(`S1@${w} 结构存在`, false); continue }
    check(`S1@${w} 列表是主区最后一块且在编辑器下方`, g.last && g.below, `gap=${g.gap}px`)
    check(`S2@${w} 编辑器与列表都通栏`, Math.abs(g.editorW - g.mainW) <= 1 && Math.abs(g.tableW - g.mainW) <= 1,
      `main=${g.mainW} editor=${g.editorW} table=${g.tableW}`)
    check(`S3@${w} 编辑器未被压缩`, g.editorH >= g.wrapH - 2, `editorH=${g.editorH} wrapH=${g.wrapH}`)
    check(`S4@${w} 无横向溢出且列表有数据`, g.overflow <= 1 && g.rows >= 1, `overflow=${g.overflow} rows=${g.rows}`)
  }

  check('S5 全过程无页面级 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '))
  const failed = results.filter(r => !r.ok)
  console.log(`\n[qa] ${results.length - failed.length}/${results.length} passed`)
  if (failed.length) process.exitCode = 1
  await ctx.close()
} finally {
  await browser.close()
  if (server) server.kill()
}
