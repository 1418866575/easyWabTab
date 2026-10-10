<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { showConfirm } from '@/utils/dialog'
import { useWorkbenchDiaryStore } from '@/stores/workbenchDiary'
import { dateKeyOf, diaryDateLabel, findDiaryByDate, DIARY_MOODS, diaryMoodOf } from '@/composables/diaryCore'
import { useDiaryCategoriesStore } from '@/stores/diaryCategories'
import { usePageSize } from '@/composables/usePageSize'
import { renderMarkdown } from '@/composables/noteMarkdown'
import { useToast } from '@/composables/useToast'
import type { WorkbenchDiary } from '@/types'

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
const draftKind = ref<'diary' | 'idea'>('diary')
const draftCategory = ref('')
const draftMood = ref('')
const draftPinned = ref(false)
const previewMode = ref(false)

// 当前选中日期的条目（限定当前日志本，多日志本隔离视图）
const selectedEntry = computed<WorkbenchDiary | undefined>(() => findDiaryByDate(store.currentEntries, selectedDate.value))

// 脏检查：草稿 ≠ 该日期已存内容（未保存修改视为脏）
const isDirty = computed(() => draft.value !== (selectedEntry.value?.content ?? ''))

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

// ===== 日期切换（统一脏检查入口：日期输入 / 今日按钮 / 卡片点击）=====
async function selectDate(dateKey: string): Promise<void> {
  if (dateKey === selectedDate.value) return
  if (isDirty.value && !await showConfirm('当前内容未保存，确定切换日期？')) return
  selectedDate.value = dateKey
  // 该日期已有条目（当前日志本内）→ 载入其内容为草稿 + 结构字段；无条目 → 空草稿（查找走 diaryCore.findDiaryByDate）
  const entry = findDiaryByDate(store.currentEntries, dateKey)
  draft.value = entry?.content ?? ''
  draftKind.value = entry?.kind ?? 'diary'
  draftCategory.value = entry?.category ?? ''
  draftMood.value = entry?.mood ?? ''
  draftPinned.value = entry?.pinned === true
  draftCover.value = entry?.coverImage ?? ''
  previewMode.value = false
}

// 卡片分类名（引用日记专属分类；无分类或找不到 → undefined）
function diaryCatName(entry: WorkbenchDiary): string | undefined {
  if (!entry.category) return undefined
  return diaryCatStore.allCategories.find(c => c.id === entry.category)?.name
}

// ===== 保存 / 删除 =====
async function handleSave(): Promise<void> {
  const trimmed = draft.value.trim()
  if (!trimmed) {
    toast.warning('内容为空，未保存')
    return
  }
  await store.upsertEntry(selectedDate.value, draft.value, {
    category: draftCategory.value,
    mood: draftMood.value,
    pinned: draftPinned.value,
    kind: draftKind.value,
    coverImage: draftCover.value
  })
  // 与持久化内容对齐（store 保存时 trim），避免尾随空格造成永久脏态
  draft.value = trimmed
  toast.success('日记已保存')
}

// 表格操作列「删除」：按 id 软删（逻辑删除）
async function handleDeleteById(id: string): Promise<void> {
  if (!await showConfirm('确定要删除这篇日记吗？删除后可在「已删除」中恢复。')) return
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

// 表格行点击（正常视图）：载入该日期到编辑器（selectDate 含脏检查确认）
function onRowClick(entry: WorkbenchDiary): void {
  if (showDeleted.value) return // 已删除视图不载入编辑
  selectDate(entry.date)
}

// 切换日志本后，重新载入选中日期在本本的条目（无则空草稿）
watch(
  () => store.currentJournalId,
  () => {
    const entry = findDiaryByDate(store.currentEntries, selectedDate.value)
    draft.value = entry?.content ?? ''
    draftKind.value = entry?.kind ?? 'diary'
    draftCategory.value = entry?.category ?? ''
    draftMood.value = entry?.mood ?? ''
    draftPinned.value = entry?.pinned === true
    draftCover.value = entry?.coverImage ?? ''
    previewMode.value = false
    currentPage.value = 1
  }
)

// 视图切换时回到第一页
watch(showDeleted, () => { currentPage.value = 1 })

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
            v-for="j in store.journals"
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

    <!-- 主区：编辑器列 + 历史列（响应式由下方媒体查询接管） -->
    <div class="dj-main">
      <div class="dj-editor">
        <el-input
          v-if="!previewMode"
          v-model="draft"
          type="textarea"
          class="dj-content-input"
          data-testid="dj-content-input"
          placeholder="写下今天的心情…"
          resize="vertical"
        />
        <div
          v-if="previewMode"
          class="dj-preview"
          data-testid="dj-preview"
          v-html="renderMarkdown(draft)"
        ></div>
      </div>

            <!-- 日记分类管理弹框 -->

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

/* 写作「纸面」 */
.dj-content-input {
  min-height: 260px;
  resize: vertical;
  line-height: 1.7;
  border-radius: var(--radius-md, 8px);
}

.dj-content-input :deep(.el-textarea__inner) {
  min-height: 260px !important;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  padding: 14px 16px;
  font-size: 15px;
  line-height: 1.7;
  color: var(--color-text, #1e293b);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.06));
}

.dj-preview {
  min-height: 260px;
  max-height: 480px;
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

/* ===== 空态 ===== */
.dj-empty {
  text-align: center;
  color: var(--color-text-muted, #94a3b8);
  font-size: 14px;
  padding: 40px 20px;
  background: var(--color-bg-card, #fff);
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
}

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
  .dj-main .dj-content-input,
  .dj-main .dj-preview {
    min-height: 420px;
  }

  .dj-main .dj-preview {
    max-height: none;
  }

  .dj-main .dj-content-input :deep(.el-textarea__inner) {
    height: 100%;
    min-height: 420px !important;
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
  .dj-main .dj-content-input,
  .dj-main .dj-preview {
    min-height: 420px;
  }

  .dj-main .dj-preview {
    max-height: none;
  }

  .dj-main .dj-content-input :deep(.el-textarea__inner) {
    height: 100%;
    min-height: 420px !important;
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

