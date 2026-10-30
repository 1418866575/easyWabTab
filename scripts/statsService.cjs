/**
 * 全网访问统计采集服务（服务端）
 *
 * 定位：统计「所有公网访客」的访问，与前端本机那份（useVisitStats）互补 ——
 * 本机那份只看得见「我自己怎么用」，这份才看得见「别人怎么看这个站」。
 *
 * 挂载方式：由 serve-with-rewrites.cjs（16718，nginx 已把 /api/ 反代过来）require，
 * 暴露两个接口，**不需要改 nginx、不需要新端口**：
 *   POST /api/stats/collect   { n: 路由名, r: document.referrer }  → 204
 *   GET  /api/stats/summary?days=30                               → 聚合 JSON
 *
 * 存储：`data/stats/<YYYY-MM-DD>.json`（一天一个文件，gitignore）
 *   { pv: number, uv: string[], paths: {路由名: 次数}, refs: {来源分类: 次数} }
 *
 * 隐私设计（刻意的）：
 *   - **不存 IP 明文**，只存 sha256(盐 + 日期 + IP + UA) 的前 16 位；盐是本机随机生成后落盘
 *   - 不设任何 cookie / localStorage
 *   - 只记路由名（如 `books`）与来源分类，不记完整 URL 的查询串、不记屏幕尺寸等指纹
 *   - `EWT_STATS_SALT` 可覆盖盐；换盐等于让历史 UV 无法与将来关联
 *
 * 为什么按天分文件而不是数据库：站点量级小（每天几 KB），一天一个文件让「删旧数据 = 删文件」，
 * 也避免引入 sqlite 依赖。写入走内存缓存 + 防抖，读时先 flush 保证一致。
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

/** 数据目录（可用 EWT_STATS_DIR 覆盖，便于把统计放到非部署目录） */
const DATA_DIR = process.env.EWT_STATS_DIR || path.join(__dirname, '..', 'data', 'stats')
/** 保留天数 */
const KEEP_DAYS = Number(process.env.EWT_STATS_KEEP_DAYS) || 180
/** 单日 UV 哈希上限（防刷；超过后只累加 PV） */
const MAX_UV_PER_DAY = 20000
/** 采集请求体上限（只该有几个字段，超出直接拒绝） */
const MAX_BODY_BYTES = 2048
/** 单次查询最大天数 */
const MAX_QUERY_DAYS = 90
/** 落盘防抖：连续访问合并成一次写 */
const FLUSH_DELAY = 500

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** 路由名白名单式校验：只允许字母数字与连字符，其它一律归 other */
const NAME_RE = /^[A-Za-z0-9_-]{1,40}$/

/** 搜索引擎域名片段（命中归「搜索引擎」） */
const SEARCH_HOSTS = ['baidu.', 'google.', 'bing.', 'sogou.', 'so.com', 'sm.cn', 'yandex.', 'duckduckgo.']
/** 社交/内容平台（命中归「社交分享」） */
const SOCIAL_HOSTS = ['weibo.', 'zhihu.', 'douyin.', 'tiktok.', 'twitter.', 'x.com', 'facebook.', 't.me', 'tieba.', 'xiaohongshu.', 'bilibili.', 'juejin.', 'csdn.', 'mp.weixin.qq.com']

/** 本地日期（服务端时区；与本机统计的 dayKey 口径一致） */
function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function dateKeyOffset(offset, base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  d.setDate(d.getDate() + offset)
  return dayKey(d)
}

function fileOf(key) {
  return path.join(DATA_DIR, `${key}.json`)
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
}

function obj(v) {
  const out = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [k, n] of Object.entries(v)) if (num(n) > 0) out[String(k).slice(0, 60)] = num(n)
  return out
}

