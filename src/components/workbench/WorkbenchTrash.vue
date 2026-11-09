<script setup lang="ts">
/**
 * 工作台统一「回收站」面板
 *
 * 背景：各模块（待办 / 便签 / 日记 / 留言板 / 记账 / 家谱）此前各自挂一个「回收站」按钮 +
 * RecordTrash 弹框，入口分散、要逐个点开才知道哪里有东西。现在统一收到本面板：
 *   - 一个入口看全所有被删记录，并按模块分区（分区标题即「所属模块」）；
 *   - 每个分区复用 RecordTrash，保持与原有回收站完全一致的视觉与交互
 *     （恢复 / 彻底删除 / 清空回收站，危险操作有二次确认）；
 *   - 各模块内部的原回收站入口已移除，避免同一份数据出现两个入口。
 *
 * 口径说明：只收录**支持软删除（墓碑）**的模块。提醒 / 番茄钟 / 打卡 / 密码 / 健康
 * 是直接物理删除，不存在可恢复数据，因此不出现在这里。
 */
import { computed, ref } from 'vue'
import RecordTrash from '@/components/common/RecordTrash.vue'
import { showConfirm, toastAlert } from '@/utils/dialog'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { useWorkbenchDiaryStore } from '@/stores/workbenchDiary'
import { useWorkbenchMessagesStore } from '@/stores/workbenchMessages'
import { useWorkbenchLedgerStore } from '@/stores/workbenchLedger'
import { useGenealogyStore } from '@/stores/genealogy'
import { messageLabel } from '@/composables/messageBoardCore'
import type {
  WorkbenchTodo,
  WorkbenchNote,
  WorkbenchDiary,
  LedgerEntry,
  FamilyMember,
  FamilyNameRecord
} from '@/types'

const todos = useWorkbenchTodosStore()
const notes = useWorkbenchNotesStore()
const diary = useWorkbenchDiaryStore()
const messages = useWorkbenchMessagesStore()
const ledger = useWorkbenchLedgerStore()
const genealogy = useGenealogyStore()

/** 回收站总条数（头部提示与全局空态用） */
const totalCount = computed(
  () =>
    todos.trashedTodos.length +
    notes.trashedNotes.length +
    diary.trashedEntries.length +
    messages.trashedMessages.length +
    ledger.trashedEntries.length +
    genealogy.trashedMembers.length +
    genealogy.trashedNames.length
)

// ===== 按类型筛选（只控制分区显示，不改数据；默认 all 全显，兼容 QA 默认态）=====
type TrashType = 'all' | 'todos' | 'notes' | 'diary' | 'messages' | 'ledger' | 'members' | 'names'
const typeFilter = ref<TrashType>('all')
const TYPE_OPTIONS: { value: TrashType; label: string }[] = [
  { value: 'all', label: '全部类型' },
  { value: 'todos', label: '待办' },
  { value: 'notes', label: '便签' },
  { value: 'diary', label: '日记' },
  { value: 'messages', label: '留言板' },
  { value: 'ledger', label: '记账' },
  { value: 'members', label: '家谱 · 成员' },
  { value: 'names', label: '家谱 · 取名记录' }
]
function showSection(key: Exclude<TrashType, 'all'>): boolean {
  return typeFilter.value === 'all' || typeFilter.value === key
}
/** 当前筛选下可见分区数（用于「该类型暂无记录」兜底提示） */
const visibleSectionCount = computed(() => {
  const f = typeFilter.value
  const has = (k: Exclude<TrashType, 'all'>, arr: { length: number }) => (f === 'all' || f === k) && arr.length > 0
  return [
    has('todos', todos.trashedTodos),
    has('notes', notes.trashedNotes),
    has('diary', diary.trashedEntries),
    has('messages', messages.trashedMessages),
    has('ledger', ledger.trashedEntries),
    has('members', genealogy.trashedMembers),
    has('names', genealogy.trashedNames)
  ].filter(Boolean).length
})

