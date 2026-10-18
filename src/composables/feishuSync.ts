/**
 * 飞书多维表格（Bitable）云同步传输层（方案 B：每个 IDB store 一张同名表）
 *
 * 设计要点（详见 docs/feishu-cloud-sync/技术文档.md §2.4）：
 *   - 每个参与同步的 IDB object store ↔ 一张**同名**飞书表；单记录 store 在表里占一行
 *     `key='items'`，多记录 store（nav）按真实键占多行。表名/行键与浏览器 IndexedDB 逐字一致。
 *   - 每张表统一 7 列：`key / value / part / clientId / updatedAt / syncedAt / channel`
 *     （无 `store` 列——表名已表达）。upsert 主键 = `key`，靠「读全表→内存比对」实现，
 *     不依赖飞书唯一索引；超大值分片时 `key` 变为 `key#pN`，`part` 记序号。
 *   - **删除按表隔离**：推某个 store 只删该表里本地已不存在的行，不可能误删其他模块。
 *   - 数据源地址只需给出 app_token：`/wiki/<nodeToken>` 或 `/base/<appToken>`；
 *     `?table=` 可省略（方案 B 下表名由 store 决定）。
 *   - 渠道由 useCloudSync 在入口处按 settings.cloudSyncChannel 分流，本模块只负责飞书传输。
 *   - 凭据（App ID/Secret/数据源 URL）仅来自本机 settings，绝不回写云端、绝不进入提交。
 */
import {
  idbGet,
  idbGetAllEntries,
  idbPut,
  idbPutKey,
  IDB_CORE_STORES,
  IDB_STUDENT_STORES,
  IDB_ICONS_STORES,
  IDB_TEACHER_STORES,
  IDB_NAV_STORES,
  IDB_TOOLBOX_STORES
} from './useIdb'
import { inScope, FEISHU_SYNC_STORES, type ModuleScope } from './moduleSyncCore'

// 飞书同步只需这三个字段（凭据仅本机，绝不进同步数据流）；用窄接口避免传入整个 settings store
interface FeishuSyncParams {
  cloudSyncFeishuAppId?: string
  cloudSyncFeishuAppSecret?: string
  cloudSyncFeishuDatasourceUrl?: string
}

// 飞书本机客户端 ID（与 useCloudSync 内 CLIENT_ID_KEY 同一把，用于跨设备冲突识别）
const CLIENT_ID_KEY = 'easy-web-tab-client-id'

// 不参与云同步的 IDB object store（Blob / 纯本地 / 设备级）
const EXCLUDED_STORES = new Set<string>(['student_images', 'snapshots', 'iconcache', 'books', 'navmeta'])

// 单记录 store（在对应飞书表里占一行 key='items'）；settings 特殊处理（剥离 cloudSync*）
const SINGLE_STORES: string[] = [
  ...IDB_CORE_STORES,
  ...IDB_STUDENT_STORES.filter((s) => !EXCLUDED_STORES.has(s)),
  ...IDB_ICONS_STORES,
  ...IDB_TEACHER_STORES,
  ...IDB_TOOLBOX_STORES,
  'blog'
]

// 多记录 store（按真实键占多行）：仅 nav
const MULTI_STORES: string[] = [...IDB_NAV_STORES]

// settings 同步时需保留本机的云同步字段（凭据/渠道不该跨设备覆盖）
const CLOUD_SYNC_KEYS = [
  'cloudSyncEnabled',
  'cloudSyncUrl',
  'cloudSyncUsername',
  'cloudSyncPassword',
  'cloudSyncInterval',
  'cloudSyncSilentThreshold',
  'cloudSyncAutoPush',
  'cloudSyncChannel',
  'cloudSyncFeishuAppId',
  'cloudSyncFeishuAppSecret',
  'cloudSyncFeishuDatasourceUrl'
]

// Bitable 文本字段单格上限约 10 万字符，但飞书按 UTF-8 字节校验：
// 中文 1 字 = 3 字节，9 万字符的中文块 ≈ 27 万字节，会触发 TooLargeCell(1254130)。
// 故按字节切分，阈值取 5 万字节（留出一倍余量，任何编码下都稳低于 10 万上限）。
const MAX_CELL_BYTES = 50_000

