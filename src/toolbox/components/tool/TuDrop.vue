<script setup lang="ts">
/**
 * 文件选择 / 拖放区（图片与表格类工具复用，全部本地读取）
 */
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    accept?: string
    multiple?: boolean
    hint?: string
    buttonText?: string
  }>(),
  { accept: 'image/*', multiple: false, hint: '点击选择文件，或将文件拖到此处', buttonText: '选择文件' }
)

const emit = defineEmits<{
  (e: 'files', files: File[]): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

function pick() {
  inputRef.value?.click()
}

function onChange(e: Event) {
  const el = e.target as HTMLInputElement
  const list = Array.from(el.files || [])
  if (list.length) emit('files', list)
  el.value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const list = Array.from(e.dataTransfer?.files || [])
  if (!list.length) return
  emit('files', props.multiple ? list : [list[0]])
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragging.value = true
}
</script>

<template>
  <div
    class="tu-drop"
    :class="{ 'is-over': dragging }"
    @click="pick"
    @dragover="onDragOver"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <input
      ref="inputRef"
      type="file"
      class="tu-drop-input"
      :accept="props.accept"
      :multiple="props.multiple"
      data-testid="tb-modal-file"
      @change="onChange"
      @click.stop
    />
    <span class="tu-drop-icon" aria-hidden="true">📁</span>
    <span class="tu-drop-text">{{ props.hint }}</span>
    <span class="tu-drop-btn">{{ props.buttonText }}</span>
  </div>
</template>

<style scoped>
.tu-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  background: var(--color-bg-card);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color var(--motion-duration) var(--motion-ease),
    background-color var(--motion-duration) var(--motion-ease);
}
.tu-drop:hover,
.tu-drop.is-over { border-color: var(--color-primary); background: var(--color-bg-hover); }
.tu-drop-input { display: none; }
.tu-drop-icon { font-size: 22px; }
.tu-drop-text { font-size: 12.5px; color: var(--color-text-secondary); }
.tu-drop-btn {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
</style>
