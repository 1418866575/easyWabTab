<script setup lang="ts">
/**
 * 智能工作台 · 提示词详情弹框（只读预览）
 * 技能详情走 SkillDetailDialog（要展示 frontmatter 与资源树，展示结构完全不同）。
 * 提示词正文高亮 {{变量}} 便于检查占位；先转义再替换，避免注入。
 */
import { computed } from 'vue'
import { parseVariables } from '@/composables/smartCore'
import type { SmartPrompt } from '@/types'

const props = defineProps<{ item: SmartPrompt }>()
const emit = defineEmits<{ close: [] }>()

const promptHtml = computed(() => {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc(props.item.content)
    .replace(/\n/g, '<br/>')
    .replace(/\{\{\s*([A-Za-z0-9_\u4e00-\u9fa5]{1,32})\s*\}\}/g, '<code class="sd-var">{{$1}}</code>')
})

const vars = computed(() => parseVariables(props.item.content))

/** 占位展示文本在脚本里拼：模板中直接写 `{{ ... }}` 字面量会被解析器吃掉（见 SmartEditorDialog 同款说明） */
function varLabel(name: string): string {
  return '{{' + name + '}}'
}
const title = computed(() => props.item.title)
</script>

<template>
  <el-dialog :model-value="true" width="720px" :title="title" @close="emit('close')">
    <div class="sd-body">
      <div class="sd-meta">
        <span class="sd-chip">{{ props.item.category }}</span>
        <span v-for="t in props.item.tags" :key="t" class="sd-chip is-tag">#{{ t }}</span>
        <span v-if="props.item.model" class="sd-chip">{{ props.item.model }}</span>
      </div>

      <div class="sd-content is-plain" v-html="promptHtml" />

      <p v-if="vars.length" class="sd-vars">
        变量（{{ vars.length }}）：
        <code v-for="v in vars" :key="v.name" class="sd-var-inline">{{ varLabel(v.name) }}</code>
      </p>
    </div>

    <template #footer>
      <div class="sd-actions">
        <el-button size="small" @click="emit('close')">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.sd-body { display: flex; flex-direction: column; gap: 12px; max-height: 60vh; overflow-y: auto; }
.sd-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sd-chip {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--color-bg-hover, #f3f4f6);
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
}
.sd-chip.is-tag { color: var(--color-primary, #3b82f6); }
.sd-desc { font-size: 13px; color: var(--color-text-secondary, #6b7280); }

.sd-content {
  padding: 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text, #111827);
  overflow-wrap: anywhere;
}
.sd-content.is-plain { font-family: inherit; white-space: normal; }
.sd-content :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--color-bg-hover, #f3f4f6);
  font-size: 12px;
}
.sd-content :deep(pre) {
  padding: 10px;
  border-radius: 6px;
  background: var(--color-bg-hover, #f3f4f6);
  overflow-x: auto;
}
.sd-content :deep(p) { margin: 0 0 8px; }
.sd-content :deep(p:last-child) { margin-bottom: 0; }
.sd-content :deep(ul), .sd-content :deep(ol) { margin: 0 0 8px; padding-left: 20px; }

.sd-vars { margin: 0; font-size: 12px; color: var(--color-text-muted, #9ca3af); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sd-var-inline { padding: 1px 6px; border-radius: 4px; background: var(--color-bg-hover, #f3f4f6); color: var(--color-primary, #3b82f6); }
.sd-actions { display: flex; justify-content: flex-end; }
</style>
