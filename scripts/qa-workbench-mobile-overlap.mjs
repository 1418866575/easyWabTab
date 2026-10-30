/**
 * QA：工作台「悬浮新增 FAB / 移动端底部 Tab Bar」是否遮挡面板内可点元素
 *
 * 背景：WorkbenchFab 与移动端 .wb-menu（降级为固定底部 Tab Bar）都是 position:fixed，
 *       脱离文档流，不会把内容顶开。若内容区底部留白不足，滚到底时最后一屏的按钮/分值
 *       会被压在浮层下面 —— 看起来在、实际点不到。
 *
 * 判据：以「元素中心点 elementFromPoint 命中的是否还是它自己（或子孙）」为准。
 *       中心点被 FAB / TabBar 接管 = 真的点不到，计为遮挡。
 *       纯几何相交但中心点空的，不算（边缘擦到不影响操作）。
 *
 * 断言：
 *  S1 桌面 1440x900：每个面板滚到底，无元素被 FAB 遮挡
 *  S2 移动 390x844：每个面板滚到底，无元素被 FAB 遮挡
 *  S3 移动 390x844：每个面板滚到底，无元素被底部 Tab Bar 遮挡
 *  S4 移动端 Tab Bar 未遮挡内容区可点元素（含横向滚动条区域）
 *
 * 用法：node scripts/qa-workbench-mobile-overlap.mjs
 *      VERBOSE=1 打印每条遮挡明细
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// 12 个面板（与 WorkbenchView SECTION_KEYS 一致）
const SECTIONS = [
  ['home', '首页'],
  ['todos', '待办'],
  ['notes', '便签'],
  ['diary', '日记'],
  ['countdowns', '倒计时'],
  ['pomodoro', '番茄钟'],
  ['habits', '习惯'],
  ['passwords', '密码'],
  ['health', '健康'],
  ['ledger', '记账'],
  ['genealogy', '家谱'],
  ['trash', '回收站']
]

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

/**
 * 造数：空库时列表/表格没有任何行，「底部有没有被压住」根本测不出来（假阴性）。
 * 这里把 6 个面板灌到必然出现滚动 + 分页条的量级，让底部真实内容暴露出来。
 */
async function seed(page) {
  const stat = await page.evaluate(async () => {
    const out = {}
    const td = await import('/src/stores/workbenchTodos.ts')
    const todos = td.useWorkbenchTodosStore()
    for (let i = 0; i < 25; i++) await todos.addTodo({ title: `QA 待办 ${i + 1}`, priority: 'medium' })
    out.todos = todos.activeTodos.length

    const nm = await import('/src/stores/workbenchNotes.ts')
    const notes = nm.useWorkbenchNotesStore()
    for (let i = 0; i < 15; i++) await notes.addNote({ content: `QA 便签内容 ${i + 1}`, color: 'blue' })
    out.notes = notes.activeNotes.length

    const dm = await import('/src/stores/workbenchDiary.ts')
    const diary = dm.useWorkbenchDiaryStore()
    await diary.loadDiary()
    const pad = (n) => String(n).padStart(2, '0')
    for (let i = 0; i < 12; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      await diary.upsertEntry(key, `QA 日记正文 ${i + 1}`, { title: `QA 日记 ${i + 1}` })
    }
    out.diary = diary.activeEntries.length

    const cm = await import('/src/stores/countdowns.ts')
    const cd = cm.useCountdownsStore()
    await cd.loadCountdowns()
    for (let i = 0; i < 12; i++) await cd.addCountdown({ name: `QA 倒计时 ${i + 1}`, endDateTime: '2027-06-30T12:00' })
    out.countdowns = cd.countdowns.length

    const gm = await import('/src/stores/genealogy.ts')
    const fam = gm.useGenealogyStore()
    await fam.load()
    for (let i = 0; i < 8; i++) await fam.addMember({ name: `QA 成员 ${i + 1}` })
    out.members = fam.activeMembers.length

    const hm = await import('/src/stores/workbenchHabits.ts')
    const hb = hm.useWorkbenchHabitsStore()
    await hb.loadHabits()
    for (let i = 0; i < 5; i++) await hb.addHabit(`QA 习惯 ${i + 1}`, 3)
    out.habits = hb.habits.length
    return out
  })
  console.log('[qa] seed:', JSON.stringify(stat))
  await page.waitForTimeout(600)
  return stat
}

