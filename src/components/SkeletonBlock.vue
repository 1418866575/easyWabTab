<script setup lang="ts">
// 共享骨架屏占位：用于异步初始化/加载期间给出「在忙」的视觉反馈。
// 采用 opacity 脉冲动画（不触发重排），并尊重 prefers-reduced-motion。
const props = withDefaults(
  defineProps<{
    rows?: number
    label?: string
  }>(),
  { rows: 5, label: '加载中' }
)
</script>

<template>
  <div class="ewt-skeleton" role="status" aria-live="polite" :aria-label="props.label">
    <div v-for="i in props.rows" :key="i" class="ewt-skeleton-row">
      <div class="ewt-skeleton-block ewt-skeleton-title"></div>
      <div class="ewt-skeleton-block"></div>
    </div>
  </div>
</template>

<style scoped>
.ewt-skeleton {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ewt-skeleton-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ewt-skeleton-block {
  height: 14px;
  border-radius: 6px;
  background: var(--color-background-tertiary, #e5e7eb);
  animation: ewt-skeleton-pulse 1.4s ease-in-out infinite;
}

.ewt-skeleton-title {
  width: 38%;
  height: 18px;
}

.ewt-skeleton-row:nth-child(even) .ewt-skeleton-block:last-child {
  width: 78%;
}

@keyframes ewt-skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ewt-skeleton-block {
    animation: none;
  }
}
</style>
