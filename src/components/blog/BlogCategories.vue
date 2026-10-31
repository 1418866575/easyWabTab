<script setup lang="ts">
/**
 * 博客分类管理（后台）
 *
 * 规则与 blogCore / store 一致：最多两级、同级不重名、删除时文章**绝不级联删除**（转未分类）、
 * 子分类自动提升为顶级。order 字段控制同级排序，上移/下移只交换 order 值。
 */
import { computed, ref } from 'vue'
import { useBlogStore } from '@/stores/blog'
import Icon from '@/components/Icon.vue'
import { showConfirm, toastAlert } from '@/utils/dialog'

const store = useBlogStore()

const newName = ref('')
const addingChildOf = ref<string | null>(null)
const editingId = ref<string | null>(null)
const editingName = ref('')
const editingDesc = ref('')
const editingIcon = ref('')

const roots = computed(() =>
  store.categories
    .filter(c => !c.parentId)
    .sort((a, b) => a.order - b.order)
)

function childrenOf(parentId: string) {
  return store.categories
    .filter(c => c.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

function countOf(id: string): number {
  return store.activeArticles.filter(a => a.categoryId === id).length
}

async function handleAdd(parentId?: string): Promise<void> {
  const res = await store.addCategory(newName.value, parentId)
  if (!res.ok) {
    toastAlert(res.reason ?? '新增失败', 'error')
    return
  }
  newName.value = ''
  addingChildOf.value = null
  toastAlert('分类已新增', 'success')
}

function startEdit(id: string): void {
  const target = store.categories.find(c => c.id === id)
  if (!target) return
  editingId.value = id
  editingName.value = target.name
  editingDesc.value = target.description ?? ''
  editingIcon.value = target.icon ?? ''
}

async function submitEdit(): Promise<void> {
  if (!editingId.value) return
  const renameRes = await store.renameCategory(editingId.value, editingName.value)
  if (!renameRes.ok) {
    toastAlert(renameRes.reason ?? '保存失败', 'error')
    return
  }
  await store.updateCategoryDescription(editingId.value, editingDesc.value.trim())
  await store.updateCategoryIcon(editingId.value, editingIcon.value.trim())
  editingId.value = null
  toastAlert('分类已更新', 'success')
}

async function handleRemove(id: string): Promise<void> {
  const target = store.categories.find(c => c.id === id)
  if (!target) return
  const n = countOf(id)
  const childCount = childrenOf(id).length
  const extra = [
    n > 0 ? `其中 ${n} 篇文章会转为「未分类」（不会被删除）` : '',
    childCount > 0 ? `其 ${childCount} 个子分类会提升为顶级分类` : ''
  ].filter(Boolean).join('；')
  if (!await showConfirm(`确定删除分类「${target.name}」？${extra}。`, '删除分类')) return
  const res = await store.removeCategory(id)
  if (!res.ok) {
    toastAlert(res.reason ?? '删除失败', 'error')
    return
  }
  toastAlert('分类已删除', 'success')
}

async function handleMove(id: string, delta: number): Promise<void> {
  await store.moveCategory(id, delta)
}
</script>

<template>
  <section class="bc">
    <header class="bc-page">
      <h2 class="bc-page-title">分类管理</h2>
      <p class="bc-page-sub">分类最多两级。删除分类不会删除文章，文章会回到「未分类」。</p>
    </header>

    <header class="bc-head">
      <div class="bc-add">
        <el-input
          v-model="newName"
          size="small"
          class="bc-input"
          placeholder="分类名称（最多 30 字）"
          maxlength="30"
          data-testid="blog-category-name"
          @keyup.enter="handleAdd()"
        />
        <el-button type="primary" size="small" data-testid="blog-category-add" @click="handleAdd()">
          <Icon name="plus" :size="14" />
          <span>新增顶级分类</span>
        </el-button>
      </div>
    </header>

    <div v-if="roots.length === 0" class="bc-empty" data-testid="blog-category-empty">
      还没有分类。可以先建几个一级分类，例如「随笔」「技术」。
    </div>

    <ul v-else class="bc-list">
      <li v-for="root in roots" :key="root.id" class="bc-item">
        <div class="bc-row">
          <span v-if="root.icon" class="bc-icon" aria-hidden="true">{{ root.icon }}</span>
          <span class="bc-name">{{ root.name }}</span>
          <code class="bc-slug">/{{ root.slug }}</code>
          <span class="bc-count" :title="`${countOf(root.id)} 篇文章`">{{ countOf(root.id) }} 篇</span>
          <div class="bc-ops">
            <button type="button" class="bc-mini" title="上移" @click="handleMove(root.id, -1)">↑</button>
            <button type="button" class="bc-mini" title="下移" @click="handleMove(root.id, 1)">↓</button>
            <button type="button" class="bc-mini" @click="startEdit(root.id)">编辑</button>
            <button type="button" class="bc-mini" @click="addingChildOf = root.id">＋子分类</button>
            <button type="button" class="bc-mini is-danger" @click="handleRemove(root.id)">删除</button>
          </div>
        </div>

        <p v-if="root.description && editingId !== root.id" class="bc-desc">{{ root.description }}</p>

        <div v-if="editingId === root.id" class="bc-edit">
          <el-input v-model="editingIcon" size="small" maxlength="4" class="bc-icon-input" placeholder="图标" />
          <el-input v-model="editingName" size="small" maxlength="30" placeholder="分类名称" />
          <el-input v-model="editingDesc" size="small" placeholder="描述（可选）" />
          <div class="bc-edit-ops">
            <button type="button" class="ui-btn ui-btn--sm" @click="editingId = null">取消</button>
            <button type="button" class="ui-btn ui-btn--sm ui-btn--primary" @click="submitEdit">保存</button>
          </div>
        </div>

        <div v-if="addingChildOf === root.id" class="bc-add-child">
          <el-input
            v-model="newName"
            size="small"
            maxlength="30"
            placeholder="子分类名称"
            @keyup.enter="handleAdd(root.id)"
          />
          <button type="button" class="ui-btn ui-btn--sm" @click="addingChildOf = null">取消</button>
          <button type="button" class="ui-btn ui-btn--sm ui-btn--primary" @click="handleAdd(root.id)">确定</button>
        </div>

        <ul v-if="childrenOf(root.id).length" class="bc-children">
          <li v-for="child in childrenOf(root.id)" :key="child.id" class="bc-row is-child">
            <span v-if="child.icon" class="bc-icon" aria-hidden="true">{{ child.icon }}</span>
            <span class="bc-name">{{ child.name }}</span>
            <code class="bc-slug">/{{ child.slug }}</code>
            <span class="bc-count">{{ countOf(child.id) }} 篇</span>
            <div class="bc-ops">
              <button type="button" class="bc-mini" title="上移" @click="handleMove(child.id, -1)">↑</button>
              <button type="button" class="bc-mini" title="下移" @click="handleMove(child.id, 1)">↓</button>
              <button type="button" class="bc-mini" @click="startEdit(child.id)">编辑</button>
              <button type="button" class="bc-mini is-danger" @click="handleRemove(child.id)">删除</button>
            </div>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.bc { display: flex; flex-direction: column; gap: 12px; }

.bc-head { display: flex; flex-direction: column; gap: 6px; }

.bc-add { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.bc-input { width: 240px; max-width: 100%; }

.bc-page { display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px; }
.bc-page-title { margin: 0; font-size: var(--ds-fs-section, 16px); font-weight: var(--font-weight-semibold, 600); color: var(--ds-text, #1f2329); }
.bc-page-sub { margin: 0; font-size: var(--ds-fs-body-sm, 13px); color: var(--ds-text-3, #9aa0a6); }

.bc-empty {
  padding: 28px 16px;
  border: 1px dashed var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-card, 12px);
  background-color: var(--ds-card, #ffffff);
  color: var(--ds-text-2, #646a73);
  font-size: var(--font-size-sm, 13px);
  text-align: center;
}

.bc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }

.bc-item {
  padding: 12px 14px;
  border: 1px solid var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-card, 12px);
  background-color: var(--ds-card, #ffffff);
  transition: border-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    box-shadow var(--motion-duration, 0.2s) var(--motion-ease, ease);
}
.bc-item:hover {
  border-color: var(--ds-primary, #2563eb);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
}

.bc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 32px;
}

.bc-row.is-child {
  padding: 6px 0 6px 18px;
  border-top: 1px dashed var(--ds-line, #ececf0);
}

.bc-name { color: var(--ds-text, #1f2329); font-size: var(--font-size-sm, 14px); font-weight: var(--font-weight-medium, 500); }

/* 分类图标（emoji）：列表内联展示 + 编辑框窄宽度 */
.bc-icon { font-size: var(--font-size-sm, 14px); line-height: 1; }
.bc-edit :deep(.el-input.bc-icon-input) { max-width: 90px; }

.bc-slug { color: var(--ds-text-3, #9aa0a6); font-size: var(--font-size-xs, 11px); }

.bc-count { color: var(--ds-text-2, #646a73); font-size: var(--font-size-xs, 12px); }

.bc-ops { display: flex; gap: 4px; margin-left: auto; flex-wrap: wrap; }

.bc-mini {
  padding: 2px 8px;
  border: 1px solid var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-pill, 999px);
  background-color: var(--ds-card, #ffffff);
  color: var(--ds-text-2, #646a73);
  font-size: var(--font-size-xs, 11px);
  cursor: pointer;
}

.bc-mini:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.bc-mini.is-danger:hover { border-color: var(--color-error, #ef4444); color: var(--color-error, #ef4444); }

.bc-desc { margin: 4px 0 0; color: var(--ds-text-3, #9aa0a6); font-size: var(--font-size-xs, 12px); }

.bc-edit,
.bc-add-child {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--ds-line, #ececf0);
}

.bc-edit :deep(.el-input) { max-width: 220px; }
.bc-edit-ops { display: flex; gap: 6px; margin-left: auto; }

.bc-children { list-style: none; margin: 8px 0 0; padding: 0; }

@media (max-width: 768px) {
  .bc-input { width: 100%; }
  .bc-mini { min-height: 30px; padding: 2px 10px; }
}
</style>
