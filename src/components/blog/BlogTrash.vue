<script setup lang="ts">
/**
 * 博客回收站（后台）
 *
 * 软删除的文章在这里统一管理：可恢复到删除前的状态，或彻底删除（不可撤销）。
 * 彻底删除只移除文章记录本身，不改任何分类/标签数据。
 */
import { computed } from 'vue'
import { useBlogStore } from '@/stores/blog'
import { ARTICLE_STATUS_LABELS, formatDateTime, relativeTime } from '@/composables/blogCore'
import type { ArticleStatus } from '@/types'
import { showConfirm, toastAlert } from '@/utils/dialog'

const emit = defineEmits<{ restore: [] }>()

const store = useBlogStore()

const items = computed(() =>
  [...store.trashedArticles].sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
)

async function handleRestore(id: string): Promise<void> {
  const ok = await store.restoreArticle(id)
  if (!ok) {
    toastAlert('恢复失败：文章不存在', 'error')
    return
  }
  toastAlert('已恢复到文章列表', 'success')
  emit('restore')
}

async function handlePurge(id: string, title: string): Promise<void> {
  const label = title || '无标题'
  if (!await showConfirm(`彻底删除《${label}》？此操作不可撤销，云端也会同步删除。`, '彻底删除')) return
  const ok = await store.purgeArticle(id)
  if (!ok) {
    toastAlert('删除失败：文章不存在', 'error')
    return
  }
  toastAlert('已彻底删除', 'success')
}

async function handleEmpty(): Promise<void> {
  if (items.value.length === 0) return
  if (!await showConfirm(`回收站共 ${items.value.length} 篇，确定全部彻底删除？此操作不可撤销。`, '清空回收站')) return
  for (const item of items.value) {
    await store.purgeArticle(item.id)
  }
  toastAlert('回收站已清空', 'success')
}
</script>

<template>
  <section class="br">
    <header class="br-head">
      <p class="br-hint">
        这里是被删除的文章。{{ items.length > 0 ? `共 ${items.length} 篇，恢复后会回到删除前的状态。` : '' }}
      </p>
      <button
        type="button"
        class="ui-btn ui-btn--sm ui-btn--danger"
        :disabled="items.length === 0"
        data-testid="blog-trash-empty"
        @click="handleEmpty"
      >
        清空回收站
      </button>
    </header>

    <div v-if="items.length === 0" class="br-empty" data-testid="blog-trash-none">回收站是空的</div>

    <ul v-else class="br-list">
      <li v-for="item in items" :key="item.id" class="br-item" :data-testid="`blog-trash-${item.id}`">
        <div class="br-info">
          <span class="br-title">{{ item.title || '（无标题）' }}</span>
          <span class="br-meta">
            <span class="br-status">{{ ARTICLE_STATUS_LABELS[item.status as ArticleStatus] }}</span>
            <span>· 删除于 {{ formatDateTime(item.deletedAt) }}（{{ relativeTime(item.deletedAt) }}）</span>
          </span>
        </div>
        <div class="br-ops">
          <button type="button" class="ui-btn ui-btn--sm" @click="handleRestore(item.id)">恢复</button>
          <button type="button" class="ui-btn ui-btn--sm ui-btn--danger" @click="handlePurge(item.id, item.title)">
            彻底删除
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.br { display: flex; flex-direction: column; gap: 12px; }

.br-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }

.br-hint { margin: 0; color: var(--ds-text-2, #646a73); font-size: var(--ds-fs-body-sm, 13px); }

.br-empty {
  padding: 28px 16px;
  border: 1px dashed var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-card, 12px);
  background-color: var(--ds-card, #ffffff);
  color: var(--ds-text-2, #646a73);
  font-size: var(--ds-fs-body-sm, 13px);
  text-align: center;
}

.br-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.br-item {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-card, 12px);
  background-color: var(--ds-card, #ffffff);
}

.br-info { flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }

.br-title { color: var(--ds-text, #1f2329); font-size: var(--ds-fs-body, 14px); }

.br-meta { color: var(--ds-text-3, #9aa0a6); font-size: var(--ds-fs-label, 12px); }

.br-status { color: var(--ds-text-2, #646a73); }

.br-ops { display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap; }

@media (max-width: 768px) {
  .br-ops { width: 100%; margin-left: 0; }
  .br-ops .ui-btn { flex: 1 1 auto; min-height: 44px; }
}
</style>