/** ---------- 盐 ---------- */
let saltCache = null
function getSalt() {
  if (saltCache) return saltCache
  const fromEnv = (process.env.EWT_STATS_SALT || '').trim()
  if (fromEnv) {
    saltCache = fromEnv
    return saltCache
  }
  const saltFile = path.join(DATA_DIR, '.salt')
  try {
    const existing = fs.readFileSync(saltFile, 'utf8').trim()
    if (existing) {
      saltCache = existing
      return saltCache
    }
  } catch {
    /* 首次运行没有盐文件，下面生成 */
  }
  saltCache = crypto.randomBytes(16).toString('hex')
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(saltFile, saltCache)
  } catch (e) {
    console.warn('[stats] 盐文件写入失败，本次运行使用临时盐:', e && e.message)
  }
  return saltCache
}

function visitorHash(day, ip, ua) {
  return crypto
    .createHash('sha256')
    .update(`${getSalt()}|${day}|${ip}|${ua}`)
    .digest('hex')
    .slice(0, 16)
}

/** ---------- 内存缓存 + 落盘 ---------- */
/** key → { pv, uv:Set, paths, refs } */
const cache = new Map()
const dirty = new Set()
let flushTimer = null

function loadDay(key) {
  if (cache.has(key)) return cache.get(key)
  let rec = { pv: 0, uv: [], paths: {}, refs: {} }
  try {
    const raw = JSON.parse(fs.readFileSync(fileOf(key), 'utf8'))
    rec = { pv: num(raw.pv), uv: Array.isArray(raw.uv) ? raw.uv : [], paths: obj(raw.paths), refs: obj(raw.refs) }
  } catch {
    /* 文件不存在 / 坏数据 → 空天 */
  }
  const view = {
    pv: rec.pv,
    uv: new Set(rec.uv.filter((s) => typeof s === 'string')),
    paths: rec.paths,
    refs: rec.refs
  }
  cache.set(key, view)
  return view
}

function flushNow() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!dirty.size) return
  const keys = Array.from(dirty)
  dirty.clear()
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  } catch {
    /* 已存在 */
  }
  for (const key of keys) {
    const day = cache.get(key)
    if (!day) continue
    const payload = {
      pv: day.pv,
      uv: Array.from(day.uv),
      paths: day.paths,
      refs: day.refs
    }
    try {
      fs.writeFileSync(fileOf(key), JSON.stringify(payload))
    } catch (e) {
      dirty.add(key) // 写失败留着，下次再试
      console.warn('[stats] 写入失败:', key, e && e.message)
    }
  }
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushNow()
  }, FLUSH_DELAY)
  // 别让这个定时器把进程钉住（脚本化调用时）
  if (typeof flushTimer.unref === 'function') flushTimer.unref()
}

/** ---------- 清理旧数据 ---------- */
function listDayFiles() {
  try {
    return fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.endsWith('.json') && DATE_RE.test(f.slice(0, -5)))
      .map((f) => f.slice(0, -5))
      .sort()
  } catch {
    return []
  }
}

function pruneOld() {
  const oldest = dateKeyOffset(-(KEEP_DAYS - 1))
  for (const key of listDayFiles()) {
    if (key >= oldest) continue
    try {
      fs.unlinkSync(fileOf(key))
      cache.delete(key)
    } catch {
      /* 删不掉就留着，下次再试 */
    }
  }
}

/** ---------- 来源分类 ---------- */
function bucketRef(referrer, selfHost) {
  const raw = typeof referrer === 'string' ? referrer.trim() : ''
  if (!raw) return '直接访问'
  let host = ''
  try {
    host = new URL(raw).hostname.toLowerCase()
  } catch {
    return '直接访问'
  }
  if (!host) return '直接访问'
  if (selfHost && (host === selfHost || host === `www.${selfHost}` || selfHost === `www.${host}`)) return '站内'
  if (SEARCH_HOSTS.some((s) => host.includes(s))) return '搜索引擎'
  if (SOCIAL_HOSTS.some((s) => host.includes(s))) return '社交分享'
  return host.replace(/^www\./, '').slice(0, 60)
}

/** ---------- HTTP 工具 ---------- */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

function sendEmpty(res, status) {
  res.writeHead(status, { 'Cache-Control': 'no-store' })
  res.end()
}

function readBody(req, limit) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    let aborted = false
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        aborted = true
        req.destroy()
        resolve('')
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (!aborted) resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', () => resolve(''))
  })
}

