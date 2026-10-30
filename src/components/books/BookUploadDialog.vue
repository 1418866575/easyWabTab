<script setup lang="ts">
/**
 * 图书馆「上传」弹框（浏览器端本机上传）
 *
 * 存的是 IndexedDB，只在这台设备的这个浏览器里可见 —— 与 public/bookdata 的静态书
 * 是两套数据。弹框里把这一点说明白，避免用户以为传完别人也能看到。
 *
 * 沿用项目的 BaseDialog 体系（见 docs/UI_STYLE_GUIDE.md §2.2），不自造弹框。
 */
import { ref, computed } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { BOOKS_UPLOAD_MAX_BYTES } from '@/composables/booksCore'
import { formatSize } from '@/composables/booksCore'
import type { UploadRejectReason } from '@/composables/booksCore'
import { deleteUploadedBook, updateUploadedBookMeta, uploadBookFile } from '@/composables/booksUpload'
import type { UploadedBook } from '@/composables/booksUpload'
import { useBooksPrefs, flushBooksPrefs } from '@/composables/useBooksPrefs'
import { showConfirm } from '@/utils/dialog'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  modelValue: boolean
  uploads: UploadedBook[]
  /** 已占用的 id（含静态书），用于重名判定 */
  existingIds: string[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'changed'): void
}>()

const toast = useToast()
const busy = ref(false)
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const rejects = ref<Array<{ name: string; reason: UploadRejectReason | 'io'; message: string }>>([])

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

/** BaseDialog 用 close 事件（无 v-model），转发成父组件的 modelValue 更新 */
function onClose(): void {
  open.value = false
}

const uploadTotal = computed(() =>
  formatSize(props.uploads.reduce((s, u) => s + (u.size || 0), 0))
)

/** reason → 给人看的一句话（比直接抛英文错误信息友好） */
function reasonText(reason: UploadRejectReason | 'io'): string {
  switch (reason) {
    case 'not-html': return '不是 HTML 文件'
    case 'too-large': return `超过 ${formatSize(BOOKS_UPLOAD_MAX_BYTES)}`
    case 'empty': return '文件是空的'
    case 'dup': return '重名了'
    default: return '读取失败'
  }
}

async function handleFiles(files: FileList | File[] | null): Promise<void> {
  const list = files ? Array.from(files) : []
  if (!list.length || busy.value) return

  busy.value = true
  const nextRejects: typeof rejects.value = []
  // 本批次的已占用 id：**局部副本**，不往 props.existingIds 上写。
  // 直接改 prop 既会污染父组件的数组引用，也让"这批次里第二本与第一本重名"判不出来。
  const taken = [...props.existingIds]
  // 串行而非 Promise.all：每本都要占 IDB 配额，并发写更容易撞上配额超限
  for (const file of list) {
    const res = await uploadBookFile(file, taken)
    if (!res.ok) {
      const reason: UploadRejectReason | 'io' =
        file.size > BOOKS_UPLOAD_MAX_BYTES
          ? 'too-large'
          : !/\.html?$/i.test(file.name)
            ? 'not-html'
            : file.size <= 0
              ? 'empty'
              : 'io'
      nextRejects.push({ name: file.name, reason, message: res.message })
    } else {
      // 记进局部副本，让同一批次的后续文件也能避开这个 id
      if (res.id && !taken.includes(res.id)) taken.push(res.id)
      toast.success(res.message)
    }
  }
  rejects.value = nextRejects
  busy.value = false
  emit('changed')
  if (fileInput.value) fileInput.value.value = ''
}

function onPick(e: Event): void {
  const t = e.target as HTMLInputElement
  void handleFiles(t.files)
}

function onDrop(e: DragEvent): void {
  dragOver.value = false
  void handleFiles(e.dataTransfer?.files ?? null)
}

/** 正在编辑元信息的书 id；空串 = 没在编辑 */
const editingId = ref('')
const editTitle = ref('')
const editDesc = ref('')
const editCategory = ref('')
const editTags = ref('')

function startEdit(book: UploadedBook): void {
  editingId.value = book.id
  editTitle.value = book.title
  editDesc.value = book.description
  editCategory.value = book.category
  editTags.value = book.tags.join(' ')
}

function cancelEdit(): void {
  editingId.value = ''
}

async function saveEdit(): Promise<void> {
  if (!editingId.value) return
  const res = await updateUploadedBookMeta(editingId.value, {
    title: editTitle.value,
    description: editDesc.value,
    category: editCategory.value,
    tags: editTags.value.split(/[\s,，]+/).filter(Boolean)
  })
  if (res.ok) {
    toast.success('已保存')
    editingId.value = ''
    emit('changed')
  } else {
    toast.error(res.message)
  }
}

async function onDelete(book: UploadedBook): Promise<void> {
  // 走项目统一的 showConfirm，不用原生 window.confirm（见 UI_STYLE_GUIDE §184）
  const ok = await showConfirm(
    `删除「${book.title}」？该书只存在这台设备上，删了就没了。`,
    '删除书籍'
  )
  if (!ok) return
  try {
    await deleteUploadedBook(book.id)
    // 与书架卡片上的删除保持一致：收藏 / 最近 / 打开次数 / 阅读位置一并清掉，
    // 否则偏好里会留下指向已删书的孤儿 id
    useBooksPrefs().forgetBook(book.id)
    flushBooksPrefs()
    toast.success(`已删除「${book.title}」`)
    emit('changed')
  } catch (e) {
    toast.error(`删除失败：${(e as Error)?.message ?? e}`)
  }
}
</script>

