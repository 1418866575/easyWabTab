<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useWorkbenchDiaryStore } from '@/stores/workbenchDiary'
import { dateKeyOf, DEFAULT_JOURNAL_ID, diaryDateLabel, findDiaryByDate, DIARY_MOODS, diaryMoodOf } from '@/composables/diaryCore'
import { useDiaryCategoriesStore } from '@/stores/diaryCategories'
import { renderMarkdown } from '@/composables/noteMarkdown'
import { useToast } from '@/composables/useToast'
import type { WorkbenchDiary, WorkbenchJournal } from '@/types'
import DiaryCategoryManager from '@/components/DiaryCategoryManager.vue'
import Icon from '@/components/Icon.vue'

const store = useWorkbenchDiaryStore()
const diaryCatStore = useDiaryCategoriesStore()
const toast = useToast()

// 今天日期键（dateKeyOf 本地日期，防 UTC 偏移；会话内不变，无需响应式）
const todayKey = dateKeyOf(new Date())

// ===== 编辑器状态 =====
const selectedDate = ref(todayKey)
const draft = ref('')
const draftKind = ref<'diary' | 'idea'>('diary')
const draftCategory = ref('')
const draftMood = ref('')
const draftPinned = ref(false)
const previewMode = ref(false)
const showCatManager = ref(false)
const showListView = ref(false)
// 多日志本：新建 / 管理弹框状态
const showAddJournal = ref(false)
const newJournalName = ref('')
const showJournalMgr = ref(false)
const editingJournalId = ref<string | null>(null)
const editingJournalName = ref('')

// 当前选中日期的条目（限定当前日志本，多日志本隔离视图）
const selectedEntry = computed<WorkbenchDiary | undefined>(() => findDiaryByDate(store.currentEntries, selectedDate.value))

// 脏检查：草稿 ≠ 该日期已存内容（未保存修改视为脏）
const isDirty = computed(() => draft.value !== (selectedEntry.value?.content ?? ''))

// 实时字数（textarea 内容长度）
const charCount = computed(() => draft.value.length)

// ===== 历史筛选（分类 + 仅看置顶；排序仍走 diaryCore 置顶优先）=====
const filterCategory = ref('') // ''=全部；'uncategorized'=未分类；其余为分类 id
const filterPinnedOnly = ref(false)

const filteredEntries = computed<WorkbenchDiary[]>(() => {
  let list = store.sortedEntries
  if (filterCategory.value === 'uncategorized') list = list.filter(e => !e.category)
  else if (filterCategory.value) list = list.filter(e => e.category === filterCategory.value)
  if (filterPinnedOnly.value) list = list.filter(e => e.pinned)
  return list
})

// ===== 历史区改为可滚动列表（消费 filteredEntries：date 降序 → createdAt 降序，排序公式属 diaryCore）=====
// 不再分页：直接渲染全部 filteredEntries，由 CSS（桌面 .dj-grid-scroll 启 overflow-y:auto）内部滚动，
// 高度链 .dj-history{flex:1;min-height:0} → .dj-grid{flex:1;min-height:0} 约束滚动容器，避免内容被分页藏起。

// ===== 日期切换（统一脏检查入口：日期输入 / 今日按钮 / 卡片点击）=====
function selectDate(dateKey: string): void {
  if (dateKey === selectedDate.value) return
  if (isDirty.value && !confirm('当前内容未保存，确定切换日期？')) return
  selectedDate.value = dateKey
  // 该日期已有条目（当前日志本内）→ 载入其内容为草稿 + 结构字段；无条目 → 空草稿（查找走 diaryCore.findDiaryByDate）
  const entry = findDiaryByDate(store.currentEntries, dateKey)
  draft.value = entry?.content ?? ''
  draftKind.value = entry?.kind ?? 'diary'
  draftCategory.value = entry?.category ?? ''
  draftMood.value = entry?.mood ?? ''
  draftPinned.value = entry?.pinned === true
  previewMode.value = false
}

// 卡片分类名（引用日记专属分类；无分类或找不到 → undefined）
function diaryCatName(entry: WorkbenchDiary): string | undefined {
  if (!entry.category) return undefined
  return diaryCatStore.allCategories.find(c => c.id === entry.category)?.name
}

function handleDateInput(e: Event): void {
  const target = e.target as HTMLInputElement
  selectDate(target.value)
}

