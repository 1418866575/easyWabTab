/**
 * 云同步 composable（WebDAV + v10 多文件同步信封）
 *
 * 多份独立信封：nav.json / icons.json / workbench.json / business.json / student.json / teacher.json / toolbox.json / smart.json / blog.json / blog-prefs.json / books.json
 *   - nav.json：导航偏好（存 IDB nav store；user-sites/categories/engines/theme/background 等）
 *   - icons.json：自定义图标（localStorage user-custom-icons）
 *   - workbench.json：工作台核心 9 store（不含 business；settings 不含 cloudSync* 5 字段）
 *   - business.json：销售记账独立信封
 *   - student.json：学生工作台 15 store 独立信封
 *   - teacher.json：教师工作台单对象（teacher_workbench；含 base64 图片，体积偏大）
 *   - toolbox.json：工具箱偏好（收藏 / 最近使用 / 点击次数 / 搜索历史）
 *   - smart.json：智能工作台（技能 / 提示词 / 工作流 / 菜单配置 / 技能分类 / 工作流分类 / 提示词分类，SMART_PREFS_KEYS 七个键）
 *   - blog.json：博客独立信封（BlogData 单对象：settings / categories / tags / articles）
 *     存 IDB blog store（DB v22）；文章含 Markdown 正文，草稿一并同步（按 updatedAt 较新者胜）
 *   - blog-prefs.json：博客前台偏好（收藏 / 最近阅读，本机浏览轨迹），存 IDB nav store（BLOG_PREFS_NAV_KEY）
 *     随博客信封之外独立同步，避免被后台数据合并整体覆盖
 *   - books.json：个人图书馆偏好（仅收藏 favorites + 用户自建书签 userBookmarks），存 IDB nav store（BOOKS_PREFS_NAV_KEY）
 *     阅读位置 / 最近打开 / 打开次数 / 上传书为设备级数据，不在此信封内
 *
 * 单例设计：模块级 ref 持有全局状态（参考 useCountdownReminder / useToast 的单例模式）
 * 触发器：
 *   - document.visibilitychange  visible → pullNow | hidden + dirty → pushNow
 *   - App.vue onMounted 调 init()
 *   - 设置弹窗「立即同步」按钮
 *   - localStorage dirty 标记（各 store 的 save* 后 markDirty()）
 *
 * 冲突判定：本地 dirty=true 且 远端 pushedAt > lastSyncAt（逐文件独立判定，累积到 conflictData Record）
 * 冲突解决：3 选 1（全部云端覆盖 / 全部本地覆盖 / 全部合并）
 *
 * 首次迁移：7 份都 404 但 backup.json 存在 → 读 backup.json → idbImportAll 落本地 →
 *           export 7 份 → 上传 → DELETE backup.json
 *
 * CORS 兼容：WebDAV 原生自定义方法（MKCOL）+ Authorization 会触发浏览器预检（OPTIONS），
 * 坚果云/Nextcloud 默认不回 Access-Control-Allow-Origin。
 * 解决方案：请求统一走同源代理 `/api/webdav-proxy`（Vite dev 与 Node prod server 均已挂载），
 * 由服务端带凭证直接代发 HTTP → 天然无 CORS。
 */
import { ref, shallowRef } from 'vue'
import {
  idbImportAll,
  exportWorkbench,
  importWorkbenchData,
  exportBusiness,
  importBusinessData,
  exportStudent,
  importStudentData,
  exportNav,
  importNavData,
  exportIcons,
  importIconsData,
  exportTeacher,
  importTeacherData,
  exportSmart,
  importSmartData,
  exportBlog,
  importBlogData,
  exportBlogPrefs,
  importBlogPrefsData,
  idbGetKey,
  BLOG_PREFS_NAV_KEY
} from './useIdb'
import { useNavPrefs } from './useNavPrefs'
import { useAppSettingsStore } from '../stores/settings'
import { useToast } from './useToast'
import { getStoredSaltHex, getStoredVerification } from './useCrypto'
import { mergeFamily } from './genealogyCore'
import { mergeBusinessStore } from './businessCore'
import { mergeLedgerStore } from './ledgerCore'
import { mergeBlogEnvelope, mergeBlogPrefsEnvelope } from './blogSyncCore'
// 个人图书馆云同步信封（books.json）：仅收藏 + 用户自建书签
// export/import/reload 在本机偏好单例里（useBooksPrefs），合并纯函数放零依赖的 booksSyncCore
import {
  exportBooksSyncData,
  importBooksSyncData,
  reloadBooksPrefs
} from './useBooksPrefs'
import { mergeBooksPrefsEnvelope, type BooksPrefsSyncData } from './booksSyncCore'
import type {
  BusinessSyncData,
  BlogSyncData,
  BlogFrontSyncData,
  Countdown,
  DiaryData,
  HealthData,
  IconsSyncData,
  LedgerData,
  LedgerStoreData,
  NavSyncData,
  NoteData,
  SmartSyncData,
  StudentSyncData,
  TeacherSyncData,
  WorkbenchData,
  WorkbenchSyncData,
  WorkbenchTodo
} from '../types'
import type { PomodoroData } from './pomodoroCore'
import type { HabitsData } from './habitCore'
// 工具箱云同步（收藏 / 最近使用 / 点击次数 / 搜索历史）：实现放在 toolbox 模块自有文件，避免工具箱逻辑侵入本文件
import {
  exportToolbox,
  importToolboxData,
  mergeToolbox,
  diffSize as toolboxDiffSize,
  signature as sigToolbox,
  reloadToolboxStore
} from '@/toolbox/core/toolboxSync'
import {
  armNavWipeOverride,
  checkUserSitesAgainstBaseline,
  isNavExplicitMutationActive
} from './navDataGuard'
// 基线自 v20 起存 IndexedDB（navmeta），不再随 localStorage 被回收而失效
import { readBaseline } from './navMeta'
import type { ToolboxSyncData } from '@/toolbox/core/toolboxSyncCore'
import type { TeacherData } from '../types/teacher'

const CLIENT_ID_KEY = 'easy-web-tab-client-id'
const LAST_SYNC_KEY = 'easy-web-tab-last-sync'
const DIRTY_KEY = 'easy-web-tab-dirty'
const PROXY_PATH = '/api/webdav-proxy'
const DATA_DIR = 'easy-web-tab'
/** 多文件信封（顺序：nav → icons → workbench → business → student → teacher → toolbox → smart → blog），见下方 FILE_CONFIGS */
/** 仅用于首次迁移检测（v9 单文件 backup.json） */
const LEGACY_BACKUP_FILE = 'backup.json'

export type SyncStatus = 'idle' | 'pushing' | 'pulling' | 'conflict' | 'error'

interface ConflictEntry {
  local: unknown
  remote: unknown
}

interface FileConfig {
  name: string
  exportLocal: () => Promise<unknown> | unknown
  importRemote: (data: unknown) => Promise<unknown>
  signature: (data: unknown) => string
  merge: (local: unknown, remote: unknown) => unknown
  reload: () => Promise<void>
  diffSize: (local: unknown, remote: unknown) => number
  /**
   * 推送前的**本地退化检查**（2026-10-07 事故后新增）。
   * 返回空/null = 内容健康允许推送；返回非空 = 疑似降级的原因，这一份会被跳过且不参与上传。
   *
   * 背景：原先只有「云端是否被外部改过」的探测（detectExternalChange），
   * 管不了「**本机**数据先坏掉」的情形——坏掉的空态照样一路推上云，连锁清空其它设备。
   */
  guardLocal?: (local: unknown) => string | null
}

// 单例状态（模块级引用，composable 返回同一引用）
const status = ref<SyncStatus>('idle')
const lastSyncAt = ref<number | null>(null)
const errorMessage = ref<string>('')
const conflictData = shallowRef<Record<string, ConflictEntry> | null>(null)

// ========== 基础工具 ==========

function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY)
  if (!id) {
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'cid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
    localStorage.setItem(CLIENT_ID_KEY, id)
  }
  return id
}

export function markDirty(): void {
  localStorage.setItem(DIRTY_KEY, '1')
  // 所有 store 的保存口都会走到这里，因此「保存后立即上云」只在此处挂钩即可覆盖全部增删改
  scheduleAutoPush()
}

// ===== 保存后立即上云（设置项 cloudSyncAutoPush）：防抖 + 只推变化信封 =====

/** 连续保存（输入、拖拽排序等）合并成一次推送的防抖窗口 */
const AUTO_PUSH_DEBOUNCE_MS = 1500
/**
 * 每份信封「上次成功推送时的内容签名」。
 * 用于只 PUT 内容真正变化的那几份——改一笔账不该把含 base64 图片的 teacher.json 也重传一遍。
 * 存的是 hash（sha1Hash）而非签名明文，避免大信封撑爆 localStorage。
 */
const PUSHED_SIG_PREFIX = 'ewt.cloudSync.pushedSig.'

let autoPushTimer: ReturnType<typeof setTimeout> | null = null
let autoPushRunning = false

function readPushedSig(name: string): string {
  return localStorage.getItem(PUSHED_SIG_PREFIX + name) || ''
}

function writePushedSig(name: string, sig: string): void {
  localStorage.setItem(PUSHED_SIG_PREFIX + name, sig)
}

/** markDirty 后进入防抖队列；开关/凭据不满足时直接返回，零开销 */
function scheduleAutoPush(): void {
  try {
    const settings = useAppSettingsStore()
    if (!settings.cloudSyncEnabled || settings.cloudSyncAutoPush !== true) return
  } catch {
    // settings store 未就绪（极早期保存）→ 跳过，后续保存会再触发
    return
  }
  if (autoPushTimer) clearTimeout(autoPushTimer)
  autoPushTimer = setTimeout(() => {
    autoPushTimer = null
    void runAutoPush()
  }, AUTO_PUSH_DEBOUNCE_MS)
}

async function runAutoPush(): Promise<void> {
  if (autoPushRunning) return
  // 与定时轮询 / 手动同步 / 冲突处理互斥：等它们结束再说，否则会和 pullNow 互相打断
  if (status.value === 'pushing' || status.value === 'pulling' || status.value === 'conflict') {
    scheduleAutoPush()
    return
  }
  autoPushRunning = true
  try {
    await forcePushLocal(true)
  } finally {
    autoPushRunning = false
  }
}

function clearDirty(): void {
  localStorage.removeItem(DIRTY_KEY)
}

export function isDirty(): boolean {
  return localStorage.getItem(DIRTY_KEY) === '1'
}

// ===== 每份信封「上次同步时的云端 Last-Modified」记录 =====
//
// 为什么不能用全局 LAST_SYNC_KEY 来判断远端新旧：
// LAST_SYNC_KEY 在 pushNow 成功后会被写成 Date.now()（本机推送时刻），而外部工具
// （备份编辑技能 add_entry.py）改云端 JSON 时**只更新文件 mtime、不更新信封 pushedAt**。
// 于是「本机推送时刻」会一路超过「云端被外部修改的时刻」，pullNow 便永远命中
// 「dirty && remoteTs <= localTs → 跳过」分支，外部修改拉不下来，表现为
// 「同步后看见了新数据，过一会儿刷新又变回去」。
// 因此对每个信封单独记录上次同步时观察到的云端 mtime，用它来识别"云端是否被外部改过"。
const REMOTE_TS_PREFIX = 'ewt.cloudSync.remoteTs.'
// 容差：WebDAV 服务端与本机时钟可能有秒级~分钟级偏差，且本机推送后服务端写入的
// Last-Modified 会略晚于本机 pushedAt，留足容差避免把自己刚推的内容误判成外部修改。
const REMOTE_TS_TOLERANCE_MS = 60_000

function readRemoteTs(name: string): number {
  const raw = Number(localStorage.getItem(REMOTE_TS_PREFIX + name) || '0')
  return Number.isFinite(raw) ? raw : 0
}

function writeRemoteTs(name: string, ts: number): void {
  if (!Number.isFinite(ts) || ts <= 0) return
  localStorage.setItem(REMOTE_TS_PREFIX + name, String(ts))
}

function btoaSafe(s: string): string {
  // RFC 7617 Basic 推荐服务端支持 UTF-8 字符的 base64（btoa 只认 Latin-1）
  // 统一走 TextEncoder → Uint8Array → btoa(String.fromCharCode(...))，
  // 避免 unescape(encodeURIComponent) 在新浏览器警告/丢码，中文密码也能校验通过。
  if (typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(s)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  }
  try {
    return btoa(s)
  } catch {
    return btoa(unescape(encodeURIComponent(s)))
  }
}

// ========== WebDAV 通过同源代理请求（彻底避免 CORS）==========

type DavMethod = 'GET' | 'PUT' | 'MKCOL' | 'DELETE' | 'HEAD'

interface ProxyRequest {
  target: string
  method: DavMethod
  body?: string
}

