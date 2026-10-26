/**
 * QA：导航站 ZIP 导入 → 图标持久化（端到端）
 *
 * 复现用户场景：导入 sites.zip → 图标应补齐 → **刷新页面** → 图标仍在（读 IDB 原始记录复核）。
 *
 * 直接调用页面内真实的 sites store（Vite dev 下 import 同一模块 URL = 同一实例），
 * 保证走的是生产代码路径（含 navDataGuard 守卫、setPrefNow 落盘、markDirty）。
 *
 * 用法：node scripts/qa-nav-icon-persist.mjs [zipPath]
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ZIP = process.argv[2] || 'D:/Download/sites.zip'

function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!fs.existsSync(root)) return undefined
  const dirs = fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()
  for (const d of dirs) {
    const p = path.join(root, d, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(p)) return p
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
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/html')) return false
    return (await res.text()).includes('idbExportAll')
  } catch { return false }
}
async function isPortFree(port) {
  try { const res = await fetch('http://localhost:' + port + '/', { signal: AbortSignal.timeout(1500) }); return !res.ok } catch { return true }
}

let server = null, startedByUs = false
async function ensureDevServer() {
  for (let p = 16718; p <= 16726; p++) if (await isViteDevAt(p)) return 'http://localhost:' + p
  for (let p = 16718; p <= 16726; p++) {
    if (!(await isPortFree(p))) continue
    const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
    server = spawn(process.execPath, [viteBin, '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    startedByUs = true
    server.stdout.on('data', (d) => { const s = String(d); if (/ready|Local/.test(s)) process.stdout.write('[vite] ' + s) })
    server.stderr.on('data', () => {})
    if (await waitForServer('http://localhost:' + p)) {
      if (await isViteDevAt(p)) return 'http://localhost:' + p
    }
    server.kill(); server = null; startedByUs = false
  }
  throw new Error('no free port 16718-16726')
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

/** 读 IDB nav store 里 'user-sites' 原始字符串 */
const READ_IDB = `async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('easy-web-tab')
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  const rec = await new Promise((res, rej) => {
    const tx = db.transaction('nav', 'readonly')
    const rq = tx.objectStore('nav').get('user-sites')
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error)
  })
  db.close()
  return typeof rec === 'string' ? rec : ''
}`

async function idbStats(page) {
  return page.evaluate(`(async () => {
    const raw = await (${READ_IDB})()
    const dataUrl = (raw.match(/data:image\\//g) || []).length
    const rel = (raw.match(/"icon":"(icons\\/|\\.\\/icons\\/)/g) || []).length
    let n = 0
    try { n = JSON.parse(raw).length } catch {}
    return { len: raw.length, dataUrl, rel, n }
  })()`)
}

