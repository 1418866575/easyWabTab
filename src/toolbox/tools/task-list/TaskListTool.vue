<script setup lang="ts">
/**
 * 树状任务列表：多列表分组 + 任务树（最多 3 层）+ 状态流转 + 归档
 */
import { computed, onMounted, ref } from 'vue'
import {
  addChild,
  canNest,
  countAll,
  cycleStatus,
  emptyTaskData,
  flattenTree,
  MAX_DEPTH,
  MAX_TEXT,
  normalizeTaskData,
  removeNode,
  setStatusDeep,
  statusName,
  updateNode,
  type TaskData,
  type TaskNode,
  type TaskStatus
} from './taskListCore'
import { loadToolData, saveToolData } from '../../core/toolStore'
import { useToast } from '@/composables/useToast'

const TOOL_ID = 'task-list'
const toast = useToast()

const data = ref<TaskData>(emptyTaskData())
const activeList = ref('inbox')
const showArchive = ref(false)
const draft = ref('')
const editingId = ref('')
const editingText = ref('')
const childOf = ref('')

const stats = computed(() => countAll(data.value.nodes))
const tree = computed(() =>
  flattenTree(data.value.nodes.filter((n) => n.listId === activeList.value && (showArchive.value || !n.archived)))
)

async function persist() {
  await saveToolData(TOOL_ID, data.value)
}

