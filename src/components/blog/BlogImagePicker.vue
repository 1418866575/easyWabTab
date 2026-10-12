<script setup lang="ts">
/**
 * 博客图库选择器（弹框）
 *
 * 复用于两处：① 编辑器工具栏「图库」→ 正文插入图片；② 文章设置「封面」→ 选择封面图。
 * 单选模式点卡片即选中并关闭；多选模式先勾选再点「插入」。
 * 只做选择与展示，不负责上传（上传统一在「图库」页完成，避免两处逻辑分叉）。
 */
import { computed, ref } from 'vue'
import { useBlogStore } from '@/stores/blog'
import { filterImages, formatBytes, formatDateTime, sortImages } from '@/composables/blogCore'
import type { BlogImage, BlogImageSort } from '@/types'
import BaseDialog from '@/components/common/BaseDialog.vue'

const props = withDefaults(
  defineProps<{
    /** 多选模式（正文插入可一次插多张）；封面选择用单选 */
    multiple?: boolean
    title?: string
  }>(),
  { multiple: false, title: '从图库选择图片' }
)

const emit = defineEmits<{ close: []; select: [BlogImage[]] }>()

const store = useBlogStore()
const keyword = ref('')
const sort = ref<BlogImageSort>('created-desc')
/** 多选模式下已勾选的图片 id（保持勾选顺序，插入顺序即勾选顺序） */
const selected = ref<string[]>([])

const list = computed(() => sortImages(filterImages(store.images, keyword.value), sort.value))
const selectedCount = computed(() => selected.value.length)

function isSelected(id: string): boolean {
  return selected.value.includes(id)
}

function toggle(img: BlogImage): void {
  if (!props.multiple) {
    emit('select', [img])
    emit('close')
    return
  }
  const i = selected.value.indexOf(img.id)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(img.id)
}

function confirmSelect(): void {
  if (selectedCount.value === 0) return
  const byId = new Map(store.images.map(i => [i.id, i]))
  const picked = selected.value.map(id => byId.get(id)).filter((i): i is BlogImage => !!i)
  emit('select', picked)
  emit('close')
}
</script>

<template>
  <BaseDialog :title="title" width="760px" max-height="86vh" data-testid="blog-image-picker" @close="emit('close')">
    <div class="bip">
      <div class="bip-toolbar">
        <el-input v-model="keyword" size="small" class="bip-search" placeholder="搜索图片名称" clearable />
        <select v-model="sort" class="bip-sort" aria-label="排序">
          <option value="created-desc">最新优先</option>
          <option value="created-asc">最早优先</option>
          <option value="name-asc">名称升序</option>
        </select>
        <span class="bip-count">共 {{ list.length }} 张</span>
      </div>

      <p v-if="store.images.length === 0" class="bip-empty">
        图库还没有图片。请到左侧「图库」页面上传后再选择。
      </p>
      <p v-else-if="list.length === 0" class="bip-empty">没有匹配「{{ keyword }}」的图片。</p>

      <ul v-else class="bip-grid">
        <li v-for="img in list" :key="img.id">
          <button
            type="button"
            class="bip-card"
            :class="{ 'is-on': multiple && isSelected(img.id) }"
            :title="img.name"
            :data-testid="`blog-image-picker-item-${img.id}`"
            @click="toggle(img)"
          >
            <span class="bip-thumb"><img :src="img.dataUrl" :alt="img.name" /></span>
            <span class="bip-name">{{ img.name }}</span>
            <span class="bip-meta">{{ formatBytes(img.size) }} · {{ formatDateTime(img.createdAt) }}</span>
            <span v-if="multiple && isSelected(img.id)" class="bip-check" aria-hidden="true">✓</span>
          </button>
        </li>
      </ul>
    </div>

    <template v-if="multiple" #footer>
      <button type="button" class="ui-btn ui-btn--sm" @click="emit('close')">取消</button>
      <button
        type="button"
        class="ui-btn ui-btn--sm ui-btn--primary"
        :disabled="selectedCount === 0"
        data-testid="blog-image-picker-confirm"
        @click="confirmSelect"
      >
        插入{{ selectedCount > 0 ? `（${selectedCount}）` : '' }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.bip {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bip-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bip-search {
  flex: 1 1 220px;
  min-width: 0;
}

.bip-sort {
  flex: 0 0 auto;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-input, #ffffff);
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
}

.bip-count {
  flex: 0 0 auto;
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 12px);
}

.bip-empty {
  margin: 0;
  padding: 24px 8px;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  text-align: center;
}

.bip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 52vh;
  overflow-y: auto;
}

.bip-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 6px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text, #0f172a);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.bip-card:hover {
  border-color: var(--color-primary, #3b82f6);
}

.bip-card.is-on {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary-soft, #eff6ff);
}

.bip-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 84px;
  overflow: hidden;
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-2, #f1f5f9);
}

.bip-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bip-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--font-size-xs, 12px);
}

.bip-meta {
  color: var(--color-text-muted, #94a3b8);
  font-size: var(--font-size-xs, 11px);
}

.bip-check {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background-color: var(--color-primary, #3b82f6);
  color: #ffffff;
  font-size: var(--font-size-xs, 12px);
}
</style>
