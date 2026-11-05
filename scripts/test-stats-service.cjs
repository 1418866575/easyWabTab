#!/usr/bin/env node
/**
 * statsService.cjs 回归：今日 KPI 只统计导航首页，其余维度保持全站；老日文件向后兼容。
 * 用法：node scripts/test-stats-service.cjs
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ewt-stats-'))
process.env.EWT_STATS_DIR = dir
delete process.env.EWT_STATS_SALT
const service = require('./statsService.cjs')

function call(method, pathname, body, headers = {}) {
  return new Promise((resolve) => {
    const req = new EventEmitter()
    req.method = method
    req.url = pathname
    req.headers = { host: 'localhost', 'user-agent': 'test-agent', ...headers }
    req.socket = { remoteAddress: '127.0.0.1' }
    const res = {
      status: 0,
      writeHead(status) { this.status = status },
      end(payload) { resolve({ status: this.status, data: payload ? JSON.parse(payload) : null }) }
    }
    // 生产环境由 serve-with-rewrites.cjs 传入不含查询串的 pathname
    service.handle(req, res, pathname.split('?')[0])
    process.nextTick(() => {
      if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
      req.emit('end')
    })
  })
}

const collect = (name, ip) =>
  call('POST', '/api/stats/collect', { n: name, r: '' }, { 'x-real-ip': ip, 'user-agent': `ua-${ip}` })

function offsetKey(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function main() {
  // 首页 3 次（2 个不同访客）+ 其它路由 2 次（其中 1 个访客与 toolbox 共用）
  await collect('home', '1.1.1.1')
  await collect('home', '1.1.1.1')
  await collect('home', '2.2.2.2')
  await collect('workbench', '3.3.3.3')
  await collect('toolbox', '3.3.3.3')

  const first = (await call('GET', '/api/stats/summary?days=7')).data
  assert.equal(first.ok, true)
  assert.equal(first.today.pv, 3, '今日 PV 只算导航首页')
  assert.equal(first.today.uv, 2, '今日 UV 只算导航首页访客')
  assert.equal(first.range.pv, 5, '区间仍为全站')
  assert.equal(first.series.at(-1).pv, 5, '趋势末柱仍为全站')
  assert.equal(first.series.at(-1).uv, 3, '趋势末柱 UV 仍为全站')
  assert.equal(first.paths.find((p) => p.key === 'home').count, 3, '页面排行仍为全站')

  // 老格式日文件（无 uvByPath）不应让汇总崩溃，历史 PV/UV 仍按原样进趋势
  fs.writeFileSync(
    path.join(dir, `${offsetKey(-1)}.json`),
    JSON.stringify({ pv: 9, uv: ['a', 'b'], paths: { home: 4, blog: 5 }, refs: { 直接访问: 9 } })
  )
  const second = (await call('GET', '/api/stats/summary?days=7')).data
  assert.equal(second.ok, true)
  assert.equal(second.series.at(-2).pv, 9, '老数据 PV 仍进趋势')
  assert.equal(second.series.at(-2).uv, 2, '老数据 UV 仍进趋势')
  assert.equal(second.today.pv, 3, '老数据不影响今日口径')
  assert.equal(second.today.uv, 2, '老数据不影响今日口径')

  // 落盘结构含 uvByPath，重启后仍可读出首页访客
  service.flushNow()
  const saved = JSON.parse(fs.readFileSync(path.join(dir, `${offsetKey(0)}.json`), 'utf8'))
  assert.equal(saved.uvByPath.home.length, 2)
  assert.equal(saved.pv, 5)

  console.log('✓ statsService：今日首页口径 / 全站其它维度 / 老文件兼容 / 落盘结构')
}

main()
  .then(() => {
    service.flushNow()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  .catch((e) => {
    service.flushNow()
    fs.rmSync(dir, { recursive: true, force: true })
    console.error(e)
    process.exitCode = 1
  })
