<script setup lang="ts">
/**
 * 读书笔记：书架 + 阅读进度 + 笔记 / 金句，本地持久化，可导出 Markdown
 */
import { computed, onMounted, ref } from 'vue'
import {
  addBook,
  addNote,
  DEFAULT_CATEGORIES,
  emptyReadingData,
  exportMarkdown,
  normalizeReadingData,
  progressPercent,
  removeBook,
  removeNote,
  searchBooks,
  statsOf,
  STATUS_META,
  updateBook,
  type BookStatus,
  type ReadingData
} from './readingCore'
import { loadToolData, saveToolData } from '../../core/toolStore'
import { useToast } from '@/composables/useToast'

const TOOL_ID = 'reading-notes'
const toast = useToast()

const data = ref<ReadingData>(emptyReadingData())
const activeId = ref('')
const q = ref('')
const statusFilter = ref<BookStatus | 'all'>('all')
const newTitle = ref('')
const newAuthor = ref('')
const newCat = ref(DEFAULT_CATEGORIES[0])
const noteText = ref('')
const notePage = ref<number | null>(null)
const noteQuote = ref(false)

const stats = computed(() => statsOf(data.value))
const books = computed(() => {
  let list = searchBooks(data.value, q.value)
  if (statusFilter.value !== 'all') list = list.filter((b) => b.status === statusFilter.value)
  return list
})
const active = computed(() => data.value.books.find((b) => b.id === activeId.value) ?? null)

async function persist() {
  await saveToolData(TOOL_ID, data.value)
}

async function add() {
  const r = addBook(data.value, newTitle.value, newAuthor.value, newCat.value)
  if (!r.ok) {
    toast.warning(data.value.books.length >= 200 ? '书已达上限' : '请填写书名')
    return
  }
  data.value = r.data
  activeId.value = r.data.books[r.data.books.length - 1].id
  newTitle.value = ''
  newAuthor.value = ''
  await persist()
}

async function remove(id: string) {
  const b = data.value.books.find((x) => x.id === id)
  if (b?.notes.length && !window.confirm(`删除《${b.title}》及其 ${b.notes.length} 条笔记？`)) return
  data.value = removeBook(data.value, id)
  if (activeId.value === id) activeId.value = ''
  await persist()
}

async function patch(id: string, p: Parameters<typeof updateBook>[2]) {
  data.value = updateBook(data.value, id, p)
  await persist()
}

async function saveNote() {
  if (!active.value) return
  const r = addNote(data.value, active.value.id, noteText.value, notePage.value, noteQuote.value)
  if (!r.ok) {
    toast.warning('请输入笔记内容')
    return
  }
  data.value = r.data
  noteText.value = ''
  notePage.value = null
  noteQuote.value = false
  await persist()
}

async function delNote(noteId: string) {
  if (!active.value) return
  data.value = removeNote(data.value, active.value.id, noteId)
  await persist()
}

async function setStatus(id: string, status: BookStatus) {
  await patch(id, { status })
}

function statusName(s: BookStatus): string {
  return STATUS_META.find((x) => x.id === s)?.name ?? ''
}

