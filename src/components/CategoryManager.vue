<script setup lang="ts">
import Icon from './Icon.vue'
import BaseDialog from './common/BaseDialog.vue'
import IconPickerDialog from './IconPickerDialog.vue'
import { ref, computed } from 'vue'
import { useCategoriesStore } from '../stores/categories'
import { useSitesStore } from '../stores/sites'
import { isImageIcon } from '../composables/categoryIcon'
import { useToast } from '../composables/useToast'
import { showConfirm } from '@/utils/dialog'

/** embedded = true：作为常驻面板内嵌在设置页（无遮罩、无自带标题栏、不响应 ESC 与遮罩点击关闭） */
withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const emit = defineEmits<{
  close: []
  /** 新增分类成功时回传新分类 id（供调用方自动选中，可选监听） */
  added: [id: string]
}>()

/** 面板尺寸：沿用「设置 → 弹窗尺寸」写入的 CSS 变量（category），未配置时回退默认值 */
const PANEL_WIDTH = 'var(--dlg-w-category, 900px)'
const PANEL_MAX_HEIGHT = 'var(--dlg-h-category, 80vh)'

const categoriesStore = useCategoriesStore()
const sitesStore = useSitesStore()
const toast = useToast()

const newCategoryName = ref('')
const newCategoryIcon = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')
const editingIcon = ref('')

// ========================================
// 分类图标：统一从「图标管理」的图标库选择（IconPickerDialog），不再使用 emoji 输入与快速选择列表
// 三种入口：新增表单（new）/ 编辑表单（edit）/ 列表项直接改（item，选中即写回该分类并持久化）
// ========================================
type IconPickerMode = 'new' | 'edit' | 'item'
const iconPicker = ref<{ mode: IconPickerMode; id: string | null } | null>(null)

const iconPickerTitle = computed(() => {
  if (!iconPicker.value) return '选择分类图标'
  return iconPicker.value.mode === 'new' ? '新分类 · 选择图标' : '分类 · 选择图标'
})

/** 弹框里高亮"当前图标"：新增/编辑取表单值，列表项取该分类已存的值 */
const iconPickerCurrent = computed(() => {
  const p = iconPicker.value
  if (!p) return ''
  if (p.mode === 'new') return newCategoryIcon.value
  if (p.mode === 'edit') return editingIcon.value
  const cat = categoriesStore.allCategories.find(c => c.id === p.id)
  return cat?.icon ?? ''
})

function openIconPicker(mode: IconPickerMode, id: string | null = null): void {
  iconPicker.value = { mode, id }
}

function closeIconPicker(): void {
  iconPicker.value = null
}

/** 选中即回填：回传空串 = 清除图标（恢复默认） */
function onPickIcon(src: string): void {
  const p = iconPicker.value
  closeIconPicker()
  if (!p) return
  if (p.mode === 'new') {
    newCategoryIcon.value = src
    return
  }
  if (p.mode === 'edit') {
    editingIcon.value = src
    return
  }
  // 列表项：直接写回该分类并持久化
  if (!p.id) return
  categoriesStore.updateCategory(p.id, { icon: src })
}

// 获取使用某分类的网站数量
function getSiteCount(categoryId: string): number {
  return sitesStore.sites.filter(s => s.category === categoryId).length
}

// 导出该分类下的网站：复用「备份恢复 → 导出」的同一套生成/打包逻辑（仅站点范围不同）。
// 分类名做按钮级防抖，避免连点重复触发下载。
const exportingCatId = ref<string>('')
async function handleExportCategory(cat: { id: string; name: string }): Promise<void> {
  if (exportingCatId.value) return
  const count = getSiteCount(cat.id)
  if (count === 0) {
    toast.info(`「${cat.name}」下暂无网站，无可导出内容`)
    return
  }
  exportingCatId.value = cat.id
  try {
    const n = await sitesStore.exportByCategory(cat.id, cat.name)
    toast.success(`已导出「${cat.name}」${n} 个网站`)
  } catch (e) {
    console.error('[CategoryManager] 导出分类网站失败:', e)
    toast.error('导出失败，请稍后重试')
  } finally {
    exportingCatId.value = ''
  }
}

