<script setup lang="ts">
/**
 * 编辑器右栏「排版」区块。
 * 入口行：当前主题色点 + 名称 + 「换主题」（打开 BlogTypoDialog）；
 * 微调：字号 / 行距 / 段距三个滑杆，覆盖主题值；「跟随系统」时不注入变量，滑杆停用。
 * v-model 即 BlogTypo（article.typo）；「设默认」直接写 settings.defaultTypoId。
 */
import { computed } from 'vue'
import { useBlogStore } from '@/stores/blog'
import { resolveTypo, typoHrStyle } from '@/composables/blogTypoCore'
import type { BlogTypo } from '@/types'

const props = defineProps<{ modelValue: BlogTypo }>()
const emit = defineEmits<{ 'update:modelValue': [v: BlogTypo]; open: [] }>()

const store = useBlogStore()

const theme = computed(() => resolveTypo(props.modelValue, store.settings.defaultTypoId))
const isFollow = computed(() => theme.value.id === 't_follow')
const hrStyle = computed(() => typoHrStyle(props.modelValue, store.settings.defaultTypoId))

function patch(p: Partial<BlogTypo>): void {
  emit('update:modelValue', { ...props.modelValue, ...p })
}

/** 换主题同时清空微调：微调是「覆盖主题值」，换主题后应回到新主题基线 */
function setTheme(id: string): void {
  emit('update:modelValue', { themeId: id })
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

const fs = computed(() => num(props.modelValue.fontSize, Number.parseFloat(theme.value.tokens['--t-font-size']) || 15))
const lh = computed(() => num(props.modelValue.lineHeight, Number.parseFloat(theme.value.tokens['--t-line-height']) || 1.75))
const pg = computed(() => num(props.modelValue.paragraphGap, Number.parseFloat(theme.value.tokens['--t-paragraph-gap']) || 0.6))

function onFs(e: Event): void {
  patch({ fontSize: Number.parseFloat((e.target as HTMLInputElement).value) })
}
function onLh(e: Event): void {
  patch({ lineHeight: Number.parseFloat((e.target as HTMLInputElement).value) })
}
function onPg(e: Event): void {
  patch({ paragraphGap: Number.parseFloat((e.target as HTMLInputElement).value) })
}
</script>

<template>
  <div class="be-block tp" data-testid="blog-typo-panel">
    <h3 class="be-block-title">排版</h3>
    <div class="tp-row">
      <span class="tp-dot" :style="{ background: theme.swatch }" aria-hidden="true"></span>
      <span class="tp-name">{{ theme.name }}</span>
      <button type="button" class="be-mini" data-testid="blog-typo-open" @click="emit('open')">换主题</button>
    </div>

    <template v-if="!isFollow">
      <label class="tp-slider">
        <span>字号</span>
        <input type="range" min="14" max="20" step="0.5" :value="fs" data-testid="blog-typo-fs" @input="onFs" />
        <b>{{ fs.toFixed(1) }}px</b>
      </label>
      <label class="tp-slider">
        <span>行距</span>
        <input type="range" min="1.5" max="2.2" step="0.05" :value="lh" data-testid="blog-typo-lh" @input="onLh" />
        <b>{{ lh.toFixed(2) }}</b>
      </label>
      <label class="tp-slider">
        <span>段距</span>
        <input type="range" min="0.4" max="2" step="0.1" :value="pg" data-testid="blog-typo-pg" @input="onPg" />
        <b>{{ pg.toFixed(1) }}em</b>
      </label>
      <button
        v-if="modelValue.fontSize != null || modelValue.lineHeight != null || modelValue.paragraphGap != null"
        type="button"
        class="be-mini tp-reset"
        data-testid="blog-typo-reset"
        @click="setTheme(modelValue.themeId)"
      >恢复主题默认</button>
    </template>
    <p class="tp-hint">
      {{ isFollow ? '跟随系统：与现有排版一致。' : hrStyle === 'dots' ? '分割线为圆点样式。' : hrStyle === 'dashed' ? '分割线为虚线样式。' : '仅作用于当前文章。' }}
    </p>
  </div>
</template>

<style scoped>
.tp { display: flex; flex-direction: column; gap: 6px; }
.tp-row { display: flex; align-items: center; gap: 7px; }
.tp-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.tp-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--color-text, #0f172a); }
.tp-slider { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--color-text-secondary, #64748b); }
.tp-slider span { flex: 0 0 auto; width: 26px; }
.tp-slider input { flex: 1 1 auto; min-width: 0; }
.tp-slider b { flex: 0 0 46px; text-align: right; font-weight: 400; font-variant-numeric: tabular-nums; color: var(--color-text, #0f172a); }
.tp-reset { align-self: flex-start; }
.tp-hint { margin: 0; font-size: 11px; line-height: 1.6; color: var(--color-text-muted, #94a3b8); }
</style>
