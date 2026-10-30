// 独立的「全网访问统计」服务（专给 Nginx 静态托管部署用）
//
// 用途：
//   线上（webTab.sh + nginx 托管 dist/）时，nginx 把 /api/stats/ 反代到本机
//   127.0.0.1:16723，由本进程承接：
//     POST /api/stats/collect   { n: 路由名, r: 来源 URL }  → 204
//     GET  /api/stats/summary?days=30                       → 聚合 JSON
//   真正的采集与聚合逻辑在 scripts/statsService.cjs（本文件只做 HTTP 壳），
//   同一份逻辑也被 scripts/serve-with-rewrites.cjs 内置（单进程部署/本地 npm run serve 用）。
//
// 为什么单独一个端口而不是塞进 WebDAV 代理：
//   与本项目 fetch-meta(16720) / wechat(16721) 的形态一致 —— 一个关注点一个进程，
//   任何一个挂掉/重启都不牵连其它接口。
//
// 启动：
//   node scripts/stats-only.cjs                 # 默认 127.0.0.1:16723
//   STATS_HOST=0.0.0.0 STATS_PORT=16723 node scripts/stats-only.cjs
//
// 建议 pm2 常驻（同机 Nginx 反代）：
//   pm2 start scripts/stats-only.cjs --name easy-web-stats
//
// Nginx 对应反代段（80 / 443 / 16718 三个 server 块都要加，缺一个就会在对应协议下 405）：
//   location /api/stats/ {
//       proxy_pass http://127.0.0.1:16723;
//       proxy_http_version 1.1;
//       proxy_set_header Host $host;
//       proxy_set_header X-Real-IP $remote_addr;
//       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
//       proxy_set_header X-Forwarded-Proto $scheme;
//       proxy_read_timeout 30s;
//   }
//
// 环境变量（均透传给 statsService.cjs）：
//   EWT_STATS_DIR       数据目录，默认 <repo>/data/stats
//   EWT_STATS_KEEP_DAYS 保留天数，默认 180
//   EWT_STATS_SALT      UV 哈希用盐，默认首次运行随机生成并落盘到 <dir>/.salt

const http = require('http')
const statsService = require('./statsService.cjs')

const HOST = process.env.STATS_HOST || '127.0.0.1'
const PORT = Number(process.env.STATS_PORT) || 16723

const ROUTES = new Set(['/api/stats/collect', '/api/stats/summary'])

function handle(req, res) {
  // 健康检查：便于 `curl 127.0.0.1:16723/healthz` 与 nginx 侧排查
  if (req.method === 'GET' && (req.url === '/healthz' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(
      JSON.stringify({
        ok: true,
        service: 'stats-only',
        time: Date.now(),
        dataDir: statsService.DATA_DIR,
        keepDays: statsService.KEEP_DAYS
      })
    )
    return
  }
  const pathname = String(req.url || '').split('?')[0]
  if (!ROUTES.has(pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')
    return
  }
  statsService.handle(req, res, pathname)
}

const server = http.createServer((req, res) => {
  try {
    handle(req, res)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[stats-only] top-level error:', err)
    try {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Internal Server Error')
    } catch {
      /* 头已发出 */
    }
  }
})

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error('')
    console.error(`[ERROR] 端口 ${PORT} 已被占用，统计服务无法启动。`)
    console.error(`  查占用：netstat -ano | findstr :${PORT}`)
    console.error(`  换端口：set STATS_PORT=${PORT + 1} && node scripts/stats-only.cjs`)
    console.error('')
    process.exit(1)
  }
  console.error('[ERROR] 统计服务异常：', (err && err.message) || err)
  process.exit(1)
})

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`\n✓ stats-only listening on http://${HOST}:${PORT}`)
  console.log(`  数据目录：${statsService.DATA_DIR}（保留 ${statsService.KEEP_DAYS} 天）`)
  console.log('  Configure Nginx:  location /api/stats/ { proxy_pass http://127.0.0.1:' + PORT + '; }\n')
})

// 落盘是 500ms 防抖：退出前补一次，避免最后几次访问丢掉
function shutdown() {
  try {
    statsService.flushNow()
  } catch {
    /* 忽略 */
  }
  server.close(() => process.exit(0))
  // 连接迟迟不关也别拖着，1s 后强退（数据已 flush）
  setTimeout(() => process.exit(0), 1000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
