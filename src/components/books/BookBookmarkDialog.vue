<script setup lang="ts">
/**
 * 图书馆「添加书签」弹框（用户自建书签：书名 + 自定义内容）
 *
 * 与阅读位置书签（阅读页自动记的滚动比例）完全无关 —— 这里是用户在右上角主动记的
 * 「我想记住某本书 + 一段自定义内容」，仅存本机浏览器（和收藏/最近打开同套 prefs 存储）。
 *
 * 沿用项目 BaseDialog 体系（见 docs/UI_STYLE_GUIDE.md §2.2），不自造弹框。
 * 弹框内同时承载「已添加列表 + 删除」，让添加结果即时可见、操作直观。
 */
import { ref, computed } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { useToast } from '@/composables/useToast'
import { useBooksPrefs } from '@/composables/useBooksPrefs'
import type { UserBookmark } from '@/composables/useBooksPrefs'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const toast = useToast()
const prefs = useBooksPrefs()

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

/** BaseDialog 用 close 事件（无 v-model），转发成父组件的 modelValue 更新 */
function onClose(): void {
  open.value = false
}

const title = ref('')
const content = ref('')
const error = ref('')

/** 已添加书签（最新的在最前，与添加顺序一致） */
const bookmarks = computed<UserBookmark[]>(() => prefs.userBookmarks.value)

/** 书名 / 内容长度上限（与 prefs.addUserBookmark 的截断保持一致，用于实时计数显示） */
const TITLE_MAX = 80
const CONTENT_MAX = 2000

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

function onSubmit(): void {
  const res = prefs.addUserBookmark(title.value, content.value)
  if (!res.ok) {
    error.value = res.message
    toast.error(res.message)
    return
  }
  toast.success(res.message)
  // 保留弹框打开，让刚添加的书签出现在下方列表里；清空表单便于连续添加
  title.value = ''
  content.value = ''
  error.value = ''
}

function onDelete(b: UserBookmark): void {
  prefs.deleteUserBookmark(b.id)
  toast.info(`已删除书签「${b.title}」`)
}
</script>

<template>
  <BaseDialog
    title="添加书签"
    width="480px"
    max-height="82vh"
    data-testid="bk-bookmark-dialog"
    @close="onClose"
  >
    <p class="bk-bm-hint">
      记录你想记住的书与自定义内容，仅保存在<strong>本机浏览器</strong>，不上传服务器、别的设备看不到。
    </p>

    <form class="bk-bm-form" data-testid="bk-bm-form" @submit.prevent="onSubmit">
      <label class="bk-bm-field">
        <span class="bk-bm-label">书名</span>
        <input
          v-model="title"
          type="text"
          class="bk-bm-input"
          placeholder="例如：道德经"
          :maxlength="TITLE_MAX"
          data-testid="bk-bm-title"
          @input="error = ''"
        />
        <span class="bk-bm-count">{{ title.length }}/{{ TITLE_MAX }}</span>
      </label>

      <label class="bk-bm-field">
        <span class="bk-bm-label">用户输入内容</span>
        <textarea
          v-model="content"
          class="bk-bm-textarea"
          placeholder="想记录的内容、摘录、感想……"
          :maxlength="CONTENT_MAX"
          rows="4"
          data-testid="bk-bm-content"
        ></textarea>
        <span class="bk-bm-count">{{ content.length }}/{{ CONTENT_MAX }}</span>
      </label>

      <p v-if="error" class="bk-bm-error" data-testid="bk-bm-error">{{ error }}</p>
    </form>

    <div v-if="bookmarks.length" class="bk-bm-list-wrap" data-testid="bk-bm-list">
      <p class="bk-bm-list-title">已添加 {{ bookmarks.length }} 条</p>
      <ul class="bk-bm-list">
        <li v-for="b in bookmarks" :key="b.id" class="bk-bm-item">
          <div class="bk-bm-item-main">
            <span class="bk-bm-item-title">{{ b.title }}</span>
            <span v-if="b.content" class="bk-bm-item-content">{{ b.content }}</span>
            <span class="bk-bm-item-time">{{ formatTime(b.ts) }}</span>
          </div>
          <button
            type="button"
            class="ui-btn ui-btn--sm ui-btn--danger"
            :data-testid="`bk-bm-del-${b.id}`"
            @click="onDelete(b)"
          >
            删除
          </button>
        </li>
      </ul>
    </div>

    <template #footer>
      <button type="button" class="ui-btn" data-testid="bk-bm-close" @click="onClose">关闭</button>
      <button type="button" class="ui-btn ui-btn--primary" data-testid="bk-bm-add" @click="onSubmit">
        添加书签
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.bk-bm-hint {
  margin: 0 0 14px;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  line-height: var(--line-height-relaxed, 1.6);
}
.bk-bm-hint strong {
  color: var(--color-text, #0f172a);
}

.bk-bm-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bk-bm-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bk-bm-label {
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text, #0f172a);
}
.bk-bm-input,
.bk-bm-textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-input, #ffffff);
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-sm, 13px);
  font-family: var(--font-family);
  resize: vertical;
}
.bk-bm-input:focus-visible,
.bk-bm-textarea:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 1px;
}
.bk-bm-count {
  align-self: flex-end;
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-muted, #94a3b8);
}
.bk-bm-error {
  margin: -4px 0 0;
  font-size: var(--font-size-xs, 12px);
  color: var(--color-error, #ef4444);
}

.bk-bm-list-wrap {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border, #e2e8f0);
}
.bk-bm-list-title {
  margin: 0 0 8px;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text, #0f172a);
}
.bk-bm-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}
.bk-bm-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card, #ffffff);
}
.bk-bm-item-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bk-bm-item-title {
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bk-bm-item-content {
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  line-height: var(--line-height-relaxed, 1.6);
  word-break: break-word;
  white-space: pre-wrap;
}
.bk-bm-item-time {
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
}
</style>
