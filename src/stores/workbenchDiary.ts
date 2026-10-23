import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { DiaryData, WorkbenchDiary, WorkbenchJournal } from '@/types'
import {
  computeStreak,
  defaultJournal,
  DEFAULT_JOURNAL_ID,
  emptyDiaryData,
  findDiaryByDate,
  normalizeDiaryData,
  sortDiaryEntries
} from '../composables/diaryCore'
import { activeOnly, clearDeleted, isDeleted, markDeleted, trashedItems } from '../composables/tombstoneCore'
import { idbGet, idbPut } from '../composables/useIdb'
import { getClientId, markDirty } from '@/composables/useCloudSync'

/**
 * 日记已删判定：`deletedAt`（新墓碑）优先，兼容旧的 `deleted: true` 布尔标记。
 * 旧数据只写了 deleted 没写时间戳，直接以 deletedAt 判定会把它们当活记录显示出来。
 */
function entryDeleted(e: WorkbenchDiary): boolean {
  return isDeleted(e) || e.deleted === true
}

// 工作台日记本 store（数据存 IndexedDB store 'diary'：多日志本，每天每条目唯一，date 本地 'YYYY-MM-DD' 唯一，upsert 语义，经 diaryCore 归一化后读写）
export const useWorkbenchDiaryStore = defineStore('workbench-diary', () => {
  const entries = ref<WorkbenchDiary[]>([])
  const journals = ref<WorkbenchJournal[]>([])
  const currentJournalId = ref<string>('')

  async function loadDiary(): Promise<void> {
    try {
      // 存量脏数据（非法 date 条目/缺 id/非字符串 content 等）经 normalizeDiaryData 幂等归一
      const data = normalizeDiaryData(await idbGet<DiaryData>('diary'))
      // 保证至少存在一个日志本（旧数据/外部导入无 journals 时补默认本），否则切换器无选项
      // 墓碑不算「有日志本」：全部被删时补默认本（墓碑本身仍留在数组里，才能把删除同步出去）
      const active = activeOnly(data.journals)
      const j = active.length > 0 ? data.journals : [defaultJournal()]
      journals.value = j
      // 旧软删标记迁移：只有 deleted:true 而无 deletedAt 的老条目补上 deletedAt（取 updatedAt），
      // 统一成墓碑语义后才能被墓碑感知的合并/比较正确识别
      entries.value = data.entries.map(e =>
        e.deleted === true && !e.deletedAt ? { ...e, deletedAt: e.updatedAt ?? new Date().toISOString() } : e
      )
      currentJournalId.value = active[0]?.id ?? j[0]?.id ?? DEFAULT_JOURNAL_ID
    } catch (e) {
      console.error('[Diary] load failed', e)
      journals.value = [defaultJournal()]
      entries.value = emptyDiaryData().entries
      currentJournalId.value = DEFAULT_JOURNAL_ID
    }
  }

  async function saveDiary(): Promise<void> {
    try {
      // toRaw：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError），需写入原始数据。
      // 存 DiaryData 对象形状 { journals, entries }——normalizeDiaryData 拒绝裸数组，
      // 写裸数组会导致保存后刷新日记全部丢失（T5 QA 实证）
      await idbPut('diary', { journals: toRaw(journals.value), entries: toRaw(entries.value) })
      markDirty()
    } catch (e) {
      console.error('[Diary] save failed', e)
    }
  }

  /** 当前日志本下的有效条目（排除墓碑/旧软删标记，多日志本隔离视图）。 */
  const currentEntries = computed<WorkbenchDiary[]>(() =>
    entries.value.filter(e => e.journalId === currentJournalId.value && !entryDeleted(e))
  )

  /** 当前日志本下的已删条目（「已删除」视图/回收站用）：删除时间倒序，旧数据无 deletedAt 时退回 updatedAt。 */
  const deletedEntries = computed<WorkbenchDiary[]>(() =>
    entries.value
      .filter(e => e.journalId === currentJournalId.value && entryDeleted(e))
      .sort((a, b) =>
        String(b.deletedAt ?? b.updatedAt ?? '').localeCompare(String(a.deletedAt ?? a.updatedAt ?? ''))
      )
  )

  /**
   * 按日期 upsert 当天日记：content trim 后为空 → 跳过（不保存，面板负责 toast「内容为空」）。
   * 命中已有条目 → 更新 content/updatedAt + patch 中的结构字段（仅传了的才覆盖）；
   * 未命中 → 新建（id `dy_` 前缀，时间戳+随机后缀防同毫秒碰撞），结构字段取 patch 或默认值。
   * 写入时自动带当前日志本 journalId 与类型 kind。
   */
  async function upsertEntry(
    date: string,
    content: string,
    patch?: { category?: string; mood?: string; pinned?: boolean; kind?: 'diary' | 'idea'; coverImage?: string }
  ): Promise<void> {
    const trimmed = content.trim()
    if (!trimmed) return
    const now = new Date().toISOString()
    const existing = findDiaryByDate(currentEntries.value, date)
    if (existing) {
      existing.content = trimmed
      existing.updatedAt = now
      if (patch) {
        if (patch.category !== undefined) existing.category = patch.category
        if (patch.mood !== undefined) existing.mood = patch.mood
        if (patch.pinned !== undefined) existing.pinned = patch.pinned
        if (patch.kind !== undefined) existing.kind = patch.kind
        if (patch.coverImage !== undefined) existing.coverImage = patch.coverImage
      }
    } else {
      entries.value.push({
        id: `dy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        journalId: currentJournalId.value,
        date,
        content: trimmed,
        createdAt: now,
        updatedAt: now,
        kind: patch?.kind ?? 'diary',
        category: patch?.category ?? '',
        mood: patch?.mood ?? '',
        pinned: patch?.pinned ?? false,
        coverImage: patch?.coverImage ?? ''
      })
    }
    await saveDiary()
  }

  /** 删除某分类后，将引用该分类的日记归为未分类（category → ''），改动才落盘。 */
  async function clearCategory(categoryId: string): Promise<void> {
    let changed = false
    for (const e of entries.value) {
      if (e.category === categoryId) {
        e.category = ''
        changed = true
      }
    }
    if (changed) await saveDiary()
  }

  /** 彻底删除 = 物理清除。须在墓碑已推送上云之后调用，否则对端会把它当新增补回来。 */
  async function deleteEntry(id: string): Promise<void> {
    // 从 toRaw 的原始数组 filter：在 reactive 代理上直接 filter 会得到 Proxy 元素，
    // toRaw 只解开一层数组，残留的 Proxy 元素会让 IDB 结构化克隆抛 DataCloneError
    entries.value = toRaw(entries.value).filter(e => e.id !== id)
    await saveDiary()
  }

  /**
   * 逻辑删除（软删）= 写墓碑 + 保留旧 `deleted` 标记 + 推进版本。
   * 旧实现只置 deleted=true 而不动 updatedAt：对端同 id 记录一旦更新过，合并时会被顶掉 → 日记复活。
   */
  async function softDeleteEntry(id: string): Promise<void> {
    const now = new Date().toISOString()
    entries.value = toRaw(entries.value).map(e =>
      e.id === id ? { ...markDeleted(e, { now, clientId: getClientId() }), deleted: true } : e
    )
    await saveDiary()
  }

  /** 恢复软删条目：清墓碑与旧标记，同样推进版本（否则对端可能仍认为它是墓碑）。 */
  async function restoreEntry(id: string): Promise<void> {
    const now = new Date().toISOString()
    entries.value = toRaw(entries.value).map(e =>
      e.id === id ? { ...clearDeleted(e, { now, clientId: getClientId() }), deleted: false } : e
    )
    await saveDiary()
  }

  // ===== 多日志本 CRUD =====
  async function addJournal(name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    const now = new Date().toISOString()
    const journal: WorkbenchJournal = {
      id: `jb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      createdAt: now,
      order: journals.value.length
    }
    journals.value.push(journal)
    currentJournalId.value = journal.id
    await saveDiary()
  }

  async function renameJournal(id: string, name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    const j = journals.value.find(x => x.id === id)
    if (j) j.name = trimmed
    await saveDiary()
  }

  /** 全部活条目（跨日志本，剔除墓碑）：分类计数 / 统计一律读它，不能直接读 entries */
  const activeEntries = computed<WorkbenchDiary[]>(() => activeOnly(entries.value))
  /** 全部墓碑（跨日志本，按删除时间倒序）：回收站与 GC 用 */
  const trashedEntries = computed<WorkbenchDiary[]>(() => trashedItems(entries.value))

  /** 活着的日志本（剔除墓碑）：切换器 / 计数 / 迁移目标一律读它 */
  const activeJournals = computed<WorkbenchJournal[]>(() => activeOnly(journals.value))

  /** 删除日志本 = 写墓碑（物理移除后云同步会当成「远端新增」把它补回来）；其下条目迁移，至少保留一个。 */
  async function deleteJournal(id: string): Promise<void> {
    if (activeJournals.value.length <= 1) return
    const now = new Date().toISOString()
    const remaining = activeJournals.value.filter(j => j.id !== id)
    // 迁移目标：默认本优先，否则剩余首个
    const targetId = remaining.find(j => j.id === DEFAULT_JOURNAL_ID)?.id ?? remaining[0]?.id ?? ''
    for (const e of entries.value) {
      if (e.journalId === id) e.journalId = targetId
    }
    // 墓碑留在 journals 数组里（要参与合并与推送），只是不再出现在切换器中
    journals.value = toRaw(journals.value).map(j =>
      j.id === id ? markDeleted(j, { now, clientId: getClientId() }) : j
    )
    if (currentJournalId.value === id) currentJournalId.value = targetId
    await saveDiary()
  }

  function setCurrentJournal(id: string): void {
    if (journals.value.some(j => j.id === id)) currentJournalId.value = id
  }

  // 排序：date 降序 → createdAt 降序（公式属 diaryCore，仅对当前日志本条目排序）
  const sortedEntries = computed<WorkbenchDiary[]>(() => sortDiaryEntries(currentEntries.value))

  // 连续记录统计（基于当前日志本）
  const stats = computed(() => computeStreak(currentEntries.value))

  return {
    entries,
    activeEntries,
    trashedEntries,
    journals,
    activeJournals,
    currentJournalId,
    currentEntries,
    deletedEntries,
    stats,
    loadDiary,
    saveDiary,
    upsertEntry,
    deleteEntry,
    softDeleteEntry,
    restoreEntry,
    clearCategory,
    addJournal,
    renameJournal,
    deleteJournal,
    setCurrentJournal,
    sortedEntries
  }
})
