<script setup lang="ts">
/**
 * 通用结果区：标题 + 内容 + 底部操作（复制 / 下载）
 * 传入 text 即启用复制与下载按钮；额外按钮通过 actions 插槽追加。
 */
import { useToolActions } from '../../composables/useToolActions'

const props = withDefaults(
  defineProps<{
    title?: string
    /** 结果的纯文本（用于复制/下载） */
    text?: string
    filename?: string
    mime?: string
    empty?: string
  }>(),
  { title: '结果', text: '', filename: 'result.txt', mime: '', empty: '' }
)

const { copy, save } = useToolActions()
</script>

<template>
  <section class="tu-out" data-testid="tb-modal-output">
    <header class="tu-out-head">
      <span class="tu-out-title">{{ props.title }}</span>
      <div class="tu-out-actions">
        <slot name="actions" />
        <button
          v-if="props.text"
          type="button"
          class="tu-btn ghost"
          data-testid="tb-modal-copy"
          @click="copy(props.text)"
        >复制</button>
        <button
          v-if="props.text"
          type="button"
          class="tu-btn ghost"
          data-testid="tb-modal-download"
          @click="save(props.filename, props.text, props.mime || undefined)"
        >下载</button>
      </div>
    </header>
    <div class="tu-out-body">
      <slot>
        <p v-if="props.empty" class="tu-out-empty">{{ props.empty }}</p>
      </slot>
    </div>
  </section>
</template>

<style scoped>
.tu-out {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.tu-out-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tu-out-title { font-size: 13px; font-weight: 600; color: var(--color-text); }
.tu-out-actions { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
.tu-out-body { min-height: 40px; font-size: 13px; color: var(--color-text); overflow: auto; }
.tu-out-empty { margin: 0; font-size: 12.5px; color: var(--color-text-muted); }
</style>
