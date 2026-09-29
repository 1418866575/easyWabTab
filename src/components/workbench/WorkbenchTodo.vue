<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import { showConfirm } from '@/utils/dialog'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

function cardFields(row: any) {
  return [
    { label: '完成', value: row.todo.archived ? '已归档' : (row.todo.completed ? '已完成' : '未完成') },
    { label: '标题', value: row.todo.title },
    { label: '描述', value: row.todo.description || '—' },
    { label: '优先级', value: priorityMeta(row.todo.priority).label },
    { label: '截止日期', value: row.todo.dueDate || '—' },
    { label: '分类', value: row.todo.categoryId || '未分类' }
  ]
}

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import { filterTodos, dueInfo } from '@/composables/todoCore'
import type { TodoFilterCriteria } from '@/composables/todoCore'
import type { TodoPriority, WorkbenchTodo } from '@/types'
import { DEFAULT_TODO_COLOR } from '@/types'
import { usePageSize } from '@/composables/usePageSize'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const store = useWorkbenchTodosStore()

// ===== 查询/筛选（查询按钮生效，重置恢复全量）=====
const searchTitle = ref('')
const searchDescription = ref('')
const searchPriority = ref<'' | TodoPriority>('')
const searchStatus = ref<'' | 'all' | 'active' | 'completed' | 'archived'>('')
const appliedFilters = ref<TodoFilterCriteria>({})

// ===== 分类筛选标签页（点击即时生效，与查询条件叠加；'' = 全部，选中值 = 分类名字符串）=====
const activeCategoryId = ref('')

function selectCategoryTab(name: string): void {
  activeCategoryId.value = name
  listPage.value = 1
}

const hasActiveFilter = computed(() =>
  (appliedFilters.value.title ?? '').trim() !== '' ||
  (appliedFilters.value.description ?? '').trim() !== '' ||
  Boolean(appliedFilters.value.priority) ||
  Boolean(appliedFilters.value.status) ||
  activeCategoryId.value !== ''
)

function applySearch(): void {
  appliedFilters.value = {
    title: searchTitle.value,
    description: searchDescription.value,
    priority: searchPriority.value,
    status: searchStatus.value
  }
  listPage.value = 1
}

function resetSearch(): void {
  searchTitle.value = ''
  searchDescription.value = ''
  searchPriority.value = ''
  searchStatus.value = ''
  activeCategoryId.value = ''
  appliedFilters.value = {}
  listPage.value = 1
}

// 列表渲染用筛选后的数据（标签页与查询条件叠加）；顺序 = store 的 orderedTodos（手工顺序，
// 无任何自动排序：打卡状态/打卡时间、完成状态均不参与排序，打卡前后条目索引完全一致）
const filteredTodos = computed(() =>
  filterTodos(store.orderedTodos, { ...appliedFilters.value, categoryId: activeCategoryId.value || undefined })
)

// 预计算卡片主角（含 completed 的「已完成」态），供模板一次取用，避免重复调用
interface TodoHero {
  label: string
  status: 'done' | 'archived' | 'normal' | 'today' | 'overdue'
}

function heroOf(todo: WorkbenchTodo): TodoHero | null {
  // 归档优先于完成：已归档项主角显示「已归档」，避免与未归档的已完成项混淆
  if (todo.archived === true) return { label: '已归档', status: 'archived' }
  if (todo.completed) return { label: '已完成', status: 'done' }
  const info = dueInfo(todo.dueDate, false)
  if (info === null) return null
  return info
}

const viewTodos = computed(() => filteredTodos.value.map(todo => ({ todo, hero: heroOf(todo) })))

/**
 * 表格行身份：归档/取消归档会让条目在数组里跨段移动（已归档段 ⇄ 已完成段），
 * 没有 row-key 时 el-table 按索引复用行 DOM，会出现"点了取消归档、那一行还显示已归档"的错位。
 */
function rowKeyOf(row: { todo: WorkbenchTodo }): string {
  return row.todo.id
}

