<script setup lang="ts">
/**
 * 工具箱页面（路由 /toolbox）
 *
 * 职责：组装搜索 / 分类 / 分组 / 工具面板；所有过滤与排序都由 core 纯函数完成，
 * 本组件不含业务判断。工具列表完全来自 registry（自动扫描 tools/ 目录）。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import ToolboxSearchBar from '../components/ToolboxSearchBar.vue'
import ToolboxCategoryTabs from '../components/ToolboxCategoryTabs.vue'
import ToolboxCard from '../components/ToolboxCard.vue'
import ToolboxSection from '../components/ToolboxSection.vue'
import ToolboxEmpty from '../components/ToolboxEmpty.vue'
import ToolboxToolPanel from '../components/ToolboxToolPanel.vue'
import { TOOLBOX_TOOLS, getToolEntry, getToolMeta } from '../registry'
import { filterTools } from '../core/search'
import { MODULE_CATEGORY_ID } from '../core/category'
import { relativeTime } from '../core/recent'
import { categoryName } from '../config/categories'
import { useToolboxPrefs } from '../prefs/useToolboxPrefs'
import type { ToolboxToolEntry, ToolboxToolMeta } from '../types'

const router = useRouter()
const toast = useToast()
const { favorites, recent, isFavorite, toggleFavorite, pushRecent, clearRecent } = useToolboxPrefs()

const keyword = ref('')
const category = ref('')
const activeEntry = ref<ToolboxToolEntry | null>(null)
const panelVisible = ref(false)

/** 全部（分类 + 关键字叠加筛选） */
const visibleTools = computed(() => filterTools(TOOLBOX_TOOLS, { q: keyword.value, category: category.value }))
/** 常用工具（收藏 ∩ 当前筛选） */
const favoriteTools = computed(() => visibleTools.value.filter(t => favorites.value.includes(t.id)))
/** 最近使用（时间倒序，已由 core 去重截断） */
const recentTools = computed(() =>
  recent.value
    .map(r => ({ ts: r.ts, tool: getToolMeta(r.id) }))
    .filter((x): x is { ts: number; tool: ToolboxToolMeta } => !!x.tool)
)

const hasFavorite = computed(() => favorites.value.length > 0)

/** 站内模块分类给出更明确的副标题（点击直达站内页面） */
const allSectionSub = computed(() =>
  category.value === MODULE_CATEGORY_ID
    ? `· ${visibleTools.value.length} 个模块，点击直达站内对应页面`
    : `· ${visibleTools.value.length} 个工具`
)

const STATUS_LABEL: Record<string, string> = {
  active: '可用',
  maintenance: '维护中',
  coming: '即将上线'
}

/** 打开工具：站内模块走路由，站内自建工具在站内面板打开（不跳第三方） */
function openTool(meta: ToolboxToolMeta) {
  if (meta.status !== 'active') {
    toast.warning(`「${meta.name}」当前${STATUS_LABEL[meta.status] || '不可用'}，暂不可打开`)
    return
  }
  pushRecent(meta.id)

  if (meta.kind === 'module') {
    router.push(meta.url || '/')
    return
  }

  const entry = getToolEntry(meta.id)
  if (!entry || !entry.component) {
    toast.warning(`「${meta.name}」的实现尚未接入（缺少 component）`)
    return
  }
  activeEntry.value = entry
  panelVisible.value = true
}

function closePanel() {
  panelVisible.value = false
  activeEntry.value = null
}

function onToggleFav(meta: ToolboxToolMeta) {
  const on = toggleFavorite(meta.id)
  toast.success(on ? `已收藏「${meta.name}」，可在常用工具快速访问` : `已取消收藏「${meta.name}」`)
}

function onClearRecent() {
  clearRecent()
  toast.info('已清空最近使用')
}

function resetFilters() {
  keyword.value = ''
  category.value = ''
}

