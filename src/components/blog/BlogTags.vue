<script setup lang="ts">
/**
 * 博客标签管理（后台）
 *
 * 三个动作语义各不相同，界面上明确区分避免误操作：
 *   - 改名：只改显示名（slug 不变，历史地址不受影响）
 *   - 合并：把来源标签的文章引用迁移到目标标签后删除来源（等价「去重」）
 *   - 删除：只摘掉引用，文章本身不动
 */
import { computed, ref } from 'vue'
import { useBlogStore } from '@/stores/blog'
import Icon from '@/components/Icon.vue'
import { showConfirm, toastAlert } from '@/utils/dialog'

const store = useBlogStore()

const newName = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')
const mergeSource = ref<string | null>(null)
const mergeTarget = ref('')

const sorted = computed(() =>
  [...store.tags].sort((a, b) => countOf(b.id) - countOf(a.id) || a.name.localeCompare(b.name, 'zh-Hans-CN'))
)

function countOf(id: string): number {
  return store.activeArticles.filter(a => a.tagIds.includes(id)).length
}

async function handleAdd(): Promise<void> {
  const res = await store.addTag(newName.value)
  if (!res.ok) {
    toastAlert(res.reason ?? '新增失败', 'error')
    return
  }
  newName.value = ''
  toastAlert('标签已新增', 'success')
}

function startEdit(id: string): void {
  const target = store.tags.find(t => t.id === id)
  if (!target) return
  editingId.value = id
  editingName.value = target.name
}

async function submitEdit(): Promise<void> {
  if (!editingId.value) return
  const res = await store.renameTag(editingId.value, editingName.value)
  if (!res.ok) {
    toastAlert(res.reason ?? '保存失败', 'error')
    return
  }
  editingId.value = null
  toastAlert('标签已更新', 'success')
}

function openMerge(id: string): void {
  mergeSource.value = id
  mergeTarget.value = ''
}

async function submitMerge(): Promise<void> {
  if (!mergeSource.value) return
  if (!mergeTarget.value) {
    toastAlert('请选择要合并到的目标标签', 'warning')
    return
  }
  const source = store.tags.find(t => t.id === mergeSource.value)
  const target = store.tags.find(t => t.id === mergeTarget.value)
  if (!source || !target) return
  if (!await showConfirm(`「${source.name}」的文章引用将全部改为「${target.name}」，来源标签随后删除。`, '合并标签')) return
  const res = await store.mergeTags(source.id, target.id)
  if (!res.ok) {
    toastAlert(res.reason ?? '合并失败', 'error')
    return
  }
  toastAlert(`已合并，影响 ${res.affectedArticles ?? 0} 篇文章`, 'success')
  mergeSource.value = null
}

async function handleRemove(id: string): Promise<void> {
  const target = store.tags.find(t => t.id === id)
  if (!target) return
  const n = countOf(id)
  if (!await showConfirm(
    n > 0 ? `确定删除标签「${target.name}」？${n} 篇文章会移除该标签，文章本身不会被删除。` : `确定删除标签「${target.name}」？`,
    '删除标签'
  )) return
  const res = await store.removeTag(id)
  if (!res.ok) {
    toastAlert(res.reason ?? '删除失败', 'error')
    return
  }
  toastAlert('标签已删除', 'success')
}
</script>

<template>
  <section class="bt">
    <header class="bt-head">
      <div class="bt-add">
        <el-input
          v-model="newName"
          size="small"
          class="bt-input"
          placeholder="标签名称（最多 20 字）"
          maxlength="20"
          data-testid="blog-tag-name"
          @keyup.enter="handleAdd"
        />
        <el-button type="primary" size="small" data-testid="blog-tag-add" @click="handleAdd">
          <Icon name="plus" :size="14" />
          <span>新增标签</span>
        </el-button>
      </div>
      <p class="bt-hint">标签扁平、无层级。「合并」用于去重：把被合并标签的引用迁移到目标标签。</p>
    </header>

    <div v-if="sorted.length === 0" class="bt-empty" data-testid="blog-tag-empty">
      还没有标签。写文章时打上标签，读者可以更方便地按主题浏览。
    </div>

    <ul v-else class="bt-list">
      <li v-for="tag in sorted" :key="tag.id" class="bt-item">
        <div class="bt-row">
          <span class="bt-name">#{{ tag.name }}</span>
          <code class="bt-slug">/{{ tag.slug }}</code>
          <span class="bt-count">{{ countOf(tag.id) }} 篇</span>
          <div class="bt-ops">
            <button type="button" class="bt-mini" @click="startEdit(tag.id)">改名</button>
            <button type="button" class="bt-mini" @click="openMerge(tag.id)">合并到…</button>
            <button type="button" class="bt-mini is-danger" @click="handleRemove(tag.id)">删除</button>
          </div>
        </div>

        <div v-if="editingId === tag.id" class="bt-panel">
          <el-input v-model="editingName" size="small" maxlength="20" placeholder="标签名称" />
          <div class="bt-panel-ops">
            <button type="button" class="ui-btn ui-btn--sm" @click="editingId = null">取消</button>
            <button type="button" class="ui-btn ui-btn--sm ui-btn--primary" @click="submitEdit">保存</button>
          </div>
        </div>

        <div v-if="mergeSource === tag.id" class="bt-panel">
          <select v-model="mergeTarget" class="bt-select" aria-label="合并目标标签">
            <option value="">选择目标标签…</option>
            <option v-for="t in store.tags" :key="t.id" :value="t.id" :disabled="t.id === tag.id">
              {{ t.name }}
            </option>
          </select>
          <div class="bt-panel-ops">
            <button type="button" class="ui-btn ui-btn--sm" @click="mergeSource = null">取消</button>
            <button type="button" class="ui-btn ui-btn--sm ui-btn--primary" @click="submitMerge">合并</button>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.bt { display: flex; flex-direction: column; gap: 12px; }

.bt-head { display: flex; flex-direction: column; gap: 6px; }

.bt-add { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.bt-input { width: 240px; max-width: 100%; }

.bt-hint { margin: 0; color: var(--color-text-muted, #94a3b8); font-size: var(--font-size-xs, 12px); }

.bt-empty {
  padding: 28px 16px;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  text-align: center;
}

.bt-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; }

.bt-item {
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
}

.bt-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 30px; }

.bt-name { color: var(--color-text, #0f172a); font-size: var(--font-size-sm, 14px); font-weight: var(--font-weight-medium, 500); }

.bt-slug { color: var(--color-text-muted, #94a3b8); font-size: var(--font-size-xs, 11px); }

.bt-count { color: var(--color-text-secondary, #64748b); font-size: var(--font-size-xs, 12px); }

.bt-ops { display: flex; gap: 4px; margin-left: auto; flex-wrap: wrap; }

.bt-mini {
  padding: 2px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 11px);
  cursor: pointer;
}

.bt-mini:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.bt-mini.is-danger:hover { border-color: var(--color-error, #ef4444); color: var(--color-error, #ef4444); }

.bt-panel {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border, #e2e8f0);
}

.bt-select {
  flex: 1 1 140px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-input, #ffffff);
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-xs, 12px);
}

.bt-panel-ops { display: flex; gap: 6px; margin-left: auto; }

@media (max-width: 768px) {
  .bt-input { width: 100%; }
  .bt-list { grid-template-columns: 1fr; }
  .bt-mini { min-height: 30px; padding: 2px 10px; }
}
</style>
