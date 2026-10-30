<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { showConfirm } from '@/utils/dialog'
import { useWorkbenchDiaryStore } from '@/stores/workbenchDiary'
import { dateKeyOf, diaryDateLabel, findDiaryByDate, DIARY_MOODS, diaryMoodOf } from '@/composables/diaryCore'
import { useDiaryCategoriesStore } from '@/stores/diaryCategories'
import { usePageSize } from '@/composables/usePageSize'
import { renderMarkdown } from '@/composables/noteMarkdown'
// Markdown 编辑能力与博客后台同源：语法变换纯函数 + 图片短引用（共享博客图库）
import { applyMarkdown } from '@/composables/blogEditorMd'
import type { MdBlockKind } from '@/composables/blogEditorMd'
import { imageRef, isAllowedDataImage, parseImageRefs, removeImageRefs, resolveImageRefs } from '@/composables/blogImages'
import { useBlogStore } from '@/stores/blog'
import BlogImagePicker from '@/components/blog/BlogImagePicker.vue'
import { useToast } from '@/composables/useToast'
import type { BlogImage, WorkbenchDiary } from '@/types'

// ===== 底部日记记录表格（每页 10 条分页）=====
const { pageSize, PAGE_SIZES } = usePageSize('dj-table-pager', 10)
const currentPage = ref(1)

// 软删除视图开关（顶部「已删除」筛选；开启后仅展示已软删条目）
const showDeleted = ref(false)

// 封面图草稿（随当前选中日记；空 → 表格展示时回退正文首图）
const draftCover = ref('')

const store = useWorkbenchDiaryStore()
const diaryCatStore = useDiaryCategoriesStore()
const toast = useToast()

// 今天日期键（dateKeyOf 本地日期，防 UTC 偏移；会话内不变，无需响应式）
const todayKey = dateKeyOf(new Date())

// 日期快捷选项（便捷浏览历史日期：今天/昨天/一周前/一月前，el-date-picker shortcuts）
const dateShortcuts = [
  { text: '今天', value: new Date() },
  { text: '昨天', value: () => { const d = new Date(); d.setDate(d.getDate() - 1); return d } },
  { text: '一周前', value: () => { const d = new Date(); d.setDate(d.getDate() - 7); return d } },
  { text: '一月前', value: () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d } }
]

// ===== 编辑器状态 =====
const selectedDate = ref(todayKey)
const draft = ref('')
// 标题草稿（可选字段；与列表首列「标题」对应同一字段 title）
const draftTitle = ref('')
const draftKind = ref<'diary' | 'idea'>('diary')
const draftCategory = ref('')
const draftMood = ref('')
const draftPinned = ref(false)
// 视图：编辑 / 分屏 / 预览（与博客后台编辑器一致的三模式）
const viewMode = ref<'edit' | 'split' | 'preview'>('edit')
// 正文 textarea 引用（applyMarkdown 需读取选区 / 恢复光标）
const contentEl = ref<HTMLTextAreaElement | null>(null)
// 隐藏的图片文件选择框（点工具栏「图片」触发）
const fileInput = ref<HTMLInputElement | null>(null)
// 共享博客图库选择器（日记正文插图复用博客图片库）
const libraryOpen = ref(false)
const blogStore = useBlogStore()

// 当前选中日期的条目（限定当前日志本，多日志本隔离视图）
const selectedEntry = computed<WorkbenchDiary | undefined>(() => findDiaryByDate(store.currentEntries, selectedDate.value))

// 脏检查：草稿 ≠ 该日期已存内容（未保存修改视为脏）
const isDirty = computed(() =>
  draft.value !== (selectedEntry.value?.content ?? '') ||
  draftTitle.value.trim() !== (selectedEntry.value?.title ?? '')
)

// 实时字数（textarea 内容长度）
const charCount = computed(() => draft.value.length)

// 表格数据源：正常视图排除软删，『已删除』视图仅展示软删（排序仍走 diaryCore 置顶优先 + 日期降序）
const tableEntries = computed<WorkbenchDiary[]>(() => {
  return showDeleted.value ? store.deletedEntries : store.sortedEntries
})

// 当前页切片（每页 pageSize，默认 10）
const pageItems = computed<WorkbenchDiary[]>(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return tableEntries.value.slice(start, start + pageSize.value)
})

// ===== 底部日记记录表格（消费 tableEntries：置顶优先 → date 降序 → createdAt 降序，排序公式属 diaryCore）=====
// 每页 10 条（usePageSize 默认 10，可切 20/50），由 el-pagination 接管翻页，避免长列表拖累渲染。

