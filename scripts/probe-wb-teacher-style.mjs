/**
 * 探针：教师工作台 vs 个人工作台 视觉对比
 *
 * 目的：把两边的「外壳 + 卡片 + 按钮 + 表格 + 统计卡」分别截出来并排看，
 *      用实测而不是读 CSS 猜差异。截图落在系统临时目录（不进仓库）。
 *
 * 用法：node scripts/probe-wb-teacher-style.mjs
 *      SHOT_DIR=d:/tmp/wbshot node scripts/probe-wb-teacher-style.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MASTER = 'qA!2026#master'
const OUT = process.env.SHOT_DIR || join(os.tmpdir(), 'wb-teacher-style')
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

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[probe] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base }).catch(() => {})
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  // ================= 教师工作台 =================
  await page.goto(base + '/teacher', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.tw-btn, .tv-shell', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }
  // 首次进入是引导表单：一键「用演示数据快速体验」
  const demoBtn = page.locator('button:has-text("用演示数据快速体验")')
  if (await demoBtn.count()) {
    await demoBtn.first().click()
    await page.waitForTimeout(2500)
  }
  await page.waitForSelector('.tv-content', { timeout: 60000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: join(OUT, '01-teacher-shell.png') })
  await page.locator('.tv-content').screenshot({ path: join(OUT, '02-teacher-content.png') })

  // 教师侧几个有代表性的面板：学生信息（统计卡+表格）、课表、成绩
  const navLabels = ['学生信息', '成绩管理', '课程表', '值日安排']
  const navInfo = []
  for (const label of navLabels) {
    const item = page.locator('.tv-nav-item', { hasText: label }).first()
    if (!(await item.count())) { navInfo.push(label + ': 无'); continue }
    await item.click()
    await page.waitForTimeout(1000)
    const slug = label.replace(/\s/g, '')
    await page.screenshot({ path: join(OUT, `03-teacher-${slug}.png`) })
    navInfo.push(label + ': ok')
  }
  console.log('[probe] teacher nav:', navInfo.join(' | '))

  // 回学生信息面板采样教师侧计算样式（统计卡 + 卡片 + 表格 + 按钮齐全）
  {
    const item = page.locator('.tv-nav-item', { hasText: '学生信息' }).first()
    if (await item.count()) {
      await item.click()
      await page.waitForTimeout(1000)
      const tw = await page.evaluate(() => {
        const pick = (sel) => {
          const el = document.querySelector(sel)
          if (!el) return null
          const s = getComputedStyle(el)
          return {
            sel,
            fontSize: s.fontSize,
            fontWeight: s.fontWeight,
            fontFamily: s.fontFamily.split(',')[0],
            color: s.color,
            background: s.backgroundColor,
            borderRadius: s.borderRadius,
            padding: s.padding,
            border: s.border,
            boxShadow: s.boxShadow
          }
        }
        return {
          page: pick('.tw-page'),
          card: pick('.tw-card'),
          cardTitle: pick('.tw-card-title'),
          title: pick('.tw-title'),
          subtitle: pick('.tw-subtitle'),
          stat: pick('.tw-stat'),
          statValue: pick('.tw-stat-value'),
          statLabel: pick('.tw-stat-label'),
          btn: pick('.tw-btn'),
          th: pick('.tw-table th'),
          td: pick('.tw-table td')
        }
      })
      console.log('[probe] teacher styles:', JSON.stringify(tw, null, 2))
    }
  }

  // ================= 个人工作台 =================
  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-todos"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }
  await page.waitForSelector('[data-testid="home-overview-grid"]', { timeout: 60000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: join(OUT, '11-wb-shell-home.png') })

  // 造数：空面板不渲染表格/列表，看不出表格与卡片的样式（会得到假阴性截图）
  const seeded = await page.evaluate(async () => {
    const out = {}
    try {
      const t = await import('/src/stores/workbenchTodos.ts')
      const ts = t.useWorkbenchTodosStore()
      await ts.addTodo({ title: '整理本周会议纪要', priority: 'high', dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) })
      await ts.addTodo({ title: '续费域名', priority: 'medium' })
      await ts.addTodo({ title: '备份工作台数据', priority: 'low', status: 'done' })
      out.todos = ts.todos.length
    } catch (e) { out.todosErr = String(e).slice(0, 120) }
    try {
      const n = await import('/src/stores/workbenchNotes.ts')
      const ns = n.useWorkbenchNotesStore()
      await ns.addNote({ content: '周四前把工作台样式对齐教师工作台', color: 'blue' })
      await ns.addNote({ content: '便签内容示例：表格列对齐检查', color: 'yellow' })
      await ns.addNote({ content: '第三条便签用于观察表格行间距', color: 'green' })
      out.notes = ns.notes.length
    } catch (e) { out.notesErr = String(e).slice(0, 120) }
    return out
  })
  console.log('[probe] seed:', JSON.stringify(seeded))

  // 主密码必须先设，否则密码面板是设置态（不影响其它面板）
  const panels = [
    ['todos', '待办'],
    ['notes', '便签'],
    ['diary', '日记'],
    ['countdowns', '提醒'],
    ['habits', '打卡'],
    ['ledger', '记账'],
    ['genealogy', '家谱'],
    ['health', '健康'],
    ['pomodoro', '番茄钟'],
    ['trash', '回收站']
  ]
  for (const [key, label] of panels) {
    const btn = page.locator(`[data-testid="wb-menu-${key}"]`)
    if (!(await btn.count())) { console.log('[probe] 无菜单:', key); continue }
    await btn.click()
    await page.waitForFunction(() => !document.querySelector('.wb-content .ewt-skeleton'), { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(900)
    await page.screenshot({ path: join(OUT, `12-wb-${key}.png`) })
    if (key === 'notes' || key === 'todos') {
      const tbl = await page.evaluate(() => {
        const s = (el) => {
          if (!el) return null
          const c = getComputedStyle(el)
          return { fontSize: c.fontSize, fontWeight: c.fontWeight, color: c.color, background: c.backgroundColor, padding: c.padding, textAlign: c.textAlign }
        }
        const th = document.querySelector('.wb-content .el-table__header th')
        const td = document.querySelector('.wb-content .el-table__body td .cell')
        return {
          panel: location.search,
          th: s(th),
          td: s(td),
          head: (() => {
            const t = document.querySelector('.panel-page-title')
            const p = document.querySelector('.panel-page-sub')
            return t && p ? { title: t.textContent.trim(), sub: p.textContent.trim() } : null
          })()
        }
      })
      console.log('[probe] table+head@' + key + ':', JSON.stringify(tbl))
    }
    console.log('[probe] wb panel ok:', label)
  }

  // ================= 主题 / 暗色 / 移动端抽查 =================
  await page.click('[data-testid="wb-menu-notes"]')
  await page.waitForTimeout(800)
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(OUT, '21-wb-notes-dark.png') })
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.dataset.accent = 'blue'
  })
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(OUT, '22-wb-notes-blue.png') })
  await page.evaluate(() => { delete document.documentElement.dataset.accent })

  // 移动端：页头在窄屏是否挤占、按钮是否溢出
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(900)
  await page.screenshot({ path: join(OUT, '23-wb-notes-mobile.png') })
  const mobile = await page.evaluate(() => {
    const head = document.querySelector('.panel-page-head')
    const content = document.querySelector('.wb-content')
    return {
      headH: head?.getBoundingClientRect().height ?? 0,
      contentPad: content ? getComputedStyle(content).padding : '',
      overflowX: content ? content.scrollWidth - content.clientWidth : -1
    }
  })
  console.log('[probe] mobile:', JSON.stringify(mobile))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(500)

  // 采样两边的关键计算样式，用于核对字号/圆角/阴影是否一致
  const probe = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const s = getComputedStyle(el)
      return {
        sel,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        fontFamily: s.fontFamily.split(',')[0],
        color: s.color,
        background: s.backgroundColor,
        borderRadius: s.borderRadius,
        padding: s.padding,
        border: s.border,
        boxShadow: s.boxShadow
      }
    }
    return {
      wb: [
        pick('.wb-content'),
        pick('.panel-page-head'),
        pick('.panel-page-title'),
        pick('.panel-page-sub'),
        pick('.wb-content .stat-card'),
        pick('.wb-content .stat-label'),
        pick('.wb-content .stat-value'),
        pick('.wb-content .btn-primary'),
        pick('.wb-content .el-button'),
        pick('.wb-content .ewt-table th'),
        pick('.wb-content .ewt-table td')
      ].filter(Boolean),
      // 竖条是 ::before 伪元素，getComputedStyle 取不到元素本身，单独报
      headers: [...document.querySelectorAll('.wb-content .stat-header')].slice(0, 3).map((el) => {
        const s = getComputedStyle(el, '::before')
        return { width: s.width, height: s.height, background: s.backgroundColor }
      })
    }
  })
  console.log('[probe] wb styles:', JSON.stringify(probe.wb, null, 2))

  if (errs.length) console.log('[probe] pageerror:', errs.slice(0, 5))
  console.log('[probe] 截图目录 =', OUT)
} finally {
  await browser.close()
  if (server) server.kill()
}