<template>
  <BaseDialog
    :title="'上传书籍到本机书架'"
    width="520px"
    max-height="82vh"
    data-testid="bk-upload-dialog"
    @close="onClose"
  >
    <div class="bk-upload-hint">
      <p>
        把 <strong>.html</strong> 文件拖进来即可。文件存在<strong>这台设备的浏览器里</strong>，
        不上传服务器、别的设备看不到 —— 想让所有人都能看到的书，还是得放进
        <code>public/bookdata/</code> 目录。
      </p>
      <p class="bk-upload-limit">单个文件上限 {{ formatSize(BOOKS_UPLOAD_MAX_BYTES) }}，当前已存 {{ uploads.length }} 本 / {{ uploadTotal }}</p>
    </div>

    <div
      class="bk-dropzone"
      :class="{ 'is-over': dragOver }"
      data-testid="bk-dropzone"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <p class="bk-dropzone-title">{{ busy ? '正在导入…' : '把 HTML 文件拖到这里' }}</p>
      <p class="bk-dropzone-sub">或点击选择文件（可多选）</p>
      <input
        ref="fileInput"
        type="file"
        accept=".html,.htm,text/html"
        multiple
        hidden
        data-testid="bk-upload-input"
        @change="onPick"
      />
    </div>

    <div v-if="rejects.length" class="bk-rejects" data-testid="bk-rejects">
      <p class="bk-rejects-title">{{ rejects.length }} 个文件未能导入</p>
      <ul class="bk-rejects-list">
        <li v-for="(r, i) in rejects" :key="i">
          <span class="bk-reject-name">{{ r.name }}</span>
          <span class="bk-reject-reason">{{ reasonText(r.reason) }}</span>
        </li>
      </ul>
    </div>

    <div v-if="uploads.length" class="bk-uploaded">
      <p class="bk-uploaded-title">本机已有 {{ uploads.length }} 本</p>
      <ul class="bk-uploaded-list">
        <li v-for="u in uploads" :key="u.id" class="bk-uploaded-item">
          <template v-if="editingId === u.id">
            <div class="bk-edit">
              <input v-model="editTitle" type="text" class="bk-edit-input" placeholder="书名" maxlength="60" />
              <input v-model="editCategory" type="text" class="bk-edit-input" placeholder="分类" maxlength="24" />
              <input v-model="editDesc" type="text" class="bk-edit-input" placeholder="简介" maxlength="120" />
              <input v-model="editTags" type="text" class="bk-edit-input" placeholder="标签，空格分隔" maxlength="120" />
              <div class="bk-edit-actions">
                <button type="button" class="ui-btn ui-btn--sm ui-btn--primary" data-testid="bk-upload-edit-save" @click="saveEdit">
                  保存
                </button>
                <button type="button" class="ui-btn ui-btn--sm" @click="cancelEdit">取消</button>
              </div>
            </div>
          </template>
          <template v-else>
            <span class="bk-uploaded-name" :title="u.title">{{ u.title }}</span>
            <span class="bk-uploaded-size">{{ formatSize(u.size) }}</span>
            <button
              type="button"
              class="ui-btn ui-btn--sm"
              :data-testid="`bk-upload-edit-${u.id}`"
              title="编辑书名 / 简介 / 分类 / 标签"
              @click="startEdit(u)"
            >
              编辑
            </button>
            <button
              type="button"
              class="ui-btn ui-btn--sm ui-btn--danger"
              :data-testid="`bk-upload-del-${u.id}`"
              @click="onDelete(u)"
            >
              删除
            </button>
          </template>
        </li>
      </ul>
    </div>
    <p v-else class="bk-uploaded-empty">本机还没有上传任何书。</p>

    <template #footer>
      <button type="button" class="ui-btn" data-testid="bk-upload-close" @click="onClose">
        关闭
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.bk-upload-hint p {
  margin: 0 0 6px;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  line-height: var(--line-height-relaxed, 1.6);
}
.bk-upload-limit {
  font-size: var(--font-size-xs, 12px) !important;
  color: var(--color-text-muted, #94a3b8) !important;
}
.bk-upload-hint code {
  padding: 1px 4px;
  border-radius: var(--radius-sm, 4px);
  background-color: var(--color-bg-hover, #f1f5f9);
  font-size: var(--font-size-xs, 12px);
}

.bk-dropzone {
  margin: 12px 0;
  padding: 24px 16px;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
  text-align: center;
  cursor: pointer;
  transition: border-color var(--motion-duration, 220ms), background-color var(--motion-duration, 220ms);
}
.bk-dropzone:hover,
.bk-dropzone.is-over {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary-soft, #eff6ff);
}
.bk-dropzone-title {
  margin: 0 0 4px;
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-base, 15px);
  font-weight: var(--font-weight-medium, 500);
}
.bk-dropzone-sub {
  margin: 0;
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
}

.bk-rejects {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--color-error, #ef4444);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-error-soft, #fef2f2);
}
.bk-rejects-title {
  margin: 0 0 4px;
  color: var(--color-error, #ef4444);
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
}
.bk-rejects-list {
  margin: 0;
  padding-left: 18px;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
}

.bk-uploaded-title {
  margin: 0 0 6px;
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
}
.bk-uploaded-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}
.bk-uploaded-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 8px;
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
}
.bk-uploaded-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-sm, 13px);
}
.bk-uploaded-size {
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
  white-space: nowrap;
}
.bk-uploaded-empty {
  margin: 0;
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
}

/* 元信息编辑区 */
.bk-edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 6px 0;
}
/* 输入框视觉统一到全局 .ui-input，这里只保留宽度 */
.bk-edit-input {
  width: 100%;
}
.bk-edit-actions {
  display: flex;
  gap: 6px;
}
</style>