/** ---------- 接口实现 ---------- */
async function handleCollect(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
  const raw = await readBody(req, MAX_BODY_BYTES)
  let body = {}
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    return sendJson(res, 400, { ok: false, error: 'bad json' })
  }
  const name = typeof body.n === 'string' && NAME_RE.test(body.n) ? body.n : 'other'
  const host = String(req.headers.host || '').split(':')[0].toLowerCase()
  const ref = bucketRef(body.r, host)
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim()
  const ua = String(req.headers['user-agent'] || '').slice(0, 200)

  const key = dayKey()
  const day = loadDay(key)
  day.pv += 1
  if (day.uv.size < MAX_UV_PER_DAY) day.uv.add(visitorHash(key, ip, ua))
  day.paths[name] = (day.paths[name] || 0) + 1
  day.refs[ref] = (day.refs[ref] || 0) + 1
  dirty.add(key)
  scheduleFlush()

  sendEmpty(res, 204)
}

function handleSummary(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
  flushNow()

  let days = Number(new URL(req.url, 'http://localhost').searchParams.get('days')) || 30
  days = Math.min(MAX_QUERY_DAYS, Math.max(1, Math.floor(days)))

  const keys = []
  for (let i = days - 1; i >= 0; i--) keys.push(dateKeyOffset(-i))

  // 区间 UV = 各天哈希并集（不是每日 UV 相加，相加会把回访者重复计数）
  const uvUnion = new Set()
  let rangePv = 0
  const paths = {}
  const refs = {}
  const series = []

  for (const key of keys) {
    const day = cache.has(key) ? cache.get(key) : loadDayIfExists(key)
    const pv = day ? day.pv : 0
    const uv = day ? day.uv.size : 0
    if (day) {
      rangePv += pv
      for (const h of day.uv) if (uvUnion.size < MAX_UV_PER_DAY * 4) uvUnion.add(h)
      for (const [k, n] of Object.entries(day.paths)) paths[k] = (paths[k] || 0) + n
      for (const [k, n] of Object.entries(day.refs)) refs[k] = (refs[k] || 0) + n
    }
    series.push({ date: key, pv, uv })
  }

  const today = series[series.length - 1] || { date: dayKey(), pv: 0, uv: 0 }
  const files = listDayFiles()

  sendJson(res, 200, {
    ok: true,
    today: { date: today.date, pv: today.pv, uv: today.uv },
    range: { days, pv: rangePv, uv: uvUnion.size },
    series,
    paths: topEntries(paths, 12),
    refs: topEntries(refs, 8),
    keepDays: KEEP_DAYS,
    since: files.length ? files[0] : null
  })
}

/** 只读已存在的日文件（查询时不无谓创建缓存条目） */
function loadDayIfExists(key) {
  if (!fs.existsSync(fileOf(key))) return null
  return loadDay(key)
}

function topEntries(map, n) {
  return Object.entries(map)
    .filter(([, v]) => num(v) > 0)
    .map(([key, count]) => ({ key, count: num(count) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, n)
}

/** 统一入口：由 serve-with-rewrites.cjs 调用 */
function handle(req, res, pathname) {
  try {
    if (pathname === '/api/stats/collect') return void handleCollect(req, res)
    if (pathname === '/api/stats/summary') return void handleSummary(req, res)
    return sendJson(res, 404, { ok: false, error: 'not found' })
  } catch (e) {
    console.warn('[stats] 处理失败:', e && e.message)
    try {
      sendJson(res, 500, { ok: false, error: 'internal' })
    } catch {
      /* 头已发出 */
    }
  }
}

// 启动即裁一次，之后每 6 小时一次（unref 不阻塞退出）
try {
  fs.mkdirSync(DATA_DIR, { recursive: true })
} catch {
  /* 建不了就等第一次写入时再试 */
}
pruneOld()
const pruneTimer = setInterval(pruneOld, 6 * 60 * 60 * 1000)
if (typeof pruneTimer.unref === 'function') pruneTimer.unref()

// flushNow 供独立服务（stats-only.cjs）在 SIGTERM 时补最后一次落盘
module.exports = { handle, flushNow, DATA_DIR, KEEP_DAYS }
