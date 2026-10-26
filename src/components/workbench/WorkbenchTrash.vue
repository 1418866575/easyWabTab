<script setup lang="ts">
/**
 * 工作台统一「回收站」面板
 *
 * 背景：各模块（待办 / 便签 / 日记 / 记账 / 家谱）此前各自挂一个「回收站」按钮 +
 * RecordTrash 弹框，入口分散、要逐个点开才知道哪里有东西。现在统一收到本面板：
 *   - 一个入口看全所有被删记录，并按模块分区（分区标题即「所属模块」）；
 *   - 每个分区复用 RecordTrash，保持与原有回收站完全一致的视觉与交互
 *     （恢复 / 彻底删除 / 清空回收站，危险操作有二次确认）；
 *   - 各模块内部的原回收站入口已移除，避免同一份数据出现两个入口。
 *
 * 口径说明：只收录**支持软删除（墓碑）**的模块。提醒 / 番茄钟 / 打卡 / 密码 / 健康
 * 是直接物理删除，不存在可恢复数据，因此不出现在这里。
 */
import { computed } from 'vue'
import RecordTrash from '@/components/common/RecordTrash.vue'
import { toastAlert } from '@/utils/dialog'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { useWorkbenchDiaryStore } from '@/stores/workbenchDiary'
import { useWorkbenchLedgerStore } from '@/stores/workbenchLedger'
import { useGenealogyStore } from '@/stores/genealogy'
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
const ledger = useWorkbenchLedgerStore()
const genealogy = useGenealogyStore()

/** 回收站总条数（头部提示与全局空态用） */
const totalCount = computed(
  () =>
    todos.trashedTodos.length +
    notes.trashedNotes.length +
    diary.trashedEntries.length +
    ledger.trashedEntries.length +
    genealogy.trashedMembers.length +
    genealogy.trashedNames.length
)

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
    <header class="tr-head">
      <div class="tr-head-main">
        <h2 class="tr-title">回收站</h2>
        <p class="tr-sub">
          各模块删除的记录集中在这里，可恢复或彻底删除。仅收录支持恢复的模块（待办 / 便签 / 日记 / 记账 / 家谱）；
          提醒、番茄钟、打卡、密码、健康为直接删除，不会进入回收站。
        </p>
      </div>
      <div class="tr-total" data-testid="trash-total">共 {{ totalCount }} 项</div>
    </header>

    <div v-if="totalCount === 0" class="tr-empty" data-testid="trash-global-empty">
      回收站是空的。删除待办、便签、日记、记账流水或家谱成员后，会出现在这里以便恢复。
    </div>

    <template v-else>
      <!-- 待办 -->
      <section v-if="todos.trashedTodos.length > 0" class="tr-sec" data-testid="trash-section-todos">
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
      <section v-if="notes.trashedNotes.length > 0" class="tr-sec" data-testid="trash-section-notes">
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
      <section v-if="diary.trashedEntries.length > 0" class="tr-sec" data-testid="trash-section-diary">
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

      <!-- 记账 -->
      <section v-if="ledger.trashedEntries.length > 0" class="tr-sec" data-testid="trash-section-ledger">
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
      <section v-if="genealogy.trashedMembers.length > 0" class="tr-sec" data-testid="trash-section-genealogy-members">
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
      <section v-if="genealogy.trashedNames.length > 0" class="tr-sec" data-testid="trash-section-genealogy-names">
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
    </template>
  </div>
</template>

<style scoped>
.wb-trash {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tr-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.tr-head-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.tr-title {
  margin: 0;
  font-size: var(--font-size-lg, 16px);
  font-weight: 600;
  color: var(--color-text-primary, #0f172a);
}

.tr-sub {
  margin: 0;
  max-width: 720px;
  font-size: var(--font-size-sm, 13px);
  line-height: 1.6;
  color: var(--color-text-secondary, #64748b);
}

.tr-total {
  flex: none;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border, #e2e8f0);
  background-color: var(--color-bg-card, #fff);
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-secondary, #64748b);
}

.tr-empty {
  padding: 40px 16px;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #fff);
  color: var(--color-text-secondary, #64748b);
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
  color: var(--color-text-primary, #0f172a);
  padding-left: 8px;
  border-left: 3px solid var(--color-primary, #3b82f6);
  line-height: 1.1;
}
</style>
