<script setup lang="ts">
/**
 * 排版主题选择弹框。
 * - 顶部搜索框：按主题名称（颜色名）/ 描述过滤
 * - 「最近使用」分组置顶（localStorage 记录最近 5 个，应用即记录）
 * - 点卡片：应用到本篇并选中（✓ 徽章）；选中卡片的「使用」按钮 = 应用并关闭
 * - 点卡片脚「设默认」：改全站默认主题（emit setDefault；再点一次回落 classic，防默认悬空）
 * - 卡片 = 该主题 token 渲染的迷你示例（非截图，主题扩充自动生成）
 * 壳走 BaseDialog（规范 §2.2：弹框唯一基类，禁止自建 overlay）。
 */
import { computed, ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/Icon.vue'
import { TYPO_THEMES } from '@/composables/blogTypoCore'
import type { TypoTheme } from '@/composables/blogTypoCore'
import { decorateTypoHtml } from '@/composables/blogTypoDecor'

const props = defineProps<{ themeId: string; defaultId: string }>()
const emit = defineEmits<{ apply: [id: string]; setDefault: [id: string]; close: [] }>()

/** 「最近使用」：UI 偏好，localStorage 记录最近 5 个主题 id（最新在前、去重） */
const RECENT_KEY = 'blog-typo-recent'
const RECENT_MAX = 5

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const arr: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is string => typeof x === 'string' && TYPO_THEMES.some((t) => t.id === x))
  } catch {
    return []
  }
}

const recentIds = ref<string[]>(loadRecent())

const query = ref('')

function onApply(id: string): void {
  recentIds.value = [id, ...recentIds.value.filter((x) => x !== id)].slice(0, RECENT_MAX)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds.value))
  } catch {
    /* 隐私模式等场景写不进就算了：分组只是便利，不影响功能 */
  }
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

/** 过滤：主题名称（颜色名）与描述都参与匹配，空查询 = 全部 */
const q = computed(() => query.value.trim().toLowerCase())

function matchTheme(t: TypoTheme): boolean {
  if (!q.value) return true
  return t.name.toLowerCase().includes(q.value) || t.desc.toLowerCase().includes(q.value)
}

const recentList = computed(() =>
  recentIds.value
    .map((id) => TYPO_THEMES.find((t) => t.id === id))
    .filter((t): t is TypoTheme => !!t && matchTheme(t))
)

const allList = computed(() => TYPO_THEMES.filter((t) => !recentIds.value.includes(t.id) && matchTheme(t)))

/** 渲染分组：最近使用置顶，其余归入「全部主题 / 搜索结果」；空组不显示 */
const sections = computed(() => {
  const out: Array<{ key: string; title: string; count: number; items: TypoTheme[] }> = []
  if (recentList.value.length) out.push({ key: 'recent', title: '最近使用', count: recentList.value.length, items: recentList.value })
  if (allList.value.length) out.push({ key: 'all', title: q.value ? '搜索结果' : '全部主题', count: allList.value.length, items: allList.value })
  return out
})

/** 迷你示例：真实标签渲染（markdown.css + 主题 token + 找Tab 装饰/结构样式原样呈现） */
const SAMPLE_HTML =
  '<h2>小标题样式</h2><p>正文是这样的，<strong>重点内容会被强调</strong>。段落继续补充示例文字，让卡片观感更饱满一些。</p><blockquote>引用长这样</blockquote>'

function miniHtml(t: TypoTheme): string {
  return decorateTypoHtml(SAMPLE_HTML, t)
}

