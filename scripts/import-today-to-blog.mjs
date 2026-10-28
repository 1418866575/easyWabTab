/**
 * 把「信贷晨读」当天文章导入博客后台，并同步到云端
 *
 * 固定三段式（与人工操作完全一致）：
 *   1) 先云同步：拉取远端 blog.json，保证本地是全量（否则只推本地会覆盖别人/其它设备的数据）
 *   2) 只导入「当天」的 .md + 封面 png（不做目录导入，避免把历史文章重复搬运）
 *   3) 再云同步：把新导入的文章推上云端 → 用户自己浏览器拉一次就能看见
 *
 * 为什么用持久化 profile：
 *   云同步的 URL / 账号 / 应用密码存在浏览器本地（IndexedDB + localStorage 兜底），
 *   每次全新 profile 都要重配一遍。持久化后配一次即长期有效。
 *
 * 用法：
 *   node scripts/import-today-to-blog.mjs                 # 用今天日期
 *   node scripts/import-today-to-blog.mjs --date 2026-11-06
 *   node scripts/import-today-to-blog.mjs --dir "D:\\信贷晨读"
 *   node scripts/import-today-to-blog.mjs --setup-only    # 只配置云同步并试连
 *   node scripts/import-today-to-blog.mjs --head          # 显示浏览器窗口
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const argv = process.argv.slice(2)
const getArg = (k, d) => {
  const i = argv.indexOf(k)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const DIR = getArg('--dir', 'D:\\信贷晨读')
const SETUP_ONLY = argv.includes('--setup-only')
const HEADLESS = !argv.includes('--head')
const SITE = 'https://www.codehelp.com.cn/blog/admin'
const SITE_ORIGIN = 'https://www.codehelp.com.cn'

const DAV_URL = 'https://www.codehelp.com.cn/dav/'
const DAV_USER = 'sifujiang'
const DAV_PASS = 'sifujiang'

// 持久化配置目录：装的是「有云同步配置的浏览器」，不是设计成果，放 LocalAppData
const PROFILE = path.join(os.homedir(), 'AppData', 'Local', 'ewt-blog-agent-profile')

function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!fs.existsSync(root)) return undefined
  for (const d of fs.readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(p)) return p
  }
  return undefined
}

const pad = (n) => (n < 10 ? '0' + n : String(n))
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const DATE = getArg('--date', todayStr())

/** 定位当天要导入的两个文件：<date>-*.md 与 images/<date>-cover.png */
function pickTodayFiles() {
  if (!fs.existsSync(DIR)) throw new Error(`目录不存在：${DIR}`)
  const mds = fs.readdirSync(DIR).filter((f) => f.startsWith(DATE) && f.toLowerCase().endsWith('.md'))
  if (mds.length === 0) throw new Error(`${DIR} 下没有 ${DATE} 开头的 .md`)
  if (mds.length > 1) throw new Error(`${DATE} 匹配到多篇：${mds.join(', ')}`)
  const mdPath = path.join(DIR, mds[0])

  const imgDir = path.join(DIR, 'images')
  const coverName = `${DATE}-cover.png`
  const coverPath = path.join(imgDir, coverName)
  if (!fs.existsSync(coverPath)) {
    throw new Error(`缺少封面：${coverPath}（封面必须与 md 一起导入，否则文章无封面）`)
  }
  return { mdPath, coverPath, title: mds[0] }
}

const log = (...a) => console.log('[import]', ...a)

async function readBlogSettings(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const rq = indexedDB.open('easy-web-tab')
        rq.onerror = () => resolve(null)
        rq.onsuccess = () => {
          const db = rq.result
          if (!db.objectStoreNames.contains('settings')) {
            db.close()
            resolve(null)
            return
          }
          const g = db.transaction('settings', 'readonly').objectStore('settings').getAll()
          g.onsuccess = () => {
            db.close()
            resolve(g.result && g.result[0] ? g.result[0] : null)
          }
          g.onerror = () => {
            db.close()
            resolve(null)
          }
        }
      })
  )
}