function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="tb-page">
    <!-- 顶栏：只保留一个返回按钮 -->
    <header class="tb-topbar">
      <button
        type="button"
        class="tb-back"
        data-testid="tb-back-btn"
        title="返回"
        aria-label="返回"
        @click="goBack"
      >← 返回</button>
    </header>

    <main class="tb-main wb-container">
      <div class="tb-head">
        <h1>🧰 工具箱</h1>
        <span class="tb-head-sub">
          共 {{ TOOLBOX_TOOLS.length }} 个工具<template v-if="keyword || category">，当前筛选出 {{ visibleTools.length }} 个</template>
        </span>
      </div>

      <!-- 搜索框（父容器内居中） -->
      <ToolboxSearchBar v-model="keyword" />

      <!-- 分类筛选 -->
      <ToolboxCategoryTabs v-model="category" :tools="TOOLBOX_TOOLS" />

      <!-- 常用工具（收藏） -->
      <ToolboxSection
        v-if="hasFavorite"
        title="★ 常用工具"
        sub="点击卡片右上角 ☆ 可收藏"
        data-testid="tb-section-fav"
      >
        <div class="tb-grid">
          <ToolboxCard
            v-for="t in favoriteTools"
            :key="t.id"
            :meta="t"
            :favorite="isFavorite(t.id)"
            :keyword="keyword"
            @open="openTool(t)"
            @toggle-fav="onToggleFav(t)"
          />
          <ToolboxEmpty
            v-if="!favoriteTools.length"
            kind="no-result"
            :keyword="keyword"
            @reset="resetFilters"
          />
        </div>
      </ToolboxSection>

      <!-- 全部工具 -->
      <ToolboxSection
        :title="category ? categoryName(category) : '全部工具'"
        :sub="allSectionSub"
        data-testid="tb-section-all"
      >
        <div class="tb-grid">
          <ToolboxCard
            v-for="t in visibleTools"
            :key="t.id"
            :meta="t"
            :favorite="isFavorite(t.id)"
            :keyword="keyword"
            @open="openTool(t)"
            @toggle-fav="onToggleFav(t)"
          />
          <ToolboxEmpty
            v-if="!visibleTools.length"
            kind="no-result"
            :keyword="keyword"
            @reset="resetFilters"
          />
        </div>
      </ToolboxSection>

      <!-- 最近使用 -->
      <ToolboxSection v-if="recentTools.length" title="🕘 最近使用" data-testid="tb-section-recent">
        <template #extra>
          <button type="button" class="tb-mini-btn" @click="onClearRecent">清空</button>
        </template>
        <div class="tb-recent">
          <button
            v-for="item in recentTools"
            :key="item.tool.id"
            type="button"
            class="tb-recent-item"
            @click="openTool(item.tool)"
          >
            <span aria-hidden="true">{{ item.tool.icon }}</span>
            <span>{{ item.tool.name }}</span>
            <span class="tb-recent-time">{{ relativeTime(item.ts) }}</span>
          </button>
        </div>
      </ToolboxSection>

      <p class="tb-note">
        工具全部为<strong>站内自建或站内已有模块</strong>，不会跳转任何第三方网站。
        新增工具只需在 <code>src/toolbox/tools/</code> 下新建一个目录（<code>index.ts</code> 声明元数据 + 工具组件），
        列表、搜索、筛选、收藏与最近使用<strong>全部自动生效</strong>。
      </p>
    </main>

    <!-- 站内自建工具面板 -->
    <ToolboxToolPanel :entry="activeEntry" :visible="panelVisible" @close="closePanel" />
  </div>
</template>

<style scoped>
.tb-page { min-height: 100vh; }

/* 顶栏：只保留返回按钮，主题沿用项目共用主题 */
.tb-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  padding: 10px 16px;
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border);
}
.tb-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 8px 12px;
  font-size: 13px;
  font-family: var(--font-family);
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  transition: color var(--motion-duration) var(--motion-ease),
    background-color var(--motion-duration) var(--motion-ease),
    border-color var(--motion-duration) var(--motion-ease);
}
.tb-back:hover {
  color: var(--color-primary);
  background: var(--color-bg-hover);
  border-color: var(--color-border);
}

.tb-main { padding-bottom: 96px; }

.tb-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin: 22px 0 4px; }
.tb-head h1 { margin: 0; font-size: clamp(20px, 2.2vw, 26px); color: var(--color-text); }
.tb-head-sub { color: var(--color-text-secondary); font-size: 13px; }

.tb-grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
}

.tb-recent { display: flex; flex-wrap: wrap; gap: 8px; }
.tb-recent-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 8px 12px;
  font-size: 13px;
  font-family: var(--font-family);
  color: var(--color-text);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  transition: color var(--motion-duration) var(--motion-ease),
    border-color var(--motion-duration) var(--motion-ease);
}
.tb-recent-item:hover { color: var(--color-primary); border-color: var(--color-primary); }
.tb-recent-time { font-size: 11px; color: var(--color-text-muted); }

.tb-mini-btn {
  min-height: 26px;
  padding: 2px 8px;
  font-size: 12px;
  font-family: var(--font-family);
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.tb-mini-btn:hover { color: var(--color-primary); border-color: var(--color-primary); }

.tb-note {
  margin-top: 34px;
  padding: 14px 16px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-primary);
  border-radius: var(--radius-md);
}
.tb-note code {
  background: var(--color-bg-hover);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
}

@media (max-width: 768px) {
  .tb-main { padding-bottom: 72px; }
  .tb-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
  .tb-head { margin-top: 16px; }
}
@media (max-width: 359px) {
  .tb-grid { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .tb-back,
  .tb-recent-item { transition: none; }
}
</style>

<style>
/* 站内工具的通用 UI（各工具组件复用，随工具箱页面一起加载，无需每个工具重复定义） */
@import '../styles/tool-ui.css';
</style>
