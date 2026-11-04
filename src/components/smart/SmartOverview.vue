<script setup lang="ts">
/**
 * 智能工作台 · 概览
 * 统计卡 + 分类分布 + 最近使用 Top5（点击直达对应列表项）。
 */
import { computed } from 'vue'
import { useSmartStore } from '@/stores/smart'
import Icon from '@/components/Icon.vue'

const store = useSmartStore()
const stats = computed(() => store.stats)

const cards = computed(() => [
  { key: 'skills', label: '技能', value: stats.value.skillCount, icon: 'toolbox', hint: '可复用的工作流' },
  { key: 'prompts', label: '提示词', value: stats.value.promptCount, icon: 'notes', hint: '可直接投喂的模板' },
  { key: 'workflows', label: '工作流', value: stats.value.workflowCount, icon: 'merge', hint: '按步骤组织的流程' },
  { key: 'month', label: '本月新增', value: stats.value.monthAdded, icon: 'plus', hint: '本月新建的条目' },
  { key: 'usage', label: '累计使用', value: stats.value.totalUsage, icon: 'chart', hint: '复制与填充次数' }
])

const emit = defineEmits<{ goto: [tab: 'skills' | 'prompts' | 'workflows'] }>()

/** 条形宽度：按该分类内部占比（技能 / 提示词 / 工作流三类），让每条都能看出构成 */
function segWidth(c: { skills: number; prompts: number; workflows: number }, key: 'skills' | 'prompts' | 'workflows'): string {
  const total = c.skills + c.prompts + c.workflows
  if (total <= 0) return '0%'
  return `${Math.round((c[key] / total) * 100)}%`
}

function relTime(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const day0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (ts >= day0) return '今天'
  if (ts >= day0 - 86400000) return '昨天'
  const days = Math.floor((day0 - ts) / 86400000)
  if (days < 30) return `${days} 天前`
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
</script>

<template>
  <div class="ov-wrap">
    <div class="ov-cards">
      <button
        v-for="c in cards"
        :key="c.key"
        type="button"
        class="ov-card"
        :data-testid="`smart-stat-${c.key}`"
        @click="emit('goto', c.key === 'workflows' ? 'workflows' : c.key === 'prompts' ? 'prompts' : 'skills')"
      >
        <span class="ov-card-icon"><Icon :name="c.icon" :size="18" /></span>
        <span class="ov-card-body">
          <span class="ov-card-value">{{ c.value }}</span>
          <span class="ov-card-label">{{ c.label }}</span>
        </span>
        <span class="ov-card-hint">{{ c.hint }}</span>
      </button>
    </div>

    <div class="ov-grid">
      <section class="ov-panel">
        <h3 class="ov-panel-title">分类分布</h3>
        <ul v-if="stats.byCategory.length" class="ov-cats">
          <li v-for="c in stats.byCategory" :key="c.category" class="ov-cat">
            <span class="ov-cat-name">{{ c.category }}</span>
            <span class="ov-cat-bar">
              <span class="ov-cat-skills" :style="{ width: segWidth(c, 'skills') }" :title="`技能 ${c.skills}`" />
              <span class="ov-cat-prompts" :style="{ width: segWidth(c, 'prompts') }" :title="`提示词 ${c.prompts}`" />
              <span class="ov-cat-workflows" :style="{ width: segWidth(c, 'workflows') }" :title="`工作流 ${c.workflows}`" />
            </span>
            <span class="ov-cat-num">{{ c.skills + c.prompts + c.workflows }}</span>
          </li>
        </ul>
        <p v-else class="ov-empty">还没有数据</p>
        <p class="ov-legend">
          <span class="ov-dot is-skill" />技能
          <span class="ov-dot is-prompt" />提示词
          <span class="ov-dot is-workflow" />工作流
        </p>
      </section>

      <section class="ov-panel">
        <h3 class="ov-panel-title">最近使用</h3>
        <ul v-if="stats.recent.length" class="ov-recent">
          <li v-for="r in stats.recent" :key="r.id" class="ov-recent-item">
            <button type="button" class="ov-recent-btn" @click="emit('goto', r.type === 'skill' ? 'skills' : r.type === 'workflow' ? 'workflows' : 'prompts')">
              <span class="ov-recent-type">{{ r.type === 'skill' ? '技能' : r.type === 'workflow' ? '工作流' : '提示词' }}</span>
              <span class="ov-recent-name">{{ r.name }}</span>
              <span class="ov-recent-time">{{ relTime(r.lastUsedAt) }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="ov-empty">还没有使用记录，复制一条试试</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ov-wrap { display: flex; flex-direction: column; gap: 14px; }

.ov-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--space-3); }
.ov-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 10px);
  background: var(--color-bg-card, #fff);
  text-align: left;
  cursor: pointer;
}
.ov-card:hover { border-color: var(--color-primary, #3b82f6); }
.ov-card-icon { color: var(--color-primary, #3b82f6); }
.ov-card-body { display: flex; align-items: baseline; gap: 6px; }
.ov-card-value { font-size: var(--fs-h2, 22px); font-weight: 700; color: var(--color-text); }
.ov-card-label { font-size: var(--fs-sm, 13px); color: var(--color-text-secondary); }
.ov-card-hint { font-size: var(--fs-caption, 12px); color: var(--color-text-muted); }

.ov-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-3); }
.ov-panel {
  padding: 14px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 10px);
  background: var(--color-bg-card, #fff);
}
.ov-panel-title { margin: 0 0 10px; font-size: var(--fs-sm, 13px); font-weight: 600; color: var(--color-text); }

.ov-cats { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--space-2); }
.ov-cat { display: grid; grid-template-columns: 80px minmax(0, 1fr) 32px; gap: var(--space-2); align-items: center; font-size: var(--fs-caption, 12px); }
.ov-cat-name { color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-cat-bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--color-bg-hover, #f3f4f6); }
.ov-cat-skills { background: var(--color-primary, #3b82f6); }
/* 提示词段用橙色：走 --color-warning 令牌（规范 §1.5：语义色不写死） */
.ov-cat-prompts { background: var(--color-warning, #f59e0b); }
/* 工作流段用绿色：走 --color-success 令牌 */
.ov-cat-workflows { background: var(--color-success, #10b981); }
.ov-cat-num { text-align: right; color: var(--color-text-muted); }
.ov-legend { margin: 10px 0 0; font-size: var(--fs-caption, 12px); color: var(--color-text-muted); display: flex; gap: var(--space-3); align-items: center; }
.ov-dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: var(--space-1); }
.ov-dot.is-skill { background: var(--color-primary, #3b82f6); }
.ov-dot.is-prompt { background: var(--color-warning, #f59e0b); }
.ov-dot.is-workflow { background: var(--color-success, #10b981); }

.ov-recent { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--space-1); }
.ov-recent-btn {display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: center;
  width: 100%;
  /* 列表行（非动作按钮）：不参与 24px 按钮统一，保持行高舒适 */
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: var(--fs-caption, 12px);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;}
.ov-recent-btn:hover { background: var(--color-bg-hover, #f3f4f6); }
.ov-recent-type { font-size: var(--fs-caption, 12px); color: var(--color-text-muted); }
.ov-recent-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-recent-time { font-size: var(--fs-caption, 12px); color: var(--color-text-muted); }

.ov-empty { margin: 0; font-size: var(--fs-sm, 13px); color: var(--color-text-muted); }

@media (max-width: 768px) {
  .ov-card { min-height: 44px; }
}
</style>
