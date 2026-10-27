/**
 * QA：公众号正文「列表」转换回归
 *
 * 背景 bug：博客发文到公众号草稿箱后列表变样 —— 一条 `- **框架**\n  ：Vue 3…` 被拆成
 * 「空圆点 / 圆点+框架 / 缩进的：Vue 3」三段。原因是直接把 markdown-it 的
 * `<ul><li>`（松散列表还会带 `<li><p>`，且 breaks:true 把项内换行变 `<br>`）交给草稿箱，
 * 公众号编辑器不认列表标签，按块级子节点重排。
 *
 * 修复：提交前把列表摊平成带手写符号 + 悬挂缩进的 `<section>`，项内换行折叠。
 *
 * 断言：
 *  S1 松散列表（项间空行 + 项内换行）：输出无 ul/ol/li，每个条目恰好一段、内容不分行
 *  S2 紧凑列表：项内软换行折叠为同一行
 *  S3 嵌套列表：子项缩进大于父项
 *  S4 有序列表保留 1. 2. 编号
 *  S5 空列表项不产生空圆点
 *  S6 全标签内联样式、无 class/id；行内 code 仍保留灰底
 *
 * 用法：node scripts/qa-wechat-list.mjs
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForTimeout(800)

  const out = await page.evaluate(async () => {
    const mod = await import('/src/composables/useWechatPublish.ts')
    const noImg = () => undefined
    const build = (md) => mod.buildWechatContentHtml(md, noImg)

    // ① 松散列表：项间空行 + 项内换行（线上出问题的形态）
    const loose = build('以本项目为例，技术选型是：\n\n- **框架**\n\n  ：Vue 3（`<script setup lang="ts">` 组合式 API）\n\n- **状态**\n\n  ：Pinia 3\n')
    // ② 紧凑列表：项内软换行
    const tight = build('- **框架**\n  ：Vue 3 组合式 API\n- **状态**：Pinia 3\n')
    // ③ 嵌套列表
    const nested = build('- 前端\n  - Vue 3\n  - Pinia\n- 后端\n  - Spring Boot\n')
    // ④ 有序列表
    const ordered = build('1. 第一步\n2. 第二步\n3. 第三步\n')
    // ⑤ 空列表项
    const emptyItem = build('- \n- 有内容的项\n')
    // ⑥ 无列表的普通正文（确认没被误伤）
    const plain = build('第一段。\n\n第二段。\n')

    const count = (html, re) => (html.match(re) || []).length
    return {
      loose,
      tight,
      nested,
      ordered,
      emptyItem,
      plain,
      looseStats: {
        ul: count(loose, /<ul/gi),
        li: count(loose, /<li/gi),
        bullets: count(loose, /•/g),
        hasClass: /class=/.test(loose),
        codeStyled: /background-color:#f6f8fa/.test(loose)
      },
      tightBullets: count(tight, /•/g),
      nestedIndents: (nested.match(/padding-left:([\d.]+)em/g) || []),
      orderedMarkers: (ordered.match(/>[1-3]\.&nbsp;/g) || []),
      emptyBullets: count(emptyItem, /•/g)
    }
  })

  const { looseStats } = out
  check('S1 输出已无 ul/li 标签', looseStats.ul === 0 && looseStats.li === 0, `ul=${looseStats.ul} li=${looseStats.li}`)
  check('S1 两条列表项 = 两个圆点（无空圆点、无重复符号）', looseStats.bullets === 2, `bullets=${looseStats.bullets}`)
  // 关键：每个条目内「框架」与「：Vue 3」必须在同一段里（不被 <br> 拆行）
  // 关键：条目内「框架」与「：Vue 3」之间不能有 <br>（否则公众号里还是换行）
  const itemHasBreak = /框架(<\/?(strong|b)>)?\s*(<br\s*\/?>)\s*(<\/?[a-z]+[^>]*>)*\s*：Vue 3/i.test(out.loose)
  check('S1 项内无 <br>（框架与：Vue 3 同一行）', !itemHasBreak, itemHasBreak ? 'still-broken-by-br' : 'ok')
  const loosePlain = out.loose.replace(/<[^>]+>/g, '')
  check('S1 条目文本为「框架：Vue 3」连续串', /框架：Vue 3/.test(loosePlain), loosePlain.replace(/\s+/g, ' ').slice(0, 80))
  check('S1 无 class 属性、行内 code 样式保留', !looseStats.hasClass && looseStats.codeStyled, `class=${looseStats.hasClass} code=${looseStats.codeStyled}`)

  check('S2 紧凑列表仍为 2 条', out.tightBullets === 2, `bullets=${out.tightBullets}`)

  // 嵌套：父项 1.4em、子项 2.6em（按 level 加深）
  const indents = out.nestedIndents.map((s) => Number(s.replace(/[^\d.]/g, '')))
  check('S3 嵌套子项缩进大于父项', indents.includes(1.4) && indents.includes(2.6), JSON.stringify(indents))

  check('S4 有序列表保留 1. 2. 3. 编号', out.orderedMarkers.length === 3, JSON.stringify(out.orderedMarkers))

  check('S5 空列表项不产生空圆点', out.emptyBullets === 1, `bullets=${out.emptyBullets}`)

  check('S6 普通段落未受影响', out.plain.includes('第一段') && out.plain.includes('第二段') && !out.plain.includes('•'), out.plain.length)

  check('无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  if (process.env.SHOT) {
    await page.setContent(`<div style="font-family:system-ui;padding:24px;max-width:720px;background:#fff">${out.loose}</div>`)
    await page.screenshot({ path: 'd:/tmp/wechat-list.png', fullPage: true })
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
