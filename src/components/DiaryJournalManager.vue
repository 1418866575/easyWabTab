<script setup lang="ts">
import { ref } from 'vue'
import { showConfirm } from '@/utils/dialog'
import { useWorkbenchDiaryStore } from '../stores/workbenchDiary'
import { useToast } from '../composables/useToast'
import { DEFAULT_JOURNAL_ID } from '../composables/diaryCore'
import type { WorkbenchJournal } from '@/types'

const store = useWorkbenchDiaryStore()
const toast = useToast()

const newName = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')

function confirmAdd() {
  const name = newName.value.trim()
  if (!name) return
  store.addJournal(name)
  newName.value = ''
  toast.success('已新建日志本')
}

function startRename(j: WorkbenchJournal) {
  editingId.value = j.id
  editingName.value = j.name
}
function confirmRename() {
  if (editingId.value) store.renameJournal(editingId.value, editingName.value)
  editingId.value = null
}
function cancelRename() {
  editingId.value = null
}
async function handleDelete(j: WorkbenchJournal) {
  if (store.journals.length <= 1) return
  const target = store.journals.find(x => x.id !== j.id)
  const msg = target
    ? `删除「${j.name}」后，其下日记将迁移到「${target.name}」，确定删除？`
    : `删除「${j.name}」后，其下日记将迁移到默认日志本，确定删除？`
  if (!await showConfirm(msg)) return
  store.deleteJournal(j.id)
  toast.success('日志本已删除，日记已迁移')
}
function setCurrent(j: WorkbenchJournal) {
  store.setCurrentJournal(j.id)
}
</script>

<template>
  <div class="djm">
    <h3 class="djm-title">日记本管理</h3>
    <p class="djm-hint">切换当前日志本、新建、重命名或删除。删除时其下日记会迁移到其它日志本，避免数据丢失。</p>
    <div class="djm-list">
      <div
        v-for="j in store.journals"
        :key="j.id"
        class="djm-item"
        :class="{ 'is-current': j.id === store.currentJournalId }"
      >
        <template v-if="editingId === j.id">
          <input v-model="editingName" class="djm-edit" @keyup.enter="confirmRename" />
          <button class="djm-btn-icon" @click="confirmRename">保存</button>
          <button class="djm-btn-icon" @click="cancelRename">取消</button>
        </template>
        <template v-else>
          <span class="djm-name">
            {{ j.name }}
            <span v-if="j.id === store.currentJournalId" class="djm-tag djm-tag-current">当前</span>
            <span v-if="j.id === DEFAULT_JOURNAL_ID" class="djm-tag djm-tag-default">默认</span>
          </span>
          <div class="djm-actions">
            <button
              v-if="j.id !== store.currentJournalId"
              class="djm-btn-icon"
              @click="setCurrent(j)"
            >切换</button>
            <button class="djm-btn-icon" @click="startRename(j)">重命名</button>
            <button
              class="djm-btn-icon danger"
              :disabled="store.journals.length <= 1"
              @click="handleDelete(j)"
            >删除</button>
          </div>
        </template>
      </div>
    </div>
    <div class="djm-add-block">
      <div class="djm-add-label">新建日志本</div>
      <div class="djm-add-row">
        <input
          v-model="newName"
          type="text"
          class="djm-input"
          placeholder="日志本名称"
          maxlength="30"
          @keyup.enter="confirmAdd"
        />
        <button class="djm-btn-add" :disabled="!newName.trim()" @click="confirmAdd">新增日志本</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.djm {
  background-color: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  padding: 20px 24px;
}
.djm-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  margin: 0 0 6px 0;
}
.djm-hint {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  margin: 0 0 16px 0;
  line-height: 1.5;
}
.djm-add-block {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--color-border, #e2e8f0);
}
.djm-add-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary, #475569);
  margin: 0 0 8px 0;
}
.djm-add-row {
  display: flex;
  gap: 8px;
}
.djm-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-bg, #fff);
  color: var(--color-text, #1e293b);
  font-size: 14px;
  outline: none;
}
.djm-input:focus {
  border-color: var(--color-primary, #3b82f6);
}
.djm-btn-add {
  white-space: nowrap;
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}
.djm-btn-add:hover:not(:disabled) {
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}
.djm-btn-add:disabled {
  /* 视觉已统一到全局 .ui-btn--primary（style.css） */
}
.djm-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.djm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-bg-hover, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 4px);
}
.djm-item.is-current {
  border-color: var(--color-primary, #3b82f6);
  background: color-mix(in srgb, var(--color-primary, #3b82f6) 8%, transparent);
}
.djm-name {
  flex: 1;
  font-size: 14px;
  color: var(--color-text, #1e293b);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.djm-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  line-height: 1.6;
}
.djm-tag-current {
  background: var(--color-primary, #3b82f6);
  color: #fff;
}
.djm-tag-default {
  background: var(--color-bg-hover, #e2e8f0);
  color: var(--color-text-secondary, #64748b);
}
.djm-edit {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-bg, #fff);
  color: var(--color-text, #1e293b);
  font-size: 14px;
  outline: none;
}
.djm-edit:focus {
  border-color: var(--color-primary, #3b82f6);
}
.djm-actions {
  display: flex;
  gap: 4px;
}
.djm-btn-icon {
  padding: 4px 10px;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
  transition: all 0.15s ease;
}
.djm-btn-icon:hover:not(:disabled) {
  background: var(--color-bg-card, #fff);
  border-color: var(--color-border, #e2e8f0);
  color: var(--color-primary, #3b82f6);
}
.djm-btn-icon.danger:hover:not(:disabled) {
  color: var(--color-error, #ef4444);
  border-color: var(--color-error, #ef4444);
}
.djm-btn-icon:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ===== 移动端适配 =====
   该组件此前完全没有移动端规则（0 条 @media），窄屏下：
   内边距吃掉大量可用宽度、列表项单行导致长名称与三个按钮互相挤压、
   图标按钮实测仅约 24px 远低于触控标准。 */
@media (max-width: 768px) {
  /* 内边距收敛（原 20px 24px，叠加父级 14px 后窄屏可用宽度损失近 80px） */
  .djm {
    padding: 14px 12px;
  }

  /* 列表项改两行：名称独占首行，操作区换到次行右对齐，长名称不再与按钮重叠 */
  .djm-item {
    flex-wrap: wrap;
    row-gap: 8px;
  }
  .djm-name {
    flex: 1 1 100%;
    word-break: break-all;
  }
  .djm-actions {
    flex: 1 1 100%;
    justify-content: flex-end;
  }

  /* 触控目标放大到 44px（原约 24px） */
  .djm-btn-icon {
    min-width: 44px;
    min-height: 44px;
    padding: 4px 12px;
  }
  .djm-btn-add {
    min-height: 44px;
  }

  /* 新增行允许换行，避免输入框在 375px 被压到不可用宽度 */
  .djm-add-row {
    flex-wrap: wrap;
  }
}
</style>
