import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { markDirty } from '@/composables/useCloudSync'
import { getPref, setPref } from '@/composables/useNavPrefs'
import {
  buildEnvelope,
  calcSmartStats,
  makeSmartId,
  normalizePrompts,
  normalizeSkills,
  parseVariables,
  planImport,
  applyImport,
  SMART_PROMPT_KIND,
  UNCATEGORIZED as UNCATEGORIZED_SKILL
} from '@/composables/smartCore'
import {
  addCategory,
  collectCategories,
  countByCategory,
  defaultMenuData,
  moveMenu,
  canHideMenu,
  normalizeCategories,
  normalizeMenuData,
  removeCategory,
  renameCategory,
  reorderMenu,
  resolveMenu,
  setMenuLabel,
  toggleMenuHidden,
  visibleMenu,
  type CategoryResult,
  type SmartMenuData
} from '@/composables/smartSettingsCore'
import type { SmartEnvelope, SmartImportPreview, SmartPrompt, SmartSkill } from '@/types'

const SKILLS_KEY = 'smart-skills'
const PROMPTS_KEY = 'smart-prompts'
/** 左侧菜单配置（顺序 / 改名 / 隐藏） */
const MENU_KEY = 'smart-menu'
/** 自定义技能分类（允许存在还没有技能挂上去的空分类） */
const CATEGORIES_KEY = 'smart-skill-categories'

/** 读取并归一化（解析失败降级为空数组，绝不抛错阻断页面） */
function loadList<T>(key: string, normalize: (raw: unknown) => T[]): T[] {
  const raw = getPref(key)
  if (!raw) return []
  try {
    return normalize(JSON.parse(raw))
  } catch {
    console.warn(`[smart] ${key} 解析失败，降级为空列表`)
    return []
  }
}

function save(key: string, value: unknown): void {
  setPref(key, JSON.stringify(value))
  markDirty()
}

