import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { markDirty } from '@/composables/useCloudSync'
import { getPref, setPref } from '@/composables/useNavPrefs'
import {
  BUILT_IN_PROMPTS,
  BUILT_IN_SKILLS,
  buildEnvelope,
  calcSmartStats,
  makeSmartId,
  normalizePrompts,
  normalizeSkills,
  parseVariables,
  planImport,
  applyImport,
  SMART_PROMPT_KIND,
  SMART_SKILL_KIND
} from '@/composables/smartCore'
import type { SmartEnvelope, SmartImportPreview, SmartPrompt, SmartSkill } from '@/types'

const SKILLS_KEY = 'smart-skills'
const PROMPTS_KEY = 'smart-prompts'

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

  /** 首次进入（两个库都为空）播种内置示例，让用户有东西可看可用 */
  let seeded = false
  if (skills.value.length === 0 && prompts.value.length === 0) {
    const now = Date.now()
    skills.value = BUILT_IN_SKILLS.map(s => ({ ...s, createdAt: now, updatedAt: now }))
    prompts.value = BUILT_IN_PROMPTS.map(p => ({
      ...p,
      variables: parseVariables(p.content),
      createdAt: now,
      updatedAt: now
    }))
    seeded = true
  }
  if (seeded) {
    save(SKILLS_KEY, skills.value)
    save(PROMPTS_KEY, prompts.value)
  }

  // ==================== 派生视图 ====================

  /** 分类清单（技能） */
  const skillCategories = computed(() => {
    const out: string[] = []
    for (const s of skills.value) if (!out.includes(s.category)) out.push(s.category)
    return out.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  })

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
      category: input.category?.trim() || '未分类',
      icon: input.icon?.trim() || '\u{1F9E9}',
      tags: Array.isArray(input.tags) ? [...input.tags] : [],
      version: input.version?.trim() || '1.0.0',
      author: input.author?.trim() ?? '',
      description: input.description?.trim() ?? '',
      content: input.content ?? '',
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
      ...(input.category !== undefined ? { category: input.category.trim() || '未分类' } : {}),
      ...(input.icon !== undefined ? { icon: input.icon.trim() || '\u{1F9E9}' } : {}),
      ...(input.tags !== undefined ? { tags: [...input.tags] } : {}),
      ...(input.version !== undefined ? { version: input.version.trim() || '1.0.0' } : {}),
      ...(input.author !== undefined ? { author: input.author.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
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

  /** 技能导出信封（供下载） */
  function exportSkills(): SmartEnvelope<SmartSkill> {
    return buildEnvelope(SMART_SKILL_KIND, skills.value)
  }

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

  /** 恢复内置示例：按 id 幂等补回已被删掉的内置条目 */
  function restoreBuiltIns(): { skills: number; prompts: number } {
    const now = Date.now()
    let s = 0
    for (const b of BUILT_IN_SKILLS) {
      if (!skills.value.some(x => x.id === b.id)) {
        skills.value.push({ ...b, createdAt: now, updatedAt: now })
        s++
      }
    }
    let p = 0
    for (const b of BUILT_IN_PROMPTS) {
      if (!prompts.value.some(x => x.id === b.id)) {
        prompts.value.push({ ...b, variables: parseVariables(b.content), createdAt: now, updatedAt: now })
        p++
      }
    }
    if (s) persistSkills()
    if (p) persistPrompts()
    return { skills: s, prompts: p }
  }

  return {
    skills,
    prompts,
    skillCategories,
    promptCategories,
    stats,
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
    exportSkills,
    exportPrompts,
    previewSkillImport,
    previewPromptImport,
    commitSkillImport,
    commitPromptImport,
    replaceSkills,
    replacePrompts,
    restoreBuiltIns
  }
})