async function readBlog(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const rq = indexedDB.open('easy-web-tab')
        rq.onerror = () => resolve(null)
        rq.onsuccess = () => {
          const db = rq.result
          if (!db.objectStoreNames.contains('blog')) {
            db.close()
            resolve(null)
            return
          }
          const g = db.transaction('blog', 'readonly').objectStore('blog').getAll()
          g.onsuccess = () => {
            db.close()
            resolve(g.result && g.result[0] ? g.result[0] : null)
          }
          g.onerror = () => {
            db.close()
            resolve(null)
          }
        }
      })
  )
}

/** 等 toast（自研 toast 组件，不是 Element 的 .el-message），返回文本 */
async function readToast(page, timeout = 45000) {
  try {
    const t = page.locator('.toast-container .toast-message').first()
    await t.waitFor({ state: 'visible', timeout })
    const txt = ((await t.textContent()) || '').trim()
    return txt
  } catch {
    return ''
  }
}

async function clearToasts(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.toast-container .toast').forEach((n) => n.remove())
  })
}

/**
 * 点一次云同步并等它结束。
 * onConflict：
 *   'pull'  → 出现冲突弹窗时点「全部拉取」（以云端为准）。首次同步必用：
 *             全新 profile 会生成一份 495 字节的默认 nav.json，与云端真实的 1MB 导航偏好冲突。
 *   'abort' → 出现冲突直接抛错，由人判断，避免"全部推送"把云端真实数据覆盖掉。
 */
async function syncOnce(page, label, onConflict = 'abort') {
  const btn = page.locator('[data-testid="blog-sync-now"], .ba-sync-btn').first()
  await btn.waitFor({ state: 'visible', timeout: 20000 })
  const before = ((await btn.textContent()) || '').trim()
  log(`${label}：点击前按钮文案 = ${before}`)
  await clearToasts(page)
  await btn.click()

  const deadline = Date.now() + 180000
  let sawBusy = false
  let resolved = 0
  while (Date.now() < deadline) {
    // 冲突弹窗：可多次出现（不同文件分批报），最多处理 3 轮
    if (resolved < 3) {
      const modal = page.locator('text=云同步冲突').first()
      if (await modal.isVisible().catch(() => false)) {
        resolved++
        const text = ((await page.locator('.el-dialog, .bd-dialog, body').last().textContent()) || '').slice(0, 2000)
        const names = [...text.matchAll(/([a-z-]+\.json)/g)].map((m) => m[1])
        const uniq = [...new Set(names)]
        log(`  检测到冲突（第 ${resolved} 轮），涉及：${uniq.join(', ') || '(未能解析)'}`)
        if (onConflict === 'pull' || onConflict === 'pullUnlessBlog') {
          if (onConflict === 'pullUnlessBlog' && uniq.includes('blog.json')) {
            const shot = path.join(os.tmpdir(), 'sync-conflict.png')
            await page.screenshot({ path: shot })
            throw new Error(
              `冲突包含 blog.json —— 选「全部拉取」会丢掉刚导入的文章，已中止（截图 ${shot}）。请人工处理。`
            )
          }
          log('  按「全部拉取」以云端为准…')
          await page.locator('button:has-text("全部拉取")').first().click()
          await page.waitForTimeout(1800)
          continue
        }
        const shot = path.join(os.tmpdir(), 'sync-conflict.png')
        await page.screenshot({ path: shot })
        throw new Error(`云同步出现冲突（${uniq.join(', ')}），已中止（截图 ${shot}）。请人工确认后重试`)
      }
    }
    const txt = ((await btn.textContent()) || '').trim()
    if (/拉取中|推送中|处理冲突/.test(txt)) sawBusy = true
    if (sawBusy && !/拉取中|推送中|处理冲突/.test(txt)) break
    if (!sawBusy && /同步失败/.test(txt)) break
    await page.waitForTimeout(300)
  }
  await page.waitForTimeout(1000)
  const after = ((await btn.textContent()) || '').trim()
  const toastTxt = await readToast(page, 8000)
  log(`${label}：结束，按钮文案 = ${after}${toastTxt ? `，提示 = ${toastTxt}` : ''}`)
  if (/同步失败|处理冲突/.test(after)) {
    throw new Error(`${label} 失败：按钮显示「${after}」${toastTxt ? `，提示「${toastTxt}」` : ''}`)
  }
  return { after, toastTxt }
}