// 首次挂载：默认选中「今天」，若今天已有日记则直接载入草稿
// （此前不载入 → 编辑器空白，用户以为没写过，保存会把原内容覆盖掉）
onMounted(() => {
  loadDraftFromEntry(findDiaryByDate(store.currentEntries, selectedDate.value))
})

// ===== 日期切换（统一脏检查入口：日期输入 / 今日按钮 / 卡片点击）=====
/**
 * 把某条日记载入草稿（无条目 = 空草稿）。
 * 日期切换 / 日志本切换 / 行点击 / 首次挂载 四处共用，避免字段漏加（曾漏过 title）。
 */
function loadDraftFromEntry(entry?: WorkbenchDiary): void {
  draft.value = entry?.content ?? ''
  draftTitle.value = entry?.title ?? ''
  draftKind.value = entry?.kind ?? 'diary'
  draftCategory.value = entry?.category ?? ''
  draftMood.value = entry?.mood ?? ''
  draftPinned.value = entry?.pinned === true
  draftCover.value = entry?.coverImage ?? ''
}

async function selectDate(dateKey: string): Promise<void> {
  if (dateKey === selectedDate.value) return
  if (isDirty.value && !await showConfirm('当前内容未保存，确定切换日期？')) return
  selectedDate.value = dateKey
  loadDraftFromEntry(findDiaryByDate(store.currentEntries, dateKey))
  viewMode.value = 'edit'
}

// 卡片分类名（引用日记专属分类；无分类或找不到 → undefined）
function diaryCatName(entry: WorkbenchDiary): string | undefined {
  if (!entry.category) return undefined
  return diaryCatStore.allCategories.find(c => c.id === entry.category)?.name
}

// ===== 保存 / 删除 =====
async function handleSave(): Promise<void> {
  const trimmed = draft.value.trim()
  const title = draftTitle.value.trim()
  if (!trimmed) {
    toast.warning('内容为空，未保存')
    return
  }
  await store.upsertEntry(selectedDate.value, draft.value, {
    title,
    category: draftCategory.value,
    mood: draftMood.value,
    pinned: draftPinned.value,
    kind: draftKind.value,
    coverImage: draftCover.value
  })
  // 与持久化内容对齐（store 保存时 trim），避免尾随空格造成永久脏态
  draft.value = trimmed
  draftTitle.value = title
  toast.success('日记已保存')
}

// 表格操作列「删除」：按 id 软删（逻辑删除）
async function handleDeleteById(id: string): Promise<void> {
  if (!await showConfirm('确定要删除这篇日记吗？删除后可在「回收站」中恢复。')) return
  await store.softDeleteEntry(id)
  if (currentPage.value > 1 && pageItems.value.length === 0) currentPage.value--
}

// 恢复软删条目
async function handleRestore(id: string): Promise<void> {
  await store.restoreEntry(id)
  if (currentPage.value > 1 && pageItems.value.length === 0) currentPage.value--
}

// 彻底删除（硬删，不可恢复）
async function handlePurge(id: string): Promise<void> {
  if (!await showConfirm('彻底删除后无法恢复，确定吗？')) return
  await store.deleteEntry(id)
  if (currentPage.value > 1 && pageItems.value.length === 0) currentPage.value--
}

/** 列表「内容」列摘要：压成单行并截断，空内容由调用方兜底 */
function contentSnippet(content: string): string {
  const one = (content || '').replace(/\s+/g, ' ').trim()
  return one.length > 60 ? `${one.slice(0, 60)}…` : one
}

/** 表格行点击（正常视图）：载入该条目到编辑器（含脏检查确认） */
async function onRowClick(entry: WorkbenchDiary): Promise<void> {
  if (showDeleted.value) return // 已删除视图不载入编辑
  if (entry.date === selectedDate.value) {
    // 同一天：selectedDate 不变 → selectDate 会早退，这里直接载入。
    // 否则"打开今天这篇"永远点不动，编辑器一直空白、保存还会覆盖原内容。
    if (isDirty.value && !await showConfirm('当前内容未保存，确定重新载入该条目？')) return
    loadDraftFromEntry(entry)
    viewMode.value = 'edit'
    return
  }
  await selectDate(entry.date)
}

// 切换日志本后，重新载入选中日期在本本的条目（无则空草稿）
watch(
  () => store.currentJournalId,
  () => {
    loadDraftFromEntry(findDiaryByDate(store.currentEntries, selectedDate.value))
    viewMode.value = 'edit'
    currentPage.value = 1
  }
)

