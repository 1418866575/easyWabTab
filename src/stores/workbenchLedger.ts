import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { LedgerCategory, LedgerData, LedgerEntry, LedgerStoreData, PersonalLedger } from '@/types'
import {
  LEDGER_STORE_SCHEMA_VER,
  checkPersonalLedgerYearWrite,
  createPersonalLedger,
  currentYear,
  deletePersonalLedger,
  emptyLedgerData,
  hasLedgerForYear,
  isPersonalLedgerEmpty,
  ledgerCodeOf,
  ledgerDefaultName,
  localDateStr,
  monthKeyOf,
  normalizeLedgerEntry,
  normalizeLedgerStore,
  personalLedgerDeleteGuard,
  pickDefaultLedger,
  planAutoCopy,
  renamePersonalLedger,
  sortedLedgers
} from '@/composables/ledgerCore'
import type {
  LedgerDeleteGuard,
  LedgerMutateResult,
  LedgerOpResult,
  LedgerRenameResult,
  LedgerWriteResult
} from '@/composables/ledgerCore'
import { activeOnly, clearDeleted, gcTombstones as gcTombstonesCore, markDeleted, trashedItems } from '../composables/tombstoneCore'
import { idbGet, idbPut } from '../composables/useIdb'
import { getClientId, markDirty } from '@/composables/useCloudSync'

/**
 * 递归解包 Vue reactive Proxy：structured clone（IndexedDB put 使用）无法正确序列化
 * 嵌套的 reactive 代理元素，在严格引擎（如 iOS Safari / 移动端）上会抛 DataCloneError，
 * 导致写入静默失败——内存里有数据、IndexedDB 没落盘，刷新后记录全部消失。
 * 单层 toRaw 只解一层，必须逐层递归解包为纯对象（见 saveLedger）。
 */
function deepToRaw<T>(value: T): T {
  const v = toRaw(value as unknown as object) as unknown
  if (Array.isArray(v)) {
    return v.map((item) => deepToRaw(item)) as unknown as T
  }
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(v as Record<string, unknown>)) {
      out[key] = deepToRaw((v as Record<string, unknown>)[key])
    }
    return out as unknown as T
  }
  return value
}

