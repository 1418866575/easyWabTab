/**
 * 模块级异步云同步编排器
 *
 * 职责（详见 docs/module-sync/模块级异步云同步-实现方案.md）：
 *   - 离开模块：立刻落快照（flush 未保存改动）→ 防抖 → 上传**只属于该模块**的信封/行。
 *   - 进入模块：防抖 → 拉取**只属于该模块**的数据，合并落地（绝不盲覆盖）。
 *   - 异步不阻塞：导航链路从不 await；无弹窗、无 loading；后台串行队列执行。
 *   - 快速连切：按 (type, module) 防抖 + epoch 世代校验，被更新的同 id 任务取代即丢弃。
 *   - 失败降级：捕获异常 → 记录状态 → 指数退避自动重试；鉴权失效停止自动重试；本地数据始终保留。
 */
import { reactive } from 'vue'
import type { Router } from 'vue-router'
import {
  MODULE_SCOPES,
  moduleKeyOf,
  taskIdOf,
  backoffMs,
  MODULE_DEBOUNCE_MS,
  MODULE_SYNC_TIMEOUT_MS,
  MAX_MODULE_RETRY,
  type ModuleKey
} from './moduleSyncCore'
import { pushEnvelopes, pullEnvelopes, reloadAllStores } from './useCloudSync'
import { feishuPush, feishuPull } from './feishuSync'
import { useAppSettingsStore } from '../stores/settings'

type TaskType = 'push' | 'pull'

export interface ModuleSyncEntry {
  status: 'idle' | 'running' | 'ok' | 'failed'
  lastError: string
  retries: number
  lastAt: number | null
}

/** 各模块最近一次同步状态（供 UI 被动展示，不驱动任何阻断式交互） */
export const moduleSyncState = reactive<Record<string, ModuleSyncEntry>>({})

// ========== 快照：把"未落盘的改动"强制写进 IndexedDB ==========

type FlushFn = () => unknown
const flushers = new Map<ModuleKey, Set<FlushFn>>()

/**
 * 注册模块级 flush（组件挂载时注册、卸载时注销）。
 * 典型用途：博客编辑器把"未保存的草稿"写进 store/IDB，避免切走时丢稿。
 * @returns 注销函数
 */
export function registerModuleFlush(key: ModuleKey, fn: FlushFn): () => void {
  let set = flushers.get(key)
  if (!set) {
    set = new Set()
    flushers.set(key, set)
  }
  set.add(fn)
  return () => {
    set?.delete(fn)
  }
}

/** 内置 flush：这些模块的改动走防抖落盘（400ms），切换时必须强制落盘 */
const BUILTIN_FLUSH: Partial<Record<ModuleKey, () => Promise<void>>> = {
  nav: async () => {
    const m = await import('./useNavPrefs')
    await m.flushNow()
  },
  smart: async () => {
    const m = await import('./useNavPrefs')
    await m.flushNow()
  },
  toolbox: async () => {
    const m = await import('../toolbox/prefs/useToolboxPrefs')
    m.flushToolboxPrefs()
  },
  blogFront: async () => {
    const m = await import('./blogFrontPrefs')
    m.flushBlogFrontPrefs()
  },
  books: async () => {
    const m = await import('./useBooksPrefs')
    m.flushBooksPrefs()
  }
}

/**
 * 落快照：先同步**调用**各 flush（保证组件仍挂载时就开始执行、能抓到未保存内容），
 * 再等待全部结束。单个 flush 失败只记日志，不阻断后续上传。
 */
export async function snapshot(key: ModuleKey): Promise<void> {
  const jobs: FlushFn[] = []
  const builtin = BUILTIN_FLUSH[key]
  if (builtin) jobs.push(builtin)
  const reg = flushers.get(key)
  if (reg) for (const fn of reg) jobs.push(fn)
  if (!jobs.length) return
  const results: unknown[] = []
  for (const fn of jobs) {
    try {
      results.push(fn())
    } catch (e) {
      console.error(`[moduleSync] flush 同步调用失败 ${key}`, e)
    }
  }
  await Promise.allSettled(results.map((r) => Promise.resolve(r)))
}

// ========== 调度：防抖 + 串行队列 + epoch ==========

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const latestEpoch = new Map<string, number>()
let epoch = 0
let chain: Promise<void> = Promise.resolve()
/** 上一个进入过的模块（同模块内子路由跳转不触发重复拉取） */
let lastEntered: ModuleKey | '' = ''

function ensureEntry(key: ModuleKey): ModuleSyncEntry {
  const existing = moduleSyncState[key]
  if (existing) return existing
  const created: ModuleSyncEntry = { status: 'idle', lastError: '', retries: 0, lastAt: null }
  moduleSyncState[key] = created
  return created
}

function enabled(): boolean {
  return !!useAppSettingsStore().cloudSyncEnabled
}

