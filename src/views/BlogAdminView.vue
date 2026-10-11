<script setup lang="ts">
/**
 * 博客管理后台主视图（路由 /blog/admin）
 *
 * 布局与其它工作台一致：顶部工作台切换入口 + 云同步，左菜单 + 右内容。
 * 菜单项：文章 / 回收站。「分类」「标签」「博客设置」统一收进右上角「设置」弹框（rail + 内容，对齐导航站设置模块）。
 * 「新建 / 编辑文章」不占路由：选中 editingId 时右侧内容区整块换成编辑器，
 * 关闭编辑器回到原菜单页（原型阶段不引入二级路由，避免与列表页状态互相打断）。
 *
 * 数据：src/stores/blog.ts → IndexedDB store 'blog' → 云同步走独立的 blog.json 信封。
 */
import { computed, onMounted, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import WorkbenchManagePanel from '@/components/WorkbenchManagePanel.vue'
import { useAppSettingsStore } from '@/stores/settings'
import { useBlogStore } from '@/stores/blog'
import { useCloudSync, type SyncStatus } from '@/composables/useCloudSync'
import { useToast } from '@/composables/useToast'
import BlogPosts from '@/components/blog/BlogPosts.vue'
import BlogEditor from '@/components/blog/BlogEditor.vue'
import BlogTrash from '@/components/blog/BlogTrash.vue'
import BlogSettingsDialog from '@/components/blog/BlogSettingsDialog.vue'

type PageKey = 'posts' | 'trash'

interface MenuItem {
  key: PageKey
  label: string
  icon: string
  count?: number
}

const settingsStore = useAppSettingsStore()
const store = useBlogStore()
const toast = useToast()

const activePage = ref<PageKey>('posts')
const sidebarCollapsed = ref(false)
/** 正在编辑的文章 id；非空时右侧显示编辑器而非菜单对应面板 */
const editingId = ref<string | null>(null)
/** 设置弹框是否打开（设置入口已从左侧菜单移到顶栏右侧） */
const settingsOpen = ref(false)

const menuItems = computed<MenuItem[]>(() => [
  { key: 'posts', label: '文章', icon: 'notes', count: store.counts.all },
  { key: 'trash', label: '回收站', icon: 'trash', count: store.counts.trash }
])

function selectPage(key: PageKey): void {
  activePage.value = key
  editingId.value = null
}

async function startNewArticle(): Promise<void> {
  const article = await store.createArticle()
  editingId.value = article.id
}

function editArticle(id: string): void {
  editingId.value = id
}

function closeEditor(): void {
  editingId.value = null
}

// ---------- 云同步（数据走独立的 blog.json 信封） ----------
const cloudSync = useCloudSync()
const cloudEnabled = computed((): boolean => settingsStore.cloudSyncEnabled === true)
const syncBusy = computed(
  (): boolean => cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing'
)
const syncStatusClass = computed(
  (): Record<string, boolean> => ({
    'ba-sync-btn-pending': cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing',
    'ba-sync-btn-conflict': cloudSync.status.value === 'conflict',
    'ba-sync-btn-error': cloudSync.status.value === 'error'
  })
)
const syncLabel = computed((): string => {
  if (!cloudEnabled.value) return '云同步'
  switch (cloudSync.status.value as SyncStatus) {
    case 'pulling': return '拉取中…'
    case 'pushing': return '推送中…'
    case 'conflict': return '处理冲突'
    case 'error': return '同步失败'
    default: return '云同步'
  }
})
const syncTip = computed((): string => {
  if (!cloudEnabled.value) return '云同步未开启，请在「设置 → 云同步」中开启后使用'
  const t = cloudSync.lastSyncAt.value
  if (!t) return '未同步过；点击立即同步（博客数据走 blog.json 信封）'
  const d = new Date(t)
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `上次同步：${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}；点击立即同步`
})

async function handleSyncNowClick(): Promise<void> {
  if (!cloudEnabled.value) {
    toast.warning('云同步未开启。请到「设置 → 云同步」填写 WebDAV 地址与账号后开启。')
    return
  }
  await cloudSync.syncNow()
}

onMounted(async () => {
  if (!store.loaded) await store.loadBlog()
})
</script>

<template>
  <div class="ba-shell" :class="{ 'is-collapsed': sidebarCollapsed }">
    <header class="ba-topbar">
      <div class="ba-topbar-left">
        <WorkbenchManagePanel trigger-builtin="notes" trigger-label="博客后台" force-show />
        <div class="ba-heading">
          <h1 class="ba-title">{{ store.settings.blogName }}</h1>
          <p class="ba-sub">
            共 {{ store.counts.all }} 篇 · 已发布 {{ store.counts.published }} · 草稿 {{ store.counts.draft }}
          </p>
        </div>
      </div>
      <div class="ba-topbar-actions">
        <button
          type="button"
          class="ba-btn ba-btn-sm ba-sync-btn"
          :class="syncStatusClass"
          :title="syncTip"
          data-testid="blog-sync-now"
          :disabled="syncBusy"
          @click="handleSyncNowClick"
        >
          <Icon name="cloud" :size="14" />
          <span class="ba-sync-text">{{ syncLabel }}</span>
        </button>
        <button
          type="button"
          class="ba-btn ba-btn-sm"
          data-testid="blog-open-settings"
          @click="settingsOpen = true"
        >
          <Icon name="cog" :size="14" />
          <span class="ba-settings-text">设置</span>
        </button>
      </div>
    </header>

    <div class="ba-body">
      <aside class="ba-sidebar" aria-label="博客管理功能导航">
        <nav class="ba-nav">
          <button
            type="button"
            class="ba-nav-collapse"
            :aria-expanded="!sidebarCollapsed"
            :title="sidebarCollapsed ? '展开菜单' : '收起菜单'"
            data-testid="blog-collapse-sidebar"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            <Icon :name="sidebarCollapsed ? 'chevron-right' : 'chevron-left'" :size="14" />
            <span class="ba-collapse-text">{{ sidebarCollapsed ? '展开' : '收起' }}</span>
          </button>

          <button
            v-for="item in menuItems"
            :key="item.key"
            type="button"
            class="ba-nav-item"
            :class="{ active: editingId === null && activePage === item.key }"
            :title="item.label"
            :data-testid="`blog-nav-${item.key}`"
            @click="selectPage(item.key)"
          >
            <span class="ba-nav-icon"><Icon :name="item.icon" :size="16" /></span>
            <span class="ba-nav-label">{{ item.label }}</span>
            <span v-if="item.count !== undefined" class="ba-nav-count">{{ item.count }}</span>
          </button>
        </nav>
      </aside>

      <main class="ba-content">
        <BlogEditor v-if="editingId" :article-id="editingId" @close="closeEditor" />
        <BlogPosts
          v-else-if="activePage === 'posts'"
          @edit="editArticle"
          @create="startNewArticle"
        />
        <BlogTrash v-else-if="activePage === 'trash'" @restore="selectPage('posts')" />
      </main>

      <BlogSettingsDialog v-if="settingsOpen" @close="settingsOpen = false" />
    </div>
  </div>
</template>

<style scoped>
.ba-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  min-height: 100vh;
  background-color: var(--color-bg, #f8fafc);
  color: var(--color-text, #0f172a);
}

/* ---------- 顶栏 ---------- */
.ba-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: nowrap;
  padding: 12px 16px;
  background-color: var(--color-bg-card, #ffffff);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.ba-topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
}

.ba-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ba-title {
  margin: 0;
  font-size: var(--font-size-xl, 18px);
  font-weight: var(--font-weight-semibold, 600);
  line-height: var(--line-height-tight, 1.3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-sub {
  margin: 0;
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-secondary, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  margin-left: auto;
  white-space: nowrap;
}

.ba-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: background-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    border-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    opacity 120ms ease;
}

.ba-btn:hover { background-color: var(--color-bg-hover, #f1f5f9); }

.ba-btn:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 2px;
}

.ba-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ba-btn-sm {
  min-height: 30px;
  padding: 0 10px;
  font-size: var(--font-size-xs, 12px);
}

/* 主操作与全局 .ui-btn--primary 同款（不复用类名是避免牵动全局按钮组） */
.ba-btn-primary {
  background-color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  color: #ffffff;
}

.ba-btn-primary:hover {
  background-color: var(--color-primary-hover, #2563eb);
  border-color: var(--color-primary-hover, #2563eb);
  color: #ffffff;
}

.ba-sync-btn {
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease, opacity 120ms ease;
}

.ba-sync-btn.ba-sync-btn-pending {
  background-color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  color: #ffffff;
  opacity: 0.88;
  cursor: progress;
}

.ba-sync-btn.ba-sync-btn-conflict {
  background-color: var(--color-warning, #f59e0b);
  border-color: var(--color-warning, #f59e0b);
  color: #ffffff;
}

.ba-sync-btn.ba-sync-btn-error {
  background-color: var(--color-error, #ef4444);
  border-color: var(--color-error, #ef4444);
  color: #ffffff;
}

/* ---------- 主体 ---------- */
.ba-body {
  display: flex;
  align-items: stretch;
  gap: 0;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.ba-sidebar {
  flex: 0 0 200px;
  width: 200px;
  padding: 12px 10px;
  background-color: var(--color-bg-card, #ffffff);
  border-right: 1px solid var(--color-border, #e2e8f0);
  position: sticky;
  top: 0;
  max-height: calc(100vh - 64px);
  overflow-y: auto;
}

.ba-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ba-nav-collapse {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-start;
  flex-shrink: 0;
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  margin-bottom: 4px;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background-color: transparent;
  color: var(--color-text-muted, #94a3b8);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
  cursor: pointer;
}

.ba-nav-collapse:hover { background-color: var(--color-bg-hover, #f1f5f9); }

.ba-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background-color: transparent;
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}

.ba-nav-item:hover { background-color: var(--color-bg-hover, #f1f5f9); }

.ba-nav-item:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: -2px;
}

.ba-nav-item.active {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-weight: var(--font-weight-medium, 500);
}

.ba-nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  color: inherit;
}

.ba-nav-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ba-nav-count {
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 999px;
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 11px);
}

/* 内容区即唯一滚动容器（与工作台合计 Teams 的滚动约定一致） */
.ba-content {
  flex: 1 1 auto;
  min-width: 0;
  padding: 16px clamp(12px, 2vw, 24px) 32px;
  overflow-y: auto;
}

/* ---------- 收起态 ---------- */
.ba-shell.is-collapsed .ba-sidebar {
  flex-basis: 56px;
  width: 56px;
  padding-left: 6px;
  padding-right: 6px;
}

.ba-shell.is-collapsed .ba-nav-label,
.ba-shell.is-collapsed .ba-nav-count,
.ba-shell.is-collapsed .ba-collapse-text {
  display: none;
}

.ba-shell.is-collapsed .ba-nav-item,
.ba-shell.is-collapsed .ba-nav-collapse {
  justify-content: center;
  padding: 0;
}

/* ---------- 移动端：菜单转顶部横滚，内容单列 ---------- */
@media (max-width: 768px) {
  .ba-body { flex-direction: column; }

  .ba-sidebar {
    position: static;
    flex: 0 0 auto;
    width: 100%;
    max-height: none;
    border-right: none;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
    overflow-x: auto;
    overflow-y: hidden;
  }

  .ba-nav { flex-direction: row; gap: 6px; }

  .ba-nav-collapse { display: none; }

  .ba-nav-item {
    flex: 0 0 auto;
    width: auto;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 999px;
  }

  .ba-shell.is-collapsed .ba-sidebar { flex-basis: auto; width: 100%; }
  .ba-shell.is-collapsed .ba-nav-item { padding: 0 14px; }
  .ba-shell.is-collapsed .ba-nav-label { display: block; }
  .ba-shell.is-collapsed .ba-nav-count { display: inline; }
  .ba-sub { display: none; }

  .ba-sync-text { display: none; }
  .ba-btn { min-height: 44px; padding: 0 16px; }
  .ba-btn-sm { min-height: 44px; padding: 0 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .ba-nav-item { transition: none; }
}
</style>