// ===== 固定分页（el-table 列表，10 条/页）=====
const LIST_PAGE_SIZE = 10
/** 移动端（正方形卡片网格）固定每页 6 个 */
const MOBILE_PAGE_SIZE = 6
const { pageSize, PAGE_SIZES } = usePageSize('td-list-pager', LIST_PAGE_SIZE)
const listPage = ref(1)
/** 移动端固定 6/页，桌面沿用持久化 pageSize；setter 在移动端忽略写入，避免污染用户偏好 */
const activePageSize = computed({
  get: () => (vm.isMobile ? MOBILE_PAGE_SIZE : pageSize.value),
  set: (v: number) => {
    if (!vm.isMobile) pageSize.value = v
  }
})
const pageTodos = computed(() => {
  const start = (listPage.value - 1) * activePageSize.value
  return viewTodos.value.slice(start, start + activePageSize.value)
})

// 条目数缩减后钳制页码，避免末页渲染为空
watch(
  () => viewTodos.value.length,
  (n) => {
    const maxPage = Math.max(1, Math.ceil(n / activePageSize.value))
    if (listPage.value > maxPage) listPage.value = maxPage
  }
)

// ===== 表单状态机（新增/编辑共用，弹框承载）=====
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formTitle = ref('')
const formDescription = ref('')
const formPriority = ref<TodoPriority>('medium')
const formDueDate = ref('')
const formColor = ref(DEFAULT_TODO_COLOR)
// 分类下拉值：'' = 未分类（v-model 与 select option 全字符串，保存时 || undefined）
const formCategoryId = ref('')

// 标题必填：trim 后非空且 ≤100 字符，否则保存按钮 disabled
const isFormValid = computed(() => {
  const title = formTitle.value.trim()
  return title.length > 0 && title.length <= 100
})

const PRIORITY_OPTIONS: { value: TodoPriority; label: string }[] = [
  { value: 'high', label: '高优先级' },
  { value: 'medium', label: '中优先级' },
  { value: 'low', label: '低优先级' }
]

function startAdd(): void {
  editingId.value = null
  formTitle.value = ''
  formDescription.value = ''
  formPriority.value = 'medium'
  formDueDate.value = ''
  formColor.value = DEFAULT_TODO_COLOR
  formCategoryId.value = ''
  showDialog.value = true
}

function startEdit(todo: WorkbenchTodo): void {
  editingId.value = todo.id
  formTitle.value = todo.title
  formDescription.value = todo.description ?? ''
  formPriority.value = todo.priority
  formDueDate.value = todo.dueDate ?? ''
  formColor.value = todo.color ?? DEFAULT_TODO_COLOR
  formCategoryId.value = todo.categoryId ?? ''
  showDialog.value = true
}

function cancelForm(): void {
  showDialog.value = false
  editingId.value = null
}

async function handleSave(): Promise<void> {
  const title = formTitle.value.trim()
  if (!title || title.length > 100) return
  const description = formDescription.value.trim() || undefined
  const dueDate = formDueDate.value || undefined
  if (editingId.value) {
    await store.updateTodo(editingId.value, {
      title,
      description,
      priority: formPriority.value,
      dueDate,
      color: formColor.value,
      categoryId: formCategoryId.value || undefined
    })
  } else {
    await store.addTodo({
      title,
      description,
      priority: formPriority.value,
      dueDate,
      color: formColor.value,
      categoryId: formCategoryId.value || undefined
    })
    listPage.value = 1 // 新增条目回第 1 页（复用日记分页惯例）
  }
  cancelForm()
}

async function handleToggle(todo: WorkbenchTodo): Promise<void> {
  await store.toggleTodo(todo.id)
}

/**
 * 手动归档 / 取消归档。
 * 自动归档已在加载时按「完成超过 30 天」执行，这里只是给用户的即时入口：
 * 想提前收起就归档，归档后仍可一键放回"已完成"。
 */
async function handleArchive(todo: WorkbenchTodo): Promise<void> {
  const ok = await store.archiveTodo(todo.id)
  if (ok) toast.success('已归档，条目已移到列表末尾')
  else toast.info('只有已完成的待办才能归档')
}

