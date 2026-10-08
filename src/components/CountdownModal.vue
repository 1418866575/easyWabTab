<script setup lang="ts">
import Icon from './Icon.vue'
import BaseDialog from './common/BaseDialog.vue'
import { computed, onMounted } from 'vue'
import { useCountdownsStore } from '@/stores/countdowns'
import type { CountdownItem } from '@/stores/countdowns'
import { repeatLabel, categoryLabel } from '@/composables/countdownCore'
import { useToast } from '@/composables/useToast'
import { COUNTDOWN_CATEGORIES } from '@/types'

const emit = defineEmits<{
  close: []
}>()

const store = useCountdownsStore()

// 邮件提醒开关行提示文案（title 与开启成功 toast 共用）
const EMAIL_HINT = '需在设置-提醒设置中配置收件邮箱后生效'

const toast = useToast()

type RemainingStatus = 'normal' | 'urgent' | 'critical' | 'expired'

// 根据剩余状态返回对应的样式类
function statusClass(status: RemainingStatus): string {
  return 'status-' + status
}

// 徽标 class：内置分类用既有配色，自定义分类统一默认灰
function categoryBadgeClass(category: string | null | undefined): string {
  const c = category?.trim() || 'work'
  return (COUNTDOWN_CATEGORIES as readonly string[]).includes(c) ? `cat-${c}` : 'cat-default'
}

// ESC 关闭与遮罩点击关闭统一由 BaseDialog 处理，此处不重复监听
onMounted(async () => {
  await store.loadCountdowns()
})

// 前台展示列表（store 挂载后异步加载，用 computed 保持响应）
const items = computed<CountdownItem[]>(() => store.frontCountdowns)

// 切换邮件提醒：缺省/undefined 视为关闭，点击取反后写库并 toast 反馈
async function toggleEmailReminder(item: CountdownItem) {
  const enabled = item.emailReminder !== true
  try {
    await store.updateCountdown(item.id, { emailReminder: enabled })
    toast.info(enabled ? '已开启邮件提醒，需在设置-提醒设置中配置邮箱后生效' : '已关闭邮件提醒')
  } catch {
    toast.warning('邮件提醒设置保存失败')
  }
}
</script>

<template>
  <BaseDialog @close="emit('close')">
    <template #title><Icon name="timer-sand" /> 倒计时</template>

    <div v-if="items.length === 0" class="empty-state">暂无倒计时</div>

    <div v-else class="countdown-list">
      <div v-for="item in items" :key="item.id" class="countdown-item">
        <div class="countdown-main-row">
          <div class="countdown-info">
            <div class="countdown-title">
              <span class="countdown-name">{{ item.name }}</span>
              <span v-if="repeatLabel(item.repeat) !== '一次性'" class="repeat-badge">{{ repeatLabel(item.repeat) }}</span>
              <span class="cat-badge" :class="categoryBadgeClass(item.category)">{{ categoryLabel(item.category) }}</span>
            </div>
            <span class="countdown-time">{{ item.remaining.nextTime }}</span>
          </div>
          <span class="countdown-remaining" :class="statusClass(item.remaining.status)">
            {{ item.remaining.label }}
          </span>
        </div>
        <!-- 邮件提醒开关行：单向绑定 checked，点击切换写库（缺省/undefined = 未勾选） -->
        <label class="countdown-email-toggle" data-testid="cd-email-toggle" :title="EMAIL_HINT">
          <input
            type="checkbox"
            class="email-toggle-input"
            data-testid="cd-email-switch"
            :checked="item.emailReminder === true"
            @change="toggleEmailReminder(item)"
          />
          <span><Icon name="email" /> 邮件提醒</span>
        </label>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
/* 弹框外壳（遮罩/面板/头部/关闭/主体/底部/移动端适配）已统一到 common/BaseDialog.vue，
   本组件仅保留倒计时列表等内容样式 */

/* 列表 */
.countdown-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.countdown-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 14px 16px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast, 0.15s ease);
}

.countdown-item:hover {
  border-color: var(--color-primary, var(--color-primary));
}

/* 卡片顶部行式头部：名称/徽标/时间/剩余（保持原有横向布局） */
.countdown-main-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

/* 邮件提醒开关行：虚线分隔 + 小字号 muted，hover 变主色 */
.countdown-email-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border, var(--color-border));
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  cursor: pointer;
  user-select: none;
  transition: color var(--transition-fast, 0.15s ease);
}

.countdown-email-toggle:hover {
  color: var(--color-primary, var(--color-primary));
}

