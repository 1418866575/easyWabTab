<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import { showConfirm } from '@/utils/dialog'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'

/** 面板尺寸：宽度固定 80%（BaseDialog 将 width 作为 maxWidth 应用，面板 width:100% → 实际即 80%）；
 *  高度仍沿用「设置 → 弹窗尺寸」写入的 CSS 变量，未配置时回退默认值。 */
const PANEL_WIDTH = '80%'
const PANEL_MAX_HEIGHT = 'var(--dlg-h-wb-todo, 85vh)'

const vm = useViewMode()

function cardFields(row: any) {
  return [
    { label: '状态', value: row.todo.archived ? '已归档' : TODO_STATUS_LABELS[todoStatus(row.todo)] },
    { label: '标题', value: row.todo.title },
    { label: '描述', value: row.todo.description || '—' },
    { label: '优先级', value: priorityMeta(row.todo.priority).label },
    { label: '截止日期', value: row.todo.dueDate || '—' },
    { label: '分类', value: row.todo.categoryId || '未分类' }
  ]
}

import { computed, onMounted, ref, watch } from 'vue'
import { useWorkbenchTodosStore } from '@/stores/workbenchTodos'
import {
  filterTodos,
  todoStatus,
  overdueDays,
  TODO_STATUSES,
  TODO_STATUS_LABELS
} from '@/composables/todoCore'
import type { TodoFilterCriteria, TodoStatusFilter } from '@/composables/todoCore'
import type { TodoPriority, TodoStatus, WorkbenchTodo } from '@/types'
import { DEFAULT_TODO_COLOR } from '@/types'
import { usePageSize } from '@/composables/usePageSize'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const store = useWorkbenchTodosStore()

// ===== 查询/筛选（查询按钮生效，重置恢复全量）=====
const searchTitle = ref('')
const searchDescription = ref('')
const searchPriority = ref<'' | TodoPriority>('')
const searchStatus = ref<TodoStatusFilter>('')
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

// 逾期天数随 viewTodos 一并预计算（依赖当天日期，非响应式时钟；跨天刷新页面即更新）
const viewTodos = computed(() =>
  filteredTodos.value.map(todo => ({ todo, overdue: overdueDays(todo) }))
)

/** 状态标签文案：已归档为独立标记、优先展示；其次取工作流状态文案 */
function statusLabelOf(todo: WorkbenchTodo): string {
  if (todo.archived === true) return '已归档'
  return TODO_STATUS_LABELS[todoStatus(todo)]
}

