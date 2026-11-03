<script setup lang="ts">
/**
 * 四象限笔记：按重要 / 紧急四象限整理任务，本地持久化
 */
import { computed, onMounted, ref } from 'vue'
import {
  addItem,
  countByQuadrant,
  emptyQuadrantData,
  itemsOf,
  MAX_ITEMS,
  MAX_TEXT,
  moveItem,
  normalizeQuadrantData,
  QUADRANTS,
  removeItem,
  renameItem,
  toggleDone,
  type Quadrant,
  type QuadrantData
} from './quadrantCore'
import { loadToolData, saveToolData } from '../../core/toolStore'
import { useToast } from '@/composables/useToast'

const TOOL_ID = 'four-quadrant'
const toast = useToast()

const data = ref<QuadrantData>(emptyQuadrantData())
const filter = ref<'all' | 'active'>('all')
const draft = ref<Record<Quadrant, string>>({ q1: '', q2: '', q3: '', q4: '' })
const editingId = ref('')
const editingText = ref('')

const counts = computed(() => countByQuadrant(data.value))
const doneCount = computed(() => data.value.items.filter((i) => i.done).length)

async function persist() {
  await saveToolData(TOOL_ID, data.value)
}

function add(q: Quadrant) {
  const r = addItem(data.value, draft.value[q], q)
  if (!r.ok) {
    toast.warning(data.value.items.length >= MAX_ITEMS ? `最多 ${MAX_ITEMS} 条` : '请输入内容')
    return
  }
  data.value = r.data
  draft.value[q] = ''
  void persist()
}

function move(id: string, q: Quadrant) {
  data.value = moveItem(data.value, id, q)
  void persist()
}

function toggle(id: string) {
  data.value = toggleDone(data.value, id)
  void persist()
}

function remove(id: string) {
  data.value = removeItem(data.value, id)
  void persist()
}

function startEdit(id: string, text: string) {
  editingId.value = id
  editingText.value = text
}

function commitEdit() {
  if (editingId.value) data.value = renameItem(data.value, editingId.value, editingText.value)
  editingId.value = ''
  editingText.value = ''
  void persist()
}

function visible(q: Quadrant) {
  const list = itemsOf(data.value, q)
  return filter.value === 'active' ? list.filter((i) => !i.done) : list
}

function clearDone() {
  if (!doneCount.value) return
  if (!window.confirm(`确定删除 ${doneCount.value} 条已完成条目？`)) return
  data.value = { items: data.value.items.filter((i) => !i.done) }
  void persist()
}

onMounted(async () => {
  data.value = normalizeQuadrantData(await loadToolData(TOOL_ID, emptyQuadrantData()))
})
</script>

<template>
  <div class="tu-t1">
    <div class="tu-toolbar">
      <div class="tu-seg">
        <button type="button" :class="{ 'is-on': filter === 'all' }" @click="filter = 'all'">全部</button>
        <button type="button" :class="{ 'is-on': filter === 'active' }" @click="filter = 'active'">未完成</button>
      </div>
      <span class="tu-hint fq-inline">共 {{ data.items.length }} 条 · 已完成 {{ doneCount }}</span>
      <span class="tu-spacer"></span>
      <button type="button" class="tu-btn ghost" :disabled="!doneCount" @click="clearDone">清除已完成</button>
    </div>

    <div class="fq-grid">
      <section v-for="qd in QUADRANTS" :key="qd.id" class="tu-card fq-cell">
        <header class="fq-head">
          <h3 class="fq-title">{{ qd.title }}</h3>
          <span class="fq-sub">{{ qd.sub }} · {{ counts[qd.id] }}</span>
        </header>

        <div class="fq-add">
          <input
            v-model="draft[qd.id]"
            type="text"
            class="tu-input"
            :maxlength="MAX_TEXT"
            :placeholder="`添加到「${qd.title}」…`"
            @keyup.enter="add(qd.id)"
          />
          <button type="button" class="tu-btn fq-add-btn" @click="add(qd.id)">加</button>
        </div>

        <ul class="fq-list">
          <li v-for="it in visible(qd.id)" :key="it.id" class="fq-item" :class="{ 'is-done': it.done }">
            <label class="fq-check">
              <input type="checkbox" :checked="it.done" @change="toggle(it.id)" />
            </label>
            <input
              v-if="editingId === it.id"
              v-model="editingText"
              type="text"
              class="tu-input fq-edit"
              @keyup.enter="commitEdit"
              @blur="commitEdit"
            />
            <span v-else class="fq-text" @dblclick="startEdit(it.id, it.text)">{{ it.text }}</span>
            <span class="tu-spacer"></span>
            <select class="tu-select fq-move" :value="it.q" @change="move(it.id, ($event.target as HTMLSelectElement).value as Quadrant)">
              <option v-for="t in QUADRANTS" :key="t.id" :value="t.id">{{ t.title }}</option>
            </select>
            <button type="button" class="tu-btn ghost fq-btn" @click="remove(it.id)">×</button>
          </li>
        </ul>
        <p v-if="!visible(qd.id).length" class="tu-hint fq-empty">暂无条目</p>
      </section>
    </div>

    <p class="tu-hint">双击文字可改名；用下拉框切换象限。数据保存在本机 IndexedDB，不上传也不云同步。</p>
  </div>
</template>

<style scoped>
.fq-inline { margin-bottom: 0; }
.fq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 720px) {
  .fq-grid { grid-template-columns: 1fr; }
}
.fq-cell { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.fq-head { display: flex; align-items: baseline; gap: 8px; }
.fq-title { margin: 0; font-size: var(--fs-sm); font-weight: 600; color: var(--color-text); }
.fq-sub { font-size: var(--fs-caption); color: var(--color-text-muted); }
.fq-add { display: flex; gap: 6px; }
.fq-add-btn {height: 36px;
  padding: 0 12px;}
.fq-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.fq-item { display: flex; align-items: center; gap: 6px; }
.fq-item.is-done .fq-text { text-decoration: line-through; color: var(--color-text-muted); }
.fq-check { display: inline-flex; margin: 0; }
.fq-text { flex: 1; min-width: 0; font-size: 12.5px; color: var(--color-text); word-break: break-all; cursor: text; }
.fq-edit { width: auto; flex: 1; min-width: 0; }
.fq-move { min-height: 26px; font-size: var(--fs-caption); padding: 2px 4px; max-width: 110px; }
.fq-btn {height: 36px;
  padding: 0 12px;
  font-size: var(--fs-caption);}
.fq-empty { margin: 0; }
</style>
