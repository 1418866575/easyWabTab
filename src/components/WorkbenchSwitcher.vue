<script setup lang="ts">
// 左上角「工作台切换」命令面板（方案 B：Quick Switcher / 命令面板）。
// 全站 6 个视图（导航站 + 教师/个人工作台/销售记账/学生/智能工作台 + 工具箱页）共用本组件：
// 触发器显示当前页图标 + 名称，点击或 Alt+W 弹出居中浮层，输入即过滤，↑↓/Enter/Esc 键盘操作，
// Alt+1..9 直达第 N 个工作台。
// 交互范式对齐 SpotlightOverlay（Alt+K 全局搜索）：居中浮层 + 半透明遮罩 + Esc 关闭，
// 复用同一套键位（↑↓ 选择 / Enter 进入 / Esc 关闭），用户无需额外学习。
// 相比旧 WorkbenchManagePanel（下拉卡片面板）的变化：
//   1. 「下拉面板」→「命令面板」：新增搜索框、键盘导航、当前项高亮；
//   2. 原导航站左上角独立的「工具箱」跳转按钮合并进本面板（设置里的名称/图标/可见性开关沿用，
//      只是作用对象从"按钮"变成"面板里的一项"）；
//   3. 工具箱页原先只有「返回导航站」，现同样挂本组件，全站入口统一；
//   4. 已在目标页的工作台不再隐藏，改为"当前"徽标高亮，避免列表数量跳变。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { useAppSettingsStore } from '../stores/settings'

// 允许各工作台页面复用本组件：通过 props 自定义触发器图标（站点图标）/ 文字 / 强制显示，
// 从而与导航站「工作台管理」保持同一套面板与切换交互，仅触发器外观不同。
const props = withDefaults(defineProps<{
  /** 触发器自定义图标（图标库路径 / dataUrl）；空串回退到 triggerBuiltin */
  triggerIcon?: string
  /** 触发器内置图标名（无自定义图标时显示） */
  triggerBuiltin?: string
  /** 触发器文字；空串回退到 store.workbenchManageDisplayName */
  triggerLabel?: string
  /** 强制显示触发器（绕过「工作台管理」全局可见性开关），用于各工作台页面左上角 */
  forceShow?: boolean
}>(), {
  triggerIcon: '',
  triggerBuiltin: '',
  triggerLabel: '',
  forceShow: false
})

const router = useRouter()
const route = useRoute()
const store = useAppSettingsStore()

interface Entry {
  key: string
  path: string
  name: string
  /** 自定义图标（图标库路径 / dataUrl）；空串表示回退内置图标 */
  icon: string
  builtin: string
  /** 搜索关键词（含中英文别名，用户改过名称后仍可搜到） */
  kw: string
  visible: boolean
  /**
   * 「当前所在页」判定（缺省用 path 精确匹配 + 子路径前缀匹配）。
   * 博客前台需要排除 /blog/admin（那属博客后台），故显式给出。
   */
  isCurrentPath?: (p: string) => boolean
}