/**
 * 走同源 /api/webdav-proxy：
 *   body.method = 真实 WebDAV 方法
 *   body.target = 完整目标 URL（含协议+host+path）
 *   Authorization 头用 X-Webdav-Auth 带基础凭证（避免预检）
 *   body.body = PUT 的 JSON 字符串（仅 PUT）
 */
async function proxyDav(targetUrl: string, method: DavMethod, username: string, password: string, body?: string): Promise<Response> {
  const payload: ProxyRequest = { target: targetUrl, method }
  if (body !== undefined) payload.body = body
  const proxyUrl = location.origin + PROXY_PATH
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webdav-Auth': 'Basic ' + btoaSafe(`${username}:${password}`)
    },
    body: JSON.stringify(payload)
  })
  return res
}

/**
 * 是否走「直连」（自建服务器）——**自动判断，无需用户配置**：
 *
 * 同步地址与当前页面**同源** ⇒ 是自己的服务器：浏览器可直连，无 CORS 预检（方案 A1）。
 * 否则 ⇒ 视为第三方 WebDAV（坚果云 / Nextcloud 等默认不返回 CORS 头），
 *        走同源代理 /api/webdav-proxy 转发。
 *
 * URL 为空或解析失败时保守返回 false（走代理）。
 */
function shouldUseDirect(syncUrl: string | undefined): boolean {
  if (!syncUrl) return false
  try {
    return new URL(syncUrl).origin === location.origin
  } catch {
    return false
  }
}

/**
 * 同步前置校验：URL、用户名、密码三者必填。
 *
 * 注意：直连模式（自建服务器）同样三者必填——
 * - 用户名 = 服务器上的个人目录名（一家人共用一台服务器时靠它隔离数据）
 * - 密码   = 服务端 auth_basic 的口令
 */
function hasSyncCredentials(s: {
  cloudSyncUrl?: string
  cloudSyncUsername?: string
  cloudSyncPassword?: string
}): boolean {
  return !!s.cloudSyncUrl && !!s.cloudSyncUsername && !!s.cloudSyncPassword
}

/**
 * 直连模式请求：直接对目标 URL 发真实 WebDAV 方法。
 * 用户名与密码均为空时**不发送** Authorization 头（自建服务器可配置为无需认证）。
 */
async function directDav(
  targetUrl: string,
  method: DavMethod,
  username: string,
  password: string,
  body?: string
): Promise<Response> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (username || password) {
    headers['Authorization'] = 'Basic ' + btoaSafe(`${username}:${password}`)
  }
  return await fetch(targetUrl, { method, headers, body })
}

/** 统一请求入口：按目标 URL 是否与页面同源，自动在「直连」与「同源代理」间分流 */
async function davRequest(
  targetUrl: string,
  method: DavMethod,
  username: string,
  password: string,
  body?: string
): Promise<Response> {
  if (shouldUseDirect(targetUrl)) return await directDav(targetUrl, method, username, password, body)
  return await proxyDav(targetUrl, method, username, password, body)
}

/** 从代理响应里解析诊断信息（非 2xx 时用），返回 {upstreamStatus, snippet, textBody} */
async function readDavDiagnostics(res: Response): Promise<{ upstreamStatus: string | null; snippet: string | null; textBody: string }> {
  const upstreamStatus = res.headers.get('X-Upstream-Status') || String(res.status)
  const snippetRaw = res.headers.get('X-Upstream-Body-Snippet')
  const snippet = snippetRaw
    ? decodeURIComponent(snippetRaw).replace(/\s+/g, ' ').trim().slice(0, 512)
    : null
  let textBody = ''
  try {
    textBody = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 512)
  } catch { /* noop: body already consumed by stream */ }
  return { upstreamStatus, snippet, textBody }
}

function davErrorLabel(method: string, upstreamStatus: string | null, snippet: string | null, textBody: string, fallbackStatus: number, direct = false): string {
  const st = upstreamStatus || String(fallbackStatus)
  const detail = snippet || textBody
  if (st === '401') {
    const base = direct
      ? `WebDAV ${method} ${st}：服务器要求身份验证，当前用户名/密码未被接受。`
      : `WebDAV ${method} ${st}：用户名或应用密码错误。`
    const tips = direct
      ? [
          '自建服务器用「服务器系统账号 + 系统密码」认证：用户名=服务器账号名，密码=该账号的登录密码',
          '同步路径为 域名/dav/<用户名>/easy-web-tab，用户名会拼进路径，需与实际系统账号完全一致',
          '若最近改过服务器系统密码，需用新密码重新生成 nginx 的 htpasswd（/etc/nginx/.ewt_sync_htpasswd_<用户名>）并 reload',
          '部分手机浏览器会把这个 401 弹成原生「登录」框：核对上面两点后，在「设置 → 云同步」更新密码重试',
          '云同步凭证只保存在本机、不随云同步，其他设备不会自动带上这组账号密码'
        ]
      : [
      '坚果云请使用"账户→安全选项→添加应用"生成的专用「应用密码」（不是登录密码）',
      '用户名通常是登录邮箱全拼，注意大小写',
      '路径格式应为 https://dav.jianguoyun.com/dav/ （尾部带斜杠）'
    ]
    if (!detail) return base + tips.map((t, i) => `\n${i + 1}. ${t}`).join('')
    return `${base}\n服务端返回：${detail}` + tips.map((t, i) => `\n${i + 1}. ${t}`).join('')
  }
  if (st === '403') {
    const base = `WebDAV ${method} ${st}：当前账号对该路径无写入权限。`
    return detail ? `${base}\n服务端返回：${detail}` : base
  }
  if (st === '404') return `WebDAV ${method} 404：资源不存在（首次使用是正常的）`
  if (st === '405') return `WebDAV ${method} 405：服务器不允许该方法（MKCOL/GET/PUT）`
  if (st === '409') return `WebDAV ${method} 409：父目录不存在，请确认 WebDAV URL 指向的根路径已在坚果云手动创建`
  if (st === '413' || st === '422' || st === '415') {
    const base = `WebDAV ${method} ${st}：请求被拒绝。`
    return detail ? `${base}\n服务端返回：${detail}` : base
  }
  if (st === '502' || st === '500') {
    const base = `WebDAV ${method} ${st}：代理请求失败，请确认开发/预览服务器已启用代理（npm run dev / serve）。`
    return detail ? `${base}\n错误详情：${detail}` : base
  }
  const base = `WebDAV ${method} ${st}：请求未成功。`
  return detail ? `${base}\n服务端返回：${detail}` : base
}

// ========== 内容 hash（双兜底：优先 SubtleCrypto SHA-1，非安全上下文退化到 32bit FNV-1a）==========

/** 递归排序 key 后 JSON 序列化——消除 key 顺序差异，使相同语义的数据 hash 一致 */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']'
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}'
}

/** 各信封通用签名：剔除 exportedAt/pushedAt/clientId 三个不稳定元数据字段后 stableStringify */
function envelopeSignature(data: Record<string, unknown>): string {
  const copy: Record<string, unknown> = { ...data }
  delete copy.exportedAt
  delete copy.pushedAt
  delete copy.clientId
  return stableStringify(copy)
}

/** workbench.json 额外剔除 prefs（设备级 localStorage 快照，不同设备天然不同，避免误判冲突） */
function workbenchSignature(data: WorkbenchSyncData): string {
  const copy: Record<string, unknown> = { ...(data as unknown as Record<string, unknown>) }
  delete copy.exportedAt
  delete copy.pushedAt
  delete copy.clientId
  delete copy.prefs
  return stableStringify(copy)
}

function sigNav(data: NavSyncData): string { return envelopeSignature(data as unknown as Record<string, unknown>) }
function sigIcons(data: IconsSyncData): string { return envelopeSignature(data as unknown as Record<string, unknown>) }
function sigBusiness(data: BusinessSyncData): string { return envelopeSignature(data as unknown as Record<string, unknown>) }
function sigStudent(data: StudentSyncData): string { return envelopeSignature(data as unknown as Record<string, unknown>) }
function sigTeacher(data: TeacherSyncData): string { return envelopeSignature(data as unknown as Record<string, unknown>) }
function sigSmart(data: SmartSyncData): string { return envelopeSignature(data as unknown as Record<string, unknown>) }
function sigBlog(data: BlogSyncData): string { return envelopeSignature(data as unknown as Record<string, unknown>) }
function sigBlogPrefs(data: BlogFrontSyncData): string { return envelopeSignature(data as unknown as Record<string, unknown>) }
function sigBooksPrefs(data: BooksPrefsSyncData): string { return envelopeSignature(data as unknown as Record<string, unknown>) }

/**
 * 计算本地与远程的总差异量（Σ|local_len - remote_len|）。
 * 差异总量 < 设置项 cloudSyncSilentThreshold（默认 1000）→ 视为微小差异，静默合并不弹框。
 * 阈值由用户在云同步设置页配置，0 表示永不静默合并（差异一律进入冲突流程）。
 */
function totalDiffSize(local: unknown, remote: unknown): number {
  try {
    const l = local !== undefined && local !== null ? stableStringify(local).length : 0
    const r = remote !== undefined && remote !== null ? stableStringify(remote).length : 0
    return Math.abs(l - r)
  } catch { return 0 }
}

/** workbench 字段级差异量（保留原 moduleDiffSize 行为，移除 business 字段） */
function workbenchDiffSize(local: WorkbenchSyncData, remote: WorkbenchSyncData): number {
  const keys: Array<keyof WorkbenchSyncData> = ['todos', 'notes', 'diary', 'countdowns', 'passwords', 'health', 'ledger', 'settings', 'pomodoro', 'habits', 'prefs']
  let total = 0
  for (const k of keys) {
    const lv = local[k]
    const rv = remote[k]
    try {
      const l = lv !== undefined ? stableStringify(lv).length : 0
      const r = rv !== undefined ? stableStringify(rv).length : 0
      total += Math.abs(l - r)
    } catch { /* ignore */ }
  }
  return total
}

// 注：密码在 IndexedDB 中是"整库用一个主密码加密"的单个密文串（savePasswords 里
// encrypt(JSON.stringify(passwords)) 后整体 idbPut），并非逐条加密，密文层面无法条目级合并。
// 同步策略（用户明确要求）：**密码永远云端覆盖本地** —— 由 mergeWorkbench 单向取云端实现，
// 拉取 / 静默合并 / 冲突解决选择云端这三条路径因此对密码行为一致，无需在此额外判定。

async function sha1Hash(text: string): Promise<string> {
  // SubtleCrypto 仅在 localhost / HTTPS / file:// 可用（浏览器定义）；
  // 生产环境如果部署在内网 HTTP IP，会抛 "SubtleCrypto only available in secure contexts"。
  // 这时退化 FNV-1a 32bit，虽然碰撞概率高但 600KB 同步文件级去重够用，且总比 hash 比较缺失强。
  if (typeof crypto !== 'undefined' && 'subtle' in crypto && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    try {
      const bytes = new TextEncoder().encode(text)
      const digest = await crypto.subtle.digest('SHA-1', bytes)
      const arr = new Uint8Array(digest)
      let hex = ''
      for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0')
      return 'sha1:' + hex
    } catch {
      /* fallback to FNV-1a below */
    }
  }
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
  }
  return 'fnv1a:' + (h >>> 0).toString(16).padStart(8, '0')
}

interface WebdavGetResult {
  data: unknown | null
  /** 响应头 Last-Modified 解析成的 ms（解析失败 = 0） */
  lastModifiedMs: number
  /** 原始 JSON 字符串（供 hash 比对，避免重复 fetch） */
  rawText: string
}

async function webdavGet(url: string, username: string, password: string): Promise<WebdavGetResult> {
  const res = await davRequest(url, 'GET', username, password)
  if (res.status === 404) return { data: null, lastModifiedMs: 0, rawText: '' }
  if (!res.ok) {
    const diag = await readDavDiagnostics(res)
    throw new Error(davErrorLabel('GET', diag.upstreamStatus, diag.snippet, diag.textBody, res.status, shouldUseDirect(url)))
  }
  const text = await res.text()
  let lastModifiedMs = 0
  const lm = res.headers.get('Last-Modified')
  if (lm) {
    const t = new Date(lm).getTime()
    if (!Number.isNaN(t)) lastModifiedMs = t
  }
  if (!text) return { data: null, lastModifiedMs, rawText: '' }
  return { data: JSON.parse(text), lastModifiedMs, rawText: text }
}

/**
 * 轻量 HEAD：只取云端文件的 Last-Modified，用于推送前探查是否被外部改过。
 * 刻意不用 webdavGet —— 7 份信封合计 3MB+，每次推送前全量下载代价过高。
 * 不支持 HEAD 或出错时保守返回 0：调用方会跳过该文件的保险检测，不影响主流程。
 */
async function webdavHead(url: string, username: string, password: string): Promise<number> {
  try {
    const res = await davRequest(url, 'HEAD', username, password)
    if (!res.ok) return 0
    const lm = res.headers.get('Last-Modified')
    if (!lm) return 0
    const t = new Date(lm).getTime()
    return Number.isNaN(t) ? 0 : t
  } catch {
    return 0
  }
}

