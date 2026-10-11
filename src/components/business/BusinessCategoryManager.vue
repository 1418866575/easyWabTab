<script setup lang="ts">
// 销售记账共享分类管理弹框（product 商品分类 / expense 支出产品 双模式，页面 ⚙️ 与设置弹窗 tab 复用）
import { computed, reactive, ref } from 'vue'
import { showConfirm } from '@/utils/dialog'
import { useViewMode } from '@/composables/useViewMode'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { reportBizResult, type BizResultLike } from '@/composables/bizResult'
import type { BusinessProductCategory, BusinessExpenseCategory } from '@/types'
import { EXPENSE_UNITS, productUnitPriceOf } from '@/composables/businessCore'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/Icon.vue'

const props = defineProps<{ kind: 'product' | 'expense'; embedded?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const store = useWorkbenchBusinessStore()

// ⚠️ useViewMode 返回 reactive 包装对象，不能解构（会丢失响应式），必须用 vm.isMobile
const vm = useViewMode()

const isProduct = computed(() => props.kind === 'product')
const isExpense = computed(() => props.kind === 'expense')
const list = computed(() => (isProduct.value ? store.productCategories : store.expenseCategories))

// 表格搜索（仅 expense 表格模式）：按名称过滤，不影响排序/持久化
const kw = ref('')
const filtered = computed(() => {
  const k = kw.value.trim()
  return k ? list.value.filter(c => c.name.includes(k)) : list.value
})

/**
 * 高级列（关联商品 / 商品数量 / 商品单价）显隐：
 * 默认展开（2026-10-09 桌面默认展开；2026-10-11 改为移动端也默认展开，去掉窄屏自动收起）。
 * ⚠️ 桌面全 8 列在设置面板（内容区 ~660px）里会超出，表格自身横向滚动；
 * 「操作」列在桌面 fixed="right"（横向滚动时始终可见），移动端取消固定（见下方 :fixed 绑定）。
 * 用户仍可手动点「收起/展开高级列」切换。
 */
const showAdvanced = ref(true)

// 行内改名：仅暂存输入中文本，blur/Enter 提交、Esc 还原（仿待办分类管理惯例）
const editing = reactive<Record<string, string>>({})
const newName = ref('')
// 新增支出产品时一并配置的默认单位 / 单价（元）；product 模式不涉及
const newUnit = ref('')
const newUnitPrice = ref<number | undefined>(undefined)
// 新增支出产品时一并配置的默认商品数量（用于 单价 ÷ 商品数量 = 商品单价）；product 模式不涉及
const newProductQty = ref<number | undefined>(undefined)
// 新增支出产品时一并绑定的关联商品（指向 BusinessProduct.id）；product 模式不涉及
const newProductId = ref<string | undefined>(undefined)

// 名词：expense 模式称「产品」，product 模式称「分类」（用于提示/报错/确认文案）
function noun(): string {
  return isExpense.value ? '产品' : '分类'
}

// 支出产品的默认单位/单价/商品数量（product 模式无这些字段，渲染前已用 v-if 隔离，这里做类型收窄）
function unitOf(c: BusinessProductCategory | BusinessExpenseCategory): string {
  return (c as BusinessExpenseCategory).unit ?? ''
}
function priceOf(c: BusinessProductCategory | BusinessExpenseCategory): number | undefined {
  return (c as BusinessExpenseCategory).unitPrice
}
function productQtyOf(c: BusinessProductCategory | BusinessExpenseCategory): number | undefined {
  return (c as BusinessExpenseCategory).productQuantity
}
// 商品单价（派生只读）：单价 ÷ 商品数量；两者齐备才有效（core 同款逻辑，这里供模板展示）
function productPriceOf(c: BusinessProductCategory | BusinessExpenseCategory): number | undefined {
  return productUnitPriceOf(c as BusinessExpenseCategory)
}
// 支出产品绑定的关联商品 id（指向 BusinessProduct.id）；product 模式无此字段
function productIdOf(c: BusinessProductCategory | BusinessExpenseCategory): string | undefined {
  return (c as BusinessExpenseCategory).productId
}
// 新增表单里的商品单价预览（单价 ÷ 商品数量，派生只读）
const newProductPrice = computed<number | undefined>(() => {
  const up = typeof newUnitPrice.value === 'number' ? newUnitPrice.value : NaN
  const qty = typeof newProductQty.value === 'number' ? newProductQty.value : NaN
  if (!(up > 0) || !(qty > 0)) return undefined
  return Math.round((up / qty) * 100) / 100
})

function isBuiltInOf(id: string): boolean {
  if (isProduct.value) return false
  return (store.expenseCategories.find(c => c.id === id)?.isBuiltIn ?? false)
}

/**
 * 统一结果处理：成功提示 successMsg，失败按 reason 映射提示。
 * 通用「结果 → toast」逻辑已抽到 reportBizResult，这里只保留分类域的文案映射。
 */
function handleResult(r: BizResultLike, successMsg?: string): void {
  const n = noun()
  reportBizResult(r, {
    successMsg,
    messages: {
      empty: `${n}名称不能为空`,
      duplicate: `同名${n}已存在`,
      'not-found': `${n}不存在`,
      'in-use': `该${n}已被记录使用，无法删除`,
      builtin: '内置分类无法删除',
      boundary: '已在边界'
    }
  })
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
// 支出产品：编辑单行的默认商品数量；空值/0 即清除（商品单价 = 单价 ÷ 商品数量 派生只读）
function onCatProductQty(id: string, val: number | undefined): void {
  const r = store.updateExpenseCategory(id, { productQuantity: val ?? null })
  handleResult(r)
}
// 支出产品：编辑单行绑定的关联商品；空值即清除（productId 指向 BusinessProduct.id）
function onCatProduct(id: string, val: string | undefined): void {
  const r = store.updateExpenseCategory(id, { productId: val ?? null })
  handleResult(r)
}

function handleAdd(): void {
  const name = newName.value.trim()
  if (!name) return
  const r = isProduct.value
    ? store.addProductCategory(name)
    : store.addExpenseCategory(name, {
        unit: newUnit.value.trim() || undefined,
        unitPrice: typeof newUnitPrice.value === 'number' && newUnitPrice.value > 0 ? newUnitPrice.value : undefined,
        productQuantity: typeof newProductQty.value === 'number' && newProductQty.value > 0 ? newProductQty.value : undefined,
        productId: newProductId.value || undefined
      })
  if (r.ok) {
    newName.value = ''
    newUnit.value = ''
    newUnitPrice.value = undefined
    newProductQty.value = undefined
    newProductId.value = undefined
  }
  handleResult(r)
}
</script>

<template>
  <BaseDialog
    :title="isProduct ? '商品分类管理' : '进货商品管理'"
    :width="isProduct ? '460px' : '880px'"
    :embedded="embedded"
    :hide-header="embedded"
    :close-on-overlay="!embedded"
    :data-testid="embedded ? `bizcat-embed-${kind}` : `bizcat-dialog-${kind}`"
    @close="emit('close')"
  >
    <div class="bizcat-body">
      <p class="bizcat-hint">勾选控制标签页显示；{{ isProduct ? '内置分类可删除（删除后该分类商品归未分类）' : '内置产品不可删除，可改名、排序与配置默认单位/单价/商品数量' }}</p>

      <!-- ===== 进货商品（expense）：表格化（2026-10-09，原型 docs/进货商品管理-表格原型.html） ===== -->
      <template v-if="isExpense">
        <div class="bizcat-toolbar">
          <el-input
            v-model="kw"
            size="small"
            class="bizcat-search"
            placeholder="搜索产品名称"
            clearable
            data-testid="bizcat-search-expense"
          />
          <span class="bizcat-toolbar-spacer" />
          <el-button size="small" data-testid="bizcat-toggle-adv" @click="showAdvanced = !showAdvanced">
            {{ showAdvanced ? '收起高级列' : '展开高级列' }}
          </el-button>
        </div>

        <el-table
          class="ewt-table bizcat-table"
          :data="filtered"
          size="small"
          border
          stripe
          row-key="id"
          max-height="420"
          empty-text="暂无产品，请在下方新增"
          data-testid="bizcat-table-expense"
        >
          <el-table-column label="显示" width="56" align="center">
            <template #default="{ row }">
              <el-checkbox
                :model-value="row.visible"
                :data-testid="`bizcat-tab-expense-${row.id}`"
                @change="onToggleVisible(row.id)"
              />
            </template>
          </el-table-column>

          <el-table-column label="产品名称" min-width="150">
            <template #default="{ row }">
              <div class="bizcat-name-cell">
                <el-input
                  size="small"
                  maxlength="20"
                  :data-testid="`bizcat-name-expense-${row.id}`"
                  :model-value="editing[row.id] ?? row.name"
                  @input="editing[row.id] = $event"
                  @change="commitRename(row.id)"
                  @keydown.esc.stop="revertRename(row.id)"
                />
                <span v-if="isBuiltInOf(row.id)" class="bizcat-tag-builtin">内置</span>
                <span v-else-if="!row.visible" class="bizcat-tag-hidden">隐藏</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column v-if="showAdvanced" label="关联商品" width="132">
            <template #default="{ row }">
              <el-select
                size="small"
                class="bizcat-cell-select"
                :model-value="productIdOf(row)"
                placeholder="未绑定"
                clearable
                filterable
                :data-testid="`bizcat-product-${row.id}`"
                @change="onCatProduct(row.id, $event)"
              >
                <el-option v-for="p in store.products" :key="p.id" :value="p.id" :label="p.name" />
              </el-select>
            </template>
          </el-table-column>

          <!-- 单位/单价：移动端与 PC 一致始终展示（2026-10-11 起不再窄屏隐藏；表格在容器内横向滚动） -->
          <el-table-column label="单位" width="106">
            <template #default="{ row }">
              <el-select
                size="small"
                class="bizcat-cell-select"
                :model-value="unitOf(row)"
                placeholder="—"
                clearable
                filterable
                allow-create
                default-first-option
                :data-testid="`bizcat-unit-${row.id}`"
                @change="onCatUnit(row.id, $event)"
              >
                <el-option v-for="u in EXPENSE_UNITS" :key="u" :value="u" :label="u" />
              </el-select>
            </template>
          </el-table-column>

          <el-table-column label="单价（元）" width="112">
            <template #default="{ row }">
              <el-input-number
                size="small"
                class="bizcat-cell-number"
                :model-value="priceOf(row)"
                :min="0"
                :step="0.01"
                :precision="2"
                :controls="false"
                placeholder="单价"
                :data-testid="`bizcat-price-${row.id}`"
                @change="onCatPrice(row.id, $event)"
              />
            </template>
          </el-table-column>

          <el-table-column v-if="showAdvanced" label="商品数量" width="106">
            <template #default="{ row }">
              <el-input-number
                size="small"
                class="bizcat-cell-number"
                :model-value="productQtyOf(row)"
                :min="0"
                :step="1"
                :precision="0"
                :controls="false"
                placeholder="数量"
                :data-testid="`bizcat-prodqty-${row.id}`"
                @change="onCatProductQty(row.id, $event)"
              />
            </template>
          </el-table-column>

          <!-- 商品单价 = 单价 ÷ 商品数量（派生只读） -->
          <el-table-column v-if="showAdvanced" label="商品单价" width="98" align="center">
            <template #default="{ row }">
              <span class="bizcat-prodprice" :data-testid="`bizcat-prodprice-${row.id}`">{{ productPriceOf(row) != null ? productPriceOf(row) : '—' }}</span>
            </template>
          </el-table-column>

          <!-- 操作列：桌面 fixed="right"（横向滚动始终可见），移动端取消固定（2026-10-11）；
               移动端只保留「删除」，不显示 ↑/↓ 排序（窄屏排序意义不大且挤占空间） -->
          <el-table-column
            label="操作"
            :width="vm.isMobile ? 72 : 134"
            align="center"
            :fixed="vm.isMobile ? false : 'right'"
          >
            <template #default="{ row }">
              <div class="bizcat-ops">
                <el-button v-if="!vm.isMobile" size="small" :data-testid="`bizcat-up-expense-${row.id}`" @click="onMove(row.id, 'up')">↑</el-button>
                <el-button v-if="!vm.isMobile" size="small" :data-testid="`bizcat-down-expense-${row.id}`" @click="onMove(row.id, 'down')">↓</el-button>
                <el-button
                  size="small"
                  type="danger"
                  :disabled="isBuiltInOf(row.id)"
                  :title="isBuiltInOf(row.id) ? '内置产品不可删除' : ''"
                  :data-testid="`bizcat-del-expense-${row.id}`"
                  @click="onDelete(row.id)"
                >删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <!-- 新增行：贴表格底部，输入即预览商品单价 -->
        <div class="bizcat-add-row">
          <div class="bizcat-add-field">
            <label>产品名称</label>
            <el-input
              v-model="newName"
              size="small"
              maxlength="20"
              placeholder="新产品名称"
              data-testid="bizcat-new-expense"
              @keydown.enter="handleAdd"
            />
          </div>
          <div class="bizcat-add-field">
            <label>关联商品</label>
            <el-select
              v-model="newProductId"
              size="small"
              placeholder="未绑定"
              clearable
              filterable
              data-testid="bizcat-new-product"
            >
              <el-option v-for="p in store.products" :key="p.id" :value="p.id" :label="p.name" />
            </el-select>
          </div>
          <div class="bizcat-add-field">
            <label>单位</label>
            <el-select
              v-model="newUnit"
              size="small"
              placeholder="—"
              clearable
              filterable
              allow-create
              default-first-option
              data-testid="bizcat-new-unit"
            >
              <el-option v-for="u in EXPENSE_UNITS" :key="u" :value="u" :label="u" />
            </el-select>
          </div>
          <div class="bizcat-add-field">
            <label>单价（元）</label>
            <el-input-number
              v-model="newUnitPrice"
              size="small"
              :min="0"
              :step="0.01"
              :precision="2"
              :controls="false"
              placeholder="单价"
              data-testid="bizcat-new-price"
            />
          </div>
          <div class="bizcat-add-field">
            <label>商品数量</label>
            <el-input-number
              v-model="newProductQty"
              size="small"
              :min="0"
              :step="1"
              :precision="0"
              :controls="false"
              placeholder="数量"
              data-testid="bizcat-new-prodqty"
            />
          </div>
          <div class="bizcat-add-field">
            <label>商品单价</label>
            <span class="bizcat-prodprice" data-testid="bizcat-new-prodprice">{{ newProductPrice != null ? newProductPrice : '—' }}</span>
          </div>
          <el-button size="small" type="primary" class="bizcat-add-btn" data-testid="bizcat-add-expense" @click="handleAdd">添加</el-button>
        </div>
      </template>

      <!-- ===== 商品分类（product）：沿用卡片列表 ===== -->
      <template v-else>
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
      </template>
    </div>
  </BaseDialog>
</template>

/* 弹框外壳（遮罩/面板/头部/关闭/主体/滚动）已统一到 common/BaseDialog.vue，
   本组件仅保留分类行、配置区、新增表单等内容样式 */
<style scoped>
.bizcat-body {
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

/* product 模式：每个分类项（卡片列表） */
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

/* ===== expense 模式：表格化（2026-10-09，原型 docs/进货商品管理-表格原型.html） ===== */

.bizcat-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bizcat-search {
  width: 180px;
}
.bizcat-toolbar-spacer {
  flex: 1;
}

.bizcat-table {
  width: 100%;
}

/* 名称单元格：输入框 + 内置/隐藏标签同排，标签不参与压缩；
   输入框默认无边框（hover/focus 才显形），与原型一致 */
.bizcat-name-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.bizcat-name-cell > .el-input {
  flex: 1 1 0;
  min-width: 0;
}
.bizcat-name-cell :deep(.el-input__wrapper) {
  box-shadow: none;
  background: transparent;
  padding-left: 4px;
}
.bizcat-name-cell :deep(.el-input__wrapper.is-focus),
.bizcat-name-cell :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--el-input-border-color, var(--el-border-color)) inset;
  background: var(--color-bg-card, #fff);
}
.bizcat-tag-builtin,
.bizcat-tag-hidden {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
}
.bizcat-tag-builtin {
  background: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
}
.bizcat-tag-hidden {
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-muted, #64748b);
}

/* 单元格控件撑满列宽 */
:deep(.bizcat-cell-select),
:deep(.bizcat-cell-number) {
  width: 100%;
}
:deep(.bizcat-cell-number .el-input__inner) {
  text-align: left;
}

.bizcat-ops {
  display: flex;
  gap: 6px;
  justify-content: center;
}

/* 新增行：贴表格底部，与列同一视觉语言 */
.bizcat-add-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 12px;
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  background: var(--color-bg, #f8fafc);
}
.bizcat-add-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bizcat-add-field > label {
  font-size: 11px;
  color: var(--color-text-muted, #64748b);
  white-space: nowrap;
}
.bizcat-add-btn {
  align-self: flex-end;
}
:deep(.bizcat-add-row .el-input),
:deep(.bizcat-add-row .el-select) {
  width: 124px;
}
:deep(.bizcat-add-row .el-input-number) {
  width: 96px;
}

/* 商品单价（派生只读，表格与新增行共用） */
.bizcat-prodprice {
  min-width: 56px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--color-bg-tag, #f1f5f9);
  color: var(--color-text, #111827);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
}
:global(html.dark) .bizcat-prodprice {
  background: var(--color-bg-tag-dark, #1f2937);
  color: var(--color-text, #e5e7eb);
}

:global(html.dark) .bizcat-add-field > label {
  color: var(--color-text-muted, #9ca3af);
}
:global(html.dark) .bizcat-add-row {
  background: var(--color-surface-2, #0f172a);
  border-color: var(--color-border, #334155);
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

/* 暗色模式 */
html.dark .bizcat-hint {
  color: var(--color-text-muted, #9ca3af);
}

/* 移动端（≤768px）：
   - product 卡片列表：行容器允许换行，避免固定 px 控件挤出同行输入框
   - expense 表格：高级列与「单位/单价」列均默认展示（2026-10-11 起移动端与 PC 一致），表格在容器内横向滚动；
     操作列取消固定且只显示「删除」（排序按钮已 v-if 隐藏）；新增行改单列堆叠（一行一列），搜索框占满一行 */
@media (max-width: 768px) {
  .bizcat-row {
    flex-wrap: wrap;
  }

  .bizcat-prodprice {
    min-width: 48px;
  }

  .bizcat-toolbar {
    flex-wrap: wrap;
  }
  .bizcat-search {
    width: 100%;
  }

  /* 新增行：移动端一行一列（每个字段独占一行、控件占满整行）。
     ⚠️ 必须 flex: none —— 否则 .bizcat-add-field 是纵向 flex，
     el-input 上的 flex-basis 会变成「高度」把输入框撑成高块（旧 bug）。 */
  .bizcat-add-row {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
    gap: 10px;
  }
  .bizcat-add-field {
    flex: none;
    width: 100%;
  }
  :deep(.bizcat-add-row .el-input),
  :deep(.bizcat-add-row .el-select),
  :deep(.bizcat-add-row .el-input-number) {
    width: 100%;
    flex: none;
    min-width: 0;
  }
  .bizcat-add-btn {
    flex: none;
    width: 100%;
  }
}
</style>