// 顺序与旧面板一致：导航站 → 教师台 → 个人工作台 → 销售记账 → 学生台 → 工具箱 → 智能工作台 → 博客后台 → 博客前台。
// 工具箱不再有"导航站页隐藏"的特殊规则——它现在是面板里的一项，独立按钮已移除。
// 博客两项由博客功能提交追加：写死名称与图标、暂无设置开关（见下方条目注释）。
const allEntries = computed<Entry[]>(() => [
  {
    key: 'nav',
    path: '/',
    name: '导航站',
    icon: store.siteFavicon || '',
    builtin: 'home',
    kw: '导航站 首页 home nav',
    visible: true
  },
  {
    key: 'teacher',
    path: '/teacher',
    name: store.teacherPageDisplayName,
    icon: store.teacherPageIcon,
    builtin: 'teacher',
    kw: '教师 teacher',
    visible: store.teacherPageVisible !== false
  },
  {
    key: 'workbench',
    path: '/workbench',
    name: store.workbenchPageDisplayName,
    icon: store.workbenchPageIcon,
    builtin: 'toolbox',
    kw: '个人工作台 workbench personal',
    visible: store.workbenchPageVisible !== false
  },
  {
    key: 'business',
    path: '/business',
    name: store.businessPageDisplayName,
    icon: store.businessPageIcon,
    builtin: 'store',
    kw: '销售记账 business 生意 摆摊',
    visible: store.businessPageVisible !== false
  },
  {
    key: 'student',
    path: '/student',
    name: store.studentPageDisplayName,
    icon: store.studentPageIcon,
    builtin: 'notes',
    kw: '学生 student',
    visible: store.studentPageVisible !== false
  },
  {
    key: 'toolbox',
    path: '/toolbox',
    name: store.toolboxButtonDisplayName,
    icon: store.toolboxButtonIcon,
    builtin: 'toolbox',
    kw: '工具箱 toolbox 工具',
    visible: store.toolboxButtonVisible !== false
  },
  {
    key: 'smart',
    path: '/smart',
    name: store.smartPageDisplayName,
    icon: store.smartPageIcon,
    builtin: 'lightbulb',
    kw: '智能工作台 smart 技能 提示词 工作流',
    visible: store.smartPageVisible !== false
  },
  {
    // 博客后台：数据走独立的 blog.json 云同步信封。
    // 与其它工作台不同——暂未纳入「导航设置 → 显示控制」的开关组（那需要新增 settings 字段并改动
    // workbench.json 信封结构，影响面较大），因此这里写死名称与图标，不做开关。
    // TODO: 若后续要开放「是否显示 / 改名 / 换图标」，需按新增 setting 字段的完整步骤同步改动 settings.ts。
    key: 'blog',
    path: '/blog/admin',
    name: '博客后台',
    icon: '',
    builtin: 'notes',
    kw: '博客后台 blog 管理 写作',
    visible: true
  },
  {
    // 博客前台（阅读器）：与后台同源数据（IndexedDB blog store），路由 /blog（列表）与
    // /blog/article/:slug（详情）。同样写死名称与图标，不做开关。
    key: 'blog-front',
    path: '/blog',
    name: '博客前台',
    icon: '',
    builtin: 'document',
    kw: '博客前台 blog 阅读 文章',
    visible: true,
    // /blog 与 /blog/article/* 算前台；/blog/admin 归后台条目，不能重复标「当前」
    isCurrentPath: (p) => p === '/blog' || (p.startsWith('/blog/') && !p.startsWith('/blog/admin'))
  }
])

const visibleEntries = computed<Entry[]>(() => allEntries.value.filter((e) => e.visible))

/** 当前所在工作台（用于"当前"徽章；不再隐藏，避免列表数量跳变） */
const currentKey = computed<string>(() => {
  const p = route.path
  const hit = visibleEntries.value.find((e) =>
    e.isCurrentPath
      ? e.isCurrentPath(p)
      : e.path === p || (e.path !== '/' && p.startsWith(`${e.path}/`))
  )
  return hit ? hit.key : ''
})

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const triggerRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)

const filtered = computed<Entry[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return visibleEntries.value
  return visibleEntries.value.filter((e) => e.name.toLowerCase().includes(q) || e.kw.toLowerCase().includes(q))
})

/** 当前选中项（安全取值：过滤结果变化 / 越界时返回 null，供 aria-activedescendant 与 Enter 使用） */
const activeEntry = computed<Entry | null>(() => filtered.value[activeIndex.value] ?? null)

/** Alt+1..9 的序号：按可见项顺序连续编号（被关闭的工作台不占号） */
function altIndexOf(entry: Entry): number {
  return visibleEntries.value.indexOf(entry) + 1
}

function isCurrent(entry: Entry): boolean {
  return entry.key === currentKey.value
}

