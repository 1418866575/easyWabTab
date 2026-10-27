/**
 * 智能工作台 · 列表通用状态（技能 / 提示词 / 工作流三页共用）
 * ------------------------------------------------------------------
 * 三个管理器的「搜索 + 分类药丸 + 标签 + 排序 + 收藏 + 分页」此前是逐份复制的，
 * 逻辑与样式几乎逐行相同（技能页 47-87、提示词页 36-81、工作流页 36-102）。
 * 这里只抽出**状态与派生值**，模板结构仍留在各页（卡片头/正文/按钮各不相同）。
 *
 * 命名口径（三页统一后）：
 *   filtered → 命中筛选并排好序的全部条目（用于计数、批量全选）
 *   visible  → 当前页切片（用于列表渲染）
 *
 * 分页沿用项目基线：usePageSize 持久化每页条数 + el-pagination（layout 含 total/sizes/jumper，
 * background、small），容器挂 .ewt-pager（见 styles/pager.css，移动端自动精简）。
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { filterSmart, sortSmart, type SmartFilter, type SmartSort } from './smartCore'
import { usePageSize } from './usePageSize'
import type { SmartPrompt, SmartSkill, SmartWorkflow } from '@/types'

/** 三类资产的联合类型（filterSmart / sortSmart 的入参约束） */
export type SmartAsset = SmartSkill | SmartPrompt | SmartWorkflow

export interface SmartCategoryTab {
  id: string
  name: string
  count: number
}

export interface UseSmartListOptions<T extends SmartAsset> {
  /** 数据源（各页传 computed(() => store.skills) 等） */
  items: Ref<T[]> | ComputedRef<T[]>
  /** 分类列表（设置弹框里维护的那套） */
  categories: Ref<string[]> | ComputedRef<string[]>
  /** 每页条数的持久化键，各页互不干扰（如 'smart-skills-pager'） */
  pagerKey: string
  /** 是否启用「只看收藏」（技能页暂不支持收藏时传 false，工具栏也不渲染该按钮） */
  favoriteFilter?: boolean
  /** 每页条数默认值；卡片较占高度，默认 12 */
  pageSizeFallback?: number
}

export function useSmartList<T extends SmartAsset>(opts: UseSmartListOptions<T>) {
  const keyword = ref('')
  const category = ref('')
  const activeTags = ref<string[]>([])
  const sort = ref<SmartSort>('updated')
  const favoriteOnly = ref(false)

  const filter = computed<SmartFilter>(() => ({
    q: keyword.value,
    category: category.value,
    tags: activeTags.value,
    // 未启用收藏筛选时不要写 favoriteOnly:false —— 语义上"未筛选"，且技能无该字段
    ...(opts.favoriteFilter ? { favoriteOnly: favoriteOnly.value } : {})
  }))

  /** 命中筛选 + 排序后的全部条目（未分页） */
  const filtered = computed<T[]>(() => sortSmart(filterSmart(opts.items.value, filter.value), sort.value))

  const allTags = computed<string[]>(() => {
    const out: string[] = []
    for (const it of opts.items.value) for (const t of it.tags) if (!out.includes(t)) out.push(t)
    return out
  })

  const hasFilter = computed<boolean>(
    () => !!keyword.value.trim() || !!category.value || activeTags.value.length > 0 || (opts.favoriteFilter ? favoriteOnly.value : false)
  )

  /**
   * 分类药丸：全部 + 各分类，带数量。
   * 保留数量为 0 的分类——方便看到刚播种的默认分类、以及还没挂条目的分类。
   */
  const categoryTabs = computed<SmartCategoryTab[]>(() => {
    const counts = new Map<string, number>()
    for (const it of opts.items.value) counts.set(it.category, (counts.get(it.category) ?? 0) + 1)
    return [
      { id: '', name: '全部', count: opts.items.value.length },
      ...opts.categories.value.map(c => ({ id: c, name: c, count: counts.get(c) ?? 0 }))
    ]
  })

  // ==================== 分页 ====================
  const page = ref(1)
  const { pageSize, PAGE_SIZES } = usePageSize(opts.pagerKey, opts.pageSizeFallback ?? 12)

  const pageCount = computed<number>(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))

  /** 当前页切片 */
  const visible = computed<T[]>(() => {
    const start = (page.value - 1) * pageSize.value
    return filtered.value.slice(start, start + pageSize.value)
  })

  // 筛选/排序变化 → 回第 1 页，避免停在一个已无数据的页码上
  watch([keyword, category, activeTags, sort, favoriteOnly], () => {
    page.value = 1
  })

  // 数据变少 / 每页条数变大导致当前页越界 → 回落到最后一页
  watch(pageCount, max => {
    if (page.value > max) page.value = max
  })

  function resetFilter(): void {
    keyword.value = ''
    category.value = ''
    activeTags.value = []
    favoriteOnly.value = false
  }

  function toggleTag(t: string): void {
    activeTags.value = activeTags.value.includes(t)
      ? activeTags.value.filter(x => x !== t)
      : [...activeTags.value, t]
  }

  return {
    // 筛选态
    keyword,
    category,
    activeTags,
    sort,
    favoriteOnly,
    filter,
    // 派生
    filtered,
    visible,
    allTags,
    hasFilter,
    categoryTabs,
    // 分页
    page,
    pageSize,
    PAGE_SIZES,
    pageCount,
    // 动作
    resetFilter,
    toggleTag
  }
}
