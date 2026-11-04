<script setup lang="ts">
/**
 * 智能网页端入口卡片
 * ------------------------------------------------------------------
 * 版式与「导航站」站点卡保持一致：图标 48px 居中在上、名称居中在下、
 * 右上角 ⋯ 菜单承载 编辑 / 置顶 / 删除；卡片整体点击打开网页。
 * 根元素用 <article role="button">：卡片整体可点，内部还有菜单按钮，
 * 用 <button> 做根会造成非法嵌套。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import { platformDisplayIcon } from '@/composables/aiPlatformsCore'
import type { AiPlatform } from '@/types'

const props = defineProps<{ platform: AiPlatform }>()

const emit = defineEmits<{
  open: []
  edit: []
  remove: []
}>()

const p = computed(() => props.platform)
const invalid = computed(() => !p.value.url)

/** 图标回落：自定义（图片 / builtin） → 预置语义图标 → 通用链接图标（不用首字母占位） */
const displayIcon = computed(() => platformDisplayIcon(p.value))
const iconKind = computed<'builtin' | 'image'>(() =>
  displayIcon.value.startsWith('builtin:') ? 'builtin' : 'image'
)
const builtinIconName = computed(() => displayIcon.value.replace(/^builtin:/, ''))

// ---------- 更多操作菜单（与导航站站点卡同款：⋯ 常驻，点空白处 / ESC 收起） ----------
const menuOpen = ref(false)
const cardRef = ref<HTMLElement | null>(null)

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value
}

function closeMenu(): void {
  menuOpen.value = false
}

function onDocPointerDown(e: Event): void {
  if (!menuOpen.value) return
  const el = cardRef.value
  if (el && e.target instanceof Node && el.contains(e.target)) return
  closeMenu()
}

function onDocKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && menuOpen.value) closeMenu()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onDocKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onDocKeydown)
})

function onEdit(): void {
  closeMenu()
  emit('edit')
}

function onRemove(): void {
  closeMenu()
  emit('remove')
}
</script>

<template>
  <article
    ref="cardRef"
    class="ap-card"
    :class="{ 'is-invalid': invalid, 'is-menu-open': menuOpen }"
    role="button"
    tabindex="0"
    :aria-label="`打开 ${p.name}`"
    :data-testid="`ai-platform-card-${p.id}`"
    @click="emit('open')"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <!-- 更多操作：与导航站站点卡一致的 ⋯ 触发 + 下拉菜单 -->
    <div class="card-actions">
      <button
        type="button"
        class="menu-trigger"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        title="更多操作"
        aria-label="更多操作"
        :data-testid="`ai-platform-card-menu-${p.id}`"
        @click.stop="toggleMenu"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="12" cy="19" r="1.9" />
        </svg>
      </button>
      <Transition name="card-menu-fade">
        <div v-if="menuOpen" class="card-menu" role="menu" @click.stop>
          <button type="button" class="card-menu-item" role="menuitem" @click.stop="onEdit">
            <Icon name="pencil" :size="14" />
            <span>编辑</span>
          </button>
          <button type="button" class="card-menu-item is-danger" role="menuitem" @click.stop="onRemove">
            <Icon name="trash" :size="14" />
            <span>删除</span>
          </button>
        </div>
      </Transition>
    </div>

    <div class="card-header">
      <span class="ap-icon" aria-hidden="true">
        <Icon v-if="iconKind === 'builtin'" :name="builtinIconName" :size="24" />
        <img v-else :src="p.icon" alt="" loading="lazy" referrerpolicy="no-referrer" />
      </span>
      <span v-if="invalid" class="invalid-badge" title="链接无效，请编辑修正">
        <Icon name="alert" :size="14" />
      </span>
    </div>

    <h3 class="ap-name">
      <span class="ap-name-text" :title="p.name">{{ p.name }}</span>
    </h3>
  </article>
</template>

<style scoped>
/* 卡片外壳：数值与导航站 .site-card 一致（圆角 10 / 内边距 14 / 轻阴影 + 悬停上浮） */
.ap-card {
  position: relative;
  background-color: var(--color-bg-card, #ffffff);
  border-radius: 10px;
  padding: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition:
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.25s ease,
    border-color 0.25s ease,
    opacity 0.15s ease;
}
.ap-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}
.ap-card:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.ap-card.is-invalid {
  opacity: 0.72;
  cursor: not-allowed;
}
.ap-card.is-menu-open {
  z-index: 60;
}

/* 图标区：48px、圆角 10，悬停轻微放大（同导航站 .favicon） */
.card-header {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 10px;
  position: relative;
}
.ap-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background-color: var(--color-bg, #f8fafc);
  color: var(--color-text-secondary);
  overflow: hidden;
  transition: transform 0.2s ease;
}
.ap-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ap-card:hover .ap-icon {
  transform: scale(1.08);
}

.invalid-badge {
  position: absolute;
  top: 0;
  left: 2px;
  color: var(--color-error-text);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

/* 名称：居中、单行省略（同导航站 .site-name） */
.ap-name {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  margin: 0;
  font-size: var(--fs-body, 14px);
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-text);
  min-width: 0;
}
.ap-name-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ⋯ 操作区：常驻但悬停才显现（触屏/窄屏常显，同导航站） */
.card-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
}
.menu-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.15s ease,
    color 0.15s ease,
    background-color 0.15s ease;
}
.ap-card:hover .menu-trigger,
.ap-card:focus-within .menu-trigger,
.ap-card.is-menu-open .menu-trigger {
  opacity: 1;
}
.menu-trigger:hover {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
}
.menu-trigger:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  opacity: 1;
}

.card-menu {
  position: absolute;
  top: 30px;
  right: 0;
  min-width: 148px;
  padding: 6px;
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 1600;
  text-align: left;
}
.card-menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  font-size: var(--fs-sm, 13px);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.card-menu-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary-text);
}
.card-menu-item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
.card-menu-item.is-danger {
  color: var(--color-error-text);
}
.card-menu-item.is-danger:hover {
  background-color: var(--color-primary-soft);
  color: var(--color-error-text);
}

.card-menu-fade-enter-active,
.card-menu-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.card-menu-fade-enter-from,
.card-menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* 触屏 / 窄屏：放大菜单触发区（44px 触控目标下限） */
@media (max-width: 768px), (pointer: coarse) {
  .menu-trigger {
    width: 44px;
    height: 44px;
    opacity: 0.85;
    background: var(--color-bg-hover, #f1f5f9);
  }
  .card-menu {
    top: 48px;
    min-width: 160px;
  }
  .card-menu-item {
    min-height: 44px;
  }
}
</style>
