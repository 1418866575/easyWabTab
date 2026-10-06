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
import Icon from '@/components/Icon.vue'
import { useAppSettingsStore } from '../../stores/settings'
import ToolboxSearchBar from '../components/ToolboxSearchBar.vue'
import ToolboxRecentBar from '../components/ToolboxRecentBar.vue'
import ToolboxCategoryTabs from '../components/ToolboxCategoryTabs.vue'
import ToolboxCard from '../components/ToolboxCard.vue'
import ToolboxSection from '../components/ToolboxSection.vue'
import ToolboxEmpty from '../components/ToolboxEmpty.vue'
import ToolboxSyncButton from '../components/ToolboxSyncButton.vue'
import ToolboxToolPanel from '../components/ToolboxToolPanel.vue'
import { TOOLBOX_TOOLS, getToolEntry } from '../registry'
import { filterTools } from '../core/search'
import { sortByClicks } from '../core/rank'
import { MODULE_CATEGORY_ID } from '../core/category'
import { categoryName } from '../config/categories'
import { useToolboxPrefs } from '../prefs/useToolboxPrefs'
import type { ToolboxToolEntry, ToolboxToolMeta } from '../types'

const router = useRouter()
const toast = useToast()
/** 站点设置：页面大标题的工具箱图标与名称跟随「个性化 → 显示控制」中的工具箱设置 */
const settingsStore = useAppSettingsStore()
const {
  favorites,
  clicks,
  isFavorite,
  toggleFavorite,
  pushRecent,
  clickCount,
  hitClick,
  clearClicks
} = useToolboxPrefs()

const keyword = ref('')
const category = ref('')
const activeEntry = ref<ToolboxToolEntry | null>(null)
const panelVisible = ref(false)

/** 全部（分类 + 关键字叠加筛选），按点击次数降序（次数相同保持 order 顺序） */
const visibleTools = computed(() =>
  filterTools(TOOLBOX_TOOLS, { q: keyword.value, category: category.value, clicks: clicks.value })
)
/** 常用工具（收藏 ∩ 当前筛选），同样按点击次数降序 */
const favoriteTools = computed(() =>
  sortByClicks(
    visibleTools.value.filter(t => favorites.value.includes(t.id)),
    clicks.value
  )
)
/** 最近使用由顶栏 ToolboxRecentBar 呈现（复用 prefs 单例，本视图不再重复计算） */
const hasFavorite = computed(() => favorites.value.length > 0)

/** 累计点击次数（用于展示「按使用次数排序」与重置入口） */
const totalClicks = computed(() =>
  Object.values(clicks.value).reduce((sum, n) => sum + (Number(n) > 0 ? Number(n) : 0), 0)
)

/** 站内模块分类给出更明确的副标题（点击直达站内页面） */
const allSectionSub = computed(() => {
  const tail = totalClicks.value > 0 ? ' · 按使用次数排序' : ''
  return category.value === MODULE_CATEGORY_ID
    ? `· ${visibleTools.value.length} 个模块，点击直达站内对应页面${tail}`
    : `· ${visibleTools.value.length} 个工具${tail}`
})

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
  hitClick(meta.id) // 点击次数 +1，列表按此降序

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

function onClearClicks() {
  clearClicks()
  toast.info('已重置使用次数，列表恢复默认排序')
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
    <!-- 顶栏：返回导航站入口（图标 + 名称） -->
    <header class="tb-topbar">
      <button
        type="button"
        class="tb-back"
        data-testid="tb-back-btn"
        title="返回导航站"
        aria-label="返回导航站"
        @click="goBack"
      >
        <Icon name="grid" :size="16" />
        <span>导航站</span>
      </button>

      <!-- 最近使用常驻快捷条（顶栏吸顶，随时可触发；Alt+R 唤起） -->
      <ToolboxRecentBar :on-open="openTool" />

      <!-- 云同步：同步收藏 / 最近使用 / 点击次数 / 搜索历史（复用「设置 → 云同步」配置） -->
      <ToolboxSyncButton class="tb-topbar-sync" />
    </header>

    <main class="tb-main wb-container">
      <div class="tb-head">
        <!-- 页面大标题：工具箱图标 + 名称，跟随「设置 → 个性化 → 显示控制」中的工具箱设置变化 -->
        <h1 class="tb-head-title">
          <img
            v-if="settingsStore.toolboxButtonIcon"
            :src="settingsStore.toolboxButtonIcon"
            alt=""
            class="tb-head-icon-img"
          />
          <span v-else class="tb-head-icon-emoji" aria-hidden="true">🧰</span>
          <span>{{ settingsStore.toolboxButtonDisplayName }}</span>
        </h1>
        <span class="tb-head-sub">
          共 {{ TOOLBOX_TOOLS.length }} 个工具<template v-if="keyword || category">，当前筛选出 {{ visibleTools.length }} 个</template>
        </span>
      </div>

      <!-- 搜索框（父容器内居中）：聚焦展开建议/历史下拉 -->
      <ToolboxSearchBar
        v-model="keyword"
        :candidates="TOOLBOX_TOOLS"
        @pick="openTool"
      />

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
            :clicks="clickCount(t.id)"
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
        <template v-if="totalClicks > 0" #extra>
          <span class="tb-hits-total">累计使用 {{ totalClicks }} 次</span>
          <button type="button" class="tb-mini-btn" @click="onClearClicks">重置统计</button>
        </template>
        <div class="tb-grid">
          <ToolboxCard
            v-for="t in visibleTools"
            :key="t.id"
            :meta="t"
            :favorite="isFavorite(t.id)"
            :keyword="keyword"
            :clicks="clickCount(t.id)"
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

      <p class="tb-note">
        工具全部为<strong>站内自建或站内已有模块</strong>，不会跳转任何第三方网站。
        新增工具只需在 <code>src/toolbox/tools/</code> 下新建一个目录（<code>index.ts</code> 声明元数据 + 工具组件），
        列表、搜索、筛选、收藏与最近使用<strong>全部自动生效</strong>。
      </p>

      <p class="tb-note tb-disclaimer" data-testid="tb-disclaimer">
        <strong>免责声明：</strong>本站严禁用于非法用途，本站不承担任何因使用本站造成的损失及责任。
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

/* 云同步按钮：顶栏内、紧随「最近使用」之后。
   注意 .tb-recent-bar 自带 margin-left:auto（把自己推到右侧），所以这里只用左间距贴合，
   不再给 auto——否则按钮会被推到「最近使用」右边的空白处、与其拉开距离。 */
.tb-topbar-sync {
  margin-left: 10px;
  flex: none;
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
/* 大标题内的工具箱标识：自定义图标 / 默认 emoji，与标题文字基线对齐 */
.tb-head-title { display: inline-flex; align-items: center; gap: 8px; }
.tb-head-icon-img {
  width: 1.15em;
  height: 1.15em;
  object-fit: contain;
  flex: none;
  border-radius: 4px;
}
.tb-head-icon-emoji { font-size: 1em; line-height: 1; flex: none; }
.tb-head-sub { color: var(--color-text-secondary); font-size: 13px; }

.tb-grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
}

.tb-hits-total { font-size: 12px; color: var(--color-text-muted); }

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

/* 免责声明：与上方说明同卡片样式，边框用警示色区分 */
.tb-disclaimer {
  margin-top: 12px;
  border-left-color: var(--color-error, #ef4444);
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
  .tb-back { transition: none; }
}
</style>

<style>
/* 站内工具的通用 UI（各工具组件复用，随工具箱页面一起加载，无需每个工具重复定义） */
@import '../styles/tool-ui.css';
</style>
