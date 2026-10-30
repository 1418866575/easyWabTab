<script setup lang="ts">
// 销售记账全局搜索浮层（Alt+K / 右上角按钮打开）。
// 搜索纯逻辑 100% 委托 businessSpotlightCore.searchBizSpotlight（组件禁止内联过滤/排序），
// 与个人工作台 SpotlightOverlay 共用 .sp-* 视觉约定，但搜索域完全不同（商品/支出分类/面板/快捷动作）。
// 键盘：↑/↓ 移动选中、Enter 执行、Esc 关闭（监听 window keydown，输入框内同样生效）。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from '@/components/Icon.vue'
import { countBizSpotlightHits, searchBizSpotlight } from '@/composables/businessSpotlightCore'
import type {
  BizSpotlightAction,
  BizSpotlightData,
  BizSpotlightGroups
} from '@/composables/businessSpotlightCore'
import type { BizSection, BizQuickAction } from '@/composables/businessSpotlightCore'

const props = defineProps<{ data: BizSpotlightData }>()
const emit = defineEmits<{ select: [action: BizSpotlightAction]; close: [] }>()

const query = ref('')
const activeIndex = ref(-1)
const inputRef = ref<HTMLInputElement | null>(null)
const resultsRef = ref<HTMLDivElement | null>(null)

/** 扁平结果项：四类异构结果归一为统一形状（键盘上下移动只需遍历此数组）。 */
interface ResultItem {
  testId: string
  icon: string
  title: string
  sub?: string
  action: BizSpotlightAction
}

/** 渲染行：分组标题行 / 结果项行（index 为扁平序号，供键盘移动与滚动定位）。 */
type Row =
  | { type: 'header'; key: string; label: string }
  | { type: 'item'; key: string; item: ResultItem; index: number }

/** 分组渲染顺序 + 中文标签（与 buildItems 的产出顺序一一对应）。 */
const GROUP_ORDER = ['actions', 'products', 'categories', 'sections'] as const
type GroupKey = (typeof GROUP_ORDER)[number]
const GROUP_LABELS: Record<GroupKey, string> = {
  actions: '快捷操作',
  products: '商品',
  categories: '支出分类',
  sections: '面板'
}

function fromAction(a: BizQuickAction): ResultItem {
  return {
    testId: `bzsp-action-${a.id}`,
    icon: a.icon,
    title: a.label,
    action: a.action
  }
}

function fromSection(s: BizSection): ResultItem {
  return {
    testId: `bzsp-section-${s.key}`,
    icon: s.icon,
    title: s.label,
    sub: s.hint,
    action: { kind: 'navigate', section: s.key }
  }
}

/** 四类分组 → 统一扁平项。快捷动作排最前（用户搜「卖」最可能要的是记一笔销售）。 */
function buildItems(group: GroupKey, groups: BizSpotlightGroups): ResultItem[] {
  switch (group) {
    case 'actions':
      return groups.actions.map(fromAction)
    case 'products':
      return groups.products.map(h => ({
        testId: `bzsp-product-${h.product.id}`,
        icon: 'products',
        title: h.product.name,
        sub: `${h.categoryName} · 售价 ${h.product.sellingPrice} 元/${h.product.unit || '件'}${h.product.active ? '' : '（已停售）'}`,
        // 带 productId：跳转时落products 高亮 / purchases 过滤（由视图层 interpretAction 决定）
        action: { kind: 'navigate', section: 'products', productId: h.product.id }
      }))
    case 'categories':
      return groups.categories.map(h => ({
        testId: `bzsp-category-${h.category.id}`,
        icon: 'expenses',
        title: h.category.name,
        sub: h.category.unitPrice != null ? `参考单价 ${h.category.unitPrice} 元` : '支出分类',
        action: { kind: 'navigate', section: 'expenses' }
      }))
    case 'sections':
      return groups.sections.map(fromSection)
  }
}

const results = computed(() => searchBizSpotlight(query.value, props.data))

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  let idx = 0
  for (const group of GROUP_ORDER) {
    const items = buildItems(group, results.value)
    if (items.length === 0) continue
    out.push({ type: 'header', key: group, label: GROUP_LABELS[group] })
    for (const item of items) {
      out.push({ type: 'item', key: item.testId, item, index: idx++ })
    }
  }
  return out
})

const itemCount = computed(() => rows.value.filter(r => r.type === 'item').length)
const hitCount = computed(() => countBizSpotlightHits(results.value))

// ==================== 键盘 / 鼠标交互 ====================

