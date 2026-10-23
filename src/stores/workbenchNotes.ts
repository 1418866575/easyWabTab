import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import { NOTE_STATUSES } from '@/types'
import type { NoteCategory, NoteColor, NoteData, NoteStatus, NoteType, TimelineEntry, WorkbenchNote } from '@/types'
import { emptyNoteData, normalizeNoteData, normalizeDueDate, sortNotes } from '../composables/noteCore'
import { activeOnly, clearDeleted, gcTombstones as gcTombstonesCore, markDeleted, trashedItems } from '../composables/tombstoneCore'
import { idbGet, idbPut } from '../composables/useIdb'
import { getClientId, markDirty } from '@/composables/useCloudSync'

// 工作台便签 store（数据存 IndexedDB store 'notes'：便签分类 + 时光轴条目 混合模型，经 noteCore 归一化后读写）
export const useWorkbenchNotesStore = defineStore('workbenchNotes', () => {
  const categories = ref<NoteCategory[]>([])
  const notes = ref<WorkbenchNote[]>([])

  async function loadNotes(): Promise<void> {
    try {
      // 存量脏数据（旧数组格式/分类缺失/时光轴条目异常等）经 normalizeNoteData 幂等归一
      const norm = normalizeNoteData(await idbGet<NoteData>('notes'))
      categories.value = norm.categories
      notes.value = norm.notes
    } catch (e) {
      console.error('[Notes] load failed', e)
      const empty = emptyNoteData()
      categories.value = empty.categories
      notes.value = empty.notes
    }
  }

  async function saveNotes(): Promise<void> {
    try {
      // toRaw：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）。
      // toRaw 只解开最外层代理，故对每个 reactive 数组分别 toRaw 后再放入普通对象——
      // 对 { ... } 字面量整体 toRaw 无效（字面量本身非响应式，嵌套 Proxy 不会被解开）。
      await idbPut('notes', { categories: toRaw(categories.value), notes: toRaw(notes.value) })
      markDirty()
    } catch (e) {
      console.error('[Notes] save failed', e)
    }
  }

  async function addNote(input: { title?: string; content: string; color: NoteColor; type?: NoteType; categoryId?: string; entries?: TimelineEntry[]; dueDate?: string; status?: NoteStatus }): Promise<void> {
    const now = new Date().toISOString()
    notes.value.push({
      id: `nt_${Date.now()}`,
      title: input.title,
      content: input.content,
      color: input.color,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      type: input.type,
      categoryId: input.categoryId,
      entries: input.entries,
      // 新增便签支持截止日期与状态；经 normalizeDueDate 过滤非法日期
      dueDate: normalizeDueDate(input.dueDate),
      status: (NOTE_STATUSES as readonly string[]).includes(input.status as string)
        ? (input.status as NoteStatus)
        : 'pending'
    })
    await saveNotes()
  }

  async function updateNote(id: string, patch: Partial<WorkbenchNote>): Promise<void> {
    const index = notes.value.findIndex(n => n.id === id)
    if (index !== -1) {
      notes.value[index] = {
        ...notes.value[index],
        ...patch,
        updatedAt: new Date().toISOString()
      }
      await saveNotes()
    }
  }

  /**
   * 删除便签 = **写墓碑**，不是移除记录。
   * 墓碑必须留在数组里随 workbench 信封上云，云端与其它端才知道这条已删；
   * 若这里直接 filter 掉，下次拉取时"本地缺席"会被合并逻辑解释为"远端新增" → 便签复活。
   */
  async function deleteNote(id: string): Promise<void> {
    const now = new Date().toISOString()
    // 在 toRaw 的原始数组上 map：reactive 代理元素会让 IDB 结构化克隆抛 DataCloneError
    notes.value = toRaw(notes.value).map(n =>
      n.id === id ? markDeleted(n, { now, clientId: getClientId() }) : n
    )
    await saveNotes()
  }

  /** 恢复墓碑（回收站「还原」）：清 deletedAt 并推进版本，否则对端可能仍认为它是墓碑 */
  async function restoreNote(id: string): Promise<void> {
    const now = new Date().toISOString()
    notes.value = toRaw(notes.value).map(n =>
      n.id === id ? clearDeleted(n, { now, clientId: getClientId() }) : n
    )
    await saveNotes()
  }

  /** 彻底删除 = 物理清除（回收站「彻底删除」/ GC 到期）。调用前须确保墓碑已推送上云 */
  async function purgeNote(id: string): Promise<void> {
    notes.value = toRaw(notes.value).filter(n => n.id !== id)
    await saveNotes()
  }

  /**
   * 墓碑 GC：物理清除 deletedAt 超保留期（7 天）的便签。
   * 须在墓碑已成功推送上云之后调用（forcePushLocal 成功回调里调），否则对端会补回。
   * @returns 实际清除的条数
   */
  async function gcTombstones(): Promise<number> {
    const { kept, purged } = gcTombstonesCore(toRaw(notes.value), new Date())
    if (purged === 0) return 0
    notes.value = kept
    await saveNotes()
    return purged
  }

  async function togglePin(id: string): Promise<void> {
    const note = notes.value.find(n => n.id === id)
    if (note) {
      note.pinned = !note.pinned
      note.updatedAt = new Date().toISOString()
      await saveNotes()
    }
  }

  // ---- 便签分类 CRUD ----

  /** 新增便签分类：名称 trim 后非空、与全部现有分类（大小写不敏感）唯一 → 才写入。 */
  async function addCategory(name: string): Promise<boolean> {
    const trimmed = name.trim()
    if (!trimmed) return false
    const lower = trimmed.toLowerCase()
    if (categories.value.some(c => c.name.trim().toLowerCase() === lower)) return false
    // 追加末尾：sort 取现有最大 +1（镜像 categories.ts addCategory），保证 moveCategory 的 sort 交换有意义
    const maxSort = categories.value.reduce((max, c) => Math.max(max, c.sort ?? 0), 0)
    categories.value.push({ id: `nc_${Date.now()}`, name: trimmed, sort: maxSort + 1, showInTabs: true })
    await saveNotes()
    return true
  }

  /** 改名/调序/标签页显隐：名称唯一校验排除自身；失败（未找到/重名/空名）返回 false，不写入。 */
  async function updateCategory(id: string, patch: { name?: string; sort?: number; showInTabs?: boolean }): Promise<boolean> {
    const index = categories.value.findIndex(c => c.id === id)
    if (index === -1) return false
    const changes: Partial<NoteCategory> = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) return false
      if (categories.value.some(c => c.id !== id && c.name.trim().toLowerCase() === name.toLowerCase())) return false
      changes.name = name
    }
    if (patch.sort !== undefined) changes.sort = patch.sort
    if (patch.showInTabs !== undefined) changes.showInTabs = patch.showInTabs
    categories.value[index] = { ...categories.value[index], ...changes }
    await saveNotes()
    return true
  }

  /** 上移/下移：按 sort 排序后与相邻分类交换 sort 权重（镜像 categories.ts moveCategory）；不可移动时返回 false。 */
  async function moveCategory(id: string, dir: 'up' | 'down'): Promise<boolean> {
    const sorted = [...categories.value].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
    const index = sorted.findIndex(c => c.id === id)
    if (index === -1) return false
    if (dir === 'up' && index === 0) return false
    if (dir === 'down' && index >= sorted.length - 1) return false
    const target = sorted[index]
    const neighbor = sorted[dir === 'up' ? index - 1 : index + 1]
    const tempSort = neighbor.sort
    neighbor.sort = target.sort
    target.sort = tempSort ?? 999
    await saveNotes()
    return true
  }

  /** 删除分类：移除分类，并把该分类下所有便签置为未分类（categoryId: undefined），随后写回。 */
  async function deleteCategory(id: string): Promise<boolean> {
    if (!categories.value.some(c => c.id === id)) return false
    categories.value = toRaw(categories.value).filter(c => c.id !== id)
    // 归未分类：必须在 toRaw 的原始数组上 map（同 deleteNote 的 toRaw filter 模式），
    // 直接 notes.value.map 会产生 Proxy 元素 → IDB 结构化克隆 DataCloneError
    notes.value = toRaw(notes.value).map(n => (n.categoryId === id ? { ...n, categoryId: undefined } : n))
    await saveNotes()
    return true
  }

  // ---- 时光轴条目 CRUD ----

  /** 新增时光轴条目：content trim 后必须非空；entries 缺失时先建 []。 */
  async function addTimelineEntry(noteId: string, input: { datetime: string; content: string }): Promise<boolean> {
    const content = input.content.trim()
    if (!content) return false
    const note = notes.value.find(n => n.id === noteId)
    if (!note) return false
    const entries = note.entries ?? []
    entries.push({
      id: `te_${Date.now()}`,
      datetime: input.datetime,
      content,
      createdAt: new Date().toISOString()
    })
    note.entries = entries
    await saveNotes()
    return true
  }

  /** 修改时光轴条目：patch 合并到匹配条目上。 */
  async function updateTimelineEntry(noteId: string, entryId: string, patch: Partial<TimelineEntry>): Promise<void> {
    const note = notes.value.find(n => n.id === noteId)
    const entries = note?.entries
    if (!entries) return
    const index = entries.findIndex(e => e.id === entryId)
    if (index !== -1) {
      entries[index] = { ...entries[index], ...patch }
      await saveNotes()
    }
  }

  /** 删除时光轴条目：在 toRaw 的原始 entries 数组上 filter（解开代理避免 DataCloneError）。 */
  async function deleteTimelineEntry(noteId: string, entryId: string): Promise<void> {
    const note = notes.value.find(n => n.id === noteId)
    const entries = note?.entries
    if (!entries) return
    note.entries = toRaw(entries).filter(e => e.id !== entryId)
    await saveNotes()
  }

  /** 活记录（剔除墓碑）：所有展示/筛选/统计都必须走它，不能直接读 notes */
  const activeNotes = computed<WorkbenchNote[]>(() => activeOnly(notes.value))
  /** 回收站：墓碑按删除时间倒序 */
  const trashedNotes = computed<WorkbenchNote[]>(() => trashedItems(notes.value))

  // 排序：置顶优先 → updatedAt 降序（公式属 noteCore，store 只做薄委托）
  // 墓碑已在 activeNotes 过滤掉，排序只负责次序
  const sortedNotes = computed<WorkbenchNote[]>(() => sortNotes(activeNotes.value))

  return {
    categories,
    notes,
    activeNotes,
    trashedNotes,
    loadNotes,
    saveNotes,
    addNote,
    updateNote,
    deleteNote,
    restoreNote,
    purgeNote,
    gcTombstones,
    togglePin,
    addCategory,
    updateCategory,
    moveCategory,
    deleteCategory,
    addTimelineEntry,
    updateTimelineEntry,
    deleteTimelineEntry,
    sortedNotes
  }
})