interface FeishuField {
  field_name: string
  type: number
}
// 方案 B 每张表的列（key 放第一位，建表时会成为主列）
const TABLE_FIELDS: FeishuField[] = [
  { field_name: 'key', type: 1 }, // 文本：IDB 记录键；分片时为 key#pN（upsert 主键）
  { field_name: 'value', type: 1 }, // 多行文本：JSON / 原始字符串
  { field_name: 'part', type: 2 }, // 数字：分片序号（0 = 未分片）
  { field_name: 'clientId', type: 1 }, // 文本：写入设备 ID
  { field_name: 'updatedAt', type: 5 }, // 日期（13 位毫秒）
  { field_name: 'syncedAt', type: 5 }, // 日期
  { field_name: 'channel', type: 1 } // 文本：写入渠道
]

interface FeishuRecord {
  record_id: string
  fields: Record<string, unknown>
}

interface FeishuTable {
  table_id: string
  name: string
  /** 表 revision：记录每次插/改/删都会 +1，用于判定「远端是否变过」 */
  revision?: number
}

function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY)
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : 'cid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
    localStorage.setItem(CLIENT_ID_KEY, id)
  }
  return id
}

/**
 * 由「数据源链接里的域名」映射开放平台 API 主机。
 * ⚠️ 关键：`xxx.feishu.cn` 这类自定义域名只是前端展示域，直连其 `/open-apis` 会被
 * 302 重定向（返回 HTML 而非 JSON）导致鉴权失败——必须走 `open.feishu.cn`；
 * 国际版租户（larksuite.com）同理走 `open.larksuite.com`。
 */
function apiBase(domain: string): string {
  const host = (domain || '').toLowerCase()
  if (host === 'larksuite.com' || host.endsWith('.larksuite.com')) {
    return 'https://open.larksuite.com/open-apis'
  }
  return 'https://open.feishu.cn/open-apis'
}

/**
 * 解析「数据源地址」→ API 域名，app_token 有两种来源：
 *   A. `/wiki/<nodeToken>`——知识库节点，需再调 get_node 解析出 app_token
 *   B. `/base/<appToken>` 或 `/app/<appToken>`——链接本身就是多维表格地址，app_token 直接给出
 * 方案 B 下 `?table=` **可省略**（表名由 IDB store 决定），仅用于兼容旧粘贴。
 */
export function parseDatasourceUrl(url: string): {
  domain: string
  nodeToken: string
  appToken: string
  tableId: string
} {
  const u = new URL(url)
  const seg = u.pathname.split('/').filter(Boolean)
  const tableId = u.searchParams.get('table') ?? ''
  const wikiIdx = seg.indexOf('wiki')
  if (wikiIdx >= 0 && seg[wikiIdx + 1]) {
    return { domain: u.host, nodeToken: seg[wikiIdx + 1], appToken: '', tableId }
  }
  const baseIdx = seg.findIndex((s) => s === 'base' || s === 'app')
  if (baseIdx >= 0 && seg[baseIdx + 1]) {
    return { domain: u.host, nodeToken: '', appToken: seg[baseIdx + 1], tableId }
  }
  return { domain: u.host, nodeToken: '', appToken: '', tableId }
}

/**
 * 飞书 API 一律走同源代理 /api/webdav-proxy（与 WebDAV 共用同一套 Node 代发，无需新增服务端代码）。
 *
 * ⚠️ `open.feishu.cn` 不返回任何 CORS 头，浏览器直连必被拦截——表现为 fetch 抛
 * `TypeError: Failed to fetch`，必须由服务端代发。该代理是通用 HTTP 转发：body
 * `{ target, method, body? }`，请求头 `X-Webdav-Auth` 原样透传为上游 `Authorization`，
 * 且不限制目标 host。
 */
const PROXY_PATH = '/api/webdav-proxy'

async function feishuFetch(domain: string, path: string, token: string, init: RequestInit = {}): Promise<any> {
  const payload = JSON.stringify({
    target: apiBase(domain) + path,
    method: init.method ?? 'GET',
    ...(init.body !== undefined ? { body: String(init.body) } : {})
  })
  let res: Response
  try {
    res = await fetch(location.origin + PROXY_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Webdav-Auth': `Bearer ${token}` } : {})
      },
      body: payload
    })
  } catch {
    throw new Error(
      '无法连接同源代理 /api/webdav-proxy：飞书 API 不允许浏览器跨域直连，必须经服务端代发。' +
        '请确认页面是通过 npm run dev 或内置服务打开的，而不是直接打开 dist/index.html'
    )
  }
  const json = await res.json().catch(() => ({}))
  throwFeishuError(res, json)
  return json
}