function handleToday(): void {
  selectDate(todayKey)
}

function onCardPreviewClick(e: MouseEvent): void {
  const t = e.target as Element | null
  if (t && t.closest('a')) e.stopPropagation()
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
    kind: draftKind.value
  })
  // 与持久化内容对齐（store 保存时 trim），避免尾随空格造成永久脏态
  draft.value = trimmed
  toast.success('日记已保存')
}

async function handleDelete(): Promise<void> {
  const entry = selectedEntry.value
  if (!entry) return
  if (!confirm('确定要删除这篇日记吗？')) return
  await store.deleteEntry(entry.id)
  // 选中日期已无条目：清空草稿（与空内容一致，不误判脏态）
  draft.value = ''
  previewMode.value = false
}

function readingMinutes(content: string): number {
  const n = content.trim().length
  return n === 0 ? 0 : Math.max(1, Math.ceil(n / 300))
}

// 列表弹框内点击某条：关闭弹框并载入该日期（selectDate 已含脏检查确认）
function selectFromList(entry: WorkbenchDiary): void {
  showListView.value = false
  selectDate(entry.date)
}

// ===== 多日志本：当前日志本名称 =====
const currentJournalName = computed(
  () => store.journals.find(j => j.id === store.currentJournalId)?.name ?? ''
)

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
    previewMode.value = false
  }
)

// ===== 富媒体：图片转 base64 内联进草稿（随日记走云同步）=====
const contentInputRef = ref<{ $el?: HTMLElement } | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function triggerImagePicker(): void {
  imageInputRef.value?.click()
}

async function handleInsertImage(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.warning('请选择图片文件')
    input.value = ''
    return
  }
  try {
    const dataUrl = await fileToDataUrl(file)
    const marker = `\n![图片](${dataUrl})\n`
    const ta = (contentInputRef.value?.$el as HTMLElement | undefined)?.querySelector('textarea') as HTMLTextAreaElement | null
    if (ta && !previewMode.value) {
      const start = ta.selectionStart ?? draft.value.length
      const end = ta.selectionEnd ?? draft.value.length
      draft.value = draft.value.slice(0, start) + marker + draft.value.slice(end)
      await nextTick()
      ta.focus()
      ta.setSelectionRange(start + marker.length, start + marker.length)
    } else {
      draft.value += marker
    }
  } catch {
    toast.error('图片插入失败')
  }
  input.value = ''
}

// ===== 多日志本 CRUD 接线 =====
async function confirmAddJournal(): Promise<void> {
  const name = newJournalName.value.trim()
  if (!name) return
  await store.addJournal(name)
  newJournalName.value = ''
  showAddJournal.value = false
  toast.success('已新建日志本')
}

function startRenameJournal(j: WorkbenchJournal): void {
  editingJournalId.value = j.id
  editingJournalName.value = j.name
}

function confirmRenameJournal(): void {
  if (editingJournalId.value) store.renameJournal(editingJournalId.value, editingJournalName.value)
  editingJournalId.value = null
}

function cancelRenameJournal(): void {
  editingJournalId.value = null
}

