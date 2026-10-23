<script setup lang="ts">
import Icon from './Icon.vue'
import BaseDialog from './common/BaseDialog.vue'
import { ref, computed } from 'vue'
import { useDiaryCategoriesStore } from '../stores/diaryCategories'
import { useWorkbenchDiaryStore } from '../stores/workbenchDiary'

const diaryCatStore = useDiaryCategoriesStore()
const diaryStore = useWorkbenchDiaryStore()

const newCategoryName = ref('')
const newCategoryIcon = ref('📝')
const editingId = ref<string | null>(null)
const editingName = ref('')
const editingIcon = ref('')

const defaultIcons = ['📝', '💼', '🏠', '✈️', '📚', '🏥', '📁', '🌟', '💡', '🚀', '🎯', '📌', '🏷️', '🎨', '🎵', '🌈', '☕', '🌙', '🔥', '🌿']

// 获取使用某分类的日记篇数
function getEntryCount(categoryId: string): number {
  return diaryStore.activeEntries.filter(e => e.category === categoryId).length
}

// 添加分类
function handleAdd() {
  if (!newCategoryName.value.trim()) return
  diaryCatStore.addCategory(newCategoryName.value.trim(), newCategoryIcon.value)
  newCategoryName.value = ''
  newCategoryIcon.value = '📝'
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
  diaryCatStore.updateCategory(editingId.value, {
    name: editingName.value.trim(),
    icon: editingIcon.value
  })
  cancelEdit()
}

// 删除分类（先清理该分类下的日记引用）
function handleDelete(categoryId: string) {
  diaryStore.clearCategory(categoryId)
  diaryCatStore.deleteCategory(categoryId)
}

// 移动分类
function handleMove(categoryId: string, direction: 'up' | 'down') {
  diaryCatStore.moveCategory(categoryId, direction)
}

// 预定义分类
const builtInCategories = computed(() =>
  diaryCatStore.allCategories.filter(c => c.isBuiltIn)
)

// 自定义分类 (已排序)
const sortedCustomCategories = computed(() =>
  [...diaryCatStore.customCategories].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
)
</script>

<template>
  <!-- 常驻内嵌面板（无遮罩、无关闭按钮）：标题降级为正文区标题，外壳走 BaseDialog embedded -->
  <BaseDialog embedded hide-header>
    <h2 class="dm-title">日记分类管理</h2>

    <!-- 添加新分类 -->
    <div class="dm-add-form">
      <h3>添加分类</h3>
      <div class="dm-add-row">
        <input
          v-model="newCategoryIcon"
          type="text"
          class="dm-icon-input"
          placeholder="图标"
          maxlength="2"
        />
        <input
          v-model="newCategoryName"
          type="text"
          class="dm-name-input"
          placeholder="分类名称"
          @keyup.enter="handleAdd"
        />
        <button class="dm-btn-add" @click="handleAdd" :disabled="!newCategoryName.trim()">
          添加
        </button>
      </div>
      <div class="dm-icon-suggestions">
        <span class="dm-icon-label">快速选择:</span>
        <button
          v-for="icon in defaultIcons"
          :key="icon"
          class="dm-icon-btn"
          :class="{ active: newCategoryIcon === icon }"
          @click="newCategoryIcon = icon"
        >
          {{ icon }}
        </button>
      </div>
    </div>

    <!-- 分类列表 -->
    <div class="dm-list">
      <h3>分类排序</h3>

      <!-- 预定义分类 -->
      <div class="dm-section">
        <div class="dm-section-title">固定分类（不可删除）</div>
        <div
          v-for="cat in builtInCategories"
          :key="cat.id"
          class="dm-item built-in"
        >
          <span class="dm-sort-hint"><Icon name="lock" /></span>
          <span class="dm-cat-icon">{{ cat.icon }}</span>
          <span class="dm-cat-name">{{ cat.name }}</span>
          <span class="dm-count">({{ getEntryCount(cat.id) }})</span>
        </div>
      </div>

      <!-- 自定义分类 -->
      <div class="dm-section">
        <div class="dm-section-title">自定义分类（可排序 / 删除）</div>
        <div
          v-for="cat in sortedCustomCategories"
          :key="cat.id"
          class="dm-item custom"
        >
          <template v-if="editingId === cat.id">
            <input
              v-model="editingIcon"
              type="text"
              class="dm-edit-icon"
              maxlength="2"
            />
            <input
              v-model="editingName"
              type="text"
              class="dm-edit-name"
              @keyup.enter="saveEdit"
              @keyup.escape="cancelEdit"
            />
            <button class="dm-btn-icon" @click="saveEdit"><Icon name="check" /></button>
            <button class="dm-btn-icon" @click="cancelEdit"><Icon name="close" /></button>
          </template>
          <template v-else>
            <div class="dm-sort-controls">
              <button
                class="dm-btn-sort"
                @click="handleMove(cat.id, 'up')"
                :disabled="!diaryCatStore.canMove(cat.id, 'up')"
                title="上移"
              >↑</button>
              <button
                class="dm-btn-sort"
                @click="handleMove(cat.id, 'down')"
                :disabled="!diaryCatStore.canMove(cat.id, 'down')"
                title="下移"
              >↓</button>
            </div>
            <span class="dm-cat-icon">{{ cat.icon }}</span>
            <span class="dm-cat-name">{{ cat.name }}</span>
            <span class="dm-count">({{ getEntryCount(cat.id) }})</span>
            <button class="dm-btn-icon" @click="startEdit(cat)"><Icon name="pencil" /></button>
            <button class="dm-btn-icon delete" @click="handleDelete(cat.id)"><Icon name="trash" /></button>
          </template>
        </div>
      </div>

      <div v-if="sortedCustomCategories.length === 0" class="dm-empty">
        暂无自定义分类
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
/* 弹框外壳（遮罩/面板/头部/关闭/主体/移动端适配）已统一到 common/BaseDialog.vue，
   本组件仅保留分类列表、添加表单等内容样式 */