// ===== 统一批量危险操作区（清空 / 彻底删除集中到一处）=====
// RecordTrash 的「清空回收站」与「彻底删除」最终都是物理删除，故全局批量共用同一执行体，
// 仅确认文案区分；各分区内单条「恢复 / 彻底删除 / 清空」按钮全部保留，恢复能力不变。
async function purgeEveryItem(): Promise<void> {
  for (const t of [...todos.trashedTodos]) await todos.purgeTodo(t.id)
  for (const n of [...notes.trashedNotes]) await notes.purgeNote(n.id)
  for (const e of [...diary.trashedEntries]) await diary.deleteEntry(e.id)
  for (const m of [...messages.trashedMessages]) await messages.purgeMessage(m.id)
  for (const le of [...ledger.trashedEntries]) await ledger.purgeEntry(le.id)
  for (const m of [...genealogy.trashedMembers]) await genealogy.purgeMember(m.id)
  for (const n of [...genealogy.trashedNames]) await genealogy.purgeNameRecord(n.id)
}
async function clearAll(): Promise<void> {
  if (totalCount.value === 0) { toastAlert('回收站是空的'); return }
  if (!await showConfirm(`回收站共 ${totalCount.value} 项，确定全部清空？此操作不可撤销，云端也会同步删除。`, '清空全部')) return
  await purgeEveryItem()
  toastAlert('已清空全部回收站', 'success')
}
async function purgeAll(): Promise<void> {
  if (totalCount.value === 0) { toastAlert('回收站是空的'); return }
  if (!await showConfirm(`将逐条彻底删除全部 ${totalCount.value} 项，此操作不可撤销，云端也会同步删除。`, '彻底删除全部')) return
  await purgeEveryItem()
  toastAlert('已彻底删除全部条目', 'success')
}

// ===== 待办 =====
async function restoreTodo(id: string): Promise<void> {
  await todos.restoreTodo(id)
  toastAlert('已恢复到待办列表', 'success')
}
async function purgeTodo(id: string): Promise<void> {
  await todos.purgeTodo(id)
  toastAlert('已彻底删除', 'success')
}
async function clearTodos(): Promise<void> {
  for (const t of [...todos.trashedTodos]) await todos.purgeTodo(t.id)
  toastAlert('待办回收站已清空', 'success')
}

// ===== 便签 =====
async function restoreNote(id: string): Promise<void> {
  await notes.restoreNote(id)
  toastAlert('已恢复到便签列表', 'success')
}
async function purgeNote(id: string): Promise<void> {
  await notes.purgeNote(id)
  toastAlert('已彻底删除', 'success')
}
async function clearNotes(): Promise<void> {
  for (const n of [...notes.trashedNotes]) await notes.purgeNote(n.id)
  toastAlert('便签回收站已清空', 'success')
}

// ===== 日记 =====
async function restoreDiary(id: string): Promise<void> {
  await diary.restoreEntry(id)
  toastAlert('已恢复到日记', 'success')
}
async function purgeDiary(id: string): Promise<void> {
  await diary.deleteEntry(id)
  toastAlert('已彻底删除', 'success')
}
async function clearDiary(): Promise<void> {
  for (const e of [...diary.trashedEntries]) await diary.deleteEntry(e.id)
  toastAlert('日记回收站已清空', 'success')
}

// ===== 留言板 =====
async function restoreMessage(id: string): Promise<void> {
  await messages.restoreMessage(id)
  toastAlert('已恢复到留言板', 'success')
}
async function purgeMessage(id: string): Promise<void> {
  await messages.purgeMessage(id)
  toastAlert('已彻底删除', 'success')
}
async function clearMessages(): Promise<void> {
  for (const m of [...messages.trashedMessages]) await messages.purgeMessage(m.id)
  toastAlert('留言板回收站已清空', 'success')
}

// ===== 记账 =====
async function restoreLedger(id: string): Promise<void> {
  await ledger.restoreEntry(id)
  toastAlert('已恢复到记账流水', 'success')
}
async function purgeLedger(id: string): Promise<void> {
  await ledger.purgeEntry(id)
  toastAlert('已彻底删除', 'success')
}
async function clearLedger(): Promise<void> {
  for (const e of [...ledger.trashedEntries]) await ledger.purgeEntry(e.id)
  toastAlert('记账回收站已清空', 'success')
}

