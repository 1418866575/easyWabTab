<script setup lang="ts">
/**
 * 健康工作台 · 健身动作列表页
 * 结构与 HealthRecipes 对齐：部位页签 → 卡片网格 → 点击弹框。
 * 页面滚动交给 HealthView 的 .wb-content（唯一滚动容器），本组件不自建滚动区。
 */
import { computed, ref } from 'vue'
import BaseTabs from '@/components/common/BaseTabs.vue'
import FitnessCard from './FitnessCard.vue'
import FitnessDialog from './FitnessDialog.vue'
import { FITNESS_MOVES, FITNESS_PARTS, type FitnessMove } from './fitnessData'

const category = ref('')
const activeMove = ref<FitnessMove | null>(null)

const tabs = computed(() => [
  { value: '', label: '全部', emoji: '📋', badge: FITNESS_MOVES.length, testid: 'fitness-tab-all' },
  ...FITNESS_PARTS.map((part) => ({
    value: part,
    label: part,
    emoji: part === '胸' ? '🫀' : part === '背' ? '🔙' : part === '腿' ? '🦵' : part === '肩' ? '🙌' : part === '手臂' ? '💪' : part === '核心' ? '🎯' : '⭐',
    badge: FITNESS_MOVES.filter((m) => m.part === part).length,
    testid: 'fitness-tab-' + part
  }))
])

const filtered = computed(() =>
  category.value
    ? FITNESS_MOVES.filter((m) => m.part === category.value)
    : FITNESS_MOVES
)
</script>

<template>
  <div class="fitness-page">
    <BaseTabs v-model="category" :items="tabs" testid="fitness-tab" />

    <p class="fitness-count">共 {{ filtered.length }} 个动作 · 点击卡片查看动作要点与安全提示</p>

    <div class="fitness-grid" data-testid="fitness-grid">
      <FitnessCard
        v-for="move in filtered"
        :key="move.id"
        :move="move"
        @open="activeMove = move"
      />
    </div>

    <FitnessDialog
      v-if="activeMove"
      :move="activeMove"
      @close="activeMove = null"
    />
  </div>
</template>

<style scoped>
.fitness-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
}
.fitness-count {
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--color-text-muted);
}
.fitness-grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
}

@media (max-width: 768px) {
  .fitness-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
}
@media (max-width: 359px) {
  .fitness-grid { grid-template-columns: 1fr; }
}
</style>
