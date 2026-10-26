/**
 * QA：博客回收站「彻底删除 / 清空回收站」后不被云同步复活
 *
 * 复现的 bug：purgeArticle 原来是**物理移除**（把记录从本地数组 filter 掉），而 blog.json
 * 的合并是**并集**（mergeBlogEnvelope → mergeById union）。本地一删，云端还留着的那份
 * deletedAt 墓碑在下一次拉取时被当成「远端新增」补回来 → 清空回收站一同步又恢复了。
 *
 * 修复：purgeArticle 改写 purgedAt 墓碑（回收站不再展示，记录保留随信封上云），
 * 两端一致后由 gcPurgedArticles（7 天保留期，推送成功后统一 GC）物理清除。
 *
 * 断言：
 *  S1 基线推送后云端有该文章且未删除
 *  S2 软删并推送后：本地回收站 1 条，云端墓碑（deletedAt 非空）
 *  S3 彻底删除并同步后：本地回收站 0 条、云端记录带 purgedAt（墓碑已上云）
 *  S4 再同步一轮：仍无复活（回收站 0 条、云端该记录仍带 deletedAt/purgedAt）
 *
 * 未修复时 S3/S4 失败：记录被并集合并复活回回收站。
 *
 * 用法：node scripts/qa-blog-trash-purge.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DAV_ORIGIN = 'https://dav.example.com'
const DAV_PATH = '/dav/'

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
    try { if ((await fetch(url)).ok) return true } catch { }
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
    server = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(p), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
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

const browser = await chromium.launch({ executablePath: findChromium() })
try {
  const base = await ensureDevServer()
  console.log('[qa] dev =', base)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })

  // 假 WebDAV：内存 Map 模拟云端，可直接读改「云端记录」
  await ctx.addInitScript(() => {
    const files = new Map()
    window.__dav = { files, hits: [] }
    const orig = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || ''
      if (!url.includes('/api/webdav-proxy')) return orig(input, init)
      let payload = {}
      try { payload = JSON.parse(String((init && init.body) || '{}')) } catch { return orig(input, init) }
      const target = String(payload.target || '')
      const method = String(payload.method || '')
      const body = payload.body
      window.__dav.hits.push(method + ' ' + target)
      const h = (status, extra) => ({ 'Content-Type': 'application/json', 'X-Upstream-Status': String(status), ...(extra || {}) })
      return (async () => {
        if (method === 'GET' || method === 'HEAD') {
          const rec = files.get(target)
          if (!rec) return new Response('', { status: 404, headers: h(404) })
          return new Response(method === 'HEAD' ? '' : rec.body, {
            status: 200,
            headers: h(200, { 'Last-Modified': new Date(rec.mtime).toUTCString() })
          })
        }
        if (method === 'PUT') {
          files.set(target, { body: String(body ?? ''), mtime: Date.now() })
          return new Response('', { status: 201, headers: h(201) })
        }
        if (method === 'MKCOL') return new Response('', { status: 201, headers: h(201) })
        if (method === 'DELETE') { files.delete(target); return new Response('', { status: 204, headers: h(204) }) }
        return new Response('', { status: 405, headers: h(405) })
      })()
    }
  })

  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(base + '/workbench', { waitUntil: 'commit', timeout: 120000 })
  await page.waitForSelector('[data-testid="wb-menu-notes"]', { timeout: 120000 })
  if (await page.locator('.help-dialog .close-btn').count()) {
    await page.click('.help-dialog .close-btn')
    await page.waitForTimeout(300)
  }

  const out = await page.evaluate(async ({ davOrigin, davPath }) => {
    const dav = window.__dav
    const settingsMod = await import('/src/stores/settings.ts')
    const st = settingsMod.useAppSettingsStore()
    st.setCloudSyncUrl(davOrigin + davPath)
    st.setCloudSyncUsername('tester')
    st.setCloudSyncPassword('secret')
    st.setCloudSyncAutoPush(false)
    st.setCloudSyncEnabled(true)

    const blogMod = await import('/src/stores/blog.ts')
    const bs = blogMod.useBlogStore()
    const a = await bs.createArticle({ title: '回收站QA文章' })
    await bs.updateArticle(a.id, { status: 'published', content: '正文' })

    const sync = await import('/src/composables/useCloudSync.ts')
    const keyOf = () => [...dav.files.keys()].find((k) => k.endsWith('blog.json')) || ''
    const readRemoteArticle = (id) => {
      const k = keyOf()
      if (!k) return null
      try {
        const env = JSON.parse(dav.files.get(k).body)
        return (env?.blog?.articles ?? []).find((n) => n.id === id) || null
      } catch { return null }
    }

    // S1 基线推送
    await sync.syncNow(true)
    const baseRemote = readRemoteArticle(a.id)

    // S2 软删 → 推送墓碑
    await bs.softDeleteArticle(a.id)
    await sync.syncNow(true)
    const trashAfterSoft = bs.trashedArticles.length
    const remoteAfterSoft = readRemoteArticle(a.id)
    // 设备 B 视角的云端快照：它还没升级/没同步到「彻底删除」，手里仍是软删墓碑
    const snapshotKey = keyOf()
    const deviceBSnapshot = snapshotKey ? dav.files.get(snapshotKey).body : ''

    // S3 彻底删除 → 同步（修复后：purgedAt 墓碑上云；未修复：本地被并集复活）
    await bs.purgeArticle(a.id)
    await sync.syncNow(true)
    const trashAfterPurge = bs.trashedArticles.length
    const localAfterPurge = bs.articles.find((n) => n.id === a.id) || null
    const remoteAfterPurge = readRemoteArticle(a.id)

    // S4 多设备场景：另一台设备（还没升级/还留着软删墓碑）把墓碑推回云端 → 本端再同步
    // 这是「清空回收站又恢复」的真实触发路径（单端推送会把云端墓碑一起抹掉，复现不出）
    const k = keyOf()
    dav.files.set(k, { body: deviceBSnapshot, mtime: Date.now() + 8000 })
    await sync.syncNow(true)
    const trashAfterSecond = bs.trashedArticles.length
    const activeAfterSecond = bs.activeArticles.filter((n) => n.id === a.id).length
    const remoteAfterSecond = readRemoteArticle(a.id)
    const localAfterSecond = bs.articles.find((n) => n.id === a.id) || null

    return {
      baseRemoteDeleted: baseRemote ? !!baseRemote.deletedAt : null,
      trashAfterSoft,
      remoteSoftDeleted: remoteAfterSoft ? !!remoteAfterSoft.deletedAt : null,
      trashAfterPurge,
      localPurgedAt: localAfterPurge?.purgedAt || '',
      remotePurgedAt: remoteAfterPurge?.purgedAt || '',
      remoteDeletedAfterPurge: remoteAfterPurge ? !!remoteAfterPurge.deletedAt : null,
      trashAfterSecond,
      activeAfterSecond,
      remoteDeletedAfterSecond: remoteAfterSecond ? !!remoteAfterSecond.deletedAt : null,
      remotePurgedAfterSecond: remoteAfterSecond?.purgedAt || '',
      localPurgedAfterSecond: localAfterSecond?.purgedAt || '',
      localDeletedAfterSecond: localAfterSecond ? !!localAfterSecond.deletedAt : null
    }
  }, { davOrigin: DAV_ORIGIN, davPath: DAV_PATH })

  console.log('[qa] 结果数据:', JSON.stringify(out))

  check('S1 基线：云端有文章且未删除', out.baseRemoteDeleted === false, String(out.baseRemoteDeleted))
  check('S2 软删后：回收站 1 条、云端墓碑', out.trashAfterSoft === 1 && out.remoteSoftDeleted === true, `trash=${out.trashAfterSoft} remoteDeleted=${out.remoteSoftDeleted}`)
  check('S3 彻底删除并同步：回收站 0 条、云端墓碑带 purgedAt', out.trashAfterPurge === 0 && !!out.remotePurgedAt && out.remoteDeletedAfterPurge === true,
    `trash=${out.trashAfterPurge} remotePurged=${out.remotePurgedAt} remoteDeleted=${out.remoteDeletedAfterPurge}`)
  check('S3 本地记录保留 purgedAt（墓碑未丢）', !!out.localPurgedAt, out.localPurgedAt)
  check('S4 对端把墓碑推回后本端再同步：仍无复活',
    out.trashAfterSecond === 0 && out.activeAfterSecond === 0 && out.localPurgedAfterSecond !== '',
    `trash=${out.trashAfterSecond} active=${out.activeAfterSecond} localPurged=${out.localPurgedAfterSecond}`)
  check('无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
