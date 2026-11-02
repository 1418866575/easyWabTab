<script setup lang="ts">
/**
 * BaseTabs —— 全站统一标签页（父标签页）
 *
 * 视觉蓝本：个人工作台 → 健康管理（原 .hd-tabs），
 * 亮/暗三态：白底描边 → hover 换底色 + 主色字 → 选中主色浅底 + 主色字 + 600。
 *
 * 用法：
 *   <BaseTabs v-model="active" :items="tabs" testid="xx-tab" />
 *   items: [{ value: 'a', label: '甲', icon: 'exercise' }, ...]
 *
 * 兼容既有数据：数组字段不是 value/label 时用 value-field / label-field 指定
 *   <BaseTabs v-model="activeTypeTab" :items="TYPE_TABS" value-field="key" />
 *
 * ⚠ 不要再自建 `*-tabs` / `*-tab` 皮肤（见 docs/UI_STYLE_GUIDE.md §2.7）。
 */
import Icon from '@/components/Icon.vue'

type TabItem = Record<string, unknown>

const props = withDefaults(
  defineProps<{
    /** 当前选中值 */
    modelValue: string
    /** 标签数据数组 */
    items: readonly TabItem[]
    /** items 里取值/取文案/取图标的字段名 */
    valueField?: string
    labelField?: string
    iconField?: string
    /** 图片图标（URL / dataURI）字段名：优先级最高 */
    imageField?: string
    /** 文本图标（emoji）字段名：有值时优先于 icon（SVG 名） */
    emojiField?: string
    /** nd-item 右侧计数（字段名），无则不显示 */
    badgeField?: string
    /** items 里自带 data-testid 的字段名（优先于 testid + value 生成的） */
    testidField?: string
    /** data-testid 前缀，会生成 `${testid}-${value}` */
    testid?: string
    /** 允许再次点击已选中项取消选中（emit ''）。默认单选不可取消 */
    deselectable?: boolean
  }>(),
  {
    valueField: 'value',
    labelField: 'label',
    iconField: 'icon',
    imageField: 'image',
    emojiField: 'emoji',
    badgeField: 'badge',
    testidField: 'testid',
    testid: '',
    deselectable: false
  }
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function valueOf(item: TabItem): string {
  return String(item[props.valueField] ?? '')
}
function labelOf(item: TabItem): string {
  return String(item[props.labelField] ?? '')
}
function iconOf(item: TabItem): string {
  const v = item[props.iconField]
  return typeof v === 'string' ? v : ''
}
function badgeOf(item: TabItem): string {
  const v = item[props.badgeField]
  return v === undefined || v === null || v === '' ? '' : String(v)
}
function imageOf(item: TabItem): string {
  const v = item[props.imageField]
  return typeof v === 'string' ? v : ''
}
function emojiOf(item: TabItem): string {
  const v = item[props.emojiField]
  return typeof v === 'string' ? v : ''
}
/** 可取消模式下，再次点击当前项 → 清空选择 */
function onTabClick(v: string): void {
  if (props.deselectable && v === props.modelValue) emit('update:modelValue', '')
}
function testidOf(item: TabItem): string | undefined {
  const custom = item[props.testidField]
  if (typeof custom === 'string' && custom) return custom
  return props.testid ? `${props.testid}-${valueOf(item)}` : undefined
}
</script>

<template>
  <div class="ui-tabs">
    <el-radio-group
      :model-value="modelValue"
      size="small"
      @update:model-value="emit('update:modelValue', String($event))"
    >
      <el-radio-button
        v-for="item in items"
        :key="valueOf(item)"
        :value="valueOf(item)"
        :data-testid="testidOf(item)"
        @click="onTabClick(valueOf(item))"
      >
        <img v-if="imageOf(item)" :src="imageOf(item)" class="ui-tab-img" alt="" />
        <span v-else-if="emojiOf(item)" class="ui-tab-emoji">{{ emojiOf(item) }}</span>
        <span v-else-if="iconOf(item)" class="ui-tab-icon"><Icon :name="iconOf(item)" /></span>
        <span class="ui-tab-label">{{ labelOf(item) }}</span>
        <span v-if="badgeOf(item)" class="ui-tab-badge">{{ badgeOf(item) }}</span>
      </el-radio-button>
    </el-radio-group>
  </div>
</template>

<style scoped>
/* 容器：允许换行，页签之间 8px 间距 */
.ui-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ui-tabs :deep(.el-radio-group) {
  flex-wrap: wrap;
  gap: 8px;
}

/* EP 默认给相邻按钮加 margin-left，这里用 gap 统一控制 */
.ui-tabs :deep(.el-radio-button + .el-radio-button) {
  margin-left: 0;
}

/* 单块页签：白底 + 常规描边 + 次要文字色 */
.ui-tabs :deep(.el-radio-button__inner) {display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  /* 2026-11 按钮统一：12px 字（原 14px） */
  font-size: 12px;
  box-shadow: none;
  transition:
    background-color var(--motion-duration, 0.15s) var(--motion-ease, ease),
    border-color var(--motion-duration, 0.15s) var(--motion-ease, ease),
    color var(--motion-duration, 0.15s) var(--motion-ease, ease);
  height: 36px;}

.ui-tab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* 图片图标（自定义上传的分类图标） */
.ui-tab-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

/* 文本图标（emoji）：字号跟随文字，不用 SVG */
.ui-tab-emoji {
  font-size: 15px;
  line-height: 1;
}

.ui-tab-badge {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.ui-tabs :deep(.el-radio-button__inner:hover) {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
}

.ui-tabs :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  font-weight: var(--font-weight-semibold, 600);
}

.ui-tabs :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner .ui-tab-badge) {
  color: var(--color-primary, #3b82f6);
}

/* 暗色三态 */
html.dark .ui-tabs :deep(.el-radio-button__inner) {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .ui-tabs :deep(.el-radio-button__inner:hover) {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #f9fafb);
}

html.dark .ui-tabs :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: #1e3a5f;
  color: #60a5fa;
  border-color: #60a5fa;
}
</style>
