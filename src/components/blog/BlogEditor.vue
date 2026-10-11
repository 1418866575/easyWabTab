<script setup lang="ts">
/**
 * 博客文章编辑器（后台）
 *
 * 左：正文（Markdown 编辑 / 预览双栏切换，预览复用 @/composables/noteMarkdown 的安全渲染）
 * 右：元数据（分类 / 标签 / slug / 摘要 / 封面 / SEO）
 * 底部：保存草稿、发布、查看当次改动能否通过发布校验。
 *
 * 「发布」不是写库那么简单：会跑 collectPublishErrors 全量校验，任一不通过都不改状态，
 * 且错误要求直接展示在底部，避免用户对着「发布失败」干瞪眼。
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useBlogStore } from '@/stores/blog'
import {
  ARTICLE_STATUS_LABELS,
  autoExcerpt,
  collectPublishErrors,
  estimateReadingMinutes,
  isReservedSlug,
  slugify
} from '@/composables/blogCore'
import { renderMarkdown } from '@/composables/noteMarkdown'
import Icon from '@/components/Icon.vue'
import { showConfirm, toastAlert } from '@/utils/dialog'

const props = defineProps<{ articleId: string }>()
const emit = defineEmits<{ close: [] }>()

const store = useBlogStore()

const form = reactive({
  title: '',
  subtitle: '',
  slug: '',
  excerpt: '',
  contentMarkdown: '',
  categoryId: '',
  tagIds: [] as string[],
  coverKind: 'none' as 'none' | 'image' | 'gradient' | 'solid',
  coverToken: '',
  seoTitle: '',
  seoDescription: ''
})

/** 快照：用于判断「有未保存改动」并据此提示 */
let snapshot = ''
const dirty = ref(false)
const viewMode = ref<'edit' | 'split' | 'preview'>('edit')
const publishedHtml = ref('')
/** 右侧元数据抽屉开合状态：true 时向左滑出，false 时滑回右侧隐藏 */
const sideOpen = ref(false)
function toggleSide(): void {
  sideOpen.value = !sideOpen.value
}
function closeSide(): void {
  sideOpen.value = false
}

const article = computed(() => store.findArticle(props.articleId))
const canRead = computed(() => article.value !== undefined)

function fillFromArticle(): void {
  const a = article.value
  if (!a) return
  form.title = a.title
  form.subtitle = a.subtitle ?? ''
  form.slug = a.slug
  form.excerpt = a.excerpt
  form.contentMarkdown = a.contentMarkdown
  form.categoryId = a.categoryId ?? ''
  form.tagIds = [...a.tagIds]
  form.coverKind = a.coverKind
  form.coverToken = a.coverToken ?? ''
  form.seoTitle = a.seoTitle ?? ''
  form.seoDescription = a.seoDescription ?? ''
  snapshot = JSON.stringify(form)
  dirty.value = false
  refreshPreview()
}

watch(
  () => [props.articleId, store.loaded] as const,
  () => fillFromArticle(),
  { immediate: true }
)

watch(form, () => {
  dirty.value = JSON.stringify(form) !== snapshot
  scheduleAutoSave()
})

// ---------- 预览 ----------
function refreshPreview(): void {
  publishedHtml.value = renderMarkdown(form.contentMarkdown)
}
watch(() => form.contentMarkdown, refreshPreview)

// ---------- 自动保存 ----------
let timer: number | undefined
function scheduleAutoSave(): void {
  if (timer !== undefined) window.clearTimeout(timer)
  // 少于作者设定间隔时不清掉已有定时器，避免高频输入时反复重置导致永远不落盘
  timer = window.setTimeout(() => {
    void saveDraft(true)
  }, Math.max(1, store.settings.autoSaveSeconds) * 1000)
}
onBeforeUnmount(() => {
  if (timer !== undefined) window.clearTimeout(timer)
})

async function saveDraft(silent = false): Promise<void> {
  if (!dirty.value) {
    if (!silent) toastAlert('没有需要保存的改动', 'info')
    return
  }
  const updated = await store.updateArticle(props.articleId, {
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || undefined,
    slug: form.slug.trim(),
    excerpt: form.excerpt.trim(),
    contentMarkdown: form.contentMarkdown,
    categoryId: form.categoryId || undefined,
    tagIds: [...form.tagIds],
    coverKind: form.coverKind,
    coverToken: form.coverToken.trim() || undefined,
    seoTitle: form.seoTitle.trim() || undefined,
    seoDescription: form.seoDescription.trim() || undefined
  })
  if (!updated) {
    toastAlert('保存失败：文章不存在', 'error')
    return
  }
  // store 会按标题/正文重算 slug 与摘要，回填保证界面与库一致
  form.slug = updated.slug
  form.excerpt = updated.excerpt
  snapshot = JSON.stringify(form)
  dirty.value = false
  if (!silent) toastAlert('草稿已保存', 'success')
}