/**
 * 飞书常见错误码的中文排查提示（与下方 throwFeishuError 共用）。
 * 重点：1254302 RolePermNotAllow 常因表格开启了「高级权限」——
 * 仅把自建应用加为普通协作者不够，必须在多维表格页「…」→「…更多」→「添加文档应用」把应用加为「可管理」。
 */
function feishuErrorHint(code: number): string {
  switch (code) {
    case 91403:
      return '无编辑权限：请把该自建应用加为多维表格的「可编辑/可管理」协作者'
    case 99991679:
      return '权限不足：请在开放平台给应用开通「查看、评论、编辑和管理多维表格」等权限，并加为协作者'
    case 99991672:
      return '无该资源权限：请把自建应用加为对应多维表格/知识库的协作者（或管理员）'
    case 1254041:
      return '表不存在：?table= 的表 ID 在当前多维表格里找不到（可能被删/重建）'
    case 1254004:
      return '表 ID 不合法：?table= 后不是表 ID（blk 开头是区块 ID）。方案 B 下 ?table= 可省略'
    case 1254301:
      return '多维表格未开启/不支持高级权限：请确认表格权限设置'
    case 1254302:
      return '无访问权限（常因该表格开启了「高级权限」）：请在多维表格页右上角「…」→「…更多」→「添加文档应用」把该自建应用加为「可管理」；或在高级权限设置里把含应用的群设为读写。先在开放平台给应用开通至少一个多维表格 API 权限，否则搜不到该应用'
    default:
      return ''
  }
}

/**
 * 把飞书错误归一成可读 Error。
 * 注意：同源代理对上游**非 2xx** 只把 body 前 1KB 塞进 `X-Upstream-Body-Snippet` 头、不写 body，
 * 因此错误码要从该头里还原，否则所有失败都退化成「未返回 JSON」而看不到真实原因。
 */
function throwFeishuError(res: Response, json: any): void {
  if (typeof json.code === 'number') {
    if (json.code === 0) return // 成功
    const hint = feishuErrorHint(json.code)
    throw new Error(`飞书接口错误 code=${json.code}：${json.msg || res.status}` + (hint ? `（${hint}）` : ''))
  }
  const snippet = res.headers.get('X-Upstream-Body-Snippet')
  if (snippet) {
    try {
      const decoded = JSON.parse(decodeURIComponent(snippet))
      if (typeof decoded.code === 'number') {
        const hint = feishuErrorHint(decoded.code)
        throw new Error(`飞书接口错误 code=${decoded.code}：${decoded.msg || res.status}` + (hint ? `（${hint}）` : ''))
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('飞书接口错误')) throw e
    }
  }
  throw new Error(`飞书接口未返回 JSON（HTTP ${res.status}），请检查网络或数据源地址`)
}

/** tenant_access_token（自建应用身份） */
async function getTenantAccessToken(domain: string, appId: string, appSecret: string): Promise<string> {
  const json = await feishuFetch(domain, '/auth/v3/tenant_access_token/internal', '', {
    method: 'POST',
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  })
  if (!json.tenant_access_token) throw new Error('飞书鉴权失败：未返回 tenant_access_token')
  return json.tenant_access_token as string
}

/**
 * 取多维表格 app_token：`/base/…` 链接已在 URL 里直接给出（传 appToken 即可，无需再调接口）；
 * `/wiki/…` 链接则用 nodeToken 调 get_node 解析（obj_type 必须 = bitable）。
 */
async function resolveAppToken(domain: string, token: string, nodeToken: string, appToken = ''): Promise<string> {
  if (appToken) return appToken
  const json = await feishuFetch(domain, `/wiki/v2/spaces/get_node?token=${encodeURIComponent(nodeToken)}`, token)
  const node = json.data?.node
  if (!node || node.obj_type !== 'bitable') {
    throw new Error('该知识库节点不是多维表格（obj_type=' + (node?.obj_type ?? '未知') + '）')
  }
  return node.obj_token as string
}

