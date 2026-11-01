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
import BaseTabs from '@/components/common/BaseTabs.vue'

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

/** 页签数据：全部 + 各分类（emoji 图标 + 数量） */
const tabItems = computed(() => [
  { value: '', label: '全部', emoji: '📚', badge: props.totalCount, testid: 'bk-tab-all' },
  ...props.categories.map((c) => ({
    value: c.name,
    label: c.name,
    emoji: iconOf(c.name),
    badge: c.count,
    testid: `bk-tab-${c.name}`
  }))
])

/** BaseTabs 用 v-model，这里把双向绑定透传出去 */
const modelValueProxy = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v)
})
</script>

<template>
  <div class="bk-tabs">
    <BaseTabs v-model="modelValueProxy" :items="tabItems" testid="bk-tab" />
  </div>
</template>

<style scoped>
/* 容器间距；页签皮肤见 common/BaseTabs.vue */
.bk-tabs {
  margin-bottom: 4px;
}
</style>