// ---------- 校验提示 ----------
/** 不触碰数据库、只做同一套校验，编辑器里就能提前看到「为什么发不出去」 */
const liveErrors = computed(() => {
  const a = article.value
  if (!a) return [] as string[]
  const draft = {
    ...a,
    title: form.title.trim(),
    slug: form.slug.trim(),
    contentMarkdown: form.contentMarkdown,
    categoryId: form.categoryId || undefined,
    tagIds: form.tagIds
  }
  return collectPublishErrors(draft, {
    takenSlugs: store.takenSlugs(props.articleId),
    knownCategoryIds: store.categories.map(c => c.id),
    knownTagIds: store.tags.map(t => t.id)
  })
})
/**
 * 底部实时提示：标题/正文为空属于显而易见的情况，不再在底部列表里反复提示，
 * 改为点击「发布」时由 publishArticle 统一校验并以 toast 告知。发布闸门本身不受影响。
 */
const SUPPRESSED_HINTS = new Set(['标题不可为空', '正文不可为空'])
const visibleErrors = computed(() => liveErrors.value.filter(e => !SUPPRESSED_HINTS.has(e)))

const slugReserved = computed(() => isReservedSlug(form.slug))
const excerptPreview = computed(
  () => form.excerpt.trim() || autoExcerpt(form.contentMarkdown, store.settings.excerptLength)
)
const readingMinutes = computed(() => estimateReadingMinutes(form.contentMarkdown))
const wordCount = computed(() => form.contentMarkdown.replace(/\s/g, '').length)

// ---------- 标签选择 ----------
function toggleTag(id: string): void {
  const index = form.tagIds.indexOf(id)
  if (index >= 0) form.tagIds.splice(index, 1)
  else form.tagIds.push(id)
}

// ---------- 发布 ----------
async function handlePublish(audit = false): Promise<void> {
  await saveDraft(true)
  const res = audit ? await store.submitForReview(props.articleId) : await store.publishArticle(props.articleId)
  if (!res.ok) {
    const detail = res.errors && res.errors.length > 0 ? res.errors.join('；') : ''
    toastAlert(detail || '发布失败', 'error')
    return
  }
  toastAlert(audit ? '已提交，等待审核' : '文章已发布', 'success')
}

// ---------- 关闭（有未保存改动时先问） ----------
async function handleClose(): Promise<void> {
  if (dirty.value) {
    if (!await showConfirm('有改动尚未保存，确定离开吗？', '放弃改动')) return
  }
  emit('close')
}

// ---------- slug 辅助 ----------
async function regenerateSlug(): Promise<void> {
  form.slug = slugify(form.title) || form.slug
  if (!form.slug) toastAlert('标题不含可用于 slug 的字符，请手工填写', 'warning')
}
</script>

