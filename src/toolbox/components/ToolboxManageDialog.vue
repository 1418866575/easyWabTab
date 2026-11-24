<script setup lang="ts">
/**
 * 工具箱管理：按分类列出全部工具，逐个开启/关闭。
 *
 * 语义：关闭只影响工具是否在列表中展示，**不删除**工具实现、收藏、点击次数、
 * 最近使用等任何数据；重新开启即恢复原状（含收藏状态）。
 *
 * 入口：工具箱页顶栏「⚙️ 管理」按钮。
 * 弹框外壳复用 BaseDialog（全站唯一弹框基类，禁止另造 overlay）。
 */
import { computed, ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { DIALOG_BTN } from '@/config/dialogText'
import { TOOLBOX_TOOLS } from '../registry'
import { TOOLBOX_CATEGORIES, categoryName } from '../config/categories'
import { countByCategory } from '../core/search'
import type { ToolboxToolMeta } from '../types'

const props = defineProps<{
  disabled: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggle', id: string, enabled: boolean): void
  (e: 'enable-all'): void
  (e: 'disable-all'): void
}>()

/** 关键字过滤（只影响管理面板自己的列表，不影响主列表） */
const keyword = ref('')

const offSet = computed(() => new Set(props.disabled))

const isOn = (id: string): boolean => !offSet.value.has(id)

const enabledCount = computed(() => TOOLBOX_TOOLS.length - props.disabled.length)
const totalCount = computed(() => TOOLBOX_TOOLS.length)

const allEnabled = computed(() => props.disabled.length === 0)
const allDisabled = computed(() => props.disabled.length >= TOOLBOX_TOOLS.length)

/** 按分类分组（保持分类配置顺序；空分类不出现） */
interface Group {
  id: string
  name: string
  tools: ToolboxToolMeta[]
  onCount: number
}

const groups = computed<Group[]>(() => {
  const q = keyword.value.trim().toLowerCase()
  const match = (t: ToolboxToolMeta): boolean => {
    if (!q) return true
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    )
  }

  const out: Group[] = []
  for (const c of TOOLBOX_CATEGORIES) {
    const tools = TOOLBOX_TOOLS.filter((t) => t.category === c.id && match(t))
    if (!tools.length && countByCategory(TOOLBOX_TOOLS, c.id) === 0) continue
    if (!tools.length) continue
    out.push({
      id: c.id,
      name: categoryName(c.id),
      tools,
      onCount: tools.filter((t) => isOn(t.id)).length
    })
  }
  // 兜底：分类未登记的工具（category 不在配置里）
  const known = new Set(TOOLBOX_CATEGORIES.map((c) => c.id))
  const rest = TOOLBOX_TOOLS.filter((t) => !known.has(t.category as string) && match(t))
  if (rest.length) {
    out.push({
      id: '__rest__',
      name: '未分类',
      tools: rest,
      onCount: rest.filter((t) => isOn(t.id)).length
    })
  }
  return out
})

function onToggle(id: string, next: boolean): void {
  emit('toggle', id, next)
}
</script>

