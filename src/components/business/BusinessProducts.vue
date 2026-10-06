<script setup lang="ts">
// 商品管理：分类 tabs（全部 + 可见分类）+ 商品卡片网格 + 新增/编辑弹框 + ⚙️ 分类管理
// P1-3：跨模块联动跳转（商品名可点击跳转「库存」页）
// P2-2：商品详情抽屉
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { showConfirm } from '@/utils/dialog'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import {
  BIZ_UNITS,
  avgUnsoldUnitPriceMap,
  calcMarkupRate,
  calcProductSummary,
  findProductCategory,
  formatYuanOf,
  sortProducts,
  visibleProductCategories
} from '@/composables/businessCore'
import { useToast } from '@/composables/useToast'
import { useBizSaving } from '@/composables/useBizSaving'
import type { BusinessProduct } from '@/types'
import Icon from '@/components/Icon.vue'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'

// P1-3：高亮商品 prop + 跨模块导航 emit；autoOpenAdd：Alt+K 快捷动作「新增商品」直达
const props = defineProps<{ highlightId?: string; autoOpenAdd?: boolean }>()
const emit = defineEmits<{ navigate: [section: string, filter?: string] }>()

const store = useWorkbenchBusinessStore()
const toast = useToast()

const activeCat = ref('all')

const tabs = computed(() => visibleProductCategories(store.productCategories))

const filteredProducts = computed(() => {
  const all = sortProducts(store.products)
  if (activeCat.value === 'all') return all
  return all.filter(p => p.categoryId === activeCat.value)
})

// ===== 自适应分页（5 列，rowHeight 估算 200）=====
const listEl = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => filteredProducts.value,
  rowHeight: 200,
  gap: 12,
  containerRef: listEl,
  gridRef: gridEl,
  // 移动端（≤768px）默认分页惰性，这里开启固定每页 6 个卡片
  mobilePageSize: 6
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto, isDesktop, rowsPerPage, colsPerRow } = paging

/** 每页容量：移动端固定 6（mobilePageSize），桌面端 = 实测行数 × 实测列数；未测量时兜底 6。 */
const pageCapacity = computed(() => {
  if (!isDesktop.value) return 6
  const size = rowsPerPage.value * colsPerRow.value
  return size > 0 ? size : 6
})
watch(activeCat, () => goto(1))
watch(filteredProducts, () => nextTick(() => goto(1)))

function catNameOf(categoryId?: string): string {
  if (!categoryId) return '未分类'
  return findProductCategory(store.productCategories, categoryId)?.name ?? '未分类'
}

/** 成本价自动反显：按「未售完」进货批次的单价求简单平均；无未售完批次 → 沿用商品自身成本价 */
const avgPriceMap = computed<Record<string, number>>(() =>
  avgUnsoldUnitPriceMap(store.purchases, store.dailyRecords)
)

/** 卡片/详情展示的成本价：优先自动均价，无均价时回退商品自身成本价（purchasePrice） */
function displayedCostPrice(p: BusinessProduct): number {
  return avgPriceMap.value[p.id] ?? p.purchasePrice
}

/** 当前编辑商品的自动均价（弹框提示用；新增时为空） */
const editingAvgPrice = computed<number | null>(() => {
  if (!editingId.value) return null
  return avgPriceMap.value[editingId.value] ?? null
})

/**
 * 成本价（= 商品销售成本价）：一律只读（新增/编辑都不可输入）。
 * 成本由进货记录的批次单价决定（FIFO 逐批结转），手改会篡改销售成本口径，
 * 因此这里只做展示：编辑时取未售完批次均价（无批次时沿用商品自身值），新增时固定 0；
 * 保存时写入商品 `purchasePrice`（即商品成本价），与进货保存后的回写同口径。
 */
const formCostPrice = computed<string>(() => {
  if (!editingId.value) return '0'
  const p = store.products.find(x => x.id === editingId.value)
  return p ? String(displayedCostPrice(p)) : '0'
})