/**
 * 配置云同步（走真实 UI，等价于人工在「设置 → 通知与同步 → 云同步」里填一遍）
 *
 * 入口说明：云同步在**全局设置**里，首页右上角 `button.btn-help`（文案「设置」）打开；
 * 博客后台右上角那个「设置」打开的是**博客设置**（分类/标签/图库/公众号），不是它。
 *
 * 为什么不用 localStorage/IDB 直接写：
 *   - 写 IDB settings 半截对象会缺字段 → 白屏（实测 `Cannot read properties of undefined (reading 'site')`）；
 *   - 只写 localStorage `ewt-cloud-sync` 走空 IDB 兜底，同样因半截对象触发上面那个空指针。
 *   结论：这条数据只能由应用自己整份持久化。
 */
async function ensureCloudConfigured(page) {
  /** 首页首次访问会自动弹出「使用帮助」引导层（.help-dialog.bd-overlay），
   *  它会拦截所有点击，必须先关掉再操作。 */
  const dismissOverlays = async () => {
    for (const sel of ['button:has-text("知道了")', '.help-dialog .close-btn']) {
      const el = page.locator(sel).first()
      if (await el.isVisible().catch(() => false)) {
        await el.click().catch(() => {})
        await page.waitForTimeout(400)
      }
    }
    await page.waitForTimeout(300)
  }

  const openSettings = async () => {
    await page.goto(SITE_ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('button.btn-help', { timeout: 30000 })
    await page.waitForTimeout(1200)
    await dismissOverlays()
    // 顶栏三个按钮共用 class btn-help：设置 / 帮助 / 倒计时，只能靠 title 区分
    const btn = page.locator('button.btn-help[title="设置"]').first()
    await btn.waitFor({ state: 'visible', timeout: 20000 })
    await btn.click()
    await page.locator('.settings-rail').first().waitFor({ state: 'visible', timeout: 20000 })
  }

  // 已配置就跳过（避免每次都点一遍）
  await openSettings()
  await page.locator('.settings-rail .rail-item', { hasText: '云同步' }).first().click()
  await page.waitForTimeout(700)
  const urlVal = await page
    .locator('[data-testid="sync-url"] input, [data-testid="sync-url"]')
    .first()
    .inputValue()
    .catch(() => '')
  if (String(urlVal || '').includes('/dav')) {
    log('云同步已配置：', urlVal)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    return
  }

  log('云同步未配置，开始填写…')
  // 1) 总开关
  const sw = page.locator('[data-testid="sync-switch"]').first()
  await sw.waitFor({ state: 'visible', timeout: 20000 })
  const swOn = await page
    .locator('[data-testid="sync-switch"].is-checked, [data-testid="sync-switch"][aria-checked="true"]')
    .count()
  if (!swOn) {
    await sw.click()
    await page.waitForTimeout(800)
  }

  // 2) 渠道：自建服务（WebDAV）
  const ch = page.locator('[data-testid="sync-channel"]').first()
  if (await ch.count()) {
    const chText = ((await ch.textContent()) || '').trim()
    log('  当前渠道 =', chText || '(空)')
    if (!chText.includes('自建服务')) {
      await ch.click()
      await page.waitForTimeout(400)
      await page.locator('.el-select-dropdown__item', { hasText: '自建服务' }).first().click()
      await page.waitForTimeout(500)
    }
  }

  // 3) 三个字段
  const fillByTestid = async (testid, value) => {
    const box = page.locator(`[data-testid="${testid}"]`).first()
    await box.waitFor({ state: 'visible', timeout: 20000 })
    const inner = box.locator('input, textarea').first()
    if (await inner.count()) {
      await inner.fill('')
      await inner.fill(value)
    } else {
      await box.fill(value)
    }
  }
  await fillByTestid('sync-url', DAV_URL)
  await fillByTestid('sync-username', DAV_USER)
  await fillByTestid('sync-password', DAV_PASS)
  await page.waitForTimeout(1200)

  // 4) 测试连接
  const testBtn = page.locator('[data-testid="sync-test"]').first()
  if (await testBtn.count()) {
    await clearToasts(page)
    await testBtn.click()
    const t = await readToast(page, 60000)
    log('  测试连接：', t || '(无提示)')
    if (/失败|错误|401|403|无效/i.test(t)) throw new Error(`WebDAV 测试连接失败：${t}`)
  }

  // 5) 关闭弹框，让 persist 落库
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1200)

  // 6) 复核：重新打开看 URL 是否还在
  await openSettings()
  await page.locator('.settings-rail .rail-item', { hasText: '云同步' }).first().click()
  await page.waitForTimeout(600)
  const urlVal2 = await page
    .locator('[data-testid="sync-url"] input, [data-testid="sync-url"]')
    .first()
    .inputValue()
    .catch(() => '')
  log('  复核 URL =', urlVal2)
  if (!String(urlVal2 || '').includes('/dav')) throw new Error('云同步配置未持久化')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}