<template>
  <BaseDialog
    title="工具箱管理"
    width="760px"
    max-height="82vh"
    data-testid="tb-manage"
    @close="emit('close')"
  >
    <div class="tbm">
      <!-- 概览 + 批量操作 -->
      <div class="tbm-bar">
        <p class="tbm-stat" data-testid="tb-manage-stat">
          已开启 <strong>{{ enabledCount }}</strong> / {{ totalCount }} 个工具
          <span v-if="disabled.length" class="tbm-off">（{{ disabled.length }} 个已关闭）</span>
        </p>
        <div class="tbm-actions">
          <button
            type="button"
            class="ui-btn ui-btn--sm"
            :disabled="allEnabled"
            data-testid="tb-manage-enable-all"
            @click="emit('enable-all')"
          >全部开启</button>
          <button
            type="button"
            class="ui-btn ui-btn--sm"
            :disabled="allDisabled"
            data-testid="tb-manage-disable-all"
            @click="emit('disable-all')"
          >全部关闭</button>
        </div>
      </div>

      <p class="tbm-hint">
        关闭只影响列表展示，不会删除工具本身；收藏与使用记录都会保留，重新开启即恢复。
      </p>

      <!-- 面板内搜索 -->
      <div class="tbm-search">
        <input
          v-model="keyword"
          type="search"
          class="ui-input"
          placeholder="搜索工具名称或描述…"
          data-testid="tb-manage-search"
        />
      </div>

      <!-- 分组列表 -->
      <div class="tbm-groups">
        <section v-for="g in groups" :key="g.id" class="tbm-group">
          <h4 class="tbm-group-head">
            <span>{{ g.name }}</span>
            <span class="tbm-group-cnt">{{ g.onCount }}/{{ g.tools.length }}</span>
          </h4>
          <ul class="tbm-list">
            <li v-for="t in g.tools" :key="t.id" class="tbm-item" :class="{ 'is-off': !isOn(t.id) }">
              <span class="tbm-icon" aria-hidden="true">{{ t.icon }}</span>
              <span class="tbm-info">
                <span class="tbm-name">{{ t.name }}</span>
                <span class="tbm-desc">{{ t.description }}</span>
              </span>
              <label class="tbm-switch" :title="isOn(t.id) ? '点击关闭' : '点击开启'">
                <input
                  type="checkbox"
                  :checked="isOn(t.id)"
                  :data-testid="'tb-manage-switch-' + t.id"
                  :aria-label="(isOn(t.id) ? '关闭 ' : '开启 ') + t.name"
                  @change="onToggle(t.id, ($event.target as HTMLInputElement).checked)"
                />
                <span class="tbm-track" aria-hidden="true"><span class="tbm-thumb" /></span>
                <span class="tbm-state">{{ isOn(t.id) ? '开启' : '关闭' }}</span>
              </label>
            </li>
          </ul>
        </section>

        <p v-if="!groups.length" class="tbm-empty" data-testid="tb-manage-empty">
          没有匹配的工具
        </p>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn-submit" data-testid="tb-manage-done" @click="emit('close')">
        {{ DIALOG_BTN.close }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.tbm { display: flex; flex-direction: column; min-height: 0; }

/* 概览行 */
.tbm-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-2);
}
.tbm-stat {
  margin: 0;
  font-size: var(--fs-body);
  color: var(--color-text-secondary);
}
.tbm-stat strong { color: var(--color-text); font-size: var(--fs-md); }
.tbm-off { color: var(--color-warning-text); }
.tbm-actions { margin-left: auto; display: flex; gap: var(--space-2); }

.tbm-hint {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  font-size: var(--fs-caption);
  line-height: 1.65;
  color: var(--color-text-secondary);
  background: var(--color-bg-hover);
  border-radius: var(--radius-md);
}

.tbm-search { margin-bottom: var(--space-3); }
.tbm-search .ui-input { width: 100%; }

/* 分组区：随弹框高度滚动 */
.tbm-groups {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: var(--space-1);
}

.tbm-group + .tbm-group { margin-top: var(--space-4); }
.tbm-group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
  padding-bottom: var(--space-1);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
}
.tbm-group-cnt {
  font-size: var(--fs-caption);
  font-weight: 500;
  color: var(--color-text-muted);
}

.tbm-list { list-style: none; margin: 0; padding: 0; }

.tbm-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  transition: background-color var(--motion-duration) var(--motion-ease);
}
.tbm-item:hover { background: var(--color-bg-hover); }
/* 关闭态整体弱化，但保持可读（4.5:1 对比度不受影响，只降不透明度到 .95） */
.tbm-item.is-off .tbm-icon { opacity: 0.45; filter: grayscale(1); }
.tbm-item.is-off .tbm-name { color: var(--color-text-muted); }

.tbm-icon {
  flex: none;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  font-size: var(--fs-lg);
  line-height: 1;
  background: var(--color-bg-hover);
  border-radius: var(--radius-md);
}

.tbm-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.tbm-name {
  font-size: var(--fs-body);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tbm-desc {
  font-size: var(--fs-caption);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 开关：原生 checkbox 视觉隐藏 + 自绘轨道，保证键盘可达（focus-visible） */
.tbm-switch {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  user-select: none;
}
.tbm-switch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  /* 不用 pointer-events:none —— 否则 <input> 收不到点击，
     自动化/键盘用户无法直接命中（视觉由 .tbm-track 承担，点击由 <label> 转发）。 */
  margin: 0;
  cursor: pointer;
}
.tbm-track {
  position: relative;
  display: block;
  width: 38px;
  height: 22px;
  border-radius: var(--radius-full);
  background: var(--color-border-strong);
  transition: background-color var(--motion-duration) var(--motion-ease);
}
.tbm-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-sm);
  transition: transform var(--motion-duration) var(--motion-ease);
}
.tbm-switch input:checked + .tbm-track { background: var(--color-primary); }
.tbm-switch input:checked + .tbm-track .tbm-thumb { transform: translateX(16px); }
.tbm-switch input:focus-visible + .tbm-track {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.tbm-state {
  min-width: 2.5em;
  font-size: var(--fs-caption);
  color: var(--color-text-muted);
}

.tbm-empty {
  margin: var(--space-6) 0;
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}

@media (max-width: 640px) {
  .tbm-actions { margin-left: 0; width: 100%; }
  .tbm-actions .ui-btn { flex: 1; }
  .tbm-desc { display: none; }
}
</style>