/** 列出多维表格下全部表（分页） */
async function listTables(domain: string, token: string, appToken: string): Promise<FeishuTable[]> {
  const out: FeishuTable[] = []
  let pageToken = ''
  do {
    const path =
      `/bitable/v1/apps/${appToken}/tables?page_size=100` +
      (pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : '')
    const json = await feishuFetch(domain, path, token)
    out.push(...(json.data?.items ?? []))
    pageToken = json.data?.page_token ?? ''
    if (!json.data?.has_more) break
  } while (pageToken)
  return out
}

/** 取（必要时创建）某 store 对应的飞书表；表名与 IDB store 名逐字相同 */
async function ensureTable(
  domain: string,
  token: string,
  appToken: string,
  store: string,
  known: Map<string, string>
): Promise<string> {
  const hit = known.get(store)
  if (hit) return hit
  const created = await feishuFetch(domain, `/bitable/v1/apps/${appToken}/tables`, token, {
    method: 'POST',
    body: JSON.stringify({ table: { name: store, fields: TABLE_FIELDS } })
  })
  const tableId = created?.data?.table_id as string
  known.set(store, tableId)
  return tableId
}

async function fetchAllRecords(domain: string, token: string, appToken: string, tableId: string): Promise<FeishuRecord[]> {
  const out: FeishuRecord[] = []
  let pageToken = ''
  do {
    const path =
      `/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=500` +
      (pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : '')
    const json = await feishuFetch(domain, path, token)
    out.push(...(json.data?.items ?? []))
    pageToken = json.data?.page_token ?? ''
    if (!json.data?.has_more) break
  } while (pageToken)
  return out
}

/**
 * 按 UTF-8 字节长度切分字符串，且只在「字符边界」断开，避免把多字节字符从中间切断。
 * 用于把超大的信封 JSON 拆成多个飞书单元格（每格 ≤ MAX_CELL_BYTES 字节）。
 */
function chunkByBytes(s: string, maxBytes: number): string[] {
  const enc = new TextEncoder()
  const bytes = enc.encode(s)
  if (bytes.length <= maxBytes) return [s]
  const parts: string[] = []
  const decoder = new TextDecoder()
  let start = 0
  while (start < bytes.length) {
    let end = Math.min(start + maxBytes, bytes.length)
    // 回退到 UTF-8 字符起始字节：<0x80 是 ASCII，≥0xC0 是多字节首字节；
    // 0x80–0xBF 是续字节，必须跳过以确保不在字符中间断开。
    while (end < bytes.length && bytes[end] >= 0x80 && bytes[end] < 0xC0) end--
    if (end === start) end = start + 1
    parts.push(decoder.decode(bytes.subarray(start, end)))
    start = end
  }
  return parts
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 每张表相互独立，可并行处理；限制并发避免触发飞书频控 */
const STORE_CONCURRENCY = 5

/** 有限并发执行：保序消费；首个错误记录后停止领取新任务，等在场任务收尾后统一抛出 */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let idx = 0
  let failed = false
  let firstError: unknown
  const size = Math.max(1, Math.min(limit, items.length))
  const workers = Array.from({ length: size }, async () => {
    while (idx < items.length && !failed) {
      const cur = items[idx++]
      try {
        await fn(cur)
      } catch (e) {
        if (!failed) {
          failed = true
          firstError = e
        }
      }
    }
  })
  await Promise.all(workers)
  if (failed) throw firstError
}

// ========== 按 store 的「本地内容签名」：内容没变就跳过推送 ==========
// 方案 B 下全量同步要遍历 34 张表（每张读+写 ≈ 1s+），若无脑全跑，
// 每次「立即同步」/切模块都要几十秒。用签名把「本地没动过的 store」直接跳过，
// 稳态下全量推送的网络请求降为 0。
const LS_SIG_PREFIX = 'ewt.feishu.localSig.'

function readLocalSig(store: string): string {
  try {
    return localStorage.getItem(LS_SIG_PREFIX + store) ?? ''
  } catch {
    return ''
  }
}

function writeLocalSig(store: string, sig: string): void {
  try {
    if (sig) localStorage.setItem(LS_SIG_PREFIX + store, sig)
    else localStorage.removeItem(LS_SIG_PREFIX + store)
  } catch {
    /* 隐私模式下 localStorage 不可用：退化为每次全量推送 */
  }
}