async function handleDeleteJournal(j: WorkbenchJournal): Promise<void> {
  if (store.journals.length <= 1) return
  const target = store.journals.find(x => x.id !== j.id)
  const promptMsg = target
    ? `删除「${j.name}」后，其下日记将迁移到「${target.name}」，确定删除？`
    : `删除「${j.name}」后，其下日记将迁移到默认日志本，确定删除？`
  if (!confirm(promptMsg)) return
  await store.deleteJournal(j.id)
  toast.success('日志本已删除，日记已迁移')
}

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

      <!-- 多日志本切换器 + 连续记录统计 -->
      <div class="dj-journal-bar" data-testid="dj-journal-bar">
        <div class="dj-journal-switch">
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
          <el-button size="small" data-testid="dj-journal-add" @click="showAddJournal = true">+ 新建</el-button>
          <el-button size="small" text data-testid="dj-journal-manage" @click="showJournalMgr = true">管理</el-button>
        </div>
        <div class="dj-stats" data-testid="dj-stats">
          <span class="dj-stat"><b data-testid="dj-streak">{{ store.stats.streak }}</b> 天连续</span>
          <span class="dj-stat"><b data-testid="dj-total">{{ store.stats.total }}</b> 篇记录</span>
          <span class="dj-stat dj-stat-journal">本：{{ currentJournalName }}</span>
        </div>
      </div>

      <div class="dj-toolbar">
        <div class="dj-toolbar-left">
          <el-date-picker
            :model-value="selectedDate"
            type="date"
            value-format="YYYY-MM-DD"
            class="dj-date-input"
            data-testid="dj-date-input"
            size="small"
            @change="(v: unknown) => handleDateInput({ target: { value: String(v ?? '') } } as unknown as Event)"
          />
          <el-select
            v-model="draftCategory"
            placeholder="分类"
            size="small"
            class="dj-cat-select"
            data-testid="dj-cat-select"
          >
            <el-option label="未分类" value="" />
            <el-option
              v-for="c in diaryCatStore.allCategories"
              :key="c.id"
              :label="c.name"
              :value="c.id"
            />
          </el-select>
          <el-button
            size="small"
            :type="draftPinned ? 'warning' : 'default'"
            plain
            :class="{ 'is-active': draftPinned }"
            data-testid="dj-pin-btn"
            @click="draftPinned = !draftPinned"
          >📌 置顶</el-button>
          <el-button size="small" data-testid="dj-today-btn" @click="handleToday">今日</el-button>
          <el-button size="small" data-testid="dj-image-btn" @click="triggerImagePicker">🖼️ 图片</el-button>
          <el-button type="primary" size="small" data-testid="dj-save-btn" @click="handleSave">保存</el-button>
          <el-button size="small" data-testid="dj-view-btn" @click="showListView = true">查看</el-button>
          <el-button
            v-if="selectedEntry"
            type="danger"
            plain
            size="small"
            data-testid="dj-delete-btn"
            @click="handleDelete"
          >删除</el-button>
        </div>
        <div class="dj-toolbar-right">
          <el-button size="small" text data-testid="dj-manage-cat" @click="showCatManager = true">分类管理</el-button>
          <el-button
            size="small"
            :type="previewMode ? 'primary' : 'default'"
            plain
            data-testid="dj-preview-toggle"
            @click="previewMode = !previewMode"
          >{{ previewMode ? '编辑' : '预览' }}</el-button>
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
        <input ref="imageInputRef" type="file" accept="image/*" style="display:none" data-testid="dj-image-input" @change="handleInsertImage" />
        <el-input
          v-if="!previewMode"
          ref="contentInputRef"
          v-model="draft"
          type="textarea"
          class="dj-content-input"
          data-testid="dj-content-input"
          placeholder="写下今天的心情…"
          resize="vertical"
        />
        <div
          v-else
          class="dj-preview"
          data-testid="dj-preview"
          v-html="renderMarkdown(draft)"
        ></div>
      </div>

            <!-- 日记分类管理弹框 -->
      <DiaryCategoryManager v-if="showCatManager" @close="showCatManager = false" />

      <!-- 新建日志本 -->
      <el-dialog v-model="showAddJournal" title="新建日志本" width="360px" align-center append-to-body>
        <el-input
          v-model="newJournalName"
          placeholder="日志本名称"
          maxlength="30"
          show-word-limit
          data-testid="dj-new-journal-input"
          @keyup.enter="confirmAddJournal"
        />
        <template #footer>
          <div class="ewt-dialog-footer">
            <el-button @click="showAddJournal = false">取消</el-button>
            <el-button type="primary" data-testid="dj-new-journal-confirm" @click="confirmAddJournal">创建</el-button>
          </div>
        </template>
      </el-dialog>

      <!-- 日志本管理：重命名 / 删除（迁移） -->
      <el-dialog v-model="showJournalMgr" title="日志本管理" width="480px" align-center append-to-body>
        <div class="dj-journal-list" data-testid="dj-journal-list">
          <div v-for="j in store.journals" :key="j.id" class="dj-journal-item" :data-testid="`dj-journal-item-${j.id}`">
            <template v-if="editingJournalId === j.id">
              <el-input
                v-model="editingJournalName"
                size="small"
                class="dj-journal-edit"
                data-testid="dj-journal-edit-input"
                @keyup.enter="confirmRenameJournal"
              />
              <el-button size="small" type="primary" data-testid="dj-journal-save" @click="confirmRenameJournal">保存</el-button>
              <el-button size="small" text @click="cancelRenameJournal">取消</el-button>
            </template>
            <template v-else>
              <span class="dj-journal-name">
                {{ j.name }}<span v-if="j.id === DEFAULT_JOURNAL_ID" class="dj-journal-default">（默认）</span>
              </span>
              <div class="dj-journal-actions">
                <el-button size="small" text data-testid="dj-journal-rename" @click="startRenameJournal(j)">重命名</el-button>
                <el-button
                  size="small"
                  text
                  type="danger"
                  :disabled="store.journals.length <= 1"
                  data-testid="dj-journal-del"
                  @click="handleDeleteJournal(j)"
                >删除</el-button>
              </div>
            </template>
          </div>
        </div>
        <template #footer>
          <div class="ewt-dialog-footer">
            <el-button type="primary" @click="showJournalMgr = false">完成</el-button>
          </div>
        </template>
      </el-dialog>

    </div>
  </div>
    <!-- 日记列表弹框（DialogOverlay 范式，与 WorkbenchExercise 一致） -->
    <Transition name="dialog">
      <div v-if="showListView" class="dialog-overlay list-dialog-overlay" @click.self="showListView = false">
        <div class="dialog list-dialog" data-testid="dj-list-dialog">
          <div class="dialog-header">
            <h3>日记列表<span class="djl-count">（{{ store.sortedEntries.length }}）</span></h3>
            <el-button class="close-btn" text @click="showListView = false"><Icon name="close" /></el-button>
          </div>
          <div class="djl-body">
            <div class="dj-history">
              <!-- 筛选条：分类 + 仅看置顶 -->
              <div class="dj-filter-bar" data-testid="dj-filter-bar">
                <el-select
                  v-model="filterCategory"
                  placeholder="全部分类"
                  size="small"
                  class="dj-filter-cat"
                  data-testid="dj-filter-cat"
                >
                  <el-option label="全部分类" value="" />
                  <el-option label="未分类" value="uncategorized" />
                  <el-option
                    v-for="c in diaryCatStore.allCategories"
                    :key="c.id"
                    :label="c.name"
                    :value="c.id"
                  />
                </el-select>
                <el-checkbox v-model="filterPinnedOnly" size="small" class="dj-filter-pin" data-testid="dj-filter-pin">仅看置顶</el-checkbox>
                <span v-if="filteredEntries.length !== store.sortedEntries.length" class="dj-filter-count" data-testid="dj-filter-count">共 {{ filteredEntries.length }} 篇</span>
              </div>

              <div v-if="store.sortedEntries.length === 0" class="dj-empty" data-testid="dj-empty">
                还没有日记，写下今天的第一篇吧
              </div>

              <div v-else-if="filteredEntries.length === 0" class="dj-empty" data-testid="dj-empty-filter">
                没有符合筛选条件的日记
              </div>

              <template v-else>
                <div class="dj-grid dj-grid-scroll">
                  <TransitionGroup name="grid">
                  <div
                    v-for="entry in filteredEntries"
                    :key="entry.id"
                    class="dj-card"
                    :class="{ 'is-selected': entry.date === selectedDate }"
                    :data-testid="`dj-card-${entry.id}`"
                    @click="selectFromList(entry)"
                  >
                    <div class="dj-card-head">
                      <span class="dj-card-date" :data-testid="`dj-card-date-${entry.id}`">{{ diaryDateLabel(entry.date) }}</span>
                      <span v-if="entry.kind === 'idea'" class="dj-card-idea" :data-testid="`dj-card-idea-${entry.id}`">💡 灵感</span>
                      <span v-if="entry.date === todayKey" class="dj-card-today" :data-testid="`dj-card-today-${entry.id}`">今天</span>
                      <span v-if="diaryMoodOf(entry.mood)" class="dj-card-mood" :title="diaryMoodOf(entry.mood)?.label" :data-testid="`dj-card-mood-${entry.id}`">{{ diaryMoodOf(entry.mood)?.emoji }}</span>
                      <span v-if="entry.pinned" class="dj-card-pin" :data-testid="`dj-card-pin-${entry.id}`">📌</span>
                      <span v-if="diaryCatName(entry)" class="dj-card-cat" :data-testid="`dj-card-cat-${entry.id}`">{{ diaryCatName(entry) }}</span>
                    </div>
                    <div class="dj-card-preview" :data-testid="`dj-card-preview-${entry.id}`" v-html="renderMarkdown(entry.content)" @click="onCardPreviewClick"></div>
                    <div class="dj-card-foot">
                      <span class="dj-card-words">{{ entry.content.length }} 字</span>
                      <span class="dj-card-read" v-if="readingMinutes(entry.content) > 0">{{ readingMinutes(entry.content) }} 分钟阅读</span>
                    </div>
                  </div>
                  </TransitionGroup>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>

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
  border-radius: var(--radius-md, 12px);
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
  border-radius: var(--radius-full, 999px);
  color: #fff;
  background: var(--color-primary, #3b82f6);
}

