<script setup lang="ts">
import Icon from './Icon.vue'
import BaseDialog from './common/BaseDialog.vue'
import { computed } from 'vue'
import { useCloudSync } from '@/composables/useCloudSync'

const cloudSync = useCloudSync()

interface ConflictRow {
  fileName: string
  moduleLabel: string
  localTs: string
  remoteTs: number
  remoteClientId: string
  localSize: number
  remoteSize: number
}

const MODULE_LABELS: Record<string, string> = {
  'nav.json': '导航偏好',
  'icons.json': '自定义图标',
  'workbench.json': '工作台',
  'business.json': '销售记账',
  'student.json': '学生工作台',
  'teacher.json': '教师工作台'
}

function formatTime(isoOrTs: string | number): string {
  if (!isoOrTs) return '未记录'
  const d = typeof isoOrTs === 'number' ? new Date(isoOrTs) : new Date(isoOrTs)
  if (Number.isNaN(d.getTime())) return '未记录'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']'
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}'
}

function getSize(v: unknown): number {
  try {
    return v !== undefined && v !== null ? stableStringify(v).length : 0
  } catch { return 0 }
}

function getExportedAt(v: unknown): string {
  if (v && typeof v === 'object') {
    const val = (v as Record<string, unknown>).exportedAt
    if (typeof val === 'string') return val
  }
  return ''
}

function getPushedAt(v: unknown): number {
  if (v && typeof v === 'object') {
    const val = (v as Record<string, unknown>).pushedAt
    if (typeof val === 'number') return val
  }
  return 0
}

function getClientId(v: unknown): string {
  if (v && typeof v === 'object') {
    const c = (v as Record<string, unknown>).clientId
    if (typeof c === 'string' && c) return c
  }
  return '未知设备'
}

const conflictRows = computed<ConflictRow[]>(() => {
  const data = cloudSync.conflictData.value
  if (!data) return []
  const rows: ConflictRow[] = []
  for (const [fileName, entry] of Object.entries(data)) {
    rows.push({
      fileName,
      moduleLabel: MODULE_LABELS[fileName] ?? fileName,
      localTs: getExportedAt(entry.local),
      remoteTs: getPushedAt(entry.remote),
      remoteClientId: getClientId(entry.remote),
      localSize: getSize(entry.local),
      remoteSize: getSize(entry.remote)
    })
  }
  return rows.sort((a, b) => a.fileName.localeCompare(b.fileName))
})

const hasConflict = computed(() => conflictRows.value.length > 0)
</script>

<template>
  <Transition name="modal">
    <!-- 冲突必须由用户在「拉取/推送/合并/取消」中显式选择，故不用基类默认外壳（它自带关闭按钮），
         改用 #panel 插槽：遮罩/面板（层级 9999、圆角、阴影、暗色）仍由 BaseDialog 提供，
         且关闭遮罩点击（close-on-overlay=false），ESC 与遮罩点击均不产生任何副作用。 -->
    <BaseDialog
      v-if="hasConflict"
      class="conflict-overlay"
      :close-on-overlay="false"
      width="640px"
      max-height="80vh"
    >
      <template #panel>
        <header class="conflict-head">
          <h2 id="conflict-title" class="conflict-title"><Icon name="alert" /> 云同步冲突</h2>
        </header>

        <div class="conflict-body">
          <p class="conflict-intro">检测到 {{ conflictRows.length }} 份同步文件存在冲突，请选择全局解决方式（对所有冲突文件统一生效）：</p>

          <div class="conflict-files">
            <div v-for="row in conflictRows" :key="row.fileName" class="conflict-file-row">
              <div class="conflict-file-head">
                <span class="conflict-file-name">{{ row.fileName }}</span>
                <span class="conflict-file-label">{{ row.moduleLabel }}</span>
              </div>
              <div class="conflict-file-compare">
                <div class="conflict-file-col">
                  <div class="conflict-col-label">本地</div>
                  <div class="conflict-col-value">{{ formatTime(row.localTs) }}</div>
                  <div class="conflict-col-sub">{{ row.localSize }} 字节</div>
                </div>
                <div class="conflict-vs">VS</div>
                <div class="conflict-file-col">
                  <div class="conflict-col-label">云端</div>
                  <div class="conflict-col-value">{{ formatTime(row.remoteTs) }}</div>
                  <div class="conflict-col-sub">{{ row.remoteSize }} 字节 · {{ row.remoteClientId === '未知设备' ? '未知设备' : '其他设备' }}</div>
                </div>
              </div>
            </div>
          </div>

          <p class="merge-hint" style="display: none;"><Icon name="merge" /> 合并：按模块逐条按 ID 去重，保留双方新增项；同条目取较新版本。密码库与本地设置保留当前设备。</p>
        </div>

        <footer class="conflict-foot">
          <button
            type="button"
            class="conflict-btn conflict-btn-danger"
            @click="cloudSync.resolveConflict('remote')"
          ><Icon name="cloud" /> 全部拉取</button>
          <button
            type="button"
            class="conflict-btn conflict-btn-primary"
            @click="cloudSync.resolveConflict('local')"
          ><Icon name="monitor" /> 全部推送</button>
          <button
            type="button"
            class="conflict-btn conflict-btn-merge"
            style="display: none;"
            @click="cloudSync.resolveConflict('merge')"
          ><Icon name="merge" /> 全部合并</button>
          <button
            type="button"
            class="conflict-btn conflict-btn-ghost"
            @click="cloudSync.resolveConflict('cancel')"
          ><Icon name="close" /> 取消</button>
        </footer>
      </template>
    </BaseDialog>
  </Transition>
