<script setup lang="ts">
/**
 * 图书馆「添加书签」弹框（用户自建书签：书名 + 自定义内容）
 *
 * 与阅读位置书签（阅读页自动记的滚动比例）完全无关 —— 这里是用户在右上角主动记的
 * 「我想记住某本书 + 一段自定义内容」，仅存本机浏览器（和收藏/最近打开同套 prefs 存储）。
 *
 * 沿用项目 BaseDialog 体系（见 docs/UI_STYLE_GUIDE.md §2.2），不自造弹框。
 * 布局：顶部「书名（可搜索图书馆书名）+ 添加书签按钮（右上角）」→ 用户输入框 → 下方表格。
 */
import { ref, computed } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { useToast } from '@/composables/useToast'
import { useBooksPrefs } from '@/composables/useBooksPrefs'
import type { UserBookmark } from '@/composables/useBooksPrefs'

const props = defineProps<{
  modelValue: boolean
  /** 图书馆全部书名（静态书 + 本机上传），用于「书名」输入框的自动补全/搜索 */
  bookTitles?: string[]
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

function onSubmit(): void {
  const res = prefs.addUserBookmark(title.value, content.value)
  if (!res.ok) {
    error.value = res.message
    toast.error(res.message)
    return
  }
  toast.success(res.message)
  // 保留弹框打开，让刚添加的书签出现在下方表格里；清空表单便于连续添加
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
    width="60%"
    max-height="82vh"
    data-testid="bk-bookmark-dialog"
    @close="onClose"
  >
    <div class="bk-bm-add">
      <div class="bk-bm-add-row">
        <label class="bk-bm-field bk-bm-field--title">
          <span class="bk-bm-label">书名</span>
          <input
            v-model="title"
            type="text"
            class="bk-bm-input"
            list="bk-book-titles"
            placeholder="输入或搜索图书馆里的书名"
            :maxlength="TITLE_MAX"
            data-testid="bk-bm-title"
            @input="error = ''"
          />
        </label>
        <button
          type="button"
          class="ui-btn ui-btn--primary bk-bm-add-btn"
          data-testid="bk-bm-add"
          @click="onSubmit"
        >
          添加书签
        </button>
      </div>

      <label class="bk-bm-field">
        <span class="bk-bm-label">用户输入</span>
        <textarea
          v-model="content"
          class="bk-bm-textarea"
          placeholder="想记录的内容、摘录、感想……"
          :maxlength="CONTENT_MAX"
          rows="3"
          data-testid="bk-bm-content"
        ></textarea>
        <span class="bk-bm-count">{{ content.length }}/{{ CONTENT_MAX }}</span>
      </label>

      <p v-if="error" class="bk-bm-error" data-testid="bk-bm-error">{{ error }}</p>
    </div>

    <datalist id="bk-book-titles">
      <option v-for="t in (bookTitles ?? [])" :key="t" :value="t" />
    </datalist>

    <div class="bk-bm-table-wrap">
      <table class="bk-bm-table" data-testid="bk-bm-table">
        <thead>
          <tr>
            <th class="bk-bm-th-title">书名</th>
            <th class="bk-bm-th-content">用户输入</th>
            <th class="bk-bm-th-op">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in bookmarks" :key="b.id" class="bk-bm-row">
            <td class="bk-bm-td-title">{{ b.title }}</td>
            <td class="bk-bm-td-content">{{ b.content || '—' }}</td>
            <td class="bk-bm-td-op">
              <button
                type="button"
                class="ui-btn ui-btn--sm ui-btn--danger"
                :data-testid="`bk-bm-del-${b.id}`"
                @click="onDelete(b)"
              >
                删除
              </button>
            </td>
          </tr>
          <tr v-if="!bookmarks.length" class="bk-bm-empty-row">
            <td colspan="3" class="bk-bm-empty">还没有书签，在上方添加一条吧</td>
          </tr>
        </tbody>
      </table>
    </div>

    <template #footer>
      <button type="button" class="ui-btn" data-testid="bk-bm-close" @click="onClose">关闭</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.bk-bm-add {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bk-bm-add-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}
.bk-bm-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bk-bm-field--title {
  flex: 1 1 auto;
  min-width: 0;
}
.bk-bm-add-btn {
  flex: 0 0 auto;
}

.bk-bm-label {
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text, #0f172a);
}
/* 输入框/多行输入视觉统一到全局（.ui-input / .ui-textarea），这里只保留宽度 */
.bk-bm-input,
.bk-bm-textarea {
  width: 100%;
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

/* ---------- 记录表格 ---------- */
.bk-bm-table-wrap {
  margin-top: 16px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
}
.bk-bm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm, 13px);
  table-layout: fixed;
}
.bk-bm-table th,
.bk-bm-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  vertical-align: top;
}
.bk-bm-table thead th {
  background: var(--color-bg-subtle, #f8fafc);
  color: var(--color-text-secondary, #64748b);
  font-weight: var(--font-weight-medium, 500);
  white-space: nowrap;
}
.bk-bm-th-title {
  width: 28%;
}
.bk-bm-th-op {
  width: 72px;
  text-align: right;
}
.bk-bm-table tbody tr:last-child td {
  border-bottom: none;
}
.bk-bm-table tbody tr:hover {
  background: var(--color-primary-soft, #eff6ff);
}
.bk-bm-td-title {
  color: var(--color-text, #0f172a);
  font-weight: var(--font-weight-medium, 500);
  /* 超长书名单行截断，避免撑破固定布局 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bk-bm-td-content {
  color: var(--color-text-secondary, #64748b);
  word-break: break-word;
  white-space: pre-wrap;
}
.bk-bm-td-op {
  text-align: right;
  white-space: nowrap;
}
.bk-bm-empty {
  text-align: center;
  color: var(--color-text-muted, #94a3b8);
  padding: 24px 12px;
}

/* 移动端：弹框宽度回归满屏（60% 在窄屏过窄） */
@media (max-width: 768px) {
  :deep(.bd-panel) {
    max-width: 100% !important;
  }
  .bk-bm-add-row {
    flex-direction: column;
    align-items: stretch;
  }
  .bk-bm-add-btn {
    width: 100%;
  }
  .bk-bm-th-title {
    width: 36%;
  }
  .bk-bm-th-op {
    width: 60px;
  }
}
</style>
