<script setup lang="ts">
// 学科下拉选择框（教师工作台统一组件）：按教育阶段分组（小学/初中/高中/大学），
// 支持搜索 + 允许自定义未列出学科（allow-create），视觉与交互对齐项目内 el-select 表单字段。
// 用法：<SubjectSelect v-model="subject" placeholder="请选择学科" size="small" extra-class="dm-select" />

import { computed } from 'vue'
import { TEACHER_SUBJECT_GROUPS } from '@/composables/teacherSubjects'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    size?: 'small' | 'default'
    extraClass?: string
  }>(),
  { placeholder: '请选择学科', size: 'default', extraClass: '' }
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
    class="subject-select"
    :class="extraClass"
  >
    <el-option-group v-for="g in TEACHER_SUBJECT_GROUPS" :key="g.stage" :label="g.stage">
      <el-option v-for="s in g.subjects" :key="g.stage + '|' + s" :value="s" :label="s" />
    </el-option-group>
  </el-select>
</template>

<style scoped>
.subject-select {
  width: 100%;
}
</style>
