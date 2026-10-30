<script setup lang="ts">
/**
 * 智能网页端入口卡片
 * 根元素用 <article role="button">：卡片整体可点开平台，内部还有多个操作按钮，
 * 用 <button> 做根会造成非法嵌套。
 */
import { computed } from 'vue'
import Icon from '@/components/Icon.vue'
import type { AiPlatform } from '@/types'

const props = defineProps<{ platform: AiPlatform }>()

const emit = defineEmits<{
  open: []
  edit: []
  remove: []
  togglePin: []
  toggleFavorite: []
  copyLink: []
}>()

const p = computed(() => props.platform)
const invalid = computed(() => !p.value.url)

/** 图标三级回落：显式图片 → builtin 内联 SVG → 首字母色块 */
const iconKind = computed<'builtin' | 'image' | 'letter'>(() => {
  const icon = p.value.icon
  if (icon.startsWith('builtin:')) return 'builtin'
  if (icon) return 'image'
  return 'letter'
})
const builtinIconName = computed(() => p.value.icon.replace(/^builtin:/, ''))
const letter = computed(() => (p.value.name || '?').trim().slice(0, 1).toUpperCase())

const metaLine = computed(() => [p.value.group, p.value.plan, p.value.accountLabel].filter(Boolean).join(' · '))

/** 相对时间：与项目既有文案口径一致（今天 / 昨天 / N 天前 / 日期） */
function relTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ts >= day0) return `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (ts >= day0 - 86400000) return '昨天'
  const days = Math.floor((day0 - ts) / 86400000)
  if (days < 30) return `${days} 天前`
  const pad = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const usageLine = computed(() => {
  const parts: string[] = []
  if (p.value.lastOpenedAt) parts.push(`上次打开 ${relTime(p.value.lastOpenedAt)}`)
  if (p.value.usageCount > 0) parts.push(`用过 ${p.value.usageCount} 次`)
  if (!parts.length) return '还没打开过'
  return parts.join(' · ')
})

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
    <div class="ap-card-head">
      <span class="ap-logo" aria-hidden="true">
        <Icon v-if="iconKind === 'builtin'" :name="builtinIconName" :size="18" />
        <img v-else-if="iconKind === 'image'" :src="p.icon" alt="" loading="lazy" referrerpolicy="no-referrer" />
        <template v-else>{{ letter }}</template>
      </span>

      <span class="ap-title-wrap">
        <span class="ap-title">{{ p.name }}</span>
        <span v-if="metaLine" class="ap-meta">{{ metaLine }}</span>
      </span>

      <span class="ap-flags">
        <button
          type="button"
          class="ap-flag"
          :class="{ 'is-on': p.pinned }"
          :aria-pressed="p.pinned"
          :title="p.pinned ? '取消置顶' : '置顶'"
          @click="stop($event); emit('togglePin')"
        >
          <Icon name="pin" :size="14" />
        </button>
        <button
          type="button"
          class="ap-flag"
          :class="{ 'is-on': p.isFavorite }"
          :aria-pressed="!!p.isFavorite"
          :title="p.isFavorite ? '取消收藏' : '收藏'"
          @click="stop($event); emit('toggleFavorite')"
        >
          <Icon name="star" :size="14" />
        </button>
      </span>
    </div>

    <p v-if="p.note" class="ap-note">{{ p.note }}</p>
    <p v-if="invalid" class="ap-warn">链接无效，请编辑修正后再打开</p>

    <div class="ap-foot">
      <span class="ap-usage">{{ usageLine }}</span>
    </div>

    <div class="ap-actions">
      <button type="button" class="ui-btn ui-btn--primary ui-btn--sm" @click="stop($event); emit('open')">打开</button>
      <button type="button" class="ui-btn ui-btn--sm" @click="stop($event); emit('edit')">编辑</button>
      <button type="button" class="ui-btn ui-btn--sm" title="复制链接" @click="stop($event); emit('copyLink')">复制</button>
      <button type="button" class="ui-btn ui-btn--sm ui-btn--danger" @click="stop($event); emit('remove')">删除</button>
    </div>
  </article>
</template>

<style scoped>
.ap-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-card);
  cursor: pointer;
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

.ap-card-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ap-logo {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
}
.ap-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.ap-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.ap-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ap-meta {
  font-size: 12px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ap-flags {
  display: inline-flex;
  gap: 2px;
  flex: none;
}
.ap-flag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--motion-duration, 220ms) var(--motion-ease, ease),
    background-color var(--motion-duration, 220ms) var(--motion-ease, ease);
}
.ap-flag:hover {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}
.ap-flag.is-on {
  color: var(--color-primary);
}
.ap-flag:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.ap-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-secondary);
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

.ap-foot {
  margin-top: auto;
}
.ap-usage {
  font-size: 12px;
  color: var(--color-text-muted);
}

.ap-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}
</style>