// 工作台记账本 store（数据存 IndexedDB store 'ledger'，经 ledgerCore 归一化后读写）
//
// 多账本结构：账本（PersonalLedger）是最外层数据容器，按自然年创建、**同一年份可有多本**
// （年内序号 seq 唯一，编号 YYYY-NN）；所有数据挂在「当前账本」的 data 下，切换账本即整体切换数据集；
// 每本账本只记录其所属年份的数据：写入时按日期做跨年守卫，跨年数据不混入同一账本。
// 对外仍暴露与旧版同名的 categories / entries，但它们是「指向当前账本」的可写 computed——
// 记账面板与统计层无需感知账本即可继续工作。
export const useWorkbenchLedgerStore = defineStore('workbenchLedger', () => {
  const ledgers = ref<PersonalLedger[]>([])
  const currentLedgerId = ref('')
  // 内存态金额可见性开关（仅 UI，不持久化，刷新即重置）
  const showAmount = ref(false)

  /** 当前账本（不存在为 null：尚未创建任何账本） */
  const currentLedger = computed<PersonalLedger | null>(
    () => ledgers.value.find(l => l.id === currentLedgerId.value) ?? null
  )
  /** 当前账本数据（无账本时返回空数据快照，仅供读取兜底） */
  function currentData(): LedgerData {
    return currentLedger.value?.data ?? emptyLedgerData()
  }
  /** 写回当前账本：更新 data 与 updatedAt（无账本时静默忽略） */
  function patchCurrentData(patch: Partial<LedgerData>): void {
    const index = ledgers.value.findIndex(l => l.id === currentLedgerId.value)
    if (index === -1) return
    const target = toRaw(ledgers.value[index])
    ledgers.value[index] = {
      ...target,
      updatedAt: new Date().toISOString(),
      data: { ...toRaw(target.data), ...patch }
    }
  }

  /** 可写 computed：读当前账本字段，写回当前账本（记账面板零改动的关键） */
  function ledgerField<K extends keyof LedgerData>(key: K) {
    return computed<LedgerData[K]>({
      get: () => currentData()[key],
      set: (value: LedgerData[K]) => patchCurrentData({ [key]: value } as Partial<LedgerData>)
    })
  }

  const categories = ledgerField('categories')
  const entries = ledgerField('entries')

  /** 活流水（剔除墓碑）：列表 / 统计 / 图表一律读它，不能直接读 entries */
  const activeEntries = computed<LedgerEntry[]>(() => activeOnly(entries.value))
  /** 回收站：墓碑按删除时间倒序 */
  const trashedEntries = computed<LedgerEntry[]>(() => trashedItems(entries.value))

  async function loadLedger(): Promise<void> {
    try {
      // 存量旧结构（扁平 LedgerData）经 normalizeLedgerStore 自动迁入「当前年账本」
      const raw = await idbGet<LedgerStoreData | LedgerData>('ledger')
      const isLegacy = !raw || typeof raw !== 'object' || !Array.isArray((raw as unknown as Record<string, unknown>).ledgers)
      const store = normalizeLedgerStore(raw)
      let list = store.ledgers
      let currentId = store.currentLedgerId
      let created = false
      // 空库（首次使用 / 全部账本被删）→ 自动建一个「当前年账本」，内置 8 分类即就位，行为与旧版一致
      if (list.length === 0) {
        const r = createPersonalLedger(list, currentYear())
        if (r.ok && r.ledger) {
          list = r.ledgers
          currentId = r.ledger.id
          created = true
        }
      }
      ledgers.value = list
      currentLedgerId.value = currentId
      // 旧结构迁移 / 首建账本 立刻落库，保证备份导出/云同步/其它标签页读到的一定是多账本结构
      if (isLegacy || created) await saveLedger()
      // 每月自动复制：当前月缺工资/房贷且上月存在 → 补齐（幂等，详见 ledgerCore.planAutoCopy）
      await applyMonthlyAutoCopy()
    } catch (e) {
      console.error('[Ledger] load failed', e)
      // IDB 空/坏 → 兜底一个当前年账本（内置 8 分组），保证组始终存在
      const r = createPersonalLedger([], currentYear())
      ledgers.value = r.ok ? r.ledgers : []
      currentLedgerId.value = r.ok && r.ledger ? r.ledger.id : ''
    }
  }

  /** 自动复制上月工资/房贷到当前月（仅当月缺该分类且上月存在时补入；id 用 base+序号防同毫秒碰撞）。 */
  async function applyMonthlyAutoCopy(): Promise<void> {
    if (!currentLedger.value) return
    const drafts = planAutoCopy(entries.value, monthKeyOf(localDateStr()))
    if (drafts.length === 0) return
    const now = new Date().toISOString()
    const base = Date.now()
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]
      entries.value.push(
        normalizeLedgerEntry({
          ...d,
          id: `ld_${base}_${i}`,
          createdAt: now,
          updatedAt: now
        })
      )
    }
    await saveLedger()
  }

  function toggleAmountVisibility(): void {
    showAmount.value = !showAmount.value
  }

  async function saveLedger(): Promise<void> {
    try {
      // 必须递归解包所有嵌套 reactive 代理：整体/单层 toRaw 解不掉内层 Proxy，
      // 严格引擎（iOS Safari / 移动端）的 IndexedDB put 会抛 DataCloneError，写入静默失败，
      // 表现为「内存里有、刷新后没了」。deepToRaw 逐层还原为纯对象，彻底规避该问题。
      const raw: LedgerStoreData = {
        schemaVer: LEDGER_STORE_SCHEMA_VER,
        ledgers: deepToRaw(ledgers.value),
        currentLedgerId: currentLedgerId.value
      }
      await idbPut('ledger', raw)
      markDirty()
    } catch (e) {
      console.error('[Ledger] save failed', e)
    }
  }

  // ===== 账本归属年份守卫：跨年数据不混入同一账本 =====
  /** 写入前校验日期是否属于当前账本年份；跨年 / 无账本时拒绝写入（返回提示文案给 UI） */
  function guardLedgerYear(date: string): LedgerWriteResult {
    return checkPersonalLedgerYearWrite(date, currentLedger.value?.year ?? null)
  }

  async function addEntry(input: { date: string; categoryId: string; amount: number; note?: string }): Promise<LedgerWriteResult> {
    const guard = guardLedgerYear(input.date)
    if (!guard.ok) return guard
    const now = new Date().toISOString()
    entries.value.push(
      normalizeLedgerEntry({
        ...input,
        id: `ld_${Date.now()}`,
        createdAt: now,
        updatedAt: now
      })
    )
    await saveLedger()
    return { ok: true, reason: 'ok' }
  }

  async function updateEntry(id: string, patch: Partial<LedgerEntry>): Promise<LedgerWriteResult> {
    // 改了日期 → 必须仍属于当前账本年份，否则会破坏「一本账本只记一年」的隔离
    if (patch.date !== undefined) {
      const guard = guardLedgerYear(patch.date)
      if (!guard.ok) return guard
    }
    const index = entries.value.findIndex(e => e.id === id)
    if (index !== -1) {
      entries.value[index] = {
        ...entries.value[index],
        ...patch,
        id: entries.value[index].id,
        updatedAt: new Date().toISOString()
      }
      await saveLedger()
      return { ok: true, reason: 'ok' }
    }
    console.warn(`[Ledger] entry not found: ${id}`)
    return { ok: false, reason: 'not-found', message: '记录不存在或已被删除' }
  }

  /**
   * 删除流水 = **写墓碑**，不是移除记录。
   * 物理移除后，下次拉取时「本地缺席」会被并集合并解释为「远端新增」 → 流水复活。
   */
  async function deleteEntry(id: string): Promise<void> {
    const now = new Date().toISOString()
    // 在 toRaw 的原始数组上 map：reactive 代理元素会让 IDB 结构化克隆抛 DataCloneError
    entries.value = toRaw(entries.value).map(e =>
      e.id === id ? markDeleted(e, { now, clientId: getClientId() }) : e
    )
    await saveLedger()
  }

  /** 恢复墓碑（回收站「还原」）：清 deletedAt 并推进版本，否则对端可能仍认为它是墓碑 */
  async function restoreEntry(id: string): Promise<void> {
    const now = new Date().toISOString()
    entries.value = toRaw(entries.value).map(e =>
      e.id === id ? clearDeleted(e, { now, clientId: getClientId() }) : e
    )
    await saveLedger()
  }

  /** 彻底删除 = 物理清除（回收站「彻底删除」/ GC 到期）。调用前须确保墓碑已推送上云 */
  async function purgeEntry(id: string): Promise<void> {
    entries.value = toRaw(entries.value).filter(e => e.id !== id)
    await saveLedger()
  }

  /**
   * 墓碑 GC：物理清除所有账本中 deletedAt 超保留期（7 天）的流水。
   * 须在墓碑已成功推送上云之后调用（forcePushLocal 成功回调里调），否则对端会补回。
   * @returns 实际清除的条数
   */
  async function gcTombstones(): Promise<number> {
    let total = 0
    let changed = false
    for (const l of ledgers.value) {
      const { kept, purged } = gcTombstonesCore(toRaw(l.data.entries), new Date())
      if (purged > 0) {
        l.data.entries = kept
        total += purged
        changed = true
      }
    }
    if (changed) await saveLedger()
    return total
  }

  async function addCategory(input: { name: string; type: 'income' | 'expense' }): Promise<boolean> {
    const name = input.name.trim()
    if (!name) return false
    const lower = name.toLowerCase()
    // 与现有全部（含内置）名称唯一，冲突不写入
    if (categories.value.some(c => c.name.trim().toLowerCase() === lower)) return false
    categories.value.push({
      id: `cat_${Date.now()}`,
      name,
      type: input.type,
      isBuiltIn: false
    })
    await saveLedger()
    return true
  }

  async function updateCategory(id: string, patch: { name?: string; type?: 'income' | 'expense' }): Promise<boolean> {
    const index = categories.value.findIndex(c => c.id === id)
    if (index === -1) return false
    const target = categories.value[index]
    if (target.isBuiltIn) return false // 内置不可改
    if (patch.type !== undefined && patch.type !== 'income' && patch.type !== 'expense') return false

    const changes: Partial<LedgerCategory> = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) return false
      // 名称唯一校验（排除自身）
      if (categories.value.some(c => c.id !== id && c.name.trim().toLowerCase() === name.toLowerCase())) return false
      changes.name = name
    }
    if (patch.type !== undefined) {
      changes.type = patch.type
    }

    categories.value[index] = { ...target, ...changes }
    await saveLedger()
    return true
  }

  async function deleteCategory(id: string): Promise<{ ok: boolean; reason?: 'builtin' | 'in-use' }> {
    const target = categories.value.find(c => c.id === id)
    if (target?.isBuiltIn) return { ok: false, reason: 'builtin' }
    // 全部月份：任一活流水引用即视为在用（墓碑不算，否则删过的流水会永久锁住分类）
    if (activeEntries.value.some(e => e.categoryId === id)) return { ok: false, reason: 'in-use' }
    categories.value = toRaw(categories.value).filter(c => c.id !== id)
    await saveLedger()
    return { ok: true }
  }

  // ===== 账本 CRUD（设置弹窗「记账管理」入口） =====

  /** 创建账本（同一年份可有多本，年内序号自动分配，编号 = 年份-序号）；成功后自动切换为当前账本 */
  function createLedger(year: number, name?: string): LedgerOpResult {
    const r = createPersonalLedger(ledgers.value, year, name)
    if (r.ok && r.ledger) {
      ledgers.value = r.ledgers
      currentLedgerId.value = r.ledger.id
      void saveLedger()
    }
    return r
  }

  /** 快捷创建当前年账本（已存在则直接切过去） */
  function ensureCurrentYearLedger(name?: string): LedgerOpResult {
    const year = currentYear()
    const existing = ledgers.value.find(l => l.year === year)
    if (existing) {
      currentLedgerId.value = existing.id
      void saveLedger()
      return { ok: true, reason: 'ok', ledgers: ledgers.value, ledger: existing }
    }
    return createLedger(year, name ?? ledgerDefaultName(year))
  }

  /** 切换账本：id 无效时保持原状 */
  function switchLedger(id: string): boolean {
    if (!ledgers.value.some(l => l.id === id)) return false
    currentLedgerId.value = id
    void saveLedger()
    return true
  }

  /** 按年份切换（存在该年账本才切） */
  function switchLedgerByYear(year: number): boolean {
    const target = ledgers.value.find(l => l.year === year)
    return target ? switchLedger(target.id) : false
  }

  /** 删前守卫：not-found / last-one（至少保留一个）/ is-current（当前使用中，需先切换） */
  function ledgerDeleteGuard(id: string): LedgerDeleteGuard {
    return personalLedgerDeleteGuard(ledgers.value, id, currentLedgerId.value)
  }

  /**
   * 仅清空某账本的流水（entries），账本本体与分类保留。
   * 逐条**写墓碑**而非清空数组：整体物理移除后，下次拉取会被并集合并当成「远端新增」整体补回。
   * 墓碑由 GC 在 7 天保留期后物理清除。
   */
  function clearLedgerRecords(id: string): LedgerMutateResult {
    const arr = ledgers.value
    const index = arr.findIndex(l => l.id === id)
    if (index === -1) return { ok: false, reason: 'not-found', ledgers: arr }
    const now = new Date().toISOString()
    const target = toRaw(arr[index])
    const updated: PersonalLedger = {
      ...target,
      updatedAt: now,
      data: {
        ...toRaw(target.data),
        entries: toRaw(target.data).entries.map(e => markDeleted(e, { now, clientId: getClientId() }))
      }
    }
    const list = [...arr]
    list[index] = updated
    ledgers.value = sortedLedgers(list)
    void saveLedger()
    return { ok: true, reason: 'ok', ledgers: ledgers.value, ledger: updated }
  }

  /** 删除账本整体（受守卫保护）；成功后重置当前选中（被删账本失效时回落默认账本） */
  function deleteLedger(id: string): LedgerMutateResult {
    const r = deletePersonalLedger(ledgers.value, id, currentLedgerId.value)
    if (r.ok) {
      ledgers.value = r.ledgers
      if (!r.ledgers.some(l => l.id === currentLedgerId.value)) {
        currentLedgerId.value = pickDefaultLedger(r.ledgers)?.id ?? ''
      }
      void saveLedger()
    }
    return r
  }

  /** 重命名账本：仅改名称（编号/年份不变） */
  function renameLedger(id: string, name: string): LedgerRenameResult {
    const r = renamePersonalLedger(ledgers.value, id, name)
    if (r.ok) {
      ledgers.value = r.ledgers
      void saveLedger()
    }
    return r
  }

  // ===== 账本元信息（供切换器 / 设置页渲染） =====
  const ledgerList = computed<PersonalLedger[]>(() => sortedLedgers(ledgers.value))
  const hasLedgers = computed(() => ledgers.value.length > 0)
  const currentLedgerName = computed(() => currentLedger.value?.name ?? '')
  /** 当前账本编号（YYYY-NN）：年份 + 年内序号，唯一且可读 */
  const currentLedgerCode = computed(() => (currentLedger.value ? ledgerCodeOf(currentLedger.value) : ''))
  const currentLedgerYear = computed(() => currentLedger.value?.year ?? currentYear())
  const currentLedgerIsEmpty = computed(() => (currentLedger.value ? isPersonalLedgerEmpty(currentLedger.value.data) : true))
  /** 当前自然年还没有账本：可用于引导创建（记账面板本身有兜底自动建账本，故此值仅作提示） */
  const needsCurrentYearLedger = computed(() => !hasLedgerForYear(ledgers.value, currentYear()))

  // 收入在前，同类保持数组序（filter 返回新数组，不 mutate）
  const sortedCategories = computed<LedgerCategory[]>(() => [
    ...categories.value.filter(c => c.type === 'income'),
    ...categories.value.filter(c => c.type === 'expense')
  ])
  const incomeCategories = computed<LedgerCategory[]>(() => categories.value.filter(c => c.type === 'income'))
  const expenseCategories = computed<LedgerCategory[]>(() => categories.value.filter(c => c.type === 'expense'))

  return {
    // 账本（最外层容器）
    ledgers: ledgerList,
    currentLedger,
    currentLedgerId,
    hasLedgers,
    needsCurrentYearLedger,
    currentLedgerName,
    currentLedgerCode,
    currentLedgerYear,
    currentLedgerIsEmpty,
    createLedger,
    ensureCurrentYearLedger,
    switchLedger,
    switchLedgerByYear,
    ledgerDeleteGuard,
    clearLedgerRecords,
    deleteLedger,
    renameLedger,
    guardLedgerYear,
    // 当前账本内的数据（可写 computed，记账面板无需感知账本）
    categories,
    entries,
    activeEntries,
    trashedEntries,
    showAmount,
    toggleAmountVisibility,
    loadLedger,
    saveLedger,
    addEntry,
    updateEntry,
    deleteEntry,
    restoreEntry,
    purgeEntry,
    gcTombstones,
    addCategory,
    updateCategory,
    deleteCategory,
    sortedCategories,
    incomeCategories,
    expenseCategories
  }
})
