<script setup lang="ts" generic="T extends { id: string; deletedAt?: string | null }">
/**
 * 通用回收站列表（复用 BlogTrash.vue 既有视觉形态与 .ui-btn 按钮体系）。
 *
 * 各模块（待办 / 笔记 / 记账 / 家谱）把"墓碑数组"喂进来即可：
 *   - items：trashedXxx（已按删除时间倒序的墓碑）
 *   - getLabel：取条目标题（同名/同字段不同，由各模块自行提供）
 * 恢复 / 彻底删除 / 清空回收站 的"确认+落库"由父组件在事件里完成，
 * 本组件只负责展示、发确认框、emit 事件，保持纯展示 + 轻交互。
 */
import { computed } from 'vue'
import { showConfirm } from '@/utils/dialog'

// 注意：clearable 必须给显式默认值 true。布尔型 prop 缺省时 Vue 会按 false 处理，
// 而模板里判的是 `clearable !== false`，不写默认值会导致「清空回收站」按钮永远不渲染。
const props = withDefaults(defineProps<{
  /** 墓碑数组（已删除记录），由父组件用 trashedXxx 提供 */
  items: T[]
  /** 取展示名（标题/名字），同名模块字段不同，故由父组件提供 */
  getLabel: (item: T) => string
  /** 空态文案 */
  emptyText?: string
  /** 顶部说明（模块可补充提示） */
  hint?: string
  /** 是否显示「清空回收站」（默认 true） */
  clearable?: boolean
}>(), { clearable: true })

const emit = defineEmits<{
  restore: [id: string]
  purge: [id: string]
  clear: []
}>()

const sorted = computed(() =>
  [...props.items].sort((a, b) => String(b.deletedAt ?? '').localeCompare(String(a.deletedAt ?? '')))
)

function labelOf(item: T): string {
  return props.getLabel(item) || '（未命名）'
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '未知时间'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '未知时间'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtRel(iso?: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`
  return `${Math.floor(diff / (30 * day))} 个月前`
}

function onRestore(id: string): void {
  emit('restore', id)
}

async function onPurge(item: T): Promise<void> {
  const label = labelOf(item)
  if (!await showConfirm(`彻底删除《${label}》？此操作不可撤销，云端也会同步删除。`, '彻底删除')) return
  emit('purge', item.id)
}

async function onClear(): Promise<void> {
  if (sorted.value.length === 0) return
  if (!await showConfirm(`回收站共 ${sorted.value.length} 项，确定全部彻底删除？此操作不可撤销。`, '清空回收站')) return
  emit('clear')
}
</script>

<template>
  <section class="rt">
    <header class="rt-head">
      <p class="rt-hint">
        {{ hint || '这里是被删除的记录。' }}{{ sorted.length > 0 ? `共 ${sorted.length} 项，恢复后会回到删除前的状态。` : '' }}
      </p>
      <button
        v-if="clearable !== false"
        type="button"
        class="ui-btn ui-btn--sm ui-btn--danger"
        :disabled="sorted.length === 0"
        data-testid="record-trash-empty"
        @click="onClear"
      >
        清空回收站
      </button>
    </header>

    <div v-if="sorted.length === 0" class="rt-empty" data-testid="record-trash-none">
      {{ emptyText || '回收站是空的' }}
    </div>

    <ul v-else class="rt-list">
      <li v-for="item in sorted" :key="item.id" class="rt-item" :data-testid="`record-trash-${item.id}`">
        <div class="rt-info">
          <span class="rt-title">{{ labelOf(item) }}</span>
          <span class="rt-meta">删除于 {{ fmtDate(item.deletedAt) }}<template v-if="fmtRel(item.deletedAt)">（{{ fmtRel(item.deletedAt) }}）</template></span>
        </div>
        <div class="rt-ops">
          <button type="button" class="ui-btn ui-btn--sm" @click="onRestore(item.id)">恢复</button>
          <button type="button" class="ui-btn ui-btn--sm ui-btn--danger" @click="onPurge(item)">彻底删除</button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.rt { display: flex; flex-direction: column; gap: 12px; }

.rt-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }

.rt-hint { margin: 0; color: var(--color-text-secondary, #64748b); font-size: var(--font-size-sm, 13px); }

.rt-empty {
  padding: 28px 16px;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-sm, 13px);
  text-align: center;
}

.rt-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rt-item {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
}

.rt-info { flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }

.rt-title { color: var(--color-text, #0f172a); font-size: var(--font-size-sm, 14px); }

.rt-meta { color: var(--color-text-muted, #94a3b8); font-size: var(--font-size-xs, 12px); }

.rt-ops { display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap; }

@media (max-width: 768px) {
  .rt-ops { width: 100%; margin-left: 0; }
  .rt-ops .ui-btn { flex: 1 1 auto; min-height: 44px; }
}
</style>