/** 成本价展示文案：没有进货批次（0）时显示「—」，避免 ¥0.00 被当成真实成本 */
function costPriceText(p: BusinessProduct): string {
  const v = displayedCostPrice(p)
  return v > 0 ? formatYuanOf(v) : '—'
}

/** 当前展示值是否为自动均价（用于「均价」标记与提示文案） */
function isAutoAvg(p: BusinessProduct): boolean {
  return avgPriceMap.value[p.id] !== undefined
}

function avgTip(p: BusinessProduct): string {
  return isAutoAvg(p)
    ? `按未售完进货批次单价自动平均（${formatYuanOf(avgPriceMap.value[p.id])}），不可手动修改`
    : '暂无未售完进货批次；成本价由进货记录自动计算，不可手动修改'
}

// ===== 新增/编辑弹框 =====
const showDialog = ref(false)
// 保存中状态：用于按钮禁用 + loading，防止 await 期间连点重复写入
const { saving, run } = useBizSaving()
const editingId = ref<string | null>(null)
const formName = ref('')
const formCategoryId = ref('')
const formUnit = ref('件')
const formSellingPrice = ref('')
const formMemberPrice = ref('')
const formActive = ref(true)

function numOf(raw: string): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

// ===== 录入校验 =====
/**
 * 是否已在提交后校验过：刚打开表单不飘红，提交时才暴露错误。
 * 原先「校验失败直接置灰保存按钮」没有任何原因说明，用户（尤其新手）
 * 只知道点不动。现改为：按钮不因校验失败禁用，提交时统一拦截 + 提示首个错误，
 * 并在对应字段下方给出行内错误，与「进货/库存/销售」的行内错误口径一致。
 */
const submitAttempted = ref(false)

/** 全部错误（顺序即提示顺序） */
const formErrors = computed(() => {
  const list: string[] = []
  if (formName.value.trim() === '') list.push('请输入商品名称')
  if (!(numOf(formSellingPrice.value) > 0)) list.push('售价须大于 0')
  return list
})
/** 字段级错误：仅在提交尝试后展示，避免空表单刚打开就飘红 */
const nameError = computed(() =>
  submitAttempted.value && formName.value.trim() === '' ? '请输入商品名称' : ''
)
const priceError = computed(() =>
  submitAttempted.value && !(numOf(formSellingPrice.value) > 0) ? '售价须大于 0' : ''
)

const isFormValid = computed(() => formErrors.value.length === 0)

function startAdd(): void {
  editingId.value = null
  formName.value = ''
  formCategoryId.value = ''
  formUnit.value = '件'
  formSellingPrice.value = ''
  formMemberPrice.value = ''
  formActive.value = true
  submitAttempted.value = false
  showDialog.value = true
}

// Alt+K「新增商品」直达：面板挂载即打开新增弹框
onMounted(() => {
  if (props.autoOpenAdd) startAdd()
})

function startEdit(p: BusinessProduct): void {
  editingId.value = p.id
  formName.value = p.name
  formCategoryId.value = p.categoryId ?? ''
  formUnit.value = p.unit
  // 成本价只读展示（formCostPrice 为 computed，自动取未售完批次均价 / 商品自身值）
  formSellingPrice.value = String(p.sellingPrice)
  formMemberPrice.value = typeof p.memberPrice === 'number' ? String(p.memberPrice) : ''
  formActive.value = p.active
  submitAttempted.value = false
  showDialog.value = true
}

