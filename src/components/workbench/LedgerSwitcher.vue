<script setup lang="ts">
// 记账账本切换器（记账面板月份条常驻入口）：
// 展示当前账本（编号 YYYY-NN + 名称）→ 下拉列出所有账本（同一年份可有多本，按编号区分）→ 切换后全局数据随账本隔离刷新。
// 「创建 / 删除 / 清除账本」统一收进右上角设置弹窗的「个人工作台 → 记账管理」，本组件只负责切换。
// 数据全部经 store 读写，账本逻辑由 ledgerCore 纯函数裁决，本组件不做业务计算。

import { computed, ref } from 'vue'
import { useWorkbenchLedgerStore } from '@/stores/workbenchLedger'
import { ledgerCodeOf } from '@/composables/ledgerCore'
import Icon from '@/components/Icon.vue'

const store = useWorkbenchLedgerStore()

const open = ref(false)

const label = computed(() => store.currentLedgerName || '未选择账本')
/** 账本编号（YYYY-NN）：同年份多本时按序号区分，与名称一起展示 */
const code = computed(() => store.currentLedgerCode)
function codeOf(l: { year: number; seq: number }): string {
  return ledgerCodeOf(l)
}

function close(): void {
  open.value = false
}

function toggle(): void {
  open.value = !open.value
}

function onSelect(id: string): void {
  if (id !== store.currentLedgerId) store.switchLedger(id)
  close()
}
</script>

<template>
  <div class="wls-wrap">
    <!-- 外观与月份条上的 .btn-manage 保持一致（子组件拿不到父组件 scoped 样式，故自带一份完整样式） -->
    <button
      type="button"
      class="wls-trigger"
      :title="`当前账本：${label}（点击切换；新建/删除账本在右上角设置 → 记账管理）`"
      data-testid="ld-ledger-switcher"
      @click="toggle"
    >
      <Icon name="ledger" :size="15" />
      <span v-if="code" class="wls-code">{{ code }}</span>
      <span class="wls-name">{{ label }}</span>
      <Icon name="chevron-down" :size="12" />
    </button>

    <!-- 点击空白处关闭下拉 -->
    <div v-if="open" class="wls-mask" @click="close"></div>

    <div v-if="open" class="wls-panel" data-testid="ld-ledger-panel">
      <p class="wls-title">切换账本</p>
      <ul class="wls-list">
        <li v-for="l in store.ledgers" :key="l.id">
          <button
            type="button"
            class="wls-item"
            :class="{ active: l.id === store.currentLedgerId }"
            @click="onSelect(l.id)"
          >
            <span class="wls-item-code">{{ codeOf(l) }}</span>
            <span class="wls-item-name">{{ l.name }}</span>
            <span v-if="l.id === store.currentLedgerId" class="wls-item-tag">当前</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.wls-wrap {
  position: relative;
  display: inline-flex;
}

.wls-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  padding: 10px 16px;
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.wls-trigger:hover {
  color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

/* 账本编号（YYYY-NN）：等宽、主色浅底，与名称区分 */
.wls-code {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, #eff6ff);
}

.wls-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wls-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
}

.wls-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 61;
  width: 280px;
  padding: 12px;
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
}

.wls-title {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

.wls-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
  display: grid;
  gap: 4px;
}

.wls-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text, #1e293b);
  cursor: pointer;
  text-align: left;
}

.wls-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
}

.wls-item.active {
  background-color: var(--color-primary-soft, #eff6ff);
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}

.wls-item-code {
  font-weight: 700;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--color-text, #1e293b);
}

.wls-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-secondary, #64748b);
}

.wls-item.active .wls-item-name {
  color: inherit;
}

.wls-item-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-primary, #3b82f6);
  color: #fff;
  flex-shrink: 0;
}

html.dark .wls-trigger {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .wls-panel {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

html.dark .wls-item:hover {
  background-color: var(--color-bg-hover, #374151);
}

@media (max-width: 768px) {
  .wls-panel {
    position: fixed;
    top: auto;
    right: 12px;
    left: 12px;
    width: auto;
  }
}
</style>
