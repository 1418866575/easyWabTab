<script setup lang="ts">
/**
 * 健康管理回收站：展示所有健康模块的软删除记录（墓碑），支持还原与彻底删除。
 * 删除不再物理移除 —— 物理移除会被云同步并集合并当成「远端新增」复活。
 */
import { computed } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { showConfirm } from '@/utils/dialog'
import { useWorkbenchHealthStore, type HealthTrashedItem } from '@/stores/workbenchHealth'
import type { HealthModule } from '@/types'

const emit = defineEmits<{ close: [] }>()
const store = useWorkbenchHealthStore()

const MODULE_LABELS: Record<HealthModule, string> = {
  exercise: '运动',
  diet: '饮食',
  sleep: '睡眠',
  weight: '体重',
  height: '身高'
}

const items = computed(() => store.trashedRecords)
const personNames = computed(() => {
  const map = new Map<string, string>()
  for (const p of store.personConfig?.persons ?? []) map.set(p.id, p.name)
  return map
})

function field(item: HealthTrashedItem, key: string): unknown {
  return (item.record as unknown as Record<string, unknown>)[key]
}
function text(item: HealthTrashedItem, key: string): string {
  const v = field(item, key)
  return v === undefined || v === null || v === '' ? '' : String(v)
}
function summary(item: HealthTrashedItem): string {
  const personId = text(item, 'personId')
  const person = personId ? (personNames.value.get(personId) ?? '未知人员') : ''
  switch (item.module) {
    case 'weight':
      return `${text(item, 'weightKg')} kg${person ? ' · ' + person : ''}`
    case 'height':
      return `${text(item, 'heightCm')} cm${person ? ' · ' + person : ''}`
    case 'exercise':
      return `${text(item, 'exerciseType') || '运动'} · ${text(item, 'duration')} 分钟`
    case 'diet':
      return `${text(item, 'mealType')} · ${text(item, 'content')}`
    case 'sleep':
      return `${text(item, 'sleepTime')}–${text(item, 'wakeTime')}`
  }
}
function deletedAtText(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false })
}

async function restore(item: HealthTrashedItem): Promise<void> {
  await store.restoreRecord(item.module, item.record.id)
}

async function purge(item: HealthTrashedItem): Promise<void> {
  const ok = await showConfirm('彻底删除后无法恢复；若其他设备尚未同步到这次删除，记录可能再次出现。确定彻底删除吗？')
  if (ok) await store.purgeRecord(item.module, item.record.id)
}
</script>

<template>
  <BaseDialog
    title="健康管理 · 回收站"
    width="760px"
    max-height="80vh"
    body-layout="flex-column"
    data-testid="health-recycle-bin"
    @close="emit('close')"
  >
    <div class="hx-body">
      <p class="hx-tip">已删除的记录会保留 7 天并随云同步传播；可还原，或彻底删除。</p>
      <el-table
        v-if="items.length"
        :data="items"
        class="ewt-table"
        stripe
        border
        size="default"
        style="width: 100%"
      >
        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">{{ MODULE_LABELS[row.module as HealthModule] }}</template>
        </el-table-column>
        <el-table-column label="记录日期" width="120" align="center">
          <template #default="{ row }">{{ text(row as HealthTrashedItem, 'date') }}</template>
        </el-table-column>
        <el-table-column label="内容" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ summary(row as HealthTrashedItem) }}</template>
        </el-table-column>
        <el-table-column label="删除时间" width="170" align="center">
          <template #default="{ row }">{{ deletedAtText((row as HealthTrashedItem).deletedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center" fixed="right" class-name="ewt-op-col">
          <template #default="{ row }">
            <el-button
              class="btn-edit"
              :data-testid="`hx-restore-${(row as HealthTrashedItem).record.id}`"
              @click="restore(row as HealthTrashedItem)"
            >还原</el-button>
            <el-button
              type="danger"
              :data-testid="`hx-purge-${(row as HealthTrashedItem).record.id}`"
              @click="purge(row as HealthTrashedItem)"
            >彻底删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-else class="hx-empty" data-testid="hx-empty">暂无已删除的健康记录</div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.hx-body {
  padding: var(--space-4);
  min-height: 180px;
}
.hx-tip {
  margin: 0 0 var(--space-3);
  font-size: var(--fs-caption, 12px);
  color: var(--color-text-secondary);
}
.hx-empty {
  padding: 40px 12px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--fs-body, 14px);
}
</style>