<template>
  <section v-if="canRead" class="be">
    <!-- 顶部：视图切换 + 文章设置 -->
    <header class="be-head">
      <div class="be-view-switch" role="group" aria-label="编辑器视图">
        <button
          v-for="m in (['edit', 'split', 'preview'] as const)"
          :key="m"
          type="button"
          class="be-view-btn"
          :class="{ active: viewMode === m }"
          :data-testid="`blog-editor-view-${m}`"
          @click="viewMode = m"
        >
          {{ m === 'edit' ? '编辑' : m === 'split' ? '分屏' : '预览' }}
        </button>
      </div>
      <button
        type="button"
        class="be-side-toggle"
        :class="{ active: sideOpen }"
        :aria-expanded="sideOpen"
        aria-controls="blog-editor-side"
        data-testid="blog-editor-side-toggle"
        @click="toggleSide"
      >
        <span>文章设置</span>
      </button>
    </header>

    <div class="be-body">
      <!-- 左：正文 -->
      <div class="be-main">
        <input
          v-model="form.title"
          class="be-title-input"
          placeholder="标题"
          aria-label="标题"
          data-testid="blog-editor-title"
        />
        <div class="be-editor-wrap" :class="`is-${viewMode}`">
          <textarea
            v-if="viewMode !== 'preview'"
            v-model="form.contentMarkdown"
            class="be-md"
            placeholder="用 Markdown 书写正文…"
            aria-label="正文 Markdown"
            spellcheck="false"
            data-testid="blog-editor-content"
          ></textarea>
          <!-- v-html 的内容来自 markdown-it（html:false，仅白名单图片 data URL），不含可执行脚本 -->
          <div v-if="viewMode !== 'edit'" class="be-preview md-body" data-testid="blog-editor-preview" v-html="publishedHtml"></div>
        </div>
      </div>

      </div>

    <!-- 遮罩：点击收起右侧抽屉 -->
    <div class="be-side-overlay" :class="{ 'is-open': sideOpen }" @click="closeSide" aria-hidden="true"></div>

    <!-- 右：元数据抽屉（点击顶栏「设置」向左滑出，再次点击或点遮罩滑回） -->
    <aside id="blog-editor-side" class="be-side" :class="{ 'is-open': sideOpen }" :aria-hidden="!sideOpen">
      <div class="be-side-head">
        <h2 class="be-side-title">文章设置</h2>
        <button type="button" class="be-side-close" aria-label="收起设置" data-testid="blog-editor-side-close" @click="closeSide">
          <Icon name="close" :size="14" />
        </button>
      </div>
      <div class="be-block">
          <h3 class="be-block-title">发布</h3>
          <label class="be-field">
            <span class="be-label">状态</span>
            <div class="be-static">{{ ARTICLE_STATUS_LABELS[article!.status] }}</div>
          </label>
          <label class="be-field">
            <span class="be-label">slug（文章地址）</span>
            <div class="be-inline">
              <el-input v-model="form.slug" size="small" class="be-flex" placeholder="article-url" data-testid="blog-editor-slug" />
              <button type="button" class="be-mini" title="按标题重新生成" @click="regenerateSlug">生成</button>
            </div>
          </label>
          <p v-if="slugReserved" class="be-warn">该 slug 是系统保留字，发布时会被拦截</p>
          <label class="be-field">
            <span class="be-label">分类</span>
            <select v-model="form.categoryId" class="be-select" data-testid="blog-editor-category">
              <option value="">未分类</option>
              <option v-for="c in store.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <div class="be-field">
            <span class="be-label">标签</span>
            <div v-if="store.tags.length === 0" class="be-hint">还没有标签，可到「标签」页新建</div>
            <div v-else class="be-tag-picker">
              <button
                v-for="t in store.tags"
                :key="t.id"
                type="button"
                class="be-tag"
                :class="{ 'is-on': form.tagIds.includes(t.id) }"
                @click="toggleTag(t.id)"
              >
                {{ t.name }}
              </button>
            </div>
          </div>
        </div>

        <div class="be-block">
          <h3 class="be-block-title">摘要与封面</h3>
          <label class="be-field">
            <span class="be-label">副标题</span>
            <el-input v-model="form.subtitle" size="small" placeholder="可选，显示在标题下方" />
          </label>
          <label class="be-field">
            <span class="be-label">摘要（留空自动截取正文）</span>
            <textarea v-model="form.excerpt" rows="3" class="be-textarea" placeholder="自动截取结果会随正文变化"></textarea>
          </label>
          <p class="be-hint">列表将展示：{{ excerptPreview || '（暂无正文）' }}</p>
          <label class="be-field">
            <span class="be-label">封面</span>
            <select v-model="form.coverKind" class="be-select">
              <option value="none">无</option>
              <option value="gradient">渐变</option>
              <option value="solid">纯色</option>
            </select>
          </label>
          <label v-if="form.coverKind !== 'none' && form.coverKind !== 'image'" class="be-field">
            <span class="be-label">封面色值 / 渐变</span>
            <el-input v-model="form.coverToken" size="small" placeholder="如 linear-gradient(135deg,#60a5fa,#a78bfa)" />
          </label>
        </div>

        <div class="be-block">
          <h3 class="be-block-title">SEO</h3>
          <label class="be-field">
            <span class="be-label">SEO 标题（留空用文章标题）</span>
            <el-input v-model="form.seoTitle" size="small" />
          </label>
          <label class="be-field">
            <span class="be-label">SEO 描述（留空用摘要）</span>
            <textarea v-model="form.seoDescription" rows="2" class="be-textarea"></textarea>
          </label>
        </div>

        <div class="be-block">
          <h3 class="be-block-title">统计</h3>
          <p class="be-stat">正文字数 {{ wordCount }} · 约 {{ readingMinutes }} 分钟读完</p>
        </div>
    </aside>

    <!-- 底部操作条 -->
    <footer class="be-foot">
      <ul v-if="visibleErrors.length" class="be-errors" data-testid="blog-editor-errors">
        <li v-for="e in visibleErrors" :key="e">{{ e }}</li>
      </ul>
      <div class="be-foot-ops">
        <button type="button" class="ui-btn ui-btn--sm" @click="handleClose">关闭</button>
        <button type="button" class="ui-btn ui-btn--sm" data-testid="blog-editor-save" @click="saveDraft()">保存草稿</button>
        <button type="button" class="ui-btn ui-btn--sm" @click="handlePublish(true)">提交审核</button>
        <button
          type="button"
          class="ui-btn ui-btn--sm ui-btn--primary"
          :disabled="visibleErrors.length > 0"
          data-testid="blog-editor-publish"
          @click="handlePublish(false)"
        >
          发布
        </button>
      </div>
    </footer>

  </section>

  <div v-else class="be-missing">
    这篇文章不存在或已被彻底删除。<button type="button" class="ui-btn ui-btn--sm" @click="emit('close')">返回列表</button>
  </div>
