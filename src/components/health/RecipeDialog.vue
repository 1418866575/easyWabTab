<script setup lang="ts">
/**
 * 菜谱详情弹框：结构对齐工具箱 tb-modal（头部图标+标题 / 可滚动内容 / 底部关闭），
 * 但外壳必须走全站唯一基类 BaseDialog（UI 规范 §2.2），不复制 tb-modal 的遮罩实现。
 * 内容固定四段：成品图 → 食材 → 做法 → 注意事项（含有毒/无毒结论与过敏原）。
 */
import BaseDialog from '@/components/common/BaseDialog.vue'
import { DIALOG_BTN } from '@/config/dialogText'
import { RECIPE_SERVINGS, SAFETY_HINT, SAFETY_LABEL, type Recipe } from './recipeData'

defineProps<{ recipe: Recipe }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <BaseDialog
    :width="'720px'"
    :max-height="'88vh'"
    data-testid="recipe-dialog"
    @close="emit('close')"
  >
    <template #title>
      <span aria-hidden="true">{{ recipe.emoji }}</span>
      <span>{{ recipe.name }}</span>
    </template>

    <div class="recipe-detail">
      <!-- 1. 成品图片 -->
      <h3 class="recipe-hero-title">成品图</h3>
      <img class="recipe-hero" :src="recipe.image" :alt="recipe.name + ' 成品图'" />
      <div class="recipe-meta">
        <span>{{ recipe.category }}</span>
        <span>⏱ {{ recipe.time }}</span>
        <span>{{ recipe.difficulty }}</span>
        <span>{{ RECIPE_SERVINGS }}</span>
      </div>

      <!-- 食品安全结论：一眼可见，详细风险在第 4 段 -->
      <div class="recipe-safety-banner" :class="'is-' + recipe.safety.level">
        <div class="recipe-safety-head">
          <span class="recipe-safety-tag">{{ SAFETY_LABEL[recipe.safety.level] }}</span>
          <strong>{{ recipe.safety.toxicity }}</strong>
        </div>
        <p>{{ SAFETY_HINT[recipe.safety.level] }}</p>
      </div>

      <!-- 2. 食材 -->
      <section class="recipe-section">
        <h3>食材</h3>
        <h4>主料</h4>
        <ul class="recipe-chip-list">
          <li v-for="item in recipe.ingredients" :key="item">{{ item }}</li>
        </ul>
        <h4>调料 / 腌料 / 碗汁</h4>
        <ul class="recipe-chip-list">
          <li v-for="item in recipe.seasonings" :key="item">{{ item }}</li>
        </ul>
      </section>

      <!-- 3. 做法 -->
      <section class="recipe-section">
        <h3>做法</h3>
        <ol class="recipe-steps">
          <li v-for="(step, i) in recipe.steps" :key="i">
            <span class="recipe-step-no">{{ i + 1 }}</span>
            <span>{{ step }}</span>
          </li>
        </ol>
        <div class="recipe-tips">
          <h4>小妙招</h4>
          <ul>
            <li v-for="tip in recipe.tips" :key="tip">{{ tip }}</li>
          </ul>
        </div>
      </section>

      <!-- 4. 注意事项 -->
      <section class="recipe-section">
        <h3>注意事项 · 食品安全</h3>
        <ul class="recipe-hazards">
          <li v-for="hazard in recipe.safety.hazards" :key="hazard">{{ hazard }}</li>
        </ul>
        <p class="recipe-allergens">
          <strong>常见过敏原：</strong>
          <template v-if="recipe.allergens.length">{{ recipe.allergens.join('、') }}</template>
          <template v-else>无明显常见过敏原（仍请按实际配料表核对）</template>
        </p>
        <p class="recipe-source">内容整理自 {{ recipe.source }}；成品图来自原文配图。仅供家庭烹饪参考，特殊人群请遵医嘱。</p>
      </section>
    </div>

    <template #footer>
      <button type="button" class="btn-cancel" @click="emit('close')">{{ DIALOG_BTN.close }}</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.recipe-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* 1. 成品图：cover 填满横幅，原文白底方图的留白被裁掉，菜品更醒目 */