// ========== 按表的「远端 revision」基线：远端没变过就跳过读取 ==========
// 飞书每个表都有 revision，记录每次插/改/删都会 +1（实测可靠）。listTables 一次就能拿到
// 全部表的 revision，因此「远端未变」可用 1 次请求判定，省掉 34 次读表。
const LS_REV_PREFIX = 'ewt.feishu.remoteRev.'

function readRemoteRev(store: string): string {
  try {
    return localStorage.getItem(LS_REV_PREFIX + store) ?? ''
  } catch {
    return ''
  }
}

function writeRemoteRev(store: string, rev: string): void {
  try {
    if (rev) localStorage.setItem(LS_REV_PREFIX + store, rev)
    else localStorage.removeItem(LS_REV_PREFIX + store)
  } catch {
    /* 同 writeLocalSig */
  }
}

/** FNV-1a：同步、零依赖，只用于「内容是否变化」判断，不承担安全职责 */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** 一个 store 全部行的内容签名 */
function rowsSignature(store: string, rows: LocalRow[]): string {
  const parts: string[] = []
  for (const r of rows) parts.push(`${r.rowKey}\u0001${r.part}\u0001${r.value}`)
  return fnv1a(`${store}\u0002${parts.join('\u0003')}`)
}

async function batchCreate(domain: string, token: string, appToken: string, tableId: string, records: any[]): Promise<void> {
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500)
    await feishuFetch(domain, `/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`, token, {
      method: 'POST',
      body: JSON.stringify({ records: chunk })
    })
    if (i + 500 < records.length) await sleep(200)
  }
}

async function batchUpdate(domain: string, token: string, appToken: string, tableId: string, records: any[]): Promise<void> {
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500)
    await feishuFetch(domain, `/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_update`, token, {
      method: 'POST',
      body: JSON.stringify({ records: chunk })
    })
    if (i + 500 < records.length) await sleep(200)
  }
}

async function batchDelete(domain: string, token: string, appToken: string, tableId: string, recordIds: string[]): Promise<void> {
  for (let i = 0; i < recordIds.length; i += 500) {
    const chunk = recordIds.slice(i, i + 500)
    await feishuFetch(domain, `/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_delete`, token, {
      method: 'POST',
      body: JSON.stringify({ records: chunk })
    })
    if (i + 500 < recordIds.length) await sleep(200)
  }
}

interface LocalRow {
  store: string
  key: string // 基础记录键（不含分片后缀）
  rowKey: string // 飞书 key 列的值：key 或 key#pN
  value: string
  part: number
}

/**
 * 读取本地 IndexedDB，组装待同步行（含 settings 剥离 cloudSync* 与超大值分片）。
 * 传入 scope 时只组装该模块作用域内的行（模块级同步用）。
 */
async function buildLocalRows(scope?: ModuleScope): Promise<LocalRow[]> {
  const rows: LocalRow[] = []
  const addValue = (store: string, key: string, raw: unknown) => {
    if (raw === undefined || raw === null) return
    if (!inScope(scope, store, key)) return
    const value = typeof raw === 'string' ? raw : JSON.stringify(raw)
    chunkByBytes(value, MAX_CELL_BYTES).forEach((p, idx) => {
      rows.push({ store, key, rowKey: idx === 0 ? key : `${key}#p${idx}`, value: p, part: idx })
    })
  }

  // settings：剥离 cloudSync* 后再同步（凭据/渠道不跨设备覆盖）
  const settingsVal = await idbGet<Record<string, unknown>>('settings')
  if (settingsVal) {
    const s2: Record<string, unknown> = { ...settingsVal }
    for (const k of CLOUD_SYNC_KEYS) delete s2[k]
    addValue('settings', 'items', s2)
  }
  // 单记录 store
  for (const store of SINGLE_STORES) {
    if (store === 'settings') continue
    const v = await idbGet(store as any)
    addValue(store, 'items', v)
  }
  // 多记录 store（nav）：原始字符串值逐键展开
  for (const store of MULTI_STORES) {
    const rec = await idbGetAllEntries<unknown>(store as any)
    for (const [k, v] of Object.entries(rec ?? {})) addValue(store, k, v)
  }
  return rows
}