/** 注入该主题 token（字号固定，只比结构与配色） */
function miniStyle(t: TypoTheme): Record<string, string> {
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
      <div class="ui-search td-search" role="search">
        <Icon name="search" :size="14" />
        <input
          v-model="query"
          class="ui-search-input"
          type="text"
          placeholder="按颜色名或描述搜索，如：青提 / 藏蓝 / 公众号…"
          data-testid="blog-typo-search"
        />
      </div>

      <div class="td-scroll">
        <section v-for="sec in sections" :key="sec.key" class="td-section">
          <h3 class="td-group-title">
            {{ sec.title }}
            <span class="td-group-count">{{ sec.count }}</span>
          </h3>
          <div class="td-grid" :data-testid="`blog-typo-grid-${sec.key}`">
            <div
              v-for="t in sec.items"
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

              <!-- 迷你示例：真实标签渲染（token + 找Tab 装饰/结构样式） -->
              <div
                class="td-mini md-body"
                :style="miniStyle(t)"
                :data-typo="t.id"
                v-html="miniHtml(t)"
              ></div>

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
        </section>

        <div v-if="sections.length === 0" class="td-empty" data-testid="blog-typo-empty">
          没有匹配「{{ query }}」的主题，换个关键词试试
        </div>
      </div>

      <p class="td-hint">点卡片应用到本篇文章；点「设默认」把它设为全站新文章的默认主题。</p>
    </div>
  </BaseDialog>
</template>

<style scoped>
.td { display: flex; flex-direction: column; gap: 14px; min-height: 0; height: 100%; }

/* 搜索框：全站 .ui-search 外壳（描边/焦点环在壳上），内层透明 */
.td-search { flex: none; }
.td-search .ui-search-input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  color: var(--ds-text, #1f2329);
  font-family: inherit;
  font-size: 13px;
}

/* 分组列表区：统一滚动容器（原 3 列网格各自滚动改为整体滚动） */
.td-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 4px;
}

.td-section { display: flex; flex-direction: column; gap: 10px; }

.td-group-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--ds-text, #1f2329);
}

.td-group-count {
  min-width: 18px;
  padding: 0 6px;
  border-radius: var(--ds-radius-pill, 999px);
  background: var(--ds-bg, #f7f8fa);
  color: var(--ds-text-3, #9aa0a6);
  font-size: 11px;
  font-weight: var(--font-weight-medium, 500);
  line-height: 18px;
  text-align: center;
}

/* 3 列高卡片；窄屏降列 */
.td-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.td-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 224px;
  padding: 18px;
  border: 1px solid var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-card, 12px);
  background: var(--ds-card, #ffffff);
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

/* 迷你示例容器：真实标签渲染（markdown.css + 主题 token + 找Tab 结构样式/装饰） */
.td-mini {
  display: block;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.td-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--ds-line, #ececf0);
  font-size: 12px;
  color: var(--ds-text-3, #9aa0a6);
}
.td-name { display: inline-flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-swatch { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.td-ops { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; flex: none; }
.td-def { border: none; background: transparent; padding: 2px 4px; color: var(--ds-text-3, #9aa0a6); font-size: 11.5px; cursor: pointer; white-space: nowrap; }
.td-def:hover { color: var(--color-primary, #3b82f6); }
.td-badge {
  flex: none;
  padding: 1px 6px;
  border-radius: var(--ds-radius-pill, 999px);
  background: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-size: 10px;
}

/* 「使用」按钮：仅选中卡片显示（参考稿：浮现式） */
.td-use {
  border: 1px solid var(--color-primary, #3b82f6);
  border-radius: var(--ds-radius-ctrl, 8px);
  background: var(--ds-card, #ffffff);
  color: var(--color-primary, #3b82f6);
  padding: 3px 12px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.td-use:hover { background: var(--color-primary-soft, #eff6ff); }

/* 无匹配：虚线空态（与列表空态同语言） */
.td-empty {
  padding: 48px 16px;
  border: 1px dashed var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-card, 12px);
  background: var(--ds-card, #ffffff);
  color: var(--ds-text-2, #646a73);
  font-size: 13px;
  text-align: center;
}

.td-hint { margin: 0; flex: none; font-size: 11px; color: var(--ds-text-3, #9aa0a6); }

@media (max-width: 960px) {
  .td-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .td-grid { grid-template-columns: 1fr; }
  .td-card { min-height: 0; }
}
</style>
