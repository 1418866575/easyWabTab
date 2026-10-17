/**
 * 模块级异步云同步 —— 映射表与纯函数（零 UI / 零网络依赖，便于单测）
 *
 * 设计要点（详见 docs/module-sync/模块级异步云同步-实现方案.md）：
 *   - 模块键由 route.name 归一化而来；切换入口是 router.push，故挂钩路由守卫即可，不改切换器。
 *   - **模块边界 ≠ IDB store 边界**：nav 一个 store 里住了导航站 / 智能工作台 / 工具箱 /
 *     博客前台 / 图书馆共 5 个模块的数据，只能按 prefs key 命名空间区分。因此作用域同时
 *     给出「信封名（WebDAV）」与「stores + navKeys（飞书）」两套描述。
 *   - student_images(Blob) / iconcache / books / navmeta 刻意不入任何信封，不在此映射内。
 */
import {
  IDB_STUDENT_STORES,
  NAV_SYNC_KEYS,
  SMART_PREFS_KEYS,
  TOOLBOX_NAV_KEY,
  BLOG_PREFS_NAV_KEY,
  BOOKS_PREFS_NAV_KEY
} from './useIdb'

export type ModuleKey =
  | 'nav'
  | 'workbench'
  | 'business'
  | 'student'
  | 'teacher'
  | 'toolbox'
  | 'smart'
  | 'blogAdmin'
  | 'blogFront'
  | 'books'

/** 一个模块的同步作用域：WebDAV 走信封，飞书走 IDB store + nav key 白名单 */
export interface ModuleScope {
  /** WebDAV 渠道：属于该模块的信封文件名 */
  envelopes: string[]
  /** 飞书渠道：属于该模块的 IDB object store 名（空数组表示只含 nav 内的 key） */
  stores: string[]
  /** 飞书渠道：当 store === 'nav' 时，属于该模块的 key 白名单 */
  navKeys?: string[]
}

/** 学生工作台参与同步的 store（排除 Blob 容器 student_images） */
const STUDENT_SYNC_STORES = IDB_STUDENT_STORES.filter((s) => s !== 'student_images')

/** 个人工作台（workbench.json 信封实际覆盖的 store，不含 business） */
const WORKBENCH_STORES = [
  'todos',
  'notes',
  'diary',
  'countdowns',
  'passwords',
  'health',
  'ledger',
  'settings',
  'pomodoro',
  'habits',
  'family'
]

export const MODULE_SCOPES: Record<ModuleKey, ModuleScope> = {
  nav: { envelopes: ['nav.json', 'icons.json'], stores: ['icons'], navKeys: [...NAV_SYNC_KEYS] },
  workbench: { envelopes: ['workbench.json'], stores: WORKBENCH_STORES },
  business: { envelopes: ['business.json'], stores: ['business'] },
  student: { envelopes: ['student.json'], stores: [...STUDENT_SYNC_STORES] },
  teacher: { envelopes: ['teacher.json'], stores: ['teacher_workbench'] },
  toolbox: { envelopes: ['toolbox.json'], stores: ['lottery'], navKeys: [TOOLBOX_NAV_KEY] },
  smart: { envelopes: ['smart.json'], stores: [], navKeys: [...SMART_PREFS_KEYS] },
  blogAdmin: { envelopes: ['blog.json'], stores: ['blog'] },
  blogFront: { envelopes: ['blog-prefs.json'], stores: [], navKeys: [BLOG_PREFS_NAV_KEY] },
  books: { envelopes: ['books.json'], stores: [], navKeys: [BOOKS_PREFS_NAV_KEY] }
}

/** route.name → 模块键；blog-post / book-reader 归到父模块 */
const ROUTE_TO_MODULE: Record<string, ModuleKey> = {
  home: 'nav',
  workbench: 'workbench',
  business: 'business',
  student: 'student',
  teacher: 'teacher',
  toolbox: 'toolbox',
  smart: 'smart',
  'blog-admin': 'blogAdmin',
  blog: 'blogFront',
  'blog-post': 'blogFront',
  books: 'books',
  'book-reader': 'books'
}

/** 由路由名取模块键；取不到返回空串（表示不参与模块级同步） */
export function moduleKeyOf(routeName: unknown): ModuleKey | '' {
  if (typeof routeName !== 'string') return ''
  return ROUTE_TO_MODULE[routeName] ?? ''
}

/** 防抖窗口：快速连切时同一 (type, module) 只跑最后一次 */
export const MODULE_DEBOUNCE_MS = 600
/** 单个同步任务的超时上限，防悬挂 */
export const MODULE_SYNC_TIMEOUT_MS = 15_000
/** 自动重试上限（超过则置 failed，等待手动或下次切换） */
export const MAX_MODULE_RETRY = 4

/** 指数退避：5s → 10s → 20s → 40s（retry 从 1 开始） */
export function backoffMs(retry: number): number {
  const n = Math.max(1, retry)
  return Math.min(5_000 * 2 ** (n - 1), 5 * 60_000)
}

/** 任务 id：同一 (type, module) 视为同一类任务，用于防抖与"被更新任务取代"判定 */
export function taskIdOf(type: 'push' | 'pull', module: ModuleKey): string {
  return `${type}:${module}`
}

/** 判断某个 store#key 是否落在给定作用域内（飞书行级过滤用） */
export function inScope(scope: ModuleScope | undefined, store: string, key?: string): boolean {
  if (!scope) return true
  if (store === 'nav') {
    if (!scope.navKeys || scope.navKeys.length === 0) return false
    return key ? scope.navKeys.includes(key) : true
  }
  return scope.stores.includes(store)
}
