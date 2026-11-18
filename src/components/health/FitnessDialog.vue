<script setup lang="ts">
/**
 * 健身动作详情弹框：结构对齐 RecipeDialog——头部标题 / 可滚动内容 / 底部关闭。
 * 外壳走全站唯一基类 BaseDialog（UI 规范 §2.2）。
 * 内容分段：教学图 → 目标肌群 → 动作要点 → 常见错误 → 安全提示 → 训练组次。
 */
import { computed, reactive, ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { DIALOG_BTN } from '@/config/dialogText'
import { fitnessImage, fitnessStepImage, type FitnessMove } from './fitnessData'

const props = defineProps<{ move: FitnessMove }>()
const emit = defineEmits<{ close: [] }>()

const failed = ref(false)
const imgSrc = computed(() => fitnessImage(props.move.id))

/** 分解图缺失时不占位：两张都失败就整段隐藏 */
const stepBroken = reactive<Record<number, boolean>>({})
const showSteps = computed(() => !(stepBroken[1] && stepBroken[2]))
const STEP_LABELS: Record<number, string> = { 1: '起始位', 2: '动作中段' }
</script>

<template>
  <BaseDialog
    :width="'640px'"
    :max-height="'88vh'"
    data-testid="fitness-dialog"
    @close="emit('close')"
  >
    <template #title>
      <span aria-hidden="true">{{ move.emoji }}</span>
      <span>{{ move.name }}</span>
    </template>

    <div class="fit-detail">
      <!-- 教学图：真实示范照 + 目标肌群中文标注（主要橙 / 辅助蓝） -->
      <div class="fit-figure">
        <img
          v-if="!failed"
          :src="imgSrc"
          :alt="move.name + ' 标准动作示范与目标肌群标注'"
          loading="lazy"
          decoding="async"
          @error="failed = true"
        />
        <span v-else class="fit-figure-fallback" aria-hidden="true">{{ move.emoji }}</span>
      </div>

      <!-- 目标肌群：一眼可见 -->
      <div class="fit-hero-meta">
        <span>{{ move.part }}</span>
        <span>{{ move.equipment }}</span>
        <span>{{ move.difficulty }}</span>
      </div>
      <div class="fit-target">
        <strong>练哪里：</strong>{{ move.target }}
      </div>

      <!-- 1. 动作分解：起始位 → 动作中段（主图为发力位） -->
      <section v-if="showSteps" class="fit-section">
        <h3>动作分解</h3>
        <div class="fit-step-grid">
          <figure v-for="n in 2" :key="n" class="fit-step-item">
            <img
              v-if="!stepBroken[n]"
              :src="fitnessStepImage(move.id, n === 1 ? 1 : 2)"
              :alt="move.name + ' ' + STEP_LABELS[n]"
              loading="lazy"
              decoding="async"
              @error="stepBroken[n] = true"
            />
          </figure>
        </div>
      </section>

      <!-- 2. 动作要点 -->
      <section class="fit-section">
        <h3>动作要点</h3>
        <ol class="fit-steps">
          <li v-for="(step, i) in move.keyPoints" :key="i">
            <span class="fit-step-no">{{ i + 1 }}</span>
            <span>{{ step }}</span>
          </li>
        </ol>
      </section>

      <!-- 3. 常见错误 -->
      <section class="fit-section">
        <h3>常见错误</h3>
        <ul class="fit-list is-error">
          <li v-for="item in move.mistakes" :key="item">{{ item }}</li>
        </ul>
      </section>

      <!-- 4. 安全提示 -->
      <section class="fit-section">
        <h3>安全提示</h3>
        <ul class="fit-list is-safety">
          <li v-for="item in move.safety" :key="item">{{ item }}</li>
        </ul>
        <p class="fit-disclaimer">家庭训练参考，非医疗建议；如有伤病史请咨询专业人士。</p>
      </section>

      <!-- 5. 训练组次 -->
      <section class="fit-section">
        <h3>训练组次</h3>
        <p class="fit-sets">📋 {{ move.sets }}</p>
      </section>
    </div>

    <template #footer>
      <button type="button" class="btn-cancel" @click="emit('close')">{{ DIALOG_BTN.close }}</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.fit-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.fit-figure {
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-hover);
}
.fit-figure img {
  display: block;
  width: 100%;
  max-height: 46vh;
  object-fit: contain;
}
.fit-figure-fallback {
  padding: var(--space-6) 0;
  font-size: var(--fs-hero);
  line-height: 1;
}
.fit-hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: var(--fs-caption);
  color: var(--color-text-secondary);
}
.fit-hero-meta span {
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  background: var(--color-bg-hover);
  border: 1px solid var(--color-border);
}
.fit-target {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-warning);
  border-left-width: 3px;
  background: var(--color-warning-soft);
  color: var(--color-warning-text);
  font-size: var(--fs-body);
  margin-top: calc(-1 * var(--space-2));
}

.fit-step-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}
.fit-step-item {
  margin: 0;
  overflow: hidden;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-hover);
}
.fit-step-item img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.fit-section h3 {
  margin: 0 0 var(--space-2);
  font-size: var(--fs-title);
  color: var(--color-text);
}
.fit-steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.fit-steps li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: var(--fs-body);
  line-height: var(--line-height-base);
}
.fit-step-no {
  display: grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 2px;
  border-radius: 50%;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--color-primary-text);
  background: var(--color-primary-soft);
}
.fit-list {
  margin: 0;
  padding-left: 20px;
  font-size: var(--fs-body);
  line-height: var(--line-height-base);
}
.fit-list.is-error li::marker { color: var(--color-error); }
.fit-list.is-safety li::marker { color: var(--color-warning); }
.fit-disclaimer {
  margin: var(--space-2) 0 0;
  font-size: var(--fs-caption);
  color: var(--color-text-muted);
}
.fit-sets {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-bg-hover);
  font-size: var(--fs-body);
  color: var(--color-text);
}
</style>