// ===== 家谱 · 成员 =====
async function restoreMember(id: string): Promise<void> {
  await genealogy.restoreMember(id)
  toastAlert('已恢复到成员列表', 'success')
}
async function purgeMember(id: string): Promise<void> {
  await genealogy.purgeMember(id)
  toastAlert('已彻底删除', 'success')
}
async function clearMembers(): Promise<void> {
  for (const m of [...genealogy.trashedMembers]) await genealogy.purgeMember(m.id)
  toastAlert('家谱成员回收站已清空', 'success')
}

// ===== 家谱 · 取名记录 =====
async function restoreName(id: string): Promise<void> {
  await genealogy.restoreNameRecord(id)
  toastAlert('已恢复到取名记录', 'success')
}
async function purgeName(id: string): Promise<void> {
  await genealogy.purgeNameRecord(id)
  toastAlert('已彻底删除', 'success')
}
async function clearNames(): Promise<void> {
  for (const n of [...genealogy.trashedNames]) await genealogy.purgeNameRecord(n.id)
  toastAlert('取名记录回收站已清空', 'success')
}

/** 日记标签：日期 + 正文摘要（一眼能认出是哪篇） */
function diaryLabel(e: WorkbenchDiary): string {
  const text = (e.content || '').replace(/\s+/g, ' ').trim()
  const snippet = text.length > 24 ? `${text.slice(0, 24)}…` : text
  return snippet ? `${e.date} ${snippet}` : `${e.date} 日记`
}
/** 记账标签：日期 + 备注（原回收站同款文案） */
function ledgerLabel(e: LedgerEntry): string {
  return e.note ? `${e.date} ${e.note}` : `${e.date} 记账流水`
}
</script>