/** 输入类元素判定：焦点在其中时不劫持快捷键，避免打断打字 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

async function openPalette(): Promise<void> {
  if (open.value) return
  query.value = ''
  activeIndex.value = 0
  open.value = true
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
}

function closePalette(): void {
  if (!open.value) return
  open.value = false
  query.value = ''
  triggerRef.value?.focus()
}

function togglePalette(): void {
  if (open.value) closePalette()
  else void openPalette()
}

function go(entry: Entry): void {
  open.value = false
  query.value = ''
  // 已在目标页时不再跳转（旧版直接隐藏该项，这里保留可见 + 徽章，点了也无副作用）
  if (entry.path !== route.path) void router.push(entry.path)
  triggerRef.value?.focus()
}

function scrollActiveIntoView(): void {
  listRef.value?.querySelector<HTMLElement>(`[data-idx="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' })
}

function move(dir: number): void {
  const n = filtered.value.length
  if (n === 0) return
  activeIndex.value = (activeIndex.value + dir + n) % n
  scrollActiveIntoView()
}

function selectActive(): void {
  if (activeEntry.value) go(activeEntry.value)
}

// 查询变化 → 选中项回到第一项（与 SpotlightOverlay 的"重置选中"同思路，但默认选中首项，
// 这样输完关键词直接回车即可进第一个结果）
watch(query, () => {
  activeIndex.value = 0
})

function handleKeydown(event: KeyboardEvent): void {
  const plainAlt = event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey

  // Alt+W：唤起 / 关闭命令面板（与 Alt+K 全局搜索、Alt+R 最近使用同族，互不冲突）
  if (plainAlt && event.key.toLowerCase() === 'w') {
    event.preventDefault()
    if (open.value) closePalette()
    else if (!isTypingTarget(event.target)) void openPalette()
    return
  }

  // Alt+1..9：直达第 N 个工作台（面板打开时数字用于输入过滤，不响应）
  if (plainAlt && !open.value && /^[1-9]$/.test(event.key)) {
    if (isTypingTarget(event.target)) return
    const entry = visibleEntries.value[Number(event.key) - 1]
    if (entry) {
      event.preventDefault()
      go(entry)
    }
    return
  }

  if (!open.value) return

  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      closePalette()
      break
    case 'ArrowDown':
      event.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      move(-1)
      break
    case 'Home':
      event.preventDefault()
      activeIndex.value = 0
      scrollActiveIntoView()
      break
    case 'End':
      event.preventDefault()
      activeIndex.value = Math.max(0, filtered.value.length - 1)
      scrollActiveIntoView()
      break
    case 'Enter':
      event.preventDefault()
      selectActive()
      break
    default:
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})

const triggerText = computed(() => props.triggerLabel || store.workbenchManageDisplayName)
const triggerTitle = computed(() => `${triggerText.value} · 点击或 Alt+W 切换工作台`)
</script>

<template>
  <div class="ws-root">
    <button
      v-if="props.forceShow || store.workbenchManageVisible !== false"
      ref="triggerRef"
      type="button"
      class="ws-trigger"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :title="triggerTitle"
      :aria-label="triggerTitle"
      data-testid="ws-trigger"
      @click="togglePalette"
    >
      <img v-if="props.triggerIcon" :src="props.triggerIcon" alt="" class="ws-trigger-img" data-testid="ws-trigger-icon" />
      <Icon v-else-if="props.triggerBuiltin" :name="props.triggerBuiltin" :size="16" class="ws-trigger-svg" />
      <img v-else-if="store.workbenchManageIcon" :src="store.workbenchManageIcon" alt="" class="ws-trigger-img" data-testid="ws-trigger-icon" />
      <span class="ws-trigger-label">{{ triggerText }}</span>
      <Icon name="chevron-down" :size="14" class="ws-trigger-caret" />
    </button>

    <Teleport to="body">
      <Transition name="ws-fade">
        <div
          v-if="open"
          class="ws-overlay"
          data-testid="ws-overlay"
          @click.self="closePalette"
        >
          <div class="ws-panel" role="dialog" aria-modal="true" aria-label="切换工作台" data-testid="ws-panel">
            <div class="ws-search">
              <Icon name="search" :size="18" class="ws-search-icon" />
              <input
                ref="inputRef"
                v-model="query"
                class="ws-input"
                data-testid="ws-input"
                type="text"
                placeholder="搜索工作台 / 工具…"
                spellcheck="false"
                role="combobox"
                aria-autocomplete="list"
                aria-controls="ws-listbox"
                :aria-expanded="true"
                :aria-activedescendant="activeEntry ? `ws-opt-${activeEntry.key}` : undefined"
              />
              <button class="ws-close-btn" data-testid="ws-close" title="关闭 (Esc)" @click="closePalette">
                <Icon name="close" />
              </button>
            </div>

            <div id="ws-listbox" ref="listRef" class="ws-list" role="listbox" aria-label="工作台列表">
              <button
                v-for="(entry, i) in filtered"
                :id="`ws-opt-${entry.key}`"
                :key="entry.key"
                type="button"
                class="ws-item"
                :class="{ active: i === activeIndex, current: isCurrent(entry) }"
                :data-idx="i"
                :data-testid="`ws-item-${entry.key}`"
                role="option"
                :aria-selected="i === activeIndex"
                @click="go(entry)"
                @mouseenter="activeIndex = i"
              >
                <span class="ws-item-icon">
                  <img v-if="entry.icon" :src="entry.icon" :alt="entry.name" class="ws-item-img" />
                  <Icon v-else :name="entry.builtin" :size="20" class="ws-item-svg" />
                </span>
                <span class="ws-item-name">{{ entry.name }}</span>
                <span v-if="isCurrent(entry)" class="ws-item-cur">当前</span>
                <span class="ws-item-kbd">Alt+{{ altIndexOf(entry) }}</span>
              </button>
              <p v-if="filtered.length === 0" class="ws-empty" data-testid="ws-empty">
                未找到「{{ query.trim() }}」相关的工作台
              </p>
            </div>

            <div class="ws-foot">
              <span><kbd class="ws-kbd">↑↓</kbd> 选择</span>
              <span><kbd class="ws-kbd">Enter</kbd> 进入</span>
              <span><kbd class="ws-kbd">Esc</kbd> 关闭</span>
              <span><kbd class="ws-kbd">Alt+W</kbd> 唤起</span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ws-root {
  display: inline-flex;
  align-items: center;
  /* 顶栏空间紧张时不被压缩（与 BusinessView 的原 :deep(.wmp-root){flex-shrink:0} 同意图，
     这里在组件内统一保证，各页面无需再单独覆盖） */
  flex: none;
}