async function handleUnarchive(todo: WorkbenchTodo): Promise<void> {
  const ok = await store.unarchiveTodo(todo.id)
  // 取消归档后条目会从「已归档」段回到「已完成」段（可能不在当前页）→ 必须给出反馈，
  // 否则列表原地换成下一条已归档数据，看着像"取消归档没生效"
  if (ok) {
    // 当前正好按「已归档」筛选时，条目会直接从列表消失 —— 同步把筛选切到「已完成」，保证条目仍可见
    if (appliedFilters.value.status === 'archived') {
      searchStatus.value = 'completed'
      appliedFilters.value = { ...appliedFilters.value, status: 'completed' }
    }
    toast.success('已取消归档，条目已放回「已完成」')
  } else {
    toast.info('该待办未处于归档状态')
  }
}

// 打卡入口按需求从列表操作区移除（store.checkInTodo / applyCheckIn 保留：存量数据的 checkedIn 字段仍需兼容）

// 手工排序：表格视图上移/下移一格
async function handleMove(id: string, dir: 'up' | 'down'): Promise<void> {
  await store.moveTodo(id, dir)
}

// ===== 卡片视图拖拽手工排序（复用 HomeLayoutCard 的原生 HTML5 拖拽交换模式）=====
const dragSourceId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)

function onTodoDragStart(id: string): void {
  dragSourceId.value = id
}

function onTodoDragOver(id: string, event: DragEvent): void {
  event.preventDefault()
  if (dragSourceId.value && dragSourceId.value !== id) dragOverId.value = id
}

function onTodoDragLeave(): void {
  dragOverId.value = null
}

async function onTodoDrop(id: string): Promise<void> {
  const src = dragSourceId.value
  if (src && src !== id) await store.reorderTodo(src, id)
  dragSourceId.value = null
  dragOverId.value = null
}

function onTodoDragEnd(): void {
  dragSourceId.value = null
  dragOverId.value = null
}

async function handleDelete(id: string): Promise<void> {
  if (await showConfirm('确定要删除这个待办任务吗？')) {
    await store.deleteTodo(id)
  }
}

// 行点击 → 编辑（保留旧卡片点击行为）
function rowClick(todoRow: { todo: WorkbenchTodo; hero: TodoHero | null }): void {
  startEdit(todoRow.todo)
}

// ===== 优先级徽章 =====
const PRIORITY_META: Record<TodoPriority, { label: string; className: string }> = {
  high: { label: '高', className: 'prio-high' },
  medium: { label: '中', className: 'prio-medium' },
  low: { label: '低', className: 'prio-low' }
}

// el-table 插槽 row 为 any，索引查询走显式类型助手避免 TS7053
function priorityMeta(priority: TodoPriority): { label: string; className: string } {
  return PRIORITY_META[priority]
}

// ESC 关闭弹框（先编辑弹框，再分类管理）
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (showDialog.value) {
    event.preventDefault()
    cancelForm()
  }
}

// 设置弹窗分类管理（改名/删除）外部变更时，重置失效的筛选分类
watch(
  () => store.customCategories,
  (cats) => {
    if (activeCategoryId.value !== '' && !cats.includes(activeCategoryId.value)) {
      activeCategoryId.value = ''
      listPage.value = 1
    }
  }
)

