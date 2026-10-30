<script setup lang="ts">
/**
 * 图书馆搜索框（视觉与工具箱 `ToolboxSearchBar` 一致：居中、卡片底、聚焦主色描边）
 *
 * 与工具箱的差别：不带"搜索建议 / 搜索历史"下拉。
 * 工具箱有 122 个工具、名字又高度相似，模糊匹配才有意义；书库通常几十本、
 * 搜索框一敲就出结果，加一层下拉反而挡视线。需要历史时浏览器自带即可。
 */
import { ref } from 'vue'

defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'clear'): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)

function onInput(e: Event): void {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

function onClear(): void {
  emit('update:modelValue', '')
  emit('clear')
  inputRef.value?.focus()
}

function onEsc(e: KeyboardEvent): void {
  // Esc 清空：搜索类输入框的通用预期，比等用户手动删更快
  if (e.key === 'Escape' && modelValue) {
    e.preventDefault()
    onClear()
  }
}

defineExpose({ focus: () => inputRef.value?.focus() })
</script>

<template>
  <div class="bk-search-wrap">
    <div class="bk-search" role="search">
      <svg
        class="bk-search-icon"
        width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        ref="inputRef"
        class="bk-search-input"
        data-testid="bk-search"
        type="search"
        :value="modelValue"
        :placeholder="placeholder ?? '搜索书名、简介、分类或标签…'"
        aria-label="搜索书籍"
        autocomplete="off"
        @input="onInput"
        @keydown.esc="onEsc"
      />
      <button
        v-if="modelValue"
        type="button"
        class="bk-search-clear"
        data-testid="bk-search-clear"
        title="清空搜索"
        aria-label="清空搜索"
        @click="onClear"
      >✕</button>
    </div>
  </div>
</template>

<style scoped>
/* 与工具箱 .tb-search-wrap 同构：父容器内水平居中，窄端铺满 */
.bk-search-wrap {
  position: relative;
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
  margin-top: 14px;
  margin-bottom: var(--space-4, 16px);
}
.bk-search {
  gap: 10px;
  width: 100%;
}

.bk-search-icon { color: var(--color-text-muted); flex: none; }
.bk-search-input {
  flex: 1;
  min-width: 0;
}
/* 原生 type=search 的清除叉与自带的 ✕ 重复，且样式各浏览器不一，隐藏掉 */
.bk-search-input::-webkit-search-cancel-button { display: none; }
.bk-search-input::placeholder { color: var(--color-text-muted); }
.bk-search-clear {
  flex: none;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 16px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 6px;
  min-height: 28px;
  transition: color var(--motion-duration) var(--motion-ease),
    background-color var(--motion-duration) var(--motion-ease);
}
.bk-search-clear:hover {
  color: var(--color-primary);
  background: var(--color-bg-hover);
}

/* 窄端：字号不缩（缩了反而难读），只把内边距收一点 */
@media (max-width: 768px) {
  .bk-search { padding: 9px 12px; }
}
</style>