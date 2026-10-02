<script setup lang="ts">
/**
 * 智能工作台 · 导入预览弹框（技能 / 提示词共用）
 * 导入前把「新增 N / 更新 M / 跳过 K」和逐条名称摆出来，用户确认才落库 —— 避免盲改数据。
 */
const props = withDefaults(
  defineProps<{
    kindLabel: string
    added: string[]
    updated: string[]
    skipped: number
    /** 解析过程中的提示：字段缺失、资源超限、被忽略的文件等 */
    notes?: string[]
  }>(),
  { notes: () => [] }
)

const emit = defineEmits<{ close: []; confirm: [] }>()
</script>

<template>
  <el-dialog :model-value="true" width="560px" :title="`导入${kindLabel}（预览）`" :close-on-click-modal="false" @close="emit('close')">
    <div class="si-body">
      <p class="si-summary">
        新增 <b>{{ props.added.length }}</b> 条，
        更新 <b>{{ props.updated.length }}</b> 条
        <template v-if="props.skipped > 0">，跳过 <b>{{ props.skipped }}</b> 条（文件内容不比现有更新）</template>
      </p>

      <section v-if="props.added.length" class="si-block">
        <h4 class="si-title is-add">新增</h4>
        <ul class="si-list">
          <li v-for="n in props.added" :key="n">{{ n }}</li>
        </ul>
      </section>

      <section v-if="props.updated.length" class="si-block">
        <h4 class="si-title is-upd">更新</h4>
        <ul class="si-list">
          <li v-for="n in props.updated" :key="n">{{ n }}</li>
        </ul>
      </section>

      <section v-if="props.notes.length" class="si-block">
        <h4 class="si-title is-warn">解析提示（{{ props.notes.length }}）</h4>
        <ul class="si-list">
          <li v-for="n in props.notes" :key="n">{{ n }}</li>
        </ul>
      </section>

      <p class="si-tip">确认后写入本地库；同名条目按「更新时间新者胜」合并。</p>
    </div>

    <template #footer>
      <div class="si-actions">
        <el-button size="small" @click="emit('close')">取消</el-button>
        <el-button type="primary" size="small" data-testid="smart-import-confirm" @click="emit('confirm')">确认导入</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.si-body { display: flex; flex-direction: column; gap: 12px; max-height: 50vh; overflow-y: auto; }
.si-summary { margin: 0; font-size: 13px; color: var(--color-text, #111827); }
.si-block { display: flex; flex-direction: column; gap: 4px; }
.si-title { margin: 0; font-size: 12px; font-weight: 600; }
.si-title.is-add { color: var(--color-success, #16a34a); }
.si-title.is-upd { color: var(--color-primary, #3b82f6); }
.si-title.is-warn { color: var(--color-warning, #d97706); }
.si-list { margin: 0; padding-left: 18px; font-size: 13px; color: var(--color-text-secondary, #6b7280); }
.si-tip { margin: 0; font-size: 12px; color: var(--color-text-muted, #9ca3af); }
.si-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
