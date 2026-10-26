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
//   - 公众号后台「基本配置 → IP 白名单」加入本机出口公网 IP（否则 40164/61004）

const http = require('http')
const https = require('https')
const crypto = require('crypto')

const HOST = process.env.WEBCHAT_HOST || '127.0.0.1'
const PORT = Number(process.env.WEBCHAT_PORT) || 16721
const WX_HOST = 'api.weixin.qq.com'
const MAX_BODY = 12 * 1024 * 1024 // 单请求上限 12MB（封面/正文图可能几 MB）

// ---------------------------------------------------------------------------
// 错误类型：携带微信 errcode，便于前端给出明确反馈
// ---------------------------------------------------------------------------
class WechatError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
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
  throw new WechatError(String(res.body?.errcode || 'WX_TOKEN_FAIL'), res.body?.errmsg || '获取 access_token 失败')
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
  throw new WechatError(String(res.body?.errcode || 'UPLOAD_IMG_FAIL'), res.body?.errmsg || '正文图片上传失败')
}

async function uploadCover(dataUrl, appId, appSecret) {
  const { buf, mime } = dataUrlToBuffer(dataUrl)
  const token = await getAccessToken(appId, appSecret)
  const mp = buildMultipart('media', 'cover.' + extOf(mime), mime, buf)
  const res = await wxRequest('POST', `/cgi-bin/material/add_material?access_token=${token}&type=image`,
    { bodyBuffer: mp.body, contentType: mp.contentType })
  if (res.body && res.body.media_id) return res.body.media_id
  throw new WechatError(String(res.body?.errcode || 'UPLOAD_COVER_FAIL'), res.body?.errmsg || '封面上传失败')
}

async function createDraft(article, appId, appSecret) {
  const token = await getAccessToken(appId, appSecret)
  const res = await wxRequest('POST', `/cgi-bin/draft/add?access_token=${token}`,
    { json: { articles: [article] } })
  if (res.body && res.body.media_id) return res.body.media_id
  throw new WechatError(String(res.body?.errcode || 'DRAFT_FAIL'), res.body?.errmsg || '草稿创建失败')
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
        try {
          await getAccessToken(String(appId), String(appSecret))
          tokenOk = true
        } catch (e) {
          wxError = { code: e.code, message: e.message }
        }

        sendJson(res, 200, {
          ok: tokenOk,
          clientManaged: true,
          configured: true,
          appIdMasked: maskAppId(String(appId)),
          appSecretConfigured: true,
          ...(tokenOk
            ? { message: '凭证有效（已通过微信校验）' }
            : { error: '凭证格式正确，但微信校验未通过（请检查 AppSecret 与 IP 白名单）', wx: wxError })
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
      // 组装微信草稿文章：仅保留微信认可的字段，键名统一用下划线形式
      // 标题硬上限 64 字、摘要 120 字（超出会被微信拒绝 45008，这里提前截断避免整篇失败）
      const wxArticle = {
        title: String(article.title).slice(0, 64),
        author: String(article.author || '').slice(0, 16),
        digest: String(article.digest || '').slice(0, 120),
        content: String(article.content),
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
    // 微信常见 errcode 直接透传给前端
    sendJson(res, status, { ok: false, code, error: e.message })
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
