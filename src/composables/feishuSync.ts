/**
 * 飞书多维表格（Bitable）云同步传输层（方案 A：统一镜像表）
 *
 * 设计要点（详见 docs/feishu-cloud-sync/技术文档.md）：
 *   - 复用现有 IndexedDB 读取（idbGet / idbGetAllEntries）与写入（idbPut / idbPutKey），
 *     不触碰 WebDAV 同步引擎的业务逻辑。
 *   - 每个 IDB object store = 飞书表的一行（`store` 列取值逐字等于 IDB object store 名，
 *     `key` 列 = 记录键：单记录 store 为 'items'，nav 为真实键），`value` 列放 JSON 文本。
 *   - 渠道由 useCloudSync 在入口处按 settings.cloudSyncChannel 分流，本模块只负责飞书传输。
 *   - 凭据（App ID/Secret/数据源 URL）仅来自本机 settings，绝不回写云端、绝不进入提交。
 *   - 超大值（icons / blog / teacher 含 base64）按 9 万字符分片，多行 rowKey 后缀 #pN 还原。
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

// 飞书同步只需这三个字段（凭据仅本机，绝不进同步数据流）；用窄接口避免传入整个 settings store
interface FeishuSyncParams {
  cloudSyncFeishuAppId?: string
  cloudSyncFeishuAppSecret?: string
  cloudSyncFeishuDatasourceUrl?: string
}

// 飞书本机客户端 ID（与 useCloudSync 内 CLIENT_ID_KEY 同一把，用于跨设备冲突识别）
const CLIENT_ID_KEY = 'easy-web-tab-client-id'

// 不参与云同步的 IDB object store（Blob / 纯本地 / 设备级）
const EXCLUDED_STORES = new Set<string>(['student_images', 'snapshots', 'iconcache', 'books', 'pomodoro', 'habits'])

// 单记录 store（每个 store 一条 'items' 记录）；排除 settings（特殊处理，剥离 cloudSync*）
const SINGLE_STORES: string[] = [
  ...IDB_CORE_STORES,
  ...IDB_STUDENT_STORES.filter((s) => !EXCLUDED_STORES.has(s)),
  ...IDB_ICONS_STORES,
  ...IDB_TEACHER_STORES,
  ...IDB_TOOLBOX_STORES,
  'blog'
]

// 多记录 store（按真实键展开）：仅 nav
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

// Bitable 文本字段单格上限约 10 万字符，留 1 万头程分片
const MAX_VALUE_LEN = 90_000

interface FeishuField {
  field_name: string
  type: number
}
// 统一镜像表目标列（与 IDB "key→value 容器"语义一致）
const REQUIRED_FIELDS: FeishuField[] = [
  { field_name: 'rowKey', type: 1 }, // 文本：store#key#part（幂等 upsert 主键）
  { field_name: 'store', type: 1 }, // 文本：IDB object store 名（= 浏览器表名）
  { field_name: 'key', type: 1 }, // 文本：记录键（单记录 store='items'，nav=真实键）
  { field_name: 'value', type: 1 }, // 多行文本：JSON / 原始字符串
  { field_name: 'clientId', type: 1 }, // 文本：写入设备 ID
  { field_name: 'updatedAt', type: 5 }, // 日期（13 位毫秒）
  { field_name: 'syncedAt', type: 5 }, // 日期
  { field_name: 'channel', type: 1 }, // 文本：写入渠道
  { field_name: 'part', type: 2 } // 数字：分片序号（0 = 未分片）
]

interface FeishuRecord {
  record_id: string
  fields: Record<string, unknown>
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

function apiBase(domain: string): string {
  return `https://${domain}/open-apis`
}

/** 解析「数据源地址」wiki 链接 → 域名 + nodeToken + tableId（用户只需粘贴整条 URL） */
export function parseDatasourceUrl(url: string): { domain: string; nodeToken: string; tableId: string } {
  const u = new URL(url)
  const seg = u.pathname.split('/').filter(Boolean)
  const wikiIdx = seg.indexOf('wiki')
  const nodeToken = wikiIdx >= 0 && seg[wikiIdx + 1] ? seg[wikiIdx + 1] : ''
  const tableId = u.searchParams.get('table') ?? ''
  return { domain: u.host, nodeToken, tableId }
}

async function feishuFetch(domain: string, path: string, token: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${apiBase(domain)}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {})
    }
  })
  const json = await res.json().catch(() => ({}))
  if (json.code !== 0) {
    throw new Error(`飞书接口错误 code=${json.code}：${json.msg || res.status}`)
  }
  return json
}

/** tenant_access_token（自建应用身份；无需把机器人加入知识库成员） */
async function getTenantAccessToken(domain: string, appId: string, appSecret: string): Promise<string> {
  const json = await feishuFetch(domain, '/auth/v3/tenant_access_token/internal', '', {
    method: 'POST',
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  })
  if (!json.tenant_access_token) throw new Error('飞书鉴权失败：未返回 tenant_access_token')
  return json.tenant_access_token as string
}

