<script setup lang="ts">
/**
 * 个人图书馆阅读页（路由 /books/read?id=<id>）
 *
 * 用 iframe 承载原书 HTML，并读取其滚动位置记录阅读书签。
 *
 * ## 为什么这里必须处理「内部滚动容器」
 *
 * 不少书不是让 document 滚动，而是把正文装进一个 `overflow-y:auto` 的内部容器。
 * 典型例子：`public/books/daodejing`（道德经）是侧边目录布局，正文在
 * `nav.toc-sidebar` 里（高 4518px / 视口 809px），而它自己的
 * `document.documentElement.scrollHeight === clientHeight`（都 849px）。
 * 此时 `window.scrollTo(0, n)` **完全无效**，只盯 window 的实现会得到「书签永远是空」。
 *
 * 所以定位滚动目标分两步（判定逻辑在 booksCore 的 pickScrollTarget，可单测）：
 * 1. 文档本身能滚 → 用 window
 * 2. 否则在文档里找**面积最大**且确实超出视口范围的内部滚动容器
 * 3. 都没有（书太短滚不动）→ 不做书签
 *
 * 已知限制（界面上已说明）：
 * - 新标签打开的那次阅读**不记录位置**：跨文档无法上报，也不保证原书有上报脚本
 * - 恢复位置靠 ratio（滚动比例）而非像素，换设备后仍大致对得上，但章节可能有偏差
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from '@/composables/useToast'
import {
  formatProgress,
  normalizeBooks,
  pickScrollTarget,
  ratioToScrollTop,
  scrollRatio,
  type BookBookmark,
  type BookItem
} from '@/composables/booksCore'
import { useBooksPrefs, flushBooksPrefs } from '@/composables/useBooksPrefs'
import { getUploadedBook, makeUploadObjectUrl } from '@/composables/booksUpload'
import '@/styles/books.css'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const prefs = useBooksPrefs()

const book = ref<BookItem | null>(null)
const frameUrl = ref('')
/** iframe 加载失败（如原书设了 X-Frame-Options）时降级提示 */
const frameFailed = ref(false)
const frameRef = ref<HTMLIFrameElement | null>(null)

/** 滚动停顿多久后落盘（毫秒） */
const SAVE_IDLE_MS = 800
/** 加载后等多久再定位滚动容器（等原文档渲染出真实高度） */
const RESTORE_DELAY_MS = 350

let idleTimer: ReturnType<typeof setTimeout> | null = null
let boundWin: Window | null = null
/** 当前真正承载滚动的元素；null 表示 window 自身滚动 */
let boundScroller: HTMLElement | null = null
let restored = false

const bookmark = computed<BookBookmark | null>(() =>
  book.value ? prefs.getBookmark(book.value.id) : null
)

