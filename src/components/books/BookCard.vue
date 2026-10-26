<script setup lang="ts">
/**
 * 图书馆书籍卡片（书架列表项）
 *
 * 只做卡片形态一种（用户 2026-10-13 明确要求：书架固定卡片视图，不要列表视图）。
 * 曾有的 mode prop 与列表分支已整体移除 —— 留着没人用的第二形态，就是等着被误改。
 *
 * 三个动作刻意分开放，避免「点卡片」与「点小按钮」抢事件：
 *   - 点书名 → 新标签打开（主路径）
 *   - 「站内阅读」→ 进 /books/read（iframe，**只有它能记录阅读位置**）
 *   - ★ → 收藏
 *
 * 封面缺失时用**按 id 派生的稳定色相**占位：同一本书每次刷新颜色一致，
 * 不会因为随机色导致网格每次都在跳。
 */
import { computed } from 'vue'
import {
  formatClicks,
  formatProgress,
  formatRelative,
  formatSize,
  type BookBookmark,
  type BookItem
} from '@/composables/booksCore'

const props = defineProps<{
  book: BookItem
  favorite: boolean
  /** 最近打开时间戳；0 = 从未打开 */
  recentTs?: number
  clickCount?: number
  bookmark?: BookBookmark | null
  /** 是否正在下载；同一时刻只允许一本在跑，其余按钮置灰 */
  downloading?: boolean
}>()

const emit = defineEmits<{
  (e: 'open', book: BookItem): void
  (e: 'read', book: BookItem): void
  (e: 'toggle-fav', book: BookItem): void
  (e: 'download', book: BookItem): void
}>()

/** 按 id 派生的稳定色相：字符串 hash → 0..359，保证同一本书每次颜色一致 */
const hue = computed(() => {
  let h = 0
  for (let i = 0; i < props.book.id.length; i++) {
    h = (h * 31 + props.book.id.charCodeAt(i)) % 360
  }
  return h
})

/** 首字作为无封面时的占位字（大字号居中） */
const initial = computed(() => (props.book.title || '书').slice(0, 1))

const recentLabel = computed(() => formatRelative(props.recentTs ?? 0))
const clickLabel = computed(() => formatClicks(props.clickCount ?? 0))
const sizeLabel = computed(() => formatSize(props.book.size))
const progressLabel = computed(() =>
  props.bookmark ? formatProgress(props.bookmark.ratio) : ''
)

/**
 * 下载按钮的说明文案按来源区分：
 * 静态书是「从服务器拉二级页面」，上传书本来就在本机，只是导成文件。
 */
const downloadTitle = computed(() =>
  props.book.source === 'upload'
    ? '导出为 HTML 文件'
    : '把这本书的页面下载到本地（含二级页面，多页打包为 zip）'
)
</script>

<template>
  <div class="bk-item" :data-testid="`bk-card-${book.id}`">
    <!-- 封面 / 占位色块 -->
    <div
      class="bk-cover"
      :style="
        book.cover
          ? { backgroundImage: `url(${book.cover})` }
          : { background: `hsl(${hue}deg 52% 62%)` }
      "
      :data-testid="`bk-cover-${book.id}`"
    >
      <span v-if="!book.cover" class="bk-cover-initial">{{ initial }}</span>
      <span v-if="book.source === 'upload'" class="bk-cover-badge">本机上传</span>
    </div>

    <!-- 主体：整块可点，走新标签打开 -->
    <div class="bk-body">
      <button
        type="button"
        class="bk-title-btn"
        :title="book.title"
        :data-testid="`bk-title-${book.id}`"
        @click="emit('open', book)"
      >
        <h3 class="bk-title">{{ book.title }}</h3>
      </button>

      <p v-if="book.description" class="bk-desc">{{ book.description }}</p>
      <!-- 静态书缺简介时给出「怎么补」的操作指引；上传书缺简介没什么可指点的（它没有 meta.json 概念） -->
      <p v-else-if="book.source === 'static'" class="bk-desc bk-desc--muted">
        （这本书没有简介，可在 public/bookdata 里加个 meta.json）
      </p>

      <div class="bk-meta">
        <span class="bk-cat">{{ book.category }}</span>
        <span class="bk-dot">·</span>
        <span>{{ sizeLabel }}</span>
        <template v-if="clickLabel">
          <span class="bk-dot">·</span>
          <span>{{ clickLabel }}</span>
        </template>
      </div>

      <div v-if="book.tags.length" class="bk-tags">
        <span v-for="t in book.tags" :key="t" class="bk-tag">#{{ t }}</span>
      </div>

      <!-- 阅读进度：只有站内阅读产生书签，新标签打开不记录。
           宽度按比例收缩（而非铺满底色再压一条），进度低时才看得出"读到哪儿" -->
      <div v-if="bookmark" class="bk-progress" :data-testid="`bk-progress-${book.id}`">
        <div class="bk-progress-inner">
          <div class="bk-progress-fill" :style="{ width: `${Math.round(bookmark.ratio * 100)}%` }"></div>
          <span class="bk-progress-text">{{ progressLabel }}<template v-if="bookmark.label"> · {{ bookmark.label }}</template></span>
        </div>
      </div>

      <div class="bk-actions">
        <button
          type="button"
          class="ui-btn ui-btn--sm"
          :data-testid="`bk-open-${book.id}`"
          @click="emit('open', book)"
        >
          打开
        </button>
        <!-- 站内阅读是唯一能记录阅读位置的入口，故常驻可见 -->
        <button
          type="button"
          class="ui-btn ui-btn--sm"
          :data-testid="`bk-read-${book.id}`"
          @click="emit('read', book)"
        >
          站内阅读
        </button>
        <!-- 下载：静态书拉服务器的二级页面，上传书只是导出本机那份 HTML -->
        <button
          type="button"
          class="ui-btn ui-btn--sm"
          :disabled="downloading"
          :title="downloadTitle"
          :aria-label="downloadTitle"
          :data-testid="`bk-download-${book.id}`"
          @click="emit('download', book)"
        >
          {{ downloading ? '下载中…' : '下载' }}
        </button>
        <span class="bk-recent">{{ recentLabel }}</span>
      </div>
    </div>

    <!-- 收藏星标：与主体按钮同级，避免 button 内嵌 button -->
    <button
      type="button"
      class="bk-star"
      :class="{ 'is-fav': favorite }"
      :title="favorite ? '取消收藏' : '收藏'"
      :aria-label="favorite ? '取消收藏' : '收藏'"
      :data-testid="`bk-star-${book.id}`"
      @click="emit('toggle-fav', book)"
    >{{ favorite ? '★' : '☆' }}</button>
  </div>
