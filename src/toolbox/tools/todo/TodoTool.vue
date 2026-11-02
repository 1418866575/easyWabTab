<script setup lang="ts">
/**
 * 待办事项：分类管理 + 三态流转 + 拖拽 / 按钮排序，本地持久化
 */
import { computed, onMounted, ref } from 'vue'
import {
  addCategory,
  addTodo,
  cycleStatus,
  emptyTodoData,
  MAX_ITEMS,
  MAX_TEXT,
  moveTodo,
  normalizeTodoData,
  removeCategory,
  removeTodo,
  renameTodo,
  statsOf,
  STATUS_META,
  type TodoData
} from './todoToolCore'
import { loadToolData, saveToolData } from '../../core/toolStore'
import { useToast } from '@/composables/useToast'

const TOOL_ID = 'todo'
const toast = useToast()

const data = ref<TodoData>(emptyTodoData())
const activeCat = ref('work')
const draft = ref('')
const newCat = ref('')
const editingId = ref('')
const editingText = ref('')
const dragIndex = ref(-1)

const visibleItems = computed(() => data.value.items.filter((it) => it.cat === activeCat.value))
const stats = computed(() => statsOf(data.value.items))
const catStats = computed(() =>
  Object.fromEntries(data.value.categories.map((c) => [c.id, statsOf(data.value.items.filter((i) => i.cat === c.id))]))
)

async function persist() {
  await saveToolData(TOOL_ID, data.value)
}

function add() {
  const r = addTodo(data.value, draft.value, activeCat.value)
  if (!r.ok) {
    toast.warning(data.value.items.length >= MAX_ITEMS ? `最多 ${MAX_ITEMS} 条` : '请输入内容')
    return
  }
  data.value = r.data
  draft.value = ''
  void persist()
}

function addCat() {
  const r = addCategory(data.value, newCat.value)
  if (!r.ok) {
    toast.warning('分类名为空或已存在')
    return
  }
  data.value = r.data
  activeCat.value = r.data.categories[r.data.categories.length - 1].id
  newCat.value = ''
  void persist()
}

function dropCat(id: string) {
  const c = data.value.categories.find((x) => x.id === id)
  if (!c || c.builtin) return
  if (!window.confirm(`删除分类「${c.name}」？该分类下的待办会移动到「工作」。`)) return
  data.value = removeCategory(data.value, id)
  if (activeCat.value === id) activeCat.value = 'work'
  void persist()
}

function cycle(id: string) {
  data.value = cycleStatus(data.value, id)
  void persist()
}

function remove(id: string) {
  data.value = removeTodo(data.value, id)
  void persist()
}

function startEdit(id: string, text: string) {
  editingId.value = id
  editingText.value = text
}

function commitEdit() {
  if (editingId.value) data.value = renameTodo(data.value, editingId.value, editingText.value)
  editingId.value = ''
  editingText.value = ''
  void persist()
}

function onDragStart(i: number) {
  dragIndex.value = i
}

function onDrop(i: number) {
  if (dragIndex.value >= 0 && dragIndex.value !== i) {
    data.value = moveTodo(data.value, activeCat.value, dragIndex.value, i)
    void persist()
  }
  dragIndex.value = -1
}

function shift(i: number, delta: number) {
  data.value = moveTodo(data.value, activeCat.value, i, i + delta)
  void persist()
}

function clearDone() {
  const n = stats.value.done
  if (!n) return
  if (!window.confirm(`确定删除 ${n} 条已完成待办？`)) return
  data.value = { ...data.value, items: data.value.items.filter((i) => i.status !== 'done') }
  void persist()
}

function statusName(s: string): string {
  return STATUS_META.find((x) => x.id === s)?.name ?? '待办'
}

onMounted(async () => {
  data.value = normalizeTodoData(await loadToolData(TOOL_ID, emptyTodoData()))
})
</script>

<template>
  <div class="tu-t1">
    <div class="tu-toolbar">
      <div class="tu-seg td-cats">
        <button
          v-for="c in data.categories"
          :key="c.id"
          type="button"
          :class="{ 'is-on': activeCat === c.id }"
          @click="activeCat = c.id"
        >{{ c.name }} {{ catStats[c.id].pending + catStats[c.id].doing }}</button>
      </div>
      <span class="tu-spacer"></span>
      <button type="button" class="tu-btn ghost" :disabled="!stats.done" @click="clearDone">清除已完成</button>
    </div>

    <div class="tu-row">
      <input
        v-model="draft"
        type="text"
        class="tu-input"
        :maxlength="MAX_TEXT"
        placeholder="添加一条待办…"
        data-testid="tb-todo-input"
        @keyup.enter="add"
      />
      <button type="button" class="tu-btn" @click="add">添加</button>
    </div>

    <ul class="td-list">
      <li
        v-for="(it, i) in visibleItems"
        :key="it.id"
        class="td-item"
        :class="{ 'is-done': it.status === 'done' }"
        draggable="true"
        @dragstart="onDragStart(i)"
        @dragover.prevent
        @drop.prevent="onDrop(i)"
      >
        <button type="button" class="tu-btn ghost td-status" @click="cycle(it.id)">{{ statusName(it.status) }}</button>
        <input
          v-if="editingId === it.id"
          v-model="editingText"
          type="text"
          class="tu-input td-edit"
          @keyup.enter="commitEdit"
          @blur="commitEdit"
        />
        <span v-else class="td-text" @dblclick="startEdit(it.id, it.text)">{{ it.text }}</span>
        <span class="tu-spacer"></span>
        <button type="button" class="tu-btn ghost td-btn" :disabled="i === 0" @click="shift(i, -1)">↑</button>
        <button type="button" class="tu-btn ghost td-btn" :disabled="i === visibleItems.length - 1" @click="shift(i, 1)">↓</button>
        <button type="button" class="tu-btn ghost td-btn" @click="remove(it.id)">删除</button>
      </li>
    </ul>
    <p v-if="!visibleItems.length" class="tu-hint">该分类下暂无待办。</p>

    <div class="tu-row">
      <input v-model="newCat" type="text" class="tu-input td-cat-input" maxlength="20" placeholder="新分类名称" @keyup.enter="addCat" />
      <button type="button" class="tu-btn ghost" @click="addCat">新增分类</button>
      <button
        type="button"
        class="tu-btn ghost"
        :disabled="data.categories.find((c) => c.id === activeCat)?.builtin"
        @click="dropCat(activeCat)"
      >删除当前分类</button>
    </div>

    <p class="tu-hint">
      共 {{ data.items.length }} 条：待办 {{ stats.pending }} / 进行中 {{ stats.doing }} / 已完成 {{ stats.done }}。
      点击状态可循环切换，双击文字改名，拖拽或 ↑↓ 调整顺序。数据存本机 IndexedDB。
    </p>
  </div>
</template>

<style scoped>
.td-cats { flex-wrap: wrap; }
.td-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.td-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: grab;
}
.td-item.is-done .td-text { text-decoration: line-through; color: var(--color-text-muted); }
.td-status { min-height: 26px; padding: 2px 10px; font-size: 12px; }
.td-text { flex: 1; min-width: 0; font-size: 13px; color: var(--color-text); word-break: break-all; }
.td-edit { width: auto; flex: 1; min-width: 0; }
.td-btn {height: 36px;
  padding: 0 12px;
  font-size: 12px;}
.td-cat-input { width: auto; min-width: 160px; }
</style>
