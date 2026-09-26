<script setup lang="ts">
// 账本切换器（销售记账头部常驻入口）：
// 展示当前账本 → 下拉列出所有年份账本 → 切换后全局数据随账本隔离刷新；
// 下拉内可直接新建账本（按自然年、同年唯一，重复 / 非法给出明确提示）。
// 数据全部经 store 读写，账本逻辑由 businessCore 纯函数裁决，本组件不做业务计算。

import { computed, ref } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'
import { currentYear, ledgerDefaultName } from '@/composables/businessCore'

const store = useWorkbenchBusinessStore()

const open = ref(false)
const creating = ref(false)
const formYear = ref<number>(currentYear())
const formName = ref('')
const errorMsg = ref('')

const label = computed(() => store.currentLedgerName || ledgerDefaultName(store.currentLedgerYear))
const defaultName = computed(() => ledgerDefaultName(Number(formYear.value) || currentYear()))

function close(): void {
  open.value = false
  creating.value = false
  formYear.value = currentYear()
  formName.value = ''
  errorMsg.value = ''
}

function toggle(): void {
  if (open.value) close()
  else {
    open.value = true
    formYear.value = currentYear()
    formName.value = ''
    errorMsg.value = ''
  }
}

function onSelect(id: string): void {
  if (id !== store.currentLedgerId) store.switchLedger(id)
  close()
}

function onCreate(): void {
  const year = Number(formYear.value)
  const r = store.createLedger(year, formName.value)
  if (!r.ok) {
    errorMsg.value =
      r.reason === 'duplicate'
        ? `${year} 年账本已存在，请直接切换或换一个年份`
        : r.reason === 'invalid-year'
          ? '请输入有效年份（1970 - 9999）'
          : '账本名称不能为空'
    return
  }
  close()
}
</script>

<template>
  <div class="bls-wrap">
    <button
      type="button"
      class="bs-btn bls-trigger"
      :title="`当前账本：${label}（点击切换/新建）`"
      data-testid="bs-ledger-switcher"
      @click="toggle"
    >
      <span class="bls-name">{{ label }}</span>
      <span class="bls-caret">▾</span>
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

      <button
        v-if="!creating"
        type="button"
        class="bs-btn bs-btn-primary bls-new"
        data-testid="bs-ledger-new-toggle"
        @click="creating = true"
      >+ 新建账本</button>

      <div v-else class="bls-create">
        <label class="bls-field">
          年份
          <input
            v-model.number="formYear"
            type="number"
            min="1970"
            max="9999"
            class="bls-input"
            data-testid="bs-ledger-new-year"
          />
        </label>
        <label class="bls-field">
          名称
          <input
            v-model="formName"
            type="text"
            maxlength="30"
            class="bls-input"
            :placeholder="defaultName"
            data-testid="bs-ledger-new-name"
          />
        </label>
        <p v-if="errorMsg" class="bls-error" data-testid="bs-ledger-new-error">{{ errorMsg }}</p>
        <div class="bls-actions">
          <button type="button" class="bs-btn" @click="creating = false">取消</button>
          <button
            type="button"
            class="bs-btn bs-btn-primary"
            data-testid="bs-ledger-new-submit"
            @click="onCreate"
          >创建并切换</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bls-wrap {
  position: relative;
}

.bls-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
}

.bls-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bls-caret {
  font-size: 11px;
  color: var(--color-text-secondary, #64748b);
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

.bls-new {
  width: 100%;
}

.bls-create {
  display: grid;
  gap: 8px;
}

.bls-field {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

.bls-input {
  padding: 7px 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text, #1e293b);
  background-color: var(--color-bg-card, #ffffff);
}

.bls-input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
}

.bls-error {
  margin: 0;
  font-size: 12px;
  color: #ef4444;
}

.bls-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* 主色按钮（与页面 bs-btn 同构） */
.bs-btn-primary {
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
  border-color: var(--color-primary, #3b82f6);
}

.bs-btn-primary:hover {
  background-color: var(--color-primary-hover, #2563eb);
  color: #fff;
  border-color: var(--color-primary-hover, #2563eb);
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
