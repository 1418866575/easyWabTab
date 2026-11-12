// 微信公众号代理服务（常驻 Node，端口 16721）
//
// ⚠️ 无状态多租户：本服务**不再**持有任何凭证，也不落盘 config/wechat.env。
// 每次业务请求（upload-img / upload-cover / draft / config 校验）都从请求体携带
// appId + appSecret，按 AppID 维度缓存 access_token，互不影响、互不串号。
// 凭证的"持久化"由前端负责（浏览器本地 + 随 blog.json 云同步信封同步），本服务只做微信调用中转。
//
// 职责：
//   1. access_token 中控缓存（按 appId 维度，提前 5 分钟刷新，避免覆盖失效）
//   2. 图片上传：media/uploadimg（正文插图，返回微信图床 URL）
//   3. 封面上传：material/add_material?type=image（返回 media_id 作 thumb_media_id）
//   4. 草稿创建：draft/add
//   5. /config 仅做格式 + liveness 校验（尝试取 token），不落盘
//   6. /egress-ip 探测本机**出站**公网 IP + 10 分钟缓存（公众号 IP 白名单要填的就是它）
//
// 设计原则：
//   - 零额外依赖（Node 标准库）：multipart 手工构造、token 缓存用 crypto 哈希做 key。
//   - 所有微信调用集中在后端，前端只提交已准备好的 data URL / 组装好的 HTML。
//   - /api/wechat/* 由 nginx 反代到本机 127.0.0.1:16721；dev 由 vite proxy 转发。
//
// 启动：
//   node scripts/wechat-proxy.cjs
//   WEBCHAT_HOST=127.0.0.1 WEBCHAT_PORT=16721 node scripts/wechat-proxy.cjs
//   pm2 start scripts/wechat-proxy.cjs --name easy-wechat-proxy
//
// 前置（用户侧）：
//   - 已认证公众号，拿到 AppID / AppSecret
//   - 公众号后台「基本配置 → IP 白名单」加入本机出口公网 IP（否则 40164/61004）；
//     该 IP 可用 GET /api/wechat/egress-ip 查询，前端设置页会直接展示并支持复制

const http = require('http')
const https = require('https')
const crypto = require('crypto')

const HOST = process.env.WEBCHAT_HOST || '127.0.0.1'
const PORT = Number(process.env.WEBCHAT_PORT) || 16721
const WX_HOST = 'api.weixin.qq.com'
const MAX_BODY = 12 * 1024 * 1024 // 单请求上限 12MB（封面/正文图可能几 MB）

// ---------------------------------------------------------------------------
// 错误类型：携带微信 errcode，便于前端给出明确反馈
//   egressIp  : IP 白名单类错误（40164/61004）下从 errmsg 里解析出的**调用方出口 IP**
//   wxErrmsg  : 微信原始英文 errmsg，保留给前端做细节展示/排查
// ---------------------------------------------------------------------------
const WHITELIST_CODES = new Set(['40164', '61004'])
const IPV4_RE = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/

class WechatError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.code = code
    this.egressIp = extra.egressIp || ''
    this.wxErrmsg = extra.wxErrmsg || ''
  }
}

/**
 * 从微信 errmsg 里抠出调用方 IP。
 * 微信 40164 的原文形如：
 *   invalid ip 1.2.3.4 ipv6 ::ffff:1.2.3.4, not in whitelist rid: 65e0...
 * 优先取 "invalid ip" 后面那一个（IPv4），退化时取首个 IPv4 段。
 */
function pickIpFromErrmsg(msg) {
  const s = String(msg || '')
  const named = /(?:invalid ip|ipv4)\s+(\d{1,3}(?:\.\d{1,3}){3})/i.exec(s)
  const hit = named ? named[1] : (IPV4_RE.exec(s) || [])[1] || ''
  // 0.0.0.0 / 回环不是可用的白名单目标，宁可空着交给前端展示通用文案
  if (!hit || hit === '0.0.0.0' || hit.startsWith('127.')) return ''
  return hit
}