</template>

<style scoped>
.be {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.be-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.be-view-switch {
  display: flex;
  margin-left: auto;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  overflow: hidden;
}

.be-view-btn {
  padding: 4px 12px;
  border: none;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
}

.be-view-btn.active {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
}

.be-side-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
}

.be-side-toggle.active {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.be-body {
  display: flex;
  gap: 12px;
  align-items: stretch;
  flex-wrap: wrap;
}

.be-main {
  flex: 1 1 520px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.be-title-input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-lg, 16px);
  font-weight: var(--font-weight-medium, 500);
}

.be-editor-wrap {
  display: flex;
  gap: 8px;
  min-height: 420px;
}

.be-md,
.be-preview {
  flex: 1 1 0;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
}

.be-md {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: var(--font-size-sm, 13px);
  line-height: var(--line-height-relaxed, 1.7);
  color: var(--color-text, #0f172a);
  resize: vertical;
}

.be-preview {
  overflow-y: auto;
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-sm, 14px);
  line-height: var(--line-height-relaxed, 1.75);
}

.be-side {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 200;
  width: 320px;
  max-width: 86vw;
  height: 100vh;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background-color: var(--color-bg-card, #ffffff);
  border-left: 1px solid var(--color-border, #e2e8f0);
  box-shadow: -8px 0 24px rgba(15, 23, 42, 0.10);
  transform: translateX(100%);
  transition: transform 0.25s ease;
  overflow-y: auto;
}

.be-side.is-open {
  transform: translateX(0);
}

.be-side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}

.be-side-title {
  margin: 0;
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text, #0f172a);
}

.be-side-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
}

.be-side-close:hover {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.be-side-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  background-color: rgba(15, 23, 42, 0.35);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.25s ease, visibility 0.25s ease;
}

.be-side-overlay.is-open {
  opacity: 1;
  visibility: visible;
}

.be-block {
  padding: 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
}

.be-block-title {
  margin: 0 0 8px;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text, #0f172a);
}

.be-field {
  display: block;
  margin-bottom: 10px;
}

.be-label {
  display: block;
  margin-bottom: 4px;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
}

.be-static {
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-sm, 13px);
}

.be-inline {
  display: flex;
  align-items: center;
  gap: 6px;
}

.be-flex { flex: 1 1 auto; }

.be-mini {
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
}

.be-select,
.be-input {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-input, #ffffff);
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
}

.be-textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-input, #ffffff);
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
  line-height: var(--line-height-relaxed, 1.6);
  resize: vertical;
}

.be-tag-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.be-tag {
  padding: 2px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
}

.be-tag.is-on {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
}

.be-hint,
.be-stat {
  margin: 0;
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 11px);
  line-height: var(--line-height-relaxed, 1.6);
}

.be-warn {
  margin: -6px 0 10px;
  color: var(--color-error, #ef4444);
  font-size: var(--font-size-xs, 12px);
}

.be-foot {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
}

.be-errors {
  flex: 1 1 320px;
  margin: 0;
  padding-left: 18px;
  color: var(--color-error, #ef4444);
  font-size: var(--font-size-xs, 12px);
  line-height: var(--line-height-relaxed, 1.7);
}

.be-foot-ops {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.be-missing {
  padding: 40px 16px;
  color: var(--color-text-secondary, #64748b);
  text-align: center;
}

@media (max-width: 768px) {
  .be-body { flex-direction: column; }
  .be-editor-wrap { flex-direction: column; min-height: 320px; }
  .be-foot-ops { width: 100%; }
  .be-foot-ops .ui-btn { flex: 1 1 auto; min-height: 44px; }
}
</style>
