/**
 * 把图库里所有「大图」的 dataUrl 批量压轻（JPEG），让 blog.json 云同步信封降回 10MB 阈值以下。
 *
 * 背景：博客把图片以 base64 内嵌进 blog.json 整包 PUT 到 WebDAV，服务端 nginx 上限约 10MB。
 * 单靠压当天封面已不够（2026-11-02、11-03 连续两次 413），需要把历史大图一起压。
 * 只换 dataUrl 与 size，image id 不变，历史文章的引用不受影响。
 *
 * 用法：node scripts/slim-images.mjs [阈值字节] [最长边] [质量]
 *   默认 300000 字节 / 1400px / 0.8
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { chromium } from 'playwright'

const THRESHOLD = Number(process.argv[2] || 300000)
const MAX_EDGE = Number(process.argv[3] || 1400)
const QUALITY = Number(process.argv[4] || 0.8)
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
await page.locator('input[type=file][accept*=".md"]').first().waitFor({ state: 'attached', timeout: 40000 })
await page.waitForTimeout(2000)

const out = await page.evaluate(
  async ({ threshold, maxEdge, quality }) => {
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
    const bytesOf = (du) => {
      const c = du.indexOf(',')
      if (c < 0) return 0
      const b = du.slice(c + 1)
      const pad = b.endsWith('==') ? 2 : b.endsWith('=') ? 1 : 0
      return Math.floor((b.length * 3) / 4) - pad
    }
    const compress = (du) =>
      new Promise((resolve) => {
        const im = new Image()
        im.onload = () => {
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
          resolve({ url: c.toDataURL('image/jpeg', quality), w, h })
        }
        im.onerror = () => resolve(null)
        im.src = du
      })

    const beforeTotal = JSON.stringify(cur).length
    const done = []
    for (let i = 0; i < cur.images.length; i++) {
      const img = cur.images[i]
      const before = bytesOf(img.dataUrl || '')
      if (!before || before < threshold) continue
      const r = await compress(img.dataUrl)
      if (!r) continue
      const after = bytesOf(r.url)
      if (after >= before) continue
      cur.images[i] = { ...img, dataUrl: r.url, size: after }
      done.push({ name: img.name, before, after })
    }
    cur.updatedAt = Date.now()
    const total = JSON.stringify(cur).length
    if (done.length) {
      await new Promise((res, rej) => {
        const tx = db.transaction('blog', 'readwrite')
        const p = tx.objectStore('blog').put(cur, 'items')
        p.onsuccess = () => res()
        p.onerror = () => rej(p.error)
      })
    }
    db.close()
    return { ok: true, done, beforeTotal, total }
  },
  { threshold: THRESHOLD, maxEdge: MAX_EDGE, quality: QUALITY }
)

console.log(JSON.stringify(out, null, 2))
await browser.close()