// 视图切换时回到第一页
watch(showDeleted, () => { currentPage.value = 1 })

// ===== Markdown 工具栏（与博客后台同源：纯函数 + 共享博客图库短引用）=====

interface MdToolbarButton {
  /** image = 选本地文件上传；library = 从共享图库选取（可多选） */
  kind: MdBlockKind | 'image' | 'library'
  label: string
  title: string
  group: number
}

/** 工具栏按钮（含分组，group 用于渲染分隔线）；图库入口置顶（插图最常用） */
const MD_TOOLBAR: MdToolbarButton[] = [
  { kind: 'library', label: '图库', title: '从共享图库插入已有图片（可多选）', group: -1 },
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
  { kind: 'image', label: '图片', title: '插入图片（选择本地图片，存入共享博客图库）', group: 3 },
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
  const res = applyMarkdown(kind, draft.value, start, end)
  draft.value = res.value
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
 * 选中本地图片后：逐个读为 base64 → 白名单校验 → 存入共享博客图库 → 光标处插入短引用 `![名称](img:<id>)`。
 * 日记正文复用博客图片库，避免重复存储、且多设备同步只走一份图库。
 */
async function onPickImages(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = '' // 复位，便于重复选择同一文件
  if (files.length === 0) return
  const ta = contentEl.value
  let pos = ta ? ta.selectionStart : draft.value.length
  let value = draft.value
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
    const saved = await blogStore.addImage(name, dataUrl)
    const res = applyMarkdown('image', value, pos, pos, { alt: name, url: imageRef(saved.id) })
    value = res.value
    pos = res.selEnd
  }
  if (value === draft.value) {
    if (rejected) toast.warning(`已跳过 ${rejected} 个不支持的图片（仅支持位图，svg 被禁止）`)
    return
  }
  draft.value = value
  await nextTick()
  if (ta) {
    ta.focus()
    ta.setSelectionRange(pos, pos)
  }
  if (rejected) {
    toast.warning(`已插入图片，${rejected} 个不支持的格式被跳过（仅支持位图）`)
  }
}

// ===== 文中图片（缩略图条）=====

/** 正文引用的图片（按出现顺序）；库中已无该图时标记 missing */
const articleImages = computed(() =>
  parseImageRefs(draft.value).map(id => {
    const img = blogStore.images.find(i => i.id === id)
    return { id, name: img?.name || '图片', dataUrl: img?.dataUrl || '', missing: !img }
  })
)

/** 点击缩略图：把正文里对应的短引用选中（便于定位） */
function locateImageRef(id: string): void {
  const ta = contentEl.value
  if (!ta) return
  const needle = imageRef(id)
  const idx = draft.value.indexOf(needle)
  if (idx < 0) return
  ta.focus()
  ta.setSelectionRange(idx, idx + needle.length)
}

/** 移除图片：先清正文引用并保存，再由共享图库决定是否回收（被其它文章引用则保留） */
async function removeImageRef(id: string): Promise<void> {
  const name = articleImages.value.find(i => i.id === id)?.name ?? '这张图片'
  if (!await showConfirm(`从正文移除「${name}」？`, '移除')) return
  draft.value = removeImageRefs(draft.value, id)
  await handleSave()
  await blogStore.removeImage(id)
}

/** 从共享博客图库插入：在光标处依次插入短引用（图片本体仍只在图库存一份） */
async function insertFromLibrary(images: BlogImage[]): Promise<void> {
  if (images.length === 0) return
  const ta = contentEl.value
  let pos = ta ? ta.selectionStart : draft.value.length
  let value = draft.value
  for (const img of images) {
    const res = applyMarkdown('image', value, pos, pos, { alt: img.name || '图片', url: imageRef(img.id) })
    value = res.value
    pos = res.selEnd
  }
  draft.value = value
  await nextTick()
  if (ta) {
    ta.focus()
    ta.setSelectionRange(pos, pos)
  }
}

// ===== 预览（正文图片是 img:<id> 短引用，渲染前用共享图库还原为 data URL）=====
const renderedPreview = computed(() =>
  renderMarkdown(resolveImageRefs(draft.value, id => blogStore.imageUrlById.get(id)))
)

</script>