export const useSmartStore = defineStore('smart', () => {
  const skills = ref<SmartSkill[]>(loadList(SKILLS_KEY, normalizeSkills))
  const prompts = ref<SmartPrompt[]>(loadList(PROMPTS_KEY, normalizePrompts))

  // ==================== 左侧菜单配置 ====================

  const menu = ref<SmartMenuData>(loadMenu())

  function loadMenu(): SmartMenuData {
    const raw = getPref(MENU_KEY)
    if (!raw) return defaultMenuData()
    try {
      return normalizeMenuData(JSON.parse(raw))
    } catch {
      console.warn('[smart] 菜单配置解析失败，回落默认菜单')
      return defaultMenuData()
    }
  }

  function persistMenu(): void {
    save(MENU_KEY, menu.value)
  }

  /** 云同步拉取后调用：用 IDB 最新值覆盖内存 */
  async function reloadMenu(): Promise<void> {
    menu.value = loadMenu()
  }

  /** 渲染用菜单项（含隐藏项，隐藏项在设置里可再打开） */
  const menuItems = computed(() => resolveMenu(menu.value))
  /** 侧边栏只渲染可见项 */
  const visibleMenuItems = computed(() => visibleMenu(menu.value))

  function onMoveMenu(key: string, dir: 'up' | 'down'): void {
    menu.value = moveMenu(menu.value, key, dir)
    persistMenu()
  }

  /** 拖拽换位（下标为完整菜单顺序的下标，隐藏项也参与排序） */
  function onReorderMenu(fromIndex: number, toIndex: number): void {
    menu.value = reorderMenu(menu.value, fromIndex, toIndex)
    persistMenu()
  }

  function onRenameMenu(key: string, label: string): void {
    menu.value = setMenuLabel(menu.value, key, label)
    persistMenu()
  }

  /**
   * 切换显示 / 隐藏。
   * 可见项只剩 1 个时拒绝继续隐藏（否则侧边栏空了、页面无处可去），返回是否真的生效。
   */
  function onToggleMenuHidden(key: string): boolean {
    if (!canHideMenu(menu.value, key)) return false
    menu.value = toggleMenuHidden(menu.value, key)
    persistMenu()
    return true
  }

  function resetMenu(): void {
    menu.value = defaultMenuData()
    persistMenu()
  }

  // ==================== 技能分类 ====================

  const customCategories = ref<string[]>(loadCategories())

  function loadCategories(): string[] {
    const raw = getPref(CATEGORIES_KEY)
    if (!raw) return []
    try {
      return normalizeCategories(JSON.parse(raw))
    } catch {
      console.warn('[smart] 分类配置解析失败，回落空列表')
      return []
    }
  }

  function persistCategories(): void {
    save(CATEGORIES_KEY, customCategories.value)
  }

  async function reloadCategories(): Promise<void> {
    customCategories.value = loadCategories()
  }

  /** 设置页展示的分类：自定义分类 ∪ 技能上实际用到的分类 */
  const allSkillCategories = computed(() =>
    collectCategories(customCategories.value, skills.value.map(s => s.category))
  )

  /** 每个分类下的技能数量 */
  const skillCountByCategory = computed(() => countByCategory(skills.value.map(s => s.category)))

  function onAddCategory(name: string): CategoryResult {
    const r = addCategory(customCategories.value, name)
    if (r.ok) {
      customCategories.value = r.list
      persistCategories()
    }
    return r
  }

  function onRenameCategory(oldName: string, newName: string): CategoryResult {
    const r = renameCategory(allSkillCategories.value, oldName, newName)
    if (!r.ok) return r
    // 改名要落到两处：自定义分类列表 + 已有技能的 category 字段
    customCategories.value = r.list
    persistCategories()
    const changed = skills.value.some(s => s.category === oldName)
    if (changed) {
      const now = Date.now()
      skills.value = skills.value.map(s => (s.category === oldName ? { ...s, category: newName, updatedAt: now } : s))
      persistSkills()
    }
    return r
  }

  /** 删除分类：该分类下的技能回落「未分类」，同时从自定义列表移除 */
  function onDeleteCategory(name: string): number {
    const now = Date.now()
    let moved = 0
    skills.value = skills.value.map(s => {
      if (s.category !== name) return s
      moved++
      return { ...s, category: UNCATEGORIZED_SKILL, updatedAt: now }
    })
    if (moved) persistSkills()
    customCategories.value = removeCategory(customCategories.value, name)
    persistCategories()
    return moved
  }

  /** 把技能加入某个分类（设置页的「添加技能」） */
  function onAssignSkillToCategory(skillId: string, category: string): void {
    const target = String(category ?? '').trim() || UNCATEGORIZED_SKILL
    const now = Date.now()
    let changed = false
    skills.value = skills.value.map(s => {
      if (s.id !== skillId || s.category === target) return s
      changed = true
      return { ...s, category: target, updatedAt: now }
    })
    if (changed) persistSkills()
  }

  /** 把技能移出某个分类（设置页的「移除」）：回落「未分类」 */
  function onRemoveSkillFromCategory(skillId: string): void {
    onAssignSkillToCategory(skillId, UNCATEGORIZED_SKILL)
  }

  // ==================== 派生视图 ====================

  /** 分类清单（技能） */
  const skillCategories = computed(() => allSkillCategories.value)

  const promptCategories = computed(() => {
    const out: string[] = []
    for (const p of prompts.value) if (!out.includes(p.category)) out.push(p.category)
    return out.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  })

  const stats = computed(() => calcSmartStats(skills.value, prompts.value))

  // ==================== 技能 CRUD ====================

  function persistSkills(): void {
    save(SKILLS_KEY, skills.value)
  }

  /** 云同步拉取后调用：用 IDB 最新值覆盖内存（smart.json 信封会带 smart-skills） */
  async function reloadSkills(): Promise<void> {
    skills.value = loadList(SKILLS_KEY, normalizeSkills)
  }

  /**
   * 新增技能。
   * @returns 新技能 id；校验/重名失败返回 null（调用方负责提示，提示文案由 validateSkill 给出）
   */
  function addSkill(input: Partial<SmartSkill>): string | null {
    const id = input.id && typeof input.id === 'string' ? input.id : makeSmartId('sk')
    const now = Date.now()
    const skill: SmartSkill = {
      id,
      name: (input.name ?? '').trim(),
      description: (input.description ?? '').trim(),
      version: (input.version ?? '').trim() || '1.0.0',
      author: (input.author ?? '').trim(),
      category: (input.category ?? '').trim() || '未分类',
      tags: Array.isArray(input.tags) ? [...input.tags] : [],
      whenToUse: (input.whenToUse ?? '').trim(),
      tools: Array.isArray(input.tools) ? [...input.tools] : [],
      license: (input.license ?? '').trim(),
      extra: input.extra && typeof input.extra === 'object' ? { ...input.extra } : {},
      body: input.body ?? '',
      resources: Array.isArray(input.resources) ? input.resources.map(r => ({ ...r })) : [],
      usageCount: 0,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now
    }
    skills.value.push(skill)
    persistSkills()
    return id
  }

  /** 更新技能（不存在则无操作，返回 false） */
  function updateSkill(id: string, input: Partial<SmartSkill>): boolean {
    const i = skills.value.findIndex(s => s.id === id)
    if (i === -1) return false
    const prev = skills.value[i]
    const next: SmartSkill = {
      ...prev,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.category !== undefined ? { category: input.category.trim() || '未分类' } : {}),
      ...(input.tags !== undefined ? { tags: [...input.tags] } : {}),
      ...(input.version !== undefined ? { version: input.version.trim() || '1.0.0' } : {}),
      ...(input.author !== undefined ? { author: input.author.trim() } : {}),
      ...(input.whenToUse !== undefined ? { whenToUse: input.whenToUse.trim() } : {}),
      ...(input.tools !== undefined ? { tools: [...input.tools] } : {}),
      ...(input.license !== undefined ? { license: input.license.trim() } : {}),
      ...(input.extra !== undefined ? { extra: { ...input.extra } } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.resources !== undefined ? { resources: input.resources.map(r => ({ ...r })) } : {}),
      updatedAt: Date.now()
    }
    skills.value[i] = next
    persistSkills()
    return true
  }

  function deleteSkill(id: string): boolean {
    const before = skills.value.length
    skills.value = skills.value.filter(s => s.id !== id)
    if (skills.value.length === before) return false
    persistSkills()
    return true
  }

  /** 克隆技能：名称追加「（副本）」，使用计数归零 */
  function cloneSkill(id: string): string | null {
    const src = skills.value.find(s => s.id === id)
    if (!src) return null
    let name = `${src.name}（副本）`
    let n = 2
    while (skills.value.some(s => s.name === name)) {
      name = `${src.name}（副本${n}）`
      n++
    }
    return addSkill({ ...src, id: undefined, name, usageCount: 0, lastUsedAt: null })
  }

  /** 记录一次使用（复制/填充后调用） */
  function touchSkill(id: string): void {
    const s = skills.value.find(x => x.id === id)
    if (!s) return
    s.usageCount += 1
    s.lastUsedAt = Date.now()
    persistSkills()
  }

  // ==================== 提示词 CRUD ====================

  function persistPrompts(): void {
    save(PROMPTS_KEY, prompts.value)
  }

  /** 云同步拉取后调用：用 IDB 最新值覆盖内存（smart.json 信封会带 smart-prompts） */
  async function reloadPrompts(): Promise<void> {
    prompts.value = loadList(PROMPTS_KEY, normalizePrompts)
  }

  function addPrompt(input: Partial<SmartPrompt>): string | null {
    const id = input.id && typeof input.id === 'string' ? input.id : makeSmartId('pm')
    const now = Date.now()
    const content = input.content ?? ''
    const prompt: SmartPrompt = {
      id,
      title: (input.title ?? '').trim(),
      category: input.category?.trim() || '未分类',
      tags: Array.isArray(input.tags) ? [...input.tags] : [],
      model: input.model?.trim() ?? '',
      content,
      // 变量恒由正文推导，保证与正文一致
      variables: parseVariables(content),
      isFavorite: input.isFavorite === true,
      usageCount: 0,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now
    }
    prompts.value.push(prompt)
    persistPrompts()
    return id
  }

  function updatePrompt(id: string, input: Partial<SmartPrompt>): boolean {
    const i = prompts.value.findIndex(p => p.id === id)
    if (i === -1) return false
    const prev = prompts.value[i]
    const content = input.content !== undefined ? input.content : prev.content
    const next: SmartPrompt = {
      ...prev,
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.category !== undefined ? { category: input.category.trim() || '未分类' } : {}),
      ...(input.tags !== undefined ? { tags: [...input.tags] } : {}),
      ...(input.model !== undefined ? { model: input.model.trim() } : {}),
      ...(input.isFavorite !== undefined ? { isFavorite: input.isFavorite } : {}),
      content,
      variables: parseVariables(content),
      updatedAt: Date.now()
    }
    prompts.value[i] = next
    persistPrompts()
    return true
  }

  function deletePrompt(id: string): boolean {
    const before = prompts.value.length
    prompts.value = prompts.value.filter(p => p.id !== id)
    if (prompts.value.length === before) return false
    persistPrompts()
    return true
  }

  function clonePrompt(id: string): string | null {
    const src = prompts.value.find(p => p.id === id)
    if (!src) return null
    let title = `${src.title}（副本）`
    let n = 2
    while (prompts.value.some(p => p.title === title)) {
      title = `${src.title}（副本${n}）`
      n++
    }
    return addPrompt({ ...src, id: undefined, title, usageCount: 0, lastUsedAt: null })
  }

  function toggleFavorite(id: string): void {
    const p = prompts.value.find(x => x.id === id)
    if (!p) return
    p.isFavorite = !p.isFavorite
    persistPrompts()
  }

  function touchPrompt(id: string): void {
    const p = prompts.value.find(x => x.id === id)
    if (!p) return
    p.usageCount += 1
    p.lastUsedAt = Date.now()
    persistPrompts()
  }

  // ==================== 导入导出 ====================

  // 技能不再提供 JSON 信封导出：技能 = 一个目录，统一走 zip（见 utils/skillPackage）。
  // 提示词没有目录形态，仍保留 JSON 信封导入导出。

  function exportPrompts(): SmartEnvelope<SmartPrompt> {
    return buildEnvelope(SMART_PROMPT_KIND, prompts.value)
  }

  /** 技能导入预览（解析与冲突计算均委托纯函数） */
  function previewSkillImport(items: SmartSkill[]): SmartImportPreview<SmartSkill> {
    return planImport(items, skills.value)
  }

  function previewPromptImport(items: SmartPrompt[]): SmartImportPreview<SmartPrompt> {
    return planImport(items, prompts.value)
  }

  /** 提交导入：合并为最终列表并落库，返回实际新增/更新数 */
  function commitSkillImport(plan: SmartImportPreview<SmartSkill>): { added: number; updated: number } {
    skills.value = applyImport(skills.value, plan)
    persistSkills()
    return { added: plan.added.length, updated: plan.updated.length }
  }

  function commitPromptImport(plan: SmartImportPreview<SmartPrompt>): { added: number; updated: number } {
    prompts.value = applyImport(prompts.value, plan)
    persistPrompts()
    return { added: plan.added.length, updated: plan.updated.length }
  }

  /** 整体替换（导入备份/恢复示例用） */
  function replaceSkills(list: SmartSkill[]): void {
    skills.value = normalizeSkills(list)
    persistSkills()
  }

  function replacePrompts(list: SmartPrompt[]): void {
    prompts.value = normalizePrompts(list)
    persistPrompts()
  }

  return {
    skills,
    prompts,
    skillCategories,
    promptCategories,
    stats,
    // 左侧菜单配置
    menu,
    menuItems,
    visibleMenuItems,
    reloadMenu,
    onMoveMenu,
    onReorderMenu,
    onRenameMenu,
    onToggleMenuHidden,
    resetMenu,
    // 技能分类
    customCategories,
    allSkillCategories,
    skillCountByCategory,
    reloadCategories,
    onAddCategory,
    onRenameCategory,
    onDeleteCategory,
    onAssignSkillToCategory,
    onRemoveSkillFromCategory,
    // 云同步回写
    reloadSkills,
    reloadPrompts,
    addSkill,
    updateSkill,
    deleteSkill,
    cloneSkill,
    touchSkill,
    addPrompt,
    updatePrompt,
    deletePrompt,
    clonePrompt,
    toggleFavorite,
    touchPrompt,
    exportPrompts,
    previewSkillImport,
    previewPromptImport,
    commitSkillImport,
    commitPromptImport,
    replaceSkills,
    replacePrompts
  }
})
