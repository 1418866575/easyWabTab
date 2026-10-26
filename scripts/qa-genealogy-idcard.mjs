/**
 * QA：族谱「新增成员」身份证号自动推算性别与出生日期
 *
 * 断言：
 *  S1 新增成员弹框里有身份证号输入框
 *  S2 输入合法 18 位号码 → 提示"已按身份证推算：男 · 1990-01-01"，出生日期输入框被填成 1990-01-01，性别显示「男」
 *  S3 换成女号 → 性别改「女」
 *  S4 输入非法号码 → 提示格式不正确（且不覆盖已推导的值）
 *  S5 保存后落库：成员 gender= male、birthDate=1990-01-01、idCard 为录入号码
 *
 * 用法：node scripts/qa-genealogy-idcard.mjs
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
    try { const r = await fetch(url); if (r.ok) return true } catch { }
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
    server = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
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

const MALE_ID = '110101199001011237'   // 17 位基数 + 校验位 7 → 男
const FEMALE_ID = '110101199001011245' // 校验位 5 → 女

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-genealogy"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }

  await page.click('[data-testid="wb-menu-genealogy"]')
  await page.waitForSelector('[data-testid="fg-add-button"]', { timeout: 60000 })
  await page.click('[data-testid="fg-add-button"]')
  await page.waitForSelector('[data-testid="fg-idcard"]', { timeout: 30000 })
  // Element Plus 的 el-input 会把非 prop 属性透传到内部 <input>，而 el-date-picker / el-select
  // 不会透传到 DOM —— 所以输入框用 testid（自适应 input/包裹层），日期与性别按 label 定位。
  async function inputOf(sel) {
    const el = page.locator(sel).first()
    const tag = await el.evaluate((n) => n.tagName.toLowerCase())
    return tag === 'input' ? el : page.locator(sel + ' input').first()
  }
  const groupByLabel = (label) =>
    page.locator('.form-group').filter({ has: page.locator(`label:text-is("${label}")`) })
  const idInput = await inputOf('[data-testid="fg-idcard"]')
  const nameInput = await inputOf('[data-testid="fg-name-input"]')
  const birthGroup = groupByLabel('出生日期')
  const birthInput = birthGroup.locator('input').first()
  const genderGroup = groupByLabel('性别')
  const hint = page.locator('[data-testid="fg-idcard-hint"]')

  check('S1 身份证号输入框存在', (await idInput.count()) === 1)

  // ---- S2 男号 ----
  await idInput.fill(MALE_ID)
  await page.waitForTimeout(300)
  const hint1 = (await hint.innerText().catch(() => '')).trim()
  check('S2 提示已按身份证推算（男 · 1990-01-01）', hint1.includes('男') && hint1.includes('1990-01-01'), hint1)
  const birth1 = await birthInput.inputValue()
  check('S2 出生日期自动填 1990-01-01', birth1 === '1990-01-01', birth1)
  const genderText1 = (await genderGroup.innerText().catch(() => '')).replace(/\s+/g, '')
  check('S2 性别自动选为男', genderText1.includes('男'), genderText1)

  // ---- S3 女号 ----
  await idInput.fill(FEMALE_ID)
  await page.waitForTimeout(300)
  const genderText2 = (await genderGroup.innerText().catch(() => '')).replace(/\s+/g, '')
  check('S3 换成女号 → 性别变女', genderText2.includes('女'), genderText2)

  // ---- S4 非法号码 ----
  await idInput.fill('110101199002301234') // 2 月 30 日
  await page.waitForTimeout(300)
  const hintBad = (await hint.innerText().catch(() => '')).trim()
  check('S4 非法号码提示格式不正确', hintBad.includes('格式不正确'), hintBad)
  const genderText3 = (await genderGroup.innerText().catch(() => '')).replace(/\s+/g, '')
  check('S4 非法号码不覆盖已推导的性别', genderText3.includes('女'), genderText3)

  // ---- S5 用男号保存并落库 ----
  await idInput.fill(MALE_ID)
  await nameInput.fill('测试成员-身份证')
  await page.waitForTimeout(200)
  await page.click('[data-testid="fg-save-button"]')
  await page.waitForTimeout(800)

  const saved = await page.evaluate(async () => {
    const m = await import('/src/stores/genealogy.ts')
    const s = m.useGenealogyStore()
    const hit = s.activeMembers.find((x) => x.name === '测试成员-身份证')
    return hit ? { gender: hit.gender, birthDate: hit.birthDate || '', idCard: hit.idCard || '' } : null
  })
  console.log('[qa] 落库结果:', JSON.stringify(saved))
  check('S5 成员已保存', !!saved)
  check('S5 落库性别=男', saved?.gender === 'male', String(saved?.gender))
  check('S5 落库出生日期=1990-01-01', saved?.birthDate === '1990-01-01', String(saved?.birthDate))
  check('S5 落库身份证号已保存', saved?.idCard === MALE_ID, String(saved?.idCard))

  check('无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
