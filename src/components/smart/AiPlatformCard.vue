<script setup lang="ts">
/**
 * 智能网页端入口卡片
 * 根元素用 <article role="button">：卡片整体可点开平台，内部还有操作按钮，
 * 用 <button> 做根会造成非法嵌套。
 * 版式：图标在上、名称在下（居中），底部仅保留「编辑 / 删除」；卡片整体点击即打开。
 */
import { computed } from 'vue'
import Icon from '@/components/Icon.vue'
import { platformDisplayIcon } from '@/composables/aiPlatformsCore'
import type { AiPlatform } from '@/types'

const props = defineProps<{ platform: AiPlatform }>()

const emit = defineEmits<{
  open: []
  edit: []
  remove: []
  togglePin: []
}>()

const p = computed(() => props.platform)
const invalid = computed(() => !p.value.url)

/** 图标回落：自定义（图片 / builtin） → 预置语义图标 → 通用链接图标（不用首字母占位） */
const displayIcon = computed(() => platformDisplayIcon(p.value))
const iconKind = computed<'builtin' | 'image'>(() =>
  displayIcon.value.startsWith('builtin:') ? 'builtin' : 'image'
)
const builtinIconName = computed(() => displayIcon.value.replace(/^builtin:/, ''))

function stop(e: Event): void {
  e.stopPropagation()
}
</script>

<template>
  <article
    class="ap-card"
    :class="{ 'is-invalid': invalid, 'is-pinned': p.pinned }"
    role="button"
    tabindex="0"
    :aria-label="`打开 ${p.name}`"
    :data-testid="`ai-platform-card-${p.id}`"
    @click="emit('open')"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <button
      type="button"
      class="ap-pin"
      :class="{ 'is-on': p.pinned }"
      :aria-pressed="p.pinned"
      :title="p.pinned ? '取消置顶' : '置顶'"
      @click="stop($event); emit('togglePin')"
    >
      <Icon name="pin" :size="13" />
    </button>

    <span class="ap-icon" aria-hidden="true">
      <Icon v-if="iconKind === 'builtin'" :name="builtinIconName" :size="22" />
      <img v-else :src="p.icon" alt="" loading="lazy" referrerpolicy="no-referrer" />
    </span>

    <span class="ap-name" :title="p.name">{{ p.name }}</span>

    <p v-if="p.note" class="ap-note">{{ p.note }}</p>
    <p v-if="invalid" class="ap-warn">链接无效，请编辑修正后再打开</p>

    <div class="ap-actions">
      <button type="button" class="ui-btn ui-btn--sm" @click="stop($event); emit('edit')">编辑</button>
      <button type="button" class="ui-btn ui-btn--sm ui-btn--danger" @click="stop($event); emit('remove')">删除</button>
    </div>
  </article>
</template>

<style scoped>
.ap-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 14px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  text-align: center;
  transition:
    transform var(--motion-duration, 220ms) var(--motion-ease, ease),
    box-shadow var(--motion-duration, 220ms) var(--motion-ease, ease),
    border-color var(--motion-duration, 220ms) var(--motion-ease, ease);
}
.ap-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover);
  border-color: var(--color-primary);
}
.ap-card:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
/* 置顶卡左侧加一条主色细边，扫视时能一眼分出来 */
.ap-card.is-pinned {
  border-left: 3px solid var(--color-primary);
}
.ap-card.is-invalid {
  opacity: 0.72;
  cursor: not-allowed;
}

/* 置顶开关：右上角，默认淡显，悬停/聚焦时清晰 */
.ap-pin {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  opacity: 0.45;
  cursor: pointer;
  transition:
    opacity var(--motion-duration, 220ms) var(--motion-ease, ease),
    color var(--motion-duration, 220ms) var(--motion-ease, ease),
    background-color var(--motion-duration, 220ms) var(--motion-ease, ease);
}
.ap-card:hover .ap-pin,
.ap-pin:focus-visible {
  opacity: 1;
}
.ap-pin:hover {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}
.ap-pin.is-on {
  opacity: 1;
  color: var(--color-primary);
}
.ap-pin:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

/* 图标：卡片视觉主体，居中显示 */
.ap-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
  overflow: hidden;
}
.ap-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 名称在图标下方 */
.ap-name {
  max-width: 100%;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ap-note {
  margin: 0;
  max-width: 100%;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ap-warn {
  margin: 0;
  font-size: 12px;
  color: var(--color-error);
}

.ap-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}
</style>
