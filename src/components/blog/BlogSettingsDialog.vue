<script setup lang="ts">
/**
 * 博客后台「设置」弹框
 *
 * 交互与视觉风格对齐导航站的设置模块（AppSettingsDialog）：
 * 左侧分组 rail（分组标签 + 导航项，激活项高亮）+ 右侧内容区（面包屑标题 + 独立滚动区）。
 * 把原先散在左侧菜单的「分类」「标签」管理，与「博客设置」一起收进本弹框。
 *
 * 分区切换用本地 active 状态；弹框由父级 v-if 控制，关闭即卸载，下次打开回到默认分区。
 */
import { ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/Icon.vue'
import BlogSettingsPanel from './BlogSettingsPanel.vue'
import BlogCategories from './BlogCategories.vue'
import BlogTags from './BlogTags.vue'

const emit = defineEmits<{ close: [] }>()

type SectionKey = 'settings' | 'categories' | 'tags'

interface NavItem {
  key: SectionKey
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'settings', label: '博客设置', icon: 'cog' },
  { key: 'categories', label: '分类管理', icon: 'folder' },
  { key: 'tags', label: '标签管理', icon: 'tag' }
]

const active = ref<SectionKey>('settings')

function labelOf(key: SectionKey): string {
  return NAV_ITEMS.find(i => i.key === key)?.label ?? ''
}
</script>

<template>
  <BaseDialog class="bsd-dialog" title="博客设置" width="920px" max-height="86vh" body-layout="flex-column" @close="emit('close')">
    <template #title><Icon name="cog" /> 博客设置</template>

    <div class="bsd-body">
      <aside class="bsd-rail">
        <nav class="bsd-nav" aria-label="博客设置导航">
          <button
            v-for="item in NAV_ITEMS"
            :key="item.key"
            type="button"
            class="bsd-item"
            :class="{ active: active === item.key }"
            :aria-current="active === item.key ? 'page' : undefined"
            :data-testid="`blog-settings-nav-${item.key}`"
            @click="active = item.key"
          >
            <Icon :name="item.icon" :size="16" />
            <span class="bsd-item-label">{{ item.label }}</span>
          </button>
        </nav>
      </aside>

      <section class="bsd-content">
        <header class="bsd-head">
          <nav class="bsd-crumb" aria-label="位置">
            <span class="bsd-crumb-group">博客</span>
            <span class="bsd-crumb-sep">/</span>
            <span class="bsd-crumb-item">{{ labelOf(active) }}</span>
          </nav>
        </header>

        <div class="bsd-scroll">
          <BlogSettingsPanel v-if="active === 'settings'" />
          <BlogCategories v-else-if="active === 'categories'" />
          <BlogTags v-else-if="active === 'tags'" />
        </div>
      </section>
    </div>
  </BaseDialog>
</template>

<style scoped>
/* 基类 .bd-body 的「归零内边距 + 纵向 flex」由 BaseDialog 的 body-layout="flex-column" 提供
   （见模板）；不能写成 `.bsd-dialog :deep(.bd-body)` —— 根节点是 Teleport 时父 scope id 打不到，规则匹配不到。 */

.bsd-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ---------- 左侧 rail ---------- */
.bsd-rail {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border, #e2e8f0);
  background-color: var(--color-bg-2, #f7f8fa);
  padding: 12px 10px;
  overflow-y: auto;
}
html.dark .bsd-rail { background-color: rgba(255, 255, 255, 0.03); }

.bsd-nav { display: flex; flex-direction: column; gap: 2px; }

.bsd-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md, 8px);
  color: var(--color-text-secondary, #64748b);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.bsd-item:hover { background-color: var(--color-bg-hover, rgba(0, 0, 0, 0.04)); color: var(--color-text, #0f172a); }
.bsd-item.active {
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}
html.dark .bsd-item.active { background-color: rgba(96, 165, 250, 0.15); }
html.dark .bsd-item:hover { background-color: rgba(255, 255, 255, 0.06); }

/* ---------- 右侧内容 ---------- */
.bsd-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.bsd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  flex-shrink: 0;
}

.bsd-crumb {
  font-size: 13px;
  color: var(--color-text-muted, #94a3b8);
  display: flex;
  align-items: center;
  gap: 6px;
}
.bsd-crumb-group { color: var(--color-text-secondary, #64748b); }
.bsd-crumb-item { color: var(--color-text, #0f172a); font-weight: 600; }
.bsd-crumb-sep { opacity: 0.5; }

.bsd-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

/* ---------- 移动端：rail 转顶部横滚 ---------- */
@media (max-width: 768px) {
  .bsd-body { flex-direction: column; }
  .bsd-rail {
    width: 100%;
    flex: 0 0 auto;
    border-right: none;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 8px 10px;
  }
  .bsd-nav { flex-direction: row; gap: 6px; }
  .bsd-item { width: auto; white-space: nowrap; padding: 7px 12px; }
  .bsd-item-label { font-size: 12px; }
}
</style>
