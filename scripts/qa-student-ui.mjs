/**
 * QA：学生工作台 UI 契约（student-ui）—— 按当前 UI 重写
 *
 * 历史：原脚本断言的是「首页三屏轮播 + 习惯平铺卡片」的旧 UI，学生台改版后
 *      （首页改为 greeted + 行动台/数据概览/工具栏**三块平铺**，习惯改为日历卡）
 *      整套断言失效，跑起来一片红但 UI 是好的。本版按当前实现重写。
 *
 * 覆盖 S1–S12，共 42 条断言：
 *   S1  骨架与菜单（16 项、默认主页、收起按钮挂 .tw-btn、昵称）
 *   S2  首页（三块同屏、无轮播残留、概览 6 卡、工具卡跳转、行动卡跳转）
 *   S3  习惯（日历卡数量、空名拒存、新增 +1、今日打卡 +1、删除 -1）
 *   S4  作业（行数、空标题拒存、新增 +1、状态推进、状态筛选）
 *   S5  课程表（网格渲染、周切换、今日速览、空态提示）
 *   S6  复习（卡片数、tab 切换、新增 +1、掌握推进）
 *   S7  错题（卡片数、搜索过滤、清空复原）
 *   S8  阅读（统计卡、种子书名、新增 +1）
 *   S9  成就 / 奖励（勋章 12 枚、分类 tab、奖励 2 项、规则弹框）
 *   S10 家长协同（tab 数、分页器、切 tab）
 *   S11 全 16 面板可渲染（逐个点，内容非空，汇总失败清单）
 *   S12 移动端 390px（底栏贴底、收起按钮隐藏、无横向溢出）
 *
 * 断言策略：**UI 操作驱动、store 校验结果**。分页/筛选/视图切换很容易让
 * 「DOM 里没看到」变成假阴性，所以数量与状态一律以 pinia store 为准，
 * DOM 只用来证明「渲染出来了」与「点了有效」。
 *
 * 用法：node scripts/qa-student-ui.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'student-ui')
const EVIDENCE_LOG = join(EVIDENCE_DIR, 'qa-student-ui.log')
const FAIL_DIR = join(EVIDENCE_DIR, 'fail')
if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true })
if (!existsSync(FAIL_DIR)) mkdirSync(FAIL_DIR, { recursive: true })

/** 用本机已装的 chromium（playwright 自带的 headless shell 常常没下载）。
 *  与本目录其它 QA 脚本保持一致：不做 playwright install。 */
function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!existsSync(root)) return undefined
  for (const d of readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (existsSync(p)) return p
  }
  return undefined
}

async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { const res = await fetch(url); if (res.ok) return true } catch { }
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
let devProc = null
let devBase = ''
async function ensureDevServer() {
  for (let p = 16718; p <= 16726; p++) if (await isViteDevAt(p)) { devBase = 'http://localhost:' + p; return }
  for (let p = 16718; p <= 16726; p++) {
    if (!(await isPortFree(p))) continue
    devProc = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    devProc.stdout.on('data', () => {})
    devProc.stderr.on('data', () => {})
    if (await waitForServer('http://localhost:' + p)) {
      if (await isViteDevAt(p)) { devBase = 'http://localhost:' + p; return }
    }
    devProc.kill(); devProc = null
  }
  throw new Error('no free port')
}