async function webdavPut(url: string, username: string, password: string, body: string): Promise<void> {
  const res = await davRequest(url, 'PUT', username, password, body)
  if (!res.ok) {
    const diag = await readDavDiagnostics(res)
    throw new Error(davErrorLabel('PUT', diag.upstreamStatus, diag.snippet, diag.textBody, res.status, shouldUseDirect(url)))
  }
}

async function webdavDelete(url: string, username: string, password: string): Promise<void> {
  const res = await davRequest(url, 'DELETE', username, password)
  // 404 视作成功（文件本就不存在）
  if (res.ok || res.status === 404) return
  const diag = await readDavDiagnostics(res)
  throw new Error(davErrorLabel('DELETE', diag.upstreamStatus, diag.snippet, diag.textBody, res.status, shouldUseDirect(url)))
}

/**
 * 创建目录（MKCOL）
 *
 * 关于 405：坚果云在「目录已存在」时会对 MKCOL 回 405，属正常，故视作成功。
 * 但 Nginx 纯静态部署（未反代 /api/webdav-proxy，详情见 nginx.conf 注释）也会对
 * POST 回 405 —— 两者状态码相同，若无区分手段就会「假成功」：设置页测试连接打绿勾、
 * 云同步看起来正常，实际 GET/PUT 全链路失败。
 *
 * 判据：三个代理实现（vite dev / serve-with-rewrites / webdav-proxy-only）在**任何**
 * 响应里都会带 X-Upstream-Status 头；Nginx 自己生成的 405 绝不会带。据此区分来源。
 *
 * 直连模式例外：没有代理这一层，也就没有 X-Upstream-Status 头。此时 405 就是服务端
 * （自建 nginx）在说「目录已存在」，直接视作成功，不能套用上面的代理判据。
 *
 * 直连下的 409 同样放过：自建服务器按系统账号建目录（/home/<用户名>/easy-web-tab），
 * 新用户首次同步时父目录可能还没建 —— nginx 开了 `create_full_put_path on`，
 * 随后的 PUT 会自动把整条路径创建出来，MKCOL 失败不影响同步。
 */
async function webdavMkcol(url: string, username: string, password: string): Promise<void> {
  const res = await davRequest(url, 'MKCOL', username, password)
  if (res.ok) return
  if (res.status === 405 || res.status === 409) {
    // 直连（自建服务器）：405 = 目录已存在；409 = 父目录未建，随后的 PUT 会自动创建
    if (shouldUseDirect(url)) return
    if (res.status === 405) {
      if (res.headers.has('X-Upstream-Status')) return // 真·WebDAV 说目录已存在
      throw new Error(
        '云同步代理未生效：POST /api/webdav-proxy 返回 405，且缺少 X-Upstream-Status 响应头，' +
        '说明请求被静态服务器（Nginx）拒绝而非到达 WebDAV 服务。' +
        '请在 Nginx 中反代 /api/webdav-proxy 到 webdav 代理服务（默认 127.0.0.1:16719）。'
      )
    }
    // 代理模式下的 409 是真错（如坚果云根路径没建），落到下面统一报错
  }
  const diag = await readDavDiagnostics(res)
  throw new Error(davErrorLabel('MKCOL', diag.upstreamStatus, diag.snippet, diag.textBody, res.status, shouldUseDirect(url)))
}

/**
 * 目录名安全化：直连模式下用户名会成为 URL 路径片段（自建服务器的个人目录名）。
 *
 * 允许字符集对齐 **Linux 系统用户名**（自建服务器按系统账号建目录，见 cloud-sync-selfhosted-plan.md §12）：
 * 字母、数字、`.`、`_`、`-`（`useradd` 的合法字符集是 `[a-z_][a-z0-9_-]*[$]?`）。
 * 其余字符（含 `/`）一律剔除，并显式丢弃 `.`/`..`，避免路径穿越与非法路径。
 */
function sanitizeDirName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, '')
  return cleaned === '.' || cleaned === '..' ? '' : cleaned
}

/**
 * 同步目录 URL。
 *
 * 直连模式（自建服务器）且填了用户名时：**用户名即个人目录名**，插在基础 URL 与
 * easy-web-tab 之间，形如 https://域名/dav/sifujiang/easy-web-tab。
 * 这样一家人共用一台服务器时，各人数据天然隔离。
 *
 * 代理模式（第三方 WebDAV：坚果云等）保持原样：基础 URL + /easy-web-tab
 * （第三方服务的目录与用户名无关，不能拼用户名）。
 */
function dirUrl(base: string, username?: string): string {
  const clean = base.replace(/\/$/, '')
  const userSeg = shouldUseDirect(base) && username ? `/${sanitizeDirName(username)}` : ''
  const withUser = `${clean}${userSeg}`
  return withUser.endsWith(`/${DATA_DIR}`) ? withUser : `${withUser}/${DATA_DIR}`
}

/** 探测连接 + 确保 easy-web-tab 目录存在（v10 改为只 MKCOL 探目录，不再 GET backup.json） */
export async function testConnection(
  url: string,
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  if (!url || !username || !password) return { ok: false, error: 'URL / 用户名 / 应用密码不能为空' }
  try {
    const dir = dirUrl(url, username)
    await webdavMkcol(dir, username, password)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '连接失败'
    const hint = msg.includes('Failed to fetch')
      ? (shouldUseDirect(url)
        ? '请求失败：直连（同源）模式下无法访问该地址。请确认 URL 正确、服务器已启动，且用户名对应的目录已创建且在白名单内。'
        : '请求失败：请确认本页面通过 Vite dev(npm run dev) 或内置服务(npm run serve) 打开，以启用 WebDAV 代理。')
      : msg
    return { ok: false, error: hint }
  }
}

// ========== 字段级合并辅助函数 ==========

/**
 * 按 idKey 做并集（union）；同 id 时若 tsKey 存在则取该字段较大者，
 * ISO 字符串用字符串比较、number 用数值比较；tsKey 不存在则取本地。
 * 对 undefined/null 入参用空数组兜底。
 */
function mergeById<T>(local: T[] | undefined | null, remote: T[] | undefined | null, idKey: keyof T, tsKey?: keyof T): T[] {
  const l = local ?? []
  const r = remote ?? []
  const map = new Map<string, T>()
  for (const item of l) map.set(String(item[idKey]), item)
  for (const item of r) {
    const id = String(item[idKey])
    const existing = map.get(id)
    if (!existing) {
      map.set(id, item)
    } else if (tsKey) {
      const lTs = existing[tsKey]
      const rTs = item[tsKey]
      let rNewer = false
      if (typeof lTs === 'number' && typeof rTs === 'number') {
        rNewer = rTs > lTs
      } else if (typeof lTs === 'string' && typeof rTs === 'string') {
        rNewer = rTs > lTs
      }
      if (rNewer) map.set(id, item)
    }
  }
  return [...map.values()]
}

/** 专为 pomodoro.records：按 date 去重，同 date 取 workSessions 较大者。 */
function mergeByDateWithMax<T extends { date: string; workSessions: number }>(local: T[] | undefined, remote: T[] | undefined): T[] {
  const l = local ?? []
  const r = remote ?? []
  const map = new Map<string, T>()
  for (const item of l) map.set(item.date, item)
  for (const item of r) {
    const existing = map.get(item.date)
    if (!existing) {
      map.set(item.date, item)
    } else if (item.workSessions > existing.workSessions) {
      map.set(item.date, item)
    }
  }
  return [...map.values()]
}

