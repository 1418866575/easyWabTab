/**
 * 零依赖 IndexedDB 封装（工作台数据层）
 * DB: easy-web-tab v7；object store 均无 keyPath，统一使用 out-of-line 键 'items'
 * 核心 9 store + 辅助 pomodoro/habits 参与 JSON 备份导出/导入（备份格式 v8 起）
 * 学生工作台 store 独立信封（v7 新增 student_settings；M2-M4 续添 student_* 模块 store）
 * snapshots 仅本地使用，不参与备份导出/导入
 * 所有请求失败均 reject，由调用方自行 try/catch 降级（不做 localStorage 回退写）
 */
import { WORKBENCH_DATA_VERSION, emptyAppSettingsData } from '../types'
import type { AppSettingsData, AppSettingsDataNoCloudSync, BusinessData, BusinessStoreData, BusinessSyncData, Countdown, DiaryData, GenealogyData, HealthData, IconsSyncData, LedgerData, LedgerStoreData, NavSyncData, NoteData, SmartSyncData, StudentSyncData, TeacherSyncData, WorkbenchData, WorkbenchSyncData, WorkbenchTodo } from '../types'
import { adoptPasswordIdentity, getStoredSaltHex, getStoredVerification } from './useCrypto'
import { normalizeBusinessStore } from './businessCore.ts'
import { emptyDiaryData } from './diaryCore'
import { emptyGenealogyData } from './genealogyCore'
import { emptyHabitsData } from './habitCore'
import { emptyHealthData } from './healthCore'
import { emptyLedgerData, normalizeLedgerStore } from './ledgerCore'
import { emptyNoteData, normalizeNoteData } from './noteCore'
import { emptyPomodoroData } from './pomodoroCore'
import { normalizeTeacherData } from './teacherCore'
import { isSuspectedRemoteWipe, isNavWipeOverrideActive } from './navDataGuard'

export const DB_NAME = 'easy-web-tab'
/** v18：新增 `nav` object store，承载原 localStorage 的导航偏好（13 键），根治移动端 localStorage 被系统回收导致导航数据丢失 */
/** v20：新增 `navmeta` object store，承载导航降级守卫的基线/高水位（从 localStorage 迁入，详见 IDB_META_STORES） */
/** v21：新增 `iconcache` store（图标缓存移出 nav）；nav 同时改为按 key 多记录存储（见 idbPutKey） */
export const DB_VERSION = 21
/** 核心 9 store：随 JSON 备份导出/导入（v6 新增 business；v15 新增 family 家谱） */
export const IDB_CORE_STORES = ['todos', 'notes', 'diary', 'countdowns', 'passwords', 'health', 'ledger', 'settings', 'business', 'family'] as const
/** 辅助 store：pomodoro/habits 随 v5 备份导出/导入；snapshots 仅本地使用，不参与备份 */
export const IDB_AUX_STORES = ['pomodoro', 'habits', 'snapshots'] as const
/** 自定义图标 store（v11 新增：原 localStorage 容量仅 ~5MB 易抛 QuotaExceededError，迁移至 IDB 获 50MB+ 容量） */
export const IDB_ICONS_STORES = ['icons'] as const
/** 学生工作台 store（独立信封 student-backup，不参与 WorkbenchData 导出/导入）
 *  v8 新增 13 个学生模块 store：4 共享副本 + 8 独立模块 + 1 图片 Blob store
 *  v9 新增 1 个：student_parent_tasks（家长每日任务）
 *  v12 新增 1 个：student_education（教育经历）
 *  v13 新增 1 个：student_health（学生健康管理，复刻成人 health 并含 height 成长记录） */
export const IDB_STUDENT_STORES = [
  'student_settings',
  // 4 共享副本（复用 core 纯函数，严格隔离）
  'student_habits', 'student_diary', 'student_countdowns',
  // 11 独立模块 store（v9 +student_parent_tasks, v12 +student_education, v13 +student_health）
  'student_homework', 'student_timetable', 'student_plans', 'student_review', 'student_goals',
  'student_mistakes', 'student_reading', 'student_achievements', 'student_rewards',
  'student_parent_tasks', 'student_education', 'student_health', 'student_grades',
  // 图片 Blob 独立 store（错题本拍照，导出时 base64 编码）
  'student_images'
] as const
/** 教师工作台 store（v17 新增：teacher_workbench 单对象，含学期×班级全部分组数据） */
export const IDB_TEACHER_STORES = ['teacher_workbench'] as const
/** 导航偏好 store（v18 新增：原 localStorage 13 键整体迁移，根治移动端被系统回收导致导航数据丢失） */
export const IDB_NAV_STORES = ['nav'] as const
/** 工具箱 store（v19 新增：lottery 抽奖名单与抽奖记录，单对象） */
export const IDB_TOOLBOX_STORES = ['lottery'] as const
/**
 * 导航「守卫依据」store（v20 新增：navmeta，单对象 `{ baseline, highWater }`）
 *
 * 为什么必须与被守卫的数据（nav）同介质：
 * 旧版把降级守卫的基线存在 localStorage，而 localStorage 正是 v18 迁移要躲开、
 * 且会被移动端系统**单独回收**的介质。回收后基线归零 → 守卫判据失效 →
 * 「空态」畅通写回 nav 并推上云。把基线/高水位搬进 IDB 后，
 * 「IDB 数据还在、守卫依据却被回收」这种不对称就不再可能发生。
 */