<template>
  <div class="wb-diary">
    <!-- 顶部：条目大标题（选中日期）+ 工具栏（手记风格纸面头部） -->
    <div class="dj-head">
      <div class="dj-entry-title">
        <span class="dj-entry-date" data-testid="dj-entry-date">{{ diaryDateLabel(selectedDate) }}</span>
        <span v-if="selectedEntry" class="dj-entry-badge">已记录</span>
        <span v-else class="dj-entry-badge is-empty">未记录</span>
      </div>

      <!-- 顶部筛选控件：日记本选择 → 分类下拉框 → 日期选择 → 今日选项（+ 已删除筛选） -->
      <div class="dj-filter-bar" data-testid="dj-filter-bar">
        <el-select
          :model-value="store.currentJournalId"
          size="small"
          class="dj-journal-select"
          data-testid="dj-journal-select"
          @change="(v: unknown) => store.setCurrentJournal(String(v ?? ''))"
        >
          <el-option
            v-for="j in store.activeJournals"
            :key="j.id"
            :label="j.name"
            :value="j.id"
          />
        </el-select>
        <el-select
          v-model="draftCategory"
          placeholder="分类"
          size="small"
          class="dj-filter-cat"
          data-testid="dj-filter-cat"
        >
          <el-option label="未分类" value="" />
          <el-option
            v-for="c in diaryCatStore.allCategories"
            :key="c.id"
            :label="c.name"
            :value="c.id"
          />
        </el-select>
        <el-date-picker
          :model-value="selectedDate"
          type="date"
          value-format="YYYY-MM-DD"
          class="dj-date-input"
          data-testid="dj-date-input"
          size="small"
          :clearable="false"
          :shortcuts="dateShortcuts"
          @change="selectDate"
        />
        <el-button type="primary" size="small" data-testid="dj-save-btn" @click="handleSave">保存</el-button>
        <div class="dj-stats" data-testid="dj-stats">
          <span class="dj-stat"><b data-testid="dj-streak">{{ store.stats.streak }}</b> 天连续</span>
          <span class="dj-stat"><b data-testid="dj-total">{{ store.stats.total }}</b> 篇记录</span>
          <span class="dj-char-count" data-testid="dj-char-count">{{ charCount }} 字</span>
        </div>
      </div>


      <!-- 心情选择 -->
      <div class="dj-mood-row" data-testid="dj-mood-row">
        <span class="dj-mood-label">心情</span>
        <button
          v-for="m in DIARY_MOODS"
          :key="m.key"
          class="dj-mood-chip"
          :class="{ 'is-active': draftMood === m.key }"
          :data-testid="`dj-mood-${m.key}`"
          :title="m.label"
          @click="draftMood = draftMood === m.key ? '' : m.key"
        >{{ m.emoji }}</button>
      </div>
    </div>

    <!-- 主区：编辑器（三模式 + Markdown 工具栏 + 文中图片条） -->
    <div class="dj-main">
      <div class="dj-editor">
        <!-- 标题（可选）：放在编辑列顶部（不能直接放 .dj-main 下——桌面端 .dj-main > * 会把它当第二栏挤压） -->
        <div class="dj-title-bar">
          <input
            v-model="draftTitle"
            type="text"
            class="dj-title-input"
            placeholder="日记标题（可选）"
            maxlength="100"
            aria-label="日记标题"
            data-testid="dj-title-input"
          />
          <span class="dj-title-count">{{ draftTitle.length }}/100</span>
        </div>
        <!-- 视图切换：编辑 / 分屏 / 预览 -->
        <div class="dj-view-switch" role="group" aria-label="编辑器视图">
          <button
            v-for="m in (['edit', 'split', 'preview'] as const)"
            :key="m"
            type="button"
            class="dj-view-btn"
            :class="{ active: viewMode === m }"
            :data-testid="`dj-view-${m}`"
            @click="viewMode = m"
          >{{ m === 'edit' ? '编辑' : m === 'split' ? '分屏' : '预览' }}</button>
        </div>

        <!-- Markdown 工具栏（非预览视图显示；图片按钮另走文件选择） -->
        <div v-if="viewMode !== 'preview'" class="dj-md-toolbar" role="toolbar" aria-label="Markdown 编辑工具栏">
          <template v-for="grp in toolbarGroups" :key="grp.group">
            <span class="dj-md-sep" aria-hidden="true"></span>
            <div class="dj-md-group">
              <button
                v-for="b in grp.items"
                :key="b.kind"
                type="button"
                class="dj-md-btn"
                :title="b.title"
                :aria-label="b.title"
                :data-testid="`dj-md-${b.kind}`"
                @click="onToolbarClick(b)"
              >{{ b.label }}</button>
            </div>
          </template>
        </div>

        <!-- 文中图片缩略图条：正文用 img:<id> 短引用，这里把图片以缩略图显示出来 -->
        <div v-if="viewMode !== 'preview' && articleImages.length" class="dj-img-bar" data-testid="dj-image-bar">
          <span class="dj-img-bar-title">文中图片</span>
          <ul class="dj-img-list">
            <li v-for="img in articleImages" :key="img.id" class="dj-img-item">
              <button
                type="button"
                class="dj-img-thumb"
                :title="img.missing ? '图片缺失（可能未同步到本机）' : `定位：${img.name}`"
                :data-testid="`dj-image-${img.id}`"
                @click="locateImageRef(img.id)"
              >
                <img v-if="!img.missing" :src="img.dataUrl" :alt="img.name" />
                <span v-else class="dj-img-missing">缺失</span>
              </button>
              <div class="dj-img-meta">
                <span class="dj-img-name" :title="img.name">{{ img.name }}</span>
                <button type="button" class="dj-img-remove" title="从正文移除该图片" @click="removeImageRef(img.id)">移除</button>
              </div>
            </li>
          </ul>
        </div>

        <!-- 编辑 / 分屏 / 预览 三态 -->
        <div class="dj-editor-wrap" :class="`is-${viewMode}`">
          <textarea
            v-if="viewMode !== 'preview'"
            ref="contentEl"
            v-model="draft"
            class="dj-md"
            placeholder="写下今天的心情…"
            aria-label="日记正文"
            spellcheck="false"
            data-testid="dj-content-input"
            @keydown="onContentKeydown"
          ></textarea>
          <!-- v-html 内容来自 markdown-it（html:false，仅白名单图片 data URL），不含可执行脚本 -->
          <div v-if="viewMode !== 'edit'" class="dj-preview md-body" data-testid="dj-preview" v-html="renderedPreview"></div>
        </div>

        <!-- 隐藏的图片选择框：由工具栏「图片」按钮触发，选择后转 base64 内联插入共享图库 -->
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          class="dj-file-hidden"
          data-testid="dj-image-input"
          @change="onPickImages"
        />
      </div>
    </div>
  </div>
    <!-- 日记记录列表（表格 + 每页 10 条分页） -->
    <div class="dj-table-section" data-testid="dj-table-section">
      <div class="dj-table-toolbar">
        <span class="dj-table-title">{{ showDeleted ? '已删除日记' : '日记记录' }}（{{ tableEntries.length }}）</span>
      </div>
      <el-table
        :data="pageItems"
        size="small"
        stripe
        class="ewt-table dj-table"
        style="width: 100%"
        data-testid="dj-table"
        @row-click="onRowClick"
      >
        <el-table-column label="标题" min-width="160" align="left" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.title" class="dj-title-cell">{{ row.title }}</span>
            <span v-else class="dj-muted">（无标题）</span>
          </template>
        </el-table-column>
        <el-table-column label="内容" min-width="220" align="left" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.content" class="dj-content-cell">{{ contentSnippet(row.content) }}</span>
            <span v-else class="dj-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="日期" min-width="130" align="center">
          <template #default="{ row }">{{ diaryDateLabel(row.date) }}</template>
        </el-table-column>
        <el-table-column label="分类" width="120" align="center">
          <template #default="{ row }">
            <span v-if="diaryCatName(row)" class="dj-cat-tag">{{ diaryCatName(row) }}</span>
            <span v-else class="dj-muted">未分类</span>
          </template>
        </el-table-column>
        <el-table-column label="心情" width="70" align="center">
          <template #default="{ row }">
            <span v-if="diaryMoodOf(row.mood)">{{ diaryMoodOf(row.mood)?.emoji }}</span>
            <span v-else class="dj-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="字数" width="80" align="center">
          <template #default="{ row }">{{ row.content.length }}</template>
        </el-table-column>
        <el-table-column label="置顶" width="70" align="center">
          <template #default="{ row }">
            <span v-if="row.pinned" class="dj-pin-cell">📌</span>
            <span v-else class="dj-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" class-name="ewt-op-col" width="170" align="center" fixed="right">
          <template #default="{ row }">
            <template v-if="!showDeleted">
              <button class="btn-edit" :data-testid="`dj-edit-${row.id}`" @click.stop="onRowClick(row)">编辑</button>
              <button class="btn-delete" :data-testid="`dj-del-${row.id}`" @click.stop="handleDeleteById(row.id)">删除</button>
            </template>
            <template v-else>
              <button class="btn-edit" :data-testid="`dj-restore-${row.id}`" @click.stop="handleRestore(row.id)">恢复</button>
              <button class="btn-delete" :data-testid="`dj-purge-${row.id}`" @click.stop="handlePurge(row.id)">彻底删除</button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="tableEntries.length > 0" class="dj-table-pager ewt-pager">
        <el-pagination
          v-model:current-page="currentPage"
          @size-change="currentPage = 1"
          v-model:page-size="pageSize"
          :page-sizes="PAGE_SIZES"
          layout="total, prev, pager, next, jumper"
          :total="tableEntries.length"
          background
          small
          prev-text="上一页"
          next-text="下一页"
        />
      </div>
      <div v-else class="dj-table-empty">
        {{ showDeleted ? '没有已删除的日记' : '还没有日记，写下今天的第一篇吧' }}
      </div>
    </div>

    <!-- 共享博客图库选择器（日记正文插图，复用博客图片库） -->
    <BlogImagePicker
      v-if="libraryOpen"
      multiple
      title="从图库插入图片"
      @select="insertFromLibrary"
      @close="libraryOpen = false"
    />
