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
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useBlogStore } from '@/stores/blog'
import {
  ARTICLE_STATUS_LABELS,
  autoExcerpt,
  collectPublishErrors,
  estimateReadingMinutes,
  isReservedSlug,
  slugify
} from '@/composables/blogCore'
import { applyMarkdown, isAllowedDataImage } from '@/composables/blogEditorMd'
import type { MdBlockKind } from '@/composables/blogEditorMd'
import { imageRef, parseImageRefs, removeImageRefs, resolveImageRefs } from '@/composables/blogImages'
import { renderMarkdown } from '@/composables/noteMarkdown'
import type { BlogImage } from '@/types'
import Icon from '@/components/Icon.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import BlogImagePicker from '@/components/blog/BlogImagePicker.vue'
import { showConfirm, toastAlert } from '@/utils/dialog'
// 模块级云同步：切走「博客后台」时先把未保存草稿落盘再上传
import { registerModuleFlush } from '@/composables/useModuleSync'
// 微信公众号发布（草稿箱）
import { useWechatPublish } from '@/composables/useWechatPublish'
import { useAppSettingsDialog } from '@/composables/useAppSettingsDialog'

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
  coverImageId: '',
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

/** Markdown 语法帮助弹框开合 */
const helpOpen = ref(false)

/** 文中图片清单弹框开合 */
const imageDialogOpen = ref(false)

/**
 * 从文中图弹框定位某张图：切到编辑视图让 textarea 挂载，关闭弹框后在正文选中其短引用，
 * 用户即可在编辑区看到上下文（预览/分屏时弹框会遮住选区，故先切编辑）。
 */
async function openImageInText(id: string): Promise<void> {
  if (viewMode.value === 'preview') viewMode.value = 'edit'
  imageDialogOpen.value = false
  await nextTick()
  locateImageRef(id)
}

/** 常用 Markdown 语法示例：syntax 为原始写法，sample 用于渲染「效果」（图片项用 note 说明） */
interface MdHelpItem {
  name: string
  syntax: string
  sample?: string
  note?: string
}
const mdHelpItems: MdHelpItem[] = [
  { name: '标题', syntax: '# 一级标题\n## 二级标题\n### 三级标题', sample: '# 一级标题\n## 二级标题\n### 三级标题' },
  { name: '强调', syntax: '**加粗文字**\n*斜体文字*\n~~删除线~~', sample: '**加粗文字**\n*斜体文字*\n~~删除线~~' },
  { name: '列表', syntax: '- 无序项一\n- 无序项二\n\n1. 有序一\n2. 有序二', sample: '- 无序项一\n- 无序项二\n\n1. 有序一\n2. 有序二' },
  { name: '链接', syntax: '[easy-web-tab](https://gitee.com/sifujiang/easy-web-tab)', sample: '[easy-web-tab](https://gitee.com/sifujiang/easy-web-tab)' },
  { name: '引用', syntax: '> 这是一段引用文字', sample: '> 这是一段引用文字' },
  { name: '代码', syntax: '行内代码：`const a = 1`\n\n```\n代码块内容\n```', sample: '行内代码：`const a = 1`\n\n```\n代码块内容\n```' },
  { name: '分割线', syntax: '---', sample: '---' },
  { name: '表格', syntax: '| 名称 | 说明 |\n| --- | --- |\n| 博客 | 个人站点 |\n| 工具 | 效率套件 |', sample: '| 名称 | 说明 |\n| --- | --- |\n| 博客 | 个人站点 |\n| 工具 | 效率套件 |' },
  { name: '图片', syntax: '![图片描述](图片地址)', note: '推荐点工具栏「图片」按钮选择本地图片：图片会存入图片库，正文只写短引用（可在编辑器「文中图片」里查看缩略图）。' }
]

// ---------- Markdown 工具栏 ----------
/** 正文 textarea 引用，用于读取选区并恢复光标 */
const contentEl = ref<HTMLTextAreaElement | null>(null)
/** 隐藏的图片文件选择框 */
const fileInput = ref<HTMLInputElement | null>(null)