export const IDB_META_STORES = ['navmeta'] as const
/**
 * 站点图标缓存 store（v21 新增：从 nav 记录中独立出来）
 *
 * 原先 icon-cache 与 user-sites 等同住 nav 的**一条记录**里，而它可达 MB 级
 * （见 useIconCache 注释），导致每次落盘都要整包序列化数 MB ——
 * 写放大严重，移动端页面隐藏/卸载时的 IDB 事务更易被浏览器中止。
 * 独立成 store 后，nav 侧只剩 KB 级的用户资产，图标缓存的频繁更新不再牵动用户数据。
 */
export const IDB_ICONCACHE_STORES = ['iconcache'] as const
export const IDB_KEY = 'items'

export type IdbStore =
  | (typeof IDB_CORE_STORES)[number]
  | (typeof IDB_AUX_STORES)[number]
  | (typeof IDB_ICONS_STORES)[number]
  | (typeof IDB_STUDENT_STORES)[number]
  | (typeof IDB_TEACHER_STORES)[number]
  | (typeof IDB_NAV_STORES)[number]
  | (typeof IDB_TOOLBOX_STORES)[number]
  | (typeof IDB_META_STORES)[number]
  | (typeof IDB_ICONCACHE_STORES)[number]

let dbPromise: Promise<IDBDatabase> | undefined

export function openIdb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        // 幂等 contains 守卫：旧库升级到新版本时自动补建缺失 store（v5 新增 diary / v11 新增 icons），不清空旧数据
        for (const name of [
          ...IDB_CORE_STORES,
          ...IDB_AUX_STORES,
          ...IDB_ICONS_STORES,
          ...IDB_STUDENT_STORES,
          ...IDB_TEACHER_STORES,
          ...IDB_NAV_STORES,
          ...IDB_TOOLBOX_STORES,
          ...IDB_META_STORES,
          ...IDB_ICONCACHE_STORES
        ]) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name) // 无 keyPath → out-of-line 键 'items'
          }
        }
      }
      request.onsuccess = () => {
        const db = request.result
        // 另一标签页触发 versionchange（新代码升级 DB）时：关掉旧连接并清缓存，
        // 下次 open 重建连接，避免旧连接阻塞升级
        db.onversionchange = () => {
          db.close()
          dbPromise = undefined
        }
        resolve(db)
      }
      request.onerror = () => {
        // 清除缓存的 rejected promise，下次调用可重试（否则永远返回同一个拒绝态）
        dbPromise = undefined
        reject(request.error)
      }
      request.onblocked = () => {
        // 被其它标签页的旧连接阻塞时：清除缓存并拒绝，用户关闭冲突标签页后可重试
        dbPromise = undefined
        reject(new Error('IDB 升级被阻塞，请关闭其它标签页后重试'))
      }
    })
  }
  return dbPromise
}

function requestToPromise<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}

export function idbGet<T>(store: IdbStore): Promise<T | undefined> {
  return openIdb().then((db) => {
    const tx = db.transaction(store, 'readonly')
    return requestToPromise<T | undefined>(tx.objectStore(store).get(IDB_KEY))
  })
}

export function idbPut(store: IdbStore, value: unknown): Promise<void> {
  return openIdb().then((db) => {
    const tx = db.transaction(store, 'readwrite')
    const request = tx.objectStore(store).put(value, IDB_KEY)
    return requestToPromise<void>(request)
  })
}

export function idbClear(store: IdbStore): Promise<void> {
  return openIdb().then((db) => {
    const tx = db.transaction(store, 'readwrite')
    const request = tx.objectStore(store).clear()
    return requestToPromise<void>(request)
  })
}

// ============ 多记录读写（v21：nav 由「一条 items 记录」改为「每键一条记录」）============

/**
 * 按**自定义键**写入（多记录 store 用）。
 *
 * 与 `idbPut` 的区别：idbPut 固定用 IDB_KEY('items')，整条覆盖；
 * 这里按传入的 key 写单条，互不影响 —— 这是消除写放大的关键：
 * 更新一个键不再需要把整包（含 MB 级数据）重新序列化一遍。
 */
export function idbPutKey(store: IdbStore, key: string, value: unknown): Promise<void> {
  return openIdb().then((db) => {
    const tx = db.transaction(store, 'readwrite')
    const request = tx.objectStore(store).put(value, key)
    return requestToPromise<void>(request)
  })
}

/** 按自定义键读取（多记录 store 用） */
export function idbGetKey<T>(store: IdbStore, key: string): Promise<T | undefined> {
  return openIdb().then((db) => {
    const tx = db.transaction(store, 'readonly')
    return requestToPromise<T | undefined>(tx.objectStore(store).get(key))
  })
}

/** 按自定义键删除（迁移清理、删除单个 pref 用） */
export function idbDeleteKey(store: IdbStore, key: string): Promise<void> {
  return openIdb().then((db) => {
    const tx = db.transaction(store, 'readwrite')
    const request = tx.objectStore(store).delete(key)
    return requestToPromise<void>(request)
  })
}

/**
 * 读取一个 store 的**全部**记录（键 → 值）。
 *
 * 用于多记录 store 的整体装载（如启动时把 nav 的 15 个键读进内存）。
 * 用游标遍历而非 getAll()+getAllKeys() 配对，避免两个请求结果顺序错配。
 */
