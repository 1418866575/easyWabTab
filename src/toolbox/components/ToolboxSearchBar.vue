<script setup lang="ts">
/**
 * 工具箱搜索框：即时过滤 + 聚焦展开建议/历史下拉
 *
 * 交互：
 * - 聚焦展开下拉；失焦或点击外部收起（用 pointerdown 判定，避免与清空按钮冲突）
 * - 输入防抖 200ms 后才刷新建议，避免每次按键都重算
 * - 下拉用绝对定位（脱离文档流），展开/收起不引起页面布局抖动
 * - 「搜索历史」与「搜索建议」分区展示；历史可点击回填并触发搜索
 * - 提交搜索（Enter）时把非空关键字写入历史（FIFO，最多 5 条，持久化）
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import type { ToolboxToolMeta } from '../types'
import { suggestTools } from '../core/searchHistory'
import { useToolboxPrefs } from '../prefs/useToolboxPrefs'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    /** 候选来源（建议列表）；不传则只显示搜索历史 */
    candidates?: ToolboxToolMeta[]
  }>(),
  { placeholder: '搜索工具名称、描述或标签…', candidates: () => [] }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'clear'): void
  /** 提交关键字（回车 / 点历史项） */
  (e: 'submit', value: string): void
  /** 点击建议项，请求父级直接打开该工具 */
  (e: 'pick', tool: ToolboxToolMeta): void
}>()

const { searchHistory, pushSearch, clearSearchHistory } = useToolboxPrefs()

const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const open = ref(false)
/** 展示用的建议关键字（防抖后的快照），与输入框即时值分离 */
const debouncedQ = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

const SUGGEST_LIMIT = 8
const DEBOUNCE_MS = 200

const suggestions = computed<ToolboxToolMeta[]>(() =>
  props.candidates.length ? suggestTools(props.candidates, debouncedQ.value, SUGGEST_LIMIT) : []
)

/** 下拉是否展示任何内容：有关键字才显示建议；无关键字时仅在有历史时显示 */
const showPanel = computed(() => open.value && (suggestions.value.length > 0 || searchHistory.value.length > 0))

/** 分区：有输入时建议优先，历史作为补充；无输入时仅历史 */
const showSuggestSection = computed(() => suggestions.value.length > 0)
const showHistorySection = computed(() => searchHistory.value.length > 0)

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value
  emit('update:modelValue', v)
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { debouncedQ.value = v }, DEBOUNCE_MS)
  open.value = true
}

function onFocus() {
  // 聚焦即刷新一次建议快照（首屏或历史为空时也能给出结果）
  if (timer) clearTimeout(timer)
  debouncedQ.value = props.modelValue
  open.value = true
}

function onClear() {
  emit('update:modelValue', '')
  emit('clear')
  debouncedQ.value = ''
  open.value = true
  inputRef.value?.focus()
}

function submit() {
  const v = props.modelValue.trim()
  if (v) {
    pushSearch(v)
    emit('submit', v)
  }
  open.value = false
}

function pickKeyword(kw: string) {
  emit('update:modelValue', kw)
  debouncedQ.value = kw
  pushSearch(kw)
  emit('submit', kw)
  open.value = false
  inputRef.value?.focus()
}

function pickTool(t: ToolboxToolMeta) {
  // 点建议直接打开该工具
  emit('pick', t)
  open.value = false
}

function onHistoryClear() {
  clearSearchHistory()
}

/** 点击组件外部收起（pointerdown 先于 blur，命中清空/历史项时不误收起） */
function onDocPointerDown(e: PointerEvent) {
  if (!open.value) return
  const el = rootRef.value
  if (el && e.target instanceof Node && el.contains(e.target)) return
  open.value = false
}

function onEsc() {
  if (open.value) open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  document.addEventListener('keydown', onEsc)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.removeEventListener('keydown', onEsc)
  if (timer) clearTimeout(timer)
})

// 输入框被父级清空（例如点了“清空筛选”）时同步防抖快照，避免残留旧建议
watch(() => props.modelValue, v => { if (!v) debouncedQ.value = '' })