// ============ 记录 ============
const results = []
function record(name, ok, detail) {
  results.push({ name, ok })
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + JSON.stringify(detail) : ''}`
  console.log(line)
  appendFileSync(EVIDENCE_LOG, new Date().toISOString() + '  ' + line + '\n')
}
function safeName(s) { return s.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 80) }
async function guard(name, fn, opts) {
  try { await fn() } catch (err) {
    record(name, false, { error: String(err && err.message || err).slice(0, 200) })
    if (opts && opts.page) {
      try { await opts.page.screenshot({ path: join(FAIL_DIR, safeName(name) + '.png'), fullPage: true, type: 'png' }) } catch { /* 截图失败不影响断言 */ }
    }
  }
}

// ============ 日期工具 ============
function pad(n) { return String(n).padStart(2, '0') }
function localDateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
function dateOffsetKey(daysBack) { const n = new Date(); return localDateKey(new Date(n.getFullYear(), n.getMonth(), n.getDate() - daysBack)) }
function dateOffsetFuture(daysForward) { const n = new Date(); return localDateKey(new Date(n.getFullYear(), n.getMonth(), n.getDate() + daysForward)) }
function iso(offsetMs) { return new Date(Date.now() + (offsetMs || 0)).toISOString() }

// ============ 种子数据 ============
const SUBJECTS = ['语文', '数学', '英语']
/** 学生台全部 16 个菜单键（home 恒显示，其余按 menuVisibility 过滤） */
const STUDENT_SECTIONS = [
  'home', 'habits', 'homework', 'timetable', 'plan', 'goal',
  'review', 'mistakes', 'reading', 'exam', 'grades', 'education',
  'achievements', 'rewards', 'parent', 'health'
]
/** 菜单顺序 + 默认文案（与 types/index.ts 的 STUDENT_MENU_DEFAULT_LABELS 一致） */
const MENU = [
  ['home', '主页'], ['habits', '习惯打卡'], ['homework', '作业管理'], ['timetable', '课程表'],
  ['plan', '学习计划'], ['review', '复习计划'], ['mistakes', '错题本'], ['reading', '阅读记录'],
  ['exam', '考试倒计时'], ['grades', '成绩记录'], ['goal', '学习目标'], ['education', '教育经历'],
  ['health', '健康管理'], ['achievements', '成就勋章'], ['rewards', '奖励积分'], ['parent', '家长协同']
]

function buildSettings() {
  const menuVisibility = {}
  // 早期版本这里写的是 diary / pomodoro（不存在的键），导致 timetable 等被学段默认关掉。
  // 学生台的键以 STUDENT_SECTIONS 为准，全开。
  STUDENT_SECTIONS.forEach((k) => { menuVisibility[k] = true })
  return { stage: 'K', stageSeeded: 'K', nickname: 'QA 小萌娃', subjects: SUBJECTS, menuVisibility }
}
function buildHabits() {
  return {
    habits: [
      { id: 'shb_q1', name: '每日阅读', category: '阅读', frequency: 7, color: '#22c55e', createdAt: iso(-86400000 * 7) },
      { id: 'shb_q2', name: '整理书包', category: 'life', frequency: 7, color: '#3b82f6', createdAt: iso(-86400000 * 6) }
    ],
    records: [
      { id: 'shr_q1_1', habitId: 'shb_q1', date: dateOffsetKey(1), parentMarked: false, createdAt: iso(-3600000) },
      { id: 'shr_q1_2', habitId: 'shb_q1', date: dateOffsetKey(2), parentMarked: false, createdAt: iso(-7200000) }
    ]
  }
}
function buildHomework() {
  return {
    entries: [
      { id: 'hw_q1', subject: '语文', title: '抄写古诗两首', content: '抄写《静夜思》《春晓》各 3 遍。', dueDate: dateOffsetFuture(1), status: 'pending', priority: 'normal', source: 'self', createdAt: iso(-86400000) },
      { id: 'hw_q2', subject: '数学', title: '口算练习 30 题', dueDate: dateOffsetFuture(2), status: 'doing', priority: 'high', source: 'self', createdAt: iso(-86400000 * 2) },
      { id: 'hw_q3', subject: '英语', title: '单词听写 Unit 3', dueDate: dateOffsetFuture(0), status: 'done', priority: 'normal', source: 'self', completedAt: iso(-14400000), createdAt: iso(-86400000 * 3) }
    ]
  }
}
function buildReview() {
  const d1 = dateOffsetKey(3), d2 = dateOffsetKey(10)
  const d1next = (() => { const d = new Date(d1 + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) })()
  const d2next = (() => { const d = new Date(d2 + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 7); return d.toISOString().slice(0, 10) })()
  return {
    entries: [
      { id: 'rv_q1', subject: '数学', knowledge: '加法进位法则', source: '教材 P20', learnDate: d1, stage: 1, nextReviewDate: d1next, mastered: false, createdAt: iso(-28800000), updatedAt: iso(-28800000) },
      { id: 'rv_q2', subject: '语文', knowledge: '古诗《静夜思》默写', source: '错题本', learnDate: d2, stage: 3, nextReviewDate: d2next, mastered: false, createdAt: iso(-32400000), updatedAt: iso(-32400000) }
    ]
  }
}
function buildMistakes() {
  return {
    entries: [
      { id: 'mk_q1', subject: '数学', title: '典型进位加法错题', question: '## 题干\n\n28 + 47 = ?', answer: '## 正确答案\n\n28 + 47 = 75', analysis: '### 解析\n\n个位 8+7=15，向十位进 1。', tags: ['高频考点', '易错'], imageIds: [], status: 'reviewing', createdAt: iso(-172800000), updatedAt: iso(-172800000) },
      { id: 'mk_q2', subject: '语文', title: '易错字练习', question: '## 题干\n\n选择正确字形：再接再厉 / 再接再励', answer: '## 正确答案\n\n「再接再厉」（厉：磨砺）。', tags: ['基础'], imageIds: [], status: 'new', createdAt: iso(-86400000), updatedAt: iso(-86400000) }
    ]
  }
}
function buildReading() {
  return {
    entries: [
      { id: 'rd_q1', bookTitle: '格林童话', pages: 32, durationMin: 25, impression: '# 感悟\n\n白雪公主的故事很精彩。', date: dateOffsetKey(1), parentSigned: false, createdAt: iso(-21600000), updatedAt: iso(-21600000) },
      { id: 'rd_q2', bookTitle: '安徒生童话', pages: 28, durationMin: 22, date: dateOffsetKey(2), parentSigned: true, signedAt: iso(-18000000), createdAt: iso(-28800000), updatedAt: iso(-18000000) }
    ]
  }
}
function buildAchievements() {
  const defs = []; const unlocked = {}
  const CAT = ['habit', 'study', 'reading', 'pomodoro']
  const EMOJIS = ['🏅', '🎖️', '🥇', '🥈', '🥉', '⭐', '🌟', '✨', '💎', '🏆', '🎯', '🔥']
  const METRIC = ['streak-days', 'habit-week-rate', 'reading-books', 'pomodoro-sessions', 'hw-rate-done', 'mistake-mastered']
  for (let i = 1; i <= 12; i++) {
    defs.push({ id: 'sa_q' + i, name: '成就 ' + i, description: '完成目标即可解锁。', emoji: EMOJIS[i - 1], category: CAT[(i - 1) % CAT.length], metric: METRIC[(i - 1) % METRIC.length], target: i })
    if (i % 3 === 0) unlocked['sa_q' + i] = iso(-3600000 * i)
  }
  return { definitions: defs, unlocked }
}
function buildRewards() {
  return {
    totalPoints: 1580,
    history: [
      { id: 'rt_q1', type: 'earn', points: 100, reason: '完成习惯打卡 5 项', createdAt: iso(-36000000) },
      { id: 'rt_q2', type: 'earn', points: 80, reason: '完成作业 4 份', createdAt: iso(-32400000) }
    ],
    rewards: [
      { id: 'rw_q1', name: '周末去公园玩', cost: 30, stock: 5 },
      { id: 'rw_q2', name: '额外30分钟平板', cost: 20 }
    ]
  }
}
function buildCountdowns() {
  const d = new Date(Date.now() + 7 * 86400000)
  const d2 = new Date(Date.now() + 9 * 86400000)
  return {
    countdowns: [
      { id: 'ex_q1', name: '期中大考', endDateTime: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T08:30', repeat: null, category: 'work', createdAt: iso(-7200000), updatedAt: iso(-7200000), color: '#ef4444' },
      { id: 'ex_q2', name: '秋季运动会', endDateTime: d2.getFullYear() + '-' + pad(d2.getMonth() + 1) + '-' + pad(d2.getDate()) + 'T09:00', repeat: null, category: 'exercise', createdAt: iso(-3600000), updatedAt: iso(-3600000), color: '#22c55e' }
    ],
    customCategories: [], sortRule: 'endDate'
  }
}
function buildPlans() {
  return {
    entries: [
      {
        id: 'pl_q1', type: 'weekly', title: '第 36 周学习计划', startDate: dateOffsetKey(0), endDate: dateOffsetFuture(6),
        goals: [
          { id: 'pg_q1_g1', content: '完成数学同步练习 P12-P14', progress: 0, done: false },
          { id: 'pg_q1_g2', content: '每天阅读 30 分钟', progress: 50, done: false },
          { id: 'pg_q1_g3', content: '背会 20 个英语新单词', progress: 100, done: true }
        ],
        review: '# 上周复盘\n\n已完成数学练习册。', createdAt: iso(-7200000), updatedAt: iso(-7200000)
      },
      {
        id: 'pl_q2', type: 'monthly', title: '九月月度目标', startDate: dateOffsetKey(0), endDate: dateOffsetFuture(29),
        goals: [{ id: 'pg_q2_g1', content: '读完 2 本课外书', progress: 0, done: false }], createdAt: iso(-3600000), updatedAt: iso(-3600000)
      }
    ]
  }
}

// ============ IDB 种子注入 ============
async function injectIdbStore(page, storeName, payload) {
  return page.evaluate(({ store, value }) => new Promise((resolve, reject) => {
    // 不带版本号打开：页面此时已由 app 自己建好库（DB_VERSION 会随迭代上调，
    // 这里写死版本号会在库里已是更高版本时抛 VersionError，脚本直接跑不起来）。
    const req = indexedDB.open('easy-web-tab')
    req.onsuccess = () => {
      const db = req.result
      try {
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).put(value, 'items')
        tx.oncomplete = () => { db.close(); resolve(true) }
        tx.onerror = () => { db.close(); reject(tx.error) }
      } catch (e) { db.close(); reject(e) }
    }
    req.onerror = () => reject(req.error)
  }), { store: storeName, value: payload })
}

// ============ 页面工具 ============
/** 通过 pinia 读写 store（断言以 store 为准，DOM 只证明渲染与交互） */
function storeEval(page, storeName, body) {
  return page.evaluate(({ name, src }) => {
    try {
      const app = document.querySelector('#app')
      const inst = app && app.__vue_app__ && app.__vue_app__._instance
      const pinia = inst && inst.appContext.config.globalProperties.$pinia
      const store = pinia && pinia._s && pinia._s.get(name)
      if (!store) return Promise.resolve({ ok: false, reason: 'no-store:' + name })
      // eslint-disable-next-line no-new-func
      const fn = new Function('store', `return (async () => { ${src} })()`)
      return Promise.resolve(fn(store)).catch((e) => ({ ok: false, reason: String(e) }))
    } catch (e) { return Promise.resolve({ ok: false, reason: String(e) }) }
  }, { name: storeName, src: body })
}

/** 点左侧菜单（按文案，比按下标稳：菜单顺序可被设置调整） */
async function navTo(page, label) {
  const item = page.locator('.st-menu-item', { hasText: label }).first()
  await item.click()
  await page.waitForTimeout(320)
}
/** 关掉所有弹框（el-dialog / BaseDialog 确认框） */
async function closeDialogs(page) {
  for (let i = 0; i < 3; i++) {
    const cancel = page.locator('.bd-overlay .btn-cancel')
    if (await cancel.count()) { await cancel.first().click().catch(() => { }); await page.waitForTimeout(150) }
    const open = page.locator('.el-dialog:visible, .bd-overlay:visible')
    if (!(await open.count())) break
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }
  await page.waitForTimeout(120)
}
/** 有序尝试多个选择器，返回第一个命中的元素数量 */
async function countFirst(page, selectors) {
  for (const s of selectors) { const n = await page.locator(s).count(); if (n > 0) return n }
  return 0
}
/**
 * 往 el-input 里填值。
 * `data-testid` 挂在 el-input 上时会落到**外层 div**（Vue 透传），
 * 直接对 div 调 fill() 会报 "not an <input>"，所以要按「内层 → 自身 → 裸 input」顺序找。
 */
async function fillInput(page, testid, value) {
  const candidates = [`[data-testid="${testid}"] input`, `input[data-testid="${testid}"]`, `[data-testid="${testid}"]`]
  for (const sel of candidates) {
    const loc = page.locator(sel).first()
    if (await loc.count()) {
      try { await loc.fill(value); return true } catch { /* 换下一个候选 */ }
    }
  }
  return false
}
/**
 * 列表面板的行数。
 * 作业/复习/错题等面板默认是**列表视图**（el-table），卡片视图另有 xxx-card-* 锚点，
 * 两者互斥。这里优先数表格行，表格不存在时回退卡片锚点。
 */
async function rowCount(page, cardSel) {
  const rows = await page.locator('.st-content .el-table__row').count()
  if (rows > 0) return rows
  return cardSel ? page.locator(cardSel).count() : 0
}

// ============ S1 骨架与菜单（4 条） ============
async function runS1(page) {
  await guard('S1-1 左侧菜单 16 项齐备', async () => {
    const n = await page.locator('.st-menu-item').count()
    record('S1-1 左侧菜单 16 项齐备', n === 16, { menuCount: n })
  }, { page })

  await guard('S1-2 默认停在主页', async () => {
    const home = await page.locator('.student-home').count()
    const active = (await page.locator('.st-menu-item.active').first().textContent().catch(() => '') || '').trim()
    record('S1-2 默认停在主页', home > 0 && active.includes('主页'), { home, active })
  }, { page })

  await guard('S1-3 收起按钮挂 .tw-btn .tw-btn-sm（与其余五台同一颗按钮）', async () => {
    const btn = page.locator('.st-sidebar-toggle').first()
    const hasClass = await btn.evaluate((el) => el.classList.contains('tw-btn') && el.classList.contains('tw-btn-sm')).catch(() => false)
    const box = await btn.boundingBox().catch(() => null)
    const style = await btn.evaluate((el) => { const s = getComputedStyle(el); return { fontSize: s.fontSize, borderRadius: s.borderRadius } }).catch(() => null)
    record('S1-3 收起按钮挂 .tw-btn .tw-btn-sm', hasClass && Math.round((box && box.height) || 0) === 30 && style && style.fontSize === '12px' && style.borderRadius === '999px',
      { hasClass, height: box && Math.round(box.height), style })
  }, { page })

  await guard('S1-4 主页问候条带昵称', async () => {
    const txt = (await page.locator('.greeting-text').first().innerText().catch(() => '') || '')
    record('S1-4 主页问候条带昵称', txt.includes('QA 小萌娃'), { snippet: txt.replace(/\s+/g, ' ').slice(0, 60) })
  }, { page })
}

// ============ S2 首页（5 条） ============
async function runS2(page) {
  await navTo(page, '主页')
  await page.waitForSelector('.student-home', { timeout: 10000 })

  await guard('S2-1 三块平铺且同时可见（轮播已取消）', async () => {
    const vis = {}
    for (const t of ['action', 'overview', 'tools']) {
      vis[t] = await page.locator(`[data-testid="student-slide-${t}"]`).first().isVisible().catch(() => false)
    }
    const dots = await page.locator('.student-home .carousel-dots').count()
    const next = await page.locator('[data-testid="student-carousel-next"]').count()
    record('S2-1 三块平铺同时可见、无轮播圆点/箭头',
      vis.action && vis.overview && vis.tools && dots === 0 && next === 0,
      { vis, dotCount: dots, nextCount: next })
  }, { page })

  await guard('S2-2 数据概览 6 张统计卡', async () => {
    const n = await page.locator('[data-testid="student-slide-overview"] .overview-card').count()
    record('S2-2 数据概览 6 张统计卡', n === 6, { overviewCards: n })
  }, { page })

  await guard('S2-3 问候条副标题带今日待办/待复习', async () => {
    const sub = (await page.locator('.greeting-sub').first().textContent().catch(() => '') || '').trim()
    record('S2-3 问候条副标题带今日待办/待复习', sub.includes('今日待办') && sub.includes('待复习'), { sub })
  }, { page })

  await guard('S2-4 工具卡 ≥2 且点「课程表」能跳过去', async () => {
    const n = await page.locator('[data-testid="student-slide-tools"] .tool-card').count()
    const card = page.locator('[data-testid="student-slide-tools"] .tool-card', { hasText: '课程表' }).first()
    await card.click()
    await page.waitForTimeout(400)
    const jumped = await page.locator('.stt-shell').count()
    record('S2-4 工具卡 ≥2 且点「课程表」跳转', n >= 2 && jumped > 0, { toolCards: n, jumped })
  }, { page })

  await guard('S2-5 行动卡点「待办作业」能跳作业管理', async () => {
    await navTo(page, '主页')
    const card = page.locator('[data-testid="student-slide-action"] .action-card', { hasText: '待办作业' }).first()
    await card.click()
    await page.waitForTimeout(400)
    const jumped = await page.locator('[data-testid^="shw-status-"]').count()
    record('S2-5 行动卡「待办作业」跳转作业管理', jumped > 0, { hwRows: jumped })
  }, { page })
}

// ============ S3 习惯（5 条） ============
async function runS3(page) {
  await navTo(page, '习惯打卡')
  await page.waitForTimeout(300)

  await guard('S3-1 日历卡数量 = 种子 2 个', async () => {
    const n = await countFirst(page, ['[data-testid^="hb-card-"]', '.sh-list .hcc-card'])
    record('S3-1 习惯日历卡 = 2', n === 2, { cards: n })
  }, { page })

  await guard('S3-2 空名保存被拒（弹框滞留、卡片数不变）', async () => {
    const before = await countFirst(page, ['[data-testid^="hb-card-"]'])
    await page.locator('[data-testid="sh-add-btn"]').first().click()
    await page.waitForSelector('[data-testid="sh-form-name"]', { state: 'visible', timeout: 6000 })
    await page.locator('[data-testid="sh-form-name"]').fill('')
    await page.locator('[data-testid="sh-form-save"]').first().click()
    await page.waitForTimeout(400)
    const dialogLeft = await page.locator('.el-dialog:visible').count()
    const after = await countFirst(page, ['[data-testid^="hb-card-"]'])
    record('S3-2 空名拒存', dialogLeft >= 1 && before === after, { before, after, dialogLeft })
    await closeDialogs(page)
  }, { page })

  await guard('S3-3 新增习惯 → 卡片 +1', async () => {
    const before = await countFirst(page, ['[data-testid^="hb-card-"]'])
    await page.locator('[data-testid="sh-add-btn"]').first().click()
    await page.waitForSelector('[data-testid="sh-form-name"]', { state: 'visible', timeout: 6000 })
    await page.locator('[data-testid="sh-form-name"]').fill('QA 晨读 15 分钟')
    await page.locator('[data-testid="sh-form-save"]').first().click()
    let after = before
    for (let i = 0; i < 25; i++) { await page.waitForTimeout(120); after = await countFirst(page, ['[data-testid^="hb-card-"]']); if (after > before) break }
    record('S3-3 新增习惯 → 卡片 +1', after === before + 1, { before, after })
    await closeDialogs(page)
  }, { page })

  await guard('S3-4 点今日日历格 → 打卡记录 +1', async () => {
    // 打卡入口是整格按钮 .hb-cal-day（今天那格带 .today），
    // hb-cal-img-* 是「打卡详情图片角标」，只有 detailMode 才渲染，不能用来打卡
    const cell = page.locator('[data-testid="hb-card-shb_q1"] .hb-cal-day.today').first()
    const cellCount = await cell.count()
    const before = await storeEval(page, 'studentHabits', 'return { ok: true, n: store.records.length }')
    if (cellCount) await cell.click()
    await page.waitForTimeout(450)
    const after = await storeEval(page, 'studentHabits', 'return { ok: true, n: store.records.length }')
    record('S3-4 今日打卡 → 记录 +1',
      cellCount > 0 && after.ok && before.ok && after.n === before.n + 1,
      { cellCount, before: before.n, after: after.n })
  }, { page })

  await guard('S3-5 删除 QA 习惯 → 卡片 -1', async () => {
    const before = await countFirst(page, ['[data-testid^="hb-card-"]'])
    // 进入编辑弹框：点卡片上的编辑入口，或直接走 store 删除
    const del = await storeEval(page, 'studentHabits', `
      const t = store.habits.find(h => h.name && h.name.includes('QA 晨读'))
      if (!t) return { ok: false, reason: 'not-found' }
      const r = await store.deleteHabit(t.id)
      return { ok: !!(r && r.ok), n: store.habits.length }
    `)
    await page.waitForTimeout(450)
    let after = before
    for (let i = 0; i < 20; i++) { await page.waitForTimeout(120); after = await countFirst(page, ['[data-testid^="hb-card-"]']); if (after < before) break }
    record('S3-5 删除 QA 习惯 → 卡片 -1', del.ok && after <= before - 1, { before, after, store: del })
    await closeDialogs(page)
  }, { page })
}

// ============ S4 作业（5 条） ============
async function runS4(page) {
  await navTo(page, '作业管理')
  await page.waitForSelector('[data-testid^="shw-status-"]', { timeout: 10000 })

  await guard('S4-1 作业行数 = 种子 3 条', async () => {
    // 注意：shw-status-* 同时用于「状态筛选 tab」和「行内状态徽标」，直接 count 会把 tab 算进去
    const n = await rowCount(page, '[data-testid^="shw-status-hw_"]')
    record('S4-1 作业行数 = 3', n === 3, { rows: n })
  }, { page })

  await guard('S4-2 空标题保存被拒', async () => {
    const before = await rowCount(page)
    await page.locator('[data-testid="shw-add-btn"]').first().click()
    await page.waitForSelector('[data-testid="shw-form-title"]', { state: 'visible', timeout: 6000 })
    await page.locator('[data-testid="shw-form-title"]').fill('')
    await page.locator('[data-testid="shw-form-save"]').first().click()
    await page.waitForTimeout(400)
    const after = await rowCount(page)
    const dialogLeft = await page.locator('.el-dialog:visible').count()
    record('S4-2 空标题拒存', before === after && dialogLeft >= 1, { before, after, dialogLeft })
    await closeDialogs(page)
  }, { page })

  await guard('S4-3 新增作业 → store +1 且标题入库', async () => {
    const title = 'QA 新作业一篇'
    const before = await storeEval(page, 'studentHomework', 'return { ok: true, n: store.entries.length }')
    const added = await storeEval(page, 'studentHomework', `
      const r = await store.addHomework({ subject: '语文', title: '${title}', dueDate: '${dateOffsetFuture(1)}', priority: 'normal' })
      return { ok: !!(r && r.ok), n: store.entries.length, has: store.entries.some(e => e.title && e.title.includes('QA 新作业')) }
    `)
    await page.waitForTimeout(400)
    record('S4-3 新增作业 → store +1', before.ok && added.ok && added.n === before.n + 1 && added.has,
      { before: before.n, after: added.n, hasTitle: added.has })
  }, { page })

  await guard('S4-4 hw_q1 推进 → 状态不再停留在 pending', async () => {
    const r = await storeEval(page, 'studentHomework', `
      const t = store.entries.find(e => e.id === 'hw_q1')
      if (!t) return { ok: false, reason: 'not-found' }
      const s0 = t.status
      await store.advanceStatus('hw_q1')
      const s1 = store.entries.find(e => e.id === 'hw_q1').status
      return { ok: s1 !== s0, s0, s1 }
    `)
    await page.waitForTimeout(350)
    record('S4-4 状态推进生效', r.ok, r)
  }, { page })

  await guard('S4-5 状态筛选「已完成」→ 只剩已完成', async () => {
    await page.locator('[data-testid="shw-status-done"]').first().click()
    await page.waitForTimeout(450)
    const done = await storeEval(page, 'studentHomework', 'return { ok: true, doneCount: store.entries.filter(e => e.status === "done").length }')
    const rows = await rowCount(page)
    record('S4-5 已完成筛选只剩已完成', done.ok && rows === done.doneCount, { rows, doneCount: done.doneCount })
    await page.locator('[data-testid="shw-status-all"]').first().click().catch(() => { })
    await page.waitForTimeout(250)
  }, { page })
}

// ============ S5 课程表（4 条） ============
async function runS5(page) {
  await navTo(page, '课程表')
  await page.waitForSelector('.stt-shell', { timeout: 10000 })

  await guard('S5-1 课程网格渲染（单元格 ≥ 40）', async () => {
    const cells = await page.locator('.stt-grid .stt-cell').count()
    const grid = await page.locator('.stt-grid').count()
    record('S5-1 课程网格渲染', grid > 0 && cells >= 40, { grid, cells })
  }, { page })

  await guard('S5-2 周切换：第 1 周 → 第 2 周', async () => {
    const label = page.locator('.stt-week-label').first()
    const before = (await label.textContent().catch(() => '') || '').trim()
    await page.locator('.stt-week-switch .stt-week-btn').last().click()
    await page.waitForTimeout(300)
    const after = (await label.textContent().catch(() => '') || '').trim()
    record('S5-2 周切换生效', before !== after && after.includes('2'), { before, after })
    await page.locator('.stt-week-switch .stt-week-btn').first().click()
    await page.waitForTimeout(250)
  }, { page })

  await guard('S5-3 今日速览条存在', async () => {
    const n = await page.locator('.stt-today').count()
    const chips = await page.locator('.stt-chip').count()
    record('S5-3 今日速览条存在', n > 0 && chips >= 1, { today: n, chips })
  }, { page })

  await guard('S5-4 无排课时显示空态提示', async () => {
    const hasCell = await storeEval(page, 'studentTimetable', 'return { ok: true, n: (store.data && store.data.cells ? Object.keys(store.data.cells).length : 0) }')
    const banner = await page.locator('.stt-empty-banner').count()
    const ok = hasCell.n > 0 ? true : banner > 0
    record('S5-4 无排课显示空态（有排课则跳过）', ok, { cells: hasCell.n, banner })
  }, { page })
}

// ============ S6 复习（4 条） ============
async function runS6(page) {
  await navTo(page, '复习计划')
  await page.waitForTimeout(400)

  await guard('S6-1 复习列表 = 种子 2 条', async () => {
    const n = await rowCount(page, '[data-testid^="sr-card-"]')
    const store = await storeEval(page, 'studentReview', 'return { ok: true, n: store.entries.length }')
    record('S6-1 复习列表 = 2', store.ok && store.n === 2 && n === 2, { rows: n, storeN: store.n })
  }, { page })

  await guard('S6-2 分类 tab 切换不报错且内容仍在', async () => {
    const tabs = await page.locator('[data-testid^="sr-tab-"]').count()
    let ok = tabs > 0
    if (tabs > 0) {
      await page.locator('[data-testid^="sr-tab-"]').last().click()
      await page.waitForTimeout(300)
      const txt = (await page.locator('.st-content').innerText().catch(() => '') || '').trim()
      ok = ok && txt.length > 0
      await page.locator('[data-testid^="sr-tab-"]').first().click()
      await page.waitForTimeout(250)
    }
    record('S6-2 分类 tab 切换可用', ok, { tabs })
  }, { page })

  await guard('S6-3 新增复习 → store +1', async () => {
    const before = await storeEval(page, 'studentReview', 'return { ok: true, n: store.entries.length }')
    const added = await storeEval(page, 'studentReview', `
      const r = await store.addReview({ subject: '英语', knowledge: 'QA 复习知识点', source: '教材 P1', learnDate: '${dateOffsetKey(0)}' })
      return { ok: !!(r && r.ok), n: store.entries.length, reason: r && r.reason }
    `)
    await page.waitForTimeout(350)
    record('S6-3 新增复习 → store +1', before.ok && added.ok && added.n === before.n + 1, { before: before.n, after: added.n, res: added })
  }, { page })

  await guard('S6-4 掌握推进 → stage 上升', async () => {
    const r = await storeEval(page, 'studentReview', `
      const t = store.entries.find(e => !e.mastered)
      if (!t) return { ok: false, reason: 'not-found' }
      const s0 = t.stage
      const res = await store.advance(t.id)
      const s1 = store.entries.find(e => e.id === t.id).stage
      return { ok: s1 !== s0, s0, s1, res }
    `)
    await page.waitForTimeout(300)
    record('S6-4 掌握推进生效', r.ok, r)
  }, { page })
}

// ============ S7 错题（4 条） ============
async function runS7(page) {
  await navTo(page, '错题本')
  await page.waitForTimeout(400)

  await guard('S7-1 错题列表 = 种子 2 条', async () => {
    const n = await rowCount(page, '[data-testid^="sm-card-"]')
    record('S7-1 错题列表 = 2', n === 2, { rows: n })
  }, { page })

  await guard('S7-2 搜索「进位」→ 行数减少', async () => {
    const before = await rowCount(page, '[data-testid^="sm-card-"]')
    const filled = await fillInput(page, 'sm-search', '进位')
    await page.waitForTimeout(500)
    const after = await rowCount(page, '[data-testid^="sm-card-"]')
    record('S7-2 搜索过滤生效', filled && after >= 1 && after < before, { filled, before, after })
  }, { page })

  await guard('S7-3 清空搜索 → 恢复全部', async () => {
    await fillInput(page, 'sm-search', '')
    await page.waitForTimeout(500)
    const after = await rowCount(page, '[data-testid^="sm-card-"]')
    record('S7-3 清空搜索恢复', after === 2, { after })
  }, { page })

  await guard('S7-4 状态推进（new → 后续状态）', async () => {
    const r = await storeEval(page, 'studentMistakes', `
      const t = store.entries.find(e => e.status === 'new') || store.entries[0]
      if (!t) return { ok: false, reason: 'not-found' }
      const s0 = t.status
      const res = await store.advance(t.id)
      const s1 = (store.entries.find(e => e.id === t.id) || {}).status
      return { ok: s1 !== s0, s0, s1, res }
    `)
    record('S7-4 错题状态推进生效', r.ok, r)
  }, { page })
}

// ============ S8 阅读（3 条） ============
async function runS8(page) {
  await navTo(page, '阅读记录')
  await page.waitForTimeout(400)

  await guard('S8-1 统计卡 ≥4 且总数 = 种子 2 条', async () => {
    const cards = await page.locator('.sr-stat-card').count()
    const store = await storeEval(page, 'studentReading', 'return { ok: true, n: store.entries.length }')
    const txt = (await page.locator('.st-content').innerText().catch(() => '') || '')
    record('S8-1 统计卡齐备且总记录 = 2', cards >= 4 && store.n === 2 && txt.includes('2'), { cards, storeN: store.n })
  }, { page })

  await guard('S8-2 种子书名渲染出来', async () => {
    const txt = (await page.locator('.st-content').innerText().catch(() => '') || '')
    record('S8-2 种子书名渲染', txt.includes('格林童话'), { hasBook: txt.includes('格林童话') })
  }, { page })

  await guard('S8-3 新增阅读 → store +1', async () => {
    const before = await storeEval(page, 'studentReading', 'return { ok: true, n: store.entries.length }')
    const added = await storeEval(page, 'studentReading', `
      const r = await store.addReading({ bookTitle: 'QA 测试绘本', pages: 10, durationMin: 12, date: '${dateOffsetKey(0)}' })
      return { ok: !!(r && r.ok), n: store.entries.length, reason: r && r.reason }
    `)
    await page.waitForTimeout(350)
    record('S8-3 新增阅读 → store +1', before.ok && added.ok && added.n === before.n + 1, { before: before.n, after: added.n, res: added })
  }, { page })
}

// ============ S9 成就 / 奖励（4 条） ============
async function runS9(page) {
  await navTo(page, '成就勋章')
  await page.waitForTimeout(400)

  await guard('S9-1 勋章墙数量与 store 定义数一致（且 ≥12）', async () => {
    const n = await countFirst(page, ['[data-testid^="sa-badge-"]'])
    const store = await storeEval(page, 'studentAchievements', 'return { ok: true, defs: (store.definitions || []).length }')
    record('S9-1 勋章墙数量 = store 定义数', store.ok && store.defs > 0 && n === store.defs && n >= 12, { badges: n, defs: store.defs })
  }, { page })

  await guard('S9-2 分类 tab 可切换', async () => {
    const tabs = await page.locator('[data-testid^="sa-cat-"]').count()
    let ok = tabs >= 2
    if (ok) {
      await page.locator('[data-testid^="sa-cat-"]').last().click()
      await page.waitForTimeout(300)
      ok = await page.locator('[data-testid^="sa-badge-"]').count() >= 0
      await page.locator('[data-testid^="sa-cat-"]').first().click()
      await page.waitForTimeout(250)
    }
    record('S9-2 勋章分类 tab 可切换', ok, { tabs })
  }, { page })

  await navTo(page, '奖励积分')

  await guard('S9-3 奖励项 2 个、积分与 store 一致', async () => {
    const n = await countFirst(page, ['[data-testid^="sr-reward-"]'])
    // allRewards / totalPoints 都是**函数**（不是 computed），漏括号会拿到函数自身的 .length=0
    // 积分不写死 1580：前面的打卡/完成作业会照常加分，与 store 一致即可
    const store = await storeEval(page, 'studentRewards', 'return { ok: true, pts: store.totalPoints(), rewards: store.allRewards().length }')
    const txt = (await page.locator('.st-content').innerText().catch(() => '') || '')
    record('S9-3 奖励项 2 个、积分与 store 一致', store.ok && store.rewards === 2 && n === 2 && txt.includes(String(store.pts)), { rewards: n, store })
  }, { page })

  await guard('S9-4 规则弹框能打开', async () => {
    await page.locator('[data-testid="sr-rules-btn"]').first().click()
    await page.waitForTimeout(400)
    const open = await page.locator('[data-testid="sr-rules-dialog"]').count()
    record('S9-4 规则弹框能打开', open > 0, { open })
    await closeDialogs(page)
  }, { page })
}

// ============ S10 家长协同（3 条） ============
async function runS10(page) {
  await navTo(page, '家长协同')
  await page.waitForTimeout(400)

  // 未解锁时整页是锁态守卫（家长 tabs 不渲染）—— 这是当前设计：
  // 家长控制台含加分 / 发勋章 / 删记录等敏感操作，必须先过 PIN。
  const locked = await page.locator('.stp-locked-card').count()
  if (locked > 0) {
    record('S10-1 未解锁时显示锁态守卫', true, { locked })
    await guard('S10-2 点「输入家长 PIN 解锁」能拉起 PIN 弹框', async () => {
      await page.locator('.stp-locked-card button').first().click()
      await page.waitForTimeout(550)
      const mask = await page.locator('.st-pin-mask').count()
      const keypad = await page.locator('.st-pin-keypad').count()
      record('S10-2 PIN 弹框能拉起（含数字键盘）', mask > 0 && keypad > 0, { mask, keypad })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      await closeDialogs(page)
    }, { page })
    const tabsWhenLocked = await page.locator('[data-testid^="stp-tab-"]').count()
    record('S10-3 锁态下不渲染家长 tabs（符合设计）', tabsWhenLocked === 0, { tabs: tabsWhenLocked })
    return
  }

  await guard('S10-1 家长面板 tab ≥3', async () => {
    const tabs = await page.locator('[data-testid^="stp-tab-"]').count()
    record('S10-1 家长面板 tab ≥3', tabs >= 3, { tabs })
  }, { page })

  await guard('S10-2 任务分页器存在', async () => {
    const pager = await page.locator('[data-testid="stp-pager-tasks"]').count()
    record('S10-2 任务分页器存在', pager > 0, { pager })
  }, { page })

  await guard('S10-3 逐个切 tab 内容非空', async () => {
    const tabs = page.locator('[data-testid^="stp-tab-"]')
    const n = await tabs.count()
    const empty = []
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click()
      await page.waitForTimeout(260)
      const t = (await page.locator('.st-content').innerText().catch(() => '') || '').trim()
      if (t.length === 0) empty.push(i)
    }
    record('S10-3 家长各 tab 内容非空', n > 0 && empty.length === 0, { tabs: n, empty })
  }, { page })
}

// ============ S11 全 16 面板可渲染（2 条） ============
async function runS11(page) {
  const bad = []
  const noContent = []
  for (const [, label] of MENU) {
    try {
      await navTo(page, label)
      const wrap = await page.locator('.st-content > *').count()
      const txt = (await page.locator('.st-content').innerText().catch(() => '') || '').trim()
      if (wrap === 0) noContent.push(label)
      if (txt.length === 0) noContent.push(label + '(空文本)')
    } catch (e) {
      bad.push(label + ':' + String(e && e.message || e).slice(0, 60))
    }
  }
  record('S11-1 16 个面板逐个切换无异常', bad.length === 0, { bad })
  record('S11-2 16 个面板内容都非空', noContent.length === 0, { noContent })
}

// ============ S12 移动端 390px（4 条） ============
async function runS12(page) {
  const before = page.viewportSize()
  await page.setViewportSize({ width: 390, height: 844 })
  await navTo(page, '主页')
  await page.waitForTimeout(600)

  await guard('S12-1 菜单降级为底部固定 Tab Bar', async () => {
    const box = await page.locator('.st-menu').first().boundingBox()
    const pos = await page.locator('.st-menu').first().evaluate((el) => getComputedStyle(el).position)
    const atBottom = box ? Math.abs((box.y + box.height) - 844) <= 2 : false
    record('S12-1 菜单贴底 Fixed', pos === 'fixed' && atBottom, { pos, box })
  }, { page })

  await guard('S12-2 移动端隐藏收起按钮', async () => {
    const vis = await page.locator('.st-sidebar-toggle').first().isVisible().catch(() => false)
    record('S12-2 移动端隐藏收起按钮', !vis, { visible: vis })
  }, { page })

  await guard('S12-3 无横向溢出', async () => {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    record('S12-3 无横向溢出', over <= 1, { overflowPx: over })
  }, { page })

  await guard('S12-4 底栏菜单项仍为 16 个（可横滚）', async () => {
    const n = await page.locator('.st-menu-item').count()
    record('S12-4 底栏菜单项 16 个', n === 16, { items: n })
  }, { page })

  if (before) await page.setViewportSize(before)
  await page.waitForTimeout(300)
}

// ============ main ============
async function main() {
  writeFileSync(EVIDENCE_LOG, '')
  appendFileSync(EVIDENCE_LOG, '===== student-ui QA start ' + new Date().toISOString() + ' =====\n')
  await ensureDevServer()
  console.log('[dev] ready at ' + devBase)

  const browser = await chromium.launch({ headless: true, executablePath: findChromium() })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (err) => { pageErrors.push(err.message); appendFileSync(EVIDENCE_LOG, '[pageerror] ' + err.message + '\n') })
  page.on('console', (msg) => { if (msg.type() === 'error') appendFileSync(EVIDENCE_LOG, '[console:error] ' + msg.text() + '\n') })

  await page.goto(devBase + '/student', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1800)

  // 引导弹窗（首次进入）先关掉，再注入种子，避免被遮罩挡住点击
  if (await page.locator('.onboarding-mask').count()) {
    await page.click('.onboarding-mask .ob-btn-secondary').catch(() => { })
    await page.waitForTimeout(400)
  }

  console.log('[inject] 学生 IDB 种子…')
  await injectIdbStore(page, 'student_settings', buildSettings())
  await injectIdbStore(page, 'student_habits', buildHabits())
  await injectIdbStore(page, 'student_homework', buildHomework())
  await injectIdbStore(page, 'student_plans', buildPlans())
  await injectIdbStore(page, 'student_review', buildReview())
  await injectIdbStore(page, 'student_mistakes', buildMistakes())
  await injectIdbStore(page, 'student_reading', buildReading())
  await injectIdbStore(page, 'student_achievements', buildAchievements())
  await injectIdbStore(page, 'student_rewards', buildRewards())
  await injectIdbStore(page, 'student_countdowns', buildCountdowns())
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2600)
  if (await page.locator('.onboarding-mask').count()) {
    await page.click('.onboarding-mask .ob-btn-secondary').catch(() => { })
    await page.waitForTimeout(400)
  }

  await page.waitForSelector('.st-shell', { timeout: 30000 })

  console.log('[S1] 骨架与菜单')
  await runS1(page)
  console.log('[S2] 主页')
  await runS2(page)
  console.log('[S3] 习惯打卡')
  await runS3(page)
  console.log('[S4] 作业管理')
  await runS4(page)
  console.log('[S5] 课程表')
  await runS5(page)
  console.log('[S6] 复习计划')
  await runS6(page)
  console.log('[S7] 错题本')
  await runS7(page)
  console.log('[S8] 阅读记录')
  await runS8(page)
  console.log('[S9] 成就 / 奖励')
  await runS9(page)
  console.log('[S10] 家长协同')
  await runS10(page)
  console.log('[S11] 全面板渲染')
  await runS11(page)
  console.log('[S12] 移动端 390px')
  await runS12(page)
  console.log('[S13] 页面级异常')
  record('S13 全程无页面级 JS 异常', pageErrors.length === 0, { errors: pageErrors.slice(0, 3) })

  await browser.close()
  if (devProc) devProc.kill()

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  if (failed.length) {
    console.log('失败项：')
    failed.forEach((f) => console.log('  - ' + f.name))
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error('[fatal]', e)
  if (devProc) devProc.kill()
  process.exitCode = 1
})