async function handleSave(): Promise<void> {
  // 校验失败：暴露行内错误 + 提示首个原因（按钮不再置灰，否则用户无从得知为何不能保存）
  if (!isFormValid.value) {
    submitAttempted.value = true
    toast.error(formErrors.value[0] ?? '请检查表单填写')
    return
  }
  // 编辑态边界：商品可能已被删除（云同步/其它入口删除），而 store.updateProduct 找不到记录时会静默返回，
  // 这里提前拦截并提示，避免「点了保存没反应、以为已成功」。
  if (editingId.value && !store.products.some(p => p.id === editingId.value)) {
    toast.error('商品不存在或已被删除，请刷新后重试')
    return
  }
  const isEditing = editingId.value !== null
  const payload = {
    name: formName.value.trim(),
    categoryId: formCategoryId.value || undefined,
    unit: formUnit.value.trim() || '件',
    purchasePrice: numOf(formCostPrice.value),
    sellingPrice: numOf(formSellingPrice.value),
    // 会员价留空 → null（store 侧移除该字段，表示未设置）
    memberPrice: formMemberPrice.value.trim() === '' ? null : numOf(formMemberPrice.value),
    active: formActive.value
  }
  // store.addProduct/updateProduct 返回 void，失败靠抛异常传播（如 IndexedDB 写入失败），
  // 由 run 统一兜底提示；成功才提示并关闭弹框。
  const ok = await run(async () => {
    if (editingId.value) {
      await store.updateProduct(editingId.value, payload)
    } else {
      await store.addProduct(payload)
    }
  })
  if (!ok) return
  toast.success(isEditing ? '商品已保存' : '商品已添加')
  showDialog.value = false
}

async function handleToggleActive(p: BusinessProduct): Promise<void> {
  await store.updateProduct(p.id, { active: !p.active })
}

async function handleDelete(p: BusinessProduct): Promise<boolean> {
  if (!await showConfirm(`确定要删除商品「${p.name}」吗？`)) return false
  const r = await store.deleteProduct(p.id)
  if (!r.ok) {
    toast.error(r.reason === 'in-use' ? '该商品已有进货或销售记录，无法删除（可改为停售）' : '商品不存在')
    return false
  }
  return true
}

// 编辑弹框内删除：成功后关闭弹框；失败（如已有进货/销售记录）保留弹框看提示
async function handleDeleteCurrent(): Promise<void> {
  const p = store.products.find(x => x.id === editingId.value)
  if (!p) return
  if (await handleDelete(p)) showDialog.value = false
}

// P1-3：高亮商品
function isHighlighted(id: string): boolean {
  return props.highlightId === id
}

/**
 * 高亮目标定位（2026-10-06 补）：原实现只给目标卡片加高亮样式，但目标可能在第 3 页——
 * 用户从销售流水点商品名跳过来时「完全看不到高亮」（见优化方案 M-11）。
 * 这里在 highlightId 变化时：先切到目标商品所属分类 tab → 翻到它所在页 → 滚动并居中。
 */
function revealHighlighted(): void {
  const id = props.highlightId
  if (!id) return
  const target = store.products.find(p => p.id === id)
  if (!target) return

  // 目标不在当前分类 tab：先切过去（切 tab 的 watch 会 goto(1) 并再次触发本函数定位）
  const targetCat = target.categoryId ?? 'all'
  if (activeCat.value !== targetCat && tabs.value.some(c => c.id === targetCat)) {
    activeCat.value = targetCat
    return
  }

  const idx = filteredProducts.value.findIndex(p => p.id === id)
  if (idx < 0) return

  // 用 pageCapacity（而非当前页length——末页会偏小）定位目标所在页；已在一屏内则不翻页
  if (totalPages.value > 1) {
    const wantPage = Math.floor(idx / pageCapacity.value) + 1
    if (wantPage !== currentPage.value) {
      goto(wantPage)
      return // 翻页后由下面的 watch(pageItems) 继续完成滚动
    }
  }

  scrollHighlightIntoView(id)
}

