<script setup lang="ts">
/**
 * 个人图书馆书架首页（路由 /books）
 *
 * 数据来源两处合并：
 *   1. 静态书：`fetch('/books/manifest.json')`（由 scripts/gen-books-manifest.cjs 构建期生成）
 *   2. 本机上传：IndexedDB `books` store（booksUpload.ts）
 * 偏好（收藏/最近/次数/书签）：IndexedDB `nav` 的 books-prefs 键。
 *   其中**收藏 + 用户自建书签**经 books.json 信封进云同步；阅读位置/最近/次数/上传书为设备级。
 *
 * 性能关键：列表**只读 manifest，绝不 fetch 任何 HTML 正文** ——
 * 单本书动辄 30 万~60 万字符，预加载会直接拖垮首屏。HTML 直到点击那一刻才取。
 *
 * 打开方式两条路：
 *   - 「打开」→ 新标签 window.open（主路径，独立上下文加载最快）
 *   - 「站内阅读」→ /books/read/:id（iframe，**只有这条路能记录阅读位置**）
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import BookCard from '@/components/books/BookCard.vue'
import BookSearchBar from '@/components/books/BookSearchBar.vue'
import BookCategoryTabs from '@/components/books/BookCategoryTabs.vue'
import BookUploadDialog from '@/components/books/BookUploadDialog.vue'
import BookBookmarkDialog from '@/components/books/BookBookmarkDialog.vue'
import BookSyncButton from '@/components/books/BookSyncButton.vue'
import WorkbenchSwitcher from '@/components/WorkbenchSwitcher.vue'
import { useAppSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'
import {
  BOOK_SORTS,
  categoryList,
  filterBooks,
  matchKeyword,
  normalizeBooks,
  paginate,
  safePage,
  sortBooks,
  type BookItem,
  type BookSort
} from '@/composables/booksCore'
import { useBooksPrefs, flushBooksPrefs } from '@/composables/useBooksPrefs'
import { listUploadedBooks, makeUploadObjectUrl, uploadedToBookItem } from '@/composables/booksUpload'
import type { UploadedBook } from '@/composables/booksUpload'
import '@/styles/books.css'

const router = useRouter()
const toast = useToast()
const prefs = useBooksPrefs()
// 顶栏工作台切换器的图标/名称走设置里的 booksPage* 三件套（与导航站入口同一份配置）
const settingsStore = useAppSettingsStore()
// 书架固定卡片视图（用户 2026-10-13 明确要求）：不放列表视图，也不做视图切换按钮。
// 故这里不再引入 useViewMode —— 没有第二种视图，就不需要视图状态。

/** ---------- 状态 ---------- */
const staticBooks = ref<BookItem[]>([])
const uploads = ref<UploadedBook[]>([])
const loading = ref(true)
const loadError = ref('')
const page = ref(1)
const pageSize = 12
const uploadOpen = ref(false)
const bookmarkOpen = ref(false)

const keyword = ref('')
const activeCategory = ref('')
const sort = ref<BookSort>('recent-desc')
const favoritesOnly = ref(false)

/** 静态书 + 上传书合并成一份书架 */
const allBooks = computed<BookItem[]>(() => [
  ...staticBooks.value,
  ...uploads.value.map((u) => uploadedToBookItem(u))
])

/** 全部书名（静态书 + 本机上传），供「添加书签」弹框的书名输入框自动补全 */
const allBookTitles = computed<string[]>(() =>
  allBooks.value.map((b) => b.title).filter((t): t is string => !!t)
)

const categories = computed(() => categoryList(allBooks.value))
const hasFilter = computed(
  () => !!keyword.value.trim() || !!activeCategory.value || favoritesOnly.value
)

/** 筛选条件对象：多处复用，避免「顶部分区忘了跟筛选走」这类分叉 */
const filterState = computed(() => ({
  keyword: keyword.value,
  category: activeCategory.value,
  favoritesOnly: favoritesOnly.value,
  /** 「仅书签」筛选已从 UI 移除（用户 2026-10-13 要求），此处恒为 false 保留类型兼容 */
  bookmarkedOnly: false
}))