export function idbGetAllEntries<T = unknown>(store: IdbStore): Promise<Record<string, T>> {
  return openIdb().then((db) => {
    const tx = db.transaction(store, 'readonly')
    const objectStore = tx.objectStore(store)
    return new Promise<Record<string, T>>((resolve, reject) => {
      const out: Record<string, T> = {}
      const request = objectStore.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          out[String(cursor.key)] = cursor.value as T
          cursor.continue()
        } else {
          resolve(out)
        }
      }
      request.onerror = () => reject(request.error)
    })
  })
}

/** 云同步 prefs 白名单（仅这些 localStorage key 打包到 v9 信封，不含图标、不含加密身份键） */
export const WORKBENCH_PREFS_KEYS = [
  'user-sites',
  'user-categories',
  'user-deleted-legacy-ids',
  'user-search-engines',
  'built-in-engine-overrides',
  'built-in-engine-default',
  'user-theme',
  'user-background',
  'site-title',
  'site-favicon',
  'user-countdown-categories',
  'user-countdown-tab-categories',
  'user-countdown-sort',
  'user-todo-categories',
  'user-todo-tab-categories',
  'help-ack-count'
] as const

/**
 * 智能工作台（/smart）的偏好键：技能库 / 提示词库 / 左侧菜单配置 / 技能分类。
 * 这些键**不进** nav.json 与 workbench.json，改由独立的 smart.json 信封同步
 * （见 exportSmart / importSmartData），避免同一份数据在两份信封里各存一次。
 * 物理上仍存在 nav IDB store 里（与其它 prefs 同库），只是打包时被排除。
 */
export const SMART_PREFS_KEYS = [
  'smart-skills',
  'smart-prompts',
  'smart-workflows',
  'smart-menu',
  'smart-skill-categories',
  'smart-workflow-categories'
] as const

/**
 * 导航偏好键（v18 起由 localStorage 迁移至 IDB `nav` store 的整体集合，共 14 键）。
 * 涵盖：站点/分类/搜索引擎/主题/背景/站点标题与图标/点击计数/图标缓存等所有原 localStorage 导航键。
 * 注意：`site-click-counts` 与 `icon-cache` 不在 WORKBENCH_PREFS_KEYS 中（历史上从未进云同步信封），
 * 故仅迁 IDB 做持久化，不参与 nav.json / workbench.json 信封（保持迁移前行为）。
 *
 * v21 起 `icon-cache` **不再属于 nav**：它是 MB 级可重建数据，与用户资产同住一条记录
 * 会造成严重写放大（详见 IDB_ICONCACHE_STORES）。已移至独立 `iconcache` store。
 */
export const NAV_STORE_KEYS = [
  'user-sites',
  'site-click-counts',
  'user-categories',
  'user-deleted-legacy-ids',
  'user-search-engines',
  'user-deleted-engine-ids',
  'user-disabled-engine-ids',
  'built-in-engine-overrides',
  'built-in-engine-default',
  'user-theme',
  'user-background',
  'site-title',
  'site-favicon'
] as const

/** 站点图标缓存键（v21 起存独立 `iconcache` store；v20 及更早曾在 nav 内，迁移见 useIconCache） */
export const ICON_CACHE_KEY = 'icon-cache'

/**
 * 工具箱偏好在 nav store 内的专属键（v21 引入）。
 *
 * v20 及更早它借用 nav 整包记录里的 `IDB_KEY`('items') 字段 —— 于是
 * 「store 的键叫 items」和「记录内有个字段也叫 items」两套含义撞在一起。
 * nav 拆成多记录后这个字段会被拆成一条 `nav['items']` 记录，
 * 与导航数据的键空间混淆。故给它一个语义明确的专属键。
 */
export const TOOLBOX_NAV_KEY = 'toolbox-prefs'

/** 导航键中属于云同步信封的子集（WORKBENCH_PREFS_KEYS 的导航部分，共 10 键），用于 nav.json / workbench.json 打包 */
export const NAV_SYNC_KEYS = [
  'user-sites',
  'user-categories',
  'user-deleted-legacy-ids',
  'user-search-engines',
  'built-in-engine-overrides',
  'built-in-engine-default',
  'user-theme',
  'user-background',
  'site-title',
  'site-favicon'
] as const

/** `nav` store 值结构：所有导航键 → JSON 字符串 */
export type NavPrefsRecord = Record<string, string>

/** 导航同步键集合（用于按来源分别读写，避免触碰非导航 prefs） */
const NAV_SYNC_KEY_SET = new Set<string>(NAV_SYNC_KEYS)
/**
 * 读取 nav store 的全量记录。
 * v21 起 nav 是**按 key 多记录**存储（原为一条 `items` 整包记录），统一走这里装载。
 */
async function readNavRecord(): Promise<NavPrefsRecord> {
  return (await idbGetAllEntries<string>('nav')) ?? {}
}

/** 逐键写回 nav store（与多记录存储配套，避免整包覆盖） */
async function writeNavRecord(record: NavPrefsRecord): Promise<void> {
  for (const [k, v] of Object.entries(record)) {
    await idbPutKey('nav', k, v)
  }
}

/**
 * 打包同步偏好（workbench.json 信封用）：导航键读 `nav` IDB store，其余非导航 prefs 仍读 localStorage，
 * 以保证信封契约与迁移前完全一致（10 导航键 + 6 非导航键）。idbExportAll 直接调用。
 */