/** 剥掉分片后缀，取基础记录键 */
function baseKeyOf(k: string): string {
  return k.replace(/#p\d+$/, '')
}

/**
 * 把一张飞书表的记录按基础 key 分组、按 part 排序拼接还原成值字符串。
 * allowedKeys 非空时只保留其中的 key（模块级拉取按 nav key 收窄）。
 */
function reassembleTable(records: FeishuRecord[], allowedKeys?: string[]): Map<string, string> {
  const groups = new Map<string, FeishuRecord[]>()
  for (const r of records) {
    const f = r.fields || {}
    if (typeof f.key !== 'string') continue
    const base = baseKeyOf(f.key)
    if (allowedKeys && allowedKeys.length && !allowedKeys.includes(base)) continue
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base)!.push(r)
  }
  const out = new Map<string, string>()
  for (const [base, recs] of groups) {
    recs.sort((a, b) => Number(a.fields.part ?? 0) - Number(b.fields.part ?? 0))
    out.set(base, recs.map((r) => String(r.fields.value ?? '')).join(''))
  }
  return out
}

/**
 * 推送本地 → 飞书（方案 B：按 store 分表 upsert + 按表删陈旧行）。
 * 返回写入的行数（用于 UI 提示）。
 *
 * @param force 强制以本地为准：跳过「本地内容签名未变则跳过该 store」的优化，
 *              保证「本地推送云端」这类强制入口一定把本地现状写上去。
 */
export async function feishuPush(settings: FeishuSyncParams, scope?: ModuleScope, force = false): Promise<number> {
  const url = settings.cloudSyncFeishuDatasourceUrl
  if (!url) throw new Error('飞书数据源地址为空')
  const { domain, nodeToken, appToken: urlAppToken } = parseDatasourceUrl(url)
  if (!nodeToken && !urlAppToken) {
    throw new Error('飞书数据源地址无法解析出 app_token（请粘贴完整 wiki / base 链接）')
  }
  const token = await getTenantAccessToken(domain, settings.cloudSyncFeishuAppId || '', settings.cloudSyncFeishuAppSecret || '')
  const appToken = await resolveAppToken(domain, token, nodeToken, urlAppToken)

  const clientId = getClientId()
  const now = Date.now()
  const localRows = await buildLocalRows(scope)

  // 按 store 分组 → 每组对应一张同名飞书表
  const byStore = new Map<string, LocalRow[]>()
  for (const r of localRows) {
    if (!byStore.has(r.store)) byStore.set(r.store, [])
    byStore.get(r.store)!.push(r)
  }

  const tables = await listTables(domain, token, appToken)
  const known = new Map<string, string>(tables.map((t) => [t.name, t.table_id]))

  // 本地内容与上次成功推送一致的 store 直接跳过：远端必然已是这份内容
  const pending: Array<{ store: string; rows: LocalRow[]; sig: string }> = []
  for (const [store, rows] of byStore) {
    const sig = rowsSignature(store, rows)
    if (!force && sig === readLocalSig(store)) continue
    pending.push({ store, rows, sig })
  }
  if (!pending.length) return 0

  let written = 0
  await mapLimit(pending, STORE_CONCURRENCY, async ({ store, rows, sig }) => {
    const tableId = await ensureTable(domain, token, appToken, store, known)
    const existing = await fetchAllRecords(domain, token, appToken, tableId)
    const byKey = new Map<string, FeishuRecord>(existing.map((r) => [String(r.fields.key ?? ''), r]))

    const toCreate: any[] = []
    const toUpdate: any[] = []
    const keys = new Set<string>()
    for (const row of rows) {
      const fields = {
        key: row.rowKey,
        value: row.value,
        part: row.part,
        clientId,
        updatedAt: now,
        syncedAt: now,
        channel: 'feishu'
      }
      keys.add(row.rowKey)
      const ex = byKey.get(row.rowKey)
      if (ex) toUpdate.push({ record_id: ex.record_id, fields })
      else toCreate.push({ fields })
    }
    // 只删**本表**内本地已不存在的行：按表隔离，不会波及其他模块的数据
    const toDelete = existing
      .filter((r) => r.fields.key && !keys.has(String(r.fields.key)))
      .map((r) => r.record_id)

    if (toCreate.length) await batchCreate(domain, token, appToken, tableId, toCreate)
    if (toUpdate.length) await batchUpdate(domain, token, appToken, tableId, toUpdate)
    if (toDelete.length) await batchDelete(domain, token, appToken, tableId, toDelete)
    writeLocalSig(store, sig)
    written += rows.length
  })
  // 本轮推送改动了这些表 → revision 必然已变。再拉一次表清单刷新基线，
  // 否则下一次 pull 会把这些表当成"远端变过"而重读一遍（每次推送都白读一次）。
  if (pending.length > 0) {
    const fresh = await listTables(domain, token, appToken)
    for (const t of fresh) writeRemoteRev(t.name, String(t.revision ?? ''))
  }
  return written
}