.dj-entry-badge.is-empty {
  color: var(--color-text-muted, #94a3b8);
  background: var(--color-bg-hover, #f1f5f9);
}

/* 工具栏（去卡片化，置于头部之内） */
.dj-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 12px;
  flex-wrap: wrap;
}

.dj-toolbar-left,
.dj-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dj-toolbar :deep(.el-button + .el-button) {
  margin-left: 0;
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
  border-radius: var(--radius-md, 12px);
}

.dj-content-input :deep(.el-textarea__inner) {
  min-height: 260px !important;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 12px);
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
  border-radius: var(--radius-md, 12px);
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
  border-radius: var(--radius-md, 12px);
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
  border-radius: var(--radius-full, 999px);
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
  border-radius: var(--radius-md, 12px);
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
  border-radius: var(--radius-sm, 6px);
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

/* ===== 分类选择 / 置顶 / 分类管理 按钮 ===== */
.dj-cat-select {
  width: 120px;
  flex-shrink: 0;
}

.dj-toolbar .el-button.is-active {
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 14%, transparent);
  border-color: var(--color-warning, #f59e0b);
  color: var(--color-warning, #f59e0b);
}

.dj-toolbar-right .el-button[data-testid="dj-manage-cat"] {
  color: var(--color-text-secondary, #64748b);
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
  border-radius: var(--radius-full, 999px);
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
  border-radius: var(--radius-full, 999px);
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
  border-radius: var(--radius-full, 999px);
  color: var(--color-warning, #f59e0b);
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 14%, transparent);
  white-space: nowrap;
}

/* ===== 日志本管理弹框 ===== */
.dj-journal-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dj-journal-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  background: var(--color-bg, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 12px);
}

.dj-journal-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.dj-journal-default {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-muted, #94a3b8);
  margin-left: 4px;
}

.dj-journal-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.dj-journal-edit {
  flex: 1;
  min-width: 0;
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

  .dj-main .dj-content-input,
  .dj-main .dj-preview {
    height: 100%;
    min-height: 0;
  }

  .dj-main .dj-preview {
    max-height: none;
  }

  .dj-main .dj-content-input :deep(.el-textarea__inner) {
    height: 100%;
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

  .dj-main .dj-content-input,
  .dj-main .dj-preview {
    height: 100%;
    min-height: 0;
  }

  .dj-main .dj-preview {
    max-height: none;
  }

  .dj-main .dj-content-input :deep(.el-textarea__inner) {
    height: 100%;
  }
}

/* 历史区改为可滚动列表：桌面作用域内 .dj-grid-scroll 启用内部滚动；移动端页面滚动（.wb-content overflow-y:auto），不在此叠加 */
@media (min-width: 769px) {
  .dj-grid-scroll {
    overflow-y: auto;
  }
}
/* ===== 日记列表弹框（DialogOverlay 范式，与 WorkbenchExercise 一致；base 类本组件 scoped 内定义） ===== */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 20px;
}

.dialog {
  background-color: var(--color-bg-card, #fff);
  border-radius: var(--radius-lg, 12px);
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  position: sticky;
  top: 0;
  background: var(--color-bg-card, #fff);
  border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
}

.dialog-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm, 6px);
  transition: color var(--transition-fast, 0.15s ease);
}

.close-btn:hover {
  color: var(--color-text, #1e293b);
}

.dialog-overlay.list-dialog-overlay {
  z-index: 310;
}

.dialog.list-dialog {
  height: 85vh;
  max-width: 1100px;
  min-width: 480px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.djl-count {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-muted, #94a3b8);
}

.djl-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 20px;
}

@media (max-width: 768px) {
  .dialog-overlay.list-dialog-overlay {
    padding: 8px;
  }
  .dialog.list-dialog {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    height: 90vh !important;
  }
  /* 窄屏卡片改 2 列，避免 4 列过窄不可用 */
  .dj-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