/* 内嵌面板无自带头部，标题作为正文区首行 */
.dm-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  margin: 0 0 20px 0;
}

.dm-add-form {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.dm-add-form h3,
.dm-list h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
  margin: 0 0 12px 0;
}

.dm-add-row {
  display: flex;
  gap: 8px;
}

.dm-icon-input {
  width: 48px;
  text-align: center;
  font-size: 18px;
  padding: 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-bg, #fff);
  color: var(--color-text, #1e293b);
}

.dm-name-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-bg, #fff);
  color: var(--color-text, #1e293b);
}

.dm-btn-add {
  white-space: nowrap;
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

.dm-btn-add:hover:not(:disabled) {
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

.dm-btn-add:disabled {
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}

.dm-icon-suggestions {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.dm-icon-label {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
}

.dm-icon-btn {
  padding: 4px 8px;
  background: var(--color-bg-hover, #f1f5f9);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.dm-icon-btn:hover,
.dm-icon-btn.active {
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.dm-section {
  margin-bottom: 16px;
}

.dm-section-title {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  margin-bottom: 8px;
}

.dm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-bg-hover, #f8fafc);
  border-radius: var(--radius-sm, 4px);
  margin-bottom: 8px;
}

.dm-item.built-in {
  opacity: 0.65;
  background: color-mix(in srgb, var(--color-primary, #3b82f6) 8%, transparent);
}

.dm-item.custom {
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
}

.dm-sort-hint {
  font-size: 12px;
  width: 24px;
  color: var(--color-text-muted, #94a3b8);
}

.dm-sort-controls {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dm-btn-sort {
  width: 20px;
  height: 16px;
  padding: 0;
  background: var(--color-bg-hover, #f1f5f9);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  font-size: 10px;
  color: var(--color-text-secondary, #64748b);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dm-btn-sort:hover:not(:disabled) {
  background: var(--color-border, #e2e8f0);
  color: var(--color-primary, #3b82f6);
}

.dm-btn-sort:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.dm-cat-icon {
  font-size: 18px;
}

.dm-cat-name {
  flex: 1;
  font-size: 14px;
  color: var(--color-text, #1e293b);
}

.dm-count {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  margin-right: 8px;
}

.dm-edit-icon {
  width: 40px;
  text-align: center;
  padding: 6px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-bg, #fff);
  color: var(--color-text, #1e293b);
}

.dm-edit-name {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-bg, #fff);
  color: var(--color-text, #1e293b);
}

.dm-btn-icon {
  padding: 4px 8px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.6;
  transition: opacity 0.2s;
  color: var(--color-text-secondary, #64748b);
  display: inline-flex;
}

.dm-btn-icon:hover {
  opacity: 1;
}

.dm-btn-icon.delete:hover {
  color: var(--color-error, #ef4444);
}

.dm-empty {
  text-align: center;
  color: var(--color-text-muted, #94a3b8);
  font-size: 14px;
  padding: 20px;
}

/* ===== 移动端适配 =====
   该组件此前完全没有 @media 规则（全文仅一处固定 max-width:720px），窄屏下：
   排序按钮仅 20×16px，是全项目最小触控目标。 */
@media (max-width: 768px) {
  /* 新增行换行：图标 + 名称 + 按钮在 375px 下不再把输入框压到不可用宽度 */
  .dm-add-row {
    flex-wrap: wrap;
  }

  /* 列表项允许换行，避免名称与操作区互相挤压 */
  .dm-item {
    flex-wrap: wrap;
    row-gap: 8px;
  }

  /* 排序按钮放大到可点（原 20×16px 几乎无法命中），并改为横向排列便于点击 */
  .dm-sort-controls {
    flex-direction: row;
    gap: 6px;
  }
  .dm-btn-sort {
    width: 32px;
    height: 28px;
    font-size: 12px;
  }

  /* 编辑/删除按钮触控目标 44px（原约 22px，误删风险高） */
  .dm-btn-icon {
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
  }
}
</style>