/** 状态标签样式类（与标签文案同源，避免两处漂移） */
function statusClassOf(todo: WorkbenchTodo): string {
  if (todo.archived === true) return 'st-archived'
  const s = todoStatus(todo)
  return s === 'pending' ? 'st-pending' : s === 'in_progress' ? 'st-in-progress' : 'st-completed'
}

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
// 状态操作（新增/编辑弹框入口）：工作流状态 status + 归档标记 archived。
// 状态入口已从列表操作列迁入本弹框（新增、编辑均可设置），保存时统一经
// setTodoStatus / archiveTodo / unarchiveTodo 落库，保证「未完成/进行中 → 已完成 → 已归档」
// 的联动规则与列表操作完全一致，不另写一套。
const formStatus = ref<TodoStatus>('pending')
const formArchived = ref(false)

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
  formStatus.value = 'pending'
  formArchived.value = false
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
  formStatus.value = todoStatus(todo)
  formArchived.value = todo.archived === true
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
    const id = editingId.value
    await store.updateTodo(id, {
      title,
      description,
      priority: formPriority.value,
      dueDate,
      color: formColor.value,
      categoryId: formCategoryId.value || undefined
    })
    // 状态：先落工作流状态（内部同步 completed / completedAt，并在非完成时清归档），
    // 再按需归档/取消归档（复用列表同一套 store 方法，联动规则一致）
    await store.setTodoStatus(id, formStatus.value)
    const after = store.todos.find(t => t.id === id)
    if (after) {
      if (!after.archived && formArchived.value) await store.archiveTodo(id)
      else if (after.archived && !formArchived.value) await store.unarchiveTodo(id)
    }
  } else {
    // 新增即可选状态：status 随 addTodo 直接落库
    // （completed / completedAt 由 normalizeTodo 与 store 同步，联动规则与列表操作一致）
    await store.addTodo({
      title,
      description,
      priority: formPriority.value,
      dueDate,
      color: formColor.value,
      categoryId: formCategoryId.value || undefined,
      status: formStatus.value
    })
    const created = store.todos[store.todos.length - 1]
    if (created && formArchived.value) await store.archiveTodo(created.id)
    listPage.value = 1 // 新增条目回第 1 页（复用日记分页惯例）
  }
  cancelForm()
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
function rowClick(todoRow: { todo: WorkbenchTodo }): void {
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
            <el-option value="pending" label="未完成" data-testid="td-search-status-pending" />
            <el-option value="in_progress" label="进行中" data-testid="td-search-status-in-progress" />
            <el-option value="completed" label="已完成" data-testid="td-search-status-completed" />
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
          未完成 {{ store.pendingCount }} · 进行中 {{ store.inProgressCount }} · 已完成 {{ store.completedCount }}<template v-if="store.archivedCount > 0"> · 已归档 {{ store.archivedCount }}</template>
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
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row: v }">
              <span
                class="td-status-badge"
                :class="statusClassOf(v.todo)"
                :data-testid="`td-status-${v.todo.id}`"
              >{{ statusLabelOf(v.todo) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="截止日期" width="120" align="center">
            <template #default="{ row: v }">
              <!-- 本列只显示截止日期本身：倒计时、逾期等附加信息已拆分到「逾期天数」等独立列 -->
              <span
                v-if="v.todo.dueDate"
                class="td-date"
                :data-testid="`td-due-${v.todo.id}`"
              >{{ v.todo.dueDate }}</span>
              <span v-else class="td-col-empty">—</span>
            </template>
          </el-table-column>
          <el-table-column label="逾期天数" width="110" align="center">
            <template #default="{ row: v }">
              <span
                v-if="v.overdue !== null"
                class="td-overdue-days"
                :title="`已逾期 ${v.overdue} 天`"
                :data-testid="`td-overdue-days-${v.todo.id}`"
              >{{ v.overdue }}</span>
              <span v-else class="td-col-empty">—</span>
            </template>
          </el-table-column>
          <el-table-column label="分类" width="130" align="center">
            <template #default="{ row: v }">
              <span v-if="v.todo.categoryId" class="td-cat-badge" :data-testid="`td-cat-badge-${v.todo.id}`">{{ v.todo.categoryId }}</span>
              <span v-else class="td-col-empty">未分类</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" class-name="ewt-op-col" width="240" align="center" fixed="right">
            <template #default="{ row: v }">
              <div class="td-actions" @click.stop>
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
    <BaseDialog
      v-if="showDialog"
      :title="editingId ? '编辑待办' : '新增待办'"
      :width="PANEL_WIDTH"
      :max-height="PANEL_MAX_HEIGHT"
      data-testid="td-dialog"
      @close="cancelForm"
    >
      <form class="td-form" @submit.prevent="handleSave">
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
            class="td-desc-input"
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

        <!-- 状态操作（新增/编辑均可用）：状态入口已从列表操作列迁入弹框，保存时统一落库 -->
        <div class="form-group td-status-group" data-testid="td-status-group">
          <label>状态</label>
          <div class="td-status-actions">
            <el-select
              v-model="formStatus"
              class="td-status-select"
              size="small"
              data-testid="td-form-status"
            >
              <el-option
                v-for="s in TODO_STATUSES"
                :key="s"
                :value="s"
                :label="TODO_STATUS_LABELS[s]"
                :data-testid="`td-form-status-${s}`"
              />
            </el-select>
            <el-button
              size="small"
              :type="formArchived ? 'warning' : 'default'"
              :plain="!formArchived"
              :disabled="formStatus !== 'completed'"
              class="td-status-btn"
              :title="formStatus === 'completed' ? (formArchived ? '点击取消归档' : '点击归档') : '需先标记为已完成'"
              data-testid="td-toggle-archived"
              @click="formArchived = !formArchived"
            >
              {{ formArchived ? '已归档' : '归档' }}
            </el-button>
            <span v-if="formStatus !== 'completed'" class="td-status-tip">归档需先标记为已完成</span>
          </div>
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
    </BaseDialog>

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
  border-radius: var(--radius-md, 8px);
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

/* .btn-add 视觉已统一到全局 .ui-btn--primary（style.css） */

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
  border-radius: var(--radius-full, 9999px);
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
  border-radius: var(--radius-full, 9999px);
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

/* ===== 状态徽章（未完成 / 进行中 / 已完成 / 已归档）===== */
.td-status-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 9999px);
  border: 1px solid transparent;
  white-space: nowrap;
}

