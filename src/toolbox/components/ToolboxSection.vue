<script setup lang="ts">
/**
 * 分组容器：标题 + 副标题 + 内容（网格/列表/空态）。
 * 复用于「常用工具」「全部工具」「最近使用」。
 */
defineProps<{
  title: string
  sub?: string
}>()
</script>

<template>
  <section class="tb-section">
    <header class="tb-section-head">
      <h2>{{ title }}</h2>
      <span v-if="sub" class="tb-section-sub">{{ sub }}</span>
      <span class="tb-section-extra"><slot name="extra" /></span>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.tb-section { margin-top: 26px; }
.tb-section-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; }
.tb-section-head h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--color-text); }
.tb-section-sub { font-size: 12px; color: var(--color-text-muted); }
.tb-section-extra { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; }
</style>
