// 博客后台「导入 HTML」QA：验证按钮顺序、HTML→Markdown 转换结果、查重与窄屏布局。
// 用法：先起 dev（node node_modules/vite/bin/vite.js --port 16798），再
//   node scripts/qa-blog-html-import.mjs
// 注意：会真实写库（导入 1 篇测试文章），脚本开头与结尾都会清掉同标题文章，不留数据。
import { chromium } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASE = process.env.QA_BASE || 'http://localhost:16798'
const TITLE = 'HTML 导入测试文章'
const SAMPLE = path.join(os.tmpdir(), 'ewt-qa-import.html')
fs.writeFileSync(
  SAMPLE,
  `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><title>${TITLE}</title><style>.x{color:red}</style><script>console.log(1)</script></head>
<body>
  <h1>${TITLE}</h1>
  <p>第一段，含<strong>加粗</strong>与<a href="https://example.com">外链</a>。</p>
  <h2>小节标题</h2>
  <ul><li>条目一</li><li>条目二</li></ul>
  <pre><code>const a = 1</code></pre>
  <img src="https://example.com/pic.png" alt="示意图" />
</body></html>`,
  'utf8'
)

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ channel: 'msedge', args: ['--no-proxy-server'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(20000)
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)))

/** 直接从 IDB 删除本脚本导入的测试文章（等事务提交，避免 reload 打断写入） */
const purge = () =>
  page.evaluate(
    (title) =>
      new Promise((resolve) => {
        const req = indexedDB.open('easy-web-tab')
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('blog', 'readwrite')
          const store = tx.objectStore('blog')
          const get = store.get('items')
          get.onsuccess = () => {
            const data = typeof get.result === 'string' ? JSON.parse(get.result) : get.result
            if (!data) return resolve(0)
            const before = data.articles?.length ?? 0
            data.articles = (data.articles ?? []).filter((a) => a.title !== title)
            store.put(data, 'items')
            tx.oncomplete = () => resolve(before - data.articles.length)
            tx.onerror = () => resolve(0)
          }
          get.onerror = () => resolve(0)
        }
        req.onerror = () => resolve(0)
      }),
    TITLE
  )

await page.goto(BASE + '/blog/admin', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
// dev 首次编译可能触发 HMR reload，二次进入保证页面稳定
await page.goto(BASE + '/blog/admin', { waitUntil: 'load' })
await page.waitForTimeout(2000)

// 0) 清掉上次残留（若脚本中途失败过）
if (await purge()) {
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1500)
}

// 1) 按钮文案与顺序
const labels = await page.$$eval('.ba-query-imports .el-button', (els) => els.map((e) => e.innerText.trim()))
check('按钮顺序：导入 MD / 导入 HTML / 导入文件夹', JSON.stringify(labels) === JSON.stringify(['导入 MD', '导入 HTML', '导入文件夹']), labels.join(' | '))

// 2) 上传 HTML
await page.setInputFiles('input[accept*=".html"]', SAMPLE)
await page.waitForTimeout(2500)
const toastText = await page.locator('.toast-item, .toast').first().innerText().catch(() => '')
check('出现导入成功提示', toastText.includes('已转换并导入 1 篇'), toastText.replace(/\s+/g, ' ').slice(0, 60))

// 3) 直读 IDB 校验落库内容
const art = await page.evaluate(
  (title) =>
    new Promise((resolve) => {
      const req = indexedDB.open('easy-web-tab')
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('blog', 'readonly')
        const get = tx.objectStore('blog').get('items')
        get.onsuccess = () => {
          const data = typeof get.result === 'string' ? JSON.parse(get.result) : get.result
          const hit = (data?.articles ?? []).filter((a) => !a.deletedAt).find((a) => a.title === title)
          resolve(hit ? { title: hit.title, content: hit.contentMarkdown, status: hit.status } : null)
        }
        get.onerror = () => resolve(null)
      }
      req.onerror = () => resolve(null)
    }),
  TITLE
)

check('文章已落库（标题取 title）', !!art, art ? art.title : '未找到')
if (art) {
  const c = art.content
  check('正文无 script/style 残留', !c.includes('<script') && !c.includes('<style'))
  check('小节标题转成 ATX 二级', c.includes('## 小节标题'))
  check('加粗转成 **', c.includes('**加粗**'))
  check('链接转成 markdown 链接', c.includes('](https://example.com)'))
  check('列表转成 - 项', /^-\s+条目一/m.test(c))
  check('代码块转成围栏', c.includes('```'))
  check('外链图片原样保留', c.includes('](https://example.com/pic.png)'))
  check('落库状态为草稿', art.status === 'draft', art.status)
}

// 4) 重复导入同一标题应跳过
await page.setInputFiles('input[accept*=".html"]', SAMPLE)
await page.waitForTimeout(2000)
const toast2 = await page.locator('.toast-item, .toast').first().innerText().catch(() => '')
check('重复导入同标题被跳过', toast2.includes('没有新增文章'), toast2.replace(/\s+/g, ' ').slice(0, 60))

// 5) 窄屏不溢出
await page.setViewportSize({ width: 375, height: 780 })
await page.waitForTimeout(600)
const box = await page.evaluate(() => {
  const el = document.querySelector('.ba-query-imports')
  const r = el.getBoundingClientRect()
  return { right: Math.round(r.right), vw: innerWidth, scrollW: el.scrollWidth, clientW: el.clientWidth }
})
check('375 宽下导入按钮区不横向溢出', box.right <= box.vw + 1 && box.scrollW <= box.clientW + 1, JSON.stringify(box))

// 6) 收尾：清掉本次导入，避免污染本机数据
const cleaned = await purge()
console.log(cleaned ? `(已清理测试文章 ${cleaned} 篇)` : '(无需清理)')

await browser.close()
fs.rmSync(SAMPLE, { force: true })

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length} / ${results.length} 通过`)
if (failed.length) process.exit(1)
