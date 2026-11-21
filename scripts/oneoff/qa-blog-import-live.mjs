/**
 * QA：线上博客「选文件导入」—— 真跑一遍信贷晨读目录的 .md + .png
 *
 * 背景：定时任务每天产出 D:\信贷晨读\YYYY-MM-DD-*.md 与 images\*-cover.png，
 * 需要在博客后台用「选文件导入」批量入库（分类自动归到「信贷晨读」）。
 * 本脚本直接打线上 https://www.codehelp.com.cn/blog/admin，验证部署产物里的导入链路，
 * 而不是本地 dev —— 因为要确认的正是「部署后按钮能不能用」。
 *
 * 断言：
 *  S0 页面出现「选文件导入」按钮，且存在 accept=".md,image/*" 的 file input
 *  S1 导入后文章数 +N（N 为 .md 数）
 *  S2 新增文章分类 = 信贷晨读
 *  S3 新增文章 coverImageId 非空（首图被提升为封面）
 *  S4 正文里不再残留裸相对路径 images/xxx.png（已改写为 img:<id>）
 *  S5 图库数量增加（图片已入图库）
 *  S6 控制台无报错
 *
 * 用法：node scripts/qa-blog-import-live.mjs [--dir D:\\信贷晨读] [--head]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const DIR = (() => {
  const i = args.indexOf('--dir')
  return i >= 0 ? args[i + 1] : 'D:\\信贷晨读'
})()
const HEADLESS = !args.includes('--head')
const SITE = 'https://www.codehelp.com.cn/blog/admin'

function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!fs.existsSync(root)) return undefined
  for (const d of fs.readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(p)) return p
  }
  return undefined
}

// 收集待导入文件：根目录 .md + images 下的 .png（不递归，避开 _wm_backup 里的带水印原图）
const mdFiles = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.md')).map((f) => path.join(DIR, f))
const imgDir = path.join(DIR, 'images')
const pngFiles = fs.existsSync(imgDir)
  ? fs.readdirSync(imgDir).filter((f) => f.toLowerCase().endsWith('.png')).map((f) => path.join(imgDir, f))
  : []

console.log(`[qa] dir=${DIR}`)
console.log(`[qa] md=${mdFiles.length} png=${pngFiles.length}`)
if (mdFiles.length === 0) {
  console.error('[qa] 没有找到 .md，终止')
  process.exit(2)
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

/** 读 IndexedDB 里的 BlogData（store 'blog' 单对象） */
async function readBlog(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const rq = indexedDB.open('easy-web-tab')
        rq.onerror = () => reject(new Error('open idb failed'))
        rq.onsuccess = () => {
          const db = rq.result
          if (!db.objectStoreNames.contains('blog')) {
            db.close()
            resolve(null)
            return
          }
          const tx = db.transaction('blog', 'readonly')
          const g = tx.objectStore('blog').getAll()
          g.onsuccess = () => {
            db.close()
            resolve(g.result && g.result[0] ? g.result[0] : null)
          }
          g.onerror = () => {
            db.close()
            reject(new Error('getAll failed'))
          }
        }
      })
  )
}

