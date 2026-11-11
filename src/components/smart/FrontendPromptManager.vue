<script setup lang="ts">
/**
 * 智能工作台 · 前端提示词（只读教学卡片库）
 *
 * 结构参考工具箱：注册表式常量 → 卡片列表（搜索 / 分类）→ 点击卡片打开详情面板。
 * 与「提示词管理」刻意分开：那边是用户可增删改的个人提示词库（进云同步），
 * 这里是 28 个组件 / 功能的示范卡，内容只读、不落库、不进云同步。
 *
 * 详情 = 左边真实效果预览（站内静态页 iframe，可交互）+ 右边提示词原文（可复制）。
 * 预览页自带高度上报，展开折叠面板、弹出消息提示后 iframe 会跟着长高。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import BaseTabs from '@/components/common/BaseTabs.vue'
import { DIALOG_BTN } from '@/config/dialogText'
import { copyText } from '@/utils/download'
import {
  FRONTEND_PROMPTS,
  FRONTEND_PROMPT_CATEGORIES,
  countFrontendPrompts,
  filterFrontendPrompts,
  type FrontendPromptItem
} from '@/composables/frontendPromptsCore'

const keyword = ref('')
const category = ref('')
const activeId = ref<string | null>(null)
const demoFrameRef = ref<HTMLIFrameElement | null>(null)
/** iframe 高度：由预览页上报的内容高度驱动，夹在 240~560px 之间 */
const demoHeight = ref(320)

const counts = countFrontendPrompts(FRONTEND_PROMPTS)
const tabs = computed(() => [
  { value: '', label: '全部', badge: counts.all, testid: 'smart-fp-cat-all' },
  ...FRONTEND_PROMPT_CATEGORIES.map(c => ({
    value: c.id,
    label: c.label,
    badge: counts[c.id] ?? 0,
    testid: `smart-fp-cat-${c.id}`
  }))
])
const visible = computed(() =>
  filterFrontendPrompts(FRONTEND_PROMPTS, { keyword: keyword.value, category: category.value })
)
const active = computed<FrontendPromptItem | null>(() =>
  activeId.value ? FRONTEND_PROMPTS.find(p => p.id === activeId.value) ?? null : null
)
const activeCategoryLabel = computed(() =>
  FRONTEND_PROMPT_CATEGORIES.find(c => c.id === active.value?.category)?.label ?? ''
)
const activeHint = computed(() =>
  FRONTEND_PROMPT_CATEGORIES.find(c => c.id === active.value?.category)?.hint ?? ''
)
const demoUrl = computed(() =>
  `${import.meta.env.BASE_URL}frontend-prompts/${active.value?.demoFile ?? ''}`
)
const activeIndex = computed(() => visible.value.findIndex(p => p.id === activeId.value))
const canStepPrev = computed(() => activeIndex.value > 0)
const canStepNext = computed(() =>
  activeIndex.value >= 0 && activeIndex.value < visible.value.length - 1
)

function openDetail(item: FrontendPromptItem): void {
  activeId.value = item.id
  demoHeight.value = 320
}
function closeDetail(): void {
  activeId.value = null
}
function step(delta: -1 | 1): void {
  const next = visible.value[activeIndex.value + delta]
  if (!next) return
  activeId.value = next.id
  demoHeight.value = 320
}
function handleCopy(): void {
  const item = active.value
  if (item) void copyText(item.prompt, '提示词已复制，可以直接发给 AI')
}
function resetFilters(): void {
  keyword.value = ''
  category.value = ''
}

/** 预览页上报高度：只认当前 iframe 的消息，避免其它窗口的 postMessage 混入。 */
function onDemoMessage(e: MessageEvent): void {
  const frame = demoFrameRef.value
  if (!frame || e.source !== frame.contentWindow) return
  const data = e.data as { __demoHeight?: boolean; id?: string; height?: number } | null
  if (!data || data.__demoHeight !== true || data.id !== 'fp') return
  if (typeof data.height !== 'number' || !Number.isFinite(data.height)) return
  demoHeight.value = Math.min(560, Math.max(240, Math.ceil(data.height) + 16))
}
onMounted(() => window.addEventListener('message', onDemoMessage))
onBeforeUnmount(() => window.removeEventListener('message', onDemoMessage))
</script>