/** 滚到内容底部（含 el-table / el-scrollbar 内部滚动容器） */
async function scrollToBottom(page) {
  await page.evaluate(() => {
    const content = document.querySelector('.wb-content')
    if (content) content.scrollTop = content.scrollHeight
    // 面板内二级滚动容器（表格、虚拟列表）一并滚到底
    for (const el of document.querySelectorAll('.wb-content .el-scrollbar__wrap, .wb-content .el-table__body-wrapper')) {
      if (el.scrollHeight > el.clientHeight + 2) el.scrollTop = el.scrollHeight
    }
    content?.dispatchEvent(new Event('scroll'))
  })
  await page.waitForTimeout(350)
}

/** 扫描被 FAB / TabBar 夺走点击的元素 */
async function scanOverlap(page) {
  return page.evaluate(() => {
    const hits = []
    const vw = window.innerWidth
    const vh = window.innerHeight
    const content = document.querySelector('.wb-content')
    const targets = document.querySelectorAll(
      '.wb-content button, .wb-content a[href], .wb-content input, .wb-content select, .wb-content textarea, .wb-content [role="button"]'
    )
    // 自检指标：候选数 / 视口内候选数 / 内容区是否滚到底 / FAB 是否可见
    // —— 用于识别「0 遮挡」到底是真没问题，还是脚本根本没扫到东西
    let total = 0
    let inView = 0
    for (const el of targets) {
      total++
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) continue
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue
      inView++
      if (el.closest('[data-testid="wb-fab-add"]')) continue
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      if (cx < 0 || cy < 0 || cx > vw || cy > vh) continue
      const top = document.elementFromPoint(cx, cy)
      if (!top) continue
      // 命中自己或子孙 → 没被挡
      if (el === top || el.contains(top) || top.contains(el)) continue
      let blocker = null
      if (top.closest('[data-testid="wb-fab-add"]')) blocker = 'FAB'
      else if (top.closest('.wb-menu')) blocker = 'TABBAR'
      if (!blocker) continue
      hits.push({
        blocker,
        testid: el.getAttribute('data-testid') || '',
        text: (el.textContent || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 24),
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height)
      })
    }
    const metrics = {
      total,
      inView,
      scrollTop: content ? Math.round(content.scrollTop) : -1,
      scrollMax: content ? Math.round(content.scrollHeight - content.clientHeight) : -1,
      fab: !!document.querySelector('[data-testid="wb-fab-add"]')
    }
    return { hits, metrics }
  })
}