function addTask() {
  const t = draft.value.trim().slice(0, MAX_TEXT)
  if (!t) return
  if (stats.value.total >= 1000) {
    toast.warning('任务总数已达上限')
    return
  }
  const node: TaskNode = {
    id: `k${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    text: t,
    status: 'pending',
    listId: activeList.value,
    archived: false,
    collapsed: false,
    children: []
  }
  if (childOf.value) {
    const r = addChild(data.value.nodes, childOf.value, node)
    if (!r.ok) {
      toast.warning(`最多嵌套 ${MAX_DEPTH} 层`)
      return
    }
    data.value = { ...data.value, nodes: r.nodes }
    childOf.value = ''
  } else {
    data.value = { ...data.value, nodes: data.value.nodes.concat([node]) }
  }
  draft.value = ''
  void persist()
}

function addChildTo(id: string) {
  childOf.value = canNest(data.value.nodes, id) ? id : ''
  if (!childOf.value) toast.warning(`最多嵌套 ${MAX_DEPTH} 层，无法继续加子任务`)
}

function cycle(id: string) {
  const hit = flattenTree(data.value.nodes).find((x) => x.node.id === id)
  if (!hit) return
  const next: TaskStatus = cycleStatus(hit.node.status)
  data.value = { ...data.value, nodes: setStatusDeep(data.value.nodes, id, next) }
  void persist()
}

function remove(id: string) {
  const hit = flattenTree(data.value.nodes).find((x) => x.node.id === id)
  if (hit?.node.children.length && !window.confirm('删除该任务及其全部子任务？')) return
  data.value = { ...data.value, nodes: removeNode(data.value.nodes, id) }
  void persist()
}

function toggleCollapse(id: string) {
  data.value = { ...data.value, nodes: updateNode(data.value.nodes, id, (n) => ({ ...n, collapsed: !n.collapsed })) }
  void persist()
}

function toggleArchive(id: string) {
  data.value = { ...data.value, nodes: updateNode(data.value.nodes, id, (n) => ({ ...n, archived: !n.archived })) }
  void persist()
}

function startEdit(id: string, text: string) {
  editingId.value = id
  editingText.value = text
}

function commitEdit() {
  if (editingId.value) {
    const t = editingText.value.trim().slice(0, MAX_TEXT)
    if (t) data.value = { ...data.value, nodes: updateNode(data.value.nodes, editingId.value, (n) => ({ ...n, text: t })) }
  }
  editingId.value = ''
  editingText.value = ''
  void persist()
}

function addList() {
  const name = window.prompt('新列表名称')?.trim()
  if (!name) return
  const id = `l${Date.now()}`
  data.value = { ...data.value, lists: data.value.lists.concat([{ id, name: name.slice(0, 20) }]) }
  activeList.value = id
  void persist()
}

function removeList() {
  const l = data.value.lists.find((x) => x.id === activeList.value)
  if (!l || l.id === 'inbox') return
  if (!window.confirm(`删除列表「${l.name}」？其下任务会移动到「收件箱」。`)) return
  data.value = {
    lists: data.value.lists.filter((x) => x.id !== activeList.value),
    nodes: data.value.nodes.map((n) => (n.listId === activeList.value ? { ...n, listId: 'inbox' } : n))
  }
  activeList.value = 'inbox'
  void persist()
}

function listStats(id: string) {
  const list = data.value.nodes.filter((n) => n.listId === id)
  const flat = flattenTree(list)
  return { total: flat.length, done: flat.filter((x) => x.node.status === 'done').length }
}

onMounted(async () => {
  data.value = normalizeTaskData(await loadToolData(TOOL_ID, emptyTaskData()))
})
</script>

<template>
  <div class="tu-t1">
    <div class="tu-toolbar">
      <div class="tu-seg tl-cats">
        <button
          v-for="l in data.lists"
          :key="l.id"
          type="button"
          :class="{ 'is-on': activeList === l.id }"
          @click="activeList = l.id"
        >{{ l.name }} {{ listStats(l.id).total }}</button>
      </div>
      <span class="tu-spacer"></span>
      <label class="tu-check" :class="{ 'is-on': showArchive }">
        <input v-model="showArchive" type="checkbox" /> 归档 {{ stats.archived }}
      </label>
      <button type="button" class="tu-btn ghost" @click="addList">新列表</button>
      <button type="button" class="tu-btn ghost" :disabled="activeList === 'inbox'" @click="removeList">删列表</button>
    </div>

    <div class="tu-row">
      <input
        v-model="draft"
        type="text"
        class="tu-input"
        :maxlength="MAX_TEXT"
        :placeholder="childOf ? '输入子任务…' : '输入任务…'"
        @keyup.enter="addTask"
      />
      <button v-if="childOf" type="button" class="tu-btn ghost" @click="childOf = ''">取消子级</button>
      <button type="button" class="tu-btn" @click="addTask">添加</button>
    </div>

    <ul class="tl-tree">
      <li v-for="{ node, depth } in tree" :key="node.id" class="tl-row" :class="{ 'is-done': node.status === 'done' }" :style="{ paddingLeft: depth * 18 + 'px' }">
        <button v-if="node.children.length" type="button" class="tl-fold" @click="toggleCollapse(node.id)">
          {{ node.collapsed ? '▸' : '▾' }}
        </button>
        <span v-else class="tl-fold tl-fold-empty"></span>
        <button type="button" class="tu-btn ghost tl-status" @click="cycle(node.id)">{{ statusName(node.status) }}</button>
        <input
          v-if="editingId === node.id"
          v-model="editingText"
          type="text"
          class="tu-input tl-edit"
          @keyup.enter="commitEdit"
          @blur="commitEdit"
        />
        <span v-else class="tl-text" @dblclick="startEdit(node.id, node.text)">{{ node.text }}</span>
        <span v-if="node.archived" class="tl-badge">归档</span>
        <span class="tu-spacer"></span>
        <button type="button" class="tu-btn ghost tl-btn" title="加子任务" @click="addChildTo(node.id)">＋</button>
        <button type="button" class="tu-btn ghost tl-btn" @click="toggleArchive(node.id)">{{ node.archived ? '还原' : '归档' }}</button>
        <button type="button" class="tu-btn ghost tl-btn" @click="remove(node.id)">删除</button>
      </li>
    </ul>
    <p v-if="!tree.length" class="tu-hint">该列表暂无任务。</p>

    <p class="tu-hint">
      共 {{ stats.total }} 条：完成 {{ stats.done }} / 归档 {{ stats.archived }}。最多嵌套 {{ MAX_DEPTH }} 层；
      点击状态循环切换，完成父任务会连带完成子任务。数据存本机 IndexedDB。
    </p>
  </div>
</template>

<style scoped>
.tl-cats { flex-wrap: wrap; }
.tl-tree { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.tl-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.tl-row.is-done .tl-text { text-decoration: line-through; color: var(--color-text-muted); }
.tl-fold { min-width: 18px; border: none; background: transparent; color: var(--color-text-secondary); cursor: pointer; }
.tl-fold-empty { display: inline-block; }
.tl-status { min-height: 26px; padding: 2px 10px; font-size: var(--fs-caption); }
.tl-text { flex: 1; min-width: 0; font-size: var(--fs-sm); color: var(--color-text); word-break: break-all; }
.tl-edit { width: auto; flex: 1; min-width: 0; }
.tl-btn {height: 36px;
  padding: 0 12px;
  font-size: var(--fs-caption);}
.tl-badge { font-size: var(--fs-caption); color: var(--color-text-muted); border: 1px solid var(--color-border); border-radius: var(--radius-full); padding: 1px 8px; }
</style>
