<script setup lang="ts">
/**
 * 菜谱卡片：保留工具箱 ToolboxCard 的元素构成（成品图 + 名称 + 分类胶囊 + 底部信息 + hover 上浮），
 * 排布为「大图在上、名称在下」，分类胶囊与名称同行靠右——菜名与菜品图是本页的主角。
 * 卡面本身复用全局 .ui-card，不复制第二套边框/阴影规则。
 */
import { SAFETY_LABEL, type Recipe } from './recipeData'

defineProps<{ recipe: Recipe }>()
const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <button
    type="button"
    class="ui-card recipe-card"
    :data-testid="'recipe-card-' + recipe.id"
    :aria-label="'查看菜谱详情：' + recipe.name"
    @click="emit('open')"
  >
    <span class="recipe-media">
      <img class="recipe-thumb" :src="recipe.image" :alt="recipe.name" loading="lazy" />
    </span>

    <span class="recipe-body">
      <span class="recipe-head">
        <span class="recipe-name">{{ recipe.name }}</span>
        <span class="recipe-cat">{{ recipe.category }}</span>
      </span>
      <span class="recipe-foot">
        <span class="recipe-time">⏱ {{ recipe.time }}</span>
        <span class="recipe-safety" :class="'is-' + recipe.safety.level">{{ SAFETY_LABEL[recipe.safety.level] }}</span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.recipe-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  text-align: left;
  font-family: var(--font-family);
  z-index: 0;
  transition: transform var(--motion-duration) var(--motion-ease),
    box-shadow var(--motion-duration) var(--motion-ease),
    border-color var(--motion-duration) var(--motion-ease);
}
.recipe-card:hover { z-index: 2; transform: translateY(-2px); }

/* 成品图铺满卡片顶部：原文白底方图的上下留白被裁掉，菜品放到最大 */
.recipe-media { position: relative; display: block; flex: none; }
.recipe-thumb {
  display: block;
  width: 100%;
  height: 140px;
  object-fit: cover;
  object-position: center;
  background: var(--color-bg-hover);
}

/* 分类胶囊与菜名同行靠右：卡面底 + 主色字 + 描边；窄屏放不下时自动换行到右侧 */
.recipe-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}
.recipe-cat {
  flex: none;
  margin-left: auto;
  padding: 2px var(--space-2);
  font-size: var(--fs-caption);
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-primary-text);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recipe-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
}
/* 菜名加到 18px 并允许两行，长名（豆角炒肉（四季豆））不再被挤成省略号 */
.recipe-name {
  font-size: var(--fs-title);
  font-weight: 600;
  line-height: var(--line-height-tight);
  color: var(--color-text);
  flex: 1 1 auto;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-width: 0;
}

.recipe-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-top: auto;
  font-size: var(--fs-caption);
}
/* 窄屏卡片放不下「⏱ 25 分钟（含腌制）」+ 徽章：时间省略、徽章整块换行，不裁字 */
.recipe-time {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.recipe-safety {
  flex: none;
  margin-left: auto;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  font-weight: 600;
  white-space: nowrap;
}
.recipe-safety.is-safe {
  color: var(--color-success-text);
  background: var(--color-success-soft);
  border-color: var(--color-success);
}
.recipe-safety.is-caution {
  color: var(--color-warning-text);
  background: var(--color-warning-soft);
  border-color: var(--color-warning);
}
.recipe-safety.is-danger {
  color: var(--color-error-text);
  background: var(--color-error-soft);
  border-color: var(--color-error);
}

@media (max-width: 768px) {
  .recipe-thumb { height: 110px; }
}
@media (prefers-reduced-motion: reduce) {
  .recipe-card, .recipe-card:hover { transform: none; }
}
</style>
