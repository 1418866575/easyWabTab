/**
 * 一次性修复：把已入库的「当天封面」dataUrl 压轻（JPEG 1600px），
 * 让 blog.json 云同步信封降到服务端 413 阈值以下。
 * 用法： node scripts/slim-cover.mjs "<文章标题>"
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { chromium } from 'playwright'

const TITLE = process.argv[2]
const PROFILE = path.join(os.homedir(), 'AppData', 'Local', 'ewt-blog-agent-profile')
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

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: findChromium(),
  headless: true,
  viewport: { width: 1440, height: 950 }
})
const page = browser.pages()[0] || (await browser.newPage())
await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('text=选文件导入', { timeout: 40000 })
await page.waitForTimeout(2000)

const out = await page.evaluate(async (title) => {
  const open = () =>
    new Promise((res, rej) => {
      const rq = indexedDB.open('easy-web-tab')
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => rej(rq.error)
    })
  const db = await open()
  const getAll = (store) =>
    new Promise((res, rej) => {
      const g = db.transaction(store, 'readonly').objectStore(store).getAll()
      g.onsuccess = () => res(g.result)
      g.onerror = () => rej(g.error)
    })
  const cur = (await getAll('blog'))[0]
  if (!cur) {
    db.close()
    return { ok: false, err: 'blog store 为空' }
  }
  const art = cur.articles.find((a) => String(a.title) === title)
  if (!art) {
    db.close()
    return { ok: false, err: '找不到文章: ' + title }
  }
  const img = cur.images.find((i) => i.id === art.coverImageId)
  if (!img) {
    db.close()
    return { ok: false, err: '文章无 coverImageId 或图片不存在' }
  }
  const bytesOf = (du) => {
    const c = du.indexOf(',')
    if (c < 0) return 0
    const b = du.slice(c + 1)
    const pad = b.endsWith('==') ? 2 : b.endsWith('=') ? 1 : 0
    return Math.floor((b.length * 3) / 4) - pad
  }
  const before = bytesOf(img.dataUrl)
  const beforeTotal = JSON.stringify(cur).length

  const compress = (du) =>
    new Promise((resolve) => {
      const im = new Image()
      im.onload = () => {
        const maxEdge = 1600
        const longest = Math.max(im.naturalWidth, im.naturalHeight)
        const scale = longest > maxEdge ? maxEdge / longest : 1
        const w = Math.round(im.naturalWidth * scale)
        const h = Math.round(im.naturalHeight * scale)
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(im, 0, 0, w, h)
        resolve({ url: c.toDataURL('image/jpeg', 0.82), w, h })
      }
      im.onerror = () => resolve(null)
      im.src = du
    })
  const r = await compress(img.dataUrl)
  if (!r) {
    db.close()
    return { ok: false, err: '图片解码失败' }
  }
  const after = bytesOf(r.url)
  if (after >= before) {
    db.close()
    return { ok: false, err: `压缩后没变小（${before} -> ${after}）` }
  }
  const idx = cur.images.indexOf(img)
  cur.images[idx] = { ...img, dataUrl: r.url, size: after }
  cur.updatedAt = Date.now()
  const total = JSON.stringify(cur).length
  await new Promise((res, rej) => {
    const tx = db.transaction('blog', 'readwrite')
    const p = tx.objectStore('blog').put(cur, 'items')
    p.onsuccess = () => res()
    p.onerror = () => rej(p.error)
  })
  db.close()
  return { ok: true, before, after, beforeTotal, total, w: r.w, h: r.h, name: img.name }
}, TITLE)

console.log(JSON.stringify(out, null, 2))
await browser.close()