/** 由 wiki nodeToken 取得多维表格 app_token（obj_type 必须 = bitable） */
async function resolveAppToken(domain: string, token: string, nodeToken: string): Promise<string> {
  const json = await feishuFetch(domain, `/wiki/v2/spaces/get_node?token=${encodeURIComponent(nodeToken)}`, token)
  const node = json.data?.node
  if (!node || node.obj_type !== 'bitable') {
    throw new Error('该知识库节点不是多维表格（obj_type=' + (node?.obj_type ?? '未知') + '）')
  }
  return node.obj_token as string
}

/** 确保统一镜像表具备所需列（缺则创建），兼容用户现成表格已有的列 */
async function ensureSchema(domain: string, token: string, appToken: string, tableId: string): Promise<void> {
  const json = await feishuFetch(domain, `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, token)
  const existing = new Set<string>((json.data?.items ?? []).map((f: any) => f.field_name))
  for (const f of REQUIRED_FIELDS) {
    if (existing.has(f.field_name)) continue
    await feishuFetch(domain, `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, token, {
      method: 'POST',
      body: JSON.stringify({ field_name: f.field_name, type: f.type })
    })
  }
}

async function fetchAllRecords(domain: string, token: string, appToken: string, tableId: string): Promise<FeishuRecord[]> {
  const out: FeishuRecord[] = []
  let pageToken = ''
  do {
    const path = `/bitable/v1/apps/${appToken}/tables/${tableId}/records${pageToken ? `?page_token=${encodeURIComponent(pageToken)}` : ''}`
    const json = await feishuFetch(domain, path, token)
    out.push(...(json.data?.items ?? []))
    pageToken = json.data?.page_token ?? ''
    if (!json.data?.has_more) break
  } while (pageToken)
  return out
}

function chunkString(s: string, size: number): string[] {
  if (s.length <= size) return [s]
  const parts: string[] = []
  for (let i = 0; i < s.length; i += size) parts.push(s.slice(i, i + size))
  return parts
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
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
  key: string
  value: string // 原始字符串（nav 为原值，其它为 JSON）
  part: number
  rowKey: string
}

