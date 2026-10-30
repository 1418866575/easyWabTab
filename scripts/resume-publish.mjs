/**
 * 断点续跑：本地已是远端超集，直接「推送本地」→ 复核云端 → 发公众号草稿箱。
 * 等价于 import-today-to-blog.mjs 的第 ③④ 步（跳过有冲突保护的第 ① 步）。
 * 用法： node scripts/resume-publish.mjs "<标题>"
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { chromium } from 'playwright'

const TITLE = process.argv[2]
const DIR = 'D:\\信贷晨读'
const PROFILE = path.join(os.homedir(), 'AppData', 'Local', 'ewt-blog-agent-profile')
const SITE = 'https://www.codehelp.com.cn/blog/admin'
const SITE_ORIGIN = 'https://www.codehelp.com.cn'
const DAV_URL = 'https://www.codehelp.com.cn/dav/'
const DAV_USER = 'sifujiang'
const DAV_PASS = 'sifujiang'
const log = (...a) => console.log('[finish]', ...a)

function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!fs.existsSync(root)) return undefined
  for (const d of fs.readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(p)) return p
  }
  return undefined
}

async function clearToasts(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.toast-container .toast').forEach((n) => n.remove())
  })
}
async function readToast(page, timeout = 45000) {
  try {
    const t = page.locator('.toast-container .toast-message').first()
    await t.waitFor({ state: 'visible', timeout })
    return ((await t.textContent()) || '').trim()
  } catch {
    return ''
  }
}
async function dismissOverlays(page) {
  for (const sel of ['button:has-text("知道了")', '.help-dialog .close-btn']) {
    const el = page.locator(sel).first()
    if (await el.isVisible().catch(() => false)) {
      await el.click().catch(() => {})
      await page.waitForTimeout(400)
    }
  }
  await page.waitForTimeout(300)
}
async function readRemoteBlog() {
  const u = new URL(DAV_URL)
  const target = `${u.origin}${u.pathname.replace(/\/+$/, '')}/${DAV_USER}/easy-web-tab/blog.json`
  const res = await fetch(target, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${DAV_USER}:${DAV_PASS}`).toString('base64') }
  })
  if (!res.ok) return { ok: false, err: `${res.status}` }
  const env = await res.json()
  const blog = env.blog || env.data || {}
  return { ok: true, total: (blog.articles || []).length, articles: blog.articles || [], pushedAt: env.pushedAt }
}

/** 读本地 store 的文章 id 集合（推送前做「本地是否为远端超集」校验） */
async function readLocalArticles(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const rq = indexedDB.open('easy-web-tab')
        rq.onerror = () => resolve([])
        rq.onsuccess = () => {
          const db = rq.result
          const g = db.transaction('blog', 'readonly').objectStore('blog').getAll()
          g.onsuccess = () => {
            const cur = g.result[0]
            db.close()
            resolve(cur ? cur.articles.map((a) => ({ id: a.id, title: a.title })) : [])
          }
          g.onerror = () => resolve([])
        }
      })
  )
}

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: findChromium(),
  headless: true,
  viewport: { width: 1440, height: 950 }
})
const page = browser.pages()[0] || (await browser.newPage())
let exit = 0
try {
  // ---- 安全校验：本地必须是远端超集，否则整包推送会覆盖别人新增的内容 ----
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('text=选文件导入', { timeout: 40000 })
  await page.waitForTimeout(1800)
  const localArts = await readLocalArticles(page)
  const guard = await readRemoteBlog()
  if (!guard.ok) throw new Error(`云端读取失败 ${guard.err}`)
  const localIds = new Set(localArts.map((a) => a.id))
  const missing = guard.articles.filter((a) => !localIds.has(a.id))
  if (missing.length) {
    throw new Error(
      `本地缺 ${missing.length} 篇远端文章（${missing.map((a) => a.title).slice(0, 3).join(' / ')}），` +
        '整包推送会丢内容，已中止。请先人工「全部拉取」再重跑。'
    )
  }
  log(`超集校验通过：远端 ${guard.articles.length} 篇，本地 ${localArts.length} 篇`)

  // ---- 推送本地 ----
  await page.goto(SITE_ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('button.btn-help', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await dismissOverlays(page)
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
      log('遇到确认框，点确认')
      await el.click().catch(() => {})
      await page.waitForTimeout(700)
      break
    }
  }
  const t = await readToast(page, 120000)
  log('推送本地：', t || '(无提示)')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  if (/失败|错误/i.test(t)) throw new Error(`推送本地失败：${t}`)

  // ---- 复核云端 ----
  const remote = await readRemoteBlog()
  if (!remote.ok) throw new Error(`云端读取失败 ${remote.err}`)
  const hit = remote.articles.find((a) => String(a.title) === TITLE)
  const pushed = remote.pushedAt ? new Date(remote.pushedAt).toLocaleString('zh-CN') : '(未知)'
  log(`云端共 ${remote.total} 篇，推送时间 ${pushed}`)
  log(`云端包含「${TITLE}」：${hit ? 'YES ✔' : 'NO ✗'}`)
  if (!hit) throw new Error('推送后云端仍没有这篇文章')

  // ---- 发公众号草稿箱 ----
  const ledgerPath = path.join(DIR, '.wechat-sent.json')
  let ledger = {}
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
  } catch {}
  const DATE = (() => {
    const d = new Date()
    const p = (n) => (n < 10 ? '0' + n : String(n))
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  })()
  if (ledger[DATE]) {
    log(`公众号草稿：${DATE} 已发过，跳过`)
  } else {
    await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('text=选文件导入', { timeout: 40000 })
    await page.waitForTimeout(1500)
    const link = page.getByText(TITLE, { exact: true }).first()
    await link.waitFor({ state: 'visible', timeout: 20000 })
    await link.click()
    const pubBtn = page.locator('[data-testid="blog-editor-publish-wechat-top"]').first()
    await pubBtn.waitFor({ state: 'visible', timeout: 30000 })
    log('已进入编辑器，点击「发送公众号草稿箱」…')
    await clearToasts(page)
    await pubBtn.click()

    const deadline = Date.now() + 180000
    let outcome = ''
    while (Date.now() < deadline) {
      if (await page.locator('[data-testid="blog-editor-wechat-ok"]').first().isVisible().catch(() => false)) {
        outcome = 'ok'
        break
      }
      const errEl = page.locator('[data-testid="blog-editor-wechat-error"]').first()
      if (await errEl.isVisible().catch(() => false)) {
        outcome = 'error:' + ((await errEl.textContent()) || '').trim()
        break
      }
      const wxPanel = page.locator('text=微信公众号').first()
      if (await wxPanel.isVisible().catch(() => false)) {
        if (await page.locator('text=AppSecret').first().isVisible().catch(() => false)) {
          outcome = 'nocred'
          break
        }
      }
      await page.waitForTimeout(500)
    }
    const toastTxt = await readToast(page, 5000)
    if (outcome === 'ok') {
      log(`发送成功${toastTxt ? `：${toastTxt}` : ''}`)
      ledger[DATE] = { at: new Date().toISOString(), title: TITLE }
      fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), 'utf8')
    } else if (outcome === 'nocred') {
      log('发送中止：未配置公众号凭证')
      exit = 1
    } else if (outcome.startsWith('error:')) {
      log('发送失败：', outcome.slice(6))
      exit = 1
    } else {
      log('发送结果未知（超时）', toastTxt)
      exit = 1
    }
  }
} catch (e) {
  exit = 1
  log('失败：', e?.message || e)
  try {
    await page.screenshot({ path: path.join(os.tmpdir(), 'finish-publish-error.png') })
  } catch {}
} finally {
  await browser.close()
}
process.exit(exit)