// ---------- 装载 ----------
async function loadBook(id: string): Promise<void> {
  book.value = null
  frameUrl.value = ''
  frameFailed.value = false
  restored = false
  unbindScroll()

  let found: BookItem | null = null
  // 先查静态书（manifest），再查本机上传项
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}books/manifest.json`, { cache: 'no-cache' })
    if (res.ok) found = normalizeBooks(await res.json()).find((b) => b.id === id) ?? null
  } catch (e) {
    console.warn('[books:reader] manifest 读取失败:', e)
  }

  if (!found) {
    const u = await getUploadedBook(id)
    if (u) {
      try {
        frameUrl.value = await makeUploadObjectUrl(u.html)
        found = {
          id: u.id,
          title: u.title,
          description: u.description,
          cover: '',
          category: u.category,
          tags: u.tags,
          order: 1e9,
          entry: '',
          size: u.size,
          updatedAt: new Date(u.updatedAt).toISOString(),
          hasMeta: false,
          source: 'upload'
        }
      } catch (e) {
        toast.error(`打开失败：${(e as Error)?.message ?? e}`)
      }
    }
  }

  if (!found) {
    book.value = null
    return
  }

  if (!frameUrl.value) frameUrl.value = found.entry
  if (!frameUrl.value) {
    toast.error(`《${found.title}》缺少可打开的地址`)
    return
  }
  book.value = found
  prefs.markOpened(found.id)
}

/** 定位真正承载正文滚动的元素；判定规则见 booksCore.pickScrollTarget */
function resolveScroller(win: Window): { win: Window; el: HTMLElement | null } {
  const doc = win.document
  const de = doc.documentElement
  const docInfo = { scrollHeight: de.scrollHeight, clientHeight: de.clientHeight }

  // 收集候选内部滚动容器。刻意只取 overflow-y 为 auto/scroll 的元素，
  // 避免把 overflow:hidden 的裁剪容器误当成滚动容器。
  const candidates: Array<{ scrollHeight: number; clientHeight: number; width: number; height: number }> = []
  const els: HTMLElement[] = []
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    const h = el as HTMLElement
    if (h.scrollHeight - h.clientHeight <= 8) continue
    const oy = win.getComputedStyle(h).overflowY
    if (oy !== 'auto' && oy !== 'scroll') continue
    const r = h.getBoundingClientRect()
    candidates.push({
      scrollHeight: h.scrollHeight,
      clientHeight: h.clientHeight,
      width: Math.round(r.width),
      height: Math.round(r.height)
    })
    els.push(h)
  }

  if (pickScrollTarget(docInfo, candidates) === 'inner' && els.length) {
    // 与 pickScrollTarget 同规则：面积最大者胜出
    let bestIdx = 0
    let bestArea = -1
    candidates.forEach((c, i) => {
      const area = c.width * c.height
      if (area > bestArea) {
        bestArea = area
        bestIdx = i
      }
    })
    return { win, el: els[bestIdx] }
  }
  return { win, el: null }
}

/** 取当前可见的首个标题作为章节名（拿不到就留空，不报错） */
function visibleHeading(doc: Document): string {
  try {
    for (const h of Array.from(doc.querySelectorAll('h1, h2, h3'))) {
      const r = h.getBoundingClientRect()
      // 视口上半部分出现且高度合理 → 认为读者在这一节
      if (r.bottom > 0 && r.top < 200 && r.height > 0) {
        const text = h.textContent?.trim()
        if (text) return text.slice(0, 40)
      }
    }
  } catch {
    // 理论上不会发生（静态书都同源）；静默降级为无章节名
  }
  return ''
}

/** 读当前进度并写书签 */
function readPosition(): void {
  const win = boundWin
  if (!win || !book.value) return
  try {
    const ratio =
      boundScroller && boundScroller.isConnected
        ? scrollRatio(boundScroller.scrollTop, boundScroller.scrollHeight, boundScroller.clientHeight)
        : scrollRatio(win.scrollY, win.document.documentElement.scrollHeight, win.innerHeight)
    // 停在开头（<1%）不记书签：否则每次进书都会被一条无意义的 0% 覆盖
    if (ratio < 0.01) return
    prefs.setBookmark(book.value.id, ratio, visibleHeading(win.document))
  } catch {
    // 读不到文档（还没 ready 或跨源）→ 放弃本次，下一次滚动再试
  }
}

function onScroll(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(readPosition, SAVE_IDLE_MS)
}

function unbindScroll(): void {
  if (boundWin) {
    try {
      boundWin.removeEventListener('scroll', onScroll)
    } catch {
      // 文档已销毁，忽略
    }
  }
  if (boundScroller) {
    try {
      boundScroller.removeEventListener('scroll', onScroll)
    } catch {
      // 同上
    }
  }
  boundWin = null
  boundScroller = null
}

function onFrameLoad(): void {
  unbindScroll()
  const win = frameRef.value?.contentWindow
  if (!win) return

  // 等原文档渲染完再量高度：太早 documentElement.scrollHeight 还只有一屏
  setTimeout(() => {
    try {
      const { win: w, el } = resolveScroller(win)
      boundWin = w
      boundScroller = el
      w.addEventListener('scroll', onScroll, { passive: true })
      if (el) el.addEventListener('scroll', onScroll, { passive: true })
      // 原书可能还在异步渲染，稍后再恢复一次位置。
      // 顺带**重绑一次监听**：部分书（道德经就是）会把正文容器异步替换/重建，
      // 首次绑定到的节点随后 isConnected=false，那之后的滚动又成了"无监听"状态。
      setTimeout(() => {
        const el = boundScroller
        if (!boundWin) return
        if (el && !el.isConnected) {
          const again = resolveScroller(boundWin)
          boundScroller = again.el
          if (again.el) again.el.addEventListener('scroll', onScroll, { passive: true })
        }
        restorePosition()
        readPosition()
      }, 600)
      // **绑定完成后立即采一次当前位置**。
      // 监听是在 setTimeout 里挂的，这之前的滚动（iframe 加载瞬间用户已经在翻页，
      // 或程序化定位）不会有任何事件，等于被静默丢弃。补这一采，绑定窗口内的
      // 阅读进度才不会被漏掉 —— 实测不加就会随机丢书签。
      readPosition()
    } catch {
      // contentWindow 访问被拒 → 非同源文档，站内阅读不可用
      boundWin = null
      boundScroller = null
      frameFailed.value = true
      toast.warning('这本书不允许被嵌入显示，请用「新标签打开」阅读')
    }
  }, RESTORE_DELAY_MS)
}

/** 恢复上次的阅读位置；没书签或对不上就静默跳过（不该用 toast 打扰用户） */
function restorePosition(): void {
  if (restored || !book.value) return
  const b = prefs.getBookmark(book.value.id)
  if (!b || b.ratio <= 0.01) {
    restored = true
    return
  }
  const win = boundWin
  if (!win) return
  try {
    if (boundScroller && boundScroller.isConnected) {
      const el = boundScroller
      el.scrollTop = ratioToScrollTop(b.ratio, el.scrollHeight, el.clientHeight)
    } else {
      win.scrollTo(0, ratioToScrollTop(b.ratio, win.document.documentElement.scrollHeight, win.innerHeight))
    }
    restored = true
  } catch {
    restored = true
  }
}

// ---------- 手动书签 ----------
function onSaveBookmark(): void {
  if (!book.value) return
  readPosition()
  const b = prefs.getBookmark(book.value.id)
  if (!b) {
    toast.info('还没读到可记录的位置，先往下翻几页再试')
    return
  }
  const suggested = b.label || visibleHeading(boundWin?.document ?? document)
  const label = window.prompt('给这个书签起个名字（留空则沿用当前章节名）：', suggested)
  if (label === null) return
  prefs.setBookmark(book.value.id, b.ratio, label.trim() || b.label)
  toast.success('书签已保存')
}

function onClearBookmark(): void {
  if (!book.value) return
  prefs.clearBookmark(book.value.id)
  toast.info('已清除本书书签')
}

// ---------- 导航 ----------
function goBack(): void {
  void router.push('/books')
}

function openExternal(): void {
  if (frameUrl.value) window.open(frameUrl.value, '_blank')
}

// ---------- 生命周期 ----------
function readIdFromRoute(): string {
  const q = route.query.id
  return typeof q === 'string' ? q : ''
}

onMounted(async () => {
  await prefs.initBooksPrefs()
  const id = readIdFromRoute()
  if (!id) {
    goBack()
    return
  }
  await loadBook(id)
})

onUnmounted(() => {
  // 离开前把当前位置补记一次（防抖窗口内可能还没落盘）
  readPosition()
  flushBooksPrefs()
  unbindScroll()
  if (idleTimer) clearTimeout(idleTimer)
})

watch(readIdFromRoute, async (next, prev) => {
  if (next && next !== prev) await loadBook(next)
})
</script>

<template>
  <div class="bk-reader">
    <header class="bk-reader-bar">
      <button type="button" class="ui-btn ui-btn--sm" data-testid="bk-reader-back" @click="goBack">
        ← 返回书架
      </button>
      <h1 class="bk-reader-title">{{ book?.title ?? '载入中…' }}</h1>
      <div class="bk-reader-actions">
        <span v-if="bookmark" class="bk-reader-progress" data-testid="bk-reader-progress">
          🔖 {{ formatProgress(bookmark.ratio) }}
        </span>
        <button
          type="button"
          class="ui-btn ui-btn--sm"
          data-testid="bk-reader-save-mark"
          @click="onSaveBookmark"
        >
          <span class="bk-reader-btn-text">保存书签</span>🔖
        </button>
        <button
          v-if="bookmark"
          type="button"
          class="ui-btn ui-btn--sm ui-btn--danger"
          data-testid="bk-reader-clear-mark"
          @click="onClearBookmark"
        >
          <span class="bk-reader-btn-text">清除</span>✕
        </button>
        <button
          type="button"
          class="ui-btn ui-btn--sm"
          :disabled="!frameUrl"
          data-testid="bk-reader-external"
          @click="openExternal"
        >
          <span class="bk-reader-btn-text">新标签打开</span>↗
        </button>
      </div>
    </header>

    <div v-if="frameFailed" class="bk-reader-fallback" data-testid="bk-reader-fallback">
      <p class="bk-reader-fallback-text">
        这本书不允许被嵌入显示（可能是原文件设置了 X-Frame-Options）。<br />
        请用「新标签打开」阅读。
      </p>
      <button type="button" class="ui-btn ui-btn--primary" @click="openExternal">新标签打开</button>
    </div>

    <div v-else-if="!book" class="bk-reader-fallback" data-testid="bk-reader-notfound">
      <p class="bk-reader-fallback-text">
        没找到这本书。它可能已经从仓库里移除了，或上传的那份被删了。
      </p>
      <button type="button" class="ui-btn ui-btn--primary" @click="goBack">返回书架</button>
    </div>

    <iframe
      v-else
      ref="frameRef"
      class="bk-reader-frame"
      :src="frameUrl"
      title="书籍内容"
      data-testid="bk-reader-frame"
      @load="onFrameLoad"
    ></iframe>
  </div>
</template>

<style scoped>
.bk-reader-progress {
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
  white-space: nowrap;
}
</style>