export async function packPrefsFromIdb(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const navRecord = await readNavRecord()
  for (const k of NAV_SYNC_KEYS) {
    const v = navRecord[k]
    if (v !== undefined) out[k] = v
  }
  for (const k of WORKBENCH_PREFS_KEYS) {
    if (NAV_SYNC_KEY_SET.has(k)) continue // 导航键已自 nav store 读取
    const v = localStorage.getItem(k)
    if (v !== null) out[k] = v
  }
  return out
}

/**
 * 从 workbench.json 信封回写：导航键写 `nav` IDB store，其余非导航 prefs 写 localStorage。
 * idbImportAll 事务成功后调用。
 *
 * 【2026-10-07 事故加固】导航键改为**只补不删**：远端信封缺少某个键时保留本地值。
 * 事故根因之一正是这条删除语义——任一端数据掉链子导致信封缺键，
 * 另一端「本地不 dirty → 直接应用远端」时就会把本地真实数据删干净。
 * 云同步 nav.json 的常规拉取得走 mergeNav（并集）不会进这里；这里是「直接应用远端」的场合，
 * 保守保留本地更能抗单点数据丢失。需要清空请走「恢复出厂设置 / 导入备份」这类显式路径。
 */
export async function applyPrefsToIdb(prefs: Record<string, string> | undefined): Promise<void> {
  if (!prefs) return
  const navRecord: NavPrefsRecord = await readNavRecord()
  let navChanged = false
  for (const k of NAV_SYNC_KEYS) {
    const v = prefs[k]
    if (v === undefined) {
      if (k in navRecord) {
        console.warn('[nav] applyPrefsToIdb：远端缺少', k, '→ 保留本地值不删除（防误删兜底）')
      }
      continue
    }
    // 远端整站为空而本地有成规模数据 → 判定远端疑似被清空，拒绝覆盖
    // （除非用户刚武装过「以远端/备份为准」的显式放行）
    if (k === 'user-sites' && !isNavWipeOverrideActive() && isSuspectedRemoteWipe(navRecord[k], v)) {
      console.warn('[nav] applyPrefsToIdb：远端 user-sites 为空而本地有数据 → 拒绝覆盖')
      continue
    }
    if (navRecord[k] !== v) { navRecord[k] = v; navChanged = true }
  }
  if (navChanged) await writeNavRecord(navRecord)
  for (const k of WORKBENCH_PREFS_KEYS) {
    if (NAV_SYNC_KEY_SET.has(k)) continue // 导航键已写 nav store
    const v = prefs[k]
    if (v !== undefined) localStorage.setItem(k, v)
    else localStorage.removeItem(k)
  }
}

export async function idbExportAll(): Promise<WorkbenchData> {
  const [todos, notes, diary, countdowns, passwords, health, ledger, settings, pomodoro, habits, business, family] = await Promise.all([
    idbGet<WorkbenchTodo[]>('todos'),
    idbGet<NoteData>('notes'),
    idbGet<DiaryData>('diary'),
    idbGet<Countdown[]>('countdowns'),
    idbGet<string>('passwords'),
    idbGet<HealthData>('health'),
    idbGet<LedgerStoreData | LedgerData>('ledger'),
    idbGet<AppSettingsData>('settings'),
    idbGet('pomodoro'),
    idbGet('habits'),
    idbGet<BusinessStoreData | BusinessData>('business'),
    idbGet<GenealogyData>('family')
  ])
  return {
    version: WORKBENCH_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    todos: todos ?? [],
    notes: notes ?? emptyNoteData(),
    diary: diary ?? emptyDiaryData(),
    countdowns: countdowns ?? [],
    passwords: passwords ?? '',
    health: health ?? emptyHealthData(),
    // 记账多账本：导出前统一归一为「账本容器」（旧扁平数据迁入当前年账本），
    // 保证备份/云同步里始终是带 ledgers 的新结构
    ledger: normalizeLedgerStore(ledger),
    settings: settings ?? emptyAppSettingsData(),
    pomodoro: pomodoro ?? emptyPomodoroData(),
    habits: habits ?? emptyHabitsData(),
    // business 归一为账本容器：旧库/旧备份的扁平 BusinessData 自动迁入当年账本
    business: normalizeBusinessStore(business),
    family: family ?? emptyGenealogyData(),
    passwordsSalt: getStoredSaltHex() ?? undefined,
    passwordVerification: getStoredVerification() ?? undefined,
    prefs: await packPrefsFromIdb()
  }
}

