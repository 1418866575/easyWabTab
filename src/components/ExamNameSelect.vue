<script setup lang="ts">
// 考试名称下拉选择框（通用）：支持搜索 + 允许自定义未列出名称（allow-create），
// 候选来自 EXAM_NAME_PRESETS。视觉与交互对齐项目内 el-select 表单字段。
// 用法：<ExamNameSelect v-model="name" placeholder="请选择或输入考试名称" size="small" />

import { computed } from 'vue'
import { EXAM_NAME_PRESETS } from '@/types'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    size?: 'small' | 'default'
  }>(),
  { placeholder: '请选择或输入考试名称', size: 'default' }
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
    class="exam-name-select"
  >
    <el-option v-for="n in EXAM_NAME_PRESETS" :key="n" :value="n" :label="n" />
  </el-select>
</template>

<style scoped>
.exam-name-select {
  width: 100%;
}
</style>
