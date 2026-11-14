<script setup lang="ts">
/**
 * 博客管理后台主视图（路由 /blog/admin）
 *
 * 布局与其它工作台一致：顶部工作台切换入口 + 云同步，左菜单 + 右内容。
 * 菜单项：文章 / 图库 / 回收站（图库紧随「文章」，管理正文内联图片与封面图）。
 * 「分类」「标签」「博客设置」统一收进右上角「设置」弹框（rail + 内容，对齐导航站设置模块）。
 * 「新建 / 编辑文章」不占路由：选中 editingId 时右侧内容区整块换成编辑器，
 * 关闭编辑器回到原菜单页（原型阶段不引入二级路由，避免与列表页状态互相打断）。
 *
 * 数据：src/stores/blog.ts → IndexedDB store 'blog' → 云同步走独立的 blog.json 信封。
 */
import { computed, onMounted, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import WorkbenchSwitcher from '@/components/WorkbenchSwitcher.vue'
import { useAppSettingsStore } from '@/stores/settings'
import { useBlogStore } from '@/stores/blog'
import { useCloudSync, type SyncStatus } from '@/composables/useCloudSync'
import { useToast } from '@/composables/useToast'
import BlogPosts from '@/components/blog/BlogPosts.vue'
import BlogEditor from '@/components/blog/BlogEditor.vue'
import BlogTrash from '@/components/blog/BlogTrash.vue'
import BlogGallery from '@/components/blog/BlogGallery.vue'
import BlogSettingsDialog from '@/components/blog/BlogSettingsDialog.vue'
import { useBlogSettingsDialog } from '@/composables/useBlogSettingsDialog'

type PageKey = 'posts' | 'gallery' | 'trash'

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
/** 移动端左侧抽屉：默认收起，由内容区页头菜单按钮唤出（与个人工作台同款） */
const mobileMenuOpen = ref(false)
function closeMobileMenu(): void {
  mobileMenuOpen.value = false
}
/** 正在编辑的文章 id；非空时右侧显示编辑器而非菜单对应面板 */
const editingId = ref<string | null>(null)
/** 设置弹框是否打开（设置入口在侧栏底部，与云同步同一行） */
const { showBlogSettings, openBlogSettings, closeBlogSettings } = useBlogSettingsDialog()

const menuItems = computed<MenuItem[]>(() => [
  { key: 'posts', label: '文章', icon: 'notes', count: store.counts.all },
  { key: 'gallery', label: '图库', icon: 'image', count: store.images.length },
  { key: 'trash', label: '回收站', icon: 'trash', count: store.counts.trash }
])

/** 面板页头：大标题 + 副标题（参考稿「添加 App」页的信息结构） */
const pageHead = computed(() => {
  switch (activePage.value) {
    case 'gallery':
      return { title: '图库', sub: '管理正文与封面图片，可分类与批量整理' }
    case 'trash':
      return { title: '回收站', sub: '已删除文章在此保留 7 天，可恢复或彻底删除' }
    default:
      return { title: '文章', sub: '写作、发布与共享，博客的全部内容都在这里' }
  }
})

/** 图库主操作（上传图片）在页头触发，由面板暴露方法 */
const galleryRef = ref<{ openUpload: () => void } | null>(null)

function selectPage(key: PageKey): void {
  activePage.value = key
  editingId.value = null
  // 抽屉里点菜单后自动收起，否则选中项被遮罩挡着看不到
  closeMobileMenu()
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
    <!-- 无全局顶栏：工作台切换入口、云同步与设置全部收进左侧菜单（对齐个人工作台） -->
    <div class="ba-body">
      <nav class="ba-sidebar" :class="{ open: mobileMenuOpen }" aria-label="博客管理功能导航">
        <!-- 侧栏顶部：工作台切换入口（原在全局顶栏） -->
        <div class="ba-side-top">
          <div class="ba-side-switch">
            <WorkbenchSwitcher
              :trigger-icon="settingsStore.blogAdminPageIcon"
              trigger-builtin="notes"
              :trigger-label="settingsStore.blogAdminPageDisplayName"
              force-show
            />
          </div>
        </div>

        <div class="ba-nav">
          <button
            type="button"
            class="tw-btn tw-btn-sm ba-nav-collapse"
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
        </div>

        <!-- 侧栏底部恒定两枚：云同步 / 设置（原在顶栏右侧），同一行等宽、纯文字 -->
        <div class="ba-side-foot" data-testid="ba-side-foot">
          <button
            type="button"
            class="ba-btn ba-btn-sm ba-sync-btn ba-side-btn ui-btn--pill"
            :class="syncStatusClass"
            :title="syncTip"
            :aria-label="syncLabel"
            data-testid="blog-sync-now"
            :disabled="syncBusy"
            @click="handleSyncNowClick"
          >
            <span class="ba-side-btn-ic" aria-hidden="true"><Icon name="cloud" :size="14" /></span>
            <span class="ba-side-btn-text">云同步</span>
          </button>
          <button
            type="button"
            class="ba-btn ba-btn-sm ba-side-btn ui-btn--pill"
            data-testid="blog-open-settings"
            @click="openBlogSettings(); closeMobileMenu()"
          >
            <span class="ba-side-btn-ic" aria-hidden="true"><Icon name="cog" :size="14" /></span>
            <span class="ba-side-btn-text">设置</span>
          </button>
        </div>
      </nav>

      <!-- 移动端抽屉遮罩：层级低于抽屉（46）、高于内容区 -->
      <div v-if="mobileMenuOpen" class="ba-scrim" data-testid="ba-menu-scrim" @click="closeMobileMenu"></div>

      <main class="ba-content">
        <button class="ba-menu-trigger" data-testid="ba-menu-trigger" title="全部菜单" aria-label="打开全部菜单" @click="mobileMenuOpen = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <!-- 面板页头：标题 + 副标题 + 该面板的主操作（编辑器打开时不显示） -->
        <header v-if="!editingId" class="ba-page-head" data-testid="blog-page-head">
          <div class="ba-page-head-text">
            <h1 class="ba-page-title">{{ pageHead.title }}</h1>
            <p class="ba-page-sub">{{ pageHead.sub }}</p>
          </div>
          <div class="ba-page-actions">
            <button
              v-if="activePage === 'posts'"
              type="button"
              class="ui-btn ui-btn--primary"
              data-testid="blog-posts-create"
              @click="startNewArticle"
            >
              写文章
            </button>
            <button
              v-else-if="activePage === 'gallery'"
              type="button"
              class="ui-btn ui-btn--primary"
              data-testid="blog-gallery-upload"
              @click="galleryRef?.openUpload()"
            >
              上传图片
            </button>
          </div>
        </header>

        <BlogEditor v-if="editingId" :article-id="editingId" @close="closeEditor" />
        <BlogPosts
          v-else-if="activePage === 'posts'"
          @edit="editArticle"
          @create="startNewArticle"
        />
        <BlogGallery v-else-if="activePage === 'gallery'" ref="galleryRef" />
        <BlogTrash v-else-if="activePage === 'trash'" @restore="selectPage('posts')" />
      </main>

      <BlogSettingsDialog v-if="showBlogSettings" @close="closeBlogSettings" />
    </div>
  </div>
</template>

<style scoped>
.ba-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  min-height: 100vh;
  background-color: var(--ds-bg, #f7f8fa);
  color: var(--ds-text);
}

/* 顶栏已取消：工作台切换入口、云同步、设置全部收进左侧菜单（对齐个人工作台） */

.ba-btn {display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--ds-line, #ececf0);
  border-radius: 999px;
  background-color: var(--ds-card, #ffffff);
  color: var(--ds-text);
  font-family: inherit;
  font-size: var(--fs-caption, 12px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: background-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    border-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    opacity 120ms ease;}

.ba-btn:hover { background-color: var(--color-bg-hover, #f1f5f9); }

.ba-btn:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 2px;
}

.ba-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ba-btn-sm {height: 36px;
  padding: 0 var(--space-3);
  font-size: var(--font-size-xs, 12px);}

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
  /* 移动端抽屉以主体为定位包含块 */
  position: relative;
}

/* 侧栏：顶部切换入口 / 中部菜单 / 底部两枚按钮，与个人工作台 .wb-menu 同构 */
.ba-sidebar {
  flex: 0 0 200px;
  width: 200px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  background-color: var(--ds-card, #ffffff);
  border-right: 1px solid var(--ds-line, #ececf0);
  transition: width 0.2s ease;
}

.ba-side-top { flex: none; padding: 10px 8px 2px; }
.ba-side-switch { margin-bottom: 6px; }
.ba-side-switch :deep(.ws-root) { display: flex; width: 100%; }
.ba-side-switch :deep(.ws-trigger) {
  width: 100%; height: 34px; gap: 8px; padding: 0 8px 0 10px;
  border-color: transparent; border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-hover); color: var(--color-text-secondary);
  font-size: var(--fs-caption);
}
.ba-side-switch :deep(.ws-trigger-label) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }

.ba-nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 8px 8px;
}

/* 底部恒定两枚：同一行、等宽、展开态只显示纯文字；状态靠 title / aria-label / 底色 */
.ba-side-foot {
  flex: none;
  display: flex;
  flex-direction: row;
  gap: 6px;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--ds-line, #ececf0);
}
.ba-side-btn {
  flex: 1 1 0;
  min-width: 0;
  height: 32px;
  padding: 0 6px;
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-hover);
  color: var(--color-text-secondary);
}
.ba-side-btn:hover { background-color: var(--color-bg-hover); color: var(--ds-text); }
.ba-side-btn-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* 图标只留给折叠态，展开态保持纯文字 */
.ba-side-btn-ic { display: none; flex: none; color: var(--color-primary); }

/* 桌面不渲染移动端抽屉的两个入口（窄端媒体查询放在其后，后声明胜出） */
.ba-scrim, .ba-menu-trigger { display: none; }

/* 收起 / 展开：外观复用教师台 `.tw-btn .tw-btn-sm`（白底描边胶囊、30px 高、12px/500、
   hover 只变底色），本类只留布局——整行铺满 + 左对齐 + 与菜单项同宽。
   与个人/销售工作台的 .wb-sidebar-toggle / .bs-sidebar-toggle 同一套取值，
   本地再写圆角/字号/边框就会在 scoped 里压掉 .tw-btn，等于又开一条轨道。 */
.ba-nav-collapse {
  display: flex;
  width: 100%;
  flex-shrink: 0;
  justify-content: flex-start;
  margin-bottom: var(--space-1);
}

.ba-nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background-color: transparent;
  color: var(--ds-text);
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
  background-color: var(--ds-primary-soft, #eff6ff);
  color: var(--ds-primary-text);
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
  border-radius: var(--ds-radius-pill, 999px);
  background-color: var(--ds-card-2, #f7f8fa);
  color: var(--ds-text-3);
  font-size: var(--font-size-xs, 11px);
}

/* 内容区即唯一滚动容器（与工作台合计 Teams 的滚动约定一致） */
.ba-content {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--space-4, 16px) clamp(12px, 2vw, 24px) 32px;
  overflow-y: auto;
}

/* ---------- 面板页头：大标题 + 副标题 + 主操作（参考稿信息结构） ---------- */
.ba-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ds-gap-card, 16px);
  flex-wrap: wrap;
  margin-bottom: var(--ds-gap-card, 16px);
}

