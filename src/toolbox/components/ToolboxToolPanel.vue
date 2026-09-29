<script setup lang="ts">
/**
 * 站内工具弹框（Modal）—— 承载「站内自建工具」的功能 UI，不跳转任何第三方
 *
 * 规范（v2）：
 * - 尺寸档：S 480 / M 720 / L 960 / XL 1120，移动端一律全屏
 * - 结构：头部（图标/名称/描述/关闭）+ 内容区（工具组件自渲染五段式）+ 底部提示
 * - 关闭：✕ / Esc / 点击遮罩；输入有内容且未复制/下载过则二次确认
 * - 焦点：打开时移入弹框并循环（Tab 不逸出），关闭后归还触发元素
 */
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onErrorCaptured, ref, watch } from 'vue'
import { resetDirty, useToolDirty } from '../prefs/useToolDirty'
import type { ToolboxToolEntry } from '../types'

const props = defineProps<{
  entry: ToolboxToolEntry | null
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { dirty, saved } = useToolDirty()
const loadError = ref('')
const bodyRef = ref<HTMLElement | null>(null)
const lastFocused = ref<HTMLElement | null>(null)

const SIZE_CLASS: Record<string, string> = { S: 'is-s', M: 'is-m', L: 'is-l', XL: 'is-xl' }

const sizeClass = computed(() => SIZE_CLASS[props.entry?.meta?.modalSize || 'M'] || 'is-m')
const layout = computed(() => props.entry?.meta?.layout || 'T1')

const ToolComponent = computed(() => {
  const e = props.entry
  if (!e || !e.component) return null
  const loader = e.component
  return defineAsyncComponent({ loader, timeout: 20000 })
})

onErrorCaptured(err => {
  loadError.value = err && err.message ? err.message : String(err)
  return false
})

function focusables(): HTMLElement[] {
  const root = bodyRef.value
  if (!root) return []
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null)
}

function onKeydown(e: KeyboardEvent) {
  if (!props.visible) return
  if (e.key === 'Escape') {
    e.preventDefault()
    tryClose()
    return
  }
  if (e.key === 'Tab') {
    const list = focusables()
    if (!list.length) return
    const first = list[0]
    const last = list[list.length - 1]
    const active = document.activeElement as HTMLElement | null
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

/** 关闭：有未保存输入时二次确认 */
function tryClose() {
  if (dirty.value && !saved.value) {
    const ok = window.confirm('工具内有未保存的内容，确认关闭？')
    if (!ok) return
  }
  emit('close')
}

function lockScroll(on: boolean) {
  document.body.classList.toggle('tb-lock', on)
}

watch(
  () => props.visible,
  async v => {
    loadError.value = ''
    if (v) {
      lastFocused.value = document.activeElement as HTMLElement | null
      document.addEventListener('keydown', onKeydown)
      lockScroll(true)
      await nextTick()
      const list = focusables()
      ;(list[0] || bodyRef.value)?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown)
      lockScroll(false)
      resetDirty()
      lastFocused.value?.focus?.()
      lastFocused.value = null
    }
  }
)

watch(
  () => props.entry?.meta?.id,
  () => {
    resetDirty()
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
    class="tb-modal"
    :class="sizeClass"
    data-testid="tb-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="tbModalTitle"
  >
    <div class="tb-modal-mask" @click="tryClose" />

    <div ref="bodyRef" class="tb-modal-body" tabindex="-1">
      <header class="tb-modal-head">
        <span class="tb-modal-icon" aria-hidden="true">{{ props.entry.meta.icon }}</span>
        <div class="tb-modal-titlebox">
          <h2 id="tbModalTitle">{{ props.entry.meta.name }}</h2>
          <p>{{ props.entry.meta.description }}</p>
        </div>
        <span class="tb-modal-badge">站内自建</span>
        <button
          type="button"
          class="tb-modal-close"
          data-testid="tb-modal-close"
          title="关闭（Esc）"
          aria-label="关闭工具"
          @click="tryClose"
        >✕</button>
      </header>

      <div class="tb-modal-content" :data-layout="layout">
        <p v-if="loadError" class="tb-modal-error" data-testid="tb-modal-error">工具加载失败：{{ loadError }}</p>
        <Suspense v-else-if="ToolComponent">
          <component :is="ToolComponent" />
          <template #fallback>
            <p class="tb-modal-loading">正在加载工具…</p>
          </template>
        </Suspense>
        <p v-else class="tb-modal-loading">该工具暂无实现（缺少 component）。</p>
      </div>

      <footer class="tb-modal-foot">
        <span class="tb-modal-tip">所有计算均在本机浏览器完成，数据不会上传</span>
        <button type="button" class="tb-modal-btn" @click="tryClose">关闭</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.tb-modal {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 200);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tb-modal-mask {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  animation: tb-fade var(--motion-duration) var(--motion-ease);
}
.tb-modal-body {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  max-height: min(88vh, 900px);
  margin: 16px;
  background: var(--color-bg-card);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-modal);
  overflow: hidden;
  outline: none;
  animation: tb-pop var(--motion-duration) var(--motion-ease);
}
.tb-modal.is-s .tb-modal-body { width: min(480px, 100%); }
.tb-modal.is-m .tb-modal-body { width: min(720px, 100%); }
.tb-modal.is-l .tb-modal-body { width: min(960px, 100%); }
.tb-modal.is-xl .tb-modal-body { width: min(1120px, 100%); }

.tb-modal-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
}
.tb-modal-icon { font-size: 20px; line-height: 1.4; }
.tb-modal-titlebox { min-width: 0; }
.tb-modal-titlebox h2 { margin: 0; font-size: 15px; font-weight: 600; color: var(--color-text); }
.tb-modal-titlebox p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tb-modal-badge {
  margin-left: auto;
  flex: none;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-weight: 600;
  background: var(--color-success-soft);
  color: var(--color-success);
}
.tb-modal-close {
  flex: none;
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
.tb-modal-close:hover { color: var(--color-primary); border-color: var(--color-primary); }

.tb-modal-content { padding: 16px; overflow: auto; flex: 1; }
.tb-modal-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-card);
}
.tb-modal-tip { font-size: 11.5px; color: var(--color-text-muted); }
.tb-modal-btn {
  margin-left: auto;
  min-height: 30px;
  padding: 4px 14px;
  font-size: 12.5px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
}
.tb-modal-btn:hover { color: var(--color-primary); border-color: var(--color-primary); }

.tb-modal-loading,
.tb-modal-error { margin: 0; font-size: 13px; color: var(--color-text-secondary); }
.tb-modal-error { color: var(--color-error); }

@keyframes tb-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes tb-pop {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 768px) {
  .tb-modal-body,
  .tb-modal.is-s .tb-modal-body,
  .tb-modal.is-m .tb-modal-body,
  .tb-modal.is-l .tb-modal-body,
  .tb-modal.is-xl .tb-modal-body {
    width: 100%;
    max-width: 100%;
    height: 100%;
    max-height: 100%;
    margin: 0;
    border-radius: 0;
  }
  .tb-modal-foot { padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px)); }
}
@media (prefers-reduced-motion: reduce) {
  .tb-modal-mask,
  .tb-modal-body { animation: none; }
}
</style>

<style>
/* 面板打开时锁定背景滚动（作用于 body，故此处不用 scoped） */
body.tb-lock { overflow: hidden; }
</style>
