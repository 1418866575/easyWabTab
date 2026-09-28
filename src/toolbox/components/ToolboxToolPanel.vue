<script setup lang="ts">
/**
 * 站内工具面板：承载「站内自建工具」的功能 UI（不跳转任何第三方）。
 * - 工具组件按 id 懒加载，未打开时不下载
 * - 支持 Esc 关闭、点击遮罩关闭、打开时锁定背景滚动
 * - 面板本身不含任何工具逻辑，只负责壳与生命周期
 */
import { computed, defineAsyncComponent, onBeforeUnmount, onErrorCaptured, ref, watch } from 'vue'
import type { ToolboxToolEntry } from '../types'

const props = defineProps<{
  entry: ToolboxToolEntry | null
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const loadError = ref('')

const ToolComponent = computed(() => {
  const e = props.entry
  if (!e || !e.component) return null
  const loader = e.component
  return defineAsyncComponent({ loader, timeout: 15000 })
})

// 工具组件加载/渲染失败时给出可读提示，而不是整页白屏
onErrorCaptured(err => {
  loadError.value = (err && err.message) ? err.message : String(err)
  return false
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

function lockScroll(on: boolean) {
  document.body.classList.toggle('tb-lock', on)
}

watch(
  () => props.visible,
  v => {
    loadError.value = ''
    if (v) {
      document.addEventListener('keydown', onKeydown)
      lockScroll(true)
    } else {
      document.removeEventListener('keydown', onKeydown)
      lockScroll(false)
    }
  }
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  lockScroll(false)
})
</script>

<template>
  <div
    v-if="props.visible && props.entry"
    class="tb-panel"
    data-testid="tb-panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby="tbPanelTitle"
  >
    <div class="tb-panel-mask" @click="emit('close')" />

    <div class="tb-panel-body">
      <header class="tb-panel-head">
        <span class="tb-panel-icon" aria-hidden="true">{{ props.entry.meta.icon }}</span>
        <h2 id="tbPanelTitle">{{ props.entry.meta.name }}</h2>
        <span class="tb-panel-badge">站内自建</span>
        <button
          type="button"
          class="tb-panel-close"
          data-testid="tb-panel-close"
          title="关闭"
          aria-label="关闭工具"
          @click="emit('close')"
        >✕</button>
      </header>

      <div class="tb-panel-content">
        <p v-if="loadError" class="tb-panel-error">工具加载失败：{{ loadError }}</p>
        <Suspense v-else-if="ToolComponent">
          <component :is="ToolComponent" />
          <template #fallback>
            <p class="tb-panel-loading">正在加载工具…</p>
          </template>
        </Suspense>
        <p v-else class="tb-panel-loading">该工具暂无实现（缺少 component）。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tb-panel {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 200);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tb-panel-mask {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, .55);
}
.tb-panel-body {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(920px, 100%);
  max-height: 92vh;
  margin: 16px;
  background: var(--color-bg-card);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-modal);
  overflow: hidden;
}
.tb-panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
}
.tb-panel-icon { font-size: 20px; }
.tb-panel-head h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--color-text); }
.tb-panel-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-weight: 600;
  background: var(--color-success-soft);
  color: var(--color-success);
}
.tb-panel-close {
  margin-left: auto;
  min-width: 34px;
  min-height: 34px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 15px;
  transition: color var(--motion-duration) var(--motion-ease),
    border-color var(--motion-duration) var(--motion-ease);
}
.tb-panel-close:hover { color: var(--color-primary); border-color: var(--color-primary); }
.tb-panel-content { padding: 16px; overflow: auto; }
.tb-panel-loading,
.tb-panel-error { font-size: 13px; color: var(--color-text-secondary); margin: 0; }
.tb-panel-error { color: var(--color-error); }

@media (max-width: 768px) {
  .tb-panel-body { width: 100%; max-width: 100%; height: 100%; max-height: 100%; border-radius: 0; margin: 0; }
  .tb-panel-head { padding: 12px 14px; }
  .tb-panel-content { padding: 14px; }
}
</style>

<style>
/* 面板打开时锁定背景滚动（作用于 body，故此处不用 scoped） */
body.tb-lock { overflow: hidden; }
</style>
