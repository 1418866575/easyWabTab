<script setup lang="ts">
import Icon from './Icon.vue'
import BaseDialog from './common/BaseDialog.vue'
import { showConfirm, toastAlert } from '@/utils/dialog'
import { ref, onMounted } from 'vue'
import {
  getBackups,
  getMetadata,
  restoreFromBackup,
  deleteBackup,
  clearAllBackups,
  exportToMarkdownFile,
  setAutoBackup,
  type BackupData,
  type BackupMetadata
} from '../composables/useBackup'
import { useSitesStore } from '../stores/sites'
import { useCategoriesStore } from '../stores/categories'
import { useSearchEnginesStore } from '../stores/searchEngines'
import { useNavPrefs } from '@/composables/useNavPrefs'
import { armNavWipeOverride } from '@/composables/navDataGuard'

/** embedded = true：作为常驻面板内嵌在设置页（无遮罩、无自带标题栏、不响应遮罩点击关闭） */
withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const emit = defineEmits(['close'])

/** 面板尺寸：沿用「设置 → 弹窗尺寸」写入的 CSS 变量（backup），未配置时回退默认值 */
const PANEL_WIDTH = 'var(--dlg-w-backup, 600px)'
const PANEL_MAX_HEIGHT = 'var(--dlg-h-backup, 80vh)'

const sitesStore = useSitesStore()
const categoriesStore = useCategoriesStore()
const enginesStore = useSearchEnginesStore()

const backups = ref<BackupData[]>([])
const metadata = ref<BackupMetadata>(getMetadata())
const loading = ref(false)

// 加载备份列表
const loadBackups = () => {
  backups.value = getBackups()
  metadata.value = getMetadata()
}

onMounted(loadBackups)

// 格式化时间
const formatTime = (timestamp: string) => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 获取备份摘要
const getBackupSummary = (backup: BackupData) => {
  return `${backup.sites.length} 个网站, ${backup.categories.length} 个分类`
}

// 恢复备份
const handleRestore = async (backup: BackupData) => {
  if (!await showConfirm('确定要恢复此备份吗？当前数据将被覆盖。')) {
    return
  }

  loading.value = true
  try {
    const data = restoreFromBackup(backup)
    const nav = useNavPrefs()
    // 确保内存已有全量 nav 数据，setPref 合并而非覆盖其它键
    await nav.ensureLoaded()
    // 恢复备份 = 用户已二次确认「以备份为准」，必须显式放行降级守卫：
    // 备份里的站点数常常小于当前（恢复旧备份是典型操作），
    // 不放行会被「骤降 / 远低于历史最高」判定拦下，表现为恢复后数据存不进去。
    armNavWipeOverride()
    nav.setPref('user-sites', JSON.stringify(data.sites))
    nav.setPref('user-categories', JSON.stringify(data.categories))
    nav.setPref('user-search-engines', JSON.stringify(data.searchEngines))
    // 立即落盘，确保 reload 前已写入 nav store（IndexedDB）
    await nav.flushNow()

    // 刷新页面以加载新数据
    toastAlert('恢复成功！页面将刷新。')
    window.location.reload()
  } catch (e) {
    toastAlert('恢复失败：' + e)
  } finally {
    loading.value = false
  }
}

// 删除单个备份
const handleDelete = async (timestamp: string) => {
  if (!await showConfirm('确定要删除此备份吗？')) {
    return
  }
  deleteBackup(timestamp)
  loadBackups()
}

// 清空所有备份
const handleClearAll = async () => {
  if (!await showConfirm('确定要清空所有备份吗？此操作不可恢复！')) {
    return
  }
  clearAllBackups()
  loadBackups()
}

// 手动导出
const handleExport = () => {
  const sites = sitesStore.sites
  const categories = categoriesStore.customCategories
  const engines = enginesStore.customEngines
  exportToMarkdownFile(sites, categories, engines)
  toastAlert('导出成功！文件已下载。')
}

// 切换自动备份
const toggleAutoBackup = () => {
  setAutoBackup(!metadata.value.autoBackupEnabled)
  metadata.value = getMetadata()
}
</script>

