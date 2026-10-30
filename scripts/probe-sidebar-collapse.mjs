/**
 * 探针：六个工作台的「侧栏收起/展开」按钮是否同一套外观
 *
 * 目的：教师工作台（/teacher）是基准，其余五台（个人 /workbench、销售 /business、
 *      学生 /student、智能 /smart、博客后台 /blog/admin）的收起按钮外观与字体必须与之一致
 *      —— 模板上都用 .tw-btn + .tw-btn-sm，各自只保留布局类
 *      （.wb- / .bs- / .st- sidebar-toggle、.ba- / .sv- nav-collapse）。
 *      本脚本实测各边的计算样式并截图（含收起态），防止以后又各自长出一套圆角/字号。
 *
 * 用法：node scripts/probe-sidebar-collapse.mjs
 *      SHOT_DIR=d:/tmp/collapse node scripts/probe-sidebar-collapse.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.env.SHOT_DIR || join(os.tmpdir(), 'sidebar-collapse')
fs.mkdirSync(OUT, { recursive: true })

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

/** 采样按钮的计算样式（只取能体现「同一套外观」的那几项） */
const MEASURE = (sel) => {
  const el = document.querySelector(sel)
  if (!el) return null
  const s = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return {
    text: (el.innerText || '').trim(),
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    fontFamily: s.fontFamily.split(',')[0].replace(/["']/g, ''),
    height: Math.round(r.height * 100) / 100,
    width: Math.round(r.width * 100) / 100,
    paddingLeft: s.paddingLeft,
    gap: s.gap,
    borderRadius: s.borderRadius,
    borderWidth: s.borderWidth,
    borderColor: s.borderTopColor,
    background: s.backgroundColor,
    color: s.color,
    iconSize: (() => {
      const svg = el.querySelector('svg')
      return svg ? `${svg.getAttribute('width')}x${svg.getAttribute('height')}` : null
    })()
  }
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

/**
 * 六个台子的入口配置。teacher 为基准，其余逐一比对。
 * ready = 根容器（引导表单阶段就已存在，可安全早等）；side = 侧栏；btn = 收起按钮。
 */
const VIEWS = [
  { key: 'teacher', label: '教师', route: '/teacher', ready: '.tv-shell', btn: '.tv-nav-collapse', side: '.tv-sidebar', idx: 1 },
  { key: 'workbench', label: '个人', route: '/workbench', ready: '.wb-shell', btn: '[data-testid="wb-sidebar-toggle"]', side: '.wb-menu', idx: 3 },
  { key: 'business', label: '销售', route: '/business', ready: '.bs-shell', btn: '[data-testid="bs-sidebar-toggle"]', side: '[data-testid="bs-menu"]', idx: 5 },
  { key: 'student', label: '学生', route: '/student', ready: '.st-shell', btn: '.st-sidebar-toggle', side: '.st-menu', idx: 7 },
  { key: 'smart', label: '智能', route: '/smart', ready: '.sv-shell', btn: '[data-testid="smart-collapse-sidebar"]', side: '.sv-sidebar', idx: 9 },
  { key: 'blog', label: '博客后台', route: '/blog/admin', ready: '.ba-shell', btn: '[data-testid="blog-collapse-sidebar"]', side: '.ba-sidebar', idx: 11 }
]

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[probe] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)))

  const shot = async (name, sel) => {
    const box = await page.locator(sel).first().boundingBox()
    if (!box) return
    await page.screenshot({ path: join(OUT, name), clip: { x: 0, y: 0, width: 300, height: Math.max(320, box.y + box.height + 160) } })
  }

  const expanded = {}
  const collapsed = {}
  const dark = {}
  const collapsedCapsule = {}

  for (const v of VIEWS) {
    await page.goto(base + v.route, { waitUntil: 'commit', timeout: 120000 })
    await page.waitForSelector(v.ready, { timeout: 120000 })
    // 首次进入的引导弹窗（教师 / 销售有 help-dialog，学生台有 onboarding-mask）：关掉，免得挡住侧栏
    if (await page.locator('.help-dialog .close-btn').count()) {
      await page.click('.help-dialog .close-btn')
      await page.waitForTimeout(300)
    }
    if (await page.locator('.onboarding-mask').count()) {
      await page.click('.onboarding-mask .ob-btn-secondary')
      await page.waitForTimeout(400)
    }
    if (v.key === 'teacher') {
      // 教师台首次进入是引导表单，需先注入演示数据才会出现侧栏
      const demoBtn = page.locator('button:has-text("用演示数据快速体验")')
      if (await demoBtn.count()) { await demoBtn.first().click(); await page.waitForTimeout(2500) }
      await page.waitForSelector('.tv-content', { timeout: 60000 })
    }
    if (v.key === 'business') {
      // 销售台有建账门控：走「快速开始」建一份空账套
      if (await page.locator('[data-testid="bs-gate-submit"]').count()) {
        await page.click('[data-testid="bs-gate-submit"]')
        await page.waitForTimeout(1500)
      }
      await page.waitForSelector('[data-testid="bs-content"]', { timeout: 60000 })
    }
    await page.waitForSelector(v.btn, { timeout: 60000 })
    await page.waitForTimeout(700)

    expanded[v.key] = await page.evaluate(MEASURE, v.btn)
    await shot(`${String(v.idx).padStart(2, '0')}-${v.key}-expanded.png`, v.side)

    await page.click(v.btn)
    await page.waitForTimeout(650)
    collapsed[v.key] = await page.evaluate(MEASURE, v.btn)
    await shot(`${String(v.idx + 1).padStart(2, '0')}-${v.key}-collapsed.png`, v.side)
    // 收起态胶囊宽度：用外层容器宽度减去两侧留白与按钮左右 margin，
    // 避免 border 取整（44 vs 43.5）干扰比对
    collapsedCapsule[v.key] = await page.evaluate(([sideSel, btnSel]) => {
      const side = document.querySelector(sideSel)
      const btn = document.querySelector(btnSel)
      if (!side || !btn) return null
      const cs = getComputedStyle(side)
      const cu = getComputedStyle(btn)
      const inner = side.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0)
        - parseFloat(cu.marginLeft || 0) - parseFloat(cu.marginRight || 0)
      return { side: Math.round(side.getBoundingClientRect().width), capsule: Math.round(inner * 100) / 100 }
    }, [v.side, v.btn])

    await page.click(v.btn)
    await page.waitForTimeout(350)

    // 暗色：颜色全部靠 .tw-btn 的 token 翻转，各台不该再写自定暗色覆盖
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForTimeout(350)
    dark[v.key] = await page.evaluate(MEASURE, v.btn)
    await shot(`${String(v.idx + 12).padStart(2, '0')}-${v.key}-dark.png`, v.side)
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    await page.waitForTimeout(200)
  }

  const table = {}
  for (const v of VIEWS) table[v.label] = expanded[v.key]
  console.log('\n[probe] 六边实测（展开态）：')
  console.table(table)

  // ---------- 断言：能体现「同一套外观」的项必须与教师台相等 ----------
  const keys = ['fontSize', 'fontWeight', 'fontFamily', 'height', 'paddingLeft', 'gap', 'borderRadius', 'borderWidth', 'background', 'color', 'iconSize']
  for (const k of keys) {
    const vals = VIEWS.map((v) => expanded[v.key]?.[k])
    check(`等教师台 · ${k}`, vals.every((v) => v === vals[0] && v != null), vals.join(' | '))
  }
  check('六边都渲染出收起按钮', VIEWS.every((v) => !!expanded[v.key]))
  check('六边文案都是「收起」', VIEWS.every((v) => expanded[v.key]?.text === '收起'),
    VIEWS.map((v) => `${v.label}:${expanded[v.key]?.text}`).join(' '))

  // 收起态：侧栏 56px；两侧留白 6px（学生台是 margin 6px）→ 胶囊同为 43（含 border-right 1px）
  check('收起态 · 高都还是 30px',
    VIEWS.every((v) => collapsed[v.key]?.height === 30),
    VIEWS.map((v) => `${v.label}:${collapsed[v.key]?.height}`).join(' '))
  check('收起态 · 侧栏宽度都 56px',
    VIEWS.every((v) => collapsedCapsule[v.key]?.side === 56),
    VIEWS.map((v) => `${v.label}:${collapsedCapsule[v.key]?.side}`).join(' '))
  // 只断言「六边相等」，不写死 44：侧栏若带 border，clientWidth 会少 1px，
  // 那是侧栏的事，不是按钮的事；横向宽度本就不在「同一套外观」的判定范围内
  const capW = VIEWS.map((v) => collapsedCapsule[v.key]?.capsule)
  check('收起态 · 胶囊宽度六边相等',
    capW.every((w) => w != null && Math.abs(w - capW[0]) < 0.6),
    VIEWS.map((v, i) => `${v.label}:${capW[i]}`).join(' '))
  check('收起态 · 字号不变（12px）',
    VIEWS.every((v) => collapsed[v.key]?.fontSize === '12px'),
    VIEWS.map((v) => `${v.label}:${collapsed[v.key]?.fontSize}`).join(' '))

  // 暗色：底色/描边/文字全部由 token 翻转，六边也必须相等
  // （个人 / 销售曾各自写了一套 html.dark 覆盖，把文字压成 secondary、hover 改色，
  //   与教师台不一致 —— 那两条已删，这里守住不许再长回来）
  for (const k of ['background', 'color', 'borderColor']) {
    const vals = VIEWS.map((v) => dark[v.key]?.[k])
    check(`暗色等教师台 · ${k}`, vals.every((v) => v === vals[0] && v != null), vals.join(' | '))
  }
  check('暗色 · 高仍 30px', VIEWS.every((v) => dark[v.key]?.height === 30),
    VIEWS.map((v) => `${v.label}:${dark[v.key]?.height}`).join(' '))

  check('无页面 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[probe] ${results.length - failed.length}/${results.length} passed；截图目录 = ${OUT}`)
  if (failed.length) process.exitCode = 1
} finally {
  await browser.close()
  if (server) server.kill()
}