/** 多日志本下：同 (journalId, date) 才视为同一天，保留 updatedAt（或 createdAt）最新的一条（避免不同日志本同日条目互相覆盖）。 */
function dedupeByJournalDateKeepNewest<T extends { journalId?: string; date: string; updatedAt?: string; createdAt?: string; id: string }>(arr: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of arr) {
    const key = `${item.journalId ?? ''}::${item.date}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, item)
    } else {
      const exTs = existing.updatedAt ?? existing.createdAt ?? ''
      const itemTs = item.updatedAt ?? item.createdAt ?? ''
      if (itemTs > exTs) map.set(key, item)
    }
  }
  return [...map.values()]
}

// ========== 模块级合并函数（workbench.json 复用） ==========

function mergeTodos(l: WorkbenchTodo[], r: WorkbenchTodo[]): WorkbenchTodo[] {
  return mergeById(l ?? [], r ?? [], 'id', 'updatedAt')
}

function mergeNotes(l: NoteData | undefined, r: NoteData | undefined): NoteData {
  const lc = l?.categories ?? []
  const rc = r?.categories ?? []
  const categories = mergeById(lc, rc, 'id') // 同 id 取本地

  const ln = l?.notes ?? []
  const rn = r?.notes ?? []
  const notes = mergeById(ln, rn, 'id', 'updatedAt').map(note => {
    if (note.type !== 'timeline') return note
    const localNote = ln.find(n => n.id === note.id)
    const remoteNote = rn.find(n => n.id === note.id)
    if (localNote?.entries && remoteNote?.entries) {
      return { ...note, entries: mergeById(localNote.entries, remoteNote.entries, 'id', 'createdAt') }
    }
    return note
  })
  return { categories, notes }
}

function mergeDiary(l: DiaryData | undefined, r: DiaryData | undefined): DiaryData {
  const lj = l?.journals ?? []
  const rj = r?.journals ?? []
  // 日志本按 id 合并（同 id 取本地），保证多日志本结构不丢
  const journals = mergeById(lj, rj, 'id')
  const le = l?.entries ?? []
  const re = r?.entries ?? []
  // 条目按 id + updatedAt 合并，去重键改为 (journalId, date) 复合键（多日志本下同日均可存在）
  return { journals, entries: dedupeByJournalDateKeepNewest(mergeById(le, re, 'id', 'updatedAt')) }
}

function mergeCountdowns(l: Countdown[], r: Countdown[]): Countdown[] {
  return mergeById(l ?? [], r ?? [], 'id', 'updatedAt')
}

function mergeHealth(l: HealthData | undefined, r: HealthData | undefined): HealthData {
  const lr = l?.records ?? { exercise: [], diet: [], sleep: [], weight: [] }
  const rr = r?.records ?? { exercise: [], diet: [], sleep: [], weight: [] }
  const records = {
    exercise: mergeById(lr.exercise ?? [], rr.exercise ?? [], 'id', 'updatedAt'),
    diet: mergeById(lr.diet ?? [], rr.diet ?? [], 'id', 'updatedAt'),
    sleep: mergeById(lr.sleep ?? [], rr.sleep ?? [], 'id', 'updatedAt'),
    weight: mergeById(lr.weight ?? [], rr.weight ?? [], 'id', 'updatedAt')
  }
  const lp: HealthData['plans'] = l?.plans ?? {}
  const rp: HealthData['plans'] = r?.plans ?? {}
  const plans: HealthData['plans'] = {}
  for (const m of ['exercise', 'diet', 'sleep'] as const) {
    const lPlan = lp[m]
    const rPlan = rp[m]
    if (lPlan && rPlan) {
      plans[m] = lPlan.updatedAt >= rPlan.updatedAt ? lPlan : rPlan
    } else {
      plans[m] = lPlan ?? rPlan
    }
  }
  const height = l?.height ?? r?.height
  return { height, plans, records }
}

/**
 * 记账多账本：合并下沉到 ledgerCore.mergeLedgerStore（账本按「年份+序号」并集 + 账本内逐字段并集），此处只转发。
 * 注意：不能直接按扁平 {categories, entries} 合并——那是多账本之前的旧结构，
 * 对新信封（带 ledgers）会取到 undefined 而把两端数据合并成空，造成静默清空。
 */
function mergeLedger(
  l: LedgerStoreData | LedgerData | undefined,
  r: LedgerStoreData | LedgerData | undefined
): LedgerStoreData {
  return mergeLedgerStore(l, r)
}

function mergeHabits(l: HabitsData | undefined, r: HabitsData | undefined): HabitsData {
  return {
    habits: mergeById(l?.habits ?? [], r?.habits ?? [], 'id', 'createdAt'),
    records: mergeById(l?.records ?? [], r?.records ?? [], 'id', 'createdAt')
  }
}

/** business.json：账本容器合并下沉到 businessCore.mergeBusinessStore（账本按年份并集 + 账本内逐字段并集），此处只包装信封 */

function mergePomodoro(l: PomodoroData | undefined, r: PomodoroData | undefined): PomodoroData {
  return {
    settings: l?.settings ?? r?.settings ?? { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, sessionsPerCycle: 4 },
    records: mergeByDateWithMax(l?.records ?? [], r?.records ?? [])
  }
}

/** 逐 key 合并 prefs（值均为 JSON 字符串）；单个 key 损坏不中断整体合并。 */
function mergePrefs(l: Record<string, string> | undefined, r: Record<string, string> | undefined): Record<string, string> {
  const local = l ?? {}
  const remote = r ?? {}
  const out: Record<string, string> = {}
  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)])

  for (const key of allKeys) {
    try {
      const lv = local[key]
      const rv = remote[key]
      // 远端有而本地缺失 → 补入
      if (lv === undefined) { if (rv !== undefined) out[key] = rv; continue }
      // 本地有而远端缺失 → 保留本地
      if (rv === undefined) { out[key] = lv; continue }

      // user-sites: JSON.parse 后按 url 去重，同 url 取 updatedAt 较新者
      if (key === 'user-sites') {
        try {
          const ls = JSON.parse(lv) as { url: string; updatedAt?: string }[]
          const rs = JSON.parse(rv) as { url: string; updatedAt?: string }[]
          const map = new Map<string, { url: string; updatedAt?: string }>()
          for (const s of ls) map.set(s.url, s)
          for (const s of rs) {
            const ex = map.get(s.url)
            if (!ex) map.set(s.url, s)
            else if ((s.updatedAt ?? '') > (ex.updatedAt ?? '')) map.set(s.url, s)
          }
          out[key] = JSON.stringify([...map.values()])
        } catch { out[key] = lv } // 解析失败取本地
        continue
      }

      // user-categories: JSON.parse 后按 id 去重，内置不丢（同 id 取本地）
      if (key === 'user-categories') {
        try {
          const lc = JSON.parse(lv) as { id: string }[]
          const rc = JSON.parse(rv) as { id: string }[]
          const map = new Map<string, { id: string }>()
          for (const c of lc) map.set(c.id, c)
          for (const c of rc) { if (!map.has(c.id)) map.set(c.id, c) }
          out[key] = JSON.stringify([...map.values()])
        } catch { out[key] = lv }
        continue
      }

      // 带结构的数组型 key：按 id 或按值去重
      const ARRAY_KEYS = [
        'user-search-engines', 'built-in-engine-overrides', 'built-in-engine-default',
        'user-todo-categories', 'user-todo-tab-categories',
        'user-countdown-categories', 'user-countdown-tab-categories',
        'user-deleted-legacy-ids'
      ]
      if (ARRAY_KEYS.includes(key)) {
        try {
          const la = JSON.parse(lv)
          const ra = JSON.parse(rv)
          if (Array.isArray(la) && Array.isArray(ra)) {
            const hasId = la.some((x: unknown) => x && typeof x === 'object' && 'id' in (x as object))
            if (hasId) {
              const map = new Map<string, unknown>()
              for (const item of la) map.set(String((item as { id: string }).id), item)
              for (const item of ra) {
                const id = String((item as { id: string }).id)
                if (!map.has(id)) map.set(id, item)
              }
              out[key] = JSON.stringify([...map.values()])
            } else {
              const set = new Set(la as (string | number)[])
              for (const item of ra) set.add(item)
              out[key] = JSON.stringify([...set])
            }
          } else {
            out[key] = lv // 非数组取本地
          }
        } catch { out[key] = lv }
        continue
      }

      // 非数组型 key（user-theme / user-background / user-countdown-sort 等）：取本地
      out[key] = lv
    } catch {
      // 单 key 损坏不影响其他 key
      if (local[key] !== undefined) out[key] = local[key]
      else if (remote[key] !== undefined) out[key] = remote[key]!
    }
  }
  return out
}

// ========== 各信封合并入口 ==========

/** nav.json：复用 mergePrefs（与 workbench.json 的 prefs 同一逻辑） */
function mergeNav(local: NavSyncData, remote: NavSyncData): NavSyncData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    clientId: getClientId(),
    prefs: mergePrefs(local.prefs, remote.prefs)
  }
}

/** icons.json：按 id 去重，同 id 取 createdAt 较新者 */
function mergeIcons(local: IconsSyncData, remote: IconsSyncData): IconsSyncData {
  const map = new Map<string, IconsSyncData['icons'][number]>()
  for (const icon of [...(local.icons ?? []), ...(remote.icons ?? [])]) {
    const existing = map.get(icon.id)
    if (!existing) {
      map.set(icon.id, icon)
    } else if ((icon.createdAt ?? '') > (existing.createdAt ?? '')) {
      map.set(icon.id, icon)
    }
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    clientId: getClientId(),
    icons: [...map.values()]
  }
}

/**
 * workbench.json 合并入口：调用各模块合并函数组装结果，修正元数据字段。
 * 纯函数——不触碰 IDB / localStorage。
 * 例外（不并集、单向覆盖）：密码 + 密码身份整体取云端；settings 整体取本地。
 * 注意：与旧 mergeData 区别——不含 business（独立走 business.json），settings 为 AppSettingsDataNoCloudSync。
 */
function mergeWorkbench(local: WorkbenchSyncData, remote: WorkbenchSyncData): WorkbenchSyncData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    clientId: getClientId(),
    todos: mergeTodos(local.todos, remote.todos),
    notes: mergeNotes(local.notes, remote.notes),
    diary: mergeDiary(local.diary, remote.diary),
    countdowns: mergeCountdowns(local.countdowns, remote.countdowns),
    // 密码整体取云端（永不拆分、永不并集），原因详见注释
    passwords: remote.passwords ?? local.passwords,
    passwordsSalt: remote.passwordsSalt ?? local.passwordsSalt,
    passwordVerification: remote.passwordVerification ?? local.passwordVerification,
    health: mergeHealth(local.health, remote.health),
    ledger: mergeLedger(local.ledger, remote.ledger),
    // settings 整体保留本地（本地 settings 不含 cloudSync* 5 字段，由 importWorkbenchData 合并本机凭证）
    settings: local.settings,
    pomodoro: mergePomodoro(local.pomodoro as PomodoroData | undefined, remote.pomodoro as PomodoroData | undefined),
    habits: mergeHabits(local.habits as HabitsData | undefined, remote.habits as HabitsData | undefined),
    prefs: mergePrefs(local.prefs, remote.prefs),
    // 家谱：本地优先按 id 合并（mergeFamily 内部处理 updatedAt 较新者胜 + 补缺失）
    family: mergeFamily(local.family, remote.family)
    // pushedAt 不设——由后续 pushNow 写入
  }
}

/** business.json：复用 mergeBusinessStore（账本按年份并集 + 账本内逐字段并集），包装信封 */
function mergeBusinessEnvelope(local: BusinessSyncData, remote: BusinessSyncData): BusinessSyncData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    clientId: getClientId(),
    business: mergeBusinessStore(local?.business, remote?.business)
  }
}

/**
 * student.json 合并：递归合并对象/数组。
 * 数组走 mergeById（按 id，同 id 取 updatedAt 较新者，缺失则取 createdAt）；
 * 对象逐字段递归合并；单值取云端（无时戳可比较）。
 */
function mergeStudent(local: StudentSyncData, remote: StudentSyncData): StudentSyncData {
  const out: StudentSyncData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    clientId: getClientId()
  }
  const FIELD_KEYS: Array<keyof StudentSyncData> = [
    'studentSettings', 'studentHabits', 'studentCountdowns',
    'homework', 'timetable', 'plans', 'review', 'mistakes', 'reading',
    'achievements', 'rewards', 'parentTasks', 'studentImages', 'education', 'studentGrades', 'goals'
  ]
  for (const key of FIELD_KEYS) {
    const lv = local[key]
    const rv = remote[key]
    if (lv === undefined && rv === undefined) continue
    if (key === 'studentSettings' || key === 'timetable') {
      // 本地优先：进入合并时本地 dirty（用户刚改的学段/学生信息/学生菜单/课程表）必须保留，
      // 否则会被云端旧版整份覆盖、再被回推上云，表现即「改了没同步」。
      // 课程表 schedule 是按 day/period 定位的二维数组，无法走按 id 合并，整体取本地避免结构损坏。
      // 远端独有字段在各自缺失时仍由下方 mergeStudentValue 补位。
      ;(out as unknown as Record<string, unknown>)[key] = lv ?? rv
    } else {
      ;(out as unknown as Record<string, unknown>)[key] = mergeStudentValue(lv, rv)
    }
  }
  return out
}

function mergeStudentValue(lv: unknown, rv: unknown): unknown {
  // 都是数组
  if (Array.isArray(lv) && Array.isArray(rv)) {
    // 基元数组（元素为 string/number/boolean/null 等非对象）：不能用 mergeById('id')，
    // 本地优先（本地 dirty 时用户刚做的改动应保留）
    const isPrimitiveArr = (arr: unknown[]) =>
      arr.length === 0 || arr.every(x => x === null || typeof x !== 'object')
    if (isPrimitiveArr(lv) && isPrimitiveArr(rv)) {
      return lv.length > 0 ? lv : rv
    }
    // 对象数组 → mergeById（按 id 主键 + updatedAt 时间戳，本地先入 map，远端仅补缺失 id）
    return mergeById(
      lv as Array<{ id: string; updatedAt?: string; createdAt?: string }>,
      rv as Array<{ id: string; updatedAt?: string; createdAt?: string }>,
      'id', 'updatedAt'
    )
  }
  // 都是对象（非数组）→ 逐字段递归合并
  if (lv && typeof lv === 'object' && rv && typeof rv === 'object' && !Array.isArray(lv) && !Array.isArray(rv)) {
    const lo = lv as Record<string, unknown>
    const ro = rv as Record<string, unknown>
    const out: Record<string, unknown> = {}
    const allKeys = new Set([...Object.keys(lo), ...Object.keys(ro)])
    for (const k of allKeys) {
      out[k] = mergeStudentValue(lo[k], ro[k])
    }
    return out
  }
  // 单值（string/number/boolean/null/undefined）→ 本地优先
  return lv ?? rv
}

/** 按 id 并集去重：同 id 保留本地（进入合并时本地 dirty，用户刚做的改动优先） */
function unionById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const out: T[] = [...local]
  const seen = new Set(local.map((x) => x.id))
  for (const r of remote) {
    if (!seen.has(r.id)) out.push(r)
  }
  return out
}

/**
 * teacher.json 合并：以「学期 × 班级」数据桶为最小单位。
 * 教师数据内含座位网格、点名历史、奖励记录（含 base64 图片）等无法按 id 粒度安全合并的结构，
 * 因此：两端都有的班级 → 本地桶整体优先（本地 dirty，用户刚做的改动必须保留）；
 * 仅远端有的班级 → 补入，避免丢掉其他设备上建的班；
 * 学期 / 班级 / 任教关系等列表按 id 并集去重。
 */
function mergeTeacher(local: TeacherSyncData, remote: TeacherSyncData): TeacherSyncData {
  const lv = local.teacher as TeacherData | undefined
  const rv = remote.teacher as TeacherData | undefined
  const base = { version: 1 as const, exportedAt: new Date().toISOString(), clientId: getClientId() }
  if (!lv) return { ...base, teacher: rv }
  if (!rv) return { ...base, teacher: lv }
  const lGroups = (lv.groups ?? {}) as Record<string, Record<string, unknown>>
  const rGroups = (rv.groups ?? {}) as Record<string, Record<string, unknown>>
  // 删除标记并集：任一侧删过的学期/班级，合并后都要剔除（否则被远端旧数据「复活」）
  const lTomb = lv.tombstones ?? {}
  const rTomb = rv.tombstones ?? {}
  const tomb = {
    semesters: new Set([...(lTomb.semesters ?? []), ...(rTomb.semesters ?? [])]),
    classes: new Set([...(lTomb.classes ?? []), ...(rTomb.classes ?? [])])
  }
  const semesters = unionById(lv.semesters ?? [], rv.semesters ?? []).filter((s) => !tomb.semesters.has(s.id))
  const classes = unionById(lv.classes ?? [], rv.classes ?? []).filter((c) => !tomb.classes.has(c.id))
  const assignments = unionById(lv.assignments ?? [], rv.assignments ?? []).filter(
    (a) => !tomb.semesters.has(a.semesterId) && !tomb.classes.has(a.classId)
  )
  // 合并双方的班级数据桶，剔除被删学期/班级（同班级本地桶优先）
  const groups: Record<string, Record<string, unknown>> = {}
  for (const semId of Object.keys({ ...rGroups, ...lGroups })) {
    if (tomb.semesters.has(semId)) continue
    const inR = rGroups[semId] ?? {}
    const inL = lGroups[semId] ?? {}
    const inner: Record<string, unknown> = {}
    for (const clsId of Object.keys({ ...inR, ...inL })) {
      if (tomb.classes.has(clsId)) continue
      inner[clsId] = { ...(inR[clsId] ?? {}), ...(inL[clsId] ?? {}) }
    }
    if (Object.keys(inner).length) groups[semId] = inner
  }
  const merged = {
    ...lv,
    semesters,
    classes,
    assignments,
    groups: groups as unknown as TeacherData['groups'],
    // 保留双方删除记录，确保删除跨设备传播、且不会被下一次并集重新加回
    tombstones: { semesters: [...tomb.semesters], classes: [...tomb.classes] }
  }
  return { ...base, teacher: merged }
}

/**
 * smart.json 合并：逐键处理，键集合见 SMART_PREFS_KEYS。
 * - 技能库 / 提示词库：数组按 id 取 updatedAt 新者（与业务数据同款「新者胜」）
 * - 菜单配置 / 技能分类：只有一份的小配置，以本地为准（本地 dirty = 用户刚改过）
 * 结构解析失败时不抛错，直接退回「保留本地」，避免一封坏信封阻断整次同步。
 */
function mergeSmart(local: SmartSyncData, remote: SmartSyncData): SmartSyncData {
  const lp = local.prefs ?? {}
  const rp = remote.prefs ?? {}
  const out: Record<string, string> = {}
  for (const key of new Set([...Object.keys(lp), ...Object.keys(rp)])) {
    const lv = lp[key]
    const rv = rp[key]
    if (lv === undefined) {
      if (rv !== undefined) out[key] = rv
      continue
    }
    if (rv === undefined) {
      out[key] = lv
      continue
    }
    out[key] = mergeSmartPref(key, lv, rv)
  }
  return { version: 1, exportedAt: new Date().toISOString(), clientId: getClientId(), prefs: out }
}

function mergeSmartPref(key: string, lv: string, rv: string): string {
  if (key === 'smart-skills' || key === 'smart-prompts' || key === 'smart-workflows') {
    const merged = mergeSmartListById(lv, rv)
    if (merged !== null) return merged
  }
  return lv
}

/** 按 id 合并两个 [{ id, updatedAt }] 数组，同 id 取 updatedAt 新者；解析失败返回 null 由调用方回落 */
function mergeSmartListById(lv: string, rv: string): string | null {
  try {
    const l = JSON.parse(lv) as unknown
    const r = JSON.parse(rv) as unknown
    if (!Array.isArray(l) || !Array.isArray(r)) return null
    const map = new Map<string, Record<string, unknown>>()
    for (const raw of [...l, ...r]) {
      if (!raw || typeof raw !== 'object') continue
      const it = raw as Record<string, unknown>
      const id = typeof it.id === 'string' ? it.id : ''
      if (!id) continue
      const prev = map.get(id)
      if (!prev) {
        map.set(id, it)
        continue
      }
      const pv = typeof prev.updatedAt === 'number' ? prev.updatedAt : 0
      const cv = typeof it.updatedAt === 'number' ? it.updatedAt : 0
      if (cv >= pv) map.set(id, it)
    }
    return JSON.stringify([...map.values()])
  } catch {
    return null
  }
}

// ========== 导入后各 store reload ==========

async function reloadSmartStores(): Promise<void> {
  try {
    const { useSmartStore } = await import('../stores/smart')
    const s = useSmartStore()
    // 先刷新内存里的 prefs（smart.json 写的是 IDB nav store，需重新读一遍）
    await useNavPrefs().refreshAfterImport()
    await Promise.all([s.reloadSkills(), s.reloadPrompts(), s.reloadWorkflows(), s.reloadMenu(), s.reloadCategories(), s.reloadWorkflowCategories(), s.reloadPromptCategories()])
  } catch {
    // store 未就绪（首次同步早于智能工作台挂载）→ 静默跳过，下次进入页面会从 IDB 自然读取
  }
}

async function reloadWorkbenchStores(): Promise<void> {
  // 惰性导入避免循环依赖（各 store 在 WorkbenchView 里已 import，此处用动态导入走 onMounted init）
  // 例外：settings store 走**静态导入**——它已被 20+ 处组件静态引入，动态 import 不会把它移出主 chunk，
  // 反而触发 INEFFECTIVE_DYNAMIC_IMPORT 警告（同一模块被静态+动态混合引入时的标准告警）。
  const [{ useWorkbenchTodosStore }, { useWorkbenchNotesStore }, { useWorkbenchDiaryStore }, { useCountdownsStore }, { useWorkbenchHealthStore }, { useWorkbenchLedgerStore }, { useWorkbenchPomodoroStore }, { useWorkbenchHabitsStore }, { useGenealogyStore }] = await Promise.all([
    import('../stores/workbenchTodos'),
    import('../stores/workbenchNotes'),
    import('../stores/workbenchDiary'),
    import('../stores/countdowns'),
    import('../stores/workbenchHealth'),
    import('../stores/workbenchLedger'),
    import('../stores/workbenchPomodoro'),
    import('../stores/workbenchHabits'),
    import('../stores/genealogy')
  ])
  await Promise.all([
    useWorkbenchTodosStore().loadTodos(),
    useWorkbenchNotesStore().loadNotes(),
    useWorkbenchDiaryStore().loadDiary(),
    useCountdownsStore().loadCountdowns(),
    useWorkbenchHealthStore().loadHealth(),
    useWorkbenchLedgerStore().loadLedger(),
    useWorkbenchPomodoroStore().loadPomodoro(),
    useWorkbenchHabitsStore().loadHabits(),
    useAppSettingsStore().initSettings(),
    useGenealogyStore().load()
  ])
}

async function reloadBusinessStore(): Promise<void> {
  const [{ useWorkbenchBusinessStore }] = await Promise.all([import('../stores/workbenchBusiness')])
  await useWorkbenchBusinessStore().loadBusiness()
}

async function reloadStudentStores(): Promise<void> {
  // 学生各模块 store 全量 reload（数据被云端覆盖后刷新 Vue 状态）
  const [
    { useStudentSettingsStore }, { useStudentHabitsStore },
    { useStudentExamStore }, { useStudentHomeworkStore },
    { useStudentTimetableStore }, { useStudentPlanStore }, { useStudentReviewStore },
    { useStudentMistakesStore }, { useStudentReadingStore }, { useStudentAchievementsStore },
    { useStudentRewardsStore }, { useStudentParentTasksStore },     { useStudentEducationStore },
    { useStudentGradesStore }, { useStudentGoalsStore }
  ] = await Promise.all([
    import('../stores/studentSettings'),
    import('../stores/studentHabits'),
    import('../stores/studentExam'),
    import('../stores/studentHomework'),
    import('../stores/studentTimetable'),
    import('../stores/studentPlan'),
    import('../stores/studentReview'),
    import('../stores/studentMistakes'),
    import('../stores/studentReading'),
    import('../stores/studentAchievements'),
    import('../stores/studentRewards'),
    import('../stores/studentParentTasks'),
    import('../stores/studentEducation'),
    import('../stores/studentGrades'),
    import('../stores/studentGoals')
  ])
  await Promise.all([
    useStudentSettingsStore().loadSettings(true),
    useStudentHabitsStore().loadHabits(),
    useStudentExamStore().loadExams(),
    useStudentHomeworkStore().loadHomework(),
    useStudentTimetableStore().loadTimetable(),
    useStudentPlanStore().loadPlans(),
    useStudentReviewStore().loadReview(),
    useStudentMistakesStore().loadMistakes(),
    useStudentReadingStore().loadReading(),
    useStudentAchievementsStore().loadAchievements(),
    useStudentRewardsStore().loadRewards(),
    useStudentParentTasksStore().loadTasks(),
    useStudentEducationStore().loadEducation(),
    useStudentGradesStore().loadGrades(),
    useStudentGoalsStore().loadGoals()
  ])
}

async function reloadNavStores(): Promise<void> {
  // nav.json 拉取写回 nav store（IndexedDB）后，统一刷新各消费 store（站点/主题/背景/站点外观）
  await useNavPrefs().refreshAfterImport()
}

async function reloadIconsStores(): Promise<void> {
  try {
    const { useIconsStore } = await import('../stores/icons')
    await useIconsStore().reloadCustomIcons()
  } catch {
    // 同上：store 未就绪时静默跳过
  }
}

async function reloadTeacherStores(): Promise<void> {
  try {
    const { useTeacherStore } = await import('../stores/teacher')
    await useTeacherStore().loadTeacher()
  } catch {
    // store 未就绪（首次同步早于教师页挂载）→ 静默跳过，下次进入教师工作台会从 IDB 自然读取
  }
}

async function reloadBlogStores(): Promise<void> {
  try {
    const { useBlogStore } = await import('../stores/blog')
    await useBlogStore().loadBlog()
  } catch {
    // 同上：store 未就绪（首次同步早于博客后台挂载）→ 静默跳过，进入后台时自然从 IDB 读取
  }
}

/**
 * 博客前台偏好（收藏 / 最近阅读）拉取后，把 nav store 内的最新值灌进单例 ref。
 * 偏好是「本机浏览轨迹」，走 blogFrontPrefs 单例而非 Pinia store，故此处直接读 IDB 后 apply。
 */
async function reloadBlogPrefsStores(): Promise<void> {
  try {
    const raw = await idbGetKey<string>('nav', BLOG_PREFS_NAV_KEY)
    if (typeof raw !== 'string') return
    const parsed = JSON.parse(raw) as Partial<BlogFrontSyncData>
    const { applyBlogFrontPrefs } = await import('./blogFrontPrefs')
    applyBlogFrontPrefs(parsed.prefs ?? {})
  } catch {
    // store / 解析失败 → 静默跳过，下次进入博客前台时由 initBlogFrontPrefs 自然从 IDB 读取
  }
}

async function reloadAllStores(): Promise<void> {
  await Promise.all([
    reloadWorkbenchStores(),
    reloadBusinessStore(),
    reloadStudentStores(),
    reloadTeacherStores(),
    reloadSmartStores(),
    reloadNavStores(),
    reloadIconsStores(),
    reloadBlogStores(),
    reloadBlogPrefsStores(),
    reloadBooksPrefs()
  ])
}

// ========== 推送前的本地退化检查 ==========

/**
 * nav.json 的本地健康检查：user-sites 站点数相比会话基线骤降 → 疑似数据被清空。
 * 返回 null = 健康；返回字符串 = 拦截原因。
 *
 * 基线由 navDataGuard 维护，**只在显式用户改动时推进**，因此：
 *   - 用户真的删掉一批站点 → 基线跟着降 → 不拦；
 *   - 存储层掉链子导致站点消失 → 基线没动 → 拦下。
 */
function guardNavUserSites(local: unknown): string | null {
  const prefs = (local as { prefs?: Record<string, string> } | null)?.prefs
  if (!prefs) return null
  // 用户在 UI 上手动整理过站点 → 眼前这份就是他认可的数据，不再用历史基线拦他
  // （与 sites.ts 的写盘守卫共用同一标志，避免「本地写成功但推送被拦」的死锁）
  if (isNavExplicitMutationActive()) return null
  const verdict = checkUserSitesAgainstBaseline(prefs['user-sites'], readBaseline())
  return verdict.tripped ? verdict.reason : null
}

// ========== 文件配置表 ==========

const FILE_CONFIGS: FileConfig[] = [
  {
    name: 'nav.json',
    exportLocal: () => exportNav(),
    importRemote: async (data) => { await importNavData(data as NavSyncData); return undefined },
    signature: (data) => sigNav(data as NavSyncData),
    merge: (l, r) => mergeNav(l as NavSyncData, r as NavSyncData),
    reload: reloadNavStores,
    diffSize: (l, r) => totalDiffSize(l, r),
    // 站点数较基线骤降 → 本机数据疑似被清空，禁止把这份残缺内容推上云
    guardLocal: (local) => guardNavUserSites(local)
  },
  {
    name: 'icons.json',
    exportLocal: () => exportIcons(),
    importRemote: async (data) => { await importIconsData(data as IconsSyncData); return undefined },
    signature: (data) => sigIcons(data as IconsSyncData),
    merge: (l, r) => mergeIcons(l as IconsSyncData, r as IconsSyncData),
    reload: reloadIconsStores,
    diffSize: (l, r) => totalDiffSize(l, r)
  },
  {
    name: 'workbench.json',
    exportLocal: () => exportWorkbench(),
    importRemote: (data) => importWorkbenchData(data as WorkbenchSyncData),
    signature: (data) => workbenchSignature(data as WorkbenchSyncData),
    merge: (l, r) => mergeWorkbench(l as WorkbenchSyncData, r as WorkbenchSyncData),
    reload: reloadWorkbenchStores,
    diffSize: (l, r) => workbenchDiffSize(l as WorkbenchSyncData, r as WorkbenchSyncData)
  },
  {
    name: 'business.json',
    exportLocal: () => exportBusiness(),
    importRemote: async (data) => { await importBusinessData(data as BusinessSyncData); return undefined },
    signature: (data) => sigBusiness(data as BusinessSyncData),
    merge: (l, r) => mergeBusinessEnvelope(l as BusinessSyncData, r as BusinessSyncData),
    reload: reloadBusinessStore,
    diffSize: (l, r) => totalDiffSize(l, r)
  },
  {
    name: 'student.json',
    exportLocal: () => exportStudent(),
    importRemote: async (data) => { await importStudentData(data as StudentSyncData); return undefined },
    signature: (data) => sigStudent(data as StudentSyncData),
    merge: (l, r) => mergeStudent(l as StudentSyncData, r as StudentSyncData),
    reload: reloadStudentStores,
    diffSize: (l, r) => totalDiffSize(l, r)
  },
  {
    name: 'teacher.json',
    exportLocal: () => exportTeacher(),
    importRemote: async (data) => { await importTeacherData(data as TeacherSyncData); return undefined },
    signature: (data) => sigTeacher(data as TeacherSyncData),
    merge: (l, r) => mergeTeacher(l as TeacherSyncData, r as TeacherSyncData),
    reload: reloadTeacherStores,
    diffSize: (l, r) => totalDiffSize(l, r)
  },
  {
    // 工具箱：收藏 / 最近使用 / 点击次数 / 搜索历史
    // 合并策略：并集 + 时间最新（收藏/搜索取并集、最近用 ts 最大者、点击取较大值）—— 见 toolboxSyncCore
    name: 'toolbox.json',
    exportLocal: () => exportToolbox(),
    importRemote: async (data) => { await importToolboxData(data as ToolboxSyncData); return undefined },
    signature: (data) => sigToolbox(data as ToolboxSyncData),
    merge: (l, r) => mergeToolbox(l as ToolboxSyncData, r as ToolboxSyncData),
    reload: reloadToolboxStore,
    diffSize: (l, r) => toolboxDiffSize(l as ToolboxSyncData, r as ToolboxSyncData)
  },
  {
    // 智能工作台：技能 / 提示词 / 设置
    name: 'smart.json',
    exportLocal: () => exportSmart(),
    importRemote: async (data) => { await importSmartData(data as SmartSyncData); return undefined },
    signature: (data) => sigSmart(data as SmartSyncData),
    merge: (l, r) => mergeSmart(l as SmartSyncData, r as SmartSyncData),
    reload: reloadSmartStores,
    diffSize: (l, r) => totalDiffSize(l, r)
  },
  {
    // 博客：BlogData 单对象（settings / categories / tags / articles）
    // 合并策略：文章 / 分类 / 标签按 id 逐项取 updatedAt 较新者；软删除 deletedAt 作 tombstone
    // 参与比较，避免「A 删了、B 还在编辑」把文章复活；settings 整体随 BlogData.updatedAt 较新的一侧
    name: 'blog.json',
    exportLocal: () => exportBlog(),
    importRemote: async (data) => { await importBlogData(data as BlogSyncData); return undefined },
    signature: (data) => sigBlog(data as BlogSyncData),
    merge: (l, r) => mergeBlogEnvelope(l as BlogSyncData, r as BlogSyncData),
    reload: reloadBlogStores,
    diffSize: (l, r) => totalDiffSize(l, r)
  },
  {
    // 博客前台偏好：收藏 / 最近阅读（阅读者本机浏览轨迹），独立信封 blog-prefs.json
    // 合并策略：favorites 取两边并集（保留本地顺序 + 远端独有）；recent 按 id 取较新 ts、倒序截断
    name: 'blog-prefs.json',
    exportLocal: () => exportBlogPrefs(),
    importRemote: async (data) => { await importBlogPrefsData(data as BlogFrontSyncData); return undefined },
    signature: (data) => sigBlogPrefs(data as BlogFrontSyncData),
    merge: (l, r) => mergeBlogPrefsEnvelope(l as BlogFrontSyncData, r as BlogFrontSyncData),
    reload: reloadBlogPrefsStores,
    diffSize: (l, r) => totalDiffSize(l, r)
  },
  {
    // 个人图书馆：仅收藏（favorites）+ 用户自建书签（userBookmarks）跨设备同步
    // 阅读位置 / 最近打开 / 打开次数 / 上传书为设备级数据，不进此信封
    // 合并策略：favorites 取两边并集（本地顺序优先 + 远端独有）；userBookmarks 按 id 取较新 ts
    name: 'books.json',
    exportLocal: () => exportBooksSyncData(),
    importRemote: async (data) => { await importBooksSyncData(data as BooksPrefsSyncData); return undefined },
    signature: (data) => sigBooksPrefs(data as BooksPrefsSyncData),
    merge: (l, r) => mergeBooksPrefsEnvelope(l as BooksPrefsSyncData, r as BooksPrefsSyncData),
    reload: reloadBooksPrefs,
    diffSize: (l, r) => totalDiffSize(l, r)
  }
]

// ========== 首次迁移：v9 单文件 backup.json → v10 多文件 ==========

/**
 * 首次迁移流程：
 * 1. 已读 backup.json（WorkbenchData）传入
 * 2. idbImportAll 落本地 IDB（含密码身份接管）
 * 3. 调用 7 个 export 函数从本地拆出 7 份信封
 * 4. 为每份信封设置 clientId + pushedAt
 * 5. PUT 7 份到 cloud
 * 6. DELETE cloud 上的 backup.json
 * 7. 更新 lastSyncAt + clearDirty + reloadAllStores
 */
async function migrateFromLegacyBackup(
  legacyBackup: WorkbenchData,
  dir: string,
  username: string,
  password: string,
  silent: boolean
): Promise<void> {
  // 1) 先记录本地密码身份（用于检测是否变更）
  const localSaltBefore = getStoredSaltHex()
  const localVerificationBefore = getStoredVerification()
  // 2) 落本地 IDB（idbImportAll 会接管密码身份）
  const importResult = await idbImportAll(legacyBackup)
  // 3) 7 个 export 函数从本地拆出 7 份信封
  const clientId = getClientId()
  const pushedAt = Date.now()
  const [nav, icons, workbench, business, student, teacher, smart] = await Promise.all([
    exportNav(),
    exportIcons(),
    exportWorkbench(),
    exportBusiness(),
    exportStudent(),
    exportTeacher(),
    exportSmart()
  ])
  // 4) 设置 clientId + pushedAt
  const envelopes: Array<{ name: string; data: unknown }> = [
    { name: 'nav.json', data: { ...(nav as unknown as Record<string, unknown>), clientId, pushedAt } },
    { name: 'icons.json', data: { ...(icons as unknown as Record<string, unknown>), clientId, pushedAt } },
    { name: 'workbench.json', data: { ...(workbench as unknown as Record<string, unknown>), clientId, pushedAt } },
    { name: 'business.json', data: { ...(business as unknown as Record<string, unknown>), clientId, pushedAt } },
    { name: 'student.json', data: { ...(student as unknown as Record<string, unknown>), clientId, pushedAt } },
    { name: 'teacher.json', data: { ...(teacher as unknown as Record<string, unknown>), clientId, pushedAt } },
    { name: 'smart.json', data: { ...(smart as unknown as Record<string, unknown>), clientId, pushedAt } }
  ]
  // 5) PUT 7 份到 cloud（任一失败标记 error 不中断后续）
  let pushError: string | null = null
  for (const env of envelopes) {
    try {
      await webdavPut(`${dir}/${env.name}`, username, password, JSON.stringify(env.data))
    } catch (e) {
      if (!pushError) pushError = e instanceof Error ? e.message : '推送失败'
    }
  }
  // 6) DELETE backup.json（即使 7 份中有失败，仍尝试删除 legacy 文件，避免下次再次走迁移）
  try {
    await webdavDelete(`${dir}/${LEGACY_BACKUP_FILE}`, username, password)
  } catch {
    // 删除失败不阻塞：下次 pullNow 会检测到 7 份已存在，跳过迁移分支
  }
  // 7) 更新 lastSyncAt + clearDirty + reload
  localStorage.setItem(LAST_SYNC_KEY, String(pushedAt))
  lastSyncAt.value = pushedAt
  clearDirty()
  status.value = pushError ? 'error' : 'idle'
  if (pushError) {
    errorMessage.value = pushError
    if (!silent) useToast().error(`云同步首次迁移部分失败：${pushError}`)
  } else {
    errorMessage.value = ''
    const identityChanged = importResult.adoptedPasswordIdentity
      && (legacyBackup.passwordsSalt !== localSaltBefore || legacyBackup.passwordVerification !== localVerificationBefore)
    if (identityChanged) {
      useToast().success('云同步首次迁移完成，密码面板已锁定，请输入来源设备主密码解锁')
    } else if (!silent) {
      useToast().success('云同步首次迁移完成')
    }
  }
  await reloadAllStores()
  // clearDirty 必须在 reloadAllStores 之后：部分 store 的 load 方法会触发 save
  clearDirty()
}

// ========== 核心同步流程 ==========

/**
 * 推送前保险：探查云端 7 份信封是否在本机上次同步之后被外部改过
 * （备份编辑技能写入、手工编辑坚果云文件、其他设备推送）。
 *
 * 命中则中止本次盲推：此时本地数据并不包含云端的外部修改，直接 PUT 会用本地内容
 * 覆盖云端，造成外部修改永久丢失。改由 pullNow 先合并（union，不丢任一侧），
 * 再由它内部的回推落到云端。
 *
 * 用轻量 HEAD 逐份探测；HEAD 不可用时跳过该份的保险（宁可不拦，也不误拦正常推送）。
 */
async function detectExternalChange(dir: string, username: string, password: string): Promise<boolean> {
  for (const cfg of FILE_CONFIGS) {
    const lastModifiedMs = await webdavHead(`${dir}/${cfg.name}`, username, password)
    if (!lastModifiedMs) continue
    const known = readRemoteTs(cfg.name)
    if (known === 0) {
      // 本机没有这份文件的基线（新设备首次同步 / 老版本升级）：无法证明云端不是外部写入的，
      // 保守拦截一次交给 pullNow 先拉取合并，避免本地旧数据盲推覆盖云端。
      // 云端无此文件时 lastModifiedMs 为 0，已在上方 continue，不会走到这里。
      return true
    }
    if (lastModifiedMs > known + REMOTE_TS_TOLERANCE_MS) return true
  }
  return false
}

/**
 * 退化拦截的上次提示时间：后台自动推送会周期性重试，别让同一件事每分钟弹一次 toast。
 * 注意节流只作用于提示——**拦截本身始终生效**。
 */
let lastGuardToastAt = 0
const GUARD_TOAST_THROTTLE_MS = 10 * 60 * 1000

/**
 * 推送本地到云端：串行 5 export → 5 PUT，任一失败标记 error 不中断后续。
 * silent=true 用于后台自动同步：不弹任何 toast。
 *
 * skipRemoteGuard=true 用于「pullNow 合并后的回推」：此时云端内容刚被处理过，
 * 再走一次外部改动探测既多余又有递归风险。
 */
async function pushNow(silent = false, skipRemoteGuard = false, onlyChanged = false): Promise<boolean> {
  const settings = useAppSettingsStore()
  if (!settings.cloudSyncEnabled || !hasSyncCredentials(settings)) {
    return false
  }
  status.value = 'pushing'
  errorMessage.value = ''
  const username = settings.cloudSyncUsername ?? ''
  const password = settings.cloudSyncPassword ?? ''
  const dir = dirUrl(settings.cloudSyncUrl!, username)

  // ===== 推送保险：云端被外部改过 → 先合并再推，禁止盲推覆盖 =====
  if (!skipRemoteGuard) {
    try {
      if (await detectExternalChange(dir, username, password)) {
        await pullNow(silent)
        return true
      }
    } catch {
      // 保险探测失败不应阻断业务推送：降级为直接推送（与原行为一致）
    }
  }
  try {
    // 确保 easy-web-tab 目录存在（MKCOL 失败不中断，PUT 会再次抛错）
    try {
      await webdavMkcol(dir, username, password)
    } catch {
      // 目录已存在或 MKCOL 失败，后续 PUT 直接尝试
    }
    // 串行 export → PUT 7 份；任一失败累积到 errors 但不中断后续
    const clientId = getClientId()
    const pushedAt = Date.now()
    let hasError = false
    let firstError = ''
    let pushedCount = 0
    /** 本地退化检查拦截掉的信封（为云端数据兜底的最后一道闸门） */
    const guardBlocked: string[] = []
    for (const cfg of FILE_CONFIGS) {
      try {
        const local = await cfg.exportLocal()
        // ===== 本地退化检查：本机数据疑似被清空时，宁可不推也不能把空态推上云 =====
        if (cfg.guardLocal) {
          const reason = cfg.guardLocal(local)
          if (reason) {
            guardBlocked.push(`${cfg.name}（${reason}）`)
            continue
          }
        }
        // 只推变化：与上次成功推送的内容签名一致 → 这份没动过，跳过 PUT
        // prev 为空（从未推过 / 清过缓存）时必须推，否则首次同步会被跳过
        let sig = ''
        if (onlyChanged) {
          sig = await sha1Hash(cfg.signature(local))
          const prev = readPushedSig(cfg.name)
          if (prev && sig === prev) continue
        }
        const envelope = { ...(local as Record<string, unknown>), clientId, pushedAt }
        await webdavPut(`${dir}/${cfg.name}`, username, password, JSON.stringify(envelope))
        // 推送即同步：云端这一版就是本机内容，推进基线（用 pushedAt 近似服务端写入时刻，
        // REMOTE_TS_TOLERANCE_MS 已覆盖两端时钟偏差）
        writeRemoteTs(cfg.name, pushedAt)
        if (onlyChanged && sig) writePushedSig(cfg.name, sig)
        pushedCount++
      } catch (e) {
        hasError = true
        if (!firstError) firstError = e instanceof Error ? e.message : `${cfg.name} 推送失败`
      }
    }
    // ===== 拦截优先：本地数据疑似降级 → 整套推送作废，且**不清脏标记**（脏着才有机会被再次校验/拉取）=====
    if (guardBlocked.length > 0) {
      const msg = `本地数据疑似降级，已拦截推送以免覆盖云端：${guardBlocked.join('；')}`
      status.value = 'error'
      errorMessage.value = msg
      console.error('[CloudSync] ' + msg)
      const now = Date.now()
      if (now - lastGuardToastAt > GUARD_TOAST_THROTTLE_MS) {
        lastGuardToastAt = now
        useToast().error(msg + '。请到「设置 → 云同步」点击「拉取」恢复，或从备份导入。')
      }
      return false
    }
    if (hasError) {
      status.value = 'error'
      errorMessage.value = firstError
      if (!silent) useToast().error(`云同步推送部分失败：${firstError}`)
      return false
    }
    // 一份都没推（内容全部未变）→ 只清脏标记，不推进 lastSyncAt：
    // 本轮没有真实同步发生，推进基线会让后续 pullNow 误判「远端更旧」而漏拉云端改动
    if (pushedCount > 0) {
      localStorage.setItem(LAST_SYNC_KEY, String(pushedAt))
      lastSyncAt.value = pushedAt
    }
    clearDirty()
    status.value = 'idle'
    if (!silent) {
      if (pushedCount > 0) useToast().success('云同步推送成功')
      else useToast().info('云端已是最新，无需覆盖')
    }
    return true
  } catch (e) {
    status.value = 'error'
    errorMessage.value = e instanceof Error ? e.message : '推送失败'
    if (!silent) useToast().error(`云同步推送失败：${errorMessage.value}`)
    return false
  }
}

/**
 * 强制以本地覆盖云端（「本地永远为准」语义）。
 *
 * 与 pushNow 的两点差异：
 *   1. skipRemoteGuard=true：不探测云端是否被外部改过，直接覆盖。
 *      （pushNow 默认会先 detectExternalChange，发现外部改动就转为拉+合并；这里按用户设定走覆盖。）
 *   2. onlyChanged=true：只 PUT 内容有变化的信封，避免每保存一次就全量重传 7 份。
 *
 * silent=true 供「保存后立即上云」使用：不弹 toast，失败只体现在 status / errorMessage。
 * 会丢失的部分：同一份信封内云端被其它设备或外部工具（备份编辑脚本）改写的改动——
 * 这正是「以本地为准」的语义，使用前请确认当前设备数据是最完整的。
 */
export async function forcePushLocal(silent = false): Promise<boolean> {
  const settings = useAppSettingsStore()
  if (!settings.cloudSyncEnabled || !hasSyncCredentials(settings)) return false
  return pushNow(silent, true, true)
}

/**
 * 应用远端到本地（workbench 文件额外检测密码身份变更）。
 * 注意：此函数仅写本地（IDB/localStorage），不 reload Vue stores —— reload 由调用方在所有文件处理完后统一执行。
 */
async function applyFileRemote(cfg: FileConfig, remote: unknown): Promise<{ identityChanged: boolean }> {
  let identityChanged = false
  if (cfg.name === 'workbench.json') {
    const localSaltBefore = getStoredSaltHex()
    const localVerificationBefore = getStoredVerification()
    const result = await cfg.importRemote(remote) as { adoptedPasswordIdentity?: boolean } | undefined
    const remoteData = remote as WorkbenchSyncData
    identityChanged = !!result?.adoptedPasswordIdentity
      && (remoteData.passwordsSalt !== localSaltBefore || remoteData.passwordVerification !== localVerificationBefore)
  } else {
    await cfg.importRemote(remote)
  }
  return { identityChanged }
}

/**
 * 拉取云端并落地本地。
 *
 * silent=true 用于后台自动同步（定时轮询 / 页面重新可见）：全程不弹 toast。
 * 失败也不会被吞掉——status 置为 'error'、errorMessage 落值、同步按钮会变红并显示
 * 「同步失败」，用户点「立即同步」即可看到具体错误提示。
 */
async function pullNow(silent = false): Promise<void> {
  const settings = useAppSettingsStore()
  if (!settings.cloudSyncEnabled || !hasSyncCredentials(settings)) {
    return
  }
  status.value = 'pulling'
  errorMessage.value = ''
  const username = settings.cloudSyncUsername ?? ''
  const password = settings.cloudSyncPassword ?? ''
  const dir = dirUrl(settings.cloudSyncUrl!, username)
  try {
    // ===== 1) 串行 GET 6 份文件，记录 data + lastModifiedMs =====
    const remoteResults: Record<string, { data: unknown; lastModifiedMs: number }> = {}
    let allMissing = true
    for (const cfg of FILE_CONFIGS) {
      const result = await webdavGet(`${dir}/${cfg.name}`, username, password)
      if (result.data) {
        allMissing = false
        remoteResults[cfg.name] = { data: result.data, lastModifiedMs: result.lastModifiedMs }
      }
    }

    // ===== 2) 首次迁移检测：6 份全 404 但 backup.json 存在 =====
    if (allMissing) {
      let legacyBackup: WorkbenchData | null = null
      try {
        const legacyResult = await webdavGet(`${dir}/${LEGACY_BACKUP_FILE}`, username, password)
        legacyBackup = (legacyResult.data ?? null) as WorkbenchData | null
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (!msg.includes('404')) throw e
      }
      if (legacyBackup) {
        await migrateFromLegacyBackup(legacyBackup, dir, username, password, silent)
        return
      }
      // 无任何云端数据 → 若本地 dirty 则推送
      status.value = 'idle'
      if (isDirty()) await pushNow(silent)
      return
    }

    // ===== 3) 逐文件处理：contentSame / dirty / conflict 判定 =====
    const dirty = isDirty()
    const localTs = Number(localStorage.getItem(LAST_SYNC_KEY) || '0')
    let hasConflict = false
    let appliedAny = false
    let mergedAny = false
    let workbenchIdentityChanged = false

    for (const cfg of FILE_CONFIGS) {
      const remoteInfo = remoteResults[cfg.name]
      if (!remoteInfo) continue  // 此文件远端不存在 → 跳过
      const remote = remoteInfo.data

      // 内容 hash：剔除元数据后 stableStringify → sha1 比较
      const remoteSig = cfg.signature(remote)
      const localExport = await cfg.exportLocal()
      const localSig = cfg.signature(localExport)
      const remoteHash = await sha1Hash(remoteSig)
      const localHash = await sha1Hash(localSig)
      if (remoteHash === localHash) {
        // 内容一致 → noop。但云端 mtime 仍要记账：否则下次外部改文件后，
        // 基线停留在更早的时刻，会被误判（虽然结果无害，但会让后续判定失真）。
        if (remoteInfo.lastModifiedMs > 0) writeRemoteTs(cfg.name, remoteInfo.lastModifiedMs)
        continue
      }

      // remoteTs：信封内嵌 pushedAt 与 Last-Modified 取较大值
      //
      // 关键：外部工具（备份编辑技能 add_entry.py）直接改写云端 JSON 时，
      // 只会更新条目 updatedAt，**不会更新信封内的 pushedAt**（它不认识这个字段）。
      // 此时判断"远端是否更新过"唯一可信的依据就是 WebDAV 的 Last-Modified。
      // 若两者都拿不到（代理/服务端未透传 Last-Modified 且文件无 pushedAt），
      // 不能判定为"远端更旧"而跳过——那会把外部修改静默丢弃。
      // 退化策略：视为刚被外部修改（用当前时间），进入合并/冲突流程而非跳过。
      const pushedAt = (remote as { pushedAt?: number }).pushedAt ?? 0
      const lastModifiedMs = remoteInfo.lastModifiedMs
      // 只有「信封内 pushedAt 与 WebDAV Last-Modified 两者都有」时，时间戳才可信。
      // 缺任一 → 无法证明远端更旧，一律视为远端可能有外部修改（remoteTs 取当前时间）。
      const timestampsReliable = pushedAt > 0 && lastModifiedMs > 0
      const remoteTs = lastModifiedMs > 0 ? Math.max(pushedAt, lastModifiedMs) : Date.now()

      // 云端文件在本机上次同步之后又被改过（外部工具 / 其他设备）→ 必须处理，绝不能跳过。
      // 这是「技能改了云端、本地却拉不下来」的主路径：此时 pushedAt 仍是旧值，
      // LAST_SYNC_KEY 已被本机推送推高，仅靠 remoteTs > localTs 会永远判成"远端更旧"。
      // cloudTs are recorded per envelope since this build; known === 0 表示"本机还没见过
      // 这份云端文件的基线"（首次用云同步 / 老版本升级上来）。此时无法证明远端更旧，
      // 保守视为可能有外部修改 → 走合并分支（union，不丢本地），并把基线补记下来。
      const lastKnownRemoteTs = readRemoteTs(cfg.name)
      const externallyModified =
        lastModifiedMs > 0 && (lastKnownRemoteTs === 0 || lastModifiedMs > lastKnownRemoteTs + REMOTE_TS_TOLERANCE_MS)

      // 注意：走到这里已确认远端与本地内容不同（hash 不相等）。
      // 因此在时间戳不可信时绝不能走"跳过"分支——那会把外部修改静默丢弃，
      // 表现就是"技能改了云端，点同步却没生效"。
      if (dirty && (remoteTs > localTs || !timestampsReliable || externallyModified)) {
        // 本地 dirty 且远程更新 → 两端都有变更，合并或冲突
        const diff = cfg.diffSize(localExport, remote)
        if (diff < (settings.cloudSyncSilentThreshold ?? 1000)) {
          // 微小差异 → 静默合并
          const merged = cfg.merge(localExport, remote)
          await cfg.importRemote(merged)
          appliedAny = true
          mergedAny = true
          // 已处理这一版云端内容 → 推进基线，避免下次重复判定为外部修改
          writeRemoteTs(cfg.name, remoteTs)
        } else {
          // 差异较大 → 冲突
          if (!conflictData.value) conflictData.value = {}
          conflictData.value[cfg.name] = { local: localExport, remote }
          hasConflict = true
        }
      } else if (dirty && remoteTs <= localTs) {
        // 仅当两个时间戳都可信、且远端确实更旧/相同时才跳过：
        // 本地改动尚未推送 → 跳过此文件，保留本地新值，等待 pushNow 用本地内容覆盖远程
        // （时间戳不可信的情况已被上面的 !timestampsReliable 分支接走，不会走到这里）
      } else if (!dirty) {
        // 本地无变更 → 直接拉取覆盖本地
        const result = await applyFileRemote(cfg, remote)
        if (result.identityChanged) workbenchIdentityChanged = true
        appliedAny = true
        writeRemoteTs(cfg.name, remoteTs)
      }
    }

    // ===== 4) 处理完毕：reload / clearDirty / 状态 =====
    if (hasConflict) {
      status.value = 'conflict'
      useToast().warning('云同步检测到冲突，请选择解决方式')
      // 即使有冲突，对已应用的无冲突文件仍需 reload（让 Vue 状态刷新）
      if (appliedAny) {
        await reloadAllStores()
      }
      return
    }

    if (appliedAny) {
      // 更新 lastSyncAt（取所有 remoteTs 最大值）
      let maxTs = localTs
      for (const cfg of FILE_CONFIGS) {
        const info = remoteResults[cfg.name]
        if (!info) continue
        const ts = Math.max((info.data as { pushedAt?: number }).pushedAt ?? 0, info.lastModifiedMs)
        if (ts > maxTs) maxTs = ts
      }
      localStorage.setItem(LAST_SYNC_KEY, String(maxTs))
      lastSyncAt.value = maxTs
      await reloadAllStores()
      // clearDirty 必须在 reloadAllStores 之后：reload 中的 save 会 markDirty
      clearDirty()
      // 静默合并的结果只落在本地：若不回推，云端仍是旧版本（外部工具的修改与本次
      // 合并结果都没上云），下次 pull 会重复触发合并，其他设备也永远拿不到合并结果。
      // merged 已包含本地与远端两侧的条目（union），回推不会丢数据。
      if (mergedAny) {
        // skipRemoteGuard=true：云端这一版刚处理完，无需再探测外部改动，也避免 pull→push 递归
        await pushNow(true, true)
      }
      if (workbenchIdentityChanged) {
        useToast().success('云同步完成，密码面板已锁定，请输入来源设备主密码解锁')
      } else if (!silent) {
        useToast().success(mergedAny ? '云同步完成（已合并云端变更并回传）' : '云同步完成')
      }
    }
    status.value = 'idle'
  } catch (e) {
    status.value = 'error'
    errorMessage.value = e instanceof Error ? e.message : '拉取失败'
    if (silent) {
      console.error('[CloudSync] 后台拉取失败：', errorMessage.value)
    } else {
      useToast().error(`云同步拉取失败：${errorMessage.value}`)
    }
  }
}

/**
 * 解决冲突：3 选 1（全部云端覆盖 / 全部本地覆盖 / 全部合并）。
 * conflictData 形状：Record<fileName, {local, remote}>，决策对全部冲突文件统一生效。
 */
export async function resolveConflict(decision: 'remote' | 'local' | 'cancel' | 'merge'): Promise<void> {
  if (!conflictData.value) return
  const conflicts = conflictData.value

  if (decision === 'remote') {
    // 全部取云端：逐文件 apply remote。
    // 这是用户**显式判决**，需临时放行「远端疑似空列表」保护，
    // 否则保护会把用户的主动选择吞掉（点了「云端覆盖」却没生效）。
    armNavWipeOverride()
    conflictData.value = null
    status.value = 'pulling'
    let workbenchIdentityChanged = false
    try {
      for (const cfg of FILE_CONFIGS) {
        const entry = conflicts[cfg.name]
        if (!entry) continue
        const result = await applyFileRemote(cfg, entry.remote)
        if (result.identityChanged) workbenchIdentityChanged = true
      }
      const now = Date.now()
      localStorage.setItem(LAST_SYNC_KEY, String(now))
      lastSyncAt.value = now
      await reloadAllStores()
      clearDirty()
      status.value = 'idle'
      if (workbenchIdentityChanged) {
        useToast().success('云同步完成（云端覆盖本地），密码面板已锁定，请输入来源设备主密码解锁')
      } else {
        useToast().success('云同步完成（云端覆盖本地）')
      }
    } catch (e) {
      status.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : '应用云端失败'
      useToast().error(`云同步解决冲突失败：${errorMessage.value}`)
    }
    return
  }

  if (decision === 'local') {
    // 全部推送本地
    conflictData.value = null
    // 用户已裁决「以本地为准」：跳过外部改动探测，否则保险会把刚做的裁决又拉回去
    await pushNow(false, true)
    return
  }

  if (decision === 'merge') {
    // 全部走各自 merge 函数：apply merged → push merged
    conflictData.value = null
    status.value = 'pushing'
    try {
      // 1) 计算并应用 merged 到本地（写本地）
      for (const cfg of FILE_CONFIGS) {
        const entry = conflicts[cfg.name]
        if (!entry) continue
        const merged = cfg.merge(entry.local, entry.remote)
        await cfg.importRemote(merged)
      }
      // 2) reload stores（让 Vue 刷新到 merged 数据）
      await reloadAllStores()
      // 3) 推送 merged 到云端（静默 push，最后统一 toast）
      //    同为冲突裁决后的推送，跳过外部改动探测
      const pushOk = await pushNow(true, true)
      if (pushOk) {
        useToast().success('云同步合并完成')
      } else {
        useToast().error(`云同步合并失败：${errorMessage.value}`)
      }
    } catch (e) {
      status.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : '合并同步失败'
      useToast().error(`云同步合并失败：${errorMessage.value}`)
    }
    return
  }

  // cancel：保留本地，但更新 lastSyncAt 避免重复弹框
  // 取所有 remote.pushedAt 最大值（或 Date.now() 兜底）
  let maxTs = Date.now()
  for (const cfg of FILE_CONFIGS) {
    const entry = conflicts[cfg.name]
    if (!entry) continue
    const ts = (entry.remote as { pushedAt?: number }).pushedAt ?? 0
    if (ts > maxTs) maxTs = ts
  }
  localStorage.setItem(LAST_SYNC_KEY, String(maxTs))
  lastSyncAt.value = maxTs
  clearDirty()
  conflictData.value = null
  status.value = 'idle'
  useToast().info('已取消同步冲突')
}

/**
 * 立即同步入口：按状态决定先拉还是先推。
 *
 * silent=true 供后台自动同步（定时轮询）使用：不弹任何 toast。
 * 用户点击「立即同步」的三个入口（HomeView / WorkbenchView / BusinessView）走默认 false，
 * 保留成功/失败反馈——主动操作需要明确结果。
 */
export async function syncNow(silent = false): Promise<void> {
  const settings = useAppSettingsStore()
  if (!settings.cloudSyncEnabled || !settings.cloudSyncUrl) {
    if (!silent) useToast().error('请先在设置中启用并配置云同步')
    return
  }
  if (isDirty()) {
    // 本地有变更 → 先拉（避免盲推覆盖），拉取流程会在 !dirty / 合并分支触发推送或回推
    await pullNow(silent)
    // 拉取后仍 dirty（如 pullNow 走了"远端更旧→跳过"分支）→ 补推一次。
    // 用 skipRemoteGuard=true：pullNow 已处理过外部改动，此处无需再探测，
    // 否则 detectExternalChange 在"本地无基线/云端 mtime 略新"时会误判、整轮放弃推送，
    // 表现为"手动同步后学段/学科等本地改动推不上云"。
    if (isDirty() && status.value === 'idle') await pushNow(silent, true)
  } else {
    await pullNow(silent)
  }
}

/**
 * 强制以云端覆盖本地（忽略本地 dirty 标记与时间戳比较，无条件采纳远端 6 份信封）。
 *
 * 使用场景：用外部工具（备份编辑技能 add_entry.py、或手工编辑坚果云同步文件夹里的 JSON）
 * 直接改写云端数据后，程序内的常规同步可能不生效——常规 pullNow 在
 * 「本地 dirty 且判定远端更旧」的分支会直接跳过远端，而外部工具写入时不会更新信封内的
 * pushedAt，远端时间戳未必能正确推进。此时用本函数可确保外部修改一定落地。
 *
 * 会丢失的部分：本地尚未推送的改动（这正是"以云端为准"的语义），请谨慎使用。
 */
export async function forcePullRemote(silent = false): Promise<void> {
  const settings = useAppSettingsStore()
  if (!settings.cloudSyncEnabled || !hasSyncCredentials(settings)) {
    if (!silent) useToast().error('请先在设置中启用并配置云同步')
    return
  }
  status.value = 'pulling'
  errorMessage.value = ''
  const username = settings.cloudSyncUsername ?? ''
  const password = settings.cloudSyncPassword ?? ''
  const dir = dirUrl(settings.cloudSyncUrl!, username)
  try {
    let applied = false
    let workbenchIdentityChanged = false
    // 兜底用 Date.now()：保证 lastSyncAt 一定向前推进，避免之后再次因
    // 时间戳比较把同一批外部修改判成"远端更旧"而跳过
    let maxTs = Math.max(Number(localStorage.getItem(LAST_SYNC_KEY) || '0'), Date.now())
    for (const cfg of FILE_CONFIGS) {
      const result = await webdavGet(`${dir}/${cfg.name}`, username, password)
      if (!result.data) continue // 该信封云端不存在 → 保留本地
      const appliedResult = await applyFileRemote(cfg, result.data)
      if (appliedResult.identityChanged) workbenchIdentityChanged = true
      applied = true
      const ts = Math.max((result.data as { pushedAt?: number }).pushedAt ?? 0, result.lastModifiedMs)
      if (ts > maxTs) maxTs = ts
      // 已无条件采纳这一版云端内容 → 推进基线，后续常规同步不再把它当成"外部新改动"
      writeRemoteTs(cfg.name, result.lastModifiedMs > 0 ? result.lastModifiedMs : Date.now())
    }
    if (!applied) {
      status.value = 'idle'
      if (!silent) useToast().info('云端暂无数据，未做任何覆盖')
      return
    }
    localStorage.setItem(LAST_SYNC_KEY, String(maxTs))
    lastSyncAt.value = maxTs
    await reloadAllStores()
    clearDirty()
    status.value = 'idle'
    if (workbenchIdentityChanged) {
      useToast().success('已用云端覆盖本地，密码面板已锁定，请输入来源设备主密码解锁')
    } else if (!silent) {
      useToast().success('已用云端覆盖本地')
    }
  } catch (e) {
    status.value = 'error'
    errorMessage.value = e instanceof Error ? e.message : '强制拉取失败'
    if (!silent) useToast().error(`以云端覆盖本地失败：${errorMessage.value}`)
  }
}

// ========== 拉取栅栏：visibilitychange visible 时 pullNow 的 Promise ==========
// 其他模块（如倒计时提醒）可 await waitForPull() 确保先拉取最新数据再 tick
let pendingPull: Promise<void> | null = null

export function waitForPull(): Promise<void> {
  return pendingPull ?? Promise.resolve()
}

// ========== 触发器：visibilitychange + beforeunload + 轮询 ==========

let initialized = false
let intervalTimer: ReturnType<typeof setInterval> | null = null
let watchdogTimer: ReturnType<typeof setInterval> | null = null
// 最近一次生效的轮询间隔（分钟），用于判断是否需要重启定时器
let lastIntervalMinutes = -1

function stopInterval(): void {
  if (intervalTimer) {
    clearInterval(intervalTimer)
    intervalTimer = null
  }
}

function startInterval(): void {
  stopInterval()
  const settings = useAppSettingsStore()
  const minutes = Number(settings.cloudSyncInterval) || 0
  lastIntervalMinutes = minutes
  if (minutes <= 0) return
  const ms = minutes * 60 * 1000
  intervalTimer = setInterval(() => {
    if (status.value === 'idle' || status.value === 'error') {
      // 后台轮询：静默（不弹 toast），状态通过同步按钮的颜色/文案反馈
      void syncNow(true)
    }
  }, ms)
}

/** 看门狗：仅在轮询间隔发生变化时才重启定时器。
 *  原实现每分钟无条件重建，导致间隔大于 1 分钟的轮询永远走不到触发点
 *  （每次都在 60s 处被 stopInterval 清掉），自动同步实际从不触发。 */
function restartIntervalIfChanged(): void {
  const settings = useAppSettingsStore()
  const minutes = Number(settings.cloudSyncInterval) || 0
  if (minutes === lastIntervalMinutes) return
  startInterval()
}

/** 页面重新可见 → 拉取远程更新（技能改文件/其他设备推送都会被检测到） */
function onVisibilityChange(): void {
  if (status.value !== 'idle' && status.value !== 'error') return
  // 间隔=0（关闭自动同步）时，不主动做任何同步，仅手动按钮生效
  if ((Number(useAppSettingsStore().cloudSyncInterval) || 0) <= 0) return
  if (document.visibilityState === 'visible') {
    // 静默执行：切回标签页就弹「云同步完成」会严重打扰使用
    // 设置栅栏 Promise 供其他模块（倒计时提醒）await 后再 tick
    pendingPull = pullNow(true).finally(() => { pendingPull = null })
  }
  // hidden 时不自动推送（避免盲推覆盖技能修改的远程文件）
  // 推送统一由定时轮询 + 手动「立即同步」触发，都会先 pullNow 检测冲突
}

/** 卸载前不做额外推送：beforeunload 中 fetch 可能被中断，hidden 分支已兜底 */
function onBeforeUnload(): void {
  /* 保持空实现：依赖 visibilitychange hidden 推送 */
}

/** 在 App.vue onMounted 调用；幂等 */
export function init(): void {
  if (initialized) return
  initialized = true
  const saved = Number(localStorage.getItem(LAST_SYNC_KEY) || '0')
  lastSyncAt.value = saved || null

  // settingsStore 需在组件树挂载后才初始化好，保证 store 已就绪再读轮询
  queueMicrotask(() => {
    try {
      startInterval()
    } catch {
      /* ignore: store 未就绪，下一次修改会重启 */
    }
  })
  // 句柄保存下来，dispose 时可释放（原先未保存，单例永不释放）
  watchdogTimer = setInterval(() => {
    try { restartIntervalIfChanged() } catch { /* ignore */ }
  }, 60 * 1000)
  // unref 仅存在于 Node 定时器对象上，浏览器环境为 number，可选调用兼容
  ;(watchdogTimer as unknown as { unref?: () => void } | null)?.unref?.()

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('beforeunload', onBeforeUnload)
}

/** 释放云同步触发器占用的定时器与全局监听（dispose 后可重新 init）。
 *  原先看门狗句柄与两个监听回调都未保存，无法移除，单例永不释放。 */
export function dispose(): void {
  stopInterval()
  // 释放「保存后立即上云」的防抖定时器，避免卸载后仍触发一次推送
  if (autoPushTimer) {
    clearTimeout(autoPushTimer)
    autoPushTimer = null
  }
  if (watchdogTimer) {
    clearInterval(watchdogTimer)
    watchdogTimer = null
  }
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('beforeunload', onBeforeUnload)
  lastIntervalMinutes = -1
  initialized = false
}

export function useCloudSync() {
  return {
    status,
    lastSyncAt,
    errorMessage,
    conflictData,
    init,
    pushNow,
    pullNow,
    syncNow,
    forcePullRemote,
    forcePushLocal,
    resolveConflict,
    testConnection,
    markDirty,
    isDirty,
    startInterval,
    dispose
  }
}
