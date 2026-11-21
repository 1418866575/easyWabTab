// 博客后台「导入 MD / ZIP 图片自动上传」QA：真实导入 + 直读 IDB 校验。
// 用法：先起服务（vite dev 或 vite preview，端口 16798），再
//   node scripts/qa-blog-md-image-import.mjs
// 会写入测试文章与图片，脚本结束时精确回滚（按导入前的图片 id 集合 + 测试标题）。
import { chromium } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'

const BASE = process.env.QA_BASE || 'http://localhost:16798'
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ewt-qa-md-img-'))
const TITLES = ['QA MD 图片导入 A', 'QA MD 图片导入 B', 'QA MD 图片导入 C', 'QA MD 图片导入 D']
// 1x1 PNG，压缩器对小于 400KB 的图原样保留
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const IMG1 = 'QA图1-主页总览.png'
const IMG2 = 'QA图2-第二张.png'
const IMG3 = 'QA图3-独立.png'

const write = (name, content) => {
  const p = path.join(DIR, name)
  fs.writeFileSync(p, content)
  return p
}
const zipPath = path.join(DIR, '文章包.zip')
const png1 = write(IMG1, PNG)
const png3 = write(IMG3, PNG)
write(IMG2, PNG)

const mdA = write('A.md', `# ${TITLES[0]}\n\n![图1 · 个人工作台「主页」](images/${IMG1})\n\n正文段落。\n\n![图2](images/${IMG2})\n`)
const mdB = write('B.md', `# ${TITLES[1]}\n\n![图1 复用](images/${IMG1})\n`)
const mdC = write('C.md', `# ${TITLES[2]}\n\n![缺图](images/QA不存在的图.png)\n`)
const mdD = write('D.md', `# ${TITLES[3]}\n\n![独立图](${IMG3})\n`)

const zip = new JSZip()
zip.file('A.md', fs.readFileSync(mdA))
zip.file('B.md', fs.readFileSync(mdB))
zip.file(`images/${IMG1}`, PNG)
zip.file(`images/${IMG2}`, PNG)
fs.writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }))

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ channel: 'msedge', args: ['--no-proxy-server'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(30000)
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)))

/** 直读 IDB：返回测试文章精简字段 + 全量图片 id/name */
const snapshot = () =>
  page.evaluate(
    (titles) =>
      new Promise((resolve) => {
        const req = indexedDB.open('easy-web-tab')
        req.onsuccess = () => {
          const tx = req.result.transaction('blog', 'readonly')
          const get = tx.objectStore('blog').get('items')
          get.onsuccess = () => {
            const data = typeof get.result === 'string' ? JSON.parse(get.result) : get.result
            if (!data) return resolve({ articles: [], images: [] })
            resolve({
              articles: (data.articles ?? [])
                .filter((a) => titles.includes(a.title) && !a.deletedAt)
                .map((a) => ({ title: a.title, content: a.contentMarkdown, coverImageId: a.coverImageId, coverKind: a.coverKind })),
              images: (data.images ?? []).map((i) => ({ id: i.id, name: i.name }))
            })
          }
          get.onerror = () => resolve({ articles: [], images: [] })
        }
        req.onerror = () => resolve({ articles: [], images: [] })
      }),
    TITLES
  )

/** 精确回滚：删测试文章 + 移除本次新增图片 */
const purge = (beforeIds) =>
  page.evaluate(
    ({ titles, beforeIds: ids }) =>
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
            const keep = new Set(ids)
            data.articles = (data.articles ?? []).filter((a) => !titles.includes(a.title))
            data.images = (data.images ?? []).filter((i) => keep.has(i.id))
            store.put(data, 'items')
            tx.oncomplete = () => resolve(1)
            tx.onerror = () => resolve(0)
          }
          get.onerror = () => resolve(0)
        }
        req.onerror = () => resolve(0)
      }),
    { titles: TITLES, beforeIds }
  )

await page.goto(BASE + '/blog/admin', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
await page.goto(BASE + '/blog/admin', { waitUntil: 'load' })
await page.waitForSelector('input[accept*=".zip"]', { state: 'attached', timeout: 30000 })
await page.waitForTimeout(1800)

const before = await snapshot()
const beforeIds = before.images.map((i) => i.id)

// 1) 导入 ZIP（md + images/，两篇 md 复用同一张图）
await page.setInputFiles('input[accept*=".zip"]', zipPath)
await page.waitForTimeout(3200)
const afterZip = await snapshot()
const a = afterZip.articles.find((x) => x.title === TITLES[0])
const b = afterZip.articles.find((x) => x.title === TITLES[1])
check('ZIP 导入 2 篇文章', !!a && !!b, afterZip.articles.map((x) => x.title).join(' | '))
if (a) {
  check('首图保留在正文并改写为 img: 引用', /!\[图1[^\]]*\]\(img:bi_/.test(a.content), a.content.slice(0, 90))
  check('首图同时设为封面', a.coverKind === 'image' && !!a.coverImageId && a.content.includes(`img:${a.coverImageId}`), String(a.coverImageId))
  check('正文 2 张图都在、无本地路径残留', (a.content.match(/img:bi_/g) ?? []).length === 2 && !a.content.includes('images/'))
}
if (a && b) {
  check('跨文章复用同一张图（不重复入库）', b.coverImageId === a.coverImageId && /img:bi_/.test(b.content))
}

// 2) 只选 md（不带图片）→ 缺图提示 + 不产生碎图
await page.setInputFiles('input[accept*=".md"]', mdC)
await page.waitForTimeout(1800)
const toastC = (await page.locator('.toast-item, .toast').allInnerTexts()).join(' ')
const c = (await snapshot()).articles.find((x) => x.title === TITLES[2])
check('只选 md 时提示缺图', toastC.includes('张图片未找到'), toastC.replace(/\s+/g, ' ').slice(0, 100))
check('只选 md 时不留碎图引用', !!c && !c.content.includes('images/') && !c.content.includes('img:bi_'))

// 3) 导入 MD 多选 md + 图片 → 自动上传
await page.setInputFiles('input[accept*=".md"]', [mdD, png3])
await page.waitForTimeout(2200)
const final = await snapshot()
const d = final.articles.find((x) => x.title === TITLES[3])
check('多选 MD + 图片时自动上传入库', !!d && /img:bi_/.test(d.content) && !!d.coverImageId)
const added = final.images.filter((i) => !beforeIds.includes(i.id))
check('图库共新增 3 张（2 张 ZIP + 1 张多选，已去重）', added.length === 3, added.map((i) => i.name).join(' | '))

// 4) 窄屏导入按钮区不溢出（4 个按钮）
await page.setViewportSize({ width: 375, height: 780 })
await page.waitForTimeout(500)
const box = await page.evaluate(() => {
  const el = document.querySelector('.ba-query-imports')
  const r = el.getBoundingClientRect()
  return { right: Math.round(r.right), vw: innerWidth, scrollW: el.scrollWidth, clientW: el.clientWidth }
})
check('375 宽下 4 个导入按钮不横向溢出', box.right <= box.vw + 1 && box.scrollW <= box.clientW + 1, JSON.stringify(box))

await purge(beforeIds)
await browser.close()
fs.rmSync(DIR, { recursive: true, force: true })

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length} / ${results.length} 通过`)
if (failed.length) process.exit(1)
