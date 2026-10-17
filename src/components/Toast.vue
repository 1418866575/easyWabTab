<script setup lang="ts">
import { ref } from 'vue'
import Icon from './Icon.vue'
import { useToast, type ToastItem, type ToastType } from '../composables/useToast'
import { copyText } from '../utils/download'

defineProps<{
  toasts: ToastItem[]
}>()

const emit = defineEmits<{
  remove: [id: number]
}>()

const icons: Record<ToastType, string> = {
  success: 'check',
  error: 'close',
  warning: 'alert',
  info: 'info'
}

const colors: Record<ToastType, string> = {
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6'
}

// 暂停/恢复倒计时走 useToast 单例（与 toasts 同源，保证定时器与条目一一对应）
const { pauseToast, resumeToast } = useToast()

/** 当前鼠标悬停的 toast：暂停倒计时 + 冻结底部进度条 */
const hoveredId = ref<number | null>(null)
/** 触屏设备没有真正的 hover：mouseenter 会被合成、mouseleave 可能永不触发 → 直接不暂停 */
const canHover =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(hover: hover)').matches
    : true

const removeToast = (id: number) => {
  emit('remove', id)
}

function onEnter(id: number): void {
  if (!canHover) return
  hoveredId.value = id
  pauseToast(id)
}

function onLeave(id: number): void {
  if (!canHover) return
  if (hoveredId.value === id) hoveredId.value = null
  resumeToast(id)
}

function onBodyClick(toast: ToastItem): void {
  // 错误信息通常需要选中/复制 → 点主体不关闭，只走右上角关闭按钮（防误关）
  if (toast.type === 'error') return
  removeToast(toast.id)
}

async function onCopy(toast: ToastItem): Promise<void> {
  await copyText(toast.message, '错误信息已复制')
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-container" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast"
          :class="[`toast-${toast.type}`, { 'is-paused': hoveredId === toast.id }]"
          @click="onBodyClick(toast)"
          @mouseenter="onEnter(toast.id)"
          @mouseleave="onLeave(toast.id)"
        >
          <span class="toast-icon" :style="{ color: colors[toast.type] }">
            <Icon :name="icons[toast.type]" />
          </span>
          <div class="toast-message">{{ toast.message }}</div>
          <div class="toast-actions">
            <button
              v-if="toast.type === 'error'"
              class="toast-action toast-copy"
              type="button"
              title="复制错误信息"
              aria-label="复制错误信息"
              @click.stop="onCopy(toast)"
            >
              <Icon name="copy" :size="14" />
            </button>
            <button
              class="toast-action toast-close"
              type="button"
              title="关闭"
              aria-label="关闭"
              @click.stop="removeToast(toast.id)"
            >
              <Icon name="close" :size="14" />
            </button>
          </div>
          <span
            v-if="toast.duration > 0"
            class="toast-progress"
            :style="{ animationDuration: `${toast.duration}ms`, backgroundColor: colors[toast.type] }"
            aria-hidden="true"
          ></span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  pointer-events: auto;
  min-width: 280px;
  max-width: 400px;
  overflow: hidden;
  transition: box-shadow var(--anim-base, 250ms) var(--ease-out, cubic-bezier(0.34, 1.56, 0.64, 1));
}

/* 错误信息更长 → 放宽宽度；点主体不关闭 → 光标改默认 */
.toast-error {
  max-width: 460px;
  cursor: default;
}

/* hover 只加深投影：不做位移，避免元素移动引发 mouseenter/leave 抖动打断暂停 */
.toast:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
}

.toast-icon {
  flex: none;
  font-size: 16px;
  font-weight: bold;
  line-height: 20px;
}

.toast-message {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 20px;
  color: var(--color-text, #1e293b);
  white-space: pre-wrap;
  word-break: break-word;
  /* 长错误信息内部滚动：鼠标仍在 toast 内，暂停不会被打断 */
  max-height: 132px;
  overflow-y: auto;
}

.toast-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
}

.toast-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  border-radius: 4px;
  cursor: pointer;
  transition: background var(--anim-fast, 150ms), color var(--anim-fast, 150ms);
}

.toast-action:hover {
  background: var(--color-border, #e2e8f0);
  color: var(--color-text, #1e293b);
}

.toast-action:focus-visible {
  outline: 2px solid var(--color-border-focus, #3b82f6);
  outline-offset: 1px;
}

/* 移动端放大触控区（沿用项目浮层按钮惯例） */
@media (max-width: 768px) {
  .toast-action {
    width: 32px;
    height: 32px;
  }
}

/* 底部倒计时进度条：hover 暂停时同步冻结，给用户「已暂停」的可感知反馈 */
.toast-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  opacity: 0.5;
  transform-origin: left center;
  animation: toast-countdown linear forwards;
}

.toast.is-paused .toast-progress {
  animation-play-state: paused;
}

@keyframes toast-countdown {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

/* Toast transition animations */
.toast-enter-active {
  animation: slideInRight var(--transition-fast, 0.15s ease) var(--ease-out, cubic-bezier(0.34, 1.56, 0.64, 1));
}

.toast-leave-active {
  animation: slideOutRight var(--transition-fast, 0.15s ease) ease-in;
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideOutRight {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100px);
  }
}

/* Dark mode */
html.dark .toast {
  background: var(--color-bg-card, #1f2937);
}

html.dark .toast-message {
  color: var(--color-text, #f9fafb);
}

html.dark .toast-action:hover {
  background: rgba(148, 163, 184, 0.2);
}
</style>
