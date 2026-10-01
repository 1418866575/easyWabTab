<template>
  <div class="ewt-card" :class="{ 'has-actions': hasActions, 'has-header': hasHeader }" @click="emit('edit')">
    <!-- 卡片头部插槽（可选）：用于把「日期 + 标题」等需要同行展示的字段合并到第一行 -->
    <div v-if="hasHeader" class="ewt-card-header">
      <slot name="header" />
    </div>
    <dl class="ewt-card-fields">
      <div v-for="f in visibleFields" :key="f.label" class="ewt-card-field">
        <dt class="ewt-card-label">{{ f.label }}</dt>
        <dd class="ewt-card-value" :class="{ 'ewt-emphasis': f.emphasis }">{{ display(f.value) }}</dd>
      </div>
    </dl>
    <!-- 卡片视图操作区（编辑/删除…）：点击不冒泡，避免误触卡片整体的「编辑」 -->
    <div v-if="hasActions" class="ewt-card-actions" @click.stop>
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'

export interface CardField {
  label: string
  value?: string | number | null
  emphasis?: boolean
}

const props = defineProps<{ fields: CardField[]; maxFields?: number }>()
const emit = defineEmits<{ edit: [] }>()
const slots = useSlots()

/** 是否传入了底部操作区（有操作区时高度改为自适应，避免按钮被固定高度裁掉） */
const hasActions = computed(() => !!slots.actions)
/** 是否传入了头部插槽（用于合并展示日期+标题等同行字段） */
const hasHeader = computed(() => !!slots.header)

// 卡片仅展示前几个关键字段，固定高度下更紧凑；其余字段在列表视图中查看。
const visibleFields = computed(() => {
  const n = props.maxFields ?? 4
  return props.fields.slice(0, n)
})

function display(v?: string | number | null): string {
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}
</script>

<style scoped>
.ewt-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  box-sizing: border-box;
  height: 156px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
}
.ewt-card:hover {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}
.ewt-card:active {
  transform: scale(0.99);
}
/* 头部插槽：占满整行，置于字段网格之上（内容由调用方自行排版，如「日期 + 标题」同行） */
.ewt-card-header {
  flex-shrink: 0;
  min-width: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
:global(html.dark) .ewt-card-header {
  border-bottom-color: var(--color-border, #374151);
}
/* 带操作区：高度自适应，保证按钮行完整可见（移动端全局规则已放开 height，这里覆盖桌面） */
.ewt-card.has-actions {
  height: auto;
  min-height: 156px;
}
.ewt-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border, #e5e7eb);
  flex-shrink: 0;
}
/* 窄屏（双列卡片）收紧按钮间距与内边距，避免 3 个按钮挤爆卡片宽度 */
@media (max-width: 768px) {
  .ewt-card-actions {
    gap: 6px;
  }
  .ewt-card-actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }
  .ewt-card-actions :deep(.el-button--small) {
    padding-left: 8px;
    padding-right: 8px;
  }
}
:global(html.dark) .ewt-card-actions {
  border-top-color: var(--color-border, #374151);
}
:global(html.dark) .ewt-card {
  background: var(--color-surface, #1f2937);
  border-color: var(--color-border, #374151);
}
.ewt-card-fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  /* 关键修复：移动端卡片 height:auto 时，flex-basis:0% + min-height:0 + overflow:hidden
     会让字段区塌缩为 0 高（min-content 被当成 0），导致卡片不显示内容。
     改为内容基准 + 允许内容高度 + 不裁剪；卡片根 .ewt-card 仍有 overflow:hidden 兜底裁剪。 */
  flex: 1 1 auto;
  min-height: auto;
  overflow: visible;
}
.ewt-card-field {
  display: contents;
}
.ewt-card-label {
  font-size: 12px;
  color: var(--color-text-soft, #6b7280);
  white-space: nowrap;
}
.ewt-card-value {
  font-size: 13px;
  color: var(--color-text, #1f2937);
  word-break: break-word;
  margin: 0;
}
.ewt-card-value.ewt-emphasis {
  font-weight: 600;
  color: var(--color-primary, #3b82f6);
}
:global(html.dark) .ewt-card-value {
  color: var(--color-text, #e5e7eb);
}
</style>