<template>
  <div class="wb-trash" data-testid="wb-trash">
    <!-- 共享工具条：页头 h2 + 长说明由外壳 .panel-page-head 统一渲染，本面板不再重复；
         左侧按类型筛选 + 总数，右侧集中批量危险操作（清空 / 彻底删除）。 -->
    <div class="tr-toolbar" data-testid="trash-toolbar">
      <div class="tr-toolbar-left">
        <el-select v-model="typeFilter" size="small" class="tr-type-filter" data-testid="trash-type-filter">
          <el-option v-for="o in TYPE_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <div class="tr-total" data-testid="trash-total">共 {{ totalCount }} 项</div>
      </div>
      <div class="tr-danger-zone" data-testid="trash-danger-zone">
        <span class="tr-danger-hint">批量操作不可撤销</span>
        <el-button size="small" type="danger" plain :disabled="totalCount === 0" data-testid="trash-clear-all" @click="clearAll">清空全部</el-button>
        <el-button size="small" type="danger" :disabled="totalCount === 0" data-testid="trash-purge-all" @click="purgeAll">彻底删除全部</el-button>
      </div>
    </div>

    <div v-if="totalCount === 0" class="tr-empty" data-testid="trash-global-empty">
      回收站是空的。删除待办、便签、日记、留言、记账流水或家谱成员后，会出现在这里以便恢复。
    </div>

    <template v-else>
      <!-- 待办 -->
      <section v-if="showSection('todos') && todos.trashedTodos.length > 0" class="tr-sec" data-testid="trash-section-todos">
        <h3 class="tr-sec-title">待办</h3>
        <RecordTrash
          :items="todos.trashedTodos"
          :get-label="(item: WorkbenchTodo) => item.title || '（无标题）'"
          empty-text="没有已删除的待办"
          hint="这里是被删除的待办。"
          @restore="restoreTodo"
          @purge="purgeTodo"
          @clear="clearTodos"
        />
      </section>

      <!-- 便签 -->
      <section v-if="showSection('notes') && notes.trashedNotes.length > 0" class="tr-sec" data-testid="trash-section-notes">
        <h3 class="tr-sec-title">便签</h3>
        <RecordTrash
          :items="notes.trashedNotes"
          :get-label="(item: WorkbenchNote) => item.title || (item.content ? item.content.slice(0, 24) : '（无标题）')"
          empty-text="没有已删除的便签"
          hint="这里是被删除的便签。"
          @restore="restoreNote"
          @purge="purgeNote"
          @clear="clearNotes"
        />
      </section>

      <!-- 日记 -->
      <section v-if="showSection('diary') && diary.trashedEntries.length > 0" class="tr-sec" data-testid="trash-section-diary">
        <h3 class="tr-sec-title">日记</h3>
        <RecordTrash
          :items="diary.trashedEntries"
          :get-label="diaryLabel"
          empty-text="没有已删除的日记"
          hint="这里是被删除的日记。"
          @restore="restoreDiary"
          @purge="purgeDiary"
          @clear="clearDiary"
        />
      </section>

      <!-- 留言板 -->
      <section v-if="showSection('messages') && messages.trashedMessages.length > 0" class="tr-sec" data-testid="trash-section-messages">
        <h3 class="tr-sec-title">留言板</h3>
        <RecordTrash
          :items="messages.trashedMessages"
          :get-label="messageLabel"
          empty-text="没有已删除的留言"
          hint="这里是被删除的留言。"
          @restore="restoreMessage"
          @purge="purgeMessage"
          @clear="clearMessages"
        />
      </section>

      <!-- 记账 -->
      <section v-if="showSection('ledger') && ledger.trashedEntries.length > 0" class="tr-sec" data-testid="trash-section-ledger">
        <h3 class="tr-sec-title">记账</h3>
        <RecordTrash
          :items="ledger.trashedEntries"
          :get-label="ledgerLabel"
          empty-text="没有已删除的记账流水"
          hint="这里是被删除的记账流水。"
          @restore="restoreLedger"
          @purge="purgeLedger"
          @clear="clearLedger"
        />
      </section>

      <!-- 家谱 · 成员 -->
      <section v-if="showSection('members') && genealogy.trashedMembers.length > 0" class="tr-sec" data-testid="trash-section-genealogy-members">
        <h3 class="tr-sec-title">家谱 · 成员</h3>
        <RecordTrash
          :items="genealogy.trashedMembers"
          :get-label="(item: FamilyMember) => item.name || '（未命名）'"
          empty-text="没有已删除的成员"
          hint="这里是被删除的家谱成员。"
          @restore="restoreMember"
          @purge="purgeMember"
          @clear="clearMembers"
        />
      </section>

      <!-- 家谱 · 取名记录 -->
      <section v-if="showSection('names') && genealogy.trashedNames.length > 0" class="tr-sec" data-testid="trash-section-genealogy-names">
        <h3 class="tr-sec-title">家谱 · 取名记录</h3>
        <RecordTrash
          :items="genealogy.trashedNames"
          :get-label="(item: FamilyNameRecord) => item.name || '（未命名）'"
          empty-text="没有已删除的取名记录"
          hint="这里是被删除的取名记录。"
          @restore="restoreName"
          @purge="purgeName"
          @clear="clearNames"
        />
      </section>

      <!-- 筛选到无记录类型时的兜底提示（默认 all 不出现，不影响 QA 默认态） -->
      <div v-if="visibleSectionCount === 0" class="tr-filter-empty" data-testid="trash-filter-empty">
        当前筛选类型暂无已删除记录
      </div>
    </template>
  </div>
</template>

<style scoped>
.wb-trash {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* 共享工具条：筛选 + 总数 + 批量危险操作区集中在一条（页头由外壳渲染，不再有 .tr-head/.tr-title/.tr-sub） */
.tr-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: 10px 14px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #fff);
}
.tr-toolbar-left { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.tr-type-filter { width: 160px; }
.tr-danger-zone {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: 4px 10px;
  border: 1px solid var(--color-error, #ef4444);
  border-radius: var(--radius-md, 8px);
}
.tr-danger-hint { font-size: var(--font-size-xs, 12px); color: var(--color-error-text, #dc2626); }
.tr-filter-empty {
  padding: 28px 16px;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #fff);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm, 13px);
  text-align: center;
}

.tr-total {
  flex: none;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border, #e2e8f0);
  background-color: var(--color-bg-card, #fff);
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-secondary);
}

.tr-empty {
  padding: 40px 16px;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #fff);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm, 13px);
  text-align: center;
}

.tr-sec {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #fff);
}

.tr-sec-title {
  margin: 0;
  font-size: var(--font-size-md, 14px);
  font-weight: 600;
  color: var(--color-text);
  padding-left: var(--space-2);
  /* 对齐共享 4px 主色竖条口径（原 3px），仅在本 scoped 覆盖，不改共享文件 */
  border-left: 4px solid var(--color-primary, #3b82f6);
  line-height: 1.1;
}
</style>
