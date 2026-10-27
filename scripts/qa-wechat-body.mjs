/**
 * QA：公众号正文转换回归（列表 / 表格 / 代码块）
 *
 * 背景：博客发文到公众号草稿箱后样式变样。公众号编辑器对 ul/ol/li、table 支持都不可靠，
 * 且会丢掉 overflow —— 列表被拆成「空圆点 + 独立行」、宽表溢出裁切、长代码行被切掉。
 *
 * 修复（useWechatPublish.normalizeWechatBody）：
 *   1) flattenLists  —— li → section + 悬挂缩进，项内段落合并成一行，空项丢弃
 *   2) flattenTables —— 一行一张卡片：首列当标题，其余列「表头：值」
 *   3) pre 样式改 pre-wrap（不靠 overflow 滚动，长行自动折行）
 *
 * 断言：
 *  S1 松散列表：无 ul/li、两条=两个圆点、条目内无 <br>、「框架：Vue 3」连续
 *  S2 紧凑列表：仍为 2 条
 *  S3 嵌套列表：子项缩进(2.6em) 大于父项(1.4em)
 *  S4 有序列表保留 1. 2. 3. 编号
 *  S5 空列表项不产生空圆点
 *  S6 普通段落未受影响
 *  S7 表格：无 table/tr/td/th，一行一张卡片，含首列标题与「表头：值」
 *  S8 代码块：pre 用 pre-wrap 且不含 overflow-x（公众号会裁掉滚动）
 *
 * 用法：node scripts/qa-wechat-body.mjs
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
    const build = (md) => mod.buildWechatContentHtml(md, () => undefined)

    const loose = build('以本项目为例，技术选型是：\n\n- **框架**\n\n  ：Vue 3（`<script setup lang="ts">` 组合式 API）\n\n- **状态**\n\n  ：Pinia 3\n')
    const tight = build('- **框架**\n  ：Vue 3 组合式 API\n- **状态**：Pinia 3\n')
    const nested = build('- 前端\n  - Vue 3\n  - Pinia\n- 后端\n  - Spring Boot\n')
    const ordered = build('1. 第一步\n2. 第二步\n3. 第三步\n')
    const emptyItem = build('- \n- 有内容的项\n')
    const plain = build('第一段。\n\n第二段。\n')
    const table = build('| 方案 | 优点 | 缺点 |\n| --- | --- | --- |\n| Vue 3 | 组合式 API 清晰 | 生态待完善 |\n| React | 生态成熟 | 心智负担高 |\n')
    const tableWithCode = build('| 库 | 说明 |\n| --- | --- |\n| `pinia` | 状态管理 |\n')
    const mark = build('这里有==重点结论==要强调。\n')
    const code = build('```js\nconst veryLongVariableName = someFunction(argumentOne, argumentTwo, argumentThree)\n```\n')

    const count = (html, re) => (html.match(re) || []).length
    return {
      loose, tight, nested, ordered, emptyItem, plain, table, tableWithCode, code,
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
      emptyBullets: count(emptyItem, /•/g),
      tableStats: {
        tags: count(table, /<(table|tr|td|th)[\s>]/gi),
        cards: count(table, /background-color:#fafbfc/g),
        labels: /优点：/.test(table) && /缺点：/.test(table),
        firstColTitle: /font-weight:bold[^>]*>Vue 3</.test(table) || /font-weight:bold;[^"]*"[^>]*>Vue 3</.test(table)
      },
      tableCodeInline: /background-color:#f6f8fa/.test(tableWithCode),
      markStats: { hasMark: /<mark/i.test(mark), hasBg: mark.includes('#fff3bf'), text: mark.includes('重点结论') },
      codeStats: {
        preWrap: /white-space:pre-wrap/.test(code),
        overflow: /overflow-x/.test(code)
      }
    }
  })

  const { looseStats } = out
  check('S1 输出已无 ul/li 标签', looseStats.ul === 0 && looseStats.li === 0, `ul=${looseStats.ul} li=${looseStats.li}`)
  check('S1 两条列表项 = 两个圆点（无空圆点、无重复符号）', looseStats.bullets === 2, `bullets=${looseStats.bullets}`)
  const itemHasBreak = /框架(<\/?(strong|b)>)?\s*(<br\s*\/?>)\s*(<\/?[a-z]+[^>]*>)*\s*：Vue 3/i.test(out.loose)
  check('S1 项内无 <br>（框架与：Vue 3 同一行）', !itemHasBreak, itemHasBreak ? 'still-broken-by-br' : 'ok')
  const loosePlain = out.loose.replace(/<[^>]+>/g, '')
  check('S1 条目文本为「框架：Vue 3」连续串', /框架：Vue 3/.test(loosePlain), loosePlain.replace(/\s+/g, ' ').slice(0, 80))
  check('S1 无 class 属性、行内 code 样式保留', !looseStats.hasClass && looseStats.codeStyled, `class=${looseStats.hasClass} code=${looseStats.codeStyled}`)

  check('S2 紧凑列表仍为 2 条', out.tightBullets === 2, `bullets=${out.tightBullets}`)
  // 紧凑列表（项内单换行 → breaks:true 生成 <br>）同样必须折叠成一行
  const tightHasBr = /<br\s*\/?>/i.test(out.tight)
  const tightPlain = out.tight.replace(/<[^>]+>/g, '')
  check('S2 紧凑列表项内无 <br>（软换行已折叠）', !tightHasBr, tightHasBr ? 'has-br' : 'ok')
  check('S2 紧凑列表文本连续（框架：Vue 3）', /框架：Vue 3/.test(tightPlain), tightPlain.replace(/\s+/g, ' ').slice(0, 60))

  const indents = out.nestedIndents.map((s) => Number(s.replace(/[^\d.]/g, '')))
  check('S3 嵌套子项缩进大于父项', indents.includes(1.4) && indents.includes(2.6), JSON.stringify(indents))

  check('S4 有序列表保留 1. 2. 3. 编号', out.orderedMarkers.length === 3, JSON.stringify(out.orderedMarkers))

  check('S5 空列表项不产生空圆点', out.emptyBullets === 1, `bullets=${out.emptyBullets}`)

  check('S6 普通段落未受影响', out.plain.includes('第一段') && out.plain.includes('第二段') && !out.plain.includes('•'), out.plain.length)

  check('S7 表格标签已全部去除', out.tableStats.tags === 0, `tags=${out.tableStats.tags}`)
  check('S7 一行一张卡片（2 行 = 2 张）', out.tableStats.cards === 2, `cards=${out.tableStats.cards}`)
  check('S7 卡片含「表头：值」标注', out.tableStats.labels, String(out.tableStats.labels))
  check('S7 卡片首列作为加粗标题', out.tableStats.firstColTitle, String(out.tableStats.firstColTitle))
  check('S7 单元格内行内 code 样式保留', out.tableCodeInline, String(out.tableCodeInline))

  check('S9 高亮 ==文字== 已转为 span 底色（无 mark 标签）',
    out.markStats.text && out.markStats.hasBg && !out.markStats.hasMark, JSON.stringify(out.markStats))

  check('S8 代码块用 pre-wrap 自动折行', out.codeStats.preWrap, `pre-wrap=${out.codeStats.preWrap}`)
  check('S8 代码块不再依赖 overflow 滚动', !out.codeStats.overflow, `overflow-x=${out.codeStats.overflow}`)

  check('无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  if (process.env.SHOT) {
    await page.setContent(
      `<div style="font-family:system-ui;padding:24px;max-width:720px;background:#fff">${out.loose}${out.table}${out.code}</div>`
    )
    await page.screenshot({ path: 'd:/tmp/wechat-body.png', fullPage: true })
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
