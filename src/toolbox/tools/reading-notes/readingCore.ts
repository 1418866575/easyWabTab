/**
 * 读书笔记纯逻辑
 *
 * 说明：数据存本机 IndexedDB（toolStore），与「图书馆」模块（books store）完全独立，
 * UI 需注明两者不互通。
 */

export type BookStatus = 'wish' | 'reading' | 'done'

export interface ReadingNote {
  id: string
  text: string
  page: number | null
  /** 是否金句摘抄 */
  quote: boolean
  ts: number
}

export interface BookItem {
  id: string
  title: string
  author: string
  category: string
  status: BookStatus
  /** 已读页数 */
  current: number
  /** 总页数（0 表示未设置） */
  total: number
  notes: ReadingNote[]
  ts: number
}

export interface ReadingData {
  books: BookItem[]
}

export const STATUS_META: { id: BookStatus; name: string }[] = [
  { id: 'wish', name: '想读' },
  { id: 'reading', name: '在读' },
  { id: 'done', name: '已读' }
]

export const DEFAULT_CATEGORIES = ['文学', '社科', '科技', '经管', '童书', '其他']
export const MAX_BOOKS = 200
export const MAX_NOTE = 5000

export function emptyReadingData(): ReadingData {
  return { books: [] }
}

function normStatus(v: unknown): BookStatus {
  return v === 'reading' || v === 'done' ? v : 'wish'
}

export function normalizeReadingData(raw: unknown): ReadingData {
  const obj = raw as { books?: unknown } | null
  const list = Array.isArray(obj?.books) ? obj.books : []
  const books: BookItem[] = []
  for (const r of list) {
    const b = r as Partial<BookItem>
    if (!b || typeof b.id !== 'string' || typeof b.title !== 'string') continue
    const notes: ReadingNote[] = Array.isArray(b.notes)
      ? (b.notes as Partial<ReadingNote>[])
          .filter((n) => n && typeof n.id === 'string' && typeof n.text === 'string')
          .map((n) => ({
            id: n.id as string,
            text: (n.text as string).slice(0, MAX_NOTE),
            page: typeof n.page === 'number' ? n.page : null,
            quote: !!n.quote,
            ts: typeof n.ts === 'number' ? n.ts : Date.now()
          }))
      : []
    books.push({
      id: b.id,
      title: b.title.slice(0, 80),
      author: typeof b.author === 'string' ? b.author.slice(0, 40) : '',
      category: typeof b.category === 'string' ? b.category.slice(0, 20) : '其他',
      status: normStatus(b.status),
      current: typeof b.current === 'number' && b.current > 0 ? Math.trunc(b.current) : 0,
      total: typeof b.total === 'number' && b.total > 0 ? Math.trunc(b.total) : 0,
      notes,
      ts: typeof b.ts === 'number' ? b.ts : Date.now()
    })
    if (books.length >= MAX_BOOKS) break
  }
  return { books }
}

export function addBook(data: ReadingData, title: string, author: string, category: string): { data: ReadingData; ok: boolean } {
  const t = title.trim().slice(0, 80)
  if (!t || data.books.length >= MAX_BOOKS) return { data, ok: false }
  return {
    data: {
      books: data.books.concat([
        {
          id: `b${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          title: t,
          author: author.trim().slice(0, 40),
          category: category || '其他',
          status: 'wish',
          current: 0,
          total: 0,
          notes: [],
          ts: Date.now()
        }
      ])
    },
    ok: true
  }
}

export function removeBook(data: ReadingData, id: string): ReadingData {
  return { books: data.books.filter((b) => b.id !== id) }
}

export function updateBook(data: ReadingData, id: string, patch: Partial<Pick<BookItem, 'title' | 'author' | 'category' | 'status' | 'current' | 'total'>>): ReadingData {
  return {
    books: data.books.map((b) =>
      b.id === id
        ? {
            ...b,
            ...patch,
            title: typeof patch.title === 'string' ? patch.title.trim().slice(0, 80) || b.title : b.title
          }
        : b
    )
  }
}

export function addNote(data: ReadingData, bookId: string, text: string, page: number | null, quote: boolean): { data: ReadingData; ok: boolean } {
  const t = text.trim().slice(0, MAX_NOTE)
  if (!t) return { data, ok: false }
  return {
    data: {
      books: data.books.map((b) =>
        b.id === bookId
          ? {
              ...b,
              notes: b.notes.concat([
                { id: `n${Date.now()}${Math.random().toString(36).slice(2, 5)}`, text: t, page, quote, ts: Date.now() }
              ])
            }
          : b
      )
    },
    ok: true
  }
}

export function removeNote(data: ReadingData, bookId: string, noteId: string): ReadingData {
  return {
    books: data.books.map((b) => (b.id === bookId ? { ...b, notes: b.notes.filter((n) => n.id !== noteId) } : b))
  }
}

export function progressPercent(b: BookItem): number {
  if (!b.total || b.current <= 0) return b.status === 'done' ? 100 : 0
  return Math.min(100, Math.round((b.current / b.total) * 100))
}

export function statsOf(data: ReadingData): { wish: number; reading: number; done: number; notes: number; quotes: number } {
  const notes = data.books.reduce((s, b) => s + b.notes.length, 0)
  const quotes = data.books.reduce((s, b) => s + b.notes.filter((n) => n.quote).length, 0)
  return {
    wish: data.books.filter((b) => b.status === 'wish').length,
    reading: data.books.filter((b) => b.status === 'reading').length,
    done: data.books.filter((b) => b.status === 'done').length,
    notes,
    quotes
  }
}

export function searchBooks(data: ReadingData, q: string): BookItem[] {
  const k = (q ?? '').trim().toLowerCase()
  if (!k) return data.books
  return data.books.filter(
    (b) =>
      b.title.toLowerCase().includes(k) ||
      b.author.toLowerCase().includes(k) ||
      b.category.toLowerCase().includes(k) ||
      b.notes.some((n) => n.text.toLowerCase().includes(k))
  )
}

/** 导出 Markdown：书目 + 笔记清单 */
export function exportMarkdown(data: ReadingData): string {
  const lines: string[] = ['# 读书笔记', '']
  for (const b of data.books) {
    const pct = progressPercent(b)
    const meta = [b.author || '佚名', STATUS_META.find((s) => s.id === b.status)?.name ?? '', b.total ? `${b.current || 0}/${b.total} 页（${pct}%）` : '']
      .filter(Boolean)
      .join(' · ')
    lines.push(`## ${b.title}`, '', `- 分类：${b.category}`, `- 信息：${meta}`, '')
    if (!b.notes.length) {
      lines.push('_暂无笔记_', '')
      continue
    }
    for (const n of b.notes) {
      const page = n.page ? `（P${n.page}）` : ''
      lines.push(n.quote ? `> ${n.text}${page}` : `- ${n.text}${page}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}
