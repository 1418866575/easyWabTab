<script setup lang="ts">
import { computed } from 'vue'
import { useSitesStore } from '../stores/sites'

const store = useSitesStore()

const pageSizeOptions = [
  { value: 18, label: '18 条/页' },
  { value: 27, label: '27 条/页' },
  { value: 36, label: '36 条/页' },
  { value: 45, label: '45 条/页' },
  { value: 99999, label: '全部' }
]

// 判断是否处于"全部"模式
const isAllMode = computed(() => store.pageSize === 99999)

const pages = computed(() => {
  const total = store.totalPages
  const current = store.currentPage
  const result: (number | string)[] = []
  
  if (total <= 7) {
    for (let i = 1; i <= total; i++) {
      result.push(i)
    }
  } else {
    // 总是显示第一页
    result.push(1)
    
    if (current > 3) {
      result.push('...')
    }
    
    // 中间页码
    const start = Math.max(2, current - 1)
    const end = Math.min(total - 1, current + 1)
    
    for (let i = start; i <= end; i++) {
      result.push(i)
    }
    
    if (current < total - 2) {
      result.push('...')
    }
    
    // 总是显示最后一页
    result.push(total)
  }
  
  return result
})

const handlePageClick = (page: number | string) => {
  if (typeof page === 'number') {
    store.setPage(page)
    // 滚动到顶部 - 发射事件让父组件处理
    emit('pageChange')
  }
}

const emit = defineEmits<{
  pageChange: []
}>()

const handleSizeChange = (value: number | string) => {
  store.setPageSize(Number(value))
  // 滚动到顶部
  emit('pageChange')
}
</script>

<template>
  <div v-if="store.filteredSites.length > 0" class="pagination-wrapper">
    <!-- 分页按钮（非全部模式时显示） -->
    <div v-if="!isAllMode" class="pagination">
      <button
        class="page-btn"
        :disabled="store.currentPage === 1"
        @click="handlePageClick(store.currentPage - 1)"
      >
        ‹ 上一页
      </button>
      
      <template v-for="page in pages" :key="page">
        <span v-if="page === '...'" class="ellipsis">...</span>
        <button
          v-else
          class="page-btn"
          :class="{ active: page === store.currentPage }"
          @click="handlePageClick(page)"
        >
          {{ page }}
        </button>
      </template>
      
      <button
        class="page-btn"
        :disabled="store.currentPage === store.totalPages"
        @click="handlePageClick(store.currentPage + 1)"
      >
        下一页 ›
      </button>
    </div>

    <!-- 每页条数选择 -->
    <div class="page-size-selector">
      <el-select
        :model-value="store.pageSize"
        class="page-size-select"
        @change="handleSizeChange"
      >
        <el-option
          v-for="opt in pageSizeOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
    </div>

    <!-- 全部时显示总数 -->
    <div v-if="isAllMode" class="page-info">
      共 {{ store.filteredSites.length }} 条
    </div>
  </div>
</template>

<style scoped>
.pagination-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-top: 32px;
  padding: 20px 0;
  flex-wrap: wrap;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}

.page-btn {
  padding: 8px 14px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-btn.active {
  background-color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  color: #fff;
}

.ellipsis {
  color: var(--color-text-muted, #94a3b8);
  padding: 0 4px;
}

.page-size-selector {
  display: flex;
  align-items: center;
}

/* el-select 自带视觉（含暗色），此处仅定宽 */
.page-size-select {
  min-width: 110px;
}

.page-info {
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  padding: 8px 12px;
}

/* 暗色由 --color-* token 自动跟随，无需 .dark 覆盖；el-select 亦自带暗色 */

/* ===== 移动端优化（≤768px）=====
   1) 页码区改横向滚动、不换行：页码多时不撑高容器（与工作台底部 Tab Bar 同一手法）
   2) 触控目标放大到 44×44（WCAG 2.2 目标尺寸下限）
   3) 正文放大到 15px，符合移动端可读性基线 */
@media (max-width: 768px) {
  .pagination-wrapper {
    gap: 10px;
  }

  .pagination {
    flex-wrap: nowrap;
    justify-content: flex-start;
    /* 允许收缩 + 内部横向滚动，避免整条被内容顶宽溢出视口 */
    flex: 1 1 auto;
    min-width: 0;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .pagination::-webkit-scrollbar {
    display: none;
  }

  .page-btn {
    flex: 0 0 auto;
    min-width: 44px;
    min-height: 44px;
    padding: 8px 12px;
    font-size: 15px;
  }

  .page-size-selector {
    flex: 0 0 auto;
  }

  .page-size-select {
    min-height: 44px;
    font-size: 15px;
  }

  .page-info {
    font-size: 15px;
  }
}
</style>