.st-pending {
  color: #475569;
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.st-in-progress {
  color: #1d4ed8;
  background: #dbeafe;
  border-color: #93c5fd;
}

.st-completed {
  color: #15803d;
  background: #dcfce7;
  border-color: #86efac;
}

.st-archived {
  color: #6b7280;
  background: #f3f4f6;
  border-color: #d1d5db;
}

/* 逾期天数：红色高亮 + 等宽数字，便于纵向比对（与截止日期列的「已逾期 N 天」同一色系） */
.td-overdue-days {
  color: var(--color-error, #ef4444);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}


/* 标题后的归档徽标（归档态的唯一展示位：日期列不再显示「已归档」） */
.td-archived-badge {
  display: inline-block;
  margin-left: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 9999px);
  color: var(--color-text-secondary, #64748b);
  background: var(--color-bg-hover, #f1f5f9);
  border: 1px solid var(--color-border, #e2e8f0);
  vertical-align: middle;
}

/* 编辑页状态操作区：移动端补齐状态入口，按钮 + 轻提示 */
.td-status-group { margin-bottom: 12px; }
.td-status-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.td-status-btn { min-width: 104px; }
.td-status-select { width: 140px; flex: none; }
.td-status-tip { font-size: 12px; color: var(--color-text-secondary, #9ca3af); }

/* 待办描述输入框：高度 300px（el-input 的 textarea 需 :deep 穿透内部元素） */
.td-desc-input :deep(.el-textarea__inner) {
  height: 300px;
  min-height: 300px;
  resize: vertical;
  line-height: 1.6;
  overflow-y: auto;
  font-family: var(--font-family);
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
  border-radius: var(--radius-full, 9999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}

/* 截止日期：本列只显示日期本身，逾期信息由「逾期天数」列承载 */
.td-date {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
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

/* .btn-edit/.btn-delete 视觉已统一到全局 .ui-btn（style.css） */

/* ===== 空态 ===== */
.empty-state {
  text-align: center;
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
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

/* ===== 表单（新增/编辑弹框内容区）=====
   弹框外壳（遮罩/面板/头部/关闭/主体）已统一到 common/BaseDialog.vue */
.td-form {
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
  border-radius: var(--radius-sm, 4px);
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
  border-radius: var(--radius-full, 9999px);
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

/* .btn-cancel 视觉已统一到全局 .ui-btn（style.css） */

/* 禁用态（添加按钮）：亮灰底 + 白字在暗色下对比度不足，暗色覆盖见下 */
/* .btn-add:disabled 视觉已统一到全局 .ui-btn--primary（style.css） */

/* ===== 暗色模式覆盖 ===== */
html.dark .td-search {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .empty-state {
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

html.dark .search-reset-btn {
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

html.dark .st-pending {
  color: #cbd5e1;
  background: rgba(71, 85, 105, 0.35);
  border-color: #475569;
}

html.dark .st-in-progress {
  color: #93c5fd;
  background: rgba(29, 78, 216, 0.35);
  border-color: #1e40af;
}

html.dark .st-completed {
  color: #86efac;
  background: rgba(21, 128, 61, 0.35);
  border-color: #166534;
}

html.dark .st-archived {
  color: #9ca3af;
  background: rgba(107, 114, 128, 0.35);
  border-color: #4b5563;
}

html.dark .td-overdue-days {
  color: #f87171;
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

/* html.dark .btn-add:disabled 视觉已统一到全局 .ui-btn--primary（style.css） */

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
