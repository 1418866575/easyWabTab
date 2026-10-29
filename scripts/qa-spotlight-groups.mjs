/**
 * QA：全局搜索（Alt+K）跨面板 9 分组
 *
 * 背景：spotlightCore 原有 6 类（待办/便签/倒计时/记账/密码/网址），
 *       「跨面板搜索增强」新增 日记 / 习惯 / 家谱（成员 + 取名记录）3 类 → 共 9 类。
 *
 * 断言：
 *  S1 Alt+K 打开浮层，输入框与提示在位
 *  S2 单个关键词同时命中 待办/日记/习惯/家谱 四组，分组头文案正确
 *  S3 分组顺序与 GROUP_ORDER 一致（待办 → 日记 → 习惯 → 家谱）
 *  S4 新增分组的 testid 前缀正确（sp-result-diary- / -habit- / -genealogy-member- / -genealogy-name-）
 *  S5 家谱「取名记录」命中走 kind=name 分支（副标题显示寓意）
 *  S6 点击日记结果 → 浮层关闭 + 跳到日记面板（标题框出现）
 *  S7 键盘 ↑↓ 仍能选中结果（.sp-result.active 存在），Enter 可跳转
 *  S8 无页面级 JS 异常
 *
 * 用法：node scripts/qa-spotlight-groups.mjs
 *      SHOT=1 时额外输出截图到 d:/tmp/spotlight-9groups.png
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// 四组共用同一关键词，验证「一次搜索跨面板聚合」
const KW = '青瓷'

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
  // 隔离上下文：不继承任何本地 storage（避免污染既有数据）
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: { cookies: [], origins: [] }
  })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-home"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }
  // 等首页网格真正渲染出来（initializing 骨架屏结束），再 seed，避免 init 覆盖
  await page.waitForSelector('[data-testid="home-overview-grid"]', { timeout: 60000 })
  await page.waitForTimeout(1200)

  // ---- 造数：四个面板各写一条含同一关键词的记录 ----
  const seeded = await page.evaluate(async (kw) => {
    const out = {}
    const td = await import('/src/stores/workbenchTodos.ts')
    const todos = td.useWorkbenchTodosStore()
    todos.addTodo({ title: `${kw}事项：整理书单`, priority: 'medium' })
    out.todo = todos.activeTodos.some((t) => t.title.includes(kw))

    const dm = await import('/src/stores/workbenchDiary.ts')
    const diary = dm.useWorkbenchDiaryStore()
    await diary.loadDiary()
    await diary.upsertEntry('2026-01-02', `${kw}正文：今天去看了窑址`, { title: `${kw}旅行计划` })
    out.diary = diary.activeEntries.some((e) => (e.title || '').includes(kw))

    const hm = await import('/src/stores/workbenchHabits.ts')
    const habits = hm.useWorkbenchHabitsStore()
    await habits.loadHabits()
    await habits.addHabit(`${kw}晨读`, 5)
    out.habit = habits.habits.some((h) => h.name.includes(kw))

    const gm = await import('/src/stores/genealogy.ts')
    const family = gm.useGenealogyStore()
    await family.load()
    await family.addMember({ name: `司${kw}`, note: '家族长辈' })
    await family.addNameRecord({ name: `司泽${kw}`, gender: '', meaning: '青瓷喻温润坚致' })
    out.member = family.activeMembers.some((m) => m.name.includes(kw))
    out.name = family.activeNames.some((n) => n.name.includes(kw))
    return out
  }, KW)
  console.log('[qa] seed:', JSON.stringify(seeded))
  check('seed 四类数据均写入', Object.values(seeded).every(Boolean), JSON.stringify(seeded))

  // ---- S1 打开浮层 ----
  await page.keyboard.press('Alt+k')
  await page.waitForSelector('[data-testid="sp-input"]', { timeout: 15000 })
  check('S1 Alt+K 打开全局搜索浮层', await page.locator('[data-testid="sp-overlay"]').isVisible())
  const ph = await page.locator('[data-testid="sp-input"]').getAttribute('placeholder')
  check('S1 placeholder 已含新增分组名（日记/习惯/家谱）', ['日记', '习惯', '家谱'].every((k) => (ph || '').includes(k)), ph)

  // ---- S2/S3 分组命中与顺序 ----
  await page.fill('[data-testid="sp-input"]', KW)
  await page.waitForTimeout(400)
  const headers = await page.locator('.sp-group').allInnerTexts()
  const groups = headers.map((t) => t.trim()).filter(Boolean)
  console.log('[qa] 分组顺序:', JSON.stringify(groups))
  check('S2 命中 待办/日记/习惯/家谱 四组', ['待办', '日记', '习惯', '家谱'].every((g) => groups.includes(g)), groups.join('|'))
  check('S3 分组顺序与 GROUP_ORDER 一致', JSON.stringify(groups) === JSON.stringify(['待办', '日记', '习惯', '家谱']), groups.join('|'))

  // ---- S4/S5 结果项 testid 与副标题 ----
  const hasDiary = await page.locator('[data-testid^="sp-result-diary-"]').count()
  const hasHabit = await page.locator('[data-testid^="sp-result-habit-"]').count()
  const hasMember = await page.locator('[data-testid^="sp-result-genealogy-member-"]').count()
  const hasName = await page.locator('[data-testid^="sp-result-genealogy-name-"]').count()
  check('S4 日记结果 testid 前缀正确', hasDiary > 0, String(hasDiary))
  check('S4 习惯结果 testid 前缀正确', hasHabit > 0, String(hasHabit))
  check('S4 家谱成员结果 testid 前缀正确', hasMember > 0, String(hasMember))
  check('S4 家谱取名记录结果 testid 前缀正确', hasName > 0, String(hasName))
  const nameSub = (await page.locator('[data-testid^="sp-result-genealogy-name-"]').first().innerText()).replace(/\s+/g, ' ')
  check('S5 取名记录副标题显示寓意', nameSub.includes('青瓷喻温润坚致'), nameSub)
  const habitSub = (await page.locator('[data-testid^="sp-result-habit-"]').first().innerText()).replace(/\s+/g, ' ')
  check('S5 习惯副标题显示周目标次数', habitSub.includes('每周 5 次'), habitSub)
  if (process.env.SHOT) await page.screenshot({ path: 'd:/tmp/spotlight-9groups.png', fullPage: true })

  // ---- S7 键盘导航（先验证再点击，避免浮层提前关闭）----
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150)
  const activeText = await page.locator('.sp-result.active').count()
  check('S7 ArrowDown 后出现 active 结果项', activeText === 1, String(activeText))

  // ---- S6 点击日记结果跳转 ----
  await page.locator('[data-testid^="sp-result-diary-"]').first().click()
  await page.waitForTimeout(800)
  check('S6 选中后浮层关闭', (await page.locator('[data-testid="sp-overlay"]').count()) === 0)
  check('S6 跳到日记面板', await page.locator('[data-testid="dj-title-input"]').isVisible())

  // ---- S7b Enter 跳转（回到首页再开搜索，键盘选中家谱成员）----
  await page.click('[data-testid="wb-menu-home"]')
  await page.waitForTimeout(500)
  await page.keyboard.press('Alt+k')
  await page.waitForSelector('[data-testid="sp-input"]', { timeout: 15000 })
  await page.fill('[data-testid="sp-input"]', KW)
  await page.waitForTimeout(400)
  // 走到家谱成员项：直接点一下让它 active，再按 Enter
  await page.locator('[data-testid^="sp-result-genealogy-member-"]').first().hover()
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  const atGenealogy = await page.evaluate(() => location.search.includes('section=genealogy'))
  check('S7b Enter 跳转到家谱面板', atGenealogy, await page.evaluate(() => location.search))

  check('S8 无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
