<script setup lang="ts">
/**
 * 编辑本机上传书籍的元信息（书名 / 分类 / 简介 / 标签）
 *
 * 只动元信息，不碰 HTML 正文 —— 正文是用户上传的单文件，改它既没有入口也没有意义。
 * 落库走 booksUpload.updateUploadedBookMeta（内部保留 createdAt、刷新 updatedAt），
 * 保存后由父组件重新 listUploadedBooks，卡片即刷新。
 */
import { computed, ref, watch } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { updateUploadedBookMeta } from '@/composables/booksUpload'
import type { UploadedBook } from '@/composables/booksUpload'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  modelValue: boolean
  /** 要编辑的书；null 时不显示表单内容 */
  book: UploadedBook | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const toast = useToast()
const saving = ref(false)

const title = ref('')
const category = ref('')
const description = ref('')
const tags = ref('')

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

/** 每次打开都按当前书重置表单，避免残留上一次编辑的内容 */
watch(
  () => [props.modelValue, props.book?.id] as const,
  ([isOpen]) => {
    if (!isOpen || !props.book) return
    title.value = props.book.title
    category.value = props.book.category
    description.value = props.book.description
    tags.value = props.book.tags.join(' ')
  },
  { immediate: true }
)

function onClose(): void {
  open.value = false
}

async function onSave(): Promise<void> {
  if (!props.book || saving.value) return
  const t = title.value.trim()
  if (!t) {
    toast.warning('书名不能为空')
    return
  }
  saving.value = true
  const res = await updateUploadedBookMeta(props.book.id, {
    title: t,
    // 分类留空时 updateUploadedBookMeta 会保留原值，这里如实提示即可
    category: category.value,
    description: description.value,
    tags: tags.value.split(/[\s,，]+/).filter(Boolean)
  })
  saving.value = false
  if (!res.ok) {
    toast.error(res.message)
    return
  }
  toast.success(`已保存《${t}》`)
  emit('saved')
  open.value = false
}
</script>

<template>
  <BaseDialog
    title="编辑书籍信息"
    width="480px"
    max-height="82vh"
    data-testid="bk-edit-dialog"
    @close="onClose"
  >
    <div class="bk-form">
      <label class="bk-field">
        <span class="bk-label">书名<em class="bk-req">*</em></span>
        <input
          v-model="title"
          type="text"
          class="bk-input"
          placeholder="书名"
          maxlength="60"
          data-testid="bk-edit-title"
          @keydown.enter.prevent="onSave"
        />
      </label>

      <label class="bk-field">
        <span class="bk-label">分类</span>
        <input
          v-model="category"
          type="text"
          class="bk-input"
          placeholder="留空则保持原分类"
          maxlength="24"
          data-testid="bk-edit-category"
        />
      </label>

      <label class="bk-field">
        <span class="bk-label">简介</span>
        <input
          v-model="description"
          type="text"
          class="bk-input"
          placeholder="一两句话介绍这本书"
          maxlength="120"
          data-testid="bk-edit-desc"
        />
      </label>

      <label class="bk-field">
        <span class="bk-label">标签</span>
        <input
          v-model="tags"
          type="text"
          class="bk-input"
          placeholder="空格或逗号分隔，如：历史 小说"
          maxlength="120"
          data-testid="bk-edit-tags"
        />
      </label>

      <p class="bk-form-note">只改书名、分类、简介与标签；书的内容（HTML）保持不变。</p>
    </div>

    <template #footer>
      <button type="button" class="ui-btn" data-testid="bk-edit-cancel" @click="onClose">取消</button>
      <button
        type="button"
        class="ui-btn ui-btn--primary"
        :disabled="saving"
        data-testid="bk-edit-save"
        @click="onSave"
      >
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.bk-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bk-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bk-label {
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
}
.bk-req {
  margin-left: 2px;
  color: var(--color-error, #ef4444);
  font-style: normal;
}
/* 输入框视觉统一到全局 .ui-input，这里只保留宽度 */
.bk-input {
  width: 100%;
}
.bk-form-note {
  margin: 0;
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
  line-height: var(--line-height-relaxed, 1.6);
}
</style>
