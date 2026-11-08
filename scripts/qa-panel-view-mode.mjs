/**
 * QA：个人工作台表格面板「列表 / 卡片」切换的持久化 + 云同步
 *
 * 断言：
 *  S1  源码守卫：WebDAV / 飞书两条链路都是 settings 整包展开（新字段不会被白名单漏掉）
 *  S2  便签面板初始列表（按钮显示「卡片」、表格可见）
 *  S3  点击后切到卡片（按钮显示「列表」、卡片网格可见）
 *  S4  IDB settings 落库 notes=card；S5 pinia store 同步；S6 刷新后仍是卡片
 *  S7  WebDAV workbench.json 信封带 notes=card 且不带云凭证
 *  S8  飞书同源 settings 记录（剥离云配置后）仍带该字段
 *  S9  切回列表 = 删键（默认值不落库）
 *  S10 多面板独立；S11 云端拉回后已挂载面板 watch 生效
 *  S12 移动端强制卡片但不写偏好；S13 回到桌面偏好不被手机污染
 *  S15 学生台（阅读记录）真实点击 / 落库 / 刷新保留；S16 销售台（库存）真实点击 / 落库
 *  S17 三类工作台 key 同进 workbench.json
 *  S18 博客后台文章列表真实点击 / 落库 / 刷新保留
 *  S19 教师台 3 key 落地后五台 key 同进 workbench.json；S14 无页面级 JS 异常
 *
 * 用法：node scripts/qa-panel-view-mode.mjs
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
async function isViteDevAt(port) {
  try {
    const res = await fetch(`http://localhost:${port}/src/composables/useIdb.ts`)
    if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) return false
    return (await res.text()).includes('idbExportAll')
  } catch { return false }
}
async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return true } catch { }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}
let server = null, startedByUs = false
async function ensureDevServer() {
  for (let p = 16718; p <= 16726; p++) if (await isViteDevAt(p)) return 'http://localhost:' + p
  for (let p = 16718; p <= 16726; p++) {
    try { const r = await fetch(`http://localhost:${p}/`, { signal: AbortSignal.timeout(1500) }); if (r.ok) continue } catch { }
    server = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    startedByUs = true
    server.stdout.on('data', () => {})
    server.stderr.on('data', () => {})
    if (await waitForServer('http://localhost:' + p) && await isViteDevAt(p)) return 'http://localhost:' + p
    server.kill(); server = null; startedByUs = false
  }
  throw new Error('no free port')
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

// ---- S1 源码守卫：两条同步链路都必须是 settings 整包展开 ----
const idbSrc = fs.readFileSync(join(ROOT, 'src/composables/useIdb.ts'), 'utf8')
const feishuSrc = fs.readFileSync(join(ROOT, 'src/composables/feishuSync.ts'), 'utf8')
check('S1 WebDAV settings 整包展开', /const out: Record<string, unknown> = \{ \.\.\.settings \}/.test(idbSrc))
check('S1 飞书 settings 整包展开', /const s2: Record<string, unknown> = \{ \.\.\.settingsVal \}/.test(feishuSrc))

// S1 静态守卫：三工作台每个带切换按钮的面板都必须登记 key（防新增面板漏接）
const EXPECTED_KEYS = {
  'src/components/workbench/WorkbenchTodo.vue': 'todos',
  'src/components/workbench/WorkbenchNotes.vue': 'notes',
  'src/components/workbench/WorkbenchCountdown.vue': 'countdowns',
  'src/components/workbench/WorkbenchGenealogy.vue': 'genealogy',
  'src/components/business/BusinessPurchases.vue': 'biz-purchases',
  'src/components/business/BusinessExpenses.vue': 'biz-expenses',
  'src/components/business/BusinessDaily.vue': 'biz-daily',
  'src/components/student/StudentEducation.vue': 'stu-education',
  'src/components/student/StudentGrades.vue': 'stu-grades',
  'src/components/student/StudentHealthHeight.vue': 'stu-height',
  'src/components/student/StudentHomework.vue': 'stu-homework',
  'src/components/student/StudentGoals.vue': 'stu-goals',
  'src/components/student/StudentMistakes.vue': 'stu-mistakes',
  'src/components/student/StudentExam.vue': 'stu-exam',
  'src/components/student/StudentPlan.vue': 'stu-plan',
  'src/components/student/StudentReading.vue': 'stu-reading',
  'src/components/student/StudentReview.vue': 'stu-review',
  'src/components/student/StudentReward.vue': 'stu-reward',
  'src/components/teacher/TeacherTalks.vue': 'tea-talks',
  'src/components/teacher/TeacherHomework.vue': 'tea-homework',
  'src/components/teacher/TeacherGroups.vue': 'tea-groups',
  'src/components/blog/BlogPosts.vue': 'blog-posts'
}
const misWired = Object.entries(EXPECTED_KEYS)
  .filter(([file, key]) => !fs.readFileSync(join(ROOT, file), 'utf8').includes(`useViewMode('${key}')`))
  .map(([file]) => file)
check('S1 22 个面板全部登记 key', misWired.length === 0, misWired.join(', '))
// 全站不该再有漏接的切换面板（CategoryManager 例外，见下一条）
const leftovers = []
for (const dir of ['workbench', 'business', 'student', 'teacher', 'blog']) {
  const folder = join(ROOT, 'src/components', dir)
  for (const file of fs.readdirSync(folder).filter((f) => f.endsWith('.vue'))) {
    const src = fs.readFileSync(join(folder, file), 'utf8')
    if (src.includes('ViewModeToggle') && /const vm = useViewMode\(\)/.test(src)) leftovers.push(`${dir}/${file}`)
  }
}
check('S1 无漏接的 ViewModeToggle 面板', leftovers.length === 0, leftovers.join(', '))
// 只用 vm.isMobile 的组件不该被误接（它没有切换按钮，写了偏好也永远不会变）
const bizCatSrc = fs.readFileSync(join(ROOT, 'src/components/business/BusinessCategoryManager.vue'), 'utf8')
check('S1 仅用 isMobile 的组件保持无 key', /const vm = useViewMode\(\)/.test(bizCatSrc))

const readModes = (page) => page.evaluate(async () => {
  const m = await import('/src/composables/useIdb.ts')
  const s = await m.idbGet('settings')
  return s?.workbenchPanelViewModes ?? null
})
const label = (page) => page.locator('.ewt-view-toggle-label').innerText()
const openNotes = async (page) => {
  await page.click('[data-testid="wb-menu-notes"]')
  await page.waitForSelector('.ewt-view-toggle', { state: 'attached', timeout: 60000 })
}

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-notes"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) await page.click('.help-dialog .close-btn')
  // 造一条便签，让表格 / 卡片两种形态都真实渲染
  await page.evaluate(async () => {
    const { useWorkbenchNotesStore } = await import('/src/stores/workbenchNotes.ts')
    const s = useWorkbenchNotesStore()
    await s.loadNotes?.()
    await s.addNote({ title: 'QA 视图切换', content: '验证列表/卡片偏好落库与云同步', color: 'yellow' })
  })
  await openNotes(page)

  check('S2 初始为列表视图', (await label(page)).trim() === '卡片', await label(page))
  check('S2 表格可见', await page.locator('.nt-table-wrap .ewt-table').count() > 0)

  await page.click('.ewt-view-toggle')
  await page.waitForFunction(() => document.querySelector('.ewt-view-toggle-label')?.textContent?.trim() === '列表')
  check('S3 切换后为卡片视图', (await label(page)).trim() === '列表', await label(page))
  check('S3 卡片网格可见、表格已卸载',
    await page.locator('.ewt-card-grid').count() > 0 && await page.locator('.nt-table-wrap .ewt-table').count() === 0)

  const modesAfterToggle = await readModes(page)
  check('S4 IDB settings 落库 notes=card', modesAfterToggle?.notes === 'card', JSON.stringify(modesAfterToggle))
  const storeMode = await page.evaluate(async () => {
    const { useAppSettingsStore } = await import('/src/stores/settings.ts')
    return useAppSettingsStore().getPanelViewMode('notes')
  })
  check('S5 pinia store 读到 card', storeMode === 'card', storeMode)

  // WebDAV 出站信封（真实调用 exportWorkbench，不靠猜字段名）
  const envelope = await page.evaluate(async () => {
    const m = await import('/src/composables/useIdb.ts')
    const w = await m.exportWorkbench()
    return {
      modes: w.settings?.workbenchPanelViewModes,
      hasPwd: 'cloudSyncPassword' in (w.settings ?? {}),
      hasUrl: 'cloudSyncUrl' in (w.settings ?? {})
    }
  })
  check('S7 workbench.json 信封带 notes=card', envelope.modes?.notes === 'card', JSON.stringify(envelope.modes))
  check('S7 云凭证未进信封', !envelope.hasPwd && !envelope.hasUrl)

  // 飞书同源：读的是同一条 settings 记录，只剥离云配置字段
  const feishuRow = await page.evaluate(async () => {
    const m = await import('/src/composables/useIdb.ts')
    const s = (await m.idbGet('settings')) ?? {}
    const row = { ...s }
    for (const k of ['cloudSyncEnabled', 'cloudSyncUrl', 'cloudSyncUsername', 'cloudSyncPassword',
      'cloudSyncInterval', 'cloudSyncSilentThreshold', 'cloudSyncAutoPush', 'cloudSyncChannel',
      'cloudSyncFeishuAppId', 'cloudSyncFeishuAppSecret', 'cloudSyncFeishuDatasourceUrl']) delete row[k]
    return row.workbenchPanelViewModes ?? null
  })
  check('S8 飞书 settings 行带 notes=card', feishuRow?.notes === 'card', JSON.stringify(feishuRow))

  // 刷新保留
  await page.reload({ waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-notes"]', { timeout: 120000 })
  await openNotes(page)
  await page.waitForFunction(() => document.querySelector('.ewt-view-toggle-label')?.textContent?.trim() === '列表')
  check('S6 刷新后仍是卡片视图', (await label(page)).trim() === '列表', await label(page))

  // 切回列表 = 默认不落库
  await page.click('.ewt-view-toggle')
  await page.waitForFunction(() => document.querySelector('.ewt-view-toggle-label')?.textContent?.trim() === '卡片')
  const modesAfterReset = await readModes(page)
  check('S9 切回列表后 notes 键被删除', !modesAfterReset?.notes, JSON.stringify(modesAfterReset))

  // 多面板独立
  await page.evaluate(async () => {
    const { useAppSettingsStore } = await import('/src/stores/settings.ts')
    useAppSettingsStore().setPanelViewMode('todos', 'card')
  })
  const multi = await readModes(page)
  check('S10 多面板独立（todos=card / notes 缺省）', multi?.todos === 'card' && !multi?.notes, JSON.stringify(multi))

  // 模拟云同步拉回：直接改 IDB settings + 重跑 initSettings，已挂载面板应跟着切
  await page.evaluate(async () => {
    const idb = await import('/src/composables/useIdb.ts')
    const cur = (await idb.idbGet('settings')) ?? {}
    await idb.idbPut('settings', { ...cur, workbenchPanelViewModes: { notes: 'card', todos: 'card' } })
    const { useAppSettingsStore } = await import('/src/stores/settings.ts')
    await useAppSettingsStore().initSettings()
  })
  await page.waitForFunction(() => document.querySelector('.ewt-view-toggle-label')?.textContent?.trim() === '列表', null, { timeout: 10000 })
  check('S11 云端拉回后已挂载面板 watch 生效', (await label(page)).trim() === '列表', await label(page))

  // 桌面切回 list，再用手机视口验证「强制卡片但不写偏好」
  await page.click('.ewt-view-toggle')
  await page.waitForFunction(() => document.querySelector('.ewt-view-toggle-label')?.textContent?.trim() === '卡片')
  await page.setViewportSize({ width: 375, height: 800 })
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ewt-view-toggle')).display === 'none')
  const mobileModes = await readModes(page)
  const toggleHidden = await page.evaluate(() => getComputedStyle(document.querySelector('.ewt-view-toggle')).display === 'none')
  check('S12 移动端切换按钮隐藏', toggleHidden)
  check('S12 移动端不写 notes 偏好（不污染 PC）', !mobileModes?.notes, JSON.stringify(mobileModes))
  check('S12 移动端强制卡片渲染', await page.locator('.ewt-card-grid').count() > 0)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ewt-view-toggle')).display !== 'none')
  const backModes = await readModes(page)
  check('S13 回到桌面 notes 仍为默认列表', !backModes?.notes, JSON.stringify(backModes))
  check('S13 其它面板偏好未被手机覆盖', backModes?.todos === 'card', JSON.stringify(backModes))

  // ---- S15 学生台：阅读记录面板真实点击 + 刷新保留 ----
  await page.goto(base + '/student', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.st-menu-item', { timeout: 120000 })
  if (await page.locator('[data-testid="stg-onboarding-confirm"]').count()) {
    await page.locator('.onboarding-dialog .ob-btn-secondary').click()
  }
  // 标记学段已播种，保证下面的 reload 不再被引导页挡住
  await page.evaluate(async () => {
    const { useStudentSettingsStore } = await import('/src/stores/studentSettings.ts')
    const s = useStudentSettingsStore()
    await s.loadSettings()
    await s.markStageSeeded(s.stage)
  })
  await page.click('.st-menu-item[aria-label="阅读记录"]')
  await page.waitForSelector('.ewt-view-toggle', { state: 'attached', timeout: 60000 })
  const stuBefore = await label(page)
  check('S15 学生台初始为列表', stuBefore.trim() === '卡片', stuBefore)
  await page.click('.ewt-view-toggle')
  await page.waitForFunction(() => document.querySelector('.ewt-view-toggle-label')?.textContent?.trim() === '列表', null, { timeout: 20000 })
  const stuModes = await readModes(page)
  check('S15 学生台落库 stu-reading=card', stuModes?.['stu-reading'] === 'card', JSON.stringify(stuModes))
  check('S15 学生台与个人工作台偏好互不干扰', stuModes?.todos === 'card' && !stuModes?.notes, JSON.stringify(stuModes))

  await page.reload({ waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.st-menu-item', { timeout: 120000 })
  await page.click('.st-menu-item[aria-label="阅读记录"]')
  await page.waitForFunction(() => document.querySelector('.ewt-view-toggle-label')?.textContent?.trim() === '列表', null, { timeout: 20000 })
  check('S15 学生台刷新后仍是卡片', (await label(page)).trim() === '列表')

  // ---- S16 销售台：账本 gate → 造一笔进货 → 库存面板真实点击 ----
  await page.goto(base + '/business', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="bs-content"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) await page.click('.help-dialog .close-btn')
  if (await page.locator('[data-testid="bs-gate-submit"]').count()) {
    await page.click('[data-testid="bs-gate-submit"]')
    await page.waitForFunction(() => !document.querySelector('[data-testid="bs-gate-submit"]'), null, { timeout: 30000 })
  }
  await page.evaluate(async () => {
    const m = await import('/src/stores/workbenchBusiness.ts')
    const s = m.useWorkbenchBusinessStore()
    await s.loadBusiness()
    if (!s.hasLedgers) s.createLedger(new Date().getFullYear())
    const d = new Date()
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await s.addProduct({ name: 'QA视图切换', categoryId: s.productCategories[0]?.id, unit: '斤', purchasePrice: 3.2, sellingPrice: 5.5 })
    const p = s.products.find((x) => x.name === 'QA视图切换')
    await s.addPurchase({ productId: p.id, quantity: 10, unitPrice: 3.2, date })
  })
  await page.click('[data-testid="bs-menu-purchases"]')
  await page.waitForSelector('.ewt-view-toggle', { state: 'attached', timeout: 60000 })
  await page.click('.ewt-view-toggle')
  await page.waitForFunction(() => document.querySelector('.ewt-view-toggle-label')?.textContent?.trim() === '列表', null, { timeout: 20000 })
  const bizModes = await readModes(page)
  check('S16 销售台落库 biz-purchases=card', bizModes?.['biz-purchases'] === 'card', JSON.stringify(bizModes))

  // ---- S17 三类工作台的 key 同时进入云同步出站信封 ----
  const finalEnvelope = await page.evaluate(async () => {
    const m = await import('/src/composables/useIdb.ts')
    const w = await m.exportWorkbench()
    return w.settings?.workbenchPanelViewModes ?? null
  })
  check('S17 workbench.json 同时带三类 key',
    finalEnvelope?.todos === 'card' && finalEnvelope?.['stu-reading'] === 'card' && finalEnvelope?.['biz-purchases'] === 'card',
    JSON.stringify(finalEnvelope))

  // ---- S18 博客后台：文章列表真实点击 + 刷新保留 ----
  await page.goto(base + '/blog/admin', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="blog-nav-posts"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) await page.click('.help-dialog .close-btn')
  await page.evaluate(async () => {
    const { useBlogStore } = await import('/src/stores/blog.ts')
    const s = useBlogStore()
    await s.loadBlog()
    if (!s.articles?.length) await s.createArticle({ title: 'QA 视图切换' })
  })
  await page.waitForSelector('.ewt-view-toggle', { state: 'attached', timeout: 60000 })
  await page.click('.ewt-view-toggle')
  await page.waitForFunction(() => document.querySelector('.ewt-view-toggle-label')?.textContent?.trim() === '列表', null, { timeout: 20000 })
  const blogModes = await readModes(page)
  check('S18 博客后台落库 blog-posts=card', blogModes?.['blog-posts'] === 'card', JSON.stringify(blogModes))
  await page.reload({ waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.ewt-view-toggle', { state: 'attached', timeout: 60000 })
  await page.waitForFunction(() => document.querySelector('.ewt-view-toggle-label')?.textContent?.trim() === '列表', null, { timeout: 20000 })
  check('S18 博客后台刷新后仍是卡片', (await label(page)).trim() === '列表')

  // ---- S19 教师台 3 个 key：模拟云同步拉回落地后，五台 key 同进信封 ----
  await page.evaluate(async () => {
    const idb = await import('/src/composables/useIdb.ts')
    const cur = (await idb.idbGet('settings')) ?? {}
    const modes = {
      ...(cur.workbenchPanelViewModes ?? {}),
      'tea-talks': 'card', 'tea-homework': 'card', 'tea-groups': 'card'
    }
    await idb.idbPut('settings', { ...cur, workbenchPanelViewModes: modes })
    const { useAppSettingsStore } = await import('/src/stores/settings.ts')
    await useAppSettingsStore().initSettings()
  })
  await page.waitForFunction(async () => {
    const m = await import('/src/composables/useIdb.ts')
    const rec = await m.idbGet('settings')
    return rec?.workbenchPanelViewModes?.['tea-groups'] === 'card'
  }, null, { timeout: 15000 })
  const fullEnvelope = await page.evaluate(async () => {
    const m = await import('/src/composables/useIdb.ts')
    const w = await m.exportWorkbench()
    return w.settings?.workbenchPanelViewModes ?? null
  })
  const fiveKeys = ['todos', 'stu-reading', 'biz-purchases', 'blog-posts', 'tea-talks', 'tea-homework', 'tea-groups']
  check('S19 五工作台 key 同进 workbench.json',
    fiveKeys.every((k) => fullEnvelope?.[k] === 'card'), JSON.stringify(fullEnvelope))

  check('S14 无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
