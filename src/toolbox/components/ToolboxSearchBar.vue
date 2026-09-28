<script setup lang="ts">
/**
 * 搜索框：即时过滤（input 即触发），可一键清空。
 * 受控组件：值由父级持有，本组件只负责展示与事件。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
  }>(),
  { placeholder: '搜索工具名称、描述或标签…' }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'clear'): void
}>()

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

function onClear() {
  emit('update:modelValue', '')
  emit('clear')
}
</script>

<template>
  <div class="tb-search" role="search">
    <svg
      class="tb-search-icon"
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
    <input
      class="tb-search-input"
      data-testid="tb-search"
      type="search"
      :value="props.modelValue"
      :placeholder="props.placeholder"
      aria-label="搜索工具"
      autocomplete="off"
      @input="onInput"
    />
    <button
      v-if="props.modelValue"
      type="button"
      class="tb-search-clear"
      data-testid="tb-search-clear"
      title="清空搜索"
      aria-label="清空搜索"
      @click="onClear"
    >✕</button>
  </div>
</template>

<style scoped>
/* 水平居中：父容器内 margin-inline auto；窄屏自适铺满，宽屏居中且不过宽 */
.tb-search {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
  margin-top: 14px;
  margin-bottom: 10px;
  padding: 10px 14px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--motion-duration) var(--motion-ease),
    box-shadow var(--motion-duration) var(--motion-ease);
}
.tb-search:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}
.tb-search-icon { color: var(--color-text-muted); flex: none; }
.tb-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-size-base);
  font-family: var(--font-family);
}
.tb-search-input::placeholder { color: var(--color-text-muted); }
.tb-search-clear {
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
.tb-search-clear:hover {
  color: var(--color-primary);
  background: var(--color-bg-hover);
}
</style>