interface MdToolbarButton {
  /** image = 选本地文件上传；library = 从图库选取（可多选） */
  kind: MdBlockKind | 'image' | 'library'
  label: string
  title: string
  group: number
}
/** 工具栏按钮（含分组，group 用于渲染分隔线）；图片按钮单独走文件选择 */
const MD_TOOLBAR: MdToolbarButton[] = [
  // 图库入口置顶：写文章时最常用的就是插图，独立分组与标题组分隔
  { kind: 'library', label: '图库', title: '从图库插入已有图片（可多选）', group: -1 },
  { kind: 'heading-1', label: 'H1', title: '一级标题', group: 0 },
  { kind: 'heading-2', label: 'H2', title: '二级标题', group: 0 },
  { kind: 'heading-3', label: 'H3', title: '三级标题', group: 0 },
  { kind: 'bold', label: '加粗', title: '加粗（Ctrl/Cmd+B）', group: 1 },
  { kind: 'italic', label: '斜体', title: '斜体（Ctrl/Cmd+I）', group: 1 },
  { kind: 'strike', label: '删除线', title: '删除线', group: 1 },
  { kind: 'inline-code', label: '行内代码', title: '行内代码', group: 1 },
  { kind: 'blockquote', label: '引用', title: '引用块', group: 2 },
  { kind: 'code-block', label: '代码块', title: '代码块', group: 2 },
  { kind: 'ul', label: '无序列表', title: '无序列表', group: 2 },
  { kind: 'ol', label: '有序列表', title: '有序列表', group: 2 },
  { kind: 'link', label: '链接', title: '插入链接（Ctrl/Cmd+K）', group: 3 },
  { kind: 'image', label: '图片', title: '插入图片（选择本地图片，存入图片库）', group: 3 },
  { kind: 'table', label: '表格', title: '插入表格', group: 3 },
  { kind: 'hr', label: '分割线', title: '插入分割线', group: 3 }
]

const toolbarGroups = computed(() => {
  const map = new Map<number, MdToolbarButton[]>()
  for (const b of MD_TOOLBAR) {
    if (!map.has(b.group)) map.set(b.group, [])
    map.get(b.group)!.push(b)
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([group, items]) => ({ group, items }))
})

/** 在光标/选区处应用某种 Markdown 变换，并恢复光标（图片走文件选择，不在此处理） */
async function applyMd(kind: MdBlockKind): Promise<void> {
  const ta = contentEl.value
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const res = applyMarkdown(kind, form.contentMarkdown, start, end)
  form.contentMarkdown = res.value
  await nextTick()
  ta.focus()
  ta.setSelectionRange(res.selStart, res.selEnd)
}

function onToolbarClick(b: MdToolbarButton): void {
  if (b.kind === 'image') {
    fileInput.value?.click()
    return
  }
  if (b.kind === 'library') {
    libraryOpen.value = true
    return
  }
  void applyMd(b.kind)
}

/** 正文快捷键：Ctrl/Cmd+B 加粗、+I 斜体、+K 链接 */
function onContentKeydown(e: KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey)) return
  const key = e.key.toLowerCase()
  if (key === 'b') {
    e.preventDefault()
    void applyMd('bold')
  } else if (key === 'i') {
    e.preventDefault()
    void applyMd('italic')
  } else if (key === 'k') {
    e.preventDefault()
    void applyMd('link')
  }
}

/** FileReader → base64 data URL（Promise 化，便于多文件串行插入） */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * 选中图片文件后：逐个读为 base64 → 白名单校验 → 存入图片库 → 光标处插入**短引用** `![名称](img:<id>)`。
 * 这样正文里不会出现超长 base64 串，图片在预览/前台由 resolveImageRefs 还原显示。
 */