async function exportMd() {
  const md = exportMarkdown(data.value)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `reading-notes-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(a.href)
  toast.success('已导出 Markdown')
}

onMounted(async () => {
  data.value = normalizeReadingData(await loadToolData(TOOL_ID, emptyReadingData()))
})
</script>

<template>
  <div class="tu-t1">
    <div class="tu-toolbar">
      <span class="tu-hint rn-inline">想读 {{ stats.wish }} · 在读 {{ stats.reading }} · 已读 {{ stats.done }} · 笔记 {{ stats.notes }}（金句 {{ stats.quotes }}）</span>
      <span class="tu-spacer"></span>
      <button type="button" class="tu-btn ghost" :disabled="!data.books.length" @click="exportMd">导出 Markdown</button>
    </div>

    <div class="tu-row">
      <input v-model="newTitle" type="text" class="tu-input rn-title" placeholder="书名" @keyup.enter="add" />
      <input v-model="newAuthor" type="text" class="tu-input rn-author" placeholder="作者（可空）" @keyup.enter="add" />
      <select v-model="newCat" class="tu-select">
        <option v-for="c in DEFAULT_CATEGORIES" :key="c" :value="c">{{ c }}</option>
      </select>
      <button type="button" class="tu-btn" @click="add">加入书架</button>
    </div>

    <div class="tu-row">
      <input v-model="q" type="text" class="tu-input rn-search" placeholder="搜索书名 / 作者 / 笔记内容…" />
      <div class="tu-seg">
        <button type="button" :class="{ 'is-on': statusFilter === 'all' }" @click="statusFilter = 'all'">全部</button>
        <button v-for="s in STATUS_META" :key="s.id" type="button" :class="{ 'is-on': statusFilter === s.id }" @click="statusFilter = s.id">{{ s.name }}</button>
      </div>
    </div>

    <div class="rn-layout">
      <div class="rn-shelf">
        <div
          v-for="b in books"
          :key="b.id"
          class="rn-book"
          :class="{ 'is-active': activeId === b.id }"
          @click="activeId = b.id"
        >
          <div class="rn-book-title">{{ b.title }}</div>
          <div class="rn-book-meta">{{ b.author || '佚名' }} · {{ b.category }} · {{ statusName(b.status) }}{{ b.total ? ` · ${progressPercent(b)}%` : '' }}</div>
          <div class="rn-bar"><div class="rn-bar-fill" :style="{ width: progressPercent(b) + '%' }"></div></div>
        </div>
        <p v-if="!books.length" class="tu-hint">书架空空，先加一本书吧。</p>
      </div>

      <div v-if="active" class="rn-detail">
        <div class="tu-row">
          <input :value="active.title" type="text" class="tu-input rn-title" @change="patch(active.id, { title: ($event.target as HTMLInputElement).value })" />
          <input :value="active.author" type="text" class="tu-input rn-author" placeholder="作者" @change="patch(active.id, { author: ($event.target as HTMLInputElement).value })" />
          <select :value="active.status" class="tu-select" @change="setStatus(active.id, ($event.target as HTMLSelectElement).value as BookStatus)">
            <option v-for="s in STATUS_META" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div class="tu-row">
          <label class="tu-label rn-inline">当前页</label>
          <input :value="active.current" type="number" class="tu-input rn-num" min="0" @change="patch(active.id, { current: Number(($event.target as HTMLInputElement).value) || 0 })" />
          <label class="tu-label rn-inline">总页数</label>
          <input :value="active.total" type="number" class="tu-input rn-num" min="0" @change="patch(active.id, { total: Number(($event.target as HTMLInputElement).value) || 0 })" />
          <span class="tu-hint rn-inline">{{ progressPercent(active) }}%</span>
          <span class="tu-spacer"></span>
          <button type="button" class="tu-btn ghost" @click="remove(active.id)">删除本书</button>
        </div>

        <div class="tu-row">
          <input v-model="noteText" type="text" class="tu-input" :placeholder="noteQuote ? '摘抄金句…' : '写点笔记…'" @keyup.enter="saveNote" />
          <input v-model.number="notePage" type="number" class="tu-input rn-num" placeholder="页码" min="0" />
          <label class="tu-check" :class="{ 'is-on': noteQuote }">
            <input v-model="noteQuote" type="checkbox" /> 金句
          </label>
          <button type="button" class="tu-btn" @click="saveNote">保存</button>
        </div>

        <ul class="rn-notes">
          <li v-for="n in active.notes" :key="n.id" class="rn-note" :class="{ 'is-quote': n.quote }">
            <span v-if="n.quote" class="rn-quote-mark">❝</span>
            <span class="rn-note-text">{{ n.text }}</span>
            <span v-if="n.page" class="rn-note-page">P{{ n.page }}</span>
            <button type="button" class="tu-btn ghost rn-mini" @click="delNote(n.id)">×</button>
          </li>
        </ul>
        <p v-if="!active.notes.length" class="tu-hint">这本书还没有笔记。</p>
      </div>
      <div v-else class="rn-detail rn-empty">
        <p class="tu-hint">从左侧选择一本书查看与编辑笔记。</p>
      </div>
    </div>

    <p class="tu-hint">数据存本机 IndexedDB，与「图书馆」模块数据不互通；笔记单条上限 5000 字。</p>
  </div>
</template>

<style scoped>
.rn-inline { margin-bottom: 0; }
.rn-title { width: auto; flex: 1.2; min-width: 140px; }
.rn-author { width: auto; flex: 1; min-width: 110px; }
.rn-search { flex: 1; min-width: 160px; }
.rn-num { width: 90px; }
.rn-layout { display: grid; grid-template-columns: 240px 1fr; gap: 14px; align-items: start; }
@media (max-width: 720px) {
  .rn-layout { grid-template-columns: 1fr; }
}
.rn-shelf { display: flex; flex-direction: column; gap: 6px; }
.rn-book {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  cursor: pointer;
}
.rn-book.is-active { border-color: var(--color-primary); background: var(--color-primary-soft); }
.rn-book-title { font-size: 13px; font-weight: 600; color: var(--color-text); }
.rn-book-meta { font-size: 11px; color: var(--color-text-muted); margin: 2px 0 6px; }
.rn-bar { height: 4px; background: var(--color-bg-input); border-radius: var(--radius-full); overflow: hidden; }
.rn-bar-fill { height: 100%; background: var(--color-primary); }
.rn-detail { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.rn-empty { border: 1px dashed var(--color-border); border-radius: var(--radius-md); padding: 20px; text-align: center; }
.rn-notes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rn-note {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 10px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.rn-note.is-quote { background: var(--color-primary-soft); }
.rn-quote-mark { color: var(--color-primary); font-size: 14px; }
.rn-note-text { flex: 1; min-width: 0; font-size: 12.5px; color: var(--color-text); word-break: break-all; }
.rn-note-page { font-size: 11px; color: var(--color-text-muted); font-family: var(--font-family-mono); }
.rn-mini { min-height: 22px; padding: 1px 7px; font-size: 12px; }
</style>