export async function idbImportAll(data: WorkbenchData): Promise<{ adoptedPasswordIdentity: boolean; appliedPrefs: boolean }> {
  // 版本白名单：接受 v1-v9（v1-v7 旧备份兼容导入，不拒绝——AGENTS.md 硬性规范）；
  // 拒绝 v0 与未来 v10+（范围守卫保留 number 类型，下方 v1 分支可正常判定）
  if (data.version < 1 || data.version > 9) {
    throw new Error('备份文件版本不兼容')
  }
  // notes 兼容旧数组（v1/v2 纯便签列表）与新对象（v3 NoteData）两种格式
  const notesValid =
    Array.isArray(data.notes) ||
    (typeof data.notes === 'object' && data.notes !== null && 'categories' in data.notes && 'notes' in data.notes)
  if (
    !Array.isArray(data.todos) ||
    !notesValid ||
    !Array.isArray(data.countdowns) ||
    typeof data.passwords !== 'string'
  ) {
    throw new Error('备份文件格式无效')
  }
  // v1 备份缺 health/ledger 字段 → empty 兜底，归一后统一按 v2 结构逐 store 写入
  if (data.version === 1) {
    data = {
      ...data,
      version: 2,
      health: data.health ?? emptyHealthData(),
      ledger: data.ledger ?? emptyLedgerData()
    }
  }
  // 迁移：notes 在写入循环前统一归一化包装（数组 → { categories: [], notes: [...] }；对象 → 原样归一），
  // 循环直接写归一后的 NoteData，保证 v1/v2/v3/v4 全部入口得到幂等的 v3 结构
  data = { ...data, notes: normalizeNoteData(data.notes) }
  // settings 兼容 v1/v2/v3 备份（运行时无 settings 字段 → empty 兜底）；v4 备份原样透传
  data = { ...data, settings: data.settings ?? emptyAppSettingsData() }
  // pomodoro/habits 兼容 v1-v4 备份（无该字段 → empty 兜底）；v5 备份原样透传。
  // 兜底放在写入循环之前 → 键存在性守卫（下方）对 pomodoro/habits 恒有键可写；
  // snapshots 永不进备份，缺键 → 循环跳过，绝不 put undefined
  data = {
    ...data,
    pomodoro: data.pomodoro ?? emptyPomodoroData(),
    habits: data.habits ?? emptyHabitsData()
  }
  // diary 兼容 v1-v5 备份（无该字段 → empty 兜底）；v6 备份原样透传。
  // 兜底同样放在写入循环之前 → 键存在性守卫对 diary 恒有键可写（v1-v5 导入后日记为空）
  data = { ...data, diary: data.diary ?? emptyDiaryData() }
  // business 兼容 v1-v7 备份（无该字段 → 空账本容器兜底）；v8+ 原样归一（含内置种子分类契约）。
  // 统一走 normalizeBusinessStore：扁平 BusinessData（账本化之前的备份）迁入当年账本，历史数据不丢。
  data = { ...data, business: normalizeBusinessStore(data.business) }
  // family 兼容 v1-v14 备份（无该字段 → empty 兜底）；v15 起原样透传
  data = { ...data, family: data.family ?? emptyGenealogyData() }
  // prefs 兼容 v1-v8 备份（无该字段 → {} 空对象兜底，导入后不回写任何 localStorage）
  data = { ...data, prefs: (typeof data.prefs === 'object' && data.prefs !== null) ? data.prefs : {} }
  // 密码加密身份归一化（v8）：仅当备份携带完整身份（盐+验证串均为非空字符串）且密码库非空时才采纳；
  // 字段存在但畸形 → 视同缺失（向后兼容，不硬失败）。身份与密文绑定，二者必须成套迁移。
  const backupSalt = typeof data.passwordsSalt === 'string' && data.passwordsSalt ? data.passwordsSalt : undefined
  const backupVerification =
    typeof data.passwordVerification === 'string' && data.passwordVerification ? data.passwordVerification : undefined
  const adoptedPasswordIdentity = !!(backupSalt && backupVerification && data.passwords)
  const db = await openIdb()
  // 事务范围覆盖核心+辅助全部 store（循环只写 data 中存在的键，
  // v1-v5 备份缺 snapshots 字段 → 跳过写入，绝不 put undefined 进新 store）
  // data 是解析后的备份 JSON：按任意 store 名动态取键需边界断言（WorkbenchData 无索引签名）
  const backupFields = data as unknown as Record<string, unknown>
  const tx = db.transaction([...IDB_CORE_STORES, ...IDB_AUX_STORES], 'readwrite')
  for (const name of [...IDB_CORE_STORES, ...IDB_AUX_STORES]) {
    // 键存在性守卫：v1-v5 备份缺 snapshots 字段 → 跳过，绝不 put undefined
    if (!(name in backupFields)) continue
    const store = tx.objectStore(name)
    store.clear()
    store.put(backupFields[name], IDB_KEY)
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  // 接管加密身份必须在 IDB 事务成功之后：事务失败不应污染本机加密身份
  if (adoptedPasswordIdentity && backupSalt && backupVerification) {
    adoptPasswordIdentity(backupSalt, backupVerification)
  }
  // v9 prefs 回写（事务成功后再回写，失败不影响 localStorage）：导航键 → nav store，非导航键 → localStorage
  const hasPrefs = typeof data.prefs === 'object' && data.prefs !== null && Object.keys(data.prefs).length > 0
  if (hasPrefs) await applyPrefsToIdb(data.prefs)
  return { adoptedPasswordIdentity, appliedPrefs: hasPrefs }
}

// ==================== 云同步多文件信封（v10 拆分）====================
// 6 份独立信封：nav.json / icons.json / workbench.json / business.json / student.json / teacher.json
// workbench 不含 business（独立走 business.json）；settings 不含 cloudSync* 5 字段（保留本地凭证）
// 自定义图标 v11 起从 localStorage 迁移至 IDB icons store（localStorage ~5MB 容量瓶颈）

/** 自定义图标 localStorage 键（与 stores/icons.ts STORAGE_KEY 保持一致） */
export const ICONS_STORAGE_KEY = 'user-custom-icons'

/** settings 中需本机保留、不随 workbench.json 同步的 cloudSync 字段（凭证 + 开关） */
const CLOUD_SYNC_SETTING_KEYS = [
  'cloudSyncEnabled',
  'cloudSyncUrl',
  'cloudSyncUsername',
  'cloudSyncPassword'
] as const

/** 从 AppSettingsData 中剥离 cloudSync 凭证/开关 4 字段，返回 WorkbenchSyncData.settings 形状。
 *  注意：cloudSyncInterval 与 cloudSyncSilentThreshold 作为同步偏好，随 workbench.json 跨设备同步，不在此剔除。 */
function stripCloudSyncSettings(settings: AppSettingsData): AppSettingsDataNoCloudSync {
  const out: Record<string, unknown> = { ...settings }
  for (const k of CLOUD_SYNC_SETTING_KEYS) delete out[k]
  return out as unknown as AppSettingsDataNoCloudSync
}

/** 读取本地 settings 中的 cloudSync 凭证/开关 4 字段（用于 importWorkbenchData 合并回 remote.settings，保留本机凭证） */
function pickLocalCloudSyncSettings(local: AppSettingsData | undefined): Partial<AppSettingsData> {
  if (!local) return {}
  const picked: Record<string, unknown> = {}
  for (const k of CLOUD_SYNC_SETTING_KEYS) {
    picked[k] = local[k as keyof AppSettingsData]
  }
  return picked as Partial<AppSettingsData>
}

// ---------- nav.json（v18 起偏好存 IDB `nav` store） ----------

/** 从 nav store 打包导航同步信封（仅含 10 个导航同步键，site-click-counts/icon-cache 不进信封） */
export async function exportNav(): Promise<NavSyncData> {
  const navRecord = await readNavRecord()
  const prefs: Record<string, string> = {}
  for (const k of NAV_SYNC_KEYS) {
    const v = navRecord[k]
    if (v !== undefined) prefs[k] = v
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    prefs
  }
}

/**
 * 把远端导航信封写回 nav store（仅处理 NAV_SYNC_KEYS，不影响非导航 localStorage）。
 *
 * 【2026-10-07 事故加固】与 applyPrefsToIdb 一致改为**只补不删**，理由同上：
 * 这条函数是「本地不 dirty → 直接套用远端」路径的实现，
 * 一旦远端那份恰好是数据掉线后的空态，删除语义会把本地原有数据连根拔起。
 */
export async function importNavData(remote: NavSyncData): Promise<void> {
  if (!remote || !remote.prefs) return
  const navRecord: NavPrefsRecord = await readNavRecord()
  for (const k of NAV_SYNC_KEYS) {
    const v = remote.prefs[k]
    if (v === undefined) {
      if (k in navRecord) {
        console.warn('[nav] importNavData：云端缺少', k, '→ 保留本地值不删除（防误删兜底）')
      }
      continue
    }
    // 云端站点列表为空而本地有成规模数据 → 判定云端这份疑似被清空，拒绝覆盖。
    // 例外：用户在冲突解决里选了「全部云端覆盖」（见 armNavWipeOverride）→ 尊重用户裁决。
    if (k === 'user-sites' && !isNavWipeOverrideActive() && isSuspectedRemoteWipe(navRecord[k], v)) {
      console.warn('[nav] importNavData：云端 user-sites 为空而本地有数据 → 拒绝覆盖；如确需覆盖请在冲突解决里选「全部云端覆盖」')
      continue
    }
    navRecord[k] = v
  }
  await writeNavRecord(navRecord)
}

// ---------- icons.json（v11 起存 IDB 'icons' object store，值为 CustomIcon[] 数组；首次从 localStorage 迁移） ----------

export async function exportIcons(): Promise<IconsSyncData> {
  let icons: IconsSyncData['icons'] = []
  try {
    const raw = await idbGet<IconsSyncData['icons']>('icons')
    icons = Array.isArray(raw) ? raw : []
  } catch {
    // IDB 不可用时兜底：尝试读取 localStorage 旧键（可能尚未迁移）
    try {
      const legacy = localStorage.getItem(ICONS_STORAGE_KEY)
      icons = legacy ? (JSON.parse(legacy) as IconsSyncData['icons']) : []
    } catch { icons = [] }
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    icons
  }
}

export async function importIconsData(remote: IconsSyncData): Promise<void> {
  if (!remote || !Array.isArray(remote.icons)) return
  await idbPut('icons', remote.icons)
  // 同步写一份到 localStorage 作为过渡冗余（迁移期双写；IDB 为主），便于旧版回退时不至于丢数据
  try {
    localStorage.setItem(ICONS_STORAGE_KEY, JSON.stringify(remote.icons))
  } catch {
    // localStorage 可能超配额；IDB 已写成功即可，忽略此处异常
  }
}

/** 供 icons store 一次性迁移用：若 localStorage 有旧数据且 IDB 为空 → 搬入 IDB 并删除旧 localStorage 键 */
export async function migrateIconsFromLocalStorageIfNeeded(): Promise<{ migrated: boolean; count: number }> {
  const legacyRaw = localStorage.getItem(ICONS_STORAGE_KEY)
  let legacyList: IconsSyncData['icons'] = []
  if (legacyRaw) {
    try {
      const parsed = JSON.parse(legacyRaw)
      legacyList = Array.isArray(parsed) ? parsed : []
    } catch { legacyList = [] }
  }
  const idbRaw = await idbGet<IconsSyncData['icons']>('icons').catch(() => undefined)
  const idbEmpty = !Array.isArray(idbRaw) || idbRaw.length === 0
  // 仅当 IDB 空且 localStorage 有数据时迁移；否则认为已迁移完成或 IDB 数据为新
  if (idbEmpty && legacyList.length > 0) {
    await idbPut('icons', legacyList)
    // 删除旧键（双写逻辑仅在云同步导入时保留，主动迁移后清理 localStorage 避免重复占用）
    try { localStorage.removeItem(ICONS_STORAGE_KEY) } catch { /* ignore */ }
    return { migrated: true, count: legacyList.length }
  }
  return { migrated: false, count: 0 }
}

// ---------- workbench.json（不含 business；settings 不含 cloudSync*） ----------

export async function exportWorkbench(): Promise<WorkbenchSyncData> {
  const full = await idbExportAll()
  return {
    version: 1,
    exportedAt: full.exportedAt,
    clientId: full.clientId,
    pushedAt: full.pushedAt,
    todos: full.todos,
    notes: full.notes,
    diary: full.diary,
    countdowns: full.countdowns,
    passwords: full.passwords,
    health: full.health,
    ledger: full.ledger,
    // 剥离 cloudSync 凭证/开关 4 字段：workbench.json 不携带云同步凭证（仅本地保留，避免覆盖其他设备）；
    // cloudSyncInterval / cloudSyncSilentThreshold 作为同步偏好随 settings 一起同步
    settings: stripCloudSyncSettings(full.settings),
    pomodoro: full.pomodoro,
    habits: full.habits,
    passwordsSalt: full.passwordsSalt,
    passwordVerification: full.passwordVerification,
    prefs: full.prefs,
    family: full.family
    // 注意：business 字段独立走 business.json，不在此输出
  }
}

export async function importWorkbenchData(remote: WorkbenchSyncData): Promise<{ adoptedPasswordIdentity: boolean; appliedPrefs: boolean }> {
  // 1) 读本地 settings（用于把 cloudSync 凭证/开关 4 字段合并回 remote.settings，保留本机凭证）
  // 2) 读本地 business（idbImportAll 会写 business store，workbench.json 不携带 business 时需保留本地数据）
  // localFamily：云端信封尚无 family 字段时（家谱数据还没推上去 / 云端是 v15 之前的旧信封），
  // 用它兜底保留本地家谱，避免每次自动拉取把本地数据静默清空
  // localLedger：记账多账本容器。远端信封若无 ledger 字段（旧版/尚未推送）必须回退本地，
  // 否则后台自动拉取会把本地全部账本静默清空（同 diary.journals / family 陷阱）
  const [localSettings, localBusiness, localFamily, localDiary, localLedger] = await Promise.all([
    idbGet<AppSettingsData>('settings'),
    idbGet<BusinessStoreData | BusinessData>('business'),
    idbGet<GenealogyData>('family'),
    idbGet<DiaryData>('diary'),
    idbGet<LedgerStoreData | LedgerData>('ledger')
  ])

  // 合并：remote.settings（含同步偏好 cloudSyncInterval/cloudSyncSilentThreshold）+ 本机 cloudSync 凭证/开关 4 字段
  const mergedSettings: AppSettingsData = {
    ...(remote.settings ?? emptyAppSettingsData()),
    ...pickLocalCloudSyncSettings(localSettings),
    // 滚动条显示模式：远端信封为旧版（尚无该字段）时保留本机选择，避免被静默重置为默认
    scrollbarMode: remote.settings?.scrollbarMode ?? localSettings?.scrollbarMode ?? 'auto'
  }

  const workbenchData: WorkbenchData = {
    version: WORKBENCH_DATA_VERSION,
    exportedAt: remote.exportedAt,
    todos: remote.todos ?? [],
    notes: normalizeNoteData(remote.notes ?? emptyNoteData()),
    // 多日志本：journals 是新增字段。远端信封若无 journals（旧版/尚未推送）必须回退本地，
    // 否则后台自动拉取会把本地日志本静默清空（同 family 陷阱）；entries 同样优先远端、缺则空。
    diary: {
      journals: remote.diary?.journals ?? localDiary?.journals ?? [],
      entries: remote.diary?.entries ?? []
    },
    countdowns: remote.countdowns ?? [],
    passwords: remote.passwords ?? '',
    health: remote.health ?? emptyHealthData(),
    // 记账多账本：远端优先、缺则回退本地，且无论新旧结构都归一为「账本容器」再落库，
    // 保证 store 读到的 LEDGER 一定带 ledgers 数组（旧扁平信封自动迁入当前年账本）
    ledger: normalizeLedgerStore(remote.ledger ?? localLedger),
    settings: mergedSettings,
    pomodoro: remote.pomodoro ?? emptyPomodoroData(),
    habits: remote.habits ?? emptyHabitsData(),
    // 家谱并入 workbench.json（明文同步，不加密）。
    // 关键：远端信封若**根本没有** family 字段，说明云端还是旧版（或家谱尚未推送），
    // 此时必须保留本地 family，绝不能覆盖成空——否则后台自动拉取会静默清空本地家谱。
    // 仅当远端明确带 family（哪怕是空数组）时才应用远端。
    family: remote.family ?? localFamily ?? emptyGenealogyData(),
    // 保留本地 business（workbench.json 不携带；idbImportAll 会写入此值，等同 no-op）。
    // 归一为账本容器后再回写，避免把本地新结构降级成扁平数据（会丢失多账本）
    business: normalizeBusinessStore(localBusiness),
    passwordsSalt: remote.passwordsSalt,
    passwordVerification: remote.passwordVerification,
    prefs: remote.prefs,
    clientId: remote.clientId,
    pushedAt: remote.pushedAt
  }

  return await idbImportAll(workbenchData)
}

// ---------- business.json（销售记账独立信封） ----------

/** business.json：读本地账本容器（旧扁平数据经 normalizeBusinessStore 迁入当年账本） */
export async function exportBusiness(): Promise<BusinessSyncData> {
  const business = await idbGet<BusinessStoreData | BusinessData>('business')
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    business: normalizeBusinessStore(business)
  }
}

