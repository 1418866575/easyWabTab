// 微信公众号代理服务（常驻 Node，端口 16720）
//
// 职责（仅服务端，绝不经手前端 secret 明文回传）：
//   1. 凭证管理：保存/读取 AppID / AppSecret（落盘 config/wechat.env，gitignore，仅后端可读）
//   2. access_token 中控缓存（提前 5 分钟刷新，避免覆盖失效）
//   3. 图片上传：media/uploadimg（正文插图，返回微信图床 URL）
//   4. 封面上传：material/add_material?type=image（返回 media_id 作 thumb_media_id）
//   5. 草稿创建：draft/add
//
// 设计原则：
//   - 零额外依赖（Node 标准库）：multipart 手工构造、env 文件手工解析。
//   - 所有微信调用集中在后端，前端只提交已准备好的 data URL / 组装好的 HTML。
//   - /api/wechat/* 由 nginx 反代到本机 127.0.0.1:16720；dev 由 vite proxy 转发。
//
// 启动：
//   node scripts/wechat-proxy.cjs
//   WEBCHAT_HOST=127.0.0.1 WEBCHAT_PORT=16720 node scripts/wechat-proxy.cjs
//   pm2 start scripts/wechat-proxy.cjs --name easy-wechat-proxy
//
// 前置（用户侧）：
//   - 已认证公众号，拿到 AppID / AppSecret
//   - 公众号后台「基本配置 → IP 白名单」加入本机出口公网 IP（否则 40164/61004）

const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

const HOST = process.env.WEBCHAT_HOST || '127.0.0.1'
const PORT = Number(process.env.WEBCHAT_PORT) || 16720
const WX_HOST = 'api.weixin.qq.com'
const CONFIG_DIR = path.join(__dirname, '..', 'config')
const CONFIG_FILE = path.join(CONFIG_DIR, 'wechat.env')
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
// 凭证读取：优先级 process.env > config/wechat.env > 运行时覆盖
// process.env 命名：WECHAT_APPID / WECHAT_APPSECRET
// ---------------------------------------------------------------------------
let runtimeOverride = { appId: '', appSecret: '' }

function readConfigFile() {
  const out = { appId: '', appSecret: '' }
  try {
    const text = fs.readFileSync(CONFIG_FILE, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      if (key === 'WECHAT_APPID') out.appId = val
      if (key === 'WECHAT_APPSECRET') out.appSecret = val
    }
  } catch {
    // 文件不存在或不可读：返回空
  }
  return out
}

function writeConfigFile(appId, appSecret) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
    const content = `# easy-web-tab 微信公众号凭证（自动生成，请勿提交到 git）\nWECHAT_APPID=${appId}\nWECHAT_APPSECRET=${appSecret}\n`
    fs.writeFileSync(CONFIG_FILE, content, { mode: 0o600 })
    try { fs.chmodSync(CONFIG_FILE, 0o600) } catch { /* Windows 忽略 */ }
  } catch (e) {
    throw new WechatError('CONFIG_WRITE_FAIL', '凭证文件写入失败：' + e.message)
  }
}

function loadCredentials() {
  const file = readConfigFile()
  return {
    appId: process.env.WECHAT_APPID || runtimeOverride.appId || file.appId,
    appSecret: process.env.WECHAT_APPSECRET || runtimeOverride.appSecret || file.appSecret
  }
}

function maskAppId(appId) {
  if (!appId) return ''
  if (appId.length <= 8) return appId[0] + '****'
  return appId.slice(0, 4) + '****' + appId.slice(-4)
}

// ---------------------------------------------------------------------------
// access_token 中控缓存
// ---------------------------------------------------------------------------
let tokenCache = { token: null, expiresAt: 0 }