function scrollHighlightIntoView(id: string): void {
  nextTick(() => {
    const el = document.querySelector<HTMLElement>(`[data-bizprod-id="${id}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}

watch(() => props.highlightId, () => nextTick(() => revealHighlighted()))
// 切分类 / 翻页后若目标已在当前页可见，补一次滚动居中
watch(activeCat, () => nextTick(() => revealHighlighted()))
watch(pageItems, () => nextTick(() => revealHighlighted()))

// ===== P2-2：商品详情抽屉 =====
const showDrawer = ref(false)
const drawerProductId = ref<string | null>(null)

const data = computed(() => ({
  productCategories: store.productCategories,
  expenseCategories: store.expenseCategories,
  products: store.products,
  purchases: store.purchases,
  dailyRecords: store.dailyRecords,
  expenseDailies: store.expenseDailies,
  settings: store.settings
}))

const drawerSummary = computed(() => {
  if (!drawerProductId.value) return null
  return calcProductSummary(data.value, drawerProductId.value)
})

function openDetail(p: BusinessProduct): void {
  drawerProductId.value = p.id
  showDrawer.value = true
}

function closeDrawer(): void {
  showDrawer.value = false
  drawerProductId.value = null
}

/** 抽屉内加价率 */
function drawerMarkupRate(): number | null {
  if (!drawerSummary.value?.product) return null
  return calcMarkupRate(drawerSummary.value.product.sellingPrice, drawerSummary.value.product.purchasePrice)
}
</script>

<template>
  <div class="bizprod">
    <!-- 分类 tabs + 新增/分类管理 -->
    <div class="bizprod-bar">
      <div class="bizprod-tabs">
        <el-radio-group v-model="activeCat">
          <el-radio-button value="all" data-testid="bizprod-cat-all">全部</el-radio-button>
          <el-radio-button
            v-for="cat in tabs"
            :key="cat.id"
            :value="cat.id"
            :data-testid="`bizprod-cat-${cat.id}`"
          >{{ cat.name }}</el-radio-button>
        </el-radio-group>
      </div>
      <el-button type="primary" data-testid="bizprod-add" @click="startAdd">＋ 新增商品</el-button>
    </div>

    <!-- 商品网格 -->
    <div v-if="filteredProducts.length === 0" class="bizprod-empty" data-testid="bizprod-empty">
      暂无商品，点击右上角「新增商品」添加
    </div>
    <div v-else ref="listEl" class="bizprod-list" :class="{ 'bizprod-list-scroll': !fitsOnePage }">
      <div ref="gridEl" class="bizprod-grid">
      <div
        v-for="p in pageItems"
        :key="p.id"
        class="bizprod-card"
        :class="{ inactive: !p.active, highlighted: isHighlighted(p.id) }"
        :data-testid="`bizprod-card-${p.id}`"
        :data-bizprod-id="p.id"
        role="button"
        tabindex="0"
        :title="`点击编辑「${p.name}」`"
        @click="startEdit(p)"
        @keydown.enter.prevent="startEdit(p)"
      >
        <div class="bizprod-head">
          <span class="bizprod-name" @click.stop="emit('navigate', 'purchases', p.id)">{{ p.name }}</span>
          <span class="bizprod-cat">{{ catNameOf(p.categoryId) }}</span>
        </div>
        <div class="bizprod-prices">
          <span
            class="bizprod-price buy"
            :data-testid="`bizprod-price-buy-${p.id}`"
            :title="avgTip(p)"
          >
            成本 {{ costPriceText(p) }}/{{ p.unit }}
            <span v-if="isAutoAvg(p)" class="bizprod-price-auto" :data-testid="`bizprod-price-auto-${p.id}`">均价</span>
          </span>
          <span class="bizprod-price sell">售价 {{ formatYuanOf(p.sellingPrice) }}/{{ p.unit }}</span>
          <span
            v-if="typeof p.memberPrice === 'number'"
            class="bizprod-price member"
            :data-testid="`bizprod-price-member-${p.id}`"
          >会员 {{ formatYuanOf(p.memberPrice) }}/{{ p.unit }}</span>
        </div>
        <div class="bizprod-foot" @click.stop>
          <el-checkbox
            class="bizprod-active"
            :title="p.active ? '点击停售' : '点击恢复在售'"
            :checked="p.active"
            :data-testid="`bizprod-active-${p.id}`"
            @change="handleToggleActive(p)"
          >{{ p.active ? '在售' : '停售' }}</el-checkbox>
          <div class="bizprod-actions">
            <el-button size="small" :data-testid="`bizprod-detail-${p.id}`" @click="openDetail(p)">详情</el-button>
          </div>
        </div>
      </div>
      </div>
      <PanelPager
        v-if="totalPages > 1"
        :page="currentPage"
        :total="totalPages"
        data-testid="panel-pager"
        @prev="prev()"
        @next="next()"
      />
    </div>

    <!-- 新增/编辑弹框 -->
    <el-dialog
      v-if="showDialog"
      :model-value="true"
      width="480px"
      :title="editingId ? '编辑商品' : '新增商品'"
      data-testid="bizprod-dialog"
      @close="showDialog = false"
    >
      <form class="biz-dialog-body" @submit.prevent="handleSave">
        <div class="biz-field">
          <label>名称<span class="req">*</span></label>
          <el-input v-model="formName" maxlength="40" data-testid="bizprod-form-name" />
          <span v-if="nameError" class="bizprod-field-error" data-testid="bizprod-error-name">{{ nameError }}</span>
        </div>
        <div class="biz-field">
          <label>分类</label>
          <el-select v-model="formCategoryId" data-testid="bizprod-form-category">
            <el-option value="" label="未分类" />
            <el-option v-for="cat in store.productCategories" :key="cat.id" :value="cat.id" :label="cat.name" />
          </el-select>
        </div>
        <div class="biz-form-row">
          <div class="biz-field">
            <label>单位</label>
            <!-- 与「新增支出」的单位一致：预设下拉 + 支持自定义输入 -->
            <el-select
              v-model="formUnit"
              size="small"
              class="bizprod-form-unit"
              data-testid="bizprod-form-unit"
              placeholder="选择或输入单位"
              filterable
              allow-create
              default-first-option
            >
              <el-option v-for="u in BIZ_UNITS" :key="u" :value="u" :label="u" />
            </el-select>
          </div>
          <div class="biz-field">
            <label>成本价（自动·由进货记录计算）</label>
            <el-input-number
              size="small"
              :min="0"
              :step="0.01"
              :precision="2"
              disabled
              :model-value="Number(formCostPrice)"
              data-testid="bizprod-form-purchase"
            />
          </div>
          <div class="biz-field">
            <label>售价<span class="req">*</span></label>
            <el-input-number
              size="small"
              :min="0"
              :step="0.01"
              :model-value="formSellingPrice === '' ? undefined : Number(formSellingPrice)"
              @update:model-value="formSellingPrice = String($event ?? '')"
              data-testid="bizprod-form-selling"
            />
            <span v-if="priceError" class="bizprod-field-error" data-testid="bizprod-error-price">{{ priceError }}</span>
          </div>
          <div class="biz-field">
            <label>会员价</label>
            <el-input-number
              size="small"
              :min="0"
              :step="0.01"
              :precision="2"
              :model-value="formMemberPrice === '' ? undefined : Number(formMemberPrice)"
              @update:model-value="formMemberPrice = String($event ?? '')"
              data-testid="bizprod-form-member"
            />
          </div>
        </div>
        <p class="bizprod-form-hint" data-testid="bizprod-form-member-hint">会员价可选，留空表示未设置（仅作记录与展示，不参与营业额自动合计）。</p>
        <!-- 成本价只读：由进货记录（未售完批次）自动计算，禁止手输以免篡改销售成本 -->
        <p class="bizprod-form-hint" data-testid="bizprod-form-purchase-hint">
          成本价 = 商品销售成本价，由进货记录自动计算（未售完批次均价），不可手动输入；要改成本请改「库存」里的进货进价。
        </p>
        <div v-if="!editingId" class="bizprod-form-avg" data-testid="bizprod-form-avg-new">
          新增商品暂无进货记录，成本价先按 0 记录；录入进货后自动取批次均价。
        </div>
        <div v-else-if="editingAvgPrice !== null" class="bizprod-form-avg" data-testid="bizprod-form-avg">
          已按未售完进货批次均价自动计算：{{ formatYuanOf(editingAvgPrice) }}
        </div>
        <div class="biz-field">
          <el-checkbox v-model="formActive" data-testid="bizprod-form-active">上架在售</el-checkbox>
        </div>
        <div class="biz-form-actions">
          <el-button @click="showDialog = false">取消</el-button>
          <!-- M-17：保存按钮按校验结果置灰（此前只绑 :disabled="saving"，提交时才toast 报错，
             与销售/进货/支出三个面板的交互风格不一致） -->
          <el-button
            type="primary"
            native-type="submit"
            :disabled="!isFormValid || saving"
            :loading="saving"
            data-testid="bizprod-save"
          >
            {{ editingId ? '保存' : '添加' }}
          </el-button>
          <el-button v-if="editingId" type="danger" data-testid="bizprod-dialog-del" @click="handleDeleteCurrent">删除</el-button>
        </div>
      </form>
    </el-dialog>

    <!-- 商品分类管理已迁移到「设置 → 销售记账 → 基础设置」 -->

    <!-- P2-2：商品详情抽屉 -->
    <el-drawer
      v-if="showDrawer && drawerSummary"
      :model-value="true"
      size="380px"
      direction="rtl"
      title="商品详情"
      data-testid="bizprod-drawer"
      @close="closeDrawer"
    >
      <div class="bizprod-drawer-body" v-if="drawerSummary.product">
        <!-- 基础信息 -->
        <div class="bizprod-drawer-section">
          <div class="bizprod-drawer-info-row">
            <span class="bizprod-drawer-label">商品名</span>
            <span class="bizprod-drawer-value">{{ drawerSummary.product.name }}</span>
          </div>
          <div class="bizprod-drawer-info-row">
            <span class="bizprod-drawer-label">分类</span>
            <span class="bizprod-drawer-value">{{ catNameOf(drawerSummary.product.categoryId) }}</span>
          </div>
          <div class="bizprod-drawer-info-row">
            <span class="bizprod-drawer-label">状态</span>
            <span class="bizprod-drawer-value" :class="{ 'status-active': drawerSummary.product.active, 'status-inactive': !drawerSummary.product.active }">
              {{ drawerSummary.product.active ? '在售' : '停售' }}
            </span>
          </div>
          <div class="bizprod-drawer-info-row">
            <span class="bizprod-drawer-label">成本/售价</span>
            <span class="bizprod-drawer-value">
              {{ costPriceText(drawerSummary.product) }} → {{ formatYuanOf(drawerSummary.product.sellingPrice) }}
              <span class="bizprod-drawer-markup" :class="{ 'rate-high': (drawerMarkupRate() ?? 0) > 0, 'rate-low': (drawerMarkupRate() ?? 0) <= 0 }">
                加价率 {{ drawerMarkupRate() ?? '—' }}%
              </span>
            </span>
          </div>
          <div class="bizprod-drawer-info-row">
            <span class="bizprod-drawer-label">会员价</span>
            <span class="bizprod-drawer-value" data-testid="bizprod-drawer-member">
              {{ typeof drawerSummary.product.memberPrice === 'number' ? formatYuanOf(drawerSummary.product.memberPrice) : '未设置' }}
            </span>
          </div>
          <div class="bizprod-drawer-info-row">
            <span class="bizprod-drawer-label">成本价来源</span>
            <span class="bizprod-drawer-value" data-testid="bizprod-drawer-avg">
              {{ isAutoAvg(drawerSummary.product) ? '未售完批次均价 ' + formatYuanOf(avgPriceMap[drawerSummary.product.id]) : '暂无未售完批次（录入进货后自动计算）' }}
            </span>
          </div>
        </div>

        <!-- 经营数据 -->
        <div class="bizprod-drawer-section">
          <div class="bizprod-drawer-section-title"><Icon name="stats" :size="15" /> 经营数据</div>
          <div class="bizprod-drawer-stats">
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">总进货</span>
              <span class="bizprod-drawer-stat-value">{{ drawerSummary.totalPurchased }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">总带出</span>
              <span class="bizprod-drawer-stat-value">{{ drawerSummary.totalBroughtOut }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">总售出</span>
              <span class="bizprod-drawer-stat-value">{{ drawerSummary.totalSold }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">总损耗</span>
              <span class="bizprod-drawer-stat-value">{{ drawerSummary.totalLoss }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">当前库存</span>
              <span class="bizprod-drawer-stat-value">{{ drawerSummary.currentStock }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">累计营业额</span>
              <span class="bizprod-drawer-stat-value">{{ formatYuanOf(drawerSummary.totalRevenue) }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">累计成本</span>
              <span class="bizprod-drawer-stat-value">{{ formatYuanOf(drawerSummary.totalCost) }}</span>
            </div>
            <div class="bizprod-drawer-stat">
              <span class="bizprod-drawer-stat-label">累计利润</span>
              <span class="bizprod-drawer-stat-value" :class="{ negative: drawerSummary.totalProfit < 0 }">{{ formatYuanOf(drawerSummary.totalProfit) }}</span>
            </div>
          </div>
        </div>

        <!-- 进货记录（最近 5 笔） -->
        <div class="bizprod-drawer-section">
          <div class="bizprod-drawer-section-title"><Icon name="purchases" :size="15" /> 进货记录（最近 5 笔）</div>
          <p v-if="drawerSummary.recentPurchases.length === 0" class="bizprod-drawer-empty">暂无进货记录</p>
          <div v-else class="bizprod-drawer-records">
            <div
              v-for="pur in drawerSummary.recentPurchases"
              :key="pur.id"
              class="bizprod-drawer-record"
              @click="emit('navigate', 'purchases', drawerSummary.product!.id)"
            >
              <span class="bizprod-drawer-record-date">{{ pur.date }}</span>
              <span class="bizprod-drawer-record-detail">×{{ pur.quantity }} @{{ formatYuanOf(pur.unitPrice) }}</span>
              <span class="bizprod-drawer-record-total">{{ formatYuanOf(pur.total) }}</span>
            </div>
          </div>
        </div>

        <!-- 销售记录（最近 5 笔） -->
        <div class="bizprod-drawer-section">
          <div class="bizprod-drawer-section-title"><Icon name="daily" :size="15" /> 销售记录（最近 5 笔）</div>
          <p v-if="drawerSummary.recentDailyRecords.length === 0" class="bizprod-drawer-empty">暂无销售记录</p>
          <div v-else class="bizprod-drawer-records">
            <div
              v-for="rec in drawerSummary.recentDailyRecords"
              :key="rec.id"
              class="bizprod-drawer-record"
              @click="emit('navigate', 'daily')"
            >
              <span class="bizprod-drawer-record-date">{{ rec.date }}</span>
              <span class="bizprod-drawer-record-detail">营业额 {{ formatYuanOf(rec.totalRevenue) }}</span>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.bizprod {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
}

.bizprod-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}
@media (max-width: 768px) {
  .bizprod { min-height: 0; }
  .bizprod-list { flex: none; overflow: visible; }
}

.bizprod-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bizprod-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 分类 tabs 药丸样式（el-radio-button 覆写，对齐原 .bizprod-tab） */
.bizprod-tabs :deep(.el-radio-group) {
  flex-wrap: wrap;
  gap: 8px;
}

.bizprod-tabs :deep(.el-radio-button + .el-radio-button) {
  margin-left: 0;
}

.bizprod-tabs :deep(.el-radio-button__inner) {
  padding: 7px 14px;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-full, 999px);
  box-shadow: none;
  transition: all var(--transition-fast, 0.15s ease);
}

.bizprod-tabs :deep(.el-radio-button__inner:hover) {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.bizprod-tabs :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
  color: #fff;
  box-shadow: none;
}

.bizprod-empty {
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-muted, var(--color-text-muted));
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

.bizprod-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
}

.bizprod-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: border-color var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease);
}

.bizprod-card:hover {
  border-color: var(--color-primary, var(--color-primary));
  box-shadow: var(--shadow-card-hover, 0 4px 12px rgba(0, 0, 0, 0.12));
  transform: translateY(-2px);
}

.bizprod-card:focus-visible {
  outline: none;
  border-color: var(--color-primary, var(--color-primary));
  box-shadow: 0 0 0 3px var(--color-focus-ring, rgba(59, 130, 246, 0.35));
}

.bizprod-card.inactive {
  opacity: 0.6;
}

.bizprod-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bizprod-name {
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizprod-cat {
  flex-shrink: 0;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}

.bizprod-prices {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.bizprod-price {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizprod-price.sell {
  color: var(--color-success, var(--color-success));
  font-weight: 600;
}

/* 会员价 */
.bizprod-price.member {
  color: var(--color-warning, #f59e0b);
  font-weight: 600;
}

/* 进货价自动反显标记（未售完批次均价） */
.bizprod-price-auto {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: var(--radius-full, 999px);
  font-size: 11px;
  font-weight: 400;
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
}

.bizprod-form-hint {
  margin: -4px 0 0;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
}

/* 字段级校验错误（提交尝试后展示）：红色说明「为什么不能保存」 */
.bizprod-field-error {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-error, #ef4444);
  line-height: 1.4;
}

.bizprod-form-avg {
  padding: 8px 10px;
  border-radius: var(--radius-sm, 6px);
  font-size: 12px;
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
  font-variant-numeric: tabular-nums;
}

.bizprod-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.bizprod-active {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  margin-right: 0;
}

.bizprod-active :deep(.el-checkbox__label) {
  padding-left: 0;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.bizprod-actions {
  display: flex;
  gap: 6px;
}

/* 弹框：骨架样式（body/field/form-row/actions/.req）见全局 src/styles/biz-dialog.css
   本弹框沿用 el-dialog 自带标题栏与内边距，故 body 不再重复加 padding */
.biz-dialog-body {
  padding: 0;
}

/* el-* 表单控件撑满字段 */
.bizprod :deep(.el-input-number) {
  width: 100%;
}
.bizprod-form-unit {
  width: 100%;
}

/* el-dialog 外壳对齐原弹框 */
.bizprod :deep(.el-dialog) {
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.bizprod :deep(.el-dialog__header) {
  flex-shrink: 0;
}

.bizprod :deep(.el-dialog__body) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

html.dark .bizprod-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .bizprod-name {
  color: var(--color-text, #f9fafb);
}

html.dark .bizprod-price-auto {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
}

html.dark .bizprod-form-avg {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.15);
}

@media (max-width: 640px) {
  .bizprod-grid {
    grid-template-columns: 1fr;
  }
}

/* P1-3：高亮商品 */
.bizprod-card.highlighted {
  border-color: var(--color-primary, var(--color-primary));
  box-shadow: 0 0 0 2px var(--color-primary, var(--color-primary));
}

.bizprod-name {
  cursor: pointer;
}

.bizprod-name:hover {
  color: var(--color-primary, var(--color-primary));
  text-decoration: underline;
}

/* P2-2：商品详情抽屉 */
.bizprod-drawer-body {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bizprod-drawer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bizprod-drawer-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
}

.bizprod-drawer-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.bizprod-drawer-label {
  color: var(--color-text-muted, var(--color-text-muted));
  flex-shrink: 0;
}

.bizprod-drawer-value {
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.bizprod-drawer-markup.rate-high {
  color: var(--color-success, var(--color-success));
  font-size: 12px;
}

.bizprod-drawer-markup.rate-low {
  color: var(--color-error, var(--color-error));
  font-size: 12px;
}

.bizprod-drawer-value.status-active {
  color: var(--color-success, var(--color-success));
}

.bizprod-drawer-value.status-inactive {
  color: var(--color-text-muted, var(--color-text-muted));
}

.bizprod-drawer-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.bizprod-drawer-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-sm, 6px);
}

.bizprod-drawer-stat-label {
  font-size: 11px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.bizprod-drawer-stat-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.bizprod-drawer-stat-value.negative {
  color: var(--color-error, var(--color-error));
}

.bizprod-drawer-empty {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.bizprod-drawer-records {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bizprod-drawer-record {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: background 0.15s ease;
  font-variant-numeric: tabular-nums;
}

.bizprod-drawer-record:hover {
  background: var(--color-bg-card, var(--color-bg-card));
}

.bizprod-drawer-record-date {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

.bizprod-drawer-record-detail {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bizprod-drawer-record-total {
  flex-shrink: 0;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
}

/* el-drawer 外壳对齐原抽屉 */
.bizprod :deep(.el-drawer__header) {
  margin-bottom: 0;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
}

html.dark .bizprod-drawer-stat {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .bizprod-drawer-record {
  background-color: var(--color-bg-card, #1f2937);
}
</style>
