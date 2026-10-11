<script setup lang="ts">
/**
 * 智能工作台 · 工作流详情弹框（只读预览）
 * 展示元数据 + 定义全文。定义先转义再保留换行，避免注入；支持长文滚动。
 */
import { computed } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import type { SmartWorkflow } from '@/types'

const props = defineProps<{ item: SmartWorkflow }>()
const emit = defineEmits<{ close: [] }>()

const title = computed(() => props.item.name)

/** 定义文本：转义 HTML 并保留换行，统一用 monospace 呈现步骤式内容 */
const definitionHtml = computed(() => {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc(props.item.definition).replace(/\n/g, '<br/>')
})

const updatedText = computed(() => {
  const d = new Date(props.item.updatedAt)
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
})
</script>

<template>
  <BaseDialog :title="title" width="720px" @close="emit('close')">
    <div class="wd-body">
      <div class="wd-meta">
        <span class="wd-chip">{{ props.item.category }}</span>
        <span v-for="t in props.item.tags" :key="t" class="wd-chip is-tag">#{{ t }}</span>
        <span v-if="props.item.author" class="wd-chip">作者 {{ props.item.author }}</span>
        <span v-if="props.item.version" class="wd-chip">v{{ props.item.version }}</span>
        <span v-if="props.item.usageCount > 0" class="wd-chip">用过 {{ props.item.usageCount }} 次</span>
      </div>

      <p v-if="props.item.description" class="wd-desc">{{ props.item.description }}</p>

      <div class="wd-section-label">定义</div>
      <div class="wd-content" v-html="definitionHtml" />

      <p class="wd-updated">最近更新：{{ updatedText }}</p>
    </div>

    <template #footer>
      <el-button size="small" @click="emit('close')">关闭</el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
/* 高度与滚动交给 BaseDialog 的 .bd-body（统一 padding + overflow-y:auto），这里只管内容排布 */
.wd-body { display: flex; flex-direction: column; gap: 12px; }
.wd-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.wd-chip {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--color-bg-hover, #f3f4f6);
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
}
.wd-chip.is-tag { color: var(--color-primary, #3b82f6); }
.wd-desc { margin: 0; font-size: 13px; color: var(--color-text-secondary, #6b7280); }

.wd-section-label { font-size: 13px; font-weight: 600; color: var(--color-text-secondary, #6b7280); }

.wd-content {
  padding: 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text, #111827);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: normal;
  overflow-wrap: anywhere;
}
.wd-updated { margin: 0; font-size: 12px; color: var(--color-text-muted, #9ca3af); }
</style>