/** 直接读云端 blog.json（HTTP Basic，走 DAV 的用户名子目录：<base>/<user>/easy-web-tab/blog.json） */
async function readRemoteBlog() {
  try {
    const u = new URL(DAV_URL)
    const target = `${u.origin}${u.pathname.replace(/\/+$/, '')}/${DAV_USER}/easy-web-tab/blog.json`
    const res = await fetch(target, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${DAV_USER}:${DAV_PASS}`).toString('base64') }
    })
    if (!res.ok) return { ok: false, err: `${res.status} ${target}` }
    const env = await res.json()
    const blog = env.blog || env.data || {}
    const articles = blog.articles || []
    return {
      ok: true,
      url: target,
      total: articles.length,
      active: articles.filter((a) => !a.deletedAt && !a.purgedAt).length,
      images: (blog.images || []).length,
      pushedAt: env.pushedAt || 0,
      articles
    }
  } catch (e) {
    return { ok: false, err: String(e?.message || e) }
  }
}

/**
 * 第三步：以本地为准推送（对应设置里的「推送本地」按钮）
 *
 * 为什么不用博客后台那个「云同步」按钮：
 *   它走 syncNow（双向合并）。实测导入后点它，合并逻辑判定为"云端更新"，
 *   结果 pushedAt 更新了、但正文仍是被云端覆盖的旧内容 —— 新导入的文章没上去。
 *   「推送本地」= forcePushLocal：skipRemoteGuard（不探测云端是否被外部改过）+ onlyChanged
 *   （只 PUT 内容有变化的信封），正是"我刚导入，请把本地这份推上去"该用的语义。
 */
async function pushLocalViaSettings(page) {
  const dismissOverlays = async () => {
    for (const sel of ['button:has-text("知道了")', '.help-dialog .close-btn']) {
      const el = page.locator(sel).first()
      if (await el.isVisible().catch(() => false)) {
        await el.click().catch(() => {})
        await page.waitForTimeout(400)
      }
    }
  }
  await page.goto(SITE_ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('button.btn-help', { timeout: 30000 })
  await page.waitForTimeout(1000)
  await dismissOverlays()
  await page.locator('button.btn-help[title="设置"]').first().click()
  await page.locator('.settings-rail').first().waitFor({ state: 'visible', timeout: 20000 })
  await page.locator('.settings-rail .rail-item', { hasText: '云同步' }).first().click()
  await page.waitForTimeout(700)

  await clearToasts(page)
  const pushBtn = page.locator('[data-testid="sync-push-local"]').first()
  await pushBtn.waitFor({ state: 'visible', timeout: 20000 })
  await pushBtn.click()
  await page.waitForTimeout(900)
  for (const sel of ['button:has-text("确定")', 'button:has-text("确认")', 'button:has-text("继续")']) {
    const el = page.locator(sel).first()
    if (await el.isVisible().catch(() => false)) {
      log('  遇到确认框，点确认')
      await el.click().catch(() => {})
      await page.waitForTimeout(700)
      break
    }
  }
  const t = await readToast(page, 120000)
  log('  推送本地：', t || '(无提示)')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  if (/失败|错误/i.test(t)) throw new Error(`推送本地失败：${t}`)
}

// ---------------------------------------------------------------------------
const files = pickTodayFiles()
log(`目标日期 = ${DATE}`)
log(`正文 = ${files.mdPath}`)
log(`封面 = ${files.coverPath}`)
log(`profile = ${PROFILE}`)

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: findChromium(),
  headless: HEADLESS,
  viewport: { width: 1440, height: 950 }
})
const page = browser.pages()[0] || (await browser.newPage())
const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))

let exitCode = 0
try {
  // ① 先确保云同步可用（会切到首页打开全局设置）
  await ensureCloudConfigured(page)
  if (SETUP_ONLY) {
    log('--setup-only：配置完成，退出')
  } else {
    log('回到博客后台', SITE)
    await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('text=选文件导入', { timeout: 40000 })
    await page.waitForTimeout(1500) // 等 store.loadBlog 完成

    // ---- 步骤 1：先拉远端 ----
    const before = await readBlog(page)
    log(`同步前本地：文章 ${before?.articles?.length ?? 0}，图 ${before?.images?.length ?? 0}`)
    await syncOnce(page, '① 先云同步（拉远端）', 'pullUnlessBlog')
    const afterPull = await readBlog(page)
    log(`拉取后本地：文章 ${afterPull?.articles?.length ?? 0}，图 ${afterPull?.images?.length ?? 0}`)

    // ---- 步骤 2：只导入当天文件 ----
    const beforeImport = new Set((afterPull?.articles ?? []).map((a) => a.id))
    await clearToasts(page)
    log('导入当天文件（.md + 封面 png）…')
    const t0 = Date.now()
    await page.locator('input[type=file][accept*=".md"]').first().setInputFiles([files.mdPath, files.coverPath])
    const importToast = await readToast(page, 90000)
    log(`导入提示：${importToast}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

    const afterImport = await readBlog(page)
    const added = (afterImport?.articles ?? []).filter((a) => !beforeImport.has(a.id))
    log(`导入后本地：文章 ${afterImport?.articles?.length ?? 0}，图 ${afterImport?.images?.length ?? 0}，新增 ${added.length}`)
    for (const a of added) {
      log(`  + ${a.title}  封面=${a.coverImageId ? 'Y' : 'N'}  状态=${a.status}`)
    }
    if (added.length === 0) {
      log('没有新增（可能该篇已在库中，按标题去重跳过）')
    }

    // ---- 步骤 3：以本地为准推云端 ----
    await pushLocalViaSettings(page)

    // ---- 复核：直接读云端 blog.json，确认文章真的上去了 ----
    const verifyTitle = added[0]?.title || ''
    if (verifyTitle) {
      const remote = await readRemoteBlog()
      if (!remote.ok) {
        log(`云端复核：读取失败（${remote.err}）`)
      } else {
        const hit = remote.articles.find((a) => String(a.title) === verifyTitle)
        log(
          `云端复核：未删除 ${remote.active} 篇 / 共 ${remote.total} 篇，推送时间 ${new Date(remote.pushedAt).toLocaleString('zh-CN')}`
        )
        log(`  云端包含「${verifyTitle}」：${hit ? 'YES ✔' : 'NO ✗'}`)
        if (!hit) throw new Error('推送后云端仍没有这篇文章（合并逻辑可能又覆盖了），请人工检查')
      }
    }


    const shot = path.join(os.tmpdir(), 'import-today-result.png')
    await page.screenshot({ path: shot })
    log('结果截图：', shot)
  }
} catch (e) {
  exitCode = 1
  log('失败：', e?.message || e)
  try {
    const shot = path.join(os.tmpdir(), 'import-today-error.png')
    await page.screenshot({ path: shot })
    log('失败截图：', shot)
  } catch { /* noop */ }
} finally {
  if (consoleErrors.length) log('控制台报错：', consoleErrors.slice(0, 3).join(' | '))
  await browser.close()
}
process.exit(exitCode)