/**
 * 微信接口返回体 → 错误对象。
 * IP 白名单类错误额外把 IP 提取出来，并给出**中文可操作**文案，
 * 前端可直接展示 + 一键复制（常见于「别人部署的服务器 IP 我不知道」的场景）。
 */
function toWxError(body, fallbackMessage) {
  const code = String((body && body.errcode) || 'WX_API_FAIL')
  const errmsg = String((body && body.errmsg) || fallbackMessage || '微信接口调用失败')
  if (WHITELIST_CODES.has(code)) {
    const ip = pickIpFromErrmsg(errmsg)
    const message = ip
      ? `服务器出口 IP ${ip} 不在该公众号的 IP 白名单中，请到公众号后台「设置与开发 → 基本配置 → IP 白名单」添加后重试（微信 ${code}）`
      : `调用方 IP 不在该公众号的 IP 白名单中，请到公众号后台「设置与开发 → 基本配置 → IP 白名单」添加本服务器出口 IP 后重试（微信 ${code}）`
    return new WechatError(code, message, { egressIp: ip, wxErrmsg: errmsg })
  }
  // 正文类违规微信只回 "invalid content hint: [...] rid: ..."，没有任何可用线索。
  // 换成中文并带上 errcode，方便和前端本地自检的结果对照。
  if (/invalid content/i.test(errmsg)) {
    const message = `微信 ${code}：正文内容不被接受（invalid content）。常见原因：正文超过 2 万字符或 1MB、含非微信图床的外链图片、或被判定含非法标签/JS。请先按编辑器底部「发布自检」的提示处理；若自检全部通过，可精简正文或减少插图后重试。`
    return new WechatError(code, message, { wxErrmsg: errmsg })
  }
  return new WechatError(code, `微信 ${code}：${errmsg}`, { wxErrmsg: errmsg })
}

// ---------------------------------------------------------------------------
// access_token 中控缓存（按 appId 维度，避免多用户互相覆盖）
// key = appId + ':' + sha256(secret) 前 16 位（仅用于区分缓存槽，不暴露明文）
// ---------------------------------------------------------------------------
const tokenCache = new Map() // key -> { token, expiresAt }

function secretHash(appSecret) {
  return crypto.createHash('sha256').update(appSecret).digest('hex').slice(0, 16)
}

function cacheKey(appId, appSecret) {
  return `${appId}:${secretHash(appSecret)}`
}

async function getAccessToken(appId, appSecret) {
  if (!appId || !appSecret) {
    throw new WechatError('CREDENTIAL_MISSING', '缺少 AppID / AppSecret')
  }
  const key = cacheKey(appId, appSecret)
  const now = Date.now()
  const hit = tokenCache.get(key)
  if (hit && hit.token && hit.expiresAt > now) return hit.token

  const res = await wxRequest('GET',
    `/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`)
  if (res.body && res.body.access_token) {
    const ttl = (Number(res.body.expires_in) || 7200) * 1000
    const entry = { token: res.body.access_token, expiresAt: now + ttl - 300000 } // 提前 5 分钟
    tokenCache.set(key, entry)
    return entry.token
  }
  throw toWxError(res.body, '获取 access_token 失败')
}

function maskAppId(appId) {
  if (!appId) return ''
  if (appId.length <= 8) return appId[0] + '****'
  return appId.slice(0, 4) + '****' + appId.slice(-4)
}