// 添加分类
function handleAdd() {
  if (!newCategoryName.value.trim()) return

  const id = categoriesStore.addCategory(newCategoryName.value.trim(), newCategoryIcon.value)
  newCategoryName.value = ''
  newCategoryIcon.value = ''
  emit('added', id)
}

// 开始编辑
function startEdit(cat: { id: string; name: string; icon: string }) {
  editingId.value = cat.id
  editingName.value = cat.name
  editingIcon.value = cat.icon
}

// 取消编辑
function cancelEdit() {
  editingId.value = null
  editingName.value = ''
  editingIcon.value = ''
}

// 保存编辑
function saveEdit() {
  if (!editingId.value || !editingName.value.trim()) return
  
  categoriesStore.updateCategory(editingId.value, {
    name: editingName.value.trim(),
    icon: editingIcon.value
  })
  cancelEdit()
}

// 删除分类：不可撤销（分类下站点会被迁到「未分类」），与删除站点一致先走统一确认框
async function handleDelete(categoryId: string) {
  const siteCount = getSiteCount(categoryId)
  const name = categoriesStore.allCategories.find(c => c.id === categoryId)?.name ?? '该分类'
  const ok = await showConfirm(
    siteCount > 0
      ? `删除分类「${name}」？该分类下的 ${siteCount} 个站点会被移到「未分类」，站点本身不会删除。`
      : `删除分类「${name}」？该分类下还没有站点。`,
    '删除分类'
  )
  if (!ok) return

  const target = categoriesStore.deleteCategory(categoryId)

  // 迁移网站到 'other' 分类
  if (siteCount > 0) {
    sitesStore.migrateSitesToCategory(categoryId, target)
  }
}

// 移动分类
function handleMove(categoryId: string, direction: 'up' | 'down') {
  categoriesStore.moveCategory(categoryId, direction)
}

// 预定义分类
const builtInCategories = computed(() => 
  categoriesStore.allCategories.filter(c => c.isBuiltIn)
)

// 自定义分类 (已排序)
const sortedCustomCategories = computed(() => 
  [...categoriesStore.customCategories].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
)
</script>