/** 读取本地 IndexedDB，组装全部待同步行（含 settings 剥离 cloudSync* 与分片） */
async function buildLocalRows(): Promise<LocalRow[]> {
  const rows: LocalRow[] = []
  const addValue = (store: string, key: string, raw: unknown) => {
    if (raw === undefined || raw === null) return
    const value = typeof raw === 'string' ? raw : JSON.stringify(raw)
    const parts = chunkString(value, MAX_VALUE_LEN)
    parts.forEach((p, idx) => {
      rows.push({ store, key, value: p, part: idx, rowKey: `${store}#${key}#p${idx}` })
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

/** 把飞书行按 store#key 分组并按分片还原为值字符串 */
function reassemble(records: FeishuRecord[]): Map<string, { store: string; key: string; value: string }> {
  const groups = new Map<string, FeishuRecord[]>()
  for (const r of records) {
    const f = r.fields || {}
    if (typeof f.store !== 'string' || typeof f.key !== 'string') continue
    const gkey = `${f.store}#${f.key}`
    if (!groups.has(gkey)) groups.set(gkey, [])
    groups.get(gkey)!.push(r)
  }
  const out = new Map<string, { store: string; key: string; value: string }>()
  for (const [gkey, recs] of groups) {
    recs.sort((a, b) => Number(a.fields.part ?? 0) - Number(b.fields.part ?? 0))
    const value = recs.map((r) => String(r.fields.value ?? '')).join('')
    const [store, key] = gkey.split('#')
    out.set(gkey, { store, key, value })
  }
  return out
}

/**
 * 推送本地 → 飞书（全量 upsert + 增量删除）。
 * 返回写入的逻辑条目数（用于 UI 提示）。
 */
export async function feishuPush(settings: FeishuSyncParams): Promise<number> {
  const url = settings.cloudSyncFeishuDatasourceUrl
  if (!url) throw new Error('飞书数据源地址为空')
  const { domain, nodeToken, tableId } = parseDatasourceUrl(url)
  if (!nodeToken || !tableId) throw new Error('飞书数据源地址无法解析出 nodeToken / tableId（请使用完整 wiki 链接）')
  const token = await getTenantAccessToken(domain, settings.cloudSyncFeishuAppId || '', settings.cloudSyncFeishuAppSecret || '')
  const appToken = await resolveAppToken(domain, token, nodeToken)
  await ensureSchema(domain, token, appToken, tableId)

  const clientId = getClientId()
  const now = Date.now()
  const localRows = await buildLocalRows()
  const existing = await fetchAllRecords(domain, token, appToken, tableId)
  const existingByRowKey = new Map<string, FeishuRecord>(existing.map((r) => [String(r.fields.rowKey ?? ''), r]))

  const toCreate: any[] = []
  const toUpdate: any[] = []
  const writtenRowKeys = new Set<string>()
  for (const row of localRows) {
    const fields = {
      rowKey: row.rowKey,
      store: row.store,
      key: row.key,
      value: row.value,
      clientId,
      updatedAt: now,
      syncedAt: now,
      channel: 'feishu',
      part: row.part
    }
    writtenRowKeys.add(row.rowKey)
    const ex = existingByRowKey.get(row.rowKey)
    if (ex) toUpdate.push({ record_id: ex.record_id, fields })
    else toCreate.push({ fields })
  }
  // 增量删除：飞书存在但本地已不存在的条目
  const toDelete = existing.filter((r) => r.fields.rowKey && !writtenRowKeys.has(String(r.fields.rowKey))).map((r) => r.record_id)

  if (toCreate.length) await batchCreate(domain, token, appToken, tableId, toCreate)
  if (toUpdate.length) await batchUpdate(domain, token, appToken, tableId, toUpdate)
  if (toDelete.length) await batchDelete(domain, token, appToken, tableId, toDelete)
  return writtenRowKeys.size
}

/**
 * 拉取飞书 → 本地（全量覆盖）。
 * 返回是否需要刷新 settings 响应式 store（settings 条目被更新时）。
 */
export async function feishuPull(settings: FeishuSyncParams): Promise<{ settingsChanged: boolean }> {
  const url = settings.cloudSyncFeishuDatasourceUrl
  if (!url) throw new Error('飞书数据源地址为空')
  const { domain, nodeToken, tableId } = parseDatasourceUrl(url)
  if (!nodeToken || !tableId) throw new Error('飞书数据源地址无法解析出 nodeToken / tableId（请使用完整 wiki 链接）')
  const token = await getTenantAccessToken(domain, settings.cloudSyncFeishuAppId || '', settings.cloudSyncFeishuAppSecret || '')
  const appToken = await resolveAppToken(domain, token, nodeToken)

  const records = await fetchAllRecords(domain, token, appToken, tableId)
  const grouped = reassemble(records)

  let settingsChanged = false
  for (const { store, key, value } of grouped.values()) {
    if (store === 'nav') {
      // nav 多记录：本地存的是对象，飞书里是 JSON 字符串，还原回对象
      const parsed = safeParse(value)
      await idbPutKey('nav', key, parsed !== undefined ? parsed : value)
    } else if (store === 'settings') {
      const remote = safeParse(value) as Record<string, unknown> | null
      const local = (await idbGet<Record<string, unknown>>('settings')) ?? {}
      const merged: Record<string, unknown> = { ...(remote ?? {}), ...local }
      // 保留本机云同步字段（凭据/渠道不跨设备覆盖）
      for (const k of CLOUD_SYNC_KEYS) merged[k] = local[k]
      await idbPut('settings', merged)
      settingsChanged = true
    } else {
      const parsed = safeParse(value)
      if (parsed !== undefined) await idbPut(store as any, parsed)
    }
  }
  return { settingsChanged }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

/** 飞书连接与表结构自检（设置页「测试连接」调用）：鉴权 + 节点解析 + 列完整性 */
export async function testFeishuConnection(settings: FeishuSyncParams): Promise<{ ok: boolean; error?: string }> {
  if (!settings.cloudSyncFeishuAppId || !settings.cloudSyncFeishuAppSecret || !settings.cloudSyncFeishuDatasourceUrl) {
    return { ok: false, error: 'App ID / App Secret / 数据源地址不能为空' }
  }
  try {
    const { domain, nodeToken, tableId } = parseDatasourceUrl(settings.cloudSyncFeishuDatasourceUrl)
    if (!nodeToken || !tableId) return { ok: false, error: '数据源地址无法解析出 nodeToken / tableId' }
    const token = await getTenantAccessToken(domain, settings.cloudSyncFeishuAppId, settings.cloudSyncFeishuAppSecret)
    const appToken = await resolveAppToken(domain, token, nodeToken)
    await ensureSchema(domain, token, appToken, tableId)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '连接失败'
    const hint = msg.includes('code=99991679')
      ? '权限不足：请在飞书开放平台给该应用开通「查看、评论、编辑和管理多维表格」「查看、编辑和管理知识库」「查看知识空间节点信息」，并把应用加为对应知识库/多维表格的协作者。'
      : msg.includes('code=99991672')
        ? '无该资源权限：请把自建应用加为对应知识库节点或多维表格的协作者（或知识库管理员）。'
        : msg
    return { ok: false, error: hint }
  }
}
