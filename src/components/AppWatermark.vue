<script setup lang="ts">
/**
 * 工作台水印层（全局单例，挂载于 App.vue）
 *
 * 覆盖范围：**工作台页面（个人/销售/学生/教师），导航站（含工具箱入口所属的导航体验）不显示**。
 * 由父级通过 visible 控制（App.vue 依据当前路由判定）。
 *
 * 三条硬约束：
 * 1. 不影响布局 —— position: fixed，完全脱离文档流，不占位/不撑高/不挤压任何元素
 * 2. 不影响交互 —— pointer-events: none，且 z-index:1 低于顶栏(100)/面板(250)/弹窗(300)
 * 3. 关闭后无残留 —— v-if 判定为 false 时**不渲染任何节点**（非 CSS 隐藏）
 */
import { computed } from 'vue'
import { useAppSettingsStore } from '@/stores/settings'
import { buildWatermarkDataUri, centeredWatermarkText, shouldRenderWatermark } from '@/composables/watermarkCore'
import type { WatermarkParams } from '@/composables/watermarkCore'

/** 导航站不显示水印（需求：工作台全部覆盖，导航站排除） */
const props = defineProps<{ visible: boolean }>()

const store = useAppSettingsStore()

/** 当前水印参数快照（单一来源，避免模板里散落 9 个字段） */
const params = computed<WatermarkParams>(() => ({
  type: store.watermarkType,
  text: store.watermarkText,
  image: store.watermarkImage,
  mode: store.watermarkMode,
  opacity: store.watermarkOpacity,
  fontSize: store.watermarkFontSize,
  rotate: store.watermarkRotate,
  gapX: store.watermarkGapX,
  gapY: store.watermarkGapY
}))

/**
 * 是否渲染：路由可见 + 开关开启 + 内容非空。
 * 三者任一不满足 → false → v-if 不渲染节点，DOM 中彻底无水印元素（无残留）。
 */
const active = computed(() => props.visible && shouldRenderWatermark(params.value, store.watermarkEnabled))

/** 平铺背景图：SVG data URI，一个节点铺满视口且随窗口自适应（无需监听 resize） */
const tileBackground = computed(() => buildWatermarkDataUri(params.value))

/** 居中模式下的文字（图片型无居中语义，仍走平铺背景） */
const centerText = computed(() => centeredWatermarkText(params.value))

/** 居中模式且为文字型时才用 single 渲染 */
const useCenterText = computed(() => active.value && params.value.mode === 'center' && params.value.type === 'text')

const centerStyle = computed(() => ({
  fontSize: `${params.value.fontSize}px`,
  opacity: String(params.value.opacity),
  transform: `rotate(${params.value.rotate}deg)`
}))
</script>

<template>
  <!-- 平铺模式：单节点 background-image 平铺 -->
  <div
    v-if="active && !useCenterText"
    class="app-watermark app-watermark-tile"
    data-testid="app-watermark"
    aria-hidden="true"
    :style="{ backgroundImage: tileBackground }"
  />
  <!-- 居中模式：单条文字居中 -->
  <div v-else-if="useCenterText" class="app-watermark app-watermark-center" data-testid="app-watermark" aria-hidden="true">
    <span class="app-watermark-single" :style="centerStyle">{{ centerText }}</span>
  </div>
</template>

<style scoped>
/*
 * 固定定位铺满视口：inset:0 + 不进文档流 → 对页面布局零影响。
 * z-index:1 —— 高于页面内容(0/1)、远低于顶栏(100)/面板(250)/弹窗(300)，不遮挡任何可交互元素。
 * pointer-events:none —— 鼠标事件穿透，不影响点击/悬停/拖拽。
 */
.app-watermark {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  user-select: none;
}

/* 平铺：SVG 单元格由纯函数按 gapX/gapY 生成，此处仅负责铺满 */
.app-watermark-tile {
  background-repeat: repeat;
  background-position: center;
  background-size: auto;
}

/* 居中：flex 居中放置单条文字 */
.app-watermark-center {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.app-watermark-single {
  color: var(--color-text, #111827);
  font-weight: 500;
  white-space: nowrap;
  line-height: 1.4;
  /* 深色模式下用浅色水印，保证可见性 */
}
</style>