/**
 * 拉取飞书 → 本地（方案 B：按表读 → 按基础 key 还原 → 写 IDB）。
 * 返回是否需要刷新 settings 响应式 store，以及实际落地的条目数。
 *
 * @param force 强制以云端为准：跳过「远端 revision 未变则跳过该表」的优化，
 *              且 settings 改为云端优先合并（凭据类字段仍保留本机值）。
 */
export async function feishuPull(settings: FeishuSyncParams, scope?: ModuleScope, force = false): Promise<{ settingsChanged: boolean; applied: number }> {
  const url = settings.cloudSyncFeishuDatasourceUrl
  if (!url) throw new Error('飞书数据源地址为空')
  const { domain, nodeToken, appToken: urlAppToken } = parseDatasourceUrl(url)
  if (!nodeToken && !urlAppToken) {
    throw new Error('飞书数据源地址无法解析出 app_token（请粘贴完整 wiki / base 链接）')
  }
  const token = await getTenantAccessToken(domain, settings.cloudSyncFeishuAppId || '', settings.cloudSyncFeishuAppSecret || '')
  const appToken = await resolveAppToken(domain, token, nodeToken, urlAppToken)

  const tables = await listTables(domain, token, appToken)
  const byName = new Map<string, string>(tables.map((t) => [t.name, t.table_id]))
  const revByName = new Map<string, string>(tables.map((t) => [t.name, String(t.revision ?? '')]))

  // 本次要拉的 store：作用域给定的 stores（+ nav）；全量时取全部
  const allStores = scope ? scope.stores.filter((s) => s !== 'nav') : FEISHU_SYNC_STORES.filter((s) => s !== 'nav')
  const navKeys = scope ? scope.navKeys : undefined
  if (!scope || (navKeys && navKeys.length) || scope.stores.includes('nav')) allStores.push('nav')

  // 远端 revision 与基线一致 → 该表自我们上次同步后没被改过，连读都省掉
  const todo: string[] = []
  for (const store of allStores) {
    const rev = revByName.get(store)
    if (rev === undefined) {
      writeRemoteRev(store, '') // 表不存在 → 云端无该 store 数据，保留本地
      continue
    }
    if (!force && readRemoteRev(store) === rev) continue
    todo.push(store)
  }

  let settingsChanged = false
  let applied = 0
  await mapLimit(todo, STORE_CONCURRENCY, async (store) => {
    const tableId = byName.get(store)!
    const records = await fetchAllRecords(domain, token, appToken, tableId)
    const grouped = reassembleTable(records, store === 'nav' ? navKeys : undefined)
    for (const [key, value] of grouped) {
      applied++
      if (store === 'nav') {
        // nav store 里存的是 **JSON 字符串**（getPref 取出后由调用方 JSON.parse），
        // 必须原样写回字符串。若写解析后的对象，JSON.parse(对象) 会得到 "[object Object]"，
        // 该键会被当作损坏数据丢弃（表现为站点/分类等整块变空、首页空白）
        await idbPutKey('nav', key, value)
      } else if (store === 'settings') {
        const remote = safeParse(value) as Record<string, unknown> | null
        const local = (await idbGet<Record<string, unknown>>('settings')) ?? {}
        // 常规同步本地优先（避免云端旧版冲掉本地新设置）；force 时按「以云端为准」改为云端优先
        const merged: Record<string, unknown> = force
          ? { ...local, ...(remote ?? {}) }
          : { ...(remote ?? {}), ...local }
        // 保留本机云同步字段（凭据/渠道不跨设备覆盖，否则会把自己的云配置冲掉）
        for (const k of CLOUD_SYNC_KEYS) merged[k] = local[k]
        await idbPut('settings', merged)
        settingsChanged = true
      } else {
        const parsed = safeParse(value)
        if (parsed !== undefined) await idbPut(store as any, parsed)
      }
    }
    writeRemoteRev(store, revByName.get(store)!)
  })
  return { settingsChanged, applied }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

/**
 * 飞书连接与表结构自检（设置页「测试连接」调用）：
 * 鉴权 + 节点解析 + 列出全部表（读权限）+ 确保至少一张目标表存在（写权限）。
 */
export async function testFeishuConnection(settings: FeishuSyncParams): Promise<{ ok: boolean; error?: string }> {
  if (!settings.cloudSyncFeishuAppId || !settings.cloudSyncFeishuAppSecret || !settings.cloudSyncFeishuDatasourceUrl) {
    return { ok: false, error: 'App ID / App Secret / 数据源地址不能为空' }
  }
  try {
    const { domain, nodeToken, appToken: urlAppToken } = parseDatasourceUrl(settings.cloudSyncFeishuDatasourceUrl)
    if (!nodeToken && !urlAppToken) {
      return { ok: false, error: '数据源地址无法解析出 app_token（请粘贴完整 wiki / base 链接）' }
    }
    const token = await getTenantAccessToken(domain, settings.cloudSyncFeishuAppId, settings.cloudSyncFeishuAppSecret)
    const appToken = await resolveAppToken(domain, token, nodeToken, urlAppToken)
    const tables = await listTables(domain, token, appToken)
    const known = new Map<string, string>(tables.map((t) => [t.name, t.table_id]))
    // 确保一张目标表存在（同时验证写权限）；其余表在首次推送时按需创建
    await ensureTable(domain, token, appToken, FEISHU_SYNC_STORES[0], known)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '连接失败'
    const hint = msg.includes('code=91403')
      ? '无编辑权限：请打开该多维表格 → 右上角「…」→ 添加文档应用 / 协作者，把该自建应用加为**可编辑**成员（只读会导致建表、写记录被拒）。'
      : msg.includes('code=99991679')
        ? '权限不足：请在飞书开放平台给该应用开通「查看、评论、编辑和管理多维表格」「查看、编辑和管理知识库」「查看知识空间节点信息」，并把应用加为对应知识库/多维表格的协作者。'
        : msg.includes('code=99991672')
          ? '无该资源权限：请把自建应用加为对应知识库节点或多维表格的协作者（或知识库管理员）。'
          : msg.includes('code=1254041')
            ? '表不存在：该链接的 ?table= 表 ID 在当前多维表格里找不到（表可能被删/重建）。请重新打开目标多维表格，复制浏览器地址栏的完整链接。'
            : msg.includes('code=1254004')
              ? '表 ID 不合法：?table= 后的值不是表 ID（以 blk 开头的是「区块 ID」不是表 ID）。方案 B 下 ?table= 可省略，只保留 /wiki/xxx 或 /base/xxx 部分即可。'
              : msg
    return { ok: false, error: hint }
  }
}

/**
 * 手动预建全部飞书表（设置页「创建表」按钮）。
 * 按 FEISHU_SYNC_STORES 逐个 ensureTable：已存在的按表名复用，只补缺失的表。
 * 返回总数 / 新建数 / 已存在数，供 UI 提示。
 */
export async function createFeishuTables(
  settings: FeishuSyncParams
): Promise<{ total: number; created: number; existing: number }> {
  if (!settings.cloudSyncFeishuAppId || !settings.cloudSyncFeishuAppSecret || !settings.cloudSyncFeishuDatasourceUrl) {
    throw new Error('App ID / App Secret / 数据源地址不能为空')
  }
  const { domain, nodeToken, appToken: urlAppToken } = parseDatasourceUrl(settings.cloudSyncFeishuDatasourceUrl)
  if (!nodeToken && !urlAppToken) {
    throw new Error('数据源地址无法解析出 app_token（请粘贴完整 wiki / base 链接）')
  }
  const token = await getTenantAccessToken(domain, settings.cloudSyncFeishuAppId, settings.cloudSyncFeishuAppSecret)
  const appToken = await resolveAppToken(domain, token, nodeToken, urlAppToken)

  const tables = await listTables(domain, token, appToken)
  const known = new Map<string, string>(tables.map((t) => [t.name, t.table_id]))

  let created = 0
  let existing = 0
  await mapLimit(FEISHU_SYNC_STORES, STORE_CONCURRENCY, async (store) => {
    if (known.has(store)) {
      existing++
      return
    }
    await ensureTable(domain, token, appToken, store, known)
    created++
  })
  return { total: FEISHU_SYNC_STORES.length, created, existing }
}
