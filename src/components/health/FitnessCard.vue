<script setup lang="ts">
/**
 * 健身动作卡片：与 RecipeCard 同构——教学图在上、动作名与部位胶囊同行在下。
 * 卡面复用全局 .ui-card，不复制第二套边框/阴影规则。
 * 教学图加载失败时回退到 emoji 色块，不留空白。
 */
import { computed, ref } from 'vue'
import { fitnessImage, type FitnessMove } from './fitnessData'

const props = defineProps<{ move: FitnessMove }>()
const emit = defineEmits<{ open: [] }>()

const failed = ref(false)
const imgSrc = computed(() => fitnessImage(props.move.id))
</script>

<template>
  <button
    type="button"
    class="ui-card fit-card"
    :data-testid="'fitness-card-' + move.id"
    :aria-label="'查看动作详情：' + move.name"
    @click="emit('open')"
  >
    <span class="fit-media">
      <img
        v-if="!failed"
        class="fit-shot"
        :src="imgSrc"
        :alt="move.name + ' 标准动作示范与目标肌群标注'"
        loading="lazy"
        decoding="async"
        @error="failed = true"
      />
      <span v-else class="fit-emoji" aria-hidden="true">{{ move.emoji }}</span>
    </span>

    <span class="fit-body">
      <span class="fit-head">
        <span class="fit-name">{{ move.name }}</span>
        <span class="fit-part">{{ move.part }}</span>
      </span>
      <span class="fit-meta">
        <span>{{ move.equipment }}</span>
        <span class="fit-diff" :class="'is-' + move.difficulty">{{ move.difficulty }}</span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.fit-card {
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
.fit-card:hover { z-index: 2; transform: translateY(-2px); }

.fit-media {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  /* 方形画框：竖构图与横构图动作图都能完整入框，不裁掉肌群标注。
     图片绝对定位铺满，避免竖构图的固有比例把画框顶高、撑乱整行。 */
  aspect-ratio: 1 / 1;
  background: var(--color-bg-hover);
  border-bottom: 1px solid var(--color-border);
}
.fit-shot {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.fit-emoji { font-size: var(--fs-display); line-height: 1; }

.fit-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}
.fit-part {
  flex: none;
  margin-left: auto;
  padding: 2px var(--space-2);
  font-size: var(--fs-caption);
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-primary-text);
  background: var(--color-primary-soft);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-full);
  white-space: nowrap;
}
.fit-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
}
.fit-name {
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
.fit-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-top: auto;
  font-size: var(--fs-caption);
  color: var(--color-text-muted);
}
.fit-diff {
  flex: none;
  margin-left: auto;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  font-weight: 600;
  white-space: nowrap;
}
.fit-diff.is-初级 {
  color: var(--color-success-text);
  background: var(--color-success-soft);
  border-color: var(--color-success);
}
.fit-diff.is-中级 {
  color: var(--color-warning-text);
  background: var(--color-warning-soft);
  border-color: var(--color-warning);
}

@media (max-width: 768px) {
  .fit-emoji { font-size: var(--fs-title); }
}
@media (prefers-reduced-motion: reduce) {
  .fit-card, .fit-card:hover { transform: none; }
}
</style>