.ba-page-title {
  margin: 0;
  font-size: var(--ds-fs-title, 24px);
  font-weight: var(--font-weight-bold, 700);
  line-height: 1.3;
  color: var(--ds-text);
}

.ba-page-sub {
  margin: var(--space-1) 0 0;
  font-size: var(--ds-fs-body-sm, 13px);
  color: var(--ds-text-3);
}

.ba-page-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

/* ---------- 桌面折叠态：60px 图标条，底部两枚按钮降级为纯图标 ---------- */
.ba-shell.is-collapsed .ba-sidebar {
  flex-basis: 56px;
  width: 56px;
  /* 留白放在侧栏本身（与教师/销售/学生/智能台一致），胶囊恒为 43px；
     放到内层 .ba-nav 会让 probe-sidebar-collapse 的「侧栏内容宽」比对失配。 */
  padding-left: 6px;
  padding-right: 6px;
}
.ba-shell.is-collapsed .ba-side-top { padding: 8px 0; }
.ba-shell.is-collapsed .ba-side-switch { margin-bottom: 4px; }
.ba-shell.is-collapsed .ba-side-switch :deep(.ws-trigger) { height: 32px; padding: 0; justify-content: center; }
.ba-shell.is-collapsed .ba-side-switch :deep(.ws-trigger-label),
.ba-shell.is-collapsed .ba-side-switch :deep(.ws-trigger-caret) { display: none; }
.ba-shell.is-collapsed .ba-nav { padding: 8px 0; }
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
.ba-shell.is-collapsed .ba-side-foot { padding: 8px 0; gap: 4px; }
.ba-shell.is-collapsed .ba-side-btn { padding: 0; gap: 0; }
.ba-shell.is-collapsed .ba-side-btn-text { display: none; }
.ba-shell.is-collapsed .ba-side-btn-ic { display: inline-flex; }

