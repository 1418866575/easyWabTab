<script setup lang="ts">
// 工作台内联 SVG 图标组件：内部 name → path 查表渲染，fill=currentColor 跟随主题（暗色自动继承）。
// 未知 name 渲染空（v-if 兜底，不占位不抛错）。path 数据为 Material Design Icons (Apache-2.0) 24x24。
// 无障碍：传入 label 时视为有意义的图标（role=img + aria-label）；否则纯装饰（aria-hidden）。
// 尺寸 token：默认 16，可用 class 透传配合 .icon-xs/.icon-sm/.icon-lg 工具类统一控制（见 src/style.css）。
import { computed } from 'vue'
import { ICON_PATHS } from './iconPaths'

const props = withDefaults(defineProps<{ name: string; size?: number; label?: string }>(), {
  size: 16,
  label: ''
})


const iconPath = computed<string | undefined>(() => ICON_PATHS[props.name])
// 装饰性图标（无 label）对读屏隐藏；有意义图标暴露 role=img + aria-label
const a11yRole = computed(() => (props.label ? 'img' : undefined))
const a11yLabel = computed(() => (props.label ? props.label : undefined))
const a11yHidden = computed(() => (props.label ? undefined : 'true'))
</script>

<template>
  <svg
    v-if="iconPath"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    :role="a11yRole"
    :aria-label="a11yLabel"
    :aria-hidden="a11yHidden"
  >
    <path :d="iconPath" />
  </svg>
</template>
