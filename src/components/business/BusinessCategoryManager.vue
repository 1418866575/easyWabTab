<script setup lang="ts">
// 销售记账共享分类管理弹框（product 商品分类 / expense 支出产品 双模式，页面 ⚙️ 与设置弹窗 tab 复用）
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { showConfirm } from '@/utils/dialog'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { useToast } from '@/composables/useToast'
import type { BusinessProductCategory, BusinessExpenseCategory } from '@/types'
import { EXPENSE_UNITS } from '@/composables/businessCore'
import Icon from '@/components/Icon.vue'

const props = defineProps<{ kind: 'product' | 'expense'; embedded?: boolean }>()
const emit = defineEmits<{ close: [] }>()

// ESC 关闭弹框
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    // 内联（embedded）模式不自行关闭：ESC 交由外层设置弹窗处理
    if (props.embedded) return
    event.preventDefault()
    emit('close')
  }
}
onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

const store = useWorkbenchBusinessStore()
const toast = useToast()

const isProduct = computed(() => props.kind === 'product')
const isExpense = computed(() => props.kind === 'expense')
const list = computed(() => (isProduct.value ? store.productCategories : store.expenseCategories))

// 行内改名：仅暂存输入中文本，blur/Enter 提交、Esc 还原（仿待办分类管理惯例）
const editing = reactive<Record<string, string>>({})
const newName = ref('')
// 新增支出产品时一并配置的默认单位 / 单价（元）；product 模式不涉及
const newUnit = ref('')
const newUnitPrice = ref<number | undefined>(undefined)

// 名词：expense 模式称「产品」，product 模式称「分类」（用于提示/报错/确认文案）
function noun(): string {
  return isExpense.value ? '产品' : '分类'
}

// 支出产品的默认单位/单价（product 模式无这两个字段，渲染前已用 v-if 隔离，这里做类型收窄）
function unitOf(c: BusinessProductCategory | BusinessExpenseCategory): string {
  return (c as BusinessExpenseCategory).unit ?? ''
}
function priceOf(c: BusinessProductCategory | BusinessExpenseCategory): number | undefined {
  return (c as BusinessExpenseCategory).unitPrice
}

function isBuiltInOf(id: string): boolean {
  if (isProduct.value) return false
  return (store.expenseCategories.find(c => c.id === id)?.isBuiltIn ?? false)
}

function handleResult(r: { ok: boolean; reason?: string }, successMsg?: string): void {
  if (r.ok) {
    if (successMsg) toast.success(successMsg)
    return
  }
  const n = noun()
  const msg: Record<string, string> = {
    empty: `${n}名称不能为空`,
    duplicate: `同名${n}已存在`,
    'not-found': `${n}不存在`,
    'in-use': `该${n}已被记录使用，无法删除`,
    builtin: '内置分类无法删除',
    boundary: '已在边界'
  }
  toast.error(msg[r.reason ?? ''] ?? '操作失败')
}

function commitRename(id: string): void {
  const raw = editing[id] ?? ''
  const name = raw.trim()
  if (!name) {
    delete editing[id]
    return
  }
  const r = isProduct.value
    ? store.renameProductCategory(id, name)
    : store.renameExpenseCategory(id, name)
  handleResult(r)
  delete editing[id]
}

function revertRename(id: string): void {
  delete editing[id]
}

function onToggleVisible(id: string): void {
  const r = isProduct.value
    ? store.toggleProductCategoryVisible(id)
    : store.toggleExpenseCategoryVisible(id)
  handleResult(r)
}

function onMove(id: string, dir: 'up' | 'down'): void {
  const r = isProduct.value
    ? store.moveProductCategory(id, dir)
    : store.moveExpenseCategory(id, dir)
  handleResult(r)
}

async function onDelete(id: string): Promise<void> {
  const target = list.value.find(c => c.id === id)
  if (!await showConfirm(`确定要删除${noun()}「${target?.name ?? ''}」吗？`)) return
  const r = isProduct.value ? store.deleteProductCategory(id) : store.deleteExpenseCategory(id)
  handleResult(r)
}

// 支出产品：编辑单行的默认单位 / 单价（元）；空值/0 即清除
function onCatUnit(id: string, val: string): void {
  const r = store.updateExpenseCategory(id, { unit: val })
  handleResult(r)
}
function onCatPrice(id: string, val: number | undefined): void {
  const r = store.updateExpenseCategory(id, { unitPrice: val ?? null })
  handleResult(r)
}

function handleAdd(): void {
  const name = newName.value.trim()
  if (!name) return
  const r = isProduct.value
    ? store.addProductCategory(name)
    : store.addExpenseCategory(name, {
        unit: newUnit.value.trim() || undefined,
        unitPrice: typeof newUnitPrice.value === 'number' && newUnitPrice.value > 0 ? newUnitPrice.value : undefined
      })
  if (r.ok) {
    newName.value = ''
    newUnit.value = ''
    newUnitPrice.value = undefined
  }
  handleResult(r)
}
</script>