<template>
  <Transition name="dialog">
    <BaseDialog
      title="分类管理"
      :width="PANEL_WIDTH"
      :max-height="PANEL_MAX_HEIGHT"
      :embedded="embedded"
      :hide-header="embedded"
      :close-on-overlay="!embedded"
      @close="emit('close')"
    >
      <!-- 添加新分类 -->
      <div class="add-form">
        <h3>添加分类</h3>
        <div class="add-form-row">
          <!-- 分类图标：点击从图标管理（图标库）选择，选中后回填；未选时显示占位 -->
          <button
            type="button"
            class="cat-icon-btn"
            :class="{ 'is-empty': !newCategoryIcon }"
            title="从图标管理选择分类图标"
            data-testid="cat-new-icon-btn"
            @click="openIconPicker('new')"
          >
            <img v-if="isImageIcon(newCategoryIcon)" :src="newCategoryIcon" alt="" class="cat-icon-img" />
            <span v-else-if="newCategoryIcon" class="cat-icon-emoji">{{ newCategoryIcon }}</span>
            <Icon v-else name="image" />
          </button>
          <input
            v-model="newCategoryName"
            type="text"
            class="name-input"
            placeholder="分类名称"
            @keyup.enter="handleAdd"
          />
          <button class="btn-add" @click="handleAdd" :disabled="!newCategoryName.trim()">
            添加
          </button>
        </div>
      </div>

      <!-- 分类列表 -->
      <div class="category-list">
        <h3>分类排序</h3>

        <!-- 预定义分类 -->
        <div class="list-section">
          <div class="section-title">固定分类（不可删除）</div>
          <div
            v-for="cat in builtInCategories"
            :key="cat.id"
            class="category-item built-in"
          >
            <span class="sort-hint"><Icon name="lock" /></span>
            <span class="category-icon">
              <img v-if="isImageIcon(cat.icon)" :src="cat.icon" alt="" class="cat-icon-img" />
              <template v-else>{{ cat.icon }}</template>
            </span>
            <span class="category-name">{{ cat.name }}</span>
            <span class="site-count">({{ getSiteCount(cat.id) }})</span>
            <button
              class="btn-icon"
              :disabled="getSiteCount(cat.id) === 0 || !!exportingCatId"
              :title="getSiteCount(cat.id) === 0 ? '该分类下暂无网站' : `导出「${cat.name}」分类的网站`"
              :data-testid="`cat-export-${cat.id}`"
              @click="handleExportCategory(cat)"
            >导出</button>
          </div>
        </div>

        <!-- 自定义分类 -->
        <div class="list-section">
          <div class="section-title">自定义分类（可拖拽排序）</div>
          <div
            v-for="cat in sortedCustomCategories"
            :key="cat.id"
            class="category-item custom"
          >
            <template v-if="editingId === cat.id">
              <button
                type="button"
                class="cat-icon-btn"
                :class="{ 'is-empty': !editingIcon }"
                title="从图标管理选择分类图标"
                data-testid="cat-edit-icon-btn"
                @click="openIconPicker('edit')"
              >
                <img v-if="isImageIcon(editingIcon)" :src="editingIcon" alt="" class="cat-icon-img" />
                <span v-else-if="editingIcon" class="cat-icon-emoji">{{ editingIcon }}</span>
                <Icon v-else name="image" />
              </button>
              <input
                v-model="editingName"
                type="text"
                class="edit-input name-input"
                @keyup.enter="saveEdit"
                @keyup.escape="cancelEdit"
              />
              <button class="btn-icon" @click="saveEdit"><Icon name="check" /></button>
              <button class="btn-icon" @click="cancelEdit"><Icon name="close" /></button>
            </template>
            <template v-else>
              <div class="sort-controls">
                <button
                  class="btn-sort"
                  @click="handleMove(cat.id, 'up')"
                  :disabled="!categoriesStore.canMove(cat.id, 'up')"
                  title="上移"
                >↑</button>
                <button
                  class="btn-sort"
                  @click="handleMove(cat.id, 'down')"
                  :disabled="!categoriesStore.canMove(cat.id, 'down')"
                  title="下移"
                >↓</button>
              </div>
              <button
                type="button"
                class="cat-icon-btn"
                :class="{ 'is-empty': !cat.icon }"
                title="点击从图标管理更换图标"
                :data-testid="`cat-item-icon-${cat.id}`"
                @click="openIconPicker('item', cat.id)"
              >
                <img v-if="isImageIcon(cat.icon)" :src="cat.icon" alt="" class="cat-icon-img" />
                <span v-else-if="cat.icon" class="cat-icon-emoji">{{ cat.icon }}</span>
                <Icon v-else name="image" />
              </button>
              <span class="category-name">{{ cat.name }}</span>
              <span class="site-count">({{ getSiteCount(cat.id) }})</span>
              <button
                class="btn-icon"
                :disabled="getSiteCount(cat.id) === 0 || !!exportingCatId"
                :title="getSiteCount(cat.id) === 0 ? '该分类下暂无网站' : `导出「${cat.name}」分类的网站`"
                :data-testid="`cat-export-${cat.id}`"
                @click="handleExportCategory(cat)"
              >导出</button>
              <button class="btn-icon" title="编辑分类" :data-testid="`cat-edit-${cat.id}`" @click="startEdit(cat)">编辑</button>
              <button class="btn-icon delete" title="删除分类" :data-testid="`cat-delete-${cat.id}`" @click="handleDelete(cat.id)">删除</button>
            </template>
          </div>
        </div>

        <div v-if="sortedCustomCategories.length === 0" class="empty-custom">
          暂无自定义分类
        </div>
      </div>
    </BaseDialog>
  </Transition>

  <!-- 分类图标选择弹框：从图标管理（图标库）选择，选中即回填；取消/关闭不改原值。
       必须放在 <Transition> 之外（Transition 只接受单个子元素），也放在表单之外避免回车误提交 -->
  <IconPickerDialog
    v-if="iconPicker"
    :title="iconPickerTitle"
    :current="iconPickerCurrent"
    @select="onPickIcon"
    @close="closeIconPicker"
  />
</template>

<style scoped>
/* 弹框外壳（遮罩/面板/头部/关闭/主体）与 embedded 内嵌模式布局
   已统一到 common/BaseDialog.vue（embedded + hide-header + close-on-overlay=false），
   本组件仅保留分类列表、添加表单、图标按钮等内容样式 */