<template>
  <div class="prompt-library" data-testid="smart-fp-page">
    <header class="prompt-library-head">
      <div class="prompt-library-heading">
        <h2 class="prompt-library-title">前端提示词</h2>
        <p class="prompt-library-sub">
          28 个组件与功能，先看效果，再复制提示词交给 AI。每张卡片的提示词只描述效果与交互，不涉及实现方式。
        </p>
      </div>
      <span class="prompt-library-total">{{ FRONTEND_PROMPTS.length }} 张卡片</span>
    </header>

    <div class="prompt-library-filters">
      <el-input
        v-model="keyword"
        class="prompt-library-search"
        data-testid="smart-fp-search"
        type="text"
        clearable
        placeholder="搜索组件名、功能或描述…"
        aria-label="搜索前端提示词"
      />
      <BaseTabs v-model="category" :items="tabs" testid="smart-fp-cat" />
    </div>

    <p class="prompt-library-result">
      {{ activeHint || '按学习顺序排列：页面与布局 → 基础组件 → 选择类 → 日期时间' }}
      <span> · 当前显示 {{ visible.length }} 张</span>
    </p>

    <div v-if="visible.length" class="prompt-grid" data-testid="smart-fp-grid">
      <button
        v-for="item in visible"
        :key="item.id"
        type="button"
        class="ui-card prompt-card"
        :data-testid="`smart-fp-card-${item.id}`"
        :aria-label="`查看 ${item.title} 的效果与提示词`"
        @click="openDetail(item)"
      >
        <span class="prompt-card-top">
          <span class="prompt-card-index">{{ item.id }}</span>
          <span class="prompt-card-category">
            {{ FRONTEND_PROMPT_CATEGORIES.find(c => c.id === item.category)?.label }}
          </span>
        </span>
        <span class="prompt-card-title">{{ item.title }}</span>
        <span class="prompt-card-summary">{{ item.summary }}</span>
        <span class="prompt-card-foot">查看效果与提示词 →</span>
      </button>
    </div>
    <div v-else class="prompt-empty" data-testid="smart-fp-empty">
      <p>没有找到相关卡片，换个关键词或分类试试。</p>
      <button type="button" class="ui-btn" @click="resetFilters">清空筛选</button>
    </div>

    <!-- 详情：效果 + 提示词左右并列，窄屏改为上下排列 -->
    <BaseDialog
      v-if="active"
      :title="active.title"
      width="1040px"
      data-testid="smart-fp-detail"
      @close="closeDetail"
    >
      <div class="prompt-detail">
        <section class="prompt-detail-pane">
          <div class="prompt-detail-pane-head">
            <h3>显示效果</h3>
            <span class="prompt-detail-tag">可以直接操作</span>
          </div>
          <div class="prompt-preview">
            <div class="prompt-preview-bar" aria-hidden="true">
              <span class="prompt-preview-dots"><i></i><i></i><i></i></span>
              <span class="prompt-preview-file">{{ active.demoFile }}</span>
              <span class="prompt-preview-right">浏览器预览</span>
            </div>
            <iframe
              :key="active.id"
              ref="demoFrameRef"
              class="prompt-preview-frame"
              :src="demoUrl"
              :style="{ height: `${demoHeight}px` }"
              :title="`${active.title} 的效果预览`"
              data-testid="smart-fp-detail-demo"
            />
          </div>
        </section>

        <section class="prompt-detail-pane">
          <div class="prompt-detail-pane-head">
            <h3>提示词</h3>
            <button
              type="button"
              class="ui-btn"
              data-testid="smart-fp-copy"
              :aria-label="`复制 ${active.title} 的提示词`"
              @click="handleCopy"
            >复制提示词</button>
          </div>
          <p class="prompt-detail-meta">
            第 {{ active.id }} / {{ FRONTEND_PROMPTS.length }} 张 · {{ activeCategoryLabel }}
            <span v-if="activeHint"> · {{ activeHint }}</span>
          </p>
          <pre class="prompt-detail-text" data-testid="smart-fp-detail-prompt">{{ active.prompt }}</pre>
          <p class="prompt-detail-note">只描述组件或功能，没有限定实现方式；复制后可按需改词再交给 AI。</p>
        </section>
      </div>

      <template #footer>
        <button type="button" class="ui-btn" :disabled="!canStepPrev" @click="step(-1)">上一张</button>
        <button type="button" class="ui-btn" :disabled="!canStepNext" @click="step(1)">下一张</button>
        <button type="button" class="btn-cancel" data-testid="smart-fp-detail-close" @click="closeDetail">{{ DIALOG_BTN.close }}</button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.prompt-library { display: flex; flex-direction: column; gap: var(--space-3); }
