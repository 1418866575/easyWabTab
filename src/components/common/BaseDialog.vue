<script setup lang="ts">
/**
 * BaseDialog —— 全站统一弹框基类（P0 阶段 0 规范载体）
 *
 * 目标：把此前散落在 ~34 个组件、各自重写 header/footer/overlay/close 的自定义弹框
 * 收敛到本基类，消除双轨道（el-dialog vs 自定义 overlay）与重复实现。
 *
 * 设计蓝本：CountdownModal 的 .manager-overlay/.manager 模式，但全部改走 Design Token，
 * 视觉与 .ui-btn/.close-btn/.ui-card 对齐，暗色与 accent 自动跟随。
 *
 * 用法（默认外壳：header+标题+关闭 / body / footer）：
 *   <BaseDialog title="标题" @close="onClose">
 *     弹框内容
 *     <template #footer>
 *       <button class="btn-cancel" @click="onClose">取消</button>
 *       <button class="btn-submit" @click="onOk">确定</button>
 *     </template>
 *   </BaseDialog>
 *
 * - 完整自定义头部/结构：用 #panel 插槽整体覆盖（此时请自行放置 .close-btn）。
 * - 嵌套在 el-dialog 内的子面板用 `embedded`（不渲染遮罩、不固定定位，随父级流式排布）。
 */
import { computed, onMounted, onUnmounted } from 'vue'
import Icon from '../Icon.vue'

const props = withDefaults(
  defineProps<{
    /** 头部标题（默认外壳中显示，位于 close 按钮左侧） */
    title?: string
    /** 面板最大宽度，默认 480px；可传 '960px' 等 */
    width?: string
    /** 面板最大高度，默认 80vh（embedded 下忽略） */
    maxHeight?: string
    /** 嵌套模式：不渲染遮罩、不固定定位，随父弹框流式排布 */
    embedded?: boolean
    /** 是否隐藏头部。embedded 子面板通常传 true（父弹框已有头部） */
    hideHeader?: boolean
    /** 点击遮罩是否关闭，默认 true */
    closeOnOverlay?: boolean
  }>(),
  {
    title: '',
    width: '480px',
    maxHeight: '80vh',
    embedded: false,
    hideHeader: false,
    closeOnOverlay: true
  }
)

const emit = defineEmits<{ close: [] }>()

function close() {
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// 面板内联尺寸（宽度/高度由 props 驱动；embedded 下由父级决定）
const panelStyle = computed(() =>
  props.embedded ? {} : { maxWidth: props.width, maxHeight: props.maxHeight }
)
</script>

<template>
  <div
    :class="embedded ? 'bd-inline' : 'bd-overlay'"
    @click.self="!embedded && closeOnOverlay && close()"
  >
    <div
      class="bd-panel"
      :class="{ 'bd-panel--embedded': embedded }"
      :style="panelStyle"
      role="dialog"
      :aria-modal="embedded ? undefined : true"
    >
      <!-- 默认外壳；提供 #panel 插槽则整体覆盖 -->
      <slot name="panel" :close="close">
        <header v-if="!hideHeader" class="bd-header">
          <h2 class="bd-title">
            <slot name="title">{{ title }}</slot>
          </h2>
          <button class="close-btn" type="button" aria-label="关闭" @click="close">
            <Icon name="close" />
          </button>
        </header>

        <div class="bd-body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="bd-footer">
          <slot name="footer" />
        </footer>
      </slot>
    </div>
  </div>
</template>

<style scoped>
/* ===== 遮罩（默认）/ 内联容器（embedded） ===== */
.bd-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300; /* 与项目分层一致：app-bar 100 / panels 250 / dialogs 300 */
  padding: var(--space-5, 20px);
}
.bd-inline {
  display: contents;
}

/* ===== 面板 ===== */
.bd-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.15));
  overflow: hidden;
}
.bd-panel--embedded {
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

/* ===== 头部 ===== */
.bd-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-5, 20px) var(--space-6, 24px);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg-card, #ffffff);
  flex-shrink: 0;
}
.bd-title {
  margin: 0;
  font-size: var(--font-size-xl, 18px);
  font-weight: 600;
  color: var(--color-text, #1e293b);
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

/* ===== 主体 ===== */
.bd-body {
  padding: var(--space-6, 24px);
  overflow-y: auto;
  flex: 1;
}

/* ===== 底部 ===== */
.bd-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px) var(--space-6, 24px);
  border-top: 1px solid var(--color-border, #e2e8f0);
  flex-shrink: 0;
}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .bd-overlay {
    padding: var(--space-4, 16px);
  }
  .bd-panel {
    max-height: 92vh;
  }
  .bd-header {
    padding: var(--space-4, 16px);
  }
  .bd-body {
    padding: var(--space-4, 16px);
  }
  .bd-footer {
    padding: var(--space-3, 12px) var(--space-4, 16px);
  }
}
</style>