async function onPickImages(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = '' // 复位，便于重复选择同一文件
  if (files.length === 0) return
  const ta = contentEl.value
  let pos = ta ? ta.selectionStart : form.contentMarkdown.length
  let value = form.contentMarkdown
  let rejected = 0
  for (const file of files) {
    let dataUrl: string
    try {
      dataUrl = await readFileAsDataUrl(file)
    } catch {
      rejected += 1
      continue
    }
    if (!isAllowedDataImage(dataUrl)) {
      rejected += 1
      continue
    }
    const name = file.name.replace(/\.[^.]+$/, '') || '图片'
    const saved = await store.addImage(name, dataUrl)
    const res = applyMarkdown('image', value, pos, pos, { alt: name, url: imageRef(saved.id) })
    value = res.value
    pos = res.selEnd
  }
  if (value === form.contentMarkdown) {
    if (rejected) toastAlert(`已跳过 ${rejected} 个不支持的图片（仅支持位图 base64，svg 被禁止）`, 'warning')
    return
  }
  form.contentMarkdown = value
  await nextTick()
  if (ta) {
    ta.focus()
    ta.setSelectionRange(pos, pos)
  }
  if (rejected) {
    toastAlert(`已插入图片，${rejected} 个不支持的格式被跳过（仅支持位图 base64）`, 'warning')
  }
}

// ---------- 文中图片（缩略图条） ----------
/** 正文引用的图片（按出现顺序）；库中已无该图时标记 missing */
const articleImages = computed(() =>
  parseImageRefs(form.contentMarkdown).map(id => {
    const img = store.images.find(i => i.id === id)
    return { id, name: img?.name || '图片', dataUrl: img?.dataUrl || '', missing: !img }
  })
)

/** 点击缩略图：把正文里对应的短引用选中（便于定位） */
function locateImageRef(id: string): void {
  const ta = contentEl.value
  if (!ta) return
  const needle = imageRef(id)
  const idx = form.contentMarkdown.indexOf(needle)
  if (idx < 0) return
  ta.focus()
  ta.setSelectionRange(idx, idx + needle.length)
}

/** 移除图片：先清正文引用并保存，再由 store 决定是否回收图片库条目（被其它文章引用则保留） */
async function removeImageRef(id: string): Promise<void> {
  const name = articleImages.value.find(i => i.id === id)?.name ?? '这张图片'
  if (!await showConfirm(`从正文移除「${name}」？`, '移除')) return
  form.contentMarkdown = removeImageRefs(form.contentMarkdown, id)
  // 等 dirty watcher 落定再保存，否则 saveDraft 会因「尚未标记为脏」而跳过，导致图片库条目残留
  await nextTick()
  await saveDraft(true)
  await store.removeImage(id)
}

// ---------- 图库选择器 ----------
/** 正文插入用（多选） */
const libraryOpen = ref(false)
/** 封面选择用（单选） */
const coverPickerOpen = ref(false)

/** 当前已选的封面图（取自图库） */
const coverImage = computed<BlogImage | undefined>(() =>
  store.images.find(i => i.id === form.coverImageId)
)

/** 从图库插入：在光标处依次插入短引用（图片本体仍只在图库存一份） */
async function insertFromLibrary(images: BlogImage[]): Promise<void> {
  if (images.length === 0) return
  const ta = contentEl.value
  let pos = ta ? ta.selectionStart : form.contentMarkdown.length
  let value = form.contentMarkdown
  for (const img of images) {
    const res = applyMarkdown('image', value, pos, pos, { alt: img.name || '图片', url: imageRef(img.id) })
    value = res.value
    pos = res.selEnd
  }
  form.contentMarkdown = value
  await nextTick()
  if (ta) {
    ta.focus()
    ta.setSelectionRange(pos, pos)
  }
}