</template>

<style scoped>
.bk-item {
  position: relative;
  display: flex;
  /* 固定卡片视图（不再有列表形态）：始终纵向排布 */
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
  box-shadow: var(--shadow-card, 0 1px 2px rgba(0, 0, 0, 0.06));
  transition: transform var(--motion-duration, 220ms) var(--motion-ease, ease),
    box-shadow var(--motion-duration, 220ms) var(--motion-ease, ease),
    border-color var(--motion-duration, 220ms) var(--motion-ease, ease);
}
.bk-item:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary, #3b82f6);
  box-shadow: var(--shadow-card-hover, 0 8px 20px rgba(0, 0, 0, 0.1));
}

.bk-cover {
  position: relative;
  flex: 0 0 auto;
  height: 108px;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bk-cover-initial {
  color: #fff;
  font-size: 34px;
  font-weight: 600;
  opacity: 0.92;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
.bk-cover-badge {
  position: absolute;
  bottom: 6px;
  left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background-color: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: var(--font-size-xs, 11px);
  line-height: 18px;
}

.bk-body {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px;
  flex: 1 1 auto;
  min-width: 0;
}

/* 标题做成按钮但视觉上是纯文字：撑满宽度让整行都可点，同时保持标题排版 */
.bk-title-btn {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.bk-title {
  margin: 0;
  font-size: var(--font-size-base, 15px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text, #0f172a);
  line-height: var(--line-height-tight, 1.3);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.bk-title-btn:hover .bk-title {
  color: var(--color-primary, #3b82f6);
}

.bk-desc {
  margin: 0;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  line-height: var(--line-height-relaxed, 1.6);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.bk-desc--muted {
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
}

.bk-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
}
.bk-cat { color: var(--color-primary, #3b82f6); }
.bk-dot { color: var(--color-text-muted, #94a3b8); }

.bk-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.bk-tag {
  padding: 0 6px;
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-size: var(--font-size-xs, 11px);
  line-height: 18px;
}

.bk-progress {
  /* 进度胶囊按内容宽度收缩。
     注意：这里不能只用 margin-top:auto 把它推到底 —— flex 子项默认 align-self:stretch，
     不显式收窄的话胶囊会被拉满整行宽（视觉上像一条灰条而不是胶囊）。
     .bk-actions 同样用 align-self 收窄，两者保持一致。 */
  align-self: flex-start;
  max-width: 100%;
  margin-top: auto;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 11px);
}
.bk-progress-inner {
  position: relative;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  background-color: var(--color-bg-hover, #f1f5f9);
  overflow: hidden;
}
.bk-progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background-color: var(--color-primary-soft, #eff6ff);
}
.bk-progress-text {
  position: relative;
  z-index: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bk-actions {
  display: flex;
  align-items: center;
  /* 加了「下载」后三个按钮 + 右侧时间在窄卡片里可能放不下，允许换行兜底 */
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
}
.bk-recent {
  margin-left: auto;
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 11px);
  white-space: nowrap;
}

.bk-star {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.85);
  color: var(--color-text-muted, #94a3b8);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: color var(--motion-duration, 220ms) var(--motion-ease, ease),
    transform var(--motion-duration, 220ms) var(--motion-ease, ease);
}
.bk-star:hover {
  transform: scale(1.12);
  color: var(--color-warning, #f59e0b);
}
.bk-star.is-fav { color: var(--color-warning, #f59e0b); }
/* 星标桌面 30px 就够（鼠标操作）；移动端抬到 40px 满足触控下限 */
@media (max-width: 768px) {
  .bk-star {
    width: 40px;
    height: 40px;
    font-size: 21px;
  }
}

/* 窄端：卡片始终纵向，只需微调封面高度与按钮尺寸 */
@media (max-width: 768px) {
  .bk-cover {
    height: 100px;
  }
  .bk-recent { display: none; }
  /* 抬到 40px：.ui-btn--sm 是 30px，低于移动端 32px 的舒适触控下限 */
  .bk-actions :deep(.ui-btn) {
    min-height: 40px;
    padding: 8px 14px;
  }
}
</style>