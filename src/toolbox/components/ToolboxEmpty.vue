<script setup lang="ts">
/**
 * 空状态 / 异常状态：按 kind 渲染文案与操作。
 * kind: no-result（无搜索结果）| no-fav（无收藏）| no-recent（无最近使用）| empty（无任何工具）
 */
const props = defineProps<{
  kind: 'no-result' | 'no-fav' | 'no-recent' | 'empty'
  keyword?: string
}>()

const emit = defineEmits<{
  (e: 'reset'): void
}>()

const COPY = {
  'no-result': { icon: '🔍', action: '清空筛选条件' },
  'no-fav': { icon: '☆', action: '' },
  'no-recent': { icon: '🕘', action: '' },
  empty: { icon: '🧰', action: '' }
} as const
</script>

<template>
  <div class="tb-empty" data-testid="tb-empty" :data-kind="props.kind">
    <span class="tb-empty-icon" aria-hidden="true">{{ COPY[props.kind].icon }}</span>
    <p v-if="props.kind === 'no-result'">
      没有找到匹配的工具<template v-if="props.keyword">：<span class="tb-empty-kw">{{ props.keyword }}</span></template>
    </p>
    <p v-else-if="props.kind === 'no-fav'">还没有收藏的工具<br />点击任意卡片右上角的 ☆ 即可加入常用</p>
    <p v-else-if="props.kind === 'no-recent'">最近还没有使用过工具</p>
    <p v-else>工具箱暂无工具<br />在 <code>tools/</code> 下新增一个工具目录即可显示</p>

    <button
      v-if="COPY[props.kind].action"
      type="button"
      class="tb-empty-btn"
      data-testid="tb-empty-reset"
      @click="emit('reset')"
    >{{ COPY[props.kind].action }}</button>
  </div>
</template>

<style scoped>
.tb-empty {
  text-align: center;
  padding: clamp(28px, 6vw, 48px) 16px;
  color: var(--color-text-secondary);
  background: var(--color-bg-card);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
}
.tb-empty-icon { font-size: 32px; display: block; margin-bottom: 10px; opacity: .8; }
.tb-empty p { margin: 0 0 12px; font-size: 14px; }
.tb-empty-kw { color: var(--color-primary); font-weight: 600; }
.tb-empty code {
  background: var(--color-bg-hover);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
}
.tb-empty-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 8px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-primary);
  background: transparent;
  color: var(--color-primary);
  font-size: 13px;
  transition: background-color var(--motion-duration) var(--motion-ease),
    color var(--motion-duration) var(--motion-ease);
}
.tb-empty-btn:hover { background: var(--color-primary); color: #fff; }
</style>