<template>
  <BaseDialog
    :width="PANEL_WIDTH"
    :max-height="PANEL_MAX_HEIGHT"
    :embedded="embedded"
    :hide-header="embedded"
    :close-on-overlay="!embedded"
    @close="emit('close')"
  >
    <template #title><Icon name="package" /> 数据备份管理</template>

    <!-- 备份状态 -->
    <div class="backup-status">
      <div class="status-item">
        <span class="label">自动备份：</span>
        <button
          class="toggle-btn"
          :class="{ active: metadata.autoBackupEnabled }"
          @click="toggleAutoBackup"
        >
          <Icon :name="metadata.autoBackupEnabled ? 'check' : 'close'" /> {{ metadata.autoBackupEnabled ? '已开启' : '已关闭' }}
        </button>
      </div>
      <div class="status-item">
        <span class="label">备份数量：</span>
        <span class="value">{{ backups.length }} / 10</span>
      </div>
      <div class="status-item" v-if="metadata.lastBackup">
        <span class="label">上次备份：</span>
        <span class="value">{{ formatTime(metadata.lastBackup) }}</span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="action-buttons">
      <button class="action-btn primary" @click="handleExport">
        <Icon name="download" /> 导出备份文件
      </button>
      <button class="action-btn" @click="loadBackups">
        <Icon name="refresh" /> 刷新
      </button>
      <button
        class="action-btn danger"
        @click="handleClearAll"
        :disabled="backups.length === 0"
      >
        <Icon name="trash" /> 清空备份
      </button>
    </div>

    <!-- 备份列表 -->
    <div class="backup-list">
      <h3><Icon name="clipboard" /> 备份历史</h3>
      <div v-if="backups.length === 0" class="empty">
        暂无备份记录。修改数据后将自动创建备份。
      </div>
      <div
        v-for="backup in backups"
        :key="backup.timestamp"
        class="backup-item"
      >
        <div class="backup-info">
          <div class="backup-time">{{ formatTime(backup.timestamp) }}</div>
          <div class="backup-summary">{{ getBackupSummary(backup) }}</div>
        </div>
        <div class="backup-actions">
          <button class="restore-btn" @click="handleRestore(backup)">
            恢复
          </button>
          <button class="delete-btn" @click="handleDelete(backup.timestamp)">
            删除
          </button>
        </div>
      </div>
    </div>

    <!-- 说明 -->
    <div class="help-text">
      <p><Icon name="lightbulb" /> <strong>说明：</strong></p>
      <ul>
        <li>自动备份：在数据变化后 5 秒自动创建备份（最多保留 10 个）</li>
        <li>手动导出：下载 .md 格式备份文件，可保存到网盘</li>
        <li>恢复备份：将数据恢复到指定时间点的状态</li>
      </ul>
    </div>
  </BaseDialog>
</template>

<style scoped>
/* 弹框外壳（遮罩/面板/头部/关闭/主体/底部/移动端适配）已统一到 common/BaseDialog.vue，
   本组件仅保留备份状态、操作按钮、备份列表、说明等内容样式 */

.backup-status {
  background: var(--color-bg, #f8fafc);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.status-item:last-child {
  margin-bottom: 0;
}

.label {
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
}

.value {
  color: var(--color-text, #1e293b);
  font-size: 14px;
}

.toggle-btn {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg-card, #ffffff);
  cursor: pointer;
  font-size: 13px;
}

.toggle-btn.active {
  background: #dcfce7;
  border-color: #22c55e;
  color: #16a34a;
}

.action-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg-card, #ffffff);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--color-bg-hover, #f1f5f9);
}

.action-btn.primary {
  background: var(--color-primary, #3b82f6);
  color: white;
  border-color: var(--color-primary, #3b82f6);
}

.action-btn.primary:hover {
  background: var(--color-primary-hover, #2563eb);
}

.action-btn.danger {
  color: var(--color-error, #ef4444);
}

.action-btn.danger:hover {
  background: #fef2f2;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.backup-list {
  margin-bottom: 20px;
}

.backup-list h3 {
  font-size: 14px;
  color: var(--color-text-secondary, #64748b);
  margin: 0 0 12px 0;
}

.empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-muted, #94a3b8);
  font-size: 14px;
}

.backup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  margin-bottom: 8px;
}

.backup-info {
  flex: 1;
}

.backup-time {
  font-size: 14px;
  color: var(--color-text, #1e293b);
  margin-bottom: 4px;
}

.backup-summary {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

.backup-actions {
  display: flex;
  gap: 8px;
}

.restore-btn {
  padding: 4px 12px;
  border-radius: 4px;
  border: none;
  background: var(--color-primary, #3b82f6);
  color: white;
  font-size: 12px;
  cursor: pointer;
}

.restore-btn:hover {
  background: var(--color-primary-hover, #2563eb);
}

.delete-btn {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg-card, #ffffff);
  color: var(--color-text-secondary, #64748b);
  font-size: 12px;
  cursor: pointer;
}

.delete-btn:hover {
  background: #fef2f2;
  color: var(--color-error, #ef4444);
  border-color: var(--color-error, #ef4444);
}

.help-text {
  background: #f0f9ff;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 13px;
  color: var(--color-text, #1e293b);
}

.help-text p {
  margin: 0 0 8px 0;
}

.help-text ul {
  margin: 0;
  padding-left: 20px;
}

.help-text li {
  margin-bottom: 4px;
  color: var(--color-text-secondary, #64748b);
}
</style>