const consoleErrors = []
const browser = await chromium.launch({ executablePath: findChromium(), headless: HEADLESS })
const shot = path.join(os.tmpdir(), 'qa-blog-import.png')
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))

  console.log('[qa] goto', SITE)
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('text=选文件导入', { timeout: 30000 })

  // S0
  const fileInput = page.locator('input[type=file][accept*=".md"]')
  const inputCount = await fileInput.count()
  check('S0 按钮与 file input 就位', inputCount >= 1, `input=${inputCount}`)

  const before = await readBlog(page)
  const beforeArticles = before?.articles?.length ?? 0
  const beforeImages = before?.images?.length ?? 0
  console.log(`[qa] 导入前：文章 ${beforeArticles} 张图 ${beforeImages}`)

  const files = [...mdFiles, ...pngFiles]
  console.log(`[qa] 投喂 ${files.length} 个文件…`)
  const t0 = Date.now()
  await fileInput.first().setInputFiles(files)

  // 等 toast：项目用的是自研 toast（.toast-message），不是 Element 的 .el-message
  let toastText = ''
  try {
    const toast = page.locator('.toast-container .toast-message').first()
    await toast.waitFor({ state: 'visible', timeout: 60000 })
    toastText = ((await toast.textContent()) || '').trim()
  } catch {
    toastText = '(未捕获 toast)'
  }
  console.log(`[qa] toast: ${toastText}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  check('S0b 导入后有 toast 反馈', toastText !== '(未捕获 toast)', toastText)
  await page.waitForTimeout(1200)

  const after = await readBlog(page)
  const afterArticles = after?.articles?.length ?? 0
  const afterImages = after?.images?.length ?? 0
  console.log(`[qa] 导入后：文章 ${afterArticles} 张图 ${afterImages}`)

  const added = (after?.articles ?? []).filter(
    (a) => !(before?.articles ?? []).some((b) => b.id === a.id)
  )
  const catName = new Map((after?.categories ?? []).map((c) => [c.id, c.name]))

  check('S1 文章数增加', added.length > 0, `+${added.length}`)
  check(
    'S2 分类归到信贷晨读',
    added.length > 0 && added.every((a) => catName.get(a.categoryId) === '信贷晨读'),
    added.length ? [...new Set(added.map((a) => catName.get(a.categoryId)))].join(',') : ''
  )
  check(
    'S3 封面已设置',
    added.length > 0 && added.every((a) => !!a.coverImageId),
    added.length ? `${added.filter((a) => a.coverImageId).length}/${added.length}` : ''
  )

  // 正文不应残留 images/ 裸路径（要么改写成 img:<id>，要么被移除）
  const rawPathLeak = added.filter((a) => /!\[[^\]]*\]\(images\//.test(a.contentMarkdown || ''))
  check('S4 正文无 images/ 裸路径残留', rawPathLeak.length === 0, rawPathLeak.length ? `${rawPathLeak.length} 篇残留` : '')

  // 正文里的 img: 引用必须都能在图库里找到，否则是悬空引用
  const imgIds = new Set((after?.images ?? []).map((i) => i.id))
  const dangling = []
  for (const a of added) {
    for (const m of (a.contentMarkdown || '').matchAll(/\]\(img:(bi_[A-Za-z0-9_-]+)\)/g)) {
      if (!imgIds.has(m[1])) dangling.push(`${a.title} -> ${m[1]}`)
    }
  }
  check('S5 无悬空图片引用', dangling.length === 0, dangling.slice(0, 3).join('; '))
  check('S6 图库有新增', afterImages > beforeImages, `+${afterImages - beforeImages}`)

  // 重复导入应被标题去重挡住
  await fileInput.first().setInputFiles(files)
  await page.waitForTimeout(2500)
  const after2 = await readBlog(page)
  const after2Articles = after2?.articles?.length ?? 0
  check('S7 重复导入按标题去重', after2Articles === afterArticles, `${afterArticles} -> ${after2Articles}`)

  check('S8 控制台无报错', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))

  await page.screenshot({ path: shot, fullPage: false })
  console.log('[qa] screenshot:', shot)

  if (added.length) {
    console.log('[qa] 新增文章：')
    for (const a of added) console.log(`   - ${a.title}  [${catName.get(a.categoryId)}]  cover=${a.coverImageId ? 'Y' : 'N'}  ${a.contentMarkdown.length}字`)
  }
} catch (e) {
  console.error('[qa] 异常：', e?.message || e)
  try {
    const p = (await browser.contexts()[0]?.pages()?.[0]);
    if (p) { await p.screenshot({ path: shot }); console.log('[qa] 失败截图:', shot) }
  } catch { /* noop */ }
  results.push({ name: 'runner', ok: false })
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n[qa] ${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