function schedule(type: TaskType, key: ModuleKey, snap?: Promise<void>): void {
  const id = taskIdOf(type, key)
  const prev = timers.get(id)
  if (prev) clearTimeout(prev)
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id)
      enqueue(type, key, snap)
    }, MODULE_DEBOUNCE_MS)
  )
}

function enqueue(type: TaskType, key: ModuleKey, snap?: Promise<void>): void {
  const id = taskIdOf(type, key)
  const myEpoch = ++epoch
  latestEpoch.set(id, myEpoch)
  chain = chain.then(() => run(type, key, myEpoch, snap)).catch(() => {})
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`同步超时（>${ms}ms）`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

async function doSync(type: TaskType, key: ModuleKey): Promise<void> {
  const settings = useAppSettingsStore()
  const scope = MODULE_SCOPES[key]
  if (settings.cloudSyncChannel === 'feishu') {
    const params = {
      cloudSyncFeishuAppId: settings.cloudSyncFeishuAppId,
      cloudSyncFeishuAppSecret: settings.cloudSyncFeishuAppSecret,
      cloudSyncFeishuDatasourceUrl: settings.cloudSyncFeishuDatasourceUrl
    }
    if (type === 'push') {
      await feishuPush(params, scope)
    } else {
      const r = await feishuPull(params, scope)
      // 只在真正拉到数据时才全量 reload：无变化也 reload 会让每次进页面都重载全部 store，
      // 既浪费又会在本地数据异常时立刻把问题暴露成白屏
      if (r.applied > 0) {
        await reloadAllStores()
        if (r.settingsChanged) useAppSettingsStore().initSettings()
      }
    }
    return
  }
  if (type === 'push') {
    const ok = await pushEnvelopes(scope.envelopes)
    if (!ok) throw new Error('推送未全部成功（详见控制台）')
  } else {
    await pullEnvelopes(scope.envelopes)
  }
}

async function run(type: TaskType, key: ModuleKey, myEpoch: number, snap?: Promise<void>): Promise<void> {
  const id = taskIdOf(type, key)
  // 被同 (type, module) 的更新任务取代 → 直接丢弃，避免陈旧结果覆盖新数据
  if (latestEpoch.get(id) !== myEpoch) return
  if (!enabled()) return
  const entry = ensureEntry(key)
  entry.status = 'running'
  entry.lastError = ''
  try {
    if (snap) await snap
    await withTimeout(doSync(type, key), MODULE_SYNC_TIMEOUT_MS)
    entry.status = 'ok'
    entry.retries = 0
    entry.lastAt = Date.now()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    entry.status = 'failed'
    entry.lastError = msg
    // 静默降级：只记日志，绝不弹窗/阻断；本地数据保持原样
    console.error(`[moduleSync] ${type} ${key} 失败：${msg}`)
    scheduleRetry(type, key)
  }
}

function scheduleRetry(type: TaskType, key: ModuleKey): void {
  const entry = ensureEntry(key)
  if (entry.retries >= MAX_MODULE_RETRY) {
    console.warn(`[moduleSync] ${key} 已重试 ${entry.retries} 次仍失败，停止自动重试（可手动触发）`)
    return
  }
  entry.retries += 1
  const delay = backoffMs(entry.retries)
  setTimeout(() => enqueue(type, key), delay)
}

// ========== 对外入口 ==========

/** 离开模块：立刻落快照（组件仍挂载）→ 防抖后上传该模块 */
export function onLeaveModule(key: ModuleKey): void {
  // 立即调用：此刻组件仍挂载，才能抓到未保存的编辑内容；任务内再 await 它
  const snap = snapshot(key)
  schedule('push', key, snap)
}

/** 进入模块：防抖后拉取该模块 */
export function onEnterModule(key: ModuleKey): void {
  if (key === lastEntered) return
  lastEntered = key
  schedule('pull', key)
}

/** 手动重试某个模块（失败后用户可主动触发） */
export function retryModule(key: ModuleKey): void {
  const entry = ensureEntry(key)
  entry.retries = 0
  enqueue('push', key)
  enqueue('pull', key)
}

/** 取模块状态（UI 被动展示用） */
export function moduleSyncEntry(key: ModuleKey): ModuleSyncEntry {
  return ensureEntry(key)
}

/**
 * 安装路由守卫：切换是 router.push，因此挂钩 beforeEach / afterEach 即可覆盖
 * 所有切换路径（点选、Alt+N 热键、浏览器前进/后退），无需改动切换器组件。
 */
export function initModuleSync(router: Router): void {
  router.beforeEach((to, from) => {
    const leaveKey = moduleKeyOf(from?.name)
    if (leaveKey) {
      const enterKey = moduleKeyOf(to?.name)
      // 同模块内子路由跳转不算"离开"
      if (leaveKey !== enterKey) onLeaveModule(leaveKey)
    }
    return true
  })
  router.afterEach((to) => {
    const enterKey = moduleKeyOf(to?.name)
    if (enterKey) onEnterModule(enterKey)
  })
}