// 面板自管理数据加载（WorkbenchView 已加载，这里防御性重载，数据与 IDB 同步）
onMounted(async () => {
  await store.loadTodos()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="wb-todo">
    <!-- 查询区（标题/描述/优先级/状态 + 右侧查询重置按钮） -->
    <div class="td-search">
      <div class="td-search-fields">
        <label class="td-field td-field-grow">
          <span class="td-field-label">标题</span>
          <el-input
            v-model="searchTitle"
            class="td-field-title"
            placeholder="按标题查询…"
            data-testid="td-search-title"
            size="small"
            @keyup.enter="applySearch"
          />
        </label>
        <label class="td-field td-field-grow">
          <span class="td-field-label">描述</span>
          <el-input
            v-model="searchDescription"
            class="td-field-desc"
            placeholder="按描述查询…"
            data-testid="td-search-desc"
            size="small"
            @keyup.enter="applySearch"
          />
        </label>
        <label class="td-field">
          <span class="td-field-label">优先级</span>
          <el-select v-model="searchPriority" class="search-select" data-testid="td-search-priority" size="small">
            <el-option value="" label="全部优先级" />
            <el-option v-for="opt in PRIORITY_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
          </el-select>
        </label>
        <label class="td-field">
          <span class="td-field-label">状态</span>
          <el-select v-model="searchStatus" class="search-select" data-testid="td-search-status" size="small">
            <el-option value="" label="全部状态" />
            <el-option value="active" label="待办" />
            <el-option value="completed" label="已完成" />
            <el-option value="archived" label="已归档" data-testid="td-search-status-archived" />
          </el-select>
        </label>
      </div>
      <div class="td-search-actions">
        <el-button type="primary" size="small" data-testid="td-search-btn" @click="applySearch">查询</el-button>
        <el-button size="small" data-testid="td-search-reset" @click="resetSearch">重置</el-button>
      </div>
    </div>

    <!-- 分类筛选标签页（全部 + 可见分类，点击即时过滤）+ 新增待办按钮靠右 -->
    <div class="td-cat-tabs">
      <el-radio-group v-model="activeCategoryId" class="td-cat-tabs-group" size="small" @update:model-value="selectCategoryTab">
        <el-radio-button value="" data-testid="td-cat-all">全部</el-radio-button>
        <el-radio-button
          v-for="cat in store.tabCategories"
          :key="cat"
          :value="cat"
          :data-testid="`td-cat-${cat}`"
        >{{ cat }}</el-radio-button>
      </el-radio-group>
      <span class="toolbar-count" data-testid="td-toolbar-count">
        <template v-if="hasActiveFilter">筛选出 {{ filteredTodos.length }} / {{ store.orderedTodos.length }} 个</template>
        <template v-else>
          待办 {{ store.activeCount }} · 已完成 {{ store.completedCount }}<template v-if="store.archivedCount > 0"> · 已归档 {{ store.archivedCount }}</template>
        </template>
      </span>
    </div>

    <!-- 表格工具条：左上新增 + 右上视图切换（常驻渲染，空列表/筛空时也能新增） -->
    <div class="ewt-table-toolbar is-split">
      <div class="td-toolbar-left">
        <el-button type="primary" size="small" class="btn-add" data-testid="td-add-button" @click="startAdd">＋ 新增待办</el-button>
      </div>
      <ViewModeToggle v-if="filteredTodos.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
    </div>

    <!-- 空态 / 卡片墙 -->
    <div v-if="store.orderedTodos.length === 0" class="empty-state empty-invite" data-testid="td-empty" @click="startAdd">
      ＋ 新增第一个待办
    </div>

    <div v-else-if="filteredTodos.length === 0" class="empty-state filter-empty" data-testid="td-filter-empty">
      <span>没有符合查询条件的待办</span>
      <button class="btn-cancel" @click="resetSearch">重置查询</button>
    </div>

    <template v-else>
      <div class="td-table-wrap">
        <el-table v-if="vm.mode === 'list'" class="ewt-table"
          :data="pageTodos"
          :row-key="rowKeyOf"
          data-testid="td-table"
          @row-click="rowClick"
          stripe
          border
          size="default"
          style="width: 100%"
          height="100%"
          empty-text="没有符合查询条件的待办"
        >
          <el-table-column type="index" label="序号" width="70" align="center" class-name="ewt-index-col" :index="(i: number) => (listPage - 1) * pageSize + i + 1" />
          <el-table-column label="标题" min-width="200" align="center" show-overflow-tooltip>
            <template #default="{ row: v }">
              <div class="td-title" :class="{ 'is-done': v.todo.completed }">
                {{ v.todo.title }}
                <span v-if="v.todo.archived === true" class="td-archived-badge" :data-testid="`td-archived-badge-${v.todo.id}`">已归档</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="描述" min-width="160" align="center" show-overflow-tooltip>
            <template #default="{ row: v }">
              <span v-if="v.todo.description" class="td-desc">{{ v.todo.description }}</span>
              <span v-else class="td-col-empty">—</span>
            </template>
          </el-table-column>
          <el-table-column label="优先级" width="90" align="center">
            <template #default="{ row: v }">
              <span
                class="prio-badge"
                :class="priorityMeta(v.todo.priority).className"
                :data-testid="`td-prio-${v.todo.id}`"
              >{{ priorityMeta(v.todo.priority).label }}</span>
            </template>
          </el-table-column>
          <el-table-column label="截止日期" width="150" align="center">
            <template #default="{ row: v }">
              <div v-if="v.todo.dueDate" class="td-meta">
                <span
                  class="td-date"
                  :class="{ overdue: !v.todo.completed && v.hero?.status === 'overdue' }"
                >{{ v.todo.dueDate }}</span>
                <span
                  v-if="!v.todo.completed && v.hero?.status === 'overdue'"
                  class="overdue-tag"
                >已逾期</span>
              </div>
              <span v-else class="td-col-empty">—</span>
              <!-- 截止日期列只展示与日期相关的提示（今日/逾期/N天）；「已归档」属完成态，
                   由标题列的 td-archived-badge 与详情字段展示，不混进日期列 -->
              <div
                v-if="v.hero && v.hero.status !== 'done' && v.hero.status !== 'archived'"
                class="td-hero"
                :class="'td-' + v.hero.status"
              >
                <span class="td-hero-value">{{ v.hero.label }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="分类" width="130" align="center">
            <template #default="{ row: v }">
              <span v-if="v.todo.categoryId" class="td-cat-badge" :data-testid="`td-cat-badge-${v.todo.id}`">{{ v.todo.categoryId }}</span>
              <span v-else class="td-col-empty">未分类</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" class-name="ewt-op-col" width="360" align="center" fixed="right">
            <template #default="{ row: v }">
              <div class="td-actions" @click.stop>
                <el-button
                  size="small"
                  :type="v.todo.completed ? 'success' : 'default'"
                  :data-testid="`td-toggle-${v.todo.id}`"
                  :title="v.todo.completed ? '点击标记为未完成' : '点击标记为已完成'"
                  @click="handleToggle(v.todo)"
                >{{ v.todo.completed ? '已完成' : '未完成' }}</el-button>
                <el-button
                  v-if="v.todo.completed && v.todo.archived !== true"
                  size="small"
                  :data-testid="`td-archive-${v.todo.id}`"
                  title="立即归档（不点也会在完成满 30 天后自动归档）"
                  @click="handleArchive(v.todo)"
                >归档</el-button>
                <el-button
                  v-if="v.todo.archived === true"
                  size="small"
                  :data-testid="`td-unarchive-${v.todo.id}`"
                  title="取消归档，放回已完成"
                  @click="handleUnarchive(v.todo)"
                >取消归档</el-button>
                <el-button size="small" :data-testid="`td-up-${v.todo.id}`" title="上移（手工排序）" @click="handleMove(v.todo.id, 'up')">↑</el-button>
                <el-button size="small" :data-testid="`td-down-${v.todo.id}`" title="下移（手工排序）" @click="handleMove(v.todo.id, 'down')">↓</el-button>
                <el-button size="small" :data-testid="`td-edit-${v.todo.id}`" @click="startEdit(v.todo)">编辑</el-button>
                <el-button size="small" class="btn-delete" :data-testid="`td-delete-${v.todo.id}`" @click="handleDelete(v.todo.id)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="ewt-card-grid">
          <div
            v-for="item in pageTodos"
            :key="item.todo.id"
            class="td-card-wrap"
            draggable="true"
            :data-todo-id="item.todo.id"
            :class="{ 'is-dragging': dragSourceId === item.todo.id, 'is-dragover': dragOverId === item.todo.id }"
            @dragstart="onTodoDragStart(item.todo.id)"
            @dragover="onTodoDragOver(item.todo.id, $event)"
            @dragleave="onTodoDragLeave"
            @drop="onTodoDrop(item.todo.id)"
            @dragend="onTodoDragEnd"
          >
            <RecordsCard
              @edit="startEdit(item.todo)"
              :fields="cardFields(item)"
            >
            </RecordsCard>
          </div>
        </div>

      </div>
      <div class="td-list-pager ewt-pager">
        <el-pagination
          v-model:current-page="listPage"
          @size-change="listPage = 1"
          v-model:page-size="activePageSize"
          :page-sizes="PAGE_SIZES"
          layout="total, prev, pager, next, jumper"
          :total="viewTodos.length"
          background
          small
          prev-text="上一页"
          next-text="下一页"
          data-testid="td-pagination"
        />
      </div>
    </template>

    <!-- 新增/编辑弹框 -->
    <el-dialog
      :model-value="showDialog"
      :title="editingId ? '编辑待办' : '新增待办'"
      width="480px"
      data-testid="td-dialog"
      @close="cancelForm"
      @update:model-value="(v: boolean) => { if (!v) cancelForm() }"
    >
      <!-- 只保留 el-dialog 自带的右上角关闭按钮，此处不再叠加自定义 X（否则出现两个关闭） -->
      <template #header>
        <div class="dialog-header">
          <h3>{{ editingId ? '编辑待办' : '新增待办' }}</h3>
        </div>
      </template>
      <form class="dialog-body" @submit.prevent="handleSave">
        <div class="form-group">
          <label>标题 *</label>
          <el-input
            v-model="formTitle"
            placeholder="例如：提交季度报告"
            maxlength="100"
            data-testid="td-title-input"
            @keyup.enter="handleSave"
          />
        </div>

        <div class="form-group">
          <label>描述（可选）</label>
          <el-input
            v-model="formDescription"
            type="textarea"
            :rows="2"
            placeholder="补充说明…"
            data-testid="td-desc-input"
          />
        </div>

        <div class="form-group">
          <label>分类</label>
          <el-select v-model="formCategoryId" data-testid="td-form-category">
            <el-option value="" label="未分类" />
            <el-option v-for="cat in store.allCategories" :key="cat" :value="cat" :label="cat" />
          </el-select>
        </div>

        <div class="form-row-fields">
          <div class="field">
            <label class="field-label">优先级</label>
            <el-select v-model="formPriority" class="field-prio" data-testid="td-priority">
              <el-option v-for="opt in PRIORITY_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
            </el-select>
          </div>
          <div class="field">
            <label class="field-label">截止日期</label>
            <el-date-picker
              v-model="formDueDate"
              type="date"
              value-format="YYYY-MM-DD"
              class="field-date"
              placeholder="选择日期"
              data-testid="td-due-input"
            />
          </div>
        </div>

        <div class="form-actions ewt-dialog-footer">
          <el-button size="small" data-testid="td-cancel-button" @click="cancelForm">
            取消
          </el-button>
          <el-button type="primary" size="small" :disabled="!isFormValid" data-testid="td-save-button" @click="handleSave">
            {{ editingId ? '保存' : '添加' }}
          </el-button>
          <el-button v-if="editingId" type="danger" size="small" native-type="button" data-testid="td-record-delete" @click="handleDelete(editingId)">删除</el-button>
        </div>
      </form>
    </el-dialog>

  </div>
</template>

<style scoped>
/* 面板容器 */
.wb-todo {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 查询区 ===== */
.td-search {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.td-search-fields { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
.td-field { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
.td-field-grow { flex: 0 0 auto; min-width: 0; }
.td-field-grow :is(.td-field-desc, .td-field-title) { width: 200px; }
.td-field-label { font-size: 13px; color: var(--color-text-secondary, var(--color-text-secondary)); }
.td-search-actions { display: flex; justify-content: flex-end; gap: 8px; }

.search-select {
  width: 130px;
  flex-shrink: 0;
}

.search-btn {
  padding: 9px 16px;
  background: var(--color-primary, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.search-btn:hover {
  background: var(--color-primary-hover, var(--color-primary-hover));
}

.search-reset-btn {
  padding: 9px 14px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.search-reset-btn:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

/* ===== 操作栏 ===== */
.td-headbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-count {
  margin-left: auto;
  font-size: 14px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.btn-add {
  padding: 10px 16px;
  background-color: var(--color-primary, var(--color-primary));
  color: #fff;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-add:hover {
  background-color: var(--color-primary-hover, var(--color-primary-hover));
}

.td-headbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* ===== 分类筛选标签页（全部 + 可见分类，即时过滤；镜像 .nt-cat-tabs）===== */
.td-cat-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.td-cat-tab {
  padding: 5px 14px;
  font-size: 13px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.td-cat-tab:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.td-cat-tab.active {
  color: #fff;
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

/* ===== el-table 表格容器（参考 WorkbenchNotes）===== */
.td-table-wrap {
  flex: 1 1 auto;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.td-table-wrap > :global(.el-table) {
  flex: 1 1 auto;
  min-height: 220px;
  width: 100% !important;
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.td-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.td-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .td-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .td-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.td-table-wrap > :global(.el-table .el-table__body-wrapper .cell),
.td-table-wrap > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条（参考 WorkbenchNotes）===== */
.td-list-pager {
  flex: 0 0 auto;
  padding: 14px 16px 18px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  margin: 0 0 8px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .td-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}

/* ===== 表格内徽章/标签 ===== */

.td-col-empty {
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 12px;
}

.td-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.td-title.is-done {
  text-decoration: line-through;
  color: var(--color-text-muted, var(--color-text-muted));
}

/* 优先级徽章 */
.prio-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  border: 1px solid transparent;
}

.prio-high {
  color: #b91c1c;
  background: #fee2e2;
  border-color: #fca5a5;
}

.prio-medium {
  color: #b45309;
  background: #fef3c7;
  border-color: #fcd34d;
}

.prio-low {
  color: #475569;
  background: #f1f5f9;
  border-color: #cbd5e1;
}

/* 截止倒计时主角（状态色） */
.td-hero {
  flex-shrink: 0;
  font-weight: 700;
}

.td-hero-value {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
  line-height: 1.1;
}

.td-normal {
  color: var(--color-success, var(--color-success));
}

.td-today {
  color: var(--color-warning, var(--color-warning));
}

.td-overdue {
  color: var(--color-error, var(--color-error));
}

.td-done {
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 14px;
  font-weight: 600;
}

/* 标题后的归档徽标（归档态的唯一展示位：日期列不再显示「已归档」） */
.td-archived-badge {
  display: inline-block;
  margin-left: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
  color: var(--color-text-secondary, #64748b);
  background: var(--color-bg-hover, #f1f5f9);
  border: 1px solid var(--color-border, #e2e8f0);
  vertical-align: middle;
}

.td-desc {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 0;
}

/* 分类徽标（镜像 .note-cat-badge） */
.td-cat-badge {
  align-self: flex-start;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}

/* Meta：截止日期 / 逾期 */
.td-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.td-date {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.td-date.overdue {
  color: var(--color-error, var(--color-error));
  font-weight: 600;
}

.overdue-tag {
  color: #fff;
  background: var(--color-error, #ef4444);
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
}

/* ===== 卡片操作 ===== */
.td-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
}

.td-toggle {
  display: flex;
  align-items: center;
}

.td-toggle input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--color-primary, var(--color-primary));
}

.btn-edit,
.btn-delete {
  padding: 2px 8px;
  font-size: 11px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-edit:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.btn-delete:hover {
  color: var(--color-error, var(--color-error));
  border-color: var(--color-error, var(--color-error));
}

/* ===== 空态 ===== */
.empty-state {
  text-align: center;
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

.empty-invite {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary, var(--color-text-secondary));
  transition: color var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.empty-invite:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.filter-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

/* ===== 表单（新增/编辑弹框）===== */
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
  background-color: var(--color-bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px);
  width: 100%;
  max-width: var(--dlg-w-wb-todo, 480px);
  max-height: var(--dlg-h-wb-todo, 85vh);
  overflow-y: auto;
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
  position: sticky;
  top: 0;
  background: var(--color-bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
}

.dialog-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  margin: 0;
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group > label {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.form-row-fields {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.field-prio {
  width: 140px;
}

.field-date {
  width: 170px;
}

.form-input {
  padding: 9px 12px;
  background-color: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text, var(--color-text));
  box-sizing: border-box;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary, var(--color-primary));
}

.desc-input {
  resize: vertical;
}

/* 颜色选择器 */
.color-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.color-option {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  background: var(--swatch);
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease);
}

.color-option:hover {
  transform: scale(1.15);
}

.color-option.active {
  box-shadow: 0 0 0 2px var(--color-bg-card, #ffffff), 0 0 0 4px var(--swatch);
}

.color-custom {
  display: flex;
  align-items: center;
  gap: 6px;
}

.color-input {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  background: none;
  cursor: pointer;
}

.color-custom-value {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.color-reset {
  padding: 5px 10px;
  font-size: 12px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-full, 999px);
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.color-reset:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-save {
  padding: 9px 18px;
  background: var(--color-primary, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-save:hover:not(:disabled) {
  background: var(--color-primary-hover, var(--color-primary-hover));
}

.btn-save:disabled {
  background: var(--color-text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.btn-cancel {
  padding: 9px 16px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-cancel:hover {
  background: var(--color-bg-hover, var(--color-bg-active));
}

/* 禁用态（添加按钮）：亮灰底 + 白字在暗色下对比度不足，暗色覆盖见下 */
.btn-add:disabled {
  background: var(--color-text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

/* ===== 暗色模式覆盖 ===== */
html.dark .td-search {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .empty-state {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .dialog {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .dialog-header {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .td-title {
  color: var(--color-text, #f9fafb);
}

html.dark .td-title.is-done {
  color: var(--color-text-muted, #9ca3af);
}

html.dark .td-desc {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .td-date {
  color: var(--color-text-secondary, #d1d5db);
}

/* 禁用态按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
html.dark .btn-save:disabled {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text-muted, #9ca3af);
}

html.dark .form-input,
html.dark select.form-input,
html.dark input.form-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

html.dark .color-reset {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .search-reset-btn,
html.dark .btn-cancel,
html.dark .btn-edit,
html.dark .btn-delete {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .prio-high {
  color: #fca5a5;
  background: rgba(185, 28, 28, 0.35);
  border-color: #991b1b;
}

html.dark .prio-medium {
  color: #fbbf24;
  background: rgba(180, 83, 9, 0.35);
  border-color: #92400e;
}

html.dark .prio-low {
  color: #cbd5e1;
  background: rgba(71, 85, 105, 0.35);
  border-color: #475569;
}

html.dark .td-normal {
  color: #4ade80;
}

html.dark .td-today {
  color: #fbbf24;
}

html.dark .td-overdue {
  color: #f87171;
}

html.dark .td-done {
  color: #9ca3af;
}

html.dark .td-cat-tab {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .td-cat-tab:hover {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

/* 显式覆盖，避免 html.dark 更高优先级压掉 active 填充（倒计时面板同类陷阱） */
html.dark .td-cat-tab.active {
  color: #fff;
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

html.dark .td-cat-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

html.dark .btn-add:disabled {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text-muted, #9ca3af);
}

@media (max-width: 640px) {
  .search-input,
  .td-field-title,
  .td-field-grow {
    width: 100%;
  }
}

/* 移动端卡片视图：卡片正方形（每页 6 个，见 MOBILE_PAGE_SIZE）。
   仅作用于本组件内的 .ewt-card-grid（scoped 后代选择器），不影响其它复用该全局类的面板 */
@media (max-width: 768px) {
  .ewt-card-grid :deep(.ewt-card) {
    aspect-ratio: 1;
  }
}

.td-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
/* 卡片视图拖拽手工排序：grab 光标 + 拖拽中半透明 + 落点虚线高亮 */
.td-card-wrap {
  cursor: grab;
}
.td-card-wrap.is-dragging {
  opacity: 0.5;
}
.td-card-wrap.is-dragover {
  outline: 2px dashed var(--color-primary, #409eff);
  outline-offset: 2px;
  border-radius: var(--radius-sm, 4px);
}
</style>
