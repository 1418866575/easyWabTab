<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useIconsStore, type MergedIcon } from '@/stores/icons'

// 图标选择弹框：从「图标管理」的图标库（预置图标 + 自定义图标）中挑选一个图标。
// 与新增网站的图标选择同源（useIconsStore.allIcons），仅交互形态改为弹框。
// 选中后回传图标 src（/icons/<name>.<ext> 或 base64 dataUrl）；「恢复默认」回传空串，由调用方回退内置图标。
const props = withDefaults(
  defineProps<{
    title?: string
    current?: string
  }>(),
  { title: '选择图标', current: '' }
)

const emit = defineEmits<{
  select: [src: string]
  close: []
}>()

const iconsStore = useIconsStore()

const keyword = ref('')
const category = ref('all')

/** 分类列表：all（全部）+ 图标库实际出现的分类（有自定义图标时会多出「自定义」） */
const categories = computed<string[]>(() => {
  const cats: string[] = ['all']
  for (const icon of iconsStore.allIcons) {
    if (!cats.includes(icon.category)) cats.push(icon.category)
  }
  return cats
})

const filteredIcons = computed<MergedIcon[]>(() => {
  let list = iconsStore.allIcons
  if (category.value !== 'all') {
    list = list.filter((i) => i.category === category.value)
  }
  const q = keyword.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (i) => i.label.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
    )
  }
  return list
})

/** 图标实际 src：自定义图标为 base64 dataUrl，预置图标为 /icons/<name>.<ext> */
function iconSrc(icon: MergedIcon): string {
  if ('isCustom' in icon) return icon.dataUrl
  return `/icons/${icon.name}.${icon.ext}`
}

function categoryLabel(cat: string): string {
  return cat === 'all' ? '全部' : cat
}

function handlePick(icon: MergedIcon): void {
  emit('select', iconSrc(icon))
}

/** 恢复默认：回传空串，调用方据此回退到内置图标 */
function handleReset(): void {
  emit('select', '')
}

// ESC 只关本弹框：注册在 document 捕获阶段（早于设置弹窗 window 冒泡监听），
// 命中后阻止继续传播，避免连带关闭外层设置弹窗。
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
  }
}

onMounted(() => {
  void iconsStore.ensureLoaded()
  document.addEventListener('keydown', handleKeydown, true)
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown, true)
})
</script>

<template>
  <div class="ipd-mask" @click.self="emit('close')">
    <div class="ipd-dialog" role="dialog" aria-modal="true" :aria-label="props.title">
      <div class="ipd-head">
        <h3 class="ipd-title">{{ props.title }}</h3>
        <button type="button" class="ipd-close" aria-label="关闭" @click="emit('close')">×</button>
      </div>

      <div class="ipd-body">
        <input
          v-model="keyword"
          type="text"
          class="ipd-search"
          placeholder="搜索图标…"
          aria-label="搜索图标"
        />

        <div class="ipd-cats">
          <button
            v-for="cat in categories"
            :key="cat"
            type="button"
            class="ipd-cat"
            :class="{ active: category === cat }"
            @click="category = cat"
          >
            {{ categoryLabel(cat) }}
          </button>
        </div>

        <div class="ipd-grid">
          <button
            v-for="icon in filteredIcons"
            :key="iconSrc(icon)"
            type="button"
            class="ipd-item"
            :class="{ active: props.current === iconSrc(icon) }"
            :title="icon.label"
            @click="handlePick(icon)"
          >
            <img :src="iconSrc(icon)" :alt="icon.label" class="ipd-item-img" />
            <span class="ipd-item-label">{{ icon.label }}</span>
          </button>
          <p v-if="filteredIcons.length === 0" class="ipd-empty">没有匹配的图标</p>
        </div>
      </div>

      <div class="ipd-foot ewt-dialog-footer">
        <el-button size="small" :disabled="!props.current" @click="handleReset">恢复默认</el-button>
        <el-button size="small" type="primary" @click="emit('close')">取消</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 遮罩层级高于设置弹窗（300），保证嵌套在设置弹窗内时显示在最上层 */
.ipd-mask {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
}

.ipd-dialog {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(80vh, 640px);
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.ipd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.ipd-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.ipd-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.ipd-close:hover {
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text, #1e293b);
}

.ipd-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  padding: 12px 16px;
}

.ipd-search {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  background: var(--color-bg-input, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  color: var(--color-text, #334155);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.ipd-search:focus {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.ipd-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0;
}

.ipd-cat {
  padding: 5px 10px;
  background: transparent;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 999px;
  color: var(--color-text-secondary, #64748b);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background-color 0.15s;
}

.ipd-cat:hover {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.ipd-cat.active {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}

.ipd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 8px;
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  padding: 4px;
}

.ipd-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 4px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

.ipd-item:hover {
  background: var(--color-bg-hover, #f1f5f9);
}

.ipd-item.active {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  border-color: var(--color-primary, #3b82f6);
}

.ipd-item-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.ipd-item-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--color-text-secondary, #64748b);
}

.ipd-item.active .ipd-item-label {
  color: var(--color-primary, #3b82f6);
}

.ipd-empty {
  grid-column: 1 / -1;
  margin: 16px 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-muted, #94a3b8);
}

.ipd-foot {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #e2e8f0);
}

@media (max-width: 768px) {
  .ipd-mask {
    padding: 12px;
  }
  .ipd-dialog {
    max-height: 86vh;
  }
  .ipd-grid {
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  }
  /* 触屏放大触控目标 */
  .ipd-item {
    padding: 10px 4px;
  }
}

/* 暗色：主要靠主题 token 切换，此处仅兜底少数硬编码场景 */
html.dark .ipd-dialog {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}
</style>
