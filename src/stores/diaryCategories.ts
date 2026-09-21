import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Category } from '../types'

// 日记本专属分类：与导航/便签分类完全隔离，仅存 localStorage（不进入云同步信封）。
// 日记条目只保存 category id，分类定义本地化；跨设备分类不同步时条目按 id 兜底（不显示名称）。
const STORAGE_KEY = 'diary-categories'

// 内置日记分类（不可删）
const DEFAULT_DIARY_CATEGORIES: Category[] = [
  { id: 'essay', name: '随笔', icon: '📝', isBuiltIn: true, sort: 1 },
  { id: 'work', name: '工作', icon: '💼', isBuiltIn: true, sort: 2 },
  { id: 'life', name: '生活', icon: '🏠', isBuiltIn: true, sort: 3 },
  { id: 'travel', name: '旅行', icon: '✈️', isBuiltIn: true, sort: 4 },
  { id: 'reading', name: '读书', icon: '📚', isBuiltIn: true, sort: 5 },
  { id: 'health', name: '健康', icon: '🏥', isBuiltIn: true, sort: 6 },
  { id: 'other', name: '其他', icon: '📁', isBuiltIn: true, sort: 999 }
]

export const useDiaryCategoriesStore = defineStore('diary-categories', () => {
  // 自定义分类（内置分类为常量，不持久化）
  const customCategories = ref<Category[]>(
    JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  )

  function saveCustomCategories() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customCategories.value))
  }

  // 合并视图：内置 + 自定义，按 sort 排序
  const allCategories = computed(() => {
    const merged = [...DEFAULT_DIARY_CATEGORIES, ...customCategories.value]
    return merged.sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
  })

  // 新增自定义分类
  function addCategory(name: string, icon: string): string {
    const maxSort = customCategories.value.reduce((max, c) => Math.max(max, c.sort ?? 0), 15)
    const id = `dcat_${Date.now()}`
    customCategories.value.push({
      id,
      name,
      icon,
      isBuiltIn: false,
      sort: maxSort + 1
    })
    saveCustomCategories()
    return id
  }

  // 更新自定义分类
  function updateCategory(id: string, updates: { name?: string; icon?: string; sort?: number }) {
    const index = customCategories.value.findIndex(c => c.id === id)
    if (index !== -1) {
      customCategories.value[index] = {
        ...customCategories.value[index],
        ...updates
      }
      saveCustomCategories()
    }
  }

  // 删除自定义分类（返回 'other' 迁移目标，由调用方清理引用）
  function deleteCategory(id: string): string {
    customCategories.value = customCategories.value.filter(c => c.id !== id)
    saveCustomCategories()
    return 'other'
  }

  // 上/下移动分类
  function moveCategory(id: string, direction: 'up' | 'down') {
    const cat = customCategories.value.find(c => c.id === id)
    if (!cat) return

    const sorted = [...customCategories.value].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
    const index = sorted.findIndex(c => c.id === id)

    if (direction === 'up' && index > 0) {
      const prev = sorted[index - 1]
      const prevCat = customCategories.value.find(c => c.id === prev.id)
      if (prevCat && cat) {
        const tempSort = prevCat.sort
        prevCat.sort = cat.sort ?? 999
        cat.sort = tempSort ?? 999
      }
    } else if (direction === 'down' && index < sorted.length - 1) {
      const next = sorted[index + 1]
      const nextCat = customCategories.value.find(c => c.id === next.id)
      if (nextCat && cat) {
        const tempSort = nextCat.sort
        nextCat.sort = cat.sort ?? 999
        cat.sort = tempSort ?? 999
      }
    }

    saveCustomCategories()
  }

  // 是否可删（内置不可删）
  function canDelete(id: string): boolean {
    const category = allCategories.value.find(c => c.id === id)
    return category ? !category.isBuiltIn : false
  }

  // 是否可移动
  function canMove(id: string, direction: 'up' | 'down'): boolean {
    const cat = customCategories.value.find(c => c.id === id)
    if (!cat) return false

    const sorted = [...customCategories.value].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
    const index = sorted.findIndex(c => c.id === id)

    if (direction === 'up') return index > 0
    if (direction === 'down') return index < sorted.length - 1
    return false
  }

  // 导入自定义分类（用于导入/导出）
  function importCategories(categories: Category[]) {
    for (const cat of categories) {
      if (!cat.isBuiltIn && !customCategories.value.find(c => c.id === cat.id)) {
        customCategories.value.push(cat)
      }
    }
    saveCustomCategories()
  }

  // 导出自定义分类
  function exportCustomCategories(): Category[] {
    return [...customCategories.value]
  }

  return {
    customCategories,
    allCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    moveCategory,
    canDelete,
    canMove,
    importCategories,
    exportCustomCategories
  }
})