export async function importBusinessData(remote: BusinessSyncData): Promise<void> {
  // 云端旧信封可能是扁平 BusinessData → 归一为账本容器后再落库，保证 store 读到的一定是 v2 结构
  await idbPut('business', normalizeBusinessStore(remote?.business))
}

// ---------- student.json（学生工作台 15 store 单事务写入） ----------

/** student store 名 → StudentSyncData 字段名映射 */
const STUDENT_STORE_TO_FIELD: Record<string, keyof StudentSyncData> = {
  student_settings: 'studentSettings',
  student_habits: 'studentHabits',
  student_countdowns: 'studentCountdowns',
  student_homework: 'homework',
  student_timetable: 'timetable',
  student_plans: 'plans',
  student_review: 'review',
  student_goals: 'goals',
  student_mistakes: 'mistakes',
  student_reading: 'reading',
  student_achievements: 'achievements',
  student_rewards: 'rewards',
  student_parent_tasks: 'parentTasks',
  student_education: 'education',
  student_health: 'health',
  student_grades: 'studentGrades',
  student_images: 'studentImages'
}

export async function exportStudent(): Promise<StudentSyncData> {
  const [
    studentSettings, studentHabits, studentCountdowns,
    homework, timetable, plans, review, mistakes, reading,
    achievements, rewards, parentTasks, education, health, studentImages, studentGrades, studentGoals
  ] = await Promise.all([
    idbGet('student_settings'),
    idbGet('student_habits'),
    idbGet('student_countdowns'),
    idbGet('student_homework'),
    idbGet('student_timetable'),
    idbGet('student_plans'),
    idbGet('student_review'),
    idbGet('student_goals'),
    idbGet('student_mistakes'),
    idbGet('student_reading'),
    idbGet('student_achievements'),
    idbGet('student_rewards'),
    idbGet('student_parent_tasks'),
    idbGet('student_education'),
    idbGet('student_health'),
    idbGet('student_grades'),
    idbGet('student_images')
  ])
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    studentSettings,
    studentHabits,
    studentCountdowns,
    homework,
    timetable,
    plans,
    review,
    mistakes,
    reading,
    achievements,
    rewards,
    parentTasks,
    education,
    health,
    studentImages,
    studentGrades,
    goals: studentGoals
  }
}

