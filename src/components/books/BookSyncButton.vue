<script setup lang="ts">
/**
 * 图书馆云同步按钮（书架页右上角）
 *
 * 作用：把「收藏」与「用户自建书签」两项通过云同步信封 books.json 同步到其他设备。
 * 说明：云同步的开关与地址配置**共用导航站设置里的「云同步」**（不在图书馆重复配置），
 *      故未配置时点击会提示「请先在设置中启用并配置云同步」。
 *
 * 同步策略：并集 + 时间最新（收藏取并集；用户书签同 id 取较新 ts），
 * 不会因另一端有改动而清空本机数据。详见 src/composables/useBooksPrefs.ts 的 mergeBooksPrefsEnvelope。
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { useCloudSync } from '@/composables/useCloudSync'
import { useAppSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'
import { initBooksPrefs, flushBooksPrefs } from '@/composables/useBooksPrefs'

const cloudSync = useCloudSync()
const settings = useAppSettingsStore()
const toast = useToast()

/** 页面挂载时确保偏好已从 IndexedDB 载入（幂等：didInit 守卫） */
onMounted(() => {
  initBooksPrefs()
  // 关页面/切走时立即冲刷防抖队列，避免最后 300ms 内的改动丢失
  window.addEventListener('pagehide', flushBooksPrefs)
})
onUnmounted(() => {
  window.removeEventListener('pagehide', flushBooksPrefs)
  flushBooksPrefs()
})

/** 是否已配置云同步（未配置时按钮置为弱化态，点击给出引导提示） */
const configured = computed(() => !!settings.cloudSyncEnabled && !!settings.cloudSyncUrl)

/** 同步进行中（推送/拉取中禁用按钮，防连点） */
const busy = computed(
  () => cloudSync.status.value === 'pushing' || cloudSync.status.value === 'pulling'
)

/** 按钮外观：进行中 / 冲突 / 错误 / 正常 */
const stateClass = computed(() => {
  if (busy.value) return 'is-busy'
  if (cloudSync.status.value === 'conflict') return 'is-conflict'
  if (cloudSync.status.value === 'error') return 'is-error'
  return ''
})

/** 按钮文字 */
const label = computed(() => {
  if (busy.value) return '同步中…'
  if (cloudSync.status.value === 'error') return '同步失败'
  return '云同步'
})

/** 悬浮提示 */
const title = computed(() => {
  if (!configured.value) return '未配置云同步，点击前往设置'
  return '同步收藏与书签到其他设备'
})

async function handleClick(): Promise<void> {
  if (busy.value) return
  if (!configured.value) {
    toast.info('请先在「设置 → 通知与同步 → 云同步」中启用并配置')
    return
  }
  // 冲刷待写入的偏好，确保本次同步带上最新状态
  flushBooksPrefs()
  await cloudSync.syncNow()
}
</script>

<template>
  <button
    type="button"
    class="bk-sync-btn"
    :class="[stateClass, { 'is-off': !configured }]"
    :disabled="busy"
    :title="title"
    data-testid="bk-books-sync-btn"
    @click="handleClick"
  >
    <Icon name="cloud" />
    <span class="bk-sync-btn-text">{{ label }}</span>
  </button>
</template>

<style scoped>
.bk-sync-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12.5px;
  color: var(--color-text-secondary, #475569);
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 8px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.bk-sync-btn:hover:not(:disabled) {
  color: var(--color-text, #0f172a);
  border-color: var(--color-primary, #3b82f6);
}

/* 进行中：弱化 + 禁用，防连点 */
.bk-sync-btn.is-busy {
  color: var(--color-text-muted, #94a3b8);
  cursor: progress;
  opacity: 0.75;
}

/* 冲突 / 错误：警示色 */
.bk-sync-btn.is-conflict,
.bk-sync-btn.is-error {
  color: var(--color-error, #dc2626);
  border-color: var(--color-error, #dc2626);
}

/* 未配置云同步：整体弱化，提示需去设置 */
.bk-sync-btn.is-off {
  color: var(--color-text-muted, #94a3b8);
  border-style: dashed;
}

.bk-sync-btn:disabled {
  cursor: not-allowed;
}

.bk-sync-btn-text {
  white-space: nowrap;
}
</style>