<template>
  <component
    :is="embedded ? 'div' : 'el-dialog'"
    v-bind="embedded
      ? { 'data-testid': `bizcat-embed-${kind}`, class: 'bizcat-embed' }
      : { 'model-value': true, width: '460px', title: isProduct ? '商品分类管理' : '支出产品管理', 'data-testid': `bizcat-dialog-${kind}` }"
    @close="emit('close')"
  >
    <div class="bizcat-body">
      <p class="bizcat-hint">勾选控制标签页显示；{{ isProduct ? '内置分类可删除（删除后该分类商品归未分类）' : '内置产品不可删除，可改名、排序与配置默认单位/单价' }}</p>
      <div class="bizcat-list">
        <div
          v-for="cat in list"
          :key="cat.id"
          class="bizcat-item"
        >
          <div
            class="bizcat-row"
            :data-testid="`bizcat-row-${kind}-${cat.id}`"
          >
            <el-checkbox
              :checked="cat.visible"
              :data-testid="`bizcat-tab-${kind}-${cat.id}`"
              @change="onToggleVisible(cat.id)"
            />
            <span class="bizcat-icon">
              <Icon v-if="isProduct" name="tag" :size="14" />
              <Icon v-else-if="isBuiltInOf(cat.id)" name="lock" :size="14" />
              <Icon v-else name="expenses" :size="14" />
            </span>
            <el-input
              size="small"
              maxlength="20"
              :data-testid="`bizcat-name-${kind}-${cat.id}`"
              :model-value="editing[cat.id] ?? cat.name"
              @input="editing[cat.id] = $event"
              @blur="commitRename(cat.id)"
              @keydown.enter="commitRename(cat.id)"
              @keydown.esc.stop="revertRename(cat.id)"
            />
            <div class="bizcat-actions">
              <el-button size="small" :data-testid="`bizcat-up-${kind}-${cat.id}`" @click="onMove(cat.id, 'up')">↑</el-button>
              <el-button size="small" :data-testid="`bizcat-down-${kind}-${cat.id}`" @click="onMove(cat.id, 'down')">↓</el-button>
              <el-button size="small" type="danger" :data-testid="`bizcat-del-${kind}-${cat.id}`" @click="onDelete(cat.id)">删除</el-button>
            </div>
          </div>
          <!-- 支出产品：每行可配置默认单位 / 单价（元）；新增支出选该产品时自动回填 -->
          <div v-if="isExpense" class="bizcat-config">
            <div class="bizcat-config-field">
              <label>单位</label>
              <el-select
                size="small"
                class="bizcat-unit"
                :model-value="unitOf(cat)"
                placeholder="选择或输入单位"
                clearable
                filterable
                allow-create
                default-first-option
                :data-testid="`bizcat-unit-${cat.id}`"
                @change="onCatUnit(cat.id, $event)"
              >
                <el-option v-for="u in EXPENSE_UNITS" :key="u" :value="u" :label="u" />
              </el-select>
            </div>
            <div class="bizcat-config-field">
              <label>单价（元）</label>
              <el-input-number
                size="small"
                class="bizcat-price"
                :model-value="priceOf(cat)"
                :min="0"
                :step="0.01"
                :precision="2"
                placeholder="单价"
                :data-testid="`bizcat-price-${cat.id}`"
                @change="onCatPrice(cat.id, $event)"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="bizcat-add">
        <el-input
          v-model="newName"
          size="small"
          maxlength="20"
          :placeholder="isExpense ? '新产品名称' : '新分类名称'"
          :data-testid="`bizcat-new-${kind}`"
          @keydown.enter="handleAdd"
        />
        <el-button size="small" type="primary" :data-testid="`bizcat-add-${kind}`" @click="handleAdd">添加</el-button>
      </div>
      <!-- 支出产品：新增时一并配置默认单位 / 单价（元） -->
      <div v-if="isExpense" class="bizcat-add-config">
        <div class="bizcat-config-field">
          <label>单位</label>
          <el-select
            v-model="newUnit"
            size="small"
            class="bizcat-unit"
            placeholder="选择或输入单位"
            clearable
            filterable
            allow-create
            default-first-option
            :data-testid="`bizcat-new-unit`"
          >
            <el-option v-for="u in EXPENSE_UNITS" :key="u" :value="u" :label="u" />
          </el-select>
        </div>
        <div class="bizcat-config-field">
          <label>单价（元）</label>
          <el-input-number
            v-model="newUnitPrice"
            size="small"
            class="bizcat-price"
            :min="0"
            :step="0.01"
            :precision="2"
            placeholder="单价"
            :data-testid="`bizcat-new-price`"
          />
        </div>
      </div>
    </div>
  </component>
</template>

<style scoped>
.bizcat-body {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bizcat-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.bizcat-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 每个产品/分类项：主行 + 支出产品的单位/单价配置子行 */
.bizcat-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--color-border, var(--color-border));
}
.bizcat-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

/* 支出产品：每行/新增时的默认单位、单价（元）配置区 */
.bizcat-config,
.bizcat-add-config {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  padding-left: 22px;
}
.bizcat-config-field {
  display: flex;
  align-items: center;
  gap: 6px;
}
.bizcat-config-field > label {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
  white-space: nowrap;
}
.bizcat-unit {
  width: 92px;
}
.bizcat-price {
  width: 120px;
}

:global(html.dark) .bizcat-config-field > label {
  color: var(--color-text-muted, #9ca3af);
}

.bizcat-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bizcat-icon {
  flex-shrink: 0;
  font-size: 14px;
}

:deep(.bizcat-row .el-input),
:deep(.bizcat-add .el-input) {
  flex: 1;
  min-width: 0;
}

:deep(.bizcat-row .el-input__inner),
:deep(.bizcat-add .el-input__inner) {
  font-size: 13px;
}

:deep(.bizcat-row .el-checkbox) {
  margin-right: 0;
}

.bizcat-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.bizcat-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px dashed var(--color-border, var(--color-border));
}

/* el-dialog 外壳对齐原弹框（组件根即 .el-dialog，自带 data-v 作用域） */
.el-dialog {
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

:deep(.el-dialog__header) {
  flex-shrink: 0;
}

:deep(.el-dialog__body) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 暗色模式 */
html.dark .bizcat-hint {
  color: var(--color-text-muted, #9ca3af);
}
</style>
