/**
 * 四象限笔记纯逻辑
 *
 * 象限口径（艾森豪威尔矩阵）：
 * - q1 重要且紧急 —— 立即做
 * - q2 重要不紧急 —— 计划做
 * - q3 紧急不重要 —— 委托做
 * - q4 不重要不紧急 —— 少做
 */

export type Quadrant = 'q1' | 'q2' | 'q3' | 'q4'

export interface QuadItem {
  id: string
  text: string
  q: Quadrant
  done: boolean
  ts: number
}

export interface QuadrantData {
  items: QuadItem[]
}

export const QUADRANTS: { id: Quadrant; title: string; sub: string }[] = [
  { id: 'q1', title: '重要 · 紧急', sub: '立即做' },
  { id: 'q2', title: '重要 · 不紧急', sub: '计划做' },
  { id: 'q3', title: '不重要 · 紧急', sub: '委托做' },
  { id: 'q4', title: '不重要 · 不紧急', sub: '少做' }
]

export const MAX_ITEMS = 500
export const MAX_TEXT = 200

export function emptyQuadrantData(): QuadrantData {
  return { items: [] }
}

export function normalizeQuadrantData(raw: unknown): QuadrantData {
  const obj = raw as { items?: unknown } | null
  const list = Array.isArray(obj?.items) ? obj.items : []
  const items: QuadItem[] = []
  for (const r of list) {
    const it = r as Partial<QuadItem>
    if (!it || typeof it.id !== 'string' || typeof it.text !== 'string') continue
    const q = it.q
    items.push({
      id: it.id,
      text: it.text.slice(0, MAX_TEXT),
      q: q === 'q1' || q === 'q2' || q === 'q3' || q === 'q4' ? q : 'q1',
      done: !!it.done,
      ts: typeof it.ts === 'number' ? it.ts : Date.now()
    })
    if (items.length >= MAX_ITEMS) break
  }
  return { items }
}

export function moveItem(data: QuadrantData, id: string, to: Quadrant): QuadrantData {
  return { items: data.items.map((it) => (it.id === id ? { ...it, q: to } : it)) }
}

export function toggleDone(data: QuadrantData, id: string): QuadrantData {
  return { items: data.items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)) }
}

export function removeItem(data: QuadrantData, id: string): QuadrantData {
  return { items: data.items.filter((it) => it.id !== id) }
}

export function addItem(data: QuadrantData, text: string, q: Quadrant): { data: QuadrantData; ok: boolean } {
  const t = text.trim().slice(0, MAX_TEXT)
  if (!t || data.items.length >= MAX_ITEMS) return { data, ok: false }
  return {
    data: {
      items: data.items.concat([{ id: `q${Date.now()}${Math.random().toString(36).slice(2, 6)}`, text: t, q, done: false, ts: Date.now() }])
    },
    ok: true
  }
}

export function renameItem(data: QuadrantData, id: string, text: string): QuadrantData {
  const t = text.trim().slice(0, MAX_TEXT)
  if (!t) return data
  return { items: data.items.map((it) => (it.id === id ? { ...it, text: t } : it)) }
}

export function itemsOf(data: QuadrantData, q: Quadrant): QuadItem[] {
  return data.items.filter((it) => it.q === q)
}

export function countByQuadrant(data: QuadrantData): Record<Quadrant, number> {
  const out: Record<Quadrant, number> = { q1: 0, q2: 0, q3: 0, q4: 0 }
  for (const it of data.items) out[it.q] += 1
  return out
}
