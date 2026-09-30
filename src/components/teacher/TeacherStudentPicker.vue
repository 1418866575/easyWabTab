<script setup lang="ts">
// 学生多选选择器（内联组件，自身不带弹框；可嵌入新建/编辑小组弹框、随机分组约束区等）。
// 复用于一切「按学生选人」场景（分组、值日、点名、谈话、作业等未来扩展）。
// 以 studentId 为主键；已选区用 tw-chip 展示并按性别着色（男蓝/女粉），可点 × 移除；支持搜索过滤。

import { computed, ref, watch } from 'vue'
import type { Student } from '@/types/teacher'
import Icon from '@/components/Icon.vue'

const props = defineProps<{
  modelValue: string[]
  students: Student[]
  /** 占位提示 */
  placeholder?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const keyword = ref('')
const tableRef = ref<{ clearSelection: () => void; toggleRowSelection: (row: Student, selected?: boolean) => void } | null>(null)

const filtered = computed<Student[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return props.students
  return props.students.filter(
    (s) => s.name.toLowerCase().includes(kw) || (s.no || '').toLowerCase().includes(kw)
  )
})

const selectedStudents = computed<Student[]>(() =>
  props.modelValue
    .map((id) => props.students.find((s) => s.id === id))
    .filter((s): s is Student => !!s)
)

function onSelectionChange(rows: Student[]): void {
  emit('update:modelValue', rows.map((r) => r.id))
}

function removeOne(id: string): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((x) => x !== id)
  )
}

// 外部 modelValue 变化（打开编辑弹框回填成员）→ 同步到表格选中态
watch(
  () => props.modelValue,
  (ids) => {
    const set = new Set(ids)
    const table = tableRef.value
    if (!table) return
    for (const s of props.students) {
      table.toggleRowSelection(s, set.has(s.id))
    }
  },
  { immediate: true }
)

function genderClass(g: '男' | '女'): string {
  return g === '男' ? 'is-boy' : 'is-girl'
}
</script>

<template>
  <div class="tsp">
    <div class="tsp-search">
      <Icon name="search" :size="14" />
      <input v-model="keyword" class="tsp-input" :placeholder="placeholder || '搜索姓名 / 学号'" />
    </div>

    <el-table
      ref="tableRef"
      class="tsp-table ewt-table"
      :data="filtered"
      stripe
      border
      size="small"
      height="260"
      style="width: 100%"
      empty-text="没有可选择的學生"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="46" align="center" />
      <el-table-column prop="no" label="学号" width="90" align="center" show-overflow-tooltip />
      <el-table-column label="姓名" min-width="100" align="center" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="tsp-name">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="性别" width="64" align="center">
        <template #default="{ row }">
          <span class="tsp-gender" :class="genderClass(row.gender)">{{ row.gender }}</span>
        </template>
      </el-table-column>
    </el-table>

    <div class="tsp-selected">
      <span class="tsp-selected-label">已选 {{ selectedStudents.length }} 人</span>
      <div class="tsp-chips">
        <span v-for="s in selectedStudents" :key="s.id" class="tw-chip" :class="genderClass(s.gender)">
          {{ s.name }}
          <button type="button" class="tw-chip-x" :aria-label="`移除 ${s.name}`" @click="removeOne(s.id)">×</button>
        </span>
        <span v-if="selectedStudents.length === 0" class="tsp-empty">尚未选择</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tsp {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tsp-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 32px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: var(--color-bg-input, #fff);
  color: var(--color-text-muted, #94a3b8);
}
.tsp-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--color-text, #334155);
}
.tsp-table :deep(.el-table__header th .cell) {
  text-align: center;
  justify-content: center;
}
.tsp-name {
  font-weight: 500;
}
.tsp-gender {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.tsp-gender.is-boy {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}
.tsp-gender.is-girl {
  background: rgba(236, 72, 153, 0.12);
  color: #ec4899;
}
.tsp-selected {
  border-top: 1px dashed var(--color-border, #e5e7eb);
  padding-top: 8px;
}
.tsp-selected-label {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}
.tsp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.tsp-empty {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
}
.tw-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  color: var(--color-primary, #3b82f6);
}
.tw-chip.is-girl {
  background: rgba(236, 72, 153, 0.12);
  color: #ec4899;
}
.tw-chip-x {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  color: inherit;
  padding: 0 0 0 2px;
}
.tw-chip-x:hover {
  opacity: 0.7;
}
</style>
