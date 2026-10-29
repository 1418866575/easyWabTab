<script setup lang="ts">
// 工作台面板通用「悬浮快捷新增」按钮（FAB）。
// 纯展示组件：固定右下角，点击 emit('click')，由各面板绑定自己的新增入口（复用既有逻辑，不重复实现表单）。
// 定位：桌面端 fixed 视口右下角；移动端避让底部固定 Tab Bar（留 safe-area + 44px 触控区），
// 落在 .wb-content 底部 padding 区内，不遮挡分页条。
import Icon from '@/components/Icon.vue'

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button class="wb-fab" type="button" data-testid="wb-fab-add" title="快速新增" @click="emit('click')">
    <Icon name="plus" :size="22" />
  </button>
</template>

<style scoped>
.wb-fab {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 40;
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 9999px;
  background: var(--color-primary, #3b82f6);
  color: #fff;
  box-shadow: var(--shadow-lg, 0 6px 18px rgba(0, 0, 0, 0.22));
  cursor: pointer;
  transition:
    transform var(--motion-duration, 220ms) var(--motion-ease, ease),
    box-shadow var(--motion-duration, 220ms) var(--motion-ease, ease);
}

.wb-fab:hover {
  transform: var(--motion-hover-rise, translateY(-1px));
  box-shadow: var(--shadow-card-hover, 0 8px 22px rgba(0, 0, 0, 0.28));
}

.wb-fab:active {
  transform: var(--motion-press, scale(0.95));
}

/* 移动端：避让底部固定 Tab Bar（44px 触控 + 安全区），落在内容区底部留白内 */
@media (max-width: 768px) {
  .wb-fab {
    right: 16px;
    bottom: calc(64px + env(safe-area-inset-bottom, 0px));
    width: 48px;
    height: 48px;
  }
}
</style>