/* ---------- 移动端：左侧抽屉（默认收起 → 页头按钮唤出 → 遮罩关闭），不再有顶部横滚标签栏 ---------- */
@media (max-width: 768px) {
  .ba-sidebar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 46;
    width: min(264px, 82%);
    transform: translateX(-102%);
    transition: transform 220ms ease;
    border-right: 1px solid var(--ds-line, #ececf0);
    box-shadow: 2px 0 12px var(--color-shadow, rgba(0, 0, 0, 0.12));
  }
  .ba-sidebar.open { transform: none; }

  /* 抽屉里忽略桌面折叠态，切换入口、菜单文字与底部文案全部恢复 */
  .ba-shell.is-collapsed .ba-sidebar { flex-basis: auto; width: min(264px, 82%); padding-left: 0; padding-right: 0; }
  .ba-shell.is-collapsed .ba-side-top { padding: 10px 8px 2px; }
  .ba-shell.is-collapsed .ba-side-switch :deep(.ws-trigger) { height: 34px; padding: 0 8px 0 10px; justify-content: flex-start; }
  .ba-shell.is-collapsed .ba-side-switch :deep(.ws-trigger-label),
  .ba-shell.is-collapsed .ba-side-switch :deep(.ws-trigger-caret) { display: inline; }
  .ba-shell.is-collapsed .ba-nav { padding: 2px 8px 8px; }
  .ba-shell.is-collapsed .ba-nav-item { justify-content: flex-start; padding: 0 10px; }
  .ba-shell.is-collapsed .ba-nav-label { display: block; }
  .ba-shell.is-collapsed .ba-nav-count { display: inline; }
  /* 抽屉里折叠按钮点了也不会有视觉变化 → 隐藏，避免出现死按钮 */
  .ba-nav-collapse, .ba-shell.is-collapsed .ba-nav-collapse { display: none; }

  .ba-nav-item { min-height: 44px; min-width: 44px; }
  .ba-nav-label { overflow: visible; text-overflow: clip; }

  /* 底部两枚恒定同一行、纯文字、40px 触控目标 */
  .ba-shell.is-collapsed .ba-side-foot { padding: 8px 10px 10px; gap: 6px; }
  .ba-shell.is-collapsed .ba-side-btn { padding: 0 6px; gap: 6px; }
  .ba-side-btn { height: 40px; min-height: 40px; }
  .ba-side-btn-text, .ba-shell.is-collapsed .ba-side-btn-text { display: inline; }
  .ba-side-btn-ic, .ba-shell.is-collapsed .ba-side-btn-ic { display: none; }

  /* 遮罩低于抽屉（46）、高于内容区 */
  .ba-scrim {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 45;
    background: rgba(15, 23, 42, .32);
  }

  .ba-menu-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: flex-start;
    width: 32px;
    height: 32px;
    flex: none;
    position: sticky;
    top: 0;
    z-index: 20;
    margin-bottom: 8px;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: var(--radius-sm, 4px);
    background-color: var(--ds-card, #ffffff);
    color: var(--color-text-secondary);
  }

  /* 博客后台没有悬浮 FAB，底部只留常规呼吸空间 + 系统手势安全区 */
  .ba-content {
    padding: 12px 12px calc(24px + env(safe-area-inset-bottom, 0px));
  }

  html.dark .ba-sidebar {
    border-right-color: var(--ds-line, #374151);
    box-shadow: 2px 0 16px var(--color-shadow, rgba(0, 0, 0, 0.4));
  }
}

@media (prefers-reduced-motion: reduce) {
  .ba-nav-item { transition: none; }
}
</style>