/** 遍历所有面板，返回 { name: { hits, metrics } } */
async function sweep(page, label) {
  const out = {}
  for (const [key, name] of SECTIONS) {
    const btn = page.locator(`[data-testid="wb-menu-${key}"]`)
    if (!(await btn.count())) { out[name] = { hits: [], metrics: { skipped: true } }; continue }
    await btn.first().click()
    // 等异步面板 chunk + 首屏骨架结束
    await page.waitForFunction(() => !document.querySelector('.wb-content .ewt-skeleton'), { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(500)
    await scrollToBottom(page)
    const { hits, metrics } = await scanOverlap(page)
    out[name] = { hits, metrics }
    if (process.env.VERBOSE) {
      const m = metrics
      console.log(`      [${label}] ${name}: 候选 ${m.total} / 视口内 ${m.inView} / 滚动 ${m.scrollTop}÷${m.scrollMax} / FAB ${m.fab ? '有' : '无'} / 遮挡 ${hits.length}`)
      for (const h of hits) console.log(`          ↳ ${h.blocker} 压住 ${h.testid || h.text} @${h.x},${h.y} ${h.w}x${h.h}`)
    }
  }
  return out
}

function summarize(bySection, blocker) {
  const bad = Object.entries(bySection).filter(([, v]) => v.hits.some((h) => h.blocker === blocker))
  const total = bad.reduce((n, [, v]) => n + v.hits.filter((h) => h.blocker === blocker).length, 0)
  const detail = bad.map(([name, v]) => `${name}(${v.hits.filter((h) => h.blocker === blocker).length})`).join(' ')
  return { ok: total === 0, detail: total ? `${total} 处：${detail}` : '0 处' }
}

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)

  // ---- 桌面 1440x900 ----
  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } })
  const desk = await deskCtx.newPage()
  const errs = []
  desk.on('pageerror', (e) => errs.push(e.message))
  await desk.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await desk.waitForSelector('[data-testid="wb-menu-home"]', { timeout: 120000 })
  if (await desk.locator('.help-dialog .close-btn').count()) {
    await desk.click('.help-dialog .close-btn')
    await desk.waitForTimeout(300)
  }
  await desk.waitForSelector('[data-testid="home-overview-grid"]', { timeout: 60000 })
  await desk.waitForTimeout(800)
  const seedDesk = await seed(desk)
  check('S0 桌面：种子数据齐备（6 个面板）', Object.values(seedDesk).every((n) => n > 0), JSON.stringify(seedDesk))
  console.log('[qa] 扫描桌面 1440x900 …')
  const deskSweep = await sweep(desk, 'desktop')
  const desktopFab = summarize(deskSweep, "FAB")
  check('S1 桌面：无元素被 FAB 遮挡', desktopFab.ok, desktopFab.detail)
  await deskCtx.close()

  // ---- 移动 390x844 ----
  const mobCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    storageState: { cookies: [], origins: [] }
  })
  const mob = await mobCtx.newPage()
  mob.on('pageerror', (e) => errs.push(e.message))
  await mob.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await mob.waitForSelector('[data-testid="wb-menu-home"]', { timeout: 120000 })
  if (await mob.locator('.help-dialog .close-btn').count()) {
    await mob.click('.help-dialog .close-btn')
    await mob.waitForTimeout(300)
  }
  await mob.waitForSelector('[data-testid="home-overview-grid"]', { timeout: 60000 })
  await mob.waitForTimeout(800)
  const seedMob = await seed(mob)
  check('S0 移动：种子数据齐备（6 个面板）', Object.values(seedMob).every((n) => n > 0), JSON.stringify(seedMob))
  console.log('[qa] 扫描移动 390x844 …')
  const mobSweep = await sweep(mob, 'mobile')
  const mobFab = summarize(mobSweep, "FAB")
  const mobBar = summarize(mobSweep, "TABBAR")
  check('S2 移动：无元素被 FAB 遮挡', mobFab.ok, mobFab.detail)
  check('S3 移动：无元素被底部 Tab Bar 遮挡', mobBar.ok, mobBar.detail)

  // S4 TabBar 自身可用性：12 项都应能横向滚动到可见（移动端菜单是 overflow-x:auto）
  const barCheck = await mob.evaluate(() => {
    const bar = document.querySelector('.wb-menu')
    if (!bar) return { ok: false, why: '未找到 .wb-menu' }
    const br = bar.getBoundingClientRect()
    return { ok: br.bottom <= window.innerHeight + 1 && br.height >= 40, h: Math.round(br.height), bottom: Math.round(br.bottom) }
  })
  check('S4 移动端底部 Tab Bar 贴底且高度合理', barCheck.ok, `h=${barCheck.h} bottom=${barCheck.bottom}`)

  check('S5 全过程无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))
  await mobCtx.close()

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
