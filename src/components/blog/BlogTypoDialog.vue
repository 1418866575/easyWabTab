<script setup lang="ts">
/**
 * 排版主题选择弹框。
 * - 点卡片：应用到本篇并选中（✓ 徽章）；选中卡片的「使用」按钮 = 应用并关闭
 * - 点卡片脚「设默认」：改全站默认主题（emit setDefault；再点一次回落 classic，防默认悬空）
 * - 卡片 = 该主题 token 渲染的迷你示例（非截图，主题扩充自动生成）
 * 视觉按参考稿 typesetting-theme-picker.html：宽弹框 + 3 列高卡片 + 选中 ✓。
 * 壳走 BaseDialog（规范 §2.2：弹框唯一基类，禁止自建 overlay）。
 */
import { computed, ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { TYPO_THEMES } from '@/composables/blogTypoCore'
import type { TypoGroup } from '@/composables/blogTypoCore'

const props = defineProps<{ themeId: string; defaultId: string }>()
const emit = defineEmits<{ apply: [id: string]; setDefault: [id: string]; close: [] }>()

type PillKey = 'all' | TypoGroup
const pill = ref<PillKey>('all')

const PILLS: Array<{ k: PillKey; n: string }> = [
  { k: 'all', n: '全部' },
  { k: 'color', n: '彩色' },
  { k: 'simple', n: '简约' },
  { k: 'wechat', n: '公众号' }
]

const list = computed(() => TYPO_THEMES.filter((t) => pill.value === 'all' || t.group === pill.value))

function countOf(k: PillKey): number {
  return k === 'all' ? TYPO_THEMES.length : TYPO_THEMES.filter((t) => t.group === k).length
}

function onApply(id: string): void {
  emit('apply', id)
}

/** 「使用」= 应用（幂等）并关闭弹框 */
function onUse(id: string): void {
  onApply(id)
  emit('close')
}

function onSetDefault(id: string): void {
  emit('setDefault', id === props.defaultId ? 't_classic' : id)
}

/** 迷你示例卡：注入该主题 token（字号固定，只比结构与配色） */
function miniStyle(t: (typeof TYPO_THEMES)[number]): Record<string, string> {
  return {
    ...t.tokens,
    '--t-font-size': '12.5px',
    '--t-line-height': '1.75',
    '--t-paragraph-gap': '0.5em'
  }
}
</script>

<template>
  <BaseDialog
    title="选择排版主题"
    width="min(1180px, 92vw)"
    max-height="86vh"
    body-layout="flex-column"
    @close="emit('close')"
  >
    <div class="td">
      <div class="td-pills" role="group" aria-label="主题分类筛选">
        <button
          v-for="p in PILLS"
          :key="p.k"
          type="button"
          class="td-pill"
          :class="{ 'is-on': pill === p.k }"
          :data-testid="`blog-typo-pill-${p.k}`"
          @click="pill = p.k"
        >
          {{ p.n }} {{ countOf(p.k) }}
        </button>
      </div>

      <div class="td-grid" data-testid="blog-typo-grid">
        <div
          v-for="t in list"
          :key="t.id"
          class="td-card"
          :class="{ 'is-on': t.id === themeId }"
          :title="t.desc"
          :data-testid="`blog-typo-card-${t.id}`"
          role="button"
          tabindex="0"
          @click="onApply(t.id)"
          @keydown.enter="onApply(t.id)"
        >
          <span v-if="t.id === themeId" class="td-check" aria-hidden="true">✓</span>

          <!-- 迷你示例：注入该主题 token 后渲染饱满样张 -->
          <span class="td-mini" :style="miniStyle(t)">
            <span class="td-h">小标题样式</span>
            <span class="td-p">
              正文是这样的，<strong>重点内容会被强调</strong>。
              <span class="td-q">引用长这样</span>
              段落继续补充示例文字，让卡片观感更饱满一些。
            </span>
          </span>

          <span class="td-foot">
            <span class="td-name">
              <span class="td-swatch" :style="{ background: t.swatch }" aria-hidden="true"></span>
              {{ t.name }}
            </span>
            <span class="td-ops">
              <span
                class="td-def"
                role="button"
                tabindex="0"
                :data-testid="`blog-typo-default-${t.id}`"
                @click.stop="onSetDefault(t.id)"
                @keydown.enter.stop="onSetDefault(t.id)"
              >{{ defaultId === t.id ? '已默认' : '设默认' }}</span>
              <span v-if="defaultId === t.id" class="td-badge">默认</span>
              <button
                v-if="t.id === themeId"
                type="button"
                class="td-use"
                data-testid="blog-typo-use"
                @click.stop="onUse(t.id)"
              >使用</button>
            </span>
          </span>
        </div>
      </div>

      <p class="td-hint">点卡片应用到本篇文章；点「设默认」把它设为全站新文章的默认主题。</p>
    </div>
  </BaseDialog>
</template>

<style scoped>
.td { display: flex; flex-direction: column; gap: 14px; min-height: 0; }

.td-pills { display: flex; flex-wrap: wrap; gap: 10px; }
.td-pill {
  min-height: 30px;
  padding: 0 16px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, color 0.15s;
}
.td-pill:hover { border-color: var(--color-border-strong, #cbd5e1); }
.td-pill.is-on {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
}

/* 3 列高卡片；窄屏降列 */
.td-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  overflow-y: auto;
  min-height: 0;
}

.td-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 224px;
  padding: 18px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background: var(--color-bg-card, #ffffff);
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.td-card:hover { box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08); }
.td-card.is-on {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 4px 16px var(--color-primary-ring, rgba(59, 130, 246, 0.2));
}

/* 选中徽章：右上角圆形 ✓（参考稿样式） */
.td-check {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary, #3b82f6);
  color: #ffffff;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
}

/* 迷你示例容器：注入该主题 token（字号固定，只比结构与配色） */
.td-mini { display: block; }
.td-h {
  display: block;
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: var(--t-heading-weight, 700);
  color: var(--t-heading, var(--color-text, #0f172a));
}
.td-p {
  display: block;
  flex: 1 1 auto;
  font-size: var(--t-font-size, 12.5px);
  line-height: var(--t-line-height, 1.75);
  color: var(--t-text, var(--color-text, #0f172a));
}
.td-p strong { color: var(--t-accent, var(--color-primary, #3b82f6)); font-weight: 700; }
.td-q {
  display: block;
  margin: 10px 0;
  padding: 8px 12px;
  border-left: 3px solid var(--t-quote-border, var(--t-accent, var(--color-primary, #3b82f6)));
  border-radius: 0 6px 6px 0;
  background: var(--t-quote-bg, transparent);
  color: var(--t-quote-text, var(--color-text-secondary, #4a5059));
  font-size: 12px;
}

.td-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--color-border, #e2e8f0);
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
}
.td-name { display: inline-flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-swatch { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.td-ops { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; flex: none; }
.td-def { border: none; background: transparent; padding: 2px 4px; color: var(--color-text-muted, #94a3b8); font-size: 11.5px; cursor: pointer; white-space: nowrap; }
.td-def:hover { color: var(--color-primary, #3b82f6); }
.td-badge {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-size: 10px;
}

/* 「使用」按钮：仅选中卡片显示（参考稿：浮现式） */
.td-use {
  border: 1px solid var(--color-primary, #3b82f6);
  border-radius: var(--radius-sm, 6px);
  background: var(--color-bg-card, #ffffff);
  color: var(--color-primary, #3b82f6);
  padding: 3px 12px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.td-use:hover { background: var(--color-primary-soft, #eff6ff); }

.td-hint { margin: 0; font-size: 11px; color: var(--color-text-muted, #94a3b8); }

@media (max-width: 960px) {
  .td-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .td-grid { grid-template-columns: 1fr; }
  .td-card { min-height: 0; }
}
</style>
