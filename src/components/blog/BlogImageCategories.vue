<script setup lang="ts">
/**
 * 图库分类管理（后台「博客设置 → 图库设置」）
 *
 * 与「分类管理」（BlogCategories.vue）保持同款交互与视觉：
 * 顶部新增输入 + 列表行（名称 / 计数 / 上移下移 / 重命名 / 删除）+ 空态 + 行内编辑。
 *
 * 差异（有意简化）：
 * - 图库分类是**扁平一级**，没有父子层级与 slug（不参与前台路由，仅用于后台筛选与批量归类）。
 * - 删除分类时**图片不会被删除**，只把 categoryId 置空回落到「未分类」（store.removeImageCategory）。
 *
 * 排序用 order 字段，上移/下移只交换相邻两项的 order 值。
 */
import { computed, ref } from 'vue'
import { useBlogStore } from '@/stores/blog'
import Icon from '@/components/Icon.vue'
import { showConfirm, toastAlert } from '@/utils/dialog'

const store = useBlogStore()

const newName = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')

/** 按 order 排好序的分类列表 */
const list = computed(() => store.sortedImageCategories)

function countOf(id: string): number {
  return store.imageCategoryCounts.get(id) ?? 0
}

async function handleAdd(): Promise<void> {
  const res = await store.addImageCategory(newName.value)
  if (!res.ok) {
    toastAlert(res.reason ?? '新增失败', 'error')
    return
  }
  newName.value = ''
  toastAlert('分类已新增', 'success')
}

function startEdit(id: string): void {
  const target = store.imageCategories.find(c => c.id === id)
  if (!target) return
  editingId.value = id
  editingName.value = target.name
}

async function submitEdit(): Promise<void> {
  if (!editingId.value) return
  const res = await store.renameImageCategory(editingId.value, editingName.value)
  if (!res.ok) {
    toastAlert(res.reason ?? '保存失败', 'error')
    return
  }
  editingId.value = null
  toastAlert('分类已更新', 'success')
}

async function handleRemove(id: string): Promise<void> {
  const target = store.imageCategories.find(c => c.id === id)
  if (!target) return
  const n = countOf(id)
  const extra = n > 0 ? `其中 ${n} 张图片会转为「未分类」（不会被删除）` : ''
  if (!await showConfirm(`确定删除分类「${target.name}」？${extra}。`, '删除分类')) return
  const res = await store.removeImageCategory(id)
  if (!res.ok) {
    toastAlert(res.reason ?? '删除失败', 'error')
    return
  }
  toastAlert(
    res.detachedImages > 0
      ? `分类已删除，${res.detachedImages} 张图片已转为「未分类」`
      : '分类已删除',
    'success'
  )
}

async function handleMove(id: string, delta: number): Promise<void> {
  await store.moveImageCategory(id, delta)
}
</script>

<template>
  <section class="bic">
    <header class="bic-head">
      <div class="bic-add">
        <el-input
          v-model="newName"
          size="small"
          class="bic-input"
          placeholder="分类名称（最多 30 字）"
          maxlength="30"
          data-testid="blog-image-category-name"
          @keyup.enter="handleAdd()"
        />
        <el-button type="primary" size="small" data-testid="blog-image-category-add" @click="handleAdd()">
          <Icon name="plus" :size="14" />
          <span>新增分类</span>
        </el-button>
      </div>
      <p class="bic-hint">
        分类仅用于后台图库的筛选与批量归类，不影响前台展示。删除分类不会删除图片，图片会回到「未分类」。
      </p>
    </header>

    <div v-if="list.length === 0" class="bic-empty" data-testid="blog-image-category-empty">
      还没有图库分类。可以先建几个，例如「封面图」「正文配图」「教程截图」。
    </div>

    <ul v-else class="bic-list">
      <li v-for="cat in list" :key="cat.id" class="bic-item">
        <div class="bic-row">
          <span class="bic-name">{{ cat.name }}</span>
          <span class="bic-count" :title="`${countOf(cat.id)} 张图片`">{{ countOf(cat.id) }} 张</span>
          <div class="bic-ops">
            <button
              type="button"
              class="bic-mini"
              title="上移"
              :data-testid="`blog-image-category-up-${cat.id}`"
              @click="handleMove(cat.id, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              class="bic-mini"
              title="下移"
              :data-testid="`blog-image-category-down-${cat.id}`"
              @click="handleMove(cat.id, 1)"
            >
              ↓
            </button>
            <button
              type="button"
              class="bic-mini"
              :data-testid="`blog-image-category-edit-${cat.id}`"
              @click="startEdit(cat.id)"
            >
              重命名
            </button>
            <button
              type="button"
              class="bic-mini is-danger"
              :data-testid="`blog-image-category-remove-${cat.id}`"
              @click="handleRemove(cat.id)"
            >
              删除
            </button>
          </div>
        </div>

        <div v-if="editingId === cat.id" class="bic-edit">
          <el-input
            v-model="editingName"
            size="small"
            maxlength="30"
            placeholder="分类名称"
            :data-testid="`blog-image-category-rename-input-${cat.id}`"
            @keyup.enter="submitEdit"
          />
          <div class="bic-edit-ops">
            <button type="button" class="ui-btn ui-btn--sm" @click="editingId = null">取消</button>
            <button
              type="button"
              class="ui-btn ui-btn--sm ui-btn--primary"
              :data-testid="`blog-image-category-rename-save-${cat.id}`"
              @click="submitEdit"
            >
              保存
            </button>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.bic { display: flex; flex-direction: column; gap: 12px; }

.bic-head { display: flex; flex-direction: column; gap: 6px; }

.bic-add { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.bic-input { width: 240px; max-width: 100%; }

.bic-hint { margin: 0; color: var(--color-text-muted, #94a3b8); font-size: var(--font-size-xs, 12px); }

.bic-empty {
  padding: 28px 16px;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  text-align: center;
}

.bic-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }

.bic-item {
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
}

.bic-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 32px;
}

.bic-name {
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-sm, 14px);
  font-weight: var(--font-weight-medium, 500);
}

.bic-count { color: var(--color-text-secondary, #64748b); font-size: var(--font-size-xs, 12px); }

.bic-ops { display: flex; gap: 4px; margin-left: auto; flex-wrap: wrap; }

.bic-mini {
  padding: 2px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 11px);
  cursor: pointer;
}

.bic-mini:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.bic-mini.is-danger:hover { border-color: var(--color-error, #ef4444); color: var(--color-error, #ef4444); }

.bic-edit {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border, #e2e8f0);
}

.bic-edit :deep(.el-input) { max-width: 220px; }
.bic-edit-ops { display: flex; gap: 6px; margin-left: auto; }

@media (max-width: 768px) {
  .bic-input { width: 100%; }
  .bic-mini { min-height: 30px; padding: 2px 10px; }
}
</style>