/* 触发器：自包含基础样式，导航站与各工作台页面一致；chevron 暗示"可展开" */
.ws-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease;
}
.ws-trigger:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-border, #e2e8f0);
}
.ws-trigger-svg,
.ws-trigger-caret {
  color: currentColor;
  flex: none;
}
.ws-trigger-caret {
  opacity: 0.7;
}
.ws-trigger-label {
  white-space: nowrap;
}
.ws-trigger-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex: none;
  border-radius: 3px;
}

/* 浮层：范式对齐 SpotlightOverlay（居中 + 遮罩 + Esc 关闭），z-index 同为 3000 */
.ws-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 16px 16px;
  background-color: rgba(15, 23, 42, 0.45);
}

.ws-panel {
  width: min(520px, 100%);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 14px;
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  box-shadow: 0 24px 64px rgba(2, 6, 23, 0.35);
}

.ws-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}
.ws-search-icon {
  flex-shrink: 0;
  color: var(--color-text-secondary, #64748b);
}
.ws-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: var(--color-text, #1e293b);
}
.ws-input::placeholder {
  color: var(--color-text-secondary, #64748b);
}
.ws-close-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ws-list {
  overflow-y: auto;
  padding: 6px;
}
.ws-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s;
}
.ws-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
}
.ws-item.active {
  background-color: var(--color-primary-light, #eff6ff);
}
.ws-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 8px;
  background-color: var(--color-bg-hover, #f8fafc);
  overflow: hidden;
}
.ws-item-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.ws-item-svg {
  color: var(--color-primary, #3b82f6);
}
.ws-item-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--color-text, #1e293b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ws-item.current .ws-item-name {
  color: var(--color-primary, #3b82f6);
  font-weight: 500;
}
.ws-item-cur {
  flex: none;
  font-size: 11px;
  line-height: 1;
  padding: 3px 7px;
  border-radius: 999px;
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
}
.ws-item-kbd {
  flex: none;
  font-size: 11px;
  color: var(--color-text-secondary, #94a3b8);
}
.ws-empty {
  margin: 0;
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}

.ws-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 8px 14px;
  border-top: 1px solid var(--color-border, #e2e8f0);
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}
.ws-kbd {
  font-family: inherit;
  font-size: 11px;
  padding: 1px 5px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 4px;
  background-color: var(--color-bg-hover, #f8fafc);
}

.ws-fade-enter-active,
.ws-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.ws-fade-enter-from,
.ws-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 移动端：浮层更靠上、触控目标 ≥44px、隐藏快捷键提示（屏幕窄） */
@media (max-width: 768px), (pointer: coarse) {
  .ws-overlay {
    padding: 8vh 12px 12px;
  }
  .ws-item {
    min-height: 44px;
  }
  .ws-item-kbd {
    display: none;
  }
}

/* 暗色模式（跟随 SpotlightOverlay 的变量口径） */
html.dark .ws-overlay {
  background-color: rgba(2, 6, 23, 0.6);
}
html.dark .ws-panel {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
}
html.dark .ws-search,
html.dark .ws-foot {
  border-color: var(--color-border, #374151);
}
html.dark .ws-input {
  color: var(--color-text, #f9fafb);
}
html.dark .ws-item:hover {
  background-color: var(--color-bg-hover, #374151);
}
html.dark .ws-item.active {
  background-color: #1e3a5f;
}
html.dark .ws-item-name {
  color: var(--color-text, #f9fafb);
}
html.dark .ws-item.current .ws-item-name,
html.dark .ws-item-svg {
  color: #93c5fd;
}
html.dark .ws-item-cur {
  background-color: #1e3a5f;
  color: #93c5fd;
}
</style>