.prompt-library-head { display: flex; align-items: flex-start; gap: var(--space-3); }
.prompt-library-heading { min-width: 0; flex: 1; }
.prompt-library-title {
  margin: 0 0 var(--space-1);
  font-size: var(--fs-h2);
  font-weight: 600;
  color: var(--color-text);
}
.prompt-library-sub { margin: 0; font-size: var(--fs-sm); line-height: var(--line-height-relaxed); color: var(--color-text-secondary); }
.prompt-library-total {
  flex: none; padding: 2px var(--space-2); border-radius: var(--radius-full);
  background: var(--color-primary-soft); color: var(--color-primary-text);
  font-size: var(--fs-caption); white-space: nowrap;
}
.prompt-library-filters { display: flex; flex-direction: column; gap: var(--space-3); }
.prompt-library-search { max-width: 420px; }
.prompt-library-result { margin: 0; font-size: var(--fs-caption); color: var(--color-text-muted); }

.prompt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-3); }
.prompt-card {
  display: flex; flex-direction: column; align-items: stretch; gap: var(--space-2);
  padding: var(--space-4); min-height: 156px;
  text-align: left; font-family: inherit; cursor: pointer;
}
.prompt-card-top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.prompt-card-index {
  font-size: var(--fs-caption); font-weight: 600; color: var(--color-primary-text);
  font-variant-numeric: tabular-nums;
}
.prompt-card-category {
  padding: 2px var(--space-2); border-radius: var(--radius-full);
  background: var(--color-primary-soft); color: var(--color-primary-text);
  font-size: var(--fs-caption); white-space: nowrap;
}
.prompt-card-title { font-size: var(--fs-lg); font-weight: 600; color: var(--color-text); }
.prompt-card-summary {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden; font-size: var(--fs-sm); line-height: var(--line-height-base);
  color: var(--color-text-secondary);
}
.prompt-card-foot { margin-top: auto; font-size: var(--fs-caption); color: var(--color-primary-text); }

.prompt-empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--space-3);
  padding: var(--space-8) var(--space-4);
  border: 1px dashed var(--color-border); border-radius: var(--radius-lg);
  font-size: var(--fs-sm); color: var(--color-text-secondary);
}
.prompt-empty p { margin: 0; }

/* 详情：桌面两栏，窄屏单栏 */
.prompt-detail { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: var(--space-4); }
.prompt-detail-pane { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.prompt-detail-pane-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.prompt-detail-pane-head h3 { margin: 0; font-size: var(--fs-lg); font-weight: 600; color: var(--color-text); }
.prompt-detail-tag { font-size: var(--fs-caption); color: var(--color-text-muted); }
.prompt-detail-meta { margin: 0; font-size: var(--fs-caption); color: var(--color-text-muted); }

.prompt-preview {
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-bg-card); overflow: hidden;
}
.prompt-preview-bar {
  display: flex; align-items: center; gap: var(--space-2);
  height: 32px; padding: 0 var(--space-2);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-hover);
  font-size: var(--fs-caption); color: var(--color-text-muted);
}
.prompt-preview-dots { display: inline-flex; gap: var(--space-1); }
.prompt-preview-dots i { width: 8px; height: 8px; border-radius: var(--radius-full); background: var(--color-border-strong); }
.prompt-preview-file { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prompt-preview-right { margin-left: auto; flex: none; }
.prompt-preview-frame { display: block; width: 100%; border: 0; background: var(--color-bg-card); }

/* 与 SmartDetailDialog 的 .sd-content 同款卡面：提示词正文是「可复制的文案」，
   不用悬停面（红色主题下会偏粉，容易被误读成错误态）。 */
.prompt-detail-text {
  margin: 0; padding: var(--space-3);
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-bg-card);
  font-family: inherit; font-size: var(--fs-sm); line-height: var(--line-height-relaxed);
  color: var(--color-text); white-space: pre-wrap; overflow-wrap: anywhere;
}
.prompt-detail-note { margin: 0; font-size: var(--fs-caption); color: var(--color-text-muted); }

@media (max-width: 768px) {
  .prompt-library-head { flex-direction: column; }
  .prompt-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
  .prompt-detail { grid-template-columns: 1fr; }
}
</style>