</template>
<style scoped>
/* 面板容器（与 WorkbenchNotes .wb-notes 同构） */
.wb-diary {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 顶部：大标题 + 工具栏（手记风格「纸面」头部） ===== */
.dj-head {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.06));
}

.dj-entry-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.dj-entry-date {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--color-text, #1e293b);
}

.dj-entry-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 9999px);
  color: #fff;
  background: var(--color-primary, #3b82f6);
}

.dj-entry-badge.is-empty {
  color: var(--color-text-muted, #94a3b8);
  background: var(--color-bg-hover, #f1f5f9);
}

.dj-date-input {
  width: 150px;
  flex-shrink: 0;
}

.dj-char-count {
  font-size: 14px;
  color: var(--color-text-secondary, #64748b);
  white-space: nowrap;
}

/* ===== 主区 ===== */
.dj-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.dj-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ===== 标题输入（内容编辑区上方，对应列表首列「标题」） ===== */
.dj-title-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  margin-bottom: 10px;
}

.dj-title-input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card, #fff);
  color: var(--color-text-primary, #0f172a);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.dj-title-input::placeholder {
  color: var(--color-text-secondary, #94a3b8);
  font-weight: 400;
}

.dj-title-input:focus {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.dj-title-count {
  flex: none;
  font-size: 12px;
  color: var(--color-text-secondary, #94a3b8);
}

/* 列表：标题 / 内容摘要单元格 */
.dj-title-cell {
  font-weight: 600;
  color: var(--color-text-primary, #0f172a);
}

.dj-content-cell {
  color: var(--color-text-secondary, #64748b);
}

/* ===== 编辑器三态容器 ===== */
.dj-editor-wrap {
  display: flex;
  gap: 10px;
  min-height: 360px;
}

.dj-editor-wrap.is-split {
  flex-direction: row;
}

.dj-editor-wrap.is-edit,
.dj-editor-wrap.is-preview {
  flex-direction: column;
}

/* 写作「纸面」：原生 textarea，便于读取选区 / 恢复光标 */
.dj-md {
  flex: 1 1 0;
  min-width: 0;
  resize: vertical;
}

.dj-preview {
  flex: 1 1 0;
  min-width: 0;
  min-height: 360px;
  overflow-y: auto;
  padding: 16px 18px;
  font-size: 15px;
  line-height: 1.7;
  word-break: break-word;
  color: var(--color-text, #1e293b);
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.06));
}

.dj-preview > :first-child {
  margin-top: 0;
}

.dj-preview > :last-child {
  margin-bottom: 0;
}

/* ===== 视图切换（编辑 / 分屏 / 预览） ===== */
.dj-view-switch {
  display: flex;
  align-self: flex-start;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  overflow: hidden;
}

.dj-view-btn {
  padding: 4px 14px;
  border: none;
  background-color: var(--color-bg-card, #fff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
}

.dj-view-btn.active {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
}

/* ===== Markdown 工具栏 ===== */
.dj-md-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card, #fff);
}

.dj-md-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.dj-md-sep {
  align-self: stretch;
  width: 1px;
  margin: 2px 2px;
  background-color: var(--color-border, #e2e8f0);
}

.dj-md-btn {
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

.dj-md-btn:hover {
  background-color: var(--color-bg-2, #f1f5f9);
  color: var(--color-text, #1e293b);
}

.dj-md-btn:active {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
}

/* 隐藏的图片文件选择框：不应占据任何布局空间 */
.dj-file-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

/* ===== 文中图片缩略图条 ===== */
.dj-img-bar {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card, #fff);
}

.dj-img-bar-title {
  flex: 0 0 auto;
  padding-top: 4px;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
}

.dj-img-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dj-img-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 96px;
}

.dj-img-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 64px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-2, #f1f5f9);
  cursor: pointer;
}

.dj-img-thumb:hover {
  border-color: var(--color-primary, #3b82f6);
}

.dj-img-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dj-img-missing {
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
}

.dj-img-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.dj-img-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 11px);
}

.dj-img-remove {
  flex: 0 0 auto;
  padding: 0 4px;
  border: none;
  background: none;
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 11px);
  cursor: pointer;
}

.dj-img-remove:hover {
  color: var(--color-error, #ef4444);
}

/* ===== 历史区 ===== */
.dj-history {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
/* 卡片网格：弹框内固定每行 4 个（minmax(0,1fr) 防长内容溢出） */
.dj-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.dj-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  min-height: 190px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.06));
  cursor: pointer;
  transition: box-shadow var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease);
}

.dj-card:hover {
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.12));
  border-color: var(--color-primary, #3b82f6);
  transform: translateY(-2px);
}

.dj-card.is-selected {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, #eff6ff);
}

.dj-card-head {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 6px;
}

.dj-card-date {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 今天徽标 */
.dj-card-today {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 9999px);
  color: #fff;
  background: var(--color-primary, #3b82f6);
}

/* 卡片预览：line-clamp 6 行 */
.dj-card-preview {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-secondary, #475569);
  word-break: break-word;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
}

.dj-card-preview > :first-child {
  margin-top: 0;
}

.dj-card-preview > :last-child {
  margin-bottom: 0;
}

.dj-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
}

.dj-card-read {
  white-space: nowrap;
}

/* ===== 空态：原 .dj-empty 无任何模板引用（死代码），已删除；日记空态走 .dj-table-empty ===== */

/* ===== Markdown 排版（v-html 注入子节点不带 data-v-*，必须 :deep() 匹配；镜像 WorkbenchNotes） ===== */
.dj-preview :deep(h1),
.dj-card-preview :deep(h1) {
  font-size: 15px;
  font-weight: 700;
  margin: 0.35em 0;
}

.dj-preview :deep(h2),
.dj-card-preview :deep(h2) {
  font-size: 14px;
  font-weight: 700;
  margin: 0.35em 0;
}

.dj-preview :deep(h3),
.dj-card-preview :deep(h3) {
  font-size: 14px;
  font-weight: 600;
  margin: 0.35em 0;
}

.dj-preview :deep(p),
.dj-card-preview :deep(p) {
  margin: 0.35em 0;
}

.dj-preview :deep(ul),
.dj-card-preview :deep(ul),
.dj-preview :deep(ol),
.dj-card-preview :deep(ol) {
  margin: 0.35em 0;
  padding-left: 1.4em;
}

.dj-preview :deep(li),
.dj-card-preview :deep(li) {
  margin: 0.15em 0;
}

.dj-preview :deep(a),
.dj-card-preview :deep(a) {
  color: var(--color-primary, #3b82f6);
  text-decoration: underline;
  word-break: break-all;
}

.dj-preview :deep(code),
.dj-card-preview :deep(code) {
  background: color-mix(in srgb, currentColor 12%, transparent);
  padding: 1px 4px;
  border-radius: var(--radius-sm, 4px);
  font-size: 0.9em;
}

.dj-preview :deep(pre),
.dj-card-preview :deep(pre) {
  background: color-mix(in srgb, currentColor 12%, transparent);
  margin: 0.4em 0;
  padding: 8px 10px;
  border-radius: 6px;
  overflow-x: auto;
  max-width: 100%;
  font-size: 12px;
  line-height: 1.4;
}

.dj-preview :deep(blockquote),
.dj-card-preview :deep(blockquote) {
  margin: 0.4em 0;
  padding-left: 0.6em;
  border-left: 3px solid color-mix(in srgb, currentColor 35%, transparent);
  opacity: 0.85;
}

.dj-preview :deep(table),
.dj-card-preview :deep(table) {
  border-collapse: collapse;
  margin: 0.4em 0;
  font-size: 12px;
  max-width: 100%;
}

.dj-preview :deep(th),
.dj-card-preview :deep(th),
.dj-preview :deep(td),
.dj-card-preview :deep(td) {
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
}

.dj-preview :deep(th),
.dj-card-preview :deep(th) {
  font-weight: 600;
}

.dj-preview :deep(hr),
.dj-card-preview :deep(hr) {
  border: none;
  border-top: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  margin: 0.5em 0;
}

.dj-preview :deep(img),
.dj-card-preview :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}

/* ===== 心情选择行 ===== */
.dj-mood-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dj-mood-label {
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
  margin-right: 2px;
}

.dj-mood-chip {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-full, 9999px);
  background: var(--color-bg, #fff);
  cursor: pointer;
  transition: transform var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease), background var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease);
}

.dj-mood-chip:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary, #3b82f6);
}