// ---------- teacher.json（教师工作台独立信封，v17 新增 store teacher_workbench） ----------

export async function exportTeacher(): Promise<TeacherSyncData> {
  const teacher = await idbGet('teacher_workbench')
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    // 本机从未用过教师工作台时保持 null（而非空壳）：推送不会把其他设备的真实数据冲掉，
    // 对端 importTeacherData 遇到 null 会跳过、保留本地
    teacher: teacher ?? null
  }
}

export async function importTeacherData(remote: TeacherSyncData): Promise<void> {
  // 云端尚无 teacher 字段（老信封 / 尚未推送）时不写入，保留本地数据，避免被静默清空
  if (!remote || remote.teacher === undefined || remote.teacher === null) return
  await idbPut('teacher_workbench', normalizeTeacherData(remote.teacher))
}

// ---------- smart.json（智能工作台独立信封：技能 / 提示词 / 菜单配置 / 技能分类） ----------
// 数据物理上与其它 prefs 同在 nav IDB store，但打包/回写只认 SMART_PREFS_KEYS，
// 与 nav.json（10 个导航键）互不干扰，也不会被 workbench.json 重复带走一份。

export async function exportSmart(): Promise<SmartSyncData> {
  const navRecord = (await idbGet<NavPrefsRecord>('nav')) ?? {}
  const prefs: Record<string, string> = {}
  for (const k of SMART_PREFS_KEYS) {
    const v = navRecord[k]
    if (v !== undefined) prefs[k] = v
  }
  return { version: 1, exportedAt: new Date().toISOString(), prefs }
}

export async function importSmartData(remote: SmartSyncData): Promise<void> {
  if (!remote || !remote.prefs) return
  const navRecord: NavPrefsRecord = (await idbGet<NavPrefsRecord>('nav')) ?? {}
  let changed = false
  for (const k of SMART_PREFS_KEYS) {
    const v = remote.prefs[k]
    if (v === undefined) continue
    if (navRecord[k] !== v) {
      navRecord[k] = v
      changed = true
    }
  }
  if (changed) await idbPut('nav', navRecord)
}

export async function importStudentData(remote: StudentSyncData): Promise<void> {
  if (!remote) return
  const db = await openIdb()
  const remoteFields = remote as unknown as Record<string, unknown>
  // 单事务覆盖所有学生 store：仅写 remote 中存在的字段，缺失字段不写入（不 put undefined）
  const tx = db.transaction([...IDB_STUDENT_STORES], 'readwrite')
  for (const storeName of [...IDB_STUDENT_STORES]) {
    const fieldName = STUDENT_STORE_TO_FIELD[storeName]
    if (!fieldName) continue
    if (!(fieldName in remoteFields)) continue
    const store = tx.objectStore(storeName)
    store.clear()
    store.put(remoteFields[fieldName], IDB_KEY)
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