.email-toggle-input {
  accent-color: var(--color-primary);
  cursor: pointer;
}

.countdown-info {
  flex: 1;
  min-width: 0;
}

.countdown-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.countdown-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repeat-badge {
  flex-shrink: 0;
  font-size: 12px;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: var(--color-bg-card, var(--color-bg-hover));
  color: var(--color-primary, var(--color-primary));
  border: 1px solid var(--color-primary, var(--color-primary));
  opacity: 0.85;
}

/* 分类徽章：工作=蓝 / 生活=绿 / 学习=紫 / 运动=橙 / 饮食=琥珀 / 睡眠=青 */
.cat-badge {
  flex-shrink: 0;
  font-size: 12px;
  padding: 1px 8px;
  border-radius: var(--radius-full, 9999px);
  opacity: 0.85;
}

.cat-work {
  color: #3b82f6;
  border: 1px solid #3b82f6;
  background: rgba(59, 130, 246, 0.12);
}

.cat-life {
  color: #22c55e;
  border: 1px solid #22c55e;
  background: rgba(34, 197, 94, 0.12);
}

.cat-study {
  color: #a855f7;
  border: 1px solid #a855f7;
  background: rgba(168, 85, 247, 0.12);
}

.cat-exercise {
  color: #f97316;
  border: 1px solid #f97316;
  background: rgba(249, 115, 22, 0.12);
}

.cat-diet {
  color: #f59e0b;
  border: 1px solid #f59e0b;
  background: rgba(245, 158, 11, 0.12);
}

.cat-sleep {
  color: #06b6d4;
  border: 1px solid #06b6d4;
  background: rgba(6, 182, 212, 0.12);
}

/* 自定义分类徽标：统一默认灰 */
.cat-default {
  color: #6b7280;
  border: 1px solid #6b7280;
  background: rgba(107, 114, 128, 0.12);
}

html.dark .cat-work {
  color: #60a5fa;
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.18);
}

html.dark .cat-life {
  color: #4ade80;
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
}

html.dark .cat-study {
  color: #c084fc;
  border-color: #a855f7;
  background: rgba(168, 85, 247, 0.2);
}

html.dark .cat-exercise {
  color: #fdba74;
  border-color: #fb923c;
  background: rgba(249, 115, 22, 0.18);
}

html.dark .cat-diet {
  color: #fcd34d;
  border-color: #fbbf24;
  background: rgba(245, 158, 11, 0.18);
}

html.dark .cat-sleep {
  color: #67e8f9;
  border-color: #22d3ee;
  background: rgba(6, 182, 212, 0.18);
}

html.dark .cat-default {
  color: #9ca3af;
  border-color: #6b7280;
  background: rgba(107, 114, 128, 0.15);
}

.countdown-time {
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
}

.countdown-remaining {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
  text-align: right;
}

/* 剩余时间状态色 */
.status-normal {
  color: var(--color-success, var(--color-success));
}

.status-urgent {
  color: var(--color-warning, var(--color-warning));
}

.status-critical {
  color: var(--color-error, var(--color-error));
}

.status-expired {
  color: var(--color-text-muted, var(--color-text-muted));
}

/* 空状态 */
.empty-state {
  text-align: center;
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border-radius: var(--radius-md);
}

/* ===== 移动端：卡片改为「标题独占一行」+「时间 / 还剩」一行 =====
   原问题：右侧「还剩 X」为 flex-shrink:0，把标题行挤到只剩一个字的宽度（如「下…」「高…」）。
   方案：把 .countdown-info 扁平化（display:contents），让 标题 / 时间 / 剩余 直接参与换行排布，
   标题占满一整行（名称不再被挤压），时间与「还剩 X」并排在第二行。 */
@media (max-width: 768px) {
  /* 扁平化中间层，使子元素成为 main-row 的直接换行项 */
  .countdown-info {
    display: contents;
  }

  .countdown-main-row {
    flex-wrap: wrap;
    row-gap: 4px;
    column-gap: 12px;
    align-items: center;
  }

  /* 第 1 行：名称 + 徽标 独占整行 → 名称不再被「还剩」挤压 */
  .countdown-title {
    flex: 1 1 100%;
    order: 1;
    margin-bottom: 0;
  }

  /* 第 2 行：时间（左）+ 还剩 X（右） */
  .countdown-time {
    order: 2;
  }

  .countdown-remaining {
    order: 3;
    flex: 1 1 auto;
    min-width: 0;
    text-align: right;
  }
}
</style>
