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

// 根节点可能是 Teleport（teleport 态），透传 attrs（class/style 等）需手动落到 overlay 元素
defineOptions({ inheritAttrs: false })

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
    /** 全屏模式：面板铺满视口、无圆角无阴影（遮罩内边距一并归零） */
    fullscreen?: boolean
    /** ESC 是否触发关闭，默认 true。需自定义 ESC 分层行为（如全屏先退出）时置 false 并自行处理 */
    closeOnEscape?: boolean
    /** 点击遮罩是否关闭，默认 true */
    closeOnOverlay?: boolean
    /**
     * 自定义遮罩层级；不传则用 CSS 默认 300。
     * 需要盖在 el-dialog 之上时必须传：el-dialog 用 Element Plus 的动态层级（2000 起，每次弹出递增），
     * 而本弹框默认固定 300 —— 从 el-dialog 内部弹出时会被压在后面（如进货编辑弹框内点「移除」的确认框）。
     * 传入值应取 `nextZIndex()`（见 ConfirmHost）。
     */
    zIndex?: number
    /**
     * Teleport 到 body（仅非 embedded 态生效）。
     * 适用场景：从另一个弹框（如设置弹窗）内部弹出的独立遮罩弹框——若留在父弹框 DOM 里，
     * 父弹框作用域内的 `:deep(.bd-body)` 等后代选择器会泄漏命中嵌套弹框的内部结构
     * （曾致设置 → 分类管理的图标弹框 body 被强设 overflow:hidden 而无法滚动）。
     * Teleport 后脱离父弹框 DOM 子树，作用域规则与层叠上下文都不再相互影响。
     */
    teleport?: boolean
    /**
     * body 布局：
     * - default：基类默认（24px 内边距 + 自身纵向滚动），适合普通表单弹框。
     * - flex-column：归零内边距、改为纵向 flex 且禁止自身滚动，供「左侧导航 + 右侧内容」
     *   两栏各自管理滚动的弹窗使用（设置页 / 智能工作台设置 / 博客设置）。
     *
     * ⚠ 不能由调用方用 `.xxx-dialog :deep(.bd-body)` 覆盖实现：BaseDialog 根节点是 Teleport，
     *   Vue 不会把父组件 scope id 打到子组件根节点，`[data-v-父]` 那一半选择器永远匹配不到
     *   （曾致上述三个设置弹窗的左右栏退化为「整个 body 一起滚」）。
     */
    bodyLayout?: 'default' | 'flex-column'
  }>(),
  {
    title: '',
    width: '480px',
    maxHeight: '80vh',
    embedded: false,
    hideHeader: false,
    fullscreen: false,
    closeOnEscape: true,
    closeOnOverlay: true,
    zIndex: undefined,
    teleport: false,
    bodyLayout: 'default'
  }
)

const emit = defineEmits<{ close: [] }>()

function close() {
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.closeOnEscape) {
    e.preventDefault()
    close()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// 面板内联尺寸（宽度/高度由 props 驱动；embedded / fullscreen 下由 CSS 类接管）
const panelStyle = computed(() =>
  props.embedded || props.fullscreen ? {} : { maxWidth: props.width, maxHeight: props.maxHeight }
)

// 遮罩层级：仅显式传入时覆盖 CSS 默认 300（embedded 无固定定位，不受影响）
const overlayStyle = computed(() => (props.zIndex ? { zIndex: props.zIndex } : {}))
</script>

<template>
  <!-- teleport：独立遮罩弹框挂到 body（embedded/未开启时 disabled 原地渲染，行为不变） -->
  <Teleport to="body" :disabled="embedded || !teleport">
    <div
      v-bind="$attrs"
      :class="[
        embedded ? 'bd-inline' : 'bd-overlay',
        { 'bd-overlay--fullscreen': fullscreen && !embedded }
      ]"
      :style="overlayStyle"
      @click.self="!embedded && closeOnOverlay && close()"
    >
      <div
        class="bd-panel"
        :class="{ 'bd-panel--embedded': embedded, 'bd-panel--fullscreen': fullscreen && !embedded }"
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
            <div class="bd-header-actions">
              <!-- 头部附加操作（如全屏切换）；置于关闭按钮左侧 -->
              <slot name="header-actions" />
              <button class="close-btn" type="button" aria-label="关闭" @click="close">
                <Icon name="close" />
              </button>
            </div>
          </header>

          <div class="bd-body" :class="{ 'bd-body--flex-column': bodyLayout === 'flex-column' }">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="bd-footer">
            <slot name="footer" />
          </footer>
        </slot>
      </div>
    </div>
  </Teleport>
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
  /* 嵌入态是「父弹框里的一块流式内容」：高度必须完全交给内容，滚动由父级容器负责。
     这里必须显式解除基类 .bd-panel 的 overflow:hidden 与移动端 max-height:92vh ——
     否则内容会被裁到 92vh，父级滚动容器只能滚「被裁剪后的高度」，
     表现为「能滑一部分但永远滑不到底」（销售记账设置 → 支出产品管理即此问题：
     实测内容 1269px，面板被裁到 611px，父容器最大只能滚 286px）。 */
  overflow: visible;
  height: auto;
  max-height: none;
}

/* 嵌入态的正文同样不参与滚动：随内容增高，完整交给父级滚动容器 */
.bd-panel--embedded .bd-body {
  overflow: visible;
  flex: 0 0 auto;
}

/* ===== 全屏模式：遮罩内边距归零 + 面板铺满视口 ===== */
.bd-overlay--fullscreen {
  padding: 0;
}
.bd-panel--fullscreen {
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  border: none;
  border-radius: 0;
  box-shadow: none;
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
.bd-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
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

/* 两栏各自滚动的弹窗（bodyLayout="flex-column"）：归零内边距、改纵向 flex、禁止自身滚动，
   由调用方内部的 .manager-body / .ss-layout / .bsd-body 撑满并各自管理滚动。
   由基类自己声明而非调用方 :deep 覆盖，原因见 props.bodyLayout 注释。 */
.bd-body--flex-column {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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
  /* 嵌入态不受「移动端限高 92vh」约束：它只是父弹框里的一段内容，
     限高会把内容裁掉、父级滚不到底（见上方 .bd-panel--embedded 注释）。
     媒体查询不提升特异性，故必须在本块内再覆盖一次，否则会被上面的 .bd-panel 规则盖回。 */
  .bd-panel--embedded {
    max-height: none;
  }
  .bd-header {
    padding: var(--space-4, 16px);
  }
  .bd-body {
    padding: var(--space-4, 16px);
  }
  /* 媒体查询不提升特异性：flex-column 的内边距归零必须在此再覆盖一次，否则会被上面的 .bd-body 盖回 */
  .bd-body--flex-column {
    padding: 0;
  }
  .bd-footer {
    padding: var(--space-3, 12px) var(--space-4, 16px);
  }
}
</style>