.dj-mood-chip.is-active {
  background: var(--color-primary-soft, #eff6ff);
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary, #3b82f6) 25%, transparent);
}

/* ===== 历史筛选条 ===== */
.dj-filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.dj-filter-cat {
  width: 140px;
  flex-shrink: 0;
}

.dj-filter-count {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
}

/* ===== 卡片头部徽标（心情 / 置顶 / 分类） ===== */
.dj-card-mood {
  font-size: 14px;
  line-height: 1;
}

.dj-card-pin {
  font-size: 12px;
  line-height: 1;
}

.dj-card-cat {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 9999px);
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, #eff6ff);
  white-space: nowrap;
}

/* ===== 多日志本切换器 + 连续记录统计条 ===== */
.dj-journal-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dj-journal-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dj-journal-select {
  width: 180px;
  flex-shrink: 0;
}

.dj-stats {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}

.dj-stat b {
  color: var(--color-primary, #3b82f6);
  font-size: 16px;
  margin-right: 2px;
}

.dj-stat-journal {
  color: var(--color-text-muted, #94a3b8);
}

/* 日记/灵感 类型切换 */
.dj-kind-toggle {
  flex-shrink: 0;
}

.dj-kind-toggle :deep(.el-radio-button__inner) {
  padding: 6px 12px;
}

/* 卡片「灵感」徽标 */
.dj-card-idea {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 9999px);
  color: var(--color-warning, #f59e0b);
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 14%, transparent);
  white-space: nowrap;
}

/* ===== 桌面 769-1099px：单列堆叠、写作区 80% / 历史 20%、历史网格高度受限（自适应分页测量基准） ===== */
@media (min-width: 769px) and (max-width: 1099.98px) {
  .dj-main {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .dj-editor {
    flex: 4;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .dj-history {
    flex: 1;
    min-height: 0;
  }

  .dj-grid {
    flex: 1;
    min-height: 0;
  }

  /* 页面级滚动后面板不再钉满一屏：原 height:100% 依赖父链撑满已失效，
     改为显式最小高度，保证编辑/预览区体感稳定（内容超出随页面滚动） */
  .dj-main .dj-md,
  .dj-main .dj-preview {
    min-height: 420px;
  }

  .dj-main .dj-preview {
    max-height: none;
  }
}

/* ===== 桌面 ≥1100px：编辑器 | 历史 双栏 ===== */
@media (min-width: 1100px) {
  .dj-main {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 16px;
  }

  .dj-main > * {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .dj-grid {
    flex: 1;
    min-height: 0;
  }

  /* 页面级滚动后面板不再钉满一屏：原 height:100% 依赖父链撑满已失效，
     改为显式最小高度，保证编辑/预览区体感稳定（内容超出随页面滚动） */
  .dj-main .dj-md,
  .dj-main .dj-preview {
    min-height: 420px;
  }

  .dj-main .dj-preview {
    max-height: none;
  }
}

/* 历史区改为可滚动列表：桌面作用域内 .dj-grid-scroll 启用内部滚动；移动端页面滚动（.wb-content overflow-y:auto），不在此叠加 */
@media (min-width: 769px) {

}
/* ===== 日记记录表格（底部列表，每页 10 条）===== */
.dj-table-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.06));
}

.dj-table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dj-table-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

/* 顶部筛选条：日记本选择 → 分类 → 日期 → 今日 → 已删除 */
.dj-filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.dj-filter-cat {
  width: 140px;
  flex-shrink: 0;
}
.dj-filter-bar .dj-stats {
  margin-left: auto;
}

.dj-muted {
  color: var(--color-text-muted, #94a3b8);
}
.dj-cat-tag {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 9999px);
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, #eff6ff);
  white-space: nowrap;
}
.dj-pin-cell {
  font-size: 13px;
}
.dj-table-empty {
  text-align: center;
  color: var(--color-text-muted, #94a3b8);
  font-size: 14px;
  padding: 32px 20px;
}

/* 表格行手型（正常视图可点击载入编辑） */
.dj-table :deep(.el-table__row) {
  cursor: pointer;
}

@media (max-width: 768px) {
  .dj-filter-bar .dj-stats {
    margin-left: 0;
    width: 100%;
  }
}
</style>