function scrollActiveIntoView(): void {
  resultsRef.value?.querySelector(`[data-index="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' })
}

function move(dir: number): void {
  if (itemCount.value === 0) return
  if (activeIndex.value === -1) {
    activeIndex.value = dir === 1 ? 0 : itemCount.value - 1
  } else {
    activeIndex.value = (activeIndex.value + dir + itemCount.value) % itemCount.value
  }
  scrollActiveIntoView()
}

function selectActive(): void {
  const row = rows.value.find(r => r.type === 'item' && r.index === activeIndex.value)
  if (row && row.type === 'item') emit('select', row.item.action)
}

function selectAt(index: number): void {
  const row = rows.value.find(r => r.type === 'item' && r.index === index)
  if (row && row.type === 'item') emit('select', row.item.action)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    selectActive()
  }
}

onMounted(() => {
  inputRef.value?.focus()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// 查询变化 → 结果重建，旧选中序号失效
watch(query, () => {
  activeIndex.value = -1
})
</script>

<template>
  <div class="sp-overlay" data-testid="bzsp-overlay" @click.self="emit('close')">
    <div class="sp-panel" role="dialog" aria-modal="true" aria-label="销售记账全局搜索">
      <div class="sp-search">
        <Icon name="search" :size="18" class="sp-search-icon" />
        <input
          ref="inputRef"
          v-model="query"
          class="sp-input"
          data-testid="bzsp-input"
          type="text"
          placeholder="搜索商品、支出分类，或输入「记一笔销售」快速记账…（↑↓ 选择 / Enter 执行 / Esc 关闭）"
          spellcheck="false"
        />
        <button class="sp-close-btn" data-testid="bzsp-close" title="关闭 (Esc)" @click="emit('close')"><Icon name="close" /></button>
      </div>

      <div v-if="query.trim() === ''" class="sp-hint">输入关键词找商品 / 面板，或直接搜「卖」「进货」「开销」触发快捷记账</div>
      <div v-else-if="hitCount === 0" class="sp-empty" data-testid="bzsp-empty">
        未找到「{{ query.trim() }}」相关结果
      </div>
      <div v-else ref="resultsRef" class="sp-results">
        <template v-for="row in rows" :key="row.type === 'header' ? `h-${row.key}` : `i-${row.key}`">
          <div v-if="row.type === 'header'" class="sp-group">{{ row.label }}</div>
          <button
            v-else
            class="sp-result"
            :class="{ active: row.index === activeIndex }"
            :data-testid="row.item.testId"
            :data-index="row.index"
            @click="selectAt(row.index)"
            @mouseenter="activeIndex = row.index"
          >
            <span class="sp-result-title">{{ row.item.title }}</span>
            <span v-if="row.item.sub" class="sp-result-sub">{{ row.item.sub }}</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 视觉与个人工作台 SpotlightOverlay 的 .sp-* 完全一致（同一套搜索浮层观感），仅数据域不同 */
.sp-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 16px 16px;
  background-color: rgba(15, 23, 42, 0.45);
}

.sp-panel {
  width: min(600px, 100%);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 14px;
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  box-shadow: 0 24px 64px rgba(2, 6, 23, 0.35);
}

.sp-search {
  gap: 10px;
}

.sp-search-icon {
  flex-shrink: 0;
  color: var(--color-text-secondary, #64748b);
}

.sp-input {
  flex: 1;
  min-width: 0;
}

.sp-input::placeholder {
  color: var(--color-text-secondary, #64748b);
}

.sp-close-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.sp-close-btn:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text, #1e293b);
}

.sp-hint,
.sp-empty {
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}

.sp-results {
  overflow-y: auto;
  padding: 8px;
}

.sp-group {
  padding: 8px 12px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
}

.sp-result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s;
}

.sp-result:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
}

.sp-result.active {
  background-color: var(--color-primary-light, #eff6ff);
}

.sp-result-title {
  font-size: 14px;
  color: var(--color-text, #1e293b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sp-result-sub {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 暗色模式覆盖（跟随 SpotlightOverlay 的 dark 变量模式） */
html.dark .sp-overlay {
  background-color: rgba(2, 6, 23, 0.6);
}

html.dark .sp-panel {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
  box-shadow: 0 24px 64px rgba(2, 6, 23, 0.6);
}

html.dark .sp-search {
  border-bottom-color: var(--color-border, #374151);
}

html.dark .sp-search-icon,
html.dark .sp-input::placeholder {
  color: var(--color-text-muted, #9ca3af);
}

html.dark .sp-input {
  color: var(--color-text, #f9fafb);
}

html.dark .sp-close-btn:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #f9fafb);
}

html.dark .sp-hint,
html.dark .sp-empty,
html.dark .sp-group,
html.dark .sp-result-sub {
  color: var(--color-text-muted, #9ca3af);
}

html.dark .sp-result:hover {
  background-color: var(--color-bg-hover, #374151);
}

html.dark .sp-result.active {
  background-color: #1e3a5f;
}

html.dark .sp-result-title {
  color: var(--color-text, #f9fafb);
}

/* 移动端：浮层贴顶展开（12vh 在小屏浪费垂直空间），面板高度放开 */
@media (max-width: 768px) {
  .sp-overlay {
    padding: 8px 8px 8px;
    align-items: flex-start;
  }

  .sp-panel {
    max-height: calc(100dvh - 16px);
    border-radius: 12px;
  }

  .sp-result {
    padding: 11px 12px;
  }
}
</style>