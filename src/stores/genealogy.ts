import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { idbGet, idbPut } from '@/composables/useIdb'
import { getClientId, markDirty } from '@/composables/useCloudSync'
import { activeOnly, clearDeleted, markDeleted, trashedItems } from '@/composables/tombstoneCore'
import {
  emptyGenealogyData,
  getAncestors,
  getChildren,
  getDescendants,
  getSiblings,
  wouldCreateCycle,
  buildGenealogyExport,
  normalizeGenealogyImport,
  mergeFamily,
  type NormalizeGenealogyResult
} from '@/composables/genealogyCore'
import {
  buildNamesExport,
  normalizeNamesImport,
  mergeNames,
  type NormalizeNamesResult
} from '@/composables/namingCore'
import type { FamilyMember, GenealogyData, FamilyNameRecord } from '@/types'

let idSeq = 0
function newMemberId(): string {
  idSeq += 1
  return `fm_${Date.now().toString(36)}_${idSeq.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

let nameSeq = 0
function newNameRecordId(): string {
  nameSeq += 1
  return `nm_${Date.now().toString(36)}_${nameSeq.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export interface MemberInput {
  name: string
  gender?: 'male' | 'female' | '' | null
  birthDate?: string
  deathDate?: string
  phone?: string
  note?: string
  avatar?: string
}

/** 取名记录新增/编辑入参（memberId 关联成员缺省 null = 未关联） */
export interface NameRecordInput {
  name: string
  gender?: 'male' | 'female' | ''
  meaning?: string
  namingDate?: string | null
  memberId?: string | null
  note?: string
}

export const useGenealogyStore = defineStore('genealogy', () => {
  const members = ref<FamilyMember[]>([])
  const rootId = ref<string | null>(null)
  const names = ref<FamilyNameRecord[]>([])

  // 墓碑（已删记录）一律留在数组里参与合并与推送，展示时再剔除 —— 顺序不可颠倒：
  // 先过滤再存，删除状态就丢失了，下次拉取会被当「远端新增」补回来。
  const activeMembers = computed<FamilyMember[]>(() => activeOnly(members.value))
  const trashedMembers = computed<FamilyMember[]>(() => trashedItems(members.value))
  const activeNames = computed<FamilyNameRecord[]>(() => activeOnly(names.value))
  const trashedNames = computed<FamilyNameRecord[]>(() => trashedItems(names.value))

  // ===== 持久化 =====
  async function load(): Promise<void> {
    try {
      const data = await idbGet<GenealogyData>('family')
      const d = data ?? emptyGenealogyData()
      members.value = Array.isArray(d.members) ? d.members : []
      rootId.value = d.rootId ?? null
      names.value = Array.isArray(d.names) ? d.names : []
      // 加载时清理指向已删除成员的脏引用（需求 §6：关联成员被删 → memberId 置空，记录保留）
      // 墓碑不算有效成员：指向已删成员的关联要清掉，否则取名记录会挂在幽灵成员上
      const memberIds = new Set(activeMembers.value.map((m) => m.id))
      let changed = false
      for (const n of names.value) {
        if (n.memberId && !memberIds.has(n.memberId)) {
          n.memberId = null
          changed = true
        }
      }
      if (changed) persist()
    } catch {
      members.value = []
      rootId.value = null
      names.value = []
    }
  }

  function persist(): void {
    // 深拷贝成纯对象再落盘：避免 Vue 响应式代理影响 IndexedDB 结构化克隆。
    // 写入失败必须可见（此前 .catch 静默吞掉，导致"数据存了却没落盘"无法察觉）。
    const snapshot: GenealogyData = JSON.parse(JSON.stringify({
      members: members.value,
      rootId: rootId.value,
      names: names.value
    }))
    void idbPut('family', snapshot).catch((e) => {
      console.error('[genealogy] 家谱数据写入 IndexedDB 失败：', e)
    })
    markDirty()
  }

  // ===== 增删改 =====
  async function addMember(input: MemberInput): Promise<FamilyMember> {
    const now = new Date().toISOString()
    const m: FamilyMember = {
      id: newMemberId(),
      name: input.name.trim(),
      gender: input.gender ?? '',
      birthDate: input.birthDate || undefined,
      deathDate: input.deathDate || undefined,
      phone: input.phone || undefined,
      note: input.note || undefined,
      parents: [],
      spouses: [],
      createdAt: now,
      updatedAt: now
    }
    members.value.push(m)
    persist()
    return m
  }

  async function updateMember(id: string, patch: Partial<MemberInput>): Promise<void> {
    const m = members.value.find((x) => x.id === id)
    if (!m) return
    if (patch.name !== undefined) m.name = patch.name.trim()
    if (patch.gender !== undefined) m.gender = patch.gender
    if (patch.birthDate !== undefined) m.birthDate = patch.birthDate || undefined
    if (patch.deathDate !== undefined) m.deathDate = patch.deathDate || undefined
    if (patch.phone !== undefined) m.phone = patch.phone || undefined
    if (patch.note !== undefined) m.note = patch.note || undefined
    m.updatedAt = new Date().toISOString()
    persist()
  }

  /**
   * 删除成员 = **写墓碑**（记录留在数组里，删除状态才能随信封上云）：
   * 物理移除后，"本地缺席"会被并集合并解释成"远端新增" → 成员复活。
   * 同时清理其它成员 parents/spouses 中对它的悬空引用
   * （子女保留为孤儿，符合需求决策④：不做级联删后代）。
   * 若被删者是主根，则清空 rootId。
   */
  async function deleteMember(id: string): Promise<void> {
    const now = new Date().toISOString()
    members.value = members.value.map((x) =>
      x.id === id ? markDeleted(x, { now, clientId: getClientId() }) : x
    )
    for (const m of members.value) {
      if (m.parents.includes(id)) m.parents = m.parents.filter((p) => p !== id)
      if (m.spouses.includes(id)) m.spouses = m.spouses.filter((s) => s !== id)
    }
    if (rootId.value === id) rootId.value = null
    // 取名记录：解除对该成员的关联（memberId 置空，记录本身保留）
    for (const n of names.value) {
      if (n.memberId === id) n.memberId = null
    }
    persist()
  }

  /** 恢复墓碑（回收站「还原」）：清 deletedAt 并推进版本，否则对端可能仍认为它是墓碑 */
  async function restoreMember(id: string): Promise<void> {
    const now = new Date().toISOString()
    members.value = members.value.map((x) =>
      x.id === id ? clearDeleted(x, { now, clientId: getClientId() }) : x
    )
    persist()
  }

  /** 彻底删除 = 物理清除（含其它成员对它的引用）。须在墓碑已推送上云之后调用 */
  async function purgeMember(id: string): Promise<void> {
    members.value = members.value.filter((x) => x.id !== id)
    for (const m of members.value) {
      if (m.parents.includes(id)) m.parents = m.parents.filter((p) => p !== id)
      if (m.spouses.includes(id)) m.spouses = m.spouses.filter((s) => s !== id)
    }
    if (rootId.value === id) rootId.value = null
    persist()
  }

  // ===== 建立关系 =====
  /** 设父母：环检测（自引用 / 后代变父）拦截，返回是否成功 */
  async function setParent(childId: string, parentId: string): Promise<boolean> {
    if (childId === parentId) return false
    if (wouldCreateCycle(members.value, childId, parentId)) return false
    const child = members.value.find((x) => x.id === childId)
    if (!child) return false
    if (!child.parents.includes(parentId)) {
      child.parents = [...child.parents, parentId]
      child.updatedAt = new Date().toISOString()
    }
    persist()
    return true
  }

  /** 设配偶：UI 限制一对一——设新配偶前清空双方旧的配偶引用 */
  async function setSpouse(aId: string, bId: string): Promise<boolean> {
    if (aId === bId) return false
    const a = members.value.find((x) => x.id === aId)
    const b = members.value.find((x) => x.id === bId)
    if (!a || !b) return false
    a.spouses = [bId]
    b.spouses = [aId]
    a.updatedAt = new Date().toISOString()
    b.updatedAt = new Date().toISOString()
    persist()
    return true
  }

  /** 解除父母关系（仅改被改方 parents，不级联删后代） */
  async function removeParent(childId: string, parentId: string): Promise<void> {
    const child = members.value.find((x) => x.id === childId)
    if (!child) return
    if (child.parents.includes(parentId)) {
      child.parents = child.parents.filter((p) => p !== parentId)
      child.updatedAt = new Date().toISOString()
      persist()
    }
  }

  /** 解除配偶关系（双向清除） */
  async function removeSpouse(aId: string, bId: string): Promise<void> {
    const a = members.value.find((x) => x.id === aId)
    const b = members.value.find((x) => x.id === bId)
    if (a && a.spouses.includes(bId)) {
      a.spouses = a.spouses.filter((s) => s !== bId)
      a.updatedAt = new Date().toISOString()
    }
    if (b && b.spouses.includes(aId)) {
      b.spouses = b.spouses.filter((s) => s !== aId)
      b.updatedAt = new Date().toISOString()
    }
    persist()
  }

  async function setRoot(id: string): Promise<void> {
    rootId.value = id
    persist()
  }

  async function clearRoot(): Promise<void> {
    rootId.value = null
    persist()
  }

  // ===== 导入 / 导出（家庭成员间分享）=====

  /** 导出当前家谱为可分享的 JSON 文本（纯函数生成信封，深拷贝避免带出响应式代理） */
  function exportData(): string {
    // 墓碑不导出：分享文件里不该带已删成员
    return JSON.stringify(buildGenealogyExport({ members: activeMembers.value, rootId: rootId.value, names: [] }), null, 2)
  }

  // ===== 取名记录 增删改 =====
  /** 新增取名记录（校验在 UI 层完成，此处做归一与落库） */
  async function addNameRecord(input: NameRecordInput): Promise<FamilyNameRecord> {
    const now = new Date().toISOString()
    const rec: FamilyNameRecord = {
      id: newNameRecordId(),
      name: input.name.trim(),
      gender: input.gender ?? '',
      namingDate: input.namingDate || null,
      memberId: input.memberId || null,
      createdAt: now,
      updatedAt: now
    }
    if (input.meaning && input.meaning.trim()) rec.meaning = input.meaning.trim().slice(0, 500)
    if (input.note && input.note.trim()) rec.note = input.note.trim().slice(0, 500)
    names.value.push(rec)
    persist()
    return rec
  }

  /** 编辑取名记录（按字段补丁；memberId 仅当存在才更新，避免误清空关联） */
  async function updateNameRecord(id: string, patch: Partial<NameRecordInput>): Promise<void> {
    const rec = names.value.find((x) => x.id === id)
    if (!rec) return
    if (patch.name !== undefined) rec.name = patch.name.trim()
    if (patch.gender !== undefined) rec.gender = patch.gender
    if (patch.meaning !== undefined) {
      const t = patch.meaning.trim()
      rec.meaning = t ? t.slice(0, 500) : undefined
    }
    if (patch.namingDate !== undefined) rec.namingDate = patch.namingDate || null
    if (patch.memberId !== undefined) rec.memberId = patch.memberId || null
    if (patch.note !== undefined) {
      const t = patch.note.trim()
      rec.note = t ? t.slice(0, 500) : undefined
    }
    rec.updatedAt = new Date().toISOString()
    persist()
  }

  /** 删除取名记录 = **写墓碑**（物理移除会被云同步当「远端新增」补回来） */
  async function deleteNameRecord(id: string): Promise<void> {
    const now = new Date().toISOString()
    names.value = names.value.map((x) =>
      x.id === id ? markDeleted(x, { now, clientId: getClientId() }) : x
    )
    persist()
  }

  /** 恢复取名记录墓碑：清 deletedAt 并推进版本 */
  async function restoreNameRecord(id: string): Promise<void> {
    const now = new Date().toISOString()
    names.value = names.value.map((x) =>
      x.id === id ? clearDeleted(x, { now, clientId: getClientId() }) : x
    )
    persist()
  }

  /** 彻底删除取名记录 = 物理清除。须在墓碑已推送上云之后调用 */
  async function purgeNameRecord(id: string): Promise<void> {
    names.value = names.value.filter((x) => x.id !== id)
    persist()
  }

  /** 导出取名记录为可分享的 JSON 文本（信封 kind='family-names'）：墓碑不导出 */
  function exportNames(): string {
    return JSON.stringify(buildNamesExport(activeNames.value), null, 2)
  }

  /**
   * 从 JSON 文本导入取名记录。
   * mode='replace'：清空后导入；mode='merge'：按 id 合并（同 id 以较新 updatedAt 为准）
   * 返回清洗统计（导入条数 / 跳过 / 提示），由 UI 告知用户。
   */
  async function importNamesFromJSON(
    text: string,
    mode: 'replace' | 'merge' = 'replace'
  ): Promise<NormalizeNamesResult> {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return { records: [], valid: 0, skipped: 0, warnings: ['文件不是有效的 JSON 格式'] }
    }
    const result = normalizeNamesImport(raw)
    if (result.valid === 0 && result.skipped === 0 && result.warnings.length === 0) {
      // 既无有效也无跳过、且无警告（通常是空数组/结构错）——给出明确反馈
      if (result.records.length === 0) {
        return { records: [], valid: 0, skipped: 0, warnings: ['文件中没有可取名记录'] }
      }
    }

    if (mode === 'replace') {
      names.value = result.records
    } else {
      const merged = mergeNames(names.value, result.records)
      names.value = merged
    }
    persist()
    return result
  }

  /**
   * 从 JSON 文本导入。
   * mode='replace'：清空后导入（分享文件通常选此）
   * mode='merge'：按 id 合并进现有家谱（同 id 以较新 updatedAt 为准）
   * 返回清洗统计（导入条数 / 跳过 / 悬空关系 / 提示），由 UI 告知用户。
   */
  async function importFromJSON(
    text: string,
    mode: 'replace' | 'merge' = 'replace'
  ): Promise<NormalizeGenealogyResult> {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (e) {
      return { data: emptyGenealogyData(), valid: 0, skipped: 0, danglingRefs: 0, warnings: ['文件不是有效的 JSON 格式'] }
    }
    const result = normalizeGenealogyImport(raw)
    if (!result.valid) return result

    if (mode === 'replace') {
      members.value = result.data.members
      rootId.value = result.data.rootId
    } else {
      // 合并：复用 mergeFamily 的「本地优先」策略（rootId 取本地 ?? 远端；names 随本地保留）
      const merged = mergeFamily({ members: members.value, rootId: rootId.value, names: names.value }, result.data)
      members.value = merged.members
      rootId.value = merged.rootId
      names.value = merged.names
    }
    persist()
    return result
  }

  // ===== 派生 getter =====
  // 一律基于 activeMembers：墓碑不应出现在亲属关系里（删掉的父亲还会被算成父亲）
  const childrenOf = (id: string) => getChildren(activeMembers.value, id)
  const siblingsOf = (id: string) => getSiblings(activeMembers.value, id)
  const ancestorsOf = (id: string) => getAncestors(activeMembers.value, id)
  const descendantsOf = (id: string) => getDescendants(activeMembers.value, id)

  return {
    members,
    activeMembers,
    trashedMembers,
    rootId,
    names,
    activeNames,
    trashedNames,
    load,
    persist,
    addMember,
    updateMember,
    deleteMember,
    restoreMember,
    purgeMember,
    setParent,
    setSpouse,
    removeParent,
    removeSpouse,
    setRoot,
    clearRoot,
    exportData,
    importFromJSON,
    addNameRecord,
    updateNameRecord,
    deleteNameRecord,
    restoreNameRecord,
    purgeNameRecord,
    exportNames,
    importNamesFromJSON,
    childrenOf,
    siblingsOf,
    ancestorsOf,
    descendantsOf
  }
})
