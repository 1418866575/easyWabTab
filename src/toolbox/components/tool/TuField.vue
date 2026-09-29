<script setup lang="ts">
/**
 * 通用表单字段容器：label + 控件 + 提示/额外操作
 */
defineProps<{
  label: string
  hint?: string
  /** 右上角附加内容（如字数统计） */
  extra?: string
}>()
</script>

<template>
  <div class="tu-field">
    <div class="tu-field-head">
      <label class="tu-label">{{ label }}</label>
      <span v-if="extra" class="tu-field-extra">{{ extra }}</span>
      <slot name="extra" />
    </div>
    <slot />
    <p v-if="hint" class="tu-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.tu-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.tu-field-head { display: flex; align-items: center; gap: 8px; }
.tu-field-extra { margin-left: auto; font-size: 11px; color: var(--color-text-muted); }
</style>
