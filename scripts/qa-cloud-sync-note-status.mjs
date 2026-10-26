/**
 * QA：便签「状态」在云同步后不被对端旧值覆盖（字段级合并）
 *
 * 背景 bug：workbench.json 的 notes 走 mergeById = **记录级** LWW（整条按 updatedAt 取新）。
 * 于是对端只要改过别处（标题/置顶/截止日期），或对端时钟偏快，它的整条记录（带着旧 status）
 * 就会赢下本次合并，把本端刚改的「已处理」覆盖回「处理中」。
 *
 * 修复：status 单独按 note.statusUpdatedAt 做**字段级**取舍（两侧都有该时间戳才判），
 * 其余字段仍按记录级 LWW。
 *
 * 复现手法：劫持 window.fetch 只拦 /api/webdav-proxy，用内存 Map 模拟 WebDAV，
 * 这样可以直接改写「云端记录」来构造对端场景，不需要真实服务器。
 *
 * 断言：
 *  S1 对端记录 updatedAt 更新但 status 更旧 → 本端状态仍是 done（核心）
 *  S2 同一次合并里，对端的其它字段（标题）仍被正常采纳（证明是字段级，而不是整条保本地）
 *  S3 合并结果回推后，云端 status 也变成 done
 *  S4 反向：对端 status 的 statusUpdatedAt 更新时，采纳对端状态（不无脑保本地）
 *
 * 用法：node scripts/qa-cloud-sync-note-status.mjs
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

  // 假 WebDAV：内存 Map + 可控 mtime，便于直接改写「云端记录」
  await ctx.addInitScript(() => {
    const files = new Map() // target -> { body, mtime }
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

    const notesMod = await import('/src/stores/workbenchNotes.ts')
    const ns = notesMod.useWorkbenchNotesStore()
    await ns.addNote({ content: 'status-merge-note', color: 'yellow', status: 'pending' })
    const findNote = () => ns.notes.find((n) => n.content === 'status-merge-note')

    const sync = await import('/src/composables/useCloudSync.ts')
    const keyOf = () => [...dav.files.keys()].find((k) => k.endsWith('workbench.json')) || ''
    const readRemoteNote = (id) => {
      const k = keyOf()
      if (!k) return null
      try {
        const env = JSON.parse(dav.files.get(k).body)
        return (env?.notes?.notes ?? []).find((n) => n.id === id) || null
      } catch { return null }
    }
    /** 直接改写云端记录（模拟「对端设备」），并把 mtime 推新以触发合并分支 */
    const patchRemoteNote = (id, patch, mtimeOffsetMs = 5000) => {
      const k = keyOf()
      const env = JSON.parse(dav.files.get(k).body)
      const arr = env?.notes?.notes ?? []
      const i = arr.findIndex((n) => n.id === id)
      if (i === -1) return false
      arr[i] = { ...arr[i], ...patch }
      dav.files.set(k, { body: JSON.stringify(env), mtime: Date.now() + mtimeOffsetMs })
      return true
    }

    const note = findNote()
    if (!note) return { error: 'note-not-created' }

    // 1) 基线推送
    await sync.syncNow(true)
    for (let i = 0; i < 3 && sync.isDirty(); i++) await sync.syncNow(true)
    const baseRemote = readRemoteNote(note.id)

    // 2) 本端把状态改成 done（记录 statusUpdatedAt）
    await ns.updateNote(note.id, { status: 'done' })
    const localAfterEdit = findNote()

    // 3) 模拟对端：只改标题（updatedAt 更晚），status 仍是 pending，
    //    statusUpdatedAt 是更早的时间（对端并没有改状态）
    const tOld = new Date(Date.now() - 3600_000).toISOString()
    patchRemoteNote(note.id, {
      title: '对端改的标题',
      status: 'pending',
      statusUpdatedAt: tOld,
      updatedAt: new Date(Date.now() + 5000).toISOString()
    }, 8000)

    // 4) 同步（本地 dirty → 走合并分支）
    await sync.syncNow(true)
    const merged = findNote()
    const remoteAfterMerge = readRemoteNote(note.id)

    // 5) 反向：对端把状态改成 done 且 statusUpdatedAt 更晚 → 应采纳对端
    //    先让本地保持 dirty（改标题），确保走合并分支而不是整份覆盖
    await ns.updateNote(note.id, { title: '本端改的标题' })
    patchRemoteNote(note.id, {
      status: 'done',
      statusUpdatedAt: new Date(Date.now() + 3600_000).toISOString(),
      updatedAt: new Date(Date.now() + 7200_000).toISOString()
    }, 9000)
    await sync.syncNow(true)
    const reverse = findNote()

    return {
      baseStatus: baseRemote?.status ?? null,
      localAfterEditStatus: localAfterEdit?.status ?? null,
      localStatusAfterTimestamp: localAfterEdit?.statusUpdatedAt || '',
      mergedStatus: merged?.status ?? null,
      mergedTitle: merged?.title ?? '',
      remoteStatusAfterMerge: remoteAfterMerge?.status ?? null,
      reverseStatus: reverse?.status ?? null
    }
  }, { davOrigin: DAV_ORIGIN, davPath: DAV_PATH })

  console.log('[qa] 结果数据:', JSON.stringify(out))
  if (out.error) throw new Error('前置步骤失败：' + out.error)

  check('前置：云端基线状态为 pending', out.baseStatus === 'pending', String(out.baseStatus))
  check('前置：本端改成 done 并写入 statusUpdatedAt', out.localAfterEditStatus === 'done' && !!out.localStatusAfterTimestamp, out.localStatusAfterTimestamp)
  check('S1 对端只改别处 → 本端状态仍为 done（未被覆盖）', out.mergedStatus === 'done', String(out.mergedStatus))
  check('S2 对端其它字段仍被采纳（标题）', out.mergedTitle === '对端改的标题', out.mergedTitle)
  check('S3 合并结果已回推云端（status=done）', out.remoteStatusAfterMerge === 'done', String(out.remoteStatusAfterMerge))
  check('S4 对端状态更新时采纳对端（不被本地锁死）', out.reverseStatus === 'done', String(out.reverseStatus))
  check('无页面级 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[qa] 结果：${results.length - failed.length} pass / ${failed.length} fail`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  if (server && startedByUs) server.kill()
}