/** 图标库（IDB icons store，单条记录 key='items'）里的自定义图标数量 */
async function iconLibCount(page) {
  return page.evaluate(`(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('easy-web-tab')
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    const rec = await new Promise((res, rej) => {
      const tx = db.transaction('icons', 'readonly')
      const rq = tx.objectStore('icons').get('items')
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error)
    })
    db.close()
    return Array.isArray(rec) ? rec.length : 0
  })()`)
}

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base, '\n[qa] zip =', ZIP)

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const logs = []
  page.on('console', (m) => {
    const t = m.text()
    if (/\[Import\]|\[nav-prefs\]|\[sites\]|\[cloud/i.test(t)) logs.push(t.slice(0, 240))
  })
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message))

  await page.goto(base + '/', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.site-card', { timeout: 120000 })
  check('应用加载完成（站点卡片已渲染）', true)

  const zipB64 = fs.readFileSync(ZIP).toString('base64')

  // ---------- 1) 第一次导入 ----------
  const r1 = await page.evaluate(async (b64) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const file = new File([bytes], 'sites.zip', { type: 'application/zip' })
    const mod = await import('/src/stores/sites.ts')
    const store = mod.useSitesStore()
    if (typeof store.importFromZip !== 'function') return { error: 'importFromZip 不可用（模块实例不一致）' }
    const r = await store.importFromZip(file)
    // 等落盘（setPrefNow 已 await，这里再给影子/防抖一点余量）
    await new Promise((rs) => setTimeout(rs, 600))
    const icons = store.sites.filter((s) => s.icon)
    return {
      ...r,
      total: store.sites.length,
      dataUrl: icons.filter((s) => /^data:image\//i.test(s.icon)).length,
      rel: icons.filter((s) => /^(\.\/)?icons\//i.test(s.icon)).length,
    }
  }, zipB64)
  console.log('[qa] 导入结果:', JSON.stringify(r1))
  check('导入未报错', !r1.error, r1.error || '')
  check('新增站点 > 0', (r1.added || 0) > 0, `added=${r1.added}`)
  check('store 内图标已是 data URL', (r1.dataUrl || 0) > 0, `dataUrl=${r1.dataUrl}`)
  check('store 内无 icons/ 残留路径', (r1.rel || 0) === 0, `rel=${r1.rel}`)
  check('图标库登记了图标', (r1.iconLibraryAdded || 0) > 0, `iconLibraryAdded=${r1.iconLibraryAdded}`)

  // ---------- 2) IDB 原始记录（刷新前的持久化真相）----------
  const lib1 = await iconLibCount(page)
  check('IDB 图标库已持久化', lib1 > 0, `icons=${lib1}`)

  const s1 = await idbStats(page)
  console.log('[qa] IDB 统计:', JSON.stringify(s1))
  check('IDB 已有 user-sites 记录', s1.n > 0, `n=${s1.n} len=${s1.len}`)
  check('IDB 中图标为 data URL', s1.dataUrl > 0, `dataUrl=${s1.dataUrl}`)
  check('IDB 中无 icons/ 残留', s1.rel === 0, `rel=${s1.rel}`)

  // ---------- 3) 刷新页面 ----------
  await page.reload({ waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.site-card', { timeout: 120000 })
  await page.waitForTimeout(800)

  const s2 = await idbStats(page)
  console.log('[qa] 刷新后 IDB 统计:', JSON.stringify(s2))
  check('刷新后 IDB 图标仍为 data URL', s2.dataUrl > 0, `dataUrl=${s2.dataUrl}`)
  check('刷新后 IDB 无 icons/ 残留', s2.rel === 0, `rel=${s2.rel}`)

  const after = await page.evaluate(async () => {
    const mod = await import('/src/stores/sites.ts')
    const store = mod.useSitesStore()
    const icons = store.sites.filter((s) => s.icon)
    return {
      total: store.sites.length,
      dataUrl: icons.filter((s) => /^data:image\//i.test(s.icon)).length,
      rel: icons.filter((s) => /^(\.\/)?icons\//i.test(s.icon)).length,
    }
  })
  console.log('[qa] 刷新后 store:', JSON.stringify(after))
  check('刷新后 store 图标仍为 data URL', after.dataUrl > 0, `dataUrl=${after.dataUrl}`)
  check('刷新后 store 无 icons/ 残留', after.rel === 0, `rel=${after.rel}`)

  const lib2 = await iconLibCount(page)
  check('刷新后图标库仍在', lib2 === lib1, `icons=${lib2} 期望=${lib1}`)
  const storeLib = await page.evaluate(async () => {
    const mod = await import('/src/stores/icons.ts')
    const s = mod.useIconsStore()
    await s.ensureLoaded()
    return s.customIcons.length
  })
  check('刷新后 store.customIcons 与 IDB 一致', storeLib === lib2, `store=${storeLib} idb=${lib2}`)

  // 页面上真实渲染的图标
  const rendered = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.site-card img')]
    return {
      total: imgs.length,
      dataUrl: imgs.filter((i) => (i.getAttribute('src') || '').startsWith('data:image/')).length,
      broken: imgs.filter((i) => (i.getAttribute('src') || '').startsWith('icons/')).length,
    }
  })
  console.log('[qa] 渲染图标:', JSON.stringify(rendered))
  check('页面渲染出 data URL 图标', rendered.dataUrl > 0, `dataUrl=${rendered.dataUrl}`)
  check('页面无损坏的 icons/ 相对路径', rendered.broken === 0, `broken=${rendered.broken}`)

  if (logs.length) {
    console.log('\n[qa] 相关控制台日志:')
    logs.slice(0, 20).forEach((l) => console.log('   ' + l))
  }

  // ---------- 4) 复现用户真实状态：已有站点图标是坏相对路径 → 再导入应补齐并持久 ----------
  console.log('\n[qa] === 场景2：已有 90 条 + 图标为坏路径 → 再导入补齐 ===')
  await page.evaluate(`(async () => {
    const raw = await (${READ_IDB})()
    const arr = JSON.parse(raw)
    for (const s of arr) if (s.icon) s.icon = 'icons/' + encodeURIComponent(s.name) + '.svg'
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('easy-web-tab'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction('nav', 'readwrite')
      tx.objectStore('nav').put(JSON.stringify(arr), 'user-sites')
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error)
    })
    db.close()
  })()`)
  await page.reload({ waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.site-card', { timeout: 120000 })
  await page.waitForTimeout(600)

  const before2 = await idbStats(page)
  check('已构造出坏图标现场（rel>0）', before2.rel > 0, `rel=${before2.rel} dataUrl=${before2.dataUrl}`)

  const r2 = await page.evaluate(async (b64) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const file = new File([bytes], 'sites.zip', { type: 'application/zip' })
    const mod = await import('/src/stores/sites.ts')
    const r = await mod.useSitesStore().importFromZip(file)
    await new Promise((rs) => setTimeout(rs, 600))
    return r
  }, zipB64)
  console.log('[qa] 第二次导入:', JSON.stringify(r2))
  check('第二次导入：新增 0', r2.added === 0, `added=${r2.added}`)
  check('第二次导入：跳过 = 90', r2.skipped === 90, `skipped=${r2.skipped}`)
  check('第二次导入：补齐图标（全部坏图标站点）', r2.iconsFilled === before2.rel, `iconsFilled=${r2.iconsFilled} 期望=${before2.rel}`)
  check('第二次导入：图标库不重复新增', (r2.iconLibraryAdded || 0) === 0, `iconLibraryAdded=${r2.iconLibraryAdded}`)

  const s3 = await idbStats(page)
  console.log('[qa] 补齐后 IDB:', JSON.stringify(s3))
  check('补齐后 IDB 无坏路径', s3.rel === 0, `rel=${s3.rel}`)
  check('补齐后 IDB 图标为 data URL', s3.dataUrl === 79, `dataUrl=${s3.dataUrl}`)

  await page.reload({ waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.site-card', { timeout: 120000 })
  await page.waitForTimeout(800)
  const s4 = await idbStats(page)
  console.log('[qa] 再次刷新后 IDB:', JSON.stringify(s4))
  check('补齐后刷新，图标仍在（data URL）', s4.dataUrl === 79, `dataUrl=${s4.dataUrl}`)
  check('补齐后刷新，无坏路径复活', s4.rel === 0, `rel=${s4.rel}`)
  const lib3 = await iconLibCount(page)
  check('第二次导入后图标库数量不变（按内容去重）', lib3 === lib1, `icons=${lib3} 期望=${lib1}`)

  const rendered2 = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.site-card img')]
    return {
      dataUrl: imgs.filter((i) => (i.getAttribute('src') || '').startsWith('data:image/')).length,
      broken: imgs.filter((i) => (i.getAttribute('src') || '').startsWith('icons/')).length,
    }
  })
  console.log('[qa] 渲染:', JSON.stringify(rendered2))
  check('页面渲染无坏图标', rendered2.broken === 0, `broken=${rendered2.broken}`)

  // ---------- 5) 精确复现用户现场：图标库为空 + 站点已存在（URL 全部命中）→ 重新导入 ----------
  console.log('\n[qa] === 场景3：图标库清空 + 站点已存在 → 重新导入应填充图标库 ===')
  await page.evaluate(`(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('easy-web-tab'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction('icons', 'readwrite')
      tx.objectStore('icons').clear()
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error)
    })
    db.close()
    // 必须同时清 localStorage 旧键，否则 ensureLoaded 会把它迁移回 IDB
    try { localStorage.removeItem('user-custom-icons') } catch {}
  })()`)
  await page.reload({ waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.site-card', { timeout: 120000 })
  await page.waitForTimeout(600)

  const libCleared = await iconLibCount(page)
  check('图标库已清空（自定义 0）', libCleared === 0, `icons=${libCleared}`)

  const r3 = await page.evaluate(async (b64) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const file = new File([bytes], 'sites.zip', { type: 'application/zip' })
    const mod = await import('/src/stores/sites.ts')
    const r = await mod.useSitesStore().importFromZip(file)
    await new Promise((rs) => setTimeout(rs, 800))
    return r
  }, zipB64)
  console.log('[qa] 场景3 导入:', JSON.stringify(r3))
  check('场景3：站点全部命中（added=0）', r3.added === 0, `added=${r3.added}`)
  check('场景3：图标库新增 69', r3.iconLibraryAdded === 69, `iconLibraryAdded=${r3.iconLibraryAdded}`)

  const libAfter = await iconLibCount(page)
  check('场景3：IDB 图标库 69 条', libAfter === 69, `icons=${libAfter}`)

  await page.reload({ waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.site-card', { timeout: 120000 })
  await page.waitForTimeout(800)
  const libAfterReload = await iconLibCount(page)
  check('场景3：刷新后图标库仍 69 条', libAfterReload === 69, `icons=${libAfterReload}`)

  // 图标管理页里应能列出这些自定义图标
  await page.goto(base + '/', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('.site-card', { timeout: 120000 })
  const managerCount = await page.evaluate(async () => {
    const mod = await import('/src/stores/icons.ts')
    const s = mod.useIconsStore()
    await s.ensureLoaded()
    return { custom: s.customIcons.length, all: s.allIcons.length }
  })
  console.log('[qa] 图标库 store:', JSON.stringify(managerCount))
  check('图标库 store 有 69 个自定义图标', managerCount.custom === 69, `custom=${managerCount.custom}`)

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