// ---------------------------------------------------------------------------
// 通用微信 HTTPS 请求
// ---------------------------------------------------------------------------
function wxRequest(method, apiPath, { json, bodyBuffer, contentType } = {}) {
  const data = json ? Buffer.from(JSON.stringify(json), 'utf8') : bodyBuffer
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: WX_HOST,
      port: 443,
      path: apiPath,
      method,
      headers: {
        'Content-Type': contentType || (json ? 'application/json' : 'application/octet-stream'),
        'Content-Length': data ? data.length : 0
      }
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        let parsed = null
        try { parsed = JSON.parse(buf.toString('utf8')) } catch { /* 非 JSON */ }
        resolve({ status: res.statusCode, body: parsed, raw: buf.toString('utf8') })
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

// ---------------------------------------------------------------------------
// multipart/form-data 手工构造（单个文件字段）
// ---------------------------------------------------------------------------
function buildMultipart(fieldName, filename, contentType, fileBuffer) {
  const boundary = '----WeChatProxyBoundary' + Date.now().toString(36)
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return {
    body: Buffer.concat([head, fileBuffer, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`
  }
}

function dataUrlToBuffer(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '')
  if (!m) throw new WechatError('BAD_DATAURL', '图片不是合法的 data URL')
  const mime = m[1]
  if (!/^image\/(png|jpeg|jpg|gif|bmp|webp|avif)$/.test(mime)) {
    throw new WechatError('BAD_IMAGE_TYPE', '图片类型不支持（微信仅收 jpg/png，webp/avif 需先在前端转码）')
  }
  return { buf: Buffer.from(m[2], 'base64'), mime }
}

function extOf(mime) {
  return mime === 'image/png' ? 'png' : mime === 'image/gif' ? 'gif' : mime === 'image/bmp' ? 'bmp' : 'jpg'
}

// ---------------------------------------------------------------------------
// 业务：图片 / 封面 / 草稿（均带 appId + appSecret，由调用方从请求体透传）
// ---------------------------------------------------------------------------
async function uploadImage(dataUrl, appId, appSecret) {
  const { buf, mime } = dataUrlToBuffer(dataUrl)
  const token = await getAccessToken(appId, appSecret)
  const mp = buildMultipart('media', 'img.' + extOf(mime), mime, buf)
  const res = await wxRequest('POST', `/cgi-bin/media/uploadimg?access_token=${token}`,
    { bodyBuffer: mp.body, contentType: mp.contentType })
  if (res.body && res.body.url) return res.body.url
  throw toWxError(res.body, '正文图片上传失败')
}

async function uploadCover(dataUrl, appId, appSecret) {
  const { buf, mime } = dataUrlToBuffer(dataUrl)
  const token = await getAccessToken(appId, appSecret)
  const mp = buildMultipart('media', 'cover.' + extOf(mime), mime, buf)
  const res = await wxRequest('POST', `/cgi-bin/material/add_material?access_token=${token}&type=image`,
    { bodyBuffer: mp.body, contentType: mp.contentType })
  if (res.body && res.body.media_id) return res.body.media_id
  throw toWxError(res.body, '封面上传失败')
}

async function createDraft(article, appId, appSecret) {
  const token = await getAccessToken(appId, appSecret)
  const res = await wxRequest('POST', `/cgi-bin/draft/add?access_token=${token}`,
    { json: { articles: [article] } })
  if (res.body && res.body.media_id) return res.body.media_id
  throw toWxError(res.body, '草稿创建失败')
}

// ---------------------------------------------------------------------------
// 凭证格式校验
// ---------------------------------------------------------------------------
function validateAppId(appId) {
  return /^[a-zA-Z0-9]{16,32}$/.test(appId)
}
function validateAppSecret(appSecret) {
  return /^[a-zA-Z0-9]{32,64}$/.test(appSecret)
}

// ---------------------------------------------------------------------------
// 出口 IP 探测
//
// 公众号 IP 白名单要填的是本机**出站**公网 IP —— 只有部署者知道，
// 站点其它使用者在自己的公众号后台配置时无从得知，于是发布就报 40164。
// 这里由服务端代查并返回，前端设置页直接展示 + 一键复制。
//
// 实现要点：
//   - 多源兜底（国内源优先），任一成功即返回；
//   - 优先 family=4（白名单填的就是 IPv4），IPv4 全部失败时再试默认族；
//   - 整体 9s 软截止，避免设置页被慢网络拖住；
//   - 结果缓存 10 分钟，`?refresh=1` 强制刷新。
// ---------------------------------------------------------------------------
const EGRESS_TTL = 10 * 60 * 1000
/** 强制刷新最小间隔：防止被脚本反复刷成"对外打外部回显服务"的放大器 */
const EGRESS_MIN_REFRESH = 30 * 1000
let egressCache = { ip: '', source: '', at: 0 }
/** 并发去重：同一时刻只跑一次探测，其余请求复用同一个 Promise */
let egressInflight = null

const EGRESS_SOURCES = [
  { name: 'ipip.net', url: 'https://myip.ipip.net/', parse: (t) => (IPV4_RE.exec(t) || [])[1] || '' },
  { name: 'ip-api.com', url: 'http://ip-api.com/json/?fields=query', parse: (t) => { try { return String(JSON.parse(t).query || '') } catch { return '' } } },
  { name: 'ipify.org', url: 'https://api.ipify.org?format=json', parse: (t) => { try { return String(JSON.parse(t).ip || '') } catch { return '' } } },
  { name: 'ifconfig.co', url: 'https://ifconfig.co/json', parse: (t) => { try { return String(JSON.parse(t).ip || '') } catch { return '' } } }
]

/** 极简 GET 文本（零依赖，跟随一次 30x，超时/大小都设上限） */
function httpGetText(rawUrl, { timeout = 3000, family } = {}) {
  return new Promise((resolve, reject) => {
    let u
    try {
      u = new URL(rawUrl)
    } catch (e) {
      reject(e)
      return
    }
    const mod = u.protocol === 'http:' ? http : https
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'easy-web-tab-egress-probe',
        Accept: 'application/json, text/plain, */*'
      },
      ...(family ? { family } : {})
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        let next
        try {
          next = new URL(res.headers.location, rawUrl).href
        } catch (e) {
          reject(e)
          return
        }
        httpGetText(next, { timeout, family }).then(resolve, reject)
        return
      }
      const chunks = []
      let total = 0
      res.on('data', (c) => {
        total += c.length
        if (total <= 65536) chunks.push(c)
      })
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
    req.setTimeout(timeout, () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.end()
  })
}

async function probeEgressIp() {
  const tried = []
  const deadline = Date.now() + 9000
  for (const family of [4, 0]) {
    for (const src of EGRESS_SOURCES) {
      if (Date.now() > deadline) return { ip: '', source: '', tried }
      try {
        const text = await httpGetText(src.url, { timeout: 3000, family: family || undefined })
        const ip = String(src.parse(text) || '').trim()
        if (IPV4_RE.test(ip) && ip !== '0.0.0.0') return { ip, source: src.name, tried }
        tried.push(`${src.name}: 响应中未找到 IPv4`)
      } catch (e) {
        tried.push(`${src.name}: ${String((e && e.message) || e)}`)
      }
    }
  }
  return { ip: '', source: '', tried }
}

// ---------------------------------------------------------------------------
// HTTP 处理
// ---------------------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (c) => {
      total += c.length
      if (total > MAX_BODY) {
        reject(new WechatError('BODY_TOO_LARGE', '请求体过大'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8') || ''))
    req.on('error', reject)
  })
}

function sendJson(res, status, obj) {
  const text = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(text)
}

async function handle(req, res) {
  const u = new URL(req.url, 'http://localhost')
  let p = u.pathname
  if (p.startsWith('/api/wechat')) p = p.slice('/api/wechat'.length) || '/'

  // 健康检查
  if (req.method === 'GET' && (p === '/healthz' || p === '/')) {
    sendJson(res, 200, { ok: true, service: 'wechat-proxy', time: Date.now() })
    return
  }

  try {
    // /egress-ip：本服务器出口公网 IP（公众号 IP 白名单要填的就是它）
    if (p === '/egress-ip' && req.method === 'GET') {
      const refresh = u.searchParams.get('refresh') === '1'
      const age = Date.now() - egressCache.at
      const fresh = !!egressCache.ip && age < EGRESS_TTL
      // 缓存命中，或强制刷新但距上次成功探测不足 EGRESS_MIN_REFRESH → 直接复用
      if (fresh && (!refresh || age < EGRESS_MIN_REFRESH)) {
        sendJson(res, 200, {
          ok: true,
          ip: egressCache.ip,
          source: egressCache.source,
          cached: true,
          throttled: refresh && age < EGRESS_MIN_REFRESH,
          at: egressCache.at
        })
        return
      }
      if (!egressInflight) {
        egressInflight = probeEgressIp()
        // 无论成功失败都要释放，否则一次异常会把探测口彻底堵死
        egressInflight.then(() => { egressInflight = null }, () => { egressInflight = null })
      }
      const r = await egressInflight
      if (r.ip) {
        egressCache = { ip: r.ip, source: r.source, at: Date.now() }
        sendJson(res, 200, { ok: true, ip: r.ip, source: r.source, cached: false, at: egressCache.at })
      } else {
        // 探测失败不算接口错误：前端按 ok:false 展示软提示，不影响凭证保存
        sendJson(res, 200, {
          ok: false,
          error: '未能探测到服务器出口 IP（外网回显服务均不可达），请让使用者在部署机上执行 curl ifconfig.me 获取',
          tried: r.tried.slice(0, 6)
        })
      }
      return
    }

    // /config：客户端自管理凭证，本服务只做校验，不落盘
    if (p === '/config') {
      if (req.method === 'GET') {
        // 告知前端：凭证由客户端管理（浏览器本地 + 云同步），服务端无状态
        sendJson(res, 200, { ok: true, clientManaged: true })
        return
      }
      if (req.method === 'POST') {
        const raw = await readBody(req)
        const { appId, appSecret } = raw ? JSON.parse(raw) : {}

        if (!validateAppId(String(appId || ''))) {
          sendJson(res, 400, { ok: false, error: 'AppID 格式不正确（应为 16-32 位字母数字）' })
          return
        }
        if (!validateAppSecret(String(appSecret || ''))) {
          sendJson(res, 400, { ok: false, error: 'AppSecret 格式不正确（应为 32-64 位字母数字）' })
          return
        }

        // liveness 校验：尝试用该凭证取 token（不发往微信的字段不做持久化）
        let tokenOk = false
        let wxError = null
        let egressIp = ''
        let whitelistHit = false
        try {
          await getAccessToken(String(appId), String(appSecret))
          tokenOk = true
        } catch (e) {
          egressIp = e.egressIp || ''
          whitelistHit = WHITELIST_CODES.has(String(e.code || ''))
          wxError = { code: String(e.code || ''), message: e.message, errmsg: e.wxErrmsg || e.message }
        }

        sendJson(res, 200, {
          ok: tokenOk,
          clientManaged: true,
          configured: true,
          appIdMasked: maskAppId(String(appId)),
          appSecretConfigured: true,
          ...(tokenOk
            ? { message: '凭证有效（已通过微信校验）' }
            : {
                // 白名单类错误直接用（已含 IP 的中文）文案；其余错误给通用提示 + 原始 errmsg
                error: whitelistHit || egressIp
                  ? wxError.message
                  : '凭证格式正确，但微信校验未通过（请检查 AppSecret 是否正确，或该服务器出口 IP 是否已加入公众号 IP 白名单）',
                ...(egressIp ? { egressIp } : {}),
                wx: wxError
              })
        })
        return
      }
    }

    if (p === '/upload-img' && req.method === 'POST') {
      const { dataUrl, appId, appSecret } = JSON.parse(await readBody(req))
      const url = await uploadImage(dataUrl, appId, appSecret)
      sendJson(res, 200, { ok: true, url })
      return
    }

    if (p === '/upload-cover' && req.method === 'POST') {
      const { dataUrl, appId, appSecret } = JSON.parse(await readBody(req))
      const mediaId = await uploadCover(dataUrl, appId, appSecret)
      sendJson(res, 200, { ok: true, mediaId })
      return
    }

    if (p === '/draft' && req.method === 'POST') {
      const article = JSON.parse(await readBody(req))
      const { appId, appSecret } = article
      // 兼容前端 camelCase 与微信 snake_case 两种命名
      const thumbMediaId = article?.thumbMediaId || article?.thumb_media_id
      // 基础字段校验（微信侧还会再校验）
      if (!article || !article.title || !article.content || !thumbMediaId) {
        sendJson(res, 400, { ok: false, error: '缺少必填字段（title / content / thumbMediaId）' })
        return
      }
      // 微信官方硬约束（api_draft_add.html）：title ≤32 字 / author ≤16 字 / digest ≤120 字。
      // 旧代码把 title 截到 64 字，超 32 字的标题会被微信整篇拒掉（invalid content 类错误）。
      // 前端 wechatContentCore 会先自检并给中文提示，这里只做防御性截断（按码点算，不切坏 emoji）。
      const take = (v, n) => Array.from(String(v || '')).slice(0, n).join('')
      const contentStr = String(article.content)
      // content 必须少于 2 万字符、小于 1MB；图片 URL 必须来自 uploadimg，外链会被过滤。
      // 前端已有完整自检，这里是最小防御，避免旧版前端 / 直接调用把违规内容送去微信。
      const contentChars = Array.from(contentStr).length
      const contentBytes = Buffer.byteLength(contentStr, 'utf8')
      if (contentChars >= 20000 || contentBytes >= 1024 * 1024) {
        sendJson(res, 400, {
          ok: false,
          code: 'CONTENT_TOO_LARGE',
          error: `正文 HTML ${contentChars} 字符 / ${Math.round(contentBytes / 1024)} KB，超过微信草稿箱上限（2 万字符、1MB）。请精简正文或减少插图后重试`
        })
        return
      }
      const foreignImgs = [...contentStr.matchAll(/<img\b[^>]*?\s+src\s*=\s*["']?([^"'\s>]+)/gi)]
        .map((m) => m[1])
        .filter((u) => !/^https?:\/\/(?:[a-z0-9-]+\.)*(?:mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn|res\.wx\.qq\.com)\//i.test(u))
      if (foreignImgs.length > 0) {
        sendJson(res, 400, {
          ok: false,
          code: 'FOREIGN_IMAGE',
          error: `正文含 ${foreignImgs.length} 张非微信图床图片（${foreignImgs[0].slice(0, 60)}…），微信会过滤外部图片并拒绝草稿。请把外链图下载后在编辑器重新插入`
        })
        return
      }
      // 组装微信草稿文章：仅保留微信认可的字段，键名统一用下划线形式
      const wxArticle = {
        title: take(article.title, 32),
        author: take(article.author, 16),
        digest: take(article.digest, 120),
        content: contentStr,
        thumb_media_id: thumbMediaId,
        show_cover_pic: article.showCoverPic === false ? 0 : 1,
        need_open_comment: 0,
        only_fans_can_comment: 0
      }
      const mediaId = await createDraft(wxArticle, appId, appSecret)
      sendJson(res, 200, { ok: true, mediaId })
      return
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    sendJson(res, 404, { ok: false, error: 'Not Found' })
  } catch (e) {
    const code = e.code || 'INTERNAL'
    const status = code === 'BODY_TOO_LARGE' ? 413 : 500
    // 微信常见 errcode 直接透传给前端；白名单类错误附带已解析出的出口 IP
    sendJson(res, status, {
      ok: false,
      code,
      error: e.message,
      ...(e.egressIp ? { egressIp: e.egressIp } : {})
    })
  }
}

const server = http.createServer((req, res) => {
  Promise.resolve(handle(req, res)).catch((err) => {
    try { sendJson(res, 500, { ok: false, code: 'TOP', error: String(err?.message || err) }) } catch { /* noop */ }
  })
})

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`\n✓ wechat-proxy listening on http://${HOST}:${PORT}`)
  console.log('  Configure Nginx:  location /api/wechat { proxy_pass http://127.0.0.1:16721; }\n')
})
