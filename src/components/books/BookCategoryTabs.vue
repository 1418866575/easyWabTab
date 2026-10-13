<script setup lang="ts">
/**
 * 图书馆分类页签（视觉与工具箱 `ToolboxCategoryTabs` 一致：药丸 + 数量徽标 + 选中态实底）
 *
 * 与工具箱的差别只有一处：分类来自书籍的 meta.json（动态），不是固定枚举，
 * 故本组件吃 `{name, count}[]` 而不读 `TOOLBOX_CATEGORIES`。
 *
 * 样式刻意与 tb-cat 保持同一套规则（min-height 34px / radius-full / 主色实底选中），
 * 两处看着才像同一个产品，而不是"两个模块各写各的"。
 *
 * ⚠️ 类名用 `bk-tab` 而**不是** `bk-cat`：卡片内部已有 `.bk-cat`（分类徽标），
 * 撞车会让 `.bk-cat` 选择器同时命中页签和卡片徽标（实测页签数量因此虚高一倍）。
 */
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string
  categories: Array<{ name: string; count: number }>
  totalCount: number
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

/** 每类给一个稳定的 emoji：按名称 hash 取，避免同一点击下图标乱跳 */
const ICONS = ['📚', '📖', '🕮', '📜', '📝', '🔖', '🗂️', '📕']

function iconOf(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return ICONS[h % ICONS.length]
}

const tabs = computed(() => [
  { id: '', name: '全部', icon: '📚', count: props.totalCount },
  ...props.categories.map((c) => ({ id: c.name, name: c.name, icon: iconOf(c.name), count: c.count }))
])
</script>

<template>
  <div class="bk-tabs" role="group" aria-label="书籍分类筛选">
    <button
      v-for="t in tabs"
      :key="t.id || 'all'"
      type="button"
      class="bk-tab"
      :class="{ 'is-on': modelValue === t.id }"
      :data-testid="'bk-tab-' + (t.id || 'all')"
      :aria-pressed="modelValue === t.id"
      @click="emit('update:modelValue', t.id)"
    >
      <span aria-hidden="true">{{ t.icon }}</span>
      <span>{{ t.name }}</span>
      <span class="bk-tab-cnt">{{ t.count }}</span>
    </button>
  </div>
</template>

<style scoped>
/* 与工具箱 .tb-cats 同构：flex-wrap + 8px 间距，数量多的分类自然折行 */
.bk-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}
.bk-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 7px 14px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  font-weight: 500;
  font-family: var(--font-family);
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  transition: color var(--motion-duration) var(--motion-ease),
    border-color var(--motion-duration) var(--motion-ease),
    background-color var(--motion-duration) var(--motion-ease);
}
.bk-tab:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.bk-tab.is-on {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
.bk-tab-cnt { font-size: var(--font-size-xs); opacity: 0.78; }

/* 窄端：页签文字收紧，给药丸留出更多一行 */
@media (max-width: 768px) {
  .bk-tabs { gap: 6px; }
  .bk-tab { padding: 6px 11px; min-height: 40px; }
}
</style>