<script setup lang="ts">
// 账本切换器（销售记账头部常驻入口）：
// 展示当前账本 → 下拉列出所有年份账本 → 切换后全局数据随账本隔离刷新。
// 「新建 / 删除账本」统一收进右上角设置弹窗的「销售记账 → 基础设置 → 账本管理」，本组件只负责切换。
// 数据全部经 store 读写，账本逻辑由 businessCore 纯函数裁决，本组件不做业务计算。

import { computed, ref } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { ledgerDefaultName } from '@/composables/businessCore'
import Icon from '@/components/Icon.vue'

const store = useWorkbenchBusinessStore()

const open = ref(false)

const label = computed(() => store.currentLedgerName || ledgerDefaultName(store.currentLedgerYear))

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
  <div class="bls-wrap">
    <!-- 样式/结构与「云同步」按钮完全一致：class 同为 bs-btn + wb-sync-btn（基础样式由 BusinessView :deep 透传） -->
    <button
      type="button"
      class="bs-btn wb-sync-btn bls-trigger"
      :title="`当前账本：${label}（点击切换；新建/删除账本在右上角设置 → 基础设置）`"
      data-testid="bs-ledger-switcher"
      @click="toggle"
    >
      <Icon name="ledger" :size="14" />
      <span class="bls-name">{{ label }}</span>
      <Icon name="chevron-down" :size="12" />
    </button>

    <!-- 点击空白处关闭下拉 -->
    <div v-if="open" class="bls-mask" @click="close"></div>

    <div v-if="open" class="bls-panel" data-testid="bs-ledger-panel">
      <p class="bls-title">切换账本</p>
      <ul class="bls-list">
        <li v-for="l in store.ledgers" :key="l.id">
          <button
            type="button"
            class="bs-ledger-item"
            :class="{ active: l.id === store.currentLedgerId }"
            :data-testid="`bs-ledger-item-${l.year}`"
            @click="onSelect(l.id)"
          >
            <span class="bs-ledger-year">{{ l.year }} 年</span>
            <span class="bs-ledger-name">{{ l.name }}</span>
            <span v-if="l.id === store.currentLedgerId" class="bs-ledger-tag">当前</span>
          </button>
        </li>
      </ul>

    </div>
  </div>
</template>

<style scoped>
.bls-wrap {
  position: relative;
}

/* 仅保留与「云同步」按钮的差异项（配色/字号/间距/圆角由 BusinessView 的 .bs-btn 统一提供）；
   transition 与 .wb-sync-btn 同源（该样式为 BusinessView scoped，子组件按钮需自带一份） */
.bls-trigger {
  max-width: 220px;
  gap: 6px;
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease, opacity 120ms ease;
}

.bls-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bls-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
}

.bls-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 61;
  width: 280px;
  padding: 12px;
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
}

.bls-title {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

.bls-list {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
  display: grid;
  gap: 4px;
}

.bs-ledger-item {
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

.bs-ledger-item:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
}

.bs-ledger-item.active {
  background-color: var(--color-primary-soft, #eff6ff);
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}

.bs-ledger-year {
  font-weight: 600;
  flex-shrink: 0;
}

.bs-ledger-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-secondary, #64748b);
}

.bs-ledger-item.active .bs-ledger-name {
  color: inherit;
}

.bs-ledger-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-primary, #3b82f6);
  color: #fff;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .bls-panel {
    position: fixed;
    top: auto;
    right: 12px;
    left: 12px;
    width: auto;
  }
}
</style>