.recipe-hero {
  display: block;
  width: 100%;
  height: 300px;
  object-fit: cover;
  object-position: center;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-hover);
}
.recipe-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  font-size: var(--fs-caption);
  color: var(--color-text-secondary);
  margin-top: calc(-1 * var(--space-3));
}

/* 食品安全横幅 */
.recipe-safety-banner {
  padding: var(--space-3) var(--space-4);
  border: 1px solid transparent;
  border-left-width: 3px;
  border-radius: var(--radius-md);
}
.recipe-safety-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: var(--fs-body);
}
.recipe-safety-tag {
  flex: none;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--fs-caption);
  font-weight: 600;
  border: 1px solid transparent;
}
.recipe-safety-banner p {
  margin: var(--space-2) 0 0;
  font-size: var(--fs-caption);
  line-height: var(--line-height-relaxed);
}
.recipe-safety-banner.is-safe {
  background: var(--color-success-soft);
  border-color: var(--color-success);
  color: var(--color-success-text);
}
.recipe-safety-banner.is-safe .recipe-safety-tag {
  background: var(--color-bg-card);
  border-color: var(--color-success);
}
.recipe-safety-banner.is-caution {
  background: var(--color-warning-soft);
  border-color: var(--color-warning);
  color: var(--color-warning-text);
}
.recipe-safety-banner.is-caution .recipe-safety-tag {
  background: var(--color-bg-card);
  border-color: var(--color-warning);
}
.recipe-safety-banner.is-danger {
  background: var(--color-error-soft);
  border-color: var(--color-error);
  color: var(--color-error-text);
}
.recipe-safety-banner.is-danger .recipe-safety-tag {
  background: var(--color-bg-card);
  border-color: var(--color-error);
}

/* 分段标题：沿用工作台卡片标题的 4px 主色竖条语言 */
.recipe-section h3,
.recipe-hero-title {
  margin: 0 0 var(--space-3);
  padding-left: var(--space-2);
  border-left: 4px solid var(--color-primary);
  font-size: var(--fs-title);
  font-weight: 600;
  color: var(--color-text);
}
.recipe-hero-title { margin-bottom: 0; }
.recipe-section h4 {
  margin: var(--space-3) 0 var(--space-2);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
}

/* 食材 chips */
.recipe-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.recipe-chip-list li {
  padding: var(--space-1) var(--space-2);
  font-size: var(--fs-caption);
  color: var(--color-text);
  background: var(--color-bg-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

/* 做法编号列表 */
.recipe-steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.recipe-steps li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  font-size: var(--fs-body);
  line-height: var(--line-height-relaxed);
  color: var(--color-text);
}
.recipe-step-no {
  flex: none;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-full);
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--color-primary-text);
  background: var(--color-primary-soft);
  border: 1px solid var(--color-primary);
}

/* 小妙招 / 注意事项 */
.recipe-tips {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-bg-hover);
  border: 1px solid var(--color-border);
}
.recipe-tips h4 { margin-top: 0; }
.recipe-tips ul,
.recipe-hazards {
  margin: 0;
  padding-left: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--fs-sm);
  line-height: var(--line-height-relaxed);
  color: var(--color-text-secondary);
}
.recipe-hazards {
  color: var(--color-text);
}
.recipe-allergens {
  margin: var(--space-4) 0 0;
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}
.recipe-allergens strong { color: var(--color-text); }
.recipe-source {
  margin: var(--space-2) 0 0;
  font-size: var(--fs-caption);
  line-height: var(--line-height-relaxed);
  color: var(--color-text-muted);
}

@media (max-width: 768px) {
  .recipe-hero { height: 200px; }
  .recipe-detail { gap: var(--space-4); }
}
</style>