.add-form {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #f1f5f9;
}

.add-form h3,
.category-list h3 {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  margin: 0 0 12px 0;
}

.add-form-row {
  display: flex;
  gap: 8px;
}

/* 分类图标按钮：点击弹出图标管理（图标库）选择；图片类图标用 <img>，旧 emoji 仍按文本显示 */
.cat-icon-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 3px;
  background-color: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.2s, background-color 0.2s;
}

.cat-icon-btn:hover {
  border-color: var(--color-primary);
  background-color: var(--color-bg-hover);
}

/* 未设置图标时以浅色占位提示可点击 */
.cat-icon-btn.is-empty {
  color: var(--color-text-muted, #94a3b8);
}

.cat-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 4px;
}

.cat-icon-emoji {
  font-size: 18px;
  line-height: 1;
}

/* 分类名输入框：对齐全局 .ui-input（36px 高 / 8px 圆角 / 同款焦点环）。
   原来只有 flex:1，没有任何外观样式，落到浏览器原生输入框（直角 + 13.33px 字） */
.name-input {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  min-height: 36px;
  padding: 0 var(--space-3, 12px);
  color: var(--color-text);
  background-color: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-sm, 13px);
  transition:
    border-color var(--motion-duration, 220ms) var(--motion-ease, ease),
    box-shadow var(--motion-duration, 220ms) var(--motion-ease, ease);
}

.name-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ring, rgba(59, 130, 246, 0.35));
}

.btn-add {
  white-space: nowrap;
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

.btn-add:hover:not(:disabled) {
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

.btn-add:disabled {
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

.category-list {
  /* empty */
}

.list-section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 8px;
}

/* 内置分类：不可编辑/删除。仅锁图标淡化表示"只读"，
   整行不再压低透明度——内置分类现在带可用的「导出」按钮，压暗会影响可用性感知。 */
.category-item.built-in {
  background: #fef3c7;
}

.category-item.custom {
  background: #fff;
  border: 1px solid #e2e8f0;
}

.sort-hint {
  font-size: 12px;
  width: 24px;
  /* 内置分类的"只读"提示：淡化锁图标 */
  opacity: 0.5;
}

.sort-controls {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* 上/下移排序：原 20×16 + 10px 字，低于 24px 的可点区域下限；放大到 24×24 并走 token */
.btn-sort {
  width: 24px;
  height: 24px;
  padding: 0;
  background: var(--color-bg-hover, #f1f5f9);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  font-size: 11px;
  color: var(--color-text-secondary, #64748b);
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-sort:hover:not(:disabled) {
  background: var(--color-bg-active, #e2e8f0);
  color: var(--color-primary);
}

.btn-sort:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.category-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  font-size: 18px;
  overflow: hidden;
}

.category-name {
  flex: 1;
  font-size: 14px;
  color: #1e293b;
}

.site-count {
  font-size: 12px;
  color: #94a3b8;
  margin-right: 8px;
}

.edit-input {
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 14px;
}

.edit-input.icon-input {
  width: 40px;
  text-align: center;
}

.edit-input.name-input {
  flex: 1;
}

/* 操作栏文字按钮（导出/编辑/删除）：小号文字 + 轻边框，hover 时边框与文字加深。
   尺寸对齐全局 .ui-btn--sm（30px 高 / 8px 圆角 / 12px 字） */
.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 var(--space-2, 8px);
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  font-size: var(--font-size-xs, 12px);
  line-height: 1;
  color: var(--color-text-secondary, #475569);
  opacity: 0.75;
  transition: opacity 0.2s, border-color 0.2s, color 0.2s, background-color 0.2s;
}

.btn-icon:hover:not(:disabled) {
  opacity: 1;
  border-color: var(--color-border, #cbd5e1);
  color: var(--color-text, #0f172a);
}

/* 删除：常态即用警示色，避免误点 */
.btn-icon.delete {
  color: var(--color-error, #dc2626);
}

/* 禁用态（如分类下无网站可导出）：不可点且视觉更淡，避免误以为能导出 */
.btn-icon:disabled {
  cursor: not-allowed;
  opacity: 0.25;
}

.empty-custom {
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
  padding: 20px;
}
</style>