/** 封面选图（单选）：写入 coverImageId 并把封面类型切到「图片」 */
function pickCover(images: BlogImage[]): void {
  const img = images[0]
  if (!img) return
  form.coverImageId = img.id
  form.coverKind = 'image'
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
  form.coverImageId = a.coverImageId ?? ''
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
  // 正文里图片是 img:<id> 短引用，渲染前用图片库还原为 data URL，预览才会显示成图片
  const md = resolveImageRefs(form.contentMarkdown, id => store.imageUrlById.get(id))
  publishedHtml.value = renderMarkdown(md)
}
watch(() => form.contentMarkdown, refreshPreview)
// 图片库变化（插入/移除图片）也要重渲染预览
watch(() => store.imageUrlById, refreshPreview)

// ---------- 自动保存 ----------
let timer: number | undefined
function scheduleAutoSave(): void {
  if (timer !== undefined) window.clearTimeout(timer)
  // 少于作者设定间隔时不清掉已有定时器，避免高频输入时反复重置导致永远不落盘
  timer = window.setTimeout(() => {
    void saveDraft(true)
  }, Math.max(1, store.settings.autoSaveSeconds) * 1000)
}
// 模块级同步：注册为「博客后台」模块的 flush。切换模块时编排器会在组件仍挂载时
// 同步调用它，把未保存的草稿写进 store/IDB，避免切走丢稿。
const unregisterModuleFlush = registerModuleFlush('blogAdmin', () => saveDraft(true))
onBeforeUnmount(() => {
  if (timer !== undefined) window.clearTimeout(timer)
  unregisterModuleFlush()
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
    coverImageId: form.coverImageId.trim() || undefined,
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
async function handlePublish(): Promise<void> {
  await saveDraft(true)
  const res = await store.publishArticle(props.articleId)
  if (!res.ok) {
    const detail = res.errors && res.errors.length > 0 ? res.errors.join('；') : ''
    toastAlert(detail || '发布失败', 'error')
    return
  }
  toastAlert('文章已发布', 'success')
}

// ---------- 发布到微信公众号草稿箱 ----------
const wechat = useWechatPublish()
const appSettings = useAppSettingsDialog()

async function handlePublishWechat(): Promise<void> {
  // 先把未保存改动落库，保证发出去的是最新正文（图片库本身即时入库，无需等保存）
  await saveDraft(true)
  const ok = await wechat.publish({
    title: form.title.trim(),
    digest: form.excerpt.trim(),
    contentMarkdown: form.contentMarkdown,
    coverImageId: form.coverImageId.trim() || undefined,
    // 图片库 id → dataUrl（与预览同一来源）
    resolveImage: (id) => store.imageUrlById.get(id)
  })
  if (ok) {
    toastAlert('已发布到公众号草稿箱', 'success')
  } else if (wechat.notConfigured.value) {
    // 未配置凭证：引导去设置页「微信公众号」
    appSettings.openAppSettings({ tab: 'wechat' })
  } else {
    toastAlert(wechat.error.value || '发布失败', 'error')
  }
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
      <button
        type="button"
        class="be-side-toggle"
        data-testid="blog-editor-help"
        aria-haspopup="dialog"
        @click="helpOpen = true"
      >
        <Icon name="info" :size="14" />
        <span>帮助</span>
      </button>
    </header>

    <div class="be-body">
      <!-- 左：正文 -->
      <div class="be-main">
        <!-- Markdown 工具栏：置于标题上方；向下滚动时相对 .ba-content 吸顶（sticky）。
             右上角为底部操作条同款快捷按钮（保存草稿 / 发布 / 发布到公众号，同一 handler 与状态）。 -->
        <div v-if="viewMode !== 'preview'" class="be-md-toolbar" role="toolbar" aria-label="Markdown 编辑工具栏">
          <div class="be-md-groups">
            <template v-for="grp in toolbarGroups" :key="grp.group">
              <span class="be-md-sep" aria-hidden="true"></span>
              <div class="be-md-group">
                <button
                  v-for="b in grp.items"
                  :key="b.kind"
                  type="button"
                  class="be-md-btn"
                  :title="b.title"
                  :aria-label="b.title"
                  :data-testid="`blog-editor-md-${b.kind}`"
                  @click="onToolbarClick(b)"
                >
                  {{ b.label }}
                </button>
              </div>
            </template>
          </div>
          <!-- 快捷操作：与底部操作条同文案/同状态/同点击行为；底部按钮保留不变 -->
          <div class="be-md-actions">
            <button type="button" class="ui-btn ui-btn--sm" data-testid="blog-editor-save-top" @click="saveDraft()">保存草稿</button>
            <!-- 文中图：列出正文已插入的所有图片，便于快速查看（预览/分屏均可用） -->
            <button
              type="button"
              class="ui-btn ui-btn--sm"
              :disabled="articleImages.length === 0"
              :title="articleImages.length === 0 ? '正文还没有插入图片' : `查看文中图片（${articleImages.length}）`"
              data-testid="blog-editor-images-top"
              @click="imageDialogOpen = true"
            >
              文中图{{ articleImages.length ? `（${articleImages.length}）` : '' }}
            </button>
            <button
              type="button"
              class="ui-btn ui-btn--sm ui-btn--primary"
              :disabled="visibleErrors.length > 0"
              data-testid="blog-editor-publish-top"
              @click="handlePublish()"
            >
              发布
            </button>
            <button
              type="button"
              class="ui-btn ui-btn--sm"
              :class="{ 'ui-btn--primary': !wechat.publishing.value }"
              :disabled="wechat.publishing.value || visibleErrors.length > 0"
              data-testid="blog-editor-publish-wechat-top"
              @click="handlePublishWechat()"
            >
              <span v-if="wechat.publishing.value" class="btn-spinner" aria-hidden="true"></span>
              {{ wechat.publishing.value ? '发布中' : '发布到公众号' }}
            </button>
          </div>
        </div>
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
            ref="contentEl"
            v-model="form.contentMarkdown"
            class="be-md"
            placeholder="用 Markdown 书写正文…"
            aria-label="正文 Markdown"
            spellcheck="false"
            data-testid="blog-editor-content"
            @keydown="onContentKeydown"
          ></textarea>
          <!-- v-html 的内容来自 markdown-it（html:false，仅白名单图片 data URL），不含可执行脚本 -->
          <div v-if="viewMode !== 'edit'" class="be-preview md-body" data-testid="blog-editor-preview" v-html="publishedHtml"></div>
        </div>
        <!-- 隐藏的图片选择框：由工具栏「图片」按钮触发，选择后转 base64 内联插入 -->
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          class="be-file-hidden"
          data-testid="blog-editor-image-input"
          @change="onPickImages"
        />
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
            <select v-model="form.coverKind" class="be-select" data-testid="blog-editor-cover-kind">
              <option value="none">无</option>
              <option value="image">图片</option>
              <option value="gradient">渐变</option>
              <option value="solid">纯色</option>
            </select>
          </label>
          <div v-if="form.coverKind === 'image'" class="be-field">
            <span class="be-label">封面图片（来自图库）</span>
            <div class="be-cover-pick">
              <span class="be-cover-thumb">
                <img v-if="coverImage" :src="coverImage.dataUrl" :alt="coverImage.name" />
                <span v-else class="be-hint">未选择</span>
              </span>
              <button type="button" class="be-mini" data-testid="blog-editor-cover-pick" @click="coverPickerOpen = true">
                选择
              </button>
              <button
                v-if="form.coverImageId"
                type="button"
                class="be-mini"
                data-testid="blog-editor-cover-clear"
                @click="form.coverImageId = ''"
              >
                清除
              </button>
            </div>
            <p v-if="form.coverImageId && !coverImage" class="be-warn">所选封面图已不在图库中，请重新选择</p>
          </div>
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
        <button
          type="button"
          class="ui-btn ui-btn--sm ui-btn--primary"
          :disabled="visibleErrors.length > 0"
          data-testid="blog-editor-publish"
          @click="handlePublish()"
        >
          发布
        </button>
        <button
          type="button"
          class="ui-btn ui-btn--sm"
          :class="{ 'ui-btn--primary': !wechat.publishing.value }"
          :disabled="wechat.publishing.value || visibleErrors.length > 0"
          data-testid="blog-editor-publish-wechat"
          @click="handlePublishWechat()"
        >
          <span v-if="wechat.publishing.value" class="btn-spinner" aria-hidden="true"></span>
          {{ wechat.publishing.value ? '发布中' : '发布到公众号' }}
        </button>
      </div>
      <p v-if="wechat.publishing.value" class="be-hint" data-testid="blog-editor-wechat-status">
        {{ wechat.progressMsg.value }}<span v-if="wechat.progressTotal.value">（{{ wechat.progressStep.value }}/{{ wechat.progressTotal.value }}）</span>
      </p>
      <p v-else-if="wechat.error.value" class="be-warn" data-testid="blog-editor-wechat-error">{{ wechat.error.value }}</p>
      <p v-else-if="wechat.result.value" class="be-hint" data-testid="blog-editor-wechat-ok">✓ 已发布到公众号草稿箱</p>
    </footer>

    <!-- Markdown 语法帮助弹框 -->
    <BaseDialog v-if="helpOpen" title="Markdown 语法帮助" width="760px" max-height="86vh" @close="helpOpen = false">
      <div class="md-help">
        <p class="md-help-intro">以下为常用 Markdown 语法，右侧为渲染效果（与编辑器「预览」一致）。</p>
        <div v-for="item in mdHelpItems" :key="item.name" class="md-help-row">
          <div class="md-help-head">{{ item.name }}</div>
          <pre class="md-help-code">{{ item.syntax }}</pre>
          <div v-if="item.sample" class="md-help-preview md-body" v-html="renderMarkdown(item.sample)"></div>
          <p v-else class="md-help-note">{{ item.note }}</p>
        </div>
      </div>
    </BaseDialog>

    <!-- 文中图片清单弹框：列出正文所有已插入图片，便于快速查看/定位/移除 -->
    <BaseDialog v-if="imageDialogOpen" :title="`文中图片（${articleImages.length}）`" width="720px" max-height="84vh" @close="imageDialogOpen = false">
      <div class="img-dialog">
        <p v-if="articleImages.length === 0" class="img-dialog-empty">正文还没有插入图片。点工具栏「图库」或「图片」即可插入。</p>
        <ul v-else class="img-dialog-grid">
          <li v-for="(img, idx) in articleImages" :key="img.id" class="img-dialog-card">
            <button
              type="button"
              class="img-dialog-thumb"
              :class="{ 'is-missing': img.missing }"
              :title="img.missing ? '图片缺失（可能未同步到本机）' : `在正文定位：${img.name}`"
              :data-testid="`blog-editor-dialog-image-${img.id}`"
              @click="openImageInText(img.id)"
            >
              <img v-if="!img.missing" :src="img.dataUrl" :alt="img.name" />
              <span v-else class="img-dialog-missing">缺失</span>
            </button>
            <div class="img-dialog-meta">
              <span class="img-dialog-idx">第 {{ idx + 1 }} 张</span>
              <span class="img-dialog-name" :title="img.name">{{ img.name }}</span>
            </div>
            <div class="img-dialog-ops">
              <button type="button" class="img-dialog-op" title="在正文定位该图" @click="openImageInText(img.id)">定位</button>
              <button type="button" class="img-dialog-op img-dialog-op--danger" title="从正文移除该图" @click="removeImageRef(img.id)">移除</button>
            </div>
          </li>
        </ul>
      </div>
    </BaseDialog>

    <!-- 图库选择器：正文插入（多选）/ 封面选择（单选） -->
    <BlogImagePicker
      v-if="libraryOpen"
      multiple
      title="从图库插入图片"
      @select="insertFromLibrary"
      @close="libraryOpen = false"
    />
    <BlogImagePicker
      v-if="coverPickerOpen"
      title="选择封面图片"
      @select="pickCover"
      @close="coverPickerOpen = false"
    />

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

/* ===== Markdown 工具栏 ===== */
/* 吸顶：相对滚动容器 .ba-content（BlogAdminView）；sticky 保留原占位，无布局跳动。
   z-index 20：高于普通流内容，低于右侧设置抽屉(200)与弹框(300)。 */
.be-md-toolbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card, #ffffff);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(15, 23, 42, 0.06));
}

/* 工具栏左侧：原有 Markdown 按钮分组（包一层便于与右侧快捷操作分列两端） */
.be-md-groups {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

/* 工具栏右侧快捷操作：与底部操作条同款按钮，窄屏独占一行右对齐 */
.be-md-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}

.be-md-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.be-md-sep {
  align-self: stretch;
  width: 1px;
  margin: 2px 2px;
  background-color: var(--color-border, #e2e8f0);
}

.be-md-btn {
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 6px);
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
}

.be-md-btn:hover {
  background-color: var(--color-bg-2, #f1f5f9);
  color: var(--color-text, #0f172a);
}

.be-md-btn:active {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
}

/* 隐藏的图片文件选择框：不应占据任何布局空间 */
.be-file-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
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

/* 封面图选择（取自图库） */
.be-cover-pick {
  display: flex;
  align-items: center;
  gap: 8px;
}

.be-cover-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
  min-width: 0;
  height: 56px;
  overflow: hidden;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-2, #f1f5f9);
}

.be-cover-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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

/* ===== Markdown 语法帮助弹框 ===== */
.md-help-intro {
  margin: 0 0 14px;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
}

.md-help-row {
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px dashed var(--color-border, #e2e8f0);
}

.md-help-row:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.md-help-head {
  margin: 0 0 6px;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text, #0f172a);
}

.md-help-code {
  margin: 0 0 6px;
  padding: 8px 10px;
  background-color: var(--color-bg-2, #f1f5f9);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: var(--font-size-xs, 12px);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--color-text, #0f172a);
  overflow-x: auto;
}

.md-help-preview {
  margin: 0;
  padding: 8px 10px;
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  font-size: var(--font-size-sm, 14px);
}

.md-help-note {
  margin: 0;
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
}

/* ===== 文中图片清单弹框 ===== */
.img-dialog-empty {
  margin: 0;
  padding: 24px 8px;
  text-align: center;
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-sm, 13px);
}

.img-dialog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.img-dialog-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card, #ffffff);
}

.img-dialog-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 96px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-2, #f1f5f9);
  cursor: pointer;
}

.img-dialog-thumb:hover {
  border-color: var(--color-primary, #3b82f6);
}

.img-dialog-thumb.is-missing {
  cursor: default;
}

.img-dialog-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background-color: var(--color-bg-2, #f1f5f9);
}

.img-dialog-missing {
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-sm, 13px);
}

.img-dialog-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.img-dialog-idx {
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 11px);
}

.img-dialog-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-xs, 12px);
}

.img-dialog-ops {
  display: flex;
  gap: 6px;
}

.img-dialog-op {
  flex: 1 1 auto;
  padding: 4px 0;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
}

.img-dialog-op:hover {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.img-dialog-op--danger:hover {
  color: var(--color-error, #ef4444);
  border-color: var(--color-error, #ef4444);
}

@media (max-width: 768px) {
  .be-body { flex-direction: column; }
  .be-editor-wrap { flex-direction: column; min-height: 320px; }
  /* 工具栏快捷操作窄屏独占一行，与底部操作条同款拉伸，避免溢出/重叠 */
  .be-md-actions { width: 100%; margin-left: 0; justify-content: flex-end; }
  .be-md-actions .ui-btn { flex: 1 1 auto; min-height: 44px; }
  .be-foot-ops { width: 100%; }
  .be-foot-ops .ui-btn { flex: 1 1 auto; min-height: 44px; }
}
</style>
