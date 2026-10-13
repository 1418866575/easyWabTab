/**
 * 浏览器端上传的书籍存储（IndexedDB `books` store，按 id 多记录）
 *
 * 定位：让用户不碰 git 也能把一本 HTML 放进自己的书架。
 *
 * 与 public/books 静态书的关系 —— **刻意两套数据**：
 * - 静态书：跟着 git 与部署走，所有访问者看到的都是同一批
 * - 上传书：只存在这台设备的这个浏览器里，不上传服务器、不进云同步
 *
 * 为什么不做成「上传后写进 public/books」：浏览器没有任何权限往服务器磁盘写文件，
 * 唯一能做到的持久化位置就是本机存储。硬凑成一套只会让「这本书别人看得见吗」
 * 这个问题变得无法回答。
 *
 * 存储形态：每本书一条记录，值为 UploadedBook（含 HTML 正文文本）。
 * HTML 正文可达 MB 级，故**按 id 分记录**而非整包一条 —— 删一本不必重写全部。
 */

import { idbDeleteKey, idbGetAllEntries, idbPutKey } from './useIdb.ts'
import { checkUploadFile, type BookSource } from './booksCore.ts'

export interface UploadedBook {
  id: string
  title: string
  description: string
  category: string
  tags: string[]
  /** HTML 正文（自包含单文件的全文） */
  html: string
  /** 字节数（UTF-16 字符串长度，用于体积展示；与磁盘字节数略有出入） */
  size: number
  createdAt: number
  updatedAt: number
}

/** 读出全部上传的书，按更新时间倒序（新的在前） */
export async function listUploadedBooks(): Promise<UploadedBook[]> {
  let raw: Record<string, unknown> = {}
  try {
    raw = (await idbGetAllEntries('books')) ?? {}
  } catch (e) {
    // IDB 不可用（隐私模式 / 配额超限）→ 降级为空列表，静态书照常可用
    console.warn('[booksUpload] IndexedDB 不可用，上传书架降级为空:', e)
    return []
  }
  const out: UploadedBook[] = []
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue
    const o = value as Record<string, unknown>
    if (typeof o.html !== 'string' || !o.html) continue
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : id,
      title: typeof o.title === 'string' && o.title ? o.title : id,
      description: typeof o.description === 'string' ? o.description : '',
      category: typeof o.category === 'string' && o.category ? o.category : '我的上传',
      tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [],
      html: o.html,
      size: typeof o.size === 'number' ? o.size : o.html.length,
      createdAt: typeof o.createdAt === 'number' ? o.createdAt : 0,
      updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0
    })
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt)
  return out
}

/** 读单本上传的书 */
export async function getUploadedBook(id: string): Promise<UploadedBook | null> {
  try {
    const raw = await idbGetAllEntries<UploadedBook>('books')
    const found = raw?.[id]
    if (found && typeof found.html === 'string' && found.html) return found
    return null
  } catch {
    return null
  }
}

/** 写入一本上传的书 */
export async function putUploadedBook(book: UploadedBook): Promise<void> {
  await idbPutKey('books', book.id, book)
}

/** 删除一本上传的书 */
export async function deleteUploadedBook(id: string): Promise<void> {
  await idbDeleteKey('books', id)
}

export interface UploadResult {
  ok: boolean
  message: string
  id?: string
}

/**
 * 上传一个 HTML 文件。
 *
 * 校验顺序刻意是「先查后读」：`checkUploadFile` 只看文件名/大小，
 * 确认会通过才 `file.text()` 把正文读进内存 —— 反过来的话，
 * 一个 8MB 的非法文件会先被完整读进内存再被拒，白白浪费。
 */
export async function uploadBookFile(file: File, existingIds: string[] = []): Promise<UploadResult> {
  const check = checkUploadFile(file, existingIds)
  if (!check.ok) {
    return { ok: false, message: check.message ?? '文件不可用' }
  }

  let html: string
  try {
    html = await file.text()
  } catch (e) {
    return { ok: false, message: `读取文件失败：${(e as Error)?.message ?? e}` }
  }
  if (!html.trim()) {
    return { ok: false, message: '文件内容是空的' }
  }

  const now = Date.now()
  const id = check.id as string
  const book: UploadedBook = {
    id,
    title: check.title ?? id,
    description: '',
    category: '我的上传',
    tags: [],
    html,
    size: html.length,
    createdAt: now,
    updatedAt: now
  }

  try {
    await putUploadedBook(book)
  } catch (e) {
    // 配额超限是这里最可能的失败（8MB × N 本很快触顶）
    return { ok: false, message: `保存失败（浏览器存储空间可能已满）：${(e as Error)?.message ?? e}` }
  }
  return { ok: true, id, message: `已上传「${book.title}」` }
}

/** 更新一本上传书的元信息（标题/简介/分类/标签），不动 HTML 正文 */
export async function updateUploadedBookMeta(
  id: string,
  patch: Partial<Pick<UploadedBook, 'title' | 'description' | 'category' | 'tags'>>
): Promise<UploadResult> {
  const existing = await getUploadedBook(id)
  if (!existing) return { ok: false, message: '这本书不存在，可能已被删除' }
  const next: UploadedBook = {
    ...existing,
    title: typeof patch.title === 'string' && patch.title.trim() ? patch.title.trim() : existing.title,
    description: typeof patch.description === 'string' ? patch.description.trim() : existing.description,
    category: typeof patch.category === 'string' && patch.category.trim() ? patch.category.trim() : existing.category,
    tags: Array.isArray(patch.tags)
      ? patch.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()).map((t) => t.trim())
      : existing.tags,
    updatedAt: Date.now()
  }
  try {
    await putUploadedBook(next)
    return { ok: true, id, message: '已保存' }
  } catch (e) {
    return { ok: false, message: `保存失败：${(e as Error)?.message ?? e}` }
  }
}

/**
 * 把上传书转成书架条目。
 *
 * `entry` 传空的 blobUrl 占位：真正能打开的地址要用 `URL.createObjectURL(blob)`
 * 现场生成，而 blob URL 的生命周期跟着当前文档走 —— 提前生成并存下来必然失效
 * （刷新页面后旧 URL 全部指向死资源）。所以 entry 一律留空，由调用方在**点击那一刻**
 * 现生成。
 */
export function uploadedToBookItem(u: UploadedBook, source: BookSource = 'upload'): {
  id: string
  title: string
  description: string
  cover: string
  category: string
  tags: string[]
  order: number
  entry: string
  size: number
  updatedAt: string
  hasMeta: boolean
  source: BookSource
} {
  return {
    id: u.id,
    title: u.title,
    description: u.description,
    cover: '',
    category: u.category,
    tags: u.tags,
    order: 1e9,
    entry: '',
    size: u.size,
    updatedAt: new Date(u.updatedAt || Date.now()).toISOString(),
    hasMeta: !!u.description,
    source
  }
}

/** 上传书的 HTML 文本 → Blob → blob URL（每次点击现场生成，不缓存） */
export async function makeUploadObjectUrl(html: string): Promise<string> {
  return URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
}