</template>

<style scoped>
/* 弹框外壳（遮罩/面板）已统一到 common/BaseDialog.vue（本组件用 #panel 插槽接管内部结构，
   以保留「必须显式选择解决方式」的无关闭按钮形态）；
   层级保留：原遮罩为 9999（高于设置弹框与冲突弹框的 300） */
.conflict-overlay {
  z-index: 9999;
}
.conflict-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #E8463A;
}
.conflict-body {
  padding: 20px 24px;
}
.conflict-intro {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--color-text-muted);
  line-height: 1.5;
}
.conflict-files {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.conflict-file-row {
  background: var(--color-bg-muted);
  border-radius: 8px;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
}
.conflict-file-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--color-border);
}
.conflict-file-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}
.conflict-file-label {
  font-size: 11px;
  color: var(--color-text-muted);
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
}
.conflict-file-compare {
  display: flex;
  align-items: center;
  gap: 10px;
}
.conflict-file-col {
  flex: 1;
  text-align: center;
}
.conflict-col-label {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-bottom: 2px;
}
.conflict-col-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 2px;
}
.conflict-col-sub {
  font-size: 10px;
  color: var(--color-text-muted);
}
.conflict-vs {
  font-weight: 700;
  font-size: 12px;
  color: var(--color-primary);
}
.merge-hint {
  margin: 12px 0 0;
  font-size: 11px;
  color: #16a34a;
  line-height: 1.5;
}
.conflict-foot {
  padding: 12px 24px;
  border-top: 1px solid var(--color-border);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.conflict-btn {
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.conflict-btn:hover {
  transform: translateY(-1px);
}
.conflict-btn-primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
.conflict-btn-danger {
  background: color-mix(in srgb, #E8463A 12%, var(--color-bg));
  color: #E8463A;
  border-color: color-mix(in srgb, #E8463A 40%, var(--color-border));
}
.conflict-btn-ghost {
  background: transparent;
  color: var(--color-text-muted);
}
.conflict-btn-merge {
  background: color-mix(in srgb, #22c55e 12%, var(--color-bg));
  color: #16a34a;
  border-color: color-mix(in srgb, #22c55e 40%, var(--color-border));
}
/* 面板内部改为纵向 flex：头部/底部固定，中间文件列表滚动（原 .conflict-dialog 整体 overflow） */
.conflict-overlay :deep(.bd-panel) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.conflict-head {
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.conflict-body {
  padding: 20px 24px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active :deep(.bd-panel),
.modal-leave-active :deep(.bd-panel) {
  transition: transform 0.2s ease;
}
.modal-enter-from :deep(.bd-panel),
.modal-leave-to :deep(.bd-panel) {
  transform: scale(0.96) translateY(8px);
}
</style>