defineExpose({ focus: () => nextTick(() => inputRef.value?.focus()) })
</script>

<template>
  <div ref="rootRef" class="tb-search-wrap">
    <div class="tb-search" role="search" :class="{ 'is-open': showPanel }">
      <svg
        class="tb-search-icon"
        width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        ref="inputRef"
        class="tb-search-input"
        data-testid="tb-search"
        type="search"
        :value="props.modelValue"
        :placeholder="props.placeholder"
        aria-label="搜索工具"
        autocomplete="off"
        @input="onInput"
        @focus="onFocus"
        @keydown.enter.prevent="submit"
        @keydown.esc="onEsc"
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

    <Transition name="tb-drop">
      <div v-if="showPanel" class="tb-search-panel" role="listbox" aria-label="搜索建议与历史">
        <section v-if="showHistorySection" class="tb-panel-sec">
          <header class="tb-panel-head">
            <span class="tb-panel-title">搜索历史</span>
            <button
              type="button"
              class="tb-panel-clear"
              title="清空搜索历史"
              aria-label="清空搜索历史"
              @click="onHistoryClear"
            >清空</button>
          </header>
          <ul class="tb-panel-list">
            <li
              v-for="kw in searchHistory"
              :key="'h-' + kw"
              class="tb-panel-item"
              role="option"
              :aria-selected="false"
              @mousedown.prevent="pickKeyword(kw)"
            >
              <svg class="tb-item-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span class="tb-item-text">{{ kw }}</span>
            </li>
          </ul>
        </section>

        <section v-if="showSuggestSection" class="tb-panel-sec">
          <header class="tb-panel-head">
            <span class="tb-panel-title">搜索建议</span>
          </header>
          <ul class="tb-panel-list">
            <li
              v-for="t in suggestions"
              :key="t.id"
              class="tb-panel-item"
              role="option"
              :aria-selected="false"
              @mousedown.prevent="pickTool(t)"
            >
              <span class="tb-item-icon" aria-hidden="true">{{ t.icon || '🔧' }}</span>
              <span class="tb-item-text">{{ t.name }}</span>
              <span class="tb-item-sub">{{ t.description }}</span>
            </li>
          </ul>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 外层包裹：相对定位，作为下拉面板的定位上下文（脱离文档流，避免布局抖动） */
.tb-search-wrap {
  position: relative;
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
  margin-top: 14px;
}

/* 水平居中：外层 margin-inline auto；窄屏自适铺满，宽屏居中且不过宽 */
.tb-search {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--motion-duration) var(--motion-ease),
    box-shadow var(--motion-duration) var(--motion-ease);
}
.tb-search:focus-within,
.tb-search.is-open {
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

/* 下拉面板：绝对定位，展开/收起不影响文档流（无布局抖动） */
.tb-search-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 60;
  max-height: 60vh;
  overflow-y: auto;
  padding: 6px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-dropdown);
}
.tb-panel-sec + .tb-panel-sec { margin-top: 4px; border-top: 1px solid var(--color-border); padding-top: 4px; }
.tb-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 4px;
}
.tb-panel-title {
  font-size: 12px;
  color: var(--color-text-muted);
}
.tb-panel-clear {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 6px;
}
.tb-panel-clear:hover { color: var(--color-error); background: var(--color-bg-hover); }

.tb-panel-list { list-style: none; margin: 0; padding: 0; }
.tb-panel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-text);
  font-size: 13px;
}
.tb-panel-item:hover { background: var(--color-primary-soft); }
.tb-item-icon { flex: none; color: var(--color-text-muted); width: 16px; text-align: center; }
.tb-item-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb-item-sub {
  flex: none;
  max-width: 45%;
  color: var(--color-text-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 展开/收起淡入淡出（短时长，跟随项目 motion token） */
.tb-drop-enter-active,
.tb-drop-leave-active {
  transition: opacity var(--motion-duration) var(--motion-ease),
    transform var(--motion-duration) var(--motion-ease);
}
.tb-drop-enter-from,
.tb-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .tb-drop-enter-active,
  .tb-drop-leave-active { transition: none; }
}
</style>