/** 过滤 → 排序。收藏/书签的集合判断都走 booksCore 的纯函数 */
const filtered = computed(() => {
  const f = filterBooks(allBooks.value, filterState.value, {
    favorites: prefs.favorites.value,
    bookmarked: prefs.bookmarkedIds()
  })
  return sortBooks(f, sort.value, {
    clicks: prefs.clicks.value,
    recent: prefs.recent.value
  })
})

/**
 * 分区去重：同一本书只应出现一次。
 *
 * 优先级 = 用户关心的顺序：收藏 > 最近阅读 > 全部书籍。
 * 三处都要去，缺一处就会重复 —— 只在「全部书籍」里排除是**不够**的：
 * 一本已收藏且刚读过的书会同时出现在「收藏」和「最近阅读」两个分区里。
 *
 * 顶部分区也要遵守筛选条件：勾了「仅收藏」就不该再冒出一个非收藏的「最近阅读」分区。
 *
 * 下面按「原始集合 → 可见集合 → 去重 → 分页」的顺序排列：派生的 computed 必须
 * 写在它依赖的 computed 之后，否则读代码时得往回翻才能确认谁是谁。
 */
const recentBooks = computed(() => {
  const byId = new Map(allBooks.value.map((b) => [b.id, b]))
  return prefs
    .recentIds()
    .map((id) => byId.get(id))
    .filter((b): b is BookItem => !!b)
})

const favoriteBooks = computed(() => {
  const byId = new Map(allBooks.value.map((b) => [b.id, b]))
  return prefs.favorites.value
    .map((id) => byId.get(id))
    .filter((b): b is BookItem => !!b)
})

/** 收藏分区也遵守关键词/分类/书签筛选；「仅收藏」开关本身除外，否则会自我过滤为空 */
const favoriteBooksVisible = computed(() =>
  favoriteBooks.value.filter(
    (b) =>
      filterBooks(
        [b],
        { ...filterState.value, favoritesOnly: false },
        { favorites: prefs.favorites.value, bookmarked: prefs.bookmarkedIds() }
      ).length > 0
  )
)

/** 最近阅读排除收藏（收藏是主动行为，优先级更高） */
const favoritedIds = computed(() => new Set(favoriteBooksVisible.value.map((b) => b.id)))
const recentBooksVisible = computed(() =>
  recentBooks.value.filter((b) => !favoritedIds.value.has(b.id) && matchKeyword(b, keyword.value) && (!activeCategory.value || b.category === activeCategory.value))
)

/** 全部书籍里排除上面两者 */
const topSectionIds = computed(
  () => new Set([...favoriteBooksVisible.value, ...recentBooksVisible.value].map((b) => b.id))
)
const mainBooks = computed(() => filtered.value.filter((b) => !topSectionIds.value.has(b.id)))

/** 全书累计打开次数（分区头右侧「累计阅读 N 次」用） */
const totalClicks = computed(() =>
  Object.values(prefs.clicks.value).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0)
)

const SORT_LABEL: Record<BookSort, string> = {
  'recent-desc': '最近打开',
  'clicks-desc': '打开次数',
  'title-asc': '标题 A→Z',
  'title-desc': '标题 Z→A',
  'updated-desc': '最近更新',
  'size-desc': '体积'
}

/** 分区头副标题：「N 本 · 按XX排序」，与工具箱同款信息密度 */
const mainBooksSub = computed(
  () => `${mainBooks.value.length} 本 · 按${SORT_LABEL[sort.value]}排序`
)

/** 当前页数据；筛选变化导致总数减少时页码收敛（watch 里处理） */
const paged = computed(() => paginate(mainBooks.value, page.value, pageSize))

/** 用户自建书签数量（右上角书签按钮的徽标用） */
const bookmarkCount = computed(() => prefs.userBookmarks.value.length)