async function getAccessToken() {
  const now = Date.now()
  if (tokenCache.token && tokenCache.expiresAt > now) return tokenCache.token
  const { appId, appSecret } = loadCredentials()
  if (!appId || !appSecret) {
    throw new WechatError('CREDENTIAL_MISSING', '尚未配置 AppID / AppSecret')
  }
  const res = await wxRequest('GET',
    `/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`)
  if (res.body && res.body.access_token) {
    const ttl = (Number(res.body.expires_in) || 7200) * 1000
    tokenCache = { token: res.body.access_token, expiresAt: now + ttl - 300000 } // 提前 5 分钟
    return tokenCache.token
  }
  throw new WechatError(String(res.body?.errcode || 'WX_TOKEN_FAIL'), res.body?.errmsg || '获取 access_token 失败')
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
// 业务：图片 / 封面 / 草稿
// ---------------------------------------------------------------------------
async function uploadImage(dataUrl) {
  const { buf, mime } = dataUrlToBuffer(dataUrl)
  const token = await getAccessToken()
  const mp = buildMultipart('media', 'img.' + extOf(mime), mime, buf)
  const res = await wxRequest('POST', `/cgi-bin/media/uploadimg?access_token=${token}`,
    { bodyBuffer: mp.body, contentType: mp.contentType })
  if (res.body && res.body.url) return res.body.url
  throw new WechatError(String(res.body?.errcode || 'UPLOAD_IMG_FAIL'), res.body?.errmsg || '正文图片上传失败')
}

async function uploadCover(dataUrl) {
  const { buf, mime } = dataUrlToBuffer(dataUrl)
  const token = await getAccessToken()
  const mp = buildMultipart('media', 'cover.' + extOf(mime), mime, buf)
  const res = await wxRequest('POST', `/cgi-bin/material/add_material?access_token=${token}&type=image`,
    { bodyBuffer: mp.body, contentType: mp.contentType })
  if (res.body && res.body.media_id) return res.body.media_id
  throw new WechatError(String(res.body?.errcode || 'UPLOAD_COVER_FAIL'), res.body?.errmsg || '封面上传失败')
}

async function createDraft(article) {
  const token = await getAccessToken()
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

function maskSecret(configured) {
  return configured
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
    if (p === '/config') {
      if (req.method === 'GET') {
        const { appId, appSecret } = loadCredentials()
        sendJson(res, 200, {
          ok: true,
          configured: !!(appId && appSecret),
          appIdMasked: maskAppId(appId),
          appSecretConfigured: !!appSecret
        })
        return
      }
      if (req.method === 'POST') {
        const raw = await readBody(req)
        const { appId, appSecret } = raw ? JSON.parse(raw) : {}
        const cur = loadCredentials()
        const nextAppId = (appId != null && appId !== '') ? String(appId) : cur.appId
        const nextSecret = (appSecret != null && appSecret !== '') ? String(appSecret) : cur.appSecret

        if (!validateAppId(nextAppId)) {
          sendJson(res, 400, { ok: false, error: 'AppID 格式不正确（应为 16-32 位字母数字）' })
          return
        }
        if (nextSecret && !validateAppSecret(nextSecret)) {
          sendJson(res, 400, { ok: false, error: 'AppSecret 格式不正确（应为 32-64 位字母数字）' })
          return
        }

        // 落盘（仅在两者都齐全时写 secret；若用户只填了 appId，secret 沿用旧值）
        if (nextAppId && nextSecret) {
          writeConfigFile(nextAppId, nextSecret)
          runtimeOverride = { appId: nextAppId, appSecret: nextSecret }
        } else {
          // 只更新 appId 覆盖（secret 仍来自文件/env）
          runtimeOverride = { appId: nextAppId, appSecret: '' }
        }

        // 真实校验：尝试获取 token
        let tokenOk = false
        let wxError = null
        try {
          await getAccessToken()
          tokenOk = true
        } catch (e) {
          wxError = { code: e.code, message: e.message }
        }

        sendJson(res, tokenOk ? 200 : 200, {
          ok: tokenOk,
          configured: !!(nextAppId && nextSecret),
          appIdMasked: maskAppId(nextAppId),
          appSecretConfigured: !!nextSecret,
          ...(tokenOk
            ? { message: '凭证已保存并验证通过' }
            : { error: '凭证已保存，但微信校验未通过', wx: wxError })
        })
        return
      }
    }

    if (p === '/upload-img' && req.method === 'POST') {
      const { dataUrl } = JSON.parse(await readBody(req))
      const url = await uploadImage(dataUrl)
      sendJson(res, 200, { ok: true, url })
      return
    }

    if (p === '/upload-cover' && req.method === 'POST') {
      const { dataUrl } = JSON.parse(await readBody(req))
      const mediaId = await uploadCover(dataUrl)
      sendJson(res, 200, { ok: true, mediaId })
      return
    }

    if (p === '/draft' && req.method === 'POST') {
      const article = JSON.parse(await readBody(req))
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
      const mediaId = await createDraft(wxArticle)
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
  console.log('  Configure Nginx:  location /api/wechat { proxy_pass http://127.0.0.1:16720; }\n')
})
