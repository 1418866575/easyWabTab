<script setup lang="ts">
// 教师工作台统计卡：白底 + 顶部彩色粗边（每卡一色）+ 大号彩色数字 + 灰色小标签。
// 颜色由 accent 传入（走 CSS 变量 --tw-accent），不硬编码主题色，自动适配深色模式。
withDefaults(defineProps<{ value: string | number; label: string; accent?: string }>(), {
  accent: 'var(--color-primary, #3b82f6)'
})
</script>

<template>
  <div class="tw-stat" :style="{ '--tw-accent': accent }">
    <div class="tw-stat-value">{{ value }}</div>
    <div class="tw-stat-label">{{ label }}</div>
  </div>
</template>
