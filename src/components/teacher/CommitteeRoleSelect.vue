<script setup lang="ts">
// 班委职务下拉选择框（教师工作台统一组件）：候选为常见班委职务，
// 支持搜索 + 允许自定义未列出职务（allow-create），视觉与交互对齐项目内 el-select 表单字段。
// 用法：<CommitteeRoleSelect v-model="role" placeholder="请选择职务" size="small" />

import { computed } from 'vue'
import { COMMITTEE_ROLES } from '@/types/teacher'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    size?: 'small' | 'default'
    extraClass?: string
  }>(),
  { placeholder: '请选择职务', size: 'default', extraClass: '' }
)

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const model = computed<string>({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v ?? '')
})
</script>

<template>
  <el-select
    v-model="model"
    :placeholder="placeholder"
    :size="size"
    filterable
    allow-create
    default-first-option
    class="role-select"
    :class="extraClass"
  >
    <el-option v-for="r in COMMITTEE_ROLES" :key="r" :value="r" :label="r" />
  </el-select>
</template>

<style scoped>
.role-select {
  width: 100%;
}
</style>