/** ---------- 数据装载 ---------- */
async function loadStaticBooks(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}books/manifest.json`, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.json()
    staticBooks.value = normalizeBooks(raw)
  } catch (e) {
    loadError.value = `书架清单读取失败：${(e as Error)?.message ?? e}`
    console.warn('[books] manifest 加载失败:', e)
  }
}

async function loadUploads(): Promise<void> {
  uploads.value = await listUploadedBooks()
}

async function reloadAll(): Promise<void> {
  await Promise.all([loadStaticBooks(), loadUploads(), prefs.initBooksPrefs()])
  loading.value = false
}

/** ---------- 打开动作 ---------- */
/**
 * 取这本书**当前这一刻**可用的 URL。
 *
 * 静态书直接用 entry；上传书要现生成 blob URL —— blob URL 的生命周期跟着文档走，
 * 提前生成并缓存必然失效（刷新后旧 URL 全部指向死资源），所以只能现场造。
 */
async function resolveUrl(book: BookItem): Promise<string> {
  if (book.source === 'static') return book.entry
  const u = uploads.value.find((x) => x.id === book.id)
  if (!u) {
    toast.error(`找不到《${book.title}》的上传内容`)
    return ''
  }
  try {
    return await makeUploadObjectUrl(u.html)
  } catch (e) {
    toast.error(`打开失败：${(e as Error)?.message ?? e}`)
    return ''
  }
}

/** 新标签打开（主路径） */
async function onOpen(book: BookItem): Promise<void> {
  if (!book.entry && book.source === 'static') {
    toast.error(`《${book.title}》缺少可打开的地址`)
    return
  }
  const url = await resolveUrl(book)
  if (!url) return
  prefs.markOpened(book.id)
  window.open(url, '_blank')
}

/** 进站内阅读页（唯一能记录阅读位置的路径） */
async function onRead(book: BookItem): Promise<void> {
  prefs.markOpened(book.id)
  void router.push({ path: '/books/read', query: { id: book.id } })
}

function onToggleFav(book: BookItem): void {
  const now = prefs.toggleFavorite(book.id)
  toast.info(now ? `已收藏《${book.title}》` : `已取消收藏《${book.title}》`)
}

/** ---------- 筛选重置 ---------- */
function resetFilterState(): void {
  keyword.value = ''
  activeCategory.value = ''
  favoritesOnly.value = false
  page.value = 1
}

function onSelectCategory(name: string): void {
  activeCategory.value = name
  page.value = 1
}

/** 关键词变化防抖回页首（避免每敲一个字就重置分页） */
let kwTimer: ReturnType<typeof setTimeout> | null = null
watch(keyword, () => {
  if (kwTimer) clearTimeout(kwTimer)
  kwTimer = setTimeout(() => {
    page.value = 1
  }, 220)
})

function onKeyword(v: string): void {
  keyword.value = v
}

function onSortChange(e: Event): void {
  sort.value = (e.target as HTMLSelectElement).value as BookSort
  page.value = 1
}

/** 清空全部打开次数（连同最近阅读时间一起抹掉，"按最近打开"排序才有意义） */
function resetClicks(): void {
  if (!window.confirm('清空全部打开次数与最近阅读记录？此操作不可撤销。')) return
  for (const b of allBooks.value) prefs.forgetBook(b.id)
  prefs.flushBooksPrefs()
  toast.success('已重置统计')
}

/** 筛选/排序变化时页码收敛到合法范围（总数变少导致当前页越界） */
watch([mainBooks, page], () => {
  const p = safePage(page.value, mainBooks.value.length, pageSize)
  if (p !== page.value) page.value = p
})

function onUploadChanged(): void {
  void loadUploads()
}

onMounted(() => {
  void reloadAll()
})

onUnmounted(() => {
  flushBooksPrefs()
  if (kwTimer) clearTimeout(kwTimer)
})
</script>

<template>
  <!-- 顶部栏：与工具箱页 / 博客后台同构 —— 左=工作台切换命令面板（Alt+W），右=上传。
       force-show 是因为本页的入口开关管的是「面板里那一项」，不该把本页自己的顶栏也一起藏掉。 -->
  <header class="bk-topbar">
    <WorkbenchSwitcher
      :trigger-icon="settingsStore.booksPageIcon"
      trigger-builtin="document"
      :trigger-label="settingsStore.booksPageDisplayName"
      force-show
    />
    <div class="bk-topbar-right">
      <button
        type="button"
        class="ui-btn ui-btn--sm"
        data-testid="bk-open-bookmark"
        title="添加书签"
        @click="bookmarkOpen = true"
      >
        <span class="bk-top-btn-icon" aria-hidden="true">🔖</span>
        <span>书签</span>
        <span v-if="bookmarkCount > 0" class="bk-top-btn-badge" data-testid="bk-bookmark-count">
          {{ bookmarkCount }}
        </span>
      </button>
      <button
        v-if="totalClicks > 0"
        type="button"
        class="bk-mini-btn"
        data-testid="bk-reset-clicks"
        @click="resetClicks"
      >
        重置统计
      </button>
      <BookSyncButton />
      <button
        type="button"
        class="ui-btn ui-btn--sm ui-btn--primary"
        data-testid="bk-open-upload"
        @click="uploadOpen = true"
      >
        上传书籍
      </button>
    </div>
  </header>

  <main class="bk-shell">
    <!-- 搜索框（父容器内居中）+ 分类页签：布局与工具箱一致 -->
    <BookSearchBar
      :model-value="keyword"
      placeholder="搜索书名、简介、分类或标签…"
      @update:model-value="onKeyword"
      @clear="keyword = ''"
    />

    <BookCategoryTabs
      :model-value="activeCategory"
      :categories="categories"
      :total-count="allBooks.length"
      @update:model-value="onSelectCategory"
    />

    <!-- 次级控制（排序 / 仅收藏 / 清空筛选）：
         与工具箱一致不占独立一行，压在下方分区头的 extra 槽位里。
         「仅书签」筛选已移除（用户 2026-10-13 要求）。 -->
    <div class="bk-subbar" data-testid="bk-subbar">
      <label class="bk-subbar-field">
        排序
        <select
          class="bk-sort"
          :value="sort"
          data-testid="bk-sort"
          @change="onSortChange"
        >
          <option v-for="s in BOOK_SORTS" :key="s.value" :value="s.value">
            按{{ s.label }}
          </option>
        </select>
      </label>

      <button
        type="button"
        class="bk-chip"
        :class="{ 'is-on': favoritesOnly }"
        data-testid="bk-filter-fav"
        :aria-pressed="favoritesOnly"
        @click="favoritesOnly = !favoritesOnly; page = 1"
      >
        ★ 仅收藏
      </button>
      <button
        v-if="hasFilter"
        type="button"
        class="bk-mini-btn"
        data-testid="bk-clear"
        @click="resetFilterState"
      >
        清空筛选
      </button>
    </div>

    <div v-if="loadError" class="bk-empty" data-testid="bk-load-error">
      {{ loadError }}
      <p class="bk-empty-hint">
        可能是还没生成清单：在项目根目录执行 <code>npm run gen:books</code> 后刷新。
      </p>
    </div>

    <div v-else-if="loading" class="bk-empty" data-testid="bk-loading">正在装载书架…</div>

    <!-- 收藏 / 最近阅读分区：空时自动隐藏 -->
    <section v-if="favoriteBooksVisible.length && !favoritesOnly" class="bk-section" data-testid="bk-fav-section">
      <header class="bk-section-head">
        <h2 class="bk-section-title">★ 我的收藏</h2>
        <span class="bk-section-sub">{{ favoriteBooksVisible.length }} 本</span>
      </header>
      <div class="bk-grid">
        <BookCard
          v-for="b in favoriteBooksVisible"
          :key="`fav-${b.id}`"
          :book="b"
          :favorite="true"
          :recent-ts="prefs.recent.value[b.id] ?? 0"
          :click-count="prefs.clicks.value[b.id] ?? 0"
          :bookmark="prefs.getBookmark(b.id)"
          @open="onOpen"
          @read="onRead"
          @toggle-fav="onToggleFav"
        />
      </div>
    </section>

    <section v-if="recentBooksVisible.length" class="bk-section" data-testid="bk-recent-section">
      <header class="bk-section-head">
        <h2 class="bk-section-title">🕘 最近阅读</h2>
        <span class="bk-section-sub">{{ recentBooksVisible.length }} 本</span>
      </header>
      <div class="bk-grid">
        <BookCard
          v-for="b in recentBooksVisible"
          :key="`recent-${b.id}`"
          :book="b"
          :favorite="prefs.isFavorite(b.id)"
          :recent-ts="prefs.recent.value[b.id] ?? 0"
          :click-count="prefs.clicks.value[b.id] ?? 0"
          :bookmark="prefs.getBookmark(b.id)"
          @open="onOpen"
          @read="onRead"
          @toggle-fav="onToggleFav"
        />
      </div>
    </section>

    <!-- 全部书籍（排除已在顶部收藏/最近分区展示过的书，避免同一本出现三次） -->
    <section v-if="mainBooks.length > 0" class="bk-section">
      <!-- 分区头始终显示：它同时承载「N 本 · 按XX排序」这行统计（与工具箱一致） -->
      <header class="bk-section-head">
        <h2 class="bk-section-title">{{ hasFilter ? '其它筛选结果' : '全部书籍' }}</h2>
        <span class="bk-section-sub">{{ mainBooksSub }}</span>
        <span class="bk-section-extra">
          <span v-if="totalClicks > 0" class="bk-hits-total">累计阅读 {{ totalClicks }} 次</span>
        </span>
      </header>

      <div class="bk-grid">
        <BookCard
          v-for="b in paged"
          :key="b.id"
          :book="b"
          :favorite="prefs.isFavorite(b.id)"
          :recent-ts="prefs.recent.value[b.id] ?? 0"
          :click-count="prefs.clicks.value[b.id] ?? 0"
          :bookmark="prefs.getBookmark(b.id)"
          @open="onOpen"
          @read="onRead"
          @toggle-fav="onToggleFav"
        />
      </div>

      <div v-if="mainBooks.length > pageSize" class="bk-pager">
        <el-pagination
          :current-page="page"
          :page-size="pageSize"
          :total="mainBooks.length"
          layout="total, prev, pager, next"
          background
          small
          prev-text="上一页"
          next-text="下一页"
          data-testid="bk-pagination"
          @current-change="page = $event"
        />
      </div>
    </section>

    <div v-else-if="!loading && !loadError && filtered.length === 0" class="bk-empty" data-testid="bk-empty">
      <template v-if="hasFilter">没有符合条件的书，试试调整筛选条件或清空筛选。</template>
      <template v-else>
        书架还是空的。把 HTML 放进 <code>public/books/&lt;书名&gt;/index.html</code>
        后执行 <code>npm run gen:books</code>，或直接点右上角「上传书籍」放到本机。
      </template>
    </div>

    <!-- BaseDialog 自身**没有**显示开关（它总是渲染遮罩），必须由调用方用 v-if 挂载。
     少了这层：弹框关闭后 .bd-overlay 仍在，position:fixed 铺满视口并拦截全页点击。 -->
    <BookUploadDialog
      v-if="uploadOpen"
      v-model="uploadOpen"
      :uploads="uploads"
      :existing-ids="allBooks.map((b) => b.id)"
      @changed="onUploadChanged"
    />

    <BookBookmarkDialog v-if="bookmarkOpen" v-model="bookmarkOpen" :book-titles="allBookTitles" />
  </main>
</template>